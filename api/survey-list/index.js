
// /api/survey-list/index.js
const { dvFetch } = require('../_dataverse');

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

    // VIGTIGT: ingen $skip i Dataverse/CRM her
    const url =
      `crcc8_lch_surveyinstances` +
      `?$select=crcc8_lch_surveyinstanceid,crcc8_lch_code,crcc8_expiresat,crcc8_templateversion,crcc8_status,createdon` +
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

    const text = await r.text(); // læs altid body som tekst først (nem fejlfinding)

    if (!r.ok) {
      context.log("survey-list DV error:", r.status, text);
      return json(context, r.status, { error: "dv_list_failed", status: r.status, detail: text });
    }

    // parse JSON først efter ok
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
