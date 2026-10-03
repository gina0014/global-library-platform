# PRODUCTION-CHECKLIST — 生产上线检查表

> **当前结论：`NOT PRODUCTION READY`。**
> PHASE 1（Public Static Demo）已完成并通过；PHASE 2（Dynamic Production Stack）**尚未开始**，
> 缺少托管 Postgres 与托管 Directus，因此动态生产链路整体为 BLOCKED。
>
> 图例：`PASS` 已满足 · `PENDING` 待托管环境就位后配置 · `BLOCKED` 缺资源或需人工决策

最后更新：2026-10-03（PHASE 1 上线并实测后）

---

## 上线证据（PHASE 1 实测，非本地模拟）

| 项 | 值 |
|---|---|
| 公网 URL | `https://gina0014.github.io/global-library-platform/` |
| Pages 来源 | `main` @ `/`，build_type `legacy` |
| 构建状态 | `built`，构建 sha `d7810bb75dfc0c9bb2a81fedc8d608d7f8089d58` |
| 合并 PR | `#10 feature-production-config → main`（merge commit `d7810bb`） |
| 变更提交 | `286ac346f15e8418326cc0362335d0fb43392e84` |
| Quality Gate | `Static quality gate` = success，`Database quality gate` = success |
| 公网实测 | `step12_verify_public_demo.py --base https://gina0014.github.io/global-library-platform` → **TOTAL=112 PASS=112 FAIL=0（PUBLIC DEMO OK）** |
| 页面覆盖 | Home / Libraries / Library Profile / Countries / Awards / Award Profile / Cases / Case Detail / World Map / Search / Ask AI / About（12 页） |
| 数据源实测 | 12/12 页面 `mode=json id=public-static-demo` |
| 内网请求 | 12/12 页面跨源 localhost / 内网请求 = `[]`，`:8055` 请求 = `[]` |
| Mixed content | 12/12 页面无 `http://` 子资源 |
| Console | 12/12 页面无 serious error |
| Secret 泄漏 | 12/12 页面渲染文本无 secret 特征 |

> 该证据为**上线后**在真实公网 URL 上跑出，不是本地 `?datasource=json` 模拟结果。

---

## Frontend

| # | 检查项 | 状态 | 依据 |
|---|---|---|---|
| F1 | 页面全部可访问（Home / Libraries / Library / Country / Awards / Award / Cases / Case / Map / Search / Ask AI / About） | **PASS** | 公网实测 12/12 页面渲染出真实内容（1356–6535 chars） |
| F2 | 公网构建数据源为 JSON 且不请求任何内网地址 | **PASS** | 公网实测："数据源为 json 模式" 12/12、"无跨源 localhost 请求" 12/12、"未请求 :8055" 12/12 |
| F3 | 数据源不再硬编码 `localhost` | **PASS** | `verify_datasource_config.mjs` 16/16 + CI static 新增检查（50/50） |
| F4 | HTTPS 页面无 mixed content | **PASS**（静态资源全同源 HTTPS） | 公网实测 12/12 页面无 `http://` 子资源 |
| F5 | 未把 `?datasource=` 之类的调试参数持久化 | **PASS** | 覆写仅当次加载生效，不写 localStorage |
| F6 | Static Public Demo ≠ Dynamic MVP 已在文档中明示 | **PASS** | `IMPLEMENTATION-008.md` §4 |
| F7 | 自定义安全响应头（CSP / HSTS） | **BLOCKED** | GitHub Pages 平台限制，不可改；需换 CDN 才有 —— 建议接受，不为此复杂化架构 |
| F8 | 生产域名 / 自定义域 | **PENDING** | 需人工决定是否绑定 |

---

## Backend（Directus）

| # | 检查项 | 状态 | 依据 |
|---|---|---|---|
| B1 | 托管实例存在 | **BLOCKED** | 尚未创建任何公网资源（按 STOP GATE） |
| B2 | 固定镜像版本（非 latest） | **PENDING** | 待部署时锁定 11.x（本地已验证 11.17.4） |
| B3 | 环境变量在托管平台注入 | **PENDING** | `KEY` / `SECRET` / `DB_*` / `CORS_*` |
| B4 | 健康检查端点可用 | **PENDING** | `/server/health` 需在公网验证 |
| B5 | 限流 / 缓存 | **PENDING** | 启用 Directus 内建限流器环境变量 |
| B6 | 回退方案（镜像版本回退） | **PASS（流程已定义，待演练）** | `PRODUCTION-PLAN.md` §7.2 |

---

## Database（PostgreSQL）

