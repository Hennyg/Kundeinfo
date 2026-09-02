// /api/survey-status-complete/index.js
//
// Sætter en kundeundersøgelses status til "Afsluttet" - trykkes internt fra
// "Send alle"-knappen i opsummeringsdialogen på "Se skema"-siden
// (kundesurvey.html?ro=1), efter alle områdemails er sendt ud. Dette er den
// sidste fase i status-forløbet, adskilt fra "Udfyldt" (som kunden selv
// sætter ved "Gem og afslut").

const { cdFetch: dvFetch } = require("../_coredata");
const { STATUS, setStatus } = require("../_surveyStatus");

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

module.exports = async function (context, req) {
  try {
    const code = String(req?.body?.code || "").trim();
    const instanceIdFromBody = String(req?.body?.instanceId || "").trim();

    if (!code && !instanceIdFromBody) {
      return json(context, 400, { error: "missing_code", message: "Mangler code eller instanceId." });
    }

    let instanceId = instanceIdFromBody;

    if (!instanceId) {
      const r = await dvFetch(
        `cr175_lch_kundeinfo_kundeundersoegelses?$select=cr175_lch_kundeinfo_kundeundersoegelseid` +
        `&$filter=${encodeURIComponent(`cr175_lch_kode eq '${escODataString(code)}'`)}&$top=1`
      );
      const data = await r.json();
      const inst = (data?.value || [])[0];
      if (!inst) return json(context, 404, { error: "invalid_code", message: "Ugyldig kode." });
      instanceId = inst.cr175_lch_kundeinfo_kundeundersoegelseid;
    }

    await setStatus(instanceId, STATUS.AFSLUTTET);

    return json(context, 200, { ok: true, status: STATUS.AFSLUTTET });
  } catch (err) {
    context.log.error("survey-status-complete crashed:", err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
