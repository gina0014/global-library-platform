/* ============================================================
   world-map.js — P-02 World Map 控制器

   设计原则（STEP 3 指令 11–15）：
   - 地图是入口，数据库是核心：地图数据来自 countries.json / libraries.json，
     不复制第二套地图数据。
   - 完全本地 SVG（js/map-svg.js），无在线瓦片 / API Key / 网络地图依赖。
   - Marker 规则：
       · 国家 Marker：使用 countries.json 中真实存在的国家中心坐标（用于导航）
       · 图书馆 Marker：仅当 library.latitude !== null && library.longitude !== null
         才绘制（绝不随机生成 / 推测 / 用国家中心冒充图书馆坐标）
   - 地图不是访问图书馆的唯一途径：页面下方始终提供与地图同步的图书馆列表，
     并链接到 Libraries 页与全站搜索。

   状态（URL）：q / region / type / country（地图与列表共用）
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import { loadCountries, loadLibraries, loadAwardResults, getPublished } from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  loadingState,
  errorState,
  emptyState,
  breadcrumb
} from "./components.js";
import {
  getQueryParam,
  escapeHtml,
  withBase,
  filterLibraries,
  LIBRARY_TYPE_LABELS,
  getCountryName
} from "./utils.js";
import { baseMapSvg, project, MAP_WIDTH, MAP_HEIGHT } from "./map-svg.js";
import { initDynamicMap } from "./map-dynamic.js";

let allData = null; // { countries, libraries, awardResults }（published 过滤后）
let glMap = null;   // MapLibre 句柄；WebGL 不可用时为 null → 走既有 SVG 地图

/* ---------- 状态 ---------- */

function readStateFromUrl() {
  const rawCountry = getQueryParam("country");
  return {
    query: getQueryParam("q") || "",
    region: getQueryParam("region") || "",
    type: getQueryParam("type") || "",
    countryId: /^\d+$/.test(rawCountry || "") ? Number(rawCountry) : null
  };
}

function syncUrl(state) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.region) params.set("region", state.region);
  if (state.type) params.set("type", state.type);
  if (state.countryId !== null) params.set("country", String(state.countryId));
  const qs = params.toString();
  history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
}

/* ---------- 初始化 ---------- */

async function init() {
  const listEl = document.getElementById("map-library-list");
  listEl.innerHTML = loadingState();

  try {
    const [countries, libraries, awardResults] = await Promise.all([
      loadCountries(), loadLibraries(), loadAwardResults()
    ]);
    allData = {
      countries: getPublished(countries),
      libraries: getPublished(libraries),
      awardResults: getPublished(awardResults)
    };

    // 主视图：MapLibre 动态地图（离线底图 + 动态 marker）。
    // 失败或 WebGL 不可用时 glMap 为 null，自动回退到既有本地 SVG 地图，不抛错。
    glMap = initDynamicMap({
      container: document.getElementById("map-gl"),
      onSelectCountry: (c) => {
        const libsInCountry = allData.libraries.filter(l => l.country_id === c.country_id);
        const libIds = new Set(libsInCountry.map(l => l.library_id));
        updateSelectedCountry(c, libsInCountry.length,
          awardCountForCountry(c.country_id, allData.awardResults, libIds));
      }
    });
    if (glMap) {
      const svgCanvas = document.getElementById("map-canvas");
      svgCanvas.hidden = true;          // SVG 仅作降级视图，保留 DOM 但不渲染
      document.getElementById("map-gl").hidden = false;
      document.body.dataset.mapEngine = "maplibre";
    } else {
      document.getElementById("map-canvas").innerHTML = baseMapSvg();
      document.body.dataset.mapEngine = "svg";
    }
    buildFilterOptions();
    bindEvents();
    render();
  } catch (err) {
    listEl.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", () => init());
  }
}

/* ---------- 筛选项 ---------- */

