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
  readonlyBanner: $("readonlyBanner"),
  openAsCustomerLink: $("openAsCustomerLink"),
  kundeAdresseOptions: $("kundeAdresseOptions"),
};

function isReadOnly() {
  const u = new URL(location.href);
  return ["1", "true"].includes((u.searchParams.get("ro") || "").toLowerCase());
}

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

const ADDRESS_FIELD_NUMBERS = ["0090", "0190"];

let kundeAdresserList = []; // adresser fra data.kundeAdresser (survey-start) – bruges til adresseforslag

function formatAdresse(a) {
  if (!a) return "";
  const cityLine = [a.postnr, a.by].filter(Boolean).join(" ");
  return [a.adresse, cityLine].filter(Boolean).join(", ");
}

function buildInput(it, value) {
  const inputType = resolveInputType(it.answertype);
  const name = `q_${it.questionId}_${it.repeatIndex}`;
  const isAddressField = ADDRESS_FIELD_NUMBERS.includes(String(it.number || ""));

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
    if (isAddressField) {
      el.setAttribute("list", "kundeAdresseOptions");
      el.placeholder = "Vælg eller skriv en adresse";
    }
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
  const seenQuestionByGroup = new Map();
  // Gemte/aktuelle værdier: `${questionId}|${ri}` -> value
  const valueMap = new Map();
  // Prefill-tekst pr. faktisk gentagelse: `${questionId}|${ri}` -> prefillText
  const prefillMap = new Map();

  for (const it of (DATA.items || [])) {
    valueMap.set(`${it.questionId}|${it.repeatIndex}`, it.savedValue || "");
    prefillMap.set(`${it.questionId}|${it.repeatIndex}`, it.prefillText || "");

    if (it.repeatIndex === 0) {
      if (!baseByGroup.has(it.groupId)) {
        baseByGroup.set(it.groupId, []);
        seenQuestionByGroup.set(it.groupId, new Set());
      }

      // Forsvar mod dubletrækker i Dataverse (samme spørgsmål oprettet to
      // gange med repeatIndex 0) – behold kun den første forekomst.
      const seen = seenQuestionByGroup.get(it.groupId);
      if (seen.has(it.questionId)) continue;
      seen.add(it.questionId);

      baseByGroup.get(it.groupId).push(it);
    }
  }
  for (const [, arr] of baseByGroup) {
    arr.sort((a, b) => {
      const sortDiff = (a.sortKey ?? 0) - (b.sortKey ?? 0);
      if (sortDiff !== 0) return sortDiff;
      return String(a.number || "").localeCompare(String(b.number || ""), "da", { numeric: true });
    });
  }

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

    if (g.description) {
      const desc = document.createElement("div");
      desc.className = "group-desc";
      desc.textContent = g.description;
      card.appendChild(desc);
    }

    const maxRi = g.repeatable ? (repeatCounters[g.id] ?? 0) : 0;

    for (let ri = 0; ri <= maxRi; ri++) {
      const removedKey = `${g.id}:${ri}`;
      const isRemoved = removedRepeats.has(removedKey);

      const block = document.createElement("div");
      block.className = g.repeatable ? "repeat-block" : "";
      if (isRemoved) block.classList.add("removed");
      block.id = `repeat_${g.id}_${ri}`;

      if (g.repeatable) {
        const head = document.createElement("div");
        head.className = "repeat-head";

        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = (ri === 0) ? "1." : `${ri + 1}.`;
        head.appendChild(tag);

        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.alignItems = "center";
        right.style.gap = "8px";

        if (isRemoved) {
          const badge = document.createElement("span");
          badge.className = "removed-badge";
          badge.textContent = "Slettet";
          right.appendChild(badge);
        }

        if (!isReadOnly()) {
          const toggleBtn = document.createElement("button");
          toggleBtn.type = "button";
          toggleBtn.className = isRemoved ? "btn" : "btn danger";
          toggleBtn.textContent = isRemoved ? "Fortryd" : "Slet";
          toggleBtn.onclick = () => {
            if (isRemoved) removedRepeats.delete(removedKey);
            else removedRepeats.add(removedKey);
            renderQuestions();
          };
          right.appendChild(toggleBtn);
        }

        head.appendChild(right);
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
          prefillText: prefillMap.get(`${bq.questionId}|${ri}`) || ""
        };

        const value = valueMap.get(`${it.questionId}|${ri}`) || "";

        const wrap = document.createElement("div");
        wrap.style.padding = "10px 0";
        wrap.style.borderBottom = "1px solid #eee";

        const label = document.createElement("div");
        label.innerHTML = `
          <div class="qtitle">${escapeHtml(it.text || "")} ${it.required ? '<span class="muted">(påkrævet)</span>' : ''}</div>
          ${it.explanation ? `<div class="qhelp">${escapeHtml(it.explanation)}</div>` : ""}
          ${it.prefillText ? `<div class="prefill-box">Vores info:<br><strong>${escapeHtml(it.prefillText)}</strong></div>` : ""}
        `;
        wrap.appendChild(label);

        const input = buildInput(it, value);
        if (isReadOnly() || isRemoved) input.disabled = true;
        input.addEventListener("blur", () => autosaveOnBlur());
        wrap.appendChild(input);

        block.appendChild(wrap);
      });

      card.appendChild(block);
    }

    if (g.repeatable && !isReadOnly()) {
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

  updateKundeAdresseOptions(data?.kundeAdresser);

  if (isReadOnly()) {
    show(ui.readonlyBanner);
    ui.btnSubmit?.classList.add("hidden");

    if (ui.openAsCustomerLink) {
      const customerUrl = new URL(location.href);
      customerUrl.searchParams.delete("ro");
      customerUrl.searchParams.set("code", data?.code || code);
      ui.openAsCustomerLink.href = customerUrl.toString();
    }
  }

  renderQuestions();

  return { code };
}

