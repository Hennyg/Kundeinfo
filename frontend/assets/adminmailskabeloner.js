// /frontend/assets/adminmailskabeloner.js
//
// Vedligeholder både mail- og SMS-skabeloner i samme Dataverse-tabel
// (cr175_lch_kundeinfo_mailskabelons). En SMS-skabelon er kendetegnet ved
// kategorien "sms-paamindelse" (standard: Afventer) eller
// "sms-paamindelse-set" (status Set og Igang) - der er altså intet separat type-felt i
// Dataverse. SMS-skabeloner har ingen emne og ingen PDF, og
// brødteksten er ren tekst. De bruges af SMS-påmindelses-runbook'en i
// Automation Account "Kundeinfo".
let els = null;

const SMS_CATEGORY = "sms-paamindelse";
const SMS_CATEGORIES = ["sms-paamindelse", "sms-paamindelse-set"];

function smsVariantFromCategory(kategori) {
  const k = String(kategori || "").trim().toLowerCase();
  return SMS_CATEGORIES.includes(k) ? k : SMS_CATEGORY;
}

function isSmsCategory(kategori) {
  return String(kategori || "").trim().toLowerCase().startsWith("sms");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Konverterer almindelig tekst til pæn, mail-venlig HTML: en tom linje
// (dobbelt linjeskift) starter et nyt afsnit (<p>), et enkelt linjeskift
// inden i et afsnit bliver til <br>. {{pladsholdere}} går uændret igennem,
// da de hverken indeholder &, < eller >.
function plainTextToHtml(text) {
  const paragraphs = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  if (!paragraphs.length) return "";

  return paragraphs
    .map(p => {
      const withBreaks = escapeHtml(p).replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px; font-family:Arial, sans-serif; font-size:14px; line-height:1.5; color:#222;">${withBreaks}</p>`;
    })
    .join("\n");
}

function getEls() {
  return {
    loading: document.getElementById("loading"),
    authDenied: document.getElementById("authDenied"),
    app: document.getElementById("app"),
    me: document.getElementById("userInfo"),

    listStatus: document.getElementById("listStatus"),
    tableBody: document.querySelector("#ttable tbody"),
    table: document.getElementById("ttable"),

    form: document.getElementById("templateForm"),
    status: document.getElementById("formStatus"),
    btnReset: document.getElementById("btnReset"),

    tid: document.getElementById("tid"),
    ttype: document.getElementById("ttype"),
    tsmsvariant: document.getElementById("tsmsvariant"),
    tbroedtekstLabel: document.getElementById("tbroedtekstLabel"),
    smsCounter: document.getElementById("smsCounter"),
    hintMail: document.getElementById("hintMail"),
    hintSms: document.getElementById("hintSms"),
    tnavn: document.getElementById("tnavn"),
    tkategori: document.getElementById("tkategori"),
    temne: document.getElementById("temne"),
    tbroedtekst: document.getElementById("tbroedtekst"),
    taktiv: document.getElementById("taktiv"),

    tpdf: document.getElementById("tpdf"),
    currentPdfInfo: document.getElementById("currentPdfInfo"),
    btnRemovePdf: document.getElementById("btnRemovePdf"),

    placeholderList: document.getElementById("placeholderList"),

    plainTextInput: document.getElementById("plainTextInput"),
    htmlOutput: document.getElementById("htmlOutput"),
    btnUseHtmlInBody: document.getElementById("btnUseHtmlInBody"),
    btnCopyHtml: document.getElementById("btnCopyHtml"),
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

// Tilstand for PDF-uploadfeltet: "keep" (rør ikke ved en evt. eksisterende
// vedhæftning), "replace" (der er valgt en ny fil, gemmes ved Gem), eller
// "remove" (admin har trykket "Fjern vedhæftning"). Holdes uden for selve
// formularen, fordi selve PDF-indholdet aldrig hentes tilbage fra serveren
// (kun filnavnet) - vi kan derfor ikke bare læse det ud af et inputfelt.
let pdfState = { action: "keep", base64: null, filename: null };

const MAX_PDF_BYTES = 700 * 1024;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result er "data:application/pdf;base64,JVBERi0..." - vi vil
      // kun have selve base64-delen, da det er det Graph's fileAttachment
      // forventer i contentBytes.
      const commaIdx = String(reader.result).indexOf(",");
      resolve(commaIdx >= 0 ? reader.result.slice(commaIdx + 1) : reader.result);
    };
    reader.onerror = () => reject(reader.error || new Error("Kunne ikke læse filen"));
    reader.readAsDataURL(file);
  });
}

