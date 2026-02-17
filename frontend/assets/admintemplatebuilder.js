let els;
function $(id){ return document.getElementById(id); }
function qs(name){ return new URL(location.href).searchParams.get(name); }

async function fetchJson(url, opts){
  const r = await fetch(url, opts);
  const t = await r.text().catch(()=> "");
  if(!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
function escapeHtml(s){
  return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function setStatus(s){ els.status.textContent = s || ""; }
function setListStatus(s){ els.listStatus.textContent = s || ""; }

function getSelectedQuestionIds(){
  return [...document.querySelectorAll('input[type="checkbox"][data-qid]')]
    .filter(x=>x.checked).map(x=>x.dataset.qid);
}

function renderQuestions(rows){
  els.qbody.innerHTML = "";
  rows.forEach(q=>{
    const id = q.crcc8_lch_questionid;
    const number = q.crcc8_lch_number ?? "";
    const text = q.crcc8_lch_text ?? "";
    const group = q['_crcc8_lch_questiongroup_value@OData.Community.Display.V1.FormattedValue'] ?? "";
    const at = q['crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue'] ?? String(q.crcc8_lch_answertype ?? "");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-qid="${escapeHtml(id)}"></td>
      <td>${escapeHtml(number)}</td>
      <td>${escapeHtml(text)}</td>
      <td>${escapeHtml(group)}</td>
      <td>${escapeHtml(at)}</td>
    `;
    els.qbody.appendChild(tr);
  });
}

async function loadQuestions(){
  setListStatus("Indlæser…");
  const data = await fetchJson("/api/questions-get?top=500", { cache:"no-store" });
  const rows = data?.value || data || [];
  rows.sort((a,b)=>String(a.crcc8_lch_number||"").localeCompare(String(b.crcc8_lch_number||""),"da"));
  renderQuestions(rows);
  setListStatus(rows.length ? "" : "Ingen spørgsmål fundet.");
}

async function loadTemplateIfAny(){
  const tid = qs("templateId");
  if(!tid) return;

  els.templateId.value = tid;
  setStatus("Indlæser template…");

  const data = await fetchJson(`/api/template-load?id=${encodeURIComponent(tid)}`, { cache:"no-store" });

  els.templateName.value = data?.template?.name || "";
  els.templateDesc.value = data?.template?.description || "";

  const qids = new Set((data?.items || []).map(x => x.questionId));
  document.querySelectorAll('input[type="checkbox"][data-qid]').forEach(cb=>{
    cb.checked = qids.has(cb.dataset.qid);
  });

  els.btnCreateFromThis.href = `./admincreate.html?templateId=${encodeURIComponent(tid)}`;
  els.btnCreateFromThis.classList.remove("hidden");

  setStatus("Template indlæst ✔");
}

async function saveTemplate(){
  try{
    setStatus("");
    const name = (els.templateName.value || "").trim();
    if(!name) return setStatus("Udfyld template navn.");
    const qids = getSelectedQuestionIds();
    if(!qids.length) return setStatus("Vælg mindst ét spørgsmål.");

    setStatus("Gemmer template…");

    const payload = {
      templateId: (els.templateId.value || "").trim() || null,
      name,
      description: (els.templateDesc.value || "").trim() || "",
      isActive: true,
      questionItems: qids.map(qid => ({
        questionId: qid,
        sortOrder: null,
        defaultPrefillText: ""
      }))
    };

    const res = await fetchJson("/api/template-save", {
      method:"POST",
      headers:{ "Content-Type":"application/json; charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const tid = res.templateId;
    els.templateId.value = tid;

    const u = new URL(location.href);
    u.searchParams.set("templateId", tid);
    history.replaceState(null, "", u.toString());

    els.btnCreateFromThis.href = `./admincreate.html?templateId=${encodeURIComponent(tid)}`;
    els.btnCreateFromThis.classList.remove("hidden");

    setStatus("Template gemt ✔");
  } catch(e){
    console.error(e);
    setStatus("Fejl: " + e.message);
  }
}

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

  await loadQuestions();
  await loadTemplateIfAny();
});
