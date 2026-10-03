"""============================================================
生成迁移 SQL（种子数据）—— Issue 001 + B2

数据源：仓库根目录 data/*.json（Stage8-v1.0 冻结基线，只读）
产出 1：db/ddl/02-seed-country-library.sql   （Country / Library，Issue 001）
产出 2：db/ddl/04-seed-remaining-core.sql    （Award / Award_Result / Case_Project /
                                              Source + 五张来源关联表，B2）

规则：
  1. **保持原始主键 ID**（插入时显式写出各表主键）
  2. 不新增、不重排、不改字段名，不写冗余展示字段（如 country_name）
  3. 插入后校正 identity 序列，保证后续手工新增不会撞 ID
  4. 关联表无 status 字段（V0.2 schema 即如此），不为它们新增字段
  5. 关联表新增的 surrogate id 由 IDENTITY 自动生成，**不写入、不比对**（技术列）
============================================================"""

import datetime
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]          # 仓库根
DATA = ROOT / "data"
DDL = pathlib.Path(__file__).resolve().parents[1] / "ddl"
OUT1 = DDL / "02-seed-country-library.sql"
OUT2 = DDL / "04-seed-remaining-core.sql"

COUNTRY_COLS = [
    "country_id", "country_name", "country_code", "region", "description",
    "latitude", "longitude", "status", "last_updated", "created_at",
]
LIBRARY_COLS = [
    "library_id", "name", "name_en", "country_id", "city", "library_type",
    "description", "website", "latitude", "longitude", "founded_year",
    "status", "last_updated", "created_at",
]
AWARD_COLS = [
    "award_id", "award_name", "organizer", "description", "official_website",
    "founded_year", "frequency", "status", "last_updated", "created_at",
]
AWARD_RESULT_COLS = [
    "award_result_id", "award_id", "library_id", "year", "category", "result_type",
    "project_name", "description", "status", "last_updated", "created_at",
]
CASE_COLS = [
    "case_id", "library_id", "title", "topic", "description", "year",
    "project_url", "status", "last_updated", "created_at",
]
SOURCE_COLS = [
    "source_id", "source_name", "source_type", "title", "url", "publisher",
    "publication_date", "accessed_date", "language", "status", "last_updated", "created_at",
]
COUNTRY_SOURCE_COLS = ["country_id", "source_id", "relation_type"]
LIBRARY_SOURCE_COLS = ["library_id", "source_id", "relation_type"]
AWARD_SOURCE_COLS = ["award_id", "source_id", "relation_type"]
AWARD_RESULT_SOURCE_COLS = ["award_result_id", "source_id", "relation_type"]
CASE_SOURCE_COLS = ["case_id", "source_id", "relation_type"]


