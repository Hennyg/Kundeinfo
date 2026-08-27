// /api/mailpladsholdere-get/index.js
const { cdFetch: dvFetch } = require('../_coredata');

const SELECT =
  'cr175_lch_kundeinfo_mailpladsholderid,cr175_lch_navn,cr175_lch_kode,' +
  'cr175_lch_beskrivelse,cr175_lch_sorteringsnummer,cr175_lch_aktiv';

module.exports = async function (context, req) {
  try {
    const { id, top = 500, aktiv } = req.query;

    if (id) {
      const r = await dvFetch(
        `cr175_lch_kundeinfo_mailpladsholders(${id})?$select=${SELECT}`
      );
      const row = await r.json();
      return (context.res = { body: row });
    }

    const filterQs = (aktiv === '1' || aktiv === 'true')
      ? `&$filter=${encodeURIComponent('cr175_lch_aktiv eq true')}`
      : '';

    const r = await dvFetch(
      `cr175_lch_kundeinfo_mailpladsholders?$select=${SELECT}` +
      `&$orderby=cr175_lch_sorteringsnummer asc,cr175_lch_navn asc` +
      `&$top=${encodeURIComponent(top)}${filterQs}`
    );
    const data = await r.json();
    return (context.res = { body: data });

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
