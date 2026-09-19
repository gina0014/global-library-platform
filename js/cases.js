/* ============================================================
   cases.js — P-08 Cases 列表页控制器
   状态（URL）：q / topic / year / country / sort / page
   数据链：
     Case → Library（library_id）
     Case → Library → Country（Country 筛选用，不写入 Case JSON）
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { loadCases, loadLibraries, loadCountries, getPublished } from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  caseCard,
  loadingState,
  errorState,
  emptyState,
  breadcrumb,
  paginationNav
} from "./components.js";
import {
  getQueryParam,
  escapeHtml,
  filterCases,
  sortCases,
  getVisibleCases,
  TOPIC_LABELS
} from "./utils.js";

function readStateFromUrl() {
  const rawYear = getQueryParam("year");
  const rawCountry = getQueryParam("country");
  const sort = getQueryParam("sort");
  return {
    query: getQueryParam("q") || "",
    topic: getQueryParam("topic") || "",
    year: /^\d{4}$/.test(rawYear || "") ? Number(rawYear) : null,
    countryId: /^\d+$/.test(rawCountry || "") ? Number(rawCountry) : null,
    sort: ["updated", "title"].includes(sort) ? sort : "year",
    page: Math.max(1, parseInt(getQueryParam("page") || "1", 10) || 1)
  };
}

function syncUrl(state) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.topic) params.set("topic", state.topic);
  if (state.year !== null) params.set("year", String(state.year));
  if (state.countryId !== null) params.set("country", String(state.countryId));
  if (state.sort !== "year") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  const qs = params.toString();
  history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
}

let allData = null; // { cases, libraries, countries }（published 过滤后）

async function init() {
  const resultsEl = document.getElementById("case-results");
  resultsEl.innerHTML = loadingState();

  try {
    const [cases, libraries, countries] = await Promise.all([
      loadCases(), loadLibraries(), loadCountries()
    ]);
    allData = {
      // 可见性规则（Final QA 统一）：案例 published 且所属图书馆 published
      cases: getVisibleCases(cases, libraries),
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

/* ---------- 筛选项（全部由数据生成） ---------- */

function buildFilterOptions() {
  const state = readStateFromUrl();
  const { cases, libraries, countries } = allData;

  // Topic：published 案例中实际出现的主题
  const topics = [...new Set(cases.map(c => c.topic).filter(Boolean))].sort();
  fillSelect("f-topic", "All topics",
    topics.map(t => ({ value: t, label: TOPIC_LABELS[t] || t })), state.topic);

  // Year：published 案例中实际出现的年份（倒序）
  const years = [...new Set(cases.map(c => c.year).filter(Boolean))].sort((a, b) => b - a);
  fillSelect("f-year", "All years",
    years.map(y => ({ value: String(y), label: String(y) })),
    state.year === null ? "" : String(state.year));

  // Country：只列出实际拥有 published 案例的国家（经 Case → Library → Country 计算）
  const countryIds = [...new Set(
    cases.map(c => {
      const lib = libraries.find(l => l.library_id === c.library_id);
      return lib ? lib.country_id : null;
    }).filter(id => id !== null)
  )];
  const caseCountries = countries
    .filter(c => countryIds.includes(c.country_id))
    .sort((a, b) => a.country_name.localeCompare(b.country_name, "zh-Hans-CN"));
  fillSelect("f-country", "All countries",
    caseCountries.map(c => ({ value: String(c.country_id), label: c.country_name })),
    state.countryId === null ? "" : String(state.countryId));

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
  const resultsEl = document.getElementById("case-results");
  const paginationEl = document.getElementById("case-pagination");
  const countEl = document.getElementById("results-count");

  let list = filterCases(allData.cases, state, allData.libraries, allData.countries);
  list = sortCases(list, state.sort);

  const pageSize = APP_CONFIG.pageSize;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(state.page, totalPages);
  const start = (page - 1) * pageSize;
  const pageItems = list.slice(start, start + pageSize);

  countEl.textContent = list.length === 0
    ? "Showing 0 cases"
    : `Showing ${start + 1}–${start + pageItems.length} of ${list.length} cases`;

  if (pageItems.length === 0) {
    resultsEl.innerHTML = emptyState("No cases found. Try adjusting or clearing the filters.");
    paginationEl.innerHTML = "";
    renderFilterTags(state);
    return;
  }

  resultsEl.innerHTML = `<div class="card-grid">${pageItems.map(c => caseCard(c, allData.libraries, allData.countries)).join("")}</div>`;
  paginationEl.innerHTML = paginationNav(page, totalPages, p => buildPageUrl(state, p));
  renderFilterTags(state);
}

function buildPageUrl(state, page) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.topic) params.set("topic", state.topic);
  if (state.year !== null) params.set("year", String(state.year));
  if (state.countryId !== null) params.set("country", String(state.countryId));
  if (state.sort !== "year") params.set("sort", state.sort);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "cases.html" + (qs ? "?" + qs : "");
}

function renderFilterTags(state) {
  const tagsEl = document.getElementById("filter-tags");
  const tags = [];

  if (state.query) tags.push({ label: `Search: ${state.query}`, clear: () => setState({ query: "", page: 1 }) });
  if (state.topic) tags.push({ label: `Topic: ${TOPIC_LABELS[state.topic] || state.topic}`, clear: () => setState({ topic: "", page: 1 }) });
  if (state.year !== null) tags.push({ label: `Year: ${state.year}`, clear: () => setState({ year: null, page: 1 }) });
  if (state.countryId !== null) {
    const country = allData.countries.find(c => c.country_id === state.countryId);
    tags.push({ label: `Country: ${country ? country.country_name : state.countryId}`, clear: () => setState({ countryId: null, page: 1 }) });
  }

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

  document.getElementById("sort").addEventListener("change", (e) => setState({ sort: e.target.value, page: 1 }));
  document.getElementById("f-topic").addEventListener("change", (e) => setState({ topic: e.target.value, page: 1 }));
  document.getElementById("f-year").addEventListener("change", (e) =>
    setState({ year: e.target.value ? Number(e.target.value) : null, page: 1 }));
  document.getElementById("f-country").addEventListener("change", (e) =>
    setState({ countryId: e.target.value ? Number(e.target.value) : null, page: 1 }));

  document.getElementById("btn-clear").addEventListener("click", () => {
    history.replaceState(null, "", window.location.pathname);
    document.getElementById("sort").value = "year";
    buildFilterOptions();
    render();
  });

  window.addEventListener("popstate", () => {
    buildFilterOptions();
    render();
  });
}

/* ---------- 启动 ---------- */

renderHeader("cases");
renderFooter();
document.getElementById("breadcrumb").innerHTML = breadcrumb([
  { label: "Home", href: "index.html" },
  { label: "Cases" }
]);
init();
