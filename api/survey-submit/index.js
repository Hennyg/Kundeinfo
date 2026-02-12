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

    // 2) Upsert: én række pr (surveyinstance, question)
    // Dataverse kræver @odata.bind for lookups.
    // Entity set navne: crcc8_lch_answers og crcc8_lch_questions (sidste findes hos dig).
    let saved = 0;

    for (const a of answers) {
      const questionId = String(a.questionId || "").trim();
      const value = a.value == null ? null : String(a.value);

      if (!questionId) continue;

      // Find eksisterende answer for denne instans + question
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
        // hvis filteret fejler pga lookup-navne, giver vi en tydelig fejl
        return json(context, 500, { error: "lookup_filter_failed", message: e.message || String(e) });
      }

      const payload = {
        crcc8_lch_name: `Answer ${code}`,
        crcc8_lch_value: value,
        crcc8_lch_updatedat: new Date().toISOString(),
        "crcc8_lch_surveyinstance@odata.bind": `/crcc8_lch_surveyinstances(${instanceId})`,
        "crcc8_lch_question@odata.bind": `/crcc8_lch_questions(${questionId})`
      };

      if (existingId) {
        await dvFetch(`crcc8_lch_answers(${existingId})`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } else {
        await dvFetch(`crcc8_lch_answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      saved++;
    }

    return json(context, 200, { ok: true, saved });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
