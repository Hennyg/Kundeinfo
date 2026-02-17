let els;
function $(id){ return document.getElementById(id); }
function qs(name){ return new URL(location.href).searchParams.get(name); }

async function fetchJson(url, opts){
  const r = await fetch(url, opts);
  const t = await r.text().catch(()=> "");
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function setStatus(s){ els.status.textContent = s || ""; }
function setListStatus(s){ els.listStatus.textContent = s || ""; }

function showResult({ code, link, instanceId }){
  els.result.classList.remove("hidden");
  els.codeOut.textContent = code || "";
  els.linkOut.value = link || "";
  els.btnOpen.href = link || "#";
  els.btnPrefill.href = instanceId ? `./adminprefill.html?id=${encodeURIComponent(instanceId)}` : "#";
}

function getPrefillItems(){
  return [...els.qbody.querySelectorAll("tr")].map(tr => {
    const qid = tr.dataset.qid;
    const pre = tr.querySelector("input[data-prefill]")?.value?.trim() || "";
    return { questionId: qid, prefillText: pre || null };
  });
}

/* ---------- Templates dropdown ---------- */
async function loadTemplates(){
  setStatus("");
  els.templateSelect.innerHTML = `<option value="">Indlæser templates…</option>`;
  const data = await fetchJson("/api/templates-get?top=500", { cache: "no-store" });
  const rows = data?.value || data || [];

  rows.sort((a,b)=> String(a.crcc8_lch_name||"").localeCompare(String(b.crcc8_lch_name||""),"da"));

  els.templateSelect.innerHTML = `<option value="">Vælg template…</option>`;
  rows.forEach(t=>{
    const id = t.crcc8_lch_surveytemplateid || t.id;
    const name = t.crcc8_lch_name || "(uden navn)";
    const active = t.crcc8_lch_isactive;
    const label = active === false ? `${name} (inaktiv)` : name;

    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = label;
    els.templateSelect.appendChild(opt);
  });

  const tid = qs("templateId");
  if (tid) {
    els.templateSelect.value = tid;
    await loadTemplateItems(tid);
  }
}

/* ---------- Load template items + render prefill ---------- */
async function loadTemplateItems(templateId){
  if (!templateId) {
    els.prefillArea.classList.add("hidden");
    setListStatus("Vælg en template…");
    return;
  }

  setListStatus("Indlæser spørgsmål fra template…");
  els.prefillArea.classList.add("hidden");
  els.qbody.innerHTML = "";

  const data = await fetchJson(`/api/templateitems-get?templateId=${encodeURIComponent(templateId)}`, { cache: "no-store" });
  const rows = data?.value || data || [];

  if (!rows.length) {
    setListStatus("Denne template har ingen spørgsmål.");
    return;
  }

  // rows forventes som "flat" med question data:
  // { questionId, number, text, group, answertypeLabel, defaultPrefillText }
  rows.forEach(item=>{
    const qid = item.questionId || item.crcc8_lch_questionid || item._crcc8_lch_question_value;
    const number = item.number || item.crcc8_lch_number || "";
    const text = item.text || item.crcc8_lch_text || "";
    const group = item.group || item.groupLabel || "";
    const at = item.answertypeLabel || item.answertype || "";
    const pre = item.defaultPrefillText || item.crcc8_lch_defaultprefilltext || "";

    const tr = document.createElement("tr");
    tr.dataset.qid = qid;
    tr.innerHTML = `
      <td>${escapeHtml(number)}</td>
      <td>${escapeHtml(text)}</td>
      <td>${escapeHtml(group || "–")}</td>
      <td>${escapeHtml(at || "–")}</td>
      <td>
        <input type="text"
               data-prefill="1"
               value="${escapeHtml(pre)}"
               placeholder="valgfrit"
               style="width:100%;padding:.5rem" />
      </td>
    `;
    els.qbody.appendChild(tr);
  });

  els.prefillArea.classList.remove("hidden");
  setListStatus("");
}

/* ---------- Create survey from template ---------- */
async function createFromTemplate(){
  try {
    setStatus("");
    els.result.classList.add("hidden");

    const templateId = els.templateSelect.value;
    if (!templateId) return setStatus("Vælg en template først.");

    const customerName = (els.customerName.value || "").trim();
    if (!customerName) return setStatus("Udfyld kundenavn.");

    const expiresRaw = els.expiresAt.value || "";
    const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;

    const note = (els.note.value || "").trim() || null;

    // prefill per spørgsmål (valgfrit)
    const prefillItems = getPrefillItems();

    setStatus("Opretter kundesurvey…");

    const payload = {
      templateId,
      customerName,
      expiresAt,
      note,
      prefillItems
    };

    const res = await fetchJson("/api/survey-create-from-template", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload)
    });

    showResult({
      code: res.code,
      link: res.link,
      instanceId: res.instanceId || res.crcc8_lch_surveyinstanceid || res.id
    });

    setStatus("Oprettet ✔");
  } catch (e) {
    console.error(e);
    setStatus("Fejl: " + (e.message || e));
  }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  els = {
    templateSelect: $("templateSelect"),
    customerName: $("customerName"),
    expiresAt: $("expiresAt"),
    note: $("note"),
    btnCreate: $("btnCreate"),
    status: $("status"),
    listStatus: $("listStatus"),
    prefillArea: $("prefillArea"),
    qbody: $("qbody"),
    result: $("result"),
    codeOut: $("codeOut"),
    linkOut: $("linkOut"),
    btnCopy: $("btnCopy"),
    btnOpen: $("btnOpen"),
    btnPrefill: $("btnPrefill")
  };

  els.templateSelect.addEventListener("change", async () => {
    await loadTemplateItems(els.templateSelect.value);
  });

  els.btnCreate.addEventListener("click", createFromTemplate);

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

  await loadTemplates();
});
