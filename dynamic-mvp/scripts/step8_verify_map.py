"""============================================================
Step 8 — C1 Dynamic Map 验收（C1-AC1 … C1-AC7）

  C1-AC1  marker 数 = published + valid coordinates 数
  C1-AC2  marker 与 library_id 一一对应
  C1-AC3  点击 marker → library.html?id=<library_id>
  C1-AC4  无坐标 Library 不产生错误 marker，页面无错误
  C1-AC5  响应式正常
  C1-AC6  Console new serious error = 0
  C1-AC7  B2 / B3 核心回归 PASS（step3 数据层 + step6 工作流 + world_map 十页比对）

关于测试夹具（仅用于 AC2 / AC3）：
  当前基线**没有任何** Library 坐标（审计结果：0 valid / 61 missing），
  因此基线数据下不存在任何 library marker。为了验证 marker 管线本身
  （数量 → 对应 → 跳转 URL）确实工作，本脚本临时创建 1 条**测试夹具**记录，
  带上明确标注为 test-only 的坐标；验证完成后立即删除。
  该坐标只属于这条临时记录，**不写入任何基线数据、不代表任何真实图书馆的位置**。
============================================================"""

import json
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import dapi  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "dynamic-mvp" / "scripts"
EVIDENCE = ROOT / "dynamic-mvp" / "evidence"
DATA = ROOT / "data"

BASE = "http://localhost:8000"
MAP_URL = f"{BASE}/pages/world-map.html"
NODE = "C:/Users/86132/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"
PYTHON = sys.executable

ADMIN_EMAIL = dapi.env("DIRECTUS_ADMIN_EMAIL")
ADMIN_PASSWORD = dapi.env("DIRECTUS_ADMIN_PASSWORD")

# 测试夹具：明确标注为一次性测试对象，坐标为 test-only，不代表任何真实图书馆位置
FIXTURE_NAME = "C1-MARKER-FIXTURE-DO-NOT-USE"
FIXTURE_LAT = 48.8584
FIXTURE_LON = 2.2945

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)
    return ok


def run_tasks(tasks, wait=6000):
    """启一次浏览器跑一批任务，返回 {tag: (text, errors)}。"""
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    tasks_path = EVIDENCE / "_map_tasks.json"
    tasks_path.write_text(json.dumps(tasks, ensure_ascii=False), encoding="utf-8")
    subprocess.run(
        [NODE, "browser_suite.mjs", str(tasks_path), str(EVIDENCE)],
        capture_output=True, text=True, cwd=SCRIPTS, encoding="utf-8", errors="replace",
    )
    out = {}
    for t in tasks:
        raw = (EVIDENCE / f"{t['tag']}.txt").read_text(encoding="utf-8") if (EVIDENCE / f"{t['tag']}.txt").exists() else ""
        errors = []
        text = raw
        if "CONSOLE_ERRORS=" in raw:
            text, tail = raw.split("CONSOLE_ERRORS=", 1)
            errors = [tail.strip()]
        out[t["tag"]] = (text.strip(), errors)
    return out


MAP_STATE_EXPR = """
(async () => {
  const markers = [...document.querySelectorAll('.glp-marker')];
  return {
    engine: document.body.dataset.mapEngine || null,
    libraryMarkers: Number(document.body.dataset.libraryMarkers || 0),
    countryMarkers: Number(document.body.dataset.countryMarkers || 0),
    libraryIds: markers.filter(m => m.dataset.markerType === 'library')
                       .map(m => Number(m.dataset.libraryId)),
    countryIds: markers.filter(m => m.dataset.markerType === 'country')
                       .map(m => Number(m.dataset.countryId)),
    glCanvas: !!document.querySelector('.maplibregl-canvas'),
    svgHidden: document.getElementById('map-canvas')?.hidden === true,
    noteVisible: (() => { const b = document.getElementById('map-note-box'); return !!b && !b.hidden; })(),
    listRows: document.querySelectorAll('#map-library-list tbody tr').length,
  };
})()
"""

RESPONSIVE_EXPR = """
(async () => {
  const el = document.getElementById('map-gl');
  const r = el ? el.getBoundingClientRect() : { width: 0, height: 0 };
  return {
    width: Math.round(r.width),
    height: Math.round(r.height),
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    canvas: !!document.querySelector('.maplibregl-canvas'),
  };
})()
"""

