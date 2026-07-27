const $ = id => document.getElementById(id);
let allDebtors = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]);
}
function setStatus(message, isError = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", isError);
  $("status").classList.remove("hidden");
}
function render(rows) {
  const body = $("debtorBody");
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted">Ingen debitorer fundet.</td></tr>';
  } else {
    body.innerHTML = rows.map(d => `
      <tr>
        <td>${escapeHtml(d.account)}</td><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.address1)}</td>
        <td>${escapeHtml(d.zipCode)}</td><td>${escapeHtml(d.city)}</td>
        <td><button class="btn js-show" type="button" data-account="${escapeHtml(d.account)}">Vis</button></td>
      </tr>`).join("");
  }
  $("tableWrap").classList.remove("hidden");
  setStatus(`${rows.length} af ${allDebtors.length} debitorer vises.`);
}
function filterRows() {
  const q = $("searchInput").value.trim().toLocaleLowerCase("da-DK");
  if (!q) return render(allDebtors);
  render(allDebtors.filter(d => [d.account,d.name,d.address1,d.zipCode,d.city].some(v => String(v||"").toLocaleLowerCase("da-DK").includes(q))));
}
async function loadDebtors() {
  $("tableWrap").classList.add("hidden");
  setStatus("Henter debitorer fra Uniconta…");
  try {
    const response = await fetch("/api/uniconta/debtors");
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Kunne ikke hente debitorer.");
    allDebtors = Array.isArray(data.debtors) ? data.debtors : [];
    filterRows();
  } catch (error) { setStatus(error.message, true); }
}
function detailRow(label, value) {
  const shown = value === true ? "Ja" : value === false ? "Nej" : (value || "—");
  return `<div class="detail-label">${escapeHtml(label)}</div><div>${escapeHtml(shown)}</div>`;
}
async function showDetail(account) {
  $("detailModal").classList.remove("hidden");
  $("detailGrid").classList.add("hidden");
  $("detailStatus").classList.remove("hidden", "error");
  $("detailStatus").textContent = "Henter detaljer…";
  try {
    const response = await fetch(`/api/uniconta/debtors/${encodeURIComponent(account)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Kunne ikke hente debitoren.");
    const d = data.debtor;
    $("detailTitle").textContent = d.name || "Debitor";
    $("detailAccount").textContent = `Debitornr. ${d.account || "—"}`;
    $("detailGrid").innerHTML = [
      detailRow("Adresse", [d.address1,d.address2].filter(Boolean).join(", ")),
      detailRow("Postnr. og by", [d.zipCode,d.city].filter(Boolean).join(" ")),
      detailRow("Land", d.country), detailRow("Telefon", d.phone), detailRow("Mobil", d.mobile),
      detailRow("E-mail", d.email), detailRow("Kontaktperson", d.contactPerson), detailRow("CVR-nr.", d.vatNumber),
      detailRow("Valuta", d.currency), detailRow("Betaling", d.payment), detailRow("Spærret", d.blocked)
    ].join("");
    $("detailStatus").classList.add("hidden");
    $("detailGrid").classList.remove("hidden");
  } catch (error) {
    $("detailStatus").textContent = error.message;
    $("detailStatus").classList.add("error");
  }
}
function closeModal() { $("detailModal").classList.add("hidden"); }

document.addEventListener("click", event => {
  const button = event.target.closest(".js-show");
  if (button) showDetail(button.dataset.account);
  if (event.target === $("detailModal")) closeModal();
});
$("searchInput").addEventListener("input", filterRows);
$("reloadBtn").addEventListener("click", loadDebtors);
$("closeModalBtn").addEventListener("click", closeModal);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
loadDebtors();
