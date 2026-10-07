// /api/survey-items-update/index.js
//
// Opdaterer prefill-værdien på en eksisterende kundeundersøgelses
// spørgeskemasvar-rækker. Findes rækken allerede (samme spørgsmål + repeatIndex)
// -> PATCH. Findes den ikke (ny gentagelse tilføjet i admin) -> POST ny række.
//
// Rører IKKE kundens eget indtastede svar (cr175_lch_svarvaerdi) – kun
// cr175_lch_prefillvaerdi.

const { cdFetch: dvFetch } = require("../_coredata");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function normalizeGuid(v) {
  return String(v || "").trim().toLowerCase().replace(/[{}]/g, "");
}

module.exports = async function (context, req) {
  try {
    const instanceId = String(req.body?.instanceId || "").trim();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const sendtTilRaw = req.body?.sendtTil;
    const sendtTil = sendtTilRaw === undefined ? undefined : (String(sendtTilRaw || "").trim() || null);
    const sendtTilMobilRaw = req.body?.sendtTilMobil;
    const sendtTilMobil = sendtTilMobilRaw === undefined ? undefined : (String(sendtTilMobilRaw || "").trim() || null);

    if (!instanceId || (!items.length && sendtTil === undefined && sendtTilMobil === undefined)) {
      return json(context, 400, { error: "missing_data", message: "Mangler instanceId eller items." });
    }

    // "Brug email"- og "Brug mobil"-felterne (cr175_lch_sendttil /
    // cr175_lch_sendttilmobil) er ikke spørgeskemasvar-rækker, men hører til
    // selve kundeundersøgelse-instansen - opdateres derfor separat, kun med
    // de felter der reelt er sendt med.
    const instancePatch = {};
    if (sendtTil !== undefined) instancePatch.cr175_lch_sendttil = sendtTil;
    if (sendtTilMobil !== undefined) instancePatch.cr175_lch_sendttilmobil = sendtTilMobil;
    if (Object.keys(instancePatch).length) {
      await dvFetch(`cr175_lch_kundeinfo_kundeundersoegelses(${instanceId})`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(instancePatch)
      });
    }

    if (!items.length) {
      return json(context, 200, { ok: true, updated: 0, created: 0 });
    }

    const existingRes = await dvFetch(
      `cr175_lch_kundeinfo_spoergeskemasvars` +
      `?$select=cr175_lch_kundeinfo_spoergeskemasvarid,cr175_lch_gentagelsesindeks,_cr175_lch_spoergsmaal_value` +
      `&$filter=${encodeURIComponent(`_cr175_lch_kundeundersoegelse_value eq ${instanceId}`)}&$top=5000`
    );
    const existingData = await existingRes.json();

    const existingMap = new Map();
    for (const r of (existingData.value || [])) {
      const key = `${normalizeGuid(r._cr175_lch_spoergsmaal_value)}|${Number(r.cr175_lch_gentagelsesindeks ?? 0)}`;
      existingMap.set(key, r.cr175_lch_kundeinfo_spoergeskemasvarid);
    }

    let updated = 0, created = 0, codeSuffix = existingData.value?.length || 0;

    for (const it of items) {
      const questionId = normalizeGuid(it?.questionId);
      const repeatIndex = Number.parseInt(it?.repeatIndex ?? 0, 10) || 0;
      const prefillText = String(it?.prefillText || "").trim() || null;
      if (!questionId) continue;

      const key = `${questionId}|${repeatIndex}`;
      const existingId = existingMap.get(key);

      if (existingId) {
        await dvFetch(`cr175_lch_kundeinfo_spoergeskemasvars(${existingId})`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ cr175_lch_prefillvaerdi: prefillText })
        });
        updated++;
      } else {
        codeSuffix++;
        await dvFetch(`cr175_lch_kundeinfo_spoergeskemasvars`, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            cr175_lch_unik: `SVAR-${instanceId.slice(0, 8)}-${codeSuffix}`,
            cr175_lch_prefillvaerdi: prefillText,
            cr175_lch_gentagelsesindeks: repeatIndex,
            "cr175_lch_kundeundersoegelse@odata.bind": `/cr175_lch_kundeinfo_kundeundersoegelses(${instanceId})`,
            "cr175_lch_spoergsmaal@odata.bind": `/cr175_lch_kundeinfo_spoergsmaals(${questionId})`
          })
        });
        created++;
      }
    }

    return json(context, 200, { ok: true, updated, created });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
