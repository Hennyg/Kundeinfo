// /api/questions-patch/index.js
const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const { id } = req.query;
    if (!id) return (context.res = { status: 400, body: 'Missing id' });

    const p = req.body || {};

    const body = {
      cr175_lch_nummer: p.number,
      cr175_lch_spoergsmaalstekst: p.text,
      cr175_lch_forklaring: p.explanation ?? null,
      cr175_lch_svartype: p.answertype,
      cr175_lch_paakraevet: !!p.isrequired,
      cr175_lch_sorteringsnummer: p.sortorder ?? null
    };

    if (p.questiongroupid) {
      body['cr175_lch_spoergsmaalsgruppe@odata.bind'] =
        `/cr175_lch_kundeinfo_spoergsmaalsgruppes(${p.questiongroupid})`;
    } else {
      body.cr175_lch_spoergsmaalsgruppe = null;
    }

    if (p.conditionalon) {
      body['cr175_lch_betingetaf@odata.bind'] =
        `/cr175_lch_kundeinfo_spoergsmaals(${p.conditionalon})`;
    } else {
      body.cr175_lch_betingetaf = null;
    }

    await dvFetch(`cr175_lch_kundeinfo_spoergsmaals(${id})`, {
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
