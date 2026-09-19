/* ============================================================
   award.js — P-07 Award Profile 控制器
   流程：Loading → URL ?id= → 校验 published → 解析数据链 → 渲染
   数据链：
     Award → Award_Result → Library（获奖记录表，按 year 倒序）
     Award ↔ Source（award-source 关联表）
     Award_Result ↔ Source（award-result-source，作为每条获奖记录旁的来源入口）
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import {
  loadAllCoreData,
  loadAwardSource,
  loadAwardResultSource
} from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  libraryCard,
  awardCard,
  sourceItem,
  loadingState,
  errorState,
  breadcrumb,
  notFoundState
} from "./components.js";
import {
  escapeHtml,
  truncate,
  withBase,
  parseIdParam,
  getPublishedResultsForAward,
  getSourcesForEntity,
  getCountryName,
  RESULT_TYPE_LABELS,
  FREQUENCY_LABELS
} from "./utils.js";

let mainEl = null;

async function init() {
  mainEl = document.getElementById("page-main");
  mainEl.innerHTML = loadingState();

  const awardId = parseIdParam("id");
  if (awardId === null) {
    showNotFound();
    return;
  }

  try {
    const data = await loadAllCoreData();
    const [awardSource, awardResultSource] = await Promise.all([
      loadAwardSource(),
      loadAwardResultSource()
    ]);

    const award = data.awards.find(a => a.award_id === awardId);
    if (!award || award.status !== "published") {
      showNotFound();
      return;
    }

    // Award → Award_Result → Library（仅 published，且 Library 也 published）
    const rows = getPublishedResultsForAward(data.awardResults, data.libraries, awardId);

    // 相关图书馆（去重）
    const relatedLibraryIds = [...new Set(rows.map(r => r.library.library_id))];
    const relatedLibraries = relatedLibraryIds
      .map(id => data.libraries.find(l => l.library_id === id))
      .filter(Boolean);

    // 获奖记录涉及的国家（去重）
    const countryIds = [...new Set(relatedLibraries.map(l => l.country_id))];

    // Award ↔ Source
    const sources = getSourcesForEntity(awardSource, data.sources, awardId, "award_id");

    // 每条获奖记录自身的来源（award-result-source）
    const resultSources = new Map();
    for (const { result } of rows) {
      const list = getSourcesForEntity(awardResultSource, data.sources, result.award_result_id, "award_result_id");
      if (list.length > 0) resultSources.set(result.award_result_id, list);
    }

    // 其他奖项（Related）
    const otherAwards = data.awards
      .filter(a => a.status === "published" && a.award_id !== awardId)
      .slice(0, 4);

    renderPage(award, {
      rows, relatedLibraries, countryIds, sources, resultSources, otherAwards
    }, data);
  } catch (err) {
    mainEl.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

function showNotFound() {
  document.getElementById("breadcrumb").innerHTML = breadcrumb([
    { label: "Home", href: "index.html" },
    { label: "Awards", href: APP_CONFIG.pages.awards },
    { label: "Award Not Found" }
  ]);
  mainEl.innerHTML = `
  <div class="state-box" role="alert">
    <span class="icon" aria-hidden="true">🔎</span>
    <div class="state-title">Award Not Found</div>
    <p class="state-text">The record does not exist or is not published on this platform.</p>
    <div class="state-actions"><a class="btn btn-primary" href="${withBase(APP_CONFIG.pages.awards)}">Back to Awards</a></div>
  </div>`;
}

/* ---------- 页面渲染 ---------- */