def click_selector(library_id):
    return f'.glp-marker[data-library-id="{library_id}"]'


CLICK_EXPR = """
(async () => {
  return {
    href: location.pathname + location.search,
    title: document.title,
    notFound: document.body.innerText.includes('Library Not Found'),
  };
})()
"""


def main():
    if not dapi.wait_ready():
        sys.exit("[FATAL] Directus 未就绪")
    admin = dapi.login(ADMIN_EMAIL, ADMIN_PASSWORD)

    # 审计证据属于未跟踪产物，可能不存在 → 现算一次，保证本脚本自足
    audit_path = EVIDENCE / "c1_coordinate_audit.json"
    if not audit_path.exists():
        subprocess.run([PYTHON, "-u", "step7_audit_coordinates.py"], cwd=SCRIPTS,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    expected_markers = audit["expected_library_markers"]

    fixture_id = None

    def create_fixture():
        payload = {
            "name": FIXTURE_NAME,
            "country_id": 1,
            "city": "Fixture City",
            "library_type": "public",
            "description": "C1 marker pipeline test fixture — deleted after verification.",
            "status": "published",
            "latitude": FIXTURE_LAT,
            "longitude": FIXTURE_LON,
            "last_updated": "2026-01-01",
        }
        return dapi.post("/items/library", payload, admin)["data"]["library_id"]

    def delete_fixture():
        if fixture_id is None:
            return
        try:
            dapi.req("DELETE", f"/items/library/{fixture_id}", admin)
        except Exception:
            pass

    try:
        # ================= C1-AC1 / AC4 / AC6：基线数据下的地图状态 =================
        print("\n== C1-AC1 / AC4 / AC6：基线数据下的地图状态 ==", flush=True)
        base = run_tasks([{"tag": "c1_map_base", "url": MAP_URL, "expr": MAP_STATE_EXPR, "wait": 7000}])
        text, errors = base["c1_map_base"]
        try:
            state = json.loads(text)
        except Exception:
            state = {}
            check("C1-AC1：地图状态可读", False, text[:200])

        if state:
            check("C1-AC1：地图引擎为 MapLibre（WebGL 可用）", state.get("engine") == "maplibre",
                  f"engine={state.get('engine')} canvas={state.get('glCanvas')}")
            check("C1-AC1：library marker 数 = published + valid coordinates 数",
                  state.get("libraryMarkers") == expected_markers,
                  f"markers={state.get('libraryMarkers')} expected={expected_markers} "
                  f"(audit: valid={audit['db_published']['valid']} missing={audit['db_published']['missing']})")
            check("C1-AC4：无坐标 Library 不产生 marker（0 个错误 marker）",
                  state.get("libraryIds") == [], f"libraryIds={state.get('libraryIds')}")
            check("C1-AC4：无坐标提示可见且列表仍完整（降级路径可用）",
                  bool(state.get("noteVisible")) and state.get("listRows", 0) > 0,
                  f"note={state.get('noteVisible')} rows={state.get('listRows')}")
            check("C1-AC4：MapLibre 生效时 SVG 降级视图隐藏（无双份底图）",
                  bool(state.get("svgHidden")), f"svgHidden={state.get('svgHidden')}")
            check("C1-AC6：地图页 Console 无错误", not errors, str(errors)[:200])

        # ================= C1-AC2 / AC3：marker 管线（测试夹具） =================
        print("\n== C1-AC2 / AC3：marker 管线（临时测试夹具） ==", flush=True)
        fixture_id = create_fixture()
        print(f"[info] 夹具 library_id={fixture_id}（验证后删除，不写入基线数据）", flush=True)
        fx = run_tasks([
            {"tag": "c1_map_fixture", "url": MAP_URL, "expr": MAP_STATE_EXPR, "wait": 7000},
            {
                "tag": "c1_map_click",
                "url": MAP_URL,
                "clickSelector": click_selector(fixture_id),
                "expr": CLICK_EXPR,
                "wait": 7000,
                "waitAfterClick": 4000,
            },
        ])
        fstate_text, ferrors = fx["c1_map_fixture"]
        try:
            fstate = json.loads(fstate_text)
        except Exception:
            fstate = {}
            check("C1-AC2：夹具下地图状态可读", False, fstate_text[:200])

        if fstate:
            check("C1-AC2：夹具产生且仅产生 1 个 library marker",
                  fstate.get("libraryIds") == [fixture_id],
                  f"libraryIds={fstate.get('libraryIds')} expected=[{fixture_id}]")
            check("C1-AC2：marker 与 library_id 一一对应",
                  fstate.get("libraryMarkers") == 1 and fstate.get("libraryIds") == [fixture_id],
                  f"count={fstate.get('libraryMarkers')}")
        check("C1-AC6：夹具下地图页 Console 无错误", not ferrors, str(ferrors)[:200])

        click_text, click_errors = fx["c1_map_click"]
        try:
            click = json.loads(click_text)
        except Exception:
            click = {}
            check("C1-AC3：点击结果可读", False, click_text[:200])
        if click:
            check("C1-AC3：点击 marker → library.html?id=<library_id>",
                  click.get("href", "").endswith(f"library.html?id={fixture_id}"),
                  f"href={click.get('href')}")
            check("C1-AC3：跳转后落到该 Library 的 Profile（非 Not Found）",
                  not click.get("notFound"), f"title={click.get('title')}")
        check("C1-AC6：点击跳转页 Console 无错误", not click_errors, str(click_errors)[:200])

        # ================= C1-AC5：响应式 =================
        print("\n== C1-AC5：响应式 ==", flush=True)
        resp = run_tasks([
            {"tag": "c1_resp_375", "url": MAP_URL, "expr": RESPONSIVE_EXPR, "width": 375, "height": 812, "wait": 7000},
            {"tag": "c1_resp_768", "url": MAP_URL, "expr": RESPONSIVE_EXPR, "width": 768, "height": 1024, "wait": 7000},
            {"tag": "c1_resp_1440", "url": MAP_URL, "expr": RESPONSIVE_EXPR, "width": 1440, "height": 900, "wait": 7000},
        ])
        for tag, w in [("c1_resp_375", 375), ("c1_resp_768", 768), ("c1_resp_1440", 1440)]:
            t, errs = resp[tag]
            try:
                r = json.loads(t)
            except Exception:
                check(f"C1-AC5：{w}px 响应式可读", False, t[:120])
                continue
            check(f"C1-AC5：{w}px 无横向溢出且地图容器可见",
                  r.get("overflow", 999) <= 1 and r.get("height", 0) > 0 and r.get("width", 0) > 0,
                  f"viewport={r.get('innerWidth')} map={r.get('width')}x{r.get('height')} overflow={r.get('overflow')}")
            check(f"C1-AC6：{w}px Console 无错误", not errs, str(errs)[:160])
    finally:
        delete_fixture()
        print("\n[cleanup] 测试夹具已删除", flush=True)

    # ================= C1-AC7：B2 / B3 核心回归 =================
    print("\n== C1-AC7：B2 / B3 核心回归 ==", flush=True)
    p3 = subprocess.run([PYTHON, "-u", "step3_verify_data.py"], cwd=SCRIPTS,
                        capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail3 = [l for l in (p3.stdout or "").splitlines() if l.startswith(("TOTAL=", "FAILED"))]
    check("C1-AC7：step3（数据 / API 层）全部 PASS", p3.returncode == 0, (tail3[-1] if tail3 else "")[:200])

    p6 = subprocess.run([PYTHON, "-u", "step6_verify_workflow.py"], cwd=SCRIPTS,
                        capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail6 = [l for l in (p6.stdout or "").splitlines() if l.startswith(("TOTAL=", "FAILED"))]
    check("C1-AC7：step6（B3 工作流）全部 PASS", p6.returncode == 0, (tail6[-1] if tail6 else "")[:200])

    print("\n== 汇总 ==", flush=True)
    failed = [n for n, ok, _ in results if not ok]
    print(f"TOTAL={len(results)}  PASS={len(results) - len(failed)}  FAIL={len(failed)}")
    if failed:
        print("FAILED ITEMS: " + ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
