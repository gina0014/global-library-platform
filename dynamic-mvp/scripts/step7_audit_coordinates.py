"""============================================================
Step 7 — C1.1 坐标治理审计（只读）

统计 61 条 Library 的坐标覆盖率，回答三件事：
  1. valid / missing / invalid 各多少（全量 + 按 status 拆分）
  2. 与 data/*.json 基线是否一致（迁移有没有丢字段 / 有没有悄悄造坐标）
  3. published + valid coordinates 的期望 marker 数是多少（C1-AC1 的期望值）

本脚本只读，不写库、不改 JSON、不生成任何坐标。
============================================================"""

import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
EVIDENCE = ROOT / "dynamic-mvp" / "evidence"


def psql(sql):
    """通过 docker compose 在 postgres 容器内执行只读 SQL。"""
    out = subprocess.run(
        ["docker", "compose", "exec", "-T", "postgres",
         "psql", "-U", "glp", "-d", "glp_mvp", "-tAF", "|", "-c", sql],
        capture_output=True, text=True, cwd=ROOT / "dynamic-mvp",
        encoding="utf-8", errors="replace")
    if out.returncode != 0:
        raise SystemExit(f"[FATAL] psql 执行失败: {out.stderr[:400]}")
    return out.stdout.strip()


def valid(lat, lon):
    if lat is None or lon is None:
        return False
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return False
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return False
    return not (lat == 0 and lon == 0)


def classify(row):
    lat, lon = row.get("latitude"), row.get("longitude")
    if lat is None or lon is None:
        return "missing"
    return "valid" if valid(lat, lon) else "invalid"


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)

    rows = psql(
        "SELECT library_id, status, coalesce(cast(latitude as text),''), "
        "coalesce(cast(longitude as text),'') FROM library ORDER BY library_id;"
    ).splitlines()
    db = []
    for line in rows:
        if not line.strip():
            continue
        lid, status, lat, lon = line.split("|")
        db.append({
            "library_id": int(lid),
            "status": status,
            "latitude": float(lat) if lat else None,
            "longitude": float(lon) if lon else None,
        })

    json_rows = json.loads((DATA / "libraries.json").read_text(encoding="utf-8"))

    def stats(records):
        out = {"valid": 0, "missing": 0, "invalid": 0}
        for r in records:
            out[classify(r)] += 1
        return out

    db_all = stats(db)
    json_all = stats(json_rows)
    db_pub = stats([r for r in db if r["status"] == "published"])

    by_status = {}
    for r in db:
        by_status.setdefault(r["status"], {"valid": 0, "missing": 0, "invalid": 0, "total": 0})
        by_status[r["status"]][classify(r)] += 1
        by_status[r["status"]]["total"] += 1

    # 迁移保真：DB 与 JSON 的分类结果必须逐条一致
    json_by_id = {r["library_id"]: classify(r) for r in json_rows}
    mismatch = [
        r["library_id"] for r in db
        if json_by_id.get(r["library_id"]) != classify(r)
    ]

    expected_markers = db_pub["valid"]

    report = {
        "library_total": len(db),
        "db_all": db_all,
        "json_baseline_all": json_all,
        "db_published": db_pub,
        "by_status": by_status,
        "migration_classification_mismatch": mismatch,
        "expected_library_markers": expected_markers,
        "coordinate_policy": "no coordinate is guessed, inferred or substituted; "
                             "libraries without real coordinates stay without a marker",
    }

    (EVIDENCE / "c1_coordinate_audit.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("== C1.1 坐标治理审计 ==")
    print(f"Library 总数: {len(db)}")
    print(f"  全量       valid={db_all['valid']}  missing={db_all['missing']}  invalid={db_all['invalid']}")
    print(f"  published  valid={db_pub['valid']}  missing={db_pub['missing']}  invalid={db_pub['invalid']}")
    print(f"  JSON 基线  valid={json_all['valid']}  missing={json_all['missing']}  invalid={json_all['invalid']}")
    print("按 status 拆分:")
    for k in sorted(by_status):
        v = by_status[k]
        print(f"  {k:10} total={v['total']:3} valid={v['valid']:3} missing={v['missing']:3} invalid={v['invalid']:3}")
    print(f"迁移分类不一致条数: {len(mismatch)} {mismatch[:10]}")
    print(f"期望 library marker 数（published + valid）: {expected_markers}")
    print(f"证据: {EVIDENCE / 'c1_coordinate_audit.json'}")
    return 0 if not mismatch else 1


if __name__ == "__main__":
    sys.exit(main())