def lit(value):
    """把 JSON 值转成 SQL 字面量（只出现字符串 / 数字 / None / bool 四类）。"""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert_rows(table, cols, rows):
    lines = []
    for r in rows:
        missing = [c for c in cols if c not in r]
        if missing:
            raise SystemExit(f"[FATAL] {table}: 缺少字段 {missing}")
        extra = [k for k in r if k not in cols]
        if extra:
            raise SystemExit(f"[FATAL] {table}: 出现模型外字段 {extra}（禁止冗余字段）")
        values = ", ".join(lit(r[c]) for c in cols)
        lines.append(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({values});")
    return lines


def status_dist(rows):
    d = {}
    for r in rows:
        d[r["status"]] = d.get(r["status"], 0) + 1
    return " / ".join(f"{k} {v}" for k, v in sorted(d.items()))


def head(lines_src, summary_lines):
    return [
        "-- ============================================================",
        "-- 由 db/seed/generate-seed.py 自动生成 —— 请勿手改",
        f"-- 生成时间：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "-- 数据源：" + "、".join(lines_src) + "（Stage8-v1.0 冻结基线）",
    ] + [f"-- {s}" for s in summary_lines] + [
        "-- 显式写出主键 ID，保证与 JSON 一致",
        "-- ============================================================",
        "",
        "BEGIN;",
        "",
    ]


def setval(table, col):
    return (
        f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'),\n"
        f"              COALESCE((SELECT MAX({col}) FROM {table}), 1));"
    )


def main():
    def load(name):
        return json.loads((DATA / name).read_text(encoding="utf-8"))

    countries = sorted(load("countries.json"), key=lambda r: r["country_id"])
    libraries = sorted(load("libraries.json"), key=lambda r: r["library_id"])
    awards = sorted(load("awards.json"), key=lambda r: r["award_id"])
    award_results = sorted(load("award-results.json"), key=lambda r: r["award_result_id"])
    cases = sorted(load("cases.json"), key=lambda r: r["case_id"])
    sources = sorted(load("sources.json"), key=lambda r: r["source_id"])
    # 关联表**保持 JSON 文件原始顺序**（不排序）：
    # ① 前台按该顺序展示来源（primary 在前），改排序会造成渲染顺序回归；
    # ② 代理主键 id 按插入顺序生成，因此 API 默认返回顺序 = JSON baseline 顺序。
    # （核心对象六表本身即按主键升序，sorted 与文件顺序等价，保留排序以求确定性。）
    country_source = load("country-source.json")
    library_source = load("library-source.json")
    award_source = load("award-source.json")
    ar_source = load("award-result-source.json")
    case_source = load("case-source.json")

    # ---------- 产出 1：Country / Library（Issue 001） ----------
    body = ["-- ---------- Country ----------"]
    body += insert_rows("country", COUNTRY_COLS, countries)
    body += ["", "-- ---------- Library ----------"]
    body += insert_rows("library", LIBRARY_COLS, libraries)
    tail = [
        "",
        "-- identity 序列校正（后续手工新增从 MAX(id)+1 开始，避免撞 ID）",
        setval("country", "country_id"),
        setval("library", "library_id"),
        "",
        "COMMIT;",
        "",
    ]
    DDL.mkdir(parents=True, exist_ok=True)
    OUT1.write_text("\n".join(head(
        ["data/countries.json", "data/libraries.json"],
        [f"Country = {len(countries)}（{status_dist(countries)}）",
         f"Library = {len(libraries)}（{status_dist(libraries)}）"],
    ) + body + tail), encoding="utf-8")

    # ---------- 产出 2：其余核心对象 + 关联表（B2） ----------
    body2 = ["-- ---------- Award ----------"]
    body2 += insert_rows("award", AWARD_COLS, awards)
    body2 += ["", "-- ---------- Award_Result（依赖 award / library，见 02） ----------"]
    body2 += insert_rows("award_result", AWARD_RESULT_COLS, award_results)
    body2 += ["", "-- ---------- Case_Project ----------"]
    body2 += insert_rows("case_project", CASE_COLS, cases)
    body2 += ["", "-- ---------- Source ----------"]
    body2 += insert_rows("source", SOURCE_COLS, sources)
    body2 += ["", "-- ---------- 来源关联表（无 status 字段，沿用 V0.2 schema） ----------",
              "--        只写业务列 (entity_id, source_id, relation_type)；",
              "--        surrogate id 由 IDENTITY 自动生成，不参与迁移比对。"]
    body2 += insert_rows("country_source", COUNTRY_SOURCE_COLS, country_source)
    body2 += insert_rows("library_source", LIBRARY_SOURCE_COLS, library_source)
    body2 += insert_rows("award_source", AWARD_SOURCE_COLS, award_source)
    body2 += insert_rows("award_result_source", AWARD_RESULT_SOURCE_COLS, ar_source)
    body2 += insert_rows("case_source", CASE_SOURCE_COLS, case_source)
    tail2 = [
        "",
        "-- identity 序列校正",
        setval("award", "award_id"),
        setval("award_result", "award_result_id"),
        setval("case_project", "case_id"),
        setval("source", "source_id"),
        "",
        "COMMIT;",
        "",
    ]
    OUT2.write_text("\n".join(head(
        ["data/awards.json", "data/award-results.json", "data/cases.json", "data/sources.json",
         "data/country-source.json", "data/library-source.json", "data/award-source.json",
         "data/award-result-source.json", "data/case-source.json"],
        [f"Award = {len(awards)}（{status_dist(awards)}）",
         f"Award_Result = {len(award_results)}（{status_dist(award_results)}）",
         f"Case_Project = {len(cases)}（{status_dist(cases)}）",
         f"Source = {len(sources)}（{status_dist(sources)}）",
         f"country_source = {len(country_source)}；library_source = {len(library_source)}；"
         f"award_source = {len(award_source)}；award_result_source = {len(ar_source)}；"
         f"case_source = {len(case_source)}"],
    ) + body2 + tail2), encoding="utf-8")

    print(f"[OK] {OUT1}")
    print(f"[OK]   country={len(countries)} | library={len(libraries)}")
    print(f"[OK] {OUT2}")
    print(f"[OK]   award={len(awards)} | award_result={len(award_results)} | case={len(cases)} "
          f"| source={len(sources)}")
    print(f"[OK]   country_source={len(country_source)} | library_source={len(library_source)} "
          f"| award_source={len(award_source)} | award_result_source={len(ar_source)} "
          f"| case_source={len(case_source)}")


if __name__ == "__main__":
    main()
