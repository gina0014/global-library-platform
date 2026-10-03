"""============================================================
Step 9 — C2.1 检索能力评估（只读）

目的：在引入任何新服务之前，先用数据回答
      「Directus REST 检索能否满足现有搜索页需求」。

对比两种方式与「当前 JSON baseline 客户端检索」的结果集合：
  方式 A  ?search=<q>                     Directus 内置全字段检索
  方式 B  filter[_or][<field>][_icontains]  逐字段 icontains（与客户端 haystack 对齐）

评测维度：英文 / 中文 / 部分关键词 / 特殊字符 / 空查询 / 超长查询。
期望集合 = 客户端 searchAllUpgraded 的字段口径 + 治理规则（published-only + 父子一致性）。

本脚本只读：不写库、不改 JSON、不建索引。
============================================================"""

import json
import pathlib
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
EVIDENCE = ROOT / "dynamic-mvp" / "evidence"
API = "http://localhost:8055"

# 与 js/utils.js COUNTRY_ALIASES 一致（查询解析层，不写入数据）
COUNTRY_ALIASES = [
    ("CN", ["china", "chinese", "中国"]),
    ("US", ["usa", "united states", "america", "美国"]),
    ("DK", ["denmark", "danish", "丹麦"]),
    ("ES", ["spain", "spanish", "西班牙"]),
    ("FI", ["finland", "finnish", "芬兰"]),
    ("NO", ["norway", "norwegian", "挪威"]),
    ("CA", ["canada", "canadian", "加拿大"]),
    ("NL", ["netherlands", "holland", "dutch", "荷兰"]),
    ("SE", ["sweden", "swedish", "瑞典"]),
    ("AU", ["australia", "australian", "澳大利亚"]),
]

QUERIES = [
    ("english-name", "Shanghai"),
    ("english-word", "library"),
    ("english-alias", "Denmark"),
    ("chinese-full", "图书馆"),
    ("chinese-partial", "图书"),
    ("chinese-city", "上海"),
    ("chinese-country-alias", "丹麦"),
    ("chinese-topic", "设计"),
    ("source-term", "IFLA"),
    ("special-percent", "%"),
    ("special-quote", "'"),
    ("special-star", "***"),
    ("special-bracket", "("),
    ("empty", ""),
    ("long", "图" * 300),
]

# 与客户端 haystack 对齐的字段口径
FIELDS = {
    "country": (["country_name", "country_code"], "country_id"),
    "library": (["name", "name_en", "city"], "library_id"),
    "award": (["award_name", "organizer"], "award_id"),
    "case_project": (["title", "description"], "case_id"),
    "source": (["title", "source_name", "publisher"], "source_id"),
}


def api(path):
    with urllib.request.urlopen(API + path, timeout=30) as r:
        return json.load(r)["data"]


def icontains_url(collection, fields, q):
    parts = []
    for i, f in enumerate(fields):
        parts.append(
            f"filter[_or][{i}][{f}][_icontains]={urllib.parse.quote(q)}"
        )
    return f"/items/{collection}?limit=-1&" + "&".join(parts)


def search_url(collection, q):
    return f"/items/{collection}?limit=-1&search={urllib.parse.quote(q)}"


