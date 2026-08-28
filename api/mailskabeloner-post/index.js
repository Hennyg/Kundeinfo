// /api/mailskabeloner-post/index.js
const { cdFetch: dvFetch } = require('../_coredata');

// Praktisk loft for vedhæftet PDF (base64-tegn). Holder os et stykke under
// Dataverse's grænse for "Multiple Lines of Text" (typisk op til 1.048.576
// tegn), så vi undgår at fejle på selve Dataverse-kaldet.
const MAX_PDF_BASE64_LENGTH = 1000000;

module.exports = async function (context, req) {
  try {
    const p = req.body || {};

    if (!p.navn) return (context.res = { status: 400, body: 'Missing navn' });
    if (!p.noegle) return (context.res = { status: 400, body: 'Missing noegle' });

    if (p.vedhaeftetpdf && String(p.vedhaeftetpdf).length > MAX_PDF_BASE64_LENGTH) {
      return (context.res = { status: 400, body: 'Vedhæftet PDF er for stor (maks. ca. 700 KB).' });
    }

    const body = {
      cr175_lch_navn: p.navn,
      cr175_lch_noegle: p.noegle,
      cr175_lch_kategori: p.kategori ?? null,
      cr175_lch_emne: p.emne ?? null,
      cr175_lch_broedtekst: p.broedtekst ?? null,
      cr175_lch_aktiv: p.aktiv !== false,
      cr175_lch_vedhaeftetpdf: p.vedhaeftetpdf ?? null,
      cr175_lch_vedhaeftetpdfnavn: p.vedhaeftetpdfnavn ?? null
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



