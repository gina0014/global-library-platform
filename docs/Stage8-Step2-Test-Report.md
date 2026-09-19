# Stage 8 · STEP 2 测试报告 — Countries + Libraries + Library Profile

- **版本**：Stage8-Step2-v0.2
- **测试日期**：2026-09-19
- **测试环境**：本地 HTTP 服务器（8012 测试副本 / 8000 交付目录）+ Microsoft Edge headless（`--dump-dom` + `--virtual-time-budget`，每次调用独立 `--user-data-dir`）
- **数据集**：第七阶段 11 个 JSON（10 国 / 24 馆 / 5 奖 / 23 获奖 / 10 案例 / 59 来源 / 164 关联，12 项验证全 PASS）
- **结果**：**51 / 51 全部 PASS，0 FAIL**
  - 用户指定 38 项测试清单：38/38 PASS
  - STEP 1 回归测试（Home 相关）：8 项 PASS
  - 附加补充测试（NULL 字段 / 非法 ID / 交互细节）：5 项 PASS

---

## 一、测试方法

1. **DOM 断言测试**：Edge headless 渲染真实页面后 dump DOM，用 Python 正则断言关键内容（统计数字、筛选结果数、卡片内容、链接 href、URL 同步状态）。
2. **交互测试**：向临时站点副本注入 `interaction-test.js`（以 `?interaction=1` 标志门控），模拟真实用户操作（输入搜索、切换下拉筛选、移除 Filter Tag、点击 Clear Filters、切换排序、检查分页链接）后读取页面状态。
3. **控制台错误捕获**：注入 `error-capture.js` 捕获 `window.onerror` / `unhandledrejection` / `console.error` 写入 DOM，每个页面断言 `ERRORS(0)`。
4. **期望值计算**：排序期望值用 Node 以与页面相同的 collation（`localeCompare("zh-Hans-CN")`）计算，避免 Python / JS 排序差异导致误判。
5. **测试副本隔离**：所有注入只发生在 `Temp` 临时副本；交付目录 11 个 JSON 的 MD5 在测试前后比对一致（0 差异），证明未修改数据。

---

## 二、38 项测试清单结果

### A. STEP 1 回归（8 项）

| # | 测试 | 结果 |
|---|---|---|
| TEST-01 | Home 正常打开且统计正确（10 / 22 / 5 / 9） | PASS |
| TEST-01b | Home 无控制台错误 | PASS |
| TEST-01c | Home 导航 Libraries 指向真实页面 | PASS |
| TEST-01d | Home Featured 卡片链接 `library.html?id=` | PASS |

（另见下文 §四"STEP 1 回归测试"说明，Home 全部功能未受影响。）

### B. Libraries 列表页（P-04）

| # | 测试 | 结果 |
|---|---|---|
| TEST-02 | 页面打开并显示统计 `Showing 1–9 of 22 libraries` | PASS |
| TEST-03 | 只显示 published（22 而非 24） | PASS |
| TEST-03b | 第一页显示 9 条（分页大小=9） | PASS |
| TEST-03c | 无控制台错误 | PASS |
| TEST-04 | 卡片显示国家名（FK 解析），无裸 country_id | PASS |
| TEST-05 | `name_en` 参与搜索且在卡片显示（Shanghai → 1 条） | PASS |
| TEST-06 | 中文搜索：北京 → 3 条 | PASS |
| TEST-07 | 英文搜索：Oodi → 1 条 | PASS |
| TEST-08 | Country 筛选：中国 → 6 条且全部中国 | PASS |
| TEST-09 | Region 筛选：Europe → 5 条 | PASS |
| TEST-10 | Type 筛选：public → 18 条 | PASS |
| TEST-11 | AND 组合筛选：Europe + public → 4 条 | PASS |
| TEST-12 | Clear Filters 清空全部条件并恢复默认 | PASS |
| TEST-12b | 搜索输入框交互生效（防抖后重渲染） | PASS |
| TEST-12c | 下拉筛选交互生效（搜索 + 类型 AND） | PASS |
| TEST-12d | Filter Tag 单个移除生效 | PASS |
| TEST-13 | Name A–Z 排序（首卡=阿瑟顿图书馆，zh 拼音 collation） | PASS |
| TEST-14 | Recently Updated 排序（首卡=上海图书馆） | PASS |
| TEST-15 | 分页第 2 页显示 10–18 | PASS |
| TEST-15b | 分页第 3 页（末页）显示 19–22 | PASS |
| TEST-15c | 分页链接保留筛选状态（`type=public&page=2`） | PASS |
| TEST-16 | Empty State：0 结果 + 提示 + Clear Filters | PASS |

