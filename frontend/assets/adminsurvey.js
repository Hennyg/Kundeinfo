const els = {
  me: document.getElementById('userInfo'),
  login: document.getElementById('btnLogin'),
  logout: document.getElementById('btnLogout'),

  listStatus: document.getElementById('listStatus'),
  qbody: document.getElementById('qbody'),

  expiresAt: document.getElementById('expiresAt'),
  templateVersion: document.getElementById('templateVersion'),
  note: document.getElementById('note'),

  btnReload: document.getElementById('btnReload'),
  btnCreate: document.getElementById('btnCreate'),
  status: document.getElementById('status'),

  result: document.getElementById('result'),
  resultEmpty: document.getElementById('resultEmpty'),
  codeOut: document.getElementById('codeOut'),
  linkOut: document.getElementById('linkOut'),
  btnCopy: document.getElementById('btnCopy'),
  btnOpen: document.getElementById('btnOpen'),
};

async function getMe() {
  try {
    const r = await fetch('/.auth/me');
    if (!r.ok) return null;
    const data = await r.json();
    return data?.clientPrincipal || null;
  } catch { return null; }
}

function setAuthUI(me) {
  if (me) {
    els.me.textContent = `${me.userDetails}`;
    els.login.classList.add('hidden');
    els.logout.classList.remove('hidden');
  } else {
    els.me.textContent = 'Ikke logget ind';
    els.login.classList.remove('hidden');
    els.logout.classList.add('hidden');
  }
}

function isoOrNullFromDatetimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return d.toISOString();
}

function showResult({ code, token }) {
  const origin = location.origin;
  const link = `${origin}/kundeinfo.html?t=${encodeURIComponent(token)}`;

  els.codeOut.textContent = code;
  els.linkOut.value = link;
  els.btnOpen.href = link;

  els.result.classList.remove('hidden');
  els.resultEmpty.classList.add('hidden');
}

async function listQuestionsForPick() {
  els.listStatus.textContent = 'Indlæser…';
  els.qbody.innerHTML = '';

  // Genbrug dit eksisterende endpoint
  const r = await fetch('/api/questions-get?top=500');
  const data = await r.json();
  const rows = (data?.value || data || []);

  // sortér på crcc8_lch_number hvis du bruger Q001/Q002
  rows.sort((a, b) => String(a.crcc8_lch_number || '').localeCompare(String(b.crcc8_lch_number || '')));

  for (const q of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="qpick" data-id="${q.crcc8_lch_questionid}" checked></td>
      <td>${q.crcc8_lch_number ?? ''}</td>
      <td>${q.crcc8_lch_text ?? ''}</td>
      <td>${q['crcc8_lch_group@OData.Community.Display.V1.FormattedValue'] ?? q.crcc8_lch_group ?? ''}</td>
      <td>${q['crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue'] ?? q.crcc8_lch_answertype ?? ''}</td>
      <td>${q.crcc8_lch_isrequired ? 'Ja' : 'Nej'}</td>
    `;
    els.qbody.appendChild(tr);
  }

  els.listStatus.textContent = rows.length ? '' : 'Ingen spørgsmål fundet.';
}

async function createSurveyInstance() {
  const questionIds = [...document.querySelectorAll('.qpick:checked')].map(x => x.dataset.id);

  if (questionIds.length === 0) {
    alert('Vælg mindst ét spørgsmål.');
    return;
  }

  const payload = {
    questionIds,
    expiresAt: isoOrNullFromDatetimeLocal(els.expiresAt.value),
    templateVersion: parseInt(els.templateVersion.value || '1', 10),
    note: (els.note.value || '').trim() || null
  };

  els.status.textContent = 'Opretter survey…';

  const r = await fetch('/api/survey-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    els.status.textContent = `Fejl: ${await r.text()}`;
    return;
  }

  const res = await r.json(); // forvent: { code, token, id }
  els.status.textContent = 'Oprettet ✔';
  showResult(res);
}

els.btnReload.addEventListener('click', listQuestionsForPick);
els.btnCreate.addEventListener('click', createSurveyInstance);

els.btnCopy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(els.linkOut.value);
  alert('Link kopieret.');
});

(async function init() {
  const me = await getMe();
  setAuthUI(me);
  if (!me) return;

  await listQuestionsForPick();
})();
