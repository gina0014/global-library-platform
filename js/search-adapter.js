/* ============================================================
   search-adapter.js — C2.2 检索适配器（Dynamic Search）

   链路：Search Page → data-loader.js → 本适配器 → Directus（PostgreSQL）
   页面绝不直接 fetch Directus / PostgreSQL / 任何检索服务。

   为什么不需要额外检索服务（C2.1 评估结论，证据：
   dynamic-mvp/evidence/c2_search_assessment.json）：
     - 方式 A `?search=` 与 JSON baseline 完全一致 50/75：它扫**全部字段**
       （含 description / website），产生大量"契约外命中"。
     - 方式 B 逐字段 `_icontains` 一致 62/75：与客户端 haystack 完全对齐，
       剩余差异全部是**可由适配层补齐的语义**，不是召回能力不足：
         · 国家别名（Denmark / 丹麦 → DK）属于查询解析层，本就不在数据里
         · "命中某国 → 该国图书馆"的扩展是一次 `filter[country_id][_in]`
         · `%` / `_` 是 SQL LIKE 通配符，转义后即与字面量语义一致
     - 中文召回**没有缺口**（"图书馆 / 图书 / 上海 / 丹麦 / 设计"全部命中）。
   结论：Directus REST 完全够用，不引入 Meilisearch 或其它检索服务。

   published-only **由服务端保证**：所有请求都是公开角色的请求，
   Directus 权限层已强制 status=published 与父子发布一致性；
   适配层不做"先取全量再在前端过滤"——匹配全部由服务端 filter 完成，
   这里额外的字段请求只用于拼装展示文案。
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { API_DATASOURCE } from "./data-loader.js";
import { COUNTRY_ALIASES, LIBRARY_TYPE_LABELS } from "./utils.js";

/* 与 utils.searchAllUpgraded 保持**同一份**字段口径 */
const SEARCH_FIELDS = {
  country: ["country_name", "country_code"],
  library: ["name", "name_en", "city"],
  award: ["award_name", "organizer"],
  case_project: ["title", "description"],
  source: ["title", "source_name", "publisher"]
};

/* 展示文案需要的字段（含关联字段，均由服务端权限层过滤） */
const DISPLAY_FIELDS = {
  country: "country_id,country_name,country_code,region",
  // 注意：同时请求 country_id 与 country_id.* 时 Directus 会把 country_id 变成对象，
  // 因此显式取 country_id.country_id 作为标量外键
  library: "library_id,name,name_en,city,library_type,country_id.country_id,country_id.country_name",
  award: "award_id,award_name,organizer",
  case_project: "case_id,title,year,library_id,library_id.name",
  source: "source_id,title,source_name,publisher,url"
};

