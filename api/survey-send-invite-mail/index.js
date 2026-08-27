// /api/survey-send-invite-mail/index.js
//
// Sender "opret skema"-invitationsmailen til kunden, når admin opretter et
// nyt spørgeskema på admincreate.html og vælger "Opret skema og send mail".
// Bruger mail-skabelonen med nøglen "survey-invite" (oprettes/redigeres på
// adminmailskabeloner.html). Afsenderen er den admin-bruger der er logget
// ind (samme mønster som survey-send-summary-mail).

const { graph } = require("../_graph/graph");
const { renderTemplateByKey } = require("../_mail/renderTemplate");

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

const TEMPLATE_KEY = "survey-invite";

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
    const to = String(req?.body?.to || "").trim();

    if (!code || !link || !to) {
      return json(context, 400, {
        error: "missing_fields",
        message: "Mangler code, link eller modtager."
      });
    }

    let rendered;
    try {
      rendered = await renderTemplateByKey(TEMPLATE_KEY, {
        kundenavn: customerName || "(uden navn)",
        kode: code,
        link
      });
    } catch (e) {
      return json(context, 500, {
        error: "template_fetch_failed",
        message: e.message || String(e)
      });
    }

    if (!rendered) {
      return json(context, 404, {
        error: "template_missing",
        message:
          `Mail-skabelonen "${TEMPLATE_KEY}" findes ikke eller er ikke aktiv. ` +
          `Opret/aktivér den under Admin → Mailskabeloner.`
      });
    }

    await graph("POST", `/users/${encodeURIComponent(fromMailbox)}/sendMail`, {
      message: {
        subject: rendered.subject,
        body: { contentType: "HTML", content: rendered.html },
        toRecipients: [{ emailAddress: { address: to } }]
      },
      saveToSentItems: true
    });

    return json(context, 200, { ok: true, from: fromMailbox, to });

  } catch (err) {
    context.log.error("survey-send-invite-mail failed:", err);
    return json(context, 500, {
      error: "server_error",
      message: err.message || String(err)
    });
  }
};
