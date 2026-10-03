/* ============================================================
   components.js — 全站公共组件（Header / Footer / 卡片 / 状态）
   页面 HTML 中放置占位元素，由本模块统一渲染，
   保证导航和 Footer 在所有页面一致。
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { withBase, escapeHtml, truncate } from "./utils.js";
import {
  LIBRARY_TYPE_LABELS,
  TOPIC_LABELS,
  FREQUENCY_LABELS,
  RELATION_TYPE_LABELS,
  getCountryName,
  getLibraryById
} from "./utils.js";

/* ---------- 主导航（继承第六阶段冻结的 7 项） ----------
   STEP 3 起 7 项全部指向真实页面（config.pages 为唯一来源）。 */
const NAV_ITEMS = [
  { key: "home",      label: "Home",      href: "index.html" },
  { key: "world-map", label: "World Map", href: APP_CONFIG.pages.worldMap },
  { key: "libraries", label: "Libraries", href: APP_CONFIG.pages.libraries },
  { key: "awards",    label: "Awards",    href: APP_CONFIG.pages.awards },
  { key: "cases",     label: "Cases",     href: APP_CONFIG.pages.cases },
  { key: "ask-ai",    label: "Ask AI",    href: APP_CONFIG.pages.askAi },
  { key: "about",     label: "About",     href: APP_CONFIG.pages.about }
];

/**
 * 渲染全站 Header（注入到页面中的 <header id="site-header">）。
 * 全站 Header 内含统一的 Global Search 表单：提交后进入 search.html?q=…，
 * 所有页面使用同一套搜索逻辑（不存在页面级差异）。
 * @param {string} activeKey 当前高亮的导航项 key（如 "home"）
 */
export function renderHeader(activeKey) {
  const header = document.getElementById("site-header");
  if (!header) return;

  const navLinks = NAV_ITEMS.map(item => {
    const activeClass = item.key === activeKey ? " active" : "";
    const current = item.key === activeKey ? ' aria-current="page"' : "";
    return `<a href="${withBase(item.href)}" class="${activeClass.trim()}"${current}>${item.label}</a>`;
  }).join("\n          ");

  header.className = "site-header";
  header.innerHTML = `
  <div class="container header-inner">
    <a class="brand" href="${withBase("index.html")}">
      <span class="brand-mark" aria-hidden="true">GL</span>
      <span class="brand-text">${escapeHtml(APP_CONFIG.appNameZh)}<span class="en">${escapeHtml(APP_CONFIG.appName)}</span></span>
    </a>
    <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="main-nav">Menu</button>
    <nav class="main-nav" id="main-nav" aria-label="Main navigation">
          ${navLinks}
    </nav>
    <form class="header-search" id="header-search-form" role="search" action="${withBase(APP_CONFIG.pages.search)}" method="get">
      <label class="visually-hidden" for="header-search-input">Search the platform</label>
      <input class="search-box" type="search" id="header-search-input" name="q" placeholder="Search…" autocomplete="off">
      <button class="btn btn-primary btn-sm" type="submit">Search</button>
    </form>
  </div>`;

  // 移动端：点击按钮展开 / 收起导航
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.textContent = isOpen ? "Close" : "Menu";
    });
  }
}

/**
 * 渲染全站 Footer（注入到页面中的 <footer id="site-footer">）。
 * 不显示未经确认的联系方式。
 */
export function renderFooter() {
  const footer = document.getElementById("site-footer");
  if (!footer) return;

  footer.className = "site-footer";
  footer.innerHTML = `
  <div class="container">
    <div class="footer-cols">
      <div>
        <b style="color:#fff">${escapeHtml(APP_CONFIG.appName)}</b>
        <p class="small" style="margin-top:8px">A structured, linked and source-traceable knowledge platform for the global library community.</p>
      </div>
      <div>
        <b style="color:#fff">Platform</b>
        <p class="small" style="margin-top:8px">
          <a href="${withBase(APP_CONFIG.pages.about)}">About</a><br>
          <a href="${withBase(APP_CONFIG.pages.worldMap)}">World Map</a><br>
          <a href="${withBase(APP_CONFIG.pages.libraries)}">Libraries</a>
        </p>
      </div>
      <div>
        <b style="color:#fff">Data</b>
        <p class="small" style="margin-top:8px">
          <a href="${withBase(APP_CONFIG.pages.awards)}">Awards</a><br>
          <a href="${withBase(APP_CONFIG.pages.cases)}">Cases</a><br>
          <a href="${withBase(APP_CONFIG.pages.about)}#data-sources">Data Sources</a>
        </p>
      </div>
      <div>
        <b style="color:#fff">Prototype</b>
        <p class="small" style="margin-top:8px">
          <a href="${withBase(APP_CONFIG.pages.askAi)}">Ask AI</a><br>
          <a href="${withBase(APP_CONFIG.pages.admin)}">Admin Dashboard (Prototype)</a><br>
          <a href="${withBase(APP_CONFIG.pages.search)}">Global Search</a>
        </p>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 ${escapeHtml(APP_CONFIG.appNameZh)} · Prototype (Stage 8)</span>
      <span>Runtime dataset: Design Baseline V0.2 · Pilot-Validated</span>
    </div>
  </div>`;
}

