// /frontend/assets/adminedit.js
// spørgsmålsgruppe (lookup) + betinget-af dropdown + sortering

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

    qgroup: document.getElementById('qgroup'),

    qsortorder: document.getElementById('qsortorder'),

    qanswertype: document.getElementById('qanswertype'),
    qrequired: document.getElementById('qrequired'),
    qconditionalon: document.getElementById('qconditionalon'),
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
let groupNameById = new Map();           // guid -> titel

async function loadAnswerTypeLabelMap() {
  answerTypeLabelByValue = new Map();
  try {
    const r = await fetch('/api/questions-metadata', { cache: "no-store" });
    if (!r.ok) throw new Error(`metadata fejl (${r.status})`);
    const meta = await r.json();
    (meta.svartype || []).forEach(o => {
      const v = Number(o.value);
      if (!Number.isNaN(v)) answerTypeLabelByValue.set(v, String(o.label || ""));
    });
  } catch {
    // fallback hvis metadata fejler
    answerTypeLabelByValue.set(0, "Tekst");
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
      const id = g.cr175_lch_kundeinfo_spoergsmaalsgruppeid;
      const title = g.cr175_lch_titel || "";
      if (id) groupNameById.set(String(id), String(title));
    });
  } catch {
    // ok hvis den fejler – vi har stadig expand i questions-get
  }
}

function getGroupLabel(q) {
  const expandedTitle = q.cr175_lch_spoergsmaalsgruppe?.cr175_lch_titel ?? null;
  if (expandedTitle) return String(expandedTitle);

  const formatted =
    q['_cr175_lch_spoergsmaalsgruppe_value@OData.Community.Display.V1.FormattedValue'] ?? null;
  if (formatted) return String(formatted);

  const gid = q._cr175_lch_spoergsmaalsgruppe_value ?? null;
  if (gid && groupNameById.has(String(gid))) return groupNameById.get(String(gid));

  return "";
}

function getAnswerTypeLabel(q) {
  const formatted = q['cr175_lch_svartype@OData.Community.Display.V1.FormattedValue'];
  if (formatted) return String(formatted);

  const raw = q.cr175_lch_svartype;
  const v = raw == null ? null : Number(raw);
  if (v != null && answerTypeLabelByValue.has(v)) return answerTypeLabelByValue.get(v);

  return (raw ?? "").toString();
}

/* -----------------------
   Load answer-type options (dropdown)
----------------------- */
async function loadAnswerTypeOptions() {
  try {
    const r = await fetch('/api/questions-metadata', { cache: "no-store" });
    if (!r.ok) throw new Error(`metadata fejl (${r.status})`);
    const meta = await r.json();

    if (!els.qanswertype) return;
    els.qanswertype.innerHTML = (meta.svartype || [])
      .map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
      .join('');
  } catch (e) {
    console.warn("Kunne ikke hente svar-typer fra metadata:", e);
  }
}

/* -----------------------
   Groups (lookup)
----------------------- */
let groupsCache = [];

async function loadGroups() {
  if (!els.qgroup) return;

  els.qgroup.innerHTML = `<option value="">Indlæser…</option>`;

  const r = await fetch('/api/questiongroups-get?top=500', { cache: "no-store" });

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
    id: g.cr175_lch_kundeinfo_spoergsmaalsgruppeid,
    title: g.cr175_lch_titel || "",
    sortorder: g.cr175_lch_sorteringsnummer ?? 0,
    isactive: g.cr175_lch_aktiv ?? true,
  }));

  groupsCache.sort((a, b) => (a.sortorder ?? 0) - (b.sortorder ?? 0));

  els.qgroup.innerHTML =
    `<option value="">Vælg gruppe…</option>` +
    groupsCache
      .filter(g => g.isactive !== false)
      .map(g => `<option value="${g.id}">${escapeHtml(g.title)}</option>`)
      .join('');
}