function buildFilterOptions() {
  const state = readStateFromUrl();
  const { countries, libraries } = allData;

  const regions = [...new Set(countries.map(c => c.region).filter(Boolean))].sort();
  fillSelect("f-region", "All regions", regions.map(r => ({ value: r, label: r })), state.region);

  const types = [...new Set(libraries.map(l => l.library_type).filter(Boolean))].sort();
  fillSelect("f-type", "All types",
    types.map(t => ({ value: t, label: LIBRARY_TYPE_LABELS[t] || t })), state.type);

  const sorted = [...countries].sort((a, b) => a.country_name.localeCompare(b.country_name, "zh-Hans-CN"));
  fillSelect("f-country", "All countries",
    sorted.map(c => ({ value: String(c.country_id), label: c.country_name })),
    state.countryId === null ? "" : String(state.countryId));

  document.getElementById("q").value = state.query;
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
  const { libraries, countries, awardResults } = allData;

  const filtered = filterLibraries(libraries, state, countries);

  renderMarkers(filtered, countries, awardResults);
  renderNote(filtered);
  renderList(filtered, countries);
  renderFilterTags(state);
}

/** 统计某国的已发布获奖记录数（Country → Library → Award_Result） */
function awardCountForCountry(countryId, awardResults, libraryIdsInCountry) {
  return awardResults.filter(r => libraryIdsInCountry.has(r.library_id)).length;
}

/* ---------- 地图 Marker ---------- */

function renderMarkers(filteredLibraries, countries, awardResults) {
  // C1：MapLibre 可用时由动态地图渲染 marker（数据仍是同一份 data-loader 数据）
  if (glMap) {
    const filteredCountryIds = new Set(filteredLibraries.map(l => l.country_id));
    glMap.setData({
      libraries: filteredLibraries,
      countries: countries.filter(c => filteredCountryIds.has(c.country_id))
    });
    return;
  }

  const markersLayer = document.getElementById("map-markers");
  if (!markersLayer) return;

  const filteredCountryIds = new Set(filteredLibraries.map(l => l.country_id));

  // 1) 国家 Marker：仅使用 countries.json 中真实存在的中心坐标（用于导航，不冒充图书馆坐标）
  const countryMarkers = countries
    .filter(c => c.latitude !== null && c.longitude !== null && filteredCountryIds.has(c.country_id))
    .map(c => {
      const { x, y } = project(c.longitude, c.latitude);
      return { type: "country", record: c, x, y };
    });

  // 2) 图书馆 Marker：仅当同时存在真实 latitude 与 longitude（不伪造）
  const libraryMarkers = filteredLibraries
    .filter(l => l.latitude !== null && l.longitude !== null)
    .map(l => {
      const { x, y } = project(l.longitude, l.latitude);
      return { type: "library", record: l, x, y };
    });

  const all = [...countryMarkers, ...libraryMarkers];

  markersLayer.innerHTML = all.map((marker, index) => {
    if (marker.type === "country") {
      const c = marker.record;
      const libsInCountry = allData.libraries.filter(l => l.country_id === c.country_id);
      const libIds = new Set(libsInCountry.map(l => l.library_id));
      const awards = awardCountForCountry(c.country_id, awardResults, libIds);
      const href = `${withBase(APP_CONFIG.pages.countryProfile)}?id=${c.country_id}`;
      return `
      <g class="map-marker marker-country" data-index="${index}" data-marker-type="country"
         data-country-id="${c.country_id}" tabindex="0" role="link"
         aria-label="${escapeHtml(c.country_name)}, ${escapeHtml(c.region || "")}, ${libsInCountry.length} libraries, ${awards} award records. Open country profile.">
        <circle cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="7"></circle>
        <circle class="marker-ring" cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="13"></circle>
        <text x="${marker.x.toFixed(1)}" y="${(marker.y - 15).toFixed(1)}" text-anchor="middle">${escapeHtml(c.country_name)}</text>
      </g>`;
    }
    const l = marker.record;
    const href = `${withBase(APP_CONFIG.pages.libraryProfile)}?id=${l.library_id}`;
    return `
    <g class="map-marker marker-library" data-index="${index}" data-marker-type="library"
       data-library-id="${l.library_id}" tabindex="0" role="link"
       aria-label="${escapeHtml(l.name)}, ${escapeHtml(l.city || "")}, ${escapeHtml(getCountryName(countries, l.country_id))}. Open library profile.">
      <circle cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="6"></circle>
      <text x="${marker.x.toFixed(1)}" y="${(marker.y + 20).toFixed(1)}" text-anchor="middle">${escapeHtml(l.name)}</text>
    </g>`;
  }).join("");

  // 交互：hover / focus 显示信息卡；click / Enter 跳转
  markersLayer.querySelectorAll(".map-marker").forEach(g => {
    const show = () => showTooltip(g, countries);
    const hide = () => hideTooltip();
    const go = () => {
      const isCountry = g.dataset.markerType === "country";
      const page = isCountry ? APP_CONFIG.pages.countryProfile : APP_CONFIG.pages.libraryProfile;
      const id = isCountry ? g.dataset.countryId : g.dataset.libraryId;
      // 统一用 withBase() 换算前缀，避免 pages/ 子目录下出现 pages/pages/… 死链
      window.location.href = `${withBase(page)}?id=${id}`;
    };

    g.addEventListener("mouseenter", show);
    g.addEventListener("focus", show);
    g.addEventListener("mouseleave", hide);
    g.addEventListener("blur", hide);
    g.addEventListener("click", go);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });

  // 记录 Marker 统计（供下方提示文案与测试使用）
  document.body.dataset.countryMarkers = String(countryMarkers.length);
  document.body.dataset.libraryMarkers = String(libraryMarkers.length);
}

