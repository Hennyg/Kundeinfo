// /api/questiongroups-post/index.js
const { cdFetch: dvFetch } = require('../_coredata');

module.exports = async function (context, req) {
  try {
    const p = req.body || {};

    if (!p.title) {
      return (context.res = { status: 400, body: 'Missing title' });
    }

    const body = {
      cr175_lch_titel: p.title,
      cr175_lch_description: p.description ?? null,
      cr175_lch_sorteringsnummer: (p.sortorder ?? null),
      cr175_lch_aktiv: !!p.isactive,
      cr175_lch_kangentages: !!p.repeatable,
      // Hvilket system gruppens svar skal rapporteres til: 245500000=Kontakter,
      // 245500001=Kundeliste, 245500002=Uniconta (Valgliste, sat fra frontend)
      cr175_lch_rapporterer_til: (p.rapporterTil ?? null)
    };

    const r = await dvFetch('cr175_lch_kundeinfo_spoergsmaalsgruppes', {
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
