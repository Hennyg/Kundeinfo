// /api/_uniconta.js
const DEFAULT_BASE_URL = "https://odata.uniconta.com/odata";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Mangler app setting: ${name}`);
  return value;
}

function getConfig() {
  return {
    companyId: required("UNICONTA_COMPANY_ID"),
    username: required("UNICONTA_USERNAME"),
    password: required("UNICONTA_PASSWORD"),
    baseUrl: String(process.env.UNICONTA_ODATA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "")
  };
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

async function unicontaFetch(pathOrUrl, init = {}) {
  const cfg = getConfig();
  const url = /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : `${cfg.baseUrl}/${encodeURIComponent(cfg.companyId)}/${String(pathOrUrl).replace(/^\//, "")}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: basicAuth(cfg.username, cfg.password),
      Accept: "application/json",
      ...(init.headers || {})
    },
    signal: init.signal || AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Uniconta OData fejl ${response.status}: ${text.slice(0, 1200)}`);
  }
  return response;
}

function pick(row, ...names) {
  for (const name of names) {
    if (row?.[name] !== undefined && row?.[name] !== null) return row[name];
  }
  return "";
}

function normalizeDebtor(row) {
  return {
    account: String(pick(row, "Account", "account")),
    name: String(pick(row, "Name", "name")),
    address1: String(pick(row, "Address1", "Address", "address1")),
    address2: String(pick(row, "Address2", "address2")),
    zipCode: String(pick(row, "ZipCode", "Zip", "zipCode")),
    city: String(pick(row, "City", "city")),
    country: String(pick(row, "Country", "CountryName", "country")),
    phone: String(pick(row, "Phone", "Phone1", "phone")),
    mobile: String(pick(row, "Mobile", "CellPhone", "mobile")),
    email: String(pick(row, "ContactEmail", "Email", "email")),
    contactPerson: String(pick(row, "ContactPerson", "ContactName", "contactPerson")),
    vatNumber: String(pick(row, "VATNumber", "VatNumber", "CVR", "vatNumber")),
    currency: String(pick(row, "Currency", "CurrencyCode", "currency")),
    payment: String(pick(row, "Payment", "PaymentMethod", "payment")),
    blocked: Boolean(pick(row, "Blocked", "IsBlocked", "blocked")),
    raw: row
  };
}

module.exports = { unicontaFetch, normalizeDebtor };
