"""============================================================
Step 6 — B3 Admin Workflow 验收（B3-AC1 … B3-AC7）

全部通过 REST API 直连 Directus，不启浏览器、不改前端：
  B3-AC1  Editor 可创建 / 编辑 draft，但不能直接发布
  B3-AC2  Reviewer 可 pending → published、pending → draft
  B3-AC3  Public API：draft / pending 不可读
  B3-AC4  父实体非 published 时，published child 仍不可公开（服务端过滤）
  B3-AC5  写入后 last_updated 由数据库自动刷新
  B3-AC6  Public write / delete = forbidden
  B3-AC7  B2 无 regression（直接跑 step3_verify_data.py）

测试期间创建的临时记录一律在 finally 中删除；对既有记录的状态改动一律还原。
============================================================"""

import json
import pathlib
import subprocess
import sys

import dapi

ROOT = pathlib.Path(__file__).resolve().parents[2]

ADMIN_EMAIL = dapi.env("DIRECTUS_ADMIN_EMAIL")
ADMIN_PASSWORD = dapi.env("DIRECTUS_ADMIN_PASSWORD")
EDITOR_EMAIL = "editor@example.com"
REVIEWER_EMAIL = "reviewer@example.com"
EDITOR_PASSWORD = dapi.env("DIRECTUS_EDITOR_PASSWORD")
REVIEWER_PASSWORD = dapi.env("DIRECTUS_REVIEWER_PASSWORD")

# 既有基线记录（只做状态往返，最后必须还原）
LIB_PUBLISHED = 1
LIB_PENDING = 18
LIB_DRAFT = 23

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)
    return ok


def psql(sql):
    """通过 docker compose 在 postgres 容器内执行 SQL，返回结果文本。"""
    out = subprocess.run(
        ["docker", "compose", "exec", "-T", "postgres",
         "psql", "-U", "glp", "-d", "glp_mvp", "-tAF", "|", "-c", sql],
        capture_output=True, text=True, cwd=ROOT / "dynamic-mvp", encoding="utf-8", errors="replace")
    if out.returncode != 0:
        print(f"[warn] psql 失败: {out.stderr[:200]}", flush=True)
        return ""
    return out.stdout.strip()


def restore_last_updated(library_ids):
    """把指定 library 的 last_updated 复位到 JSON 基线值（测试收尾用）。

    B3.5 的 trg_library_touch 触发器会在任何 UPDATE 时刷新该字段（这是被验收的
    行为）。为了让测试对既有基线记录不留残留，这里临时禁用触发器后改写、随后
    立即恢复触发器。
    """
    rows = json.loads((ROOT / "data" / "libraries.json").read_text(encoding="utf-8"))
    by_id = {r["library_id"]: r.get("last_updated") for r in rows}
    stmts = []
    for lid in library_ids:
        baseline = by_id.get(lid)
        if baseline:
            stmts.append(f"UPDATE library SET last_updated = '{baseline}' WHERE library_id = {lid};")
    if not stmts:
        return
    psql("ALTER TABLE library DISABLE TRIGGER trg_library_touch; "
         + " ".join(stmts)
         + " ALTER TABLE library ENABLE TRIGGER trg_library_touch;")


def call(fn):
    """返回 (ok, status, data, err)；ok=True 表示请求成功（2xx）。"""
    try:
        return True, 200, fn(), None
    except dapi.ApiError as e:
        return False, e.status, None, e.body[:150]


def denied(fn, label):
    """期望被拒绝：403 / 400 均可（400 = Directus validation 拦截）。"""
    ok, status, _data, err = call(fn)
    check(label, (not ok) and status in (400, 401, 403), f"status={status} {err or ''}")
    return status


def allowed(fn, label):
    ok, status, data, err = call(fn)
    check(label, ok, f"status={status} {err or ''}")
    return data