function updateCurrentPdfInfo(existingFilename) {
  if (!els.currentPdfInfo || !els.btnRemovePdf) return;

  if (pdfState.action === "replace") {
    els.currentPdfInfo.textContent = `Ny fil valgt: ${pdfState.filename} (gemmes når du trykker Gem)`;
    els.btnRemovePdf.classList.remove("hidden");
  } else if (pdfState.action === "remove") {
    els.currentPdfInfo.textContent = "Vedhæftning fjernes når du trykker Gem";
    els.btnRemovePdf.classList.add("hidden");
  } else if (existingFilename) {
    els.currentPdfInfo.textContent = `Nuværende vedhæftning: ${existingFilename}`;
    els.btnRemovePdf.classList.remove("hidden");
  } else {
    els.currentPdfInfo.textContent = "Ingen vedhæftning";
    els.btnRemovePdf.classList.add("hidden");
  }
}

/* ---------- Mail/SMS-type ---------- */

function currentType() {
  return els.ttype?.value === "sms" ? "sms" : "mail";
}

// GSM 7-bit tegnsæt (inkl. æøåÆØÅ). Tegn udenfor gør SMS'en til Unicode,
// hvor der kun er plads til 70 tegn pr. SMS.
const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

function smsInfo(text) {
  let len = 0;
  let unicode = false;
  for (const ch of String(text || "")) {
    if (GSM7.includes(ch)) len += 1;
    else if (GSM7_EXT.includes(ch)) len += 2;
    else { unicode = true; break; }
  }
  if (unicode) {
    const n = [...String(text || "")].length;
    return { chars: n, unicode: true, parts: n <= 70 ? 1 : Math.ceil(n / 67) };
  }
  return { chars: len, unicode: false, parts: len <= 160 ? 1 : Math.ceil(len / 153) };
}

function updateSmsCounter() {
  if (!els.smsCounter) return;
  if (currentType() !== "sms") {
    els.smsCounter.classList.add("hidden");
    return;
  }
  const text = els.tbroedtekst.value || "";
  const info = smsInfo(text);
  els.smsCounter.classList.remove("hidden");
  els.smsCounter.classList.toggle("warn", info.parts > 1 || info.unicode);
  els.smsCounter.textContent =
    `${info.chars} tegn = ${info.parts} SMS${info.unicode ? " (specialtegn/emoji – kun 70 tegn pr. SMS)" : ""}. ` +
    `Tallet er før pladsholdere indsættes – {{link}} fylder ca. 55 tegn, {{kundenavn}}, {{mail}} og {{afsender}} varierer.`;
}

function applyTypeUI() {
  const sms = currentType() === "sms";

  document.querySelectorAll(".mailOnly").forEach(el => el.classList.toggle("hidden", sms));
  document.querySelectorAll(".smsOnly").forEach(el => el.classList.toggle("hidden", !sms));
  els.hintMail?.classList.toggle("hidden", sms);
  els.hintSms?.classList.toggle("hidden", !sms);

  if (els.tbroedtekstLabel) els.tbroedtekstLabel.textContent = sms ? "SMS-tekst" : "Brødtekst (HTML)";
  els.tbroedtekst.rows = sms ? 5 : 12;
  els.tbroedtekst.placeholder = sms
    ? "Hej {{kundenavn}}. Vi mangler stadig dit svar på vores spørgeskema: {{link}} Mvh Lely Center Herrup"
    : "Hej {{kundenavn}},\n\nUdfyld venligst spørgeskemaet her: {{link}}";

  if (sms) {
    els.tkategori.value = smsVariantFromCategory(els.tsmsvariant?.value);
    els.tkategori.readOnly = true;
  } else {
    if (isSmsCategory(els.tkategori.value)) els.tkategori.value = "";
    els.tkategori.readOnly = false;
  }

  updateSmsCounter();
}

