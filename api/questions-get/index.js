// /api/questions-get/index.js
const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const { id, top = 100 } = req.query;
    if (id) {
      const r = await dvFetch(`crcc8_lch_questions(${id})?$select=crcc8_lch_questionid,crcc8_lch_number,crcc8_lch_text,crcc8_lch_explanation,crcc8_lch_group,crcc8_lch_answertype,crcc8_lch_isrequired,crcc8_lch_conditionalon,crcc8_lch_conditionalvalue`);
      const q = await r.json();
      return (context.res = { body: q });
    } else {
      const r = await dvFetch(`crcc8_lch_questions?$select=crcc8_lch_questionid,crcc8_lch_number,crcc8_lch_text,crcc8_lch_explanation,crcc8_lch_group,crcc8_lch_answertype,crcc8_lch_isrequired,crcc8_lch_conditionalon,crcc8_lch_conditionalvalue&$orderby=crcc8_lch_number asc&$top=${encodeURIComponent(top)}`);
      const data = await r.json();
      return (context.res = { body: data });
    }
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
