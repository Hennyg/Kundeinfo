// /api/survey-send-summary-mail/index.js
//
// Sender en opsummerings-mail (rettelser/tilføjelser for ét område, eller en
// SalesForce-oversigt) via Microsoft Graph. Afsenderen er den bruger der er
// logget ind på siden (via SWA's x-ms-client-principal), ikke en fast
// postkasse - kræver at appens Graph-app-registrering (KUNDE_CLIENT_ID/SECRET
// i api/_graph/auth.js) har application-permission Mail.Send og lov til at
// sende som den pågældende bruger.

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

// Bygger PDF-kopien af det udfyldte skema som Graph-vedhæftning. Fejler
// PDF-byggeriet, skal mailen stadig kunne sendes – bare uden vedhæftning –
// så alt er wrappet i try/catch, og fejlen returneres til kalderen (i
// stedet for kun logget) da SWA Managed Functions ikke har Log Stream.
async function buildSurveyPdfAttachment(context, code) {
  if (!code) return { attachment: null, error: null };

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
    context.log.error("Kunne ikke bygge PDF til opsummerings-mail:", e);
    return { attachment: null, error: message };
  }
}

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

    const to = String(req?.body?.to || "").trim();
    const subject = String(req?.body?.subject || "").trim();
    const html = String(req?.body?.html || "");
    const code = String(req?.body?.code || "").trim();

    if (!to || !subject || !html) {
      return json(context, 400, {
        error: "missing_fields",
        message: "Mangler modtager, emne eller indhold."
      });
    }

    const { attachment, error: pdfError } = await buildSurveyPdfAttachment(context, code);

    await graph("POST", `/users/${encodeURIComponent(fromMailbox)}/sendMail`, {
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        attachments: attachment ? [attachment] : []
      },
      saveToSentItems: true
    });

    return json(context, 200, { ok: true, from: fromMailbox, pdfAttached: !!attachment, pdfError });

  } catch (err) {
    context.log.error("survey-send-summary-mail failed:", err);
    return json(context, 500, {
      error: "server_error",
      message: err.message || String(err)
    });
  }
};
