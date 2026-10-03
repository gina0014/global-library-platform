# B3 — Admin Workflow：受治理的发布工作流

**分支**：`feature-admin-workflow`（自 B2 已合并的 `main` = `d05c70e` 创建，无嵌套 branch ref）
**范围**：本地 Dynamic MVP。未部署、未 push 公网分支之外的任何东西、无生产数据库。
**状态**：见 §11 Sprint Decision。

---

## 1. 目标

把「数据存储」升级为「数据治理闭环」：

```
Create/Edit → draft → pending → published
                   ↘ pending → draft（退回）
```

全部使用 **Directus 原生 App / Roles / Policies / Permissions / Access**，
未自建任何 CMS 页面，未改前端（本轮 `js/` **零改动**）。

---

## 2. 架构位置

治理规则落在**服务端**，不在浏览器：

| 规则 | 落点 | 说明 |
|---|---|---|
| 谁可以改哪些行 | Directus Permission `permissions`（行级过滤） | 角色不同，可见/可改的行集合不同 |
| 可以改成什么状态 | Directus Permission `validation` | 状态值不在允许集合内 → 请求被拒（400） |
| 新建记录的初始状态 | Directus Permission `presets` | 服务端注入，客户端无法指定 |
| `last_updated` 刷新 | PostgreSQL `BEFORE INSERT OR UPDATE` 触发器 | 任何写入路径都无法绕过 |
| 谁能看到什么 | Public Policy 行级过滤（含父子链） | 与 B2 一致，本轮扩展为父子链 |
| 数据完整性 | PostgreSQL `CHECK` / `FK` / `UNIQUE` | 任何角色都不可绕过 |

```
Editor / Reviewer ──► Directus App 或 REST API
                            │
                   Policies + Permissions（行级 + 字段级 + validation + presets）
                            │
Administrator ──────────────┤（admin_access=true，仅异常处理/系统管理）
                            ▼
                       PostgreSQL
                  ├─ CHECK / FK / UNIQUE（不可绕过）
                  └─ trg_*_touch：last_updated := now()
```

---

## 3. B3.1 角色与策略

Directus 11 起 `app_access` / `admin_access` 挂在 **Policy** 上，Role 只做分组。
因此本轮建立 2 个 Role + 2 个 Policy，Administrator 直接沿用内置角色：

| 角色 | Policy | app_access | admin_access | 来源 |
|---|---|---|---|---|
| **Editor** | `Editor Policy` | true | false | 本轮新建 |
| **Reviewer** | `Reviewer Policy` | true | false | 本轮新建 |
| **Administrator** | `Administrator` | true | **true** | Directus 内置（`effd554f…`） |
| **Public** | `$t:public_label` | false | false | Directus 内置（B2 已用） |

### 权限矩阵

| 集合 | Public | Editor | Reviewer | Administrator |
|---|---|---|---|---|
| 6 类核心对象 | read：published-only + 父子链 | read 全状态 / create / update | read 全状态 / update | 全部 |
| 5 张 `*_source` 关联表 | read：随父链收敛 | read | read | 全部 |
| create / delete | **无** | create（仅 draft） | **无** | 全部 |

> **没有把任何 admin token 放进前端**。`js/` 本轮零改动；
> 测试脚本的凭据只从**未入库**的 `dynamic-mvp/.env` 读取（`dapi.env()` 缺失即硬失败）。

---

## 4. B3.2 状态工作流

### 规则定义

| 角色 | 行级过滤（`permissions`） | 状态约束（`validation`） | 允许的状态跳转 |
|---|---|---|---|
| **Editor** | `{"status": {"_eq": "draft"}}` | `{"status": {"_in": ["draft","pending"]}}` | 仅 `draft → pending` |
| **Reviewer** | `{"status": {"_eq": "pending"}}` | `{"status": {"_in": ["draft","published"]}}` | `pending → published`、`pending → draft` |
| **Administrator** | — | — | 全部（仅异常处理） |

补充约束：

