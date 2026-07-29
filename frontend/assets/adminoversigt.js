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

const STATUS_LABELS = {
  776350000: { text: "Afventer", cls: "" },
  776350001: { text: "Gennemført", cls: "active" },
  776350002: { text: "Andet", cls: "" }
};

function statusPillHtml(status) {
  const n = Number(status);
  const info = STATUS_LABELS[n] || { text: n ? String(n) : "—", cls: "" };
  return `<span class="pill ${info.cls}">${escapeHtml(info.text)}</span>`;
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
  const id = row.crcc8_lch_surveyinstanceid;
  const code = row.crcc8_lch_code || "";
  const customerName = row.crcc8_lch_customername || "(uden navn)";
  const expiresAt = row.crcc8_expiresat || "";
  const expiredTag = expiresAt && isExpired(expiresAt)
    ? ` <span class="pill expired">Udløbet</span>`
    : "";

  const seSkemaLink = code ? `./kundesurvey.html?code=${encodeURIComponent(code)}&ro=1` : "#";
  const prefillLink = id ? `./admincreate.html?instanceId=${encodeURIComponent(id)}` : "#";

  return `
    <tr>
      <td><input type="checkbox" class="rowCheck" data-id="${escapeHtml(id || "")}" /></td>
      <td>${escapeHtml(customerName)}</td>
      <td>${escapeHtml(code)}</td>
      <td>${statusPillHtml(row.crcc8_status)}</td>
      <td>${fmtDateTime(expiresAt)}${expiredTag}</td>
      <td>${escapeHtml(row.crcc8_templateversion ?? "—")}</td>
      <td>${fmtDateTime(row.createdon)}</td>
      <td>
        <a class="tag" href="${seSkemaLink}" target="_blank" rel="noopener">Se skema</a>
        <a class="tag" href="${prefillLink}">Prefill</a>
      </td>
    </tr>
  `;
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

async function load() {
  const status = $("status");
  const table = $("surveyTable");
  const tbody = table.querySelector("tbody");

  status.textContent = "Indlæser kundesurveys…";
  table.style.display = "none";

  try {
    const r = await fetch("/api/survey-list?top=200", { cache: "no-store" });
    const text = await r.text();
    const data = text ? JSON.parse(text) : {};

    if (!r.ok || data.error) {
      throw new Error(data.error || `${r.status}`);
    }

    const rows = data.value || [];

    if (!rows.length) {
      status.textContent = "Ingen kundesurveys oprettet endnu.";
      return;
    }

    tbody.innerHTML = rows.map(rowHtml).join("");
    status.textContent = "";
    table.style.display = "";

    tbody.querySelectorAll(".rowCheck").forEach(cb => {
      cb.addEventListener("change", updateSelectionUi);
    });
    updateSelectionUi();
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
});
