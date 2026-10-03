/* ============================================================
   ask-ai.js — P-10 Ask AI Demo 控制器

   重要：这是 AI 界面的 Prototype，不是真实 AI 系统。
   - 不调用 OpenAI / 任何 LLM，不需要 API Key，不建立后端；
   - 回答由 utils.answerQuestion() 的规则式本地查询生成
     （关键词匹配 + 当前 JSON 数据）；
   - 所有回答都明确标注 "Demo answer generated from the local prototype dataset"；
   - 无法理解的问题返回受支持范围提示 + Suggested Questions，绝不编造答案。
   ============================================================ */

import { APP_CONFIG } from "./config.js";
import {
  loadAllCoreData,
  loadCountrySource,
  loadLibrarySource,
  loadAwardSource,
  loadAwardResultSource,
  loadCaseSource,
  searchAll,
  askPlatform
} from "./data-loader.js";
import {
  renderHeader,
  renderFooter,
  breadcrumb,
  sourceItem,
  searchResultItem,
  loadingState,
  errorState
} from "./components.js";
import { escapeHtml, getQueryParam } from "./utils.js";

/* 建议问题：全部落在平台数据可可靠回答的范围内（D1.5） */
const SUGGESTED_QUESTIONS = [
  { label: "Which libraries are located in Denmark?", text: "Which libraries are located in Denmark?" },
  { label: "Find public libraries in China.", text: "Find public libraries in China." },
  { label: "Which awards has Shanghai Library won?", text: "Which awards has Shanghai Library won?" },
  { label: "Which libraries have won IFLA Public Library of the Year?", text: "Which libraries have won IFLA Public Library of the Year?" },
  { label: "Show green library award cases.", text: "Show green library award cases." },
  { label: "Show all cases and projects.", text: "Show all cases and projects." }
];

let pageData = null;

/* ---------- 初始化 ---------- */

async function init() {
  const answerBox = document.getElementById("answer-box");
  answerBox.innerHTML = loadingState();
  document.getElementById("answer-section").hidden = false;

  try {
    const [core, countrySource, librarySource, awardSource, awardResultSource, caseSource] =
      await Promise.all([
        loadAllCoreData(),
        loadCountrySource(),
        loadLibrarySource(),
        loadAwardSource(),
        loadAwardResultSource(),
        loadCaseSource()
      ]);
    pageData = { ...core, countrySource, librarySource, awardSource, awardResultSource, caseSource };

    document.getElementById("answer-section").hidden = true;
    answerBox.innerHTML = "";
    renderSuggestedQuestions();
    bindEvents();

    // 支持 ?q=<question> 直达（与 search.html 一致，便于分享与自动化验收）
    const preset = getQueryParam("q");
    if (preset) {
      document.getElementById("question").value = preset;
      runQuestion(preset);
    }
  } catch (err) {
    answerBox.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", init);
  }
}

function renderSuggestedQuestions() {
  const el = document.getElementById("suggested-questions");
  el.innerHTML = SUGGESTED_QUESTIONS.map((q, index) =>
    `<button class="btn btn-secondary btn-sm" type="button" data-index="${index}">${escapeHtml(q.label)}</button>`
  ).join("");

  el.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = SUGGESTED_QUESTIONS[Number(btn.dataset.index)];
      document.getElementById("question").value = item.text;
      runQuestion(item.text);
    });
  });
}

/* ---------- 提问 ---------- */

function bindEvents() {
  document.getElementById("ask-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runQuestion(document.getElementById("question").value);
  });

  document.getElementById("btn-clear-question").addEventListener("click", () => {
    document.getElementById("question").value = "";
    document.getElementById("answer-section").hidden = true;
    document.getElementById("ask-status").textContent = "";
    hideResults();
  });
}

function hideResults() {
  document.getElementById("answer-results-wrap").hidden = true;
  document.getElementById("answer-sources-wrap").hidden = true;
}

async function runQuestion(question) {
  const statusEl = document.getElementById("ask-status");
  const answerSection = document.getElementById("answer-section");
  const answerBox = document.getElementById("answer-box");

  const text = (question || "").trim();
  if (!text) {
    statusEl.textContent = "Please enter a question.";
    return;
  }

  statusEl.textContent = "";
  answerBox.innerHTML = loadingState();
  answerSection.hidden = false;
  hideResults();

  // D1：回答全部由 data-loader.askPlatform() 生成（数据接地，绝不自由生成）
  let result;
  try {
    result = await askPlatform(text, pageData, q => searchAll(q, pageData));
  } catch (err) {
    answerBox.innerHTML = errorState();
    document.getElementById("btn-retry").addEventListener("click", () => runQuestion(text));
    return;
  }

  if (!result.matched) {
    // 数据不足以回答：明确说明，不编造（D1.5）
    answerBox.innerHTML = `
      <p class="answer-text muted">${escapeHtml(result.text)}</p>
      <p class="caption" style="margin-top:8px">
        Supported questions: libraries in a country · awards of a library · libraries holding an award ·
        green / sustainability libraries · cases and projects · topical lookup across
        Library / Award / Case / Source.
      </p>
      <p style="margin-top:12px">
        <a class="small" href="#suggested-questions">Back to Suggested Questions ↑</a>
      </p>`;
    return;
  }

  // 标准回答：标注答案由平台数据接地生成，未调用任何生成式模型
  answerBox.innerHTML = `
    <p class="answer-text">${escapeHtml(result.text)}</p>
    <p class="answer-footnote">Answer composed from the platform dataset (Dynamic MVP). Every record and source listed below is retrieved from platform data — no language model was called and no fact was generated.</p>`;

  if (result.items.length > 0) {
    const wrap = document.getElementById("answer-results-wrap");
    document.getElementById("answer-results").innerHTML = result.items.map(item => searchResultItem({
      type: item.type,
      id: item.id,
      title: item.title,
      sub: item.sub
    })).join("");
    wrap.hidden = false;
  }

  // 相关来源（体现 AI + Database + Source 的设计方向）
  const sources = (result.sources || []).slice(0, 5);
  if (sources.length > 0) {
    const wrap = document.getElementById("answer-sources-wrap");
    document.getElementById("answer-sources").innerHTML =
      sources.map(s => sourceItem({ source: s, relationType: null })).join("");
    wrap.hidden = false;
  }
}

/* ---------- 启动 ---------- */

renderHeader("ask-ai");
renderFooter();
document.getElementById("breadcrumb").innerHTML = breadcrumb([
  { label: "Home", href: "index.html" },
  { label: "Ask AI" }
]);
init();
