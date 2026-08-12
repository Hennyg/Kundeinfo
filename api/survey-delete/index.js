// /api/survey-delete/index.js
//
// Sletter en eller flere kundeundersøgelser inklusiv deres tilknyttede
// cr175_lch_kundeinfo_spoergeskemasvars-rækker (så der ikke efterlades
// forældreløse rækker i Dataverse).

const { dvFetch } = require("../_dataverse");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

async function fetchIds(table, idField, filter) {
  const res = await dvFetch(
    `${table}?$select=${idField}&$filter=${encodeURIComponent(filter)}&$top=5000`
  );
  const data = await res.json();
  return (data.value || []).map(r => r[idField]);
}

async function deleteById(table, id) {
  await dvFetch(`${table}(${id})`, { method: "DELETE" });
}

async function deleteInstance(instanceId) {
  const rowIds = await fetchIds(
    "cr175_lch_kundeinfo_spoergeskemasvars",
    "cr175_lch_kundeinfo_spoergeskemasvarid",
    `_cr175_lch_kundeundersoegelse_value eq ${instanceId}`
  );
  for (const id of rowIds) {
    await deleteById("cr175_lch_kundeinfo_spoergeskemasvars", id);
  }

  await deleteById("cr175_lch_kundeinfo_kundeundersoegelses", instanceId);
}

module.exports = async function (context, req) {
  try {
    const ids = Array.isArray(req.body?.instanceIds)
      ? req.body.instanceIds.filter(Boolean)
      : [];

    if (!ids.length) {
      return json(context, 400, { error: "missing_ids", message: "Mangler instanceIds." });
    }

    const results = [];
    for (const id of ids) {
      try {
        await deleteInstance(id);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: e.message || String(e) });
      }
    }

    const failed = results.filter(r => !r.ok);

    return json(context, failed.length ? 207 : 200, { results });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