function renderPage(award, agg, data) {
  document.getElementById("breadcrumb").innerHTML = breadcrumb([
    { label: "Home", href: "index.html" },
    { label: "Awards", href: APP_CONFIG.pages.awards },
    { label: truncate(award.award_name, 40) }
  ]);

  document.title = `${award.award_name} — Global Library Knowledge & Information Platform`;

  const freqLabel = FREQUENCY_LABELS[award.frequency] || award.frequency || "—";

  mainEl.innerHTML = `
  <!-- Award Header -->
  <div class="detail-head">
    <div>
      <h1>${escapeHtml(award.award_name)}</h1>
      <p class="detail-sub">
        <span class="tag tag-result">${escapeHtml(freqLabel)}</span>
        <span class="tag tag-country">Award ID: ${award.award_id}</span>
      </p>
    </div>
  </div>

  <div class="detail-layout" style="margin-top:24px">
    <div>
      <!-- Overview -->
      <section class="detail-section" id="overview">
        <h2>Overview</h2>
        ${award.description
          ? `<p class="muted" style="max-width:760px">${escapeHtml(award.description)}</p>`
          : `<p class="small muted">No description is currently available for this award.</p>`}
      </section>

      <!-- Award Information -->
      <section class="detail-section" id="information" style="margin-top:32px">
        <h2>Award Information</h2>
        <dl class="meta-list">
          <dt>Organizer</dt>
          <dd>${escapeHtml(award.organizer || "—")}</dd>
          ${award.founded_year ? `<dt>Founded year</dt><dd>${award.founded_year}</dd>` : ""}
          <dt>Frequency</dt>
          <dd>${escapeHtml(freqLabel)}</dd>
          ${award.official_website
            ? `<dt>Official website</dt><dd><a href="${escapeHtml(award.official_website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(award.official_website)}</a></dd>`
            : ""}
        </dl>
      </section>

      <!-- Award Results（Award → Award_Result → Library） -->
      <section class="detail-section" id="results" style="margin-top:32px">
        <div class="section-head">
          <h2>Award Results</h2>
          <span class="caption">Award → Award_Result → Library</span>
        </div>
        ${resultsTable(agg.rows, agg.resultSources, data.countries)}
      </section>

      <!-- Related Libraries -->
      <section class="detail-section" id="libraries" style="margin-top:32px">
        <div class="section-head">
          <h2>Related Libraries</h2>
          <span class="caption">${agg.relatedLibraries.length} libraries recognised by this award</span>
        </div>
        ${agg.relatedLibraries.length === 0
          ? `<p class="small muted">No published libraries are currently linked to this award.</p>`
          : `<div class="card-grid">${agg.relatedLibraries.map(lib => libraryCard(lib, data.countries)).join("")}</div>`}
      </section>

      <!-- Sources -->
      <section class="detail-section" id="sources" style="margin-top:32px">
        <div class="section-head">
          <h2>Sources</h2>
          <span class="caption">Award ↔ Source (M : N)</span>
        </div>
        ${sourcesHtml(agg.sources)}
        <div class="last-updated">Last updated: ${escapeHtml(award.last_updated || "—")}</div>
      </section>
    </div>

    <!-- 右侧栏 -->
    <aside class="detail-aside">
      <div class="card">
        <h3>Quick Facts</h3>
        <dl class="meta-list" style="grid-template-columns:1fr auto">
          <dt>Award records</dt><dd>${agg.rows.length}</dd>
          <dt>Awarded libraries</dt><dd>${agg.relatedLibraries.length}</dd>
          <dt>Countries</dt><dd>${agg.countryIds.length}</dd>
        </dl>
        <p class="caption" style="margin-top:8px">Derived from Award_Result by aggregation (published records only).</p>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Related Awards</h3>
        ${agg.otherAwards.length === 0
          ? `<p class="small muted">No other awards are currently available.</p>`
          : `<ul class="link-list">${agg.otherAwards.map(a =>
              `<li><a href="${withBase(APP_CONFIG.pages.awardProfile)}?id=${a.award_id}">${escapeHtml(truncate(a.award_name, 54))}</a></li>`
            ).join("")}</ul>`}
        <p style="margin-top:12px"><a class="small" href="${withBase(APP_CONFIG.pages.awards)}">All awards →</a></p>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>On this page</h3>
        <ul class="link-list">
          <li><a href="#overview">Overview</a></li>
          <li><a href="#information">Award Information</a></li>
          <li><a href="#results">Award Results</a></li>
          <li><a href="#libraries">Related Libraries</a></li>
          <li><a href="#sources">Sources</a></li>
        </ul>
      </div>
    </aside>
  </div>`;
}

/* ---------- 子区块 ---------- */

/**
 * 获奖记录表：Year / Library / Category / Result type / Project。
 * - category === "general" 时不显示类别标签；非 general 显示真实类别（V0.2 三级语义）。
 * - 每条记录若有关联来源，提供可展开的来源入口（不与其他来源混在一起）。
 */
function resultsTable(rows, resultSources, countries) {
  if (rows.length === 0) {
    return `<p class="small muted">No published award records are currently available for this award.</p>`;
  }

  const body = rows.map(({ result, library }) => {
    const libHref = `${withBase(APP_CONFIG.pages.libraryProfile)}?id=${library.library_id}`;
    const resultLabel = RESULT_TYPE_LABELS[result.result_type] || result.result_type;
    // V0.2 三级语义：category === "general" 表示奖项无内部细分类别，
    // 前台只显示占位横线，不显示 "general" 这类无意义标签（Final QA 修正）。
    const categoryCell = result.category && result.category !== "general"
      ? `<span class="tag tag-topic">${escapeHtml(result.category)}</span>`
      : `<span class="muted">—</span>`;
    const country = getCountryName(countries, library.country_id);
    const sources = resultSources.get(result.award_result_id) || [];

    return `
    <tr>
      <td>${result.year}</td>
      <td><a href="${libHref}">${escapeHtml(library.name)}</a><div class="muted-line">${escapeHtml(country)}</div></td>
      <td>${categoryCell}</td>
      <td><span class="tag tag-result">${escapeHtml(resultLabel)}</span></td>
      <td>${result.project_name ? escapeHtml(result.project_name) : `<span class="muted">—</span>`}
          ${sources.length > 0
            ? `<details class="row-sources"><summary>Source${sources.length > 1 ? "s" : ""} (${sources.length})</summary>
                 <div class="source-list small-gap">${sources.map(sourceItem).join("")}</div>
               </details>`
            : ""}
      </td>
    </tr>`;
  }).join("");

  return `
  <div class="table-scroll">
  <table class="data-table">
    <caption class="visually-hidden">Award results resolved through Award → Award_Result → Library</caption>
    <thead><tr><th>Year</th><th>Library</th><th>Category</th><th>Result type</th><th>Project</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  </div>`;
}

function sourcesHtml(sources) {
  if (sources.length === 0) {
    return `<p class="small muted">No published sources are currently available for this award.</p>`;
  }
  return `<div class="source-list">${sources.map(sourceItem).join("")}</div>`;
}

/* ---------- 启动 ---------- */

renderHeader("awards");
renderFooter();
init();
