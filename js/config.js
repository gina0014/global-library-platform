/* ============================================================
   config.js — 全站公共配置（唯一的路径 / 常量 / 数据源来源）
   其他 JS 文件从这里读取，禁止在别处重复写死 "./data/"
   数据源相关的唯一真源见文件末尾 DATASOURCE 段。
   ============================================================ */

export const APP_CONFIG = {
  /* 平台基本信息 */
  appName: "Global Library Knowledge & Information Platform",
  appNameZh: "全球图书馆知识与信息服务平台",
  defaultLanguage: "en",

  /* JSON 运行时数据集位置（相对网站根目录 index.html；pages/ 下使用见 utils.withBase） */
  DATA_PATH: "./data/",

  /* 列表页分页数量（Libraries / Awards / Cases 列表使用，第六阶段设计为每页 9 条） */
  pageSize: 9,

  /* 首页 Featured 区块显示条数 */
  featured: {
    libraries: 4,
    awards: 3,
    cases: 3
  },

  /* 全站搜索结果最多显示条数 */
  searchResultLimit: 20,

  /* 页面路径（相对网站根目录；pages/ 内页面会自动加 "../" 前缀，见 utils.withBase）
     STEP 3 起 12 类页面（P-01 ~ P-12）全部为真实页面。 */
  pages: {
    home: "index.html",
    comingSoon: "pages/coming-soon.html",   // 通用兜底页（已无导航指向）
    worldMap: "pages/world-map.html",
    libraries: "pages/libraries.html",
    libraryProfile: "pages/library.html",   // ?id={library_id}
    countryProfile: "pages/country.html",   // ?id={country_id}
    awards: "pages/awards.html",
    awardProfile: "pages/award.html",       // ?id={award_id}
    cases: "pages/cases.html",
    caseDetail: "pages/case.html",          // ?id={case_id}
    search: "pages/search.html",            // ?q={keyword}
    askAi: "pages/ask-ai.html",
    about: "pages/about.html",
    admin: "pages/admin.html"
  },

  /* 运行时数据集文件名（V0.2 正式字段，来自第七阶段验证通过的 JSON） */
  dataFiles: {
    countries: "countries.json",
    libraries: "libraries.json",
    awards: "awards.json",
    awardResults: "award-results.json",
    cases: "cases.json",
    sources: "sources.json",
    countrySource: "country-source.json",
    librarySource: "library-source.json",
    awardSource: "award-source.json",
    awardResultSource: "award-result-source.json",
    caseSource: "case-source.json"
  }
};

/* ============================================================
   DATASOURCE — 运行时数据源配置（PHASE 1）

   背景：改造前 data-loader.js 里写死了数据源模式与本地 Directus 地址。
   后果：GitHub Pages 上的公开构建会去请求访问者本机的 8055 端口，
         所有数据页落到错误态 —— 硬编码的 localhost 在生产环境永远是错的。

   改造原则（不删除任何一侧，只做「按部署目标解析」）：
     · Dynamic MVP（api 模式 / PostgreSQL / Directus）代码完整保留；
     · JSON fallback（data/*.json）完整保留；
     · 到底用哪一侧，由**运行时按部署目标**决定，不再是编译期常量。

   解析顺序：
     1. URL 覆写  ?datasource=api|json（仅 QA / 验收脚本使用，不持久化）
     2. 部署目标表 DATASOURCE_TARGETS 按 hostname + protocol 匹配
     3. 都不匹配 → 默认策略 DEFAULT_DATASOURCE（= JSON 静态演示）

   安全护栏：HTTPS 页面禁止请求 http:// 接口，命中即降级为 JSON
            并 console.warn，从根上排除 mixed content。

   维护方式：
     · PHASE 2 上线生产栈时，只需在 DATASOURCE_TARGETS 里**追加**一条
       { id:"production", hostnames:["<正式域名>"], apiBaseUrl:"https://<api 域名>" }；
     · 未经人工确认前，表里不允许出现任何真实公域名（CI 有静态校验）。
   ============================================================ */

/** 本地动态开发环境：随 Docker Compose 起的 Directus */
const LOCAL_DEV_TARGET = {
  id: "local-dev",
  label: "Local Dynamic Development (Docker Compose)",
  mode: "api",
  apiBaseUrl: "http://localhost:8055",
  // file:// 直接双击打开不属于任何已登记目标，落到 json 静态演示：
  // 这样离线打开仓库也能看到完整站点，不会因为没有后端而全页报错。
  hostnames: ["localhost", "127.0.0.1"],
  protocols: ["http:", "https:"]
};

