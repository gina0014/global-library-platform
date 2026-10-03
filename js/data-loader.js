/* ============================================================
   data-loader.js — 统一数据加载入口（Single Data Access Point）
   所有页面通过本模块读取数据，不允许各页面自行 fetch。

   数据源：
   - Issue 001：Library / Country → Directus API（PostgreSQL）
   - B2：Award / Award Result / Case / Source → Directus API（PostgreSQL）
   - B2 收尾：五张 *_source 关联表 → Directus API（PostgreSQL）
     （V0.2 用 (实体ID, source_id) 复合主键，Directus 会忽略无单列主键的集合；
      经人工批准后采用「代理主键 id + 原复合键保留为 UNIQUE」的物理兼容方案，
      业务关系语义不变。详见 IMPLEMENTATION-002.md「Known Issues #1 → RESOLVED」）
   至此：六类核心对象 + 全部 Source Relation 的 Runtime 数据均来自 API，
   data/*.json 降级为 Migration Baseline / Fallback / Historical Artifact。
   切换只发生在本文件内，页面脚本零改动。

   错误处理约定：
   - 网络失败 / 文件不存在 / JSON 解析失败 / API 载荷异常 → 抛出 DataLoadError
   - 同时用 console.error 记录技术细节
   - 调用方（页面脚本）负责把错误展示为用户可理解的状态
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { withBase } from "./utils.js";

/** 自定义错误类型：携带发生原因和出错的地址，便于排查 */
export class DataLoadError extends Error {
  constructor(reason, url, detail) {
    super(`Failed to load ${url} (${reason})`);
    this.name = "DataLoadError";
    this.reason = reason;   // "network" | "http" | "parse" | "api"
    this.url = url;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------
   Issue 001 — 数据源切换配置
   仅本文件可见：页面脚本、URL、UI、data/*.json 均不感知数据来源。
   DATA_SOURCE_MODE：
     "api"  → 六类核心对象走 Directus API（默认，B2 生效路径）
     "json" → 全部走 data/*.json（回退开关，不需要改动任何页面代码）
   ------------------------------------------------------------ */
const DATA_SOURCE_MODE = "api";

export const API_DATASOURCE = {
  baseUrl: "http://localhost:8055",
  // 核心对象 → Directus collection 名（与 PostgreSQL 表名一致）
  collections: {
    countries: "country",
    libraries: "library",
    awards: "award",
    awardResults: "award_result",
    cases: "case_project",
    sources: "source",
    // 五张 Source 关联表（B2 收尾：surrogate PK 方案落地后一并切到 API）
    countrySource: "country_source",
    librarySource: "library_source",
    awardSource: "award_source",
    awardResultSource: "award_result_source",
    caseSource: "case_source"
  }
};

/**
 * 关联表的代理主键 id 是**纯技术列**（Directus 单列主键要求），
 * 不属于 data/*.json 的字段契约，读取后立即丢弃，
 * 保证前端拿到的数据结构与 JSON 模式逐字段一致。
 */
const TECHNICAL_PK_COLLECTIONS = new Set([
  "country_source", "library_source", "award_source",
  "award_result_source", "case_source"
]);

/** 判断某个对象是否改走 API */
function useApi(key) {
  return DATA_SOURCE_MODE === "api" && Boolean(API_DATASOURCE.collections[key]);
}

/**
 * 读取并解析一个 JSON 文件。
 * @param {string} fileName 例如 "countries.json"
 * @returns {Promise<Array|Object>} 解析后的 JSON 数据
 */
async function fetchJson(fileName) {
  // withBase：pages/ 子目录下的页面自动加 "../" 前缀，
  // 否则 "./data/xxx.json" 会被解析为 /pages/data/xxx.json（STEP 2 回归测试发现的问题）
  const url = withBase(APP_CONFIG.DATA_PATH) + fileName;

  // 1. 发起请求（网络层面失败：断网 / 服务器未启动）
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.error("[data-loader] Network error while fetching:", url, err);
    throw new DataLoadError("network", url, err);
  }

  // 2. 检查 HTTP 状态（404 = 文件不存在等）
  if (!response.ok) {
    console.error("[data-loader] HTTP error:", response.status, url);
    throw new DataLoadError("http", url, response.status);
  }

  // 3. 解析 JSON（文件存在但内容不是合法 JSON）
  try {
    return await response.json();
  } catch (err) {
    console.error("[data-loader] JSON parse error:", url, err);
    throw new DataLoadError("parse", url, err);
  }
}

/* ---------- Directus API 读取（Issue 001） ---------- */

/**
 * 把 API 返回的时间戳归一化回既有 JSON 契约：
 *   "2026-09-19T00:00:00.000Z" → "2026-09-19"     （原始 JSON 中 last_updated 为日期）
 *   "2026-09-19T04:00:00.000Z" → "2026-09-19T04:00:00"（原始 created_at 为无时区本地时间）
 * 说明：PostgreSQL 容器固定 UTC，种子数据按 UTC 写入，因此回读值与 JSON 完全一致。
 * @param {string|null} value
 * @returns {string|null}
 */
function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return value;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return value;
  const [, y, mo, d, hh = "00", mm = "00", ss = ""] = match;
  const date = `${y}-${mo}-${d}`;
  if (hh === "00" && mm === "00" && (ss === "" || ss === "00")) return date;
  return `${date}T${hh}:${mm}:${ss === "" ? "00" : ss}`;
}

