/* ============================================================
   search.js — 全站搜索结果页（P-搜索结果，Step 3 新增）
   URL: search.html?q=keyword
   结果按类型分组：Countries / Libraries / Awards / Cases
   每条结果显示 Type Badge + Title + 简短信息 + 详情链接。
   搜索统一走 data-loader.searchAll()（C2）：
     api 模式 → 检索适配器 → Directus（服务端 filter，published-only 由权限层保证）
     json 模式 → 回退到 utils.searchAllUpgraded（与 Header / Home 同一套客户端口径）
   两种模式的结果口径一致（字段 haystack、顺序、结果上限均相同）。
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { loadAllCoreData, searchAll } from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  breadcrumb,
  loadingState,
  errorState,
  emptyState,
  searchResultItem
} from "./components.js";
import { getQueryParam, escapeHtml } from "./utils.js";

// C2.3：检索对象在 Library / Award / Case 之外补充 Source（来源出处）
const GROUP_ORDER = ["Country", "Library", "Award", "Case", "Source"];
const GROUP_LABELS = {
  Country: "Countries",
  Library: "Libraries",
  Award: "Awards",
  Case: "Cases",
  Source: "Sources"
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
    // C2：检索统一走 data-loader.js（唯一数据访问点）。
    // api 模式由检索适配器打到 Directus（服务端 filter + published-only）；
    // json 模式回退到既有的客户端检索，两种模式的结果口径一致。
    const results = await searchAll(query, await loadAllCoreData());
    render(query, results);
  } catch (err) {
    mainEl.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

function render(query, results) {
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
