// /api/admin-survey-save/index.js
const { dvFetch } = require("../_dataverse");

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

// Helper: hent eksisterende item-id for (instance, question, repeatIndex)
async function findExistingItemId(instanceId, questionId, repeatIndex) {
  const ri = Number.isFinite(repeatIndex) ? repeatIndex : 0;
  const path =
    `crcc8_lch_surveyitems` +
    `?$select=crcc8_lch_surveyitemid` +
    `&$filter=_crcc8_lch_surveyinstanceid_value eq ${instanceId} and _crcc8_lch_questionid_value eq ${questionId} and crcc8_repeatindex eq ${ri}` +
    `&$top=1`;

  const res = await dvFetch(path);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`findExistingItemId failed: HTTP ${res.status} ${t}`);
  }
  const js = await res.json();
  return js.value?.[0]?.crcc8_lch_surveyitemid || null;
}

// Helper: slet alle items for (instance, groupId, repeatIndex)
// Vi gør det ved at slå spørgsmål op for gruppen og slette items pr spørgsmål.
async function deleteRepeatBlock(instanceId, groupId, repeatIndex) {
  const ri = Number.isFinite(repeatIndex) ? repeatIndex : 0;

  // 1) hent spørgsmål i gruppen
  const qPath =
    `crcc8_lch_questions` +
    `?$select=crcc8_lch_questionid,_crcc8_lch_questiongroupid_value` +
    `&$filter=_crcc8_lch_questiongroupid_value eq ${groupId}` +
    `&$top=5000`;

  const qRes = await dvFetch(qPath);
  if (!qRes.ok) {
    const t = await qRes.text();
    throw new Error(`deleteRepeatBlock questions failed: HTTP ${qRes.status} ${t}`);
  }
  const qJson = await qRes.json();
  const qIds = (qJson.value || []).map(x => x.crcc8_lch_questionid).filter(Boolean);

  let deleted = 0;

  // 2) slet items for hver questionId ved repeatIndex
  for (const qid of qIds) {
    const itemId = await findExistingItemId(instanceId, qid, ri);
    if (!itemId) continue;

    const delRes = await dvFetch(`crcc8_lch_surveyitems(${itemId})`, { method: "DELETE" });
    if (delRes.ok) deleted++;
    // hvis den fejler, så stop med detaljer
    else {
      const t = await delRes.text();
      throw new Error(`DELETE failed for item ${itemId}: HTTP ${delRes.status} ${t}`);
    }
  }

  return deleted;
}

module.exports = async function (context, req) {
  try {
    const instanceId = String(req?.body?.instanceId || "").trim();
    const answers = Array.isArray(req?.body?.answers) ? req.body.answers : [];
    const removed = Array.isArray(req?.body?.removed) ? req.body.removed : [];

    if (!instanceId) return json(context, 400, { error: "missing_instanceId", message: "Mangler instanceId." });

    let created = 0, updated = 0, deleted = 0;

    // 1) Slet fjernede repeat-blokke
    for (const r of removed) {
      const groupId = String(r?.groupId || "").trim();
      const repeatIndex = parseInt(r?.repeatIndex ?? 0, 10);
      if (!groupId) continue;

      deleted += await deleteRepeatBlock(instanceId, groupId, repeatIndex);
    }

    // 2) Upsert alle svar
    for (const a of answers) {
      const questionId = String(a?.questionId || "").trim();
      const repeatIndex = parseInt(a?.repeatIndex ?? 0, 10);
      let value = a?.value ?? "";

      if (!questionId) continue;

      // Normaliser value (så " " ikke spammer)
      if (typeof value === "string") value = value.replace(/\r\n/g, "\n").trim();

      // Find eksisterende
      const existingId = await findExistingItemId(instanceId, questionId, repeatIndex);

      if (existingId) {
        // PATCH
        const patchBody = {
          crcc8_lch_value: value,
          crcc8_repeatindex: repeatIndex
        };

        const res = await dvFetch(`crcc8_lch_surveyitems(${existingId})`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(patchBody)
        });

        if (!res.ok) {
          const t = await res.text();
          return json(context, res.status, {
            error: "update_failed",
            message: "Kunne ikke opdatere surveyitem.",
            detail: t,
            questionId,
            repeatIndex
          });
        }
        updated++;
      } else {
        // POST
        const postBody = {
          crcc8_lch_value: value,
          crcc8_repeatindex: repeatIndex,
          "crcc8_lch_surveyinstanceid@odata.bind": `/crcc8_lch_surveyinstances(${instanceId})`,
          "crcc8_lch_questionid@odata.bind": `/crcc8_lch_questions(${questionId})`
        };

        const res = await dvFetch(`crcc8_lch_surveyitems`, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(postBody)
        });

        if (!res.ok) {
          const t = await res.text();
          return json(context, res.status, {
            error: "create_failed",
            message: "Kunne ikke oprette surveyitem.",
            detail: t,
            questionId,
            repeatIndex
          });
        }
        created++;
      }
    }

    return json(context, 200, { ok: true, created, updated, deleted });
  } catch (e) {
    context.log("admin-survey-save failed", e);
    return json(context, 500, { error: "server_error", message: "Serverfejl i admin-survey-save.", detail: String(e?.message || e) });
  }
};
