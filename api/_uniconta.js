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

function pick(row, used, ...names) {
  for (const name of names) {
    if (row?.[name] !== undefined && row?.[name] !== null) {
      used.add(name.toLowerCase());
      return row[name];
    }
  }
  return "";
}

function normalizeDebtor(row) {
  const used = new Set();
  const p = (...names) => pick(row, used, ...names);

  return {
    account: String(p("Account", "account")),
    name: String(p("Name", "name")),
    address1: String(p("Address1", "Address", "address1")),
    address2: String(p("Address2", "address2")),
    zipCode: String(p("ZipCode", "Zip", "zipCode")),
    city: String(p("City", "city")),
    country: String(p("Country", "CountryName", "country")),
    phone: String(p("Phone", "Phone1", "phone")),
    mobile: String(p("Mobile", "CellPhone", "mobile")),
    email: String(p("ContactEmail", "Email", "email")),
    contactPerson: String(p("ContactPerson", "ContactName", "contactPerson")),
    vatNumber: String(p("VATNumber", "VatNumber", "CVR", "vatNumber")),
    currency: String(p("Currency", "CurrencyCode", "currency")),
    payment: String(p("Payment", "PaymentMethod", "payment")),
    blocked: Boolean(p("Blocked", "IsBlocked", "blocked")),
    // EAN-feltet indeholder GLN-nummeret. Bruges til at afgøre om kunden har
    // e-faktura (feltet udfyldt) og til selve GLN/EAN-teksten, jf.
    // fillPrefillFromUniconta() i admincreate.js.
    ean: String(p("EAN", "Ean")),
    raw: row,
    shownKeys: Array.from(used)
  };
}

module.exports = { unicontaFetch, normalizeDebtor };
