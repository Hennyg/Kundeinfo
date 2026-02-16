// /api/templates-get/index.js
const { dvFetch } = require("../_dataverse");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json; charset=utf-8" }, body };
}

module.exports = async function (context, req) {
  try {
    const path =
      `crcc8_lch_surveytemplates` +
      `?$select=crcc8_lch_surveytemplateid,crcc8_lch_name,crcc8_lch_isactive,crcc8_lch_description` +
      `&$orderby=crcc8_lch_name asc`;

    const res = await dvFetch(path);
    if (!res.ok) return json(context, res.status, { error: "read_failed", detail: await res.text() });

    const data = await res.json();
    const out = (data.value || [])
      .filter(t => t.crcc8_lch_isactive !== false) // hvis null => med
      .map(t => ({
        id: t.crcc8_lch_surveytemplateid,
        name: t.crcc8_lch_name,
        description: t.crcc8_lch_description || ""
      }));

    return json(context, 200, out);
  } catch (e) {
    context.log("templates-get failed", e);
    return json(context, 500, { error: "server_error", detail: String(e?.message || e) });
  }
};
