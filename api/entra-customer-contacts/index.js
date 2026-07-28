const { graph } = require("../_graph/graph");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeCustomerNumber(value) {
  return text(value).replace(/\s+/g, "").toLowerCase();
}

function customerNumberVariants(value) {
  const original = normalizeCustomerNumber(value);
  const variants = new Set([original]);

  // Samme tolerance som ved Uniconta-opslag: 008000... kan også stå som 8000...
  if (original.startsWith("00")) variants.add(original.slice(2));
  return variants;
}

function firstEmail(user) {
  return (
    text(user.mail) ||
    text(Array.isArray(user.otherMails) ? user.otherMails[0] : "") ||
    text(user.userPrincipalName)
  );
}

function firstBusinessPhone(user) {
  return text(Array.isArray(user.businessPhones) ? user.businessPhones[0] : "");
}

function cleanOwnerMarker(value) {
  return text(value).replace(/\s*\(ejer\)\s*$/i, "").trim();
}

function isOwner(user) {
  return /\(ejer\)\s*$/i.test(text(user.surname));
}

function mapUser(user) {
  const givenName = text(user.givenName);
  const surname = cleanOwnerMarker(user.surname);
  const fallbackName = [givenName, surname].filter(Boolean).join(" ");

  let displayName = text(user.displayName).replace(/\s*\(ejer\)\s*$/i, "").trim();
  if (!displayName) displayName = fallbackName || firstEmail(user) || "(uden navn)";

  return {
    id: text(user.id),
    displayName,
    givenName,
    surname,
    email: firstEmail(user),
    mobilePhone: text(user.mobilePhone),
    businessPhone: firstBusinessPhone(user),
    jobTitle: text(user.jobTitle),
    customerNumber: text(user.companyName),
    department: text(user.department),
    userType: text(user.userType)
  };
}

function nextPath(nextLink) {
  if (!nextLink) return null;
  const prefix = "https://graph.microsoft.com/v1.0";
  return nextLink.startsWith(prefix) ? nextLink.slice(prefix.length) : nextLink;
}

module.exports = async function (context, req) {
  try {
    const customerNumber = text(req.query?.kundenr);
    if (!customerNumber) {
      return json(context, 400, {
        error: "missing_customer_number",
        message: "Mangler kundenr."
      });
    }

    const acceptedNumbers = customerNumberVariants(customerNumber);
    const select = [
      "id",
      "displayName",
      "givenName",
      "surname",
      "mail",
      "otherMails",
      "userPrincipalName",
      "userType",
      "companyName",
      "department",
      "jobTitle",
      "mobilePhone",
      "businessPhones"
    ].join(",");

    let path = `/users?$top=999&$select=${encodeURIComponent(select)}`;
    const matched = [];

    for (let guard = 0; guard < 50 && path; guard++) {
      const page = await graph("GET", path);

      for (const user of page?.value || []) {
        if (text(user.userType).toLowerCase() !== "guest") continue;

        const entraCustomerNumber = normalizeCustomerNumber(user.companyName);
        if (!acceptedNumbers.has(entraCustomerNumber)) continue;

        matched.push(user);
      }

      path = nextPath(page?.["@odata.nextLink"]);
    }

    const owners = matched
      .filter(isOwner)
      .map(mapUser)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "da"));

    const employees = matched
      .filter(user => !isOwner(user))
      .map(mapUser)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "da"));

    return json(context, 200, {
      customerNumber,
      owners,
      employees,
      count: owners.length + employees.length
    });
  } catch (error) {
    context.log.error("entra-customer-contacts failed", error);
    return json(context, error.status || 500, {
      error: "entra_customer_contacts_failed",
      message: error.message || String(error),
      details: error.data || null
    });
  }
};
