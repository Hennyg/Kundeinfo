// /api/survey-items-update/index.js
//
// Opdaterer prefill-teksten på en eksisterende survey-instans' surveyitems.
// Findes rækken allerede (samme spørgsmål + repeatIndex) -> PATCH.
// Findes den ikke (ny gentagelse tilføjet i admin) -> POST ny række.
//
// Rører IKKE kundens egne indtastede svar (crcc8_lch_answers) – kun de
// forudfyldte prefillTexts på selve surveyitems.

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
    const instanceId = String(req.body?.instanceId || "").trim();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!instanceId || !items.length) {
      return json(context, 400, { error: "missing_data", message: "Mangler instanceId eller items." });
    }

    const existingRes = await dvFetch(
      `crcc8_lch_surveyitems` +
      `?$select=crcc8_lch_surveyitemid,crcc8_lch_repeatindex,_crcc8_lch_question_value` +
      `&$filter=${encodeURIComponent(`_crcc8_lch_surveyinstance_value eq ${instanceId}`)}&$top=5000`
    );
    const existingData = await existingRes.json();

    const existingMap = new Map();
    for (const r of (existingData.value || [])) {
      const key = `${r._crcc8_lch_question_value}|${Number(r.crcc8_lch_repeatindex ?? 0)}`;
      existingMap.set(key, r.crcc8_lch_surveyitemid);
    }

    let updated = 0, created = 0;

    for (const it of items) {
      const questionId = String(it?.questionId || "").trim();
      const repeatIndex = Number.parseInt(it?.repeatIndex ?? 0, 10) || 0;
      const prefillText = String(it?.prefillText || "").trim() || null;
      if (!questionId) continue;

      const key = `${questionId}|${repeatIndex}`;
      const existingId = existingMap.get(key);

      if (existingId) {
        const res = await dvFetch(`crcc8_lch_surveyitems(${existingId})`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ crcc8_lch_prefilltext: prefillText })
        });
        if (!res.ok) {
          return json(context, res.status, { error: "update_failed", detail: await res.text(), questionId, repeatIndex });
        }
        updated++;
      } else {
        const res = await dvFetch(`crcc8_lch_surveyitems`, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            crcc8_lch_name: "",
            crcc8_lch_prefilltext: prefillText,
            crcc8_lch_repeatindex: repeatIndex,
            crcc8_lch_sortordertal: repeatIndex * 100000,
            "crcc8_lch_surveyinstance@odata.bind": `/crcc8_lch_surveyinstances(${instanceId})`,
            "crcc8_lch_question@odata.bind": `/crcc8_lch_questions(${questionId})`
          })
        });
        if (!res.ok) {
          return json(context, res.status, { error: "create_failed", detail: await res.text(), questionId, repeatIndex });
        }
        created++;
      }
    }

    return json(context, 200, { ok: true, updated, created });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
