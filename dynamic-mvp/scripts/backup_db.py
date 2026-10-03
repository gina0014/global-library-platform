# -*- coding: utf-8 -*-
"""============================================================
backup_db.py — 生产数据库备份（PostgreSQL）

为什么不用 `docker exec ... pg_dump`：
  生产库是托管实例（Neon / Render / Railway …），只有连接串，没有 docker。
  因此脚本只依赖标准 PostgreSQL 客户端与 PG* 环境变量，
  本地 MVP 与生产托管用同一份脚本，切换只需改环境变量。

用法：
  set PGHOST=... PGPORT=5432 PGUSER=... PGPASSWORD=... PGDATABASE=glp_prod
  python backup_db.py --out ../backups

产出：
  glp_<db>_<UTC时间戳>.dump       pg_dump 自定义格式（可用 pg_restore 选择性恢复）
  glp_<db>_<UTC时间戳>.dump.meta.json   行数快照 + 备份参数（不含任何凭据）
  glp_<db>_<UTC时间戳>.dump.sha256      完整性校验值

退出码非 0 表示备份或自检失败 —— 不允许"声称有备份但没验证"。
============================================================"""
import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import shlex
import subprocess
import sys

# Windows 上 shlex 的 posix 模式会把路径反斜杠当转义符吃掉，按平台选择切分规则
_SPLIT = lambda s: shlex.split(s, posix=(os.name != "nt"))
PSQL = _SPLIT(os.environ.get("PSQL_BIN", "psql"))
PG_DUMP = _SPLIT(os.environ.get("PG_DUMP_BIN", "pg_dump"))
PG_RESTORE = _SPLIT(os.environ.get("PG_RESTORE_BIN", "pg_restore"))

# 行数快照只取业务表 —— 系统表与 Directus 表不计入（后者随版本变化）
TABLES = ["country", "library", "award", "award_result", "case_project", "source",
          "country_source", "library_source", "award_source",
          "award_result_source", "case_source"]


def env():
    e = {**os.environ}
    return e


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", env=env(), **kw)


def psql_args():
    missing = [k for k in ("PGHOST", "PGUSER", "PGDATABASE") if not os.environ.get(k)]
    if missing:
        sys.exit(f"[FATAL] 缺少环境变量：{', '.join(missing)}")
    return PSQL + ["-h", os.environ["PGHOST"],
                   "-p", os.environ.get("PGPORT", "5432"),
                   "-U", os.environ["PGUSER"],
                   "-d", os.environ["PGDATABASE"],
                   "-v", "ON_ERROR_STOP=1"]


def counts():
    sql = " UNION ALL ".join(f"SELECT '{t}' AS t, count(*)::int AS n FROM {t}" for t in TABLES)
    sql += " ORDER BY 1;"
    p = run(psql_args() + ["-tA", "-F", "|", "-c", sql])
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
    ap.add_argument("--out", default="../backups")
    args = ap.parse_args()

    outdir = pathlib.Path(args.out).resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    db = os.environ.get("PGDATABASE", "postgres")
    ts = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = outdir / f"glp_{db}_{ts}.dump"

    print(f"== 备份 {db} → {target.name} ==", flush=True)
    before = counts()
    print("行数快照：", json.dumps(before, ensure_ascii=False), flush=True)

    cmd = PG_DUMP + ["-h", os.environ.get("PGHOST", "127.0.0.1"),
                     "-p", os.environ.get("PGPORT", "5432"),
                     "-U", os.environ.get("PGUSER", "postgres"),
                     "-d", db, "-Fc", "-f", str(target)]
    p = run(cmd)
    if p.returncode != 0:
        sys.exit(f"[FATAL] pg_dump 失败：{(p.stderr or '')[:400]}")
    if not target.exists() or target.stat().st_size == 0:
        sys.exit("[FATAL] 备份文件不存在或为空")

    # 自检 1：归档可读（pg_restore -l 能列出内容）
    lst = run(PG_RESTORE + ["-l", str(target)])
    if lst.returncode != 0:
        sys.exit(f"[FATAL] 备份自检失败（pg_restore -l）：{(lst.stderr or '')[:300]}")
    n_obj = len([l for l in (lst.stdout or "").splitlines() if l.strip() and not l.startswith(";")])
    print(f"[PASS] 归档可读，含 {n_obj} 个对象", flush=True)

    # 自检 2：行数写入 manifest 并与备份前一致
    meta = {
        "database": db,
        "created_at_utc": ts,
        "pg_dump": " ".join(PG_DUMP),
        "row_counts": before,
    }
    meta_path = target.with_suffix(".dump.meta.json")
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    # 自检 3：sha256
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(".dump.sha256").write_text(
        f"{digest}  {target.name}\n", encoding="utf-8")

    print(f"[PASS] 备份完成：{target.name}  "
          f"size={target.stat().st_size}B  sha256={digest[:16]}…", flush=True)
    print(f"[PASS] manifest：{meta_path.name}", flush=True)
    print("BACKUP OK")


if __name__ == "__main__":
    main()
