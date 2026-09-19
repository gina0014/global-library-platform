/* ============================================================
   about.js — P-11 About 控制器
   内容原则（STEP 3 指令 25–26）：
   - 只使用前七阶段已确认的项目定位，不增加未经确认的合作机构 / 资助方 /
     官方背书 / 研究团队 / 联系方式；
   - 统计数字（数据对象数量、来源类型分布）全部从 JSON 动态读取，不硬编码。
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { loadAllCoreData, getPublished } from "./data-loader.js";
import { renderHeader, renderFooter, breadcrumb, loadingState, errorState } from "./components.js";
import { escapeHtml, withBase, getVisibleCases, SOURCE_TYPE_LABELS } from "./utils.js";

async function init() {
  const el = document.getElementById("about-content");
  el.innerHTML = loadingState();

  try {
    const data = await loadAllCoreData();
    render(el, data);
  } catch (err) {
    el.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

function render(el, data) {
  // 全部为 published 口径（与前台一致）
  const counts = {
    countries: getPublished(data.countries).length,
    libraries: getPublished(data.libraries).length,
    awards: getPublished(data.awards).length,
    awardResults: getPublished(data.awardResults).length,
    // Final QA 统一可见性规则：与 Cases 列表口径一致（案例 + 所属图书馆均 published）
    cases: getVisibleCases(data.cases, data.libraries).length,
    sources: getPublished(data.sources).length
  };

  // 来源类型分布（动态统计，用于说明 Data Sources 一节）
  const sourceTypes = {};
  for (const s of getPublished(data.sources)) {
    const key = s.source_type || "other";
    sourceTypes[key] = (sourceTypes[key] || 0) + 1;
  }
  const sourceTypeRows = Object.entries(sourceTypes)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) =>
      `<tr><td>${escapeHtml(SOURCE_TYPE_LABELS[type] || type)}</td><td>${count}</td></tr>`).join("");

  el.innerHTML = `
  <div class="detail-layout">
    <div>
      <!-- Platform Overview -->
      <section class="detail-section" id="overview">
        <h2>Platform Overview</h2>
        <p class="muted" style="max-width:760px">
          The Global Library Knowledge &amp; Information Platform organises knowledge about libraries,
          international awards, innovative cases and their sources into a single linked data structure.
          Instead of publishing isolated articles, the platform stores structured records and connects them
          through explicit relationships, so that every statement on a page can be traced back to a record
          and to the source that supports it.
        </p>
        <div class="stat-grid" style="margin-top:20px">
          <div class="stat-box"><div class="stat-num">${counts.countries}</div><div class="stat-label">Countries / Regions</div></div>
          <div class="stat-box"><div class="stat-num">${counts.libraries}</div><div class="stat-label">Libraries</div></div>
          <div class="stat-box"><div class="stat-num">${counts.awards}</div><div class="stat-label">Awards</div></div>
          <div class="stat-box"><div class="stat-num">${counts.cases}</div><div class="stat-label">Cases / Projects</div></div>
        </div>
        <p class="caption" style="margin-top:8px">Numbers are calculated from the runtime dataset at page load (published records only).</p>
      </section>

      <!-- Purpose -->
      <section class="detail-section" id="purpose" style="margin-top:32px">
        <h2>Purpose</h2>
        <ul class="content-list">
          <li><b>Structure over narrative</b> — represent library knowledge as records and relationships rather than free text.</li>
          <li><b>Traceability</b> — attach sources to every core object so that information can be verified.</li>
          <li><b>Comparability</b> — make it possible to compare libraries, countries and awards using a consistent data model.</li>
          <li><b>Extensibility</b> — keep the data model stable so that new countries, libraries, awards and cases can be added without redesign.</li>
        </ul>
      </section>

      <!-- Data Model -->
      <section class="detail-section" id="data-model" style="margin-top:32px">
        <h2>Data Model</h2>
        <p class="muted" style="max-width:760px">
          The platform is built on six core objects and five many-to-many source relationships
          (Design Baseline V0.2, frozen and pilot-validated):
        </p>
        <dl class="meta-list" style="margin-top:16px">
          <dt>Core objects</dt>
          <dd>Country · Library · Award · Award_Result · Case_Project · Source</dd>
          <dt>Relationships</dt>
          <dd>
            Country 1—N Library · Library 1—N Award_Result · Award 1—N Award_Result ·
            Library 1—N Case_Project · Core objects ↔ Source (M : N)
          </dd>
          <dt>Important rule</dt>
          <dd>Awards and libraries are never linked directly — a link always goes through an award result
              (Award → Award_Result → Library).</dd>
          <dt>Multi-level semantics</dt>
          <dd>award (the award itself) → category (a category inside the award, “general” when the award has no
              internal categories) → result_type (the placing).</dd>
        </dl>
        <p class="caption" style="margin-top:8px">
          Pages never store duplicated values such as country_name or award_count: everything is resolved from
          IDs at render time.
        </p>
      </section>

      <!-- Data Sources -->
      <section class="detail-section" id="data-sources" style="margin-top:32px">
        <h2>Data Sources</h2>
        <p class="muted" style="max-width:760px">
          Records are compiled from publicly available, citable material, prioritising:
          official organisations, award organisers, libraries themselves, government and public institutions,
          professional associations, and reliable academic or public sources.
        </p>
        <div class="table-scroll" style="margin-top:16px">
          <table class="data-table">
            <caption class="visually-hidden">Sources by source type (published records)</caption>
            <thead><tr><th>Source type</th><th>Records</th></tr></thead>
            <tbody>${sourceTypeRows}</tbody>
            <tfoot><tr><th>Total sources</th><th>${counts.sources}</th></tr></tfoot>
          </table>
        </div>
        <p class="caption" style="margin-top:8px">Each source record keeps its publisher, publication date, accessed date and URL.</p>
      </section>

      <!-- Data Quality -->
      <section class="detail-section" id="data-quality" style="margin-top:32px">
        <h2>Data Quality</h2>
        <ul class="content-list">
          <li>Every published record carries an explicit <code>status</code> and a <code>last_updated</code> date.</li>
          <li>The runtime dataset passed a full validation round (structure, foreign keys, value ranges, orphan sources)
              before being used by this prototype.</li>
          <li>Records without a reliable source are not published to the public site.</li>
          <li>Where data is incomplete (for example missing coordinates or an unconfirmed founding year), the interface
              states that clearly instead of filling in a guess.</li>
          <li>Illustrative content used in earlier design prototypes is labelled as demo data; it is not presented as fact.</li>
        </ul>
      </section>

      <!-- Update Principle -->
      <section class="detail-section" id="update-principle" style="margin-top:32px">
        <h2>Update Principle</h2>
        <p class="muted" style="max-width:760px">
          Records move through three states only — this workflow is inherited from the earlier design stages and has
          not been extended:
        </p>
        <div class="workflow-flow" aria-label="Record review workflow">
          <span class="workflow-step">Draft</span>
          <span class="workflow-arrow" aria-hidden="true">→</span>
          <span class="workflow-step">Pending</span>
          <span class="workflow-arrow" aria-hidden="true">→</span>
          <span class="workflow-step">Published</span>
        </div>
        <p class="caption" style="margin-top:8px">
          The public site shows only <code>published</code> records. <code>last_updated</code> is refreshed whenever a
          record is created, reviewed or revised.
        </p>
      </section>

      <!-- Prototype Scope -->
      <section class="detail-section" id="prototype-scope" style="margin-top:32px">
        <h2>Prototype Scope</h2>
        <ul class="content-list">
          <li>This website is a <b>front-end prototype</b>: HTML, CSS and JavaScript only.</li>
          <li>It reads a validated static JSON dataset — there is no database connection and no backend service.</li>
          <li>Ask AI is a scripted demonstration of the intended interface, not a live AI system.</li>
          <li>The Admin Dashboard is a user-interface prototype: editing, reviewing and publishing are not enabled.</li>
          <li>Illustrative demo content is clearly labelled wherever it appears.</li>
        </ul>
      </section>

      <!-- Future Development -->
      <section class="detail-section" id="future" style="margin-top:32px">
        <h2>Future Development</h2>
        <ul class="content-list">
          <li>A real data service so that records can be maintained continuously instead of as a static dataset.</li>
          <li>A working review and publishing workflow with roles and an audit trail.</li>
          <li>An AI question-answering service connected to the same structured data and its sources.</li>
          <li>Richer coverage: more countries and libraries, and coordinate data so that the world map becomes complete.</li>
          <li>Deeper linking between awards, cases, libraries and their supporting sources.</li>
        </ul>
        <p class="caption" style="margin-top:8px">This page describes the project as it stands today. No external support, affiliation or endorsement is claimed.</p>
      </section>

      <div class="last-updated">Runtime dataset: Design Baseline V0.2 (Pilot-Validated) · Prototype: Stage 8</div>
    </div>

    <aside class="detail-aside">
      <div class="card">
        <h3>On this page</h3>
        <ul class="link-list">
          <li><a href="#overview">Platform Overview</a></li>
          <li><a href="#purpose">Purpose</a></li>
          <li><a href="#data-model">Data Model</a></li>
          <li><a href="#data-sources">Data Sources</a></li>
          <li><a href="#data-quality">Data Quality</a></li>
          <li><a href="#update-principle">Update Principle</a></li>
          <li><a href="#prototype-scope">Prototype Scope</a></li>
          <li><a href="#future">Future Development</a></li>
        </ul>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Dataset at a glance</h3>
        <dl class="meta-list" style="grid-template-columns:1fr auto">
          <dt>Countries</dt><dd>${counts.countries}</dd>
          <dt>Libraries</dt><dd>${counts.libraries}</dd>
          <dt>Awards</dt><dd>${counts.awards}</dd>
          <dt>Award results</dt><dd>${counts.awardResults}</dd>
          <dt>Cases</dt><dd>${counts.cases}</dd>
          <dt>Sources</dt><dd>${counts.sources}</dd>
        </dl>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Explore</h3>
        <p class="small"><a href="${withBase(APP_CONFIG.pages.libraries)}">Libraries →</a></p>
        <p class="small"><a href="${withBase(APP_CONFIG.pages.awards)}">Awards →</a></p>
        <p class="small"><a href="${withBase(APP_CONFIG.pages.cases)}">Cases →</a></p>
        <p class="small"><a href="${withBase(APP_CONFIG.pages.worldMap)}">World Map →</a></p>
      </div>
    </aside>
  </div>`;
}

/* ---------- 启动 ---------- */

renderHeader("about");
renderFooter();
document.getElementById("breadcrumb").innerHTML = breadcrumb([
  { label: "Home", href: "index.html" },
  { label: "About" }
]);
init();
