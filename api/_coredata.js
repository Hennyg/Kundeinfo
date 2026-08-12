// /api/_coredata.js
//
// Fetch-helper mod HerrupPortalen-miljøet (hvor cr175_lch_kundeinfo_*-
// tabellerne bor), som er et ANDET Dataverse-miljø end Kundeinfos eget
// (crcc8_lch_*, styret af _dataverse.js/DV_RESOURCE_URL).
//
// Bruger sin EGEN app-registrering til HerrupPortal (HerrupPortal_ClientID /
// HerrupPortal_ClientSecret), da Kundeinfos egen app-registrering (DV_CLIENT_ID)
// ikke er medlem af HerrupPortal-miljøet. Deler stadig samme tenant
// (DV_TENANT_ID), med DV_HerrupPortal_URL som "resource".

const API_VER = "v9.2";

function getResource() {
  return process.env.DV_HerrupPortal_URL || process.env.DV_URL || process.env.COREDATA_URL;
}

async function getCoredataToken() {
  const tenant = process.env.DV_TENANT_ID;
  const clientId = process.env.HerrupPortal_ClientID;
  const clientSecret = process.env.HerrupPortal_ClientSecret;
  const resource = getResource();

  if (!tenant || !clientId || !clientSecret || !resource) {
    throw new Error("Mangler DV_TENANT_ID, HerrupPortal_ClientID, HerrupPortal_ClientSecret eller DV_HerrupPortal_URL app setting");
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
