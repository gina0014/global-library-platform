/* ============================================================
   utils.js — 通用工具函数（纯函数，不操作页面元素）
   包含：FK 解析 / 文本处理 / 路径处理 / 全站搜索逻辑
   ============================================================ */

import { APP_CONFIG } from "./config.js";

/* ---------- 文本处理 ---------- */

/**
 * HTML 转义：防止数据文本中含 <> 破坏页面结构（XSS 基础防护）。
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 截断长文本并加省略号（卡片摘要用）。
 */
export function truncate(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + "…";
}

/* ---------- 路径处理 ---------- */

/**
 * 根据当前页面是否位于 pages/ 子目录，为根目录相对路径加上 "../" 前缀。
 * 例如在 pages/xxx.html 中，"data/countries.json" 需要变成 "../data/countries.json"。
 * （config 中统一存放根目录相对路径，页面里通过本函数换算。）
 */
export function withBase(path) {
  const inSubDir = window.location.pathname.includes("/pages/");
  if (!path) return path;
  // 已经是绝对地址或已带前缀的直接返回
  if (path.startsWith("http") || path.startsWith("../")) return path;
  return inSubDir ? "../" + path : path;
}

/* ---------- URL 参数处理 ---------- */

/**
 * 读取 URL 查询参数（如 library.html?id=5 中的 id）。
 * @returns {string|null} 参数值（已去除首尾空格）；不存在时返回 null
 */
export function getQueryParam(name) {
  const value = new URLSearchParams(window.location.search).get(name);
  return value ? value.trim() : null;
}

/**
 * 读取并校验数字型 URL 参数（详情页 id 用）。
 * 格式必须是纯数字（如 "5"）；"abc"、"-1"、"5.5"、"1e3" 都视为非法。
 * @returns {number|null} 合法时返回整数；否则返回 null（页面据此显示 Not Found）
 */