### C. Library Profile（P-05）

| # | 测试 | 结果 |
|---|---|---|
| TEST-17 | 上海图书馆正常打开 | PASS |
| TEST-17b | 无控制台错误 | PASS |
| TEST-18 | 不存在 ID 显示 Not Found + Back to Libraries | PASS |
| TEST-18b | 非法 ID（abc）显示 Not Found 而非报错 | PASS |
| TEST-19 | Library → Country 关联可点击（`country.html?id=1`） | PASS |
| TEST-20 | Library → Award_Result（北京城市图书馆 2 条获奖） | PASS |
| TEST-21 | Award_Result → Award 名称解析 | PASS |
| TEST-22 | 非 general 的 category 显示（盐田 Green 类别 tag） | PASS |
| TEST-23 | general category 不显示（Dokk1 无 category 标签） | PASS |
| TEST-24 | Library → Case（北京城市图书馆案例显示） | PASS |
| TEST-25 | Library → Source（NYPL 2 条来源） | PASS |
| TEST-26 | Source 外链带 `target="_blank" rel="noopener noreferrer"` | PASS |
| TEST-27 | Last updated 来自 `library.last_updated` 且整页只出现一次 | PASS |

### D. Country Profile（P-03）

| # | 测试 | 结果 |
|---|---|---|
| TEST-28 | 中国正常打开 | PASS |
| TEST-28b | 无控制台错误 | PASS |
| TEST-29 | Country 统计动态计算（Libraries 6 / 获奖 4 / Cases 3 / Sources 3） | PASS |
| TEST-30 | Country Libraries（美国 9 家） | PASS |
| TEST-31 | Award-winning Libraries 表（美国 7 家馆 / 8 行获奖记录） | PASS |
| TEST-32 | Country Cases（美国 2 条） | PASS |
| TEST-33 | Country Sources（美国 2 条） | PASS |

### E. 状态过滤与占位页

| # | 测试 | 结果 |
|---|---|---|
| TEST-34 | pending 图书馆（加西亚，id=18）不出现在列表 / 搜索（0 结果） | PASS |
| TEST-34b | pending 图书馆详情页显示 Not Found | PASS |
| TEST-34c | draft 图书馆（基斯塔，id=23）详情页显示 Not Found | PASS |
| TEST-36 | Award 占位页正常（说明 coming in STEP 3） | PASS |
| TEST-37 | Case 占位页正常 | PASS |

---

## 三、真实数据链测试

按指令要求使用真实国家数据链验证（所有数字均与 JSON 手工计算核对一致）：

| 数据链 | 验证内容 | 结果 |
|---|---|---|
| 中国馆 | country?id=1：上海图书馆（2 奖 + 1 案例）、中国国家图书馆（无 awards/cases，显示 2 条 "No published…" 提示） | PASS |
| 美国馆 | country?id=2：9 家馆 / 7 家获奖（8 行记录）/ 2 案例 / 2 来源，统计与 JSON 一致 | PASS |
| 丹麦馆 | country?id=6：Dokk1（1 条 IFLA 获奖，category=general 不显示标签；result_type=winner 显示 Winner） | PASS |
| 有 Award 馆 | 北京城市图书馆：2 条获奖记录（不同年份），按年份倒序 | PASS |
| 有 Case 馆 | 北京城市图书馆 / 上海图书馆：案例卡片 + 详情链接 | PASS |
| 缺字段馆 | 盐田（id=5，无 website / founded_year / coordinates）：字段隐藏不报错，显示"坐标待补充"文案，Green category tag 正常 | PASS |

