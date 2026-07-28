function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function getAzureClientSecret() {
  // I Azure Static Web Apps indeholder denne variabel navnet på den
  // Application Setting, hvor selve client secret-værdien ligger.
  const secretSettingName = String(
    process.env.AZURE_CLIENT_SECRET_APP_SETTING_NAME || ""
  ).trim();

  if (!secretSettingName) return "";

  return String(process.env[secretSettingName] || "").trim();
}

const tokenCache = new Map();

async function getAccessToken(
  scope = "https://graph.microsoft.com/.default"
) {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);

  if (cached?.token && cached.expiresAt - 60 > now) {
    return cached.token;
  }

  // Brug den appregistrering, som SWA-login allerede er sat op med.
  const tenantId = firstEnv(
    "AZURE_TENANT_ID",
    "DV_TENANT_ID",
    "TENANT_ID"
  );

  const clientId = firstEnv(
    "AZURE_CLIENT_ID"
  );

  const clientSecret = getAzureClientSecret();

  if (!tenantId) {
    throw new Error(
      "Mangler tenant-id. Angiv AZURE_TENANT_ID eller DV_TENANT_ID."
    );
  }

  if (!clientId) {
    throw new Error(
      "Mangler AZURE_CLIENT_ID."
    );
  }

  if (!clientSecret) {
    const settingName = String(
      process.env.AZURE_CLIENT_SECRET_APP_SETTING_NAME || ""
    ).trim();

    throw new Error(
      settingName
        ? `AZURE_CLIENT_SECRET_APP_SETTING_NAME peger på '${settingName}', men denne Application Setting findes ikke eller er tom.`
        : "Mangler AZURE_CLIENT_SECRET_APP_SETTING_NAME."
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(
      tenantId
    )}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    throw new Error(
      `Graph token-fejl ${response.status}: ${JSON.stringify(data)}`
    );
  }

  tokenCache.set(scope, {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in || 300)
  });

  return data.access_token;
}

module.exports = {
  getAccessToken
};
