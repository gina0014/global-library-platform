# SPRINT-2 — Accelerated Sprint 2 工作包（仅规划，未开工）

前置：B2（Remaining Core Data Migration）已完成并通过人工验收。
本文件只定义下一阶段的三个工作包，**不包含任何实现**。
执行顺序建议：B3 → C1 → C2（可并行，但 B3 的输出会改变 C1/C2 的数据治理前提）。

---

## B3 — Admin Workflow（内容治理闭环）

**Goal**
让 Library / Country / Award / Award Result / Case / Source 的内容维护在 Directus 中闭环，
编辑 → 审核 → 发布的状态流转受控，且父子记录的状态一致性由服务端保证。

**Scope**
- Directus 角色与策略：Editor（起草/编辑）、Reviewer（审核）、Administrator（发布/治理）
- 状态流转：`draft → pending → published`（含退回 `pending → draft`）
- `last_updated` 在写入时自动刷新（数据库默认值或 Directus flow，不依赖前端）
- 父子发布一致性：父记录未 published 时，子记录不得对外可见
  （Library ↔ Award Result / Case；Award ↔ Award Result；实体 ↔ Source relation）
- 最小审核界面使用 Directus 原生 App 能力，**不自建 CMS 页面**

**Acceptance Criteria**
1. Editor 可创建/编辑 draft 与 pending，不能直接发布
2. Reviewer 可将 pending → published，并能退回 draft
3. 非 published 记录在任何公开 API 路径下均不可读（含按 ID 直取）
4. 父记录非 published 时，其子记录即使自身为 published 也不对外可见
5. 任一写入后 `last_updated` 自动更新，且前台可见
6. 公开角色仍无任何写/删权限；回归 B2 的 AC-B2-1～7 全部保持 PASS

**Out of Scope**
- 自建内容管理页面 / 自定义 UI
- 工作流可视化设计器、多语言内容、版本 diff / 回滚
- 用户注册、外部身份源接入、通知（邮件/IM）
- 公网部署与权限托管

---

## C1 — Dynamic Map（动态地图）

**Goal**
以数据库中的 Library 坐标为唯一数据源，渲染可交互地图，
并支持从地图导航到 Library Profile。

**Scope**
- Library 坐标（`latitude` / `longitude`）数据治理：补齐/校验现有空值与异常值（属数据维护，不改 schema 语义）
- 引入 MapLibre GL JS 作为渲染库，**仅用于展示层**
- 动态 marker：数据来自 `data-loader.js` 统一入口（不新增第二个数据源）
- 地图 ↔ Library Profile 导航（点击 marker → `library.html?id=`）
- 保持 Design System 与响应式规则不变

**Acceptance Criteria**
1. 地图 marker 数量 = 公开 published Library 中含有效坐标的记录数，且与 API 返回一致
2. 点击 marker 跳转到对应 `library.html?id=<id>`，URL 契约不变
3. 无坐标记录的 Library 不出现在地图上，且不影响其他页面渲染
4. 地图页在 API mode 与 JSON baseline 下内容一致
5. Console 无新增严重错误；移动端/桌面端响应式通过既有审计

**Out of Scope**
- 地理编码服务、路径规划、聚类后的统计图表
- 离线瓦片 / 自托管底图服务
- 热力图、时空动画等非必要可视化
- 新增任何需要服务端支持的地理查询接口

---

## C2 — Dynamic Search（动态搜索）

**Goal**
提供跨 Library / Award / Case / Source 的统一检索，结果来自动态数据源。

**Scope**
- **先评估**：Directus REST `search` 参数 + PostgreSQL 全文检索（`tsvector` / 索引）
  是否足以满足现有搜索页需求（中文分词需专项验证）
- 只有在现有方案明显不足（召回质量或响应性能不满足页面交互）时，
  才评估引入 Meilisearch 等独立搜索服务，并单独立项说明必要性
- 搜索入口仍通过 `data-loader.js` 统一访问，页面不直接请求搜索服务
- 检索结果保持 published-only 语义

**Acceptance Criteria**
1. 同一查询词在 API 结果与当前 JSON baseline 结果集合一致（允许排序差异需说明）
2. 检索不返回任何非 published 记录（含通过关联字段可推断出的信息）
3. 空结果、特殊字符、超长查询不产生控制台错误或异常页面状态
4. 若引入外部搜索服务：需额外给出数据同步与一致性验证方案（本包内不默认引入）
5. 回归 B2 的 AC-B2-1～7 与搜索页在两种数据源下的表现

**Out of Scope**
- 默认引入 Meilisearch / Elasticsearch 等独立搜索服务（需先证明现方案不足）
- 语义检索、向量检索、AI 问答
- 搜索结果排序个性化、点击日志与埋点
- 分词器自训练

---

## 全局约束（三个工作包共用）

- 数据源切换只允许发生在 `js/data-loader.js`；页面不得直接 fetch 后端
- 不改动 `data/*.json`（Migration Baseline / Fallback / Historical Artifact）
- 不改动已冻结的 Stage 1–10 产物、`PRODUCT.md`、既有 Issue 定义与 Design System
- published-only 必须在服务端/权限层强制，禁止「API 返回全部 + JS 过滤」
- 每个工作包单独分支、单独 commit、单独验收；不在本 Sprint 内做公网部署
