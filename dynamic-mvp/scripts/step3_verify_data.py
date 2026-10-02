"""============================================================
Step 3 — 数据与 API 层验证（对应 AC1–AC5 的可执行部分）

子命令：
    无参数        → 基线校验：容器 / DB 完整性 / 迁移计数 / 公开 published-only / 数据保真
    --ac2-write   → 通过最小写入通道临时修改一条 published Library
    --ac2-restore → 把该条记录恢复为原始值

判定输出统一为 [PASS] / [FAIL]。
============================================================"""

import json
import pathlib
import re
import subprocess
import sys

import dapi

ROOT = pathlib.Path(__file__).resolve().parents[2]   # .../Global-Library-Platform-Stage8-v1.0-Prototype
DATA = ROOT / "data"

# 凭据只来自未跟踪的 dynamic-mvp/.env（dapi.env 会在缺失时直接报错退出）
ADMIN_EMAIL = dapi.env("DIRECTUS_ADMIN_EMAIL")
ADMIN_PASSWORD = dapi.env("DIRECTUS_ADMIN_PASSWORD")
WRITER_TOKEN = dapi.env("DIRECTUS_SLICE_WRITER_TOKEN")

# AC2 测试目标：published 的 Library；字段取 city（页面可见、可安全还原）
AC2_LIBRARY_ID = 1
AC2_FIELD = "city"
AC2_TEST_VALUE = "AC2-TEST-动态写入验证"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    return ok


def compose_psql(sql):
    """通过 docker compose 在 postgres 容器内执行 SQL，返回结果文本。"""
    cmd = [
        "docker", "compose", "exec", "-T", "postgres",
        "psql", "-U", "glp", "-d", "glp_mvp", "-tAF", "|", "-c", sql,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT / "dynamic-mvp")
    if out.returncode != 0:
        raise SystemExit(f"[FATAL] psql 执行失败: {out.stderr[:400]}")
    return out.stdout.strip()


def container_status():
    cmd = ["docker", "compose", "ps", "--format", "{{.Service}}|{{.State}}|{{.Status}}"]
    out = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT / "dynamic-mvp")
    return out.stdout.strip().splitlines()


def normalize_date(value):
    """与 js/data-loader.js 的 normalizeDate 等价实现。"""
    if value in (None, ""):
        return value
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?", str(value))
    if not m:
        return value
    y, mo, d, hh, mm, ss = m.group(1), m.group(2), m.group(3), m.group(4) or "00", m.group(5) or "00", m.group(6) or ""
    date = f"{y}-{mo}-{d}"
    if hh == "00" and mm == "00" and ss in ("", "00"):
        return date
    return f"{date}T{hh}:{mm}:{ss if ss else '00'}"


def comparable(record):
    out = {}
    for k, v in record.items():
        if k in ("last_updated", "created_at"):
            out[k] = normalize_date(v)
        elif isinstance(v, float) or isinstance(v, int):
            out[k] = v
        else:
            out[k] = v
    return out


def numeric_equal(a, b):
    if a is None and b is None:
        return True
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return float(a) == float(b)
    return a == b


def diff_record(a, b):
    diffs = []
    for k in set(a) | set(b):
        va, vb = a.get(k), b.get(k)
        if not numeric_equal(va, vb):
            diffs.append(f"{k}: json={va!r} != api={vb!r}")
    return diffs


