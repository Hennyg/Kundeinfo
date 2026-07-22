// /api/kunder-search/index.js
//
// Søger i coredata-kundetabellen (samme data som kundeliste-appens
// cr1eb_lch_kundes) og returnerer et par matches til autocomplete.
//
// Kræver disse app settings på SWA'en:
//   COREDATA_URL          fx https://org.crm4.dynamics.com
//   COREDATA_KUNDE_TABEL  fx cr1eb_lch_kundes
//
// Genbruger den samme Entra-app-registrering som resten af Kundeinfo
// (DV_TENANT_ID / DV_CLIENT_ID / DV_CLIENT_SECRET), bare med et andet
// "resource" (COREDATA_URL i stedet for DV_RESOURCE_URL). Hvis app-
// registreringen ikke også er tilføjet som application user i coredata-
// miljøet, vil token-kaldet fejle med 401/403 – i så fald skal der
// separate COREDATA_CLIENT_ID/COREDATA_CLIENT_SECRET til.

const fetch = globalThis.fetch;

function esc(s) { return String(s || '').replace(/'/g, "''"); }

async function getToken(resource) {
  const tenant = process.env.DV_TENANT_ID;
  const clientId = process.env.DV_CLIENT_ID;
  const clientSecret = process.env.DV_CLIENT_SECRET;

  if (!tenant || !clientId || !clientSecret || !resource) {
    throw new Error('Mangler DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET eller COREDATA_URL');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${resource}/.default`
  });

  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const j = await r.json();
  if (!r.ok) throw new Error(`token_error ${r.status}: ${JSON.stringify(j)}`);
  return j.access_token;
}

module.exports = async function (context, req) {
  try {
    const resource = process.env.COREDATA_URL;
    const table = process.env.COREDATA_KUNDE_TABEL;

    if (!resource || !table) {
      context.res = { status: 500, body: { error: 'Mangler COREDATA_URL eller COREDATA_KUNDE_TABEL app setting' } };
      return;
    }

    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      context.res = { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: { kunder: [] } };
      return;
    }

    const token = await getToken(resource);

    const filter =
      `cr1eb_lch_aktiv eq true and (` +
      `contains(cr1eb_lch_navn,'${esc(q)}') or ` +
      `contains(cr1eb_lch_kundenr,'${esc(q)}')` +
      `)`;

    const url =
      `${resource}/api/data/v9.2/${table}` +
      `?$select=cr1eb_lch_kundeid,cr1eb_lch_kundenr,cr1eb_lch_navn,cr1eb_lch_omraade` +
      `&$filter=${encodeURIComponent(filter)}` +
      `&$orderby=cr1eb_lch_navn asc&$top=20`;

    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      }
    });

    const data = await r.json();
    if (!r.ok) {
      context.log.error(data);
      context.res = { status: r.status, body: { error: data?.error?.message || 'Fejl fra Dataverse (coredata)' } };
      return;
    }

    const kunder = (data.value || []).map(k => ({
      id: k.cr1eb_lch_kundeid,
      kundenr: k.cr1eb_lch_kundenr || '',
      navn: k.cr1eb_lch_navn || '',
      omraade: k.cr1eb_lch_omraade || ''
    }));

    context.res = { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: { kunder } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: err.message } };
  }
};
