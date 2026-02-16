// /frontend/assets/adminedit.js
// Opdateret: surveytype + questiongroup (lookup) i stedet for lch_group (optionset)

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
    qsortorder: document.getElementById('qsortorder'),

    // form fields
    qid: document.getElementById('qid'),
    qnumber: document.getElementById('qnumber'),
    qtext: document.getElementById('qtext'),
    qexplanation: document.getElementById('qexplanation'),

    // NEW
    qsurveytype: document.getElementById('qsurveytype'),

    // now means questiongroup lookup id
    qgroup: document.getElementById('qgroup'),

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

async function loadConditionalQuestionsForSurveyType(surveyTypeId) {
  if (!els.qconditionalon) return;

  // start-state
  els.qconditionalon.innerHTML = `<option value="">(Ingen)</option>`;

  if (!surveyTypeId) return;

  // kræver at API kan filtrere på surveytype (se punkt C)
  const st = String(surveyTypeId || "").replace(/[{}]/g, "");
  const r = await fetch(`/api/questions-get?top=500&surveyTypeId=${encodeURIComponent(st)}`, { cache: "no-store" });

  if (!r.ok) {
    console.warn("Kunne ikke hente conditional questions:", r.status);
    return;
  }

  const data = await r.json();
  const rows = (data?.value || data || []);

  // valgfrit: sorter efter nummer
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

function setAuthUI(isAuthed, userLabel) {
  const userInfo = document.getElementById("userInfo");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");

  if (userInfo) userInfo.textContent = userLabel || "";
  if (btnLogin) btnLogin.classList.toggle("hidden", isAuthed);
  if (btnLogout) btnLogout.classList.toggle("hidden", !isAuthed);
}

/* -----------------------
   Load option sets (only answertype now)
----------------------- */
async function loadAnswerTypeOptions() {
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
   Load surveytypes + groups (lookup)
----------------------- */
let surveyTypesCache = [];   // [{id,type}]
let groupsCache = [];        // [{id,title,sortorder,isactive,surveyTypeId}]

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
    title: g.crcc8_lch_title || g.title || g.crcc8_lch_name || "",
    sortorder: g.crcc8_lch_sortorder ?? g.sortorder ?? 0,
    isactive: g.crcc8_lch_isactive ?? g.isactive ?? true,
    surveyTypeId: surveyTypeId
  }));

  groupsCache.sort((a,b) => (a.sortorder ?? 0) - (b.sortorder ?? 0));

  els.qgroup.innerHTML =
    `<option value="">Vælg gruppe…</option>` +
    groupsCache
      .filter(g => g.isactive !== false)
      .map(g => `<option value="${g.id}">${escapeHtml(g.title)}</option>`)
      .join('');
}

/* -----------------------
   List questions
----------------------- */
async function listQuestions() {
  if (!els.listStatus || !els.tableBody) return;

  els.listStatus.textContent = 'Indlæser…';

  try {
    // For at kunne vise group-title kræver det at /api/questions-get returnerer
    // enten formatted value for lookup eller et expand på questiongroup.
    const r = await fetch('/api/questions-get?top=200', { cache: "no-store" });

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
      const groupLabel =
        // lookup formatted value hvis din API sender den med
        q['crcc8_lch_questiongroup@OData.Community.Display.V1.FormattedValue']
        // eller hvis din API sender expand objekt
        ?? q.crcc8_lch_questiongroup?.crcc8_lch_title
        ?? q.crcc8_lch_questiongroup?.lch_title
        ?? '';

      const tr = document.createElement('tr');
const sort = q.crcc8_lch_sortorder ?? "";

tr.innerHTML = `
  <td>${escapeHtml(q.crcc8_lch_number ?? '')}</td>
  <td>${escapeHtml(q.crcc8_lch_text ?? '')}</td>
  <td>${escapeHtml(groupLabel)}</td>
  <td>${escapeHtml(q['crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue'] ?? q.crcc8_lch_answertype ?? '')}</td>
  <td>${escapeHtml(sort)}</td>
  <td>${q.crcc8_lch_isrequired ? 'Ja' : 'Nej'}</td>
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

  // Lookup: questiongroup id (kan ligge på flere måder alt efter din API)
  const groupId =
    q._crcc8_lch_questiongroup_value
    ?? q.crcc8_lch_questiongroupid
    ?? q.crcc8_lch_questiongroup?.crcc8_lch_questiongroupid
    ?? q.crcc8_lch_questiongroup?.id
    ?? null;

  // Lookup: surveytype id (fra group -> surveytype) hvis din API giver den
  const surveyTypeId =
    q._crcc8_lch_surveytype_value
    ?? q.crcc8_lch_surveytypeid
    ?? q.crcc8_lch_questiongroup?._crcc8_lch_surveytype_value
    ?? q.crcc8_lch_questiongroup?.crcc8_lch_surveytypeid
    ?? null;

const condId =
  q._crcc8_lch_conditionalon_value
  ?? q.crcc8_lch_conditionalon?.crcc8_lch_questionid
  ?? null;

els.qconditionalon.value = condId || "";

if (els.qsortorder) els.qsortorder.value = (q.crcc8_lch_sortorder ?? "");

  // Sæt surveytype først, og reload grupper, derefter sæt gruppe
(async () => {
  if (els.qsurveytype) {
    els.qsurveytype.value = surveyTypeId || "";
    await loadGroupsForSurveyType(els.qsurveytype.value);
    await loadConditionalQuestionsForSurveyType(els.qsurveytype.value);
  }
  if (els.qgroup) {
    els.qgroup.value = groupId || "";
  }
  if (els.qconditionalon) {
    els.qconditionalon.value = condId || "";
  }
})();
}

function resetForm() {
  els.form?.reset();
  if (els.qid) els.qid.value = '';
  if (els.status) els.status.textContent = '';

  // hvis surveytype er valgt, reload grupper så dropdown ikke står tom
  if (els.qsurveytype?.value) {
    loadGroupsForSurveyType(els.qsurveytype.value);
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

  // Valider: skal have group + surveytype (du kan slække hvis du vil)
  if (!payload.surveytypeid) throw new Error("Vælg en surveytype");
  if (!payload.questiongroupid) throw new Error("Vælg en gruppe");

  const url = isNew
    ? '/api/questions-post'
    : `/api/questions-patch?id=${encodeURIComponent(payload.id)}`;

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

  if (els.btnReset) {
    els.btnReset.addEventListener('click', resetForm);
  }

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
  const label = me?.userDetails || "";

  setAuthUI(isAuthed, label);

  if (!isAuthed) {
    if (els.listStatus) els.listStatus.textContent = 'Ikke logget ind.';
    return;
  }

  wireEvents();

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
