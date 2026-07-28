// api/_graph/auth.js

const tokenCache = new Map();

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();

  if (!value) {
    throw new Error(`Mangler Application Setting: ${name}.`);
  }

  return value;
}

async function getAccessToken(
  scope = "https://graph.microsoft.com/.default"
) {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);

  if (
    cached?.token &&
    Number(cached.expiresAt || 0) - 60 > now
  ) {
    return cached.token;
  }

  const tenantId = requiredEnv("DV_TENANT_ID");
  const clientId = requiredEnv("AZURE_CLIENT_ID");
  const clientSecret = requiredEnv("AZURE_CLIENT_SECRET");

  const tokenUrl =
    `https://login.microsoftonline.com/` +
    `${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok || !data.access_token) {
    throw new Error(
      `Microsoft Graph token-fejl ${response.status}: ` +
      JSON.stringify(data)
    );
  }

  tokenCache.set(scope, {
    token: data.access_token,
    expiresAt:
      now + Number(data.expires_in || 300)
  });

  return data.access_token;
}

async function getAppToken() {
  return getAccessToken();
}

module.exports = {
  getAccessToken,
  getAppToken
};
