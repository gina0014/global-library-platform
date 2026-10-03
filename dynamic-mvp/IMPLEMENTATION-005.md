# C2 — Dynamic Search：统一动态检索

**分支**：`feature-dynamic-search`（自 C1 已合并的 `main` 创建）
**范围**：本地 Dynamic MVP。未部署、无公网数据库、无生产变更。
**状态**：见 §8 Sprint Decision。

---

## 1. C2.1 检索能力评估（先评估，后选型）

`scripts/step9_search_assessment.py`（只读；证据：`evidence/c2_search_assessment.json`）

评测方式：把**两种 Directus 检索写法**与「当前 JSON baseline 的客户端检索」逐集合对拍，
覆盖英文 / 中文 / 部分关键词 / 国家别名 / 特殊字符 / 空查询 / 超长查询。

| 方式 | 写法 | 与 JSON baseline 完全一致 |
|---|---|---|
| A | `?search=<q>`（Directus 内置全字段检索） | 50 / 75 |
| B | `filter[_or][<field>][_icontains]`（逐字段，与客户端 haystack 对齐） | **62 / 75 |

**A 的问题不是召回不足，而是召回过头**：`?search=` 会扫**全部字段**（含 `description` / `website`
这类不在检索契约里的字段），例如

- `图书馆` → country 多出 21 条（命中了国家简介里的"图书馆"）
- `IFLA` → library 多出 50 条（命中了图书馆简介里的 IFLA）

**B 的剩余 13 处差异全部是可由适配层补齐的语义，不是能力缺口**：

| 差异 | 性质 | 补齐方式 |
|---|---|---|
| 国家别名（Denmark / 丹麦 → DK） | 属于**查询解析层**，本就不在数据里 | 适配层用别名表解析出 `country_code`，再补一次国家查询 |
| "命中某国 → 该国图书馆" | 客户端 haystack 含 country_name | 一次 `filter[country_id][_in]` 扩展 |
| `%` / `_` 被当 SQL LIKE 通配符 | 语义差异 | 反斜杠转义后即与字面量一致（已实测） |

**中文召回没有缺口**：`图书馆` / `图书` / `上海` / `丹麦` / `设计` 全部命中，且与 baseline 一致。

### 结论

**Directus REST 足够，不引入 Meilisearch 或其它检索服务。**
新增大型检索服务既没有解决任何已观测到的召回问题，又会带来一套新的运行时依赖与数据同步链路；
在 61 个 Library / 64 条 Source 的规模下，PostgreSQL 的 `ILIKE` 完全够用。

---

## 2. 架构（C2.2）

```
Search Page (js/search.js)
        ↓  只调一个函数
data-loader.js  →  searchAll(query, jsonData)
        ↓  api 模式（动态 import，避免循环依赖）
js/search-adapter.js  →  searchDynamic(query)
        ↓  公开角色请求（published-only 由 Directus 权限层强制）
Directus REST → PostgreSQL
```

- 页面**不直接** fetch Directus / PostgreSQL / 任何检索服务（`step10` 有静态校验）。
- `data-loader.js` 仍是**唯一数据访问点**；json 模式回退到既有的 `utils.searchAllUpgraded`。
- published-only **由服务端保证**：所有请求都是公开角色请求，
  Directus 权限层强制 `status=published` 与父子发布一致性；适配层不做"取全量再前端过滤"。
- 匹配（filter）、国家计数（aggregate + groupBy）都在服务端完成。

---

## 3. 检索对象与结果契约（C2.3）

| 类型 | 命中字段（与客户端 haystack 同一口径） | 结果链接 |
|---|---|---|
| Country | `country_name` / `country_code`（+ 中英文别名） | `country.html?id=` |
| Library | `name` / `name_en` / `city`（+ 所属国家命中扩展） | `library.html?id=` |
| Award | `award_name` / `organizer` | `award.html?id=` |
| Case | `title` / `description` | `case.html?id=` |
| **Source（本轮新增）** | `title` / `source_name` / `publisher` | 数据中记录的原始出处 URL（`target="_blank"` + `rel="noopener noreferrer"`） |

- Source 是 C2.3 要求补充的检索对象。它没有站内详情页，
  其"详情页"就是数据里已经存在的 `source.url`（真实数据，非生成）。
- 结果顺序：Country → Library → Award → Case → Source（与既有分组一致，仅追加 Source）。
- 结果上限沿用 `APP_CONFIG.searchResultLimit = 20`。
- 结果展示字段（`sub`）与客户端口径完全一致，包括
  Country 的 `N libraries` 计数、Library 的类型标签、Case 的所属图书馆名。
- **不暴露 draft / pending**：实体与关联数据都受权限层约束；
  也不会通过关联元数据推断出未发布对象。

---

## 4. 特殊输入处理

| 输入 | 处理 |
|---|---|
| 空查询 | 直接返回空结果，不发请求（页面保持既有空态） |
| `%` `_` `\` | 转义为 `\%` `\_` `\\`，按字面量匹配（不触发 LIKE 通配符） |
| 引号 / 星号 / 括号 | 正常作为字面量，无异常 |
| 超长查询（300 字） | 正常返回空结果，无异常 |

---

## 5. 验收结果

`scripts/step10_verify_search.py`：**TOTAL=56 PASS=56 FAIL=0**
（日志 `evidence/step10_search.log`；渲染文本证据 `evidence/c2_*.txt`）

| AC | 内容 | 结果 |
|---|---|---|
| C2-AC1 | 7 组典型查询均返回可判定的结果区 | **PASS** 7/7 |
| C2-AC2 | API 模式与 JSON baseline **渲染文本逐字一致** | **PASS** 7/7（含 6 组边界输入） |
| C2-AC3 | draft / pending 零泄露 | **PASS** 4/4 |
| C2-AC4 | 中文查询专项有召回 | **PASS** 4/4 |
| C2-AC5 | 空 / `%` / `_` / `'` / `***` / 300 字不导致异常 | **PASS** 12/12 |
| C2-AC6 | Console 严重错误 = 0 | **PASS** 全部页面 0 |
| C2-AC7 | B2 / B3 / C1 核心回归 | **PASS**（见下） |

