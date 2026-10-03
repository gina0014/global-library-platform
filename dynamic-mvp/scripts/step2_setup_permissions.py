"""============================================================
Step 2 — Directus 权限配置（幂等）

公开读取（Policy: Public）
  - library       read → 强制 {"status": {"_eq": "published"}}
  - country       read → 强制 {"status": {"_eq": "published"}}
  - award         read → published-only（B2 新增）
  - award_result  read → published-only（B2 新增）
  - case_project  read → published-only（B2 新增）
  - source        read → published-only（B2 新增）
  - *_source（五张关联表）read → **父实体 published-only**（最小安全方案）
    * V0.2 schema 中这些表**没有 status 字段**，本轮不为它们新增 status；
    * 关联表本身无敏感内容，但无条件公开会把 draft / pending 实体的
      (实体ID, source_id) 关系泄露出去，因此**不采用 unrestricted public read**；
    * 改为在权限层按父实体状态过滤（Directus 支持跨关系字段过滤）：
        country_source       ← country_id.status      = published
        library_source       ← library_id.status      = published
        award_source         ← award_id.status        = published
        award_result_source  ← award_result_id.status = published
        case_source          ← case_id.status         = published
      这样公开请求只能拿到「已发布实体的溯源关系」，与父表的 published-only 一致。

最小写入通道（仅 AC2 用，Policy: Issue 001 Slice Writer）
  - library  read    （读取当前值，便于测试后还原）
  - library  update  （限定可编辑字段；且只能作用于 published 记录）

禁止：App 访问、Admin 访问、创建/删除权限、draft→published 审核流、
      Editor/Reviewer 角色体系、任何 UI 定制。
============================================================"""

import json
import secrets
import sys

import dapi

# 凭据只来自未跟踪的 dynamic-mvp/.env（dapi.env 会在缺失时直接报错退出）
ADMIN_EMAIL = dapi.env("DIRECTUS_ADMIN_EMAIL")
ADMIN_PASSWORD = dapi.env("DIRECTUS_ADMIN_PASSWORD")
WRITER_TOKEN = dapi.env("DIRECTUS_SLICE_WRITER_TOKEN")
WRITER_EMAIL = "slice-writer@example.com"

# 允许 AC2 临时修改的字段（排除 PK、FK、status，避免破坏数据治理语义）
WRITER_FIELDS = [
    "library_id",
    "name",
    "name_en",
    "city",
    "library_type",
    "description",
    "website",
    "latitude",
    "longitude",
    "founded_year",
]

PUBLISHED_ONLY = {"status": {"_eq": "published"}}

# 公开可读字段白名单（V0.2 物理字段，逐列显式声明；fields=null 在 Directus 中意为“无字段”）
COUNTRY_FIELDS = [
    "country_id", "country_name", "country_code", "region", "description",
    "latitude", "longitude", "status", "last_updated", "created_at",
]
LIBRARY_FIELDS = [
    "library_id", "name", "name_en", "country_id", "city", "library_type",
    "description", "website", "latitude", "longitude", "founded_year",
    "status", "last_updated", "created_at",
]

# ---------- B2：其余核心对象（均有 status → published-only） ----------
AWARD_FIELDS = [
    "award_id", "award_name", "organizer", "description", "official_website",
    "founded_year", "frequency", "status", "last_updated", "created_at",
]
AWARD_RESULT_FIELDS = [
    "award_result_id", "award_id", "library_id", "year", "category", "result_type",
    "project_name", "description", "status", "last_updated", "created_at",
]
CASE_FIELDS = [
    "case_id", "library_id", "title", "topic", "description", "year",
    "project_url", "status", "last_updated", "created_at",
]
SOURCE_FIELDS = [
    "source_id", "source_name", "source_type", "title", "url", "publisher",
    "publication_date", "accessed_date", "language", "status", "last_updated", "created_at",
]

# ---------- B2 收尾：五张来源关联表 ----------
# 关联表自身无 status；权限在**父实体**上做 published-only 过滤（跨关系字段过滤）。
COUNTRY_SOURCE_FIELDS = ["country_id", "source_id", "relation_type"]
LIBRARY_SOURCE_FIELDS = ["library_id", "source_id", "relation_type"]
AWARD_SOURCE_FIELDS = ["award_id", "source_id", "relation_type"]
AWARD_RESULT_SOURCE_FIELDS = ["award_result_id", "source_id", "relation_type"]
CASE_SOURCE_FIELDS = ["case_id", "source_id", "relation_type"]

PARENT_PUBLISHED = {
    "country_source": {"country_id": {"status": {"_eq": "published"}}},
    "library_source": {"library_id": {"status": {"_eq": "published"}}},
    "award_source": {"award_id": {"status": {"_eq": "published"}}},
    "award_result_source": {"award_result_id": {"status": {"_eq": "published"}}},
    "case_source": {"case_id": {"status": {"_eq": "published"}}},
}

