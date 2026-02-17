function $(id) { return document.getElementById(id); }

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pill(isActive) {
  return isActive
    ? `<span class="pill active">Aktiv</span>`
    : `<span class="pill inactive">Inaktiv</span>`;
}

let ALL = [];

function normalizeTemplates(data) {
  // accepter både array og {value:[...]}
  const rows = Array.isArray(data) ? data : (data?.value || []);
  return rows.map(t => ({
    id: t.id || t.crcc8_lch_surveytemplateid,
    name: t.name || t.crcc8_lch_name || "",
    description: t.description || t.crcc8_lch_description || "",
    isActive: (t.isActive != null) ? !!t.isActive : (t.crcc8_lch_isactive !== false),
    surveyType:
      t.surveyType ||
      t["crcc8_lch_surveytype@OData.Community.Display.V1.FormattedValue"] ||
      t.surveytype ||
      ""
  }));
}

function render(list) {
  const tbody = document.querySelector("#tplTable tbody");
  tbody.innerHTML = "";

  list.forEach(t => {
    const editUrl = `./adminsurvey.html?templateId=${encodeURIComponent(t.id)}`;
    const createUrl = `./admincreate.html?templateId=${encodeURIComponent(t.id)}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(t.name)}</strong></td>
      <td>${pill(t.isActive)}</td>
      <td>${escapeHtml(t.surveyType)}</td>
      <td class="muted">${escapeHtml(t.description)}</td>
      <td class="actions">
        <a class="tag" href="${editUrl}">Redigér template</a>
        <a class="tag" href="${createUrl}">Opret kundesurvey</a>
      </td>
    `;
    tbody.appendChild(tr);
  });

  $("tplTable").style.display = "";
  $("status").textContent = list.length ? "" : "Ingen templates fundet.";
}

function applySearch() {
  const q = ($("search").value || "").trim().toLowerCase();
  if (!q) return render(ALL);

  const filtered = ALL.filter(t =>
    (t.name || "").toLowerCase().includes(q) ||
    (t.description || "").toLowerCase().includes(q) ||
    (t.surveyType || "").toLowerCase().includes(q)
  );
  render(filtered);
}

async function loadTemplates() {
  $("status").textContent = "Indlæser templates…";
  $("tplTable").style.display = "none";

  const data = await fetchJson("/api/templates-get", { cache: "no-store" });
  ALL = normalizeTemplates(data);

  // sortér pænt
  ALL.sort((a, b) => String(a.name).localeCompare(String(b.name), "da"));

  render(ALL);
}

document.addEventListener("DOMContentLoaded", async () => {
  $("btnReload").addEventListener("click", () => loadTemplates().catch(e => $("status").textContent = "Fejl: " + e.message));
  $("search").addEventListener("input", applySearch);

  try {
    await loadTemplates();
  } catch (e) {
    console.error(e);
    $("status").textContent = "Fejl: " + e.message;
  }
});
