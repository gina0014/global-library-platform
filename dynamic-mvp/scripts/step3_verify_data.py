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


def restore_last_updated(table, pk, pk_value, json_rows):
    """把一条记录的 last_updated 复位到 JSON 基线值（测试收尾用）。

    B3.5 的 trg_<table>_touch 触发器会在任何 UPDATE 时把该字段刷成当前时间，
    这里临时禁用该触发器后改写、随后立即恢复，使测试对既有记录不留残留。
    """
    baseline = next((r.get("last_updated") for r in json_rows
                     if r.get(pk) == pk_value), None)
    if not baseline:
        return None
    trigger = f"trg_{table}_touch"
    compose_psql(
        f"ALTER TABLE {table} DISABLE TRIGGER {trigger}; "
        f"UPDATE {table} SET last_updated = '{baseline}' WHERE {pk} = {pk_value}; "
        f"ALTER TABLE {table} ENABLE TRIGGER {trigger};"
    )
    return baseline


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


# B3.3 起 last_updated 由数据库触发器在**任何写入**时刷新（服务端时间戳）。
# 因此它不再是"应与 JSON baseline 逐字相等"的迁移字段 —— AC2 的写入/还原、
# 状态流转测试都会合法地刷新它。保真比对排除该列，另设专项校验（见下）。
SERVER_MANAGED_FIELDS = ("last_updated",)


