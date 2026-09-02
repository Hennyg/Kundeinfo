// /api/mailskabeloner-patch/index.js
const { cdFetch: dvFetch } = require('../_coredata');

// Praktisk loft for vedhæftet PDF (base64-tegn) - se mailskabeloner-post.
const MAX_PDF_BASE64_LENGTH = 1000000;

module.exports = async function (context, req) {
  try {
    const { id } = req.query;
    if (!id) return (context.res = { status: 400, body: 'Missing id' });

    const p = req.body || {};

    if (p.vedhaeftetpdf && String(p.vedhaeftetpdf).length > MAX_PDF_BASE64_LENGTH) {
      return (context.res = { status: 400, body: 'Vedhæftet PDF er for stor (maks. ca. 700 KB).' });
    }

    const body = {
      cr175_lch_navn: p.navn,
      cr175_lch_kategori: p.kategori ?? null,
      cr175_lch_emne: p.emne ?? null,
      cr175_lch_broedtekst: p.broedtekst ?? null,
      cr175_lch_aktiv: p.aktiv !== false
    };

    // PDF-felterne røres KUN hvis frontend'en eksplicit har sendt dem med
    // (admin uploadede en ny fil, eller trykkede "Fjern vedhæftning").
    // Almindelig gem af de andre felter skal ikke ved et uheld nulstille en
    // eksisterende vedhæftning, som editerings-formularen aldrig henter selve
    // indholdet af i første omgang.
    if (Object.prototype.hasOwnProperty.call(p, 'vedhaeftetpdf')) {
      body.cr175_lch_vedhaeftetpdf = p.vedhaeftetpdf;
    }
    if (Object.prototype.hasOwnProperty.call(p, 'vedhaeftetpdfnavn')) {
      body.cr175_lch_vedhaeftetpdfnavn = p.vedhaeftetpdfnavn;
    }

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
