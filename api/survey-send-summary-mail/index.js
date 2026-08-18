// /api/survey-send-summary-mail/index.js
//
// Sender en opsummerings-mail (rettelser/tilføjelser for ét område, eller en
// SalesForce-oversigt) via Microsoft Graph. Afsenderen er den bruger der er
// logget ind på siden (via SWA's x-ms-client-principal), ikke en fast
// postkasse - kræver at appens Graph-app-registrering (KUNDE_CLIENT_ID/SECRET
// i api/_graph/auth.js) har application-permission Mail.Send og lov til at
// sende som den pågældende bruger.

const { graph } = require("../_graph/graph");

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

    if (!to || !subject || !html) {
      return json(context, 400, {
        error: "missing_fields",
        message: "Mangler modtager, emne eller indhold."
      });
    }

    await graph("POST", `/users/${encodeURIComponent(fromMailbox)}/sendMail`, {
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }]
      },
      saveToSentItems: true
    });

    return json(context, 200, { ok: true, from: fromMailbox });

  } catch (err) {
    context.log.error("survey-send-summary-mail failed:", err);
    return json(context, 500, {
      error: "server_error",
      message: err.message || String(err)
    });
  }
};