def comparable(record):
    out = {}
    for k, v in record.items():
        if k in SERVER_MANAGED_FIELDS:
            continue
        if k == "created_at":
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
        # B3.5 的 last_updated 触发器会在上面这次还原写入时正常刷新时间戳
        # （这是被验收的行为）。测试必须不留残留，因此把该字段一并复位到
        # JSON 基线的原始值：临时禁用触发器后直接改库，改完立即恢复触发器。
        restore_last_updated("library", "library_id", AC2_LIBRARY_ID, json_libs)
        public = dapi.get(f"/items/library/{AC2_LIBRARY_ID}")
        got = public["data"][AC2_FIELD]
        print(f"RESTORED_TO={original}")
        print(f"API_AFTER_RESTORE={got}")
        check("AC2 还原：公开 API 已回到原始值", got == original, f"{got}")
        db_lu = compose_psql(
            f"SELECT last_updated FROM library WHERE library_id = {AC2_LIBRARY_ID};").strip()
        base_lu = next(r["last_updated"] for r in json_libs if r["library_id"] == AC2_LIBRARY_ID)
        check("AC2 还原：last_updated 已复位到 JSON 基线值（测试无残留）",
              db_lu.startswith(str(base_lu)), f"db={db_lu[:19]} baseline={base_lu}")
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
    check("59 条 published Library 字段值逐条一致（last_updated 除外，见下）",
          diffs_total == 0, f"diff={diffs_total}")
    check("字段集合一致（无新增冗余字段）", not key_mismatch, str(key_mismatch[:5]))

    # last_updated 专项：B3.3 后它由数据库触发器写入，允许被刷新，但不允许丢失或回退
    backdated = []
    for row in pub_libs:
        j = json_lib_map[row["library_id"]].get("last_updated")
        a = row.get("last_updated")
        if not a or (j and normalize_date(a)[:10] < normalize_date(j)[:10]):
            backdated.append((row["library_id"], j, a))
    check("last_updated 为服务端时间戳且不早于 baseline（B3.3）", not backdated, str(backdated[:3]))

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

    # ---------- 6. B2：迁移计数（JSON = DB） ----------
    print("\n== 6. B2 迁移计数（JSON vs PostgreSQL） ==")

    def jload(name):
        return json.loads((DATA / name).read_text(encoding="utf-8"))

    b2_awards = jload("awards.json")
    b2_results = jload("award-results.json")
    b2_cases = jload("cases.json")
    b2_sources = jload("sources.json")
    b2_cs = jload("country-source.json")
    b2_ls = jload("library-source.json")
    b2_as = jload("award-source.json")
    b2_ars = jload("award-result-source.json")
    b2_cas = jload("case-source.json")

    def db_count(table):
        return int(compose_psql(f"SELECT count(*) FROM {table};"))

    pairs = [
        ("award", len(b2_awards)), ("award_result", len(b2_results)),
        ("case_project", len(b2_cases)), ("source", len(b2_sources)),
        ("country_source", len(b2_cs)), ("library_source", len(b2_ls)),
        ("award_source", len(b2_as)), ("award_result_source", len(b2_ars)),
        ("case_source", len(b2_cas)),
    ]
    for table, json_n in pairs:
        db_n = db_count(table)
        check(f"AC-B2-1：{table} JSON {json_n} = DB {db_n}", json_n == db_n, f"json={json_n} db={db_n}")

    # ---------- 7. B2：PK / FK / UNIQUE / CHECK / status ----------
    print("\n== 7. B2 约束校验（PK / FK / UNIQUE / CHECK / status） ==")

    def dup_pk(table, col):
        return int(compose_psql(
            f"SELECT count(*) FROM (SELECT {col} FROM {table} GROUP BY {col} HAVING count(*)>1) t;"))

    for table, col in [("award", "award_id"), ("award_result", "award_result_id"),
                       ("case_project", "case_id"), ("source", "source_id")]:
        n = dup_pk(table, col)
        check(f"PK 唯一：{table}.{col}", n == 0, f"dup={n}")

    orphans = int(compose_psql(
        "SELECT count(*) FROM award_result ar "
        "LEFT JOIN award a ON a.award_id = ar.award_id "
        "LEFT JOIN library l ON l.library_id = ar.library_id "
        "WHERE a.award_id IS NULL OR l.library_id IS NULL;"))
    check("FK 有效：award_result → award / library", orphans == 0, f"orphan={orphans}")

    orphans_c = int(compose_psql(
        "SELECT count(*) FROM case_project c "
        "LEFT JOIN library l ON l.library_id = c.library_id WHERE l.library_id IS NULL;"))
    check("FK 有效：case_project → library", orphans_c == 0, f"orphan={orphans_c}")

    def constraint_exists(table, name):
        return int(compose_psql(
            "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid "
            f"WHERE t.relname = '{table}' AND c.conname = '{name}';"))

    check("UNIQUE 约束存在：award.uq_award_name_organizer", constraint_exists("award", "uq_award_name_organizer") == 1)
    check("UNIQUE 约束存在：award_result.uq_award_result", constraint_exists("award_result", "uq_award_result") == 1)
    dup_url = int(compose_psql(
        "SELECT count(*) FROM (SELECT url FROM source WHERE url IS NOT NULL GROUP BY url HAVING count(*)>1) t;"))
    check("UNIQUE 生效：source.url 无重复", dup_url == 0, f"dup={dup_url}")
    dup_ar = int(compose_psql(
        "SELECT count(*) FROM (SELECT award_id, library_id, year, category, result_type "
        "FROM award_result GROUP BY 1,2,3,4,5 HAVING count(*)>1) t;"))
    check("UNIQUE 生效：award_result 组合唯一键无重复", dup_ar == 0, f"dup={dup_ar}")

    def check_count(table):
        return int(compose_psql(
            "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid "
            f"WHERE t.relname = '{table}' AND c.contype = 'c';"))

    for table in ["award", "award_result", "case_project", "source"]:
        check(f"CHECK 约束已迁移：{table}", check_count(table) > 0, f"check_count={check_count(table)}")

    for table in ["award", "award_result", "case_project", "source"]:
        bad = int(compose_psql(
            f"SELECT count(*) FROM {table} WHERE status NOT IN ('draft','pending','published');"))
        check(f"status 取值合法：{table}", bad == 0, f"bad={bad}")

    # ---------- 8. B2：公开 API 可见性 ----------
    print("\n== 8. B2 公开 API（未带任何凭证） ==")
    pub_award = dapi.get("/items/award?limit=-1")["data"]
    pub_result = dapi.get("/items/award_result?limit=-1")["data"]
    pub_case = dapi.get("/items/case_project?limit=-1")["data"]
    pub_source = dapi.get("/items/source?limit=-1")["data"]
    # B3.4 起公开集合 = "自身 published **且** 父链全 published"，
    # 期望值直接由治理视图算出（不再硬编码），避免治理规则演进后数字过期。
    exp_award = int(compose_psql("SELECT count(*) FROM award WHERE status = 'published';"))
    exp_result = int(compose_psql("SELECT count(*) FROM v_public_award_result;"))
    exp_case = int(compose_psql("SELECT count(*) FROM v_public_case_project;"))
    exp_source = int(compose_psql("SELECT count(*) FROM source WHERE status = 'published';"))
    check(f"公开 Award 读数 = 治理期望（{exp_award}）",
          len(pub_award) == exp_award, f"api={len(pub_award)} exp={exp_award}")
    check(f"公开 Award_Result 读数 = 治理期望（{exp_result}，含 B3.4 父子链收敛）",
          len(pub_result) == exp_result, f"api={len(pub_result)} exp={exp_result}")
    check(f"公开 Case_Project 读数 = 治理期望（{exp_case}，含 B3.4 父子链收敛）",
          len(pub_case) == exp_case, f"api={len(pub_case)} exp={exp_case}")
    check(f"公开 Source 读数 = 治理期望（{exp_source}）",
          len(pub_source) == exp_source, f"api={len(pub_source)} exp={exp_source}")
    check("公开返回全部为 published",
          all(r["status"] == "published" for r in pub_result + pub_case + pub_source + pub_award))

    no_leak("AC-B2-4：公开按 ID 直取 pending award_result（15）被拒", lambda: dapi.get("/items/award_result/15"))
    no_leak("AC-B2-4：公开按 ID 直取 pending case（3）被拒", lambda: dapi.get("/items/case_project/3"))
    no_leak("AC-B2-4：公开 filter[status]=pending（award_result）无泄露",
            lambda: dapi.get("/items/award_result?filter[status][_eq]=pending"))
    no_leak("AC-B2-4：公开 filter[status]=pending（case_project）无泄露",
            lambda: dapi.get("/items/case_project?filter[status][_eq]=pending"))
    for coll in ["award", "award_result", "case_project", "source"]:
        blocked(f"公开写入被拒：{coll}", lambda c=coll: dapi.post(f"/items/{c}", {"status": "draft"}))
        blocked(f"公开删除被拒：{coll}", lambda c=coll: dapi.req("DELETE", f"/items/{c}/1"))

    # ---------- 9. B2：数据保真（API vs JSON） ----------
    print("\n== 9. B2 数据保真（公开 API vs data/*.json） ==")

    def fidelity(label, json_rows, api_rows, key):
        jm = {r[key]: r for r in json_rows if r["status"] == "published"}
        diffs = 0
        keybad = []
        for row in api_rows:
            j = comparable(jm[row[key]])
            a = comparable(row)
            if set(j) != set(a):
                keybad.append(row[key])
                continue
            d = diff_record(j, a)
            if d:
                diffs += 1
                if diffs <= 3:
                    print(f"    [diff] {key}={row[key]}: {d}")
        check(f"{label} 字段值逐条一致", diffs == 0 and not keybad, f"diff={diffs} key_mismatch={len(keybad)}")

    fidelity("Award（5）", b2_awards, pub_award, "award_id")
    fidelity("Award_Result（68 published）", b2_results, pub_result, "award_result_id")
    fidelity("Case_Project（9 published）", b2_cases, pub_case, "case_id")
    fidelity("Source（64）", b2_sources, pub_source, "source_id")

    # ---------- 10. AC-B2-5：Source 追溯关系完整性 ----------
    print("\n== 10. AC-B2-5 Source 追溯关系完整性（PostgreSQL 侧） ==")
    rel_orphans = [
        ("country_source", "SELECT count(*) FROM country_source r "
                           "LEFT JOIN country c ON c.country_id = r.country_id "
                           "LEFT JOIN source s ON s.source_id = r.source_id "
                           "WHERE c.country_id IS NULL OR s.source_id IS NULL;"),
        ("library_source", "SELECT count(*) FROM library_source r "
                           "LEFT JOIN library l ON l.library_id = r.library_id "
                           "LEFT JOIN source s ON s.source_id = r.source_id "
                           "WHERE l.library_id IS NULL OR s.source_id IS NULL;"),
        ("award_source", "SELECT count(*) FROM award_source r "
                         "LEFT JOIN award a ON a.award_id = r.award_id "
                         "LEFT JOIN source s ON s.source_id = r.source_id "
                         "WHERE a.award_id IS NULL OR s.source_id IS NULL;"),
        ("award_result_source", "SELECT count(*) FROM award_result_source r "
                                "LEFT JOIN award_result ar ON ar.award_result_id = r.award_result_id "
                                "LEFT JOIN source s ON s.source_id = r.source_id "
                                "WHERE ar.award_result_id IS NULL OR s.source_id IS NULL;"),
        ("case_source", "SELECT count(*) FROM case_source r "
                        "LEFT JOIN case_project c ON c.case_id = r.case_id "
                        "LEFT JOIN source s ON s.source_id = r.source_id "
                        "WHERE c.case_id IS NULL OR s.source_id IS NULL;"),
    ]
    for name, sql in rel_orphans:
        n = int(compose_psql(sql))
        check(f"关联表两端 FK 完整：{name}", n == 0, f"orphan={n}")

    lib1_db = int(compose_psql("SELECT count(*) FROM library_source WHERE library_id = 1;"))
    lib1_json = len([r for r in b2_ls if r["library_id"] == 1])
    check("AC-B2-5：Library 1 的 Source 关联数一致", lib1_db == lib1_json, f"db={lib1_db} json={lib1_json}")

    traced = int(compose_psql(
        "SELECT count(DISTINCT ar.award_result_id) FROM award_result ar "
        "JOIN award_result_source ars ON ars.award_result_id = ar.award_result_id "
        "WHERE ar.status = 'published';"))
    check("AC-B2-5：published 获奖记录可追溯 Source", traced > 0, f"traced={traced}")

    # ---------- 11. B2 收尾：关联表 surrogate PK + 关系集合保真 + 防泄露 ----------
    print("\n== 11. 关联表 API 化（surrogate PK 方案） ==")

    RELATIONS = [
        # (table, entity_col, parent_table, parent_pk, json_rows)
        ("country_source", "country_id", "country", "country_id", b2_cs),
        ("library_source", "library_id", "library", "library_id", b2_ls),
        ("award_source", "award_id", "award", "award_id", b2_as),
        ("award_result_source", "award_result_id", "award_result", "award_result_id", b2_ars),
        ("case_source", "case_id", "case_project", "case_id", b2_cas),
    ]

    for table, ecol, ptable, ppk, jrows in RELATIONS:
        # 11a. surrogate PK
        n_pk = int(compose_psql(
            f"SELECT count(*) FROM {table} WHERE id IS NULL;"))
        n_dup_pk = int(compose_psql(
            f"SELECT count(*) FROM (SELECT id FROM {table} GROUP BY id HAVING count(*)>1) t;"))
        check(f"surrogate PK 非空且唯一：{table}.id", n_pk == 0 and n_dup_pk == 0,
              f"null={n_pk} dup={n_dup_pk}")

        # 11b. 原复合键保留为 UNIQUE
        check(f"复合 UNIQUE 约束存在：{table}.uq_{table}",
              constraint_exists(table, f"uq_{table}") == 1)
        n_dup = int(compose_psql(
            f"SELECT count(*) FROM (SELECT {ecol}, source_id FROM {table} "
            f"GROUP BY 1,2 HAVING count(*)>1) t;"))
        check(f"复合关系无重复：{table} ({ecol}, source_id)", n_dup == 0, f"dup={n_dup}")

        # 11c. DB 关系集合 == JSON 关系集合（逐条 (entity, source, relation_type)）
        db_rows = compose_psql(
            f"SELECT {ecol} || '|' || source_id || '|' || coalesce(relation_type,'') "
            f"FROM {table} ORDER BY 1;").splitlines()
        json_rows = sorted(f"{r[ecol]}|{r['source_id']}|{r['relation_type'] or ''}" for r in jrows)
        check(f"关系集合与 JSON baseline 完全一致：{table}（{len(jrows)} 条）",
              db_rows == json_rows,
              f"db={len(db_rows)} json={len(json_rows)}"
              + ("" if db_rows == json_rows else
                 f" 差集={set(db_rows) ^ set(json_rows)}".__str__()[:200]))

    # 11d. 公开 API：关联表可读，且只暴露 published 父实体的关系
    print("  -- 公开关联表 API --")
    parent_status = {
        "country_source": ("country", "country_id", "country_id"),
        "library_source": ("library", "library_id", "library_id"),
        "award_source": ("award", "award_id", "award_id"),
        "award_result_source": ("award_result", "award_result_id", "award_result_id"),
        "case_source": ("case_project", "case_id", "case_id"),
    }

    def _ids(sql):
        return {int(x) for x in compose_psql(sql).splitlines()}

    # B3.4：按治理规则"应当公开"的父实体集合（两级父链由 05-governance.sql 的视图定义）
    GOV_PARENT_IDS = {
        "country_source": lambda: _ids("SELECT country_id FROM country WHERE status = 'published';"),
        "library_source": lambda: _ids("SELECT library_id FROM library WHERE status = 'published';"),
        "award_source": lambda: _ids("SELECT award_id FROM award WHERE status = 'published';"),
        "award_result_source": lambda: _ids("SELECT award_result_id FROM v_public_award_result;"),
        "case_source": lambda: _ids("SELECT case_id FROM v_public_case_project;"),
    }

    for table, ecol, ptable, ppk, jrows in RELATIONS:
        pub = dapi.get(f"/items/{table}?limit=-1")["data"]
        check(f"公开可读：{table}（{len(pub)} 条）", len(pub) > 0, f"count={len(pub)}")

        # 代理主键 id 不应出现在公开响应（字段白名单只有业务列）
        leaked_ids = [r for r in pub if "id" in r]
        check(f"公开响应不含技术列 id：{table}", not leaked_ids, f"leaked={len(leaked_ids)}")

        # 按 B3.4 治理规则"应当公开"的父实体 ID 集合
        # （Award Result 需 Award 与 Library 同时 published；Case 需 Library published）
        pub_ids = GOV_PARENT_IDS[table]()
        # 取该表的非公开父实体 ID 集合（治理集合的补集）
        all_ids = {int(x) for x in compose_psql(f"SELECT {ppk} FROM {ptable};").splitlines()}
        nonpub = all_ids - pub_ids
        exposed = {r[ecol] for r in pub} & nonpub
        check(f"未泄露非公开父实体关系：{table}", not exposed,
              f"exposed_parent_ids={sorted(exposed)}")
        expect = sorted(f"{r[ecol]}|{r['source_id']}|{r['relation_type'] or ''}"
                        for r in jrows if r[ecol] in pub_ids)
        got = sorted(f"{r[ecol]}|{r['source_id']}|{r['relation_type'] or ''}" for r in pub)
        check(f"公开关系集合 = 治理期望集合：{table}（{len(expect)} 条）",
              got == expect, f"api={len(got)} expect={len(expect)}")

    # 11e. 关联表公开写入/删除仍被拒
    for table, *_ in RELATIONS:
        blocked(f"公开写入被拒：{table}", lambda t=table: dapi.post(f"/items/{t}", {"source_id": 1}))
        blocked(f"公开删除被拒：{table}", lambda t=table: dapi.req("DELETE", f"/items/{t}/1"))

    # ---------- 汇总 ----------
    print("\n== 汇总 ==")
    failed = [n for n, ok, _ in results if not ok]
    print(f"TOTAL={len(results)}  PASS={len(results) - len(failed)}  FAIL={len(failed)}")
    if failed:
        print("FAILED ITEMS: " + ", ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
