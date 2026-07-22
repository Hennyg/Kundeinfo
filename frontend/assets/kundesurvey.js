// /frontend/assets/kundesurvey.js
function $(id){ return document.getElementById(id); }

const ui = {
  loading: $("loading"),
  error: $("error"),
  errorText: $("errorText"),
  app: $("app"),
  title: $("surveyTitle"),
  subtitle: $("surveySubtitle"),
  questions: $("questions"),
  form: $("surveyForm"),
  status: $("status"),
  btnSubmit: $("btnSubmit"),
  btnSaveLater: $("btnSaveLater"),
};

function show(el){ el?.classList.remove("hidden"); }
function hide(el){ el?.classList.add("hidden"); }

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

function getCodeFromUrl() {
  const u = new URL(location.href);
  return (u.searchParams.get("code") || u.searchParams.get("t") || u.searchParams.get("token") || "").trim();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// simpel mapping baseret på formatted label / eller fallback
function resolveInputType(answertypeLabel) {
  const s = String(answertypeLabel || "").toLowerCase();

  if (s.includes("ja") || s.includes("nej") || s.includes("yes") || s.includes("no")) return "yesno";
  if (s.includes("tal") || s.includes("number") || s.includes("numeric")) return "number";
  if (s.includes("lang") || s.includes("long")) return "longtext";
  return "text";
}

/* ---------- State ---------- */
let DATA = null;                     // { code, customerName, groups, items }
const repeatCounters = {};           // groupId -> højeste synlige repeatIndex
const removedRepeats = new Set();    // `${groupId}:${repeatIndex}`

function buildInput(it, value) {
  const inputType = resolveInputType(it.answertype);
  const name = `q_${it.questionId}_${it.repeatIndex}`;

  let el;
  if (inputType === "yesno") {
    el = document.createElement("select");
    el.innerHTML = `
      <option value="">Vælg…</option>
      <option value="Ja"  ${value === "Ja"  ? "selected" : ""}>Ja</option>
      <option value="Nej" ${value === "Nej" ? "selected" : ""}>Nej</option>
    `;
  } else if (inputType === "number") {
    el = document.createElement("input");
    el.type = "number";
    el.value = value ?? "";
  } else if (inputType === "longtext") {
    el = document.createElement("textarea");
    el.value = value ?? "";
  } else {
    el = document.createElement("input");
    el.type = "text";
    el.value = value ?? "";
  }

  el.name = name;
  el.dataset.questionid = it.questionId;
  el.dataset.groupid = it.groupId;
  el.dataset.repeatindex = String(it.repeatIndex);
  if (it.required) el.required = true;

  return el;
}

function renderQuestions() {
  ui.questions.innerHTML = "";

  const groups = [...(DATA.groups || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  // Basale spørgsmål (repeatIndex 0) pr. gruppe – bruges som skabelon for gentagelser
  const baseByGroup = new Map();
  // Gemte/aktuelle værdier: `${questionId}|${ri}` -> value
  const valueMap = new Map();

  for (const it of (DATA.items || [])) {
    valueMap.set(`${it.questionId}|${it.repeatIndex}`, it.savedValue || "");
    if (it.repeatIndex === 0) {
      if (!baseByGroup.has(it.groupId)) baseByGroup.set(it.groupId, []);
      baseByGroup.get(it.groupId).push(it);
    }
  }
  for (const [, arr] of baseByGroup) arr.sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0));

  for (const g of groups) {
    const baseQs = baseByGroup.get(g.id) || [];
    if (!baseQs.length) continue;

    const card = document.createElement("div");
    card.className = "card";

    const titleRow = document.createElement("div");
    titleRow.className = "group-title";
    const h2 = document.createElement("h2");
    h2.textContent = g.title || "Spørgsmål";
    titleRow.appendChild(h2);
    card.appendChild(titleRow);

    const maxRi = g.repeatable ? (repeatCounters[g.id] ?? 0) : 0;

    for (let ri = 0; ri <= maxRi; ri++) {
      const removedKey = `${g.id}:${ri}`;
      if (removedRepeats.has(removedKey)) continue;

      const block = document.createElement("div");
      block.className = g.repeatable ? "repeat-block" : "";
      block.id = `repeat_${g.id}_${ri}`;

      if (g.repeatable) {
        const head = document.createElement("div");
        head.className = "repeat-head";

        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = (ri === 0) ? "1." : `${ri + 1}.`;
        head.appendChild(tag);

        if (ri > 0) {
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "btn danger";
          delBtn.textContent = "Fjern";
          delBtn.onclick = () => { removedRepeats.add(removedKey); renderQuestions(); };
          head.appendChild(delBtn);
        }

        block.appendChild(head);
      }

      baseQs.forEach((bq) => {
        const it = {
          questionId: bq.questionId,
          groupId: bq.groupId,
          repeatIndex: ri,
          number: bq.number,
          text: bq.text,
          required: bq.required,
          answertype: bq.answertype,
          explanation: bq.explanation,
          prefillText: ri === 0 ? bq.prefillText : ""
        };

        const value = valueMap.get(`${it.questionId}|${ri}`) || "";

        const wrap = document.createElement("div");
        wrap.style.padding = "10px 0";
        wrap.style.borderBottom = "1px solid #eee";

        const label = document.createElement("div");
        label.innerHTML = `
          <div class="qtitle">${escapeHtml(it.text || "")} ${it.required ? '<span class="muted">(påkrævet)</span>' : ''}</div>
          ${it.explanation ? `<div class="qhelp">${escapeHtml(it.explanation)}</div>` : ""}
          ${it.prefillText ? `<div class="qhelp">Nuværende/forudfyldt: <strong>${escapeHtml(it.prefillText)}</strong></div>` : ""}
        `;
        wrap.appendChild(label);

        const input = buildInput(it, value);
        wrap.appendChild(input);

        block.appendChild(wrap);
      });

      card.appendChild(block);
    }

    if (g.repeatable) {
      const addRow = document.createElement("div");
      addRow.className = "btnrow";
      addRow.style.marginTop = "8px";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn";
      addBtn.textContent = "+ Tilføj flere";
      addBtn.onclick = () => {
        const next = (repeatCounters[g.id] ?? 0) + 1;
        repeatCounters[g.id] = next;
        renderQuestions();
        setTimeout(() => document.getElementById(`repeat_${g.id}_${next}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      };
      addRow.appendChild(addBtn);
      card.appendChild(addRow);
    }

    ui.questions.appendChild(card);
  }
}

function initRepeatCounters() {
  Object.keys(repeatCounters).forEach(k => delete repeatCounters[k]);
  for (const it of (DATA.items || [])) {
    if (it.repeatIndex > (repeatCounters[it.groupId] ?? 0)) {
      repeatCounters[it.groupId] = it.repeatIndex;
    }
  }
}

async function loadSurvey() {
  const code = getCodeFromUrl();
  if (!code) throw new Error("Mangler kode i linket.");

  const data = await fetchJson("/api/survey-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });

  const items = data?.items || [];
  if (!items.length) throw new Error("Spørgeskemaet indeholder ingen spørgsmål (eller koden er ugyldig).");

  DATA = data;
  removedRepeats.clear();
  initRepeatCounters();

  ui.title.textContent = data?.customerName ? `Spørgeskema – ${data.customerName}` : "Spørgeskema";
  ui.subtitle.textContent = `Kode: ${data?.code || code}`;

  renderQuestions();

  return { code };
}

function collectAnswers() {
  const inputs = ui.form.querySelectorAll("[data-questionid]");
  const answers = [];

  inputs.forEach(el => {
    const questionId = (el.dataset.questionid || "").trim();
    const groupId = (el.dataset.groupid || "").trim();
    const repeatIndex = parseInt(el.dataset.repeatindex || "0", 10);
    const value = (el.value ?? "").trim();

    if (!questionId) return;
    answers.push({ questionId, groupId, repeatIndex, value: value || null });
  });

  return answers;
}

function collectRemoved() {
  const removed = [];
  for (const key of removedRepeats) {
    const [groupId, riStr] = key.split(":");
    const repeatIndex = parseInt(riStr, 10);

    // find alle spørgsmål i denne gruppe (fra DATA.items, uanset repeatIndex)
    const questionIds = new Set(
      (DATA.items || []).filter(it => it.groupId === groupId).map(it => it.questionId)
    );
    for (const questionId of questionIds) {
      removed.push({ questionId, repeatIndex });
    }
  }
  return removed;
}

async function submitSurvey(code, finalize) {
  ui.status.textContent = finalize ? "Afslutter…" : "Gemmer…";
  ui.btnSubmit.disabled = true;
  ui.btnSaveLater && (ui.btnSaveLater.disabled = true);

  try {
    const answers = collectAnswers();
    const removed = collectRemoved();

    const result = await fetchJson("/api/survey-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, answers, removed, finalize: !!finalize })
    });

    if (finalize) {
      ui.status.textContent = "Tak! Besvarelsen er sendt ✔";
      ui.form.querySelectorAll("input,textarea,select,button").forEach(x => x.disabled = true);
    } else {
      ui.status.textContent = "Gemt ✔ Du kan lukke siden og fortsætte senere.";
      ui.btnSubmit.disabled = false;
      ui.btnSaveLater && (ui.btnSaveLater.disabled = false);
    }

    return result;
  } catch (e) {
    console.error(e);
    ui.status.textContent = `Fejl: ${e.message}`;
  } finally {
    if (!finalize) {
      ui.btnSubmit.disabled = false;
      ui.btnSaveLater && (ui.btnSaveLater.disabled = false);
    }
  }
}

async function init() {
  try {
    show(ui.loading); hide(ui.error); hide(ui.app);
    const { code } = await loadSurvey();
    hide(ui.loading); show(ui.app);

    ui.form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitSurvey(code, true); // afslut
    });

    ui.btnSaveLater?.addEventListener("click", () => submitSurvey(code, false)); // gem senere

  } catch (e) {
    console.error(e);
    hide(ui.loading); hide(ui.app); show(ui.error);
    ui.errorText.textContent = e.message;
  }
}

document.addEventListener("DOMContentLoaded", init);