# (collection, 过滤器, 字段白名单)
PUBLIC_READ_RULES = [
    ("library", PUBLISHED_ONLY, LIBRARY_FIELDS),
    ("country", PUBLISHED_ONLY, COUNTRY_FIELDS),
    ("award", PUBLISHED_ONLY, AWARD_FIELDS),
    ("award_result", PUBLISHED_ONLY, AWARD_RESULT_FIELDS),
    ("case_project", PUBLISHED_ONLY, CASE_FIELDS),
    ("source", PUBLISHED_ONLY, SOURCE_FIELDS),
    ("country_source", PARENT_PUBLISHED["country_source"], COUNTRY_SOURCE_FIELDS),
    ("library_source", PARENT_PUBLISHED["library_source"], LIBRARY_SOURCE_FIELDS),
    ("award_source", PARENT_PUBLISHED["award_source"], AWARD_SOURCE_FIELDS),
    ("award_result_source", PARENT_PUBLISHED["award_result_source"], AWARD_RESULT_SOURCE_FIELDS),
    ("case_source", PARENT_PUBLISHED["case_source"], CASE_SOURCE_FIELDS),
]


def find_or_create_writer_policy(tok):
    name = "Issue 001 Slice Writer"
    for p in dapi.get("/policies", tok)["data"]:
        if p.get("name") == name:
            print(f"[skip] policy 已存在: {name} ({p['id']})")
            return p["id"]
    res = dapi.post(
        "/policies",
        {
            "name": name,
            "icon": "edit_note",
            "description": "Issue 001 专用：仅用于验证写入→数据库→API→前台闭环，禁止扩展为管理角色。",
            "app_access": False,
            "admin_access": False,
            "enforce_tfa": False,
            "ip_access": None,
        },
        tok,
    )
    pid = res["data"]["id"]
    print(f"[create] policy: {name} ({pid})")
    return pid


def ensure_permission(tok, policy, collection, action, permissions, fields=None):
    existing = dapi.get("/permissions", tok)["data"]
    for p in existing:
        if p.get("policy") == policy and p.get("collection") == collection and p.get("action") == action:
            dapi.patch(
                f"/permissions/{p['id']}",
                {"permissions": permissions, "validation": {}, "presets": None, "fields": fields},
                tok,
            )
            print(f"[update] permission: {collection}.{action} (policy {policy[:8]})")
            return p["id"]
    res = dapi.post(
        "/permissions",
        {
            "policy": policy,
            "collection": collection,
            "action": action,
            "permissions": permissions,
            "validation": {},
            "presets": None,
            "fields": fields,
        },
        tok,
    )
    pid = res["data"]["id"]
    print(f"[create] permission: {collection}.{action} (policy {policy[:8]}) fields={fields}")
    return pid


def find_or_create_writer_user(tok, policy_id):
    email = WRITER_EMAIL
    token = WRITER_TOKEN
    users = dapi.get("/users", tok)["data"]
    user = next((u for u in users if u.get("email") == email), None)
    if user:
        print(f"[skip] user 已存在: {email} ({user['id']})")
        uid = user["id"]
    else:
        res = dapi.post(
            "/users",
            {
                "email": email,
                "password": secrets.token_urlsafe(24),  # 不使用密码登录，仅走静态 token
                "status": "active",
                "role": None,
                "token": token,
                "first_name": "Issue001",
                "last_name": "Slice Writer",
            },
            tok,
        )
        uid = res["data"]["id"]
        print(f"[create] user: {email} ({uid})")

    access_list = dapi.get("/access", tok)["data"]
    if any(a.get("user") == uid and a.get("policy") == policy_id for a in access_list):
        print("[skip] user→policy 关联已存在")
    else:
        dapi.post("/access", {"user": uid, "policy": policy_id}, tok)
        print("[create] user→policy 关联")
    return token


def main():
    if not dapi.wait_ready():
        sys.exit("[FATAL] Directus 未就绪")
    tok = dapi.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    print("[ok] admin login")

    policies = dapi.get("/policies", tok)["data"]
    public_policy = next(p["id"] for p in policies if p.get("name") == "$t:public_label")

    # 1) 公开读取 —— published-only（API 层强制，不依赖前端过滤）
    for collection, rule, fields in PUBLIC_READ_RULES:
        ensure_permission(tok, public_policy, collection, "read", rule, fields)

    # 2) AC2 最小写入通道
    writer_policy = find_or_create_writer_policy(tok)
    ensure_permission(tok, writer_policy, "library", "read", None, LIBRARY_FIELDS)
    ensure_permission(tok, writer_policy, "library", "update", PUBLISHED_ONLY, WRITER_FIELDS)
    find_or_create_writer_user(tok, writer_policy)

    print("[done] 权限配置完成")


if __name__ == "__main__":
    main()
