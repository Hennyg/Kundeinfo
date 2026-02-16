// /api/questions-post/index.js
const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const p = req.body || {};

    // Basale valideringer (kan du slække på hvis du vil)
    if (!p.number || !p.text) {
      return (context.res = { status: 400, body: 'Missing number or text' });
    }

    const body = {
      crcc8_lch_number: p.number,
      crcc8_lch_text: p.text,
      crcc8_lch_explanation: p.explanation ?? null,
      crcc8_lch_answertype: p.answertype, // Choice -> integer
      crcc8_lch_sortorder: p.sortorder ?? null,
      crcc8_lch_isrequired: !!p.isrequired
    };

    // Legacy choice-group (valgfri)
    // Hvis du stadig har UI der sender p.group, så kan den blive.
    // Ellers kan du fjerne denne helt senere.
    if (p.group != null) {
      body.crcc8_lch_group = p.group; // Choice -> integer
    }

    // NEW: lookup til questiongroup
    if (p.questiongroupid) {
      body['crcc8_lch_questiongroup@odata.bind'] = `/crcc8_lch_questiongroups(${p.questiongroupid})`;
    } else {
      // Hvis du kræver group, så returnér 400 i stedet
      // return (context.res = { status: 400, body: 'Missing questiongroupid' });
    }

    // Optional: lookup til andet spørgsmål
    if (p.conditionalon) {
      body['crcc8_lch_conditionalon@odata.bind'] =
        `/crcc8_lch_questions(${p.conditionalon})`;
    }

    if (p.conditionalvalue != null && String(p.conditionalvalue).trim() !== '') {
      body.crcc8_lch_conditionalvalue = p.conditionalvalue;
    } else {
      body.crcc8_lch_conditionalvalue = null;
    }

    const r = await dvFetch('crcc8_lch_questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const location = r.headers.get('OData-EntityId');
    return (context.res = {
      status: 201,
      body: { id: location?.match(/\(([^)]+)\)/)?.[1] }
    });

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
