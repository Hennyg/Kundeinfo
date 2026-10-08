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

// Synlig bekræftelse i nederste højre hjørne (popup/toast) - bruges i
// stedet for/ud over den lille "muted" statustekst, som er let at
// overse og desuden bliver overskrevet næsten øjeblikkeligt af load().
let toastTimer = null;
function showToast(message, type = "success") {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.className = "";
  el.classList.add(type);

  // Tvinger reflow, så klassen "show" altid trigger transition'en, også
  // hvis en tidligere toast lige er blevet skjult igen.
  requestAnimationFrame(() => el.classList.add("show"));

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 3500);
}

function getStatusLabel(row) {
  return row.cr175_lch_nystatus || "—";
}

function statusPillHtml(row) {
  const label = getStatusLabel(row);
  // "Udfyldt/Afsluttet" grønnes, resten neutral
  const cls = /udfyldt|afslut/i.test(label) ? "active" : "";
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

function jaNejHtml(value) {
  return value ? "Ja" : "Nej";
}

const REMINDER_DAYS = 14;

// Hele kalenderdage siden en dato (lokal tid), så noget der skete for 14
// dage siden tæller som 14, uanset klokkeslæt.
function daysSince(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - start) / 86400000);
}

// Påmindelses-markering af en række (ikke arkiverede, ikke besvarede):
//   "needsReminder" (orange) - Afventer/Set, oprettet for 14+ dage siden,
//                              ingen SMS sendt endnu
//   "smsSent"       (grøn)   - SMS sendt, tæller dage siden SMS'en
//   "smsOverdue"    (rød)    - SMS sendt for 14+ dage siden, stadig ikke besvaret
// Returnerer null, hvis rækken ikke skal markeres.
function reminderState(row) {
  if (row.cr175_lch_arkiveretdato) return null;
  const status = getStatusLabel(row);

  if (row.cr175_lch_smssendttidspunkt) {
    if (!/^(afventer|set|igang)$/i.test(status)) return null;
    const days = daysSince(row.cr175_lch_smssendttidspunkt);
    return days >= REMINDER_DAYS
      ? { rowClass: "smsOverdue", pillClass: "smsOverdue", days,
          title: `SMS sendt for ${days} dage siden - stadig ikke besvaret` }
      : { rowClass: "smsSent", pillClass: "smsSent", days,
          title: `SMS sendt for ${days} dage siden` };
  }

  const days = daysSince(row.createdon);
  if (/^(afventer|set)$/i.test(status) && days >= REMINDER_DAYS) {
    return { rowClass: "needsReminder", pillClass: "reminder", days,
             title: `Ikke besvaret ${days} dage efter oprettelse - send påmindelse` };
  }
  return null;
}

function smsSendtText(row) {
  return row.cr175_lch_smssendttidspunkt ? fmtDateTime(row.cr175_lch_smssendttidspunkt) : "Nej";
}