/* -----------------------
   Conditional questions dropdown
----------------------- */
async function loadConditionalQuestions(excludeId) {
  if (!els.qconditionalon) return;

  els.qconditionalon.innerHTML = `<option value="">(Ingen)</option>`;

  const r = await fetch(`/api/questions-get?top=500`, { cache: "no-store" });
  if (!r.ok) {
    console.warn("Kunne ikke hente betinget-af spørgsmål:", r.status);
    return;
  }

  const data = await r.json();
  const rows = (data?.value || data || [])
    .filter(q => q.cr175_lch_kundeinfo_spoergsmaalid !== excludeId);

  rows.sort((a, b) => String(a.cr175_lch_nummer || '').localeCompare(String(b.cr175_lch_nummer || '')));

  els.qconditionalon.innerHTML =
    `<option value="">(Ingen)</option>` +
    rows.map(q => {
      const id = q.cr175_lch_kundeinfo_spoergsmaalid;
      const num = q.cr175_lch_nummer || '';
      const txt = q.cr175_lch_spoergsmaalstekst || '';
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
      const groupLabel = getGroupLabel(q);
      const answertypeLabel = getAnswerTypeLabel(q);
      const sort = q.cr175_lch_sorteringsnummer ?? "";
      const required = q.cr175_lch_paakraevet ? 'Ja' : 'Nej';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(q.cr175_lch_nummer ?? '')}</td>
        <td>${escapeHtml(q.cr175_lch_spoergsmaalstekst ?? '')}</td>
        <td>${escapeHtml(groupLabel)}</td>
        <td>${escapeHtml(answertypeLabel)}</td>
        <td>${escapeHtml(sort)}</td>
        <td>${escapeHtml(required)}</td>
        <td class="actions">
          <button data-act="edit" data-id="${q.cr175_lch_kundeinfo_spoergsmaalid}">Redigér</button>
          <button data-act="del" data-id="${q.cr175_lch_kundeinfo_spoergsmaalid}">Slet</button>
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
  const groupId = (els.qgroup?.value || "").trim() || null;

  return {
    id: els.qid?.value || null,
    number: (els.qnumber?.value || "").trim(),
    text: (els.qtext?.value || "").trim(),
    explanation: (els.qexplanation?.value || "").trim() || null,

    questiongroupid: groupId,

    sortorder: (els.qsortorder?.value === "" ? null : parseInt(els.qsortorder.value, 10)),

    answertype: parseInt(els.qanswertype?.value || "0", 10),
    isrequired: !!els.qrequired?.checked,

    conditionalon: (els.qconditionalon?.value || "").trim() || null,
  };
}

function fillForm(q) {
  if (!q) return;

  const qid = q.cr175_lch_kundeinfo_spoergsmaalid || '';

  els.qid.value = qid;
  els.qnumber.value = q.cr175_lch_nummer || '';
  els.qtext.value = q.cr175_lch_spoergsmaalstekst || '';
  els.qexplanation.value = q.cr175_lch_forklaring || '';
  if (q.cr175_lch_svartype != null) els.qanswertype.value = q.cr175_lch_svartype;
  els.qrequired.checked = !!q.cr175_lch_paakraevet;
  if (els.qsortorder) els.qsortorder.value = (q.cr175_lch_sorteringsnummer ?? "") === null ? "" : (q.cr175_lch_sorteringsnummer ?? "");

  const groupId =
    q._cr175_lch_spoergsmaalsgruppe_value
    ?? q.cr175_lch_spoergsmaalsgruppe?.cr175_lch_kundeinfo_spoergsmaalsgruppeid
    ?? null;

  const condId =
    q._cr175_lch_betingetaf_value
    ?? null;

  (async () => {
    await loadConditionalQuestions(qid);
    if (els.qgroup) els.qgroup.value = groupId || "";
    if (els.qconditionalon) els.qconditionalon.value = condId || "";
  })();
}

function resetForm() {
  els.form?.reset();
  if (els.qid) els.qid.value = '';
  if (els.status) els.status.textContent = '';
  if (els.qsortorder) els.qsortorder.value = "";
  loadConditionalQuestions(null);
}

/* -----------------------
   Upsert / Delete
----------------------- */
async function upsertQuestion(payload) {
  const isNew = !payload.id;
  if (els.status) els.status.textContent = isNew ? 'Opretter…' : 'Opdaterer…';

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

          // Hop til toppen af siden, så formularen er synlig uden at skulle rulle op
          window.scrollTo({ top: 0, behavior: "smooth" });
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

  await Promise.all([
    loadAnswerTypeLabelMap(),
    loadGroupNameMap()
  ]);

  await loadAnswerTypeOptions();
  await loadGroups();
  await loadConditionalQuestions(null);
  await listQuestions();
}

document.addEventListener("DOMContentLoaded", init);