/** Marker 信息卡：显示名称 / 城市 / 国家 / 类型（图书馆）或国家统计（国家） */
function showTooltip(g, countries) {
  const tooltip = document.getElementById("map-tooltip");
  const circle = g.querySelector("circle");
  const x = Number(circle.getAttribute("cx"));
  const y = Number(circle.getAttribute("cy"));

  let html = "";
  if (g.dataset.markerType === "country") {
    const c = allData.countries.find(item => item.country_id === Number(g.dataset.countryId));
    if (!c) return;
    const libsInCountry = allData.libraries.filter(l => l.country_id === c.country_id);
    const libIds = new Set(libsInCountry.map(l => l.library_id));
    const awards = awardCountForCountry(c.country_id, allData.awardResults, libIds);
    html = `
      <div class="tt-title">${escapeHtml(c.country_name)}</div>
      <div class="tt-sub">${escapeHtml(c.region || "")} · ${escapeHtml(c.country_code || "")}</div>
      <div class="tt-meta">${libsInCountry.length} libraries · ${awards} award records</div>
      <div class="tt-link">View Country Profile →</div>`;
    updateSelectedCountry(c, libsInCountry.length, awards);
  } else {
    const l = allData.libraries.find(item => item.library_id === Number(g.dataset.libraryId));
    if (!l) return;
    const countryName = getCountryName(allData.countries, l.country_id);
    html = `
      <div class="tt-title">${escapeHtml(l.name)}</div>
      <div class="tt-sub">${escapeHtml(l.city || "—")} · ${escapeHtml(countryName)}</div>
      <div class="tt-meta">${escapeHtml(LIBRARY_TYPE_LABELS[l.library_type] || l.library_type || "—")}</div>
      <div class="tt-link">View Library Profile →</div>`;
  }

  tooltip.innerHTML = html;
  tooltip.hidden = false;
  tooltip.style.left = `${(x / MAP_WIDTH) * 100}%`;
  tooltip.style.top = `${(y / MAP_HEIGHT) * 100}%`;
  tooltip.classList.toggle("align-right", x / MAP_WIDTH > 0.72);
  tooltip.classList.toggle("align-left", x / MAP_WIDTH < 0.18);
}

function hideTooltip() {
  document.getElementById("map-tooltip").hidden = true;
}

/** 右侧栏：被选中的国家信息（动态统计，不存冗余字段） */
function updateSelectedCountry(country, libraryCount, awardCount) {
  const el = document.getElementById("selected-country");
  el.innerHTML = `
    <div class="sc-name">${escapeHtml(country.country_name)}</div>
    <div class="caption">${escapeHtml(country.region || "")} · ${escapeHtml(country.country_code || "")}</div>
    <div class="sc-stats">
      <div><b>${libraryCount}</b><span>Libraries</span></div>
      <div><b>${awardCount}</b><span>Award records</span></div>
    </div>
    <p style="margin-top:10px"><a class="small" href="${withBase(APP_CONFIG.pages.countryProfile)}?id=${country.country_id}">View Country Profile →</a></p>`;
}

