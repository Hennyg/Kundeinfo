const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const { id } = req.query;
    if (!id) return (context.res = { status: 400, body: 'Missing id' });

    const p = req.body || {};

    const body = {
      crcc8_lch_name: p.name,
      crcc8_lch_title: p.title,
      crcc8_lch_description: p.description ?? null,
      crcc8_lch_sortorder: (p.sortorder ?? null),
      crcc8_lch_isactive: !!p.isactive
    };

    if (p.color != null && p.color !== "") {
      body.crcc8_lch_color = parseInt(p.color, 10);
    } else {
      // hvis du vil nulstille farve:
      body.crcc8_lch_color = null;
    }

    if (p.surveytypeid) {
      body['crcc8_lch_surveytype@odata.bind'] = `/crcc8_lch_surveytypes(${p.surveytypeid})`;
    }

    await dvFetch(`crcc8_lch_questiongroups(${id})`, {
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
