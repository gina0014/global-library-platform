# IMPLEMENTATION-008 — PHASE 1：Public Static Demo 恢复（数据源运行时配置）

**分支**：`feature-production-config`
**决策依据**：人工批准 Two-Phase Controlled Deployment，PHASE 1 = Restore Public Demo Availability。
**本轮性质**：配置重构 + 恢复既有公网站点的可用性。不含任何付费行为、不创建公网资源、不迁移数据。

---

## 1. 问题

Sprint 3 审计 §4.1 已记录，但当时**只披露、未修复**：

| 项 | 改造前 |
|---|---|
| 数据源模式 | `js/data-loader.js` 里 `const DATA_SOURCE_MODE = "api";`——编译期常量 |
| API 地址 | `API_DATASOURCE.baseUrl = "http://localhost:8055"`——写死 |
| 运行时回退 | **无**。API 不可达直接抛 `DataLoadError`，页面进错误态 |
| GitHub Pages 后果 | 公网访客的浏览器去请求**他自己机器的 8055 端口** → 全部数据页报 "Unable to load platform data." |

硬编码的 `localhost` 在公网环境里永远是错误的，这不是配置问题而是设计问题：
一套源码必须能同时表达「本地动态开发」与「公网静态演示」两种意图。

---

## 2. 原则

严格按 PHASE 1 要求执行：

- **不得删除**：API 模式、PostgreSQL、Directus、Dynamic MVP 代码 → 全部完整保留；
- **不得删除**：JSON fallback（`data/*.json`）→ 完整保留，它是 Public Demo 的数据源；
- **不引入前端框架**，不引入构建步骤（GitHub Pages 直接托管仓库文件）；
- 通过**明确的部署配置**而不是"删代码"来让 Pages 使用 JSON；
- Dynamic MVP 与 Public Demo 暂时解耦，但解耦的是**运行时选择**，不是代码存在与否。

---

## 3. 架构：单一配置源 + 部署目标白名单

新增/调整集中在两个文件，**页面脚本零改动**：

```
         ┌──────────────────────────────────────────────┐
         │  js/config.js（唯一真源）                     │
         │  resolveDataSource()                         │
         │   1. URL 覆写 ?datasource=api|json（仅 QA）   │
         │   2. DATASOURCE_TARGETS 按 hostname+protocol │
         │   3. DEFAULT_DATASOURCE = json（未知来源底线）│
         │   护栏：HTTPS 页面禁止 http:// 接口           │
         └───────────────┬──────────────────────────────┘
                         │ DATASOURCE { id, mode, apiBaseUrl, reason }
                         ▼
         js/data-loader.js（只消费，不判断）
           useApi(key) = mode==="api" && baseUrl && collections[key]
                         │                    │
                Directus REST          data/*.json
```

### 3.1 部署意图 → 运行时行为

| 部署目标 | hostname | 解析结果 |
|---|---|---|
| Local Dynamic Development | `localhost` / `127.0.0.1` | **api** 模式 + 本地 Directus |
| Public Static Demo（GitHub Pages） | `gina0014.github.io` | **json** 模式 + `data/*.json` |
| Future Production（PHASE 2） | 待人工登记 | **api** 模式 + HTTPS 域名 |
| 其他任何未登记来源 | — | **json** 模式（安全兜底） |
| `file://` 直接打开 | — | **json** 模式（离线也能看完整站点） |

PHASE 2 上线时只需在 `DATASOURCE_TARGETS` **追加一条**：

```js
{ id: "production", mode: "api",
  apiBaseUrl: "https://<正式 API 域名>",
  hostnames: ["<正式前端域名>"], protocols: ["https:"] }
```

CI 有回归校验禁止在人工确认前预填 `production` 条目。

### 3.2 安全护栏

HTTPS 页面若解析出 `http://` 接口（无论来自目标表还是 URL 覆写），
**立即降级为 json 并 `console.warn`**，从根上排除 mixed content。

### 3.3 诊断快照

`window.__GLP_DATASOURCE__` 是只读诊断快照（id / mode / 地址 / 判定原因，**不含凭据**），
供排障与自动化验收读取。

---

## 4. Static Public Demo ≠ Dynamic Production MVP

**必须明确区分**（本轮已经做到并在文档中记录）：

| | Static Public Demo（当前线上） | Dynamic Production MVP（PHASE 2） |
|---|---|---|
| 数据来源 | `data/*.json` 快照 | PostgreSQL（经 Directus API） |
| Admin 后台写入 | **不会反映到公网**（预期行为） | 实时反映 |
| draft / pending 可见性 | 由 JSON 里的 `status` 字段决定 | 由 Directus 权限层强制 published-only |
| 适用指向 | 演示、评阅、离线查看 | 真实数据运营 |

Admin 页面的写入不实时反映到 Static Public Demo 属于**预期行为，不是缺陷**。

---

## 5. 验收脚本去污染

改造前，`step4 / step10 / step11` 通过**改写 `js/data-loader.js` 源码**来切 api / json：

- 中断一次就把源码留在错误模式下，污染后续所有验收（本 Sprint 已多次踩到）；
- 每轮都要做 md5 还原比对，本身也是一类假 FAIL 来源。

改造后模式切换走 `?datasource=` URL 覆写，**验收脚本不再触碰任何源码**：

| 脚本 | 改造 |
|---|---|
| `step4_verify_frontend.py` | `set_mode()` 变为 no-op；json 对照组改用 `?datasource=json` |
| `step10_verify_search.py` | 同上；对照组 `c2_json_*` / `c2_jedge_*` 加参数 |
| `step11_verify_askai.py` | 同上；原"保持 api 模式"断言改为"源码零污染" |

