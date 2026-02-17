// /frontend/assets/adminsurvey.js
let els;

function $(id) { return document.getElementById(id); }

function getEls() {
  return {
    // UI
    status: $("status"),
    listStatus: $("listStatus"),
    qbody: $("qbody"),

    // Inputs
    customerName: $("customerName"),
    expiresAt: $("expiresAt"),
    templateVersion: $("templateVersion"),
    note: $("note"),

    // Buttons
    btnReload: $("btnReload"),
    btnCreate: $("btnCreate"),
    btnCopy: $("btnCopy"),
    btnOpen: $("btnOpen"),
    btnOpenAdminPrefill: $("btnOpenAdminPrefill"),

    // Result UI
    result: $("result"),
    resultEmpty: $("resultEmpty"),
    codeOut: $("codeOut"),
    linkOut: $("linkOut"),
  };
}

function setStatus(msg) {
  if (els.status) els.status.textContent = msg || "";
}
function setListStatus(msg) {
  if (els.listStatus) els.listStatus.textContent = msg || "";
}

function showResult(code, link) {
  els.result?.classList.remove("hidden");
  els.resultEmpty?.classList.add("hidden");
  if (els.codeOut) els.codeOut.textContent = code || "";
  if (els.linkOut) els.linkOut.value = link || "";
  if (els.btnOpen) els.btnOpen.href = link || "#";
}

function hideResult() {
  els.result?.classList.add("hidden");
  els.resultEmpty?.classList.remove("hidden");

  // skjul admin-prefill link
  els.btnOpenAdminPrefill?.classList.add("hidden");
  if (els.btnOpenAdminPrefill) els.btnOpenAdminPrefill.href = "#";
}

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------------------
   Label maps (answertype + groups)
--------------------------- */
let answerTypeLabelByValue = new Map();   // value(int) -> label(string)
let groupTitleById = new Map();           // questiongroupid(guid) -> title(string)

async function loadAnswerTypeLabels() {
  answerTypeLabelByValue = new Map();
  try {
    const meta = await fetchJson("/api/questions-metadata", { cache: "no-store" });
    const opts = meta?.answertype || [];
    opts.forEach(o => {
      const v = Number(o.value);
      if (!Number.isNaN(v)) answerTypeLabelByValue.set(v, String(o.label || ""));
    });
  } catch (e) {
    // fallback (hvis metadata fejler)
    answerTypeLabelByValue.set(100000000, "Ja/Nej");
    answerTypeLabelByValue.set(100000001, "Tal");
    answerTypeLabelByValue.set(100000002, "Tekst");
    answerTypeLabelByValue.set(100000003, "Valgliste");
  }
}

async function loadGroupTitles() {
  groupTitleById = new Map();
  try {
    const data = await fetchJson("/api/questiongroups-get?top=500", { cache: "no-store" });
    const rows = data?.value || data || [];
    rows.forEach(g => {
      const id = g.crcc8_lch_questiongroupid || g.id;
      const title = g.crcc8_lch_title || g.title || "";
      if (id) groupTitleById.set(String(id), String(title));
    });
  } catch (e) {
    // hvis endpoint ikke findes / fejler, lader vi bare kortet være tomt
  }
}

function getGroupLabel(q) {
  // 1) formatted value (lookup) -> viser Primary Name (hos dig: lch_name)
  const formatted =
    q['_crcc8_lch_questiongroup_value@OData.Community.Display.V1.FormattedValue'] ??
    q['crcc8_lch_questiongroup@OData.Community.Display.V1.FormattedValue'];

  if (formatted) return String(formatted);

  // 2) expand (hvis du har det) -> brug name hvis den findes
  const expandedName =
    q.crcc8_lch_questiongroup?.crcc8_lch_name ??
    q.crcc8_lch_questiongroup?.name ??
    null;

  if (expandedName) return String(expandedName);

  // 3) fallback: guid->name cache (hvis du vil)
  const gid =
    q._crcc8_lch_questiongroup_value ??
    q.crcc8_lch_questiongroupid ??
    null;

  if (gid && groupTitleById.has(String(gid))) return String(groupTitleById.get(String(gid)));

  return "";
}

function getAnswerTypeLabel(q) {
  // 1) formatted value (hvis annotations er med)
  const formatted = q['crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue'];
  if (formatted) return String(formatted);

  // 2) tal -> label map
  const raw = q.crcc8_lch_answertype;
  const v = raw == null ? null : Number(raw);
  if (v != null && answerTypeLabelByValue.has(v)) return answerTypeLabelByValue.get(v);

  // 3) fallback: vis raw hvis vi ingen label har
  return (raw ?? "").toString();
}

/* ---------------------------
   Selection helper
--------------------------- */
function getSelectedQuestionItems() {
  const rows = document.querySelectorAll("#qbody tr");
  const items = [];

  rows.forEach(tr => {
    const cb = tr.querySelector('input[type="checkbox"][data-qid]');
    if (!cb || !cb.checked) return;

    const qid = cb.dataset.qid;

    const pre = tr.querySelector(`input[type="text"][data-prefill="${CSS.escape(qid)}"]`);
    const prefillText = (pre?.value || "").trim();

    items.push({
      id: qid,
      prefillText: prefillText || null
    });
  });

  return items;
}