function rowHtml(row) {
  const id = row.cr175_lch_kundeinfo_kundeundersoegelseid;
  const code = row.cr175_lch_kode || "";
  const customerName = row.cr175_lch_kundenavn || "(uden navn)";

  // "Skema udfyldt": kun relevant når status faktisk er nået dertil - viser
  // "Sidst rettet"-tidspunktet i så fald (vi har ikke et dedikeret
  // udfyldt-tidspunkt-felt), ellers "—".
  const statusLabel = getStatusLabel(row);
  const isUdfyldtOrLater = /udfyldt|afslut/i.test(statusLabel);
  const udfyldtAt = isUdfyldtOrLater ? fmtDateTime(row.sidstRettet) : "—";

  // "SMS sendt" = cr175_lch_smssendttidspunkt (sat af runbook'en eller af
  // "Send SMS" med "Registrér som SMS sendt" slået til).
  const smsSendtHtml = escapeHtml(smsSendtText(row));
  const reminder = reminderState(row);
  const isArchived = !!row.cr175_lch_arkiveretdato;
  const canSendSms = id && !isArchived && !/^(afsluttet|udfyldt)$/i.test(statusLabel);
  const seSkemaLink = code ? `./kundesurvey.html?code=${encodeURIComponent(code)}&ro=1` : "#";
  const prefillLink = id ? `./admincreate.html?instanceId=${encodeURIComponent(id)}` : "#";
  const customerLink = code ? `${window.location.origin}/kundesurvey.html?code=${encodeURIComponent(code)}` : "";

  return `
    <tr class="clickableRow${reminder ? ` ${reminder.rowClass}` : ""}${isArchived ? " archivedRow" : ""}" data-href="${escapeHtml(seSkemaLink)}"${
      reminder ? ` title="${escapeHtml(reminder.title)}"` : ""}>
      <td><input type="checkbox" class="rowCheck" data-id="${escapeHtml(id || "")}" /></td>
      <td>${escapeHtml(customerName)}</td>
      <td>${escapeHtml(code)}</td>
      <td>${statusPillHtml(row)}${reminder ? `<span class="pill ${reminder.pillClass}">${reminder.days} dage</span>` : ""}${
        isArchived ? `<span class="pill archived" title="Arkiveret ${escapeHtml(fmtDateTime(row.cr175_lch_arkiveretdato))}">Arkiveret</span>` : ""}</td>
      <td>${fmtDateTime(row.createdon)}</td>
      <td>${jaNejHtml(row.cr175_lch_mailsendttidspunkt)}</td>
      <td>${udfyldtAt}</td>
      <td>${smsSendtHtml}</td>
      <td>${fmtDateTime(row.sidstRettet)}</td>
      <td>
        <div class="rowActions">
          ${customerLink
            ? `<a class="tag" href="${escapeHtml(customerLink)}" target="_blank" rel="noopener">Som kunde</a>`
            : ""}
          <a class="tag" href="${prefillLink}">Prefill</a>
          ${customerLink
            ? `<a class="tag copyLinkBtn" href="#" data-link="${escapeHtml(customerLink)}">Kopier link</a>`
            : ""}
          ${canSendSms
            ? `<a class="tag sendSmsBtn" href="#" data-id="${escapeHtml(id)}">Send SMS</a>`
            : ""}
          ${isArchived && id
            ? `<a class="tag unarchiveBtn" href="#" data-id="${escapeHtml(id)}">Fjern fra arkiv</a>`
            : ""}
          ${!isArchived && id
            ? `<a class="tag archiveBtn" href="#" data-id="${escapeHtml(id)}">Arkivér</a>`
            : ""}
        </div>
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
  if ($("btnArchiveSelected")) $("btnArchiveSelected").disabled = checked.length === 0;
  $("selectedCount").textContent = checked.length ? `${checked.length} valgt` : "";

  const checkAll = $("checkAll");
  if (checkAll) {
    checkAll.checked = checks.length > 0 && checked.length === checks.length;
    checkAll.indeterminate = checked.length > 0 && checked.length < checks.length;
  }
}

// Arkiverer (eller gendanner) ét eller flere skemaer via /api/survey-archive.
async function setArchived(ids, archive) {
  const r = await fetch("/api/survey-archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instanceIds: ids, archive })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 207) throw new Error(data.message || data.error || `${r.status}`);
  return (data.results || []).filter(x => !x.ok);
}

async function archiveSelected() {
  const ids = [...document.querySelectorAll(".rowCheck:checked")]
    .map(c => c.dataset.id)
    .filter(Boolean);
  if (!ids.length) return;

  if (!confirm(`Arkivér ${ids.length} valgte kundesurvey(s)? De kan findes igen med "Vis arkiverede".`)) return;

  const btn = $("btnArchiveSelected");
  btn.disabled = true;
  try {
    const failed = await setArchived(ids, true);
    if (failed.length) {
      console.error("survey-archive fejl for:", failed);
      showToast(`${ids.length - failed.length} arkiveret – ${failed.length} fejlede (se konsollen)`, "error");
    } else {
      showToast(`${ids.length} kundesurvey${ids.length === 1 ? "" : "s"} arkiveret ✔`, "success");
    }
    await load();
  } catch (e) {
    console.error("survey-archive fejl:", e);
    showToast(`Kunne ikke arkivere: ${e.message}`, "error");
    btn.disabled = false;
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
    const okCount = ids.length - failed.length;

    if (failed.length) {
      $("status").textContent = `${failed.length} kunne ikke slettes – se konsollen for detaljer.`;
      console.error("survey-delete fejl for:", failed);
      showToast(
        okCount
          ? `${okCount} slettet ✔ – ${failed.length} kunne ikke slettes`
          : `Ingen blev slettet – se konsollen for detaljer`,
        okCount ? "error" : "error"
      );
    } else {
      $("status").textContent = "";
      showToast(`${okCount} kundesurvey${okCount === 1 ? "" : "s"} slettet ✔`, "success");
    }

    await load();
  } catch (e) {
    console.error("survey-delete fejl:", e);
    $("status").textContent = `Kunne ikke slette: ${e.message}`;
    showToast(`Kunne ikke slette: ${e.message}`, "error");
    btn.disabled = false;
  }
}

let allRows = [];
let selectedStatusFilters = new Set();

function getFilterValues() {
  return {
    search: ($("searchInput")?.value || "").trim().toLowerCase(),
    kundenavn: ($("filterKundenavn")?.value || "").trim().toLowerCase(),
    kode: ($("filterKode")?.value || "").trim().toLowerCase(),
    status: selectedStatusFilters,
    oprettet: ($("filterOprettet")?.value || "").trim().toLowerCase(),
    mailSendt: ($("filterMailSendt")?.value || "").trim().toLowerCase(),
    udfyldt: ($("filterUdfyldt")?.value || "").trim().toLowerCase(),
    udloeber: ($("filterUdloeber")?.value || "").trim().toLowerCase(),
    sidstRettet: ($("filterSidstRettet")?.value || "").trim().toLowerCase()
  };
}

function rowMatchesFilters(row, f) {
  const kundenavn = String(row.cr175_lch_kundenavn || "(uden navn)").toLowerCase();
  const kode = String(row.cr175_lch_kode || "").toLowerCase();
  const statusLabel = getStatusLabel(row);
  const oprettet = fmtDateTime(row.createdon).toLowerCase();
  const mailSendt = jaNejHtml(row.cr175_lch_mailsendttidspunkt).toLowerCase();
  const isUdfyldtOrLater = /udfyldt|afslut/i.test(statusLabel);
  const udfyldt = (isUdfyldtOrLater ? fmtDateTime(row.sidstRettet) : "—").toLowerCase();
  const udloeber = smsSendtText(row).toLowerCase();
  const sidstRettet = fmtDateTime(row.sidstRettet).toLowerCase();

  if (f.search && !(kundenavn.includes(f.search) || kode.includes(f.search))) return false;
  if (f.kundenavn && !kundenavn.includes(f.kundenavn)) return false;
  if (f.kode && !kode.includes(f.kode)) return false;
  if (f.status.size && !f.status.has(statusLabel)) return false;
  if (f.oprettet && !oprettet.includes(f.oprettet)) return false;
  if (f.mailSendt && !mailSendt.includes(f.mailSendt)) return false;
  if (f.udfyldt && !udfyldt.includes(f.udfyldt)) return false;
  if (f.udloeber && !udloeber.includes(f.udloeber)) return false;
  if (f.sidstRettet && !sidstRettet.includes(f.sidstRettet)) return false;

  return true;
}

function updateStatusFilterButtonLabel() {
  const btn = $("filterStatusBtn");
  if (!btn) return;

  if (!selectedStatusFilters.size) {
    btn.textContent = "Alle";
  } else if (selectedStatusFilters.size === 1) {
    btn.textContent = [...selectedStatusFilters][0];
  } else {
    btn.textContent = `${selectedStatusFilters.size} valgt`;
  }
}

function populateStatusFilterOptions(rows) {
  const panel = $("filterStatusPanel");
  if (!panel) return;

  const labels = [...new Set(rows.map(getStatusLabel))].sort((a, b) => a.localeCompare(b, "da"));

  // Fjern valgte statusser der ikke længere findes i data (fx efter filtrering)
  for (const s of [...selectedStatusFilters]) {
    if (!labels.includes(s)) selectedStatusFilters.delete(s);
  }

  panel.innerHTML = labels.map(l =>
    `<label><input type="checkbox" value="${escapeHtml(l)}" ${selectedStatusFilters.has(l) ? "checked" : ""} /><span>${escapeHtml(l)}</span></label>`
  ).join("");

  updateStatusFilterButtonLabel();
}

function renderTable(rows) {
  const table = $("surveyTable");
  const tbody = table.querySelector("tbody");

  tbody.innerHTML = rows.length
    ? rows.map(rowHtml).join("")
    : `<tr class="noResults"><td colspan="10">Ingen kundesurveys matcher filtrene.</td></tr>`;

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

  // "Arkivér" (fx et skema kunden aldrig svarer på, heller ikke efter SMS)
  // og "Fjern fra arkiv" på den enkelte række.
  tbody.querySelectorAll(".archiveBtn, .unarchiveBtn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const archive = btn.classList.contains("archiveBtn");
      if (archive && !confirm("Arkivér dette skema? Det kan findes igen med \"Vis arkiverede\".")) return;

      btn.style.pointerEvents = "none";
      try {
        const failed = await setArchived([btn.dataset.id], archive);
        if (failed.length) throw new Error(failed[0].error || "ukendt fejl");
        showToast(archive ? "Skemaet er arkiveret ✔" : "Skemaet er fjernet fra arkivet ✔", "success");
        await load();
      } catch (err) {
        console.error("survey-archive fejl:", err);
        showToast(`${archive ? "Kunne ikke arkivere" : "Kunne ikke fjerne fra arkiv"}: ${err.message}`, "error");
        btn.style.pointerEvents = "";
      }
    });
  });

  tbody.querySelectorAll(".sendSmsBtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openSmsModal(btn.dataset.id);
    });
  });

  const filterCount = $("filterCount");
  if (filterCount) {
    filterCount.textContent =
      rows.length === allRows.length ? "" : `Viser ${rows.length} af ${allRows.length}`;
  }
}

/* ---------- "Send SMS"-vindue ----------
   Henter den aktive SMS-skabelon udfyldt for skemaet (/api/survey-sms-preview),
   henter ejerne fra Entra (/api/entra-customer-contacts - samme kilde som
   admincreate.html), lader admin vælge en eller flere ejere og rette nummer
   og tekst, og sender via /api/survey-send-sms. Nummerfeltet er forudfyldt
   med skemaets mobil (cr175_lch_sendttilmobil); den ejer der har det nummer,
   er sat hak ved. Feltet kan rettes frit, fx til eget nummer ved test. */

let smsInstanceId = null;
let smsTemplates = []; // [{ category, label, name, message }] fra survey-sms-preview

function fillSmsTemplateSelect(selectedCategory) {
  const sel = $("smsTemplate");
  if (!sel) return;
  if (!smsTemplates.length) {
    sel.innerHTML = `<option value="">Ingen aktive SMS-skabeloner</option>`;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = smsTemplates
    .map(t => `<option value="${escapeHtml(t.category)}">${escapeHtml(t.label)} – ${escapeHtml(t.name)}</option>`)
    .join("");
  if (selectedCategory && smsTemplates.some(t => t.category === selectedCategory)) {
    sel.value = selectedCategory;
  }
}

// Skift skabelon: teksten erstattes med den valgte skabelons tekst. Har
// admin selv rettet i teksten, spørges der først.
let smsTextOriginal = "";
function onSmsTemplateChange() {
  const t = smsTemplates.find(x => x.category === $("smsTemplate").value);
  if (!t) return;
  const current = $("smsText").value;
  if (current.trim() && current !== smsTextOriginal &&
      !confirm("Du har rettet i teksten. Erstat den med den valgte skabelon?")) {
    return;
  }
  $("smsText").value = t.message;
  smsTextOriginal = t.message;
  $("smsTemplateHint").textContent = "";
  $("smsTemplateHint").classList.remove("warn");
  updateSmsCount();
}

function phoneKey(raw) {
  let n = String(raw || "").replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  if (/^45\d{8}$/.test(n)) n = n.slice(2);
  return n;
}

function splitNumbers(value) {
  return String(value || "").split(/[,;]/).map(x => x.trim()).filter(Boolean);
}

function ownerPhone(owner) {
  return String(owner.mobilePhone || owner.businessPhone || "").trim();
}

// Hak ved en ejer tilføjer nummeret i feltet, fjern hak fjerner det.
function onOwnerToggle(e) {
  const cb = e.target.closest("input[type=checkbox][data-phone]");
  if (!cb) return;
  const phone = cb.dataset.phone;
  const key = phoneKey(phone);
  let nums = splitNumbers($("smsTo").value).filter(n => phoneKey(n) !== key);
  if (cb.checked) nums.push(phone);
  $("smsTo").value = nums.join(", ");
}

// Holder hakkerne i takt med feltet, hvis admin skriver/sletter numre selv.
function syncOwnerChecks() {
  const keys = new Set(splitNumbers($("smsTo").value).map(phoneKey));
  document.querySelectorAll("#smsOwners input[data-phone]").forEach(cb => {
    cb.checked = keys.has(phoneKey(cb.dataset.phone));
  });
}

async function loadSmsOwners(kundenummer, instanceId) {
  const box = $("smsOwners");
  if (!kundenummer) {
    box.innerHTML = `<span class="hint">Skemaet har intet kundenummer.</span>`;
    return;
  }
  box.innerHTML = `<span class="hint">Henter ejere for ${escapeHtml(kundenummer)}…</span>`;

  try {
    const r = await fetch(`/api/entra-customer-contacts?kundenr=${encodeURIComponent(kundenummer)}`, { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || data.error || `${r.status}`);
    if (smsInstanceId !== instanceId) return;

    const owners = Array.isArray(data.owners) ? data.owners : [];
    if (!owners.length) {
      box.innerHTML = `<span class="hint">Ingen ejere fundet i kontaktlisten.</span>`;
      return;
    }

    box.innerHTML = owners.map(o => {
      const phone = ownerPhone(o);
      const name = escapeHtml(o.displayName || "(uden navn)");
      return phone
        ? `<label><input type="checkbox" data-phone="${escapeHtml(phone)}" /> ${name} – ${escapeHtml(phone)}</label>`
        : `<label class="noPhone"><input type="checkbox" disabled /> ${name} – intet telefonnummer</label>`;
    }).join("");

    syncOwnerChecks();
  } catch (e) {
    console.error("entra-customer-contacts fejl:", e);
    if (smsInstanceId === instanceId) {
      box.innerHTML = `<span class="hint warn">Kunne ikke hente ejere: ${escapeHtml(e.message)}</span>`;
    }
  }
}

const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

function smsInfo(text) {
  let len = 0;
  for (const ch of String(text || "")) {
    if (GSM7.includes(ch)) len += 1;
    else if (GSM7_EXT.includes(ch)) len += 2;
    else {
      const n = [...String(text || "")].length;
      return { chars: n, unicode: true, parts: n <= 70 ? 1 : Math.ceil(n / 67) };
    }
  }
  return { chars: len, unicode: false, parts: len <= 160 ? 1 : Math.ceil(len / 153) };
}

function updateSmsCount() {
  const info = smsInfo($("smsText").value);
  const el = $("smsCount");
  el.textContent = `${info.chars} tegn = ${info.parts} SMS${info.unicode ? " (specialtegn/emoji – kun 70 tegn pr. SMS)" : ""}`;
  el.classList.toggle("warn", info.unicode || info.parts > 4);
}

function setSmsStatus(text, isError = false) {
  const el = $("smsStatus");
  el.textContent = text || "";
  el.classList.toggle("warn", !!isError);
}

function closeSmsModal() {
  $("smsModal").classList.add("hidden");
  smsInstanceId = null;
}

async function openSmsModal(instanceId) {
  smsInstanceId = instanceId;

  $("smsModalCustomer").textContent = "Henter…";
  $("smsTo").value = "";
  $("smsToHint").textContent = "";
  $("smsText").value = "";
  $("smsTemplateHint").textContent = "";
  $("smsTemplateHint").classList.remove("warn");
  $("smsMarkSent").checked = true;
  $("smsOwners").innerHTML = `<span class="hint">Henter ejere…</span>`;
  smsTemplates = [];
  smsTextOriginal = "";
  if ($("smsTemplate")) {
    $("smsTemplate").innerHTML = `<option value="">Henter skabeloner…</option>`;
    $("smsTemplate").disabled = true;
  }
  $("smsSend").disabled = true;
  setSmsStatus("");
  updateSmsCount();
  $("smsModal").classList.remove("hidden");

  try {
    const r = await fetch(`/api/survey-sms-preview?id=${encodeURIComponent(instanceId)}`, { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || data.error || `${r.status}`);
    if (smsInstanceId !== instanceId) return; // vinduet er lukket/skiftet imens

    $("smsModalCustomer").textContent =
      `${data.kundenavn || "(uden navn)"} – kode ${data.kode || ""} – status ${data.status || "—"}`;
    $("smsTo").value = data.mobil || "";
    $("smsToHint").textContent = data.mobil
      ? `Skemaets mobilnummer: ${data.mobil}`
      : "Der er intet mobilnummer på skemaet.";
    $("smsText").value = data.message || "";
    smsTextOriginal = data.message || "";
    smsTemplates = Array.isArray(data.templates) ? data.templates : [];
    fillSmsTemplateSelect(data.templateCategory);

    const tplHint = $("smsTemplateHint");
    if (data.templateWarning) {
      tplHint.textContent = data.templateWarning;
      tplHint.classList.add("warn");
    } else {
      tplHint.textContent = data.templateName ? `Skabelon: ${data.templateName}` : "";
    }

    updateSmsCount();
    loadSmsOwners(data.kundenummer, instanceId);
    $("smsSend").disabled = false;
    $("smsTo").focus();
  } catch (e) {
    console.error("survey-sms-preview fejl:", e);
    $("smsModalCustomer").textContent = "";
    setSmsStatus(`Kunne ikke hente SMS-tekst: ${e.message}`, true);
    $("smsSend").disabled = false; // man kan stadig skrive teksten selv
  }
}

async function sendSms() {
  const numbers = splitNumbers($("smsTo").value);
  const message = $("smsText").value.trim();
  const markSent = $("smsMarkSent").checked;

  if (!numbers.length) { setSmsStatus("Vælg en ejer eller skriv et mobilnummer.", true); return; }
  if (!message) { setSmsStatus("Teksten er tom.", true); return; }

  const parts = smsInfo(message).parts;
  const toText = numbers.join(", ");
  if (!confirm(`Send SMS (${parts} del${parts === 1 ? "" : "e"}) til ${numbers.length === 1 ? toText : `${numbers.length} modtagere: ${toText}`}?`)) return;

  $("smsSend").disabled = true;
  setSmsStatus("Sender…");

  try {
    const r = await fetch("/api/survey-send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ instanceId: smsInstanceId, to: numbers, message, markSent })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || data.error || `${r.status}`);

    closeSmsModal();
    const sentTo = Array.isArray(data.to) ? data.to.join(", ") : data.to;
    let msg = `SMS sendt til ${sentTo} ✔`;
    if (data.logError) msg += " (men kunne ikke logges i SMS-loggen)";
    showToast(msg, data.logError ? "error" : "success");
    if (data.marked) await load();
  } catch (e) {
    console.error("survey-send-sms fejl:", e);
    setSmsStatus(`Fejl: ${e.message}`, true);
    $("smsSend").disabled = false;
  }
}

function applyFilters() {
  const f = getFilterValues();
  renderTable(allRows.filter(row => rowMatchesFilters(row, f)));
}

function clearFilters() {
  const searchInput = $("searchInput");
  if (searchInput) searchInput.value = "";
  ["filterKundenavn", "filterKode", "filterOprettet", "filterMailSendt", "filterUdfyldt", "filterUdloeber", "filterSidstRettet"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });
  selectedStatusFilters.clear();
  const statusPanel = $("filterStatusPanel");
  if (statusPanel) statusPanel.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = false; });
  updateStatusFilterButtonLabel();
  applyFilters();
}

async function load() {
  const status = $("status");
  const table = $("surveyTable");

  status.textContent = "Indlæser kundesurveys…";
  table.style.display = "none";

  try {
    // Arkiverede hentes kun, når "Vis arkiverede" er slået til.
    const includeArchived = $("showArchived")?.checked ? "&includeArchived=1" : "";
    const r = await fetch(`/api/survey-list?top=200${includeArchived}`, { cache: "no-store" });
    const text = await r.text();
    const data = text ? JSON.parse(text) : {};

    if (!r.ok || data.error) {
      throw new Error(data.error || `${r.status}`);
    }

    allRows = data.value || [];

    if (!allRows.length) {
      status.textContent = $("showArchived")?.checked
        ? "Ingen kundesurveys oprettet endnu."
        : "Ingen aktive kundesurveys. Slå \"Vis arkiverede\" til for at se arkiverede.";
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

  // Viser en bekræftelse her, hvis vi lige er kommet fra admincreate.html
  // efter at have oprettet/opdateret et skema - resultatboksen dér nåede
  // kun at vises et splitsekund før redirect hertil.
  const params = new URLSearchParams(location.search);
  if (params.has("created")) {
    showToast("Nyt skema oprettet ✔", "success");
    params.delete("created");
    history.replaceState({}, "", location.pathname + (params.toString() ? `?${params}` : ""));
  } else if (params.has("updated")) {
    showToast("Skema opdateret ✔", "success");
    params.delete("updated");
    history.replaceState({}, "", location.pathname + (params.toString() ? `?${params}` : ""));
  }

  $("checkAll")?.addEventListener("change", (e) => {
    document.querySelectorAll(".rowCheck").forEach(cb => { cb.checked = e.target.checked; });
    updateSelectionUi();
  });

  $("btnDeleteSelected")?.addEventListener("click", deleteSelected);
  $("btnArchiveSelected")?.addEventListener("click", archiveSelected);

  $("smsText")?.addEventListener("input", updateSmsCount);
  $("smsTemplate")?.addEventListener("change", onSmsTemplateChange);
  $("smsOwners")?.addEventListener("change", onOwnerToggle);
  $("smsTo")?.addEventListener("input", syncOwnerChecks);
  $("smsSend")?.addEventListener("click", sendSms);
  $("smsCancel")?.addEventListener("click", closeSmsModal);
  $("smsModal")?.addEventListener("click", (e) => {
    if (e.target === $("smsModal")) closeSmsModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("smsModal")?.classList.contains("hidden")) closeSmsModal();
  });

  ["searchInput", "filterKundenavn", "filterKode", "filterOprettet", "filterMailSendt", "filterUdfyldt", "filterUdloeber", "filterSidstRettet"]
    .forEach(id => $(id)?.addEventListener("input", applyFilters));
  $("filterStatusBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    $("filterStatusPanel")?.classList.toggle("open");
  });

  $("filterStatusPanel")?.addEventListener("change", (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;

    if (cb.checked) selectedStatusFilters.add(cb.value);
    else selectedStatusFilters.delete(cb.value);

    updateStatusFilterButtonLabel();
    applyFilters();
  });

  document.addEventListener("click", (e) => {
    const dropdown = $("filterStatusPanel")?.closest(".statusFilterDropdown");
    if (dropdown && !dropdown.contains(e.target)) {
      $("filterStatusPanel")?.classList.remove("open");
    }
  });
  $("btnClearFilters")?.addEventListener("click", clearFilters);
  $("showArchived")?.addEventListener("change", load);

  // Klik et sted på en række (uden for checkbox/handlinger) åbner "Se skema".
  $("surveyTable")?.querySelector("tbody")?.addEventListener("click", (e) => {
    if (e.target.closest("input, a, button")) return;
    const tr = e.target.closest("tr.clickableRow");
    if (tr?.dataset.href) location.href = tr.dataset.href;
  });
});
