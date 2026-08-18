// /api/questiongroups-get/index.js
const { cdFetch: dvFetch } = require('../_coredata');

const SELECT =
  'cr175_lch_kundeinfo_spoergsmaalsgruppeid,cr175_lch_titel,cr175_lch_description,' +
  'cr175_lch_sorteringsnummer,cr175_lch_aktiv,cr175_lch_kangentages,cr175_lch_rapporterer_til';

module.exports = async function (context, req) {
  try {
    const { id, top = 500 } = req.query;

    if (id) {
      const r = await dvFetch(
        `cr175_lch_kundeinfo_spoergsmaalsgruppes(${id})?$select=${SELECT}`
      );
      const row = await r.json();
      return (context.res = { body: row });
    }

    const r = await dvFetch(
      `cr175_lch_kundeinfo_spoergsmaalsgruppes?$select=${SELECT}` +
      `&$orderby=cr175_lch_sorteringsnummer asc&$top=${encodeURIComponent(top)}`
    );
    const data = await r.json();
    return (context.res = { body: data });

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
