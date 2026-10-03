# PRODUCTION-PLAN — Dynamic MVP 生产部署方案（PHASE 2 准备）

> **状态：计划文档，尚未执行。**
> 本文**不注册、不购买、不绑定银行卡、不创建任何公网资源**。
> 所有涉及付费与公网资源创建的动作标记为 `REQUIRES HUMAN ACTION`，等待人工选择 Option 后再执行。
>
> 价格与免费额度为 **2026-10 检索所得，变动频繁**；任何决策前请以服务商官网定价页复核。

---

## 1. 目标架构（最小可行，不做企业级过度设计）

```
┌───────────────────────┐   HTTPS    ┌──────────────────────┐   SSL    ┌──────────────────┐
│  GitHub Pages         │ ─────────► │  Directus 11         │ ───────► │  PostgreSQL 16   │
│  静态前端（已在线）    │            │  （单容器，无 Redis） │          │  （托管实例）     │
│  *.github.io          │            │  REST + 权限层        │          │  唯一数据真源     │
└───────────────────────┘            └──────────────────────┘          └──────────────────┘
        ▲                                      ▲
        │ json 模式（PHASE 1 Public Demo）      │ 只跑一次：Docker Compose 本地 MVP 保持不变
        └── api 模式（PHASE 2 Production）      └── DATASOURCE_TARGETS 追加 production 条目
```

**为什么是这样一个形状**：

- 本项目总数据量极小（约 300 行级别：library 61 / award_result 69 / source 64 / 关联表 < 110），
  单容器 Directus + 单实例 Postgres 完全够用，**不需要 Redis、不需要多副本、不需要 K8s**；
- Directus 只作为「带权限层的只读 REST API」对外，写入仅为少量 Admin 编辑；
- 前端是纯静态站点，GitHub Pages 已能免费提供 HTTPS + CDN，**不要为了"统一技术栈"换掉它**。

---

## 2. Option A — Neon（托管 PostgreSQL）+ Fly.io（Directus 单容器）

**月度成本约 ¥45–70（≈ $6–10），数据库层零成本起步。**

| 维度 | Neon（PostgreSQL） | Fly.io（Directus） |
|---|---|---|
| 免费/低成本 | 免费层可用，无需信用卡；付费 Launch 层按用量计费 | 约 `$5.92/月` 起（1 GB 内存 shared-CPU 机器） |
| 部署难度 | 控制台创建实例，拿连接串即可 | `fly launch` + 环境变量，一条命令 |
| HTTPS | 服务端证书由平台管理；连接需 SSL | 平台自动签发证书并强制跳转 |
| 持久化 | 托管存储，与计算分离 | 容器无状态，**本项目不上传文件，无需 volume** |
| 备份 | 免费层提供短时窗即时恢复；付费层提供更长 PITR（以官网为准） | 不需要（无状态） |
| 环境变量 | 平台面板配置，不入库 | `fly secrets set`，密文注入 |
| **休眠限制** | **scale-to-zero：空闲后首个请求有数秒冷启动** | 付费常驻机器不休眠 |
| 资源限制 | 免费层存储/计算额度有限（各来源对存储额度说法不一：0.5 GB 与 1 GB/项目均有出现，需复核） | 1 GB 内存对 Directus 单容器够用 |
| 维护复杂度 | 低（无服务器运维） | 中（镜像升级、环境变量管理） |

**优点**：成本最低；数据库有托管备份与恢复能力，最贴近"真生产"的核心诉求。
**缺点**：跨越两个服务商，两套面板两张账单；Neon 冷启动会让首次访问变慢（可用付费常驻规避）。

---

## 3. Option B — 单一 PaaS 全家桶（Render / Railway）

**月度成本约 ¥150–220（≈ $20–30）。**

| 维度 | Render（Postgres + Web Service） | Railway（Postgres + Service） |
|---|---|---|
| 免费/低成本 | Web Starter `$7/月`；Postgres Basic-1gb `$19/月` | Hobby 最低 `$5/月`（含 $5 额度），按用量计费 |
| 部署难度 | 最低：控制台点选仓库 + 环境变量 | 最低：`railway up` 或连接 GitHub 仓库 |
| HTTPS | 平台自动 | 平台自动 |
| 持久化 | 托管卷 | 托管卷（`$0.15/GB/月`） |
| 备份 | 付费 Postgres 层提供恢复能力（以官网为准） | 需自行用 `pg_dump`（即本文 §5 脚本） |
| 环境变量 | 面板配置 | 面板配置 |
| 休眠限制 | 免费层会休眠且免费 Postgres **仅 30 天**（不适合长期） | 按用量，常驻则持续计费 |
| 资源限制 | 512 MB / 0.5 CPU 起步 | RAM `$10/GB/月`、vCPU `$20/vCPU/月` |
| 维护复杂度 | **最低：一个面板、一张账单、同城内网** | 低 |

