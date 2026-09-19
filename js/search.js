/* ============================================================
   search.js — 全站搜索结果页（P-搜索结果，Step 3 新增）
   URL: search.html?q=keyword
   结果按类型分组：Countries / Libraries / Awards / Cases
   每条结果显示 Type Badge + Title + 简短信息 + 详情链接。
   搜索逻辑复用 utils.searchAllUpgraded（与 Header / Home 完全同一套）。
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { loadAllCoreData } from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  breadcrumb,
  loadingState,
  errorState,
  emptyState,
  searchResultItem
} from "./components.js";
import { getQueryParam, searchAllUpgraded, escapeHtml } from "./utils.js";

const GROUP_ORDER = ["Country", "Library", "Award", "Case"];
const GROUP_LABELS = {
  Country: "Countries",
  Library: "Libraries",
  Award: "Awards",
  Case: "Cases"
};

let mainEl = null;

async function init() {
  mainEl = document.getElementById("search-output");
  const query = getQueryParam("q") || "";
  document.getElementById("q").value = query;

  // 结果区之外的静态区块保留，只替换结果区
  if (!query) {
    document.getElementById("search-summary").textContent = "";
    mainEl.innerHTML = emptyState("Enter a keyword to search the platform dataset.");
    return;
  }

  mainEl.innerHTML = loadingState();

  try {
    const data = await loadAllCoreData();
    render(query, data);
  } catch (err) {
    mainEl.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

function render(query, data) {
  const results = searchAllUpgraded(query, data);
  const summaryEl = document.getElementById("search-summary");

  if (results.length === 0) {
    summaryEl.innerHTML = "";
    mainEl.innerHTML = emptyState(`No results for “${query}”. Try another keyword.`);
    return;
  }

  // 按类型分组（保持固定顺序：Countries → Libraries → Awards → Cases）
  const groups = new Map();
  for (const type of GROUP_ORDER) groups.set(type, []);
  for (const result of results) {
    if (!groups.has(result.type)) groups.set(result.type, []);
    groups.get(result.type).push(result);
  }

  summaryEl.innerHTML = `<span class="count">Showing ${results.length} result${results.length === 1 ? "" : "s"} for “${escapeHtml(query)}”</span>
    <span class="caption">${GROUP_ORDER.filter(t => groups.get(t).length > 0).map(t => `${GROUP_LABELS[t]}: ${groups.get(t).length}`).join(" · ")}</span>`;

  mainEl.innerHTML = GROUP_ORDER
    .filter(type => groups.get(type).length > 0)
    .map(type => `
      <section class="result-group" aria-labelledby="group-${type}">
        <div class="section-head">
          <h2 id="group-${type}">${GROUP_LABELS[type]} <span class="count-badge">${groups.get(type).length}</span></h2>
        </div>
        <div class="result-list">
          ${groups.get(type).map(searchResultItem).join("")}
        </div>
      </section>`).join("");
}

/* ---------- 启动 ---------- */

renderHeader("");
renderFooter();
document.getElementById("breadcrumb").innerHTML = breadcrumb([
  { label: "Home", href: "index.html" },
  { label: "Search" }
]);
init();