function readForm() {
  const sms = currentType() === "sms";

  const payload = {
    id: (els.tid.value || "").trim() || null,
    navn: (els.tnavn.value || "").trim(),
    kategori: sms ? smsVariantFromCategory(els.tsmsvariant?.value) : ((els.tkategori.value || "").trim() || null),
    emne: sms ? null : ((els.temne.value || "").trim() || null),
    broedtekst: (sms ? (els.tbroedtekst.value || "").trim() : els.tbroedtekst.value) || null,
    aktiv: !!els.taktiv.checked,
  };

  // En SMS kan ikke have en vedhæftning - fjern en evt. eksisterende.
  if (sms) {
    payload.vedhaeftetpdf = null;
    payload.vedhaeftetpdfnavn = null;
    return payload;
  }

  // PDF-felterne sendes KUN med hvis admin aktivt har ændret noget - ellers
  // rører vi ikke ved en evt. eksisterende vedhæftning (se
  // mailskabeloner-patch/index.js).
  if (pdfState.action === "replace") {
    payload.vedhaeftetpdf = pdfState.base64;
    payload.vedhaeftetpdfnavn = pdfState.filename;
  } else if (pdfState.action === "remove") {
    payload.vedhaeftetpdf = null;
    payload.vedhaeftetpdfnavn = null;
  }

  return payload;
}

function fillForm(t) {
  els.tid.value = t.cr175_lch_kundeinfo_mailskabelonid || "";
  els.tnavn.value = t.cr175_lch_navn || "";
  els.tkategori.value = t.cr175_lch_kategori || "";
  els.temne.value = t.cr175_lch_emne || "";
  els.tbroedtekst.value = t.cr175_lch_broedtekst || "";
  els.taktiv.checked = (t.cr175_lch_aktiv ?? true) === true;
  if (els.ttype) els.ttype.value = isSmsCategory(t.cr175_lch_kategori) ? "sms" : "mail";
  if (els.tsmsvariant) els.tsmsvariant.value = smsVariantFromCategory(t.cr175_lch_kategori);

  pdfState = { action: "keep", base64: null, filename: null };
  if (els.tpdf) els.tpdf.value = "";
  updateCurrentPdfInfo(t.cr175_lch_vedhaeftetpdfnavn || null);
  applyTypeUI();
}

function resetForm() {
  els.form.reset();
  els.tid.value = "";
  els.status.textContent = "";
  els.taktiv.checked = true;
  if (els.ttype) els.ttype.value = "mail";
  if (els.tsmsvariant) els.tsmsvariant.value = SMS_CATEGORY;

  pdfState = { action: "keep", base64: null, filename: null };
  if (els.tpdf) els.tpdf.value = "";
  updateCurrentPdfInfo(null);
  applyTypeUI();
}