/* ---------- 通用卡片 ---------- */

/**
 * 图书馆卡片（首页 Featured / Libraries 列表 / Country Profile 复用）。
 * @param {Object} lib libraries.json 中的一条记录
 * @param {Array} countries 全部国家记录（用于解析 country_id）
 */
export function libraryCard(lib, countries) {
  const countryName = getCountryName(countries, lib.country_id);
  const typeLabel = LIBRARY_TYPE_LABELS[lib.library_type] || lib.library_type;
  const place = [countryName, lib.city].filter(Boolean).join(" · ");
  const profileHref = `${withBase(APP_CONFIG.pages.libraryProfile)}?id=${lib.library_id}`;
  return `
  <article class="card lib-card">
    <div class="card-top">
      <h3 class="card-title">${escapeHtml(lib.name)}</h3>
      <span class="tag tag-type">${escapeHtml(typeLabel)}</span>
    </div>
    <div class="card-sub">${escapeHtml(place)}</div>
    ${lib.name_en ? `<div class="caption">${escapeHtml(lib.name_en)}</div>` : ""}
    <p class="card-desc">${escapeHtml(truncate(lib.description, 120))}</p>
    <a class="card-link" href="${profileHref}">View Profile →</a>
  </article>`;
}

/**
 * 奖项卡片（Featured Awards / Awards 列表 / Award Profile Related 复用）。
 * @param {Object} award awards.json 中的一条记录
 */
export function awardCard(award) {
  const freqLabel = FREQUENCY_LABELS[award.frequency] || "Annual";
  const founded = award.founded_year ? `Founded: ${award.founded_year}` : "Founded: to be confirmed";
  return `
  <article class="card lib-card">
    <div class="card-top">
      <h3 class="card-title">${escapeHtml(truncate(award.award_name, 60))}</h3>
      <span class="tag tag-result">${escapeHtml(freqLabel)}</span>
    </div>
    <div class="card-sub">Organizer: ${escapeHtml(truncate(award.organizer || "—", 70))}</div>
    <div class="caption">${escapeHtml(founded)}</div>
    <p class="card-desc">${escapeHtml(truncate(award.description, 120))}</p>
    <a class="card-link" href="${withBase(APP_CONFIG.pages.awardProfile)}?id=${award.award_id}">View Award →</a>
  </article>`;
}

/**
 * 案例卡片（Featured Cases / Cases 列表 / Library Profile / Country Profile 复用）。
 * 所属图书馆经 library_id 解析，国家经 Library → Country 解析；案例 JSON 内不复制这些字段。
 * @param {Object} item cases.json 中的一条记录
 * @param {Array} libraries 全部图书馆记录（解析 library_id）
 * @param {Array} [countries] 全部国家记录（可选：提供时在卡片上显示国家）
 */
export function caseCard(item, libraries, countries) {
  const lib = getLibraryById(libraries, item.library_id);
  const topicLabel = TOPIC_LABELS[item.topic] || item.topic;
  const countryName = (lib && countries) ? getCountryName(countries, lib.country_id) : "";
  const sub = [lib ? lib.name : "Unknown Library", countryName, item.year].filter(Boolean).join(" · ");
  return `
  <article class="card lib-card">
    <div class="card-top">
      <h3 class="card-title">${escapeHtml(truncate(item.title, 60))}</h3>
      <span class="tag tag-topic">${escapeHtml(topicLabel)}</span>
    </div>
    <div class="card-sub">${escapeHtml(sub)}</div>
    <p class="card-desc">${escapeHtml(truncate(item.description, 120))}</p>
    <a class="card-link" href="${withBase(APP_CONFIG.pages.caseDetail)}?id=${item.case_id}">View Case →</a>
  </article>`;
}

