// /api/survey-sms-preview/index.js
//
// GET ?id=<instanceId>
// Udfylder den aktive SMS-skabelon for én kundeundersøgelse, til "Send SMS"-
// vinduet på adminoversigt.html. Skabelonen vælges ud fra status (Set har sin
// egen, se _sms.js). Returnerer også kundenummeret, så vinduet kan hente
// ejerne fra /api/entra-customer-contacts. Sender intet.

const S = require("../_sms");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json; charset=utf-8" }, body };
}

module.exports = async function (context, req) {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) return json(context, 400, { error: "missing_id", message: "Mangler id." });

    const inst = await S.loadInstance(id);
    const status = inst.cr175_lch_nystatus || "";
    const { template, count, wanted, fallback } = await S.getSmsTemplateForStatus(status);

    const message = template ? await S.renderSmsForInstance(inst, template.cr175_lch_broedtekst) : "";

    return json(context, 200, {
      instanceId: id,
      kundenavn: inst.cr175_lch_kundenavn || "",
      kode: inst.cr175_lch_kode || "",
      kundenummer: inst.cr175_lch_kundenummer || "",
      status,
      mobil: inst.cr175_lch_sendttilmobil || "",
      templateName: template?.cr175_lch_navn || null,
      templateCategory: template ? (fallback ? S.SMS_CATEGORY : wanted) : null,
      templateWarning: !template
        ? `Ingen aktiv SMS-skabelon med kategori "${wanted}" - opret den under Mailskabeloner (Type = SMS).`
        : fallback
          ? `Ingen aktiv skabelon til status Set ("${wanted}") - bruger standardskabelonen.`
          : (count > 1 ? "Der er flere aktive skabeloner i samme kategori - den senest rettede bruges." : null),
      message
    });
  } catch (err) {
    context.log.error("survey-sms-preview failed:", err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
