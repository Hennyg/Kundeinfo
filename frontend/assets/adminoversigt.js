// /assets/adminoversigt.js
//
// Henter og viser listen af oprettede kundesurveys på adminoversigt.html.

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStatusLabel(row) {
  return (
    row["cr175_lch_status@OData.Community.Display.V1.FormattedValue"] ||
    (row.cr175_lch_status != null ? String(row.cr175_lch_status) : "—")
  );
}

function statusPillHtml(row) {
  const label = getStatusLabel(row);
  // "afsluttet/gennemført" grønnes, resten neutral
  const cls = /afslut|gennemf/i.test(label) ? "active" : "";
  return `<span class="pill ${cls}">${escapeHtml(label)}</span>`;
}

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function rowHtml(row) {
  const id = row.cr175_lch_kundeinfo_kundeundersoegelseid;
  const code = row.cr175_lch_kode || "";
  const customerName = row.cr175_lch_kundenavn || "(uden navn)";
  const expiresAt = row.cr175_lch_udloebstidspunkt || "";
  const expiredTag = expiresAt && isExpired(expiresAt)
    ? ` <span class="pill expired">Udløbet</span>`
    : "";

  const seSkemaLink = code ? `./kundesurvey.html?code=${encodeURIComponent(code)}&ro=1` : "#";
  const prefillLink = id ? `./admincreate.html?instanceId=${encodeURIComponent(id)}` : "#";
  const customerLink = code ? `${window.location.origin}/kundesurvey.html?code=${encodeURIComponent(code)}` : "";

  return `
    <tr>
      <td><input type="checkbox" class="rowCheck" data-id="${escapeHtml(id || "")}" /></td>
      <td>${escapeHtml(customerName)}</td>
      <td>${escapeHtml(code)}</td>
      <td>${statusPillHtml(row)}</td>
      <td>${fmtDateTime(expiresAt)}${expiredTag}</td>
      <td>${fmtDateTime(row.createdon)}</td>
      <td>${fmtDateTime(row.sidstRettet)}</td>
      <td>
        <a class="tag" href="${seSkemaLink}">Se skema</a>
        <a class="tag" href="${prefillLink}">Prefill</a>
        ${customerLink
          ? `<a class="tag copyLinkBtn" href="#" data-link="${escapeHtml(customerLink)}">Kopi link</a>`
          : ""}
      </td>
    </tr>
  `;
}

async function copyLink(link) {
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    // Fallback for browsere/kontekster uden Clipboard API-adgang
    const tmp = document.createElement("textarea");
    tmp.value = link;
    tmp.style.position = "fixed";
    tmp.style.opacity = "0";
    document.body.appendChild(tmp);
    tmp.focus();
    tmp.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    tmp.remove();
    return ok;
  }
}

function updateSelectionUi() {
  const checks = [...document.querySelectorAll(".rowCheck")];
  const checked = checks.filter(c => c.checked);

  $("btnDeleteSelected").disabled = checked.length === 0;
  $("selectedCount").textContent = checked.length ? `${checked.length} valgt` : "";

  const checkAll = $("checkAll");
  if (checkAll) {
    checkAll.checked = checks.length > 0 && checked.length === checks.length;
    checkAll.indeterminate = checked.length > 0 && checked.length < checks.length;
  }
}

async function deleteSelected() {
  const ids = [...document.querySelectorAll(".rowCheck:checked")]
    .map(c => c.dataset.id)
    .filter(Boolean);

  if (!ids.length) return;

  const ok = confirm(`Slet ${ids.length} valgte kundesurvey(s)? Dette kan ikke fortrydes.`);
  if (!ok) return;

  const btn = $("btnDeleteSelected");
  btn.disabled = true;
  $("status").textContent = "Sletter…";

  try {
    const r = await fetch("/api/survey-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceIds: ids })
    });

    const text = await r.text();
    const data = text ? JSON.parse(text) : {};

    if (!r.ok && r.status !== 207) {
      throw new Error(data.error || `${r.status}`);
    }

    const failed = (data.results || []).filter(x => !x.ok);
    if (failed.length) {
      $("status").textContent = `${failed.length} kunne ikke slettes – se konsollen for detaljer.`;
      console.error("survey-delete fejl for:", failed);
    } else {
      $("status").textContent = "";
    }

    await load();
  } catch (e) {
    console.error("survey-delete fejl:", e);
    $("status").textContent = `Kunne ikke slette: ${e.message}`;
    btn.disabled = false;
  }
}

let allRows = [];

