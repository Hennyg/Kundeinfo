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

// simpel mapping baseret på formatted label / eller fallback
function resolveInputType(answertypeLabel) {
  const s = String(answertypeLabel || "").toLowerCase();

  if (s.includes("ja") || s.includes("nej") || s.includes("yes") || s.includes("no")) return "yesno";
  if (s.includes("tal") || s.includes("number") || s.includes("numeric")) return "number";
  if (s.includes("lang") || s.includes("long")) return "longtext";
  return "text";
}

function renderQuestions(items) {
  ui.questions.innerHTML = "";

  items.forEach((it, idx) => {
    const qNo = it.number || `Q${idx+1}`;
    const qText = it.text || "";
    const required = !!it.required;
    const prefill = it.prefillText || "";

    const inputType = resolveInputType(it.answertype);

    const wrap = document.createElement("div");
    wrap.style.padding = "12px 0";
    wrap.style.borderBottom = "1px solid #eee";

    const label = document.createElement("div");
    label.innerHTML = `
      <div class="qtitle">${qNo} — ${escapeHtml(qText)} ${required ? '<span class="muted">(påkrævet)</span>' : ''}</div>
      ${prefill ? `<div class="qhelp">Nuværende/forudfyldt: <strong>${escapeHtml(prefill)}</strong></div>` : ""}
    `;
    wrap.appendChild(label);

    let inputHtml = "";
    const name = `q_${it.itemId || it.questionId || idx}`;

    if (inputType === "yesno") {
      inputHtml = `
        <div class="row">
          <div class="muted">Svar</div>
          <select name="${name}" data-itemid="${escapeHtml(it.itemId || "")}" ${required ? "required" : ""}>
            <option value="">Vælg…</option>
            <option value="Ja">Ja</option>
            <option value="Nej">Nej</option>
          </select>
        </div>
      `;
    } else if (inputType === "number") {
      inputHtml = `
        <div class="row">
          <div class="muted">Svar</div>
          <input type="number" name="${name}" data-itemid="${escapeHtml(it.itemId || "")}" ${required ? "required" : ""} />
        </div>
      `;
    } else if (inputType === "longtext") {
      inputHtml = `
        <div class="row">
          <div class="muted">Svar</div>
          <textarea name="${name}" data-itemid="${escapeHtml(it.itemId || "")}" ${required ? "required" : ""}></textarea>
        </div>
      `;
    } else {
      inputHtml = `
        <div class="row">
          <div class="muted">Svar</div>
          <input type="text" name="${name}" data-itemid="${escapeHtml(it.itemId || "")}" ${required ? "required" : ""} />
        </div>
      `;
    }

    wrap.insertAdjacentHTML("beforeend", inputHtml);
    ui.questions.appendChild(wrap);
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadSurvey() {
  const code = getCodeFromUrl();
  if (!code) throw new Error("Mangler kode i linket.");

  const data = await fetchJson("/api/survey-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });

  // forventet form:
  // { code, customerName, items: [...] }
  const items = data?.items || [];

  if (!items.length) throw new Error("Spørgeskemaet indeholder ingen spørgsmål (eller koden er ugyldig).");

  ui.title.textContent = data?.customerName ? `Spørgeskema – ${data.customerName}` : "Spørgeskema";
  ui.subtitle.textContent = `Kode: ${data?.code || code}`;

  renderQuestions(items);

  return { code, data };
}

function collectAnswers() {
  const inputs = ui.form.querySelectorAll("[data-itemid][data-questionid]");
  const answers = [];

  inputs.forEach(el => {
    const itemId = el.getAttribute("data-itemid");
    const questionId = el.getAttribute("data-questionid");
    const value = (el.value ?? "").trim();

    if (!itemId || !questionId) return;

    answers.push({
      itemId,
      questionId,
      value: value || null
    });
  });

  return answers;
}


async function submitSurvey(code) {
  ui.status.textContent = "Sender…";
  ui.btnSubmit.disabled = true;

  try {
    const answers = collectAnswers();

    // TODO: kræver en submit endpoint (vi kan lave den næste)
    const result = await fetchJson("/api/survey-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, answers })
    });

    ui.status.textContent = "Tak! Besvarelsen er sendt ✔";
    // evt. disable form
    ui.form.querySelectorAll("input,textarea,select,button").forEach(x => x.disabled = true);

    return result;
  } catch (e) {
    console.error(e);
    ui.status.textContent = `Fejl: ${e.message}`;
  } finally {
    ui.btnSubmit.disabled = false;
  }
}

async function init() {
  try {
    show(ui.loading); hide(ui.error); hide(ui.app);
    const { code } = await loadSurvey();
    hide(ui.loading); show(ui.app);

    ui.form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitSurvey(code);
    });

  } catch (e) {
    console.error(e);
    hide(ui.loading); hide(ui.app); show(ui.error);
    ui.errorText.textContent = e.message;
  }
}

document.addEventListener("DOMContentLoaded", init);
