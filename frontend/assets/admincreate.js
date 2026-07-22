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

/* ---------- Kunde-autocomplete (COREDATA) ---------- */
let acTimer = null;
let acItems = [];
let acActiveIndex = -1;

function hideSuggestions(){
  els.customerSuggest.classList.add("hidden");
  els.customerSuggest.innerHTML = "";
  acItems = [];
  acActiveIndex = -1;
}

function renderSuggestions(items){
  acItems = items;
  acActiveIndex = -1;

  if (!items.length){
    els.customerSuggest.innerHTML = `<div class="empty">Ingen kunder fundet</div>`;
    els.customerSuggest.classList.remove("hidden");
    return;
  }

  els.customerSuggest.innerHTML = items.map((k, i) => `
    <div class="item" data-index="${i}">
      <div class="navn">${escapeHtml(k.navn || "(uden navn)")}</div>
      <div class="meta">${escapeHtml(k.kundenr || "")}${k.omraade ? " · " + escapeHtml(k.omraade) : ""}</div>
    </div>
  `).join("");
  els.customerSuggest.classList.remove("hidden");

  els.customerSuggest.querySelectorAll(".item").forEach(el => {
    el.addEventListener("click", () => selectCustomer(Number(el.dataset.index)));
  });
}

function selectCustomer(index){
  const k = acItems[index];
  if (!k) return;
  els.customerName.value = k.kundenr ? `${k.navn} (${k.kundenr})` : k.navn;
  els.customerName.dataset.kundeId = k.id || "";
  els.customerName.dataset.kundenr = k.kundenr || "";
  hideSuggestions();
}

