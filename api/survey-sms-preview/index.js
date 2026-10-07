// /api/survey-sms-preview/index.js
//
// GET ?id=<instanceId>
// Udfylder den aktive SMS-skabelon (kategori "sms-paamindelse") for én
// kundeundersøgelse, til "Send SMS"-vinduet på adminoversigt.html. Sender
// intet - teksten kan rettes i vinduet før afsendelse.

const S = require("../_sms");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json; charset=utf-8" }, body };
}

module.exports = async function (context, req) {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) return json(context, 400, { error: "missing_id", message: "Mangler id." });

    const inst = await S.loadInstance(id);
    const { template, count } = await S.getSmsTemplate();

    const message = template ? await S.renderSmsForInstance(inst, template.cr175_lch_broedtekst) : "";

    return json(context, 200, {
      instanceId: id,
      kundenavn: inst.cr175_lch_kundenavn || "",
      kode: inst.cr175_lch_kode || "",
      mobil: inst.cr175_lch_sendttilmobil || "",
      templateName: template?.cr175_lch_navn || null,
      templateWarning: !template
        ? `Ingen aktiv SMS-skabelon med kategori "${S.SMS_CATEGORY}" - opret den under Mailskabeloner (Type = SMS).`
        : (count > 1 ? "Der er flere aktive SMS-skabeloner - den senest rettede bruges." : null),
      message
    });
  } catch (err) {
    context.log.error("survey-sms-preview failed:", err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
