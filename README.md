# 全球图书馆知识与信息服务平台 — 网站原型

**Global Library Knowledge & Information Platform — Website Prototype (Stage 8)**

---

## 1. Project Name 项目名称

- 中文：全球图书馆知识与信息服务平台
- English：Global Library Knowledge & Information Platform
- 内部标识：GL（页面徽标与浏览器标题均使用）

## 2. Project Description 项目简介

这是一个关于**全球图书馆**的知识网站原型：可以浏览各国图书馆、国际奖项（如 IFLA 年度公共图书馆奖）、
创新实践案例，以及支撑这些信息的来源（Sources）。

网站把六类核心数据对象 —— **Country / Library / Award / Award Result / Case Project / Source** ——
组织成相互关联的知识网络：从国家进入图书馆，从图书馆进入其获奖记录与案例，从任意对象进入支撑它的来源。
所有关联都通过外键（Foreign Key）实时解析，数据文件中不存在为展示而复制的冗余字段。

本目录（`08_Website_Development/`）是**第八阶段的网站原型**，使用纯 HTML / CSS / JavaScript 编写，
数据来自第七阶段验证通过的 11 个 JSON 文件（存放在 `data/` 文件夹）。

## 3. Version 版本

- 版本标记：**Stage8-v1.0-Prototype**
- 阶段：Stage 8 · Website Prototype Development（已完成 Final QA 并冻结）
- 数据基线：Design Baseline V0.2（Pilot-Validated）
- 页面覆盖：**12 / 12 类页面均具备可演示版本**
- 变更历史：[CHANGELOG.md](CHANGELOG.md)（保留 Step1-v0.1 / Step2-v0.2 / Step3-v0.3 全部历史）

## 3.1 Live Demo 公网演示（Stage 9 部署）

- **Public URL（HTTPS）**：<https://gina0014.github.io/global-library-platform/>
- **Deployment Platform**：GitHub Pages（静态站点托管，免费 tier；项目站点运行在子路径 `/global-library-platform/`）
- **Deployment Version**：**Stage8-v1.0-Prototype**（与本地冻结版本**完全一致**；本阶段未修改任何网站代码、JSON 或设计，仅做部署）
- **Source Repository（公开）**：<https://github.com/gina0014/global-library-platform>
- **部署后验证结论**：12/12 核心页面正常渲染；11 个 JSON 正常加载；动态详情页（Country / Library / Award / Case 均按 `?id=` 正确渲染真实记录）；搜索 / 筛选 / 排序 / 分页 / 世界地图（8 个国家 Marker、0 个图书馆 Marker，未伪造坐标）/ Ask AI Demo / Admin Prototype 均正常；多浏览器与移动端（390px Device Emulation）无横向溢出；**Console Error = 0、Unexpected 404 = 0、静态资源 404 = 0**；HTTPS 强制。
- 详细验证过程与证据见 [`docs/Stage9-Deployment-Report.md`](docs/Stage9-Deployment-Report.md)。

> 本地运行方式（第 9 节）仍然完全保留，公网部署只是额外的访问途径，不影响本地开发与演示。

## 4. Features 主要功能

- **浏览**：国家、图书馆、奖项、案例四大类对象的列表与档案页
- **搜索**：全站搜索，结果按 Countries / Libraries / Awards / Cases 分组并带类型标记；支持中英文
  （含英文国家别名，如 "Denmark"）
- **筛选与排序**：Libraries（国家 / 大洲 / 类型）、Awards（主办方 / 举办频率）、Cases（主题 / 年份 / 国家）；
  筛选状态保存在网址中，可直接分享带筛选条件的链接
- **分页**：每页 9 条，保留全部筛选状态；禁用状态的上一页 / 下一页不可点击
- **关系跳转**：图书馆 ↔ 国家 ↔ 奖项 ↔ 案例 ↔ 来源之间的链接全部联通
- **世界地图**：本地 SVG 地图，按国家中心坐标标注国家级入口（图书馆坐标尚未收录，见 Known Limitations）
- **Ask AI（Demo）**：规则式本地查询原型，仅在本地数据集上检索，不调用任何 AI 服务
- **Admin Dashboard（Prototype）**：界面原型，展示数据对象与发布状态统计，不写入任何数据
- **响应式**：桌面 / 平板 / 移动三档布局，窄屏宽表在容器内部横向滚动，页面不产生横向溢出
- **无障碍基础**：键盘可达、焦点可见、语义化结构、图片与 SVG 均有替代文本

## 5. Page List 页面清单