def expected_sets(keyword, data):
    """复刻客户端 searchAllUpgraded 的字段口径 + 治理规则。"""
    kw = keyword.strip().lower()
    out = {c: set() for c in FIELDS}
    if not kw:
        return out

    countries = {c["country_id"]: c for c in data["countries"] if c["status"] == "published"}
    libs = {l["library_id"]: l for l in data["libraries"] if l["status"] == "published"}

    alias_codes = {code for code, aliases in COUNTRY_ALIASES
                   if any(a in kw or kw in a for a in aliases)}
    matched_country_ids = set()

    for cid, c in countries.items():
        hay = [(c.get("country_name") or "").lower(), (c.get("country_code") or "").lower()]
        if c.get("country_code") in alias_codes or any(t and kw in t for t in hay):
            matched_country_ids.add(cid)
            out["country"].add(cid)

    for lid, l in libs.items():
        cn = countries.get(l.get("country_id"), {})
        hay = [(l.get("name") or "").lower(), (l.get("name_en") or "").lower(),
               (l.get("city") or "").lower(), (cn.get("country_name") or "").lower()]
        if l.get("country_id") in matched_country_ids or any(t and kw in t for t in hay):
            out["library"].add(lid)

    for a in data["awards"]:
        if a["status"] != "published":
            continue
        hay = [(a.get("award_name") or "").lower(), (a.get("organizer") or "").lower()]
        if any(t and kw in t for t in hay):
            out["award"].add(a["award_id"])

    for cs in data["cases"]:
        if cs["status"] != "published":
            continue
        parent = libs.get(cs.get("library_id"))
        if not parent:
            continue  # 父子一致性：父 Library 非 published 则不可见
        hay = [(cs.get("title") or "").lower(), (cs.get("description") or "").lower()]
        if any(t and kw in t for t in hay):
            out["case_project"].add(cs["case_id"])

    for s in data["sources"]:
        if s["status"] != "published":
            continue
        hay = [(s.get("title") or "").lower(), (s.get("source_name") or "").lower(),
               (s.get("publisher") or "").lower()]
        if any(t and kw in t for t in hay):
            out["source"].add(s["source_id"])

    return out


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    data = {
        "countries": json.loads((DATA / "countries.json").read_text(encoding="utf-8")),
        "libraries": json.loads((DATA / "libraries.json").read_text(encoding="utf-8")),
        "awards": json.loads((DATA / "awards.json").read_text(encoding="utf-8")),
        "cases": json.loads((DATA / "cases.json").read_text(encoding="utf-8")),
        "sources": json.loads((DATA / "sources.json").read_text(encoding="utf-8")),
    }

    report = []
    for label, q in QUERIES:
        exp = expected_sets(q, data)
        row = {"query": label, "value": q[:40], "expected": {k: len(v) for k, v in exp.items()}}
        for mode, builder in (("A_search", search_url), ("B_icontains", icontains_url)):
            row[mode] = {}
            for coll, (fields, pk) in FIELDS.items():
                url = builder(coll, fields, q) if mode == "B_icontains" else builder(coll, q)
                try:
                    got = {r[pk] for r in api(url)}
                except Exception as e:  # noqa: BLE001
                    row[mode][coll] = {"error": str(e)[:120]}
                    continue
                e = exp[coll]
                row[mode][coll] = {
                    "count": len(got),
                    "expected": len(e),
                    "missing": len(e - got),
                    "extra": len(got - e),
                    "exact": got == e,
                }
        report.append(row)

    (EVIDENCE / "c2_search_assessment.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("== C2.1 检索能力评估 ==")
    print(f"{'query':22} {'coll':13} {'exp':>4} {'A:got/mis/ext':>16} {'B:got/mis/ext':>16}")
    exact_a = exact_b = total = 0
    for row in report:
        for coll in FIELDS:
            a = row["A_search"][coll]
            b = row["B_icontains"][coll]
            total += 1
            exact_a += bool(a.get("exact"))
            exact_b += bool(b.get("exact"))
            av = f"{a.get('count','?')}/{a.get('missing','?')}/{a.get('extra','?')}"
            bv = f"{b.get('count','?')}/{b.get('missing','?')}/{b.get('extra','?')}"
            print(f"{row['query']:22} {coll:13} {row['expected'][coll]:>4} {av:>16} {bv:>16}")
    print()
    print(f"方式 A（?search=）       与 JSON baseline 完全一致: {exact_a}/{total}")
    print(f"方式 B（逐字段 _icontains） 与 JSON baseline 完全一致: {exact_b}/{total}")
    print(f"证据: {EVIDENCE / 'c2_search_assessment.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
