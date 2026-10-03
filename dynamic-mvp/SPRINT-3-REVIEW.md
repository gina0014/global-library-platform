# Sprint 3 — Review

**范围**：本地 Dynamic MVP。本轮**只审计、不部署**，未做任何公网部署动作。
**上游**：B2 / B3 / C1 / C2 已合并进 `main`（Sprint 2 = ACCEPTED AND MERGED）。

---

## 1. Sprint 2 GitHub Closure（PART A）

远端 `main` 历史（已核对，无 force push）：

| 提交 | 内容 | PR |
|---|---|---|
| `d05c70e` | B2 — Core Data Dynamic Migration | — |
| `0608efd` | B3 — Governed Admin Publishing Workflow | #3 |
| `f5cf9e7` | C1 — Dynamic Map | #4 |
| `26af146` | C2 — Dynamic Search | #5 |

- B3 / C1 / C2 各有独立分支与 PR，均经 `merge`（非 squash）、无 force push。
- PR diff 无预期外文件；`data/*.json` 全程未改动。
- **Sprint 2 = ACCEPTED AND MERGED。**

---

## 2. D1 Ask AI（PART B）

见 `IMPLEMENTATION-006.md`。要点：

- 从 "rule-based demo" 升级为 **Dynamic Retrieval + Template Composition** 的接地助手；
- 数据仍只经 `data-loader.js`（`askPlatform()`），主题兜底复用 C2 动态检索；
- 新增"某图书馆的奖项 / 某奖项的获奖图书馆 / 某国获奖图书馆"三类实体问答；
- 每个事实型回答都带真实 Source provenance；无 URL 的离线文档不渲染空链接；
- 点名未发布实体、问不支持属性、问未来预测 → 明确回答"数据不足"，不泛化列举、不编造。

验收见 §5。

---

## 3. D2 GitHub Actions（PART C）

见 `IMPLEMENTATION-007.md`。要点：

- `.github/workflows/quality-gate.yml`：`pull_request` + `push to main`；
- `static` job：JSON baseline / PK / FK / UNIQUE / 溯源 / 违禁文件 / Secret 扫描 / 前端健全性 / 检索与 Ask AI 契约；
- `database` job：临时 PostgreSQL 16 service container，从零迁移 + 约束 + 治理 + 保真；
- 无 secret、不改外部数据、无 deploy job；
- Directus / 浏览器 E2E 保留为**本地 release gate**并明确记录（避免 flaky CI）。

验收见 §5。

---

## 4. Production Readiness Audit（PART D）— 只审计，不部署

**结论先行：当前状态 = Local MVP Ready，不等于 Production Ready。**

