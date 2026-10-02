"""============================================================
Issue 001 — 生成 Country / Library 迁移 SQL（种子数据）

数据源：仓库根目录 data/countries.json、data/libraries.json
产出：  db/ddl/02-seed-country-library.sql（提交入库，作为迁移证据）

规则：
  1. **保持原始主键 ID**（插入时显式写出 country_id / library_id）
  2. 不新增、不重排、不改字段名，不写冗余展示字段（如 country_name）
  3. 插入后校正 identity 序列，保证后续手工新增不会撞 ID
============================================================"""

import json
import pathlib
import datetime

ROOT = pathlib.Path(__file__).resolve().parents[3]          # 仓库根
DATA = ROOT / "data"
OUT = pathlib.Path(__file__).resolve().parents[1] / "ddl" / "02-seed-country-library.sql"

COUNTRY_COLS = [
    "country_id", "country_name", "country_code", "region", "description",
    "latitude", "longitude", "status", "last_updated", "created_at",
]
LIBRARY_COLS = [
    "library_id", "name", "name_en", "country_id", "city", "library_type",
    "description", "website", "latitude", "longitude", "founded_year",
    "status", "last_updated", "created_at",
]


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


def main():
    countries = json.loads((DATA / "countries.json").read_text(encoding="utf-8"))
    libraries = json.loads((DATA / "libraries.json").read_text(encoding="utf-8"))

    # 插入顺序：先被引用表（country），再引用表（library）
    countries = sorted(countries, key=lambda r: r["country_id"])
    libraries = sorted(libraries, key=lambda r: r["library_id"])

    c_status = {}
    for r in countries:
        c_status[r["status"]] = c_status.get(r["status"], 0) + 1
    l_status = {}
    for r in libraries:
        l_status[r["status"]] = l_status.get(r["status"], 0) + 1

    head = [
        "-- ============================================================",
        "-- 由 db/seed/generate-seed.py 自动生成 —— 请勿手改",
        f"-- 生成时间：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "-- 数据源：data/countries.json、data/libraries.json（Stage8-v1.0 冻结基线）",
        f"-- Country = {len(countries)}；Library = {len(libraries)}"
        f"（published {l_status.get('published', 0)} / "
        f"pending {l_status.get('pending', 0)} / draft {l_status.get('draft', 0)}）",
        "-- 显式写出主键 ID，保证与 JSON 一致",
        "-- ============================================================",
        "",
        "BEGIN;",
        "",
    ]

    body = ["-- ---------- Country ----------"]
    body += insert_rows("country", COUNTRY_COLS, countries)
    body += [
        "",
        "-- ---------- Library ----------",
    ]
    body += insert_rows("library", LIBRARY_COLS, libraries)

    tail = [
        "",
        "-- identity 序列校正（后续手工新增从 MAX(id)+1 开始，避免撞 ID）",
        "SELECT setval(pg_get_serial_sequence('country', 'country_id'),",
        "              COALESCE((SELECT MAX(country_id) FROM country), 1));",
        "SELECT setval(pg_get_serial_sequence('library', 'library_id'),",
        "              COALESCE((SELECT MAX(library_id) FROM library), 1));",
        "",
        "COMMIT;",
        "",
    ]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(head + body + tail), encoding="utf-8")
    print(f"[OK] {OUT}")
    print(f"[OK] country={len(countries)} {c_status}")
    print(f"[OK] library={len(libraries)} {l_status}")


if __name__ == "__main__":
    main()