export function parseIdParam(name = "id") {
  const raw = getQueryParam(name);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const num = Number(raw);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

/* ---------- FK（外键）解析 ---------- */

/**
 * 通过 library.country_id 找到国家名称。
 * @returns {string} 国家名；找不到时返回 "Unknown"
 */
export function getCountryName(countries, countryId) {
  const country = countries.find(c => c.country_id === countryId);
  return country ? country.country_name : "Unknown";
}

/**
 * 通过 case.library_id 找到所属图书馆。
 * @returns {Object|null} 图书馆记录；找不到时返回 null
 */
export function getLibraryById(libraries, libraryId) {
  return libraries.find(l => l.library_id === libraryId) || null;
}

/**
 * 通过 country_id 找到国家完整记录。
 */
export function getCountryById(countries, countryId) {
  return countries.find(c => c.country_id === countryId) || null;
}

/**
 * 通过 award_id 找到奖项完整记录。
 */
export function getAwardById(awards, awardId) {
  return awards.find(a => a.award_id === awardId) || null;
}

/* ---------- 枚举 → 展示文字 ---------- */

export const LIBRARY_TYPE_LABELS = {
  national: "National",
  public: "Public",
  academic: "Academic",
  school: "School",
  special: "Special",
  other: "Other"
};

export const TOPIC_LABELS = {
  ai_technology: "AI & Technology",
  digital_service: "Digital Services",
  reading_promotion: "Reading Promotion",
  space_architecture: "Space & Architecture",
  children_service: "Children Services",
  community_service: "Community Services",
  sustainability: "Sustainability",
  accessibility_inclusion: "Accessibility & Inclusion",
  other: "Other"
};

export const FREQUENCY_LABELS = {
  annual: "Annual",
  biennial: "Biennial",
  irregular: "Irregular"
};

/* Award_Result.result_type → 展示文字 */
export const RESULT_TYPE_LABELS = {
  winner: "Winner",
  runner_up: "Runner-up",
  shortlist: "Shortlist",
  other: "Other"
};

/* Source.source_type → 展示文字 */
export const SOURCE_TYPE_LABELS = {
  international_organization: "International Organization",
  library_association: "Library Association",
  news: "News Media",
  official_website: "Official Website",
  government: "Government",
  academic: "Academic",
  other: "Other"
};

/* 来源关联表 relation_type → 展示文字 */
export const RELATION_TYPE_LABELS = {
  primary: "Primary",
  supplementary: "Supplementary"
};

/* ---------- 数据链（FK 关联）纯函数 ----------
   以下函数只做过滤与连接，不碰 DOM，便于单元测试与复用。 */

/**
 * Library → Award_Result → Award：取某图书馆已发布的获奖记录。
 * 过滤规则：award_result.status 必须是 published，
 * 且其对应 Award 也是 published（否则视为该记录不应在前台出现）。
 * @returns {Array<{result: Object, award: Object}>} 按年份倒序
 */
export function getPublishedAwardResultsForLibrary(awardResults, awards, libraryId) {
  return awardResults
    .filter(r => r.library_id === libraryId && r.status === "published")
    .map(r => ({ result: r, award: getAwardById(awards, r.award_id) }))
    .filter(pair => pair.award !== null && pair.award.status === "published")
    .sort((a, b) => (b.result.year || 0) - (a.result.year || 0));
}

/**
 * Library → Case_Project：取某图书馆已发布的案例。
 */
export function getPublishedCasesForLibrary(cases, libraryId) {
  return cases
    .filter(c => c.library_id === libraryId && c.status === "published")
    .sort((a, b) => (b.year || 0) - (a.year || 0));
}

/**
 * Final QA 统一可见性规则（Stage 8 · STEP 4）：
 * 前台只显示 published —— 子对象（Case_Project）本身必须 published，
 * 且其父对象（Library）也必须 published。
 *
 * 背景：数据集中存在「已发布案例挂在未发布图书馆下」的情况（如 case_id=8 → library_id=18 pending）。
 * 若只按案例自身状态过滤，前台会显示未发布图书馆的名称，并产生指向 Not Found 的死链。
 * 该规则与 Award_Result 的既有规则（result + award + library 均 published）保持一致。
 *
 * @param {Object} item 案例记录
 * @param {Array} libraries 图书馆数据（建议传未经 published 过滤的完整数组）
 */
export function isCaseVisible(item, libraries) {
  if (!item || item.status !== "published") return false;
  const lib = getLibraryById(libraries, item.library_id);
  return !!lib && lib.status === "published";
}

/**
 * 取前台可见案例集合（案例 published + 所属图书馆 published）。
 */
export function getVisibleCases(cases, libraries) {
  return cases.filter(c => isCaseVisible(c, libraries));
}

/**
 * 核心对象 ↔ Source（M : N）：通过来源关联表取某对象的已发布来源。
 * @param {Array} relationRows 关联表记录（如 library-source.json）
 * @param {Array} sources 全部来源记录
 * @param {number} entityId 核心对象 id（如 library_id）
 * @param {string} entityKey 关联表中的外键字段名（如 "library_id"）
 * @returns {Array<{source: Object, relationType: string}>} 去重后的来源列表
 */
export function getSourcesForEntity(relationRows, sources, entityId, entityKey) {
  const sourceIds = relationRows
    .filter(row => row[entityKey] === entityId)
    .map(row => ({ source_id: row.source_id, relation_type: row.relation_type }));

  const seen = new Set();
  const list = [];
  for (const { source_id, relation_type } of sourceIds) {
    if (seen.has(source_id)) continue; // 同一来源多条关联只显示一次
    seen.add(source_id);
    const source = sources.find(s => s.source_id === source_id);
    if (source && source.status === "published") {
      list.push({ source, relationType: relation_type });
    }
  }
  return list;
}

/**
 * Country → Library：取某国家已发布的图书馆。
 */
export function getPublishedLibrariesForCountry(libraries, countryId) {
  return libraries.filter(l => l.country_id === countryId && l.status === "published");
}

/* ---------- 全站搜索 ---------- */

/**
 * 基础关键词搜索（大小写不敏感的包含匹配）。
 * 搜索范围（仅 published 记录）：
 *   Library.name / Library.name_en
 *   Award.award_name
 *   Case_Project.title
 *   Country.country_name
 *
 * @param {string} query 关键词
 * @param {{countries: Array, libraries: Array, awards: Array, cases: Array}} data
 * @returns {Array<{type: string, title: string, sub: string}>} 搜索结果（带类型标记）
 */
export function searchAll(query, data) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];

  const results = [];

  // Library：匹配 name 或 name_en（V0.2 新增字段）
  for (const lib of data.libraries) {
    if (lib.status !== "published") continue;
    const inName = (lib.name || "").toLowerCase().includes(keyword);
    const inNameEn = (lib.name_en || "").toLowerCase().includes(keyword);
    if (inName || inNameEn) {
      const countryName = getCountryName(data.countries, lib.country_id);
      results.push({
        type: "Library",
        id: lib.library_id,
        title: lib.name,
        sub: [lib.name_en, countryName, lib.city].filter(Boolean).join(" · ")
      });
    }
  }

  // Award：匹配 award_name
  for (const award of data.awards) {
    if (award.status !== "published") continue;
    if ((award.award_name || "").toLowerCase().includes(keyword)) {
      results.push({
        type: "Award",
        id: award.award_id,
        title: award.award_name,
        sub: truncate(award.organizer || "", 60)
      });
    }
  }

  // Case：匹配 title（可见性规则：案例与所属图书馆均 published）
  for (const item of data.cases) {
    if (!isCaseVisible(item, data.libraries)) continue;
    if ((item.title || "").toLowerCase().includes(keyword)) {
      const lib = getLibraryById(data.libraries, item.library_id);
      results.push({
        type: "Case",
        id: item.case_id,
        title: item.title,
        sub: [lib ? lib.name : "Unknown Library", item.year].filter(Boolean).join(" · ")
      });
    }
  }

  // Country：匹配 country_name
  for (const country of data.countries) {
    if (country.status !== "published") continue;
    if ((country.country_name || "").toLowerCase().includes(keyword)) {
      results.push({
        type: "Country",
        id: country.country_id,
        title: country.country_name,
        sub: [country.country_code, country.region].filter(Boolean).join(" · ")
      });
    }
  }

  return results.slice(0, APP_CONFIG.searchResultLimit);
}

