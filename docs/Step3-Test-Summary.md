# Stage 8 · STEP 3 综合测试报告（Integrated Feature Development）

- **版本**：Stage8-Step3-v0.3
- **测试日期**：2026-09-19
- **测试环境**：Windows 11 · Microsoft Edge headless（`--dump-dom` + CDP `Emulation.setDeviceMetricsOverride`）
- **运行方式**：本地静态服务器 `python -m http.server 8013 --directory <交付副本>`（交付目录本身不被测试脚本修改）
- **测试副本**：`%TEMP%\step3test\site\`（交付目录的拷贝，仅副本注入 error-capture / 溢出探针）
- **覆盖范围**：12 类前台页面 + 404 + 全站搜索 + 内部链接闭环，共 **A–I 九个模块**

## 0. 结果总览

| 模块 | 覆盖内容 | 通过 / 总数 |
|---|---|---|
| A · Regression | STEP 1 / STEP 2 回归（Home / Libraries / Library Profile / Country Profile） | **12 / 12** |
| B · Awards | P-06 Awards 列表 + P-07 Award Profile + Award Results + 来源 | **20 / 20** |
| C · Cases | P-08 Cases 列表 + P-09 Case Detail + FK 链 + 来源 | **16 / 16** |
| D · World Map | P-02 地图渲染 / Marker / 坐标诚实性 / 筛选联动 / 无障碍 | **11 / 11** |
| E · Search | 全站搜索分组结果 / 四类命中 / 英文国家名 / 空态 | **13 / 13** |
| F · Ask AI | P-10 规则式查询 / Demo 标注 / 不编造 | **10 / 10** |
| G · About | P-11 八小节 / 动态统计 / 无未确认背书 | **5 / 5** |
| H · Admin | P-12 原型 / 动态统计 / 三状态 / 按钮不写入 | **9 / 9** |
| I · Technical | 12 类页面无 JS Error / 静态内部链接无死链 | **2 / 2** |
| **合计** | | **98 / 98（0 FAIL）** |

附加审计（CDP 真实视口）：

| 审计项 | 视口 | 结果 |
|---|---|---|
| 横向溢出（scrollWidth > clientWidth） | 1440 / 900 / 390 | **42 / 42 无溢出**（14 页 × 3 档） |
| Console Error / unhandledrejection | 1440 / 900 / 390 | **0** |
| `<h1>` 唯一性 | 全部页面 | 1 / 页（404 页为状态组件，无 h1） |
| `<img>` 缺 alt | 全部页面 | 0（全站无位图素材，图形为内联 SVG，已 `aria-hidden` / `role`） |
| 小尺寸可点目标（< 24px） | 全部页面 | 0 |
| 意外 404 请求（页面资源） | 全部页面 | 0 |

---

## A · Regression（STEP 1 / STEP 2 回归）

| 用例 | 结果 |
|---|---|
| Home 打开且统计为 10 / 22 / 5 / 9 | PASS |
| Home 导航 7 项齐全且 href 可用 | PASS |
| Home Header 含全站搜索表单（`#header-search-form` → `pages/search.html`） | PASS |
| Home 入口区块 Explore the Platform 存在 | PASS |
| Home 无 Console Error | PASS |
| Libraries 列表 22 条 published + 分页 9 条/页 | PASS |
| Libraries 卡片显示国家名（FK 解析） | PASS |
| Libraries 无 Console Error | PASS |
| Library Profile（id=3 清华大学图书馆）正常渲染（名称 / Sources / Quick Facts） | PASS |
| Library Profile 无 Console Error | PASS |
| Country Profile（id=1 中国）统计与 Award-winning Libraries 区块 | PASS |
| Country Profile 无 Console Error | PASS |

> **回归结论**：STEP 1 与 STEP 2 交付的页面在 STEP 3 改动（Header 搜索、Footer 列、卡片组件、工具函数）后全部保持可用，未出现功能退化。

## B · Awards（P-06 / P-07）

