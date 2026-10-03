"""============================================================
CI quality gate（D2）

两个 scope，供 GitHub Actions 分别调用：

  python ci_check.py --scope static   不需要数据库：
      JSON baseline 完整性 / PK / FK / UNIQUE / Source 溯源 /
      Secret & 违禁入库文件扫描 / 前端静态健全性 / 检索契约

  python ci_check.py --scope db       需要 PostgreSQL（Actions service container）：
      迁移完整性（DDL 全量可应用）/ 约束存在性 / published-only /
      父子发布一致性 / 行数与 JSON baseline 一致

任一检查失败 → 退出码 1，并打印 [FAIL] 明细。
CI 不连接任何生产数据库：db scope 只连 Actions 内的临时 service container。
============================================================"""

import argparse
import json
import pathlib
import re
import shlex
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
JS = ROOT / "js"
PAGES = ROOT / "pages"
DDL = ROOT / "dynamic-mvp" / "db" / "ddl"

# 集合 → (主键, 文件名)
COLLECTIONS = {
    "countries": ("country_id", "countries.json"),
    "libraries": ("library_id", "libraries.json"),
    "awards": ("award_id", "awards.json"),
    "award_results": ("award_result_id", "award-results.json"),
    "cases": ("case_id", "cases.json"),
    "sources": ("source_id", "sources.json"),
}

# 关联表 → ((实体外键, 父集合), source 外键)
RELATIONS = {
    "country-source.json": ("country_id", "countries"),
    "library-source.json": ("library_id", "libraries"),
    "award-source.json": ("award_id", "awards"),
    "award-result-source.json": ("award_result_id", "award_results"),
    "case-source.json": ("case_id", "cases"),
}

STATUS_VALUES = {"published", "pending", "draft", "archived"}

DDL_ORDER = [
    "01-schema-country-library.postgresql.sql",
    "02-seed-country-library.sql",
    "03-schema-remaining-core.postgresql.sql",
    "04-seed-remaining-core.sql",
    "05-governance.sql",
]

# 禁止入库的文件（前缀匹配，路径相对仓库根）
FORBIDDEN_TRACKED = [
    "dynamic-mvp/.env",
    "dynamic-mvp/.env.local",
    ".env",
    "docker-data/",
    "dynamic-mvp/data/",
    ".cdp-profile/",
]
# 允许入库的占位符模板（不含任何真实值）
ALLOWED_TRACKED = ["dynamic-mvp/.env.example"]

SECRET_PATTERNS = [
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "private key"),
    (r"(?i)\b(aws|github|slack)_[a-z]*token\b\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}", "service token"),
    (r"(?i)\b(password|passwd|secret)\b\s*[:=]\s*['\"][^'\"]{8,}['\"]", "hardcoded credential"),
]

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)
    return ok


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def tracked_files():
    p = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return [l.strip() for l in (p.stdout or "").splitlines() if l.strip()]


def strip_comments(src):
    """剔除 /* */ 块注释与整行 // 注释（不做行内截断，避免误伤 http://）。"""
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return "\n".join(l for l in src.splitlines() if not l.strip().startswith("//"))


# ---------------------------------------------------------------- static scope

