// /api/survey-instance-get/index.js
//
// Henter en eksisterende kundeundersøgelse + dens spørgeskemasvar-rækker
// (prefillværdi pr. spørgsmål/repeatIndex), så admincreate.html kan indlæse
// den til redigering.

const { cdFetch: dvFetch } = require("../_coredata");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

module.exports = async function (context, req) {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) {
      return json(context, 400, { error: "missing_id", message: "Mangler id." });
    }

    const instRes = await dvFetch(
      `cr175_lch_kundeinfo_kundeundersoegelses(${id})` +
      `?$select=cr175_lch_kundeinfo_kundeundersoegelseid,cr175_lch_kundenavn,cr175_lch_kundenummer,cr175_lch_kode,cr175_lch_status,cr175_lch_udloebstidspunkt`
    );
    const inst = await instRes.json();

    const rowsRes = await dvFetch(
      `cr175_lch_kundeinfo_spoergeskemasvars` +
      `?$select=cr175_lch_kundeinfo_spoergeskemasvarid,cr175_lch_prefillvaerdi,cr175_lch_gentagelsesindeks,_cr175_lch_spoergsmaal_value` +
      `&$filter=${encodeURIComponent(`_cr175_lch_kundeundersoegelse_value eq ${id}`)}&$top=5000`
    );
    const rowsData = await rowsRes.json();

    const items = (rowsData.value || []).map(r => ({
      itemId: r.cr175_lch_kundeinfo_spoergeskemasvarid,
      questionId: r._cr175_lch_spoergsmaal_value ? String(r._cr175_lch_spoergsmaal_value) : "",
      repeatIndex: Number(r.cr175_lch_gentagelsesindeks ?? 0),
      prefillText: r.cr175_lch_prefillvaerdi || ""
    }));

    return json(context, 200, {
      instanceId: id,
      code: inst.cr175_lch_kode || "",
      customerName: inst.cr175_lch_kundenavn || "",
      customerNumber: inst.cr175_lch_kundenummer || "",
      status: inst.cr175_lch_status,
      expiresAt: inst.cr175_lch_udloebstidspunkt || null,
      items
    });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
