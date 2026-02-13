const { dvFetch } = require('../_dataverse');

module.exports = async function (context, req) {
  try {
    const { id, top = 200 } = req.query;

    if (id) {
      const r = await dvFetch(`crcc8_lch_surveytypes(${id})?$select=crcc8_lch_surveytypeid,crcc8_lch_type`);
      const row = await r.json();
      return (context.res = { body: row });
    }

    const r = await dvFetch(
      `crcc8_lch_surveytypes?$select=crcc8_lch_surveytypeid,crcc8_lch_type&$orderby=crcc8_lch_type asc&$top=${encodeURIComponent(top)}`
    );
    const data = await r.json();
    return (context.res = { body: data });

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
