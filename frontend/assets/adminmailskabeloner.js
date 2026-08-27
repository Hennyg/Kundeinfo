// /frontend/assets/adminmailskabeloner.js
let els = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getEls() {
  return {
    loading: document.getElementById("loading"),
    authDenied: document.getElementById("authDenied"),
    app: document.getElementById("app"),
    me: document.getElementById("userInfo"),

    listStatus: document.getElementById("listStatus"),
    tableBody: document.querySelector("#ttable tbody"),
    table: document.getElementById("ttable"),

    form: document.getElementById("templateForm"),
    status: document.getElementById("formStatus"),
    btnReset: document.getElementById("btnReset"),

    tid: document.getElementById("tid"),
    tnavn: document.getElementById("tnavn"),
    tnoegle: document.getElementById("tnoegle"),
    tkategori: document.getElementById("tkategori"),
    temne: document.getElementById("temne"),
    tbroedtekst: document.getElementById("tbroedtekst"),
    taktiv: document.getElementById("taktiv"),

    placeholderList: document.getElementById("placeholderList"),

    placeholderListStatus: document.getElementById("placeholderListStatus"),
    pTableBody: document.querySelector("#ptable tbody"),
    pTable: document.getElementById("ptable"),

    placeholderForm: document.getElementById("placeholderForm"),
    placeholderStatus: document.getElementById("placeholderFormStatus"),
    btnResetPlaceholder: document.getElementById("btnResetPlaceholder"),

    pid: document.getElementById("pid"),
    pnavn: document.getElementById("pnavn"),
    pkode: document.getElementById("pkode"),
    pbeskrivelse: document.getElementById("pbeskrivelse"),
    psort: document.getElementById("psort"),
    paktiv: document.getElementById("paktiv"),
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

function showAuthedUI(me) {
  els.loading.style.display = "none";
  if (!me) {
    els.authDenied.style.display = "block";
    els.app.style.display = "none";
  } else {
    els.authDenied.style.display = "none";
    els.app.style.display = "block";
    if (els.me) els.me.textContent = me.userDetails || "";
  }
}

function readForm() {
  return {
    id: (els.tid.value || "").trim() || null,
    navn: (els.tnavn.value || "").trim(),
    noegle: (els.tnoegle.value || "").trim(),
    kategori: (els.tkategori.value || "").trim() || null,
    emne: (els.temne.value || "").trim() || null,
    broedtekst: els.tbroedtekst.value || null,
    aktiv: !!els.taktiv.checked,
  };
}

function fillForm(t) {
  els.tid.value = t.cr175_lch_kundeinfo_mailskabelonid || "";
  els.tnavn.value = t.cr175_lch_navn || "";
  els.tnoegle.value = t.cr175_lch_noegle || "";
  els.tkategori.value = t.cr175_lch_kategori || "";
  els.temne.value = t.cr175_lch_emne || "";
  els.tbroedtekst.value = t.cr175_lch_broedtekst || "";
  els.taktiv.checked = (t.cr175_lch_aktiv ?? true) === true;
}

function resetForm() {
  els.form.reset();
  els.tid.value = "";
  els.status.textContent = "";
  els.taktiv.checked = true;
}

async function listTemplates() {
  els.listStatus.textContent = "Indlæser…";
  els.tableBody.innerHTML = "";

  const r = await fetch('/api/mailskabeloner-get?top=500', { cache: "no-store" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`mailskabeloner-get fejlede (${r.status}): ${t}`);
  }

  const data = await r.json();
  const rows = data?.value || data || [];

  rows.sort((a, b) => String(a.cr175_lch_navn || "").localeCompare(String(b.cr175_lch_navn || ""), "da"));

  rows.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(t.cr175_lch_navn ?? '')}</td>
      <td><code>${escapeHtml(t.cr175_lch_noegle ?? '')}</code></td>
      <td>${escapeHtml(t.cr175_lch_kategori ?? '—')}</td>
      <td>${escapeHtml(t.cr175_lch_emne ?? '')}</td>
      <td>${(t.cr175_lch_aktiv ?? true) ? 'Ja' : 'Nej'}</td>
      <td class="actions">
        <button data-act="edit" data-id="${t.cr175_lch_kundeinfo_mailskabelonid}">Redigér</button>
        <button data-act="del"  data-id="${t.cr175_lch_kundeinfo_mailskabelonid}">Slet</button>
      </td>
    `;
    els.tableBody.appendChild(tr);
  });

  els.listStatus.textContent = "";
}

/* ---------- Pladsholdere ({{kode}}) ---------- */

function readPlaceholderForm() {
  return {
    id: (els.pid.value || "").trim() || null,
    navn: (els.pnavn.value || "").trim(),
    kode: (els.pkode.value || "").trim(),
    beskrivelse: (els.pbeskrivelse.value || "").trim() || null,
    sortorder: els.psort.value === "" ? null : parseInt(els.psort.value, 10),
    aktiv: !!els.paktiv.checked,
  };
}

function fillPlaceholderForm(p) {
  els.pid.value = p.cr175_lch_kundeinfo_mailpladsholderid || "";
  els.pnavn.value = p.cr175_lch_navn || "";
  els.pkode.value = p.cr175_lch_kode || "";
  els.pbeskrivelse.value = p.cr175_lch_beskrivelse || "";
  els.psort.value = (p.cr175_lch_sorteringsnummer ?? "") === null ? "" : (p.cr175_lch_sorteringsnummer ?? "");
  els.paktiv.checked = (p.cr175_lch_aktiv ?? true) === true;
}

function resetPlaceholderForm() {
  els.placeholderForm.reset();
  els.pid.value = "";
  els.placeholderStatus.textContent = "";
  els.paktiv.checked = true;
}

// Henter alle aktive pladsholdere og viser dem som en kompakt liste lige
// under Brødtekst-feltet, så man kan se hvilke {{koder}} der findes uden at
// skulle scrolle ned til selve pladsholder-tabellen.
function renderPlaceholderHintList(rows) {
  if (!els.placeholderList) return;

  const active = rows.filter(p => (p.cr175_lch_aktiv ?? true) === true);

  if (!active.length) {
    els.placeholderList.innerHTML = `<span class="muted">Ingen pladsholdere oprettet endnu.</span>`;
    return;
  }

  els.placeholderList.innerHTML = active
    .map(p => `
      <span class="ph-item">
        <code>{{${escapeHtml(p.cr175_lch_kode ?? '')}}}</code>${escapeHtml(p.cr175_lch_navn ?? '')}${
          p.cr175_lch_beskrivelse ? ` – ${escapeHtml(p.cr175_lch_beskrivelse)}` : ''
        }
      </span>
    `)
    .join("");
}

async function listPlaceholders() {
  els.placeholderListStatus.textContent = "Indlæser…";
  els.pTableBody.innerHTML = "";

  const r = await fetch('/api/mailpladsholdere-get?top=500', { cache: "no-store" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`mailpladsholdere-get fejlede (${r.status}): ${t}`);
  }

  const data = await r.json();
  const rows = data?.value || data || [];

  rows.sort((a, b) =>
    (a.cr175_lch_sorteringsnummer ?? 0) - (b.cr175_lch_sorteringsnummer ?? 0) ||
    String(a.cr175_lch_navn || "").localeCompare(String(b.cr175_lch_navn || ""), "da")
  );

  rows.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.cr175_lch_navn ?? '')}</td>
      <td><code>{{${escapeHtml(p.cr175_lch_kode ?? '')}}}</code></td>
      <td>${escapeHtml(p.cr175_lch_beskrivelse ?? '')}</td>
      <td>${(p.cr175_lch_aktiv ?? true) ? 'Ja' : 'Nej'}</td>
      <td class="actions">
        <button data-act="edit" data-id="${p.cr175_lch_kundeinfo_mailpladsholderid}">Redigér</button>
        <button data-act="del"  data-id="${p.cr175_lch_kundeinfo_mailpladsholderid}">Slet</button>
      </td>
    `;
    els.pTableBody.appendChild(tr);
  });

  els.placeholderListStatus.textContent = "";

  renderPlaceholderHintList(rows);
}

