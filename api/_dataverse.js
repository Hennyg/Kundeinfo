// _dataverse.js
const fetch = require("node-fetch"); // i Functions v4 kan du bruge global fetch, men node-fetch er fint
const qs = require("querystring");

const tenantId = process.env.DV_TENANT_ID;
const clientId = process.env.DV_CLIENT_ID;
const clientSecret = process.env.DV_CLIENT_SECRET;
const resourceUrl = process.env.DV_RESOURCE_URL; // fx https://orgxxxx.crm4.dynamics.com
const apiVersion = process.env.DV_API_VER || "v9.2";

// OAuth2 client credentials flow til Dataverse: scope = <org>/.default
async function getToken() {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = qs.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${resourceUrl}/.default`,
    grant_type: "client_credentials"
  });
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) throw new Error(`Token error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

async function dvFetch(path, options = {}) {
  const token = await getToken();
  const url = `${resourceUrl}/api/data/${apiVersion}${path}`;
  const r = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      ...(options.headers || {})
    }
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Dataverse ${r.status}: ${t}`);
  }
  // returnér både raw og json når muligt
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await r.json();
  return await r.text();
}

module.exports = { dvFetch };
