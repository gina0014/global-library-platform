# Issue 001 Review

**分支**：`feature-library-dynamic-slice`
**基线**：`recovery-data-refresh-baseline` @ `a64d827`
**提交**：`6bc4b22` — feat: add library dynamic data vertical slice
**未 push / 未 merge / main 未修改（仍为 `dc0b63e`）/ 未部署公网**

---

## Scope

只做 Issue 001：把 **Library** 从静态 JSON 切到真实数据源，证明「写入 → 存储 → API → 前台」闭环。

- ✅ 建库建表（V0.2 → PostgreSQL，仅方言转换）
- ✅ 迁移 Country 22 / Library 61（含 59·1·1 三态，保持原 ID）
- ✅ Directus 公开读 API（published-only）+ 仅 AC2 用的最小写入通道
- ✅ 统一数据入口改造（`js/data-loader.js`）
- ✅ 测试与文档
- ❌ 未做：B2 全量迁移、B3 审核流 / CMS、Map、Search、AI、部署

未发现「Issue 未要求但已实现」或「Issue 要求但未实现」的项；
**唯一偏差**是 Issue §3 提到的「关联数据」中 Award / Award Result / Case / Source 仍走 JSON ——
这已由人工指令确认为本轮允许的 Hybrid 状态（页面不退化，见 Remaining Limitations）。

## Architecture

```
PostgreSQL (postgres:16-alpine)
        ↓
Directus 11.17.4 (directus/directus:11)
        ↓ REST  /items/library  /items/country
        ↓ 权限层强制 status = published
js/data-loader.js（Single Data Access Point）
        ↓ 函数签名不变
Existing Library Page（library.js / library.html 零改动）

Library / Country → API
Award / Award Result / Case / Source → data/*.json
```

Hybrid Transitional Architecture —— 本轮不消除。

边界确认：`library.js` 未改、`library.html` 未改、`?id=` URL 未改、
Design System 未改、`data/*.json` 未改（Git 已验证）。

## AC1–AC6

| AC | 结果 | 证据 |
|---|---|---|
| AC1 | **PASS** | 移除 `data/libraries.json` 后页面仍完整渲染；文件已还原且 md5 不变 |
| AC2 | **PASS** | ID 1 / 字段 city / 原值 上海 → 测试值 → 前台显示新值（JSON mtime 未变）→ 已还原并复验 |
| AC3 | **PASS** | pending(18) / draft(23) → Not Found；列表与搜索无结果；API 直取 → 403 |
| AC4 | **PASS** | 61 个 `library_id` 与基线集合完全一致 |
| AC5 | **PASS** | 61 条 `country_id` FK 全部有效，页面国家显示正确 |
| AC6 | **PASS** | api 与 json 两种数据源下页面渲染文本**逐字一致**（2142 字符）；URL / 区块 / 控制台无变化 |

数据 / API 层测试 22/22 PASS；前台浏览器测试 19/19 PASS。

## Regression

published Library、非法 ID → Not Found、Country 关系、Awards / Cases / Sources / Quick Facts、
首页、Libraries 列表、World Map、Awards 页、控制台错误 ——
**New Serious FAIL = 0**（Console errors = 0）。

> 环境说明：浏览器自动化需要访问 localhost:8000 / :8055。
> 若复现时出现空文本，先判 ENVIRONMENT FAILURE（静态站 200 + API 200，页面文本为空），
> 不得以修改业务代码的方式绕过。

## Security

| 检查 | 结果 |
|---|---|
| 公开 read：published-only | ✅ API 权限层强制；pending / draft → 0 条或 403 |
| 公开 write / delete | ✅ 403 |
| 未使用「API 返回全部 + JS 过滤」 | ✅（前端 `getPublished()` 仅作 defense-in-depth） |
| 仓库内 secret | ✅ 无。`.env` 未入库；脚本凭据改读环境变量；全量检索无残留 |
| `js/data-loader.js` | ✅ 仅含本地 API 基址，无 token |

## Git Diff

13 个文件，全部 EXPECTED：

- `js/data-loader.js`（唯一业务代码改动）
- `dynamic-mvp/.gitignore`、`.env.example`、`docker-compose.yml`
- `dynamic-mvp/db/ddl/01-schema-country-library.postgresql.sql`、`02-seed-country-library.sql`
- `dynamic-mvp/db/seed/generate-seed.py`
- `dynamic-mvp/scripts/`：`dapi.py`、`step2_setup_permissions.py`、`step3_verify_data.py`、
  `step4_verify_frontend.py`、`browser_suite.mjs`
- `dynamic-mvp/IMPLEMENTATION-001.md`

未改动：Stage 1–10 冻结产物、`PRODUCT.md`、既有 Issue 定义、Design System、
`data/*.json`、`library.js`、`library.html`、其他页面。

Docker / 生成物检查：`docker volume` 数据、`evidence/`、`.cdp-profile/`、日志、`.env`
均被 `.gitignore` 拦截，未入库。

## Commit

```
6bc4b22 (HEAD -> feature-library-dynamic-slice) feat: add library dynamic data vertical slice
13 files changed, 1731 insertions(+), 8 deletions(-)
git status → nothing to commit, working tree clean
```

## Remaining Limitations

1. Hybrid 数据源：Award / Award Result / Case / Source 仍读 JSON（属 B2）。
2. `http://localhost:8055` 为本地固定基址，部署前需人工确认 API 基址与 CORS。
3. 数据在 docker volume 中，`down -v` 后需 `up -d` 由 init 脚本重建（已验证可重建）。
4. `last_updated` 未在写入时自动刷新（属 B3 审核流程范围）。
5. 父子状态链未在服务端强制（子对象仍在 JSON 侧，沿用 Stage 8 基线行为）。
6. Directus 11.17.4 → 12.4.1 有可用更新，本轮不升级。
7. Source 外链 `target="_blank"` 为人工复核项（本轮未自动化断言）。

## Review Decision

**READY FOR HUMAN ACCEPTANCE**

（本地 Dynamic MVP，未生产化；未经人工批准不得部署，不得开始 B2 / B3 / Map / Search / AI。）
