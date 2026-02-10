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
  if (els.result) els.result.classList.remove("hidden");
  if (els.resultEmpty) els.resultEmpty.classList.add("hidden");
  if (els.codeOut) els.codeOut.textContent = code || "";
  if (els.linkOut) els.linkOut.value = link || "";
  if (els.btnOpen) els.btnOpen.href = link || "#";
}

function hideResult() {
  if (els.result) els.result.classList.add("hidden");
  if (els.resultEmpty) els.resultEmpty.classList.remove("hidden");
}

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { cache: "no-store", ...opts });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} – ${text}`.slice(0, 350));
  }
  return r.json();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderQuestions(rows) {
  if (!els.qbody) return;

  els.qbody.innerHTML = "";

  rows.forEach(q => {
    const id = q.crcc8_lch_questionid;
    const number = q.crcc8_lch_number ?? "";
    const text = q.crcc8_lch_text ?? "";

    const group = q["crcc8_lch_group@OData.Community.Display.V1.FormattedValue"]
      ?? q.crcc8_lch_group ?? "";

    const answertype = q["crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue"]
      ?? q.crcc8_lch_answertype ?? "";

    const required = q.crcc8_lch_isrequired ? "Ja" : "Nej";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-qid="${escapeHtml(id)}"></td>
      <td>${escapeHtml(number)}</td>
      <td>${escapeHtml(text)}</td>
      <td>${escapeHtml(String(group))}</td>
      <td>${escapeHtml(String(answertype))}</td>
      <td>${escapeHtml(required)}</td>
        <!-- NY: forudfyldt tekst pr. spørgsmål -->
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

function getSelectedQuestionIds() {
  return Array.from(document.querySelectorAll('input[type="checkbox"][data-qid]:checked'))
    .map(cb => cb.dataset.qid)
    .filter(Boolean);
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

function buildCreatePayload() {
  const expiresRaw = els.expiresAt?.value || "";
  const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;

  const templateVersion = parseInt(els.templateVersion?.value || "1", 10) || 1;
  const note = (els.note?.value || "").trim() || null;

  const questionIds = getSelectedQuestionIds();

  return { expiresAt, templateVersion, note, questionIds };
}

async function createSurvey() {
  try {
    setStatus("Opretter survey-instans…");

    const payload = buildCreatePayload();

    if (!payload.questionIds.length) {
      setStatus("Vælg mindst ét spørgsmål før du opretter.");
      return;
    }

    // ✅ Din function findes: /api/survey-create
    const result = await fetchJson("/api/survey-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Vi prøver nogle typiske feltnavne for robusthed
    const code = result?.code || result?.customerCode || result?.kundeKode || result?.surveyCode;
    const link = result?.link || result?.url || result?.surveyLink;

    if (!code || !link) {
      console.warn("Uventet response fra survey-create:", result);
      setStatus("Oprettet ✔ (men kunne ikke finde code/link i svaret – se console)");
      return;
    }

    showResult(code, link);
    setStatus("Oprettet ✔");
  } catch (e) {
    console.error("createSurvey fejl:", e);
    setStatus(`Fejl: ${e.message}`);
  }
}

function wireEvents() {
  if (els.btnReload) els.btnReload.addEventListener("click", loadQuestions);
  if (els.btnCreate) els.btnCreate.addEventListener("click", createSurvey);

  if (els.btnCopy && els.linkOut) {
    els.btnCopy.addEventListener("click", async () => {
      const txt = els.linkOut.value || "";
      if (!txt) return;

      try {
        await navigator.clipboard.writeText(txt);
        setStatus("Link kopieret ✔");
      } catch {
        // fallback
        els.linkOut.focus();
        els.linkOut.select();
        document.execCommand("copy");
        setStatus("Link kopieret ✔");
      }
    });
  }
}

function sanityCheckDom() {
  const missing = [];
  ["status","listStatus","qbody","btnReload","btnCreate","expiresAt","templateVersion","note","result","resultEmpty","codeOut","linkOut"].forEach(k => {
    if (!els[k]) missing.push(k);
  });
  if (missing.length) {
    console.warn("adminsurvey.js: Mangler DOM elementer:", missing);
  }
}

async function init() {
  els = getEls();
  sanityCheckDom();

  hideResult();
  wireEvents();
  await loadQuestions();
}

document.addEventListener("DOMContentLoaded", init);
