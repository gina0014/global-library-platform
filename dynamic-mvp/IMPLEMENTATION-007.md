# D2 — GitHub Actions / Automated QA：自动质量门

**分支**：与 D1 同在 `feature-ask-ai-dynamic`（D2 提交 `eca2741` 直接叠在 D1 提交 `bc4ef63` 之上；
两个 commit 各自独立可追溯，未合并成一个）——避免再次切分支（该仓库切分支曾多次误删被跟踪文件）。
**范围**：本地 Dynamic MVP + GitHub Actions。未部署、无公网数据库、无生产变更。
**状态**：见 §7 Sprint Decision。

---

## 1. D2.1 — CI 范围与设计原则

**不重写测试体系。** 把已经成熟的手工验证（step3 / step6 / step8 / step10 / step11 中
**不需要 Directus 与浏览器**的部分）沉淀为 Pull Request 上的自动检查，
统一入口是 `dynamic-mvp/scripts/ci_check.py`，工作流只负责调用它。

```
Developer / AI Change
        ↓
Pull Request / push to main
        ↓
GitHub Actions（Quality Gate）
        ├── job static   ：JSON baseline / PK / FK / UNIQUE / 溯源 / 违禁文件 / 前端健全性
        └── job database ：临时 PostgreSQL service container（迁移 / 约束 / 治理 / 保真）
        ↓
PASS / FAIL
        ↓
Human Review → Merge
```

### 为什么只放这两类

用户要求"如果完整 Docker + Directus E2E 在 GitHub Actions 中稳定可运行：再加入 API
integration tests；如果运行环境不稳定：**不要为了"全自动"制造 flaky CI**"。

Directus E2E 需要在 runner 上拉起两个镜像、等待 Directus 完成 bootstrap，
再依赖无头 Chromium 做十余个页面的渲染比对——任一步超时就会产生**与代码无关的失败**。
因此本轮不把它放进 CI，而是保留为**本地 release gate**，并在此明确记录（见 §4）。

---

## 2. 检查项

### job `static`（无外部服务）

| # | 检查 | 内容 |
|---|---|---|
| 1 | JSON baseline 完整性 | 6 类核心数据文件存在且可解析 |
| 2 | PK | 每类主键唯一且非空 |
| 3 | FK | `library.country_id`、`award_result.award_id/library_id`、`case.library_id`、五张关联表两端 |
| 4 | UNIQUE | `award_result (award_id, library_id, year, category, result_type)`；五张关联表复合键 |
| 5 | 状态枚举 | 所有记录的 `status` 落在合法枚举内 |
| 6 | Source 溯源 | 有 URL 的来源必须是 http(s)；无 URL 的来源必须可识别（离线汇编文档）且前端不渲染空链接 |
| 7 | 违禁入库文件 | 无 `.env` / docker 数据 / 浏览器 profile 被跟踪；只允许 `.env.example` 占位模板 |
| 8 | Secret 扫描 | 前端 / 脚本 / 数据内无明文凭据，前端无内嵌 admin token |
| 9 | 前端静态健全性 | 21 个 JS 模块 `node --check`；页面 HTML 内不直接发起数据请求 |
| 10 | 检索 / Ask AI 契约 | C2 只经 `searchAll()`、D1 只经 `askPlatform()`、接地引擎不 fetch / 不引 LLM |

> 第 10 项做**代码层**的检索契约校验（通路唯一性），不做运行时检索测试——
> 运行时的 C2 检索验收（`step10` 56/56）属于需要 Directus 的本地 release gate。

### job `database`（PostgreSQL 16 service container）

| # | 检查 | 内容 |
|---|---|---|
| 1 | 迁移完整性 | 5 个 DDL / 种子文件按序全量可应用（从零建库） |
| 2 | 约束存在性 | PRIMARY KEY / UNIQUE / FOREIGN KEY 均已建立 |
| 3 | published-only & 父子一致性 | 无「已发布 award_result / case 挂在未发布父实体」 |
| 4 | 治理视图可用 | `v_public_award_result` / `v_public_case_project` / `v_public_library_source` |
| 5 | 迁移保真 | 六类表行数与 `data/*.json` 逐类一致 |

容器密码 `ci_password` 写在 workflow 里：它是**随 job 创建、随 job 销毁**的临时容器凭据，
不是任何生产密钥（见 §6）。

---

## 3. 触发与并发

- `pull_request`（任意分支）+ `push` 到 `main`。
- 同分支并发运行时取消旧任务（`concurrency`）。
- `permissions: contents: read` —— 最小权限。

---

## 4. 明确不在 CI 内（本地 release gate）

以下验收**仍由本地执行**，原因：需要 Directus 与无头浏览器，在 Actions 上不稳定。

| 脚本 | 内容 | 本地结果 |
|---|---|---|
| `step3_verify_data.py` | 数据 / API 层（含权限与防泄露） | 128/128 |
| `step6_verify_workflow.py` | B3 治理工作流 | 53/53 |
| `step8_verify_map.py` | C1 动态地图 | 20/20 |
| `step10_verify_search.py` | C2 动态检索 | 56/56 |
| `step11_verify_askai.py` | D1 Ask AI 接地 | 63/63（见 IMPLEMENTATION-006 §6） |

