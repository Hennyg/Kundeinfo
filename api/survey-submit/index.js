// /api/survey-submit/index.js
//
// Gemmer/opdaterer kundens svar direkte på cr175_lch_kundeinfo_spoergeskemasvars
// (samme tabel som holder admins prefill). Match sker på
// (kundeundersoegelse, spoergsmaal, gentagelsesindeks) – findes rækken ikke
// (kunden har selv tilføjet en gentagelse), oprettes den.

const { cdFetch: dvFetch } = require("../_coredata");
const { STATUS, advanceStatus } = require("../_surveyStatus");
const { graph } = require("../_graph/graph");
const { loadSurveyItems } = require("../_survey/loadSurveyItems");
const { buildSurveyPdf } = require("../_pdf/buildSurveyPdf");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}
function escODataString(s) {
  return String(s ?? "").replace(/'/g, "''");
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Bygger PDF-kopien af det udfyldte skema som Graph-vedhæftning. Fejler
// PDF-byggeriet (fx en enkelt manglende Dataverse-kolonne, eller at pdfkit
// ikke er installeret), skal mailen stadig sendes – bare uden vedhæftning –
// så alt er wrappet i try/catch. Fejlbeskeden returneres til kaldEREN (i
// stedet for kun at blive logget) da SWA Managed Functions ikke har Log
// Stream – på den måde kan fejlen ses i browserens Network-fane i stedet.
async function buildSurveyPdfAttachment(context, code) {
  try {
    const data = await loadSurveyItems(code);
    if (!data || !data.items.length) {
      return { attachment: null, error: "no_items" };
    }

    const pdfBuffer = await buildSurveyPdf({
      customerName: data.customerName,
      code: data.code,
      groups: data.groups,
      items: data.items
    });

    return {
      attachment: {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: `Spoergeskema-${code}.pdf`,
        contentType: "application/pdf",
        contentBytes: pdfBuffer.toString("base64")
      },
      error: null
    };
  } catch (e) {
    const message = e?.message || String(e);
    context.log.error("Kunne ikke bygge PDF til 'afsluttet skema'-mail:", e);
    return { attachment: null, error: message };
  }
}

// Sender en mail til adresserne i Application Setting "Kundeinfo_Afsluttet_survey"
// når en kunde afslutter et spørgeskema. Fejl her må ikke vælte selve
// indsendelsen af skemaet, så alt er wrappet i try/catch. Returnerer et lille
// diagnose-objekt (i stedet for intet), som module.exports lægger ind i
// JSON-svaret, så du kan se i Network-fanen om mailen/PDF'en gik godt.
async function sendAfsluttetMail(context, { kundenavn, kundenummer, code, req }) {
  try {
    const recipients = String(process.env.Kundeinfo_Afsluttet_survey || "")
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean);

    if (!recipients.length) {
      context.log("Kundeinfo_Afsluttet_survey er ikke sat (eller tom) – ingen mail sendt.");
      return { mailSent: false, mailSkippedReason: "missing_recipients_setting", pdfAttached: false, pdfError: null };
    }

    const fromMailbox = String(process.env.KUNDEINFO_MAIL_FROM || "").trim();
    if (!fromMailbox) {
      context.log("KUNDEINFO_MAIL_FROM er ikke sat – ingen mail sendt.");
      return { mailSent: false, mailSkippedReason: "missing_from_setting", pdfAttached: false, pdfError: null };
    }

    const host = req.headers["x-forwarded-host"];
    const origin = host ? `https://${host}` : "";
    const link = origin ? `${origin}/kundesurvey.html?code=${encodeURIComponent(code)}&ro=1` : "";

    const kundeLabel = kundenavn || kundenummer || "(ukendt kunde)";

    const { attachment, error: pdfError } = await buildSurveyPdfAttachment(context, code);

    const subject = `Kunde ${kundenavn || kundenummer || ""} har afsluttet spørgeskema ${code}`;
    const htmlBody =
      `<p>Kunde <strong>${escapeHtml(kundeLabel)}</strong>` +
      (kundenummer ? ` (${escapeHtml(kundenummer)})` : "") +
      ` har afsluttet spørgeskema <strong>${escapeHtml(code)}</strong>.</p>` +
      (link ? `<p><a href="${link}">Se besvarelsen</a></p>` : "") +
      (attachment ? `<p>Se vedhæftede PDF for en kopi af det udfyldte skema.</p>` : "");

    await graph("POST", `/users/${encodeURIComponent(fromMailbox)}/sendMail`, {
      message: {
        subject,
        body: { contentType: "HTML", content: htmlBody },
        toRecipients: recipients.map(address => ({ emailAddress: { address } })),
        attachments: attachment ? [attachment] : []
      },
      saveToSentItems: false
    });

    return { mailSent: true, mailSkippedReason: null, pdfAttached: !!attachment, pdfError };
  } catch (e) {
    const message = e?.message || String(e);
    context.log.error("Kunne ikke sende 'afsluttet skema'-mail:", e);
    return { mailSent: false, mailSkippedReason: "send_failed", mailError: message, pdfAttached: false, pdfError: null };
  }
}

module.exports = async function (context, req) {
  try {
    const code = String(req?.body?.code || "").trim();
    const answers = Array.isArray(req?.body?.answers) ? req.body.answers : [];
    const removed = Array.isArray(req?.body?.removed) ? req.body.removed : [];

    if (!code) return json(context, 400, { error: "missing_code", message: "Mangler code." });
    if (!answers.length && !removed.length) {
      return json(context, 400, { error: "missing_answers", message: "Ingen svar modtaget." });
    }

    // 1) Find kundeundersøgelse via kode
    const instPath =
      `cr175_lch_kundeinfo_kundeundersoegelses` +
      `?$select=cr175_lch_kundeinfo_kundeundersoegelseid,cr175_lch_kode,cr175_lch_kundenavn,cr175_lch_kundenummer` +
      `&$filter=${encodeURIComponent(`cr175_lch_kode eq '${escODataString(code)}'`)}` +
      `&$top=1`;

    const instRes = await dvFetch(instPath);
    const instData = await instRes.json();
    const inst = (instData?.value || [])[0];
    if (!inst) return json(context, 404, { error: "invalid_code", message: "Ugyldig kode." });

    const instanceId = inst.cr175_lch_kundeinfo_kundeundersoegelseid;

    let created = 0, updated = 0, deleted = 0, skipped = 0;
    let newRowCounter = 0;

    // 2) Gem/opdatér svar – match på (kundeundersoegelse, spoergsmaal, gentagelsesindeks)
    for (const a of answers) {
      const questionId = String(a.questionId || "").trim();
      const repeatIndex = Number.isFinite(Number(a.repeatIndex)) ? Number(a.repeatIndex) : 0;
      const value = a.value == null ? null : String(a.value);

      if (!questionId) { skipped++; continue; }

      const findPath =
        `cr175_lch_kundeinfo_spoergeskemasvars` +
        `?$select=cr175_lch_kundeinfo_spoergeskemasvarid` +
        `&$filter=${encodeURIComponent(
          `_cr175_lch_kundeundersoegelse_value eq ${instanceId} and _cr175_lch_spoergsmaal_value eq ${questionId} and cr175_lch_gentagelsesindeks eq ${repeatIndex}`
        )}` +
        `&$top=1`;

      let existingId = null;
      try {
        const fr = await dvFetch(findPath);
        const fd = await fr.json();
        existingId = (fd?.value || [])[0]?.cr175_lch_kundeinfo_spoergeskemasvarid || null;
      } catch (e) {
        return json(context, 500, { error: "answer_find_failed", message: e.message || String(e) });
      }

      if (existingId) {
        await dvFetch(`cr175_lch_kundeinfo_spoergeskemasvars(${existingId})`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cr175_lch_svarvaerdi: value,
            cr175_lch_gentagelsesindeks: repeatIndex
          })
        });
        updated++;
      } else {
        newRowCounter++;
        await dvFetch(`cr175_lch_kundeinfo_spoergeskemasvars`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cr175_lch_unik: `SVAR-${code}-NY-${newRowCounter}`,
            cr175_lch_svarvaerdi: value,
            cr175_lch_gentagelsesindeks: repeatIndex,
            "cr175_lch_kundeundersoegelse@odata.bind": `/cr175_lch_kundeinfo_kundeundersoegelses(${instanceId})`,
            "cr175_lch_spoergsmaal@odata.bind": `/cr175_lch_kundeinfo_spoergsmaals(${questionId})`
          })
        });
        created++;
      }
    }

    // 3) Slet svar for gentagelser kunden har fjernet
    for (const rem of removed) {
      const questionId = String(rem.questionId || "").trim();
      const repeatIndex = Number.isFinite(Number(rem.repeatIndex)) ? Number(rem.repeatIndex) : 0;
      if (!questionId) continue;

      const findPath =
        `cr175_lch_kundeinfo_spoergeskemasvars` +
        `?$select=cr175_lch_kundeinfo_spoergeskemasvarid` +
        `&$filter=${encodeURIComponent(
          `_cr175_lch_kundeundersoegelse_value eq ${instanceId} and _cr175_lch_spoergsmaal_value eq ${questionId} and cr175_lch_gentagelsesindeks eq ${repeatIndex}`
        )}` +
        `&$top=1`;

      const fr = await dvFetch(findPath);
      const fd = await fr.json();
      const existingId = (fd?.value || [])[0]?.cr175_lch_kundeinfo_spoergeskemasvarid || null;

      if (existingId) {
        await dvFetch(`cr175_lch_kundeinfo_spoergeskemasvars(${existingId})`, { method: "DELETE" });
        deleted++;
      }
    }

    // --- Markér survey som gennemført/startet ---
    const finalize = !!req?.body?.finalize;
    try {
      // Autosave (finalize=false) -> "Igang" (kunden er i gang med at svare).
      // "Gem og afslut" (finalize=true) -> "Udfyldt". Rykker aldrig baglæns,
      // så gentagne autosaves efter "Udfyldt" (fx admin retter noget bagefter)
      // rykker ikke status tilbage til "Igang".
      await advanceStatus(instanceId, finalize ? STATUS.UDFYLDT : STATUS.IGANG);
    } catch (e) {
      context.log.error("survey-submit: kunne ikke opdatere status:", e);
    }

    let mailResult = null;
    if (finalize) {
      mailResult = await sendAfsluttetMail(context, {
        kundenavn: inst.cr175_lch_kundenavn || "",
        kundenummer: inst.cr175_lch_kundenummer || "",
        code,
        req
      });
    }

    return json(context, 200, { ok: true, created, updated, deleted, skipped, finalize, mailResult });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
