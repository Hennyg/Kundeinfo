// /api/survey-create-from-template/index.js
const { dvFetch } = require("../_dataverse");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json; charset=utf-8" }, body };
}

function escODataString(s) {
  return String(s ?? "").replace(/'/g, "''");
}

// simple 6-cifret kode
function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = async function (context, req) {
  try {
    const templateId = String(req?.body?.templateId || "").trim();
    const customerName = String(req?.body?.customerName || "").trim();
    const note = String(req?.body?.note || "").trim() || null;
    const expiresAt = req?.body?.expiresAt || null; // ISO eller null

    if (!templateId) return json(context, 400, { error: "missing_templateId", message: "Mangler templateId." });
    if (!customerName) return json(context, 400, { error: "missing_customerName", message: "Mangler customerName." });

    // 1) load template items
    const itemsPath =
      `crcc8_lch_surveytemplateitems` +
      `?$select=crcc8_lch_defaultprefilltext,crcc8_lch_sortorder,_crcc8_lch_question_value` +
      `&$filter=_crcc8_lch_surveytemplate_value eq ${templateId}` +
      `&$top=5000`;

    const tItemsRes = await dvFetch(itemsPath);
    if (!tItemsRes.ok) return json(context, tItemsRes.status, { error: "templateitems_read_failed", detail: await tItemsRes.text() });
    const tItems = await tItemsRes.json();
    const rows = (tItems.value || []).filter(x => x._crcc8_lch_question_value);

    if (!rows.length) return json(context, 400, { error: "template_empty", message: "Template har ingen spørgsmål." });

    // 2) create surveyinstance
    const code = makeCode();

    const instBody = {
      crcc8_name: `${customerName} (${code})`,
      crcc8_lch_customername: customerName,
      crcc8_lch_code: code,
      crcc8_status: 100000000, // <-- juster hvis du har et status-valg (eller fjern feltet)
      crcc8_templateversion: 1
      // note? du har ikke vist note-felt på instance; hvis du har et, binder vi det her
    };

    if (expiresAt) instBody.crcc8_expiresat = expiresAt;

    const rCreate = await dvFetch("crcc8_lch_surveyinstances", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(instBody)
    });
    if (!rCreate.ok) return json(context, rCreate.status, { error: "instance_create_failed", detail: await rCreate.text() });

    // find instanceId from headers
    const loc = rCreate.headers.get("OData-EntityId") || rCreate.headers.get("odata-entityid") || rCreate.headers.get("Location") || "";
    const m = loc.match(/\(([^)]+)\)/);
    const instanceId = m ? m[1] : null;
    if (!instanceId) return json(context, 500, { error: "instance_id_missing", message: "Oprettet instans, men kunne ikke finde id (header)." });

    // 3) create surveyitems
    for (const it of rows) {
      const qid = it._crcc8_lch_question_value;
      const defaultPrefill = String(it.crcc8_lch_defaultprefilltext || "").trim() || null;
      const sortOrder = Number.isFinite(Number(it.crcc8_lch_sortorder)) ? Number(it.crcc8_lch_sortorder) : null;

      const body = {
        crcc8_lch_name: "", // valgfrit
        crcc8_lch_prefilltext: defaultPrefill,
        crcc8_lch_repeatindex: 0,
        crcc8_lch_sortordertal: sortOrder,
        "crcc8_lch_surveyinstance@odata.bind": `/crcc8_lch_surveyinstances(${instanceId})`,
        "crcc8_lch_question@odata.bind": `/crcc8_lch_questions(${qid})`
      };

      const r = await dvFetch("crcc8_lch_surveyitems", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body)
      });
      if (!r.ok) return json(context, r.status, { error: "surveyitem_create_failed", detail: await r.text(), questionId: qid });
    }

    // 4) customer link (tilpas til din rigtige kunde-side)
    const origin = req.headers["x-forwarded-host"]
      ? `https://${req.headers["x-forwarded-host"]}`
      : "";

    const customerLink = `${origin}/kundeinfo.html?t=${encodeURIComponent(code)}`;

    return json(context, 200, { ok: true, instanceId, code, customerLink });
  } catch (e) {
    return json(context, 500, { error: "server_error", detail: String(e?.message || e) });
  }
};
