// /api/survey-list/index.js
const { cdFetch: dvFetch } = require('../_coredata');

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

module.exports = async function (context, req) {
  try {
    const top = Math.min(Math.max(parseInt(req.query.top || "50", 10), 1), 500);

    const url =
      `cr175_lch_kundeinfo_kundeundersoegelses` +
      `?$select=cr175_lch_kundeinfo_kundeundersoegelseid,cr175_lch_kundenavn,cr175_lch_kode,cr175_lch_udloebstidspunkt,cr175_lch_status,createdon` +
      `&$orderby=createdon desc` +
      `&$top=${top}`;

    context.log("survey-list url:", url);

    const r = await dvFetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Prefer": 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
      }
    });

    const text = await r.text();

    if (!r.ok) {
      context.log("survey-list DV error:", r.status, text);
      return json(context, r.status, { error: "dv_list_failed", status: r.status, detail: text });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json(context, 500, { error: "invalid_json_from_dv", detail: text });
    }

    return json(context, 200, data);

  } catch (err) {
    context.log.error("survey-list server error:", err);
    return json(context, 500, { error: "server_error", detail: err.message, stack: String(err.stack || "") });
  }
};
