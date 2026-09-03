// /api/_kundeAdresser.js
//
// Fælles logik til at hente en kundes adresser + registrerede produkter pr.
// adresse fra coredata-tabellerne (samme data som kundeliste-appen).
// Bruges af BÅDE /api/kunde-adresser (Kundeliste-tile på admincreate.html)
// OG /api/survey-start (Leveringsadresse-blokke på kundesurvey.html) - de
// var tidligere to næsten-ens, men uafhængigt vedligeholdte kopier af samme
// logik, hvilket fik dem til at glide fra hinanden (kundesurvey.html viste
// ingen produkter, selvom admincreate.html gjorde). Nu er der kun ét sted
// at rette, hvis noget skal ændres.
//
// Kræver disse app settings på SWA'en:
//   COREDATA_URL          fx https://org.crm4.dynamics.com
//   COREDATA_KUNDE_TABEL  fx cr1eb_lch_kundes
//   DV_TENANT_ID / DV_CLIENT_ID / DV_CLIENT_SECRET

const fetch = globalThis.fetch;

const ADRESSE_TABLE = "cr1eb_lch_kundeadresses";
const PRODUKT_TABLE = "cr1eb_lch_kundeprodukts";

function esc(s) {
  return String(s || "").replace(/'/g, "''");
}

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
    adressekey: r.cr1eb_lch_adressekey || "",
    adresse: r.cr1eb_lch_adresse || "",
    postnr: r.cr1eb_lch_postnr || "",
    by: r.cr1eb_lch_by || "",
    omraade: r.cr1eb_lch_omraade || "",
    aktiv: r.cr1eb_lch_aktiv ?? true
  };
}

// Henter { kunde, adresser } for et kundenummer. Kaster en fejl hvis
// app settings mangler eller kunden ikke findes - kalderen beslutter selv
// om det skal give en fejlside (kunde-adresser) eller bare stille springes
// over (survey-start, hvor produktinfo blot er "nice to have").
async function getKundeAdresserMedProdukter(kundenr) {
  const resource = process.env.COREDATA_URL;
  const table = process.env.COREDATA_KUNDE_TABEL;

  if (!resource || !table) {
    throw new Error("Mangler COREDATA_URL eller COREDATA_KUNDE_TABEL app setting");
  }
  if (!kundenr) {
    throw new Error("Mangler kundenr");
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
    const e = new Error("Kunde ikke fundet");
    e.status = 404;
    throw e;
  }

  const kundeId = kunde.cr1eb_lch_kundeid;
  const adresseFilter = `_cr1eb_lch_kunde_value eq '${kundeId}'`;
  const adresseSelect =
    "cr1eb_lch_kundeadresseid,cr1eb_lch_adressekey,cr1eb_lch_adresse,cr1eb_lch_postnr,cr1eb_lch_by,cr1eb_lch_omraade,cr1eb_lch_aktiv";

  const adresserRaw = await dvFetchAll(
    resource,
    token,
    `${ADRESSE_TABLE}?$select=${adresseSelect}&$filter=${encodeURIComponent(adresseFilter)}&$orderby=cr1eb_lch_adresse asc&$top=5000`
  );

  // Ingen aktiv-filter i selve OData-kaldet: feltet er ofte null for
  // eksisterende produkter, og skal tolkes som aktivt medmindre det
  // eksplicit er sat til false.
  const produktFilter = `cr1eb_lch_kundenr eq '${esc(kunde.cr1eb_lch_kundenr || kundenr)}'`;
  const produktSelect = "cr1eb_lch_adressekey,cr1eb_lch_produkt,cr1eb_lch_aktiv";

  const produkterRaw = await dvFetchAll(
    resource,
    token,
    `${PRODUKT_TABLE}?$select=${produktSelect}&$filter=${encodeURIComponent(produktFilter)}&$top=5000`
  );

  const countsByAddressKey = {};
  for (const p of produkterRaw) {
    const aktiv = p.cr1eb_lch_aktiv ?? true;
    if (!aktiv) continue;

    const key = p.cr1eb_lch_adressekey || "";
    const produkt = p.cr1eb_lch_produkt || "Ukendt";
    if (!countsByAddressKey[key]) countsByAddressKey[key] = {};
    countsByAddressKey[key][produkt] = (countsByAddressKey[key][produkt] || 0) + 1;
  }

  const adresser = adresserRaw.map(r => {
    const mapped = mapAdresse(r);
    const counts = countsByAddressKey[mapped.adressekey] || {};

    mapped.produkter = Object.entries(counts)
      .map(([produkt, antal]) => ({ produkt, antal }))
      .sort((a, b) => b.antal - a.antal || a.produkt.localeCompare(b.produkt, "da"));

    return mapped;
  });

  return {
    kunde: {
      id: kundeId,
      kundenr: kunde.cr1eb_lch_kundenr || "",
      navn: kunde.cr1eb_lch_navn || ""
    },
    adresser
  };
}

module.exports = { getKundeAdresserMedProdukter };
