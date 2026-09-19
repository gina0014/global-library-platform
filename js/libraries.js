/* ============================================================
   libraries.js — P-04 Libraries 列表页控制器
   流程：Loading → 加载 libraries + countries → 过滤 published →
        渲染筛选项 → 按 URL 状态过滤/排序/分页 → 渲染卡片

   状态管理：全部状态（q / country / region / type / sort / page）
   记录在 URL 查询参数里（可分享、可回退、便于测试），
   任何筛选变化后用 history.replaceState 同步，不整页刷新。
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { loadLibraries, loadCountries, getPublished } from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  libraryCard,
  loadingState,
  errorState,
  emptyState,
  breadcrumb,
  paginationNav
} from "./components.js";
import {
  getQueryParam,
  filterLibraries,
  sortLibraries,
  LIBRARY_TYPE_LABELS
} from "./utils.js";

/* ---------- 页面状态（从 URL 读取） ----------
   query   搜索关键词（URL 参数 q）
   country 国家 id（数字）
   region  大洲名（如 Asia）
   type    library_type 枚举（如 public）
   sort    "name" | "updated"
   page    页码（从 1 开始） */

function readStateFromUrl() {
  const rawCountry = getQueryParam("country");
  return {
    query: getQueryParam("q") || "",
    countryId: /^\d+$/.test(rawCountry || "") ? Number(rawCountry) : null,
    region: getQueryParam("region") || "",
    type: getQueryParam("type") || "",
    sort: getQueryParam("sort") === "updated" ? "updated" : "name",
    page: Math.max(1, parseInt(getQueryParam("page") || "1", 10) || 1)
  };
}

/** 把当前状态写回 URL（不刷新页面），保证链接可分享、回退可用 */
function syncUrl(state) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.countryId !== null) params.set("country", String(state.countryId));
  if (state.region) params.set("region", state.region);
  if (state.type) params.set("type", state.type);
  if (state.sort === "updated") params.set("sort", "updated");
  if (state.page > 1) params.set("page", String(state.page));
  const qs = params.toString();
  history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
}

/* ---------- 初始化 ---------- */

let allData = null; // { libraries, countries }（published 过滤后缓存）