> 常驻型 CMS  workloads 在 Railway 上的实测量级约 `$20+/月`（1 GB 内存 + 少量 CPU + 小型 Postgres + 卷），
> 与 Render 的 `$26/月` 同量级——**"便宜的量费模型遇到常驻服务就不便宜了"**。

**优点**：一处配置、同区内网延迟最低、运维心智负担最小。
**缺点**：每月固定支出（学生项目需权衡）；免费档不适合长期使用。

---

## 4. 推荐与弃项

| 项 | 结论 |
|---|---|
| **推荐给本项目** | **Option A**（Neon + Fly.io）。数据量极小、写操作极少，成本敏感；数据库层的备份/恢复是唯一不可妥协项，Neon 提供。 |
| **若希望最少运维** | Option B（Render 全家桶），代价是固定月费。 |
| **Directus Cloud** | **不推荐**。行业报道显示其低价 Starter 档已于 2025 年末调整，当前托管起步价对学生项目偏高（有来源称 Professional 档 `$99/月`，请自行复核官网）。 |
| **自建 VPS 跑 Postgres + Directus** | **不推荐**。备份、证书、安全补丁全要自己做，成本收益不如托管。 |
| **Supabase 替代 Directus** | **不推荐**。会推翻 B2/B3 已验收的权限模型与 published-only 语义，属于返工。 |

> Directus 许可：自托管版本对年收入/融资低于 `$5M` 的组织免费可用；本项目（学生课题）在此范围内。
> 正式上线前请自行复核当前许可条款。

---

## 5. Blocker Resolution Plan（来自 Sprint 3 审计）

标记：
- **RESOLVED BY CODE** —— 本轮(PHASE 1)已由代码解决
- **RESOLVED BY HOST CONFIG** —— 选定托管后在面板/环境变量里解决
- **REQUIRES HUMAN ACTION** —— 必须由人工执行的决策或动作

| # | Blocker / 配置项 | 解决方案 | 归属 |
|---|---|---|---|
| 1 | PostgreSQL hosting | 选 Option A → Neon；或 Option B → Render/Railway 托管 Postgres | **REQUIRES HUMAN ACTION** |
| 2 | Directus hosting | 选 Option A → Fly.io 单容器；或 Option B → 同平台 Web Service | **REQUIRES HUMAN ACTION** |
| 3 | API base URL 硬编码 | `js/config.js` 的 `DATASOURCE_TARGETS` 按部署目标解析；新增 production 条目即可，不再改动任何页面 | **RESOLVED BY CODE** |
| 4 | HTTPS | Pages / Fly / Render 均自动签发；`js/config.js` 内置护栏：HTTPS 页面拒绝 http  API | **RESOLVED BY CODE**（护栏）+ **RESOLVED BY HOST CONFIG**（平台证书） |
| 5 | Admin credentials | 首次部署后立即在 Directus 修改默认管理员口令；口令只存在于托管平台的环境变量/面板中 | **REQUIRES HUMAN ACTION** |
| 6 | Backup / restore | `dynamic-mvp/scripts/backup_db.py` + `restore_db.py`，恢复后自动做行数校验（已在本地库端到端验证通过） | **RESOLVED BY CODE** + **REQUIRES HUMAN ACTION**（定时执行/异地保存） |
| 7 | 公网前端当前不可用 | PHASE 1 已解决：未知来源默认 json 静态演示 | **RESOLVED BY CODE** |
| 8 | Rollback | 见 §7：前端 revert / 后端镜像回退 / 数据库备份恢复三条独立路径 | **RESOLVED BY CODE**（脚本与流程）+ HOST CONFIG |
| 9 | 数据库持久化 | 托管实例自带持久化；本地仍用 docker volume | **RESOLVED BY HOST CONFIG** |
| 10 | CORS | Directus `CORS_ENABLED=true` + `CORS_ORIGIN=https://gina0014.github.io`（精确白名单，不用 `*`，不带尾斜杠） | **RESOLVED BY HOST CONFIG** |
| 11 | environment variables | `DB_*`、`KEY`、`SECRET`、`CORS_*` 全部在托管平台注入；仓库只提交 `.env.example` | **RESOLVED BY CODE**（已是如此）+ HOST CONFIG |
| 12 | secret management | 不在前端、不在仓库；`.gitignore` 已拦截 `.env` 与备份产物；CI 有 secret 扫描 | **RESOLVED BY CODE** |
| 13 | Directus 版本策略 | 固定到已验证的 11.x 小版本（当前本地 11.17.4），**不使用 latest**；升级前在 CI 的 db scope 上跑一遍 | **REQUIRES HUMAN ACTION**（决定升级节奏） |
| 14 | rate limiting / caching | 静态由 Pages CDN 承担；Directus 侧启用内建限流器环境变量（按平台文档配置），**不过度设计** | **RESOLVED BY HOST CONFIG** |
| 15 | logging | 平台自带日志；不自建 ELK | **RESOLVED BY HOST CONFIG** |
| 16 | health monitoring | Directus `/server/health`；用平台告警或免费外部拨测；不做复杂 APM | **REQUIRES HUMAN ACTION** |
| 17 | 权限 / published-only / 父子一致 | `step5_setup_workflow.py` 幂等重建 Directus Roles/Policies/Permissions + `v_public_*` 视图 + 触发器；目标环境重跑一次即可 | **RESOLVED BY CODE** |
| 18 | GitHub required checks | 见 §9；**不允许绕过 human review** | **REQUIRES HUMAN ACTION**（仓库设置） |