**C2-AC2 逐字一致**（api 字符数 = json 字符数）：`图书馆` 1638 · `上海` 762 · `丹麦` 1121 ·
`设计` 1026 · `Shanghai` 518 · `Denmark` 658 · `IFLA` 2239 · 空 481 · `%` 664 · `_` 474 ·
`'` 1253 · `***` 476 · 300 字 773。

**C2-AC3 零泄露**（判定口径见 §5.1）：

| 查询 | baseline 未发布命中 | 结果项 | 泄露 |
|---|---|---|---|
| `基斯塔`（draft Library 23） | 1 | 0 | 0 |
| `García Márquez`（pending Library 18） | 1 | 2 | 0 |

第二条命中的 2 项是**已发布的 Source**（`sources.json` #33 / #58），
它们的标题里本来就含有这个名字——命中已发布 Source 是正确行为，
pending 的 Library 18 本身未出现在任何结果项中。

**C2-AC4 中文召回**：`图书馆` 20 · `上海` 5 · `丹麦` 7 · `设计` 6（上限 20 条）。

**C2-AC7 回归**：`step3` **128/128** · `step6` **53/53** · `step8` **20/20**。

### 5.1 两处验收脚本自身的修正

本轮修掉的是**测试口径错误，不是产品缺陷**：

1. **C2.2 静态校验误报**：原先靠"行首不是注释"剔除注释，
   而 `search.js` 的块注释用空格缩进而非 `* ` 前缀，导致注释里出现的
   `searchAllUpgraded` 被当成真实调用。现改为正规剔除 `/* */` 块与整行 `//`
   （不做行内截断，避免误伤 `http://` 里的标识符）。
2. **C2-AC3 判定过粗**：原先断言"未发布实体的查询必须零结果"，
   但一个未发布图书馆可以被**已发布 Source 引用**，此时命中 Source 是正确的。
   现改为从 DOM 结构化读取每条结果项的 `type / title / href`，
   与 baseline 中未发布实体的详情页 URL / 标题逐条比对，断言**该实体本身**零泄露。

---

## 6. 变更清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `js/search-adapter.js` | 新增 | 检索适配器：服务端 filter + 别名解析 + LIKE 转义 |
| `js/data-loader.js` | 修改 | 新增 `searchAll()` 统一入口；导出 `API_DATASOURCE` |
| `js/search.js` | 修改 | 改走 `searchAll()`；结果分组追加 Source |
| `js/utils.js` | 修改 | 客户端检索追加 Source（保证 json 回退口径一致） |
| `js/components.js` | 修改 | `searchResultHref` 支持 Source；Source 链接新窗口打开 |
| `pages/search.html` | 修改 | 检索范围说明补充 Source |
| `dynamic-mvp/scripts/step9_search_assessment.py` | 新增 | C2.1 能力评估（只读） |
| `dynamic-mvp/scripts/step10_verify_search.py` | 新增 | C2-AC1…AC7 可执行验收 |
| `dynamic-mvp/scripts/step8_verify_map.py` | 修改 | 审计证据缺失时自动现算（未跟踪产物可能被清理） |
| `dynamic-mvp/IMPLEMENTATION-005.md` | 新增 | 本文档 |
| `data/*.json`、其余页面与 Stage 1–10 产物 | **未改动** | — |

---

## 7. 安全

- 检索全程使用**公开角色**请求，无任何 admin token 进入前端。
- published-only 与父子一致性由服务端权限层强制，适配层不做客户端过滤。
- 无 secret、无 `.env`、无 Docker runtime data、无 browser profile 入库。

---

## 8. Known Limitations

1. 检索是**子串匹配**（`ILIKE '%q%'`），不是分词/相关性检索：
   不支持拼音、同义词、错别字容错。这是与既有客户端检索**一致**的行为，
   升级为分词检索需要单独立项（并先证明必要性）。
2. 国家别名表仍是前端查询解析常量（与 Ask AI Demo 共用），不在数据库里；
   新增国家别名需要同时改这一处。
3. Source 结果链接到外部原始出处（数据中记录的 URL），点击会离开本站。
4. 结果上限 20 条（沿用既有配置），不做分页。

---

## 9. Sprint Decision

**C2 = READY FOR ACCEPTANCE。**

- C2-AC1 … C2-AC7 全部 **PASS**，合计 **56/56**。
- 检索全部走到服务端，前端无第二取数通路；published-only 与父子一致性由权限层强制。
- API 模式与既有 JSON baseline **逐字一致**（13 组渲染文本），因此**没有改变任何已被接受的页面行为**。
- C2.1 的结论（Directus REST 足够、不引入检索服务）由 75 组双写法对拍支撑，不是主观判断。

遗留项均已记入 §8 Known Limitations，且均为"与既有行为一致"或"需单独立项"，
不影响本轮验收。

上游回归全绿：`step3` 128/128 · `step6` 53/53 · `step8` 20/20。
