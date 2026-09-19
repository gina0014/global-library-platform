/* ============================================================
   admin.js — P-12 Admin Dashboard Prototype 控制器

   定位：Admin UI Prototype，不是正式后台。
   - 不建立登录 / 账号 / 密码 / 数据库写入 / CMS / API；
   - 全部统计从 JSON 动态计算（六类核心对象 + 五类关联表 + 状态分布）；
   - Edit / Review / Publish 按钮仅作界面演示，点击只提示
     "Administrative editing is not enabled in this prototype."，绝不修改数据；
   - Review Workflow 只展示 Draft → Pending → Published 三种状态
     （与前六阶段一致，不创造第四种状态）。
   ============================================================ */

import {
  loadAllCoreData,
  loadCountrySource,
  loadLibrarySource,
  loadAwardSource,
  loadAwardResultSource,
  loadCaseSource
} from "./data-loader.js";
import { renderHeader, renderFooter, breadcrumb, loadingState, errorState } from "./components.js";
import { escapeHtml, truncate } from "./utils.js";

const STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending",
  published: "Published"
};

const STATUS_CLASSES = {
  draft: "status-draft",
  pending: "status-pending",
  published: "status-published"
};

/** 六类核心对象：类型 key → 显示名 + id 字段 + 名称字段 */
const OBJECT_TYPES = [
  { key: "countries", label: "Country", idField: "country_id", nameField: "country_name", page: "countryProfile" },
  { key: "libraries", label: "Library", idField: "library_id", nameField: "name", page: "libraryProfile" },
  { key: "awards", label: "Award", idField: "award_id", nameField: "award_name", page: "awardProfile" },
  { key: "awardResults", label: "Award Result", idField: "award_result_id", nameField: null, page: "awardProfile" },
  { key: "cases", label: "Case_Project", idField: "case_id", nameField: "title", page: "caseDetail" },
  { key: "sources", label: "Source", idField: "source_id", nameField: "source_name", page: null }
];

let adminData = null;

/* ---------- 初始化 ---------- */

