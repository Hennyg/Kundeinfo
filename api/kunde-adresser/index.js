// /api/kunde-adresser/index.js
//
// Henter navn, kundenr og adresser for en kunde fra coredata-tabellerne
// (samme data som kundeliste-appens cr1eb_lch_kundes / cr1eb_lch_kundeadresses).
//
// Kræver disse app settings på SWA'en (samme som kunder-search bruger):
//   COREDATA_URL          fx https://org.crm4.dynamics.com
//   COREDATA_KUNDE_TABEL  fx cr1eb_lch_kundes
//
// Genbruger den samme Entra-app-registrering som resten af Kundeinfo
// (DV_TENANT_ID / DV_CLIENT_ID / DV_CLIENT_SECRET), med COREDATA_URL som
// "resource" – ligesom kunder-search.

const fetch = globalThis.fetch;

const ADRESSE_TABLE = "cr1eb_lch_kundeadresses";

function esc(s) { return String(s || "").replace(/'/g, "''"); }

async function getToken(resource) {
  const tenant = process.env.DV_TENANT_ID;
  const clientId = process.env.DV_CLIENT_ID;
  const clientSecret = process.env.DV_CLIENT_SECRET;

  if (!tenant || !clientId || !clientSecret || !resource) {
    throw new Error("Mangler DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET eller COREDATA_URL");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${resource}/.default`
  });

  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const j = await r.json();
  if (!r.ok) throw new Error(`token_error ${r.status}: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function dvGet(resource, token, path) {
  const url = `${resource}/api/data/v9.2/${path.replace(/^\//, "")}`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0"
    }
  });

  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!r.ok) {
    const msg = data?.error?.message || data?.message || text;
    const e = new Error(`dv_error ${r.status}: ${msg}`);
    e.status = r.status;
    throw e;
  }

  return data;
}

async function dvFetchAll(resource, token, path) {
  const baseUrl = `${resource}/api/data/v9.2/`;
  let rows = [];
  let next = path;

  while (next) {
    const data = await dvGet(resource, token, next);
    rows = rows.concat(data.value || []);
    const nl = data["@odata.nextLink"];
    next = nl && nl.startsWith(baseUrl) ? nl.slice(baseUrl.length) : null;
  }

  return rows;
}

function mapAdresse(r) {
  return {
    id: r.cr1eb_lch_kundeadresseid,
    adresse: r.cr1eb_lch_adresse || "",
    postnr: r.cr1eb_lch_postnr || "",
    by: r.cr1eb_lch_by || "",
    omraade: r.cr1eb_lch_omraade || "",
    aktiv: r.cr1eb_lch_aktiv ?? true
  };
}

module.exports = async function (context, req) {
  try {
    const resource = process.env.COREDATA_URL;
    const table = process.env.COREDATA_KUNDE_TABEL;

    if (!resource || !table) {
      context.res = { status: 500, body: { error: "Mangler COREDATA_URL eller COREDATA_KUNDE_TABEL app setting" } };
      return;
    }

    const kundenr = String(req.query.kundenr || "").trim();
    if (!kundenr) {
      context.res = { status: 400, body: { error: "Mangler kundenr" } };
      return;
    }

    const token = await getToken(resource);

    const kundeFilter = `cr1eb_lch_kundenr eq '${esc(kundenr)}'`;
    const kundeData = await dvGet(
      resource,
      token,
      `${table}?$select=cr1eb_lch_kundeid,cr1eb_lch_kundenr,cr1eb_lch_navn&$filter=${encodeURIComponent(kundeFilter)}&$top=1`
    );

    const kunde = (kundeData.value || [])[0];

    if (!kunde) {
      context.res = {
        status: 404,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: { error: "Kunde ikke fundet" }
      };
      return;
    }

    const kundeId = kunde.cr1eb_lch_kundeid;
    const adresseFilter = `_cr1eb_lch_kunde_value eq '${kundeId}'`;
    const select =
      "cr1eb_lch_kundeadresseid,cr1eb_lch_adresse,cr1eb_lch_postnr,cr1eb_lch_by,cr1eb_lch_omraade,cr1eb_lch_aktiv";

    const adresserRaw = await dvFetchAll(
      resource,
      token,
      `${ADRESSE_TABLE}?$select=${select}&$filter=${encodeURIComponent(adresseFilter)}&$orderby=cr1eb_lch_adresse asc&$top=5000`
    );

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: {
        kunde: {
          id: kundeId,
          kundenr: kunde.cr1eb_lch_kundenr || "",
          navn: kunde.cr1eb_lch_navn || ""
        },
        adresser: adresserRaw.map(mapAdresse)
      }
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: err.status || 500, body: { error: err.message } };
  }
};