def scope_static():
    print("== JSON baseline 完整性 ==", flush=True)
    data = {}
    for key, (pk, fname) in COLLECTIONS.items():
        path = DATA / fname
        ok = path.exists()
        if ok:
            try:
                rows = load(fname)
                data[key] = rows
                ok = isinstance(rows, list) and len(rows) > 0
                detail = f"{len(rows)} 行"
            except ValueError as e:
                ok, detail = False, f"JSON 解析失败 {e}"
        else:
            detail = "文件缺失"
        check(f"baseline：{fname} 存在且可解析", ok, detail if ok else detail)

    print("\n== 主键 PK ==", flush=True)
    ids = {}
    for key, (pk, fname) in COLLECTIONS.items():
        rows = data.get(key) or []
        seen = [r.get(pk) for r in rows]
        dup = sorted({x for x in seen if seen.count(x) > 1})
        check(f"PK：{key}.{pk} 唯一且非空",
              bool(seen) and all(x is not None for x in seen) and not dup,
              f"重复={dup[:3]}" if dup else f"{len(seen)} 行")
        ids[key] = set(seen)

    print("\n== 外键 FK ==", flush=True)
    libs = data.get("libraries") or []
    bad = [r.get("library_id") for r in libs
           if r.get("country_id") not in ids.get("countries", set())]
    check("FK：library.country_id → country", not bad, f"孤儿={bad[:3]}")

    ars = data.get("award_results") or []
    bad = [r.get("award_result_id") for r in ars
           if r.get("award_id") not in ids.get("awards", set())
           or r.get("library_id") not in ids.get("libraries", set())]
    check("FK：award_result.award_id / library_id", not bad, f"孤儿={bad[:3]}")

    cases = data.get("cases") or []
    bad = [c.get("case_id") for c in cases if c.get("library_id") not in ids.get("libraries", set())]
    check("FK：case.library_id → library", not bad, f"孤儿={bad[:3]}")

    print("\n== 唯一键 UNIQUE ==", flush=True)
    keys = [(r.get("award_id"), r.get("library_id"), r.get("year"),
             r.get("category"), r.get("result_type")) for r in ars]
    dup = {k for k in keys if keys.count(k) > 1}
    check("UNIQUE：award_result (award_id, library_id, year, category, result_type)",
          not dup, f"重复={list(dup)[:2]}")

    for fname, (fk, parent) in RELATIONS.items():
        rows = load(fname)
        pairs = [(r.get(fk), r.get("source_id")) for r in rows]
        dup = {p for p in pairs if pairs.count(p) > 1}
        check(f"UNIQUE：{fname} ({fk}, source_id)", not dup, f"重复={list(dup)[:2]}")
        orphan = [p for p in pairs if p[0] not in ids.get(parent, set())
                  or p[1] not in ids.get("sources", set())]
        check(f"FK：{fname} → {parent} / source", not orphan, f"孤儿={orphan[:2]}")

    print("\n== 状态枚举 ==", flush=True)
    for key in COLLECTIONS:
        bad = sorted({r.get("status") for r in (data.get(key) or [])
                      if r.get("status") not in STATUS_VALUES})
        check(f"status：{key} 全部落在枚举内", not bad, f"非法={bad}")

    print("\n== Source 溯源 ==", flush=True)
    sources = data.get("sources") or []
    offline = [s.get("source_id") for s in sources
               if not re.match(r"^https?://", str(s.get("url") or ""))]
    # 无 URL 的来源必须是可识别的离线文档（有名称或题名），不得是空壳记录
    unidentified = [i for i in offline
                    if not (next(s for s in sources if s.get("source_id") == i).get("source_name")
                            or next(s for s in sources if s.get("source_id") == i).get("title"))]
    check("provenance：无 URL 的来源仍可识别（离线汇编文档，非空壳）",
          not unidentified, f"不可识别={unidentified[:3]}")
    bad_url = [s.get("source_id") for s in sources
               if s.get("url") and not re.match(r"^https?://", str(s["url"]))]
    check("provenance：有 URL 的来源全部使用 http(s)", not bad_url, f"非法={bad_url[:3]}")
    check("provenance：Source 数量 > 0", len(sources) > 0,
          f"{len(sources)} 条（{len(offline)} 条为无 URL 的离线文档）")
    # 前端不得为无 URL 的来源渲染空链接
    comp = (JS / "components.js").read_text(encoding="utf-8")
    check("provenance：无 URL 来源不渲染空链接（不编造 URL）",
          "No public URL" in comp and 'href=""' not in comp)

    print("\n== 违禁入库文件 / Secret 扫描 ==", flush=True)
    files = tracked_files()
    hit = [f for f in files
           if f not in ALLOWED_TRACKED
           and any(f == p or f.startswith(p) for p in FORBIDDEN_TRACKED)]
    check("无违禁文件被跟踪（.env / docker 数据 / 浏览器 profile）", not hit, f"命中={hit[:3]}")
    hit_env = [f for f in files if f.endswith(".env") or f.endswith(".env.local")]
    check("仓库内不含真实环境文件（仅允许 .env.example 占位模板）", not hit_env, f"命中={hit_env[:3]}")

    scan_targets = [f for f in files if f.startswith(("js/", "pages/", "css/", "data/",
                                                       "dynamic-mvp/scripts/",
                                                       "dynamic-mvp/db/"))]
    hits = []
    for f in scan_targets:
        p = ROOT / f
        if not p.exists() or p.suffix.lower() in {".png", ".jpg", ".svg", ".ico", ".woff"}:
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pat, label in SECRET_PATTERNS:
            if re.search(pat, text):
                hits.append(f"{f}:{label}")
    check("前端 / 脚本 / 数据内无明文凭据", not hits, f"命中={hits[:3]}")

    # 前端不得内嵌 admin token：只允许出现环境变量读取
    js_hits = [f for f in files if f.startswith("js/") and (ROOT / f).exists()
               and re.search(r"(?i)admin.*token\s*[:=]\s*['\"][A-Za-z0-9_\-]{12,}",
                             (ROOT / f).read_text(encoding="utf-8", errors="ignore"))]
    check("前端无内嵌 admin token", not js_hits, f"命中={js_hits[:2]}")

    print("\n== 前端静态健全性 ==", flush=True)
    js_files = sorted(JS.glob("*.js"))
    bad = []
    for f in js_files:
        p = subprocess.run(["node", "--check", str(f)], capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        if p.returncode != 0:
            bad.append(f.name)
    check(f"JS 语法检查通过（{len(js_files)} 个模块）", not bad, f"失败={bad}")

    page_fetch = [p.name for p in sorted(PAGES.glob("*.html"))
                  if re.search(r"\bfetch\s*\(|(new\s+)?XMLHttpRequest",
                               (p.read_text(encoding="utf-8", errors="ignore")))]
    check("页面 HTML 内不直接发起数据请求", not page_fetch, f"命中={page_fetch[:3]}")

    print("\n== 检索 / Ask AI 契约 ==", flush=True)
    search_js = strip_comments((JS / "search.js").read_text(encoding="utf-8"))
    check("C2：搜索页只经 data-loader.searchAll()",
          "searchAll(" in search_js and "searchAllUpgraded" not in search_js)
    adapter = (JS / "search-adapter.js").read_text(encoding="utf-8")
    check("C2：检索适配器不硬编码后端地址（统一用 API_DATASOURCE）",
          "API_DATASOURCE.baseUrl" in adapter and "localhost:8055" not in adapter)
    ask = strip_comments((JS / "ask-ai.js").read_text(encoding="utf-8"))
    check("D1：Ask AI 只经 data-loader.askPlatform()",
          "askPlatform(" in ask and "answerQuestion" not in ask)
    ask_adapter_code = strip_comments((JS / "ask-ai-adapter.js").read_text(encoding="utf-8"))
    check("D1：接地引擎不 fetch、不读 JSON、不引入 LLM / Vector DB",
          "fetch(" not in ask_adapter_code and "DATA_PATH" not in ask_adapter_code
          and not re.search(r"openai|embedding|vector|meilisearch", ask_adapter_code, re.I))
    loader = (JS / "data-loader.js").read_text(encoding="utf-8")
    check("单一数据入口：data-loader 是唯一持有 API 配置的模块",
          "API_DATASOURCE" in loader and
          not any("API_DATASOURCE" in (JS / f).read_text(encoding="utf-8")
                  for f in ["search.js", "ask-ai.js", "world-map.js"] if (JS / f).exists()))


# -------------------------------------------------------------------- db scope

import os

# 连接参数：CI 走 Actions service container；本地可覆盖 PGHOST/PGPORT 做同等验证
PG_HOST = os.environ.get("PGHOST", "127.0.0.1")
PG_PORT = os.environ.get("PGPORT", "5432")
PG_USER = os.environ.get("PGUSER", "ci_user")
PG_PASSWORD = os.environ.get("PGPASSWORD", "ci_password")
PG_DB = os.environ.get("PGDATABASE", "ci_glp")
# GitHub Actions 的 runner 自带 psql；本地无 psql 时可用 PSQL_BIN 指向等价转发器。
# posix 模式在 Windows 上会把路径里的反斜杠当转义符吃掉（C:\Users\... → C:Users...），
# 因此 Windows 下按非 posix 规则切分。Linux runner 行为不变。
PSQL = shlex.split(os.environ.get("PSQL_BIN", "psql"), posix=(os.name != "nt"))


def psql_base(db):
    return PSQL + ["-h", PG_HOST, "-p", str(PG_PORT), "-U", PG_USER, "-d", db,
                   "-v", "ON_ERROR_STOP=1"]


def run_psql(args, db):
    return subprocess.run(psql_base(db) + args, capture_output=True, text=True,
                          encoding="utf-8", errors="replace",
                          env={**os.environ, "PGPASSWORD": PG_PASSWORD})


def psql(sql, db=None):
    p = run_psql(["-tA", "-c", sql], db or PG_DB)
    if p.returncode != 0:
        raise RuntimeError(f"psql failed: {(p.stderr or '')[:300]}")
    return [l for l in (p.stdout or "").splitlines() if l.strip()]


def scope_db():
    print("== 迁移完整性（DDL 全量可应用） ==", flush=True)
    # 目标库不存在时创建（本地复跑时先丢弃旧库，保证从零迁移可复现）
    run_psql(["-c", f"DROP DATABASE IF EXISTS {PG_DB};"], "postgres")
    created = run_psql(["-c", f"CREATE DATABASE {PG_DB};"], "postgres")
    check(f"可创建临时数据库 {PG_DB}（从零迁移）", created.returncode == 0,
          (created.stderr or "").strip().splitlines()[-1][:120] if created.returncode else "ok")

    for fname in DDL_ORDER:
        p = run_psql(["-f", str(DDL / fname)], PG_DB)
        check(f"DDL 可应用：{fname}", p.returncode == 0,
              (p.stderr or "").strip().splitlines()[-1][:120] if p.returncode else "ok")

    print("\n== 约束存在性（PK / UNIQUE / FK） ==", flush=True)
    pk = psql("SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type='PRIMARY KEY';")
    uq = psql("SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type='UNIQUE';")
    fk = psql("SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY';")
    check("主键约束已建立", int(pk[0]) > 0, f"{pk[0]} 个")
    check("UNIQUE 约束已建立（含关联表复合键）", int(uq[0]) > 0, f"{uq[0]} 个")
    check("外键约束已建立", int(fk[0]) > 0, f"{fk[0]} 个")

    print("\n== published-only / 父子发布一致性 ==", flush=True)
    orphan_ar = psql(
        "SELECT count(*) FROM award_result ar "
        "JOIN award a ON a.award_id = ar.award_id "
        "JOIN library l ON l.library_id = ar.library_id "
        "WHERE ar.status='published' AND (a.status <> 'published' OR l.status <> 'published');")
    check("父子一致性：无「已发布 award_result 挂在未发布父实体」",
          int(orphan_ar[0]) == 0, f"孤儿={orphan_ar[0]}")
    orphan_case = psql(
        "SELECT count(*) FROM case_project c "
        "JOIN library l ON l.library_id = c.library_id "
        "WHERE c.status='published' AND l.status <> 'published';")
    check("父子一致性：无「已发布 case 挂在未发布图书馆」",
          int(orphan_case[0]) == 0, f"孤儿={orphan_case[0]}")

    for view, label in [("v_public_award_result", "award_result"),
                        ("v_public_case_project", "case_project"),
                        ("v_public_library_source", "library_source")]:
        n = psql(f"SELECT count(*) FROM {view};")
        check(f"治理视图可用：{view}（{label}）", int(n[0]) >= 0, f"{n[0]} 行")

    print("\n== 行数与 JSON baseline 一致 ==", flush=True)
    pairs = [("country", "countries.json"), ("library", "libraries.json"),
             ("award", "awards.json"), ("award_result", "award-results.json"),
             ("case_project", "cases.json"), ("source", "sources.json")]
    for table, fname in pairs:
        db_n = int(psql(f"SELECT count(*) FROM {table};")[0])
        json_n = len(load(fname))
        check(f"迁移保真：{table} = {fname}（{db_n}/{json_n}）", db_n == json_n,
              f"db={db_n} json={json_n}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scope", choices=["static", "db"], required=True)
    args = ap.parse_args()
    if args.scope == "static":
        scope_static()
    else:
        scope_db()

    failed = [n for n, ok, _ in results if not ok]
    print(f"\nTOTAL={len(results)}  PASS={len(results) - len(failed)}  FAIL={len(failed)}")
    if failed:
        for n in failed:
            print(f"FAILED: {n}")
        sys.exit(1)


main()
