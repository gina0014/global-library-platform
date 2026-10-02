"""============================================================
Step 4 — 前台浏览器验证（AC1 / AC2 / AC3 / AC6 + 回归）

使用真实浏览器（Edge headless + CDP）：
  一次启动一个浏览器实例，按阶段开多个标签页取渲染后的可见文本。
阶段划分（每个阶段一次浏览器启动）：
  A api 模式   → AC6 基线 / AC3 / 回归 / AC2 前基线
  B json 模式  → AC6 对照组
  C api + 移除 data/libraries.json → AC1
  D api + 写入测试值               → AC2 新值
  E api + 已还原                   → AC2 原值

对数据文件与 data-loader.js 的临时改动均在 finally 中还原，并校验 md5。
输出：dynamic-mvp/evidence/*.txt
============================================================"""

import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]   # 站点根目录
SCRIPTS = ROOT / "dynamic-mvp" / "scripts"
EVIDENCE = ROOT / "dynamic-mvp" / "evidence"
DATA = ROOT / "data"
LOADER = ROOT / "js" / "data-loader.js"
NODE = r"C:\Users\86132\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
PYTHON = r"C:\Users\86132\.workbuddy\binaries\python\versions\3.13.12\python.exe"

BASE = "http://localhost:8000"
AC2_TEST_VALUE = "AC2-TEST-动态写入验证"
LIB1 = f"{BASE}/pages/library.html?id=1"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)
    return ok


def md5(path):
    return hashlib.md5(pathlib.Path(path).read_bytes()).hexdigest()


def run_suite(tasks, wait_default=4500):
    """启动一次浏览器，按 tasks 顺序开标签页取文本；返回 {tag: (text, errors)}。"""
    for t in tasks:
        t.setdefault("wait", wait_default)
    tasks_path = EVIDENCE / "_tasks.json"
    tasks_path.write_text(json.dumps(tasks, ensure_ascii=False), encoding="utf-8")
    subprocess.run(
        [NODE, "browser_suite.mjs", str(tasks_path), str(EVIDENCE)],
        capture_output=True, text=True, cwd=SCRIPTS, encoding="utf-8", errors="replace",
    )
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


def current_mode():
    s = LOADER.read_text(encoding="utf-8", newline="")
    m = re.search(r'const DATA_SOURCE_MODE = "(api|json)";', s)
    if not m:
        raise SystemExit("[FATAL] 未找到 DATA_SOURCE_MODE 常量")
    return m.group(1)


def set_mode(mode):
    """切换 data-loader.js 的 DATA_SOURCE_MODE（api / json）。二进制读写，绝不改变换行符。"""
    if current_mode() == mode:
        return  # 已是目标模式，幂等
    s = LOADER.read_text(encoding="utf-8", newline="")
    s2 = re.sub(r'const DATA_SOURCE_MODE = "(?:api|json)";',
                f'const DATA_SOURCE_MODE = "{mode}";', s)
    if s2 == s:
        raise SystemExit("[FATAL] 未能切换 DATA_SOURCE_MODE")
    with open(LOADER, "w", encoding="utf-8", newline="") as f:
        f.write(s2)
    if current_mode() != mode:
        raise SystemExit("[FATAL] 切换后校验失败")


