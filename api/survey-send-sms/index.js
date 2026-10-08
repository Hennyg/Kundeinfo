// /api/survey-send-sms/index.js
//
// POST { instanceId, to, message, markSent }
// "to" er ét nummer, flere numre adskilt af komma/semikolon, eller et array
// (fx flere ejere valgt i vinduet). Sender SMS'en via Sveve fra "Send SMS"-vinduet på adminoversigt.html og
// logger den i SMS service-appens log (cr175_lch_sms_services) med den
// indloggede admin som afsender.
//
// markSent = true sætter cr175_lch_smssendttidspunkt på skemaet (så
// påmindelses-runbook'en ikke sender igen). Standard er false, så en test til
// eget nummer ikke registreres på skemaet - loggen markeres så som test.

const S = require("../_sms");
const { graph } = require("../_graph/graph");

const MAX_PARTS = 6;

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json; charset=utf-8" }, body };
}

function getClientPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function displayName(email) {
  try {
    const u = await graph("GET", `/users/${encodeURIComponent(email)}?$select=displayName`);
    return u?.displayName || email;
  } catch {
    return email;
  }
}

module.exports = async function (context, req) {
  try {
    const principal = getClientPrincipal(req);
    const userEmail = String(principal?.userDetails || "").trim();
    if (!userEmail) {
      return json(context, 401, { error: "not_authenticated", message: "Log ind igen." });
    }

    const instanceId = String(req.body?.instanceId || "").trim();
    const toList = Array.isArray(req.body?.to)
      ? req.body.to
      : String(req.body?.to || "").split(/[,;\n]/);
    const message = String(req.body?.message || "").replace(/\r\n/g, "\n").trim();
    const markSent = req.body?.markSent === true;

    const numbers = [];
    for (const raw of toList.map(x => String(x || "").trim()).filter(Boolean)) {
      const n = S.normalizePhone(raw);
      if (!n) return json(context, 400, { error: "invalid_number", message: `Ugyldigt nummer: "${raw}"` });
      if (!numbers.includes(n)) numbers.push(n);
    }
    if (!numbers.length) return json(context, 400, { error: "missing_number", message: "Vælg eller skriv mindst ét nummer." });
    if (numbers.length > 10) return json(context, 400, { error: "too_many", message: "Maks 10 modtagere ad gangen." });
    const to = numbers.join(",");
    if (!message) return json(context, 400, { error: "empty_message", message: "Beskeden er tom." });

    const parts = S.smsParts(message);
    if (parts > MAX_PARTS) {
      return json(context, 400, { error: "too_long", message: `Beskeden fylder ${parts} SMS'er (maks ${MAX_PARTS}).` });
    }

    let kode = "";
    if (instanceId) {
      try {
        const inst = await S.loadInstance(instanceId);
        kode = inst.cr175_lch_kode || "";
      } catch (e) {
        context.log.warn("survey-send-sms: kunne ikke hente skemaet:", e.message);
      }
    }

    const result = await S.sveveSend(to, message);
    const afsender = await displayName(userEmail);

    const logError = await S.writeSmsLog({
      to,
      msg: message,
      status: result.ok ? (markSent ? "Sendt" : "Sendt (manuelt, ikke registreret)") : "Fejl",
      smsCount: result.smsCount || (result.ok ? parts * numbers.length : 0),
      raw: result.ok ? result.raw : `${result.error}\n${result.raw}`,
      kode,
      afsender,
      afsenderMail: userEmail,
      test: !markSent,
      antalModtagere: numbers.length
    });
    if (logError) context.log.warn("survey-send-sms: SMS-log kunne ikke gemmes:", logError);

    if (!result.ok) {
      return json(context, 502, { error: "sveve_error", message: result.error, logError });
    }

    let marked = false;
    if (markSent && instanceId) {
      try {
        await S.markSmsSent(instanceId);
        marked = true;
      } catch (e) {
        context.log.error("survey-send-sms: kunne ikke sætte cr175_lch_smssendttidspunkt:", e);
      }
    }

    return json(context, 200, {
      ok: true,
      to: numbers,
      smsCount: result.smsCount || parts * numbers.length,
      marked,
      logError
    });
  } catch (err) {
    context.log.error("survey-send-sms failed:", err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
