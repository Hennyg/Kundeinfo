// /api/survey-list/index.js
const { dvFetch } = require('../_dataverse');

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

async function resolveEntitySet(logicalName) {
  // EntityDefinitions?$select=LogicalName,EntitySetName&$filter=LogicalName eq 'xxx'
  const metaUrl =
    `EntityDefinitions?$select=LogicalName,EntitySetName&$filter=LogicalName eq '${logicalName}'`;

  const r = await dvFetch(metaUrl, {
    method: "GET",
    headers: { "Accept": "application/json" }
  });
  if (!r.ok) throw new Error(`Metadata lookup failed: ${r.status} ${await r.text()}`);

  const data = await r.json();
  const row = (data.value || [])[0];
  if (!row?.EntitySetName) throw new Error(`No EntitySetName for ${logicalName}`);
  return row.EntitySetName;
}

module.exports = async function (context, req) {
  try {
    const top = Math.min(Math.max(parseInt(req.query.top || "50", 10), 1), 500);
    const skip = Math.max(parseInt(req.query.skip || "0", 10), 0);

    // Din tabel (logical name) – hvis den hedder noget andet, ret her:
    const logicalName = "crcc8_lch_surveyinstance";
    const entitySet = await resolveEntitySet(logicalName);

    const url =
      `${entitySet}` +
      `?$select=crcc8_lch_surveyinstanceid,crcc8_lch_code,crcc8_expiresat,crcc8_templateversion,crcc8_status,createdon` +
      `&$orderby=createdon desc` +
      `&$top=${top}` +
      `&$skip=${skip}`;

    const r = await dvFetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Prefer": 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
      }
    });

    if (!r.ok) {
      return json(context, r.status, { error: "dv_list_failed", detail: await r.text(), entitySet });
    }

    const data = await r.json();
    return json(context, 200, data);

  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", detail: err.message });
  }
};