/* ---------- Libraries 列表页：过滤 / 排序（纯函数） ---------- */

/**
 * 过滤图书馆列表（全部条件为 AND 逻辑；输入应已过滤 published）。
 * @param {Array} libraries 已发布的图书馆数组
 * @param {{query: string, countryId: number|null, region: string|null, type: string|null}} filters
 * @param {Array} countries 全部国家（用于把 countryId / region 解析为国家）
 */
export function filterLibraries(libraries, filters, countries) {
  const keyword = (filters.query || "").trim().toLowerCase();

  return libraries.filter(lib => {
    // Country 筛选：country_id 精确匹配
    if (filters.countryId !== null && lib.country_id !== filters.countryId) return false;

    // Region 筛选：先解析该馆所属国家的 region 再比较
    if (filters.region) {
      const country = getCountryById(countries, lib.country_id);
      if (!country || country.region !== filters.region) return false;
    }

    // Library Type 筛选
    if (filters.type && lib.library_type !== filters.type) return false;

    // 搜索：name / name_en / city / 所属国家名（大小写不敏感，支持中文）
    if (keyword) {
      const countryName = getCountryName(countries, lib.country_id).toLowerCase();
      const haystack = [
        (lib.name || "").toLowerCase(),
        (lib.name_en || "").toLowerCase(),
        (lib.city || "").toLowerCase(),
        countryName
      ];
      if (!haystack.some(text => text.includes(keyword))) return false;
    }

    return true;
  });
}

/**
 * 排序图书馆列表。
 * @param {"name"|"updated"} mode "name" = Name A–Z；"updated" = Recently Updated（last_updated 倒序）
 */
