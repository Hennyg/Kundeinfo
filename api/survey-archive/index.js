// /api/survey-archive/index.js
//
// POST { instanceId | code, archive: true|false }
// Arkiverer (eller gendanner) en kundeundersøgelse ved at sætte/rydde
// cr175_lch_arkiveretdato. Arkiverede skemaer vises ikke på adminoversigt.html,
// medmindre "Vis arkiverede" er slået til (survey-list?includeArchived=1).
// Kaldes fra "Send og arkiver" i opsummeringsvinduet (med code) og fra
// "Fjern fra arkiv" på oversigten (med instanceId).

const { cdFetch: dvFetch } = require("../_coredata");

const TABLE = "cr175_lch_kundeinfo_kundeundersoegelses";

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json; charset=utf-8" }, body };
}

function escOData(s) {
  return String(s ?? "").replace(/'/g, "''");
}

module.exports = async function (context, req) {
  try {
    let instanceId = String(req.body?.instanceId || "").trim();
    const code = String(req.body?.code || "").trim();
    const archive = req.body?.archive !== false;

    if (!instanceId && code) {
      const r = await dvFetch(
        `${TABLE}?$select=cr175_lch_kundeinfo_kundeundersoegelseid` +
        `&$filter=${encodeURIComponent(`cr175_lch_kode eq '${escOData(code)}'`)}&$top=1`
      );
      const data = await r.json();
      instanceId = data?.value?.[0]?.cr175_lch_kundeinfo_kundeundersoegelseid || "";
    }

    if (!instanceId) {
      return json(context, 400, { error: "missing_id", message: "Mangler instanceId eller gyldig kode." });
    }

    const arkiveretdato = archive ? new Date().toISOString() : null;

    await dvFetch(`${TABLE}(${instanceId})`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": "*" },
      body: JSON.stringify({ cr175_lch_arkiveretdato: arkiveretdato })
    });

    return json(context, 200, { ok: true, instanceId, archived: archive, arkiveretdato });
  } catch (err) {
    context.log.error("survey-archive failed:", err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
