# Development Design Issues（设计问题记录）

> 规则：UI 开发中若发现数据库字段不足 / 页面无法表达 / 关系设计问题，
> **不得直接修改第五、六、七阶段成果（Design Baseline V0.2 已冻结）**，
> 必须登记到本表，等待用户确认后按变更流程处理。

| Issue ID | Affected Page | Affected Entity | Problem | Current Design | Suggested Change | Severity |
|----------|---------------|-----------------|---------|----------------|------------------|----------|
| DSI-001 | P-02 World Map | Library | 地图无法为图书馆落点 | `library` 有 `latitude` / `longitude` 字段但 Demo 数据全为 NULL | 保持现状：仅渲染国家 Marker + 诚实提示；待第七阶段补全坐标后自动生效，无需改结构 | Medium（阻塞可视化效果，不阻塞功能） |

## 记录

**STEP 1 期间未发现设计问题。**（V0.2 字段足以支撑首页所需的全部信息展示：
`library.name_en`、`award_result.category` 等新字段均已正常使用；
Country / Library 的 FK 解析按 V0.2 数据模型完成。）

**STEP 2 期间未发现设计问题。**（Country Profile / Library Profile 所需的
聚合统计（馆数 / 获奖数 / 案例数 / 来源数）均可由现有表结构经 ID 关联算出，
不需要新增冗余字段。）

**STEP 3 期间发现 1 项（已按现有设计处理，未修改任何冻结成果）：**

1. **DSI-001 · 世界地图图书馆落点所需坐标缺失。**
   `library` 实体本身已有 `latitude` / `longitude` 字段（V0.2 未改动），
   因此这不是"字段不足"的设计缺陷，而是 Demo 数据尚未填充。
   处理原则：**不伪造坐标、不引入第二套地理数据**。
   页面只渲染 8 个国家 Marker（`countries.json` 的真实中心坐标），
   图书馆 Marker 为 0，并提供与地图并列的完整图书馆列表，
   确保"地图不是访问图书馆的唯一途径"。待坐标补全后，同一份代码会
   自动为 `latitude` / `longitude` 均非 NULL 的馆绘制 Marker，无需改代码结构。

## STEP 4（Final QA）期间：未新增设计问题

Final QA 未修改冻结设计，也未新增需变更流程的设计问题。两点补充说明：

1. **可见性规则属于展示口径，不是设计变更。**
   针对数据层面「已发布子记录挂在未发布图书馆下」的情况（见 Data Issues DI-003），
   Stage 8 采用展示口径统一处理：**前台可见 = 子对象 published 且父 Library published**。
   这与既有 Award_Result 规则（result + award + library 三者均 published）一致，
   不需要改动 Design Baseline V0.2 的字段或关系定义。
2. **`category = "general"` 的展示口径已收紧。**
   Final QA 发现 Award Results 表曾渲染 `— (general)`，属无意义占位词；
   已改为仅显示 `—`，符合 V0.2 三级语义（奖项 / 类别 / 名次）的原始约定。

## 备注（非阻塞观察，供后续 STEP 参考）

1. `country.region` 仅有一个值列表（Asia / Europe / ...），首页暂未按大洲分组展示，
   后续 STEP 若做地图 / 筛选可直接使用，无需改库。
2. `library.latitude / longitude` 在 Demo 数据中大多为 NULL（第七阶段已知，列入 DEFER
   「坐标补全」）。正式世界地图 Marker 需要 WW 坐标；建议后续用 country 坐标作为
   图书馆的粗略落点，或等待数据补全 —— 均不需要改数据库结构。
   > STEP 3 补充：地图已实现落地，采用 country 中心点作为**国家** Marker
   > （非图书馆落点，避免把国家坐标伪装成馆坐标）；图书馆 Marker 等待真实坐标。
3. **Award Results 的 `result_type` 与 `category` 语义分离**已按 V0.2 落地：
   `category = 'general'` 时不显示标签（避免"综合类"占位词进入界面），
   `category ≠ 'general'` 时以 tag 形式展示，符合三级语义（奖项 / 类别 / 名次）。
4. **`award` 与 `library` 无直接关联**的设计约束已在地图、案例、搜索各处遵守：
   一切获奖信息均经 `award_result` 中转，页面代码中不存在 award → library 的直连查询。
