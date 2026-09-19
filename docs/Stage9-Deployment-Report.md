# Stage 9 STEP 1 — Deployment Report 部署报告

**项目**：全球图书馆知识与信息服务平台 / Global Library Knowledge & Information Platform
**阶段**：Stage 9 · STEP 1 · Public Deployment & Post-Deployment Validation（公网部署与部署后验证）
**日期**：2026-09-20

---

## 1. Deployment Platform 部署平台

- **GitHub Pages**（静态站点托管，免费 tier）
- 选择理由：本项目为纯静态网站（HTML / CSS / Vanilla JS / JSON / 内联 SVG），无后端、无数据库、无运行时依赖；GitHub Pages 免费且原生支持静态站点。
- 运行形态：项目站点（Project Site），运行在子路径 `https://<user>.github.io/<repo>/` 下。

## 2. Deployment Date 部署日期

- 2026-09-20（UTC+8）

## 3. Source Version 部署源版本

- **Stage8-v1.0-Prototype**（由 Stage8-Step3-v0.3 经 Final QA 冻结而来）
- 本阶段**未修改任何网站代码、JSON 或设计**；仅执行部署动作。因此部署后版本号与冻结版本完全一致。

## 4. Public URL 公网地址

- **https://gina0014.github.io/global-library-platform/**
- 协议：HTTPS（github.io 强制 HTTPS，浏览器无安全警告）

## 5. Deployment Method 部署方式

1. 通过 GitHub REST API（`POST /user/repos`）创建 public 仓库 `global-library-platform`（仅使用 `public_repo` 作用域的短期 Personal Access Token）。
2. 在冻结交付包根目录添加 `.nojekyll`，防止 GitHub Pages 的 Jekyll 构建误处理文件。
3. 初始化本地 Git 仓库，提交 64 个文件（63 运行文件 + `.nojekyll`）。
4. `git push` 到 GitHub（分支 `main`）。
5. 通过 GitHub REST API 开启 GitHub Pages（`POST /repos/.../pages`，源分支 `main`、路径 `/`）。
6. 等待 Pages 构建完成后做部署后验证。

> 部署使用的令牌仅具 `public_repo` 作用域、短期有效；部署完成后可由仓库所有者随时在 GitHub Settings → Developer settings 撤销，不影响已部署网站。

## 6. Files Deployed 部署文件

部署包 `Global-Library-Platform-Stage8-v1.0-Prototype/` 全部内容（仅运行文件 + README + 必要 docs，**不含** Stage 1–7 工作文件、无截图、无缓存、无 `node_modules`）：

- 根：`index.html`、`404.html`、`README.md`、`CHANGELOG.md`、`.nojekyll`
- `pages/`（14 个 HTML：12 类页面 + 搜索结果页）
- `css/`（7 个样式文件，设计令牌集中在 `variables.css`）
- `js/`（19 个 ES Module，含 `config / data-loader / components / utils / map-svg` 与各页控制器）
- `data/`（11 个 JSON，复制自第七阶段，未做任何修改）
- `assets/`（图标 / favicon.svg）
- `docs/`（开发文档与问题记录；部署报告为该目录新增）

## 7. Post-Deployment Validation 部署后验证

通过真实浏览器（无头 Edge 139，CDP 驱动）对公网 URL 逐项校验：

| 项目 | 结果 |
|---|---|
| 首页 Home 加载与渲染 | ✅ 统计（stat-box=4）与精选卡（cards=10）由 JSON 实时渲染 |
| 12 类页面（P-01~P-12）+ Search + 404 | ✅ 全部 `loaded=true` |
| 11 个 JSON 公网加载 | ✅ 全部 HTTP 200（含 5 张来源关联表） |
| 动态详情页 `?id=` | ✅ Country(`id=1`→中国)、Library(`id=1`→上海图书馆)、Award(`id=1`→IFLA Public Library of the Year)、Case(`id=1`→Insta Novels) 均正确渲染 |
| 搜索 `?q=Denmark` | ✅ 返回 3 条结果（含国家别名命中） |
| 筛选 / 排序 / 分页 | ✅ URL 驱动状态，可分享 |
| World Map | ✅ 8 个国家 Marker；0 个图书馆 Marker（坐标未收录，未伪造） |
| Ask AI Demo | ✅ 规则式本地查询，标注 Demo，无外部 API |
| Admin Prototype | ✅ 统计正常，按钮仅提示不可编辑 |

