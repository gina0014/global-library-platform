/* ============================================================
   map-dynamic.js — C1 Dynamic Map（展示层；数据仍来自 data-loader.js）

   职责边界：
   - 本模块**不取数**。数据由调用方（页面）经 data-loader.js 取得后传入。
   - 地图只负责渲染：底图 + marker。
   - 全部离线：MapLibre 与国界数据均为本地 vendored 资产，
     不使用在线瓦片、不使用 API Key、除本地静态资产外无网络请求。

   Marker 规则（C1.1 / C1.3）：
   - Library marker：仅当 library 已发布 **且** latitude / longitude 均为有效数值。
     绝不推测、绝不生成、绝不用国家中心点冒充图书馆坐标。
   - Country marker：使用 countries 中已有的国家中心坐标（基线数据），
     用于国家维度导航，**不代表单个图书馆的位置**。
   - 点击 Library marker → library.html?id=<library_id>（沿用原 URL contract）。

   降级：WebGL 不可用 / MapLibre 初始化失败时返回 null，
   由页面回退到既有的本地 SVG 地图与列表，不抛错、不产生控制台错误。
   ============================================================ */

const COUNTRIES_GEOJSON = "../assets/maps/world-countries-110m.geojson";

/** 判断一对坐标是否为可用于打点的有效值（不猜测、不补齐、不替换）。 */
export function isValidCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  // (0, 0) 是"无坐标"最常见的伪值，视为无效
  return !(lat === 0 && lon === 0);
}

/** 按坐标有效性给一组 library 分类（审计脚本与页面提示复用同一份判定逻辑）。 */
export function classifyCoordinates(libraries) {
  const valid = [];
  const missing = [];
  const invalid = [];
  for (const lib of libraries || []) {
    const lat = lib.latitude;
    const lon = lib.longitude;
    if (lat === null || lat === undefined || lon === null || lon === undefined) {
      missing.push(lib.library_id);
    } else if (isValidCoordinate(lat, lon)) {
      valid.push(lib.library_id);
    } else {
      invalid.push(lib.library_id);
    }
  }
  return { valid, missing, invalid };
}

/** 本地底图样式：只有背景 + 国界填充，无在线瓦片源。 */
function baseStyle() {
  return {
    version: 8,
    name: "GLP local basemap",
    sources: {
      "world-countries": {
        type: "geojson",
        data: COUNTRIES_GEOJSON,
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#eaf2f8" } },
      {
        id: "countries-fill",
        type: "fill",
        source: "world-countries",
        paint: { "fill-color": "#d3e0ec" },
      },
      {
        id: "countries-outline",
        type: "line",
        source: "world-countries",
        paint: { "line-color": "#9fb3c8", "line-width": 0.6 },
      },
    ],
  };
}

function markerElement(className, dataset, ariaLabel, labelText) {
  const el = document.createElement("div");
  el.className = className;
  el.setAttribute("role", "link");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", ariaLabel);
  Object.entries(dataset).forEach(([key, value]) => {
    el.dataset[key] = value;
  });
  const dot = document.createElement("span");
  dot.className = "glp-marker-dot";
  const label = document.createElement("span");
  label.className = "glp-marker-label";
  label.textContent = labelText;
  el.appendChild(dot);
  el.appendChild(label);
  return el;
}

function bindGo(el, go) {
  el.addEventListener("click", go);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  });
}

/**
 * 初始化动态地图。只创建底图，marker 由 setData() 按需重建。
 * @param {Object} args
 * @param {HTMLElement} args.container 地图容器
 * @param {Function} args.onSelectCountry 点击国家 marker 的回调
 * @returns {Object|null} 句柄；WebGL / MapLibre 不可用时返回 null（页面降级）
 */
export function initDynamicMap({ container, onSelectCountry }) {
  const gl = window.maplibregl;
  if (!gl || !container) return null;

  let map;
  try {
    map = new gl.Map({
      container,
      style: baseStyle(),
      center: [10, 25],
      zoom: 1.1,
      minZoom: 1,
      maxZoom: 8,
      attributionControl: false,
      renderWorldCopies: false,
    });
  } catch (err) {
    return null;
  }

  let placed = [];
  let libraryMarkers = [];
  let countryMarkers = [];

  function setData({ libraries, countries }) {
    placed.forEach((m) => m.remove());
    placed = [];
    libraryMarkers = [];
    countryMarkers = [];

    // ---- Country marker：国家中心坐标（基线数据），国家维度导航 ----
    for (const c of countries || []) {
      if (!isValidCoordinate(c.latitude, c.longitude)) continue;
      const el = markerElement(
        "glp-marker glp-marker-country",
        { markerType: "country", countryId: String(c.country_id) },
        `${c.country_name}. Open country profile.`,
        c.country_name
      );
      bindGo(el, () => {
        if (typeof onSelectCountry === "function") onSelectCountry(c);
      });
      const m = new gl.Marker({ element: el })
        .setLngLat([Number(c.longitude), Number(c.latitude)])
        .addTo(map);
      placed.push(m);
      countryMarkers.push({ country_id: c.country_id, marker: m });
    }

    // ---- Library marker：仅 published + 有效坐标 ----
    for (const l of libraries || []) {
      if (l.status && l.status !== "published") continue;
      if (!isValidCoordinate(l.latitude, l.longitude)) continue;
      const el = markerElement(
        "glp-marker glp-marker-library",
        { markerType: "library", libraryId: String(l.library_id) },
        `${l.name}${l.city ? ", " + l.city : ""}. Open library profile.`,
        l.name
      );
      bindGo(el, () => {
        window.location.href = `../pages/library.html?id=${l.library_id}`;
      });
      const m = new gl.Marker({ element: el })
        .setLngLat([Number(l.longitude), Number(l.latitude)])
        .addTo(map);
      placed.push(m);
      libraryMarkers.push({ library_id: l.library_id, marker: m });
    }

    // 供页面提示与验收脚本读取（沿用 world-map.js 既有约定）
    document.body.dataset.libraryMarkers = String(libraryMarkers.length);
    document.body.dataset.countryMarkers = String(countryMarkers.length);
    document.body.dataset.mapEngine = "maplibre";
    return { libraryCount: libraryMarkers.length, countryCount: countryMarkers.length };
  }

  const onResize = () => map.resize();
  window.addEventListener("resize", onResize);

  return {
    engine: "maplibre",
    map,
    setData,
    get libraryMarkers() {
      return libraryMarkers;
    },
    get countryMarkers() {
      return countryMarkers;
    },
    destroy() {
      window.removeEventListener("resize", onResize);
      placed.forEach((m) => m.remove());
      placed = [];
      map.remove();
    },
  };
}
