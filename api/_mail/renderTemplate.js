// /api/_mail/renderTemplate.js
//
// Henter mail-skabeloner fra Dataverse (cr175_lch_kundeinfo_mailskabelons,
// vedligeholdes på adminmailskabeloner.html) og indsætter {{pladsholdere}}
// med rigtige værdier. Bruges af alle steder der sender en mail baseret på
// en skabelon i stedet for hardkodet HTML (fx survey-send-invite-mail).
//
// Skabeloner slås op på deres eget Dataverse-id (mailskabelonid), IKKE en
// separat "nøgle"-tekst - id'et er garanteret unikt af Dataverse selv, hvor
// en fritekst-nøgle nemt kan komme til at gå igen ved en fejl (det skete i
// praksis: to skabeloner fik samme nøgle, og opslaget ramte den forkerte).

const { cdFetch: dvFetch } = require("../_coredata");

const SELECT =
  "cr175_lch_kundeinfo_mailskabelonid,cr175_lch_navn," +
  "cr175_lch_emne,cr175_lch_broedtekst,cr175_lch_aktiv," +
  "cr175_lch_vedhaeftetpdf,cr175_lch_vedhaeftetpdfnavn";

function escODataString(s) {
  return String(s ?? "").replace(/'/g, "''");
}

// Henter én skabelon på dens id. Returnerer kun aktive skabeloner - en
// deaktiveret skabelon opfører sig som om den ikke findes.
async function getTemplateById(id) {
  const r = await dvFetch(
    `cr175_lch_kundeinfo_mailskabelons(${id})?$select=${SELECT}`
  );
  if (!r.ok) return null;

  const row = await r.json();
  if (!row || row.cr175_lch_aktiv === false) return null;
  return row;
}

// Erstatter {{navn}}-pladsholdere med data[navn]. Ukendte pladsholdere
// (stavefejl, eller felter der ikke er sendt med) efterlades urørt, så en
// fejl i skabelonen er synlig i stedet for at forsvinde stille.
function substitutePlaceholders(text, data) {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(data, key)
      ? String(data[key] ?? "")
      : match;
  });
}

// Henter skabelonen på `id` og returnerer { subject, html } med data
// indsat. Returnerer null hvis skabelonen ikke findes/er inaktiv - kalderen
// skal selv beslutte hvordan det håndteres (fx afvise med en tydelig fejl
// frem for at sende en tom mail).
async function renderTemplateById(id, data) {
  const tpl = await getTemplateById(id);
  if (!tpl) return null;

  return {
    subject: substitutePlaceholders(tpl.cr175_lch_emne, data),
    html: substitutePlaceholders(tpl.cr175_lch_broedtekst, data)
  };
}

module.exports = { getTemplateById, substitutePlaceholders, renderTemplateById };
