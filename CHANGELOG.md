# CHANGELOG — 08_Website_Development

## Data Refresh — IFLA Awards Historical Records（2026-09-20）

> 数据内容更新（精选并入两份用户 PDF），代码零改动，仅刷新运行时 JSON。

- 数据来源：用户提供的两份 PDF（《2016–2024 年国际图联绿色图书馆奖》《2002–2024 年国际图联国际图书馆营销奖获奖情况》）
- 合并范围（AskUserQuestion 选择「精选并入（推荐）」）：为既有 `award_id=2` 绿色图书馆奖、`award_id=3` 国际营销奖回填 2002–2024 历史获奖记录 + 中国/中国香港相关 + 各大洲代表
- 单一数据源纪律：编辑 `07_Data_Construction/05_Demo_Dataset/demo_data.py` → `build_demo_json.py` 重生成 11 个 JSON → `validate-data.py` **12/12 PASS** → 同步到 `08_Website_Development/data/` 与 `Global-Library-Platform-Stage8-v1.0-Prototype/data/`（未手改任何站点 JSON）
- 新增记录：+12 国家(id 11–22) / +37 图书馆(id 25–61) / +46 奖项结果(id 24–69：绿色 20 + 营销 26) / +5 来源(id 60–64)
- 规模：22 国家 / 61 图书馆 / 5 奖项 / 69 奖项结果 / 10 案例 / 64 来源 / 275 关联
- 坐标纪律：37 家新增图书馆坐标仍为 NULL（图书馆 Marker 保持 0，未伪造）；22 个国家全部带真实坐标（国家 Marker 8 → 22）
- 质量标注：绿色奖 2020 起拆分 `GREEN_MAJOR` / `GREEN_PROJECT` 两平行类别系依据汇编文档推断（相关记录 `verify_status=to_verify` 并在 `note` 注明待 IFLA 官方公告确认）；用户 PDF 汇编来源(id 62/63)标 `to_verify`，IFLA 官方公告来源(60/61/64)标 `verified`
- 前台可见性：新增 published 记录即时在 Awards / Library Profile / Country Profile / World Map / Home 统计中体现（统计由 JSON 实时计算）
- 无代码改动；运行时 JSON 刷新；版本标记保持 Stage8-v1.0-Prototype（数据刷新，非版本升级）
- README 第 6 节数据概览表已同步更新

## Stage 9 Deployment（2026-09-20）

> **Public deployment completed · Post-deployment validation completed ·
> Browser validation completed · Mobile/device-emulation validation completed · Runtime JSON unchanged**

- Public deployment completed（部署平台 GitHub Pages，免费 tier；运行在子路径 `/global-library-platform/`）
- Deployment method：通过 GitHub API 创建 public 仓库 → `git push` 冻结包（仅运行文件 + README + 必要 docs）→ 开启 GitHub Pages（分支 `main` / 根目录）→ 根目录加 `.nojekyll` 防止 Jekyll 误处理
- Deployment source version：**Stage8-v1.0-Prototype**（与本地冻结版本一致；本阶段**未修改任何网站代码、JSON 或设计**）
- Source repository（公开）：<https://github.com/gina0014/global-library-platform>
- Public URL（HTTPS）：<https://gina0014.github.io/global-library-platform/>
- Post-deployment validation completed（公网环境真实浏览器校验：12/12 核心页面加载并渲染；11 个 JSON 全部 HTTP 200（`custom_404: true` 已生效）；动态详情页 Country/Library/Award/Case 按 `?id=` 正确渲染真实记录；搜索 `?q=Denmark` 返回 3 条结果；世界地图 8 个国家 Marker、0 个图书馆 Marker，未伪造坐标；Ask AI Demo 标注可见；Admin 统计正常）
- Browser validation completed（无头 Edge 139 真实渲染 + Console 捕获：**Console Error = 0、Unexpected 404 = 0、静态资源 404 = 0**；Home 统计与精选卡由 JSON 实时渲染（stat-box=4、featured cards=10））
- Mobile/device-emulation validation completed（Device Emulation 390×844：**横向溢出 0（390/390）**、Console Error = 0；按用户要求明确标注为 Device Emulation，非真实物理设备）
- HTTPS enforced（github.io 强制 HTTPS，浏览器无安全警告）
- Runtime JSON unchanged（部署包 11 个 JSON 与 Stage8-v1.0-Prototype 冻结版本一致，未重新生成、未修改）
- Deployment issues：**无**（未发现路径错误、大小写错误、静态资源 404、CORS/MIME 错误；子路径部署因已统一使用相对路径 + `withBase()` 而一次成功）
- No code change → 版本**保持 Stage8-v1.0-Prototype**，未升 v1.0.1
- Added docs/Stage9-Deployment-Report.md（13 节：部署平台 / 日期 / 源版本 / 公网 URL / 部署方式 / 部署文件 / 部署后验证 / 浏览器验证 / 移动端验证 / Console 与 404 / 部署问题 / 已知限制 / 最终结果）
- README 增加「3.1 Live Demo 公网演示」节（含 Public URL / 部署平台 / 部署版本 / 仓库地址 / 验证结论），并保留第 9 节本地运行说明
- Security note：部署使用的 GitHub Personal Access Token 仅具 `public_repo` 作用域、短期有效，部署完成后可由仓库所有者随时撤销，网站本身不含任何密钥或真实凭证


