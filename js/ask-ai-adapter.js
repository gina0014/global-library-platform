/* ============================================================
   ask-ai-adapter.js — D1 Ask AI：数据接地（grounded）回答引擎

   设计定位：**Dynamic Retrieval + Template Answer Composition**。
   不调用任何 LLM，不引入 Vector DB / Embedding；真正 LLM 接入保留为
   deployment / configuration step（见 IMPLEMENTATION-006.md §9）。

   数据流（D1.2）：
     User Question
       ↓ 意图解析（在平台数据上做实体解析，不做自由生成）
     Entity Resolution（published-only，数据由 data-loader.js 提供）
       ↓
     Answer Composition（模板 + 真实计数，不生成任何事实）
       ↓
     Provenance（真实 Source 记录，通过关联表解析）

   硬约束：
     - 本模块 **不 fetch、不读 data/*.json**：所有数据由调用方经
       data-loader.js 传入，与 C2 检索共用同一条数据通路（D1.3）。
     - 只有平台数据中真实存在的记录会进入答案；解析不到就回答
       “平台数据不足以回答”，绝不编造（D1.4 / D1.5）。
     - Source 全部来自 data.sources 的真实记录，绝不生成 URL。
   ============================================================ */

import {
  LIBRARY_TYPE_LABELS,
  TOPIC_LABELS,
  detectCountry,
  detectLibraryType,
  getAwardById,
  getCountryName,
  getLibraryById,
  getSourcesForEntity,
  getVisibleCases
} from "./utils.js";

/** 问题长度上限：超过即视为不可用输入，不做实体解析（D1-AC6） */
const MAX_QUESTION_LENGTH = 400;

/** “数据不足”的统一回应（D1.5：不 hallucinate） */
const INSUFFICIENT = {
  matched: false,
  intent: "insufficient_data",
  text: "The current platform data is not sufficient to answer this question.",
  items: [],
  sources: []
};

/* 问题语义判定（只用于分流，不用于生成事实） */
const AWARDISH_RE = /award|prize|\bwon\b|获奖|奖项|获得/;
const CASEISH_RE = /case|project|案例|项目/;
const GREENISH_RE = /green|绿色|sustainab/;
// 预测 / 未来：平台数据只记录已发生的事实，不能回答
const FUTURE_RE = /\bwill\b|\bwould\b|\bfuture\b|\bpredict\b|\bnext year\b|将会|未来|预测|下一届/;
// 实体名词前的停用词（疑问词 / 动词 / 量词），用于判断是否"点名了某个具体馆"
const NAME_STOPWORDS = new Set(
  ("which what who whose show list find tell give me all any some the a an of in for on at "
   + "has have had did does do is are was were won win receive received receives awards award "
   + "prizes prize 有哪些 的 获得过 获得 奖项 获奖 请 列出 哪些 所有 全部").split(/\s+/)
);

/**
 * 生成一条接地回答。
 * @param {string} question 用户问题
 * @param {Object} data 经 data-loader.js 加载的平台数据
 *   { countries, libraries, awards, awardResults, cases, sources,
 *     countrySource, librarySource, awardSource, awardResultSource, caseSource }
 * @param {Function} [searchFn] 主题检索兜底（页面传入 data-loader.searchAll）
 * @returns {Promise<{matched:boolean,intent:string,text:string,items:Array,sources:Array}>}
 */
