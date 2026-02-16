// /frontend/assets/adminedit.js
// surveytype + questiongroup (lookup) + conditional dropdown + sortorder

let els = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getEls() {
  return {
    me: document.getElementById('userInfo'),
    login: document.getElementById('btnLogin'),
    logout: document.getElementById('btnLogout'),
    listStatus: document.getElementById('listStatus'),
    tableBody: document.querySelector('#qtable tbody'),
    table: document.getElementById('qtable'),
    form: document.getElementById('questionForm'),
    status: document.getElementById('formStatus'),
    btnReset: document.getElementById('btnReset'),
    btnSave: document.getElementById('btnSave'),

    // form fields
    qid: document.getElementById('qid'),
    qnumber: document.getElementById('qnumber'),
    qtext: document.getElementById('qtext'),
    qexplanation: document.getElementById('qexplanation'),

    // NEW
    qsurveytype: document.getElementById('qsurveytype'),
    qgroup: document.getElementById('qgroup'),

    // sortorder (spørgsmålsrækkefølge indenfor gruppe)
    qsortorder: document.getElementById('qsortorder'),

    qanswertype: document.getElementById('qanswertype'),
    qrequired: document.getElementById('qrequired'),
    qconditionalon: document.getElementById('qconditionalon'),
    qconditionalvalue: document.getElementById('qconditionalvalue')
  };
}

