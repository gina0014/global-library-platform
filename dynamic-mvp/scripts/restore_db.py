# -*- coding: utf-8 -*-
"""============================================================
restore_db.py — 生产数据库恢复（PostgreSQL）

与 backup_db.py 配套：输入 `<file>.dump` + `<file>.dump.meta.json`，
恢复到指定目标库，**并在恢复后按 manifest 校验行数**。

默认带两道防误操作闸门：
  1. 必须显式传 --target-db；
  2. 目标库已存在且非空时，必须额外传 --force。
 restored 行数与 manifest 不一致 → 退出码非 0（不允许"恢复完就算完"）。

用法：
  set PGHOST=... PGUSER=... PGPASSWORD=...
  python restore_db.py --file ../backups/glp_prod_20261003T120000Z.dump --target-db glp_restore_test --force
============================================================"""
import argparse
import json
import os
import pathlib
import shlex
import subprocess
import sys

_SPLIT = lambda s: shlex.split(s, posix=(os.name != "nt"))
PSQL = _SPLIT(os.environ.get("PSQL_BIN", "psql"))
PG_RESTORE = _SPLIT(os.environ.get("PG_RESTORE_BIN", "pg_restore"))


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", env={**os.environ})


def base_psql(db):
    return PSQL + ["-h", os.environ.get("PGHOST", "127.0.0.1"),
                   "-p", os.environ.get("PGPORT", "5432"),
                   "-U", os.environ.get("PGUSER", "postgres"),
                   "-d", db, "-v", "ON_ERROR_STOP=1"]


def scalar(sql, db):
    p = run(base_psql(db) + ["-tA", "-c", sql])
    if p.returncode != 0:
        sys.exit(f"[FATAL] 查询失败：{(p.stderr or '')[:300]}")
    return (p.stdout or "").strip()


def counts(db, tables):
    sql = " UNION ALL ".join(f"SELECT '{t}' AS t, count(*)::int AS n FROM {t}" for t in tables)
    sql += " ORDER BY 1;"
    p = run(base_psql(db) + ["-tA", "-F", "|", "-c", sql])
    if p.returncode != 0:
        sys.exit(f"[FATAL] 读取行数失败：{(p.stderr or '')[:300]}")
    out = {}
    for line in (p.stdout or "").splitlines():
        if "|" in line:
            t, n = line.split("|", 1)
            out[t] = int(n)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--target-db", required=True)
    ap.add_argument("--force", action="store_true",
                    help="目标库已存在且非空时仍需继续")
    ap.add_argument("--skip-create", action="store_true")
    args = ap.parse_args()

    dump = pathlib.Path(args.file).resolve()
    meta_path = dump.with_suffix(".dump.meta.json")
    if not dump.exists():
        sys.exit(f"[FATAL] 备份文件不存在：{dump}")
    if not meta_path.exists():
        sys.exit(f"[FATAL] 缺少 manifest：{meta_path}（禁止无校验恢复）")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    tables = list(meta.get("row_counts", {}).keys())
    if not tables:
        sys.exit("[FATAL] manifest 中没有行数快照")

    print(f"== 恢复 {dump.name} → {args.target_db} ==", flush=True)

    exists = run(base_psql("postgres") + ["-tA", "-c",
                 f"SELECT 1 FROM pg_database WHERE datname='{args.target_db}';"])
    if exists.returncode != 0:
        sys.exit(f"[FATAL] 无法连接目标实例：{(exists.stderr or '')[:300]}")
    db_exists = (exists.stdout or "").strip() == "1"

    if db_exists:
        n = scalar("SELECT count(*) FROM information_schema.tables "
                   "WHERE table_schema='public';", args.target_db)
        if n and int(n) > 0 and not args.force:
            sys.exit(f"[FATAL] 目标库 {args.target_db} 非空（{n} 张表），"
                     f"确认无误请追加 --force")
    elif not args.skip_create:
        c = run(base_psql("postgres") + ["-c", f'CREATE DATABASE "{args.target_db}";'])
        if c.returncode != 0:
            sys.exit(f"[FATAL] 建库失败：{(c.stderr or '')[:300]}")
        print(f"[PASS] 已创建目标库 {args.target_db}", flush=True)

    p = run(PG_RESTORE + ["-h", os.environ.get("PGHOST", "127.0.0.1"),
                          "-p", os.environ.get("PGPORT", "5432"),
                          "-U", os.environ.get("PGUSER", "postgres"),
                          "-d", args.target_db, "--clean", "--if-exists",
                          "--no-owner", str(dump)])
    # pg_restore 在对象已存在等场景会回 warning，退出码非 0 时需看是否有 ERROR
    err = (p.stderr or "")
    if p.returncode != 0 and "ERROR" in err.upper():
        sys.exit(f"[FATAL] pg_restore 失败：{err[:500]}")
    print("[PASS] pg_restore 执行完成", flush=True)

    after = counts(args.target_db, tables)
    expected = meta["row_counts"]
    mismatch = {t: (expected.get(t), after.get(t)) for t in tables
                if expected.get(t) != after.get(t)}
    print("行数校验：", json.dumps(after, ensure_ascii=False), flush=True)
    if mismatch:
        print("\nFAILED:")
        for t, (e, a) in mismatch.items():
            print(f"  - {t}: 期望 {e} 实际 {a}")
        sys.exit(1)
    print(f"[PASS] {len(tables)} 张表行数与 manifest 完全一致", flush=True)
    print("RESTORE OK")


if __name__ == "__main__":
    main()