async function upsertPlaceholder(payload) {
  const isNew = !payload.id;
  els.placeholderStatus.textContent = isNew ? "Opretter…" : "Opdaterer…";

  if (!payload.navn) throw new Error("Navn mangler");
  if (!payload.kode) throw new Error("Kode mangler");

  const url = isNew
    ? "/api/mailpladsholdere-post"
    : `/api/mailpladsholdere-patch?id=${encodeURIComponent(payload.id)}`;

  const method = isNew ? "POST" : "PATCH";

  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `${method} fejlede (${r.status})`);
  }

  els.placeholderStatus.textContent = isNew ? "Oprettet ✔" : "Opdateret ✔";
  await listPlaceholders();
  resetPlaceholderForm();
}

async function deletePlaceholder(id) {
  if (!confirm("Slet denne pladsholder?")) return;

  const r = await fetch(`/api/mailpladsholdere-delete?id=${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `DELETE fejlede (${r.status})`);
  }

  await listPlaceholders();
}

async function upsertTemplate(payload) {
  const isNew = !payload.id;
  els.status.textContent = isNew ? "Opretter…" : "Opdaterer…";

  if (!payload.navn) throw new Error("Navn mangler");
  if (!payload.noegle) throw new Error("Nøgle mangler");

  const url = isNew
    ? "/api/mailskabeloner-post"
    : `/api/mailskabeloner-patch?id=${encodeURIComponent(payload.id)}`;

  const method = isNew ? "POST" : "PATCH";

  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `${method} fejlede (${r.status})`);
  }

  els.status.textContent = isNew ? "Oprettet ✔" : "Opdateret ✔";
  await listTemplates();
  resetForm();
}

async function deleteTemplate(id) {
  if (!confirm("Slet denne mailskabelon?")) return;

  const r = await fetch(`/api/mailskabeloner-delete?id=${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `DELETE fejlede (${r.status})`);
  }

  await listTemplates();
}

