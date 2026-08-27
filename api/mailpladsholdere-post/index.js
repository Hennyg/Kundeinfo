// /api/mailpladsholdere-post/index.js
const { cdFetch: dvFetch } = require('../_coredata');

module.exports = async function (context, req) {
  try {
    const p = req.body || {};

    if (!p.navn) return (context.res = { status: 400, body: 'Missing navn' });
    if (!p.kode) return (context.res = { status: 400, body: 'Missing kode' });

    const body = {
      cr175_lch_navn: p.navn,
      // Koden gemmes uden {{ }} - selve visningen med krøllede parenteser
      // sker kun i UI'en, så det matcher det {{kode}}-format
      // renderTemplate.js leder efter i selve brødteksten.
      cr175_lch_kode: String(p.kode).replace(/[{}]/g, '').trim(),
      cr175_lch_beskrivelse: p.beskrivelse ?? null,
      cr175_lch_sorteringsnummer: (p.sortorder ?? null),
      cr175_lch_aktiv: p.aktiv !== false
    };

    const r = await dvFetch('cr175_lch_kundeinfo_mailpladsholders', {
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
