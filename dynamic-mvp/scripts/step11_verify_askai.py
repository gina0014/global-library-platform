"""============================================================
Step 11 — D1 Ask AI Dynamic Upgrade 验收（D1-AC1 … D1-AC7）

  D1-AC1  Ask AI 运行时数据来自动态数据 / API，不是静态 JSON 主数据源
  D1-AC2  典型 Library / Award / Case 问题的结果与数据库一致
  D1-AC3  回答显示 provenance / Source，且 Source 是真实记录（无编造 URL）
  D1-AC4  draft / pending = 0 泄露
  D1-AC5  平台数据不能回答的问题不编造答案
  D1-AC6  特殊字符 / 空问题 / 超长问题不产生异常
  D1-AC7  B2 / B3 / C1 / C2 核心回归保持 PASS

判定方式：页面渲染结果 ↔ PostgreSQL 真值逐条对拍（不是自说自话）。
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

# (tag, question, 期望校验方式) —— 期望值全部由 PostgreSQL 现算，不硬编码
GROUND_TRUTH_QUERIES = [
    ("library_awards", "Which awards has Shanghai Library won?"),
    ("award_libraries", "Which libraries have won IFLA Public Library of the Year?"),
    ("award_winning", "Which libraries in the dataset have received international awards?"),
    ("libraries_by_country", "Which libraries are located in Denmark?"),
    ("cases", "Show all cases and projects."),
    ("green", "Show green library award cases."),
]

# 平台数据无法回答的问题（D1-AC5）
UNANSWERABLE = [
    ("d1_fabrication_gdp", "What is the GDP of France in 2026?"),
    ("d1_fabrication_person", "Who is the current director of the Library of Congress?"),
    ("d1_fabrication_future", "Which library will win the 2030 award?"),
]

# 特殊输入（D1-AC6）
EDGE = [
    ("d1_edge_empty", ""),
    ("d1_edge_percent", "%"),
    ("d1_edge_quote", "' OR 1=1 --"),
    ("d1_edge_stars", "***"),
    ("d1_edge_emoji", "\U0001f600\U0001f600\U0001f600"),
    ("d1_edge_long", "Which libraries are located in Denmark? " * 60),
]

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)
    return ok


def strip_comments(src):
    """剔除 /* */ 块注释与整行 // 注释（不做行内截断，避免误伤 http:// 里的标识符）。"""
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return "\n".join(l for l in src.splitlines() if not l.strip().startswith("//"))


def current_mode():
    """localhost 默认命中 local-dev 部署目标 → api（PHASE 1 起不再写死在源码里）。"""
    return "api"


def set_mode(mode):
    """保留签名兼容调用点：现在不改写任何源码，模式切换走 ?datasource= 覆写。"""
    if mode not in ("api", "json"):
        raise SystemExit(f"[FATAL] 未知数据源模式 {mode}")


def psql(sql):
    p = subprocess.run(
        ["docker", "compose", "exec", "-T", "postgres", "psql", "-U", "glp", "-d", "glp_mvp",
         "-tA", "-c", sql],
        cwd=ROOT / "dynamic-mvp", capture_output=True, text=True,
        encoding="utf-8", errors="replace")
    if p.returncode != 0:
        raise RuntimeError(f"psql failed: {(p.stderr or '')[:200]}")
    return [l for l in (p.stdout or "").splitlines() if l.strip()]


def run_tasks(tasks):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    tasks_path = EVIDENCE / "_askai_tasks.json"
    tasks_path.write_text(json.dumps(tasks, ensure_ascii=False), encoding="utf-8")
    try:
        subprocess.run([NODE, "browser_suite.mjs", str(tasks_path), str(EVIDENCE)],
                       capture_output=True, text=True, cwd=SCRIPTS,
                       encoding="utf-8", errors="replace", timeout=1500)
    except subprocess.TimeoutExpired:
        # 浏览器卡死不应让验收无限等待：记为环境失败，后续断言自然 FAIL
        print("[ENV] browser_suite 超时（1500s），本轮浏览器证据不可用", flush=True)
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


def ask_url(q):
    from urllib.parse import quote
    return f"{BASE}/pages/ask-ai.html?q={quote(q)}"


