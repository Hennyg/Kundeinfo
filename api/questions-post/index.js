// /api/questions-post/index.js
const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const p = req.body || {};

    if (!p.number || !p.text) {
      return (context.res = { status: 400, body: 'Missing number or text' });
    }

    const body = {
      cr175_lch_nummer: p.number,
      cr175_lch_spoergsmaalstekst: p.text,
      cr175_lch_forklaring: p.explanation ?? null,
      cr175_lch_svartype: p.answertype, // Choice -> integer
      cr175_lch_sorteringsnummer: p.sortorder ?? null,
      cr175_lch_paakraevet: !!p.isrequired
    };

    if (p.questiongroupid) {
      body['cr175_lch_spoergsmaalsgruppe@odata.bind'] =
        `/cr175_lch_kundeinfo_spoergsmaalsgruppes(${p.questiongroupid})`;
    }

    if (p.conditionalon) {
      body['cr175_lch_betingetaf@odata.bind'] =
        `/cr175_lch_kundeinfo_spoergsmaals(${p.conditionalon})`;
    }

    const r = await dvFetch('cr175_lch_kundeinfo_spoergsmaals', {
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