export function sortLibraries(libraries, mode) {
  const list = [...libraries]; // 不修改原数组
  if (mode === "updated") {
    // last_updated 倒序；相同时按 library_id 稳定排序
    list.sort((a, b) => {
      const la = a.last_updated || "";
      const lb = b.last_updated || "";
      if (la !== lb) return lb.localeCompare(la);
      return (a.library_id || 0) - (b.library_id || 0);
    });
  } else {
    // Name A–Z（以 library.name 为主）
    list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-Hans-CN"));
  }
  return list;
}

/* ---------- Awards 列表页：过滤 / 排序（纯函数） ---------- */

/**
 * 过滤奖项列表（AND 逻辑；输入应已过滤 published）。
 * 搜索范围：award_name / organizer / description。
 * @param {Array} awards 已发布奖项
 * @param {{query: string, organizer: string|null, frequency: string|null}} filters
 */
export function filterAwards(awards, filters) {
  const keyword = (filters.query || "").trim().toLowerCase();

  return awards.filter(award => {
    if (filters.frequency && award.frequency !== filters.frequency) return false;
    if (filters.organizer && award.organizer !== filters.organizer) return false;

    if (keyword) {
      const haystack = [
        (award.award_name || "").toLowerCase(),
        (award.organizer || "").toLowerCase(),
        (award.description || "").toLowerCase()
      ];
      if (!haystack.some(text => text.includes(keyword))) return false;
    }
    return true;
  });
}

/**
 * 奖项排序。
 * @param {"name"|"updated"|"founded"} mode name = 名称；updated = 最近更新；founded = 设立年份倒序
 */
export function sortAwards(awards, mode) {
  const list = [...awards];
  if (mode === "updated") {
    list.sort((a, b) => {
      const la = a.last_updated || "";
      const lb = b.last_updated || "";
      if (la !== lb) return lb.localeCompare(la);
      return (a.award_id || 0) - (b.award_id || 0);
    });
  } else if (mode === "founded") {
    list.sort((a, b) => (b.founded_year || 0) - (a.founded_year || 0));
  } else {
    list.sort((a, b) => (a.award_name || "").localeCompare(b.award_name || "", "zh-Hans-CN"));
  }
  return list;
}

/* ---------- Cases 列表页：过滤 / 排序（纯函数） ---------- */

/**
 * 过滤案例列表（AND 逻辑；输入应已过滤 published）。
 * 搜索范围：title / description / 所属 Library 名称（经 library_id 解析）。
 * Country 筛选经 Case → Library → Country 计算，案例 JSON 内不存国家字段。
 * @param {Array} cases 已发布案例
 * @param {{query: string, topic: string|null, year: number|null, countryId: number|null}} filters
 * @param {Array} libraries 全部图书馆（解析 library_id）
 * @param {Array} countries 全部国家（用于 country 筛选的解析）
 */
export function filterCases(cases, filters, libraries, countries) {
  const keyword = (filters.query || "").trim().toLowerCase();

  return cases.filter(item => {
    if (filters.topic && item.topic !== filters.topic) return false;
    if (filters.year !== null && filters.year !== undefined && item.year !== filters.year) return false;

    // Country 筛选：Case → Library → Country
    if (filters.countryId !== null && filters.countryId !== undefined) {
      const lib = getLibraryById(libraries, item.library_id);
      if (!lib || lib.country_id !== filters.countryId) return false;
    }

    if (keyword) {
      const lib = getLibraryById(libraries, item.library_id);
      const countryName = lib ? getCountryName(countries, lib.country_id).toLowerCase() : "";
      const haystack = [
        (item.title || "").toLowerCase(),
        (item.description || "").toLowerCase(),
        lib ? (lib.name || "").toLowerCase() : "",
        lib ? (lib.name_en || "").toLowerCase() : "",
        countryName
      ];
      if (!haystack.some(text => text.includes(keyword))) return false;
    }
    return true;
  });
}