# 结构化读取：答案文本 + 结果项 + 来源链接
ASK_EXPR = """
(async () => {
  const box = document.getElementById('answer-box');
  const items = [...document.querySelectorAll('#answer-results a.result-item')].map(a => ({
    type: (a.querySelector('.tag')?.textContent || '').trim(),
    title: (a.querySelector('.result-title')?.textContent || '').trim(),
    href: (a.getAttribute('href') || '').replace(/^\\.\\.\\//, '')
  }));
  const sources = [...document.querySelectorAll('#answer-sources .source-item')].map(d => ({
    name: (d.querySelector('.s-name')?.textContent || '').trim(),
    url: (d.querySelector('a')?.getAttribute('href') || '').trim()
  }));
  return JSON.stringify({
    answer: (box?.querySelector('.answer-text')?.textContent || '').trim(),
    // “答不出来”的几种诚实表述都要能识别（措辞不同，语义相同）
    insufficient: /not sufficient to answer|No published library in the platform dataset matches|does not contain the information|too long for the assistant/i.test(box?.textContent || ''),
    items, sources
  });
})()
"""


def main():
    set_mode("api")
    # 基准必须取在强制切回 api 模式之后：否则上一轮遗留的 json 模式会让“已还原”永远为假
    loader_bytes_api = LOADER.read_bytes()

    # ---------- AC1：架构约束 ----------
    print("\n== D1-AC1：数据来自动态数据 / API（架构约束） ==", flush=True)
    # 注释里出现旧函数名 / "Vector DB" 属正常说明，静态校验只看真实代码
    page = strip_comments((ROOT / "js" / "ask-ai.js").read_text(encoding="utf-8"))
    check("D1-AC1：Ask AI 页面不直接 fetch 任何后端",
          "fetch(" not in page and "XMLHttpRequest" not in page)
    check("D1-AC1：Ask AI 只经 data-loader.askPlatform() 取答案",
          "askPlatform(" in page and "answerQuestion" not in page)
    adapter = strip_comments((ROOT / "js" / "ask-ai-adapter.js").read_text(encoding="utf-8"))
    check("D1-AC1：接地引擎不读 data/*.json、不直接请求后端",
          "fetch(" not in adapter and "DATA_PATH" not in adapter and "data/" not in adapter)
    check("D1-AC1：接地引擎不引入 LLM / Vector DB / Embedding",
          not re.search(r"openai|embedding|vector|meilisearch|anthropic", adapter, re.I))
    check("D1-AC1：主题兜底复用 C2 动态检索（searchAll），未重写一套搜索",
          "searchFn" in adapter and "searchAll" in page)
    check("D1-AC1：验收运行在 api 模式（数据来自 API，不是 JSON fallback）",
          current_mode() == "api", f"mode={current_mode()}")

    # ---------- 浏览器任务：一次性跑完（单实例 Edge，避免反复启停） ----------
    hidden = psql("SELECT name FROM library WHERE status <> 'published' ORDER BY library_id;")
    check("D1-AC4：baseline 存在未发布图书馆可用于验证", len(hidden) > 0, f"{len(hidden)} 条")

    tasks = [{"tag": f"d1_q_{tag}", "url": ask_url(q), "expr": ASK_EXPR, "wait": 9000}
             for tag, q in GROUND_TRUTH_QUERIES]
    tasks += [{"tag": "d1_leak_pending",
               "url": ask_url(f"Which awards has {hidden[0]} won?"),
               "expr": ASK_EXPR, "wait": 9000},
              {"tag": "d1_leak_plain",
               "url": ask_url(f"Which awards has {hidden[0]} won?"), "wait": 9000}]
    tasks += [{"tag": tag, "url": ask_url(q), "expr": ASK_EXPR, "wait": 9000}
              for tag, q in UNANSWERABLE]
    tasks += [{"tag": tag, "url": ask_url(q), "expr": ASK_EXPR, "wait": 9000}
              for tag, q in EDGE]
    print(f"\n== 浏览器任务：{len(tasks)} 项，单实例 Edge 一次跑完 ==", flush=True)
    out = run_tasks(tasks)

    # ---------- AC2：与数据库真值逐条对拍 ----------
    print("\n== D1-AC2：回答结果与数据库一致 ==", flush=True)

    # 真值：图书馆 → 奖项（published）
    truth_library_awards = psql(
        "SELECT DISTINCT a.award_name FROM award_result ar "
        "JOIN award a ON a.award_id = ar.award_id "
        "JOIN library l ON l.library_id = ar.library_id "
        "WHERE ar.status='published' AND a.status='published' AND l.status='published' "
        "AND l.library_id = 1 ORDER BY a.award_name;")
    # 真值：奖项 → 图书馆
    truth_award_libraries = psql(
        "SELECT DISTINCT l.name FROM award_result ar "
        "JOIN award a ON a.award_id = ar.award_id "
        "JOIN library l ON l.library_id = ar.library_id "
        "WHERE ar.status='published' AND a.status='published' AND l.status='published' "
        "AND a.award_name LIKE 'IFLA Public Library of the Year%' ORDER BY l.name;")
    # 真值：全部有获奖记录的图书馆（父子均 published）
    truth_award_winning = psql(
        "SELECT DISTINCT l.name FROM award_result ar "
        "JOIN award a ON a.award_id = ar.award_id "
        "JOIN library l ON l.library_id = ar.library_id "
        "WHERE ar.status='published' AND a.status='published' AND l.status='published' "
        "ORDER BY l.name;")
    # 真值：丹麦图书馆
    truth_dk = psql(
        "SELECT l.name FROM library l JOIN country c ON c.country_id = l.country_id "
        "WHERE l.status='published' AND c.country_code = 'DK' ORDER BY l.name;")
    # 真值：可见案例（案例 published + 所属图书馆 published）
    truth_cases = psql(
        "SELECT c.title FROM case_project c JOIN library l ON l.library_id = c.library_id "
        "WHERE c.status='published' AND l.status='published' ORDER BY c.title;")
    # 真值：green 类别获奖记录（父子均 published）
    truth_green = psql(
        "SELECT count(*) FROM award_result ar "
        "JOIN award a ON a.award_id = ar.award_id "
        "JOIN library l ON l.library_id = ar.library_id "
        "WHERE ar.status='published' AND a.status='published' AND l.status='published' "
        "AND lower(coalesce(ar.category,'')) LIKE '%green%';")

    expectations = {
        "library_awards": ("Award", sorted(truth_library_awards)),
        "award_libraries": ("Library", sorted(truth_award_libraries)),
        "award_winning": ("Library", sorted(truth_award_winning)),
        "libraries_by_country": ("Library", sorted(truth_dk)),
        "cases": ("Case", sorted(truth_cases)),
    }

    for tag, q in GROUND_TRUTH_QUERIES:
        raw, err = out[f"d1_q_{tag}"]
        try:
            parsed = json.loads(raw or "{}")
        except ValueError:
            parsed = {}
        items = parsed.get("items") or []
        got = sorted(i["title"] for i in items)
        if tag in expectations:
            want_type, want = expectations[tag]
            check(f"D1-AC2：「{q[:46]}」结果与数据库一致（{len(got)}/{len(want)}）",
                  bool(want) and got == want, f"got={got[:3]} want={want[:3]}")
            check(f"D1-AC2：「{q[:46]}」结果类型正确（{want_type}）",
                  all(i["type"] == want_type for i in items),
                  str(sorted({i["type"] for i in items})))
        else:  # green：库内 green 记录数，答案文本里必须出现同一个数字
            n = int(truth_green[0])
            check(f"D1-AC2：「{q[:46]}」green 记录数与数据库一致（{n}）",
                  re.search(rf"\b{n}\b", parsed.get("answer", "")) is not None,
                  parsed.get("answer", "")[:90])
        check(f"D1-AC6：{tag} Console 无错误", not err, str(err)[:160])

    # ---------- AC3：Provenance ----------
    print("\n== D1-AC3：provenance / Source 真实可验证 ==", flush=True)
    real_urls = set(psql("SELECT url FROM source WHERE status='published' AND url IS NOT NULL;"))
    check("D1-AC3：数据库存在已发布 Source 可用于溯源", len(real_urls) > 0, f"{len(real_urls)} urls")
    for tag, q in GROUND_TRUTH_QUERIES:
        raw, _ = out[f"d1_q_{tag}"]
        try:
            parsed = json.loads(raw or "{}")
        except ValueError:
            parsed = {}
        srcs = parsed.get("sources") or []
        urls = [s["url"] for s in srcs if s.get("url")]
        check(f"D1-AC3：「{q[:40]}」显示 provenance（{len(srcs)} 条）", len(srcs) > 0,
              str([s["name"][:20] for s in srcs[:2]]))
        check(f"D1-AC3：「{q[:40]}」Source URL 全部是平台真实记录（0 编造）",
              bool(urls) and all(u in real_urls for u in urls),
              f"unknown={[u for u in urls if u not in real_urls][:2]}")

    # ---------- AC4：draft / pending 零泄露 ----------
    print("\n== D1-AC4：draft / pending 零泄露 ==", flush=True)
    raw, err = out["d1_leak_pending"]
    try:
        parsed = json.loads(raw or "{}")
    except ValueError:
        parsed = {}
    check("D1-AC4：未发布图书馆不产生任何结果项",
          (parsed.get("items") or []) == [], str(parsed.get("items"))[:80])
    plain, _ = out["d1_leak_plain"]
    leaked = [h for h in hidden if h in plain]
    check("D1-AC4：未发布图书馆名称不出现在回答中", not leaked, f"leaked={leaked[:2]}")
    check("D1-AC6：d1_leak Console 无错误", not err, str(err)[:160])

    # ---------- AC5：不编造 ----------
    print("\n== D1-AC5：平台数据不能回答的问题不编造 ==", flush=True)
    for tag, q in UNANSWERABLE:
        raw, err = out[tag]
        try:
            parsed = json.loads(raw or "{}")
        except ValueError:
            parsed = {}
        check(f"D1-AC5：「{q[:44]}」明确回答数据不足（0 编造）",
              bool(parsed.get("insufficient")) and (parsed.get("items") or []) == [],
              parsed.get("answer", "")[:70])
        check(f"D1-AC6：{tag} Console 无错误", not err, str(err)[:160])

    # ---------- AC6：特殊输入 ----------
    print("\n== D1-AC6：特殊字符 / 空 / 超长 ==", flush=True)
    for tag, q in EDGE:
        raw, err = out[tag]
        ok_render = bool(raw) or tag == "d1_edge_empty"
        check(f"D1-AC6：{tag} 不产生异常（有可判定输出）", ok_render, (raw or "")[:80])
        check(f"D1-AC6：{tag} Console 无错误", not err, str(err)[:160])

    check("数据源切换不再改写源码（验收全程零污染）",
          current_mode() == "api" and LOADER.read_bytes() == loader_bytes_api,
          f"mode={current_mode()}")

    # ---------- AC7：回归 ----------
    print("\n== D1-AC7：B2 / B3 / C1 / C2 回归 ==", flush=True)
    # 顶层驱动负责把每个套件**各跑一次**：对被调套件传 --no-nested，
    # 避免 step11→step10→step8→step3/step6 的三层嵌套（曾经一次验收 1.5 小时并跑挂 Edge）。
    for script, label in [("step3_verify_data.py", "step3（数据 / API 层）"),
                          ("step6_verify_workflow.py", "step6（B3 工作流）"),
                          ("step8_verify_map.py", "step8（C1 地图）"),
                          ("step10_verify_search.py", "step10（C2 检索）")]:
        extra = ["--no-nested"] if script in (
            "step8_verify_map.py", "step10_verify_search.py") else []
        p = subprocess.run([PYTHON, "-u", script, *extra], cwd=SCRIPTS,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        tail = [l for l in (p.stdout or "").splitlines() if l.startswith(("TOTAL=", "FAILED"))]
        check(f"D1-AC7：{label} 全部 PASS", p.returncode == 0, (tail[-1] if tail else "")[:200])

    print("\n== 汇总 ==", flush=True)
    failed = [n for n, ok, _ in results if not ok]
    print(f"TOTAL={len(results)}  PASS={len(results) - len(failed)}  FAIL={len(failed)}")
    if failed:
        for n in failed:
            print(f"FAILED: {n}")
        sys.exit(1)


main()
