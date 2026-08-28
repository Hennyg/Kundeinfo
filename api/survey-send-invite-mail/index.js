// /api/survey-send-invite-mail/index.js
//
// Sender "opret skema"-invitationsmailen til kunden, når admin opretter et
// nyt spørgeskema på admincreate.html og vælger "Opret skema og send mail".
// Skabelonen vælges via dropdown på admincreate.html (kategori
// "opret-skema" i mailskabeloner) og sendes med som `templateKey`. Falder
// tilbage til "survey-invite" hvis intet er valgt, af hensyn til ældre
// opkald der endnu ikke sender templateKey med.
// Afsenderen er den admin-bruger der er logget ind (samme mønster som
// survey-send-summary-mail).
//
// Uniconta-pladsholdere (kundeemail, telefon, mobil, cvr, adresse,
// postnr_by, kontaktperson) hentes HER på serveren via det eksisterende
// _uniconta.js-modul, ud fra customerNumber - ikke fra data browseren
// sender med. Det sikrer at mailen altid bruger de aktuelle Uniconta-data,
// uanset hvad der evt. har ligget i browserens formular.
//
// {{afsendernavn}} hentes via Graph fra den indloggede admin-bruger, til
// brug i mailens signatur.
//
// Findes der en PDF-vedhæftning på selve skabelonen (uploadet via
// adminmailskabeloner.html, gemt som base64 i cr175_lch_vedhaeftetpdf),
// sendes den automatisk med som vedhæftet fil.
//
// Efter mailen er sendt, gemmes tidspunktet på selve kundeundersøgelsen
// (cr175_lch_mailsendttidspunkt), så adminoversigt.html kan vise en ægte
// "Mail sendt"-kolonne adskilt fra "Skema oprettet".