它们被 `step11` 的 D1-AC7 串起来做回归，也在本地随时可跑。

---

## 5. 验收结果

| AC | 要求 | 证据 | 结果 |
|---|---|---|---|
| D2-AC1 | workflow YAML 被 GitHub 正确识别 | YAML 解析：`name=Quality Gate`、`jobs=[static, database]`、触发 `pull_request`+`push(main)`、`permissions: contents: read` | **PASS** |
| D2-AC2 | 良好代码上全部必需检查通过 | `--scope static` **TOTAL=47 PASS=47 FAIL=0**；`--scope db` **TOTAL=20 PASS=20 FAIL=0**（PK 73 / UNIQUE 57 / FK 14；孤儿 0；视图 66 / 8 / 95；保真 22/61/5/69/10/64 与 JSON 一致） | **PASS** |
| D2-AC3 | 人为注入可控错误 → 至少一项 FAIL | static：注入复合 UNIQUE 重复行 + 非 http(s) 伪造 Source URL → **2 项 FAIL**；database：`05-governance.sql` 追加引用不存在父表的 ALTER → **1 项 FAIL** | **PASS** |
| D2-AC4 | 还原后全部恢复 PASS | 两个 job 均写回原值（`git diff` 为空），复跑 static **47/47**、db **20/20** | **PASS** |
| D2-AC5 | CI 中无 secret 明文 | 工作流不使用 `secrets.*`；`ci_password` 是临时 service container 启动参数，不对应任何真实环境；Secret 扫描检查项本身 PASS | **PASS** |
| D2-AC6 | CI 不修改生产数据 | db job 只连 job 内临时 PostgreSQL（`DROP/CREATE ci_glp` 从零迁移），job 结束即销毁；无任何外部 / 公网连接 | **PASS** |
| D2-AC7 | CI 不自动公开部署 | 无 deploy job、无发布步骤、无 `workflow_dispatch` 部署触发；合并仍需人工评审 | **PASS** |

### 5.1 D2-AC3 注入 / 还原实录

**static job**（脚本：`dynamic-mvp/scripts/d2_ac3_break_and_restore.py`；日志落在 gitignore 的 `evidence/`）

```
注入 A：award-results.json 追加 (1,17,2016,general,winner) 复合键重复行
注入 B：source 1 的 URL 改为 ftp://example.invalid/fabricated-source
  [FAIL] UNIQUE：award_result (award_id, library_id, year, category, result_type)
  [FAIL] provenance：有 URL 的来源全部使用 http(s)
还原：文件写回原值=True，git diff 为空=True → 复跑 47/47 PASS
```

**database job**（同上，日志同样落在 gitignore 的 `evidence/`；需本机 Docker 与 PostgreSQL）

```
注入：05-governance.sql 追加 ALTER TABLE library ... REFERENCES ac3_table_that_does_not_exist(id)
  [FAIL] DDL 可应用：05-governance.sql — ERROR: relation "ac3_table_that_does_not_exist" does not exist
还原：文件写回原值=True，git diff 为空=True → 复跑 20/20 PASS
```

> 注入脚本本身也入库了：`dynamic-mvp/scripts/d2_ac3_break_and_restore.py`（static），
> 便于以后每次改质量门时重新证明"门真的会红"——而不是只在文档里声称。

---

## 6. 安全

- **CI 无 secret 明文**：工作流不使用 `secrets.*`，不配置 token；
  数据库口令是临时 service container 的启动参数，不对应任何真实环境。
- **CI 不修改生产数据**：db job 只连 job 内的临时 PostgreSQL，job 结束即销毁；
  不连任何外部 / 公网数据库。
- **CI 不自动部署**：无 deploy job、无发布步骤、无 `workflow_dispatch` 部署触发。
- 合并仍由人工评审决定：CI 失败不得合并。

---

## 7. Known Limitations

1. Directus / 浏览器 E2E 未纳入 CI（§4），需本地执行。
2. `static` job 的契约检查是**静态**的：能证明"只有一条数据通路"，
   不能证明运行时的检索/问答结果正确（那部分由 `step10` / `step11` 覆盖）。
3. CI 不做性能 / 负载测试。
4. 未接入分支保护规则（需在仓库 Settings 里把这两个 job 设为 required，属人工配置步骤）。

---

## 8. Sprint Decision

**D2 = ACCEPTED（本地 Dynamic MVP + GitHub Actions 范围内）。**

- D2-AC1 … D2-AC7 全部 PASS：YAML 可识别、良好代码全绿、注入错误会红、还原后回绿、
  无明文 secret、不碰生产数据、不自动部署。
- 未触发任何 STOP CONDITION：没有 secret 需要进前端、CI 不改生产数据、CI 不自动公开部署、
  没有为了"全自动"去制造 flaky CI（Directus / 浏览器 E2E 仍为本地 release gate）。
- 本轮顺带修掉一处 CI 脚本可移植性缺陷：`shlex.split` 在 Windows 下会吃掉路径反斜杠，
  已改为按平台选择 posix / 非 posix 切分（Linux runner 行为不变）。

剩余工作属**配置类**，不是代码缺陷：把这两个 job 设为 required check（仓库 Settings，需人工操作）。
