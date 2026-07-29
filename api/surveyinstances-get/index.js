// /api/survey-instance-get/index.js
//
// Henter en eksisterende survey-instans + dens surveyitems (prefilltext pr.
// spørgsmål/repeatIndex), så admincreate.html kan indlæse den til redigering.

const { dvFetch } = require("../_dataverse");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

module.exports = async function (context, req) {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) {
      return json(context, 400, { error: "missing_id", message: "Mangler id." });
    }

    const instRes = await dvFetch(
      `crcc8_lch_surveyinstances(${id})?$select=crcc8_lch_surveyinstanceid,crcc8_lch_customername,crcc8_lch_code,crcc8_status,crcc8_expiresat`
    );
    const inst = await instRes.json();

    const itemsRes = await dvFetch(
      `crcc8_lch_surveyitems` +
      `?$select=crcc8_lch_surveyitemid,crcc8_lch_prefilltext,crcc8_lch_repeatindex,_crcc8_lch_question_value` +
      `&$filter=${encodeURIComponent(`_crcc8_lch_surveyinstance_value eq ${id}`)}&$top=5000`
    );
    const itemsData = await itemsRes.json();

    const items = (itemsData.value || []).map(r => ({
      itemId: r.crcc8_lch_surveyitemid,
      questionId: r._crcc8_lch_question_value ? String(r._crcc8_lch_question_value) : "",
      repeatIndex: Number(r.crcc8_lch_repeatindex ?? 0),
      prefillText: r.crcc8_lch_prefilltext || ""
    }));

    return json(context, 200, {
      instanceId: id,
      code: inst.crcc8_lch_code || "",
      customerName: inst.crcc8_lch_customername || "",
      status: inst.crcc8_status,
      expiresAt: inst.crcc8_expiresat || null,
      items
    });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
