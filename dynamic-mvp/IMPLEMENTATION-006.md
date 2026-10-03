# D1 — Ask AI Dynamic Upgrade：数据接地的问答助手

**分支**：`feature-ask-ai-dynamic`（自 C2 已合并的 `main` 创建）
**范围**：本地 Dynamic MVP。未部署、无公网数据库、无生产变更。
**状态**：见 §7 Sprint Decision。

---

## 1. D1.1 — CURRENT ASK AI AUDIT（改动前的现状）

审计对象：`pages/ask-ai.html` · `js/ask-ai.js` · `js/utils.js#answerQuestion`。

### 1.1 当时支持什么问题

5 个关键词意图，顺序匹配、命中即返回：

| # | 意图 | 触发词 | 输出 |
|---|---|---|---|
| 1 | green library | `green` / `绿色` | 绿色类别获奖记录 + sustainability 案例 |
| 2 | award-winning libraries | `award` / `prize` / `奖项` / `获奖` | 有获奖记录的图书馆（可按国家收窄） |
| 3 | libraries by country | 国家别名/名称 | 该国图书馆（可按类型收窄） |
| 4 | cases | `case` / `project` / `案例` | 全部可见案例 |
| 5 | all libraries | `library` / `libraries` / `图书馆` | 全部已发布图书馆（可按类型收窄） |

其余问题统一返回"支持范围有限"提示 + 建议问题。

### 1.2 当时的数据来源

`js/ask-ai.js` 通过 `data-loader.js` 的 `loadAllCoreData()` / `loadCountrySource()` /
`loadAwardResultSource()` 取数 —— **结构上已经是统一入口**，api 模式下读的就是 API 数据。
`answerQuestion()` 是纯函数，不 fetch、不读 JSON 文件。

**但**：页面文案自称 "scripted local-data demo / rule-based prototype"，
把一条已经动态的数据通路描述成了"演示"，与实际能力不符。

### 1.3 当时的限制

1. **问题类型不够**：不支持"某图书馆获得过哪些奖项"、"某奖项有哪些获奖图书馆"
   这两类最典型的实体型问题。
2. **provenance 不全**：5 个意图里只有 country 与 green 两个带 Source，
   award / cases / all_libraries 的 `sources` 恒为空数组。
3. **无法自动化验证**：页面只支持表单提交，没有 `?q=` 直达入口。
4. **匹配大小写敏感风险**：实体解析依赖手写关键词包含判断。
5. 文案与实现脱节（自称 Demo，但数据已经是动态的）。

### 1.4 哪些能力可以直接复用

- `data-loader.js` 已经是唯一数据访问点 → 无需新建第二通路。
- C2 的 `searchAll()` 已是服务端动态检索 → 主题兜底直接复用，不重写一套搜索。
- 五张 `*_source` 关联表已 API 化 → provenance 有真实数据支撑。
- `utils.js` 的 `detectCountry` / `detectLibraryType` / `getVisibleCases` / `getSourcesForEntity`
  等实体解析与可见性判定函数可直接复用。

---

## 2. D1.2 — 架构：Dynamic Retrieval + Template Composition

```
User Question
      ↓  normalizeQuestion（去控制字符、限长 400；匹配用小写副本）
Intent & Entity Resolution（只认平台数据里真实存在的记录）
      ↓  libraryAwards / awardLibraries / greenLibrary /
         librariesByCountry / cases / allLibraries / topicSearch
Answer Composition（模板 + 真实计数，不生成事实）
      ↓
Provenance（经 *_source 关联表解析真实 Source 记录）
```

**明确不做**：不接 LLM，不引入 Vector DB / Embedding / 检索服务。
理由与 C2 同源 —— 在 61 Library / 69 Award_Result / 10 Case / 64 Source 的规模上，
结构化解析 + 服务端检索已经能可靠回答目标问题；
新增向量基础设施只会带来同步链路与运行时依赖，不解决任何已观测到的问题。
真正 LLM 接入保留为 **deployment / configuration step**（见 §8）。

问题解析不出来的结果一律走"平台数据不足以回答"，**绝不靠生成补全**。

---

## 3. D1.3 — 数据访问

```
Ask AI 页面 → data-loader.askPlatform(question, data, searchFn)
                    ↓
              js/ask-ai-adapter.js（纯计算，不 fetch）
                    ↓  主题兜底
              data-loader.searchAll() → C2 检索适配器 → Directus
```

