// /api/mailskabeloner-get/index.js
const { cdFetch: dvFetch } = require('../_coredata');

const SELECT =
  'cr175_lch_kundeinfo_mailskabelonid,cr175_lch_navn,cr175_lch_noegle,' +
  'cr175_lch_kategori,cr175_lch_emne,cr175_lch_broedtekst,cr175_lch_aktiv,' +
  // Kun filNAVNET, aldrig selve PDF-indholdet (cr175_lch_vedhaeftetpdf) -
  // det felt kan være stort (base64), og admin-UI'en har kun brug for at
  // vide OM der er en vedhæftning, ikke selve indholdet.
  'cr175_lch_vedhaeftetpdfnavn';

function escODataString(s) {
  return String(s ?? '').replace(/'/g, "''");
}

module.exports = async function (context, req) {
  try {
    const { id, top = 500, kategori, aktiv } = req.query;

    if (id) {
      const r = await dvFetch(
        `cr175_lch_kundeinfo_mailskabelons(${id})?$select=${SELECT}`
      );
      const row = await r.json();
      return (context.res = { body: row });
    }

    // Valgfri filtrering: ?kategori=opret-skema henter kun skabeloner til
    // den kategori (bruges af fx admincreate.html's skabelon-dropdown).
    // ?aktiv=1 begrænser samtidig til kun aktive skabeloner.
    const filters = [];
    if (kategori) filters.push(`cr175_lch_kategori eq '${escODataString(kategori)}'`);
    if (aktiv === '1' || aktiv === 'true') filters.push(`cr175_lch_aktiv eq true`);
    const filterQs = filters.length ? `&$filter=${encodeURIComponent(filters.join(' and '))}` : '';

    const r = await dvFetch(
      `cr175_lch_kundeinfo_mailskabelons?$select=${SELECT}` +
      `&$orderby=cr175_lch_navn asc&$top=${encodeURIComponent(top)}${filterQs}`
    );
    const data = await r.json();
    return (context.res = { body: data });

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};



