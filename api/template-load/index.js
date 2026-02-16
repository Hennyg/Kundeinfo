// /api/template-load/index.js
const { dvFetch } = require("../_dataverse");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json; charset=utf-8" }, body };
}

module.exports = async function (context, req) {
  try {
    const templateId = String(req?.query?.id || req?.body?.id || "").trim();
    if (!templateId) return json(context, 400, { error: "missing_id", message: "Mangler template id." });

    const tRes = await dvFetch(
      `crcc8_lch_surveytemplates(${templateId})?$select=crcc8_lch_surveytemplateid,crcc8_lch_name,crcc8_lch_description,crcc8_lch_isactive`
    );
    if (!tRes.ok) return json(context, tRes.status, { error: "template_read_failed", detail: await tRes.text() });
    const tpl = await tRes.json();

    const itemsPath =
      `crcc8_lch_surveytemplateitems` +
      `?$select=crcc8_lch_surveytemplateitemid,crcc8_lch_defaultprefilltext,crcc8_lch_sortorder,_crcc8_lch_question_value` +
      `&$filter=_crcc8_lch_surveytemplate_value eq ${templateId}` +
      `&$top=5000`;

    const iRes = await dvFetch(itemsPath);
    if (!iRes.ok) return json(context, iRes.status, { error: "items_read_failed", detail: await iRes.text() });
    const items = await iRes.json();

    return json(context, 200, {
      template: {
        id: tpl.crcc8_lch_surveytemplateid,
        name: tpl.crcc8_lch_name,
        description: tpl.crcc8_lch_description || "",
        isActive: tpl.crcc8_lch_isactive !== false
      },
      items: (items.value || []).map(x => ({
        id: x.crcc8_lch_surveytemplateitemid,
        questionId: x._crcc8_lch_question_value,
        sortOrder: x.crcc8_lch_sortorder ?? null,
        defaultPrefillText: x.crcc8_lch_defaultprefilltext ?? ""
      }))
    });
  } catch (e) {
    return json(context, 500, { error: "server_error", detail: String(e?.message || e) });
  }
};