- 页面不直接 fetch、不读 `data/*.json`、不连 Directus（step11 有静态校验）。
- `ask-ai-adapter.js` **不发起任何请求**：数据全部由调用方经 `data-loader.js` 传入。
- published-only 由服务端权限层保证；适配器内再做一次 `status === "published"` 过滤作为兜底。
- 父子发布一致性同样生效：`award_result` 要求 Award 与 Library 均 published，
  `case_project` 要求 Library published —— 解析出的父子对不完整就不计入答案。
- 两种模式（api / json）**共用同一个接地引擎**，因此答案口径天然一致。

---

## 4. D1.4 — Provenance

| 意图 | provenance 来源 |
|---|---|
| library_awards | `library_source` + `award_result_source` |
| award_libraries | `award_source` + `award_result_source` |
| green_library | `award_result_source` |
| libraries_by_country | `country_source` |
| cases | `case_source`（+ 指定图书馆时为 `library_source`） |
| topic_search | 命中的 Source 记录本身 |

硬规则：

- **不生成 URL**：Source 全部来自 `data.sources` 的真实记录，解析不到的 id 直接丢弃。
- **不渲染空链接**：数据里有 2 条离线汇编文档型 Source（62 / 63）本就没有公开 URL。
  原实现会渲染 `href=""`（点击等于刷新当前页），现改为
  "No public URL — offline document held in the dataset"。编造 URL 比留空更糟。
- 来源按 `source_id` 去重，且只可能是已发布来源。

---

## 5. D1.5 — 支持的问题类型

| 问题 | 意图 | 答案来自 |
|---|---|---|
| 某国家有哪些图书馆？ | `libraries_by_country` | country_code / 别名 → 该国 published 图书馆 |
| 某图书馆获得过哪些奖项？ | `library_awards` | library → award_result → award（父子均 published） |
| 某奖项有哪些获奖图书馆？ | `award_libraries` | award → award_result → library |
| 有哪些相关案例？ | `cases` | 可见案例（可指定图书馆） |
| 绿色 / 可持续主题 | `green_library` | category 含 green 的获奖记录 + sustainability 案例 |
| 某主题能找到哪些 Library / Award / Case / Source？ | `topic_search` | 复用 C2 动态检索 |
| 平台数据回答不了的问题 | `insufficient_data` | 明确显示"数据不足以回答" + 支持范围 |

**奖项多命中不猜**：问题只写了 "IFLA" 而库内有多条 IFLA 奖项时，
不任选其一，而是把所有命中奖项的真实获奖记录一并列出——仍是接地答案。

---

## 6. 验收结果

**`scripts/step11_verify_askai.py`：TOTAL=63  PASS=63  FAIL=0（exit=0）**

期望值全部由 PostgreSQL 现算（不硬编码），浏览器侧用单实例 Edge + CDP 跑真实页面。

| AC | 要求 | 检查数 | 结果 |
|---|---|---|---|
| D1-AC1 | 数据来自动态数据源，不经 JSON / 不连第二后端 / 不引 LLM | 7 | PASS |
| D1-AC2 | 回答结果与数据库一致（奖项 / 获奖图书馆 / 获奖馆全集 / 国家 / 案例 / 绿色计数） | 12 | PASS |
| D1-AC3 | 每个事实型回答都显示真实 Source，且 URL 全部为平台记录（0 编造） | 11 | PASS |
| D1-AC4 | draft / pending 零泄露 | 3 | PASS |
| D1-AC5 | 数据回答不了的问题明确说"数据不足"，不编造 | 6 | PASS |
| D1-AC6 | 空 / `%` / `' OR 1=1 --` / `***` / emoji / 300 字 不产生异常 | 20 | PASS |
| D1-AC7 | B2 / B3 / C1 / C2 回归 | 4 | PASS |

关键实测（全部由数据库真值对拍）：

| 问题 | 实测 |
|---|---|
| Which awards has Shanghai Library won? | 2/2 一致，类型 Award，provenance 5 条 |
| Which libraries have won IFLA Public Library of the Year? | 9/9 一致，类型 Library |
| Which libraries in the dataset have received international awards? | 55/55 一致 |
| Which libraries are located in Denmark? | 2/2 一致 |
| Show all cases and projects. | 8/8 一致 |
| Show green library award cases. | 22 条绿色获奖记录，与库一致 |
| What is the GDP of France in 2026? | 数据不足，0 结果项 |
| Who is the current director of the Library of Congress? | 命中图书馆但明确"不含该信息"，不编造 |
| Which library will win the 2030 award? | 数据不足（未来预测分支） |
| 点名未发布图书馆 | 0 结果项、名称零泄露 |
| 空 / `%` / `' OR 1=1 --` / `***` / emoji | 有可判定输出、Console 无错误 |
| 300 字超长 | 明确提示过长，不尝试解析 |