/**
 * 案例排序。
 * @param {"year"|"updated"|"title"} mode year = 年份倒序（默认）；updated = 最近更新；title = 标题
 */
export function sortCases(cases, mode) {
  const list = [...cases];
  if (mode === "updated") {
    list.sort((a, b) => {
      const la = a.last_updated || "";
      const lb = b.last_updated || "";
      if (la !== lb) return lb.localeCompare(la);
      return (a.case_id || 0) - (b.case_id || 0);
    });
  } else if (mode === "title") {
    list.sort((a, b) => (a.title || "").localeCompare(b.title || "", "zh-Hans-CN"));
  } else {
    list.sort((a, b) => (b.year || 0) - (a.year || 0));
  }
  return list;
}

/* ---------- Award → Award_Result → Library 数据链 ---------- */

/**
 * Award → Award_Result → Library：取某奖项已发布的获奖记录。
 * 过滤规则：award_result.status === "published" 且对应 Library 也 published。
 * @returns {Array<{result: Object, library: Object}>} 按 year 倒序（同年保持原顺序）
 */
export function getPublishedResultsForAward(awardResults, libraries, awardId) {
  return awardResults
    .filter(r => r.award_id === awardId && r.status === "published")
    .map(r => ({ result: r, library: getLibraryById(libraries, r.library_id) }))
    .filter(pair => pair.library !== null && pair.library.status === "published")
    .sort((a, b) => (b.result.year || 0) - (a.result.year || 0));
}

/* ---------- 全站搜索升级（STEP 3） ---------- */

/**
 * 全站统一搜索（Country / Library / Award / Case 四类，仅 published）。
 * 搜索范围（STEP 3 扩展后）：
 *   Country.country_name
 *   Library.name / Library.name_en / Library.city
 *   Award.award_name / Award.organizer
 *   Case.title / Case.description
 *
 * @param {string} query 关键词
 * @param {{countries: Array, libraries: Array, awards: Array, cases: Array}} data
 * @returns {Array<{type: string, id: number, title: string, sub: string}>}
 */
