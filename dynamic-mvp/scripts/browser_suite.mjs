/* ============================================================
   真实浏览器批量验证（Edge/Chromium + CDP，单实例复用多标签页）

   为什么不用“每页启动一次浏览器”：
     本机 Edge 重复启动会争用 9222 端口与 user-data-dir，导致随机挂起。
     本脚本改为：启动 1 个实例 → 逐条 /json/new 开标签 → 取文本 → 关闭标签。

   用法：
     node browser_suite.mjs <tasks.json> <outDir>
     tasks.json: [{ "tag": "ac1", "url": "http://...", "wait": 4500 }, ...]
   输出：
     <outDir>/<tag>.txt  （可见文本 + 控制台错误）
     stdout: 每行 "<tag>\tOK\t<length>" 或 "<tag>\tEMPTY"
   ============================================================ */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9222;

const tasksFile = process.argv[2];
const outDir = process.argv[3];
if (!tasksFile || !outDir) process.exit("[usage] node browser_suite.mjs <tasks.json> <outDir>");

const tasks = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
fs.mkdirSync(outDir, { recursive: true });

const profileDir = path.resolve(".cdp-profile");
fs.rmSync(profileDir, { recursive: true, force: true });

const browser = spawn(
  EDGE,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return true;
    } catch {
      /* 未就绪 */
    }
    await sleep(300);
  }
  throw new Error("DevTools 未就绪");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function openTab(url) {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  if (!r.ok) throw new Error("openTab failed: " + r.status);
  return await r.json();
}

async function closeTab(id) {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/close/${id}`);
  } catch {
    /* ignore */
  }
}

const EXPR = `
  (async () => {
    const main = document.getElementById('page-main');
    return (main ? main.innerText : document.body.innerText).replace(/\\n{2,}/g, '\\n').trim();
  })()
`;

async function run() {
  await waitForDevtools();
  for (const t of tasks) {
    let text = "";
    let errors = [];
    let tabId = null;
    try {
      const tab = await openTab(t.url);
      tabId = tab.id;
      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      await new Promise((res, rej) => {
        ws.addEventListener("open", res, { once: true });
        ws.addEventListener("error", rej, { once: true });
        setTimeout(() => rej(new Error("ws timeout")), 10000);
      });
      const cdp = new Cdp(ws);
      ws.addEventListener("message", (ev) => {
        const m = JSON.parse(ev.data);
        if (m.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(m.params).slice(0, 300));
        if (m.method === "Log.entryAdded" && ["error", "warning"].includes(m.params.entry?.level)) {
          errors.push(m.params.entry?.text);
        }
      });
      await cdp.send("Runtime.enable");
      await sleep(t.wait || 4500);
      const res = await cdp.send("Runtime.evaluate", {
        expression: EXPR,
        awaitPromise: true,
        returnByValue: true,
      });
      text = (res.result?.value ?? "").trim();
      ws.close();
    } catch (e) {
      errors.push("[harness] " + e.message);
    } finally {
      if (tabId) await closeTab(tabId);
    }
    fs.writeFileSync(
      path.join(outDir, `${t.tag}.txt`),
      (text + (errors.length ? "\n\nCONSOLE_ERRORS=" + JSON.stringify(errors.slice(0, 5)) : "")).trim(),
      "utf-8"
    );
    console.log(`${t.tag}\t${text ? "OK" : "EMPTY"}\t${text.length}`);
  }
}

run()
  .catch((e) => {
    console.error("[FATAL]", e.message);
    process.exitCode = 1;
  })
  .finally(() => browser.kill());
