/* ============================================================
   case.js — P-09 Case Detail 控制器
   流程：Loading → URL ?id= → 校验 published → 解析数据链 → 渲染
   数据链：
     Case_Project → Library（library_id）
     Library → Country（country_id）
     Case_Project ↔ Source（case-source 关联表，复用统一 Source 组件）
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { loadAllCoreData, loadCaseSource } from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  sourceItem,
  caseCard,
  loadingState,
  errorState,
  breadcrumb
} from "./components.js";
import {
  escapeHtml,
  truncate,
  withBase,
  parseIdParam,
  getCountryById,
  getSourcesForEntity,
  getPublishedCasesForLibrary,
  isCaseVisible,
  TOPIC_LABELS,
  LIBRARY_TYPE_LABELS
} from "./utils.js";

let mainEl = null;

async function init() {
  mainEl = document.getElementById("page-main");
  mainEl.innerHTML = loadingState();

  const caseId = parseIdParam("id");
  if (caseId === null) {
    showNotFound();
    return;
  }

  try {
    const data = await loadAllCoreData();
    const caseSource = await loadCaseSource();

    const item = data.cases.find(c => c.case_id === caseId);
    // 前台只读 published；pending / draft 记录按“不存在”处理。
    // Final QA 统一规则：案例所属图书馆也必须是 published，
    // 否则会显示未发布图书馆的名称并产生指向 Not Found 的死链。
    if (!item || !isCaseVisible(item, data.libraries)) {
      showNotFound();
      return;
    }

    // Case → Library → Country
    const library = data.libraries.find(l => l.library_id === item.library_id) || null;
    const country = library ? getCountryById(data.countries, library.country_id) : null;

    // 同一图书馆的其他案例（Related）
    const relatedCases = library
      ? getPublishedCasesForLibrary(data.cases, library.library_id).filter(c => c.case_id !== caseId)
      : [];

    // Case ↔ Source
    const sources = getSourcesForEntity(caseSource, data.sources, caseId, "case_id");

    renderPage(item, { library, country, relatedCases, sources }, data);
  } catch (err) {
    mainEl.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

function showNotFound() {
  document.getElementById("breadcrumb").innerHTML = breadcrumb([
    { label: "Home", href: "index.html" },
    { label: "Cases", href: APP_CONFIG.pages.cases },
    { label: "Case Not Found" }
  ]);
  mainEl.innerHTML = `
  <div class="state-box" role="alert">
    <span class="icon" aria-hidden="true">🔎</span>
    <div class="state-title">Case Not Found</div>
    <p class="state-text">The record does not exist or is not published on this platform.</p>
    <div class="state-actions"><a class="btn btn-primary" href="${withBase(APP_CONFIG.pages.cases)}">Back to Cases</a></div>
  </div>`;
}

/* ---------- 页面渲染 ---------- */

