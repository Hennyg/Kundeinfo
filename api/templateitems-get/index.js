const { dvFetch } = require("../_dataverse");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function numberKey(value) {
  const text = String(value || "").trim();
  const match = /^(\d+)([a-zA-Z]*)$/.exec(text);
  if (!match) return { number: 999999, suffix: text.toLowerCase() };
  return {
    number: Number.parseInt(match[1], 10) || 0,
    suffix: (match[2] || "").toLowerCase()
  };
}

module.exports = async function (context, req) {
  try {
    const templateId = String(req.query?.templateId || "").trim();
    if (!templateId) {
      return json(context, 400, {
        error: "missing_templateId",
        message: "Mangler templateId i query."
      });
    }

    const top = Math.min(Number.parseInt(req.query?.top || "500", 10) || 500, 2000);
    const select = [
      "crcc8_lch_surveytemplateitemid",
      "crcc8_lch_defaultprefilltext",
      "crcc8_lch_sortorder",
      "_crcc8_lch_question_value"
    ].join(",");

    const expand =
      "crcc8_lch_question(" +
        "$select=" + [
          "crcc8_lch_questionid",
          "crcc8_lch_number",
          "crcc8_lch_text",
          "crcc8_lch_answertype",
          "_crcc8_lch_questiongroup_value"
        ].join(",") +
        ";$expand=crcc8_lch_questiongroup(" +
          "$select=crcc8_lch_questiongroupid,crcc8_lch_title,crcc8_lch_name," +
          "crcc8_lch_sortorder,crcc8_crcc8_repeatable" +
        ")" +
      ")";

    const path =
      "crcc8_lch_surveytemplateitems" +
      `?$select=${encodeURIComponent(select)}` +
      `&$expand=${encodeURIComponent(expand)}` +
      `&$filter=_crcc8_lch_surveytemplate_value eq ${templateId}` +
      `&$top=${top}`;

    const response = await dvFetch(path, {
      headers: { Prefer: 'odata.include-annotations="*"' }
    });
    const data = await response.json();
    const rows = data?.value || [];

    rows.sort((a, b) => {
      const qa = a.crcc8_lch_question || {};
      const qb = b.crcc8_lch_question || {};
      const ga = qa.crcc8_lch_questiongroup || {};
      const gb = qb.crcc8_lch_questiongroup || {};

      const groupSort = (ga.crcc8_lch_sortorder ?? 999999) - (gb.crcc8_lch_sortorder ?? 999999);
      if (groupSort !== 0) return groupSort;

      const na = numberKey(qa.crcc8_lch_number);
      const nb = numberKey(qb.crcc8_lch_number);
      if (na.number !== nb.number) return na.number - nb.number;
      if (na.suffix !== nb.suffix) return na.suffix.localeCompare(nb.suffix, "da");

      return (a.crcc8_lch_sortorder ?? 999999) - (b.crcc8_lch_sortorder ?? 999999);
    });

    const value = rows.map(row => {
      const question = row.crcc8_lch_question || {};
      const group = question.crcc8_lch_questiongroup || {};
      return {
        templateItemId: row.crcc8_lch_surveytemplateitemid,
        questionId: question.crcc8_lch_questionid || row._crcc8_lch_question_value || null,
        number: question.crcc8_lch_number || "",
        text: question.crcc8_lch_text || "",
        groupId: group.crcc8_lch_questiongroupid || question._crcc8_lch_questiongroup_value || "_uden_gruppe_",
        groupLabel: group.crcc8_lch_title || group.crcc8_lch_name || "Uden gruppe",
        repeatable: group.crcc8_crcc8_repeatable === true,
        answertypeLabel:
          question["crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue"] ||
          (question.crcc8_lch_answertype != null ? String(question.crcc8_lch_answertype) : ""),
        defaultPrefillText: row.crcc8_lch_defaultprefilltext || "",
        sortorder: row.crcc8_lch_sortorder ?? null
      };
    }).filter(item => item.questionId);

    return json(context, 200, { value });
  } catch (error) {
    return json(context, 500, {
      error: "server_error",
      detail: String(error?.message || error)
    });
  }
};