const { graph } = require("../_graph/graph");
const { getTemplateByKey, substitutePlaceholders } = require("../_mail/renderTemplate");
const { unicontaFetch, normalizeDebtor } = require("../_uniconta");
const { cdFetch: dvFetch } = require("../_coredata");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function getClientPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function esc(value) {
  return String(value || "").replace(/'/g, "''");
}

// Samme konvertering som customerNumberToUnicontaAccount() i
// admincreate.js: kundenummer "0080001985" -> Uniconta-konto "80001985".
function customerNumberToUnicontaAccount(kundenr) {
  return String(kundenr || "").trim().replace(/\s+/g, "").replace(/^00/, "");
}

// Henter og normaliserer Uniconta-debitoren for kundenummeret. Fejler
// opslaget (kunden findes ikke i Uniconta, forkert kundenummer, Uniconta er
// nede osv.), skal selve mail-afsendelsen IKKE stoppe - Uniconta-
// pladsholderne bliver bare tomme i det tilfælde.
async function loadUnicontaDebtorSafe(context, customerNumber) {
  const account = customerNumberToUnicontaAccount(customerNumber);
  if (!account) return null;

  try {
    const response = await unicontaFetch(`DebtorClient?$filter=Account eq '${esc(account)}'&$top=1`);
    const data = await response.json();
    const row = (Array.isArray(data) ? data : (data.value || []))[0];
    return row ? normalizeDebtor(row) : null;
  } catch (e) {
    context.log.error("survey-send-invite-mail: Uniconta-opslag fejlede:", e);
    return null;
  }
}

// Henter afsenderens visningsnavn via Graph, til brug som {{afsendernavn}}
// i mailens signatur. Fejler opslaget, falder vi tilbage til selve
// mail-adressen frem for at lade mail-afsendelsen fejle af den grund.
async function loadSenderDisplayName(context, fromMailbox) {
  try {
    const me = await graph("GET", `/users/${encodeURIComponent(fromMailbox)}?$select=displayName`);
    return me?.displayName || fromMailbox;
  } catch (e) {
    context.log.error("survey-send-invite-mail: kunne ikke hente afsenders displayName:", e);
    return fromMailbox;
  }
}

const DEFAULT_TEMPLATE_KEY = "survey-invite";

module.exports = async function (context, req) {
  try {
    const principal = getClientPrincipal(req);
    const fromMailbox = String(principal?.userDetails || "").trim();

    if (!fromMailbox) {
      return json(context, 401, {
        error: "not_authenticated",
        message: "Kunne ikke bestemme afsender - log ind igen."
      });
    }

    const code = String(req?.body?.code || "").trim();
    const link = String(req?.body?.link || "").trim();
    const customerName = String(req?.body?.customerName || "").trim();
    const customerNumber = String(req?.body?.customerNumber || "").trim();
    const instanceId = String(req?.body?.instanceId || "").trim();
    const to = String(req?.body?.to || "").trim();
    const templateKey = String(req?.body?.templateKey || "").trim() || DEFAULT_TEMPLATE_KEY;

    if (!code || !link || !to) {
      return json(context, 400, {
        error: "missing_fields",
        message: "Mangler code, link eller modtager."
      });
    }

    const debtor = await loadUnicontaDebtorSafe(context, customerNumber);
    const afsenderNavn = await loadSenderDisplayName(context, fromMailbox);

    // Hentes som rå skabelon-record (ikke bare renderTemplateByKey), fordi
    // vi også skal bruge en evt. vedhæftet PDF (cr175_lch_vedhaeftetpdf /
    // -navn) på selve skabelonen.
    let template;
    try {
      template = await getTemplateByKey(templateKey);
    } catch (e) {
      return json(context, 500, {
        error: "template_fetch_failed",
        message: e.message || String(e)
      });
    }

    if (!template) {
      return json(context, 404, {
        error: "template_missing",
        message:
          `Mail-skabelonen "${templateKey}" findes ikke eller er ikke aktiv. ` +
          `Opret/aktivér den under Admin → Mailskabeloner.`
      });
    }

    const placeholderData = {
      kundenavn: customerName || "(uden navn)",
      kode: code,
      link,
      afsendernavn: afsenderNavn,
      kundeemail: debtor?.email || "",
      telefon: debtor?.phone || "",
      mobil: debtor?.mobile || "",
      cvr: debtor?.vatNumber || "",
      adresse: [debtor?.address1, debtor?.address2].filter(Boolean).join(", "),
      postnr_by: [debtor?.zipCode, debtor?.city].filter(Boolean).join(" "),
      kontaktperson: debtor?.contactPerson || ""
    };

    const rendered = {
      subject: substitutePlaceholders(template.cr175_lch_emne, placeholderData),
      html: substitutePlaceholders(template.cr175_lch_broedtekst, placeholderData)
    };

    // Vedhæftet PDF på selve skabelonen (gemt som base64 i
    // cr175_lch_vedhaeftetpdf) - valgfri, sendes med hvis den findes.
    const attachments = [];
    if (template.cr175_lch_vedhaeftetpdf) {
      attachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: template.cr175_lch_vedhaeftetpdfnavn || "vedhaeftning.pdf",
        contentType: "application/pdf",
        contentBytes: template.cr175_lch_vedhaeftetpdf
      });
    }

    await graph("POST", `/users/${encodeURIComponent(fromMailbox)}/sendMail`, {
      message: {
        subject: rendered.subject,
        body: { contentType: "HTML", content: rendered.html },
        toRecipients: [{ emailAddress: { address: to } }],
        attachments
      },
      saveToSentItems: true
    });

    // Registrér hvornår mailen blev sendt, så adminoversigt.html kan vise
    // en ægte "Mail sendt"-kolonne (i stedet for bare at gætte ud fra
    // oprettelsestidspunktet). Fejler denne opdatering, skal det IKKE gøre
    // hele kaldet til en fejl - mailen er jo allerede sendt.
    let mailTimestampSaved = false;
    if (instanceId) {
      try {
        await dvFetch(`cr175_lch_kundeinfo_kundeundersoegelses(${instanceId})`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "If-Match": "*" },
          body: JSON.stringify({ cr175_lch_mailsendttidspunkt: new Date().toISOString() })
        });
        mailTimestampSaved = true;
      } catch (e) {
        context.log.error("survey-send-invite-mail: kunne ikke gemme mailsendttidspunkt:", e);
      }
    }

    return json(context, 200, {
      ok: true,
      from: fromMailbox,
      to,
      templateKey,
      unicontaDebtorFound: !!debtor,
      mailTimestampSaved
    });

  } catch (err) {
    context.log.error("survey-send-invite-mail failed:", err);
    return json(context, 500, {
      error: "server_error",
      message: err.message || String(err)
    });
  }
};