def ac2_write():
    p = subprocess.run([PYTHON, "step3_verify_data.py", "--ac2-write"],
                       cwd=SCRIPTS, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.stdout + p.stderr


def ac2_restore():
    p = subprocess.run([PYTHON, "step3_verify_data.py", "--ac2-restore"],
                       cwd=SCRIPTS, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.stdout + p.stderr


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    loader_md5_before = md5(LOADER)
    libs_md5_before = md5(DATA / "libraries.json")
    libs_mtime_before = (DATA / "libraries.json").stat().st_mtime

    # 无论上一轮是否异常中断，开始前强制复位为 api 模式
    set_mode("api")
    if current_mode() != "api":
        raise SystemExit("[FATAL] 起始模式不是 api")

    # ---------- 阶段 A：api 模式（AC6 基线 / AC3 / 回归 / AC2 前基线） ----------
    print("\n== 阶段 A：api 模式 ==", flush=True)
    a = run_suite([
        {"tag": "ac6_api_mode", "url": LIB1},
        {"tag": "ac2_baseline", "url": LIB1},
        {"tag": "ac3_pending_18", "url": f"{BASE}/pages/library.html?id=18"},
        {"tag": "ac3_draft_23", "url": f"{BASE}/pages/library.html?id=23"},
        {"tag": "ac3_libraries_list", "url": f"{BASE}/pages/libraries.html"},
        {"tag": "ac3_search_draft", "url": f"{BASE}/pages/search.html?q=基斯塔"},
        {"tag": "ac3_bad_id", "url": f"{BASE}/pages/library.html?id=99999"},
        {"tag": "reg_home", "url": f"{BASE}/index.html"},
        {"tag": "reg_world_map", "url": f"{BASE}/pages/world-map.html"},
        {"tag": "reg_country_1", "url": f"{BASE}/pages/country.html?id=1"},
        {"tag": "reg_awards", "url": f"{BASE}/pages/awards.html"},
    ])

    # ---------- 阶段 B：json 模式（AC6 对照组） ----------
    print("\n== 阶段 B：json 模式（对照组） ==", flush=True)
    try:
        set_mode("json")
        b = run_suite([{"tag": "ac6_json_mode", "url": LIB1}])
    finally:
        set_mode("api")
    check("data-loader.js 已还原为 api 模式", md5(LOADER) == loader_md5_before)

    api_text, api_err = a["ac6_api_mode"]
    json_text, _ = b["ac6_json_mode"]
    check("AC6：Library Profile 渲染文本与迁移前（JSON 源）逐字一致",
          bool(api_text) and api_text == json_text,
          f"len_api={len(api_text)} len_json={len(json_text)}")
    check("AC6：api 模式控制台无错误", not api_err, str(api_err)[:120])
    base_text, base_err = a["ac2_baseline"]
    check("AC6：URL 仍为 ?id= 且页面区块齐全",
          all(k in api_text for k in ["Quick Facts", "Overview", "Awards", "Sources"])
          and "Library Not Found" not in api_text)

    # ---------- AC3 ----------
    print("\n== AC3：draft / pending 不公开 ==", flush=True)
    check("AC3：pending Library（id=18）落到 Not Found",
          "Library Not Found" in a["ac3_pending_18"][0])
    check("AC3：draft Library（id=23）落到 Not Found",
          "Library Not Found" in a["ac3_draft_23"][0])
    lst = a["ac3_libraries_list"][0]
    check("AC3：Libraries 列表不含 pending / draft 记录名称",
          "马尔克斯" not in lst and "基斯塔" not in lst)
    s = a["ac3_search_draft"][0]
    check("AC3：全站搜索 draft 记录无结果",
          ("基斯塔" not in s) or ("No results" in s) or ("no results" in s.lower()))
    check("回归：非法 ID → Not Found", "Library Not Found" in a["ac3_bad_id"][0])

    # ---------- 阶段 C：AC1（移除静态 JSON） ----------
    print("\n== 阶段 C：AC1（移除 data/libraries.json） ==", flush=True)
    try:
        (DATA / "libraries.json").rename(DATA / "libraries.json.ac1tmp")
        c = run_suite([{"tag": "ac1_no_json", "url": LIB1}])
    finally:
        tmp = DATA / "libraries.json.ac1tmp"
        if tmp.exists():
            tmp.rename(DATA / "libraries.json")
    t_ac1 = c["ac1_no_json"][0]
    check("AC1：删除静态 JSON 后页面仍正常渲染（数据来自 API）",
          "上海图书馆" in t_ac1 and "Library Not Found" not in t_ac1,
          t_ac1.splitlines()[0][:40] if t_ac1 else "空")
    check("AC1：libraries.json 已还原且内容不变",
          md5(DATA / "libraries.json") == libs_md5_before)

    # ---------- 阶段 D / E：AC2 ----------
    print("\n== 阶段 D / E：AC2 写入 → 前台 → 还原 ==", flush=True)
    log_w = ac2_write()
    d = run_suite([{"tag": "ac2_after_write", "url": LIB1}])
    t_write = d["ac2_after_write"][0]
    check("AC2：刷新前台即显示新值（未重新生成 JSON）",
          AC2_TEST_VALUE in t_write, (t_write.splitlines()[1][:40] if len(t_write.splitlines()) > 1 else ""))
    check("AC2：data/libraries.json 修改时间未被改动",
          (DATA / "libraries.json").stat().st_mtime == libs_mtime_before)

    log_r = ac2_restore()
    e = run_suite([{"tag": "ac2_after_restore", "url": LIB1}])
    t_restore = e["ac2_after_restore"][0]
    check("AC2：测试值已还原（页面回到原始值）",
          AC2_TEST_VALUE not in t_restore and "中国 · 上海" in t_restore)
    (EVIDENCE / "ac2_write_restore.log").write_text(
        "=== WRITE ===\n" + log_w + "\n=== RESTORE ===\n" + log_r, encoding="utf-8")

    # ---------- 回归 ----------
    print("\n== 回归 ==", flush=True)
    check("回归：首页正常渲染",
          len(a["reg_home"][0]) > 200 and "Library Not Found" not in a["reg_home"][0])
    check("回归：World Map 正常渲染（坐标仍为数值）",
          len(a["reg_world_map"][0]) > 200 and "NaN" not in a["reg_world_map"][0])
    check("回归：Country 页正常显示国家名", "中国" in a["reg_country_1"][0])
    check("回归：Awards 页（仍读 JSON）正常渲染", len(a["reg_awards"][0]) > 200)
    check("回归：Library 页控制台无错误", not base_err, str(base_err)[:120])

    print("\n== 汇总 ==", flush=True)
    failed = [n for n, ok, _ in results if not ok]
    print(f"TOTAL={len(results)}  PASS={len(results) - len(failed)}  FAIL={len(failed)}")
    if failed:
        print("FAILED ITEMS: " + ", ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