function getFilterValues() {
  return {
    search: ($("searchInput")?.value || "").trim().toLowerCase(),
    kundenavn: ($("filterKundenavn")?.value || "").trim().toLowerCase(),
    kode: ($("filterKode")?.value || "").trim().toLowerCase(),
    status: $("filterStatus")?.value || "",
    udloeber: ($("filterUdloeber")?.value || "").trim().toLowerCase(),
    oprettet: ($("filterOprettet")?.value || "").trim().toLowerCase(),
    sidstRettet: ($("filterSidstRettet")?.value || "").trim().toLowerCase()
  };
}

function rowMatchesFilters(row, f) {
  const kundenavn = String(row.cr175_lch_kundenavn || "(uden navn)").toLowerCase();
  const kode = String(row.cr175_lch_kode || "").toLowerCase();
  const statusLabel = getStatusLabel(row);
  const udloeber = fmtDateTime(row.cr175_lch_udloebstidspunkt).toLowerCase();
  const oprettet = fmtDateTime(row.createdon).toLowerCase();
  const sidstRettet = fmtDateTime(row.sidstRettet).toLowerCase();

  if (f.search && !(kundenavn.includes(f.search) || kode.includes(f.search))) return false;
  if (f.kundenavn && !kundenavn.includes(f.kundenavn)) return false;
  if (f.kode && !kode.includes(f.kode)) return false;
  if (f.status && statusLabel !== f.status) return false;
  if (f.udloeber && !udloeber.includes(f.udloeber)) return false;
  if (f.oprettet && !oprettet.includes(f.oprettet)) return false;
  if (f.sidstRettet && !sidstRettet.includes(f.sidstRettet)) return false;

  return true;
}

function populateStatusFilterOptions(rows) {
  const select = $("filterStatus");
  if (!select) return;

  const current = select.value;
  const labels = [...new Set(rows.map(getStatusLabel))].sort((a, b) => a.localeCompare(b, "da"));

  select.innerHTML =
    `<option value="">Alle</option>` +
    labels.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");

  if (labels.includes(current)) select.value = current;
}

function renderTable(rows) {
  const table = $("surveyTable");
  const tbody = table.querySelector("tbody");

  tbody.innerHTML = rows.length
    ? rows.map(rowHtml).join("")
    : `<tr class="noResults"><td colspan="8">Ingen kundesurveys matcher filtrene.</td></tr>`;

  tbody.querySelectorAll(".rowCheck").forEach(cb => {
    cb.addEventListener("change", updateSelectionUi);
  });
  updateSelectionUi();

  tbody.querySelectorAll(".copyLinkBtn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const link = btn.dataset.link || "";
      if (!link) return;

      const ok = await copyLink(link);
      const original = btn.textContent;
      btn.textContent = ok ? "Kopieret ✔" : "Kunne ikke kopiere";
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  });

  const filterCount = $("filterCount");
  if (filterCount) {
    filterCount.textContent =
      rows.length === allRows.length ? "" : `Viser ${rows.length} af ${allRows.length}`;
  }
}

function applyFilters() {
  const f = getFilterValues();
  renderTable(allRows.filter(row => rowMatchesFilters(row, f)));
}

function clearFilters() {
  const searchInput = $("searchInput");
  if (searchInput) searchInput.value = "";
  ["filterKundenavn", "filterKode", "filterUdloeber", "filterOprettet", "filterSidstRettet"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });
  const statusFilter = $("filterStatus");
  if (statusFilter) statusFilter.value = "";
  applyFilters();
}

async function load() {
  const status = $("status");
  const table = $("surveyTable");

  status.textContent = "Indlæser kundesurveys…";
  table.style.display = "none";

  try {
    const r = await fetch("/api/survey-list?top=200", { cache: "no-store" });
    const text = await r.text();
    const data = text ? JSON.parse(text) : {};

    if (!r.ok || data.error) {
      throw new Error(data.error || `${r.status}`);
    }

    allRows = data.value || [];

    if (!allRows.length) {
      status.textContent = "Ingen kundesurveys oprettet endnu.";
      return;
    }

    populateStatusFilterOptions(allRows);
    status.textContent = "";
    table.style.display = "";
    applyFilters();
  } catch (e) {
    console.error("survey-list fejl:", e);
    status.textContent = `Kunne ikke hente kundesurveys: ${e.message}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  load();

  $("checkAll")?.addEventListener("change", (e) => {
    document.querySelectorAll(".rowCheck").forEach(cb => { cb.checked = e.target.checked; });
    updateSelectionUi();
  });

  $("btnDeleteSelected")?.addEventListener("click", deleteSelected);

  ["searchInput", "filterKundenavn", "filterKode", "filterUdloeber", "filterOprettet", "filterSidstRettet"]
    .forEach(id => $(id)?.addEventListener("input", applyFilters));
  $("filterStatus")?.addEventListener("change", applyFilters);
  $("btnClearFilters")?.addEventListener("click", clearFilters);
});