| 编号 | 页面 | 地址 |
|---|---|---|
| P-01 | Home 首页 | `index.html` |
| P-02 | World Map 世界地图 | `pages/world-map.html` |
| P-03 | Country Profile 国家档案 | `pages/country.html?id={country_id}` |
| P-04 | Libraries 图书馆列表 | `pages/libraries.html` |
| P-05 | Library Profile 图书馆档案 | `pages/library.html?id={library_id}` |
| P-06 | Global Awards 奖项列表 | `pages/awards.html` |
| P-07 | Award Profile 奖项档案 | `pages/award.html?id={award_id}` |
| P-08 | Cases 案例列表 | `pages/cases.html` |
| P-09 | Case Detail 案例详情 | `pages/case.html?id={case_id}` |
| P-10 | Ask AI (Demo) 智能问答原型 | `pages/ask-ai.html` |
| P-11 | About 关于平台 | `pages/about.html` |
| P-12 | Admin Dashboard 后台原型 | `pages/admin.html` |
| — | Search Results 全站搜索结果 | `pages/search.html?q={关键词}` |
| — | 404 页面 | `404.html` |

> 详情页通过网址中的 `?id=` 参数动态加载对应记录；ID 缺失、格式错误或记录未发布时，
> 统一显示 Not Found 状态并提供返回入口。

## 6. Data Overview 数据概览

`data/` 目录包含 11 个 JSON 文件（复制自第七阶段 `07_Data_Construction/06_JSON_Output/`，**未做任何修改**）：

**6 张核心表（前台可见记录数）**

| 对象 | 文件 | 记录 |
|---|---|---|
| Country | `countries.json` | 22 |
| Library | `libraries.json` | 59（另 1 pending / 1 draft） |
| Award | `awards.json` | 5 |
| Award Result | `award-results.json` | 68（另 1 pending） |
| Case Project | `cases.json` | 9（另 1 pending） |
| Source | `sources.json` | 64 |

**5 张来源关联表（多对多）**：`country-source.json`(33) / `library-source.json`(99) /
`award-source.json`(18) / `award-result-source.json`(103) / `case-source.json`(22)

**展示口径**：

- 前台只显示 `status === "published"` 的记录；
- **统一可见性规则**：子对象（Case / Award Result）本身必须 published，**且其父 Library 也必须 published**
  （数据集中存在 3 条「子对象已发布、父图书馆未发布」的记录，见 `docs/Development-Data-Issues.md` DI-003）；
- 统计数字全部由 JSON 实时计算，代码中不存在硬编码数字。

## 7. Technology 技术

- **HTML5 / CSS3 / Vanilla JavaScript（ES Module）** —— 不使用任何前端框架
- **JSON** —— 运行时数据集（本地读取）
- **内联 SVG** —— 地图与图标（无外部图片依赖）
- **无构建工具、无 npm 运行依赖、无后端、无数据库**
- **设计令牌**集中在 `css/variables.css`，其余样式一律通过 `var()` 引用

## 8. Directory Structure 目录结构

```
08_Website_Development/
├── index.html              首页
├── 404.html                404 页面
├── README.md               本说明
├── CHANGELOG.md            版本变更记录
├── pages/                  12 类页面 + 搜索结果页
├── css/                    样式（variables=设计令牌；reset/layout/components/responsive/home/pages）
├── js/                     脚本（config / data-loader / components / utils / map-svg + 各页控制器）
├── data/                   运行时数据集：11 个 JSON（复制自第七阶段，字段与 V0.2 一致）
├── assets/                 静态资源（icons/favicon.svg）
└── docs/                   开发文档与问题记录
    ├── Stage8-Step1-Test-Report.md      STEP 1 测试报告
    ├── Stage8-Step2-Test-Report.md      STEP 2 测试报告
    ├── Step3-Test-Summary.md            STEP 3 测试报告（98/98）
    ├── Stage8-Final-QA-Report.md        Final QA 报告（STEP 4）
    ├── Stage8-Release-Checklist.md      发布检查清单
    ├── Development-Data-Issues.md       数据问题记录
    ├── Development-Design-Issues.md     设计问题记录
    └── screenshots/                     渲染截图（文档证据，非页面素材）
```

## 9. How to Run 如何运行

网站**必须通过本地 HTTP 服务器打开**（原因见第 11 节）。

### Windows

1. 按 `Win + R`，输入 `cmd` 后回车
2. 进入本目录（把路径换成实际位置）：

```
cd 路径\08_Website_Development
python -m http.server 8000
```

3. 看到 `Serving HTTP on ... port 8000` 即启动成功
4. 浏览器访问 <http://localhost:8000/>

如果 `python` 命令不可用，改用 Windows Python 启动器：

```
py -m http.server 8000
```

> 本项目已在 Windows 上实测通过 `python -m http.server 8000` 与 `py -m http.server` 两种方式。