## Stage8-Step1-v0.1（2026-09-19）

> 稳定版本标记。基于 Design Baseline V0.2（Pilot-Validated）运行时数据集。

- Created frontend structure（css / js / pages / data / assets / docs 目录）
- Added JSON runtime dataset（复制第七阶段 11 个已验证 JSON 到 data/）
- Added centralized Data Loader（js/data-loader.js，统一 fetch + 错误处理）
- Added Design System CSS（继承第六阶段设计令牌：variables.css 等 6 个样式文件）
- Added Header / Footer（js/components.js 统一渲染，7 项主导航全部保留）
- Added Home page（index.html：Hero / 地图预览 / 统计 / Featured / Ask AI 入口）
- Added dynamic statistics（数字由 JSON 实时计算，仅统计 published）
- Added featured data（Libraries 4 / Awards 3 / Cases 3，含 FK 解析）
- Added basic search（Library.name / name_en、Award.award_name、Case.title、Country.country_name）
- Added loading / error / empty states（含 Try Again 重试）
- Added README（面向非开发者的启动说明）与 404 / Coming Soon 页面
- Added favicon（assets/icons/favicon.svg，消除 favicon.ico 404）
- Added docs/Stage8-Step1-Test-Report.md（20 项运行测试全部通过）+ docs/screenshots 证据截图
- Added docs/Development-Data-Issues.md 与 docs/Development-Design-Issues.md（本步骤均无问题记录）
- Added docs/Stage8-Step1-Verification-User-Check.md（验收三项检查实测证据：网站可打开 / 数字卡片来自 JSON / 控制台零 Error）
- Verified data-driven behaviour：临时副本中改 3 条数据 → 统计 22→21、9→8、卡片标题随之变化；交付目录 11 个 JSON 的 MD5 前后一致（0 差异）

## Stage8-Step2-v0.2（2026-09-19）

> 稳定版本标记。STEP 2 范围：P-03 Country Profile / P-04 Libraries / P-05 Library Profile。基于 Design Baseline V0.2（Pilot-Validated）运行时数据集，未修改任何 JSON、未修改 V0.2 数据模型（无新增冗余字段）。

- Added Libraries directory（`pages/libraries.html` + `js/libraries.js`：搜索 name/name_en/city/country_name，中英文均支持）
- Added Library Profile（`pages/library.html` + `js/library.js`：Header / Overview / Location / Awards / Cases / Sources / Breadcrumb / Last Updated）
- Added Country Profile（`pages/country.html` + `js/country.js`：动态统计 / Libraries / Award-winning Libraries 表 / Cases / Sources）
- Added Library search（URL 驱动：`q` 参数 + 200ms 防抖，搜索范围含 name_en 与国家名）
- Added Country / Region / Type 三筛选 AND 联动（筛选项由 published 数据动态生成；Filter Tags 支持单个移除；Clear Filters 一键清空）
- Added sorting and pagination（Name A–Z 拼音 collation / Recently Updated；每页 9 条；分页链接保留全部筛选状态；动态 Results Count；Empty State）
- Added Award relationship rendering（Library→Award_Result→Award 三表链解析；category=general 不显示标签、非 general 显示 tag；仅显示 award_result 与 award 均 published 的记录）
- Added Case relationship rendering（Library→Case_Project 关联卡片 + 详情链接）
- Added Source relationship rendering（library-source / country-source 链解析去重；真实 url + `target="_blank" rel="noopener noreferrer"`；relation_type 标注 primary/supplementary）
- Added Country aggregation（Libraries / Award-winning Libraries / Cases / Sources 四项统计均由数据链实时计算，不存冗余字段）
- Added URL-based dynamic detail pages（`library.html?id={library_id}`、`country.html?id={country_id}`；ID 非法或不存在显示 Not Found 页而非报错）
- Added shared components（`js/components.js`：breadcrumb / sourceItem / paginationNav / notFoundState；`js/utils.js`：parseIdParam / filterLibraries / sortLibraries / 数据链纯函数；`css/pages.css` 页面级样式）
- Added award.html / case.html 占位页（STEP 3 开发，含说明）
- Added docs/Stage8-Step2-Test-Report.md（51/51 PASS：38 项指定清单 + 8 项 STEP 1 回归 + 5 项补充）+ 4 张截图证据
- Fixed data-loader relative path bug（`pages/` 子目录下 JSON 请求 404 → 页面空白；改为 `withBase()` 换算路径）
- Fixed Libraries URL search param mismatch（`q` vs `query` 字段名不一致导致 `?q=` 参数失效）
- Fixed Clear Filters execution order（buildFilterOptions 从旧 URL 状态回填搜索词）
- Verified STEP 1 regression：Home 全部功能正常（无功能退化）；交付目录 JSON MD5 测试前后一致