| # | 项目 | 现状 | 分类 |
|---|---|---|---|
| 1 | PostgreSQL hosting | 仅本地 Docker 容器（`postgres:16-alpine`），无托管实例 | **BLOCKER** |
| 2 | Directus hosting | 仅本地 Docker 容器（`directus/directus:11` → 11.17.4），无托管实例 | **BLOCKER** |
| 3 | API base URL | 前端 `API_DATASOURCE.baseUrl` 写死 `http://localhost:8055`，未做成可注入配置 | **BLOCKER** |
| 4 | CORS | 已配 `CORS_ENABLED=true`、`CORS_ORIGIN=http://localhost:8000,http://127.0.0.1:8000` | **NEEDS CONFIGURATION**（上线需换为正式域名白名单） |
| 5 | HTTPS | 全链路 http，无证书、无强制跳转 | **BLOCKER** |
| 6 | environment variables | `dynamic-mvp/.env`（未入库）+ `.env.example` 占位模板，机制正确 | NEEDS CONFIGURATION（需按目标环境提供真实值） |
| 7 | secret management | 本地明文 `.env`；无 vault / 无 CI secret 注入 | NEEDS CONFIGURATION |
| 8 | admin credentials | 本地默认管理员账号口令在容器环境变量中，未轮换、未纳入密钥管理 | **BLOCKER** |
| 9 | backup / restore | 无任何备份脚本或恢复演练 | **BLOCKER** |
| 10 | database persistence | Docker named volume `postgres-data`；容器级持久化，无异地/离线备份 | NEEDS CONFIGURATION |
| 11 | Directus version | 11.17.4（PostgreSQL 16.15）；无 pinned digest，无升级策略 | NEEDS CONFIGURATION |
| 12 | domain / frontend hosting | 仓库**已开启 GitHub Pages（source = `main`）**，<br>公网地址 `https://gina0014.github.io/global-library-platform/` 已 built 且可访问；<br>本地另有 `python -m http.server` | **BLOCKER**（见 §4.1：公网构建当前不可用） |
| 13 | GitHub Actions | 本轮新增 Quality Gate（仅 PR/主分支静态与数据库检查），未接分支保护 | NEEDS CONFIGURATION（需设为 required check） |
| 14 | production permissions | Directus Roles / Policies / Permissions 由 `step5_setup_workflow.py` **幂等**创建，可复现 | READY（机制可复现；需在目标环境执行并复核） |
| 15 | rate limiting | Directus 未启用任何限流；无网关层 | **NEEDS CONFIGURATION**（公开读接口建议至少加缓存/限流） |
| 16 | error handling | 前端 `DataLoadError` + `errorState()` 可展示；后端无统一错误上报 | NEEDS CONFIGURATION |
| 17 | logging | 仅容器 stdout；无集中日志、无保留策略 | NEEDS CONFIGURATION |
| 18 | health checks | compose 内已定义 postgres / directus healthcheck；无外部可用性监控 | NEEDS CONFIGURATION |
| 19 | migration procedure | `db/ddl/01…05` 按序全量可应用，`db/seed/generate-seed.py` 可重建种子；CI 每轮从零验证 | **READY** |
| 20 | rollback procedure | 无版本化回滚脚本、无演练；仅有"重建"路径 | **BLOCKER** |

**分项统计**：READY 2 · NEEDS CONFIGURATION 9 · BLOCKER 9 · OPTIONAL 0。

**说明**：不要把 "Local MVP Ready" 写成 "Production Ready"。本表第 1/2/3/5/8/9/12/20 项在
进入任何公网环境前必须解决；其余为配置类工作，可在确定托管方案时一并完成。

---

### 4.1 既有公网构建的真实状态（本轮核查发现，必须披露）

核查 GitHub API 得到两项事实：

1. **仓库已开启 GitHub Pages，`source = main`，状态 `built`**，公网地址
   `https://gina0014.github.io/global-library-platform/` 已在线。这不是本轮新增的部署动作，
   而是 Stage 8 起就存在的仓库配置——**但本轮向 `main` 的每次推送都会触发一次公网重新部署**
   （本轮共触发 4 次 `pages build and deployment`）。
2. **该公网构建当前是"空壳"**：`js/data-loader.js` 中
   `DATA_SOURCE_MODE = "api"`、`API_DATASOURCE.baseUrl = "http://localhost:8055"`，
   且**不存在运行时回退**（API 失败直接抛 `DataLoadError`，不会自动改用 `data/*.json`）。
   因此公网访客打开任何数据页（图书馆 / 奖项 / 案例 / 检索 / Ask AI）都会落到错误态。

   实测证据（2026-10-03）：

   ```
   GET https://gina0014.github.io/global-library-platform/js/data-loader.js
   → HTTP 200
   → const DATA_SOURCE_MODE = "api";
   → baseUrl: "http://localhost:8055",
   ```

| 影响面 | 结论 |
|---|---|
| 泄露风险 | **无**。公网内容只有静态前端代码；不含 admin token、不含 LLM key、不含 `.env`、不含数据库 |
| 数据正确性风险 | **无**。公网侧拿不到任何数据，不会展示 draft / pending |
| 体验风险 | **有**。公网可访问的站点目前所有数据页不可用 |