### macOS / Linux

1. 打开「终端 / Terminal」
2. 进入本目录：

```bash
cd 路径/08_Website_Development
python3 -m http.server 8000
```

3. 浏览器访问 <http://localhost:8000/>

> macOS / Linux 通常使用 `python3`；若系统已把 `python` 指向 Python 3，也可直接用 `python`。

### 备选：VS Code Live Server

1. 用 VS Code 打开 `08_Website_Development` 文件夹
2. 扩展商店安装 **Live Server**（作者 Ritwick Dey）
3. 右键 `index.html` → **Open with Live Server**
4. 浏览器会自动打开 <http://127.0.0.1:5500/>

### How to Stop Server 如何停止服务器

- Windows / macOS / Linux 通用：回到终端窗口按 **Ctrl + C**
- VS Code Live Server：点击底部状态栏的 **Port: 5500** 即可停止

## 10. 端口被占用时

若 8000 端口已被其他程序占用，换一个端口即可（例如 8001）：

```
python -m http.server 8001
```

然后访问 <http://localhost:8001/>。

## 11. Why not file:// 为什么不要直接双击 index.html

双击打开的地址以 `file://` 开头。出于浏览器安全策略，`file://` 方式下 JavaScript
**被禁止读取本地 JSON 文件**，页面会显示 "Unable to load platform data."。

因此请务必通过第 9 节的方式运行。**注意：本地服务器只负责把文件传给浏览器，它不是网站后端** ——
本网站没有任何后端程序与数据库。

## 12. Known Limitations 已知限制

1. **Library-level map markers unavailable** —— 已验证数据集中全部 24 家图书馆的
   `latitude` / `longitude` 均为 NULL，因此世界地图上没有图书馆 Marker（只有 8 个国家 Marker）。
   这是数据限制而非系统故障；原型**不会**用国家坐标或推算坐标冒充图书馆位置。
2. **Ask AI 是规则式本地演示** —— 不是生产级 LLM / RAG 系统。它按关键词匹配 5 类问题，
   答案来自本地 JSON；无法匹配时明确说明能力有限，不会编造答案。
3. **Admin Dashboard 是界面原型** —— 不连接数据库，Edit / Review / Publish 按钮点击后
   仅提示 "Administrative editing is not enabled in this prototype."，不会修改任何数据。
4. **使用静态验证 JSON，而非实时数据库 / 后端** —— 数据更新需替换 `data/` 下的 JSON 文件，
   网站本身不提供写入、登录、注册或 CMS 功能。
5. **Design Baseline 中的 DEFER 项仍在原型范围之外** —— 例如图书馆坐标补全、
   国家英文名字段、多语言名称体系等；其中「英文国家名检索」已通过查询层别名（不改数据）临时支持。

## 13. Prototype Disclaimer 原型声明

- 本网站是**第八阶段的原型（Prototype）**，用于验证信息结构、页面流程与数据关系。
- 页面顶部带有 "Stage 8 Development Prototype" 标识，Ask AI 与 Admin 页面另有独立的 Demo / Prototype 声明。
- 演示数据用于说明结构与交互；**不得**将其中的条目当作对真实机构的权威陈述。
- 真实机构的获奖与案例信息以来源（Source）中引用的原始资料为准。

## 14. Data Update Principle 数据更新原则

- 数据的唯一权威来源是第七阶段 `07_Data_Construction/06_JSON_Output/`；`data/` 是其**副本**。
- **字段名、ID、外键一律不得修改**；不得为了页面效果向 JSON 增加冗余展示字段。
- 展示所需的派生信息（如国家名、馆名、案例数）一律通过 ID 关联实时计算。
- 发现数据问题请记录到 `docs/Development-Data-Issues.md`，发现设计问题记录到
  `docs/Development-Design-Issues.md`，**不要直接修改源头数据或已冻结设计**。
- 更新流程：修改源头 → 重新导出 11 个 JSON → 覆盖 `data/` → 刷新页面（无需改代码）。

## 15. Future Development 后续方向

- 接入真实数据库与后端服务，替代静态 JSON 运行时
- 为图书馆补充真实经纬度，启用图书馆级地图 Marker
- 把 Ask AI 升级为 **Structured Database Query + Knowledge Retrieval + Source-grounded AI**
  三层架构（当前原型**未实现**任何一层）
- 建立正式的内容编辑与审核后台（含登录与权限）
- 多语言支持与更完整的可访问性审计（当前仅完成键盘与语义基础检查）
- 扩充国家与图书馆覆盖，补全 DEFER 字段

---

**版本**：Stage8-v1.0-Prototype ｜ **数据基线**：Design Baseline V0.2（Pilot-Validated）
