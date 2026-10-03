# -*- coding: utf-8 -*-
"""============================================================
step12 — Public Static Demo 验收（PHASE 1）

两种运行方式：
  1) 上线前本地模拟：--base http://localhost:8000 --force-json
     （用 ?datasource=json 强制走 JSON，等价于 GitHub Pages 上的行为）
  2) 上线后真实公网校验：
     --base https://gina0014.github.io/global-library-platform

检查项（PHASE 1 要求）：
  · 11 个页面可打开且渲染出真实数据
  · 数据源确为 json 模式（不是悄悄退回 localhost API）
  · 无 localhost / 内网地址请求
  · HTTPS 页面上无 http:// 子资源（无 mixed content）
  · Console 无 serious error
  · 页面文本中无 secret 特征（token / password）
============================================================"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "dynamic-mvp" / "scripts"
EVIDENCE = ROOT / "dynamic-mvp" / "evidence"
NODE = "node"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)
    return ok


# 页面所需 Reads：由 data/*.json 现算，避免写死期望值
def read_first(fname, keys):
    rows = json.loads((ROOT / "data" / fname).read_text(encoding="utf-8"))
    pub = [r for r in rows if r.get("status") == "published"]
    return {k: pub[0].get(k) for k in keys}


LIB = read_first("libraries.json", ["library_id", "name"])
CTRY = read_first("countries.json", ["country_id", "country_name"])
AWD = read_first("awards.json", ["award_id", "award_name"])
CASE = read_first("cases.json", ["case_id", "title"])

PAGE_EXPR = """
(async () => {
  const main = document.getElementById('page-main');
  const text = (main ? main.innerText : document.body.innerText)
    .replace(/\\n{2,}/g, '\\n').trim();
  const ds = window.__GLP_DATASOURCE__ || {};
  const resources = performance.getEntriesByType('resource')
    .map(r => r.name)
    .filter(n => !/^(data:|blob:|about:)/.test(n));
  // 页面自身的 css/js/图片是同源的，是"站点自己"；真正要拦的是**跨源**请求。
  // （本地模拟时 base 本身就是 localhost:8000，不排除同源会把自身资源误判为内网请求）
  const same = new Set([location.origin, 'null']);
  const cross = resources.filter(n => {
    try { return !same.has(new URL(n, location.href).origin); }
    catch { return true; }
  });
  return JSON.stringify({
    text,
    mode: ds.mode || 'unknown',
    id: ds.id || 'unknown',
    reason: ds.reason || '',
    protocol: location.protocol,
    origin: location.origin,
    resources,
    cross
  });
})()
"""


def q(url, extra):
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}{extra}" if extra else url


def build_tasks(base, force_json):
    extra = "datasource=json" if force_json else None
    # 注：本项目没有 Countries 列表页，唯一的国家页面即国家详情页 country.html，
    # 因此 brief 里的 "Countries" 落到这里（见 IMPLEMENTATION-008.md §已知差异）。
    pages = [
        ("home", "index.html", None),
        ("libraries", "pages/libraries.html", None),
        ("library_profile", f"pages/library.html?id={LIB['library_id']}", LIB["name"]),
        ("countries", f"pages/country.html?id={CTRY['country_id']}", CTRY["country_name"]),
        ("awards", "pages/awards.html", None),
        ("award_profile", f"pages/award.html?id={AWD['award_id']}", AWD["award_name"]),
        ("cases", "pages/cases.html", None),
        ("case_detail", f"pages/case.html?id={CASE['case_id']}", CASE["title"]),
        ("world_map", "pages/world-map.html", None),
        ("search", "pages/search.html?q=library", None),
        ("ask_ai", "pages/ask-ai.html", None),
        ("about", "pages/about.html", None),
    ]
    return [
        {"tag": tag, "url": q(f"{base}/{path}", extra), "expr": PAGE_EXPR,
         "wait": 6500, "exprTimeout": 45000}
        for tag, path, _ in pages
    ], pages


SECRET_RE = re.compile(r"(?i)(bearer\s+[A-Za-z0-9\-\._~+/]{20,}|gh[pousr]_[A-Za-z0-9]{16,}|"
                       r"-----BEGIN [A-Z]*PRIVATE KEY-----|(api[_-]?key|secret|password)\s*[:=]\s*\S{8,})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--force-json", action="store_true",
                    help="本地模拟 Public Demo：给每个 URL 附加 ?datasource=json")
    ap.add_argument("--expect-mode", default="json")
    args = ap.parse_args()

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    tasks, pages = build_tasks(args.base, args.force_json)
    print(f"== Public Demo 验收 base={args.base} force-json={args.force_json} ==", flush=True)

    tasks_path = EVIDENCE / "_public_demo_tasks.json"
    tasks_path.write_text(json.dumps(tasks, ensure_ascii=False), encoding="utf-8")
    subprocess.run([NODE, "browser_suite.mjs", str(tasks_path), str(EVIDENCE)],
                   cwd=SCRIPTS, capture_output=True, text=True,
                   encoding="utf-8", errors="replace")

    parsed = {}
    for t, expected in [(t["tag"], m) for t, (_, _, m) in zip(tasks, pages)]:
        f = EVIDENCE / f"{t}.txt"
        raw = f.read_text(encoding="utf-8", errors="replace") if f.exists() else ""
        errors = []
        if "CONSOLE_ERRORS=" in raw:
            body, tail = raw.split("CONSOLE_ERRORS=", 1)
            errors = tail.strip()
        else:
            body = raw
        body = body.strip()
        data = {}
        try:
            data = json.loads(body)
        except Exception:
            data = {"text": body, "mode": "unparsable", "resources": [], "protocol": ""}
        parsed[t] = {"data": data, "errors": errors, "expected": expected}

    # ---------- 1. 每页：可打开 / 有数据 / 无错误态 ----------
    for tag, info in parsed.items():
        text = info["data"].get("text", "")
        check(f"{tag}：页面渲染出内容", len(text) > 80, f"{len(text)} chars")
        check(f"{tag}：未落到加载失败状态", "Unable to load platform data." not in text)
        check(f"{tag}：不是空结果页且无 Not Found 误命中",
              "Not Found" not in text.split("\n")[0], (text.split("\n") or [""])[0][:60])

    # ---------- 2. 每页：真实 JSON 数据显示 ----------
    for tag, info in parsed.items():
        expected = info["expected"]
        if not expected:
            continue
        check(f"{tag}：显示了 JSON baseline 中的实体（{expected[:24]}）",
              expected in info["data"].get("text", ""))

    # ---------- 3. 数据源必须是 json ----------
    for tag, info in parsed.items():
        check(f"{tag}：数据源为 {args.expect_mode} 模式",
              info["data"].get("mode") == args.expect_mode,
              f"mode={info['data'].get('mode')} id={info['data'].get('id')}")

    # ---------- 4. 无跨源 localhost / 内网 / 后端请求 ----------
    INTERNAL_RE = re.compile(r"//(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?")
    for tag, info in parsed.items():
        res = info["data"].get("cross", []) or []
        bad = [r for r in res if INTERNAL_RE.search(r)]
        check(f"{tag}：无跨源 localhost / 内网请求", not bad, str(bad[:2]))

    for tag, info in parsed.items():
        res = (info["data"].get("resources", []) or [])
        bad = [r for r in res if ":8055" in r]
        check(f"{tag}：未请求后端 8055 端口", not bad, str(bad[:2]))

    # ---------- 5. 无 mixed content ----------
    for tag, info in parsed.items():
        if info["data"].get("protocol") != "https:":
            continue
        res = info["data"].get("resources", []) or []
        insecure = [r for r in res if r.startswith("http://")]
        check(f"{tag}：HTTPS 页面无 http:// 子资源（无 mixed content）",
              not insecure, str(insecure[:2]))

    # ---------- 6. Console 无 serious error ----------
    for tag, info in parsed.items():
        err = info["errors"] or ""
        serious = err and '"ERROR"' in err.upper() or "exceptionThrown" in err
        check(f"{tag}：Console 无 serious error", not serious, err[:140])

    # ---------- 7. 页面文本无 secret 特征 ----------
    for tag, info in parsed.items():
        hit = SECRET_RE.search(info["data"].get("text", "") or "")
        check(f"{tag}：渲染文本无 secret 特征", not hit, (hit.group(0)[:40] if hit else ""))

    total = len(results)
    failed = [r for r in results if not r[1]]
    print(f"\nTOTAL={total}  PASS={total - len(failed)}  FAIL={len(failed)}")
    if failed:
        print("\nFAILED:")
        for name, _, detail in failed[:20]:
            print(f"  - {name} {detail}")
        sys.exit(1)
    print("PUBLIC DEMO OK")


if __name__ == "__main__":
    main()
