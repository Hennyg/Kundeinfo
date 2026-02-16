function $(id){ return document.getElementById(id); }

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

function setStatus(s){ $("status").textContent = s || ""; }

async function loadTemplates() {
  setStatus("Indlæser templates…");
  const rows = await fetchJson("/api/templates-get", { cache: "no-store" });
  const sel = $("templateSelect");
  sel.innerHTML = "";
  (rows || []).forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });
  setStatus(rows?.length ? "" : "Ingen templates fundet.");
}

async function createFromTemplate() {
  try {
    const templateId = $("templateSelect").value;
    const customerName = ($("customerName").value || "").trim();
    if (!customerName) return setStatus("Udfyld kundenavn.");

    const expiresRaw = $("expiresAt").value || "";
    const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;
    const note = ($("note").value || "").trim() || null;

    setStatus("Opretter instans…");

    const result = await fetchJson("/api/survey-create-from-template", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ templateId, customerName, expiresAt, note })
    });

    // Send til prefill (admin)
    location.href = `/adminprefill.html?id=${encodeURIComponent(result.instanceId)}`;
  } catch (e) {
    console.error(e);
    setStatus("Fejl: " + e.message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadTemplates();
  $("btnCreate").addEventListener("click", createFromTemplate);
});
