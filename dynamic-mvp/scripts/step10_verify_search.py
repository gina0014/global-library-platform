"""============================================================
Step 10 — C2 Dynamic Search 验收（C2-AC1 … C2-AC7）

  C2-AC1  典型查询能找到预期结果
  C2-AC2  API 模式与 JSON baseline 的核心结果集合一致（逐字比对渲染文本）
  C2-AC3  draft / pending = 0 泄露
  C2-AC4  中文查询专项测试
  C2-AC5  空查询 / 特殊字符 / 超长查询不导致异常
  C2-AC6  Console new serious error = 0
  C2-AC7  B2 / B3 / C1 核心回归 PASS

架构约束复核（C2.2）：页面 → data-loader.js → 检索适配器 → Directus。
验收脚本同时静态校验页面与 data-loader 之间没有第二条取数通路。
============================================================"""

import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "dynamic-mvp" / "scripts"
EVIDENCE = ROOT / "dynamic-mvp" / "evidence"
BASE = "http://localhost:8000"
NODE = "C:/Users/86132/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"
PYTHON = sys.executable
LOADER = ROOT / "js" / "data-loader.js"

# --no-nested：顶层驱动（step11）跑全套时传入，禁止本套件再嵌套调用其它套件。
NESTED_OFF = "--no-nested" in sys.argv

QUERIES = [
    ("chinese-library", "图书馆"),
    ("chinese-city", "上海"),
    ("chinese-country", "丹麦"),
    ("chinese-topic", "设计"),
    ("english-name", "Shanghai"),
    ("english-alias", "Denmark"),
    ("source-term", "IFLA"),
]

# 未发布实体关键词（draft / pending），用于 AC3 零泄露判定
LEAK_QUERIES = [
    ("c2_leak_zh", "基斯塔"),          # draft 图书馆
    ("c2_leak_en", "García Márquez"),  # pending 图书馆（另有 2 条已发布 Source 引用它）
]

EDGE_QUERIES = [
    ("empty", ""),
    ("percent", "%"),
    ("underscore", "_"),
    ("quote", "'"),
    ("stars", "***"),
    ("long", "图" * 300),
]

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)
    return ok


def current_mode():
    """localhost 默认命中 local-dev 部署目标 → api（PHASE 1 起不再写死在源码里）。"""
    return "api"


def set_mode(mode):
    """保留签名兼容调用点：现在不改写任何源码，模式切换走 ?datasource= 覆写。"""
    if mode not in ("api", "json"):
        raise SystemExit(f"[FATAL] 未知数据源模式 {mode}")


def run_tasks(tasks, wait=6000):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    tasks_path = EVIDENCE / "_search_tasks.json"
    tasks_path.write_text(json.dumps(tasks, ensure_ascii=False), encoding="utf-8")
    subprocess.run([NODE, "browser_suite.mjs", str(tasks_path), str(EVIDENCE)],
                   capture_output=True, text=True, cwd=SCRIPTS,
                   encoding="utf-8", errors="replace")
    out = {}
    for t in tasks:
        f = EVIDENCE / f"{t['tag']}.txt"
        raw = f.read_text(encoding="utf-8") if f.exists() else ""
        errors = []
        text = raw
        if "CONSOLE_ERRORS=" in raw:
            text, tail = raw.split("CONSOLE_ERRORS=", 1)
            errors = [tail.strip()]
        out[t["tag"]] = (text.strip(), errors)
    return out


def search_url(q):
    from urllib.parse import quote
    return f"{BASE}/pages/search.html?q={quote(q)}"


def ds(url, mode):
    """附加运行时数据源覆写参数（PHASE 1 起模式切换不再改写源码）。"""
    if mode == "api":
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}datasource=json"


def strip_comments(src):
    """去掉 /* */ 块注释与整行 // 注释，用于静态校验真实的调用关系。

    不做行内 // 截断——源码里有 http:// 之类的字符串，行内截断会误伤标识符。
    """
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return "\n".join(l for l in src.splitlines() if not l.strip().startswith("//"))


# 未发布实体扫描：文件 → (结果类型, 主键, 详情页, 可检索字段)
ENTITY_SPECS = [
    ("countries.json", "Country", "country_id", "pages/country.html", ["country_name"]),
    ("libraries.json", "Library", "library_id", "pages/library.html", ["name", "name_en", "city"]),
    ("awards.json", "Award", "award_id", "pages/award.html", ["award_name", "organizer"]),
    ("cases.json", "Case", "case_id", "pages/case.html", ["title", "description"]),
    ("sources.json", "Source", "source_id", None, ["title", "source_name", "publisher"]),
]


