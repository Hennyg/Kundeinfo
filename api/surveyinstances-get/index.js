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
    const top = Math.min(parseInt(req.query?.top || "200", 10) || 200, 2000);

    const path =
      `crcc8_lch_surveyinstances` +
      `?$select=` +
        `crcc8_lch_surveyinstanceid,crcc8_lch_code,crcc8_lch_customername,crcc8_expiresat,crcc8_status,createdon,_crcc8_lch_surveytemplate_value` +
      `&$orderby=createdon desc` +
      `&$top=${top}`;

    const res = await dvFetch(path, {
      headers: {
        // giver os bl.a. @OData...FormattedValue i svaret
        "Prefer": 'odata.include-annotations="*"'
      }
    });

    if (!res.ok) {
      return json(context, res.status, { error: "read_failed", detail: await res.text() });
    }

    const data = await res.json();
    return json(context, 200, data);
  } catch (e) {
    return json(context, 500, { error: "server_error", detail: String(e?.message || e) });
  }
};
