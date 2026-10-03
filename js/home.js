/* ============================================================
   home.js — 首页控制器
   流程：显示 Loading → 通过 data-loader 读取 JSON →
        渲染统计 / Featured / 搜索 → 隐藏 Loading
   失败：显示 Error 状态 + Try Again
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { loadAllCoreData, getPublished } from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  libraryCard,
  awardCard,
  caseCard,
  loadingState,
  errorState
} from "./components.js";
import { withBase, getVisibleCases } from "./utils.js";

/* 页面主内容容器（index.html 中 <main id="page-main">） */
let mainEl = null;
let pageData = null; // 缓存已加载的数据，供搜索使用

/* ---------- 初始化 ---------- */

async function init() {
  mainEl = document.getElementById("page-main");
  mainEl.innerHTML = loadingState();

  try {
    pageData = await loadAllCoreData();
    renderPage(pageData);
  } catch (err) {
    showError(err);
  }
}

/* ---------- 失败状态 ---------- */

function showError(err) {
  mainEl.innerHTML = errorState();
  const retryBtn = document.getElementById("btn-retry");
  retryBtn.addEventListener("click", init);
}

/* ---------- 页面渲染 ---------- */

function renderPage(data) {
  const published = {
    countries: getPublished(data.countries),
    libraries: getPublished(data.libraries),
    awards: getPublished(data.awards),
    // Final QA 统一可见性规则：案例 published 且所属图书馆 published
    cases: getVisibleCases(data.cases, data.libraries)
  };

  mainEl.innerHTML = `
    <!-- World Map Preview（正式交互地图见 pages/world-map.html） -->
    <section class="section" aria-labelledby="map-heading">
      <div class="section-head">
        <h2 id="map-heading">World Map</h2>
        <a class="more" href="${withBase(APP_CONFIG.pages.worldMap)}">Explore libraries around the world →</a>
      </div>
      <div class="map-wrap map-placeholder">
        <svg viewBox="0 0 1120 380" width="100%" height="380" role="img"
             aria-label="Simplified world map preview — open the World Map page for the interactive version">
          <rect width="1120" height="380" fill="#F4F7FA"></rect>
          <g class="country-shape">
            <path d="M60 190 q40 -70 110 -66 q60 4 84 44 q-24 56 -96 60 q-88 6 -98 -38 z"></path>
            <path d="M280 160 q60 -66 150 -52 q80 14 96 62 q-40 60 -150 62 q-100 2 -96 -72 z"></path>
            <path d="M500 120 q90 -56 200 -30 q96 24 112 84 q-60 74 -190 66 q-118 -8 -122 -120 z"></path>
            <path d="M840 130 q70 -18 122 26 q40 40 8 88 q-66 40 -126 2 q-48 -38 -4 -116 z"></path>
            <path d="M330 300 q56 -26 112 -4 q36 16 18 54 q-56 32 -114 8 q-32 -24 -16 -58 z"></path>
            <path d="M700 290 q50 -20 96 0 q30 16 8 46 q-52 26 -100 4 q-24 -20 -4 -50 z"></path>
          </g>
          <g class="marker" aria-hidden="true">
            <circle cx="470" cy="205" r="8"></circle><circle cx="760" cy="185" r="8"></circle>
            <circle cx="900" cy="215" r="8"></circle><circle cx="620" cy="250" r="8"></circle>
            <circle cx="360" cy="255" r="8"></circle>
          </g>
        </svg>
        <div class="map-note">Map preview — the interactive local SVG map is available on the World Map page</div>
        <div class="map-actions">
          <a class="btn btn-secondary" href="${withBase(APP_CONFIG.pages.worldMap)}">Explore World Map</a>
        </div>
      </div>
    </section>

    <!-- Statistics Overview（数字全部由 JSON 动态计算，仅统计 published） -->
    <section class="section" aria-labelledby="stats-heading">
      <div class="section-head">
        <h2 id="stats-heading">Statistics Overview</h2>
        <span class="caption">Calculated from the runtime dataset · published records only</span>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num">${published.countries.length}</div><div class="stat-label">Countries / Regions</div></div>
        <div class="stat-box"><div class="stat-num">${published.libraries.length}</div><div class="stat-label">Libraries</div></div>
        <div class="stat-box"><div class="stat-num">${published.awards.length}</div><div class="stat-label">Awards</div></div>
        <div class="stat-box"><div class="stat-num">${published.cases.length}</div><div class="stat-label">Cases / Projects</div></div>
      </div>
    </section>

    <!-- Featured Libraries（取 published 前 ${APP_CONFIG.featured.libraries} 条，真实 JSON 数据） -->
    <section class="section" aria-labelledby="lib-heading">
      <div class="section-head">
        <h2 id="lib-heading">Featured Libraries</h2>
        <a class="more" href="${withBase(APP_CONFIG.pages.libraries)}">View all libraries →</a>
      </div>
      <div class="card-grid" id="featured-libraries">
        ${published.libraries.slice(0, APP_CONFIG.featured.libraries).map(lib => libraryCard(lib, data.countries)).join("")}
      </div>
    </section>

    <!-- Featured Awards -->
    <section class="section" aria-labelledby="award-heading">
      <div class="section-head">
        <h2 id="award-heading">Featured Awards</h2>
        <a class="more" href="${withBase(APP_CONFIG.pages.awards)}">View all awards →</a>
      </div>
      <div class="card-grid" id="featured-awards">
        ${published.awards.slice(0, APP_CONFIG.featured.awards).map(a => awardCard(a)).join("")}
      </div>
    </section>

    <!-- Featured Cases -->
    <section class="section" aria-labelledby="case-heading">
      <div class="section-head">
        <h2 id="case-heading">Featured Cases</h2>
        <a class="more" href="${withBase(APP_CONFIG.pages.cases)}">View all cases →</a>
      </div>
      <div class="card-grid" id="featured-cases">
        ${published.cases.slice(0, APP_CONFIG.featured.cases).map(c => caseCard(c, data.libraries, data.countries)).join("")}
      </div>
    </section>

    <!-- 更多入口（12 类页面闭环） -->
    <section class="section" aria-labelledby="explore-heading">
      <div class="section-head">
        <h2 id="explore-heading">Explore the Platform</h2>
        <span class="caption">Every module of the prototype is reachable from here</span>
      </div>
      <div class="entry-grid">
        <a class="entry-card" href="${withBase(APP_CONFIG.pages.worldMap)}">
          <span class="entry-title">World Map</span>
          <span class="entry-sub">Browse countries and libraries geographically</span>
        </a>
        <a class="entry-card" href="${withBase(APP_CONFIG.pages.libraries)}">
          <span class="entry-title">Libraries</span>
          <span class="entry-sub">Search and filter every published library</span>
        </a>
        <a class="entry-card" href="${withBase(APP_CONFIG.pages.awards)}">
          <span class="entry-title">Global Awards</span>
          <span class="entry-sub">International awards and their award results</span>
        </a>
        <a class="entry-card" href="${withBase(APP_CONFIG.pages.cases)}">
          <span class="entry-title">Cases &amp; Projects</span>
          <span class="entry-sub">Innovative practice linked to libraries</span>
        </a>
        <a class="entry-card" href="${withBase(APP_CONFIG.pages.search)}">
          <span class="entry-title">Global Search</span>
          <span class="entry-sub">Countries, libraries, awards and cases</span>
        </a>
        <a class="entry-card" href="${withBase(APP_CONFIG.pages.about)}">
          <span class="entry-title">About</span>
          <span class="entry-sub">Purpose, data model and data quality</span>
        </a>
      </div>
    </section>

    <!-- Ask AI 入口（D1：答案由平台数据接地生成） -->
    <section class="section" aria-labelledby="askai-heading">
      <div class="card ask-ai-entry">
        <div>
          <h2 id="askai-heading" style="font-size:20px">Ask AI<span class="ai-badge">Data-grounded</span></h2>
          <p class="muted small" style="margin-top:6px">Explore the knowledge base using natural language.</p>
        </div>
        <a class="btn btn-primary" href="${withBase(APP_CONFIG.pages.askAi)}">Try Ask AI</a>
      </div>
    </section>

    <!-- 原型说明 -->
    <section class="section" aria-labelledby="scope-heading">
      <div class="card">
        <h2 id="scope-heading" style="font-size:20px">Prototype Scope</h2>
        <p class="muted small" style="margin-top:8px">
          This website is a front-end prototype: it reads a validated static JSON dataset, has no backend,
          no database connection and no real AI service. Administrative editing is not enabled.
          See <a href="${withBase(APP_CONFIG.pages.about)}">About</a> for the full scope and data principles.
        </p>
      </div>
    </section>
  `;

  setupSearch();
}

/* ---------- 全站统一搜索 ----------
   首页搜索与 Header 搜索使用同一套逻辑与同一个结果页（search.html?q=…），
   不再有页面级差异，搜索结果 URL 可分享。 */

function setupSearch() {
  const form = document.getElementById("global-search-form");
  const input = document.getElementById("global-search-input");
  if (!form || !input) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      input.focus();
      return;
    }
    window.location.href = `${withBase(APP_CONFIG.pages.search)}?q=${encodeURIComponent(query)}`;
  });
}

/* ---------- 启动 ---------- */

renderHeader("home");
renderFooter();
init();