export async function answerFromPlatform(question, data, searchFn) {
  const q = normalizeQuestion(question);
  if (!q) return { ...INSUFFICIENT, intent: "empty_question", text: "Please enter a question." };
  if (q.length > MAX_QUESTION_LENGTH) {
    return { ...INSUFFICIENT, intent: "input_too_long",
      text: "That question is too long for the assistant to resolve. Please shorten it and try again." };
  }

  const ctx = buildContext(data);
  if (!ctx) return INSUFFICIENT;

  // 匹配一律用小写副本；原文 q 只用于回答里的回显
  const ql = q.toLowerCase();

  // ---- 先做"不能回答"的判定，避免用泛化列举冒充答案 ----
  // G3：预测 / 未来时 —— 平台数据只有已发生的事实
  if (FUTURE_RE.test(ql)) return { ...INSUFFICIENT, intent: "future_question" };

  const library = findLibrary(ql, ctx.libraries);
  const awards = findAwards(ql, ctx.awards);
  const country = detectCountry(ql, ctx.countries);
  const asksAward = AWARDISH_RE.test(ql);
  const asksCase = CASEISH_RE.test(ql);

  // 实体型问答优先：点名了具体图书馆 / 具体奖项
  if (asksAward && library) return libraryAwards(ql, ctx, library);
  if (asksAward && awards.length) return awardLibraries(ql, ctx, awards);
  if (GREENISH_RE.test(ql)) {
    const green = greenLibrary(ql, ctx);
    if (green) return green;
  }
  if (country) {
    // 国家 + 奖项 → 该国有获奖记录的图书馆；否则 → 该国图书馆
    if (asksAward) return awardLibrariesInCountry(ql, ctx, country);
    const byCountry = librariesByCountry(ql, ctx, country);
    if (byCountry) return byCountry;
  }
  if (asksCase) {
    const caseAnswer = cases(ql, ctx, library);
    if (caseAnswer) return caseAnswer;
  }
  // G1：问题点名了某个图书馆，但平台数据里没有它 → 不能用"全部图书馆"兜底
  if (asksAward && namesUnresolvedLibrary(ql)) {
    return { ...INSUFFICIENT, intent: "unresolved_library",
      text: "No published library in the platform dataset matches the library named in your question, "
            + "so no award can be reported for it." };
  }
  // 泛化但合法的获奖问题：「哪些图书馆获过奖」
  if (asksAward) return awardWinningLibraries(ql, ctx);
  // G2：解析到了图书馆，但问题问的是平台数据里没有的属性 → 明确说没有，不泛化列举
  if (library) {
    return { ...INSUFFICIENT, intent: "unsupported_attribute",
      text: `${library.name} is in the platform dataset, but it does not contain the information `
            + `your question asks for (awards, cases and sources are available).` };
  }
  const overview = allLibraries(ql, ctx);
  if (overview) return overview;

  // 主题兜底：复用 C2 的动态检索（D1.3：优先复用，不重写一套搜索）
  return await topicSearch(q, ql, ctx, searchFn);
}

/* ---------- 输入归一化（D1-AC6） ---------- */

