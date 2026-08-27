// /api/mailskabeloner-patch/index.js
const { cdFetch: dvFetch } = require('../_coredata');

module.exports = async function (context, req) {
  try {
    const { id } = req.query;
    if (!id) return (context.res = { status: 400, body: 'Missing id' });

    const p = req.body || {};

    const body = {
      cr175_lch_navn: p.navn,
      cr175_lch_noegle: p.noegle,
      cr175_lch_emne: p.emne ?? null,
      cr175_lch_broedtekst: p.broedtekst ?? null,
      cr175_lch_aktiv: p.aktiv !== false
    };

    await dvFetch(`cr175_lch_kundeinfo_mailskabelons(${id})`, {
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
