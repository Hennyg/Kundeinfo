// /api/mailskabeloner-post/index.js
const { cdFetch: dvFetch } = require('../_coredata');

module.exports = async function (context, req) {
  try {
    const p = req.body || {};

    if (!p.navn) return (context.res = { status: 400, body: 'Missing navn' });
    if (!p.noegle) return (context.res = { status: 400, body: 'Missing noegle' });

    const body = {
      cr175_lch_navn: p.navn,
      cr175_lch_noegle: p.noegle,
      cr175_lch_emne: p.emne ?? null,
      cr175_lch_broedtekst: p.broedtekst ?? null,
      cr175_lch_aktiv: p.aktiv !== false
    };

    const r = await dvFetch('cr175_lch_kundeinfo_mailskabelons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const location = r.headers.get('OData-EntityId');
    return (context.res = {
      status: 201,
      body: { id: location?.match(/\(([^)]+)\)/)?.[1] }
    });

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
