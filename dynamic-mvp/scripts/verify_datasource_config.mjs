/* ============================================================
   verify_datasource_config.mjs — 数据源运行时配置的策略矩阵校验

   为什么需要它：
     api / json 的选择现在由 hostname + protocol 在运行时决定，
     光看源码无法证明"GitHub Pages 上一定落到 json"。
     这里用伪造的 window.location 把 js/config.js 逐条跑一遍，
     把"部署行为"变成可回归的断言。

   不连接任何网络、不启动浏览器、不需要 Docker —— 因此可直接进 CI。
   ============================================================ */
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ROOT = path.resolve(HERE, "..", "..");
const CONFIG_URL = pathToFileURL(path.join(ROOT, "js", "config.js")).href;

const results = [];
let caseNo = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

/** 用伪造的 location 重新加载 config.js（ESM 有缓存，用查询串击穿） */
async function resolveWith({ hostname, protocol = "https:", search = "" }) {
  caseNo += 1;
  globalThis.window = {
    location: {
      hostname,
      protocol,
      search,
      href: `${protocol}//${hostname}/${search}`
    }
  };
  const mod = await import(`${CONFIG_URL}?case=${caseNo}`);
  return mod.resolveDataSource();
}

function label(r) {
  return `mode=${r.mode} api=${r.apiBaseUrl ?? "none"} (${r.reason})`;
}

async function main() {
  // ---------- 1. 本地动态开发：必须走 API ----------
  for (const host of ["localhost", "127.0.0.1"]) {
    const r = await resolveWith({ hostname: host, protocol: "http:" });
    check(`本地开发 ${host} → api 模式`,
      r.mode === "api" && r.apiBaseUrl === "http://localhost:8055", label(r));
  }
  // 双击打开文件（file://）没有后端可用 → 必须是 json，否则整站报错
  const fileRes = await resolveWith({ hostname: "", protocol: "file:" });
  check("file:// 直接打开 → json 静态演示（离线可读）",
    fileRes.mode === "json" && fileRes.apiBaseUrl === null, label(fileRes));

  // ---------- 2. Public Static Demo（GitHub Pages）：必须走 JSON ----------
  const ORIGINS = [
    ["gina0014.github.io", "https:"],
    ["gina0014.github.io", "http:"],
    ["example.org", "https:"],
    ["glp.example.edu", "https:"]
  ];
  for (const [host, proto] of ORIGINS) {
    const r = await resolveWith({ hostname: host, protocol: proto });
    check(`公开静态演示 ${host} (${proto}) → json 模式且无 api 地址`,
      r.mode === "json" && r.apiBaseUrl === null, label(r));
  }

  // ---------- 3. QA 覆写：?datasource=json ----------
  const forcedJson = await resolveWith({
    hostname: "localhost", protocol: "http:", search: "?datasource=json"
  });
  check("localhost + ?datasource=json → json 模式",
    forcedJson.mode === "json" && forcedJson.apiBaseUrl === null, label(forcedJson));

  // ---------- 4. HTTPS 护栏：安全页面不得请求 http 接口 ----------
  const forcedApiOnHttps = await resolveWith({
    hostname: "gina0014.github.io", protocol: "https:", search: "?datasource=api"
  });
  check("HTTPS 页面被强制 api 时被护栏降级为 json（无 mixed content）",
    forcedApiOnHttps.mode === "json" && forcedApiOnHttps.apiBaseUrl === null,
    label(forcedApiOnHttps));

  // ---------- 5. 静态契约：默认策略必须是 json ----------
  const base = await import(`${CONFIG_URL}?case=static`);
  check("DEFAULT_DATASOURCE.mode 恒为 \"json\"（未知来源底线）",
    base.DEFAULT_DATASOURCE.mode === "json", JSON.stringify(base.DEFAULT_DATASOURCE));
  check("DEFAULT_DATASOURCE 不带 api 地址",
    base.DEFAULT_DATASOURCE.apiBaseUrl === null);

  const targets = base.DATASOURCE_TARGETS.map((t) => t.id);
  check("部署目标表不含 production 条目（PHASE 2 前禁止预填）",
    !targets.includes("production"), JSON.stringify(targets));

  // ---------- 6. 硬编码回归：源码里不许再出现写死的 mode / baseUrl ----------
  const cfgSrc = fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8");
  const loaderSrc = fs.readFileSync(path.join(ROOT, "js", "data-loader.js"), "utf8");
  check("data-loader.js 不再出现 DATA_SOURCE_MODE 常量",
    !loaderSrc.includes("DATA_SOURCE_MODE"));
  check("data-loader.js 不再硬编码 localhost 地址",
    !loaderSrc.includes("localhost"));
  check("config.js 中 localhost 只出现在唯一的本地目标表里",
    (cfgSrc.match(/localhost:8055/g) || []).length === 1);

  const pagesNoTurnary = ["js/home.js", "js/libraries.js", "js/ask-ai.js", "js/search.js"]
    .filter((f) => fs.existsSync(path.join(ROOT, f)))
    .every((f) => !fs.readFileSync(path.join(ROOT, f), "utf8").includes("localhost"));
  check("页面脚本不出现 localhost 地址", pagesNoTurnary);

  const total = results.length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\nTOTAL=${total}  PASS=${total - failed.length}  FAIL=${failed.length}`);
  if (failed.length) {
    console.log("\nFAILED:");
    for (const f of failed) console.log("  - " + f.name);
    process.exit(1);
  }
  console.log("DATASOURCE CONFIG OK");
}

main().catch((e) => {
  console.error("[FATAL]", e && e.message ? e.message : e);
  process.exit(1);
});