---

## 6. Backup / Restore（已落地且已验证）

### 6.1 备份

```bash
export PGHOST=<host> PGPORT=5432 PGUSER=<user> PGPASSWORD=<pwd> PGDATABASE=glp_prod
python dynamic-mvp/scripts/backup_db.py --out dynamic-mvp/backups
```

产出三件套：`<name>.dump`（`pg_dump -Fc` 自定义格式）、`.dump.meta.json`（11 张业务表行数快照）、`.dump.sha256`。
脚本自带三道自检，任一失败即退出非 0：

1. `pg_restore -l` 能列出归档对象 → 归档可读；
2. 行数快照写入 manifest；
3. 计算 sha256 → 可事后校验未被篡改。

### 6.2 恢复

```bash
python dynamic-mvp/scripts/restore_db.py --file <backup>.dump --target-db glp_restore_test
python dynamic-mvp/scripts/restore_db.py --file <backup>.dump --target-db glp_prod --force
```

两道防误操作闸门：必须显式给 `--target-db`；目标库非空时必须追加 `--force`。
恢复完成后**自动按 manifest 校验 11 张表行数**，不一致即退出非 0 —— **不允许"恢复完就算完"**。

### 6.3 本地端到端验证（2026-10-03，实跑）

```
备份： 292 个对象，203748 B，sha256 已生成           → BACKUP OK
恢复： 新建 glp_restore_test → pg_restore → 行数校验  → RESTORE OK
       11 张表行数与 manifest 完全一致
验证后：测试库已 DROP，主库恢复 61 / 59 published / 0 fixture
```

> 局限：本地验证走的是 Docker 内的 PostgreSQL 16；生产托管实例应保持同一大版本，
> 首次上线前需在**预发布库**上再跑一次完整备份→恢复演练。

### 6.4 备份策略建议（待人工确认）

- 频次：课题阶段每周一次 + 每次数据迁移前后各一次即可（数据量极小）；
- 存放：`dynamic-mvp/backups/` 已被 `.gitignore` 拦截，**绝不入库**；建议人工拷贝到网盘/对象存储一份异地副本；
- 保留：最近 4 份滚动；
- 演练：每学期至少做一次真实恢复到临时库并校验（脚本已经把验证做进退出码）。

---

## 7. Rollback

> **Git rollback ≠ Database rollback。** 三者必须分别定义。

### 7.1 Frontend（GitHub Pages）

