// /api/_mail/renderTemplate.js
//
// Henter mail-skabeloner fra Dataverse (cr175_lch_kundeinfo_mailskabelons,
// vedligeholdes på adminmailskabeloner.html) og indsætter {{pladsholdere}}
// med rigtige værdier. Bruges af alle steder der sender en mail baseret på
// en skabelon i stedet for hardkodet HTML (fx survey-send-invite-mail).

const { cdFetch: dvFetch } = require("../_coredata");

const SELECT =
  "cr175_lch_kundeinfo_mailskabelonid,cr175_lch_navn,cr175_lch_noegle," +
  "cr175_lch_emne,cr175_lch_broedtekst,cr175_lch_aktiv," +
  "cr175_lch_vedhaeftetpdf,cr175_lch_vedhaeftetpdfnavn";

function escODataString(s) {
  return String(s ?? "").replace(/'/g, "''");
}

// Henter én skabelon på dens (unikke) nøgle. Returnerer kun aktive
// skabeloner - en deaktiveret skabelon opfører sig som om den ikke findes.
async function getTemplateByKey(noegle) {
  const filter =
    `cr175_lch_noegle eq '${escODataString(noegle)}' and cr175_lch_aktiv eq true`;

  const r = await dvFetch(
    `cr175_lch_kundeinfo_mailskabelons?$select=${SELECT}` +
    `&$filter=${encodeURIComponent(filter)}&$top=1`
  );
  const data = await r.json();
  return (data?.value || [])[0] || null;
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

// Henter skabelonen på `noegle` og returnerer { subject, html } med data
// indsat. Returnerer null hvis skabelonen ikke findes/er inaktiv - kalderen
// skal selv beslutte hvordan det håndteres (fx afvise med en tydelig fejl
// frem for at sende en tom mail).
async function renderTemplateByKey(noegle, data) {
  const tpl = await getTemplateByKey(noegle);
  if (!tpl) return null;

  return {
    subject: substitutePlaceholders(tpl.cr175_lch_emne, data),
    html: substitutePlaceholders(tpl.cr175_lch_broedtekst, data)
  };
}

module.exports = { getTemplateByKey, substitutePlaceholders, renderTemplateByKey };