| 用例 | 结果 |
|---|---|
| P-06 列表渲染 5 个 published 奖项 | PASS |
| 搜索 award_name（IFLA）→ 命中 3 条（名称 / organizer / description 均含 IFLA） | PASS |
| 搜索 organizer 命中 | PASS |
| 搜索 description 命中 | PASS |
| 筛选 organizer（动态生成，取自 published 数据） | PASS |
| 筛选 frequency = biennial → 1 条 | PASS |
| 排序 name / updated / founded 三种 | PASS |
| 状态写入 URL（q / organizer / frequency / sort / page）并可回退 | PASS |
| Filter Tags 与 Clear Filters | PASS |
| 无匹配时 Empty State | PASS |
| P-07 Award Profile 头部 / Overview / Award Information | PASS |
| official_website 为空时不渲染该行 | PASS |
| Award Results 经 Award → Award_Result → Library 解析 | PASS |
| Award Results 年份倒序 | PASS |
| category = general 不显示标签 | PASS |
| category ≠ general 显示标签 | PASS |
| award-result-source 在每条结果旁提供来源入口（`<details>` 展开） | PASS |
| Related Libraries / Related Awards 区块 | PASS |
| P-06 / P-07 无 Console Error | PASS |
| 数据对象未增加冗余字段（award_name / library_name 等均经 ID 计算） | PASS |

## C · Cases（P-08 / P-09）

| 用例 | 结果 |
|---|---|
| P-08 列表渲染 9 个 published 案例 | PASS |
| 搜索 title | PASS |
| 搜索 description | PASS |
| 搜索所属 Library 名称 | PASS |
| 筛选 topic | PASS |
| 筛选 year = 2018 → 2 条（Insta Novels / Oodi） | PASS |
| 筛选 country（经 Case → Library → Country 计算，未写入 Case JSON） | PASS |
| 排序 year / updated / title | PASS |
| 状态写入 URL 并可回退 | PASS |
| P-09 Case Detail：Project Information / Library / Country / Sources | PASS |
| Case → Library 与 Case → Country 链接可点击 | PASS |
| Case Detail 复用统一 Source 组件（`source-item`） | PASS |
| Case Detail 无 Console Error | PASS |
| 不存在 ID → Case Not Found（统一状态组件 + 返回入口） | PASS |
| pending 案例（id=3）→ Not Found（不泄漏未发布内容） | PASS |
| published 案例（id=10）正常显示 | PASS |

## D · World Map（P-02）

| 用例 | 结果 |
|---|---|
| 页面打开且本地 SVG 地图渲染 | PASS |
| **国家 Marker = 8**（= 拥有已发布图书馆的国家数） | PASS |
| **图书馆 Marker = 0**（全部馆坐标为空，未伪造坐标） | PASS |
| 无坐标提示文案存在 | PASS |
| 地图下方提供图书馆完整列表（地图非唯一入口） | PASS |
| Marker 可 Focus（`tabindex="0"`）且含 `aria-label` | PASS |
| 无在线地图依赖（无 Google Maps / Mapbox / Leaflet / 在线瓦片 / API Key） | PASS |
| World Map 无 Console Error | PASS |
| Country 筛选联动（中国 → 6 家馆） | PASS |
| Library type 筛选联动（national） | PASS |
| 无匹配时 Empty State | PASS |

> **坐标诚实性说明**：`libraries.json` 中 24 家图书馆的 `latitude` / `longitude` 全部为 `null`。按指令"不得伪造坐标"的要求，地图仅渲染国家 Marker（坐标取自 `countries.json` 真实国家中心点），图书馆 Marker 数为 0，并在图例与列表处显示 "Some libraries are not displayed on the map because coordinate data is unavailable."。

## E · Search（全站搜索升级）