## Stage8-Step3-v0.3（2026-09-19）

> 稳定版本标记。STEP 3 范围：P-02 World Map / P-06 Global Awards / P-07 Award Profile / P-08 Cases /
> P-09 Case Detail / P-10 Ask AI Demo / P-11 About / P-12 Admin Dashboard Prototype + 全站搜索升级 +
> 导航与详情页完整闭环。至此 **12 类页面全部具备可演示版本**。
> 基于 Design Baseline V0.2（Pilot-Validated）运行时数据集；未修改任何 JSON、未新增冗余字段、
> 无后端 / 无数据库 / 无真实 AI API / 无登录注册 / 无 CMS 写入。

- Added Global Awards directory（`pages/awards.html` + `js/awards.js`：5 个 published 奖项卡片列表；搜索 award_name / organizer / description；筛选 organizer / frequency；按名称 / 最近更新 / 成立年份三种排序；URL 驱动状态；Empty State）
- Added Award Profile（`pages/award.html` 由占位页改为正式页 + `js/award.js`：Overview / Award Information / Award Results / Related Libraries / Sources / Quick Facts 侧栏 / Related Awards）
- Added Award Results rendering（经 Award → Award_Result → Library 三表链解析，逐年倒序；`category = 'general'` 不显示标签、非 general 显示 tag；3rd place 等按 V0.2 语义以 result_type 呈现）
- Added per-record award-result-source entry（每条获奖记录旁以 `<details>` 展开该条关联的来源，不混入其他来源）
- Added Cases directory（`pages/cases.html` + `js/cases.js`：9 个 published 案例；搜索 title / description / 所属 Library 名称；筛选 topic / year / country；按年份 / 最近更新 / 标题排序）
- Added country filter computed via relationship chain（Case → Library → Country；Country 未写入 Case JSON，下拉只列出实际拥有已发布案例的国家）
- Added Case Detail（`pages/case.html` 由占位页改为正式页 + `js/case.js`：Project Information / Library 区块（可点击）/ Country 区块（可点击）/ 相关案例 / Sources / Last Updated；pending 案例不对外可见）
- Added World Map（`pages/world-map.html` + `js/world-map.js` + `js/map-svg.js`：本地手工 SVG 世界底图 + 等距圆柱投影，无 Google Maps / Mapbox / Leaflet / 在线瓦片 / API Key）
- Added map markers with honest coordinates（仅 8 个国家 Marker 使用 `countries.json` 真实国家中心点；24 家图书馆坐标全部为 NULL → 图书馆 Marker 数为 0，未伪造任何坐标，并在图例与文案中说明原因）
- Added map accessibility and fallback path（Marker 可 Tab 聚焦、含 `aria-label`、hover/focus 显示 tooltip；地图旁提供完整图书馆列表 + "Some libraries are not displayed on the map because coordinate data is unavailable."，确保地图不是访问图书馆的唯一途径）
- Added Global Search Results page（`pages/search.html` + `js/search.js`：`?q=` 驱动，结果按 Countries → Libraries → Awards → Cases 固定顺序分组，每条带 Type Badge 并跳转对应详情页；含 Suggested Searches 与 Empty State）
- Added Header global search（全站 Header 统一搜索框，原生表单提交到 `pages/search.html`，无 JavaScript 也可用；首页 Hero 搜索同步改为跳转结果页）
- Added English country alias query layer（`js/utils.js` 导出 `COUNTRY_ALIASES`：10 国的 code + 中文名 + 英文别名，仅存在于查询解析层、不写入 JSON；"Denmark" 等英文国家名现在可命中 Country 及其属下 Library）
- Added Ask AI Demo（`pages/ask-ai.html` + `js/ask-ai.js`：界面原型 + 规则式本地查询，5 类意图（绿色图书馆 / 获奖图书馆 / 按国家+类型查馆 / 案例 / 全部图书馆），返回匹配记录与相关来源；显式标注 "Demo answer generated from the local prototype dataset"，无 API Key、无外部模型调用；无法匹配时回复 "limited set of data queries" 而非编造答案）
- Added About page（`pages/about.html` + `js/about.js`：Platform Overview / Purpose / Data Model / Data Sources / Data Quality / Update Principle / Prototype Scope / Future Development 八个小节；统计与 `source_type` 分布实时读取 JSON；不含未经确认的合作方、资助方、背书、团队成员或联系方式）
- Added Admin Dashboard Prototype（`pages/admin.html` + `js/admin.js`：Data Overview 六类核心对象 + 5 张关联表计数、Content Status（published 127 / pending 3 / draft 1）、Data Objects 表、Review Workflow（Draft → Pending → Published 三状态）、Recent Updates 表；全部统计动态计算）
- Added prototype-only action buttons（Edit / Review / Publish 按钮点击后仅提示 "Administrative editing is not enabled in this prototype."，不写入、不修改任何数据；页面无登录 / 账号 / 密码输入）
- Completed cross-module navigation（7 项主导航 + Footer 全列 + 首页入口卡 + 相关对象区块全部指向真实页面，全站消灭 "Coming Soon" 死链；`?id=` 非法或指向未发布记录时统一显示 Not Found 状态并给出返回入口）
- Added unified states（Loading / Error / Empty / Not Found 四类状态在所有新页面复用 STEP 2 的公共组件，风格一致）
- Added docs/Step3-Test-Summary.md（A–I 九模块 **98 / 98 PASS**：A 回归 12、B Awards 20、C Cases 16、D World Map 11、E Search 13、F Ask AI 10、G About 5、H Admin 9、I Technical 2）
- Added responsive and accessibility audit（CDP 真实视口 1440 / 900 / 390 共 42 项检查：横向溢出 0、Console Error 0、缺 alt 图片 0、过小可点目标 0）
- Added 27 screenshots（docs/screenshots：10 个页面 × 桌面 / 平板 / 移动三档全页截图，移动端为真 390px 视口）
- Fixed English country search returning no Country result（"China" / "Denmark" 等英文名无法命中中文 `country_name`；通过 `COUNTRY_ALIASES` 查询层修复，未改数据文件）
- Fixed horizontal overflow on Library Profile / Award Profile at 390px（Grid 子项 `min-width:auto` 被内容撑开 → 增加 `min-width: 0` 与长文本 `overflow-wrap: anywhere`；宽表统一由 `.table-scroll` 内部横向滚动承载）
- Fixed About page wording that could imply external partners（原文提及 "partners" 字样 → 改为 "No external support, affiliation or endorsement is claimed."）
- Fixed over-strict test assertions（IFLA 应命中 3 个奖项、biennial 1 个、2018 年 2 个案例、pending 案例 id=3、国家 Marker 8 个、Library Profile 不渲染 "View" 字样、Admin 对象标签为 `Case_Projects`；均经数据核对后修正为正确期望值）
- Verified STEP 1 / STEP 2 regression：Home / Libraries / Library Profile / Country Profile 全部功能正常（12/12），无功能退化
- Verified data integrity：交付目录 `data/` 的 11 个 JSON 未被修改（测试副本与交付目录分离，注入脚本只作用于 `%TEMP%` 副本）
- Recorded issues：DI-001（24 家图书馆坐标全为 NULL）、DI-002（countries 缺英文名字段）；DSI-001（地图图书馆落点待坐标补全）

