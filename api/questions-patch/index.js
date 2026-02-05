// /api/questions-patch/index.js
const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const { id } = req.query;
    if (!id) return (context.res = { status: 400, body: 'Missing id' });

    const p = req.body || {};
    const body = {
      crcc8_lch_number: p.number,
      crcc8_lch_text: p.text,
      crcc8_lch_explanation: p.explanation ?? null,
      crcc8_lch_group: p.group,
      crcc8_lch_answertype: p.answertype,
      crcc8_lch_isrequired: !!p.isrequired,
      crcc8_lch_conditionalvalue: p.conditionalvalue ?? null
    };

    // håndtér lookup bind/null
    if (p.conditionalon) {
      body['crcc8_lch_conditionalon@odata.bind'] = `/crcc8_lch_questions(${p.conditionalon})`;
    } else {
      // nulstil relation
      body.crcc8_lch_conditionalon = null;
    }

    await dvFetch(`crcc8_lch_questions(${id})`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': '*' },
      body: JSON.stringify(body)
    });
    context.res = { status: 204 };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