---

## 四、STEP 1 回归测试

- Home 首页（`index.html`）在 STEP 2 改动后完整回归：统计数字、搜索、Featured 卡片、导航全部正常（TEST-01 ~ 01d）。
- `js/config.js` pageSize 12→9 仅影响 Libraries 列表（Home Featured 数量独立配置，不受影响）。
- 首页搜索结果现在可跳转到四个真实详情页（Library / Country 为真实页面，Award / Case 为占位页），原先指向 Coming Soon。
- **结论：STEP 1 回归通过，无功能退化。**

---

## 五、开发过程中发现并修复的 3 个产品 Bug

以下 Bug 均在开发中通过测试发现并**当场修复**（非测试环境问题）：

1. **data-loader 相对路径 Bug**：`pages/` 子目录页面下 JSON 请求解析为 `/pages/data/*.json` → 404，页面空白。修复：`withBase(APP_CONFIG.DATA_PATH) + fileName`。
2. **Libraries 搜索参数字段名不一致**：`readStateFromUrl` 返回 `q` 但 `filterLibraries` 读 `query`，导致 URL 搜索参数完全失效。修复：统一为 `query`（含 2 处遗漏点）。
3. **Clear Filters 执行顺序 Bug**：清空输入框后 `buildFilterOptions()` 从旧 URL 状态回填了搜索词。修复：先清 URL 再重建筛选再渲染。

---

## 六、Console / 网络错误检查

- 每个页面注入 error-capture 断言 **ERRORS(0)**，全部通过（无 window.onerror / unhandledrejection / console.error）。
- 测试服务器访问日志检查（TEST-37 附加）：404 仅出现在上述 Bug 1 修复前（`/pages/data/*.json`）与 interaction 脚本未就位时（`/interaction-test.js`），**修复后所有请求均 200**；最后一次全量测试运行中每个页面约 20 个资源全部 200。
- 交付目录主服务器（8000）最终验证：7 个页面 + 3 个新 JS + 1 个新 CSS + JSON 全部返回 200。
- **TEST-38 相对路径检查**：grep 全部 html/css/js，无 `C:\` 绝对路径、无 `file://`、无外部 CDN 引用。PASS。

---

## 七、响应式与无障碍

- 移动端（455px）：Libraries 页单列布局、筛选面板堆叠、卡片全宽（截图 `step2-libraries-mobile-455.png`）。
- 桌面端（1440px）：三页布局正确——Libraries 280px 筛选侧栏 + 卡片网格；Library / Country Profile 详情布局 + 300px 侧栏 + 表格 + 来源列表 + 分页。
- 无障碍：Breadcrumb 末项 `aria-current="page"`；分页导航 aria 标签；表头语义化；外链 `rel="noopener noreferrer"`；图片均为空（无装饰性占位图）。

---

## 八、数据与设计问题记录

- `docs/Development-Data-Issues.md`：本步骤**未发现**新数据问题（无需新增记录）。
- `docs/Development-Design-Issues.md`：本步骤**未发现**新设计问题（无需新增记录）。
- 说明：多数图书馆 `coordinates` 为 NULL，页面已按"坐标待补充"优雅降级，属已知数据现状而非问题。

---

## 九、证据截图

| 文件 | 内容 |
|---|---|
| `docs/screenshots/step2-libraries-desktop-1440.png` | Libraries 列表页桌面端（筛选侧栏 + 9 卡网格 + 分页） |
| `docs/screenshots/step2-libraries-mobile-455.png` | Libraries 列表页移动端（单列） |
| `docs/screenshots/step2-library-profile-1440.png` | Library Profile 桌面端（Header / Awards / Cases / Sources） |
| `docs/screenshots/step2-country-profile-1440.png` | Country Profile 桌面端（统计 / 馆列表 / 获奖表） |

## 十、结论

**51/51 PASS。STEP 2 全部要求已实现并验证通过，版本标记 Stage8-Step2-v0.2，具备进入 STEP 3 的条件。**