def unpublished_hits(keyword):
    """返回 JSON baseline 中所有“未发布且文本命中关键词”的实体指纹。

    指纹 = 详情页 URL（Source 无详情页，退化为标题），用于和渲染出的结果项比对。
    """
    kw = keyword.lower()
    hits = []
    for fname, etype, pk, detail, fields in ENTITY_SPECS:
        rows = json.loads((ROOT / "data" / fname).read_text(encoding="utf-8"))
        for r in rows:
            if r.get("status") == "published":
                continue
            hay = " ".join(str(r.get(f) or "") for f in fields).lower()
            if kw not in hay:
                continue
            url = f"{detail}?id={r[pk]}" if detail else (r.get("title") or r.get("source_name") or "")
            hits.append({"type": etype, "id": r[pk], "url": url,
                         "title": r.get("name") or r.get("title")
                         or r.get("award_name") or r.get("country_name")
                         or r.get("source_name") or ""})
    return hits


# 结构化读取搜索结果项（type / title / href），用于判定“未发布实体是否泄露”
RESULT_ITEMS_EXPR = """
(async () => {
  const items = [...document.querySelectorAll('a.result-item')].map(a => ({
    type: (a.querySelector('.tag')?.textContent || '').trim(),
    title: (a.querySelector('.result-title')?.textContent || '').trim(),
    href: (a.getAttribute('href') || '').trim()
  }));
  const m = document.body.innerText.match(/Showing (\\d+) result/);
  return JSON.stringify({ showing: m ? Number(m[1]) : 0, items });
})()
"""