/**
 * 把 API 返回的一条记录归一化为与 data/*.json 相同的字段契约。
 * 只做日期形态归一，不做字段增删、不做计算、不缓存。
 * @param {Object} row
 * @returns {Object}
 */
function normalizeRecord(row, collection) {
  const record = { ...row };
  if ("last_updated" in record) record.last_updated = normalizeDate(record.last_updated);
  if ("created_at" in record) record.created_at = normalizeDate(record.created_at);
  // 关联表：丢弃代理主键 id（技术列，JSON 契约中不存在）
  if (collection && TECHNICAL_PK_COLLECTIONS.has(collection) && "id" in record) {
    delete record.id;
  }
  return record;
}

/**
 * 从 Directus 读取一个 collection 的全部记录。
 * 公开角色已在 API 层强制 status = published（见 IMPLEMENTATION-001.md）；
 * 本处不做任何客户端过滤，避免“API 返回全部 + JS 过滤”的错误实现。
 * @param {string} collection Directus collection 名
 * @returns {Promise<Array>}
 */
async function fetchCollection(collection) {
  // 不做显式排序：Directus 默认按主键升序返回，而关联表的代理主键 id 由
  // 迁移时按 JSON baseline 的文件顺序插入生成，因此返回顺序 = 迁移前顺序。
  // 注意：不能用 &sort=id —— 公开角色的字段白名单不含技术列 id，会被 403 拒绝。
  const url = `${API_DATASOURCE.baseUrl}/items/${collection}?limit=-1`;

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.error("[data-loader] Network error while fetching API:", url, err);
    throw new DataLoadError("network", url, err);
  }

  if (!response.ok) {
    console.error("[data-loader] HTTP error:", response.status, url);
    throw new DataLoadError("http", url, response.status);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    console.error("[data-loader] JSON parse error:", url, err);
    throw new DataLoadError("parse", url, err);
  }

  if (!payload || !Array.isArray(payload.data)) {
    console.error("[data-loader] Unexpected API payload:", url, payload);
    throw new DataLoadError("api", url, "payload.data is not an array");
  }

  return payload.data.map(row => normalizeRecord(row, collection));
}

/* ---------- 六类核心对象 ---------- */

export function loadCountries() {
  return useApi("countries")
    ? fetchCollection(API_DATASOURCE.collections.countries)
    : fetchJson(APP_CONFIG.dataFiles.countries);
}
export function loadLibraries() {
  return useApi("libraries")
    ? fetchCollection(API_DATASOURCE.collections.libraries)
    : fetchJson(APP_CONFIG.dataFiles.libraries);
}
export function loadAwards() {
  return useApi("awards")
    ? fetchCollection(API_DATASOURCE.collections.awards)
    : fetchJson(APP_CONFIG.dataFiles.awards);
}
export function loadAwardResults() {
  return useApi("awardResults")
    ? fetchCollection(API_DATASOURCE.collections.awardResults)
    : fetchJson(APP_CONFIG.dataFiles.awardResults);
}
export function loadCases() {
  return useApi("cases")
    ? fetchCollection(API_DATASOURCE.collections.cases)
    : fetchJson(APP_CONFIG.dataFiles.cases);
}
export function loadSources() {
  return useApi("sources")
    ? fetchCollection(API_DATASOURCE.collections.sources)
    : fetchJson(APP_CONFIG.dataFiles.sources);
}