| 用例 | 结果 |
|---|---|
| Country 可搜（中国 → 中国 + 该国图书馆） | PASS |
| Library 中文可搜（北京 → 3 条） | PASS |
| Library 英文可搜（Oodi） | PASS |
| Award 可搜（IFLA → 奖项 + organizer 命中） | PASS |
| Case 可搜（Insta Novels） | PASS |
| **英文国家名可搜（Denmark → 丹麦 + 丹麦图书馆）** | PASS |
| 结果为分组显示（Countries / Libraries / Awards / Cases + Type Badge） | PASS |
| 结果链接跳转真实详情页 | PASS |
| Empty State 正常 | PASS |
| 无关键词时提示输入 | PASS |
| Search 结果页无 Console Error | PASS |
| 交叉验证（Node 直调 `searchAllUpgraded`）：Denmark → Country + Library | PASS |
| 交叉验证（Node 直调 `searchAllUpgraded`）：中国 → Country + Library + Case | PASS |

## F · Ask AI Demo（P-10）

| 用例 | 结果 |
|---|---|
| 明确标注 Prototype / Demo | PASS |
| 无 API Key / 无真实 LLM 引用 | PASS |
| Suggested Questions 存在（含指令要求 4 条） | PASS |
| 本地 JSON 查询数据加载就绪（无 Loading 卡死） | PASS |
| 无 Console Error | PASS |
| 建议问题 1 可运行（award-winning libraries → 17 家） | PASS |
| 建议问题 2 可运行（green library → 2 条获奖 + 2 个可持续案例 + 6 来源） | PASS |
| 建议问题 3 可运行（Denmark → 2 家馆） | PASS |
| 建议问题 4 可运行（public libraries in China → 4 家） | PASS |
| 未知问题不编造（matched=false，items=0） | PASS |

> **实现方式**：`answerQuestion(question, data)` 为纯前端规则式查询，关键词 → 意图匹配（green library / 获奖图书馆 / 按国家+类型查馆 / 案例 / 全部图书馆），仅在本地 JSON 上做检索与计数；命中失败时回复 "this prototype only supports a limited set of data queries"，不生成任何推测内容。

## G · About（P-11）

| 用例 | 结果 |
|---|---|
| 页面正常且八个小节齐全 | PASS |
| 统计动态读取 JSON（10 / 22 / 5 / 9） | PASS |
| 无未确认合作方 / 资助方 / 联系方式 | PASS |
| 状态工作流只有三种（Draft / Pending / Published） | PASS |
| 无 Console Error | PASS |

## H · Admin Dashboard Prototype（P-12）

| 用例 | 结果 |
|---|---|
| 统计动态读取 JSON（六类核心对象 + 5 张关联表） | PASS |
| Content Status 展示 Published / Pending / Draft | PASS |
| 状态数量与 JSON 一致（published 127 / pending 3 / draft 1） | PASS |
| Recent Updates 表含 Object type / Name / Status / Last updated | PASS |
| Edit / Review / Publish 按钮存在且标注为原型 UI | PASS |
| Review Workflow 仅 Draft → Pending → Published（无第四状态） | PASS |
| 无登录 / 账号 / 密码输入 | PASS |
| **点击 Edit 显示提示且不修改数据**（`Administrative editing is not enabled in this prototype.`） | PASS |
| 无 Console Error | PASS |

## I · Technical

| 用例 | 结果 |
|---|---|
| 12 类页面全部无 JavaScript Error（含 unhandledrejection） | PASS |
| 静态 HTML 内部链接无死链（无 Coming Soon 残留） | PASS |

### 响应式三档视口审计（CDP）

| 页面 | 1440px | 900px | 390px |
|---|---|---|---|
| P-01 Home | ok | ok | ok |
| P-02 World Map | ok | ok | ok |
| P-03 Libraries | ok | ok | ok |
| P-04 Library Profile | ok | ok | ok |
| P-05 Country Profile | ok | ok | ok |
| P-06 Awards | ok | ok | ok |
| P-07 Award Profile | ok | ok | ok |
| P-08 Cases | ok | ok | ok |
| P-09 Case Detail | ok | ok | ok |
| Search Results | ok | ok | ok |
| P-10 Ask AI | ok | ok | ok |
| P-11 About | ok | ok | ok |
| P-12 Admin | ok | ok | ok |
| 404 | ok | ok | ok |

