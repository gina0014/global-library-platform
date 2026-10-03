# C1 — Dynamic Map：MapLibre 动态地图

**分支**：`feature-dynamic-map`（自 B3 已合并的 `main` = `0608efd` 创建）
**范围**：本地 Dynamic MVP。未部署、无公网数据库、无生产变更。
**状态**：见 §8 Sprint Decision。

---

## 1. 目标

把 World Map 从"静态 SVG 示意图"升级为**动态地图**，同时守住两条底线：

1. **地图只是展示层** —— 数据仍然只有 `data-loader.js` 一个来源；
2. **坐标治理** —— 不猜坐标、不生成坐标、不用城市/国家中心点冒充图书馆坐标。

---

## 2. C1.1 坐标治理审计（先审计，后实现）

`scripts/step7_audit_coordinates.py`（只读，证据：`evidence/c1_coordinate_audit.json`）

| 维度 | valid | missing | invalid | 合计 |
|---|---|---|---|---|
| 全部 Library | **0** | **61** | **0** | 61 |
| 其中 published | **0** | **59** | **0** | 59 |
| `data/libraries.json` 基线 | **0** | **61** | **0** | 61 |

按 status 拆分：

| status | total | valid | missing | invalid |
|---|---|---|---|---|
| published | 59 | 0 | 59 | 0 |
| pending | 1 | 0 | 1 | 0 |
| draft | 1 | 0 | 1 | 0 |

**关键结论**

- 基线本身**没有**任何 Library 坐标（`latitude` / `longitude` 字段存在但全部为 NULL）。
  这不是迁移丢字段：DB 与 JSON 的坐标分类结果**逐条一致**（mismatch = 0）。
- 因此 **library marker 的真实覆盖率为 0 / 61**。
  按 C1 的规定，这不是失败：允许部分 Library 没有 marker，绝不为了凑数而伪造坐标。
- 期望 marker 数（published + valid coordinates）= **0**。C1-AC1 按这个真实值验收。
- 今后任何 Library 一旦获得**可信来源**的坐标，marker 会自动出现，无需改代码。

---

## 3. C1.2 MapLibre 引入方式

| 项 | 选择 | 理由 |
|---|---|---|
| 库 | MapLibre GL JS **4.7.1**（BSD-3-Clause） | 开源、无需 API Key |
| 引入方式 | **本地 vendored**：`assets/vendor/maplibre-gl/{maplibre-gl.js,maplibre-gl.css}` | 不依赖 CDN，离线可跑，控制台不会因 CDN 失败报错 |
| 底图 | **本地矢量**：`assets/maps/world-countries-110m.geojson` | Natural Earth 1:110m（public domain，可信来源），离线渲染，无在线瓦片、无外网请求 |
| 样式 | 代码内联 style（background + 国界 fill/line） | 不请求远程 style.json |

> 底图几何只用于"看得见世界轮廓"，**不承载任何业务数据**：
> 不含 Library / Award / Case / Source 的任何信息，也不参与任何计算。

---

## 4. 架构位置（数据链路不变）

```
data-loader.js ──► world-map.js ──► map-dynamic.js ──► MapLibre（渲染）
   ▲                    ▲
   │                    └── 过滤后的 libraries / countries（已发布）
   └── 唯一数据来源（API mode 走 Directus，json mode 走 data/*.json）
```

- 页面仍通过 `loadLibraries()` / `loadCountries()` / `getPublished()` 取数；
- `js/map-dynamic.js` **不取数**，只接收数据并渲染 marker；
- 页面**没有**建立任何新的数据源，也没有直接 fetch Directus / PostgreSQL。

---

## 5. C1.3 Marker 规则

| Marker | 条件 | 点击行为 |
|---|---|---|
| **Library** | `status = published` **且** `latitude` / `longitude` 均为有效数值 | `library.html?id=<library_id>`（沿用原 URL contract） |
| **Country** | 基线 `countries` 中已有的国家中心坐标，且该国有已发布 Library | 更新右侧 Selected Country 统计（与 SVG 版一致） |

坐标有效性判定（`isValidCoordinate()`，页面与审计脚本共用同一份实现）：

- 必须为有限数值，且 `lat ∈ [-90, 90]`、`lon ∈ [-180, 180]`；
- `(0, 0)` 视为**无效**（"无坐标"最常见的伪值），绝不作为默认点。

**无坐标的 Library**：不产生 marker，不影响 Library Profile / Libraries 列表 / 搜索，
页面仍显示既有"数据限制说明"提示框与同步列表（实测 59 行）。

---

## 6. 降级策略

`initDynamicMap()` 在 WebGL 不可用或 MapLibre 初始化失败时**返回 null**，
页面自动回退到原有的本地 SVG 地图 + SVG marker（既有行为完全保留），
不抛错、不产生控制台错误。SVG 视图在 MapLibre 生效时 `hidden`，不会出现两份底图。

---

## 7. 验收结果（`scripts/step8_verify_map.py`，真实 Edge headless + CDP）

