/* ============================================================
   config.js — 全站公共配置（唯一的路径 / 常量来源）
   其他 JS 文件从这里读取，禁止在别处重复写死 "./data/"
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
