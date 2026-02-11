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
    const skip = Math.max(parseInt(req.query.skip || "0", 10), 0);

    // Hent surveys (seneste først)
    // Tabellens EntitySetName: crcc8_lch_surveyinstances (matcher din kode i survey-create)
    // Kolonner fra dit screenshot:
    // - crcc8_lch_code
    // - crcc8_expiresat
    // - crcc8_templateversion
    // - crcc8_token
    // - crcc8_status
    // - createdon (standard)
    const url =
      `crcc8_lch_surveyinstances` +
      `?$select=crcc8_lch_surveyinstanceid,crcc8_lch_code,crcc8_expiresat,crcc8_templateversion,crcc8_token,crcc8_status,createdon` +
      `&$orderby=createdon desc` +
      `&$top=${top}` +
      `&$skip=${skip}`;

    const r = await dvFetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        // giver labels til choice-felter (fx status) hvis du vil vise dem pænt i UI
        "Prefer": 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
      }
    });

    if (!r.ok) {
      return json(context, r.status, { error: "dv_list_failed", detail: await r.text() });
    }

    const data = await r.json();

    // Tip: hvis du ikke vil sende token ud til UI (sikkerhed), så fjern det her:
    // (Jeg anbefaler faktisk at vi IKKE viser token i oversigten.)
    (data.value || []).forEach(x => { delete x.crcc8_token; });

    return json(context, 200, data);

  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", detail: err.message });
  }
};
