// /api/questiongroups-get/index.js
const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const { id, surveyTypeId, top = 500 } = req.query;

    if (id) {
      // Hent én gruppe
      const r = await dvFetch(
        `crcc8_lch_questiongroups(${id})?$select=crcc8_lch_questiongroupid,crcc8_lch_name,crcc8_lch_title,crcc8_lch_description,crcc8_lch_sortorder,crcc8_lch_isactive,_crcc8_lch_surveytype_value`
      );
      const row = await r.json();
      return (context.res = { body: row });
    }

    // Liste grupper (evt. filtreret på surveyTypeId)
    const filter = surveyTypeId
      ? `&$filter=_crcc8_lch_surveytype_value eq ${surveyTypeId}`
      : '';

    const r = await dvFetch(
      `crcc8_lch_questiongroups?$select=crcc8_lch_questiongroupid,crcc8_lch_name,crcc8_lch_title,crcc8_lch_description,crcc8_lch_sortorder,crcc8_lch_isactive,_crcc8_lch_surveytype_value${filter}&$orderby=crcc8_lch_sortorder asc&$top=${encodeURIComponent(top)}`
    );
    const data = await r.json();
    return (context.res = { body: data });

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
