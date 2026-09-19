/* ============================================================
   awards.js — P-06 Global Awards 列表页控制器
   流程：Loading → 加载 awards + award-results + libraries（用于统计） →
        过滤 published → 从数据生成筛选项 → 按 URL 状态过滤/排序/分页

   状态：q / organizer / frequency / sort / page 全部记录在 URL 查询参数中。
   数据来源：仅 awards.json（不向 JSON 增加任何冗余统计字段）。
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { loadAwards, getPublished } from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  awardCard,
  loadingState,
  errorState,
  emptyState,
  breadcrumb,
  paginationNav
} from "./components.js";
import {
  getQueryParam,
  escapeHtml,
  filterAwards,
  sortAwards,
  FREQUENCY_LABELS
} from "./utils.js";

/* ---------- 页面状态（从 URL 读取） ---------- */

function readStateFromUrl() {
  const sort = getQueryParam("sort");
  return {
    query: getQueryParam("q") || "",
    organizer: getQueryParam("organizer") || "",
    frequency: getQueryParam("frequency") || "",
    sort: ["updated", "founded"].includes(sort) ? sort : "name",
    page: Math.max(1, parseInt(getQueryParam("page") || "1", 10) || 1)
  };
}

function syncUrl(state) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.organizer) params.set("organizer", state.organizer);
  if (state.frequency) params.set("frequency", state.frequency);
  if (state.sort !== "name") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  const qs = params.toString();
  history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
}

let allAwards = null;

/* ---------- 初始化 ---------- */

async function init() {
  const resultsEl = document.getElementById("award-results");
  resultsEl.innerHTML = loadingState();

  try {
    const awards = await loadAwards();
    allAwards = getPublished(awards);
    buildFilterOptions();
    bindEvents();
    render();
  } catch (err) {
    resultsEl.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

/* ---------- 筛选项（全部由数据生成，不写死） ---------- */

function buildFilterOptions() {
  const state = readStateFromUrl();

  // Organizer：published 奖项中实际出现的组织者（按名称排序）
  const organizers = [...new Set(allAwards.map(a => a.organizer).filter(Boolean))].sort();
  fillSelect("f-organizer", "All organizers",
    organizers.map(o => ({ value: o, label: o })), state.organizer);

  // Frequency：published 奖项中实际出现的频率枚举
  const frequencies = [...new Set(allAwards.map(a => a.frequency).filter(Boolean))].sort();
  fillSelect("f-frequency", "All frequencies",
    frequencies.map(f => ({ value: f, label: FREQUENCY_LABELS[f] || f })), state.frequency);

  document.getElementById("q").value = state.query;
  document.getElementById("sort").value = state.sort;
}

function fillSelect(id, allLabel, options, selectedValue) {
  const select = document.getElementById(id);
  select.innerHTML =
    `<option value="">${escapeHtml(allLabel)}</option>` +
    options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
  select.value = selectedValue || "";
}

/* ---------- 渲染 ---------- */

function render() {
  const state = readStateFromUrl();
  const resultsEl = document.getElementById("award-results");
  const paginationEl = document.getElementById("award-pagination");
  const countEl = document.getElementById("results-count");

  let list = filterAwards(allAwards, state);
  list = sortAwards(list, state.sort);

  const pageSize = APP_CONFIG.pageSize;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(state.page, totalPages);
  const start = (page - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  countEl.textContent = list.length === 0
    ? "Showing 0 awards"
    : `Showing ${start + 1}–${start + pageItems.length} of ${list.length} awards`;

  if (pageItems.length === 0) {
    resultsEl.innerHTML = emptyState("No awards found. Try adjusting or clearing the filters.");
    paginationEl.innerHTML = "";
    renderFilterTags(state);
    return;
  }

  resultsEl.innerHTML = `<div class="card-grid">${pageItems.map(awardCard).join("")}</div>`;
  paginationEl.innerHTML = paginationNav(page, totalPages, p => buildPageUrl(state, p));
  renderFilterTags(state);
}

function buildPageUrl(state, page) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.organizer) params.set("organizer", state.organizer);
  if (state.frequency) params.set("frequency", state.frequency);
  if (state.sort !== "name") params.set("sort", state.sort);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "awards.html" + (qs ? "?" + qs : "");
}

function renderFilterTags(state) {
  const tagsEl = document.getElementById("filter-tags");
  const tags = [];

  if (state.query) tags.push({ label: `Search: ${state.query}`, clear: () => setState({ query: "", page: 1 }) });
  if (state.organizer) tags.push({ label: `Organizer: ${state.organizer.length > 40 ? state.organizer.slice(0, 39) + "…" : state.organizer}`, clear: () => setState({ organizer: "", page: 1 }) });
  if (state.frequency) tags.push({ label: `Frequency: ${FREQUENCY_LABELS[state.frequency] || state.frequency}`, clear: () => setState({ frequency: "", page: 1 }) });

  if (tags.length === 0) {
    tagsEl.hidden = true;
    tagsEl.innerHTML = "";
    return;
  }

  tagsEl.hidden = false;
  tagsEl.innerHTML = tags.map((tag, index) =>
    `<span class="filter-tag">${escapeHtml(tag.label)}
       <button type="button" aria-label="Remove filter: ${escapeHtml(tag.label)}" data-action="${index}">×</button>
     </span>`).join("");

  tagsEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => tags[Number(btn.dataset.action)].clear());
  });
}

/* ---------- 状态更新 ---------- */

function setState(partial) {
  const state = { ...readStateFromUrl(), ...partial };
  syncUrl(state);
  render();
}

/* ---------- 事件绑定 ---------- */

function bindEvents() {
  let searchTimer = null;
  document.getElementById("q").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => setState({ query: value.trim(), page: 1 }), 200);
  });

  document.getElementById("sort").addEventListener("change", (e) => {
    setState({ sort: e.target.value, page: 1 });
  });

  document.getElementById("f-organizer").addEventListener("change", (e) => {
    setState({ organizer: e.target.value, page: 1 });
  });

  document.getElementById("f-frequency").addEventListener("change", (e) => {
    setState({ frequency: e.target.value, page: 1 });
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    // 先清 URL 再重建控件，避免旧状态被写回
    history.replaceState(null, "", window.location.pathname);
    document.getElementById("sort").value = "name";
    buildFilterOptions();
    render();
  });

  window.addEventListener("popstate", () => {
    buildFilterOptions();
    render();
  });
}

/* ---------- 启动 ---------- */

renderHeader("awards");
renderFooter();
document.getElementById("breadcrumb").innerHTML = breadcrumb([
  { label: "Home", href: "index.html" },
  { label: "Global Awards" }
]);
init();