回归：step3 **128/128** · step6 **53/53** · step8 **20/20** · step10 **56/56**。
`data/*.json` 全程未改动；`data-loader.js` 全程保持 api 模式。

### 6.1 证据与复跑

- 日志：`dynamic-mvp/evidence/step11_askai.log`
- 复跑：`cd dynamic-mvp/scripts && python -u step11_verify_askai.py`

> 本轮顺带修好两处**验收基础设施**缺陷（不是产品缺陷）：
> ① `browser_suite.mjs` 跑完只 `browser.kill()`、node 自身不退出 → 残留僵尸实例占住
> 9222 端口，并让调用方 `subprocess.run` 永久阻塞；
> ② `Runtime.evaluate` 带 `awaitPromise` 却无超时 → 页面取数一卡就永久挂起。
> 现已加入分段超时 + 全局看门狗 + 显式 `process.exit()`。

---

## 7. 变更清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `js/ask-ai-adapter.js` | 新增 | 数据接地回答引擎（意图解析 / 实体解析 / 模板合成 / provenance） |
| `js/data-loader.js` | 修改 | 新增 `askPlatform()` 统一入口（两种模式共用同一引擎） |
| `js/ask-ai.js` | 修改 | 改走 `askPlatform()`；加载五张关联表；新增 `?q=` 直达；建议问题覆盖新意图 |
| `js/components.js` | 修改 | 无 URL 来源不渲染空链接；页脚 "Ask AI (Demo)" → "Ask AI" |
| `js/home.js` / `js/about.js` / `js/utils.js` | 修改 | 同步过时文案（AI Demo → Data-grounded），仅注释与展示文字 |
| `pages/ask-ai.html` | 修改 | 声明真实机制：retrieval + template composition，无 LLM；未来方向说明重写 |
| `dynamic-mvp/scripts/step11_verify_askai.py` | 新增 | D1-AC1…AC7 可执行验收（与 PostgreSQL 真值对拍） |
| `dynamic-mvp/scripts/browser_suite.mjs` | 修改 | 超时护栏 / 全局看门狗 / 显式退出（修验收挂起，见 §6.1） |
| `dynamic-mvp/scripts/step8_verify_map.py` | 修改 | 增加 `purge_fixtures()`，跑前清掉上一轮残留 fixture |
| `data/*.json`、其余页面与 Stage 1–10 产物 | **未改动** | — |

---

## 8. 安全

- 全程公开角色数据，无 admin token 进入前端。
- 不调用任何 LLM / 外部 API，不使用也不存储任何模型 API key。
- 无 secret、无 `.env`、无 Docker runtime data、无 browser profile 入库。

### 真正 LLM 接入（deployment / configuration step，本轮未做）

若要加生成式模型，正确顺序是：

1. 保留现有 retrieval 层不动（证据来源不变）；
2. 只把"合成"环节换成模型，且 **prompt 里只能给检索到的记录**；
3. 输出侧仍必须附同样的 provenance 列表，并保留"数据不足"分支；
4. 凭据走部署环境配置，不得进前端、不得入库。

即：加模型改变的是**措辞**，不是**证据**。

---

## 9. Known Limitations

1. 仍是**结构化匹配**，不是语义理解：不支持同义改写、错别字、跨语言提问
   （"北欧的馆" 这类不会命中）。这是与既有实现一致的行为，升级需单独立项。
2. 奖项解析要求问题中出现在奖项名（或其去括号核心名）中的连续片段；
   只写 "IFLA" 会命中全部 IFLA 奖项（是有意的不猜 + 全列）。
3. 答案文本为模板合成，措辞固定，不是自然语言生成。
4. `topic_search` 兜底复用 C2 检索，因此继承 C2 的子串匹配与 20 条上限。
5. 未引入对话上下文：每次提问独立解析。

---

## 10. Sprint Decision

**D1 = ACCEPTED（本地 Dynamic MVP 范围内）。**

- D1-AC1 … D1-AC7 全部 PASS（63/63），含 B2 / B3 / C1 / C2 回归全绿。
- 未触发任何 STOP CONDITION：不需要编造事实、provenance 可保证、无 draft/pending 泄露、
  无 secret 进入前端、未引入 Vector DB / LLM 基础设施、未改 Stage 1–10 冻结产物、未部署。
- 遗留的是**能力边界**（结构化匹配、模板措辞，见 §9），不是缺陷。

真正 LLM 接入是部署 / 配置步骤，不在本轮（§8）。
