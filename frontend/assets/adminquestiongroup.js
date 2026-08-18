// /frontend/assets/adminquestiongroup.js
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
    tableBody: document.querySelector("#gtable tbody"),
    table: document.getElementById("gtable"),

    form: document.getElementById("groupForm"),
    status: document.getElementById("formStatus"),
    btnReset: document.getElementById("btnReset"),

    gid: document.getElementById("gid"),
    gtitle: document.getElementById("gtitle"),
    gdesc: document.getElementById("gdesc"),
    gsort: document.getElementById("gsort"),
    gactive: document.getElementById("gactive"),
    grepeatable: document.getElementById("grepeatable"),
    grapportertil: document.getElementById("grapportertil"),
  };
}

function getRapporterTil() {
  if (!els.grapportertil) return [];
  return [...els.grapportertil.querySelectorAll(".toggle3-btn.active")]
    .map(b => parseInt(b.dataset.value, 10));
}

function setRapporterTil(values) {
  if (!els.grapportertil) return;

  // Kan komme som array af tal, eller som en kommasepareret streng fra
  // Dataverse' multi-select valgliste (fx "245500000,245500002").
  const list = Array.isArray(values)
    ? values
    : String(values ?? "").split(",").map(s => s.trim()).filter(Boolean);

  const selected = new Set(list.map(v => Number(v)));

  const buttons = [...els.grapportertil.querySelectorAll(".toggle3-btn")];
  buttons.forEach(b => {
    b.classList.toggle("active", selected.has(parseInt(b.dataset.value, 10)));
  });
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
    id: (els.gid.value || "").trim() || null,
    title: (els.gtitle.value || "").trim(),
    description: (els.gdesc.value || "").trim() || null,
    sortorder: els.gsort.value === "" ? null : parseInt(els.gsort.value, 10),
    isactive: !!els.gactive.checked,
    repeatable: !!els.grepeatable.checked,
    rapporterTil: getRapporterTil(),
  };
}

function fillForm(g) {
  els.gid.value = g.cr175_lch_kundeinfo_spoergsmaalsgruppeid || "";
  els.gtitle.value = g.cr175_lch_titel || "";
  els.gdesc.value = g.cr175_lch_description || "";
  els.gsort.value = (g.cr175_lch_sorteringsnummer ?? "") === null ? "" : (g.cr175_lch_sorteringsnummer ?? "");
  els.gactive.checked = (g.cr175_lch_aktiv ?? true) === true;
  els.grepeatable.checked = (g.cr175_lch_kangentages ?? false) === true;
  setRapporterTil(g.cr175_lch_rapporterer_til ?? null);
}

function resetForm() {
  els.form.reset();
  els.gid.value = "";
  els.status.textContent = "";
  setRapporterTil([]);
}

const RAPPORTER_TIL_LABELS = {
  245500000: "Kontakter",
  245500001: "Kundeliste",
  245500002: "Uniconta",
  245500003: "SalesForce", // NB: ret denne værdi hvis Dataverse gav SalesForce et andet tal
};

async function listGroups() {
  els.listStatus.textContent = "Indlæser…";
  els.tableBody.innerHTML = "";

  const r = await fetch('/api/questiongroups-get?top=500', { cache: "no-store" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`questiongroups-get fejlede (${r.status}): ${t}`);
  }

  const data = await r.json();
  const rows = data?.value || data || [];

  rows.sort((a, b) => (a.cr175_lch_sorteringsnummer ?? 0) - (b.cr175_lch_sorteringsnummer ?? 0));

  rows.forEach(g => {
    const tr = document.createElement("tr");
    const rapporterTilValues = String(g.cr175_lch_rapporterer_til ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const rapporterTilLabel = rapporterTilValues.length
      ? rapporterTilValues.map(v => RAPPORTER_TIL_LABELS[v] || v).join(", ")
      : "—";

    tr.innerHTML = `
      <td>${escapeHtml(g.cr175_lch_sorteringsnummer ?? '')}</td>
      <td>${escapeHtml(g.cr175_lch_titel ?? '')}</td>
      <td>${(g.cr175_lch_aktiv ?? true) ? 'Ja' : 'Nej'}</td>
      <td>${g.cr175_lch_kangentages ? 'Ja' : 'Nej'}</td>
      <td>${escapeHtml(rapporterTilLabel)}</td>
      <td class="actions">
        <button data-act="edit" data-id="${g.cr175_lch_kundeinfo_spoergsmaalsgruppeid}">Redigér</button>
        <button data-act="del"  data-id="${g.cr175_lch_kundeinfo_spoergsmaalsgruppeid}">Slet</button>
      </td>
    `;
    els.tableBody.appendChild(tr);
  });

  els.listStatus.textContent = "";
}

async function upsertGroup(payload) {
  const isNew = !payload.id;
  els.status.textContent = isNew ? "Opretter…" : "Opdaterer…";

  if (!payload.title) throw new Error("Titel mangler");

  const url = isNew
    ? "/api/questiongroups-post"
    : `/api/questiongroups-patch?id=${encodeURIComponent(payload.id)}`;

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
  await listGroups();
  resetForm();
}

async function deleteGroup(id) {
  if (!confirm("Slet denne gruppe?")) return;

  const r = await fetch(`/api/questiongroups-delete?id=${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `DELETE fejlede (${r.status})`);
  }

  await listGroups();
}

function wireEvents() {
  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await upsertGroup(readForm());
    } catch (err) {
      console.error(err);
      els.status.textContent = `Fejl: ${err.message}`;
    }
  });

  els.btnReset.addEventListener("click", resetForm);

  els.grapportertil?.addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle3-btn");
    if (!btn) return;
    btn.classList.toggle("active");
  });

  els.table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;
    const act = btn.dataset.act;

    try {
      if (act === "edit") {
        const r = await fetch(`/api/questiongroups-get?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(await r.text());
        const g = await r.json();
        fillForm(g);
        els.status.textContent = "Indlæst – du redigerer nu";
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (act === "del") {
        await deleteGroup(id);
      }
    } catch (err) {
      console.error(err);
      els.status.textContent = `Fejl: ${err.message}`;
    }
  });
}

async function init() {
  els = getEls();

  const me = await getMe();
  showAuthedUI(me);
  if (!me) return;

  wireEvents();
  await listGroups();
}

document.addEventListener("DOMContentLoaded", init);
