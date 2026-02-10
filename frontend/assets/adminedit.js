// /frontend/assets/adminedit.js
// Robust version til brug sammen med auth-guard (auth-guard viser først #app når du er logget ind)

let els = null;

function getEls() {
  return {
    me: document.getElementById('userInfo'),
    login: document.getElementById('btnLogin'),     // kan være null (hvis du ikke bruger dem længere)
    logout: document.getElementById('btnLogout'),   // kan være null
    listStatus: document.getElementById('listStatus'),
    tableBody: document.querySelector('#qtable tbody'),
    table: document.getElementById('qtable'),
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
  // Null-safe (så den aldrig kan crashe)
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
    const r = await fetch('/api/questions-metadata', { cache: "no-store" });
    if (!r.ok) throw new Error(`metadata fejl (${r.status})`);
    const meta = await r.json();

    if (!els.qgroup || !els.qanswertype) return;

    // Udfyld gruppe
    els.qgroup.innerHTML = (meta.group || [])
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');

    // Udfyld svar-type
    els.qanswertype.innerHTML = (meta.answertype || [])
      .map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  } catch (e) {
    console.warn("Fald tilbage til hardcoded option sets:", e);

    if (!els.qgroup || !els.qanswertype) return;

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
  if (!els.listStatus || !els.tableBody) return;

  els.listStatus.textContent = 'Indlæser…';

  try {
    const r = await fetch('/api/questions-get?top=200', { cache: "no-store" });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("questions-get fejlede:", r.status, text);
      els.listStatus.textContent = `Fejl: kunne ikke hente spørgsmål (${r.status})`;
      return;
    }

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
  } catch (e) {
    console.error("listQuestions exception:", e);
    els.listStatus.textContent = 'Fejl: kunne ikke hente spørgsmål (exception)';
  }
}

function readForm() {
  return {
    id: els.qid?.value || null,
    number: (els.qnumber?.value || "").trim(),
    text: (els.qtext?.value || "").trim(),
    explanation: (els.qexplanation?.value || "").trim() || null,
    group: parseInt(els.qgroup?.value || "0", 10),
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
  if (q.crcc8_lch_group != null) els.qgroup.value = q.crcc8_lch_group;
  if (q.crcc8_lch_answertype != null) els.qanswertype.value = q.crcc8_lch_answertype;
  els.qrequired.checked = !!q.crcc8_lch_isrequired;
  els.qconditionalon.value = q.crcc8_lch_conditionalon || '';
  els.qconditionalvalue.value = q.crcc8_lch_conditionalvalue || '';
}

function resetForm() {
  els.form?.reset();
  if (els.qid) els.qid.value = '';
  if (els.status) els.status.textContent = '';
}

async function upsertQuestion(payload) {
  const isNew = !payload.id;
  if (els.status) els.status.textContent = isNew ? 'Opretter…' : 'Opdaterer…';

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

async function init() {
  els = getEls();

  // Hvis du kører auth-guard på siden, ER du typisk allerede logget ind når #app vises.
  // Men vi holder den her for at udfylde userInfo + understøtte brug uden guard.
  const me = await getMe();
  const isAuthed = !!me;
  const label = me?.userDetails || "";

  setAuthUI(isAuthed, label);

  if (!isAuthed) {
    // Hvis SWA routes kræver authenticated, vil server typisk redirecte/401 før du når hertil.
    // Men vi stopper pænt.
    if (els.listStatus) els.listStatus.textContent = 'Ikke logget ind.';
    return;
  }

  wireEvents();
  await loadOptionSets();
  await listQuestions();
}

// Sørg for DOM er klar
document.addEventListener("DOMContentLoaded", init);