def main():
    mode = None
    if "--ac2-write" in sys.argv:
        mode = "write"
    elif "--ac2-restore" in sys.argv:
        mode = "restore"

    dapi.wait_ready()
    tok = dapi.login(ADMIN_EMAIL, ADMIN_PASSWORD)

    json_libs = json.loads((DATA / "libraries.json").read_text(encoding="utf-8"))
    json_countries = json.loads((DATA / "countries.json").read_text(encoding="utf-8"))

    if mode == "write":
        original = next(r[AC2_FIELD] for r in json_libs if r["library_id"] == AC2_LIBRARY_ID)
        dapi.patch(
            f"/items/library/{AC2_LIBRARY_ID}?fields={AC2_FIELD},{AC2_FIELD}",
            {AC2_FIELD: AC2_TEST_VALUE},
            WRITER_TOKEN,
        )
        public = dapi.get(f"/items/library/{AC2_LIBRARY_ID}")
        got = public["data"][AC2_FIELD]
        print(f"ORIGINAL={original}")
        print(f"TEST_VALUE={AC2_TEST_VALUE}")
        print(f"API_AFTER_WRITE={got}")
        check("AC2 写入：公开 API 立即读到新值", got == AC2_TEST_VALUE, f"{got}")
        return

    if mode == "restore":
        original = next(r[AC2_FIELD] for r in json_libs if r["library_id"] == AC2_LIBRARY_ID)
        dapi.patch(
            f"/items/library/{AC2_LIBRARY_ID}?fields={AC2_FIELD}",
            {AC2_FIELD: original},
            WRITER_TOKEN,
        )
        public = dapi.get(f"/items/library/{AC2_LIBRARY_ID}")
        got = public["data"][AC2_FIELD]
        print(f"RESTORED_TO={original}")
        print(f"API_AFTER_RESTORE={got}")
        check("AC2 还原：公开 API 已回到原始值", got == original, f"{got}")
        return

    # ---------- 1. 容器状态 ----------
    print("\n== 1. 容器状态 ==")
    status = container_status()
    for line in status:
        print("   ", line)
    check("容器全部 running/healthy", all("running" in s or "healthy" in s for s in status) and len(status) == 2)

    # ---------- 2. DB 完整性 ----------
    print("\n== 2. PostgreSQL 完整性 ==")
    c_cnt = int(compose_psql("SELECT count(*) FROM country;"))
    l_cnt = int(compose_psql("SELECT count(*) FROM library;"))
    check("Country 计数 = 22", c_cnt == 22, str(c_cnt))
    check("Library 计数 = 61", l_cnt == 61, str(l_cnt))

    dist = {}
    for line in compose_psql("SELECT status || '=' || count(*) FROM library GROUP BY status;").splitlines():
        k, v = line.split("=")
        dist[k.strip()] = int(v)
    check(
        "Library 状态分布 = published 59 / pending 1 / draft 1",
        dist.get("published") == 59 and dist.get("pending") == 1 and dist.get("draft") == 1,
        json.dumps(dist, ensure_ascii=False),
    )

    dup_pk = int(compose_psql("SELECT count(*) FROM (SELECT library_id FROM library GROUP BY library_id HAVING count(*)>1) t;"))
    check("PK 唯一（无重复 library_id）", dup_pk == 0, f"dup={dup_pk}")

    bad_fk = int(compose_psql(
        "SELECT count(*) FROM library l LEFT JOIN country c ON c.country_id = l.country_id "
        "WHERE c.country_id IS NULL;"
    ))
    check("FK 有效（61 条 country_id 全部指向存在的 Country）", bad_fk == 0, f"orphan={bad_fk}")

    bad_status = int(compose_psql(
        "SELECT count(*) FROM library WHERE status NOT IN ('draft','pending','published');"
    ))
    check("status 三态取值合法（CHECK 生效）", bad_status == 0, f"bad={bad_status}")

    db_ids = sorted(int(x) for x in compose_psql("SELECT library_id FROM library ORDER BY library_id;").splitlines())
    json_ids = sorted(r["library_id"] for r in json_libs)
    check("AC4：61 个 library_id 与迁移前 JSON 完全一致", db_ids == json_ids,
          "一致" if db_ids == json_ids else f"差异 {set(db_ids) ^ set(json_ids)}")

    db_c_ids = sorted(int(x) for x in compose_psql("SELECT country_id FROM country ORDER BY country_id;").splitlines())
    json_c_ids = sorted(r["country_id"] for r in json_countries)
    check("Country 22 个 country_id 与 JSON 一致", db_c_ids == json_c_ids)

    # ---------- 3. 公开 API —— published-only ----------
    print("\n== 3. 公开 API（未带任何凭证） ==")
    pub_libs = dapi.get("/items/library?limit=-1")["data"]
    pub_countries = dapi.get("/items/country?limit=-1")["data"]
    check("公开 Library 读数 = 59", len(pub_libs) == 59, str(len(pub_libs)))
    check("公开 Country 读数 = 22", len(pub_countries) == 22, str(len(pub_countries)))
    check("公开返回中不含 pending / draft",
          all(r["status"] == "published" for r in pub_libs),
          str(sorted({r["status"] for r in pub_libs})))

    def blocked(label, fn):
        try:
            fn()
            check(label, False, "未被拒绝")
        except Exception as e:
            check(label, "403" in str(e), str(e)[:80])

    def no_leak(label, fn):
        """公开请求不得拿到任何非 published 数据：返回空集合或被拒绝都算通过。"""
        try:
            r = fn()
            n = len(r["data"]) if isinstance(r, dict) and "data" in r else 1
            check(label, n == 0, f"items={n}")
        except Exception as e:
            check(label, "403" in str(e) or "404" in str(e), str(e)[:80])

    no_leak("公开请求 filter[status]=pending 无数据泄露", lambda: dapi.get("/items/library?filter[status][_eq]=pending"))
    no_leak("公开请求 filter[status]=draft 无数据泄露", lambda: dapi.get("/items/library?filter[status][_eq]=draft"))
    no_leak("公开按 ID 直取 pending（18）被拒", lambda: dapi.get("/items/library/18"))
    no_leak("公开按 ID 直取 draft（23）被拒", lambda: dapi.get("/items/library/23"))
    blocked("公开写入被拒", lambda: dapi.patch(f"/items/library/{AC2_LIBRARY_ID}", {AC2_FIELD: "HACK"}))
    blocked("公开删除被拒", lambda: dapi.req("DELETE", f"/items/library/{AC2_LIBRARY_ID}"))

    # ---------- 4. 数据保真（API vs JSON） ----------
    print("\n== 4. 数据保真（公开 API vs data/*.json） ==")
    json_lib_map = {r["library_id"]: r for r in json_libs if r["status"] == "published"}
    diffs_total = 0
    key_mismatch = []
    for row in pub_libs:
        j = comparable(json_lib_map[row["library_id"]])
        a = comparable(row)
        if set(j) != set(a):
            key_mismatch.append(row["library_id"])
            continue
        d = diff_record(j, a)
        if d:
            diffs_total += 1
            if diffs_total <= 3:
                print(f"    [diff] library_id={row['library_id']}: {d}")
    check("59 条 published Library 字段值逐条一致", diffs_total == 0, f"diff={diffs_total}")
    check("字段集合一致（无新增冗余字段）", not key_mismatch, str(key_mismatch[:5]))

    json_c_map = {r["country_id"]: r for r in json_countries}
    c_diffs = 0
    for row in pub_countries:
        j = comparable(json_c_map[row["country_id"]])
        a = comparable(row)
        if set(j) != set(a) or diff_record(j, a):
            c_diffs += 1
            if c_diffs <= 3:
                print(f"    [diff] country_id={row['country_id']}: {diff_record(j, a)}")
    check("22 条 Country 字段值逐条一致", c_diffs == 0, f"diff={c_diffs}")

    # ---------- 5. AC5：country_id 解析 ----------
    print("\n== 5. AC5 FK 解析 ==")
    unresolved = [r["library_id"] for r in pub_libs
                  if r["country_id"] not in {c["country_id"] for c in pub_countries}]
    check("AC5：59 条公开 Library 的 country_id 全部可解析", not unresolved, str(unresolved[:5]))

    # ---------- 汇总 ----------
    print("\n== 汇总 ==")
    failed = [n for n, ok, _ in results if not ok]
    print(f"TOTAL={len(results)}  PASS={len(results) - len(failed)}  FAIL={len(failed)}")
    if failed:
        print("FAILED ITEMS: " + ", ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
