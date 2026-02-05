// /api/questions-post/index.js
const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const p = req.body || {};
    // Map til Dataverse felter
    const body = {
      crcc8_lch_number: p.number,
      crcc8_lch_text: p.text,
      crcc8_lch_explanation: p.explanation ?? null,
      crcc8_lch_group: p.group,           // Choice -> integer
      crcc8_lch_answertype: p.answertype, // Choice -> integer
      crcc8_lch_isrequired: !!p.isrequired
    };

    // Optional: lookup til andet spørgsmål
    if (p.conditionalon) {
      body['crcc8_lch_conditionalon@odata.bind'] =
        `/crcc8_lch_questions(${p.conditionalon})`;
    }
    if (p.conditionalvalue) body.crcc8_lch_conditionalvalue = p.conditionalvalue;

    const r = await dvFetch('crcc8_lch_questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const location = r.headers.get('OData-EntityId');
    return (context.res = { status: 201, body: { id: location?.match(/\(([^)]+)\)/)?.[1] } });
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