/**
 * 部署目标表。**<｜hy_place▁holder▁no▁813｜>的稳定性远比灵活性重要**，所以这里是一张显式白名单，
 * 而不是"任意 host 都能配 API"。
 * PHASE 2 待托管方案确定后在此追加 production 条目（需人工决策，不得自动填写）。
 */
export const DATASOURCE_TARGETS = [LOCAL_DEV_TARGET];

/**
 * 默认策略：任何**未登记**的来源都退化为纯静态 JSON 演示。
 * 这一条是 Public Demo 可用性的底线 —— 未知来源绝不允许去猜一个 API 地址。
 * mode 必须恒为 "json"（CI 有回归校验：ci_check.py）。
 */
export const DEFAULT_DATASOURCE = {
  id: "public-static-demo",
  label: "Public Static Demo (JSON baseline)",
  mode: "json",
  apiBaseUrl: null
};

/** QA / 验收脚本使用的显式覆写参数名（不持久化到 localStorage，刷新即失效） */
const OVERRIDE_PARAM = "datasource";

/** 显式强制 api 但当前来源没有登记目标时，唯一允许使用的兜底地址（本地开发） */
const OVERRIDE_API_FALLBACK_BASE_URL = LOCAL_DEV_TARGET.apiBaseUrl;

function currentLocation() {
  // Node（CI 单元校验）里没有 window，返回 null → 走默认策略
  if (typeof window === "undefined" || !window.location) return null;
  return window.location;
}

function readOverride(loc) {
  if (!loc) return null;
  try {
    const v = new URLSearchParams(loc.search || "").get(OVERRIDE_PARAM);
    return v === "api" || v === "json" ? v : null;
  } catch {
    return null;
  }
}

/** 按 hostname + protocol 匹配部署目标；无匹配返回 null */
export function matchTarget(loc) {
  if (!loc) return null;
  const host = String(loc.hostname || "").toLowerCase();
  return DATASOURCE_TARGETS.find(
    (t) => (t.hostnames || []).includes(host)
        && (!t.protocols || t.protocols.includes(loc.protocol))
  ) || null;
}

/**
 * 解析当前运行时应使用的数据源。返回：
 *   { id, mode: "api"|"json", apiBaseUrl: string|null, reason }
 */
export function resolveDataSource() {
  const loc = currentLocation();
  const target = matchTarget(loc);
  let id = target ? target.id : DEFAULT_DATASOURCE.id;
  let mode = target ? target.mode : DEFAULT_DATASOURCE.mode;
  let apiBaseUrl = target ? target.apiBaseUrl : DEFAULT_DATASOURCE.apiBaseUrl;
  let reason = target
    ? `matched deployment target "${target.id}"`
    : `no registered target for this origin, using default "${DEFAULT_DATASOURCE.id}"`;

  const override = readOverride(loc);
  if (override === "json") {
    mode = "json";
    apiBaseUrl = null;
    reason = `forced by ?${OVERRIDE_PARAM}=json`;
  } else if (override === "api") {
    mode = "api";
    apiBaseUrl = apiBaseUrl || OVERRIDE_API_FALLBACK_BASE_URL;
    reason = `forced by ?${OVERRIDE_PARAM}=api`;
  }

  // 安全护栏：HTTPS 页面不得请求 HTTP 接口（浏览器会以 mixed content 拦截）
  if (mode === "api" && apiBaseUrl && loc && loc.protocol === "https:"
      && apiBaseUrl.startsWith("http://")) {
    if (typeof console !== "undefined") {
      console.warn(
        `[config] Refusing insecure API endpoint on a secure page (${apiBaseUrl}) — `
        + "falling back to JSON mode to avoid mixed content."
      );
    }
    return {
      id: DEFAULT_DATASOURCE.id,
      mode: "json",
      apiBaseUrl: null,
      reason: "blocked: insecure http API over an https page"
    };
  }

  return { id, mode, apiBaseUrl, reason };
}

/** 模块级单例：页面加载时解析一次，之后不再变化 */
export const DATASOURCE = resolveDataSource();

if (typeof window !== "undefined") {
  // 只读诊断快照：便于线上排障与自动化验收读取当前数据源。
  // 只含 id / mode / 后端地址 / 判定原因，**不含任何凭据**。
  window.__GLP_DATASOURCE__ = DATASOURCE;
}