/* ---------- 无坐标提示 ---------- */

function renderNote(filteredLibraries) {
  const box = document.getElementById("map-note-box");
  const withoutCoords = filteredLibraries.filter(l => l.latitude === null || l.longitude === null);

  if (withoutCoords.length === 0) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  box.hidden = false;
  box.innerHTML = `
    <p class="map-note-text">
      <b>Known data limitation — not a system error.</b>
      Library-level map markers are currently unavailable because library coordinates are not included in
      the current validated dataset (${withoutCoords.length} of ${filteredLibraries.length} libraries
      matching the current filters have no latitude / longitude). No approximate or assumed coordinates
      are generated. All libraries remain fully accessible through the list below, the Libraries page
      and the global search.
    </p>`;
}

/* ---------- 与地图同步的图书馆列表 ---------- */

function renderList(filteredLibraries, countries) {
  const listEl = document.getElementById("map-library-list");
  const countEl = document.getElementById("map-list-count");

  countEl.textContent = `${filteredLibraries.length} libraries`;

  if (filteredLibraries.length === 0) {
    listEl.innerHTML = emptyState("No libraries match the current filters. Try adjusting or resetting the filters.");
    return;
  }

  const sorted = [...filteredLibraries].sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-Hans-CN"));

  listEl.innerHTML = `
  <div class="table-scroll">
  <table class="data-table">
    <caption class="visually-hidden">Libraries matching the current map filters</caption>
    <thead><tr><th>Library</th><th>City</th><th>Country</th><th>Type</th><th>Map</th></tr></thead>
    <tbody>
      ${sorted.map(l => {
        const hasCoords = l.latitude !== null && l.longitude !== null;
        return `
        <tr>
          <td><a href="${withBase(APP_CONFIG.pages.libraryProfile)}?id=${l.library_id}">${escapeHtml(l.name)}</a>
              ${l.name_en ? `<div class="muted-line">${escapeHtml(l.name_en)}</div>` : ""}</td>
          <td>${escapeHtml(l.city || "—")}</td>
          <td>${escapeHtml(getCountryName(countries, l.country_id))}</td>
          <td>${escapeHtml(LIBRARY_TYPE_LABELS[l.library_type] || l.library_type || "—")}</td>
          <td>${hasCoords
            ? `<span class="tag tag-type">On map</span>`
            : `<span class="tag tag-country">No coordinates</span>`}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>
  </div>`;
}

/* ---------- Filter Tags ---------- */

function renderFilterTags(state) {
  const tagsEl = document.getElementById("filter-tags");
  const tags = [];
  if (state.query) tags.push({ label: `Search: ${state.query}`, clear: () => setState({ query: "" }) });
  if (state.region) tags.push({ label: `Region: ${state.region}`, clear: () => setState({ region: "" }) });
  if (state.type) tags.push({ label: `Type: ${LIBRARY_TYPE_LABELS[state.type] || state.type}`, clear: () => setState({ type: "" }) });
  if (state.countryId !== null) {
    const country = allData.countries.find(c => c.country_id === state.countryId);
    tags.push({ label: `Country: ${country ? country.country_name : state.countryId}`, clear: () => setState({ countryId: null }) });
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
  buildFilterOptions();
  render();
}

/* ---------- 事件 ---------- */

function bindEvents() {
  let searchTimer = null;
  document.getElementById("q").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => setState({ query: value.trim() }), 200);
  });

  document.getElementById("f-region").addEventListener("change", (e) => setState({ region: e.target.value }));
  document.getElementById("f-type").addEventListener("change", (e) => setState({ type: e.target.value }));
  document.getElementById("f-country").addEventListener("change", (e) =>
    setState({ countryId: e.target.value ? Number(e.target.value) : null }));

  document.getElementById("btn-reset").addEventListener("click", () => {
    history.replaceState(null, "", window.location.pathname);
    hideTooltip();
    buildFilterOptions();
    render();
  });

  window.addEventListener("popstate", () => {
    buildFilterOptions();
    render();
  });
}

/* ---------- 启动 ---------- */

renderHeader("world-map");
renderFooter();
document.getElementById("breadcrumb").innerHTML = breadcrumb([
  { label: "Home", href: "index.html" },
  { label: "World Map" }
]);
init();
