// /api/employees-search/index.js
//
// GET ?q=<tekst>
// Søger i medarbejderne i Entra ID (til "Evt. andre modtagere" i
// opsummeringsvinduet på kundesurvey.html). Matcher starten af navn,
// fornavn, efternavn eller mail. Kun aktive brugere med en @lcherrup.dk-
// mailadresse - så kunderne (gæstebrugere med kundenr i companyName) ikke
// kommer med.
//
// Bruger samme Graph-app som resten af Kundeinfo (_graph/graph.js), som i
// forvejen slår brugere op (User.Read.All).

const { graph } = require("../_graph/graph");

const DOMAIN = "@lcherrup.dk";
const MAX_RESULTS = 15;

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json; charset=utf-8" }, body };
}

function escOData(s) {
  return String(s ?? "").replace(/'/g, "''");
}

module.exports = async function (context, req) {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return json(context, 200, { users: [] });

    const e = escOData(q);
    const filter = [
      `startswith(displayName,'${e}')`,
      `startswith(givenName,'${e}')`,
      `startswith(surname,'${e}')`,
      `startswith(mail,'${e}')`
    ].join(" or ");

    const data = await graph(
      "GET",
      `/users?$filter=${encodeURIComponent(filter)}` +
      `&$select=displayName,mail,userPrincipalName,jobTitle,department,accountEnabled,userType&$top=50`
    );

    const users = (data?.value || [])
      .filter(u => u.accountEnabled !== false && u.userType !== "Guest")
      .map(u => ({
        displayName: u.displayName || "",
        mail: String(u.mail || "").trim(),
        jobTitle: u.jobTitle || "",
        department: u.department || ""
      }))
      .filter(u => u.mail.toLowerCase().endsWith(DOMAIN))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "da"))
      .slice(0, MAX_RESULTS);

    return json(context, 200, { users });
  } catch (err) {
    context.log.error("employees-search failed:", err?.data || err);
    return json(context, err?.status === 403 ? 403 : 500, {
      error: "server_error",
      message: err?.status === 403
        ? "Graph-appen mangler rettigheden User.Read.All til at søge i medarbejdere."
        : (err.message || String(err))
    });
  }
};