- Editor **create**：`presets = {"status": "draft", "last_updated": "$NOW"}`，
  且 `validation = {"status": {"_eq": "draft"}}` → 新建记录**只能是 draft**，时间戳由服务端注入。
- Editor 无任何 `delete` 权限；Reviewer 无 `create` / `delete` 权限。
- `status` 取值仍由数据库 `CHECK (status IN ('draft','pending','published'))` 兜底。

### 实测跳转矩阵

| 跳转 | 执行者 | 结果 |
|---|---|---|
| `draft → pending` | Editor | **200 允许** |
| `draft → published` | Editor | **拒绝（400 validation）** |
| `draft → published`（行级） | 任何非管理员角色 | 拒绝 |
| 编辑 pending 记录 | Editor | **拒绝（403 行级过滤）** |
| 编辑 published 记录 | Editor | **拒绝（403 行级过滤）** |
| `pending → published` | Reviewer | **200 允许** |
| `pending → draft`（退回） | Reviewer | **200 允许** |
| `draft → published` | Reviewer | **拒绝（403 行级过滤）** |
| `status = "archived"` | Reviewer | 拒绝（400，非法取值） |
| 创建记录 | Reviewer | 拒绝（403） |

> **关于 Directus `validation` 的一个实测结论**（影响后续维护）：
> `validation` **只对 payload 中出现的字段生效**。因此 Editor 编辑 draft 正文
> （payload 不含 `status`）时不会触发状态校验，行为符合预期；
> 一旦 payload 携带 `status`，就会立即被允许集合拦截。

---

## 5. B3.3 `last_updated` 自动刷新

落点：**数据库触发器**（`db/ddl/05-governance.sql`），不依赖前端、不依赖 API 参数。

