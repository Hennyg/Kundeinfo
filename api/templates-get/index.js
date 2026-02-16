// /api/templates-get/index.js
const { dvFetch } = require("../_dataverse");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

module.exports = async function (context, req) {
  try {

    const path =
      `crcc8_lch_surveytemplates` +
      `?$select=crcc8_lch_surveytemplateid,crcc8_lch_name,crcc8_lch_isactive` +
      `&$filter=crcc8_lch_isactive eq true` +
      `&$orderby=crcc8_lch_name asc`;

    const res = await dvFetch(path);

    if (!res.ok) {
      const t = await res.text();
      return json(context, res.status, { error: "template_read_failed", detail: t });
    }

    const data = await res.json();

    const out = (data.value || []).map(t => ({
      id: t.crcc8_lch_surveytemplateid,
      name: t.crcc8_lch_name
    }));

    return json(context, 200, out);

  } catch (e) {
    context.log("templates-get failed", e);
    return json(context, 500, { error: "server_error", detail: String(e?.message || e) });
  }
};
