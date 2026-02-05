// /api/_dataverse.js
const API_VER = process.env.DV_API_VER || 'v9.2';
const TENANT = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const RESOURCE = process.env.DV_RESOURCE_URL; // fx https://org.crm4.dynamics.com

async function getToken() {
  const url = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: `${RESOURCE}/.default`
  });
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!r.ok) throw new Error(`AAD token error: ${r.status} ${await r.text()}`);
  return r.json();
}

async function dvFetch(path, init = {}) {
  const { access_token } = await getToken();
  const url = `${RESOURCE}/api/data/${API_VER}/${path}`;
  const headers = {
    Authorization: `Bearer ${access_token}`,
    Accept: 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    ...(init.headers || {})
  };
  const r = await fetch(url, { ...init, headers });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`DV ${init.method || 'GET'} ${path}: ${r.status} ${txt}`);
  }
  return r;
}

module.exports = { dvFetch };
