// /api/_sms.js
//
// Fælles SMS-logik for Kundeinfo: SMS-skabeloner (i
// cr175_lch_kundeinfo_mailskabelons), udfyldning af pladsholdere ud fra en
// kundeundersøgelse, afsendelse via Sveve og log i SMS service-appens tabel
// (cr175_lch_sms_services). Samme regler som påmindelses-runbook'en i
// Automation Account "Kundeinfo", så en test herfra svarer til det runbook'en
// sender.
//
// To SMS-skabeloner, valgt ud fra skemaets status:
//   "sms-paamindelse-set" - status Set eller Igang (kunden har åbnet linket)
//   "sms-paamindelse"     - alle andre (Afventer) - og fallback hvis der ikke
//                           findes en aktiv Set/Igang-skabelon
//
// App settings:
//   SVEVE_USER, SVEVE_PASSWD  - Sveve-login
//   SVEVE_FROM                - fast afsendernavn på SMS'en (maks 11 tegn)
//   SVEVE_BASE_URL            - valgfri, standard https://api.sveve.dk

const { cdFetch: dvFetch } = require("./_coredata");
const { graph } = require("./_graph/graph");
const { substitutePlaceholders } = require("./_mail/renderTemplate");

const CUSTOMER_BASE_URL = "https://kundeinfo.lcherrup.dk";
const SMS_CATEGORY = "sms-paamindelse";
const SMS_CATEGORY_SET = "sms-paamindelse-set";

function categoryForStatus(status) {
  return /^(set|igang)$/i.test(String(status || "").trim()) ? SMS_CATEGORY_SET : SMS_CATEGORY;
}

// cr175_lch_kundenavn gemmes som "Navn (kundenummer)" - {{kundenavn}} skal
// kun være navnet.
function cleanKundenavn(name) {
  return String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}
const SURVEY_TABLE = "cr175_lch_kundeinfo_kundeundersoegelses";
const TEMPLATE_TABLE = "cr175_lch_kundeinfo_mailskabelons";
const SMS_LOG_TABLE = "cr175_lch_sms_services";
const FALLBACK_AFSENDER = "Lely Center Herrup";
// {{afsender}} i SMS = "<fornavn> 30506180 (Tryk 4)".
const AFSENDER_SUFFIX = "30506180 (Tryk 4)";

function sveveBase() {
  return String(process.env.SVEVE_BASE_URL || "https://api.sveve.dk").replace(/\/+$/, "");
}

function sveveConfig() {
  const user = String(process.env.SVEVE_USER || "").trim();
  const passwd = String(process.env.SVEVE_PASSWD || "").trim();
  const from = String(process.env.SVEVE_FROM || "").trim();
  if (!user || !passwd || !from) {
    throw new Error("Mangler app setting SVEVE_USER, SVEVE_PASSWD eller SVEVE_FROM.");
  }
  return { user, passwd, from };
}

