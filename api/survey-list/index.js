// /api/survey-list/index.js
const { cdFetch: dvFetch } = require('../_coredata');
const { getStatusValues } = require('../_kundeundersoegelseStatus');

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function escODataString(s) {
  return String(s ?? "").replace(/'/g, "''");
}

module.exports = async function (context, req) {
  try {
    const top = Math.min(Math.max(parseInt(req.query.top || "50", 10), 1), 500);
    const kundenummer = String(req.query.kundenummer || "").trim();

    const filterPart = kundenummer
      ? `&$filter=${encodeURIComponent(`cr175_lch_kundenummer eq '${escODataString(kundenummer)}'`)}`
      : "";

    const url =
      `cr175_lch_kundeinfo_kundeundersoegelses` +
      `?$select=cr175_lch_kundeinfo_kundeundersoegelseid,cr175_lch_kundenavn,cr175_lch_kundenummer,cr175_lch_kode,cr175_lch_udloebstidspunkt,cr175_lch_status,createdon` +
      `&$orderby=createdon desc` +
      filterPart +
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

    // Berig hver række med en simpel boolean "afsluttet", så frontend ikke
    // selv skal kende de rå status-heltal (der afhænger af Dataverse-metadata).
    const status = await getStatusValues().catch(() => ({ AFSLUTTET: null }));

    // "Sidst rettet" skal afspejle hvornår kunden sidst gemte et svar - det
    // ligger på selve svar-rækkerne (cr175_lch_kundeinfo_spoergeskemasvar),
    // IKKE på instansens egen modifiedon. Instansens modifiedon opdateres
    // kun når status faktisk ÆNDRER værdi (fx Afventer -> Startet) - gemmer
    // kunden bare flere rettelser bagefter uden statusskift, rører det ikke
    // instansen, og modifiedon der ville stå og vise en for gammel dato.
    const instanceIds = (data.value || [])
      .map(r => r.cr175_lch_kundeinfo_kundeundersoegelseid)
      .filter(Boolean);

    const lastAnsweredMap = {};
    if (instanceIds.length) {
      try {
        const svarUrl =
          `cr175_lch_kundeinfo_spoergeskemasvars?$select=_cr175_lch_kundeundersoegelse_value,modifiedon` +
          `&$filter=${encodeURIComponent(`_cr175_lch_kundeundersoegelse_value in (${instanceIds.join(",")})`)}` +
          `&$top=5000`;

        const svarRes = await dvFetch(svarUrl, {
          method: "GET",
          headers: { Accept: "application/json" }
        });

        if (svarRes.ok) {
          const svarData = await svarRes.json();
          for (const row of (svarData.value || [])) {
            const key = row._cr175_lch_kundeundersoegelse_value;
            const modified = row.modifiedon;
            if (!key || !modified) continue;
            if (!lastAnsweredMap[key] || modified > lastAnsweredMap[key]) {
              lastAnsweredMap[key] = modified;
            }
          }
        } else {
          context.log("survey-list: kunne ikke hente svar-tabellens modifiedon", svarRes.status);
        }
      } catch (e) {
        context.log("survey-list: fejl ved opslag af sidst rettet:", e.message);
      }
    }

    if (Array.isArray(data?.value)) {
      data.value = data.value.map(row => ({
        ...row,
        afsluttet: status.AFSLUTTET != null
          ? Number(row.cr175_lch_status) === status.AFSLUTTET
          : null, // ukendt – status-metadata kunne ikke slås op
        sidstRettet: lastAnsweredMap[row.cr175_lch_kundeinfo_kundeundersoegelseid] || null
      }));
    }

    return json(context, 200, data);

  } catch (err) {
    context.log.error("survey-list server error:", err);
    return json(context, 500, { error: "server_error", detail: err.message, stack: String(err.stack || "") });
  }
};