async function searchCustomers(q){
  try {
    const data = await fetchJson(`/api/kunder-search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    renderSuggestions(data?.kunder || []);
  } catch (e) {
    console.error("kunder-search fejl:", e);
    els.customerSuggest.innerHTML = `<div class="empty">Kunne ikke hente kundeliste (${escapeHtml(e.message)})</div>`;
    els.customerSuggest.classList.remove("hidden");
  }
}

function onCustomerInput(){
  // hvis brugeren skriver videre, er et tidligere valg ikke længere gyldigt
  delete els.customerName.dataset.kundeId;
  delete els.customerName.dataset.kundenr;

  const q = els.customerName.value.trim();
  clearTimeout(acTimer);

  if (q.length < 2){
    hideSuggestions();
    return;
  }

  acTimer = setTimeout(() => searchCustomers(q), 250);
}

function onCustomerKeydown(e){
  if (els.customerSuggest.classList.contains("hidden") || !acItems.length) return;

  const nodes = [...els.customerSuggest.querySelectorAll(".item")];

  if (e.key === "ArrowDown"){
    e.preventDefault();
    acActiveIndex = Math.min(acActiveIndex + 1, nodes.length - 1);
  } else if (e.key === "ArrowUp"){
    e.preventDefault();
    acActiveIndex = Math.max(acActiveIndex - 1, 0);
  } else if (e.key === "Enter"){
    if (acActiveIndex >= 0){
      e.preventDefault();
      selectCustomer(acActiveIndex);
    }
    return;
  } else if (e.key === "Escape"){
    hideSuggestions();
    return;
  } else {
    return;
  }

  nodes.forEach((n, i) => n.classList.toggle("active", i === acActiveIndex));
}

/* ---------- Skema (template) – auto-valgt ---------- */
async function loadTemplates(){
  els.templateInfo.textContent = "Indlæser…";

  const data = await fetchJson("/api/templates-get?top=500", { cache: "no-store" });
  const rows = data?.value || data || [];

  const getId = (t) =>
    t.crcc8_lch_surveytemplateid ||
    t.crcc8_lch_surveytemplate ||
    t.lch_surveytemplateid ||
    t.id ||
    null;

  const getName = (t) =>
    t.crcc8_lch_name ||
    t.lch_name ||
    t.name ||
    t["crcc8_lch_name@OData.Community.Display.V1.FormattedValue"] ||
    "";

  const getActive = (t) =>
    t.crcc8_lch_isactive ??
    t.lch_isactive ??
    t.isactive ??
    true;

  const active = rows.filter(t => getActive(t) !== false && getId(t));

  if (!active.length){
    els.templateInfo.textContent = "Intet aktivt skema fundet – kontakt IT.";
    setStatus("Kan ikke oprette: intet aktivt skema.");
    return;
  }

  // Foretræk et skema der hedder noget med "kundeinfo", ellers det første aktive
  const preferred =
    active.find(t => /kundeinfo/i.test(getName(t))) || active[0];

  const id = String(getId(preferred));
  const name = (getName(preferred) || "Kundeinfo").trim();

  els.templateInfo.textContent = name;
  els.templateSelect.innerHTML = `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
  els.templateSelect.value = id;

  await loadTemplateItems(id);
}

/* ---------- Load template items + render prefill ---------- */
async function loadTemplateItems(templateId){
  if (!templateId) {
    els.prefillArea.classList.add("hidden");
    els.qbody.innerHTML = "";
    setListStatus("Intet skema valgt.");
    return;
  }

  setListStatus("Indlæser spørgsmål…");
  els.prefillArea.classList.add("hidden");
  els.qbody.innerHTML = "";

  let data;
  try {
    data = await fetchJson(`/api/templateitems-get?templateId=${encodeURIComponent(templateId)}`, { cache: "no-store" });
  } catch (e) {
    console.error("templateitems-get fejl:", e);
    setListStatus(`Fejl: kunne ikke hente spørgsmål (${e.message})`);
    return;
  }

  const rows = data?.value || data || [];
  if (!rows.length) {
    setListStatus("Dette skema har ingen spørgsmål.");
    return;
  }

  const getQid = (x) =>
    x.questionId ||
    x.crcc8_lch_questionid ||
    x._crcc8_lch_question_value ||
    x.crcc8_lch_question?.crcc8_lch_questionid ||
    null;

  const getNumber = (x) => x.number || x.crcc8_lch_number || x.crcc8_lch_question?.crcc8_lch_number || "";
  const getText = (x) => x.text || x.crcc8_lch_text || x.crcc8_lch_question?.crcc8_lch_text || "";
  const getGroup = (x) => x.group || x.groupLabel || x.crcc8_lch_group || x.crcc8_lch_questiongroup || "";
  const getAT = (x) => x.answertypeLabel || x.answertype || x.crcc8_lch_answertype || "";
  const getPref = (x) => x.defaultPrefillText || x.crcc8_lch_defaultprefilltext || "";

  rows.forEach(item=>{
    const qid = getQid(item);
    if (!qid) return;

    const tr = document.createElement("tr");
    tr.dataset.qid = String(qid);
    tr.innerHTML = `
      <td>${escapeHtml(getNumber(item))}</td>
      <td>${escapeHtml(getText(item))}</td>
      <td>${escapeHtml(getGroup(item) || "–")}</td>
      <td>${escapeHtml(getAT(item) || "–")}</td>
      <td>
        <input type="text"
               data-prefill="1"
               value="${escapeHtml(getPref(item))}"
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
    if (!templateId) return setStatus("Intet skema valgt.");

    const customerName = (els.customerName.value || "").trim();
    if (!customerName) return setStatus("Vælg en kunde.");

    const expiresRaw = els.expiresAt.value || "";
    const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;

    const note = (els.note.value || "").trim() || null;

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
    templateRow: $("templateRow"),
    templateSelect: $("templateSelect"),
    templateInfo: $("templateInfo"),
    customerName: $("customerName"),
    customerSuggest: $("customerSuggest"),
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

  els.customerName.addEventListener("input", onCustomerInput);
  els.customerName.addEventListener("keydown", onCustomerKeydown);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete")) hideSuggestions();
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
