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
    gsurveytype: document.getElementById("gsurveytype"),
    gname: document.getElementById("gname"),
    gtitle: document.getElementById("gtitle"),
    gdesc: document.getElementById("gdesc"),
    gsort: document.getElementById("gsort"),
    gactive: document.getElementById("gactive"),
    gcolor: document.getElementById("gcolor"),
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

async function loadSurveyTypes() {
  els.gsurveytype.innerHTML = `<option value="">Indlæser…</option>`;
  const r = await fetch('/api/surveytypes-get', { cache: "no-store" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`surveytypes-get fejlede (${r.status}): ${t}`);
  }
  const data = await r.json();
  const rows = data?.value || data || [];
  els.gsurveytype.innerHTML =
    `<option value="">Vælg surveytype…</option>` +
    rows.map(x => {
      const id = x.crcc8_lch_surveytypeid;
      const name = x.crcc8_lch_type;
      return `<option value="${id}">${escapeHtml(name)}</option>`;
    }).join("");
}

async function loadGroupColors() {
  // Din lch_color er et choice (valg). Hvis du vil styre det fra metadata senere, kan vi lave endpoint.
  // For nu: tom + “Ingen”
  if (!els.gcolor) return;
  els.gcolor.innerHTML = `
    <option value="">Ingen</option>
  `;
}

function readForm() {
  return {
    id: (els.gid.value || "").trim() || null,
    surveytypeid: (els.gsurveytype.value || "").trim() || null,
    name: (els.gname.value || "").trim(),
    title: (els.gtitle.value || "").trim(),
    description: (els.gdesc.value || "").trim() || null,
    sortorder: els.gsort.value === "" ? null : parseInt(els.gsort.value, 10),
    isactive: !!els.gactive.checked,
    color: (els.gcolor.value || "").trim() || null
  };
}

function fillForm(g) {
  els.gid.value = g.crcc8_lch_questiongroupid || "";
  els.gname.value = g.crcc8_lch_name || "";
  els.gtitle.value = g.crcc8_lch_title || "";
  els.gdesc.value = g.crcc8_lch_description || "";
  els.gsort.value = (g.crcc8_lch_sortorder ?? "") === null ? "" : (g.crcc8_lch_sortorder ?? "");
  els.gactive.checked = (g.crcc8_lch_isactive ?? true) === true;

  // surveytype lookup value kommer som _crcc8_lch_surveytype_value
  const st = g._crcc8_lch_surveytype_value || "";
  els.gsurveytype.value = st;

  // color (choice) – hvis du bruger den
  els.gcolor.value = g.crcc8_lch_color ?? "";
}

function resetForm() {
  els.form.reset();
  els.gid.value = "";
  els.status.textContent = "";
}

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

  rows.sort((a,b) => (a.crcc8_lch_sortorder ?? 0) - (b.crcc8_lch_sortorder ?? 0));

  rows.forEach(g => {
    const tr = document.createElement("tr");

const surveyTypeLabel =
  g.crcc8_lch_surveytype?.crcc8_lch_type
  ?? g['crcc8_lch_surveytype@OData.Community.Display.V1.FormattedValue']
  ?? g['_crcc8_lch_surveytype_value@OData.Community.Display.V1.FormattedValue']
  ?? '';


    tr.innerHTML = `
      <td>${escapeHtml(
  g.crcc8_lch_surveytype?.crcc8_lch_type
  ?? surveyTypeLabel
  ?? ''
)}</td>

      <td>${escapeHtml(g.crcc8_lch_sortorder ?? '')}</td>
      <td>${escapeHtml(g.crcc8_lch_title ?? '')}</td>
      <td>${escapeHtml(g.crcc8_lch_name ?? '')}</td>
      <td>${(g.crcc8_lch_isactive ?? true) ? 'Ja' : 'Nej'}</td>
      <td class="actions">
        <button data-act="edit" data-id="${g.crcc8_lch_questiongroupid}">Redigér</button>
        <button data-act="del"  data-id="${g.crcc8_lch_questiongroupid}">Slet</button>
      </td>
    `;
    els.tableBody.appendChild(tr);
  });

  els.listStatus.textContent = "";
}

async function upsertGroup(payload) {
  const isNew = !payload.id;
  els.status.textContent = isNew ? "Opretter…" : "Opdaterer…";

  if (!payload.surveytypeid) throw new Error("Vælg surveytype");
  if (!payload.name) throw new Error("Navn mangler");
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
  await loadGroupColors();

  // kræver at du får /api/surveytypes-get deployed (se endpoints nedenfor)
  await loadSurveyTypes();

  await listGroups();
}

document.addEventListener("DOMContentLoaded", init);
