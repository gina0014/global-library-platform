# Stage 8 · Release Checklist

**版本**：Stage8-v1.0-Prototype ｜ **日期**：2026-09-19 ｜ **基线**：Design Baseline V0.2（Pilot-Validated）

标记说明：**PASS** = 通过 ｜ **FAIL** = 未通过 ｜ **N/A** = 不适用（原型范围外）

---

## 1. Pages 页面（12 类 + 附加）

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 1.1 | P-01 Home 正常 | PASS | Final QA §2 |
| 1.2 | P-02 World Map 正常 | PASS | Final QA §2, §7 |
| 1.3 | P-03 Country Profile 正常 | PASS | Final QA §2 |
| 1.4 | P-04 Libraries 正常 | PASS | Final QA §2 |
| 1.5 | P-05 Library Profile 正常 | PASS | Final QA §2 |
| 1.6 | P-06 Global Awards 正常 | PASS | Final QA §2 |
| 1.7 | P-07 Award Profile 正常 | PASS | Final QA §2 |
| 1.8 | P-08 Cases 正常 | PASS | Final QA §2 |
| 1.9 | P-09 Case Detail 正常 | PASS | Final QA §2 |
| 1.10 | P-10 Ask AI (Demo) 正常 | PASS | Final QA §2, §8 |
| 1.11 | P-11 About 正常 | PASS | Final QA §2 |
| 1.12 | P-12 Admin Dashboard 正常 | PASS | Final QA §2, §9 |
| 1.13 | Search Results 正常 | PASS | Final QA §6 |
| 1.14 | 404 / Not Found 正常 | PASS | Final QA §2（含 Return Home / Browse Libraries / Browse Awards） |

**12 类页面**：**PASS（12 / 12）**

## 2. JSON 数据

| # | 检查项 | 结果 |
|---|---|---|
| 2.1 | 11 个 JSON 合法且 UTF-8 | PASS |
| 2.2 | 与第七阶段原件 MD5 一致（Data Drift = 0） | PASS（11 / 11） |
| 2.3 | ID 唯一 | PASS |
| 2.4 | status 合法（draft / pending / published） | PASS |
| 2.5 | 必填字段非空、类型正确 | PASS |
| 2.6 | Award_Result 五元组唯一约束 | PASS |
| 2.7 | Final QA 期间未修改任何 Runtime JSON | PASS |

## 3. FK 关系

| # | 检查项 | 结果 |
|---|---|---|
| 3.1 | Country → Library | PASS |
| 3.2 | Library → Country | PASS |
| 3.3 | Library → Award_Result → Award | PASS |
| 3.4 | Award → Award_Result → Library | PASS |
| 3.5 | Library → Case | PASS |
| 3.6 | Case → Library → Country | PASS |
| 3.7 | Country → Library → Case / Award_Result | PASS |
| 3.8 | Core Entity → Source Relation → Source（5 类） | PASS |
| 3.9 | 不存在"复制名称绕过 FK" | PASS |

## 4. Search 搜索

| # | 检查项 | 结果 |
|---|---|---|
| 4.1 | 中文 / 英文馆名 | PASS |
| 4.2 | 国家中文名 / 英文别名 | PASS |
| 4.3 | 奖项名 / 主办方 | PASS |
| 4.4 | 案例标题 / 描述关键词 | PASS |
| 4.5 | 大小写、前后空格、特殊字符、空搜索 | PASS |
| 4.6 | 不存在关键词 → Empty State | PASS |
| 4.7 | 结果分组 + Type Badge + 链接正确 | PASS |
| 4.8 | 无未发布内容泄漏 | PASS |

## 5. Filters 筛选

| # | 检查项 | 结果 |
|---|---|---|
| 5.1 | Libraries（国家 / 大洲 / 类型）单 / 双 / 三条件 | PASS |
| 5.2 | Awards（主办方 / 频率）单 / 双条件 | PASS |
| 5.3 | Cases（主题 / 年份 / 国家）单 / 双条件 | PASS |
| 5.4 | Clear Filters（按钮实际点击） | PASS |
| 5.5 | 0 结果 Empty State | PASS |
| 5.6 | 筛选后结果计数正确 | PASS |
| 5.7 | 排序（含 NULL 字段）不报错、顺序稳定 | PASS |
| 5.8 | 分页（首 / 中 / 末 / 超出页码 / 禁用态） | PASS |

## 6. Map 地图

| # | 检查项 | 结果 |
|---|---|---|
| 6.1 | 本地 SVG，无在线地图 / API Key | PASS |
| 6.2 | 国家 Marker = 8（真实国家中心坐标） | PASS |
| 6.3 | **图书馆 Marker = 0，无伪造坐标** | PASS |
| 6.4 | 图例明确 Country Marker ≠ 图书馆位置 | PASS |
| 6.5 | Known Limitation 文案（数据限制，非故障） | PASS |
| 6.6 | 地图非唯一入口（列表 / 搜索 / Country / Libraries） | PASS |
| 6.7 | Marker 键盘可达 + aria-label | PASS |

## 7. Sources 来源

| # | 检查项 | 结果 |
|---|---|---|
| 7.1 | 5 类来源（Country / Library / Award / Award Result / Case）均展示 | PASS |
| 7.2 | 外链 `target="_blank"` + `rel="noopener noreferrer"` | PASS |
| 7.3 | 名称 / 标题 / 出版方 / 访问日期等字段展示，空字段不显示 undefined / null | PASS |