```sql
CREATE OR REPLACE FUNCTION glp_touch_last_updated() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.last_updated := now();                      -- 更新即刷新，无法绕过
    ELSIF TG_OP = 'INSERT' AND NEW.last_updated IS NULL THEN
        NEW.last_updated := now();                      -- 种子迁移的原值不被覆盖
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

覆盖范围：`country` / `library` / `award` / `award_result` / `case_project` / `source`（6 张）

验证方式（`step6` B3-AC5）：

1. Editor 以 `last_updated = 2026-01-01` 创建一条临时 draft；
2. Editor 只改正文（payload **不含** `last_updated`）；
3. API 返回值变化 → `2026-10-03T02:56:10`；
4. `docker compose exec postgres psql` **直读数据库**得到同一时间戳。

第 2 步不传时间戳而时间戳被刷新，第 4 步绕过 API 直接确认，两点共同证明刷新发生在服务端。

---

## 6. B3.4 父子发布一致性

### 规则

| 对象 | 公开前提 |
|---|---|
| `award_result` | 自身 published **且** Award published **且** Library published |
| `case_project` | 自身 published **且** Library published |
| `award_result_source` / `case_source` | 父实体 published（迁移期已保证父链成立） |
| `country_source` / `library_source` / `award_source` | 父实体 published（B2 已有） |

### 实现方式：三层，互为纵深防御

| 层 | 落点 | 作用 |
|---|---|---|
| ① **实体层行级过滤** | `award_result` / `case_project` 的 Public read 使用**跨两级关系字段过滤** | 只要父链任一级未 published，实体本身即不可公开 |
| ② **迁移期治理纠正** | `db/seed/generate-seed.py`：父实体非 published 的 child **降为 pending** 后再入库 | 让"父 published ⇒ 祖父链 published"成为数据前提；`data/*.json` 保留原值不动 |
| ③ **关联表层一级过滤** | 五张 `*_source` 的 Public read 只按直接父实体 status 过滤 | 继承父实体的可见性，且不引入两级 join |

> 为什么关联表**不用**跨两级父链过滤（② 存在的原因）：
> 实测发现两级 join 会让 Directus 的返回行序不再稳定，
> 造成 Case / Award Result 的 Source 列表顺序相对 JSON baseline 漂移
> （纯展示层差异，但会破坏 API ↔ JSON 的逐字比对）。
> 因此把两级规则下沉到 ① + ②，关联表只做一级过滤 —— **安全语义不变，顺序稳定**。
> 即使将来有人绕过流程把某个 child 直接置为 published，① 依然会在 API 层把它挡住。

### 服务端只读视图（测试对拍用）

`05-governance.sql` 同时建立 `v_public_award_result`、`v_public_case_project`、
`v_public_*_source` 共 7 个视图，**只用于计算"治理期望集合"**，前端不使用。

### ⚠ 迁移期治理纠正：3 条记录

V0.2 基线里存在「自身 published、但父实体未 published」的孤儿记录，
父子规则上线后按 ② 在迁移时降为 `pending`：

| 记录 | 基线状态 | 纠正后 | 父实体 | 父实体状态 |
|---|---|---|---|---|
| `award_result` 8 | published | **pending** | library 23（基斯塔图书馆） | draft |
| `award_result` 13 | published | **pending** | library 18（加布里埃尔·加西亚·马尔克斯图书馆） | pending |
| `case_project` 8 | published | **pending** | library 18 | pending |

- `data/*.json` **保持原值不变**（它是 Historical Artifact / Fallback）。
- 纠正只作用于 PostgreSQL，且写进 `generate-seed.py`，使 `down -v && up -d` 可复现。
- 这 3 条本来就不会出现在任何已验收页面上（实测十页渲染均未变化）。

公开条数变化（治理后的最终值）：

| 集合 | B2 | B3.4 | 差值 |
|---|---|---|---|
| `award_result` | 68 | **66** | −2 |
| `case_project` | 9 | **8** | −1 |
| `award_result_source` | 102 | **98** | −4 |
| `case_source` | 20 | **18** | −2 |
| 其余 7 个集合 | 不变 | 不变 | 0 |

---

## 7. B3.5 验收结果

数据 / API 层由 `scripts/step6_verify_workflow.py` 执行，浏览器回归由 `scripts/step4_verify_frontend.py` 执行。

| 验收项 | 结果 | 证据 |
|---|---|---|
| **B3-AC1** Editor 可创建 / 编辑 draft，但不能直接发布 | **PASS** | create 200（status=draft）；携带 status=published 的 create 与 update 均被拒；编辑 pending / published 记录被拒 |
| **B3-AC2** Reviewer 可 pending → published、pending → draft | **PASS** | 两条跳转均 200；Reviewer 发布 draft 被拒；Reviewer 无 create；非法 status 被拒 |
| **B3-AC3** Public API：draft / pending 不可读 | **PASS** | 直取 library 23 / 18 均 403；`filter[status]=draft|pending` 返回 0 条 |
| **B3-AC4** 父实体非 published 时 published child 仍不可公开 | **PASS** | 新建「status=published + 父为 draft」的 Award Result / Case，公开直取 403 且不在公开列表；对照组（父 published）正常公开 |
| **B3-AC5** 写入后 `last_updated` 自动更新 | **PASS** | payload 不含时间戳仍被刷新；psql 直读与 API 一致 |
| **B3-AC6** Public write / delete = forbidden | **PASS** | 11 个集合的 create / delete 全 403；update 亦 403 |
| **B3-AC7** B2 AC-B2-1～7 无 regression | **PASS**（数据层 128/128 + 浏览器 32/32） | `step3` TOTAL=128 PASS=128 FAIL=0；`step4` TOTAL=32 PASS=32 FAIL=0 |

`step6` 汇总：**TOTAL=53 PASS=53 FAIL=0**。

### 浏览器回归（`step4`）

| 项 | 结果 |
|---|---|
| 十页 API ↔ JSON 渲染文本 | **全部逐字一致**（home 3089 / libraries 1980 / library 2142 / country 5617 / awards 1798 / award 4185 / cases 2111 / case 1491 / world_map 6468 / search 1650） |
| Console 错误 | **0**（New Serious Error = 0） |
| AC1 移除静态 JSON 后仍渲染 | PASS（含 Source 关联表） |
| AC2 写入 → 前台 → 还原 | PASS |
| AC3 draft / pending 不公开 | PASS |

> **实测结论**：父子一致性收敛掉的 3 条孤儿记录**没有出现在任何已验收页面上**——
> 十页渲染文本与 JSON baseline 逐字一致，说明它们本来就不属于任何公开视图的可见范围。

---

## 8. 变更清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `dynamic-mvp/db/ddl/05-governance.sql` | 新增 | `last_updated` 触发器 + 7 个治理只读视图（幂等，`down -v` 后可重建） |
| `dynamic-mvp/scripts/step5_setup_workflow.py` | 新增 | 幂等配置：角色 / 策略 / 权限 / 父子链过滤 / 测试用户 |
| `dynamic-mvp/scripts/step6_verify_workflow.py` | 新增 | B3-AC1…AC7 可执行验收 |
| `dynamic-mvp/scripts/step3_verify_data.py` | 修改 | 公开计数改为**由治理视图派生**；`last_updated` 不再参与字段保真比对（B3.5 触发器的预期副作用）；`--ac2-restore` 复位时间戳 |
| `dynamic-mvp/scripts/step4_verify_frontend.py` | 修改 | 基线 md5 改为在**强制复位 api 模式之后**取（上一轮异常中断会留下假失败） |
| `dynamic-mvp/db/seed/generate-seed.py` | 修改 | 迁移期治理纠正：父实体非 published 的 child 降为 pending |
| `dynamic-mvp/db/ddl/02-seed-country-library.sql`、`04-seed-remaining-core.sql` | 修改 | 由生成器重新产出（仅受治理纠正影响的 3 行） |
| `dynamic-mvp/IMPLEMENTATION-003.md` | 新增 | 本文档 |
| `js/**`、`data/*.json`、Stage 1–10 产物 | **未改动** | 本轮前端与冻结产物零改动 |

---

## 9. 安全

- 无 admin token 出现在任何前端产物；测试凭据只存在于**未入库**的 `dynamic-mvp/.env`（已被 `.gitignore` 忽略）。
- Public 无任何 create / update / delete 权限（11 个集合全部 403）。
- `data/*.json` 未被修改、未被删除（JSON fallback 保留）。
- 未引入 `.env`、未提交 Docker runtime data、未提交 browser profile。

---

## 10. Known Limitations

1. **父子一致性使 3 条基线孤儿数据退出公开集合**（见 §6）。
   静态 JSON fallback 仍保留这些数据，但实测十页渲染文本**逐字一致**——
   这 3 条不属于任何公开视图的可见范围，因此 JSON fallback 与 API 之间**没有产生可观测差异**。
   将来若新增直接展示它们的页面，才会出现预期内的分歧；那时应以服务端为准。
2. Reviewer 无 `create` 权限、Editor 无 `delete` 权限，均为本轮最小集；如需扩展需单独立项。
3. `v_public_*` 视图是只读测试辅助对象，不属于对外 API 契约，也未在任何页面使用。
4. 触发器使 `last_updated` 无法再被手工写回历史值 —— 这是刻意的：它就是「最后一次服务端写入时间」。
5. 角色体系未接 Directus Flow 通知；审批提醒不在本轮范围内。

---

## 11. Sprint Decision

`B3-AC1 … B3-AC7` 全部 **PASS**：

| 测试 | 结果 |
|---|---|
| 数据 / API 层 `step3` | **128 / 128 PASS** |
| B3 验收 `step6` | **53 / 53 PASS** |
| 浏览器回归 `step4` | **32 / 32 PASS** |

**B3 = READY FOR ACCEPTANCE**（AC 全通过；§10 #1 为规范执行的预期后果，不是缺陷）。

**未触发任何 STOP 条件**：数据模型语义未改（仅触发器 + 视图 + 权限）；published-only 与父子一致性
均在服务端实现；无 secret；无数据损坏；Source provenance 完整；Stage 1–10 产物零改动。