---

## 6. 新增校验

### 6.1 `dynamic-mvp/scripts/verify_datasource_config.mjs`（Node，可进 CI）

用伪造的 `window.location` 把策略逐条跑一遍，把"部署行为"变成可回归断言。
**不联网、不启动浏览器、不需要 Docker**。16 项：

| 类别 | 断言 |
|---|---|
| 本地开发 | localhost / 127.0.0.1 → api + 本地地址 |
| 公网静态演示 | `gina0014.github.io`（http/https）→ json 且无 api 地址 |
| 未登记来源 | example.org / glp.example.edu / file:// → json |
| QA 覆写 | localhost + `?datasource=json` → json |
| HTTPS 护栏 | HTTPS 页被强制 api → 降级 json |
| 静态契约 | `DEFAULT_DATASOURCE.mode` 恒为 json；目标表无 `production` 条目 |
| 硬编码回归 | data-loader 无 `DATA_SOURCE_MODE`、无 `localhost`；config.js 中本地地址只出现 1 次 |

结果：**TOTAL=16 PASS=16 FAIL=0**

### 6.2 `dynamic-mvp/scripts/step12_verify_public_demo.py`（浏览器，11+1 个页面）

覆盖 Home / Libraries / Library Profile / Countries / Awards / Award Profile /
Cases / Case Detail / World Map / Search / Ask AI（+ About）。
每页检查：渲染出内容、未落到错误态、显示 JSON baseline 实体、数据源确为 json、
无跨源 localhost 请求、未请求 8055、HTTPS 页无 http 子资源、Console 无 serious error、文本无 secret。

结果（本地模拟 Public Demo：`--force-json`）：**TOTAL=100 PASS=100 FAIL=0**

### 6.3 CI 静态闸门（static scope 47 → 50）

新增 3 项：data-loader 无硬编码、默认策略为 json、**策略矩阵必须全绿**。

---

## 7. 改动清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `js/config.js` | 修改 | 新增 DATASOURCE 段：目标表 / 默认策略 / 覆写 / HTTPS 护栏 / 诊断快照 |
| `js/data-loader.js` | 修改 | 删除编译期常量与写死地址，改为消费 `DATASOURCE`；`useApi` 增加地址非空判断 |
| `dynamic-mvp/scripts/verify_datasource_config.mjs` | 新增 | 策略矩阵（CI 可用，Node） |
| `dynamic-mvp/scripts/step12_verify_public_demo.py` | 新增 | Public Demo 页面级验收 |
| `dynamic-mvp/scripts/step4_verify_frontend.py` | 修改 | 停止改写源码 |
| `dynamic-mvp/scripts/step10_verify_search.py` | 修改 | 同上 |
| `dynamic-mvp/scripts/step11_verify_askai.py` | 修改 | 同上 |
| `dynamic-mvp/scripts/step8_verify_map.py` | 修改 | 新增 `--no-nested`（见 §7.1） |
| `dynamic-mvp/scripts/backup_db.py` / `restore_db.py` | 新增 | PHASE 2 备份 / 恢复（含自检与行数校验），已在本地库端到端验证 |
| `dynamic-mvp/scripts/ci_check.py` | 修改 | 新增 3 项数据源静态检查 + 在 static scope 内跑策略矩阵 |
| `dynamic-mvp/.gitignore` | 修改 | 新增 `backups/`（备份产物含全量业务数据，绝不入库） |
| `dynamic-mvp/PRODUCTION-PLAN.md` / `PRODUCTION-CHECKLIST.md` | 新增 | PHASE 2 生产方案与检查表（计划，未执行） |
| `data/*.json` | **未改动** | 仍是 Public Demo 的数据源与迁移基线 |

---

## 7.1 去掉三层嵌套回归（验收设计缺陷修复）

改造前 step11 的 AC7 依次跑 step3 / step6 / step8 / step10，而 step10 自己又跑
step3 / step6 / step8，step8 再跑 step3 / step6 —— 同一批浏览器回归被重复执行 6 遍，
一次验收 1.5 小时以上，且长时间反复拉起 Edge 会把浏览器实例跑挂。

改造后：顶层驱动对被调套件传 `--no-nested`，**每个套件在一次验收中只完整执行一次**。
对账（PHASE 1 最终跑批）：

| 套件 | --no-nested（被顶层调用） | 独立执行（含自身嵌套） |
|---|---|---|
| step3 数据 / API 层 | 128 / 128 | 128 / 128 |
| step6 B3 工作流 | 53 / 53 | 53 / 53 |
| step8 C1 地图 | **18 / 18** | 20 / 20（多出的 2 项即其嵌套的 step3 / step6） |
| step10 C2 检索 | **53 / 53** | 56 / 56（多出的 3 项即其嵌套的 step3 / step6 / step8） |
| step11 D1 Ask AI | **63 / 63** | 63 / 63 |

被跳过的是"重复执行"，不是"免检"：顶层驱动仍然逐个跑完 step3 / step6 / step8 / step10。

---

## 8. 已知差异

1. 本项目**没有 Countries 列表页**，唯一的国家页面是 `pages/country.html?id=`，
   因此 brief 中 "Countries" 落到国家详情页。
2. `?datasource=` 是**页面级**覆写，不持久化；普通访客不会因一次点击改变整站数据源。
3. Static Public Demo 不反映 Admin 写入（见 §4，预期行为）。
4. PHASE 2 之前，`DATASOURCE_TARGETS` 只有 `local-dev` 一条，任何公网来源都走 json。
