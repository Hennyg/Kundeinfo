// /api/survey-create-from-template/index.js
const { dvFetch } = require("../_dataverse");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = async function (context, req) {
  try {
    const templateId = String(req?.body?.templateId || "").trim();
    const customerName = String(req?.body?.customerName || "").trim();
    const expiresAt = req?.body?.expiresAt || null;
    const submittedPrefillItems = Array.isArray(req?.body?.prefillItems)
      ? req.body.prefillItems
      : [];

    if (!templateId) return json(context, 400, { error: "missing_templateId", message: "Mangler templateId." });
    if (!customerName) return json(context, 400, { error: "missing_customerName", message: "Mangler customerName." });

    const itemsPath =
      "crcc8_lch_surveytemplateitems" +
      "?$select=crcc8_lch_defaultprefilltext,crcc8_lch_sortorder,_crcc8_lch_question_value" +
      `&$filter=_crcc8_lch_surveytemplate_value eq ${templateId}` +
      "&$top=5000";

    const templateResponse = await dvFetch(itemsPath);
    const templateData = await templateResponse.json();
    const templateRows = (templateData.value || []).filter(row => row._crcc8_lch_question_value);

    if (!templateRows.length) {
      return json(context, 400, { error: "template_empty", message: "Template har ingen spørgsmål." });
    }

    const templateByQuestion = new Map(
      templateRows.map(row => [String(row._crcc8_lch_question_value), row])
    );

    const requested = submittedPrefillItems
      .map((item, index) => ({
        questionId: String(item?.questionId || "").trim(),
        repeatIndex: Math.max(0, Number.parseInt(item?.repeatIndex ?? 0, 10) || 0),
        prefillText: String(item?.prefillText || "").trim() || null,
        requestOrder: index
      }))
      .filter(item => item.questionId && templateByQuestion.has(item.questionId));

    const surveyItems = requested.length
      ? requested
      : templateRows.map((row, index) => ({
          questionId: String(row._crcc8_lch_question_value),
          repeatIndex: 0,
          prefillText: String(row.crcc8_lch_defaultprefilltext || "").trim() || null,
          requestOrder: index
        }));

    const code = makeCode();
    const instanceBody = {
      crcc8_name: `${customerName} (${code})`,
      crcc8_lch_customername: customerName,
      crcc8_lch_code: code,
      crcc8_status: 100000000,
      crcc8_templateversion: 1
    };
    if (expiresAt) instanceBody.crcc8_expiresat = expiresAt;

    const createResponse = await dvFetch("crcc8_lch_surveyinstances", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(instanceBody)
    });

    const location =
      createResponse.headers.get("OData-EntityId") ||
      createResponse.headers.get("odata-entityid") ||
      createResponse.headers.get("Location") || "";
    const instanceId = location.match(/\(([^)]+)\)/)?.[1] || null;

    if (!instanceId) {
      return json(context, 500, {
        error: "instance_id_missing",
        message: "Oprettet instans, men kunne ikke finde id i response-headeren."
      });
    }

    for (let index = 0; index < surveyItems.length; index++) {
      const item = surveyItems[index];
      const templateItem = templateByQuestion.get(item.questionId);
      const baseSort = Number.isFinite(Number(templateItem?.crcc8_lch_sortorder))
        ? Number(templateItem.crcc8_lch_sortorder)
        : index + 1;

      const body = {
        crcc8_lch_name: "",
        crcc8_lch_prefilltext: item.prefillText,
        crcc8_lch_repeatindex: item.repeatIndex,
        crcc8_lch_sortordertal: (item.repeatIndex * 100000) + baseSort,
        "crcc8_lch_surveyinstance@odata.bind": `/crcc8_lch_surveyinstances(${instanceId})`,
        "crcc8_lch_surveytemplate@odata.bind": `/crcc8_lch_surveytemplates(${templateId})`,
        "crcc8_lch_question@odata.bind": `/crcc8_lch_questions(${item.questionId})`
      };

      const itemResponse = await dvFetch("crcc8_lch_surveyitems", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body)
      });

      if (!itemResponse.ok) {
        return json(context, itemResponse.status, {
          error: "surveyitem_create_failed",
          detail: await itemResponse.text(),
          questionId: item.questionId,
          repeatIndex: item.repeatIndex
        });
      }
    }

    const origin = req.headers["x-forwarded-host"]
      ? `https://${req.headers["x-forwarded-host"]}`
      : "";
    const link = `${origin}/kundesurvey.html?code=${encodeURIComponent(code)}`;

    return json(context, 200, {
      ok: true,
      instanceId,
      code,
      link,
      customerLink: link
    });
  } catch (error) {
    return json(context, 500, {
      error: "server_error",
      detail: String(error?.message || error)
    });
  }
};
