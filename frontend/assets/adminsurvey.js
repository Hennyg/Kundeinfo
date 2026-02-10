// /frontend/assets/adminsurvey.js
// Matcher din adminsurvey.html (qbody, btnReload, btnCreate, status, result osv.)

let els;

function $(id) { return document.getElementById(id); }

function getEls() {
  return {
    status: $("status"),
    listStatus: $("listStatus"),
    qbody: $("qbody"),

    btnReload: $("btnReload"),
    btnCreate: $("btnCreate"),
    btnCopy: $("btnCopy"),
    btnOpen: $("btnOpen"),

    expiresAt: $("expiresAt"),
    templateVersion: $("templateVersion"),
    note: $("note"),

    result: $("result"),
    resultEmpty: $("resultEmpty"),
    codeOut: $("codeOut"),
    linkOut: $("linkOut")
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
    throw new Error(`${r.status} ${r.statusText} – ${text}`.slice(0, 300));
  }
  return r.json();
}

function readSelectedQuestionIds() {
  // checkbox har data-id
  const checks = Array.from(document.querySelectorAll('input[type="checkbox"][data-qid]:checked'));
  return checks.map(c => c.dataset.qid);
}

function renderQuestions(rows) {
  if (!els.qbody) return;

  els.qbody.innerHTML = "";

  rows.forEach(q => {
    const id = q.crcc8_lch_questionid;
    const number = q.crcc8_lch_number ?? "";
    const text = q.crcc8_lch_text ?? "";

    const group = q['crcc8_lch_group@OData.Community.Display.V1.FormattedValue']
      ?? q.crcc8_lch_group ?? "";

    const answertype = q['crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue']
      ?? q.crcc8_lch_answertype ?? "";

    const required = q.crcc8_lch_isrequired ? "Ja" : "Nej";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-qid="${id}"></td>
      <td>${escapeHtml(number)}</td>
      <td>${escapeHtml(text)}</td>
      <td>${escapeHtml(String(group))}</td>
      <td>${escapeHtml(String(answertype))}</td>
      <td>${escapeHtml(String(required))}</td>
    `;
    els.qbody.appendChild(tr);
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

async function loadQuestions() {
  setListStatus("Indlæser…");
  try {
    // Samme endpoint som adminedit bruger
    const data = await fetchJson("/api/questions-get?top=200");
    const rows = data?.value || data || [];
    renderQuestions(rows);
    setListStatus(rows.length ? "" : "Ingen spørgsmål fundet.");
  } catch (e) {
    console.error("loadQuestions fejl:", e);
    setListStatus(`Fejl: kunne ikke hente spørgsmål (${e.message})`);
  }
}

function readCreatePayload() {
  // expiresAt: datetime-local -> ISO string eller null
  const expiresRaw = els.expiresAt?.value || "";
  const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;

  const templateVersion = parseInt(els.templateVersion?.value || "1", 10) || 1;
  const note = (els.note?.value || "").trim() || null;

  const questionIds = readSelectedQuestionIds();

  return { expiresAt, templateVersion, note, questionIds };
}

async function createSurvey() {
  try {
    setStatus("Opretter survey-instans…");

    const payload = readCreatePayload();

    if (!payload.questionIds.length) {
      setStatus("Vælg mindst ét spørgsmål før du opretter.");
      return;
    }

    // ⚠️ Endpoint-navn: ret hvis din function hedder noget andet
    // fx /api/SaveSurvey eller /api/survey-create
    const result = await fetchJson("/api/survey-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Forventet return:
    // { code: "123456", link: "https://.../kundeinfo.html?code=123456" }
    const code = result?.code || result?.customerCode || result?.kundeKode;
    const link = result?.link || result?.url;

    if (!code || !link) {
      console.warn("Uventet create result:", result);
      setStatus("Oprettet, men svaret havde ikke code/link. Se console.");
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
      try {
        await navigator.clipboard.writeText(els.linkOut.value || "");
        setStatus("Link kopieret ✔");
      } catch {
        // fallback
        els.linkOut.select();
        document.execCommand("copy");
        setStatus("Link kopieret ✔");
      }
    });
  }
}

async function init() {
  els = getEls();
  hideResult();
  wireEvents();
  await loadQuestions();
}

document.addEventListener("DOMContentLoaded", init);