**建议（供人工决策，不在本轮执行）**：二选一 ——

- (a) 在公开演示场景下把 `DATA_SOURCE_MODE` 切回 `"json"`，让公网构建退化为纯静态原型（Stage 8 冻结产物），
  与 "Dynamic MVP" 解耦；或
- (b) 关闭 GitHub Pages，等 PostgreSQL / Directus 托管与 HTTPS 就位后再统一对外发布。

本轮**未新增任何部署动作、未改 Pages 配置、未改动 `DATA_SOURCE_MODE`**——此处仅如实记录既有事实。

---

## 5. 验收汇总

### 5.1 D1 Ask AI

`dynamic-mvp/scripts/step11_verify_askai.py`

```
TOTAL=63  PASS=63  FAIL=0   （exit=0）
```

| AC | 结果 |
|---|---|
| D1-AC1 数据来自动态数据源 | PASS（7 项） |
| D1-AC2 与数据库一致 | PASS（12 项，期望值全部由 PostgreSQL 现算） |
| D1-AC3 provenance 真实可验证 | PASS（11 项，0 编造 URL） |
| D1-AC4 draft / pending 零泄露 | PASS（3 项） |
| D1-AC5 数据不足时明确说明，不编造 | PASS（6 项） |
| D1-AC6 特殊 / 空 / 超长输入安全 | PASS（20 项） |
| D1-AC7 B2/B3/C1/C2 回归 | PASS（4 项） |

### 5.2 D2 GitHub Actions

| AC | 结果 |
|---|---|
| D2-AC1 YAML 可被 GitHub 识别 | PASS（jobs = static / database） |
| D2-AC2 良好代码全部检查通过 | PASS（static 47/47、db 20/20） |
| D2-AC3 注入可控错误 → 至少一项 FAIL | PASS（static 2 项 FAIL、database 1 项 FAIL） |
| D2-AC4 还原后全部 PASS | PASS（47/47、20/20，git diff 为空） |
| D2-AC5 CI 无 secret 明文 | PASS |
| D2-AC6 CI 不修改生产数据 | PASS |
| D2-AC7 CI 不自动公开部署 | PASS |

### 5.3 全量回归

| 脚本 | 内容 | 结果 |
|---|---|---|
| `step3_verify_data.py` | 数据 / API 层（含权限与防泄露） | **128 / 128** |
| `step6_verify_workflow.py` | B3 治理工作流 | **53 / 53** |
| `step8_verify_map.py` | C1 动态地图 | **20 / 20** |
| `step10_verify_search.py` | C2 动态检索 | **56 / 56** |
| `step11_verify_askai.py` | D1 Ask AI（含上述四项回归） | **63 / 63** |

`data/*.json` 全程零改动；`data-loader.js` 全程保持 api 模式（验收脚本不污染）。

---

## 6. Security

- 全程公开角色数据；无 admin token、无 LLM API key 进入前端。
- 无 secret / `.env` / Docker runtime data / browser profile 入库（CI 有静态扫描）。
- CI 无明文 secret，不连生产数据，不自动部署。
- Ask AI 不调用任何生成式模型，不存储模型凭据。

---

## 7. Known Limitations（跨本轮）

1. Ask AI 是结构化匹配，不是语义理解：不支持同义改写 / 错别字 / 跨语言提问。
2. Directus + 浏览器 E2E 未纳入 CI，仍为本地 release gate。
3. 检索与问答均为子串匹配（`ILIKE`），不做分词与相关性排序。
4. 国家别名表仍是前端常量，不在数据库中。
5. 无 URL 的 Source（62 / 63 离线汇编文档）无法在线溯源，只能按题名识别。
6. 生产就绪尚缺 9 项 BLOCKER（见 §4）。
7. `DATA_SOURCE_MODE` 是**编译期常量**，无运行时回退：API 不可达时页面直接进错误态，
   公网构建因此不可用（见 §4.1）。做成可注入配置属生产化工作，不在本轮范围。
