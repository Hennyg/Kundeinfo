function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

const tokenCache = new Map();

async function getAccessToken(scope = "https://graph.microsoft.com/.default") {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);

  if (cached?.token && cached.expiresAt - 60 > now) {
    return cached.token;
  }

  // Understøtter både Kontakter-appens navne og Kundeinfo-appens eksisterende DV-navne.
  const tenantId = firstEnv("GRAPH_TENANT_ID", "TENANT_ID", "DV_TENANT_ID");
  const clientId = firstEnv("GRAPH_CLIENT_ID", "CLIENT_ID", "DV_CLIENT_ID");
  const clientSecret = firstEnv("GRAPH_CLIENT_SECRET", "CLIENT_SECRET", "DV_CLIENT_SECRET");

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Mangler Graph-login. Angiv GRAPH_TENANT_ID/GRAPH_CLIENT_ID/GRAPH_CLIENT_SECRET " +
      "eller TENANT_ID/CLIENT_ID/CLIENT_SECRET."
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Graph token-fejl ${response.status}: ${JSON.stringify(data)}`);
  }

  tokenCache.set(scope, {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in || 300)
  });

  return data.access_token;
}

module.exports = { getAccessToken };