function normalizeQuestion(raw) {
  // 去掉控制字符与多余空白；标点原样保留（不做语义猜测）
  return String(raw == null ? "" : raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- 上下文：只保留已发布记录 ---------- */

function buildContext(data) {
  if (!data || !Array.isArray(data.libraries)) return null;
  const published = (rows) => (rows || []).filter(r => r && r.status === "published");
  return {
    countries: published(data.countries),
    libraries: published(data.libraries),
    awards: published(data.awards),
    awardResults: published(data.awardResults),
    cases: getVisibleCases(data.cases || [], data.libraries || []),
    sources: published(data.sources),
    countrySource: data.countrySource || [],
    librarySource: data.librarySource || [],
    awardSource: data.awardSource || [],
    awardResultSource: data.awardResultSource || [],
    caseSource: data.caseSource || []
  };
}

/* ---------- 意图 1：某图书馆获得过哪些奖项 ---------- */

function libraryAwards(q, ctx, resolved) {
  const library = resolved || findLibrary(q, ctx.libraries);
  if (!library) return null;

  const rows = ctx.awardResults
    .filter(r => r.library_id === library.library_id)
    .map(r => ({ result: r, award: getAwardById(ctx.awards, r.award_id) }))
    .filter(pair => pair.award); // 奖项必须 published（父子一致性）

  if (rows.length === 0) {
    return {
      matched: true,
      intent: "library_awards",
      text: `${library.name} is in the platform dataset, but it has no published award record. ` +
            `No award can be claimed for it from the current data.`,
      items: [{
        type: "Library",
        id: library.library_id,
        title: library.name,
        sub: [getCountryName(ctx.countries, library.country_id), library.city]
          .filter(Boolean).join(" · ")
      }],
      sources: sourcesForEntity(ctx, "library", library.library_id)
    };
  }

  const byAward = new Map();
  for (const { result, award } of rows) {
    if (!byAward.has(award.award_id)) byAward.set(award.award_id, { award, years: [] });
    byAward.get(award.award_id).years.push(result.year);
  }

  const sourceIds = new Set();
  for (const { result } of rows) {
    for (const row of ctx.awardResultSource) {
      if (row.award_result_id === result.award_result_id) sourceIds.add(row.source_id);
    }
  }

  return {
    matched: true,
    intent: "library_awards",
    text: `${library.name} has ${rows.length} published award record(s) across ` +
          `${byAward.size} award(s): ${[...byAward.values()]
            .map(({ award, years }) => `${award.award_name} (${years.sort().join(", ")})`).join("; ")}.`,
    items: [...byAward.values()].map(({ award, years }) => ({
      type: "Award",
      id: award.award_id,
      title: award.award_name,
      sub: [award.organizer, years.sort().join(", ")].filter(Boolean).join(" · ")
    })),
    sources: dedupeSources([
      ...sourcesForEntity(ctx, "library", library.library_id),
      ...resolveSources(ctx.sources, [...sourceIds])
    ])
  };
}

/* ---------- 意图 2：某奖项有哪些获奖图书馆 ---------- */

function awardLibraries(q, ctx, resolved) {
  const awards = resolved && resolved.length ? resolved : findAwards(q, ctx.awards);
  if (awards.length === 0) return null;

  const perAward = awards.map(award => {
    const rows = ctx.awardResults
      .filter(r => r.award_id === award.award_id)
      .map(r => ({ result: r, library: getLibraryById(ctx.libraries, r.library_id) }))
      .filter(pair => pair.library); // 图书馆必须 published（父子一致性）
    return { award, rows };
  });

  const totalRows = perAward.reduce((n, a) => n + a.rows.length, 0);
  if (totalRows === 0) {
    return {
      matched: true,
      intent: "award_libraries",
      text: `${awards.map(a => a.award_name).join(" / ")} exist${awards.length === 1 ? "s" : ""} ` +
            `in the platform dataset, but no published library is recorded as a result holder yet.`,
      items: awards.map(award => ({
        type: "Award",
        id: award.award_id,
        title: award.award_name,
        sub: [award.organizer].filter(Boolean).join(" · ")
      })),
      sources: dedupeSources(awards.flatMap(a => sourcesForEntity(ctx, "award", a.award_id)))
    };
  }

  // 同一图书馆可能获得多个被问到的奖项：按图书馆聚合，sub 里标注各自奖项与年份
  const byLibrary = new Map();
  const sourceIds = new Set();
  for (const { award, rows } of perAward) {
    for (const { result, library } of rows) {
      if (!byLibrary.has(library.library_id)) {
        byLibrary.set(library.library_id, { library, records: [] });
      }
      byLibrary.get(library.library_id).records.push({ award, result });
      for (const row of ctx.awardResultSource) {
        if (row.award_result_id === result.award_result_id) sourceIds.add(row.source_id);
      }
    }
  }

  const scope = awards.length === 1
    ? `${awards[0].award_name} has ${totalRows} published result record(s) covering`
    : `${awards.length} awards matching the question have ${totalRows} published result record(s) covering`;

  return {
    matched: true,
    intent: "award_libraries",
    text: `${scope} ${byLibrary.size} librar${byLibrary.size === 1 ? "y" : "ies"}.`,
    items: [...byLibrary.values()].map(({ library, records }) => ({
      type: "Library",
      id: library.library_id,
      title: library.name,
      sub: [
        getCountryName(ctx.countries, library.country_id),
        records
          .map(({ award, result }) => `${award.award_name} · ${result.year} ${result.result_type}`)
          .sort().join(" / ")
      ].filter(Boolean).join(" · ")
    })),
    sources: dedupeSources([
      ...awards.flatMap(a => sourcesForEntity(ctx, "award", a.award_id)),
      ...resolveSources(ctx.sources, [...sourceIds])
    ])
  };
}

/* ---------- 意图 3：绿色 / 可持续主题 ---------- */

function greenLibrary(q, ctx) {
  if (!q.includes("green") && !q.includes("绿色") && !q.includes("sustainab")) return null;

  const results = ctx.awardResults
    .filter(r => (r.category || "").toLowerCase().includes("green"))
    .map(r => ({ result: r, library: getLibraryById(ctx.libraries, r.library_id) }))
    .filter(pair => pair.library);

  const topicCases = ctx.cases.filter(c => c.topic === "sustainability");
  if (results.length === 0 && topicCases.length === 0) return null;

  const sourceIds = new Set();
  for (const { result } of results) {
    for (const row of ctx.awardResultSource) {
      if (row.award_result_id === result.award_result_id) sourceIds.add(row.source_id);
    }
  }

  return {
    matched: true,
    intent: "green_library",
    text: `Found ${results.length} published award record(s) in the “Green Library” category and ` +
          `${topicCases.length} sustainability-related case(s) in the platform dataset.`,
    items: results.map(({ result, library }) => ({
      type: "Library",
      id: library.library_id,
      title: library.name,
      sub: [getCountryName(ctx.countries, library.country_id),
            String(result.year), result.result_type].filter(Boolean).join(" · ")
    })).concat(topicCases.map(c => ({
      type: "Case",
      id: c.case_id,
      title: c.title,
      sub: [getLibraryById(ctx.libraries, c.library_id)?.name || "Unknown Library",
            TOPIC_LABELS[c.topic] || c.topic, String(c.year)].filter(Boolean).join(" · ")
    }))),
    sources: resolveSources(ctx.sources, [...sourceIds])
  };
}

/* ---------- 意图 4a：某国有哪些获奖图书馆 ---------- */

function awardLibrariesInCountry(q, ctx, country) {
  const rows = ctx.awardResults
    .map(r => ({
      result: r,
      award: getAwardById(ctx.awards, r.award_id),
      library: getLibraryById(ctx.libraries, r.library_id)
    }))
    .filter(pair => pair.award && pair.library && pair.library.country_id === country.country_id);

  const byLibrary = new Map();
  const sourceIds = new Set();
  for (const { result, award, library } of rows) {
    if (!byLibrary.has(library.library_id)) {
      byLibrary.set(library.library_id, { library, records: [] });
    }
    byLibrary.get(library.library_id).records.push({ award, result });
    for (const row of ctx.awardResultSource) {
      if (row.award_result_id === result.award_result_id) sourceIds.add(row.source_id);
    }
  }

  if (byLibrary.size === 0) {
    return {
      matched: true,
      intent: "award_libraries_in_country",
      text: `No published library in ${country.country_name} has an award record in the platform dataset.`,
      items: [],
      sources: sourcesForEntity(ctx, "country", country.country_id)
    };
  }

  return {
    matched: true,
    intent: "award_libraries_in_country",
    text: `${rows.length} published award record(s) cover ${byLibrary.size} librar` +
          `${byLibrary.size === 1 ? "y" : "ies"} in ${country.country_name}.`,
    items: [...byLibrary.values()].map(({ library, records }) => ({
      type: "Library",
      id: library.library_id,
      title: library.name,
      sub: [
        getCountryName(ctx.countries, library.country_id),
        records.map(({ award, result }) => `${award.award_name} · ${result.year} ${result.result_type}`)
          .sort().join(" / ")
      ].filter(Boolean).join(" · ")
    })),
    sources: dedupeSources([
      ...sourcesForEntity(ctx, "country", country.country_id),
      ...resolveSources(ctx.sources, [...sourceIds])
    ])
  };
}

/* ---------- 意图 4b：泛化获奖问题「哪些图书馆获过奖」 ---------- */

function awardWinningLibraries(q, ctx) {
  const rows = ctx.awardResults
    .map(r => ({
      result: r,
      award: getAwardById(ctx.awards, r.award_id),
      library: getLibraryById(ctx.libraries, r.library_id)
    }))
    .filter(pair => pair.award && pair.library);

  if (rows.length === 0) return INSUFFICIENT;

  const byLibrary = new Map();
  const sourceIds = new Set();
  for (const { result, award, library } of rows) {
    if (!byLibrary.has(library.library_id)) {
      byLibrary.set(library.library_id, { library, count: 0 });
    }
    byLibrary.get(library.library_id).count += 1;
    for (const row of ctx.awardResultSource) {
      if (row.award_result_id === result.award_result_id) sourceIds.add(row.source_id);
    }
  }

  return {
    matched: true,
    intent: "award_winning_libraries",
    text: `Found ${byLibrary.size} published librar${byLibrary.size === 1 ? "y" : "ies"} with ` +
          `international award records (${rows.length} award record(s) in total), resolved through ` +
          `Award → Award_Result → Library.`,
    items: [...byLibrary.values()].map(({ library, count }) => ({
      type: "Library",
      id: library.library_id,
      title: library.name,
      sub: [getCountryName(ctx.countries, library.country_id), `${count} award record(s)`]
        .filter(Boolean).join(" · ")
    })),
    sources: resolveSources(ctx.sources, [...sourceIds])
  };
}

/* ---------- 意图 5：某国家有哪些图书馆 ---------- */

function librariesByCountry(q, ctx, resolved) {
  const country = resolved || detectCountry(q, ctx.countries);
  if (!country) return null;

  const type = detectLibraryType(q);
  const libraries = ctx.libraries.filter(
    l => l.country_id === country.country_id && (!type || l.library_type === type)
  );
  if (libraries.length === 0) return null;

  const typeLabel = type ? `${LIBRARY_TYPE_LABELS[type] || type} ` : "";
  return {
    matched: true,
    intent: "libraries_by_country",
    text: `Found ${libraries.length} published ${typeLabel}librar` +
          `${libraries.length === 1 ? "y" : "ies"} in ${country.country_name} (${country.country_code}).`,
    items: libraries.map(lib => ({
      type: "Library",
      id: lib.library_id,
      title: lib.name,
      sub: [lib.name_en, lib.city, LIBRARY_TYPE_LABELS[lib.library_type] || lib.library_type]
        .filter(Boolean).join(" · ")
    })),
    sources: sourcesForEntity(ctx, "country", country.country_id)
  };
}

/* ---------- 意图 5：案例 / 项目 ---------- */

function cases(q, ctx, resolved) {
  const isCaseQuestion = q.includes("case") || q.includes("project") ||
                         q.includes("案例") || q.includes("项目");
  if (!isCaseQuestion) return null;
  if (ctx.cases.length === 0) return null;

  // 若问题中同时点名了图书馆，则只返回该馆案例
  const library = resolved || findLibrary(q, ctx.libraries);
  const list = library ? ctx.cases.filter(c => c.library_id === library.library_id) : ctx.cases;

  if (list.length === 0) {
    return {
      matched: true,
      intent: "cases",
      text: library
        ? `${library.name} has no published case / project in the platform dataset.`
        : "No published case / project is available in the platform dataset.",
      items: [],
      sources: library ? sourcesForEntity(ctx, "library", library.library_id) : []
    };
  }

  const sourceIds = new Set();
  for (const c of list) {
    for (const row of ctx.caseSource) {
      if (row.case_id === c.case_id) sourceIds.add(row.source_id);
    }
  }

  return {
    matched: true,
    intent: "cases",
    text: `Found ${list.length} published case(s) / project(s)` +
          `${library ? ` linked to ${library.name}` : ""} in the platform dataset.`,
    items: list.map(c => ({
      type: "Case",
      id: c.case_id,
      title: c.title,
      sub: [getLibraryById(ctx.libraries, c.library_id)?.name || "Unknown Library",
            TOPIC_LABELS[c.topic] || c.topic, String(c.year)].filter(Boolean).join(" · ")
    })),
    sources: dedupeSources([
      ...(library ? sourcesForEntity(ctx, "library", library.library_id) : []),
      ...resolveSources(ctx.sources, [...sourceIds])
    ])
  };
}

/* ---------- 意图 6：图书馆总览 ---------- */

function allLibraries(q, ctx) {
  if (!q.includes("library") && !q.includes("libraries") && !q.includes("图书馆")) return null;
  const type = detectLibraryType(q);
  const libraries = type ? ctx.libraries.filter(l => l.library_type === type) : ctx.libraries;
  if (libraries.length === 0) return null;

  return {
    matched: true,
    intent: "all_libraries",
    text: `The platform dataset currently contains ${libraries.length} published librar` +
          `${libraries.length === 1 ? "y" : "ies"}` +
          `${type ? ` of type “${LIBRARY_TYPE_LABELS[type] || type}”` : ""}, across ` +
          `${new Set(libraries.map(l => l.country_id)).size} countries/regions.`,
    items: libraries.map(lib => ({
      type: "Library",
      id: lib.library_id,
      title: lib.name,
      sub: [getCountryName(ctx.countries, lib.country_id), lib.city].filter(Boolean).join(" · ")
    })),
    sources: []
  };
}

/* ---------- 意图 7（兜底）：主题检索，复用 C2 动态检索 ---------- */

async function topicSearch(q, ql, ctx, searchFn) {
  if (typeof searchFn !== "function") return INSUFFICIENT;

  let hits = [];
  try {
    hits = await searchFn(ql) || [];
  } catch {
    return INSUFFICIENT;
  }
  if (hits.length === 0) return INSUFFICIENT;

  const sourceIds = new Set();
  for (const hit of hits) {
    if (hit.type === "Source") sourceIds.add(hit.id);
  }
  const grouped = hits.reduce((acc, h) => {
    acc[h.type] = (acc[h.type] || 0) + 1;
    return acc;
  }, {});

  return {
    matched: true,
    intent: "topic_search",
    text: `Found ${hits.length} published record(s) matching “${truncate(q, 80)}”: ` +
          Object.entries(grouped).map(([type, n]) => `${n} ${type}${n === 1 ? "" : "s"}`).join(", ") + ".",
    items: hits.slice(0, 20).map(h => ({
      type: h.type, id: h.id, title: h.title, sub: h.sub
    })),
    sources: resolveSources(ctx.sources, [...sourceIds])
  };
}

/* ---------- 实体解析（只认平台数据里真实存在的记录） ---------- */

/** 在问题中解析图书馆：优先最长匹配，避免 "Shanghai" 命中 "Shanghai Library X" 之外的短名误判 */
function findLibrary(q, libraries) {
  let best = null;
  let bestLen = 0;
  for (const lib of libraries) {
    for (const cand of [lib.name, lib.name_en, lib.city]) {
      const key = (cand || "").toLowerCase().trim();
      if (key.length < 3 || key.length <= bestLen) continue;
      if (!q.includes(key)) continue;
      best = lib;
      bestLen = key.length;
    }
  }
  return best;
}

/**
 * 奖项名 → 可匹配键：全名 + 去掉括号内中文注释后的核心名。
 * 例："IFLA Green Library Award（绿色图书馆奖）"
 *     → ["ifla green library award（绿色图书馆奖）", "ifla green library award"]
 */
function awardKeys(award) {
  const name = (award.award_name || "").trim();
  const keys = [name.toLowerCase()];
  const core = name.replace(/[（(][^）)]*[）)]/g, "").trim().toLowerCase();
  if (core.length >= 4 && !keys.includes(core)) keys.push(core);
  return keys;
}

/**
 * 问题是否"点名了某个图书馆"？
 *
 * 判定：出现「…图书馆」/「… library」，且实体名词前面的词不是疑问词 / 动词 / 量词
 * （即确实是一个专名）。用于避免把"问某个馆的奖项"用"全部图书馆"或
 * "全部获奖图书馆"敷衍过去——那是答非所问，不是接地答案。
 */
function namesUnresolvedLibrary(ql) {
  const m = ql.match(/(.+?)图书馆/) || ql.match(/(.+?)\s?library\b/);
  if (!m) return false;
  const head = m[1]
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w && !NAME_STOPWORDS.has(w))
    .join("");
  return head.length > 0;
}