async function listTemplates() {
  els.listStatus.textContent = "Indlæser…";
  els.tableBody.innerHTML = "";

  const r = await fetch('/api/mailskabeloner-get?top=500', { cache: "no-store" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`mailskabeloner-get fejlede (${r.status}): ${t}`);
  }

  const data = await r.json();
  const rows = data?.value || data || [];

  rows.sort((a, b) => String(a.cr175_lch_navn || "").localeCompare(String(b.cr175_lch_navn || ""), "da"));

  rows.forEach(t => {
    const sms = isSmsCategory(t.cr175_lch_kategori);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(t.cr175_lch_navn ?? '')}</td>
      <td>${sms ? (smsVariantFromCategory(t.cr175_lch_kategori) === 'sms-paamindelse-set' ? 'SMS (Set/Igang)' : 'SMS') : 'Mail'}</td>
      <td>${escapeHtml(t.cr175_lch_kategori ?? '—')}</td>
      <td>${sms ? '—' : escapeHtml(t.cr175_lch_emne ?? '')}</td>
      <td>${t.cr175_lch_vedhaeftetpdfnavn ? `Ja (${escapeHtml(t.cr175_lch_vedhaeftetpdfnavn)})` : '—'}</td>
      <td>${(t.cr175_lch_aktiv ?? true) ? 'Ja' : 'Nej'}</td>
      <td class="actions">
        <button data-act="edit" data-id="${t.cr175_lch_kundeinfo_mailskabelonid}">Redigér</button>
        <button data-act="del"  data-id="${t.cr175_lch_kundeinfo_mailskabelonid}">Slet</button>
      </td>
    `;
    els.tableBody.appendChild(tr);
  });

  els.listStatus.textContent = "";
}

/* ---------- Pladsholdere ({{kode}}) ----------
   Ren visning - ingen database bagved. Dette er de pladsholdere koden
   rent faktisk understøtter (se api/survey-send-invite-mail/index.js).
   Tilføjes en ny pladsholder i koden, skal den også tilføjes her manuelt. */

// sms: true = understøttes også i SMS-skabeloner (runbook'en).
const AVAILABLE_PLACEHOLDERS = [
  { kode: "kundenavn", navn: "Kundenavn", beskrivelse: "Kundens navn uden kundenummer, fx 'Enslev Agro I/S'", sms: true },
  { kode: "kode", navn: "Kode", beskrivelse: "Skemaets kode, fx '111965'", sms: true },
  { kode: "link", navn: "Link", beskrivelse: "Link til selve spørgeskemaet kunden skal udfylde", sms: true },
  { kode: "mail", navn: "Mail (kun SMS)", beskrivelse: "Den mailadresse invitationen blev sendt til", sms: true },
  { kode: "afsender", navn: "Afsender (kun SMS)", beskrivelse: "Fornavn på den der oprettede skemaet + 'Tel: 30506180 (Tryk 4)'", sms: true },
  { kode: "afsendernavn", navn: "Afsendernavn", beskrivelse: "Navnet på den admin-bruger der sender mailen (til signatur)" },
  { kode: "kundeemail", navn: "Kundens e-mail", beskrivelse: "Fra Uniconta debitor-data" },
  { kode: "telefon", navn: "Telefon", beskrivelse: "Fra Uniconta debitor-data" },
  { kode: "mobil", navn: "Mobil", beskrivelse: "Fra Uniconta debitor-data" },
  { kode: "cvr", navn: "CVR", beskrivelse: "Fra Uniconta debitor-data" },
  { kode: "adresse", navn: "Adresse", beskrivelse: "Fra Uniconta debitor-data" },
  { kode: "postnr_by", navn: "Postnr. og by", beskrivelse: "Fra Uniconta debitor-data" },
  { kode: "kontaktperson", navn: "Kontaktperson", beskrivelse: "Fra Uniconta debitor-data" },
];

function renderPlaceholderList() {
  if (!els.placeholderList) return;

  els.placeholderList.innerHTML = AVAILABLE_PLACEHOLDERS
    .map(p => `
      <span class="ph-item">
        <code>{{${escapeHtml(p.kode)}}}</code>${escapeHtml(p.navn)}${
          p.beskrivelse ? ` – ${escapeHtml(p.beskrivelse)}` : ''
        }${p.sms ? '<span class="smsOk">(også SMS)</span>' : ''}
      </span>
    `)
    .join("");
}

async function upsertTemplate(payload) {
  const isNew = !payload.id;
  els.status.textContent = isNew ? "Opretter…" : "Opdaterer…";

  if (!payload.navn) throw new Error("Navn mangler");

  const url = isNew
    ? "/api/mailskabeloner-post"
    : `/api/mailskabeloner-patch?id=${encodeURIComponent(payload.id)}`;

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
  await listTemplates();
  resetForm();
}

async function deleteTemplate(id) {
  if (!confirm("Slet denne skabelon?")) return;

  const r = await fetch(`/api/mailskabeloner-delete?id=${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `DELETE fejlede (${r.status})`);
  }

  await listTemplates();
}

