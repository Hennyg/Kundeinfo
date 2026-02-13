const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const p = req.body || {};

    if (!p.surveytypeid || !p.name || !p.title) {
      return (context.res = { status: 400, body: 'Missing surveytypeid/name/title' });
    }

    const body = {
      crcc8_lch_name: p.name,
      crcc8_lch_title: p.title,
      crcc8_lch_description: p.description ?? null,
      crcc8_lch_sortorder: (p.sortorder ?? null),
      crcc8_lch_isactive: !!p.isactive
    };

    // color (choice) hvis du vil bruge den senere
    if (p.color != null && p.color !== "") {
      body.crcc8_lch_color = parseInt(p.color, 10);
    }

    // surveytype lookup
    body['crcc8_lch_surveytype@odata.bind'] = `/crcc8_lch_surveytypes(${p.surveytypeid})`;

    const r = await dvFetch('crcc8_lch_questiongroups', {
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