async function init() {
  const el = document.getElementById("admin-content");
  el.innerHTML = loadingState();

  try {
    const [core, countrySource, librarySource, awardSource, awardResultSource, caseSource] = await Promise.all([
      loadAllCoreData(),
      loadCountrySource(),
      loadLibrarySource(),
      loadAwardSource(),
      loadAwardResultSource(),
      loadCaseSource()
    ]);
    adminData = {
      ...core,
      relations: { countrySource, librarySource, awardSource, awardResultSource, caseSource }
    };
    render(el, adminData);
    bindRowActions();
  } catch (err) {
    el.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

/* ---------- 渲染 ---------- */

function render(el, data) {
  const statusCount = { draft: 0, pending: 0, published: 0 };
  const objectRows = OBJECT_TYPES.map(type => {
    const records = data[type.key];
    const byStatus = { draft: 0, pending: 0, published: 0 };
    for (const r of records) {
      const s = r.status || "draft";
      if (byStatus[s] !== undefined) byStatus[s] += 1;
      if (statusCount[s] !== undefined) statusCount[s] += 1;
    }
    return { ...type, total: records.length, byStatus };
  });

  const relationTotal = Object.values(data.relations).reduce((sum, rows) => sum + rows.length, 0);

  el.innerHTML = `
  <!-- Data Overview -->
  <section class="section" style="margin-top:24px" aria-labelledby="overview-heading">
    <div class="section-head">
      <h2 id="overview-heading">Data Overview</h2>
      <span class="caption">Calculated from the runtime JSON dataset at page load</span>
    </div>
    <div class="stat-grid">
      ${objectRows.map(row => `
        <div class="stat-box">
          <div class="stat-num">${row.total}</div>
          <div class="stat-label">${escapeHtml(row.label)}${row.total === 1 ? "" : "s"}</div>
          <div class="caption">${row.byStatus.published} published · ${row.byStatus.pending} pending · ${row.byStatus.draft} draft</div>
        </div>`).join("")}
    </div>
    <p class="caption" style="margin-top:8px">
      Source relationships (M : N tables): ${relationTotal} rows across 5 relation tables.
    </p>
  </section>

  <!-- Content Status -->
  <section class="section" aria-labelledby="status-heading">
    <div class="section-head">
      <h2 id="status-heading">Content Status</h2>
      <span class="caption">Three statuses only — inherited from the earlier design stages</span>
    </div>
    <div class="status-grid">
      <div class="status-card status-published">
        <div class="status-num">${statusCount.published}</div>
        <div class="status-name">Published</div>
        <div class="caption">Visible on the public site</div>
      </div>
      <div class="status-card status-pending">
        <div class="status-num">${statusCount.pending}</div>
        <div class="status-name">Pending</div>
        <div class="caption">Awaiting review</div>
      </div>
      <div class="status-card status-draft">
        <div class="status-num">${statusCount.draft}</div>
        <div class="status-name">Draft</div>
        <div class="caption">Not submitted yet</div>
      </div>
    </div>
    <p class="caption" style="margin-top:8px">
      Public pages show published records only; pending and draft records are excluded from lists, statistics,
      search results and detail pages.
    </p>
  </section>

  <!-- Data Objects -->
  <section class="section" aria-labelledby="objects-heading">
    <div class="section-head">
      <h2 id="objects-heading">Data Objects</h2>
      <span class="caption">Six core objects + five source relation tables</span>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <caption class="visually-hidden">Core objects and their record counts by status</caption>
        <thead><tr><th>Object</th><th>Records</th><th>Published</th><th>Pending</th><th>Draft</th></tr></thead>
        <tbody>
          ${objectRows.map(row => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${row.total}</td>
              <td>${row.byStatus.published}</td>
              <td>${row.byStatus.pending}</td>
              <td>${row.byStatus.draft}</td>
            </tr>`).join("")}
          <tr>
            <td>Source relations (5 tables)</td>
            <td>${relationTotal}</td>
            <td>—</td><td>—</td><td>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Review & Publish Workflow -->
  <section class="section" aria-labelledby="workflow-heading">
    <div class="section-head">
      <h2 id="workflow-heading">Review &amp; Publish Workflow</h2>
      <span class="caption">Draft → Pending → Published</span>
    </div>
    <div class="workflow-flow" aria-label="Record review workflow">
      <span class="workflow-step">Draft</span>
      <span class="workflow-arrow" aria-hidden="true">→</span>
      <span class="workflow-step">Pending</span>
      <span class="workflow-arrow" aria-hidden="true">→</span>
      <span class="workflow-step">Published</span>
    </div>
    <div class="workflow-notes">
      <div><b>Draft</b><p class="small muted">Record created or imported, not yet submitted for review.</p></div>
      <div><b>Pending</b><p class="small muted">Submitted for review; sources and fields are being checked.</p></div>
      <div><b>Published</b><p class="small muted">Visible on the public site; last_updated is refreshed on every revision.</p></div>
    </div>
    <p class="caption" style="margin-top:12px">No fourth status is introduced in this prototype.</p>
  </section>

  <!-- Recent Updates -->
  <section class="section" aria-labelledby="recent-heading">
    <div class="section-head">
      <h2 id="recent-heading">Recent Updates</h2>
      <span class="caption">Most recently updated records across all objects</span>
    </div>
    ${recentTable(data)}
    <p class="caption" style="margin-top:8px">
      Edit / Review / Publish buttons are interface demonstrations only — administrative editing is not enabled.
    </p>
  </section>

  <!-- Prototype Scope -->
  <section class="section" aria-labelledby="scope-heading">
    <div class="section-head"><h2 id="scope-heading">Prototype Scope</h2></div>
    <ul class="content-list">
      <li>No authentication: there is no login, no account and no password.</li>
      <li>No persistence: nothing on this page can change the dataset.</li>
      <li>No CMS and no API: the admin interface is a static UI prototype.</li>
      <li>Statistics and lists are read from the same JSON files that power the public site.</li>
    </ul>
  </section>`;
}

/** 最近更新表：Object Type / Name or Title / Status / Last Updated + 原型按钮 */
function recentTable(data) {
  const rows = [];
  for (const type of OBJECT_TYPES) {
    for (const record of data[type.key]) {
      rows.push({
        type: type.label,
        name: type.nameField
          ? record[type.nameField]
          : `Award result #${record.award_result_id} (${record.year}, ${record.result_type})`,
        status: record.status || "draft",
        lastUpdated: record.last_updated || "—",
        id: record[type.idField],
        page: type.page
      });
    }
  }

  rows.sort((a, b) => {
    if (a.lastUpdated !== b.lastUpdated) return b.lastUpdated.localeCompare(a.lastUpdated);
    return a.type.localeCompare(b.type);
  });

  const top = rows.slice(0, 12);

  return `
  <div class="table-scroll">
  <table class="data-table">
    <caption class="visually-hidden">Most recently updated records</caption>
    <thead><tr><th>Object type</th><th>Name / Title</th><th>Status</th><th>Last updated</th><th>Actions (prototype)</th></tr></thead>
    <tbody>
      ${top.map(row => `
        <tr>
          <td>${escapeHtml(row.type)}</td>
          <td>${escapeHtml(truncate(row.name || "—", 70))}</td>
          <td><span class="status-pill ${STATUS_CLASSES[row.status] || ""}">${escapeHtml(STATUS_LABELS[row.status] || row.status)}</span></td>
          <td>${escapeHtml(row.lastUpdated)}</td>
          <td class="row-actions">
            <button class="btn btn-secondary btn-xs" type="button" data-admin-action="edit">Edit</button>
            <button class="btn btn-secondary btn-xs" type="button" data-admin-action="review">Review</button>
            <button class="btn btn-secondary btn-xs" type="button" data-admin-action="publish">Publish</button>
          </td>
        </tr>`).join("")}
    </tbody>
  </table>
  </div>`;
}

/* ---------- 按钮交互（仅提示，不修改数据） ---------- */

function bindRowActions() {
  const feedback = document.getElementById("admin-feedback");

  document.querySelectorAll("[data-admin-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      feedback.textContent =
        "Administrative editing is not enabled in this prototype. The dataset cannot be modified from this page.";
    });
  });
}

/* ---------- 启动 ---------- */

renderHeader("");
renderFooter();
document.getElementById("breadcrumb").innerHTML = breadcrumb([
  { label: "Home", href: "index.html" },
  { label: "Admin Dashboard (Prototype)" }
]);
init();
