/* ============================================================
   data-loader.js — 统一 JSON 数据加载入口
   所有页面通过本模块读取 data/ 下的运行时数据集，
   不允许各页面自行 fetch。

   错误处理约定：
   - 网络失败 / 文件不存在 / JSON 解析失败 → 抛出 DataLoadError
   - 同时用 console.error 记录技术细节
   - 调用方（页面脚本）负责把错误展示为用户可理解的状态
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { withBase } from "./utils.js";

/** 自定义错误类型：携带发生原因和出错的文件地址，便于排查 */
export class DataLoadError extends Error {
  constructor(reason, url, detail) {
    super(`Failed to load ${url} (${reason})`);
    this.name = "DataLoadError";
    this.reason = reason;   // "network" | "http" | "parse"
    this.url = url;
    this.detail = detail;
  }
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

/* ---------- 六类核心对象 ---------- */

export function loadCountries()     { return fetchJson(APP_CONFIG.dataFiles.countries); }
export function loadLibraries()     { return fetchJson(APP_CONFIG.dataFiles.libraries); }
export function loadAwards()        { return fetchJson(APP_CONFIG.dataFiles.awards); }
export function loadAwardResults()  { return fetchJson(APP_CONFIG.dataFiles.awardResults); }
export function loadCases()         { return fetchJson(APP_CONFIG.dataFiles.cases); }
export function loadSources()       { return fetchJson(APP_CONFIG.dataFiles.sources); }

/* ---------- 五类 Source 关联表 ---------- */

export function loadCountrySource()    { return fetchJson(APP_CONFIG.dataFiles.countrySource); }
export function loadLibrarySource()   { return fetchJson(APP_CONFIG.dataFiles.librarySource); }
export function loadAwardSource()     { return fetchJson(APP_CONFIG.dataFiles.awardSource); }
export function loadAwardResultSource() { return fetchJson(APP_CONFIG.dataFiles.awardResultSource); }
export function loadCaseSource()      { return fetchJson(APP_CONFIG.dataFiles.caseSource); }

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
 * 过滤出已发布记录（前台只显示 status === "published"）。
 * @param {Array} records 任意核心对象的记录数组
 * @returns {Array}
 */
export function getPublished(records) {
  return records.filter(r => r.status === "published");
}