## Stage8-v1.0-Prototype（2026-09-19）

> **Final QA completed · Cross-page regression completed · Responsive validation completed ·
> Data integrity verified · Runtime JSON unchanged · Known limitations documented · Release frozen**
>
> 由 Stage8-Step3-v0.3 验收并冻结。本次不新增业务模块、不重新设计页面、不改数据模型与 JSON。
> 历史版本记录（Step1-v0.1 / Step2-v0.2 / Step3-v0.3）全部保留。

- Final QA completed（专项：数据完整性 50、可移植性与外部依赖 6、功能 174、交互 144、响应式与语义 89、键盘 30、链接爬取 3 —— **合计 496 / 496 PASS，0 FAIL**）
- Cross-page regression completed（修复后对 Home / Libraries / Library Profile / Awards / Award Profile / Cases / Case Detail 及全部 14 页 × 8 档视口重新测试，0 FAIL）
- Responsive validation completed（Desktop 1440/1280/1200、Tablet 1024/768、Mobile 390/375/320，共 112 项检查，整页横向溢出 = 0、Console Error = 0）
- Data integrity verified（11 个 JSON：合法 + UTF-8 + ID 唯一 + FK 完整 + 关联表复合主键唯一 + Award_Result 五元组唯一 + status 合法 + 必填字段非空 + 类型正确，50 / 50 PASS）
- Runtime JSON unchanged（Final QA 前后各计算一次 MD5 并与第七阶段原件比对：**11 / 11 一致，Data Drift = 0**）
- Known limitations documented（README 第 12 节 5 条 + Final QA Report 第 15 节 7 条；含坐标缺失、Ask AI 规则式演示、Admin 原型、静态 JSON、DEFER 项、DI-003 状态链、可访问性仅基础检查）
- Release frozen（版本标记 Stage8-v1.0-Prototype；新增 `docs/Stage8-Final-QA-Report.md` 与 `docs/Stage8-Release-Checklist.md`）
- Fixed published-status leak：前台曾显示未发布图书馆名称并产生指向 Not Found 的死链（`case.html?id=8` → pending library 18）。新增统一可见性规则「子对象 published 且父 Library published 才可见」（`isCaseVisible()` / `getVisibleCases()`），并接入 Cases 列表 / Case Detail / Home 统计与 Featured / Global Search / Ask AI / About
- Fixed meaningless "general" category label：Award Results 表中 `category = "general"` 不再渲染 `— (general)`，改为仅显示 `—`（符合 V0.2 三级语义）
- Fixed broken relative links on World Map：地图页内图书馆 / 国家档案链接未做 `withBase()` 换算，会跳到 `/pages/pages/…`（404 死链）；统一改用 `withBase()`
- Fixed long-keyword overflow：搜索结果页超长无空格关键词在 320px 下无法断行导致整页横向溢出；补充 `overflow-wrap: anywhere`
- Fixed pagination disabled state：首页“上一页”与末页“下一页”改为不可点击的 `<span>`（原为可点击链接，仅标 aria-disabled）
- Improved map legend semantics：图例明确 "Country / region browsing marker … not an individual library location"，避免把国家 Marker 误读为图书馆位置
- Improved map limitation wording：明确 "Known data limitation — not a system error"，说明图书馆级 Marker 因坐标未收录而不可用，且不生成任何近似坐标
- Improved Ask AI transparency：补充“未来方向三层（Structured Database Query + Knowledge Retrieval + Source-grounded AI）”说明并明确 **not implemented**；同时标注 rule-based prototype
- Improved 404 page：增加 Return Home / Browse Libraries / Browse Awards 与搜索、案例、地图入口
- Added docs/Stage8-Final-QA-Report.md（16 节：测试环境 / 页面 / 数据完整性 / 功能 / 关系 / 搜索筛选 / 地图 / Ask AI / Admin / 响应式 / 可访问性 / 控制台与 404 / 发现问题 / 已修复 / 遗留限制 / 最终结果）
- Added docs/Stage8-Release-Checklist.md（15 组检查项，PASS / FAIL / N/A 标记，全部 PASS）
- Added portable release package：`../Global-Library-Platform-Stage8-v1.0-Prototype/`（仅运行所需文件 + README + 必要 docs），并**在交付副本上独立启动 HTTP Server 验证可运行**（证明不依赖原项目路径）
- Recorded data issue DI-003（3 条已发布子记录挂在未发布图书馆下；前端已按统一可见性规则隐藏，待确认处理方式）
- README 全面最终化（15 节：项目名 / 简介 / 版本 / 功能 / 页面清单 / 数据概览 / 技术 / 目录结构 / Windows 与 macOS-Linux 启动 / Live Server 备选 / 为何不用 file:// / 如何停止 / 已知限制 / 原型声明 / 数据更新原则 / 后续方向）
