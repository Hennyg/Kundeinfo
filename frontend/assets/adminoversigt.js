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

function statusPillHtml(row) {
  const label =
    row["cr175_lch_status@OData.Community.Display.V1.FormattedValue"] ||
    (row.cr175_lch_status != null ? String(row.cr175_lch_status) : "—");

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
      <td>
        <a class="tag" href="${seSkemaLink}" target="_blank" rel="noopener">Se skema</a>
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
