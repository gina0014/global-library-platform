# -*- coding: utf-8 -*-
"""============================================================
D2-AC3 / D2-AC4：质量门的「可控错误」验证

目的：证明这套检查不是在"无论如何都 PASS"。
做法：
  1) 先跑一次 --scope static，确认基线全绿；
  2) 向 data/*.json 注入两个彼此独立的受控错误（改前自动备份）；
  3) 再跑一次，要求至少一项检查 FAIL（并打印是哪些）；
  4) 立即还原（从备份写回，并校验与 git HEAD 逐字节一致）；
  5) 最后一次运行必须回到全绿。

注入的错误是故意选在最核心的两条不变量上：
  - UNIQUE：给 award-results.json 追加一条与既有记录复合键完全相同的行
  - Source 溯源：给 sources.json 里一条真来源换成一个非 http(s) 的伪造 URL
两者都只改数据副本，不影响数据库，且全程在同一进程内还原。
============================================================"""

import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
SCRIPTS = ROOT / "dynamic-mvp" / "scripts"
LOG = ROOT / "dynamic-mvp" / "evidence" / "d2_ac3.log"

AR_F = DATA / "award-results.json"
SRC_F = DATA / "sources.json"

out = []


def say(s):
    print(s, flush=True)
    out.append(s)


def run_static():
    p = subprocess.run([sys.executable, "-u", "ci_check.py", "--scope", "static"],
                       cwd=SCRIPTS, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    lines = (p.stdout or "").splitlines()
    fails = [l for l in lines if l.startswith("[FAIL]")]
    total = next((l for l in lines if l.startswith("TOTAL=")), "TOTAL=?")
    return p.returncode, fails, total


def main():
    LOG.parent.mkdir(parents=True, exist_ok=True)

    say("== 步骤 1：基线运行（注入前） ==")
    rc0, fails0, total0 = run_static()
    say(f"exit={rc0}  {total0}  FAIL={len(fails0)}")
    if rc0 != 0:
        say("基线就不是全绿，中止：先修基线再谈注入。")
        LOG.write_text("\n".join(out), encoding="utf-8")
        sys.exit(1)

    orig_ar = AR_F.read_bytes()
    orig_src = SRC_F.read_bytes()

    say("\n== 步骤 2：注入受控错误 ==")
    rows = json.loads(orig_ar.decode("utf-8"))
    clone = dict(rows[0])
    clone["award_result_id"] = 999999  # 主键不冲突 → 只可能踩复合 UNIQUE
    rows.append(clone)
    AR_F.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    srcs = json.loads(orig_src.decode("utf-8"))
    say(f"注入 A：award-results 追加复合 UNIQUE 重复行 -> "
        f"({clone['award_id']}, {clone['library_id']}, {clone['year']}, "
        f"{clone['category']}, {clone['result_type']})")
    victim = next(s for s in srcs if s.get("url"))
    old_url = victim["url"]
    victim["url"] = "ftp://example.invalid/fabricated-source"
    SRC_F.write_text(json.dumps(srcs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    say(f"注入 B：source {victim['source_id']} 的 URL 改成非 http(s) 的伪造地址 -> {victim['url']}")

    say("\n== 步骤 3：带错误运行（期望至少一项 FAIL） ==")
    rc1, fails1, total1 = run_static()
    say(f"exit={rc1}  {total1}  FAIL={len(fails1)}")
    for f in fails1:
        say("  " + f)

    say("\n== 步骤 4：还原 ==")
    AR_F.write_bytes(orig_ar)
    SRC_F.write_bytes(orig_src)
    restored = (AR_F.read_bytes() == orig_ar) and (SRC_F.read_bytes() == orig_src)
    git = subprocess.run(["git", "diff", "--stat", "--", "data/award-results.json", "data/sources.json"],
                         cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    say(f"文件已写回原值={restored}  git diff 为空={not (git.stdout or '').strip()}")

    say("\n== 步骤 5：还原后运行（期望全绿） ==")
    rc2, fails2, total2 = run_static()
    say(f"exit={rc2}  {total2}  FAIL={len(fails2)}")
    for f in fails2:
        say("  " + f)

    verdict = (rc1 != 0 and len(fails1) >= 1 and rc2 == 0 and restored)
    say("\n== 判定 ==")
    say(f"D2-AC3：注入错误后质量门 FAIL -> {'PASS' if rc1 != 0 else 'FAIL'}")
    say(f"D2-AC4：还原后质量门全绿     -> {'PASS' if rc2 == 0 else 'FAIL'}")
    say(f"D2-AC3 总判定：{'PASS' if verdict else 'FAIL'}")

    LOG.write_text("\n".join(out), encoding="utf-8")
    sys.exit(0 if verdict else 1)


main()