| # | 检查项 | 状态 | 依据 |
|---|---|---|---|
| D1 | 托管实例存在 | **BLOCKED** | 尚未创建 |
| D2 | 持久化 / 存储配额明确 | **PENDING** | 随托管一并确定 |
| D3 | SSL 连接 | **PENDING** | 托管实例默认要求 SSL |
| D4 | 迁移脚本可从零应用 | **PASS** | CI `database quality gate` 每轮从零跑 `db/ddl/01…05`（20/20） |
| D5 | 约束完整（PK / UNIQUE / FK） | **PASS** | CI db scope：PK 73 / UNIQUE 57 / FK 14 |
| D6 | 主从父子发布一致性孤儿 = 0 | **PASS** | CI db scope |
| D7 | 行数与 JSON baseline 一致 | **PASS** | CI db scope：22/61/5/69/10/64 |
| D8 | 备份 / 恢复脚本存在且**已实跑验证** | **PASS** | `backup_db.py` / `restore_db.py`，本地端到端通过（292 对象 / 203 KB / 11 表行数一致） |
| D9 | 定时备份策略在执行 | **PENDING** | 需人工设置频次与异地存放 |
| D10 | 恢复演练（预发布库） | **PENDING** | 正式上线前必做 |
| D11 | 数据库回滚路径 | **PASS（流程已定义，待演练）** |恢复到新库再切换连接，不原地覆盖 |
| D12 | Directus 权限 / 视图 / 触发器可幂等重建 | **PASS** | `step5_setup_workflow.py` 幂等；目标环境重跑即可 |

---

## HTTPS / CORS

| # | 检查项 | 状态 | 依据 |
|---|---|---|---|
| H1 | 前端 HTTPS | **PASS** | GitHub Pages 自动签发 |
| H2 | 后端 HTTPS | **PENDING** | 托管平台自动，待部署后实测 |
| H3 | CORS 精确白名单（非 `*`，无尾斜杠） | **PENDING** | `CORS_ORIGIN=https://gina0014.github.io` |
| H4 | HTTPS 页禁止 http 子接口 | **PASS** | `js/config.js` 内置护栏 + 策略矩阵覆盖 |

---

## Secrets

| # | 检查项 | 状态 | 依据 |
|---|---|---|---|
| S1 | 仓库无私钥 / token / `.env` | **PASS** | CI secret 扫描 + 远端 tree 核查（`.env` 0 命中） |
| S2 | 前端不持有任何 admin token | **PASS** | CI 静态校验 + 公开角色只读 |
| S3 | 备份产物不入库 | **PASS** | `dynamic-mvp/.gitignore` 新增 `backups/` |
| S4 | CI 无明文 secret、不连生产库 | **PASS** | quality-gate 只连临时 service container |
| S5 | 生产管理员口令已轮换且非默认值 | **PENDING→需人工** | **REQUIRES HUMAN ACTION** |

---

## Permissions / 数据可见性

| # | 检查项 | 状态 | 依据 |
|---|---|---|---|
| P1 | 公开角色只读 | **PASS** | step3 / step6 全绿（含权限矩阵） |
| P2 | published-only | **PASS** | API 层强制；`?datasource=json` 模式同样按 status 过滤 |
| P3 | draft / pending 零泄露 | **PASS** | step10 AC3 + step11 AC4 |
| P4 | 父子发布一致性 | **PASS** | CI db scope orphan = 0 |
| P5 | Ask AI 不编造 / 有 provenance | **PASS** | step11 AC3 / AC5（63/63） |

---

## Logging / Health / QA

| # | 检查项 | 状态 | 依据 |
|---|---|---|---|
| L1 | 集中日志与保留策略 | **PENDING** | 依赖托管平台；建议直接用平台日志，不自建 |
| L2 | 可用性告警 / 拨测 | **PENDING** | 需人工决定是否接入免费拨测 |
| L3 | Quality Gate 存在并跑绿 | **PASS** | GitHub Actions：static 50/50、db 20/20，远端多次 success |
| L4 | Quality Gate 设为 required checks | **PENDING** | 需仓库管理员在 Settings 操作（不得绕过人审） |
| L5 | 禁止直接 push main | **PENDING** | 建议 ruleset 勾选 Block direct pushes |
| L6 | 全量回归脚本可用 | **PASS** | step3 128 / step6 53 / step8 20 / step10 56 / step11 63 / step12 100（本地模拟）· step12 112（公网实测） |

---

## Deployment / Post-deployment

| # | 检查项 | 状态 | 依据 |
|---|---|---|---|
| E1 | PHASE 1 Public Demo 已上线且可用 | **PASS** | 公网实测 `https://gina0014.github.io/global-library-platform/` → 112/112；Pages build `built` @ `d7810bb` |
| E2 | PHASE 2 动态生产栈已部署 | **BLOCKED** | 等待人工选择 Hosting Option |
| E3 | 生产数据迁移已完成 | **BLOCKED** | 同上 |
| E4 | 部署后页面级回归（真机） | **PENDING** | 部署后用 `step12 --base <production>` 复跑 |
| E5 | 部署后备份首跑 | **PENDING** | 上线后立即执行并落异地 |
| E6 | 回滚演练 | **PENDING** | 建议上线前在预发布环境演练一次 |

---

## 汇总

| 类别 | PASS | PENDING | BLOCKED |
|---|---|---|---|
| Frontend | 6 | 1 | 1 |
| Backend | 1 | 4 | 1 |
| Database | 6 | 4 | 1 |
| HTTPS / CORS | 2 | 2 | 0 |
| Secrets | 4 | 1 | 0 |
| Permissions | 5 | 0 | 0 |
| Logging / Health / QA | 3 | 3 | 0 |
| Deployment | 1 | 3 | 2 |
| **合计** | **28** | **18** | **5** |

**判定：Public Static Demo 可用；Dynamic Production 未部署。** 在人工确定 Hosting Option 之前，不应推进 E2–E6。