| 验收项 | 结果 | 证据 |
|---|---|---|
| **C1-AC1** marker 数 = published + valid coordinates 数 | **PASS** | markers=0，期望 0（审计：valid=0 / missing=59） |
| **C1-AC2** marker 与 library_id 一一对应 | **PASS** | 测试夹具产生且仅产生 1 个 marker，ID 正确 |
| **C1-AC3** 点击 marker → `library.html?id=<id>` | **PASS** | `href=/pages/library.html?id=76`，落到该 Library Profile（非 Not Found） |
| **C1-AC4** 无坐标 Library 不产生错误 marker | **PASS** | `libraryIds=[]`；提示可见、列表 59 行、SVG 降级视图已隐藏 |
| **C1-AC5** 响应式正常 | **PASS** | 375 / 768 / 1440 px 均无横向溢出（overflow ≤ 0），地图容器可见 |
| **C1-AC6** Console new serious error = 0 | **PASS** | 地图页、夹具页、跳转页、三档视口全部 0 错误 |
| **C1-AC7** B2 / B3 核心回归 | **PASS** | step3 128/128、step6 53/53 |

**汇总：TOTAL=20 PASS=20 FAIL=0**

### 关于 AC2 / AC3 的测试夹具

基线坐标覆盖率为 0，基线数据下**不存在**任何 library marker，
仅靠基线无法验证 marker 管线（数量 → 对应 → 跳转）。
因此 `step8` 临时创建 **1 条测试夹具**记录（`C1-MARKER-FIXTURE-DO-NOT-USE`），
带一个明确标注为 test-only 的坐标，验证完成后**立即删除**（已核实 DB 回到 61 条、0 条夹具）。

该坐标只属于这条临时记录：

- 不写入 `data/*.json`（实测未改动）；
- 不代表任何真实图书馆的位置；
- 不在基线数据中留下任何痕迹。

---

## 8. 变更清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `js/map-dynamic.js` | 新增 | 地图展示层：离线底图 + marker 管线 + WebGL 降级判定 |
| `js/world-map.js` | 修改 | 接入动态地图；不可用时回退既有 SVG marker 路径 |
| `pages/world-map.html` | 修改 | 引入 MapLibre（本地 vendored）+ `#map-gl` 容器 + 图例说明 |
| `css/map-gl.css` | 新增 | 地图与 marker 样式（沿用 Design System 变量，不动既有 CSS） |
| `assets/vendor/maplibre-gl/*` | 新增 | MapLibre GL JS 4.7.1（BSD-3-Clause，本地 vendored） |
| `assets/maps/world-countries-110m.geojson` | 新增 | 底图几何：Natural Earth 1:110m（public domain） |
| `dynamic-mvp/scripts/step7_audit_coordinates.py` | 新增 | C1.1 坐标治理审计（只读） |
| `dynamic-mvp/scripts/step8_verify_map.py` | 新增 | C1-AC1…AC7 可执行验收 |
| `dynamic-mvp/scripts/browser_suite.mjs` | 修改 | 支持自定义求值表达式、视口尺寸、"先点击再读新页面" |
| `dynamic-mvp/IMPLEMENTATION-004.md` | 新增 | 本文档 |
| `data/*.json`、其余 `js/**`、Stage 1–10 产物 | **未改动** | — |

---

## 9. 安全

- 无 API Key、无 token、无 `.env` 内容进入任何前端资产。
- 无在线瓦片 / 无外网请求：MapLibre 与底图数据全部本地化。
- `data/*.json` 未被修改或删除（JSON fallback 保留）。
- 未提交 Docker runtime data、未提交 browser profile。

---

## 10. Known Limitations

1. **Library marker 覆盖率为 0 / 61**（基线无任何 Library 坐标）。这是数据现状，不是缺陷；
   补齐坐标需要可信来源，本轮刻意不猜测、不用城市/国家中心点代替。
2. Country marker 使用**国家中心坐标**（基线数据），用于国家维度导航，
   **不代表任何单个图书馆的位置**；页面图例已明确标注这一点。
3. 底图为 Natural Earth 1:110m 简化国界，仅示意；不是精确行政边界，也不含业务数据。
4. `isValidCoordinate()` 把 `(0, 0)` 判为无效：这是防"假坐标"的刻意为之，
   若将来确有位于 (0,0) 附近的真实图书馆，需要单独确认后调整判定。
5. 未接地理编码 / 未做 marker 聚合；61 个对象的规模下不需要。

---

## 11. Sprint Decision

`C1-AC1 … C1-AC7` 全部 **PASS**（20/20），B2 / B3 核心回归无衰减。

**C1 = READY FOR ACCEPTANCE**。

**未触发 STOP 条件**：坐标未被猜测（覆盖率如实记录为 0）；数据模型未改；
published-only 仍由服务端保证；无 secret；无数据损坏；Source provenance 完整；
Stage 1–10 产物未改（World Map 页属本工作包授权范围）。