function updateKundeAdresseOptions(adresser) {
  kundeAdresserList = Array.isArray(adresser) ? adresser : [];

  if (!ui.kundeAdresseOptions) return;

  ui.kundeAdresseOptions.innerHTML = kundeAdresserList
    .map(a => {
      const full = formatAdresse(a);
      return full ? `<option value="${escapeHtml(full)}"></option>` : "";
    })
    .join("");
}

let autosaveTimer = null;
let autosaveCode = null;

function autosaveOnBlur() {
  if (isReadOnly() || !autosaveCode) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    submitSurvey(autosaveCode, false, { silent: true });
  }, 600);
}

function collectAnswers() {
  const inputs = ui.form.querySelectorAll("[data-questionid]");
  const answers = [];

  inputs.forEach(el => {
    if (el.closest(".repeat-block.removed")) return; // håndteres separat via collectRemoved()

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

async function submitSurvey(code, finalize, opts = {}) {
  const silent = !!opts.silent;

  if (!silent) {
    ui.status.textContent = finalize ? "Afslutter…" : "Gemmer…";
    ui.btnSubmit.disabled = true;
  } else {
    ui.status.textContent = "Gemmer automatisk…";
  }

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
      ui.status.textContent = "Gemt ✔";
      if (!silent) {
        ui.btnSubmit.disabled = false;
      }
    }

    return result;
  } catch (e) {
    console.error(e);
    ui.status.textContent = `Fejl: ${e.message}`;
  } finally {
    if (!finalize && !silent) {
      ui.btnSubmit.disabled = false;
    }
  }
}

async function init() {
  try {
    show(ui.loading); hide(ui.error); hide(ui.app);
    const { code } = await loadSurvey();
    hide(ui.loading); show(ui.app);
    autosaveCode = code;

    ui.form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitSurvey(code, true); // afslut
    });

  } catch (e) {
    console.error(e);
    hide(ui.loading); hide(ui.app); show(ui.error);
    ui.errorText.textContent = e.message;
  }
}

document.addEventListener("DOMContentLoaded", init);