8. 仓库 GitHub Pages 已开启在 `main`：本轮向 `main` 的推送会触发公网重新部署（既有配置，
   非本轮新增）。公网侧仅静态代码，不含任何密钥或数据。

---

## 8. Commits

| 本地 | 远端 | 内容 | PR |
|---|---|---|---|
| `bc4ef63` | `fd3b4b8` | `feat: ground ask ai in dynamic platform data`（12 files） | #6 |
| `9c28ab7` | `b07d253` | `ci: add automated quality gate`（4 files） | #6 |
| `a025476` | `10f1eb5` | `docs: add sprint 3 review and production readiness audit`（1 file） | #7 |
| — | `3aee9c7` | merge commit（D1 + D2 合入 `main`） | #6 |
| — | `2f669dd` | merge commit（Sprint 3 收尾文档合入 `main`） | #7 |

- 三个 commit 独立可追溯，均经 `merge`（非 squash），**无 force push**。
- PR #6 diff 共 16 个文件、PR #7 diff 共 1 个文件，**均无 `data/*.json`、无 `.env`、无预期外文件**。
- `main` 现有：B2 `d05c70e` → B3 `0608efd` → C1 `f5cf9e7` → C2 `26af146` → D1 `fd3b4b8` → D2 `b07d253`
  → merge `3aee9c7` → docs `10f1eb5` → merge `2f669dd`。

### 8.1 GitHub Actions 实际执行结果

| Run | 触发 | 结论 |
|---|---|---|
| #1 | `pull_request`（`feature-ask-ai-dynamic`） | **success** |
| #2 | `push`（`main` @ `3aee9c7`） | **success** |
| #3 | `pull_request`（`feature-sprint3-review`） | **success** |
| #4 | `push`（`main` @ `2f669dd`） | **success** |

run #4 两个 job（Static quality gate / Database quality gate）在 GitHub runner 上均为 `success`，
步骤级结果：`Run static checks` success、`Wait for PostgreSQL` success、`Run database checks` success。

---

## 9. Sprint Decision

**Sprint 3 = READY FOR HUMAN ACCEPTANCE。**

依据：

1. Sprint 2 已收口（B2 / B3 / C1 / C2 全部在 `main`，无 force push）；
2. D1 验收 **63/63**，含 B2/B3/C1/C2 全量回归；
3. D2 验收 AC1–AC7 全通过，且 GitHub Actions 在远端实跑两次均 success；
4. 未触发任何 STOP CONDITION：无需编造事实、provenance 可保证、无 draft/pending 泄露、
   无 secret 进前端、CI 不改生产数据、**新增的 Quality Gate 不含 deploy job**（不自动公开部署）、
   未破坏 Stage 1–10 冻结产物、未引入 Vector DB / LLM 基础设施；
5. 本轮**未新增任何部署动作、未改 Pages 配置、未改动 `DATA_SOURCE_MODE`**。

**下一步唯一待决事项：Production Deployment（人工决策）。**

生产就绪审计见 §4：9 项 BLOCKER 未解决
（PostgreSQL / Directus 托管、`API baseUrl` 写死 localhost、HTTPS、管理员凭据、
备份与恢复、**公网前端构建当前不可用**、回滚流程，以及 CORS / 环境变量 / 密钥管理 /
持久化等 9 项待配置）。
当前状态是 **Local MVP Ready，不是 Production Ready**。

此外请一并裁决 §4.1 的既有事实：仓库 GitHub Pages 已开启在 `main`，公网站点已在线但所有
数据页不可用。建议在 (a) 公开演示场景切回 JSON 模式 与 (b) 关闭 Pages 待托管就位后发布
之间做出选择——**在人类决定之前，不应把它当作可用的公网产品**。