## 8. Responsive 响应式

| # | 检查项 | 结果 |
|---|---|---|
| 8.1 | Desktop 1440 / 1280 / 1200 | PASS |
| 8.2 | Tablet 1024 / 768 | PASS |
| 8.3 | Mobile 390 / 375 / 320 | PASS |
| 8.4 | 整页横向溢出 = 0（112 项） | PASS |
| 8.5 | 长文本 / 长 URL 不撑破卡片 | PASS |
| 8.6 | 宽表在容器内横向滚动 | PASS |

## 9. Console / 404

| # | 检查项 | 结果 |
|---|---|---|
| 9.1 | console.error / uncaught / unhandledrejection = 0 | PASS（**0**） |
| 9.2 | 资源加载失败 = 0 | PASS |
| 9.3 | 内部链接爬取 99 个，Unexpected Internal 404 = 0 | PASS（**0**） |
| 9.4 | 非法 / 缺失 ID → Not Found + 返回入口（40 项） | PASS |

## 10. Relative Paths 相对路径

| # | 检查项 | 结果 |
|---|---|---|
| 10.1 | 无开发机绝对路径（Windows 盘符用户目录 / macOS 与 Linux 用户主目录 / Desktop 目录等） | PASS（**0**） |
| 10.2 | HTML / CSS / JS / JSON / SVG 全部使用项目相对路径 | PASS |
| 10.3 | 无丢失图片素材（全站内联 SVG + favicon.svg） | PASS |

## 11. Offline Core 离线核心可用

| # | 检查项 | 结果 |
|---|---|---|
| 11.1 | 无 Google Fonts / Bootstrap / Tailwind / Font Awesome / jQuery CDN | PASS（**0**） |
| 11.2 | 无 Mapbox / Google Maps / 在线瓦片 / 远程 JS | PASS（**0**） |
| 11.3 | 无 JS 外部网络请求（仅 fetch 本地 JSON） | PASS |
| 11.4 | 离线可打开 / 浏览 / 搜索 / 筛选 / 查看 SVG 地图 / 使用 Ask AI Demo | PASS |

> 数据内容中的外部链接（来源 URL / 官网 / 项目链接）属于数据本身，不计入依赖。

## 12. Prototype Boundaries 原型边界

| # | 检查项 | 结果 |
|---|---|---|
| 12.1 | Ask AI 明确 Demo / rule-based，无真实 API / API Key | PASS |
| 12.2 | Ask AI 未来方向三层明确标注 not implemented | PASS |
| 12.3 | Admin 明确 Prototype，按钮仅提示不写数据，无登录 | PASS |
| 12.4 | 无后端 / 数据库 / CMS / 注册登录 | PASS |

## 13. README / Documentation

| # | 检查项 | 结果 |
|---|---|---|
| 13.1 | README 含项目名 / 简介 / 版本 / 阶段 / 功能 / 页面清单 | PASS |
| 13.2 | README 含数据概览 / 技术 / 目录结构 | PASS |
| 13.3 | README 含 Windows 与 macOS / Linux 启动方式 + Live Server 备选 | PASS |
| 13.4 | README 说明为何不用 file:// 与如何停止服务器 | PASS |
| 13.5 | CHANGELOG 保留 Step1 / Step2 / Step3 历史并新增 v1.0 条目 | PASS |
| 13.6 | Final QA Report 与 Release Checklist 已生成 | PASS |

## 14. Known Limitations 已知限制

| # | 检查项 | 结果 |
|---|---|---|
| 14.1 | 图书馆级地图 Marker 不可用（坐标为 NULL，未伪造） | PASS（已记录） |
| 14.2 | Ask AI 为规则式本地演示，非生产 LLM / RAG | PASS（已记录） |
| 14.3 | Admin 为界面原型，不写数据库 | PASS（已记录） |
| 14.4 | 静态验证 JSON 而非实时数据库 / 后端 | PASS（已记录） |
| 14.5 | Design Baseline DEFER 项仍在范围外 | PASS（已记录） |
| 14.6 | DI-003 数据状态链不一致（前端已隐藏，待确认） | PASS（已记录） |

## 15. Release Package 交付包

| # | 检查项 | 结果 |
|---|---|---|
| 15.1 | 交付目录 `Global-Library-Platform-Stage8-v1.0-Prototype` 已建立 | PASS |
| 15.2 | 仅含运行所需文件 + README + 必要 docs（无临时截图 / 缓存 / 测试脚本） | PASS |
| 15.3 | 交付副本（复制到项目目录之外）独立启动 HTTP Server 可正常运行（Home / CSS / JS / JSON / 11 个主要页面 / Search / 404） | PASS（24 / 24） |
| 15.4 | 交付包内字面量开发机绝对路径 = 0 | PASS（0） |

---

## 汇总

| 维度 | 结果 |
|---|---|
| 12 pages | **PASS** |
| JSON | **PASS** |
| FK | **PASS** |
| Search | **PASS** |
| Filters | **PASS** |
| Map | **PASS** |
| Sources | **PASS** |
| Responsive | **PASS** |
| Console | **PASS（0 error）** |
| 404 | **PASS（0 unexpected）** |
| Relative Paths | **PASS（0 absolute）** |
| Offline Core | **PASS（0 CDN）** |
| README | **PASS** |
| Known Limitations | **PASS** |
| Release Package | **PASS** |

**发布结论：全部检查项 PASS（0 FAIL、0 N/A）—— 可以发布 Stage8-v1.0-Prototype。**
