// /api/questiongroups-patch/index.js
const { cdFetch: dvFetch } = require('../_coredata');

module.exports = async function (context, req) {
  try {
    const { id } = req.query;
    if (!id) return (context.res = { status: 400, body: 'Missing id' });

    const p = req.body || {};

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

    await dvFetch(`cr175_lch_kundeinfo_spoergsmaalsgruppes(${id})`, {
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
