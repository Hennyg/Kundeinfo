// /api/questions-get/index.js
const { cdFetch: dvFetch } = require('../_coredata');

const SELECT = [
  'cr175_lch_kundeinfo_spoergsmaalid',
  'cr175_lch_nummer',
  'cr175_lch_spoergsmaalstekst',
  'cr175_lch_forklaring',
  'cr175_lch_svartype',
  'cr175_lch_paakraevet',
  'cr175_lch_sorteringsnummer',
  '_cr175_lch_spoergsmaalsgruppe_value',
  '_cr175_lch_betingetaf_value'
].join(',');

const EXPAND = 'cr175_lch_spoergsmaalsgruppe($select=cr175_lch_titel)';

module.exports = async function (context, req) {
  try {
    const { id, top = 100 } = req.query;

    if (id) {
      const r = await dvFetch(
        `cr175_lch_kundeinfo_spoergsmaals(${id})?$select=${SELECT}&$expand=${EXPAND}`
      );
      const q = await r.json();
      return (context.res = { body: q });
    }

    const url =
      `cr175_lch_kundeinfo_spoergsmaals?$select=${SELECT}` +
      `&$expand=${EXPAND}` +
      `&$orderby=cr175_lch_nummer asc` +
      `&$top=${encodeURIComponent(top)}`;

    const r = await dvFetch(url);
    const data = await r.json();
    context.res = { body: data };

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
