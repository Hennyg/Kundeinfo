// /api/questions-get/index.js
const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const { id, top = 100 } = req.query;

    const select = [
      'crcc8_lch_questionid',
      'crcc8_lch_number',
      'crcc8_lch_text',
      'crcc8_lch_explanation',

      // behold gamle (hvis du stadig bruger dem)
      'crcc8_lch_group',

      'crcc8_lch_answertype',
      'crcc8_lch_isrequired',
      'crcc8_lch_conditionalon',
      'crcc8_lch_conditionalvalue',

      // lookup GUID
      '_crcc8_lch_questiongroup_value'
    ].join(',');

    // Hent titel på gruppen (og gerne surveytype-id til fillForm senere)
    const expand =
      'crcc8_lch_questiongroup($select=crcc8_lch_title,crcc8_lch_name,_crcc8_lch_surveytype_value)';

    if (id) {
      const r = await dvFetch(
        `crcc8_lch_questions(${id})?$select=${select}&$expand=${expand}`
      );
      const q = await r.json();
      return (context.res = { body: q });
    } else {
      const r = await dvFetch(
        `crcc8_lch_questions?$select=${select}&$expand=${expand}&$orderby=crcc8_lch_number asc&$top=${encodeURIComponent(top)}`
      );
      const data = await r.json();
      return (context.res = { body: data });
    }
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