/**
 * 国家卡片（搜索结果 / 国家列表复用）。统计数字由 library_id 实时计算。
 * @param {Object} country countries.json 中的一条记录
 * @param {Array} libraries 全部图书馆记录
 */
export function countryCard(country, libraries) {
  const published = libraries.filter(l => l.status === "published" && l.country_id === country.country_id);
  const href = `${withBase(APP_CONFIG.pages.countryProfile)}?id=${country.country_id}`;
  return `
  <article class="card lib-card">
    <div class="card-top">
      <h3 class="card-title">${escapeHtml(country.country_name)}</h3>
      <span class="tag tag-type">${escapeHtml(country.region || "—")}</span>
    </div>
    <div class="card-sub">ISO Code: ${escapeHtml(country.country_code || "—")} · ${published.length} libraries</div>
    <p class="card-desc">${escapeHtml(truncate(country.description, 120))}</p>
    <a class="card-link" href="${href}">View Country →</a>
  </article>`;
}

/* ---------- 全站搜索：结果条目 ---------- */

/**
 * 单条搜索结果（search.html 与首页搜索结果共用同一套渲染）。
 * @param {{type: string, id: number, title: string, sub: string}} result
 */
export function searchResultItem(result) {
  // Source 没有站内详情页，其详情页就是数据中记录的原始出处 URL（真实数据）
  const external = result.type === "Source" && result.url;
  const attrs = external ? ` target="_blank" rel="noopener noreferrer"` : "";
  return `
  <a class="result-item" href="${searchResultHref(result)}"${attrs}>
    <span class="tag ${searchResultTagClass(result.type)}">${escapeHtml(result.type)}</span>
    <span class="result-info">
      <span class="result-title">${escapeHtml(truncate(result.title, 90))}</span>
      <span class="result-sub">${escapeHtml(truncate(result.sub || "", 120))}</span>
    </span>
    <span class="caption" aria-hidden="true">→</span>
  </a>`;
}

/** 搜索结果类型 → 标签配色类 */
export function searchResultTagClass(type) {
  switch (type) {
    case "Country": return "tag-country";
    case "Award":   return "tag-result";
    case "Case":    return "tag-topic";
    default:        return "tag-type"; // Library
  }
}

/** 搜索结果 → 对应详情页链接 */
export function searchResultHref(result) {
  const pages = APP_CONFIG.pages;
  switch (result.type) {
    case "Country": return `${withBase(pages.countryProfile)}?id=${result.id}`;
    case "Library": return `${withBase(pages.libraryProfile)}?id=${result.id}`;
    case "Award":   return `${withBase(pages.awardProfile)}?id=${result.id}`;
    case "Case":    return `${withBase(pages.caseDetail)}?id=${result.id}`;
    case "Source":  return result.url || withBase(pages.home);
    default:        return withBase(pages.home);
  }
}

/* ---------- 状态组件 ---------- */

/** 加载中状态 */
export function loadingState() {
  return `
  <div class="state-box" role="status">
    <span class="icon" aria-hidden="true">⏳</span>
    <div class="state-title">Loading platform data...</div>
    <p class="state-text">Reading the runtime dataset, please wait.</p>
  </div>`;
}

/** 加载失败状态（含重试按钮，点击后由页面重新初始化） */
export function errorState() {
  return `
  <div class="state-box" role="alert">
    <span class="icon" aria-hidden="true">⚠️</span>
    <div class="state-title">Unable to load platform data.</div>
    <p class="state-text">The runtime dataset could not be loaded. Please check that the local server is running.</p>
    <div class="state-actions"><button class="btn btn-primary" id="btn-retry">Try Again</button></div>
  </div>`;
}

/** 空状态（如搜索无结果） */
export function emptyState(message) {
  return `
  <div class="state-box">
    <span class="icon" aria-hidden="true">🔍</span>
    <div class="state-title">No results found</div>
    <p class="state-text">${escapeHtml(message)}</p>
  </div>`;
}

/* ---------- Breadcrumb（面包屑导航） ---------- */

