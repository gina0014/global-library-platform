"""============================================================
Step 2 — Directus 权限配置（幂等）

公开读取（Policy: Public）
  - library  read  → 强制 {"status": {"_eq": "published"}}
  - country  read  → 强制 {"status": {"_eq": "published"}}

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
    ensure_permission(tok, public_policy, "library", "read", PUBLISHED_ONLY, LIBRARY_FIELDS)
    ensure_permission(tok, public_policy, "country", "read", PUBLISHED_ONLY, COUNTRY_FIELDS)

    # 2) AC2 最小写入通道
    writer_policy = find_or_create_writer_policy(tok)
    ensure_permission(tok, writer_policy, "library", "read", None, LIBRARY_FIELDS)
    ensure_permission(tok, writer_policy, "library", "update", PUBLISHED_ONLY, WRITER_FIELDS)
    find_or_create_writer_user(tok, writer_policy)

    print("[done] 权限配置完成")


if __name__ == "__main__":
    main()