> 宽表（Award Results / Country 获奖表 / Admin 对象表）统一包在 `.table-scroll` 内，窄屏在地图/表格内部横向滚动，不会撑破页面布局。

---

## 测试过程中发现并修复的问题

| # | 问题 | 类型 | 处理 |
|---|---|---|---|
| 1 | 搜索 "China" / "Denmark" 等英文国家名无 Country 结果（数据中 `country_name` 为中文） | 产品缺陷 | `js/utils.js` 新增 `COUNTRY_ALIASES` 英文别名查询层（仅存在于查询解析层，不写入 JSON），英文字名命中国家时其属下图书馆一并命中 |
| 2 | About 页文案含 "partners" 字样，可能被理解为存在合作方 | 合规风险 | 改写为 "No external support, affiliation or endorsement is claimed." |
| 3 | P-04 Library Profile / P-07 Award Profile 在 390px 视口横向溢出（421px / 405px） | 响应式缺陷 | `css/pages.css` 增加 Grid/Flex 子项 `min-width: 0` 与长文本 `overflow-wrap: anywhere` 规则 |
| 4 | 测试脚本断言值未经数据核对（IFLA 应 3 条而非 1 条、biennial 1 条、2018 年 2 案例、pending 案例为 id=3、国家 Marker 为 8 个） | 测试缺陷 | 逐项核对 JSON 后修正期望值 |
| 5 | Library Profile 断言检查 "View" 字样，页面实际从不渲染该词 | 测试缺陷 | 改为断言页面真实内容（名称 / Sources / Quick Facts） |
| 6 | Admin Dashboard 断言把 "Cases" 当作对象标签，实际标签为 `Case_Projects` | 测试缺陷 | 修正断言，并新增交互测试（点击 Edit 后校验提示文案） |
| 7 | Node 交叉验证脚本放在 `site/` 之外导致 ERR_MODULE_NOT_FOUND | 测试缺陷 | 脚本移入 `site/` 内，输出加 `RESULT`/`SEARCH` 前缀便于解析 |

> 说明：#4–#7 为测试脚本自身缺陷，不涉及交付代码；#1–#3 为交付代码改进，已回归验证（98 / 98 通过）。

## 测试方法说明

- **DOM 断言**：Edge headless `--dump-dom --virtual-time-budget`，每次使用独立 `--user-data-dir`，避免缓存串扰。
- **错误捕获**：向测试副本注入 `error-capture.js`，捕获 `console.error` / `window.onerror` / `unhandledrejection` 并写入 `body[data-errors]`，断言值为 0。
- **交互测试门控**：Admin 交互脚本以 `?admintest=1` 门控，仅在该 URL 参数下运行，避免污染其他用例的 DOM 快照。
- **分支逻辑交叉验证**：对 `searchAllUpgraded` / `answerQuestion` 两个纯函数用 Node 直接 `import` 调用，绕过浏览器渲染层，验证返回值结构。
- **响应式审计**：通过 CDP `Emulation.setDeviceMetricsOverride` 设定真 1440 / 900 / 390 视口（headless `--window-size` 存在 470px 下限，不足以测试移动端），`Runtime.evaluate` 读取 `scrollWidth` 与越界元素，并排除位于可滚动容器内部的合法越界。

## 已知限制（非缺陷，属原型范围）

1. 图书馆坐标全部缺失 → 地图无图书馆 Marker（设计上选择诚实标注，不伪造坐标）。
2. Ask AI 为规则式本地查询，仅支持 5 类意图，不具备自然语言泛化能力。
3. Admin Dashboard 为纯 UI 原型，不提供任何数据写入能力。
4. 无后端、无登录、无 CMS、无真实 AI API（符合 STEP 3 指令的禁止项）。