export function searchAllUpgraded(query, data) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];

  const results = [];

  /* 国家匹配：country_name / country_code + 常用英文别名（查询解析层，不写入 JSON）。
     别名表与 Ask AI Demo 共用，保证 "Denmark" 这类英文国家名在全站搜索中可用。 */
  const aliasByCode = new Map();
  for (const entry of COUNTRY_ALIASES) {
    if (entry.alias.some(a => a.includes(keyword) || keyword.includes(a))) {
      aliasByCode.set(entry.code, entry);
    }
  }
  const matchedCountryIds = new Set();

  // Country：country_name / country_code / 英文别名
  for (const country of data.countries) {
    if (country.status !== "published") continue;
    const byAlias = aliasByCode.has(country.country_code);
    const haystack = [
      (country.country_name || "").toLowerCase(),
      (country.country_code || "").toLowerCase()
    ];
    if (byAlias || haystack.some(t => t && t.includes(keyword))) {
      matchedCountryIds.add(country.country_id);
      const libCount = data.libraries.filter(
        l => l.status === "published" && l.country_id === country.country_id
      ).length;
      results.push({
        type: "Country",
        id: country.country_id,
        title: country.country_name,
        sub: [country.region, country.country_code, `${libCount} libraries`].filter(Boolean).join(" · ")
      });
    }
  }

  // Library：name / name_en / city（+ 所属国家名；国家被英文别名命中时，该国图书馆同样命中）
  for (const lib of data.libraries) {
    if (lib.status !== "published") continue;
    const countryName = getCountryName(data.countries, lib.country_id);
    const byCountry = matchedCountryIds.has(lib.country_id);
    const haystack = [
      (lib.name || "").toLowerCase(),
      (lib.name_en || "").toLowerCase(),
      (lib.city || "").toLowerCase(),
      countryName.toLowerCase()
    ];
    if (byCountry || haystack.some(t => t && t.includes(keyword))) {
      const typeLabel = LIBRARY_TYPE_LABELS[lib.library_type] || lib.library_type;
      results.push({
        type: "Library",
        id: lib.library_id,
        title: lib.name,
        sub: [lib.name_en, countryName, typeLabel].filter(Boolean).join(" · ")
      });
    }
  }

  // Award：award_name / organizer
  for (const award of data.awards) {
    if (award.status !== "published") continue;
    const haystack = [
      (award.award_name || "").toLowerCase(),
      (award.organizer || "").toLowerCase()
    ];
    if (haystack.some(t => t && t.includes(keyword))) {
      results.push({
        type: "Award",
        id: award.award_id,
        title: award.award_name,
        sub: truncate(award.organizer || "", 80)
      });
    }
  }

  // Case：title / description（可见性规则：案例与所属图书馆均 published）
  for (const item of data.cases) {
    if (!isCaseVisible(item, data.libraries)) continue;
    const haystack = [
      (item.title || "").toLowerCase(),
      (item.description || "").toLowerCase()
    ];
    if (haystack.some(t => t && t.includes(keyword))) {
      const lib = getLibraryById(data.libraries, item.library_id);
      results.push({
        type: "Case",
        id: item.case_id,
        title: item.title,
        sub: [lib ? lib.name : "Unknown Library", item.year].filter(Boolean).join(" · ")
      });
    }
  }

  // Source：title / source_name / publisher（C2.3 新增检索对象，与动态检索同一口径）
  for (const src of (data.sources || [])) {
    if (src.status !== "published") continue;
    const haystack = [
      (src.title || "").toLowerCase(),
      (src.source_name || "").toLowerCase(),
      (src.publisher || "").toLowerCase()
    ];
    if (haystack.some(t => t && t.includes(keyword))) {
      results.push({
        type: "Source",
        id: src.source_id,
        title: src.title,
        sub: [src.source_name, src.publisher].filter(Boolean).join(" · "),
        url: src.url || ""
      });
    }
  }

  return results.slice(0, APP_CONFIG.searchResultLimit);
}

/* ---------- Ask AI：规则式实体解析（D1 前既有实现，保留供参考/回退） ----------
   说明：这是 Prototype 的规则式查询（关键词 + 本地 JSON），
   不连接任何真实 LLM / API。以下函数为纯函数，便于单元测试。 */

/* 数据集内 10 个国家的中英文检索别名（仅用于查询解析，不写入 JSON） */
export const COUNTRY_ALIASES = [
  { code: "CN", zh: "中国", alias: ["china", "chinese", "中国"] },
  { code: "US", zh: "美国", alias: ["usa", "united states", "america", "美国"] },
  { code: "DK", zh: "丹麦", alias: ["denmark", "danish", "丹麦"] },
  { code: "ES", zh: "西班牙", alias: ["spain", "spanish", "西班牙"] },
  { code: "FI", zh: "芬兰", alias: ["finland", "finnish", "芬兰"] },
  { code: "NO", zh: "挪威", alias: ["norway", "norwegian", "挪威"] },
  { code: "CA", zh: "加拿大", alias: ["canada", "canadian", "加拿大"] },
  { code: "NL", zh: "荷兰", alias: ["netherlands", "holland", "dutch", "荷兰"] },
  { code: "SE", zh: "瑞典", alias: ["sweden", "swedish", "瑞典"] },
  { code: "AU", zh: "澳大利亚", alias: ["australia", "australian", "澳大利亚"] }
];

/* 关键词 → library_type 映射（用于 "public libraries in China" 这类问题） */
const TYPE_KEYWORDS = [
  { type: "public", words: ["public library", "public libraries", "公共图书馆", "公共馆"] },
  { type: "national", words: ["national library", "national libraries", "国家图书馆"] },
  { type: "academic", words: ["academic library", "academic libraries", "university library", "大学图书馆", "高校图书馆"] },
  { type: "school", words: ["school library", "学校图书馆"] },
  { type: "special", words: ["special library", "专业图书馆"] }
];

