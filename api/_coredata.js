// /api/_coredata.js
//
// Fetch-helper mod HerrupPortalen-miljøet (hvor cr175_lch_kundeinfo_*-
// tabellerne bor), som er et ANDET Dataverse-miljø end Kundeinfos eget
// (crcc8_lch_*, styret af _dataverse.js/DV_RESOURCE_URL).
//
// Genbruger samme Entra-app-registrering som resten af Kundeinfo
// (DV_TENANT_ID / DV_CLIENT_ID / DV_CLIENT_SECRET), med DV_HerrupPortal_URL
// som "resource" (HerrupPortalens Dataverse-URL). Falder tilbage til
// DV_URL / COREDATA_URL, hvis DV_HerrupPortal_URL ikke er sat.

const API_VER = "v9.2";

function getResource() {
  return process.env.DV_HerrupPortal_URL || process.env.DV_URL || process.env.COREDATA_URL;
}

async function getCoredataToken() {
  const tenant = process.env.DV_TENANT_ID;
  const clientId = process.env.DV_CLIENT_ID;
  const clientSecret = process.env.DV_CLIENT_SECRET;
  const resource = getResource();

  if (!tenant || !clientId || !clientSecret || !resource) {
    throw new Error("Mangler DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET eller DV_HerrupPortal_URL app setting");
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

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`coredata_token_error ${r.status}: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function cdFetch(path, init = {}) {
  const resource = getResource();
  const token = await getCoredataToken();

  const url = `${resource}/api/data/${API_VER}/${path.replace(/^\//, "")}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    ...(init.headers || {})
  };

  const r = await fetch(url, { ...init, headers });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Coredata ${init.method || "GET"} ${path}: ${r.status} ${txt}`);
  }
  return r;
}

module.exports = { cdFetch, getCoredataToken };