async function init() {
  const resultsEl = document.getElementById("lib-results");
  resultsEl.innerHTML = loadingState();

  try {
    const [libraries, countries] = await Promise.all([loadLibraries(), loadCountries()]);
    allData = {
      libraries: getPublished(libraries),
      countries: getPublished(countries)
    };
    buildFilterOptions();
    bindEvents();
    render();
  } catch (err) {
    resultsEl.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

/* ---------- 筛选下拉选项（全部来自 JSON，不写死） ---------- */

function buildFilterOptions() {
  const { libraries, countries } = allData;
  const state = readStateFromUrl();

  // Country：全部 published 国家（按名称排序）
  const sortedCountries = [...countries].sort((a, b) =>
    a.country_name.localeCompare(b.country_name, "zh-Hans-CN"));
  fillSelect("f-country", "All countries",
    sortedCountries.map(c => ({ value: String(c.country_id), label: c.country_name })),
    state.countryId === null ? "" : String(state.countryId));

  // Region：从 published 国家提取唯一值
  const regions = [...new Set(countries.map(c => c.region))].sort();
  fillSelect("f-region", "All regions",
    regions.map(r => ({ value: r, label: r })),
    state.region);

  // Library Type：从 published 图书馆实际出现的值生成
  const types = [...new Set(libraries.map(l => l.library_type))].sort();
  fillSelect("f-type", "All types",
    types.map(t => ({ value: t, label: LIBRARY_TYPE_LABELS[t] || t })),
    state.type);

  // 搜索框与排序保持 URL 状态
  document.getElementById("q").value = state.query;
  document.getElementById("sort").value = state.sort;
}

/** 填充一个 <select>：第一项为“全部” */
function fillSelect(id, allLabel, options, selectedValue) {
  const select = document.getElementById(id);
  select.innerHTML =
    `<option value="">${allLabel}</option>` +
    options.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
  select.value = selectedValue || "";
}

/* ---------- 渲染 ---------- */

function render() {
  const state = readStateFromUrl();
  const resultsEl = document.getElementById("lib-results");
  const paginationEl = document.getElementById("lib-pagination");
  const countEl = document.getElementById("results-count");
  const tagsEl = document.getElementById("filter-tags");

  // 1. 过滤（AND 逻辑）+ 排序
  let list = filterLibraries(allData.libraries, state, allData.countries);
  list = sortLibraries(list, state.sort);

  // 2. 分页（作用于筛选后的结果）
  const pageSize = APP_CONFIG.pageSize;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(state.page, totalPages); // 超出范围时收敛到最后一页
  const start = (page - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  // 3. 结果统计（动态，不硬编码总数）
  countEl.textContent = list.length === 0
    ? "Showing 0 libraries"
    : `Showing ${start + 1}–${start + pageItems.length} of ${list.length} libraries`;

  // 4. 空状态
  if (pageItems.length === 0) {
    resultsEl.innerHTML = emptyState("No libraries found. Try adjusting or clearing the filters.");
    paginationEl.innerHTML = "";
    renderFilterTags(state);
    return;
  }

  // 5. 卡片
  resultsEl.innerHTML = `<div class="card-grid">${pageItems.map(lib => libraryCard(lib, allData.countries)).join("")}</div>`;

  // 6. 分页
  paginationEl.innerHTML = paginationNav(page, totalPages, p => buildPageUrl(state, p));

  // 7. 已选筛选条件（Filter Tags）
  renderFilterTags(state);
}

/** 生成分页链接地址（保留其余筛选状态） */
function buildPageUrl(state, page) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.countryId !== null) params.set("country", String(state.countryId));
  if (state.region) params.set("region", state.region);
  if (state.type) params.set("type", state.type);
  if (state.sort === "updated") params.set("sort", "updated");
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "libraries.html" + (qs ? "?" + qs : "");
}

/** 渲染已选筛选条件标签（每个可单独点 × 移除） */
function renderFilterTags(state) {
  const tagsEl = document.getElementById("filter-tags");
  const tags = [];

  if (state.query) tags.push({ label: `Search: ${state.query}`, clear: () => setState({ query: "", page: 1 }) });
  if (state.countryId !== null) {
    const country = allData.countries.find(c => c.country_id === state.countryId);
    tags.push({ label: `Country: ${country ? country.country_name : state.countryId}`, clear: () => setState({ countryId: null, page: 1 }) });
  }
  if (state.region) tags.push({ label: `Region: ${state.region}`, clear: () => setState({ region: "", page: 1 }) });
  if (state.type) tags.push({ label: `Type: ${LIBRARY_TYPE_LABELS[state.type] || state.type}`, clear: () => setState({ type: "", page: 1 }) });

  if (tags.length === 0) {
    tagsEl.hidden = true;
    tagsEl.innerHTML = "";
    return;
  }

  tagsEl.hidden = false;
  tagsEl.innerHTML = tags.map(tag =>
    `<span class="filter-tag">${tag.label}
       <button type="button" aria-label="Remove filter: ${tag.label}" data-action="${tags.indexOf(tag)}">×</button>
     </span>`).join("");

  // 绑定每个 × 的移除事件
  tagsEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.action);
      tags[index].clear();
    });
  });
}

/* ---------- 状态更新 ---------- */

/** 修改状态的一部分，同步 URL 后重新渲染 */
function setState(partial) {
  const state = { ...readStateFromUrl(), ...partial };
  syncUrl(state);
  render();
}

/* ---------- 事件绑定 ---------- */

function bindEvents() {
  // 搜索（输入即筛选；中文输入法 composition 事件不触发）
  let searchTimer = null;
  document.getElementById("q").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => setState({ query: value.trim(), page: 1 }), 200);
  });

  // 排序
  document.getElementById("sort").addEventListener("change", (e) => {
    setState({ sort: e.target.value, page: 1 });
  });

  // 三个筛选
  document.getElementById("f-country").addEventListener("change", (e) => {
    setState({ countryId: e.target.value ? Number(e.target.value) : null, page: 1 });
  });
  document.getElementById("f-region").addEventListener("change", (e) => {
    setState({ region: e.target.value, page: 1 });
  });
  document.getElementById("f-type").addEventListener("change", (e) => {
    setState({ type: e.target.value, page: 1 });
  });

  // Clear Filters：清空全部条件、恢复默认排序、回第 1 页
  document.getElementById("btn-clear").addEventListener("click", () => {
    // 先清 URL，再重建筛选控件（否则 buildFilterOptions 会把旧 URL 状态写回输入框）
    history.replaceState(null, "", window.location.pathname);
    document.getElementById("sort").value = "name";
    buildFilterOptions(); // 依据已清空的 URL 恢复下拉与搜索框
    render();
  });

  // 浏览器回退 / 前进时按新 URL 重新渲染
  window.addEventListener("popstate", () => {
    buildFilterOptions();
    render();
  });
}

/* ---------- 启动 ---------- */

renderHeader("libraries");
renderFooter();
document.getElementById("breadcrumb").innerHTML = breadcrumb([
  { label: "Home", href: "index.html" },
  { label: "Libraries" }
]);
init();
