/* ============================================================
   library.js — P-05 Library Profile 控制器
   流程：Loading → 读取 URL ?id= → 校验（数字 / 存在 / published）→
        解析 Country / Award_Results / Awards / Cases / Sources → 渲染

   数据链（全部通过 FK 解析，不在 Library 内冗余存储）：
     Library → Country（country_id）
     Library → Award_Result → Award（library_id / award_id）
     Library → Case_Project（library_id）
     Library ↔ Source（library-source 关联表）
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import {
  loadAllCoreData,
  loadLibrarySource,
  getPublished
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
  truncate,
  withBase,
  parseIdParam,
  getCountryById,
  getPublishedAwardResultsForLibrary,
  getPublishedCasesForLibrary,
  getSourcesForEntity,
  getPublishedLibrariesForCountry,
  LIBRARY_TYPE_LABELS,
  RESULT_TYPE_LABELS
} from "./utils.js";

let mainEl = null;

/* ---------- 初始化 ---------- */

async function init() {
  mainEl = document.getElementById("page-main");
  mainEl.innerHTML = loadingState();

  // 1. URL 参数校验：缺失 / 非数字 / 非正整数 → Not Found
  const libraryId = parseIdParam("id");
  if (libraryId === null) {
    showNotFound();
    return;
  }

  try {
    // 2. 加载数据（六类核心 + library-source 关联表）
    const data = await loadAllCoreData();
    const librarySource = await loadLibrarySource();

    // 3. 查找图书馆并校验 published
    const library = data.libraries.find(l => l.library_id === libraryId);
    if (!library || library.status !== "published") {
      showNotFound();
      return;
    }

    // 4. 解析各条数据链
    const country = getCountryById(data.countries, library.country_id);
    const awardPairs = getPublishedAwardResultsForLibrary(data.awardResults, data.awards, libraryId);
    const cases = getPublishedCasesForLibrary(data.cases, libraryId);
    const sources = getSourcesForEntity(librarySource, data.sources, libraryId, "library_id");
    const siblingLibraries = getPublishedLibrariesForCountry(data.libraries, library.country_id)
      .filter(l => l.library_id !== libraryId);

    renderPage(library, country, { awardPairs, cases, sources, siblingLibraries }, data);
  } catch (err) {
    mainEl.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

function showNotFound() {
  renderNotFoundBreadcrumb();
  mainEl.innerHTML = notFoundState("Library", withBase(APP_CONFIG.pages.libraries));
}

function renderNotFoundBreadcrumb() {
  document.getElementById("breadcrumb").innerHTML = breadcrumb([
    { label: "Home", href: "index.html" },
    { label: "Libraries", href: APP_CONFIG.pages.libraries },
    { label: "Not Found" }
  ]);
}

/* ---------- 页面渲染 ---------- */

function renderPage(lib, country, related, data) {
  // 面包屑：Home › Libraries › 当前馆（不可点击）
  document.getElementById("breadcrumb").innerHTML = breadcrumb([
    { label: "Home", href: "index.html" },
    { label: "Libraries", href: APP_CONFIG.pages.libraries },
    { label: lib.name }
  ]);

  // 页面标题
  document.title = `${lib.name} — Global Library Knowledge & Information Platform`;

  const typeLabel = LIBRARY_TYPE_LABELS[lib.library_type] || lib.library_type;
  const place = [country ? country.country_name : null, lib.city].filter(Boolean).join(" · ");
  const countryHref = country ? `${withBase(APP_CONFIG.pages.countryProfile)}?id=${country.country_id}` : null;

  mainEl.innerHTML = `
  <!-- Library Header -->
  <div class="detail-head">
    <div>
      <h1>${escapeHtml(lib.name)}</h1>
      <p class="detail-sub">
        ${lib.name_en && lib.name_en !== lib.name ? `<span>${escapeHtml(lib.name_en)}</span>` : ""}
        <span class="tag tag-type">${escapeHtml(typeLabel)}</span>
      </p>
      <dl class="meta-list">
        <dt>Country / City</dt>
        <dd>${countryHref ? `<a href="${countryHref}">${escapeHtml(country.country_name)}</a>` : "Unknown"}${lib.city ? " · " + escapeHtml(lib.city) : ""}</dd>
        ${lib.founded_year ? `<dt>Founded year</dt><dd>${lib.founded_year}</dd>` : ""}
        ${lib.website ? `<dt>Official website</dt><dd><a href="${escapeHtml(lib.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(displayWebsite(lib.website))}</a></dd>` : ""}
        <dt>Library type</dt><dd>${escapeHtml(typeLabel)}</dd>
      </dl>
    </div>

    <!-- Quick Facts：数字全部按查询聚合，不存于 library 表 -->
    <div class="card" style="min-width:260px">
      <h3 style="font-size:16px">Quick Facts</h3>
      <dl class="meta-list" style="margin-top:10px">
        <dt>Award records</dt><dd>${related.awardPairs.length}</dd>
        <dt>Cases / Projects</dt><dd>${related.cases.length}</dd>
        <dt>Sources</dt><dd>${related.sources.length}</dd>
      </dl>
      <p class="caption" style="margin-top:8px">Counts aggregated by query, not stored in the library record.</p>
    </div>
  </div>

  <div class="detail-layout section">
    <div>
      <!-- Overview -->
      <section class="card detail-section">
        <h2>Overview</h2>
        <p class="muted" style="margin-top:10px">${escapeHtml(lib.description || "No description available.")}</p>

        <!-- Location -->
        <h3 style="font-size:15px;margin-top:16px">Location</h3>
        ${locationBlock(lib, country)}
      </section>

      <!-- Awards：Library → Award_Result → Award -->
      <section class="section detail-section">
        <div class="section-head">
          <h2>Awards</h2>
          <span class="caption">Library → Award_Result → Award</span>
        </div>
        ${awardsTable(related.awardPairs)}
      </section>

      <!-- Cases：Library → Case_Project -->
      <section class="section detail-section">
        <div class="section-head">
          <h2>Cases / Projects</h2>
          <span class="caption">Library → Case_Project (1 : N)</span>
        </div>
        ${casesHtml(related.cases, data.libraries)}
      </section>

      <!-- Sources：Library ↔ Source -->
      <section class="section detail-section">
        <div class="section-head">
          <h2>Sources</h2>
          <span class="caption">Library ↔ Source (M : N)</span>
        </div>
        ${sourcesHtml(related.sources)}
        <div class="last-updated">Last updated: ${escapeHtml(lib.last_updated || "—")}</div>
      </section>
    </div>

    <!-- 右侧栏 -->
    <aside class="detail-aside">
      <div class="card">
        <h3>On this page</h3>
        <ul class="small">
          <li><a href="#lib-overview">Overview</a></li>
          <li><a href="#lib-awards">Awards</a></li>
          <li><a href="#lib-cases">Cases / Projects</a></li>
          <li><a href="#lib-sources">Sources</a></li>
        </ul>
        <hr style="border:none;border-top:1px solid var(--color-border);margin:16px 0">
        <h3>Related</h3>
        ${relatedHtml(related.siblingLibraries, country)}
      </div>
    </aside>
  </div>`;

  // 给区块补上锚点（On this page 链接目标）
  document.querySelector(".detail-section.card").id = "lib-overview";
  document.querySelectorAll(".detail-section.section")[0].id = "lib-awards";
  document.querySelectorAll(".detail-section.section")[1].id = "lib-cases";
  document.querySelectorAll(".detail-section.section")[2].id = "lib-sources";
}

/* ---------- 子区块渲染 ---------- */

/** 网址显示：去掉协议前缀，避免长文本堆在页面上 */
function displayWebsite(url) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Location：有坐标时显示 City / Country / Coordinates；无坐标时不报错 */
function locationBlock(lib, country) {
  const lines = [];
  if (lib.city) lines.push(`City: ${escapeHtml(lib.city)}`);
  if (country) lines.push(`Country: ${escapeHtml(country.country_name)}`);

  if (lib.latitude !== null && lib.latitude !== undefined &&
      lib.longitude !== null && lib.longitude !== undefined) {
    lines.push(`Coordinates: ${lib.latitude}, ${lib.longitude}`);
    return `<p class="small muted" style="margin-top:8px">${lines.join(" · ")}</p>
            <p class="caption" style="margin-top:6px">Location map will be added in a later development step.</p>`;
  }

  // 经纬度为空：只显示城市/国家，并说明地图待数据补全（不报错、不显示 null）
  return `<p class="small muted" style="margin-top:8px">${lines.length ? lines.join(" · ") : "—"}</p>
          <p class="caption" style="margin-top:6px">Location map will be available when coordinate data is available.</p>`;
}

/**
 * Awards 表：Year / Award / Category / Result Type / Project。
 * category === "general" 时不显示 Category 标签（V0.2 约定）。
 */
function awardsTable(awardPairs) {
  if (awardPairs.length === 0) {
    return `<p class="small muted">No published award records are currently available.</p>`;
  }

  const rows = awardPairs.map(({ result, award }) => {
    const awardHref = `${withBase(APP_CONFIG.pages.awardProfile)}?id=${award.award_id}`;
    const categoryCell = result.category && result.category !== "general"
      ? `<span class="tag tag-topic">${escapeHtml(result.category)}</span>`
      : "";
    const resultLabel = RESULT_TYPE_LABELS[result.result_type] || result.result_type;
    const projectCell = result.project_name
      ? escapeHtml(result.project_name)
      : "—";
    const descLine = result.description
      ? `<div class="muted-line">${escapeHtml(truncate(result.description, 110))}</div>`
      : "";

    return `
    <tr>
      <td>${result.year}</td>
      <td>
        <a href="${awardHref}">${escapeHtml(truncate(award.award_name, 60))}</a>
        <div class="muted-line">${escapeHtml(truncate(award.organizer || "", 50))}</div>
      </td>
      <td>${categoryCell}</td>
      <td><span class="tag tag-result">${escapeHtml(resultLabel)}</span></td>
      <td>${projectCell}${descLine}</td>
    </tr>`;
  }).join("");

  return `
  <div class="table-scroll">
  <table class="data-table">
    <caption class="visually-hidden">Award records of this library, joined from Award_Result and Award</caption>
    <tr><th>Year</th><th>Award</th><th>Category</th><th>Result type</th><th>Project</th></tr>
    ${rows}
  </table>
  </div>`;
}

/** Cases 卡片列表（所属馆名通过 library_id 解析） */
function casesHtml(cases, libraries) {
  if (cases.length === 0) {
    return `<p class="small muted">No published case records are currently available.</p>`;
  }
  return `<div class="card-grid">${cases.map(c => caseCard(c, libraries)).join("")}</div>`;
}

/** Sources 列表（真实 source.url 外链） */
function sourcesHtml(sources) {
  if (sources.length === 0) {
    return `<p class="small muted">No published sources are currently available.</p>`;
  }
  return `<div class="source-list">${sources.map(sourceItem).join("")}</div>`;
}

/** 右侧栏 Related：同国家其他图书馆 */
function relatedHtml(siblingLibraries, country) {
  if (siblingLibraries.length === 0) return "";
  const items = siblingLibraries.slice(0, 5).map(l =>
    `<li><a href="${withBase(APP_CONFIG.pages.libraryProfile)}?id=${l.library_id}">${escapeHtml(l.name)}</a></li>`).join("");
  return `
  <p class="small muted" style="margin-top:8px">Other libraries in ${escapeHtml(country ? country.country_name : "this country")}</p>
  <ul class="small" style="margin-top:6px">${items}</ul>`;
}

/* ---------- 启动 ---------- */

renderHeader("libraries");
renderFooter();
init();