function renderPage(item, ctx, data) {
  const { library, country, relatedCases, sources } = ctx;

  document.getElementById("breadcrumb").innerHTML = breadcrumb([
    { label: "Home", href: "index.html" },
    { label: "Cases", href: APP_CONFIG.pages.cases },
    { label: truncate(item.title, 40) }
  ]);

  document.title = `${item.title} — Global Library Knowledge & Information Platform`;

  const topicLabel = TOPIC_LABELS[item.topic] || item.topic || "—";
  const libHref = library ? `${withBase(APP_CONFIG.pages.libraryProfile)}?id=${library.library_id}` : null;
  const countryHref = country ? `${withBase(APP_CONFIG.pages.countryProfile)}?id=${country.country_id}` : null;

  mainEl.innerHTML = `
  <!-- Case Header -->
  <div class="detail-head">
    <div>
      <h1>${escapeHtml(item.title)}</h1>
      <p class="detail-sub">
        <span class="tag tag-topic">${escapeHtml(topicLabel)}</span>
        ${item.year ? `<span class="tag tag-type">${item.year}</span>` : ""}
        <span class="tag tag-country">Case ID: ${item.case_id}</span>
      </p>
    </div>
  </div>

  <div class="detail-layout" style="margin-top:24px">
    <div>
      <!-- Overview -->
      <section class="detail-section" id="overview">
        <h2>Overview</h2>
        ${item.description
          ? `<p class="muted" style="max-width:760px">${escapeHtml(item.description)}</p>`
          : `<p class="small muted">No description is currently available for this case.</p>`}
      </section>

      <!-- Project Information -->
      <section class="detail-section" id="information" style="margin-top:32px">
        <h2>Project Information</h2>
        <dl class="meta-list">
          <dt>Topic</dt><dd>${escapeHtml(topicLabel)}</dd>
          <dt>Year</dt><dd>${item.year ? item.year : "—"}</dd>
          ${item.project_url
            ? `<dt>Project URL</dt><dd><a href="${escapeHtml(item.project_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.project_url)}</a></dd>`
            : ""}
          <dt>Library</dt>
          <dd>${library ? `<a href="${libHref}">${escapeHtml(library.name)}</a>` : "—"}</dd>
          <dt>Country</dt>
          <dd>${country ? `<a href="${countryHref}">${escapeHtml(country.country_name)}</a>` : "—"}</dd>
        </dl>
        <p class="caption" style="margin-top:8px">Library and Country are resolved through Case → Library → Country (no duplicated fields).</p>
      </section>

      <!-- Library -->
      <section class="detail-section" id="library" style="margin-top:32px">
        <div class="section-head">
          <h2>Library</h2>
          <span class="caption">Case_Project → Library</span>
        </div>
        ${library ? libraryBlock(library, country, libHref) : `<p class="small muted">The library linked to this case is not published.</p>`}
      </section>

      <!-- Country -->
      <section class="detail-section" id="country" style="margin-top:32px">
        <div class="section-head">
          <h2>Country</h2>
          <span class="caption">Library → Country</span>
        </div>
        ${country
          ? `<dl class="meta-list">
               <dt>Country</dt><dd><a href="${countryHref}">${escapeHtml(country.country_name)}</a></dd>
               <dt>Region</dt><dd>${escapeHtml(country.region || "—")}</dd>
               <dt>ISO Code</dt><dd>${escapeHtml(country.country_code || "—")}</dd>
             </dl>`
          : `<p class="small muted">No country record is currently linked to this case.</p>`}
      </section>

      <!-- Related Cases -->
      ${relatedCases.length > 0
        ? `<section class="detail-section" style="margin-top:32px">
             <div class="section-head">
               <h2>Other Cases from this Library</h2>
               <span class="caption">Library → Case_Project</span>
             </div>
             <div class="card-grid">${relatedCases.map(c => caseCard(c, data.libraries, data.countries)).join("")}</div>
           </section>`
        : ""}

      <!-- Sources -->
      <section class="detail-section" id="sources" style="margin-top:32px">
        <div class="section-head">
          <h2>Sources</h2>
          <span class="caption">Case_Project ↔ Source (M : N)</span>
        </div>
        ${sourcesHtml(sources)}
        <div class="last-updated">Last updated: ${escapeHtml(item.last_updated || "—")}</div>
      </section>
    </div>

    <!-- 右侧栏 -->
    <aside class="detail-aside">
      <div class="card">
        <h3>At a glance</h3>
        <dl class="meta-list" style="grid-template-columns:1fr auto">
          <dt>Topic</dt><dd>${escapeHtml(topicLabel)}</dd>
          <dt>Year</dt><dd>${item.year ? item.year : "—"}</dd>
          <dt>Sources</dt><dd>${sources.length}</dd>
        </dl>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>On this page</h3>
        <ul class="link-list">
          <li><a href="#overview">Overview</a></li>
          <li><a href="#information">Project Information</a></li>
          <li><a href="#library">Library</a></li>
          <li><a href="#country">Country</a></li>
          <li><a href="#sources">Sources</a></li>
        </ul>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Browse</h3>
        <p class="small"><a href="${withBase(APP_CONFIG.pages.cases)}">All cases →</a></p>
        ${library ? `<p class="small"><a href="${libHref}">Library profile →</a></p>` : ""}
        ${country ? `<p class="small"><a href="${countryHref}">Country profile →</a></p>` : ""}
      </div>
    </aside>
  </div>`;
}

/** 图书馆信息块（含可点击的名称与国家） */
function libraryBlock(library, country, libHref) {
  return `
  <dl class="meta-list">
    <dt>Library</dt><dd><a href="${libHref}">${escapeHtml(library.name)}</a></dd>
    ${library.name_en ? `<dt>English name</dt><dd>${escapeHtml(library.name_en)}</dd>` : ""}
    <dt>Type</dt><dd>${escapeHtml(LIBRARY_TYPE_LABELS[library.library_type] || library.library_type || "—")}</dd>
    <dt>City</dt><dd>${escapeHtml(library.city || "—")}</dd>
    <dt>Country</dt><dd>${country ? escapeHtml(country.country_name) : "—"}</dd>
    ${library.website
      ? `<dt>Website</dt><dd><a href="${escapeHtml(library.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(library.website)}</a></dd>`
      : ""}
  </dl>`;
}

function sourcesHtml(sources) {
  if (sources.length === 0) {
    return `<p class="small muted">No published sources are currently available for this case.</p>`;
  }
  return `<div class="source-list">${sources.map(sourceItem).join("")}</div>`;
}

/* ---------- 启动 ---------- */

renderHeader("cases");
renderFooter();
init();
