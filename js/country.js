/* ============================================================
   country.js — P-03 Country Profile 控制器
   流程：Loading → 读取 URL ?id= → 校验 → 聚合计算 → 渲染

   聚合口径（全部动态查询，不在 Country JSON 里存冗余计数）：
     Libraries              = 该国 published 图书馆数量
     Award-winning Libraries = 该国图书馆中有 published Award_Result（且对应
                              Award 也 published）的图书馆去重数量
     Cases                  = 该国图书馆名下 published Case_Project 数量
   数据链：
     Country → Library（country_id）
     Country → Library → Award_Result → Award
     Country → Library → Case_Project
     Country ↔ Source（country-source 关联表）
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import {
  loadAllCoreData,
  loadCountrySource
} from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  libraryCard,
  caseCard,
  sourceItem,
  loadingState,
  errorState,
  breadcrumb,
  notFoundState
} from "./components.js";
import {
  escapeHtml,
  withBase,
  parseIdParam,
  getPublishedLibrariesForCountry,
  getSourcesForEntity,
  LIBRARY_TYPE_LABELS,
  RESULT_TYPE_LABELS
} from "./utils.js";

let mainEl = null;

/* ---------- 初始化 ---------- */

async function init() {
  mainEl = document.getElementById("page-main");
  mainEl.innerHTML = loadingState();

  // 1. URL 参数校验
  const countryId = parseIdParam("id");
  if (countryId === null) {
    showNotFound();
    return;
  }

  try {
    // 2. 加载数据
    const data = await loadAllCoreData();
    const countrySource = await loadCountrySource();

    // 3. 查找国家并校验 published
    const country = data.countries.find(c => c.country_id === countryId);
    if (!country || country.status !== "published") {
      showNotFound();
      return;
    }

    // 4. 聚合计算（全部从数据链查询得出）
    const libraries = getPublishedLibrariesForCountry(data.libraries, countryId);

    // 该国全部获奖记录：Library → Award_Result →（校验 Award 也 published）
    const libraryIds = new Set(libraries.map(l => l.library_id));
    const awardRows = data.awardResults
      .filter(r => r.status === "published" && libraryIds.has(r.library_id))
      .map(r => {
        const award = data.awards.find(a => a.award_id === r.award_id);
        return (award && award.status === "published") ? { result: r, award } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.result.year || 0) - (a.result.year || 0));

    // Award-winning Libraries：有获奖记录的图书馆去重
    const awardWinningLibraryIds = [...new Set(awardRows.map(row => row.result.library_id))];

    // Cases：该国图书馆名下 published 案例
    const cases = data.cases
      .filter(c => c.status === "published" && libraryIds.has(c.library_id))
      .sort((a, b) => (b.year || 0) - (a.year || 0));

    // Sources：country-source 关联链
    const sources = getSourcesForEntity(countrySource, data.sources, countryId, "country_id");

    renderPage(country, { libraries, awardRows, awardWinningLibraryIds, cases, sources }, data);
  } catch (err) {
    mainEl.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

function showNotFound() {
  document.getElementById("breadcrumb").innerHTML = breadcrumb([
    { label: "Home", href: "index.html" },
    { label: "Country Not Found" }
  ]);
  mainEl.innerHTML = notFoundState("Country", withBase("index.html"));
}

/* ---------- 页面渲染 ---------- */

function renderPage(country, agg, data) {
  document.getElementById("breadcrumb").innerHTML = breadcrumb([
    { label: "Home", href: "index.html" },
    { label: "World Map", href: APP_CONFIG.pages.worldMap },
    { label: country.country_name }
  ]);

  document.title = `${country.country_name} — Global Library Knowledge & Information Platform`;

  const librariesHref = `${withBase(APP_CONFIG.pages.libraries)}?country=${country.country_id}`;

  mainEl.innerHTML = `
  <!-- Country Header -->
  <div class="detail-head">
    <div>
      <h1>${escapeHtml(country.country_name)}</h1>
      <p class="detail-sub">
        <span class="tag tag-type">${escapeHtml(country.region || "—")}</span>
        <span class="tag tag-country">ISO Code: ${escapeHtml(country.country_code || "—")}</span>
      </p>
      ${country.description
        ? `<p class="detail-desc">${escapeHtml(country.description)}</p>`
        : ""}
      ${country.latitude !== null && country.longitude !== null
        ? `<p class="caption" style="margin-top:10px">Center coordinates: ${country.latitude}, ${country.longitude} · Map will be added in a later development step.</p>`
        : ""}
    </div>
  </div>

  <!-- Basic Statistics（动态计算，不存于 Country JSON） -->
  <section class="section" aria-label="Country statistics">
    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-num">${agg.libraries.length}</div>
        <div class="stat-label">Libraries</div>
        <div class="caption">Published records</div>
      </div>
      <div class="stat-box">
        <div class="stat-num">${agg.awardWinningLibraryIds.length}</div>
        <div class="stat-label">Award-winning Libraries</div>
        <div class="caption">Distinct libraries with published award records</div>
      </div>
      <div class="stat-box">
        <div class="stat-num">${agg.cases.length}</div>
        <div class="stat-label">Cases / Projects</div>
        <div class="caption">Published cases in this country</div>
      </div>
      <div class="stat-box">
        <div class="stat-num">${agg.sources.length}</div>
        <div class="stat-label">Sources</div>
        <div class="caption">Country-level sources</div>
      </div>
    </div>
  </section>

  <!-- Libraries in this Country -->
  <section class="section">
    <div class="section-head">
      <h2>Libraries in this Country</h2>
      <a class="more" href="${librariesHref}">View all →</a>
    </div>
    ${librariesHtml(agg.libraries, data.countries)}
  </section>

  <!-- Award-winning Libraries -->
  <section class="section">
    <div class="section-head">
      <h2>Award-winning Libraries</h2>
      <span class="caption">Country → Library → Award_Result → Award</span>
    </div>
    ${awardsTable(agg.awardRows, data.libraries)}
  </section>

  <!-- Cases -->
  <section class="section">
    <div class="section-head">
      <h2>Cases / Projects</h2>
      <span class="caption">Country → Library → Case_Project</span>
    </div>
    ${casesHtml(agg.cases, data.libraries)}
  </section>

  <!-- Sources -->
  <section class="section" style="max-width:860px">
    <div class="section-head">
      <h2>Sources</h2>
      <span class="caption">Country ↔ Source (M : N)</span>
    </div>
    ${sourcesHtml(agg.sources)}
    <div class="last-updated">Last updated: ${escapeHtml(country.last_updated || "—")}</div>
  </section>`;
}

/* ---------- 子区块渲染 ---------- */

function librariesHtml(libraries, countries) {
  if (libraries.length === 0) {
    return `<p class="small muted">No published libraries are currently available for this country.</p>`;
  }
  return `<div class="card-grid">${libraries.map(lib => libraryCard(lib, countries)).join("")}</div>`;
}

/**
 * Award-winning Libraries 表：Year / Library / Result Type / Award。
 * category 非 general 时在 Award 单元格内以小标签展示（V0.2）。
 */
function awardsTable(awardRows, libraries) {
  if (awardRows.length === 0) {
    return `<p class="small muted">No published award records are currently available for libraries in this country.</p>`;
  }

  const rows = awardRows.map(({ result, award }) => {
    const lib = libraries.find(l => l.library_id === result.library_id);
    const libHref = `${withBase(APP_CONFIG.pages.libraryProfile)}?id=${result.library_id}`;
    const awardHref = `${withBase(APP_CONFIG.pages.awardProfile)}?id=${award.award_id}`;
    const resultLabel = RESULT_TYPE_LABELS[result.result_type] || result.result_type;
    const categoryTag = result.category && result.category !== "general"
      ? `<div class="muted-line"><span class="tag tag-topic">${escapeHtml(result.category)}</span></div>`
      : "";

    return `
    <tr>
      <td>${result.year}</td>
      <td><a href="${libHref}">${escapeHtml(lib ? lib.name : "Unknown Library")}</a></td>
      <td><span class="tag tag-result">${escapeHtml(resultLabel)}</span></td>
      <td><a href="${awardHref}">${escapeHtml(truncateAwardName(award.award_name))}</a>${categoryTag}</td>
    </tr>`;
  }).join("");

  return `
  <div class="table-scroll">
  <table class="data-table">
    <caption class="visually-hidden">Award records of libraries in this country</caption>
    <tr><th>Year</th><th>Library</th><th>Result type</th><th>Award</th></tr>
    ${rows}
  </table>
  </div>`;
}

/** 截断过长的奖项名（表格内显示） */
function truncateAwardName(name) {
  if (!name) return "—";
  return name.length > 60 ? name.slice(0, 59) + "…" : name;
}

function casesHtml(cases, libraries) {
  if (cases.length === 0) {
    return `<p class="small muted">No published case records are currently available for this country.</p>`;
  }
  return `<div class="card-grid">${cases.map(c => caseCard(c, libraries)).join("")}</div>`;
}

function sourcesHtml(sources) {
  if (sources.length === 0) {
    return `<p class="small muted">No published sources are currently available for this country.</p>`;
  }
  return `<div class="source-list">${sources.map(sourceItem).join("")}</div>`;
}

/* ---------- 启动 ---------- */

renderHeader("world-map");
renderFooter();
init();
