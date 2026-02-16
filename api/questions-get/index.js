// /api/questions-get/index.js
const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const { id, top = 100, surveyTypeId } = req.query;

    const select = [
      'crcc8_lch_questionid',
      'crcc8_lch_number',
      'crcc8_lch_text',
      'crcc8_lch_explanation',
      'crcc8_lch_group',
      'crcc8_lch_answertype',
      'crcc8_lch_isrequired',
      'crcc8_lch_conditionalon',
      'crcc8_lch_conditionalvalue',
      '_crcc8_lch_questiongroup_value',
      'crcc8_lch_sortorder',
      '_crcc8_lch_conditionalon_value'
    ].join(',');

    // Expand group så UI kan bruge name/title + surveytype
    const expand =
      'crcc8_lch_questiongroup($select=crcc8_lch_name,crcc8_lch_title,_crcc8_lch_surveytype_value)';

    // =========================
    // SINGLE RECORD
    // =========================
    if (id) {
      const r = await dvFetch(
        `crcc8_lch_questions(${id})?$select=${select}&$expand=${expand}`
      );
      const q = await r.json();
      return (context.res = { body: q });
    }

    // =========================
    // LIST
    // =========================
    let url =
      `crcc8_lch_questions?$select=${select}` +
      `&$expand=${expand}` +
      `&$orderby=crcc8_lch_number asc` +
      `&$top=${encodeURIComponent(top)}`;

    // ✅ FILTER på surveytype via questiongroup (GUID-literal korrekt)
    if (surveyTypeId) {
      const st = String(surveyTypeId).replace(/[{}]/g, "");
      url += `&$filter=crcc8_lch_questiongroup/_crcc8_lch_surveytype_value eq guid'${st}'`;
    }

    const r = await dvFetch(url);
    const data = await r.json();
    context.res = { body: data };

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