| 场景 | 做法 | 生效 |
|---|---|---|
| 常规回退 | `git revert -m 1 <merge-sha>` → push main → Pages 自动重建 | 1–3 分钟 |
| 紧急回退 | 仓库 Settings → Pages → Source 指向已打好的 tag / 上一版 commit | 1–3 分钟 |
| 只回退数据源 | 把 `js/config.js` 里 production 条目注释掉 → 站点自动退回 json 静态演示 | 一次构建 |

前端**没有数据库状态**，回退永远是安全的。

### 7.2 Backend（Directus）

- 部署时**固定镜像摘要/小版本**，不使用 `latest`；把当前生效版本写进发布记录；
- 回退 = 把环境变量/镜像版本改回上一个已验证版本并重新部署；
- Directus 本身无状态（它不存业务数据），回退不影响数据。

### 7.3 Database（PostgreSQL）

数据一旦发生结构性迁移，Git 回退救不了：

1. **结构性迁移前**：先 `backup_db.py`（这是硬性前置）；
2. **小范围数据变更**：用托管平台的 PITR / 即时恢复回到变更前一刻；
3. **大范围错误**：恢复到**新库** `glp_restore_<ts>` → 校验行数 → 再把 Directus 的 `DB_*` 指向新库，**不原地覆盖**；
4. 全程保留旧库直到新旧对比通过。

---

## 8. Production Security（最低要求，不过度设计）

| 要求 | 落实方式 | 归属 |
|---|---|---|
| HTTPS only | Pages / 托管平台自动 HTTPS；前端护栏禁止 HTTPS 页请求 http API | CODE + HOST |
| CORS whitelist | `CORS_ORIGIN` 只填 `https://gina0014.github.io`，不用 `*` | HOST |
| new admin credentials | 上线后立即改默认口令；不使用默认 `admin@example.com` | HUMAN |
| no default password | 口令由平台随机生成并存入密码管理器 | HUMAN |
| secret only in hosting env | `KEY/SECRET/DB_PASSWORD` 只在平台注入；仓库只存 `.env.example` | HOST |
| no admin token in frontend | 前端只读公开角色（CI 已有静态校验与 Secret 扫描） | **CODE（已保证）** |
| public API read-only | Directus 公开角色只有 read 权限（由幂等脚本创建） | **CODE（已保证）** |
| published-only | 权限层强制 `status = published`；`v_public_*` 视图兜底 | **CODE（已保证）** |
| parent-child publication consistency | 权限层父实体过滤 + 数据库触发器 | **CODE（已保证）** |
| basic rate limiting / caching | 静态走 Pages CDN；Directus 启用内建限流器环境变量 | HOST |

**已知无法解决的限制**：GitHub Pages 不允许自定义 HTTP 响应头（如 CSP、HSTS）。
这是平台限制，接受它而不是为此自建 CDN。

---

## 9. GitHub Quality Gate → Required Checks

当前已有两个 job：**`Static quality gate`** 与 **`Database quality gate`**（见 `.github/workflows/quality-gate.yml`）。
设为必需检查（需仓库管理员权限，人工执行）：

1. 仓库 → **Settings** → **Rules** → **Rulesets**（或经典 Branch protection rules）→ **New ruleset / New branch protection rule**；
2. Target branch：`main`；
3. 勾选 **Require a pull request before merging** → Approval required ≥ 1（**保留人工 Review，不得绕过**）；
4. 勾选 **Require status checks to pass** → 搜索并勾选：
   - `Static quality gate`
   - `Database quality gate`
   （名称必须与 workflow 中 job 的 `name` 完全一致，否则搜不到）
5. 勾选 **Require branches to be up to date before merging**；
6. 勾选 **Do not allow bypassing the above settings**（或明确列出不豁免任何角色）；
7. 保存。之后所有 PR 必须：人审通过 + 两个 job 全绿 + 分支最新，才能合并。

> 注意：`main` 上的 **direct push 不会**被必需检查拦截（checks 是事后结果）。
> 若要真正防止绕过，请同时启用 ruleset 的 **Block direct pushes to main**。

---

## 10. 决策清单（等待人工）

1. 选择 **Option A** 还是 **Option B**（或都不选，维持 Static Public Demo）；
2. 确认 Directus 许可条款与镜像版本策略；
3. 决定是否启用 **Block direct pushes to main** 与 required checks；
4. 提供/创建付费账户（若走付费档）——**本助手不参与注册与支付**；
5. 确认备份存放位置与演练频次。

**在以上全部明确之前，不创建任何公网资源。**
