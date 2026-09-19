# Stage 8 · Final QA Report

**版本**：Stage8-v1.0-Prototype（由 Stage8-Step3-v0.3 验收并冻结）
**日期**：2026-09-19
**范围**：VERIFY → FIX → DOCUMENT → FREEZE（不新增业务模块、不重新设计页面、不改数据模型与 JSON）

---

## 1. Test Environment 测试环境

| 项目 | 内容 |
|---|---|
| 操作系统 | Windows 11 |
| 浏览器 | Microsoft Edge（headless 渲染 + CDP 设备模拟） |
| 服务器 | `python -m http.server 8000`（官方方式）+ `py -m http.server`（Windows 启动器） |
| 测试副本 | `%TEMP%\finalqa\site\`（交付目录拷贝；错误捕获脚本仅注入副本，交付目录未被修改） |
| 测试方法 | `--dump-dom` DOM 断言；CDP `Emulation.setDeviceMetricsOverride` + `Runtime.evaluate`；`Input.dispatchKeyEvent` 键盘测试；Node/Python 数据校验；curl 链接爬取 |
| 基线 | Final QA 开始前记录 95 个文件与 11 个 JSON 的 MD5 |

**文件基线**：总计 95 个文件 —— HTML 15、JS 18、CSS 7、JSON 11、MD 9、PNG 34、SVG 1。

---

## 2. Pages Tested 页面测试

| 编号 | 页面 | 结果 |
|---|---|---|
| P-01 | Home | PASS |
| P-02 | World Map | PASS |
| P-03 | Country Profile | PASS |
| P-04 | Libraries | PASS |
| P-05 | Library Profile | PASS |
| P-06 | Global Awards | PASS |
| P-07 | Award Profile | PASS |
| P-08 | Cases | PASS |
| P-09 | Case Detail | PASS |
| P-10 | Ask AI (Demo) | PASS |
| P-11 | About | PASS |
| P-12 | Admin Dashboard | PASS |
| — | Search Results | PASS |
| — | 404 | PASS |

12 类页面 + Search + 404 全部渲染正常、无 "Unable to load platform data"、Console Error = 0。

---

## 3. Data Integrity 数据完整性

| 检查项 | 结果 |
|---|---|
| 11 个 JSON 合法 + UTF-8 | PASS（0 解析错误） |
| 6 张核心表 ID 唯一 | PASS（country/library/award/award_result/case/source 全部无重复） |
| FK 完整（Library→Country、Award_Result→Award/Library、Case→Library） | PASS |
| 5 张来源关联表双向 FK 完整 | PASS（孤立关系 0） |
| 关联表复合主键唯一 | PASS |
| Award_Result 唯一约束 (award_id, library_id, year, category, result_type) | PASS（0 重复） |
| status 合法（draft / pending / published） | PASS |
| 必填字段非空 | PASS |
| 数值字段类型正确（year / latitude / longitude） | PASS |
| 关联覆盖 | Country 10/10、Library 24/24、Award 5/5、Award_Result 23/23、Case 10/10 均有来源；Source 59/59 均被引用 |

**Runtime JSON Data Drift**：Final QA 前后各计算一次 MD5，并与第七阶段原件比对 —— **11 / 11 一致，Drift = 0**。

---

## 4. Functional Testing 功能测试

| 模块 | 内容 | 结果 |
|---|---|---|
| 页面渲染与控制台 | 14 个页面 × 渲染 + Console Error | 28 / 28 PASS |
| published 状态泄漏 | 前台无未发布记录作为链接 / 标题 / 单元格出现；无指向未发布对象的链接 | PASS |
| 非法 ID | `?id=999999 / 空 / abc / -1 / 1.5`（4 类详情页 × 5 种）| 40 / 40 PASS（统一 Not Found + 返回入口，无空白、无 undefined） |
| 抽样深度测试 | 7 家馆（3 中国 / 2 美国 / 2 欧洲），覆盖有奖无案例、有奖有案例、仅案例、可选字段缺失、非 general category、无奖无案例 | PASS（无 undefined / null 文本；内部链接全部可达） |
| Last Updated | 4 类详情页使用对象自身 `last_updated`，且不重复堆砌 | PASS（每页 1 处） |
| Source | 5 类来源外链 `target="_blank"` + `rel="noopener noreferrer"`；无 undefined / null | PASS |

---

## 5. Relationship Testing 关系测试（FK）

| 关系链 | 结果 |
|---|---|
| Country → Library | PASS（中国 6/6） |
| Library → Country | PASS |
| Library → Award_Result → Award | PASS（2/2） |
| Award → Award_Result → Library | PASS（9/9） |
| Library → Case | PASS（1/1） |
| Case → Library → Country | PASS |
| Country → Library → Case | PASS（3/3） |
| Country → Library → Award_Result | PASS（6/6） |
| Core Entity → Source Relation → Source | PASS（5 类关系链均有来源） |
| Award_Result → Source（每条结果旁） | PASS（2/2 条带来源入口） |

所有关系均通过 ID 解析，页面代码中不存在"复制名称绕过外键"的写法。

---

## 6. Search / Filter Testing 搜索与筛选

**Search（14 组关键词）**：中文馆名、英文馆名、国家中文名、国家英文别名（Denmark / China）、
奖项名、主办方（中文）、案例标题、案例描述关键词、不存在关键词、特殊字符（含 `<script>`）、
大小写（OODI）、前后空格、空搜索 —— 全部无 Console Error；无结果时显示 Empty State；
结果链接指向真实详情页；搜索不到未发布内容。

**Filters（15 组组合）**：Libraries（国家 / 类型 / 大洲 / 关键词 单·双·三条件 + 0 结果）、
Awards（主办方 / 频率 + 组合 + 0 结果）、Cases（主题 / 年份 / 国家 + 组合 + 0 结果）——
计数与实际数据一致（由数据计算期望值）。

**Sorting（8 组）**：Libraries（name / updated）、Awards（name / updated / founded）、
Cases（year / updated / title）—— `founded_year` 为 NULL 的奖项不报错、不丢失、顺序稳定（两次渲染一致）。

**Pagination（8 组）**：首页 / 中间页 / 末页（`1–9 / 10–18 / 19–22 of 22`）、筛选后页数减少、
末页收敛、超出页码（page=99）不空白、搜索后结果减少；末页"下一页"与首页"上一页"为禁用态（不可点击）。

**Clear Filters（3 个列表页，CDP 真实点击）**：URL 条件清空、搜索框清空、结果恢复、无 Console Error。

---

## 7. Map Testing 地图测试

| 项 | 结果 |
|---|---|
| 本地 SVG 地图，无在线地图 / API Key | PASS |
| 国家 Marker = 8（使用 countries.json 真实国家中心坐标） | PASS |
| **图书馆 Marker = 0**（24/24 馆坐标为 NULL，未伪造坐标） | PASS |
| 图例明确 "Country / region browsing marker … not an individual library location" | PASS |
| Known Limitation 文案 "Known data limitation — not a system error" | PASS |
| 地图非唯一入口（Library List / Libraries 页 / Global Search / Country 入口） | PASS |
| Marker 可 Tab 聚焦 + aria-label + tooltip | PASS |

---

## 8. Ask AI Testing 智能问答原型

| 项 | 结果 |
|---|---|
| 显著标注 Prototype / Demo、rule-based prototype | PASS |
| 无 API Key / 无外部 LLM / 无外部网络请求 | PASS |
| 5 条 Supported Queries 全部可运行并返回本地数据集结果 | PASS |
| 答案区标注 "Demo answer generated from the local prototype dataset" | PASS |
| 未知问题不编造（提示 limited set of data queries，items = 0） | PASS |
| 说明未来方向三层（Structured Database Query / Knowledge Retrieval / Source-grounded AI）并明确 not implemented | PASS |

---

## 9. Admin Testing 后台原型

| 项 | 结果 |
|---|---|
| 六类核心对象 + 5 张关联表统计由 JSON 实时计算 | PASS |
| Published / Pending / Draft 三状态统计正确 | PASS |
| Edit 按钮点击后提示 "Administrative editing is not enabled in this prototype." | PASS |
| 点击后数据未被修改（重载统计一致） | PASS |
| 无登录 / 密码 / 账号控件 | PASS |
| 无 Console Error | PASS |

---

## 10. Responsive Testing 响应式测试

CDP 真实视口，8 个宽度 × 14 页 = **112 项**：

| 档位 | 宽度 | 结果 |
|---|---|---|
| Desktop | 1440 / 1280 / 1200 | 无横向溢出、无 Console Error |
| Tablet | 1024 / 768 | 无横向溢出、无 Console Error |
| Mobile | 390 / 375 / 320 | 无横向溢出、无 Console Error |

宽表（Award Results / Admin 对象表 / 地图列表）在 `.table-scroll` 内部横向滚动，
页面整体不产生横向滚动条。长英文馆名、长奖项名、长 Organizer、长来源标题与超长搜索词
在 320px 下均不撑破卡片与视口。

---

## 11. Accessibility Basics 可访问性基础

| 项 | 结果 |
|---|---|
| Tab 可达 Header 导航 / 搜索框 / 筛选控件 / 按钮 / 卡片链接 | PASS（14 页，每页 ≥6 个可聚焦元素） |
| 焦点样式可见（`:focus-visible` 2px 轮廓） | PASS（样式表静态校验；headless 合成按键不触发 :focus-visible 启发式，故以样式表为准） |
| 语义结构 header / nav / main / section / footer | PASS（404 页为状态组件） |
| H1 每页一个 | PASS |
| 表单控件均有 label / aria-label | PASS |
| SVG 均有 aria-label / aria-hidden / title | PASS |
| 当前导航 aria-current | PASS |
| 图片 alt | PASS（全站无位图，图形均为内联 SVG） |

---

## 12. Console / 404

| 项 | 结果 |
|---|---|
| console.error / uncaught exception / unhandledrejection | **0**（14 页 × 8 档视口 + 交互流程） |
| 资源加载失败 | **0** |
| 内部链接爬取（静态 52 + 渲染 47 → 去重 99 个） | **Unexpected Internal 404 = 0** |
| 49 条记录的详情页链接 | 全部 200（未发布记录返回 200 + Not Found 状态） |

---

## 13. Issues Found 发现的问题

| # | 问题 | 类型 |
|---|---|---|
| BUG-1 | `case.html?id=8` 显示未发布图书馆（library_id=18 pending）的中文名与英文名，并提供指向 Not Found 的死链；Cases 列表同样暴露 —— 前台泄漏未发布对象 | 产品缺陷（根因是数据状态链不一致 DI-003） |
| BUG-2 | Award Results 表为 `category = "general"` 的记录渲染 `— (general)` 无意义标签 | 产品缺陷（违反 V0.2 三级语义的展示约定） |
| BUG-3 | World Map 页内图书馆 / 国家档案链接未做 `withBase()` 换算，渲染为 `pages/library.html?id=N`，从 `pages/` 目录点击会跳到 `/pages/pages/…`（404 死链） | 产品缺陷 |
| BUG-4 | 搜索页超长无空格关键词（60 字符）在 320px 下无法断行，导致整页横向溢出 | 产品缺陷 |
| BUG-5 | 分页首/末页的"上一页 / 下一页"渲染为可点击链接（仅 aria-disabled），可跳到无效页码 | 产品缺陷（轻微） |
| OBS-1 | 地图图例原文 "Country with published records" 可能被误读为图书馆位置 | 文案歧义 |
| OBS-2 | Ask AI 未说明"规则式原型 + 未来三层方向（未实现）" | 透明性不足 |
| OBS-3 | 404 页只有 Return Home，缺少 Browse Libraries / Browse Awards 入口 | 完整性不足 |
| DI-003 | 3 条已发布子记录（case 8 / award_result 8、13）挂在未发布图书馆下 | **数据问题**（未改 JSON，已登记） |

---

## 14. Issues Fixed 已修复

| # | 修复 | 文件 |
|---|---|---|
| BUG-1 | 新增统一可见性规则：子对象 published **且**父 Library published 才可见（`isCaseVisible()` / `getVisibleCases()`），并接入 Cases 列表、Case Detail、Home 统计与 Featured、Global Search、Ask AI、About | `js/utils.js`、`js/cases.js`、`js/case.js`、`js/home.js`、`js/about.js` |
| BUG-2 | `category === "general"` 只渲染 `—`，不再显示 "(general)" | `js/award.js` |
| BUG-3 | 地图页内链接统一改用 `withBase()`（含 Marker 跳转、Selected Country、图书馆列表） | `js/world-map.js` |
| BUG-4 | 结果计数 / 状态文本 / 标题允许长词断行 | `css/pages.css` |
| BUG-5 | 禁用态分页渲染为 `<span class="page-btn disabled">`（不可点击） | `js/components.js` |
| OBS-1 | 图例改为 "Country / region browsing marker … not an individual library location"；Library marker 说明补充"（当前无）" | `pages/world-map.html` |
| OBS-2 | 补充"未来方向三层（未实现）"说明块，并明确 rule-based prototype | `pages/ask-ai.html` |
| OBS-3 | 404 增加 Return Home / Browse Libraries / Browse Awards + 搜索、案例、地图入口 | `404.html` |
| DOC | README 全面重写（15 节，含三平台启动方式与 5 条 Known Limitations）；数据/设计问题记录更新 | `README.md`、`docs/Development-Data-Issues.md`、`docs/Development-Design-Issues.md` |

**修复后回归**：Home / Libraries / Library Profile / Awards / Award Profile / Cases / Case Detail
以及全部 14 页 × 8 档视口重新测试，**0 FAIL**。

---

## 15. Remaining Known Limitations 遗留已知限制

1. **图书馆级地图 Marker 不可用** —— 已验证数据集中 24/24 家图书馆经纬度为 NULL；原型不生成任何近似或推测坐标。
2. **Ask AI 为规则式本地演示** —— 非生产 LLM / RAG；仅支持有限查询，未实现数据库检索、知识检索与来源引用生成。
3. **Admin Dashboard 为界面原型** —— 不写入数据库，不提供登录与权限。
4. **静态验证 JSON 而非实时数据库 / 后端** —— 无写入、无登录、无 CMS。
5. **Design Baseline 的 DEFER 项仍在范围外** —— 坐标补全、国家英文名字段、多语言名称体系等
   （英文国家名检索已由查询层别名临时支持，未改数据）。
6. **数据状态链不一致（DI-003）** —— 3 条已发布子记录挂在未发布图书馆下；前端已整体隐藏，待第七阶段确认处理方式。
7. **可访问性仅完成基础检查** —— 未做完整 WCAG 审计。

---

## 16. Final Result 最终结果

| 指标 | 结果 |
|---|---|
| 页面 | **12 / 12 类页面 + Search + 404 全部通过** |
| 功能测试（页面 / 泄漏 / FK / 抽样 / 奖项 / 来源 / 非法 ID / 修复项） | **174 / 174 PASS** |
| 交互测试（Search / Filters / Sorting / Pagination / Clear / Ask AI / Admin） | **144 / 144 PASS** |
| 响应式与语义（8 档视口 × 14 页） | **89 / 89 PASS** |
| 键盘基础测试 | **30 / 30 PASS** |
| 数据完整性校验 | **50 / 50 PASS** |
| 可移植性与外部依赖 | **6 / 6 PASS** |
| 内部链接爬取 | **3 / 3 PASS**（99 个链接 0 个意外 404） |
| **合计** | **496 / 496 PASS，0 FAIL** |
| 交付包独立运行测试（项目目录之外的副本 + 独立 HTTP Server） | **24 / 24 PASS** |
| **总计** | **520 / 520 PASS，0 FAIL** |
| Console Error | **0** |
| Unexpected Internal 404 | **0** |
| Absolute Local Path | **0** |
| 核心 CDN / 外部库依赖 | **0** |
| Runtime JSON Data Drift | **0**（11 / 11 与第七阶段一致） |
| 修复的 Bug | **5 个产品缺陷 + 3 项文案/结构改进** |
| 未修改 | Stage 5 / Stage 6 / Stage 7 / 11 个 Runtime JSON |

**交付包独立运行验证**：把交付包复制到**项目目录之外**的位置，单独启动 HTTP Server（端口 8020），
验证 Home / CSS / JS / JSON / 11 个主要页面 / Search / 404 全部正常，且包内字面量绝对路径为 0 ——
证明交付包不依赖原项目路径，换电脑可直接运行（24 / 24 PASS）。

**结论**：满足 Stage 8 COMPLETE 的全部验收条件，版本冻结为 **Stage8-v1.0-Prototype**。