function escOData(s) {
  return String(s ?? "").replace(/'/g, "''");
}

// Samme regel som SMS service-appen og runbook'en: 8 cifre får 45 foran.
// Returnerer fx "4520123456", eller null hvis nummeret ikke kan bruges.
function normalizePhone(raw) {
  let n = String(raw || "").replace(/[^\d+]/g, "");
  if (!n) return null;
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  if (/^\d{8}$/.test(n)) return `45${n}`;
  if (/^\d{10,15}$/.test(n)) return n;
  return null;
}

async function loadInstance(instanceId) {
  const r = await dvFetch(
    `${SURVEY_TABLE}(${instanceId})` +
    `?$select=cr175_lch_kundeinfo_kundeundersoegelseid,cr175_lch_kode,cr175_lch_kundenavn,` +
    `cr175_lch_kundenummer,cr175_lch_sendttil,cr175_lch_sendttilmobil,cr175_lch_oprettetaf,cr175_lch_nystatus`
  );
  return r.json();
}

// Den aktive SMS-skabelon i en kategori. Er der flere, bruges den senest
// rettede (som i runbook'en).
async function getSmsTemplateByCategory(category) {
  const filter = `cr175_lch_kategori eq '${escOData(category)}' and cr175_lch_aktiv eq true`;
  const r = await dvFetch(
    `${TEMPLATE_TABLE}?$select=cr175_lch_kundeinfo_mailskabelonid,cr175_lch_navn,cr175_lch_broedtekst` +
    `&$filter=${encodeURIComponent(filter)}&$orderby=modifiedon desc&$top=2`
  );
  const data = await r.json();
  const rows = data?.value || [];
  return { template: rows[0] || null, count: rows.length, category };
}

// Skabelonen til et skema ud fra dets status. Mangler Set-skabelonen, bruges
// standardskabelonen (med fallback = true).
async function getSmsTemplateForStatus(status) {
  const wanted = categoryForStatus(status);
  const res = await getSmsTemplateByCategory(wanted);
  if (res.template || wanted === SMS_CATEGORY) return { ...res, wanted, fallback: false };
  const std = await getSmsTemplateByCategory(SMS_CATEGORY);
  return { ...std, wanted, fallback: !!std.template };
}

// Fornavn på den der oprettede skemaet (cr175_lch_oprettetaf er en
// mailadresse): Entra givenName, ellers første ord i displayName. Fejler
// opslaget, eller er feltet tomt, bruges FALLBACK_AFSENDER.
async function getAfsenderFornavn(email) {
  const e = String(email || "").trim();
  if (!e) return FALLBACK_AFSENDER;
  try {
    const u = await graph("GET", `/users/${encodeURIComponent(e)}?$select=givenName,displayName`);
    const given = String(u?.givenName || "").trim();
    if (given) return given;
    const first = String(u?.displayName || "").trim().split(/\s+/)[0];
    return first || FALLBACK_AFSENDER;
  } catch {
    return FALLBACK_AFSENDER;
  }
}

function customerLink(code) {
  return `${CUSTOMER_BASE_URL}/kundesurvey.html?code=${encodeURIComponent(code)}`;
}

async function renderSmsForInstance(inst, templateText) {
  const fornavn = await getAfsenderFornavn(inst.cr175_lch_oprettetaf);
  const afsender = `${fornavn} ${AFSENDER_SUFFIX}`;
  return substitutePlaceholders(String(templateText || "").replace(/\r\n/g, "\n").trim(), {
    kundenavn: cleanKundenavn(inst.cr175_lch_kundenavn),
    kode: inst.cr175_lch_kode || "",
    link: customerLink(inst.cr175_lch_kode || ""),
    mail: inst.cr175_lch_sendttil || "",
    afsender,
    afsendernavn: fornavn
  });
}

// GSM 7-bit vs. Unicode - kun til visning af antal SMS-dele.
const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

function smsParts(text) {
  let len = 0;
  for (const ch of String(text || "")) {
    if (GSM7.includes(ch)) len += 1;
    else if (GSM7_EXT.includes(ch)) len += 2;
    else {
      const n = [...String(text || "")].length;
      return n <= 70 ? 1 : Math.ceil(n / 67);
    }
  }
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

// Sender én SMS via Sveve (GET - Sveve svarer 404 på POST). "to" kan være
// flere numre adskilt af komma. Kaster ikke; returnerer
// { ok, okCount, smsCount, error, raw }.
async function sveveSend(to, msg) {
  const { user, passwd, from } = sveveConfig();
  const qs = new URLSearchParams({ f: "json", user, passwd, to, from, msg });

  let raw = "";
  try {
    const r = await fetch(`${sveveBase()}/SMS/SendMessage?${qs}`);
    raw = await r.text();
    if (!r.ok) return { ok: false, smsCount: 0, error: `Sveve svarede HTTP ${r.status}`, raw };
  } catch (e) {
    return { ok: false, smsCount: 0, error: `Kunne ikke kontakte Sveve: ${e.message}`, raw };
  }

  let data = null;
  try { data = JSON.parse(raw); } catch { data = null; }
  const resp = data?.response || data || {};

  let error = null;
  if (!data) error = "Uforståeligt svar fra Sveve";
  else if (resp.fatalError) error = String(resp.fatalError);
  else if (Array.isArray(resp.errors) && resp.errors.length) {
    error = resp.errors.map(e => `${e.number}: ${e.message}`).join("; ");
  } else if (Number(resp.msgOkCount ?? 0) < 1) error = "Ingen SMS accepteret (msgOkCount=0)";

  return {
    ok: !error,
    okCount: Number(resp.msgOkCount ?? 0),
    smsCount: Number(resp.stdSMSCount ?? resp.stdSmsCount ?? 0),
    error,
    raw
  };
}

function formatTitle(date, kode) {
  const s = new Date(date).toLocaleString("da-DK", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
  return `SMS ${s} - Kundeinfo ${kode || ""}`.trim();
}

// Én række i SMS service-appens log. Fejl her må ikke skjule at SMS'en er
// sendt - returnerer fejlbeskeden i stedet for at kaste.
async function writeSmsLog({ to, msg, status, smsCount, raw, kode, afsender, afsenderMail, test, antalModtagere }) {
  try {
    await dvFetch(SMS_LOG_TABLE, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        cr175_lch_key: formatTitle(new Date(), kode),
        cr175_lch_modtagere: to,
        cr175_lch_besked: msg,
        cr175_lch_afsender: afsender || "",
        cr175_lch_afsendermail: afsenderMail || "",
        cr175_lch_fra: String(process.env.SVEVE_FROM || ""),
        cr175_lch_test: !!test,
        cr175_lch_antalsms: smsCount || 0,
        cr175_lch_antalmodtagere: antalModtagere || 1,
        cr175_lch_sendt: new Date().toISOString(),
        cr175_lch_status: status,
        cr175_lch_svar: String(raw || "").slice(0, 3900)
      })
    });
    return null;
  } catch (e) {
    return e.message || String(e);
  }
}

async function markSmsSent(instanceId) {
  await dvFetch(`${SURVEY_TABLE}(${instanceId})`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "If-Match": "*" },
    body: JSON.stringify({ cr175_lch_smssendttidspunkt: new Date().toISOString() })
  });
}

module.exports = {
  SMS_CATEGORY,
  SMS_CATEGORY_SET,
  categoryForStatus,
  cleanKundenavn,
  normalizePhone,
  loadInstance,
  getSmsTemplateByCategory,
  getSmsTemplateForStatus,
  renderSmsForInstance,
  smsParts,
  sveveSend,
  writeSmsLog,
  markSmsSent
};