/**
 * 面包屑导航。最后一项为当前页（不可点击，带 aria-current="page"）。
 * @param {Array<{label: string, href?: string}>} items
 *   href 省略时该项渲染为当前页。
 * @returns {string} HTML（放入 <nav class="breadcrumb"> 的位置由调用方决定）
 */
export function breadcrumb(items) {
  const parts = items.map((item, index) => {
    const isLast = index === items.length - 1;
    if (isLast || !item.href) {
      return `<span aria-current="${isLast ? "page" : "false"}">${escapeHtml(item.label)}</span>`;
    }
    return `<a href="${withBase(item.href)}">${escapeHtml(item.label)}</a>`;
  });
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${parts.join('<span class="sep" aria-hidden="true">›</span>')}</nav>`;
}

/* ---------- Source（来源）列表项 ---------- */

/**
 * 单条来源记录（Library Profile / Country Profile 复用）。
 * 外部链接使用真实 source.url，新窗口打开并加安全 rel。
 * @param {{source: Object, relationType: string}} entry 来源 + 关联类型
 */
export function sourceItem(entry) {
  const { source, relationType } = entry;
  const relationTag = relationType
    ? `<span class="tag tag-country">${escapeHtml(RELATION_TYPE_LABELS[relationType] || relationType)}</span>`
    : "";

  const metaParts = [
    source.publisher ? `Publisher: ${source.publisher}` : null,
    source.publication_date ? `Published: ${source.publication_date}` : null,
    `Accessed: ${source.accessed_date || "—"}`
  ].filter(Boolean);

  // 无 URL 的来源（如离线汇编文档）：不渲染空链接，也不编造 URL（D1.4）
  const link = source.url
    ? `<a class="small" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">Visit Source →</a>`
    : `<span class="small muted">No public URL — offline document held in the dataset</span>`;

  return `
  <div class="source-item">
    <div class="s-name">${escapeHtml(source.source_name)} ${relationTag}</div>
    <div class="s-meta">${escapeHtml(source.title ? `“${source.title}”` : "")} · ${escapeHtml(metaParts.join(" · "))}</div>
    ${link}
  </div>`;
}

/* ---------- Pagination（分页导航） ---------- */

/**
 * 分页导航（上一页 / 页码 / 下一页）。
 * @param {number} currentPage 当前页（从 1 开始）
 * @param {number} totalPages 总页数
 * @param {(page: number) => string} buildPageHref 生成第 N 页链接的回调
 */
export function paginationNav(currentPage, totalPages, buildPageHref) {
  if (totalPages <= 1) return ""; // 只有一页时不显示分页

  const pageLink = (page, label, opts = {}) => {
    const isCurrent = page === currentPage;
    // Final QA：禁用状态渲染为 <span>（不可点击），避免“上一页/下一页”指向无效页码
    if (opts.disabled) {
      return `<span class="page-btn disabled" aria-disabled="true">${label}</span>`;
    }
    const cls = isCurrent ? "page-btn current" : "page-btn";
    const current = isCurrent ? ' aria-current="page"' : "";
    return `<a class="${cls}" href="${buildPageHref(page)}"${current}>${label}</a>`;
  };

  const buttons = [];
  buttons.push(pageLink(currentPage - 1, "‹ Prev", { disabled: currentPage <= 1 }));
  for (let p = 1; p <= totalPages; p++) {
    buttons.push(pageLink(p, String(p)));
  }
  buttons.push(pageLink(currentPage + 1, "Next ›", { disabled: currentPage >= totalPages }));

  return `<nav class="pagination" aria-label="Pagination">${buttons.join("\n")}</nav>`;
}

/* ---------- Not Found（详情页找不到记录） ---------- */

/**
 * 详情页 Not Found 状态（URL id 缺失 / 格式错误 / 记录不存在或未发布）。
 * @param {string} entityLabel 如 "Library" / "Country"
 * @param {string} backHref 返回链接（已换算前缀的相对路径）
 */
export function notFoundState(entityLabel, backHref) {
  return `
  <div class="state-box" role="alert">
    <span class="icon" aria-hidden="true">🔎</span>
    <div class="state-title">${escapeHtml(entityLabel)} Not Found</div>
    <p class="state-text">The record does not exist or is not published on this platform.</p>
    <div class="state-actions"><a class="btn btn-primary" href="${backHref}">Back to Libraries</a></div>
  </div>`;
}