/* ---------- 五类 Source 关联表 ----------
   与核心对象同构：api 模式走 Directus，json 模式走 data/*.json。
   关联表无 status 字段（V0.2 schema 即如此），其公开可见性由 Directus
   权限层的「父实体 status = published」过滤器保证（见 IMPLEMENTATION-002.md）。 */

export function loadCountrySource() {
  return useApi("countrySource")
    ? fetchCollection(API_DATASOURCE.collections.countrySource)
    : fetchJson(APP_CONFIG.dataFiles.countrySource);
}
export function loadLibrarySource() {
  return useApi("librarySource")
    ? fetchCollection(API_DATASOURCE.collections.librarySource)
    : fetchJson(APP_CONFIG.dataFiles.librarySource);
}
export function loadAwardSource() {
  return useApi("awardSource")
    ? fetchCollection(API_DATASOURCE.collections.awardSource)
    : fetchJson(APP_CONFIG.dataFiles.awardSource);
}
export function loadAwardResultSource() {
  return useApi("awardResultSource")
    ? fetchCollection(API_DATASOURCE.collections.awardResultSource)
    : fetchJson(APP_CONFIG.dataFiles.awardResultSource);
}
export function loadCaseSource() {
  return useApi("caseSource")
    ? fetchCollection(API_DATASOURCE.collections.caseSource)
    : fetchJson(APP_CONFIG.dataFiles.caseSource);
}

/**
 * 一次性加载首页所需的六类核心数据。
 * （Source 关联表在详情页开发时按需加载，首页暂不需要。）
 * @returns {Promise<{countries: Array, libraries: Array, awards: Array,
 *                    awardResults: Array, cases: Array, sources: Array}>}
 */
export async function loadAllCoreData() {
  const [countries, libraries, awards, awardResults, cases, sources] = await Promise.all([
    loadCountries(),
    loadLibraries(),
    loadAwards(),
    loadAwardResults(),
    loadCases(),
    loadSources()
  ]);
  return { countries, libraries, awards, awardResults, cases, sources };
}

/**
 * 全站检索入口（C2）。页面只调这一个函数，不感知检索在哪里执行：
 *   - api 模式：交给检索适配器 → Directus（服务端 filter，published-only 由权限层保证）
 *   - json 模式：回退到既有的客户端检索（utils.searchAllUpgraded）
 * @param {string} query 关键词
 * @param {Object} [jsonData] json 模式下由页面传入的已加载数据
 * @returns {Promise<Array>} 结果项数组（type / id / title / sub）
 */
export async function searchAll(query, jsonData) {
  if (useApi("libraries")) {
    // 动态 import：避免 data-loader ↔ search-adapter 的静态循环依赖
    const { searchDynamic } = await import("./search-adapter.js");
    return searchDynamic(query);
  }
  if (!jsonData) return [];
  const { searchAllUpgraded } = await import("./utils.js");
  return searchAllUpgraded(query, jsonData);
}

/**
 * Ask AI 入口（D1）。页面只调这一个函数，不感知回答在哪里生成：
 *   - 两种模式下都用同一个接地引擎（js/ask-ai-adapter.js），
 *     输入的 data 全部来自本模块（api 模式 = API 数据，json 模式 = JSON fallback）；
 *   - 主题兜底检索借用 searchAll()，与 C2 共用同一条检索通路，不另建一套。
 * @param {string} question 用户问题
 * @param {Object} data 已通过本模块加载的平台数据
 * @param {Function} [searchFn] 主题兜底检索（页面传入 searchAll 的偏应用形式）
 * @returns {Promise<{matched:boolean,intent:string,text:string,items:Array,sources:Array}>}
 */
export async function askPlatform(question, data, searchFn) {
  const { answerFromPlatform } = await import("./ask-ai-adapter.js");
  return answerFromPlatform(question, data, searchFn);
}

/**
 * 过滤出已发布记录（前台只显示 status === "published"）。
 * @param {Array} records 任意核心对象的记录数组
 * @returns {Array}
 */
export function getPublished(records) {
  return records.filter(r => r.status === "published");
}
