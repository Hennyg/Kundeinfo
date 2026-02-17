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
    const templateId = String(req.query?.templateId || "").trim();
    if (!templateId) {
      return json(context, 400, { error: "missing_templateId", message: "Mangler templateId i query." });
    }

    const top = Math.min(parseInt(req.query?.top || "500", 10) || 500, 2000);

    // TemplateItems: crcc8_lch_surveytemplateitems
    // Lookup til template ligger som _crcc8_lch_surveytemplate_value
    // Lookup til question: crcc8_lch_question
    const select =
      [
        "crcc8_lch_surveytemplateitemid",
        "crcc8_lch_defaultprefilltext",
        "crcc8_lch_sortorder",
        "_crcc8_lch_question_value"
      ].join(",");

    const expand =
      "crcc8_lch_question(" +
        "$select=" +
          [
            "crcc8_lch_questionid",
            "crcc8_lch_number",
            "crcc8_lch_text",
            "crcc8_lch_answertype",
            "_crcc8_lch_questiongroup_value"
          ].join(",") +
      ")";

    const path =
      "crcc8_lch_surveytemplateitems" +
      `?$select=${encodeURIComponent(select)}` +
      `&$expand=${encodeURIComponent(expand)}` +
      `&$filter=_crcc8_lch_surveytemplate_value eq ${templateId}` +
      `&$orderby=crcc8_lch_sortorder asc` +
      `&$top=${top}`;

    const res = await dvFetch(path, {
      headers: {
        "Prefer": 'odata.include-annotations="*"'
      }
    });

    if (!res.ok) {
      return json(context, res.status, { error: "read_failed", detail: await res.text() });
    }

    const data = await res.json();
    const rows = data?.value || [];

    // Map til frontend-venligt format
    const out = rows.map(x => {
      const q = x.crcc8_lch_question || {};
      const qid =
        q.crcc8_lch_questionid ||
        x._crcc8_lch_question_value ||
        null;

      const groupLabel =
        q["_crcc8_lch_questiongroup_value@OData.Community.Display.V1.FormattedValue"] ||
        "";

      const answertypeLabel =
        q["crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue"] ||
        (q.crcc8_lch_answertype != null ? String(q.crcc8_lch_answertype) : "");

      return {
        templateItemId: x.crcc8_lch_surveytemplateitemid,
        questionId: qid,
        number: q.crcc8_lch_number || "",
        text: q.crcc8_lch_text || "",
        groupLabel,
        answertypeLabel,
        defaultPrefillText: x.crcc8_lch_defaultprefilltext || "",
        sortorder: x.crcc8_lch_sortorder ?? null
      };
    }).filter(r => r.questionId); // kun gyldige

    return json(context, 200, { value: out });
  } catch (e) {
    return json(context, 500, { error: "server_error", detail: String(e?.message || e) });
  }
};