async function getMe() {
  try {
    const r = await fetch('/.auth/me', { cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.clientPrincipal || null;
  } catch {
    return null;
  }
}

function setAuthUI(isAuthed, userLabel) {
  const userInfo = document.getElementById("userInfo");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");

  if (userInfo) userInfo.textContent = userLabel || "";
  if (btnLogin) btnLogin.classList.toggle("hidden", isAuthed);
  if (btnLogout) btnLogout.classList.toggle("hidden", !isAuthed);
}

/* -----------------------
   Label maps (answer-type + group name)
----------------------- */
let answerTypeLabelByValue = new Map();  // number -> label
let groupNameById = new Map();           // guid -> short name

async function loadAnswerTypeLabelMap() {
  answerTypeLabelByValue = new Map();
  try {
    const r = await fetch('/api/questions-metadata', { cache: "no-store" });
    if (!r.ok) throw new Error(`metadata fejl (${r.status})`);
    const meta = await r.json();
    (meta.answertype || []).forEach(o => {
      const v = Number(o.value);
      if (!Number.isNaN(v)) answerTypeLabelByValue.set(v, String(o.label || ""));
    });
  } catch {
    // fallback hvis metadata fejler
    answerTypeLabelByValue.set(100000000, "Ja/Nej");
    answerTypeLabelByValue.set(100000001, "Tal");
    answerTypeLabelByValue.set(100000002, "Tekst");
    answerTypeLabelByValue.set(100000003, "Valgliste");
  }
}

async function loadGroupNameMap() {
  groupNameById = new Map();
  try {
    const r = await fetch('/api/questiongroups-get?top=500', { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    const rows = data?.value || data || [];
    rows.forEach(g => {
      const id = g.crcc8_lch_questiongroupid || g.id;
      const name = g.crcc8_lch_name || g.name || "";     // <-- SHORT NAME
      if (id) groupNameById.set(String(id), String(name));
    });
  } catch {
    // ok hvis den fejler – vi har stadig expand i questions-get
  }
}

function getGroupLabel(q) {
  // 1) expand objekt -> brug NAME (kort)
  const expandedName =
    q.crcc8_lch_questiongroup?.crcc8_lch_name ??
    q.crcc8_lch_questiongroup?.name ??
    null;

  if (expandedName) return String(expandedName);

  // 2) formatted value (hvis du en dag får annotations med)
  const formatted =
    q['_crcc8_lch_questiongroup_value@OData.Community.Display.V1.FormattedValue'] ??
    q['crcc8_lch_questiongroup@OData.Community.Display.V1.FormattedValue'] ??
    null;

  if (formatted) return String(formatted);

  // 3) fallback: map via groupId
  const gid =
    q._crcc8_lch_questiongroup_value ??
    q.crcc8_lch_questiongroupid ??
    null;

  if (gid && groupNameById.has(String(gid))) return groupNameById.get(String(gid));

  return "";
}

function getAnswerTypeLabel(q) {
  // 1) formatted value (hvis annotations er med)
  const formatted = q['crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue'];
  if (formatted) return String(formatted);

  // 2) map tal -> label
  const raw = q.crcc8_lch_answertype;
  const v = raw == null ? null : Number(raw);
  if (v != null && answerTypeLabelByValue.has(v)) return answerTypeLabelByValue.get(v);

  // 3) fallback
  return (raw ?? "").toString();
}

/* -----------------------
   Load answer-type options (dropdown)
----------------------- */
async function loadAnswerTypeOptions() {
  // genbrug samme endpoint, men dropdown skal vise labels
  try {
    const r = await fetch('/api/questions-metadata', { cache: "no-store" });
    if (!r.ok) throw new Error(`metadata fejl (${r.status})`);
    const meta = await r.json();

    if (!els.qanswertype) return;
    els.qanswertype.innerHTML = (meta.answertype || [])
      .map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
      .join('');
  } catch (e) {
    console.warn("Fald tilbage til hardcoded answertype:", e);
    if (!els.qanswertype) return;
    els.qanswertype.innerHTML = `
      <option value="100000000">Ja/Nej</option>
      <option value="100000001">Tal</option>
      <option value="100000002">Tekst</option>
      <option value="100000003">Valgliste</option>
    `;
  }
}

/* -----------------------
   Surveytypes + Groups (lookup)
----------------------- */
let surveyTypesCache = [];   // [{id,type}]
let groupsCache = [];        // [{id,title,name,sortorder,isactive,surveyTypeId}]

async function loadSurveyTypes() {
  if (!els.qsurveytype) return;

  els.qsurveytype.innerHTML = `<option value="">Indlæser…</option>`;
  const r = await fetch('/api/surveytypes-get', { cache: "no-store" });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    console.error("surveytypes-get fejlede:", r.status, text);
    els.qsurveytype.innerHTML = `<option value="">Fejl ved hentning</option>`;
    return;
  }

  const data = await r.json();
  const rows = data?.value || data || [];
  surveyTypesCache = rows.map(x => ({
    id: x.crcc8_lch_surveytypeid || x.id,
    type: x.crcc8_lch_type || x.type || x.name
  }));

  els.qsurveytype.innerHTML =
    `<option value="">Vælg surveytype…</option>` +
    surveyTypesCache.map(st =>
      `<option value="${st.id}">${escapeHtml(st.type)}</option>`
    ).join('');
}

async function loadGroupsForSurveyType(surveyTypeId) {
  if (!els.qgroup) return;

  if (!surveyTypeId) {
    els.qgroup.innerHTML = `<option value="">Vælg surveytype først…</option>`;
    groupsCache = [];
    return;
  }

  els.qgroup.innerHTML = `<option value="">Indlæser…</option>`;

  const r = await fetch(`/api/questiongroups-get?surveyTypeId=${encodeURIComponent(surveyTypeId)}`, { cache: "no-store" });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    console.error("questiongroups-get fejlede:", r.status, text);
    els.qgroup.innerHTML = `<option value="">Fejl ved hentning</option>`;
    groupsCache = [];
    return;
  }

  const data = await r.json();
  const rows = data?.value || data || [];

  groupsCache = rows.map(g => ({
    id: g.crcc8_lch_questiongroupid || g.id,
    title: g.crcc8_lch_title || g.title || "",
    name: g.crcc8_lch_name || g.name || "",     // <-- kort navn
    sortorder: g.crcc8_lch_sortorder ?? g.sortorder ?? 0,
    isactive: g.crcc8_lch_isactive ?? g.isactive ?? true,
    surveyTypeId: surveyTypeId
  }));

  groupsCache.sort((a,b) => (a.sortorder ?? 0) - (b.sortorder ?? 0));

  // dropdown: vis name (kort)
  els.qgroup.innerHTML =
    `<option value="">Vælg gruppe…</option>` +
    groupsCache
      .filter(g => g.isactive !== false)
      .map(g => `<option value="${g.id}">${escapeHtml(g.name || g.title)}</option>`)
      .join('');
}

/* -----------------------
   Conditional questions dropdown (surveytype-filter)
----------------------- */
async function loadConditionalQuestionsForSurveyType(surveyTypeId) {
  if (!els.qconditionalon) return;

  els.qconditionalon.innerHTML = `<option value="">(Ingen)</option>`;
  if (!surveyTypeId) return;

  const r = await fetch(`/api/questions-get?top=500&surveyTypeId=${encodeURIComponent(surveyTypeId)}`, { cache: "no-store" });
  if (!r.ok) {
    console.warn("Kunne ikke hente conditional questions:", r.status);
    return;
  }

  const data = await r.json();
  const rows = (data?.value || data || []);
  rows.sort((a,b) => String(a.crcc8_lch_number||'').localeCompare(String(b.crcc8_lch_number||'')));

  els.qconditionalon.innerHTML =
    `<option value="">(Ingen)</option>` +
    rows.map(q => {
      const id = q.crcc8_lch_questionid;
      const num = q.crcc8_lch_number || '';
      const txt = q.crcc8_lch_text || '';
      return `<option value="${id}">${escapeHtml(num)} — ${escapeHtml(txt)}</option>`;
    }).join('');
}

/* -----------------------
   List questions
----------------------- */
async function listQuestions() {
  if (!els.listStatus || !els.tableBody) return;

  els.listStatus.textContent = 'Indlæser…';

  try {
    const r = await fetch('/api/questions-get?top=500', { cache: "no-store" });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("questions-get fejlede:", r.status, text);
      els.listStatus.textContent = `Fejl: kunne ikke hente spørgsmål (${r.status})`;
      return;
    }

    const data = await r.json();
    const rows = (data?.value || data || []);

    els.tableBody.innerHTML = '';
    rows.forEach(q => {
      const groupLabel = getGroupLabel(q);          // <-- NAME
      const answertypeLabel = getAnswerTypeLabel(q); // <-- LABEL
      const sort = q.crcc8_lch_sortorder ?? "";
      const required = q.crcc8_lch_isrequired ? 'Ja' : 'Nej';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(q.crcc8_lch_number ?? '')}</td>
        <td>${escapeHtml(q.crcc8_lch_text ?? '')}</td>
        <td>${escapeHtml(groupLabel)}</td>
        <td>${escapeHtml(answertypeLabel)}</td>
        <td>${escapeHtml(sort)}</td>
        <td>${escapeHtml(required)}</td>
        <td class="actions">
          <button data-act="edit" data-id="${q.crcc8_lch_questionid}">Redigér</button>
          <button data-act="del" data-id="${q.crcc8_lch_questionid}">Slet</button>
        </td>
      `;
      els.tableBody.appendChild(tr);
    });

    els.listStatus.textContent = '';
  } catch (e) {
    console.error("listQuestions exception:", e);
    els.listStatus.textContent = 'Fejl: kunne ikke hente spørgsmål (exception)';
  }
}

/* -----------------------
   Form read/fill
----------------------- */
function readForm() {
  const surveyTypeId = (els.qsurveytype?.value || "").trim() || null;
  const groupId = (els.qgroup?.value || "").trim() || null;

  return {
    id: els.qid?.value || null,
    number: (els.qnumber?.value || "").trim(),
    text: (els.qtext?.value || "").trim(),
    explanation: (els.qexplanation?.value || "").trim() || null,

    surveytypeid: surveyTypeId,
    questiongroupid: groupId,

    sortorder: (els.qsortorder?.value === "" ? null : parseInt(els.qsortorder.value, 10)),

    answertype: parseInt(els.qanswertype?.value || "0", 10),
    isrequired: !!els.qrequired?.checked,

    conditionalon: (els.qconditionalon?.value || "").trim() || null,
    conditionalvalue: (els.qconditionalvalue?.value || "").trim() || null
  };
}

function fillForm(q) {
  if (!q) return;

  els.qid.value = q.crcc8_lch_questionid || '';
  els.qnumber.value = q.crcc8_lch_number || '';
  els.qtext.value = q.crcc8_lch_text || '';
  els.qexplanation.value = q.crcc8_lch_explanation || '';
  if (q.crcc8_lch_answertype != null) els.qanswertype.value = q.crcc8_lch_answertype;
  els.qrequired.checked = !!q.crcc8_lch_isrequired;
  els.qconditionalvalue.value = q.crcc8_lch_conditionalvalue || '';
  if (els.qsortorder) els.qsortorder.value = (q.crcc8_lch_sortorder ?? "") === null ? "" : (q.crcc8_lch_sortorder ?? "");

  const groupId =
    q._crcc8_lch_questiongroup_value
    ?? q.crcc8_lch_questiongroupid
    ?? q.crcc8_lch_questiongroup?.crcc8_lch_questiongroupid
    ?? q.crcc8_lch_questiongroup?.id
    ?? null;

  const surveyTypeId =
    q._crcc8_lch_surveytype_value
    ?? q.crcc8_lch_surveytypeid
    ?? q.crcc8_lch_questiongroup?._crcc8_lch_surveytype_value
    ?? null;

  // conditional lookup id
  const condId =
    q._crcc8_lch_conditionalon_value
    ?? q.crcc8_lch_conditionalon?._crcc8_lch_questionid_value
    ?? q.crcc8_lch_conditionalon?.crcc8_lch_questionid
    ?? null;

  // Sæt surveytype først, load grupper + conditional, sæt values bagefter
  (async () => {
    if (els.qsurveytype) {
      els.qsurveytype.value = surveyTypeId || "";
      await loadGroupsForSurveyType(els.qsurveytype.value);
      await loadConditionalQuestionsForSurveyType(els.qsurveytype.value);
    }
    if (els.qgroup) els.qgroup.value = groupId || "";
    if (els.qconditionalon) els.qconditionalon.value = condId || "";
  })();
}

function resetForm() {
  els.form?.reset();
  if (els.qid) els.qid.value = '';
  if (els.status) els.status.textContent = '';
  if (els.qsortorder) els.qsortorder.value = "";

  if (els.qsurveytype?.value) {
    loadGroupsForSurveyType(els.qsurveytype.value);
    loadConditionalQuestionsForSurveyType(els.qsurveytype.value);
  } else if (els.qgroup) {
    els.qgroup.innerHTML = `<option value="">Vælg surveytype først…</option>`;
  }
}

/* -----------------------
   Upsert / Delete
----------------------- */
async function upsertQuestion(payload) {
  const isNew = !payload.id;
  if (els.status) els.status.textContent = isNew ? 'Opretter…' : 'Opdaterer…';

  if (!payload.surveytypeid) throw new Error("Vælg en surveytype");
  if (!payload.questiongroupid) throw new Error("Vælg en gruppe");

  const url = isNew ? '/api/questions-post' : `/api/questions-patch?id=${encodeURIComponent(payload.id)}`;
  const method = isNew ? 'POST' : 'PATCH';

  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `${method} fejlede (${r.status})`);
  }

  if (els.status) els.status.textContent = isNew ? 'Oprettet ✔' : 'Opdateret ✔';
  await listQuestions();
  resetForm();
}

async function deleteQuestion(id) {
  if (!confirm('Slet dette spørgsmål?')) return;

  const r = await fetch(`/api/questions-delete?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `DELETE fejlede (${r.status})`);
  }
  await listQuestions();
}

/* -----------------------
   Events
----------------------- */
function wireEvents() {
  if (els.qsurveytype) {
    els.qsurveytype.addEventListener("change", async () => {
      await loadGroupsForSurveyType(els.qsurveytype.value);
      await loadConditionalQuestionsForSurveyType(els.qsurveytype.value);
    });
  }

  if (els.form) {
    els.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const payload = readForm();
        await upsertQuestion(payload);
      } catch (err) {
        console.error(err);
        if (els.status) els.status.textContent = `Fejl: ${err.message}`;
      }
    });
  }

  if (els.btnReset) els.btnReset.addEventListener('click', resetForm);

  if (els.table) {
    els.table.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      const id = btn.dataset.id;
      const act = btn.dataset.act;

      try {
        if (act === 'edit') {
          const r = await fetch(`/api/questions-get?id=${encodeURIComponent(id)}`, { cache: "no-store" });
          if (!r.ok) throw new Error(await r.text());
          const q = await r.json();
          fillForm(q);
          if (els.status) els.status.textContent = 'Indlæste eksisterende post – du redigerer nu';
        } else if (act === 'del') {
          await deleteQuestion(id);
        }
      } catch (err) {
        console.error(err);
        if (els.status) els.status.textContent = `Fejl: ${err.message}`;
      }
    });
  }
}

/* -----------------------
   Init
----------------------- */
async function init() {
  els = getEls();

  const me = await getMe();
  const isAuthed = !!me;
  setAuthUI(isAuthed, me?.userDetails || "");

  if (!isAuthed) {
    if (els.listStatus) els.listStatus.textContent = 'Ikke logget ind.';
    return;
  }

  wireEvents();

  // labels først => så kan listen vise tekst (ikke tal)
  await Promise.all([
    loadAnswerTypeLabelMap(),
    loadGroupNameMap()
  ]);

  await loadAnswerTypeOptions();
  await loadSurveyTypes();

  // auto-vælg hvis kun én surveytype
  if (els.qsurveytype && els.qsurveytype.options.length === 2) {
    els.qsurveytype.selectedIndex = 1;
  }

  await loadGroupsForSurveyType(els.qsurveytype?.value || "");
  await loadConditionalQuestionsForSurveyType(els.qsurveytype?.value || "");
  await listQuestions();
}

document.addEventListener("DOMContentLoaded", init);
