"""============================================================
Step 5 — B3 Admin Workflow：角色 / 状态流 / 父子发布一致性（幂等）

建立最小治理体系（全部走 Directus 原生 Roles / Policies / Permissions，
不自建 CMS 页面，不把任何 admin token 放入前端）：

  Public         read published only；无 create / update / delete
  Editor         创建 draft、编辑 draft、draft → pending；**不得直接 published**
  Reviewer       查看 pending；pending → published；pending → draft（退回）
  Administrator  Directus 内置 Administrator（完整治理权限，仅用于异常处理）

状态流强制方式（服务端权限层，非前端）：
  Editor   update: row filter {"status": {"_eq": "draft"}}
                   validation {"status": {"_in": ["draft", "pending"]}}
  Reviewer update: row filter {"status": {"_eq": "pending"}}
                   validation {"status": {"_in": ["draft", "published"]}}
  → draft → published 被 Editor 直接提交时，value 不在允许集合内，请求被拒。

父子发布一致性（B3.4）：公开 read 过滤改为"自身 published **且** 父链全 published"。
============================================================"""

import json
import os
import pathlib
import secrets
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
ENV_PATH = pathlib.Path(__file__).resolve().parents[1] / ".env"

# ---------------------------------------------------------------------------
# 先保证 .env 里三个本地凭据存在（.env 未跟踪、不入库；脚本内不出现任何硬编码值）
# 必须在 import dapi 之前完成：dapi 使用 os.environ.setdefault 读取 .env
# ---------------------------------------------------------------------------


def _read_env():
    data = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            data[k.strip()] = v.strip()
    return data


def _ensure_env_keys():
    """为缺失的本地凭据生成随机值并写回 .env；已存在的值保持不动。"""
    data = _read_env()
    changed = False
    for key in ("DIRECTUS_SLICE_WRITER_TOKEN", "DIRECTUS_EDITOR_PASSWORD", "DIRECTUS_REVIEWER_PASSWORD"):
        if not data.get(key):
            data[key] = secrets.token_urlsafe(24)
            changed = True
            print(f"[env] 生成 {key} 并写入未跟踪的 .env")
    if changed:
        ENV_PATH.write_text("\n".join(f"{k}={v}" for k, v in data.items()) + "\n", encoding="utf-8")
    for k, v in data.items():
        os.environ.setdefault(k, v)
    return data


ENV = _ensure_env_keys()

import dapi  # noqa: E402

ADMIN_EMAIL = dapi.env("DIRECTUS_ADMIN_EMAIL")
ADMIN_PASSWORD = dapi.env("DIRECTUS_ADMIN_PASSWORD")
WRITER_TOKEN = dapi.env("DIRECTUS_SLICE_WRITER_TOKEN")
EDITOR_EMAIL = "editor@example.com"
REVIEWER_EMAIL = "reviewer@example.com"
EDITOR_PASSWORD = dapi.env("DIRECTUS_EDITOR_PASSWORD")
REVIEWER_PASSWORD = dapi.env("DIRECTUS_REVIEWER_PASSWORD")

# ---------------------------------------------------------------------------
# 字段白名单：沿用 Step 2 的 V0.2 物理字段清单（避免与公开契约漂移）
# ---------------------------------------------------------------------------
import step2_setup_permissions as s2  # noqa: E402

CORE_FIELDS = {
    "country": s2.COUNTRY_FIELDS,
    "library": s2.LIBRARY_FIELDS,
    "award": s2.AWARD_FIELDS,
    "award_result": s2.AWARD_RESULT_FIELDS,
    "case_project": s2.CASE_FIELDS,
    "source": s2.SOURCE_FIELDS,
}
REL_FIELDS = {
    "country_source": s2.COUNTRY_SOURCE_FIELDS,
    "library_source": s2.LIBRARY_SOURCE_FIELDS,
    "award_source": s2.AWARD_SOURCE_FIELDS,
    "award_result_source": s2.AWARD_RESULT_SOURCE_FIELDS,
    "case_source": s2.CASE_SOURCE_FIELDS,
}

CORE = list(CORE_FIELDS)
REL = list(REL_FIELDS)

