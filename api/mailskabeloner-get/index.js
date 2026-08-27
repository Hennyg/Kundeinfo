// /api/mailskabeloner-get/index.js
const { cdFetch: dvFetch } = require('../_coredata');

const SELECT =
  'cr175_lch_kundeinfo_mailskabelonid,cr175_lch_navn,cr175_lch_noegle,' +
  'cr175_lch_emne,cr175_lch_broedtekst,cr175_lch_aktiv';

module.exports = async function (context, req) {
  try {
    const { id, top = 500 } = req.query;

    if (id) {
      const r = await dvFetch(
        `cr175_lch_kundeinfo_mailskabelons(${id})?$select=${SELECT}`
      );
      const row = await r.json();
      return (context.res = { body: row });
    }

    const r = await dvFetch(
      `cr175_lch_kundeinfo_mailskabelons?$select=${SELECT}` +
      `&$orderby=cr175_lch_navn asc&$top=${encodeURIComponent(top)}`
    );
    const data = await r.json();
    return (context.res = { body: data });

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
