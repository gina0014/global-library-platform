# Development Data Issues（数据问题记录）

> 规则：开发过程中发现 JSON 数据问题（字段错误 / FK 错误 / 字段缺失 / 数据类型问题）时，
> **不得为了页面运行而直接修改 data/ 中的 JSON**，必须先登记到本表，等用户确认处理方式。
> 数据的唯一权威来源是第七阶段 `07_Data_Construction/06_JSON_Output/`。

| Issue ID | JSON File | Record ID | Problem | Expected | Actual | Impact | Suggested Fix |
|----------|-----------|-----------|---------|----------|--------|--------|---------------|
| DI-001 | libraries.json | 全部 24 条 | 地理坐标缺失 | `latitude` / `longitude` 为真实 WGS84 坐标 | 全部为 `null`（24 / 24） | P-02 World Map 无法渲染图书馆 Marker（当前为 0 个） | 第七阶段已列入 DEFER「坐标补全」；补全前保持不渲染，禁止伪造坐标 |
| DI-002 | countries.json | 全部 10 条 | 缺少国家英文名称字段 | 存在可用于英文检索的英文名（如 "Denmark"） | 仅有中文 `country_name`（如「丹麦」），无英文名字段 | 英文关键词搜索国家时 Country 不命中（影响 Global Search / Ask AI） | **不改库**：已在 `js/utils.js` 增加 `COUNTRY_ALIASES` 英文别名查询层（10 国 code + 中文 + 英文别名），仅存在于查询解析层，不写入 JSON |
| DI-003 | cases.json / award-results.json | case_id=8；award_result_id=8、13 | 已发布子记录的父对象未发布（发布状态链不一致） | 子对象 published 时其父 Library 也应 published | case 8（published）→ library_id=18（pending）；award_result 8（published）→ library_id=23（draft）；award_result 13（published）→ library_id=18（pending） | 若只按子对象自身状态过滤，前台会显示未发布图书馆名称并产生指向 Not Found 的死链 | **不改库**：Stage 8 代码统一「前台可见 = 子对象 published 且父 Library published」（`isCaseVisible()` / `getVisibleCases()`），与 Award_Result 既有规则一致；孤儿子对象整体隐藏。建议第七阶段后续确认这 3 条记录的状态或改挂到已发布图书馆 |

## 记录

**STEP 1 期间未发现数据问题。**（11 个 JSON 经第七阶段 12 项验证全部通过，
STEP 1 开发过程中未发现新的字段 / FK / 类型问题。）

**STEP 2 期间未发现新数据问题。**

**STEP 3 期间发现 2 项（均为「数据不全」而非「数据错误」，未修改任何 JSON）：**

1. **DI-001 · 图书馆坐标全部为 NULL。** 世界地图开发时需要经纬度才能落点。
   经核对 `libraries.json` 全部 24 条记录的 `latitude` / `longitude` 均为 `null`，
   与第七阶段记录的 DEFER 项一致（非数据错误，属尚未补全）。
   按指令要求（"只有经纬度均非 null 的馆才画 Marker，不得伪造坐标"），
   地图只渲染 8 个国家 Marker（坐标取自 `countries.json` 的真实国家中心点），
   图书馆 Marker 数为 **0**，并在页面显著位置说明原因。

2. **DI-002 · 国家缺少英文名字段。** 测试中发现搜索 "China" / "Denmark" 无国家结果：
   `countries.json` 只有中文 `country_name`。这属于第七阶段字段设计的既有范围
   （Design Baseline V0.2 的中英文名扩展只到达 `library.name_en`）。
   处理方式为**在查询解析层做别名映射**，不触碰数据文件：
   `js/utils.js` 导出 `COUNTRY_ALIASES`（10 国的 code + 中文名 + 英文别名数组），
   由 `searchAllUpgraded()` 与 `answerQuestion()` 共用；命中别名时同时命中该国及其属下图书馆。
   若后续希望数据层直接支持英文检索，需按变更流程向 `countries` 增加字段（本阶段不做）。

**STEP 4（Final QA）期间发现 1 项（DI-003）：**

3. **DI-003 · 已发布子记录的父对象未发布。**
   数据集中存在 3 条「子对象 published、父 Library 未发布」的记录：

   | 子对象 | 状态 | 父 Library | 父对象状态 |
   |---|---|---|---|
   | `case_id=8` 加西亚·马尔克斯图书馆：拉美文学社区空间 | published | `library_id=18` 加布里埃尔·加西亚·马尔克斯图书馆 | pending |
   | `award_result_id=8` | published | `library_id=23` 基斯塔图书馆 | draft |
   | `award_result_id=13` | published | `library_id=18` 加布里埃尔·加西亚·马尔克斯图书馆 | pending |

   Final QA 的 published 泄漏测试发现：`case.html?id=8` 曾显示父图书馆的中文名与英文名，
   并提供指向 `library.html?id=18` 的链接，而该链接打开后是 Not Found —— 既泄漏了未发布对象的名称，
   又产生死链。这不是字段错误，而是**发布状态链不一致**，属数据层面问题，因此不改 JSON。

   处理方式（Stage 8 代码层面，符合「前台只显示 published」原则）：
   - 新增统一可见性规则并在 `js/utils.js` 导出：`isCaseVisible(item, libraries)` 与
     `getVisibleCases(cases, libraries)` —— 子对象 published **且**父 Library published 才可见；
   - 该规则与 Award_Result 既有规则（result + award + library 三者均 published）保持一致；
   - 影响面（全部已回归验证）：Cases 列表、Case Detail、Home 统计与 Featured、
     Global Search、Ask AI 案例意图、About 统计。
   - 结果：Cases 可见数由 9 变为 8；`case.html?id=8` 与 `library.html?id=18` 一样显示 Not Found。

   建议（需用户 / 第七阶段确认，本阶段不执行）：确认这 3 条记录的目标状态 ——
   要么将其父 Library 发布，要么将子对象改为 pending，使状态链一致。