function wireEvents() {
  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await upsertTemplate(readForm());
    } catch (err) {
      console.error(err);
      els.status.textContent = `Fejl: ${err.message}`;
    }
  });

  els.btnReset.addEventListener("click", resetForm);

  els.table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;
    const act = btn.dataset.act;

    try {
      if (act === "edit") {
        const r = await fetch(`/api/mailskabeloner-get?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(await r.text());
        const t = await r.json();
        fillForm(t);
        els.status.textContent = "Indlæst – du redigerer nu";
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (act === "del") {
        await deleteTemplate(id);
      }
    } catch (err) {
      console.error(err);
      els.status.textContent = `Fejl: ${err.message}`;
    }
  });

  els.placeholderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await upsertPlaceholder(readPlaceholderForm());
    } catch (err) {
      console.error(err);
      els.placeholderStatus.textContent = `Fejl: ${err.message}`;
    }
  });

  els.btnResetPlaceholder.addEventListener("click", resetPlaceholderForm);

  els.pTable.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;
    const act = btn.dataset.act;

    try {
      if (act === "edit") {
        const r = await fetch(`/api/mailpladsholdere-get?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(await r.text());
        const p = await r.json();
        fillPlaceholderForm(p);
        els.placeholderStatus.textContent = "Indlæst – du redigerer nu";
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (act === "del") {
        await deletePlaceholder(id);
      }
    } catch (err) {
      console.error(err);
      els.placeholderStatus.textContent = `Fejl: ${err.message}`;
    }
  });
}

async function init() {
  els = getEls();

  const me = await getMe();
  showAuthedUI(me);
  if (!me) return;

  wireEvents();
  await listTemplates();
  await listPlaceholders();
}

document.addEventListener("DOMContentLoaded", init);