/** SQL LIKE 通配符转义：`%` / `_` / `\` 在 `_icontains` 里会被当通配符。 */
function escapeLike(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildUrl(collection, params) {
  // filter 的方括号必须编码（未编码时部分客户端 / 代理会吞掉参数，导致过滤失效）
  const qs = params
    .map(([k, v]) => `${k.replace(/\[/g, "%5B").replace(/\]/g, "%5D")}=${encodeURIComponent(v)}`)
    .join("&");
  return `${API_DATASOURCE.baseUrl}/items/${collection}?${qs}`;
}

/** 逐字段 `_icontains` 的 OR 查询（字段口径与客户端一致）。 */
function containsUrl(collection, keyword) {
  const params = [["limit", "-1"], ["fields", DISPLAY_FIELDS[collection]]];
  SEARCH_FIELDS[collection].forEach((f, i) => {
    params.push([`filter[_or][${i}][${f}][_icontains]`, escapeLike(keyword)]);
  });
  return buildUrl(collection, params);
}

async function fetchRows(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[search-adapter] ${res.status} ${url}`);
  }
  const body = await res.json();
  return Array.isArray(body.data) ? body.data.map(normalize) : [];
}

/** 与 data-loader 的 normalizeRecord 同口径：日期归一到 JSON 契约形态。 */
function normalize(row) {
  const out = { ...row };
  if ("last_updated" in out) {
    const m = String(out.last_updated).match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) out.last_updated = m[1];
  }
  return out;
}

/** 关键词是否命中某个国家的查询别名（例如 "Denmark" → DK）。 */
function aliasCountryCodes(keyword) {
  const kw = keyword.trim().toLowerCase();
  const codes = new Set();
  if (!kw) return codes;
  for (const entry of COUNTRY_ALIASES) {
    if (entry.alias.some(a => a.includes(kw) || kw.includes(a))) codes.add(entry.code);
  }
  return codes;
}

/**
 * 动态检索：Country / Library / Award / Case / Source。
 * @param {string} query 用户关键词
 * @returns {Promise<Array<{type:string,id:number,title:string,sub:string,url?:string}>>}
 */
export async function searchDynamic(query) {
  const keyword = (query || "").trim().toLowerCase();
  if (!keyword) return [];

  // 五个集合各一次公开请求：匹配发生在服务端，published-only 由权限层保证
  const [countries, libraries, awards, cases, sources] = await Promise.all([
    fetchRows(containsUrl("country", keyword)),
    fetchRows(containsUrl("library", keyword)),
    fetchRows(containsUrl("award", keyword)),
    fetchRows(containsUrl("case_project", keyword)),
    fetchRows(containsUrl("source", keyword))
  ]);

  // 国家命中 = 字段命中 ∪ 别名命中（别名属查询解析层，不在数据里）
  const matchedCountries = [...countries];
  const matchedCountryIds = new Set(countries.map(c => c.country_id));
  const aliasCodes = aliasCountryCodes(keyword);
  if (aliasCodes.size) {
    const all = await fetchRows(
      buildUrl("country", [["limit", "-1"], ["fields", DISPLAY_FIELDS.country]]));
    for (const c of all) {
      if (aliasCodes.has(c.country_code) && !matchedCountryIds.has(c.country_id)) {
        matchedCountryIds.add(c.country_id);
        matchedCountries.push(c);
      }
    }
  }

  // Library：字段命中 ∪ "所属国家命中"扩展（等价于客户端 haystack 含 country_name）
  const directlyMatched = new Set(libraries.map(l => l.library_id));
  const libById = new Map(libraries.map(l => [l.library_id, l]));
  if (matchedCountryIds.size) {
    const expanded = await fetchRows(buildUrl("library", [
      ["limit", "-1"],
      ["fields", DISPLAY_FIELDS.library],
      ["filter[country_id][_in]", [...matchedCountryIds].join(",")]
    ]));
    for (const l of expanded) libById.set(l.library_id, l);
  }

  const results = [];

  // 国家下的已发布图书馆数（与客户端结果契约一致：`${libCount} libraries`）。
  // 计数同样在服务端完成（aggregate + groupBy），前端不做统计。
  let countryLibCounts = new Map();
  if (matchedCountryIds.size) {
    const rows = await fetchRows(buildUrl("library", [
      ["limit", "-1"],
      ["aggregate[count]", "*"],
      ["groupBy", "country_id"],
      ["filter[country_id][_in]", [...matchedCountryIds].join(",")]
    ]));
    countryLibCounts = new Map(rows.map(r => [r.country_id, Number(r.count)]));
  }

  // 顺序与 utils.searchAllUpgraded 一致：Country → Library → Award → Case（→ Source）
  for (const c of matchedCountries) {
    const libCount = countryLibCounts.get(c.country_id) || 0;
    results.push({
      type: "Country",
      id: c.country_id,
      title: c.country_name,
      sub: [c.region, c.country_code, `${libCount} libraries`].filter(Boolean).join(" · ")
    });
  }

  for (const l of libById.values()) {
    // country_id 在带关联字段时是对象，取其中的标量主键
    const countryId = typeof l.country_id === "object" && l.country_id
      ? l.country_id.country_id
      : l.country_id;
    if (!matchedCountryIds.has(countryId) && !directlyMatched.has(l.library_id)) continue;
    const countryName = (l.country_id && l.country_id.country_name) || "";
    const typeLabel = LIBRARY_TYPE_LABELS[l.library_type] || l.library_type;
    results.push({
      type: "Library",
      id: l.library_id,
      title: l.name,
      sub: [l.name_en, countryName, typeLabel].filter(Boolean).join(" · ")
    });
  }

  for (const a of awards) {
    results.push({
      type: "Award",
      id: a.award_id,
      title: a.award_name,
      sub: a.organizer || ""
    });
  }

  for (const cs of cases) {
    const libName = (cs.library_id && cs.library_id.name) || "";
    results.push({
      type: "Case",
      id: cs.case_id,
      title: cs.title,
      sub: [libName, cs.year].filter(Boolean).join(" · ")
    });
  }

  // Source：C2.3 新增的检索对象。Source 没有站内详情页，
  // 其"详情页"就是数据中记录的原始出处 URL（真实数据，非生成）。
  for (const s of sources) {
    results.push({
      type: "Source",
      id: s.source_id,
      title: s.title,
      sub: [s.source_name, s.publisher].filter(Boolean).join(" · "),
      url: s.url || ""
    });
  }

  return results.slice(0, APP_CONFIG.searchResultLimit);
}
