// /frontend/assets/adminedit.js
const els = {
  me: document.getElementById('userInfo'),
  login: document.getElementById('btnLogin'),
  logout: document.getElementById('btnLogout'),
  listStatus: document.getElementById('listStatus'),
  tableBody: document.querySelector('#qtable tbody'),
  form: document.getElementById('questionForm'),
  status: document.getElementById('formStatus'),
  btnReset: document.getElementById('btnReset'),
  btnSave: document.getElementById('btnSave'),
  qid: document.getElementById('qid'),
  qnumber: document.getElementById('qnumber'),
  qtext: document.getElementById('qtext'),
  qexplanation: document.getElementById('qexplanation'),
  qgroup: document.getElementById('qgroup'),
  qanswertype: document.getElementById('qanswertype'),
  qrequired: document.getElementById('qrequired'),
  qconditionalon: document.getElementById('qconditionalon'),
  qconditionalvalue: document.getElementById('qconditionalvalue')
};

async function getMe() {
  try {
    const r = await fetch('/.auth/me');
    if (!r.ok) return null;
    const data = await r.json();
    const clientPrincipal = data?.clientPrincipal;
    return clientPrincipal || null;
  } catch { return null; }
}

function setAuthUI(isAuthed, userLabel) {
  const userInfo = document.getElementById("userInfo");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");

  if (userInfo) userInfo.textContent = userLabel || "";

  if (btnLogin) btnLogin.classList.toggle("hidden", isAuthed);
  if (btnLogout) btnLogout.classList.toggle("hidden", !isAuthed);
}


async function loadOptionSets() {
  // Henter picklist options fra Dataverse via metadata endpoint
  try {
    const r = await fetch('/api/questions-metadata');
    if (!r.ok) throw new Error('metadata fejl');
    const meta = await r.json();
    // Udfyld gruppe
    els.qgroup.innerHTML = meta.group
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    // Udfyld svar-type
    els.qanswertype.innerHTML = meta.answertype
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  } catch {
    // fallback hvis metadata ikke findes – tilpas labels/values manuelt
    els.qgroup.innerHTML = `
      <option value="100000000">Generelt</option>
      <option value="100000001">Teknisk</option>
    `;
    els.qanswertype.innerHTML = `
      <option value="100000000">Ja/Nej</option>
      <option value="100000001">Tal</option>
      <option value="100000002">Tekst</option>
      <option value="100000003">Valgliste</option>
    `;
  }
}

async function listQuestions() {
  els.listStatus.textContent = 'Indlæser…';
  const r = await fetch('/api/questions-get?top=200');
  const data = await r.json();
  els.tableBody.innerHTML = '';
  (data?.value || data || []).forEach(q => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${q.crcc8_lch_number ?? ''}</td>
      <td>${q.crcc8_lch_text ?? ''}</td>
      <td>${q['crcc8_lch_group@OData.Community.Display.V1.FormattedValue'] ?? q.crcc8_lch_group ?? ''}</td>
      <td>${q['crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue'] ?? q.crcc8_lch_answertype ?? ''}</td>
      <td>${q.crcc8_lch_isrequired ? 'Ja' : 'Nej'}</td>
      <td class="actions">
        <button data-act="edit" data-id="${q.crcc8_lch_questionid}">Redigér</button>
        <button data-act="del" data-id="${q.crcc8_lch_questionid}">Slet</button>
      </td>
    `;
    els.tableBody.appendChild(tr);
  });
  els.listStatus.textContent = '';
}

function readForm() {
  return {
    id: els.qid.value || null,
    number: els.qnumber.value.trim(),
    text: els.qtext.value.trim(),
    explanation: els.qexplanation.value.trim() || null,
    group: parseInt(els.qgroup.value, 10),
    answertype: parseInt(els.qanswertype.value, 10),
    isrequired: !!els.qrequired.checked,
    conditionalon: els.qconditionalon.value.trim() || null,
    conditionalvalue: els.qconditionalvalue.value.trim() || null
  };
}

function fillForm(q) {
  els.qid.value = q.crcc8_lch_questionid || '';
  els.qnumber.value = q.crcc8_lch_number || '';
  els.qtext.value = q.crcc8_lch_text || '';
  els.qexplanation.value = q.crcc8_lch_explanation || '';
  if (q.crcc8_lch_group != null) els.qgroup.value = q.crcc8_lch_group;
  if (q.crcc8_lch_answertype != null) els.qanswertype.value = q.crcc8_lch_answertype;
  els.qrequired.checked = !!q.crcc8_lch_isrequired;
  els.qconditionalon.value = q.crcc8_lch_conditionalon || '';
  els.qconditionalvalue.value = q.crcc8_lch_conditionalvalue || '';
}

function resetForm() {
  els.form.reset();
  els.qid.value = '';
  els.status.textContent = '';
}

async function upsertQuestion(payload) {
  const isNew = !payload.id;
  els.status.textContent = isNew ? 'Opretter…' : 'Opdaterer…';
  const url = isNew ? '/api/questions-post' : `/api/questions-patch?id=${encodeURIComponent(payload.id)}`;
  const method = isNew ? 'POST' : 'PATCH';
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
  els.status.textContent = isNew ? 'Oprettet ✔' : 'Opdateret ✔';
  await listQuestions();
  resetForm();
}

async function deleteQuestion(id) {
  if (!confirm('Slet dette spørgsmål?')) return;
  const r = await fetch(`/api/questions-delete?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  await listQuestions();
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = readForm();
    await upsertQuestion(payload);
  } catch (err) {
    els.status.textContent = `Fejl: ${err.message}`;
  }
});

els.btnReset.addEventListener('click', resetForm);

document.querySelector('#qtable').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  if (act === 'edit') {
    // hent enkeltpost
    const r = await fetch(`/api/questions-get?id=${encodeURIComponent(id)}`);
    const q = await r.json();
    fillForm(q);
    els.status.textContent = 'Indlæste eksisterende post – du redigerer nu';
  } else if (act === 'del') {
    await deleteQuestion(id);
  }
});

(async function init() {
  const me = await getMe();
  setAuthUI(me);
  if (!me) return; // 401 → SWA sender til login
  await loadOptionSets();
  await listQuestions();
})();
