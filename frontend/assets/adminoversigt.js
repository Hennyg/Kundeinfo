async function getMe() {
  const r = await fetch("/.auth/me");
  if (!r.ok) return null;
  const j = await r.json();
  return j?.clientPrincipal ?? null;
}

function statusPill(row) {
  if (!row.crcc8_expiresat) {
    return `<span class="pill active">Aktiv</span>`;
  }
  const exp = new Date(row.crcc8_expiresat);
  return exp < new Date()
    ? `<span class="pill expired">Udløbet</span>`
    : `<span class="pill active">Aktiv</span>`;
}

async function loadSurveys() {
  const status = document.getElementById("status");
  const table = document.getElementById("surveyTable");
  const tbody = table.querySelector("tbody");

  const r = await fetch("/api/survey-list?top=50");
  if (!r.ok) {
    status.textContent = "Kunne ikke hente surveys";
    return;
  }

  const data = await r.json();
  tbody.innerHTML = "";

  for (const s of data.value ?? []) {
    const tr = document.createElement("tr");

    const link = `/kundeinfo.html?code=${encodeURIComponent(s.crcc8_lch_code)}`;

    tr.innerHTML = `
      <td><strong>${s.crcc8_lch_code}</strong></td>
      <td>${statusPill(s)}</td>
      <td>${s.crcc8_expiresat ? new Date(s.crcc8_expiresat).toLocaleDateString("da-DK") : "—"}</td>
      <td>${s.crcc8_templateversion ?? ""}</td>
      <td>${new Date(s.createdon).toLocaleDateString("da-DK")}</td>
      <td class="actions">
        <a class="tag" href="${link}" target="_blank">Åbn</a>
        <button data-link="${link}">Kopiér</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  table.style.display = "";
  status.style.display = "none";
}

document.addEventListener("click", e => {
  const btn = e.target.closest("button[data-link]");
  if (!btn) return;
  navigator.clipboard.writeText(location.origin + btn.dataset.link);
  alert("Link kopieret");
});

(async () => {
  const me = await getMe();
  if (me) document.getElementById("userInfo").textContent = me.userDetails;
  await loadSurveys();
})();