function wireEvents() {
  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await upsertTemplate(readForm());
    } catch (err) {
      console.error(err);
      els.status.textContent = `Fejl: ${err.message}`;
    }
  });

  els.btnReset.addEventListener("click", resetForm);

  els.ttype?.addEventListener("change", applyTypeUI);
  els.tsmsvariant?.addEventListener("change", applyTypeUI);
  els.tbroedtekst?.addEventListener("input", updateSmsCounter);

  els.table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;
    const act = btn.dataset.act;

    try {
      if (act === "edit") {
        const r = await fetch(`/api/mailskabeloner-get?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(await r.text());
        const t = await r.json();
        fillForm(t);
        els.status.textContent = "Indlæst – du redigerer nu";
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (act === "del") {
        await deleteTemplate(id);
      }
    } catch (err) {
      console.error(err);
      els.status.textContent = `Fejl: ${err.message}`;
    }
  });

  els.tpdf?.addEventListener("change", async () => {
    const file = els.tpdf.files?.[0];
    if (!file) return;

    if (file.size > MAX_PDF_BYTES) {
      els.status.textContent = `Filen er for stor (maks. ca. ${Math.round(MAX_PDF_BYTES / 1024)} KB).`;
      els.tpdf.value = "";
      return;
    }

    try {
      const base64 = await readFileAsBase64(file);
      pdfState = { action: "replace", base64, filename: file.name };
      updateCurrentPdfInfo(null);
      els.status.textContent = "";
    } catch (err) {
      console.error(err);
      els.status.textContent = `Kunne ikke læse filen: ${err.message}`;
      els.tpdf.value = "";
    }
  });

  els.btnRemovePdf?.addEventListener("click", () => {
    pdfState = { action: "remove", base64: null, filename: null };
    if (els.tpdf) els.tpdf.value = "";
    updateCurrentPdfInfo(null);
  });

  // Hjælpeværktøj: skriv/indsæt almindelig tekst, se den som HTML-kode ved
  // siden af, og overfør den evt. direkte til selve Brødtekst-feltet.
  els.plainTextInput?.addEventListener("input", () => {
    if (els.htmlOutput) {
      els.htmlOutput.value = plainTextToHtml(els.plainTextInput.value);
    }
  });

  els.btnUseHtmlInBody?.addEventListener("click", () => {
    if (!els.htmlOutput || !els.tbroedtekst) return;
    els.tbroedtekst.value = els.htmlOutput.value;
  });

  els.btnCopyHtml?.addEventListener("click", async () => {
    if (!els.htmlOutput) return;
    try {
      await navigator.clipboard.writeText(els.htmlOutput.value);
      const original = els.btnCopyHtml.textContent;
      els.btnCopyHtml.textContent = "Kopieret ✔";
      setTimeout(() => { els.btnCopyHtml.textContent = original; }, 1500);
    } catch (err) {
      console.error("Kunne ikke kopiere til udklipsholder:", err);
      els.htmlOutput.select();
    }
  });
}

async function init() {
  els = getEls();

  const me = await getMe();
  showAuthedUI(me);
  if (!me) return;

  wireEvents();
  applyTypeUI();
  await listTemplates();
  renderPlaceholderList();
}

document.addEventListener("DOMContentLoaded", init);
