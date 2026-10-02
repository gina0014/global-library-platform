"""============================================================
Directus REST 客户端（仅用标准库 urllib，无第三方依赖）

Issue 001 专用：
  - 登录取 token
  - 集合/字段/角色/策略/权限的读取与创建
  - Items 读写（用于 published-only 与 AC2 写入验证）
============================================================"""

import json
import os
import pathlib
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://localhost:8055"


def _load_local_env():
    """读取 dynamic-mvp/.env（未跟踪文件）填入环境变量；已存在的环境变量优先。

    目的：脚本里不出现任何硬编码凭据，仓库中只保留 .env.example 占位符。
    """
    env_path = pathlib.Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


_load_local_env()


def env(name, required=True):
    """读取环境变量；缺失时给出明确报错（不回退到任何硬编码值）。"""
    value = os.environ.get(name)
    if required and not value:
        raise SystemExit(f"[FATAL] 缺少环境变量 {name}：请在 dynamic-mvp/.env 中填写（该文件不入库）")
    return value


class ApiError(Exception):
    def __init__(self, method, path, status, body):
        super().__init__(f"{method} {path} -> {status}: {body}")
        self.status = status
        self.body = body


def req(method, path, token=None, payload=None, raw=False):
    url = BASE + path
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            return text if raw else (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        raise ApiError(method, path, e.code, body)


def get(path, token=None, raw=False):
    return req("GET", path, token=token, raw=raw)


def post(path, payload, token=None):
    return req("POST", path, token=token, payload=payload)


def patch(path, payload, token=None):
    return req("PATCH", path, token=token, payload=payload)


def health():
    """返回 True / False，不抛异常（用于等待容器就绪）。"""
    try:
        r = get("/server/health")
        return r.get("status") == "ok"
    except Exception:
        return False


def wait_ready(timeout=180, interval=3):
    import time

    waited = 0
    while waited < timeout:
        if health():
            return True
        time.sleep(interval)
        waited += interval
    raise SystemExit("[FATAL] Directus 未在超时时间内就绪")


def login(email, password):
    r = post("/auth/login", {"email": email, "password": password})
    return r["data"]["access_token"]


def q(path, **params):
    """拼查询串，值统一 JSON 序列化（Directus filter 语法）。"""
    parts = []
    for k, v in params.items():
        parts.append(f"{k}={urllib.parse.quote(json.dumps(v) if isinstance(v, (dict, list)) else str(v), safe='')}")
    return path + ("?" + "&".join(parts) if parts else "")
