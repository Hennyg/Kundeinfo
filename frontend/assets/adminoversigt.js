function $(id) { return document.getElementById(id); }

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

function fmtDate(dt) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    return d.toLocaleString("da-DK");
  } catch { return String(dt); }
}

function pill(statusText) {
  const s = String(statusText || "").toLowerCase();
  if (s.includes("expired") || s.includes("udløb")) return `<span class="pill expired">Udløbet</span>`;
  return `<span class="pill active">${statusText || "Aktiv"}</span>`;
}

async function loadSurveys() {
  $("status").textContent = "Indlæser surveys…";

  // ✅ Her bruger vi dit eksisterende endpoint hvis du har det.
  // Hvis du ikke har et, kan vi lave /api/surveyinstances-get
  const data = await fetchJson("/api/surveyinstances-get?top=500", { cache: "no-store" });

  const rows = data?.value || data || [];
  const tbody = document.querySelector("#surveyTable tbody");
  tbody.innerHTML = "";

  rows.forEach(r => {
    const instanceId = r.crcc8_lch_surveyinstanceid || r.id;
    const code = r.crcc8_lch_code || "";
    const customerName = r.crcc8_lch_customername || "";
    const expiresAt = r.crcc8_expiresat || null;

    // template lookup (kræver felt på surveyinstance)
    const templateId = r._crcc8_lch_surveytemplate_value || null;
    const templateName =
      r["_crcc8_lch_surveytemplate_value@OData.Community.Display.V1.FormattedValue"] ||
      r.crcc8_lch_surveytemplate?.crcc8_lch_name ||
      "";

    const createdOn = r.createdon || r.crcc8_createdon || null;

    // Kunde-link
    const customerUrl = `${location.origin}/kundeinfo.html?t=${encodeURIComponent(code)}`;
    // Admin prefill
    const adminPrefillUrl = `${location.origin}/adminprefill.html?id=${encodeURIComponent(instanceId)}`;
    // Ny fra template (hvis vi kender template)
    const adminCreateFromTplUrl = templateId
      ? `${location.origin}/admincreate.html?templateId=${encodeURIComponent(templateId)}`
      : `${location.origin}/admincreate.html`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(customerName)}</td>
      <td>${escapeHtml(code)}</td>
      <td>${pill(r.crcc8_status || "")}</td>
      <td>${escapeHtml(fmtDate(expiresAt))}</td>
      <td>${escapeHtml(templateName)}</td>
      <td>${escapeHtml(fmtDate(createdOn))}</td>
      <td>
        <a class="tag" href="${customerUrl}" target="_blank" rel="noopener">Åbn kunde</a>
        <a class="tag" href="${adminPrefillUrl}">Prefill</a>
        <a class="tag" href="${adminCreateFromTplUrl}">Ny fra template</a>
      </td>
    `;
    tbody.appendChild(tr);
  });

  $("surveyTable").style.display = "";
  $("status").textContent = rows.length ? "" : "Ingen surveys fundet.";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadSurveys();
  } catch (e) {
    console.error(e);
    $("status").textContent = "Fejl: " + e.message;
  }
});
