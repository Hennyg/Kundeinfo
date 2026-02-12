// /api/survey-submit/index.js
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

module.exports = async function (context, req) {
  try {
    const code = String(req?.body?.code || "").trim();
    const answers = Array.isArray(req?.body?.answers) ? req.body.answers : [];

    if (!code) return json(context, 400, { error: "missing_code", message: "Mangler code." });
    if (!answers.length) return json(context, 400, { error: "missing_answers", message: "Ingen svar modtaget." });

    // 1) Find surveyinstance via code
    const instPath =
      `crcc8_lch_surveyinstances` +
      `?$select=crcc8_lch_surveyinstanceid,crcc8_lch_code` +
      `&$filter=${encodeURIComponent(`crcc8_lch_code eq '${escODataString(code)}'`)}` +
      `&$top=1`;

    const instRes = await dvFetch(instPath);
    const instData = await instRes.json();
    const inst = (instData?.value || [])[0];
    if (!inst) return json(context, 404, { error: "invalid_code", message: "Ugyldig kode." });

    const instanceId = inst.crcc8_lch_surveyinstanceid; // GUID

    // 2) For hvert answer: slå surveyitem op -> få questionId
    // Surveyitem entity set: crcc8_lch_surveyitems (som vi bruger i survey-start)
    // Felter på surveyitem: crcc8_lch_surveyitemid, _crcc8_lch_question_value, crcc8_lch_prefill
    let created = 0, updated = 0, skipped = 0;

    for (const a of answers) {
      const itemId = String(a.itemId || "").trim();      // surveyitemid (GUID)
      const value = a.value == null ? null : String(a.value);

      if (!itemId) { skipped++; continue; }

      // 2a) Hent surveyitem => questionId
      let questionId = null;
      let prefill = null;

      try {
        const itemPath =
          `crcc8_lch_surveyitems(${itemId})` +
          `?$select=crcc8_lch_surveyitemid,_crcc8_lch_question_value,crcc8_lch_prefilltext`;

        const ir = await dvFetch(itemPath);
        const item = await ir.json();

        questionId = item?._crcc8_lch_question_value || null;
        prefill = item?.crcc8_lch_prefilltext ?? null;
      } catch (e) {
        // Hvis itemId ikke findes eller entity set navnet er forkert
        return json(context, 500, { error: "surveyitem_lookup_failed", message: e.message || String(e) });
      }

      if (!questionId) { skipped++; continue; }

      // 2b) Find eksisterende answer for (instance, question)
      const findPath =
        `crcc8_lch_answers` +
        `?$select=crcc8_lch_answerid` +
        `&$filter=${encodeURIComponent(`_crcc8_lch_surveyinstance_value eq ${instanceId} and _crcc8_lch_question_value eq ${questionId}`)}` +
        `&$top=1`;

      let existingId = null;
      try {
        const fr = await dvFetch(findPath);
        const fd = await fr.json();
        existingId = (fd?.value || [])[0]?.crcc8_lch_answerid || null;
      } catch (e) {
        return json(context, 500, { error: "answer_find_failed", message: e.message || String(e) });
      }

      // 2c) Payload til lch_answer
      const payload = {
        crcc8_lch_name: `Answer ${code}`,
        crcc8_lch_value: value,
        crcc8_lch_updatedat: new Date().toISOString(),
        // hvis du vil gemme prefill også:
        ...(prefill != null ? { crcc8_lch_prefill: String(prefill) } : {}),
        "crcc8_lch_surveyinstance@odata.bind": `/crcc8_lch_surveyinstances(${instanceId})`,
        "crcc8_lch_question@odata.bind": `/crcc8_lch_questions(${questionId})`
      };

      if (existingId) {
        await dvFetch(`crcc8_lch_answers(${existingId})`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        updated++;
      } else {
        await dvFetch(`crcc8_lch_answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        created++;
      }
    }
    // --- Markér survey som gennemført ---
const finalize = !!req?.body?.finalize;

const STATUS_PENDING   = 776350000;
const STATUS_COMPLETED = 776350001;

await dvFetch(`crcc8_lch_surveyinstances(${instanceId})`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    crcc8_status: finalize ? STATUS_COMPLETED : STATUS_PENDING
  })
});



    return json(context, 200, { ok: true, created, updated, skipped, finalize });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
