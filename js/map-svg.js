/* ============================================================
   map-svg.js — 本地简化 SVG 世界地图（Prototype）
   设计原则（第八阶段 STEP 3 指令 11–12）：
   - 地图只是入口，数据库才是核心；地图数据来自 countries.json / libraries.json，
     本文件不包含任何国家 / 图书馆业务数据，只提供底图几何与投影换算。
   - 完全本地、内联 SVG：不使用 Google Maps / Mapbox / Leaflet / 在线瓦片，
     不需要 API Key，不产生任何网络地图依赖。
   - 边界为示意性简化轮廓（Prototype 级别），不追求精确地理边界。
   ============================================================ */

/* ---------- 投影（等距圆柱 / equirectangular） ---------- */

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

/**
 * 经纬度 → SVG 坐标（等距圆柱投影）。
 * 用于：国家中心点、图书馆坐标点（仅当数据中真实存在坐标时才调用）。
 */
export function project(lon, lat) {
  return {
    x: ((Number(lon) + 180) / 360) * MAP_WIDTH,
    y: ((90 - Number(lat)) / 180) * MAP_HEIGHT
  };
}

/* ---------- 简化大陆轮廓（[lon, lat] 顶点序列） ---------- */

const LANDMASSES = [
  { name: "North America", points: [[-168,65],[-140,70],[-100,72],[-75,68],[-58,60],[-53,47],[-66,44],[-76,35],[-81,26],[-90,29],[-97,26],[-105,20],[-114,29],[-124,40],[-125,49],[-135,58],[-152,59]] },
  { name: "Greenland", points: [[-46,60],[-22,70],[-20,78],[-30,84],[-58,82],[-62,72],[-55,64]] },
  { name: "South America", points: [[-78,8],[-62,11],[-52,5],[-35,-5],[-38,-16],[-48,-25],[-58,-34],[-70,-52],[-75,-46],[-71,-30],[-80,-15],[-81,-4]] },
  { name: "Europe", points: [[-10,36],[-9,43],[-2,49],[4,52],[8,54],[10,58],[20,60],[30,60],[40,50],[32,45],[28,41],[20,39],[13,38],[3,42]] },
  { name: "Africa", points: [[-17,15],[-5,6],[8,4],[11,-2],[13,-12],[15,-22],[20,-34],[27,-34],[35,-28],[41,-16],[43,-4],[51,12],[43,12],[33,30],[20,32],[10,37],[-2,35],[-16,22]] },
  { name: "Asia", points: [[40,50],[50,58],[70,66],[95,72],[120,73],[145,70],[160,62],[142,50],[133,43],[124,39],[122,31],[110,20],[105,10],[100,4],[98,12],[90,22],[80,15],[72,22],[62,25],[52,30],[45,38]] },
  { name: "Australia", points: [[114,-22],[122,-14],[132,-11],[142,-11],[152,-24],[151,-34],[140,-38],[130,-33],[117,-35],[113,-28]] },
  { name: "Antarctica", points: [[-180,-70],[-120,-73],[-60,-70],[0,-70],[60,-68],[120,-70],[180,-70],[180,-86],[-180,-86]] }
];

/**
 * 生成底图 SVG 字符串（只含大陆轮廓，不含任何数据点）。
 * 数据点（国家中心 / 图书馆坐标）由页面在 <g id="map-markers"> 中动态注入。
 */
export function baseMapSvg() {
  const paths = LANDMASSES.map(land => {
    const d = land.points
      .map(([lon, lat]) => {
        const { x, y } = project(lon, lat);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return `      <polygon class="landmass" points="${d}"><title>${land.name}</title></polygon>`;
  }).join("\n");

  return `
    <svg id="world-map-svg" class="world-map-svg" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}"
         role="img" aria-label="Simplified world map showing countries in the dataset. Library markers are shown only when real coordinate data is available.">
      <rect class="map-ocean" x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}"></rect>
      <g class="map-graticule" aria-hidden="true">
        <line x1="0" y1="125" x2="${MAP_WIDTH}" y2="125"></line>
        <line x1="0" y1="250" x2="${MAP_WIDTH}" y2="250"></line>
        <line x1="0" y1="375" x2="${MAP_WIDTH}" y2="375"></line>
        <line x1="250" y1="0" x2="250" y2="${MAP_HEIGHT}"></line>
        <line x1="500" y1="0" x2="500" y2="${MAP_HEIGHT}"></line>
        <line x1="750" y1="0" x2="750" y2="${MAP_HEIGHT}"></line>
      </g>
      <g class="map-land">
${paths}
      </g>
      <g id="map-markers" class="map-markers"></g>
    </svg>`;
}