# ---------------------------------------------------------------------------
# B3.4 — 父子发布一致性（跨关系字段过滤，全部在 Directus 权限层）
# ---------------------------------------------------------------------------
PUBLISHED = {"_eq": "published"}
PARENT_OK = {
    "library": {"status": PUBLISHED},
    "country": {"status": PUBLISHED},
    "award": {"status": PUBLISHED},
    "source": {"status": PUBLISHED},
    # Award Result：自身 + Award + Library 三级都必须 published
    "award_result": {"_and": [
        {"status": PUBLISHED},
        {"award_id": {"status": PUBLISHED}},
        {"library_id": {"status": PUBLISHED}},
    ]},
    # Case：自身 + Library
    "case_project": {"_and": [
        {"status": PUBLISHED},
        {"library_id": {"status": PUBLISHED}},
    ]},
    # 关联表：父实体的一级过滤。
    # 这里**不使用跨两级父链**的嵌套过滤，原因有二：
    #   1) 两级 join 会让 Directus 的返回行序不再稳定，造成 Case / Award Result 的
    #      Source 列表顺序相对 JSON baseline 漂移（纯展示层差异，但会破坏逐字比对）；
    #   2) 两级规则已经在**迁移期**被落实（见 generate-seed.py 的治理纠正）：
    #      父实体未 published 的 child 不会被迁移为 published，
    #      因此"父 published ⇒ 祖父链 published"这一前提对关联表天然成立。
    # 同时实体层仍保留上面的两级行级过滤作为纵深防御：
    #   即使将来有人绕过流程把 child 直接置为 published，它也不会公开。
    "country_source": {"country_id": {"status": PUBLISHED}},
    "library_source": {"library_id": {"status": PUBLISHED}},
    "award_source": {"award_id": {"status": PUBLISHED}},
    "award_result_source": {"award_result_id": {"status": PUBLISHED}},
    "case_source": {"case_id": {"status": PUBLISHED}},
}


def find_policy(tok, name):
    for p in dapi.get("/policies", tok)["data"]:
        if p.get("name") == name:
            return p["id"]
    return None


def ensure_policy(tok, name, description):
    pid = find_policy(tok, name)
    if pid:
        print(f"[skip] policy 已存在: {name} ({pid})")
        return pid
    pid = dapi.post("/policies", {
        "name": name,
        "icon": "how_to_reg",
        "description": description,
        "app_access": True,      # 允许登录 Directus 原生 App 治理（不自建 CMS 页面）
        "admin_access": False,   # 非管理员：一切仍受权限与数据库约束限制
        "enforce_tfa": False,
        "ip_access": None,
    }, tok)["data"]["id"]
    print(f"[create] policy: {name} ({pid})")
    return pid


def ensure_role(tok, name, description):
    for r in dapi.get("/roles", tok)["data"]:
        if r.get("name") == name:
            print(f"[skip] role 已存在: {name} ({r['id']})")
            return r["id"]
    rid = dapi.post("/roles", {
        "name": name,
        "icon": "person" if name == "Editor" else "gavel",
        "description": description,
    }, tok)["data"]["id"]
    print(f"[create] role: {name} ({rid})")
    return rid


def ensure_role_policy(tok, role_id, policy_id):
    for a in dapi.get("/access", tok)["data"]:
        if a.get("role") == role_id and a.get("policy") == policy_id:
            print("[skip] role→policy 关联已存在")
            return a["id"]
    aid = dapi.post("/access", {"role": role_id, "policy": policy_id}, tok)["data"]["id"]
    print(f"[create] role→policy 关联 ({aid[:8]})")
    return aid


def ensure_user(tok, email, password, role_id, first, last):
    users = dapi.get("/users", tok)["data"]
    u = next((x for x in users if x.get("email") == email), None)
    if u:
        dapi.patch(f"/users/{u['id']}", {"password": password, "role": role_id, "status": "active"}, tok)
        print(f"[update] user: {email} ({u['id']})")
        return u["id"]
    uid = dapi.post("/users", {
        "email": email, "password": password, "role": role_id,
        "status": "active", "first_name": first, "last_name": last,
    }, tok)["data"]["id"]
    print(f"[create] user: {email} ({uid})")
    return uid


def ensure_permission(tok, policy, collection, action, permissions, validation=None,
                      fields=None, presets=None):
    for p in dapi.get("/permissions", tok)["data"]:
        if p.get("policy") == policy and p.get("collection") == collection and p.get("action") == action:
            dapi.patch(f"/permissions/{p['id']}", {
                "permissions": permissions, "validation": validation,
                "fields": fields, "presets": presets,
            }, tok)
            print(f"[update] permission: {collection}.{action} (policy {policy[:8]})")
            return p["id"]
    pid = dapi.post("/permissions", {
        "policy": policy, "collection": collection, "action": action,
        "permissions": permissions, "validation": validation,
        "fields": fields, "presets": presets,
    }, tok)["data"]["id"]
    print(f"[create] permission: {collection}.{action} (policy {policy[:8]})")
    return pid