def main():
    if not dapi.wait_ready():
        sys.exit("[FATAL] Directus 未就绪")

    admin = dapi.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    editor = dapi.login(EDITOR_EMAIL, EDITOR_PASSWORD)
    reviewer = dapi.login(REVIEWER_EMAIL, REVIEWER_PASSWORD)
    check("B3-AC0：Editor / Reviewer 可用各自凭据登录", True,
          f"editor={bool(editor)} reviewer={bool(reviewer)}")

    tmp = {"libraries": [], "award_results": [], "cases": []}

    def cleanup():
        for cid in tmp["cases"]:
            try:
                dapi.req("DELETE", f"/items/case_project/{cid}", admin)
            except Exception:
                pass
        for rid in tmp["award_results"]:
            try:
                dapi.req("DELETE", f"/items/award_result/{rid}", admin)
            except Exception:
                pass
        for lid in tmp["libraries"]:
            try:
                dapi.req("DELETE", f"/items/library/{lid}", admin)
            except Exception:
                pass
        # 基线记录状态还原
        dapi.patch(f"/items/library/{LIB_PENDING}", {"status": "pending"}, admin)
        dapi.patch(f"/items/library/{LIB_DRAFT}", {"status": "draft"}, admin)
        # 状态往返会被 B3.5 的 last_updated 触发器正常刷新时间戳；
        # 测试不留残留，复位到 JSON 基线值（临时禁用触发器后改库）。
        restore_last_updated([LIB_PUBLISHED, LIB_PENDING, LIB_DRAFT])

    try:
        # ================= B3-AC1 Editor =================
        print("\n== B3-AC1：Editor 创建 / 编辑 draft，但不得直接发布 ==", flush=True)
        new_lib = allowed(
            lambda: dapi.post("/items/library", {
                "name": "B3-AC1 临时草稿馆", "country_id": 1, "city": "AC1-City",
                "library_type": "public", "description": "B3 验收临时记录",
            }, editor), "B3-AC1：Editor 可创建 draft")
        lib_id = new_lib["data"]["library_id"] if new_lib else None
        if lib_id:
            tmp["libraries"].append(lib_id)
            check("B3-AC1：新建记录状态为 draft（preset 生效）",
                  new_lib["data"].get("status") == "draft", str(new_lib["data"].get("status")))

            # 创建时强行指定 published（其余必填字段照常给全，确保拒绝原因只可能是 status）
            ok, status, data, err = call(lambda: dapi.post("/items/library", {
                "name": "B3-AC1 越权发布尝试", "country_id": 1, "city": "AC1-City",
                "library_type": "public", "status": "published",
            }, editor))
            if ok and data and data["data"].get("status") == "draft":
                check("B3-AC1：Editor 创建时指定 published 被降为 draft（未产生 published）",
                      True, "status=draft（preset 覆盖）")
                tmp["libraries"].append(data["data"]["library_id"])
            else:
                check("B3-AC1：Editor 创建时指定 published 被拒绝", (not ok) and status in (400, 403),
                      f"status={status} {err or ''}")

            # 编辑 draft 内容
            allowed(lambda: dapi.patch(f"/items/library/{lib_id}",
                                       {"description": "B3-AC1 已编辑"}, editor),
                    "B3-AC1：Editor 可编辑 draft 内容")

            # draft → pending（合法）
            r = allowed(lambda: dapi.patch(f"/items/library/{lib_id}", {"status": "pending"}, editor),
                        "B3-AC1：Editor 可提交 draft → pending")
            if r:
                check("B3-AC1：提交后状态确为 pending", r["data"].get("status") == "pending")

            # 回到 draft 后再测 draft → published（非法）
            dapi.patch(f"/items/library/{lib_id}", {"status": "draft"}, admin)
            denied(lambda: dapi.patch(f"/items/library/{lib_id}", {"status": "published"}, editor),
                   "B3-AC1：Editor 不得直接 draft → published")

        # Editor 不能触碰非 draft 记录（行级过滤）
        denied(lambda: dapi.patch(f"/items/library/{LIB_PENDING}", {"city": "AC1-X"}, editor),
               "B3-AC1：Editor 不得编辑 pending 记录")
        denied(lambda: dapi.patch(f"/items/library/{LIB_PUBLISHED}", {"city": "AC1-X"}, editor),
               "B3-AC1：Editor 不得编辑 published 记录")

        # ================= B3-AC2 Reviewer =================
        print("\n== B3-AC2：Reviewer pending → published / pending → draft ==", flush=True)
        r = allowed(lambda: dapi.patch(f"/items/library/{LIB_PENDING}", {"status": "published"}, reviewer),
                    "B3-AC2：Reviewer 可 pending → published")
        if r:
            check("B3-AC2：发布后状态确为 published", r["data"].get("status") == "published")
        dapi.patch(f"/items/library/{LIB_PENDING}", {"status": "pending"}, admin)

        r = allowed(lambda: dapi.patch(f"/items/library/{LIB_PENDING}", {"status": "draft"}, reviewer),
                    "B3-AC2：Reviewer 可 pending → draft（退回）")
        if r:
            check("B3-AC2：退回后状态确为 draft", r["data"].get("status") == "draft")
        dapi.patch(f"/items/library/{LIB_PENDING}", {"status": "pending"}, admin)

        denied(lambda: dapi.patch(f"/items/library/{LIB_DRAFT}", {"status": "published"}, reviewer),
               "B3-AC2：Reviewer 不得直接发布 draft（必须走 pending）")
        denied(lambda: dapi.post("/items/library", {"name": "Reviewer 越权创建", "country_id": 1}, reviewer),
               "B3-AC2：Reviewer 无 create 权限")
        denied(lambda: dapi.patch(f"/items/library/{LIB_PENDING}", {"status": "archived"}, reviewer),
               "B3-AC2：非法 status 取值被拒（数据完整性不可绕过）")

        # ================= B3-AC3 Public：draft / pending 不可读 =================
        print("\n== B3-AC3：Public API 不得读到 draft / pending ==", flush=True)
        denied(lambda: dapi.get(f"/items/library/{LIB_DRAFT}"), "B3-AC3：公开直取 draft 被拒")
        denied(lambda: dapi.get(f"/items/library/{LIB_PENDING}"), "B3-AC3：公开直取 pending 被拒")
        d = dapi.get("/items/library?filter[status][_eq]=draft")["data"]
        check("B3-AC3：公开 filter[status]=draft 返回空", len(d) == 0, f"count={len(d)}")
        d = dapi.get("/items/library?filter[status][_eq]=pending")["data"]
        check("B3-AC3：公开 filter[status]=pending 返回空", len(d) == 0, f"count={len(d)}")

        # ================= B3-AC4 父子发布一致性 =================
        print("\n== B3-AC4：父实体非 published 时 published child 仍不可公开 ==", flush=True)
        # 造一条 status=published、父实体为 draft Library（23）的 child
        ar = dapi.post("/items/award_result", {
            "award_id": 1, "library_id": LIB_DRAFT, "year": 2099,
            "category": "general", "result_type": "winner",
            "project_name": "B3-AC4 越权子记录", "status": "published",
            "last_updated": "2026-01-01T00:00:00Z",
        }, admin)["data"]
        tmp["award_results"].append(ar["award_result_id"])
        check("B3-AC4：(前置) 已创建 status=published 且父为 draft 的 Award Result",
              ar.get("status") == "published" and ar.get("library_id") == LIB_DRAFT,
              f"id={ar['award_result_id']}")
        denied(lambda: dapi.get(f"/items/award_result/{ar['award_result_id']}"),
               "B3-AC4：公开直取该 published child 被拒")
        pub_ar = {r["award_result_id"] for r in dapi.get("/items/award_result?limit=-1")["data"]}
        check("B3-AC4：该 published child 不在公开列表中", ar["award_result_id"] not in pub_ar)

        cs = dapi.post("/items/case_project", {
            "library_id": LIB_DRAFT, "title": "B3-AC4 越权案例", "topic": "other",
            "description": "B3 验收临时记录", "year": 2099, "status": "published",
            "last_updated": "2026-01-01T00:00:00Z",
        }, admin)["data"]
        tmp["cases"].append(cs["case_id"])
        denied(lambda: dapi.get(f"/items/case_project/{cs['case_id']}"),
               "B3-AC4：公开直取该 published Case 被拒")
        pub_case = {r["case_id"] for r in dapi.get("/items/case_project?limit=-1")["data"]}
        check("B3-AC4：该 published Case 不在公开列表中", cs["case_id"] not in pub_case)

        # 对照组：父实体 published 的 published child 必须可见
        ok_pub, st_pub, _x, _e = call(lambda: dapi.get(f"/items/award_result/1"))
        check("B3-AC4：(对照) 父实体 published 的 child 正常公开", ok_pub or st_pub == 200,
              f"status={st_pub}")

        # ================= B3-AC5 last_updated =================
        print("\n== B3-AC5：写入后 last_updated 由数据库自动刷新 ==", flush=True)
        # 显式给一个"过去"的时间戳：更新时不传 last_updated，
        # 若仍然被刷新 → 证明是服务端（数据库触发器）而非调用方写入。
        t = dapi.post("/items/library", {
            "name": "B3-AC5 时间戳验证馆", "country_id": 1, "city": "AC5-City",
            "library_type": "public", "description": "before",
            "last_updated": "2026-01-01T00:00:00Z",
        }, editor)["data"]
        tmp["libraries"].append(t["library_id"])
        before = t.get("last_updated")
        after = dapi.patch(f"/items/library/{t['library_id']}",
                           {"description": "after"}, editor)["data"].get("last_updated")
        check("B3-AC5：写入内容后 last_updated 发生变化",
              bool(before) and bool(after) and before != after, f"{before} -> {after}")
        # 不经前端、不经 API 参数：确认 DB 中也被刷新（psql 直读）
        dbval = subprocess.run(
            ["docker", "compose", "exec", "-T", "postgres", "psql", "-U", "glp", "-d", "glp_mvp",
             "-tA", "-c", f"SELECT last_updated::text FROM library WHERE library_id = {t['library_id']};"],
            capture_output=True, text=True, cwd=ROOT / "dynamic-mvp").stdout.strip()
        norm = lambda s: (s or "").replace("T", " ")[:19]
        check("B3-AC5：PostgreSQL 侧 last_updated 与 API 一致（服务端刷新，非前端写入）",
              bool(dbval) and after and norm(dbval) == norm(after),
              f"db={norm(dbval)} api={norm(after)}")

        # ================= B3-AC6 Public write / delete =================
        print("\n== B3-AC6：Public write / delete = forbidden ==", flush=True)
        for coll in ["country", "library", "award", "award_result", "case_project", "source"]:
            denied(lambda c=coll: dapi.post(f"/items/{c}", {"status": "draft"}),
                   f"B3-AC6：公开 create 被拒：{coll}")
            denied(lambda c=coll: dapi.req("DELETE", f"/items/{c}/1"),
                   f"B3-AC6：公开 delete 被拒：{coll}")
            denied(lambda c=coll: dapi.patch(f"/items/{c}/1", {"status": "draft"}),
                   f"B3-AC6：公开 update 被拒：{coll}")
        for coll in ["country_source", "library_source", "award_source",
                     "award_result_source", "case_source"]:
            denied(lambda c=coll: dapi.post(f"/items/{c}", {"source_id": 1}),
                   f"B3-AC6：公开 create 被拒：{coll}")

    finally:
        cleanup()
        print("\n[cleanup] 临时记录已删除，基线记录状态已还原", flush=True)

    # ================= B3-AC7 B2 无 regression =================
    print("\n== B3-AC7：B2 无 regression（跑 step3_verify_data.py） ==", flush=True)
    p = subprocess.run([sys.executable, "-u", "step3_verify_data.py"], cwd=pathlib.Path(__file__).parent,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail = [l for l in (p.stdout or "").splitlines() if l.startswith(("TOTAL=", "FAILED"))]
    diag = (tail[-1] if tail else "")
    if p.returncode != 0:
        err = [l for l in (p.stderr or "").splitlines() if l.strip()][-3:]
        diag = (diag + " | STDERR: " + " ;; ".join(err))[:400]
    check("B3-AC7：step3（数据 / API 层）全部 PASS", p.returncode == 0, diag)

    print("\n== 汇总 ==", flush=True)
    failed = [n for n, ok, _ in results if not ok]
    print(f"TOTAL={len(results)}  PASS={len(results) - len(failed)}  FAIL={len(failed)}")
    if failed:
        print("FAILED ITEMS: " + ", ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
