// frontend/assets/admintemplatebuilder.js
// Template builder — forbedret: vis gruppe- og answertype-labels

let els;

function $(id){ return document.getElementById(id); }
function qs(name){ return new URL(location.href).searchParams.get(name); }

async function fetchJson(url, opts){
  const r = await fetch(url, opts);
  const t = await r.text().catch(()=>"");
  if(!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

/* -------------------------
   label caches
--------------------------*/
let answerTypeLabelByValue = new Map();   // number -> string
let groupTitleById = new Map();           // guid -> string

async function loadAnswerTypeLabels(){
  answerTypeLabelByValue = new Map();
  try {
    const meta = await fetchJson("/api/questions-metadata", { cache: "no-store" });
    const opts = meta?.answertype || [];
    opts.forEach(o => {
      const v = Number(o.value);
      if (!Number.isNaN(v)) answerTypeLabelByValue.set(v, String(o.label || ""));
    });
  } catch (e) {
    // fallback labels if metadata endpoint ikke findes
    answerTypeLabelByValue.set(100000000, "Ja/Nej");
    answerTypeLabelByValue.set(100000001, "Tal");
    answerTypeLabelByValue.set(100000002, "Tekst");
    answerTypeLabelByValue.set(100000003, "Valgliste");
  }
}

async function loadGroupTitles(){
  groupTitleById = new Map();
  try {
    const data = await fetchJson("/api/questiongroups-get?top=500", { cache: "no-store" });
    const rows = data?.value || data || [];
    rows.forEach(g => {
      const id = g.crcc8_lch_questiongroupid || g.id;
      const title = g.crcc8_lch_title || g.title || g.crcc8_lch_name || "";
      if (id) groupTitleById.set(String(id), String(title));
    });
  } catch (e) {
    // ignore - vi har fallback senere
  }
}

function getGroupLabel(q){
  // 1) formatted lookup (OData formatted)
  const formatted = q['_crcc8_lch_questiongroup_value@OData.Community.Display.V1.FormattedValue'] ||
                    q['crcc8_lch_questiongroup@OData.Community.Display.V1.FormattedValue'];
  if (formatted) return String(formatted);

  // 2) expanded entity
  const expandedName =
    q.crcc8_lch_questiongroup?.crcc8_lch_name ??
    q.crcc8_lch_questiongroup?.name ??
    null;
  if (expandedName) return String(expandedName);

  // 3) raw guid -> lookup in cache
  const gid = q._crcc8_lch_questiongroup_value || q.crcc8_lch_questiongroupid || null;
  if (gid && groupTitleById.has(String(gid))) return String(groupTitleById.get(String(gid)));

  // fallback: empty
  return "";
}

function getAnswerTypeLabel(q){
  // 1) formatted annotation
  const formatted = q['crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue'];
  if (formatted) return String(formatted);

  // 2) numeric value mapped
  const raw = q.crcc8_lch_answertype;
  const v = raw == null ? null : Number(raw);
  if (v != null && answerTypeLabelByValue.has(v)) return answerTypeLabelByValue.get(v);

  // 3) fallback to raw
  return (raw ?? "").toString();
}

/* -------------------------
   UI helpers
--------------------------*/
function setStatus(s){ if(els.status) els.status.textContent = s || ""; }
function setListStatus(s){ if(els.listStatus) els.listStatus.textContent = s || ""; }

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* -------------------------
   render questions
--------------------------*/
function renderQuestions(rows){
  els.qbody.innerHTML = "";
  rows.forEach(q=>{
    const id = q.crcc8_lch_questionid;
    const number = q.crcc8_lch_number ?? "";
    const text = q.crcc8_lch_text ?? "";

    const groupLabel = getGroupLabel(q) || "(ingen gruppe)";
    const atLabel = getAnswerTypeLabel(q) || "(ukendt)";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-qid="${escapeHtml(id)}"></td>
      <td style="white-space:nowrap">${escapeHtml(number)}</td>
      <td>${escapeHtml(text)}</td>
      <td style="white-space:nowrap">${escapeHtml(groupLabel)}</td>
      <td style="white-space:nowrap">${escapeHtml(atLabel)}</td>
    `;
    els.qbody.appendChild(tr);
  });
}

/* -------------------------
   load questions
--------------------------*/
async function loadQuestions(){
  setListStatus("Indlæser…");
  try {
    const data = await fetchJson("/api/questions-get?top=500", { cache:"no-store" });
    const rows = data?.value || data || [];
    rows.sort((a,b) => String(a.crcc8_lch_number||"").localeCompare(String(b.crcc8_lch_number||""), "da"));
    renderQuestions(rows);
    setListStatus(rows.length ? "" : "Ingen spørgsmål fundet.");
  } catch (e) {
    console.error("loadQuestions fejl:", e);
    setListStatus(`Fejl: kunne ikke hente spørgsmål (${e.message})`);
  }
}

/* -------------------------
   template load/save (simple)
   - template-save og template-load endpoints forventes at findes
--------------------------*/
async function loadTemplateIfAny(){
  const tid = qs("templateId");
  if(!tid) return;
  els.templateId.value = tid;
  setStatus("Indlæser template…");
  try {
    const data = await fetchJson(`/api/template-load?id=${encodeURIComponent(tid)}`, { cache:"no-store" });
    els.templateName.value = data?.template?.name || "";
    els.templateDesc.value = data?.template?.description || "";

    const qids = new Set((data?.items || []).map(x => x.questionId));
    document.querySelectorAll('input[type="checkbox"][data-qid]').forEach(cb => {
      cb.checked = qids.has(cb.dataset.qid);
    });

    els.btnCreateFromThis.href = `./admincreate.html?templateId=${encodeURIComponent(tid)}`;
    els.btnCreateFromThis.classList.remove("hidden");
    setStatus("Template indlæst ✔");
  } catch (e) {
    console.error("loadTemplateIfAny:", e);
    setStatus("Fejl ved indlæsning: " + e.message);
  }
}

async function saveTemplate(){
  try {
    setStatus("");
    const name = (els.templateName.value || "").trim();
    if(!name) return setStatus("Udfyld template navn.");
    const qids = [...document.querySelectorAll('input[type="checkbox"][data-qid]')].filter(x=>x.checked).map(x=>x.dataset.qid);
    if(!qids.length) return setStatus("Vælg mindst ét spørgsmål.");

    setStatus("Gemmer template…");
    const payload = {
      templateId: (els.templateId.value || "").trim() || null,
      name,
      description: (els.templateDesc.value || "").trim() || "",
      isActive: true,
      questionItems: qids.map((qid, i) => ({
        questionId: qid,
        sortOrder: i+1,
        defaultPrefillText: ""
      }))
    };

    const res = await fetchJson("/api/template-save", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const tid = res.templateId;
    if(tid){
      els.templateId.value = tid;
      const u = new URL(location.href);
      u.searchParams.set("templateId", tid);
      history.replaceState(null, "", u.toString());
      els.btnCreateFromThis.href = `./admincreate.html?templateId=${encodeURIComponent(tid)}`;
      els.btnCreateFromThis.classList.remove("hidden");
    }

    setStatus("Template gemt ✔");
  } catch (e) {
    console.error("saveTemplate:", e);
    setStatus("Fejl: " + e.message);
  }
}

/* -------------------------
   init
--------------------------*/
document.addEventListener("DOMContentLoaded", async ()=>{
  els = {
    templateId: $("templateId"),
    templateName: $("templateName"),
    templateDesc: $("templateDesc"),
    btnSave: $("btnSave"),
    btnCreateFromThis: $("btnCreateFromThis"),
    status: $("status"),
    listStatus: $("listStatus"),
    qbody: $("qbody")
  };

  els.btnSave.addEventListener("click", saveTemplate);

  // hent labels+grupper først så render viser rigtige tekster
  await Promise.all([ loadAnswerTypeLabels(), loadGroupTitles() ]);

  await loadQuestions();
  await loadTemplateIfAny();
});