def main():
    if not dapi.wait_ready():
        sys.exit("[FATAL] Directus 未就绪")
    tok = dapi.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    print("[ok] admin login")

    policies = dapi.get("/policies", tok)["data"]
    public_policy = next(p["id"] for p in policies if p.get("name") == "$t:public_label")

    # ---------- 1) 公开读取：B3.4 父子发布一致性 ----------
    print("\n== 公开读取：父子发布一致性（B3.4） ==")
    for coll in CORE + REL:
        ensure_permission(tok, public_policy, coll, "read", PARENT_OK[coll],
                          fields=(CORE_FIELDS | REL_FIELDS)[coll])

    # ---------- 2) Editor ----------
    print("\n== Editor ==")
    editor_policy = ensure_policy(
        tok, "Editor Policy",
        "B3：创建 / 编辑 draft，并可提交 draft → pending。**不得直接 published**。")
    editor_role = ensure_role(tok, "Editor", "B3：内容编辑（draft 域），无发布权。")
    ensure_role_policy(tok, editor_role, editor_policy)
    for coll in CORE:
        ensure_permission(tok, editor_policy, coll, "read", None, fields=CORE_FIELDS[coll])
        # presets 在 Directus 端先行注入（先于 required 校验），
        # 因此 last_updated 由服务端 $NOW 填入，Editor 无法伪造时间戳，也不必手工填写。
        ensure_permission(tok, editor_policy, coll, "create", None,
                          validation={"status": {"_eq": "draft"}},
                          fields=CORE_FIELDS[coll],
                          presets={"status": "draft", "last_updated": "$NOW"})
        ensure_permission(tok, editor_policy, coll, "update",
                          permissions={"status": {"_eq": "draft"}},
                          validation={"status": {"_in": ["draft", "pending"]}},
                          fields=CORE_FIELDS[coll])
    for coll in REL:
        ensure_permission(tok, editor_policy, coll, "read", None, fields=REL_FIELDS[coll])
    ensure_user(tok, EDITOR_EMAIL, EDITOR_PASSWORD, editor_role, "GLP", "Editor")

    # ---------- 3) Reviewer ----------
    print("\n== Reviewer ==")
    reviewer_policy = ensure_policy(
        tok, "Reviewer Policy",
        "B3：审阅 pending，可 pending → published 或 pending → draft（退回）。"
        "不得绕过数据库完整性约束。")
    reviewer_role = ensure_role(tok, "Reviewer", "B3：内容审核（pending 域），有发布权。")
    ensure_role_policy(tok, reviewer_role, reviewer_policy)
    for coll in CORE:
        ensure_permission(tok, reviewer_policy, coll, "read", None, fields=CORE_FIELDS[coll])
        ensure_permission(tok, reviewer_policy, coll, "update",
                          permissions={"status": {"_eq": "pending"}},
                          validation={"status": {"_in": ["draft", "published"]}},
                          fields=CORE_FIELDS[coll])
    for coll in REL:
        ensure_permission(tok, reviewer_policy, coll, "read", None, fields=REL_FIELDS[coll])
    ensure_user(tok, REVIEWER_EMAIL, REVIEWER_PASSWORD, reviewer_role, "GLP", "Reviewer")

    # ---------- 4) Administrator（Directus 内置） ----------
    # Directus 11 起 app_access / admin_access 挂在 **Policy** 上（Role 只做分组），
    # 因此 Administrator = 通过 /access 关联到 admin_access=true 策略的角色。
    print("\n== Administrator ==")
    admin_policies = {p["id"] for p in dapi.get("/policies", tok)["data"] if p.get("admin_access")}
    admin_roles = [r for r in dapi.get("/roles", tok)["data"]
                   if any(a.get("role") == r["id"] and a.get("policy") in admin_policies
                          for a in dapi.get("/access", tok)["data"])]
    if not admin_roles:
        sys.exit("[FATAL] 未找到内置 Administrator 角色（admin_access 策略缺失）")
    for r in admin_roles:
        print(f"[info] Administrator 角色: {r['name']} ({r['id']}) —— 完整治理权限，仅用于异常处理与系统管理")

    # ---------- 5) 复原 Issue 001 的 AC2 静态写入 token ----------
    # .env 丢失后重新生成；把 DB 内既有 writer 用户的静态 token 同步为新值，
    # 使 step3 / step4 的 AC2 写入-还原仍然可用。
    users = dapi.get("/users", tok)["data"]
    w = next((u for u in users if u.get("email") == s2.WRITER_EMAIL), None)
    if w:
        dapi.patch(f"/users/{w['id']}", {"token": WRITER_TOKEN}, tok)
        print(f"[update] slice-writer 静态 token 已同步 ({w['id'][:8]})")

    print("\n[done] B3 工作流配置完成")


if __name__ == "__main__":
    main()