/** 在问题中查找国家（返回 country 记录或 null） */
export function detectCountry(question, countries) {
  const q = question.toLowerCase();
  for (const entry of COUNTRY_ALIASES) {
    if (entry.alias.some(a => q.includes(a))) {
      const country = countries.find(c => c.country_code === entry.code && c.status === "published");
      if (country) return country;
    }
  }
  // 直接匹配 country_name（如 "Denmark" 已覆盖；此处兜底其他写法）
  return countries.find(c => c.status === "published" && q.includes((c.country_name || "").toLowerCase())) || null;
}

/** 在问题中查找图书馆类型（返回 library_type 字符串或 null） */
export function detectLibraryType(question) {
  const q = question.toLowerCase();
  for (const entry of TYPE_KEYWORDS) {
    if (entry.words.some(w => q.includes(w))) return entry.type;
  }
  return null;
}

/**
 * Ask AI 的规则式回答（D1 前既有实现）。
 * @returns {{matched: boolean, intent: string, text: string, items: Array, sources: Array}}
 *   items：命中的 Library / Award / Case 条目（含 id / type / title / sub）
 */
export function answerQuestion(question, data) {
  const q = (question || "").trim().toLowerCase();
  const empty = { matched: false, intent: "unknown", text: "", items: [], sources: [] };

  if (!q) return empty;

  const publishedLibraries = data.libraries.filter(l => l.status === "published");
  // 可见性规则：案例 published 且所属图书馆 published（与列表页一致）
  const publishedCases = getVisibleCases(data.cases, data.libraries);

  /* 意图 1：green library（绿色图书馆 / 绿色奖项） */
  if (q.includes("green") || q.includes("绿色")) {
    const greenResults = data.awardResults
      .filter(r => r.status === "published" && (r.category || "").toLowerCase().includes("green"))
      .map(r => ({ result: r, library: getLibraryById(data.libraries, r.library_id) }))
      .filter(pair => pair.library && pair.library.status === "published");

    // 绿色主题案例（topic = sustainability）作为补充线索
    const greenCases = publishedCases.filter(c => c.topic === "sustainability");

    if (greenResults.length === 0 && greenCases.length === 0) return { ...empty, intent: "green" };

    const items = greenResults.map(({ result, library }) => ({
      type: "Library",
      id: library.library_id,
      title: library.name,
      sub: `${getCountryName(data.countries, library.country_id)} · ${result.year} · ${result.result_type}`
    })).concat(greenCases.map(c => {
      const lib = getLibraryById(data.libraries, c.library_id);
      return {
        type: "Case",
        id: c.case_id,
        title: c.title,
        sub: [lib ? lib.name : "Unknown Library", c.year].filter(Boolean).join(" · ")
      };
    }));

    const sourceIds = new Set();
    for (const { result } of greenResults) {
      for (const row of data.awardResultSource || []) {
        if (row.award_result_id === result.award_result_id) sourceIds.add(row.source_id);
      }
    }

    return {
      matched: true,
      intent: "green_library",
      text: `Found ${greenResults.length} published award record(s) in the "Green Library" category and ${greenCases.length} sustainability-related case(s) in the runtime dataset.`,
      items,
      sources: [...sourceIds].map(id => data.sources.find(s => s.source_id === id)).filter(Boolean)
    };
  }

  /* 意图 2：被国际奖项认可的图书馆（award / 奖项） */
  if (q.includes("award") || q.includes("prize") || q.includes("奖项") || q.includes("获奖")) {
    const country = detectCountry(q, data.countries);
    let rows = data.awardResults
      .filter(r => r.status === "published")
      .map(r => {
        const award = getAwardById(data.awards, r.award_id);
        const library = getLibraryById(data.libraries, r.library_id);
        return (award && award.status === "published" && library && library.status === "published")
          ? { result: r, award, library } : null;
      })
      .filter(Boolean);

    if (country) rows = rows.filter(row => row.library.country_id === country.country_id);

    // 同一图书馆只列出一次（展示其获奖数）
    const byLibrary = new Map();
    for (const row of rows) {
      const key = row.library.library_id;
      if (!byLibrary.has(key)) byLibrary.set(key, { library: row.library, count: 0 });
      byLibrary.get(key).count += 1;
    }

    if (byLibrary.size === 0) return { ...empty, intent: "award_winning_libraries" };

    return {
      matched: true,
      intent: "award_winning_libraries",
      text: `Found ${byLibrary.size} published librar${byLibrary.size === 1 ? "y" : "ies"} with international award records${country ? ` in ${country.country_name}` : ""} (${rows.length} award record(s) in total), resolved through Award → Award_Result → Library.`,
      items: [...byLibrary.values()].map(({ library, count }) => ({
        type: "Library",
        id: library.library_id,
        title: library.name,
        sub: `${getCountryName(data.countries, library.country_id)} · ${count} award record(s)`
      })),
      sources: []
    };
  }

  /* 意图 3：某国的图书馆（country + 可选类型） */
  const country = detectCountry(q, data.countries);
  if (country) {
    const type = detectLibraryType(q);
    let libraries = publishedLibraries.filter(l => l.country_id === country.country_id);
    if (type) libraries = libraries.filter(l => l.library_type === type);

    if (libraries.length === 0) return { ...empty, intent: "libraries_by_country" };

    const typeLabel = type ? `${LIBRARY_TYPE_LABELS[type] || type} ` : "";
    return {
      matched: true,
      intent: "libraries_by_country",
      text: `Found ${libraries.length} published ${typeLabel}librar${libraries.length === 1 ? "y" : "ies"} in ${country.country_name} (${country.country_code}), queried from the local runtime dataset.`,
      items: libraries.map(lib => ({
        type: "Library",
        id: lib.library_id,
        title: lib.name,
        sub: [lib.name_en, lib.city, LIBRARY_TYPE_LABELS[lib.library_type] || lib.library_type].filter(Boolean).join(" · ")
      })),
      sources: getSourcesForEntity(data.countrySource || [], data.sources, country.country_id, "country_id").map(e => e.source)
    };
  }

  /* 意图 4：案例（case / project / 案例） */
  if (q.includes("case") || q.includes("project") || q.includes("案例")) {
    if (publishedCases.length === 0) return { ...empty, intent: "cases" };
    return {
      matched: true,
      intent: "cases",
      text: `Found ${publishedCases.length} published case(s) / project(s) in the runtime dataset, each linked to its library through library_id.`,
      items: publishedCases.map(c => {
        const lib = getLibraryById(data.libraries, c.library_id);
        return {
          type: "Case",
          id: c.case_id,
          title: c.title,
          sub: [lib ? lib.name : "Unknown Library", TOPIC_LABELS[c.topic] || c.topic, c.year].filter(Boolean).join(" · ")
        };
      }),
      sources: []
    };
  }

  /* 意图 5：图书馆总览（library / 图书馆） */
  if (q.includes("library") || q.includes("libraries") || q.includes("图书馆")) {
    const type = detectLibraryType(q);
    const libraries = type
      ? publishedLibraries.filter(l => l.library_type === type)
      : publishedLibraries;
    if (libraries.length === 0) return { ...empty, intent: "all_libraries" };
    return {
      matched: true,
      intent: "all_libraries",
      text: `The runtime dataset currently contains ${libraries.length} published librar${libraries.length === 1 ? "y" : "ies"}${type ? ` of type “${LIBRARY_TYPE_LABELS[type] || type}”` : ""}, across ${new Set(libraries.map(l => l.country_id)).size} countries/regions.`,
      items: libraries.map(lib => ({
        type: "Library",
        id: lib.library_id,
        title: lib.name,
        sub: [getCountryName(data.countries, lib.country_id), lib.city].filter(Boolean).join(" · ")
      })),
      sources: []
    };
  }

  return empty;
}