def main():
    loader_md5_before = LOADER.read_bytes()
    set_mode("api")

    # ---------- 架构约束（C2.2） ----------
    print("\n== C2.2 架构约束 ==", flush=True)
    page = (ROOT / "js" / "search.js").read_text(encoding="utf-8")
    check("C2.2：Search 页面不直接 fetch 任何后端",
          "fetch(" not in page and "XMLHttpRequest" not in page)
    # 注释里提到 searchAllUpgraded 是允许的，这里只禁止真实调用
    code_only = strip_comments(page)
    check("C2.2：Search 页面只经 data-loader.searchAll() 取结果",
          "searchAll(" in code_only and "searchAllUpgraded" not in code_only)
    adapter = (ROOT / "js" / "search-adapter.js").read_text(encoding="utf-8")
    check("C2.2：适配器只请求 Directus（无第二后端、无检索服务）",
          "localhost:8055" not in adapter and "API_DATASOURCE.baseUrl" in adapter)

    # ---------- AC1 / AC2 / AC4 / AC6：api 模式 vs json 模式 ----------
    print("\n== C2-AC1 / AC2 / AC4 / AC6：API ↔ JSON 比对 ==", flush=True)
    tasks = [{"tag": f"c2_api_{label}", "url": search_url(q), "wait": 7000}
             for label, q in QUERIES]
    tasks += [{"tag": f"c2_edge_{label}", "url": search_url(q), "wait": 7000}
              for label, q in EDGE_QUERIES]
    api_out = run_tasks(tasks)
    # 不再改写源码：这一组任务用 ?datasource=json 走 JSON baseline
    json_out = run_tasks([{"tag": f"c2_json_{label}", "url": ds(search_url(q), "json"), "wait": 7000}
                          for label, q in QUERIES]
                         + [{"tag": f"c2_jedge_{label}", "url": ds(search_url(q), "json"), "wait": 7000}
                            for label, q in EDGE_QUERIES])
    check("数据源切换不再改写源码（验收零污染）", LOADER.read_bytes() == loader_md5_before)

    for label, q in QUERIES:
        a_text, a_err = api_out[f"c2_api_{label}"]
        j_text, _ = json_out[f"c2_json_{label}"]
        check(f"C2-AC2：「{q}」API 模式与 JSON baseline 渲染文本逐字一致",
              bool(a_text) and a_text == j_text, f"api={len(a_text)} json={len(j_text)}")
        has_result = "Showing" in a_text or "No results" in a_text
        check(f"C2-AC1：「{q}」返回可判定的结果区", has_result,
              (a_text.splitlines()[0][:60] if a_text else "empty"))
        check(f"C2-AC6：「{q}」Console 无错误", not a_err, str(a_err)[:160])

    # 中文专项：确认确实命中（不是空结果）
    print("\n== C2-AC4：中文查询专项 ==", flush=True)
    for label, q in [x for x in QUERIES if x[0].startswith("chinese")]:
        a_text, _ = api_out[f"c2_api_{label}"]
        hits = re.search(r"Showing (\d+) result", a_text)
        n = int(hits.group(1)) if hits else 0
        check(f"C2-AC4：中文「{q}」有召回（results={n}）", n > 0, f"results={n}")

    # ---------- AC5：空 / 特殊字符 / 超长 ----------
    print("\n== C2-AC5：空查询 / 特殊字符 / 超长查询 ==", flush=True)
    for label, q in EDGE_QUERIES:
        a_text, a_err = api_out[f"c2_edge_{label}"]
        j_text, _ = json_out[f"c2_jedge_{label}"]
        ok_render = ("Enter a keyword" in a_text) or ("Showing" in a_text) or ("No results" in a_text)
        check(f"C2-AC5：{label} 不导致异常（正常渲染结果区或空态）", ok_render,
              (a_text.splitlines()[0][:60] if a_text else "empty"))
        check(f"C2-AC5：{label} 结果与 JSON 模式一致", a_text == j_text,
              f"api={len(a_text)} json={len(j_text)}")
        check(f"C2-AC6：{label} Console 无错误", not a_err, str(a_err)[:160])

    # ---------- AC3：draft / pending 零泄露 ----------
    print("\n== C2-AC3：draft / pending 零泄露 ==", flush=True)
    # 判定口径：**未发布实体本身**零泄露。
    # 不能简单断言"查询零结果"——一个未发布的图书馆可能同时被已发布的 Source 引用，
    # 此时命中已发布 Source 是正确行为（García Márquez 就有 2 条已发布来源）。
    # 因此这里结构化读取结果项，逐条比对未发布实体的详情页 URL / 标题。
    leak_tasks = []
    for tag, kw in LEAK_QUERIES:
        leak_tasks.append({"tag": f"{tag}_plain", "url": search_url(kw), "wait": 7000})
        leak_tasks.append({"tag": f"{tag}_items", "url": search_url(kw),
                           "expr": RESULT_ITEMS_EXPR, "wait": 7000})
    probe = run_tasks(leak_tasks)
    for tag, kw in LEAK_QUERIES:
        hidden = unpublished_hits(kw)
        raw, err = probe[f"{tag}_items"]
        try:
            parsed = json.loads(raw or "{}")
        except ValueError:
            parsed = {}
        items = parsed.get("items") or []
        # 页面在 pages/ 下，href 带 "../" 前缀；比对前统一去掉
        got_urls = {re.sub(r"^\.\./", "", i.get("href", "")) for i in items}
        got_titles = {i.get("title", "") for i in items}
        leaked = [h for h in hidden if h["url"] in got_urls or h["title"] in got_titles]
        check(f"C2-AC3：未发布实体「{kw}」零泄露"
              f"（baseline 未发布命中 {len(hidden)}，结果项 {len(items)}）",
              bool(hidden) and not leaked,
              f"leaked={leaked[:2]}" if leaked else f"hidden={[h['url'] for h in hidden][:2]}")
        plain, _ = probe[f"{tag}_plain"]
        check(f"C2-AC3：结果页不含未发布实体标题原文（「{kw}」）",
              not any(h["title"] and h["title"] in plain for h in hidden),
              f"hits={parsed.get('showing')}")
        check(f"C2-AC6：{tag} Console 无错误", not err, str(err)[:160])

    # ---------- AC7：回归 ----------
    # --no-nested：由顶层驱动（step11）统一执行回归，这里不再嵌套调用其它套件，
    # 否则 step11→step10→step8→step3/step6 三层套娃会把同一批浏览器回归重复跑 6 遍。
    print("\n== C2-AC7：B2 / B3 / C1 核心回归 ==", flush=True)
    if NESTED_OFF:
        print("[skip] --no-nested：由顶层驱动统一执行回归", flush=True)
    else:
        for script, label in [("step3_verify_data.py", "step3（数据 / API 层）"),
                              ("step6_verify_workflow.py", "step6（B3 工作流）"),
                              ("step8_verify_map.py", "step8（C1 地图）")]:
            extra = ["--no-nested"] if script == "step8_verify_map.py" else []
            p = subprocess.run([PYTHON, "-u", script, *extra], cwd=SCRIPTS,
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
            tail = [l for l in (p.stdout or "").splitlines() if l.startswith(("TOTAL=", "FAILED"))]
            check(f"C2-AC7：{label} 全部 PASS", p.returncode == 0, (tail[-1] if tail else "")[:200])

    print("\n== 汇总 ==", flush=True)
    failed = [n for n, ok, _ in results if not ok]
    print(f"TOTAL={len(results)}  PASS={len(results) - len(failed)}  FAIL={len(failed)}")
    if failed:
        print("FAILED ITEMS: " + ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
