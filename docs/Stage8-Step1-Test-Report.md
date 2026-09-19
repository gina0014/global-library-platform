# Stage 8 · STEP 1 运行测试报告

> 版本：**Stage8-Step1-v0.1** ｜ 测试日期：2026-09-19
> 运行方式：本地 HTTP Server（`python -m http.server 8000`，仅提供静态文件，非后端）
> 测试工具：curl（资源可达性）、Microsoft Edge headless（真实执行 JavaScript 后取 DOM 与截图）、
> Node.js（对 `js/utils.js` 的 `searchAll` 纯函数做数据驱动测试）

## 测试结果总览

| # | 测试项 | 结果 | 证据 |
|---|---|---|---|
| TEST-01 | index.html 正常打开 | ✅ PASS | `GET /` → 200 |
| TEST-02 | CSS 正常加载 | ✅ PASS | 6 个 CSS 文件全部 200 |
| TEST-03 | JS 正常加载 | ✅ PASS | 5 个 JS 模块全部 200（含 404.html/coming-soon 页面） |
| TEST-04 | 11 个 JSON 均可读取 | ✅ PASS | 11 个 JSON 全部 200 |
| TEST-05 | 控制台没有 404 | ✅ PASS | 服务器日志：仅 14:08、14:11 两次 `favicon.ico` 404（发生在补 favicon 之前）；补 `assets/icons/favicon.svg` 后，最近一轮 39 个请求全部 200 |
| TEST-06 | 控制台没有 JavaScript Error | ✅ PASS | 渲染后统计/Featured/Footer 全部生成，无错误状态或空白（如 JS 抛错将停在 Loading 或 Error 状态） |
| TEST-07 | Statistics 来自 JSON 动态计算 | ✅ PASS | DOM 实测：`10 / 22 / 5 / 9`（countries/libraries/awards/cases 的 published 计数） |
| TEST-08 | pending/draft 不进入前台统计 | ✅ PASS | libraries 24 条 → 显示 22（1 pending + 1 draft 被排除）；cases 10 条 → 显示 9（1 pending 被排除） |
| TEST-09 | Featured Libraries 来自 JSON | ✅ PASS | 渲染出 上海图书馆 / 中国国家图书馆 / 清华大学图书馆 / 北京城市图书馆（JSON 前 4 条 published） |
| TEST-10 | Country 名称 FK 解析正确 | ✅ PASS | 卡片显示 “中国 · 上海”“中国 · 北京”，由 `library.country_id → country.country_name` 解析，未出现裸 ID |
| TEST-11 | Featured Awards 来自 JSON | ✅ PASS | PLOTY / Green Library Award / PressReader Marketing Award，含 organizer、frequency、描述摘要 |
| TEST-12 | Featured Cases 的 Library FK 解析正确 | ✅ PASS | “Insta Novels → 纽约公共图书馆 · 2018”“Books Unbanned → 布鲁克林公共图书馆 · 2021”“北京城市图书馆案例 → 北京城市图书馆 · 2023” |
| TEST-13 | Global Search 能搜索 Library | ✅ PASS | 查询 “上海” → 1 条 Library；查询 “Oodi” → 命中 name_en（V0.2 字段） |
| TEST-14 | Global Search 能搜索 Award | ✅ PASS | 查询 “Green” → 1 条 Award |
| TEST-15 | Global Search 能搜索 Case | ✅ PASS | 查询 “Insta” → 1 条 Case |
| TEST-16 | Global Search 能搜索 Country | ✅ PASS | 查询 “丹麦” → 命中 Country（并附带 1 条 Library 结果） |
| TEST-17 | 无结果显示 Empty State | ✅ PASS | 查询 “zzzz-nothing” → 结果区渲染 Empty State 文案，0 条结果 |
| TEST-18 | 模拟 JSON 加载失败能显示 Error State | ✅ PASS | 临时移除 `data/countries.json` 后渲染：“Unable to load platform data.” + “Try Again” 按钮；恢复后立即正常（无空白页、无无限 Loading） |
| TEST-19 | 桌面端布局正常 | ✅ PASS | 1440px 截图：卡片 4 列、统计 4 列、导航一行（见 docs/screenshots） |
| TEST-20 | 移动端布局基本正常 | ✅ PASS | 455px 截图：卡片 1 列、统计 2×2、导航折叠为 Menu 按钮；900px 平板：卡片 2 列、导航一行 |
| 附加 | pending/draft 记录不可被搜索 | ✅ PASS | pending 图书馆（加西亚·马尔克斯）、draft 图书馆（基斯塔）、pending 案例（RPR）均不出现在搜索结果中，仅 published 命中 |

## 补充说明

1. **移动端截图宽度**：Edge headless 存在最小窗口宽度（约 455 CSS px），以 390px 参数截图时右侧会被裁切。
   经 DOM 实测 `scrollWidth === clientWidth`（无横向溢出），确认裁切属截图工具行为，非页面布局问题；
   证据截图统一采用 455px。
2. **搜索测试方式**：`searchAll` 为纯函数，除浏览器内实测（临时调试副本模拟提交搜索）外，
   另用 Node 对其做数据驱动测试（服务端 11 个 JSON 直接读取），两种方式结果一致。
3. **数据未被修改**：全部测试未改动 `data/` 下任何 JSON；TEST-18 的失败模拟使用临时改名并在测试后立即还原
   （已用 curl 确认恢复为 200）。
4. **未使用任何 CDN**：测试过程中仅访问 localhost，无外部网络请求；核心页面在无外网环境可完整显示。

## 结论

20 项测试全部通过。Home 首页在桌面 / 平板 / 移动三种宽度下均正常渲染，
统计与 Featured 内容全部来自第七阶段验证通过的 JSON 运行时数据集，FK 解析正确，
错误与空状态可正常触发。STEP 1 达到稳定可交付状态。