/* ---------------------------
   Render
--------------------------- */
function renderQuestions(rows) {
  if (!els.qbody) return;
  els.qbody.innerHTML = "";

  rows.forEach(q => {
    const id = q.crcc8_lch_questionid;
    const number = q.crcc8_lch_number ?? "";
    const text = q.crcc8_lch_text ?? "";

    const groupLabel = getGroupLabel(q);
    const answertypeLabel = getAnswerTypeLabel(q);
    const required = q.crcc8_lch_isrequired ? "Ja" : "Nej";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-qid="${escapeHtml(id)}" checked></td>
      <td>${escapeHtml(number)}</td>
      <td>${escapeHtml(text)}</td>
      <td>${escapeHtml(groupLabel)}</td>
      <td>${escapeHtml(answertypeLabel)}</td>
      <td>${escapeHtml(required)}</td>
      <td>
        <input type="text"
               data-prefill="${escapeHtml(id)}"
               placeholder="fx nuværende værdi"
               style="width:100%; padding:.45rem" />
      </td>
    `;
    els.qbody.appendChild(tr);
  });
}

async function loadQuestions() {
  setListStatus("Indlæser…");

  try {
    // hent spørgsmål
    const data = await fetchJson("/api/questions-get?top=500", { cache: "no-store" });
    const rows = data?.value || data || [];

    // sortér (valgfrit) - efter nummer som tekst
    rows.sort((a, b) => String(a.crcc8_lch_number || "").localeCompare(String(b.crcc8_lch_number || "")));

    renderQuestions(rows);
    setListStatus(rows.length ? "" : "Ingen spørgsmål fundet.");
  } catch (e) {
    console.error("loadQuestions fejl:", e);
    setListStatus(`Fejl: kunne ikke hente spørgsmål (${e.message})`);
  }
}

/* ---------------------------
   Create survey
--------------------------- */
async function createSurvey() {
  try {
    hideResult();
    setStatus("");

    const customerName = (els.customerName?.value || "").trim();
    if (!customerName) {
      setStatus("Udfyld Kundenavn først.");
      return;
    }

    const expiresRaw = els.expiresAt?.value || "";
    const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;

    const templateVersion = parseInt(els.templateVersion?.value || "1", 10) || 1;
    const note = (els.note?.value || "").trim() || null;

    const questionItems = getSelectedQuestionItems();
    if (questionItems.length === 0) {
      setStatus("Vælg mindst ét spørgsmål.");
      return;
    }

    setStatus("Opretter survey-instans…");

    const payload = {
      customerName,
      expiresAt,
      templateVersion,
      note,
      questionItems
    };

const result = await fetchJson("/api/survey-create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

// Vis kunde-link (som før)
showResult(result.code, result.link);

// NYT: lav admin-prefill link
// Forudsætter at survey-create returnerer instanceId (anbefalet)
const instanceId =
  result.instanceId ||
  result.id ||
  result.surveyinstanceid ||
  result.crcc8_lch_surveyinstanceid ||
  null;

if (els.btnOpenAdminPrefill) {
  if (instanceId) {
    const adminUrl = `${location.origin}/adminprefill.html?id=${encodeURIComponent(instanceId)}`;
    els.btnOpenAdminPrefill.href = adminUrl;
    els.btnOpenAdminPrefill.classList.remove("hidden");
  } else {
    // fallback: hvis du ikke får instanceId endnu, kan vi åbne via code
    const adminUrl = `${location.origin}/adminprefill.html?code=${encodeURIComponent(result.code || "")}`;
    els.btnOpenAdminPrefill.href = adminUrl;
    els.btnOpenAdminPrefill.classList.remove("hidden");
    console.warn("survey-create returnerede ikke instanceId. Bruger code fallback.");
  }
}

setStatus("Oprettet ✔");


  } catch (e) {
    console.error(e);
    setStatus(`Fejl: ${e.message}`);
  }
}

/* ---------------------------
   Events / Init
--------------------------- */
function wireEvents() {
  els.btnReload?.addEventListener("click", loadQuestions);
  els.btnCreate?.addEventListener("click", createSurvey);

  if (els.btnCopy && els.linkOut) {
    els.btnCopy.addEventListener("click", async () => {
      const txt = els.linkOut.value || "";
      if (!txt) return;

      try {
        await navigator.clipboard.writeText(txt);
        setStatus("Link kopieret ✔");
      } catch {
        els.linkOut.focus();
        els.linkOut.select();
        document.execCommand("copy");
        setStatus("Link kopieret ✔");
      }
    });
  }
}

function sanityCheckDom() {
  const must = [
    "status","listStatus","qbody","btnReload","btnCreate",
    "expiresAt","templateVersion","note","result","resultEmpty",
    "codeOut","linkOut","customerName"
  ];
  const missing = must.filter(k => !els[k]);
  if (missing.length) console.warn("adminsurvey.js: Mangler DOM elementer:", missing);
}

async function init() {
  els = getEls();
  sanityCheckDom();
  wireEvents();

  // important: hent labels først, så vi kan vise tekst (ikke tal)
  await Promise.all([
    loadAnswerTypeLabels(),
    loadGroupTitles()
  ]);

  await loadQuestions();
}

document.addEventListener("DOMContentLoaded", init);
