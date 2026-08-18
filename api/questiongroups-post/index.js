// /api/questiongroups-post/index.js
const { cdFetch: dvFetch } = require('../_coredata');

module.exports = async function (context, req) {
  try {
    const p = req.body || {};

    if (!p.title) {
      return (context.res = { status: 400, body: 'Missing title' });
    }

    // Multi-select valgliste i Dataverse gemmes som kommasepareret streng af
    // heltal, fx "245500000,245500002". p.rapporterTil kommer som array fra
    // frontend.
    const rapporterTilValues = Array.isArray(p.rapporterTil)
      ? p.rapporterTil.filter(v => v != null).join(",")
      : (p.rapporterTil ?? null);

    const body = {
      cr175_lch_titel: p.title,
      cr175_lch_description: p.description ?? null,
      cr175_lch_sorteringsnummer: (p.sortorder ?? null),
      cr175_lch_aktiv: !!p.isactive,
      cr175_lch_kangentages: !!p.repeatable,
      // Hvilke(t) system(er) gruppens svar skal rapporteres til: 245500000=Kontakter,
      // 245500001=Kundeliste, 245500002=Uniconta (multi-select valgliste)
      cr175_lch_rapporterer_til: rapporterTilValues || null
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
