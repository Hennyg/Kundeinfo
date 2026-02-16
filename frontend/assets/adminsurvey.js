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
    customerName: $("customerName"),   // <-- kræver at feltet findes i HTML
    expiresAt: $("expiresAt"),
    templateVersion: $("templateVersion"),
    note: $("note"),

    // Buttons
    btnReload: $("btnReload"),
    btnCreate: $("btnCreate"),
    btnCopy: $("btnCopy"),
    btnOpen: $("btnOpen"),

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
}

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
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

// ✅ ENESTE version – returnerer {id, prefillText}
function getSelectedQuestionItems() {
  const rows = document.querySelectorAll("#qbody tr");
  const items = [];

  rows.forEach(tr => {
    const cb = tr.querySelector('input[type="checkbox"][data-qid]');
    if (!cb || !cb.checked) return;

    const qid = cb.dataset.qid;

    // prefill input i samme række: den har data-prefill="<id>"
    const pre = tr.querySelector(`input[type="text"][data-prefill="${CSS.escape(qid)}"]`);
    const prefillText = (pre?.value || "").trim();

    items.push({
      id: qid,
      prefillText: prefillText || null
    });
  });

  return items;
}

function renderQuestions(rows) {
  if (!els.qbody) return;
  els.qbody.innerHTML = "";

  rows.forEach(q => {
    const id = q.crcc8_lch_questionid;
    const number = q.crcc8_lch_number ?? "";
    const text = q.crcc8_lch_text ?? "";

    const group =
      q["crcc8_lch_group@OData.Community.Display.V1.FormattedValue"]
      ?? q.crcc8_lch_group
      ?? "";

    const answertype =
      q["crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue"]
      ?? q.crcc8_lch_answertype
      ?? "";

    const required = q.crcc8_lch_isrequired ? "Ja" : "Nej";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-qid="${escapeHtml(id)}" checked></td>
      <td>${escapeHtml(number)}</td>
      <td>${escapeHtml(text)}</td>
      <td>${escapeHtml(String(group))}</td>
      <td>${escapeHtml(String(answertype))}</td>
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
    const data = await fetchJson("/api/questions-get?top=500");
    const rows = data?.value || data || [];
    renderQuestions(rows);
    setListStatus(rows.length ? "" : "Ingen spørgsmål fundet.");
  } catch (e) {
    console.error("loadQuestions fejl:", e);
    setListStatus(`Fejl: kunne ikke hente spørgsmål (${e.message})`);
  }
}

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

    showResult(result.code, result.link);
    setStatus("Oprettet ✔");

  } catch (e) {
    console.error(e);
    setStatus(`Fejl: ${e.message}`);
  }
}

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
  const must = ["status","listStatus","qbody","btnReload","btnCreate","expiresAt","templateVersion","note","result","resultEmpty","codeOut","linkOut","customerName"];
  const missing = must.filter(k => !els[k]);
  if (missing.length) console.warn("adminsurvey.js: Mangler DOM elementer:", missing);
}

async function init() {
  els = getEls();
  sanityCheckDom();

  hideResult();
  wireEvents();
  await loadQuestions();
}

document.addEventListener("DOMContentLoaded", init);