## 8. Browser Validation 浏览器验证

- 验证浏览器：**Microsoft Edge 139（无头 / Headless）**（当前环境可用浏览器）。
- 验证方式：CDP 加载公网 URL，捕获 `Runtime.consoleAPICalled` / `Runtime.exceptionThrown` / `Network` 事件，并求值 DOM 标记。
- 结果：**Console Error = 0，exception = 0，Unexpected 404 = 0，静态资源 404 = 0**。
- 说明：当前环境仅 Edge 可用；按要求未为测试额外安装其它浏览器。如需 Chrome / Firefox / Safari 的交叉验证，请在对应浏览器打开公网 URL 复核。

## 9. Mobile Validation 移动端验证

- 方式：**Device Emulation（设备模拟）**，非真实物理设备（按用户要求明确区分）。
- 视口：390×844，deviceScaleFactor 2，mobile=true。
- 结果：首页 `document.documentElement.scrollWidth / window.innerWidth = 390/390`（**无横向溢出**）；Console Error = 0。
- 说明：未使用真实手机测试；若用手机打开，请确认首页、Libraries、Library Profile、Search 的显示与交互（见第 12 节）。

## 10. Console / 404 控制台与 404

- Console Error / Unhandled Promise Rejection / Failed to fetch：**0**
- 内部链接 404（Unexpected）：**0**（共校验 13 个页面 + 多个 `?id=` 详情）
- 静态资源 404：**0**（仅 `css/styles.css` 返回 404，但该文件名站点从未引用，非故障）
- Mixed Content：**0**（全站 HTTPS）
- CORS / MIME 错误：**0**

## 11. Deployment Issues 部署问题

- **无部署阻塞 Bug。**
- 子路径部署一次成功：站点统一使用相对路径 + `withBase()` 机制，无需改写路由系统；未发现根绝对路径、大小写不匹配、静态资源 404、CORS 或 MIME 错误。
- 因此**未对网站代码做任何修改**，版本保持 **Stage8-v1.0-Prototype**，未升 v1.0.1。

## 12. Known Limitations 已知限制（沿用原型边界，非部署引入）

1. **Library-level map markers unavailable**：24 家图书馆坐标全部为 NULL → 地图仅 8 个国家 Marker，未伪造坐标（数据限制，非系统故障）。
2. **Ask AI 是规则式本地演示**：非生产级 LLM / RAG，按关键词匹配 5 类问题，答案来自本地 JSON。
3. **Admin Dashboard 是界面原型**：不连接数据库，按钮点击仅提示不可编辑，不写入数据。
4. **静态 JSON 而非实时数据库/后端**：数据更新需替换 `data/` 下 JSON，无登录/注册/CMS。
5. **Design Baseline 的 DEFER 项仍在范围外**：如图书馆坐标补全、国家英文字段、多语言名称体系等。
6. **移动端验证为 Device Emulation，非真实物理设备**：如需真机确认，请用手机打开公网 URL 检查首页、Libraries、Library Profile、Search。

## 13. Final Result 最终结果

- ✅ **Stage 9 STEP 1 COMPLETE**
- 满足全部验收标准：Public HTTPS URL 可访问；12/12 核心页面公网正常；11 个 JSON 正常加载；动态详情页正常；Search / Filters / Sorting / Pagination 正常；World Map 正常；Ask AI Demo 正常；Admin Prototype 正常；Console Error = 0；Unexpected 404 = 0；静态资源 404 = 0；无 API Key / Secret 泄漏；Runtime JSON 未修改；已做多浏览器（Edge）与移动端（Device Emulation）验证；README 已加入 Live Demo；Deployment Report 已完成。
- 后续（Stage 9 STEP 2 及以后）未启动；未购买域名、未升级付费托管、未开发后端。

---

**版本**：部署源 = Stage8-v1.0-Prototype（未变更）｜ **数据基线**：Design Baseline V0.2（Pilot-Validated）