/**
 * 在问题中解析奖项：返回**全部**命中的奖项。
 * 多个奖项同时命中（如问题只写了 "IFLA"）时不猜、不选一个，
 * 而是把所有命中奖项的真实获奖记录一并列出——仍是接地答案。
 */
function findAwards(q, awards) {
  const matched = awards.filter(a => awardKeys(a).some(k => k.length >= 4 && q.includes(k)));
  const seen = new Set();
  return matched.filter(a => !seen.has(a.award_id) && seen.add(a.award_id));
}

/* ---------- Provenance（D1.4） ---------- */

const RELATION_BY_ENTITY = {
  country: { rows: "countrySource", key: "country_id" },
  library: { rows: "librarySource", key: "library_id" },
  award: { rows: "awardSource", key: "award_id" }
};

/** 取某实体的已发布来源（经关联表，只返回数据中真实存在的 Source） */
function sourcesForEntity(ctx, entityType, entityId) {
  const cfg = RELATION_BY_ENTITY[entityType];
  if (!cfg) return [];
  return getSourcesForEntity(ctx[cfg.rows], ctx.sources, entityId, cfg.key).map(e => e.source);
}

/** 按 source_id 解析真实 Source 记录（不存在的 id 直接丢弃） */
function resolveSources(sources, ids) {
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const s = sources.find(x => x.source_id === id);
    if (s) out.push(s); // 只可能是已发布来源（ctx.sources 已过滤）
  }
  return out;
}

function dedupeSources(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    if (!s || seen.has(s.source_id)) continue;
    seen.add(s.source_id);
    out.push(s);
  }
  return out;
}

function truncate(text, max) {
  const s = String(text || "");
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
