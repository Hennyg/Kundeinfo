// api/survey-create/index.js
const crypto = require("crypto");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function randomToken() {
  return crypto.randomBytes(24).toString("base64url"); // langt token
}

function randomCode6() {
  // 000000–999999, men undgå for korte med padStart
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, "0");
}

module.exports = async function (context, req) {
  try {
    const { questionIds, expiresAt, templateVersion, note } = req.body || {};
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return json(context, 400, { error: "missing_questions" });
    }

    // TODO: 1) find unik code (loop med check mod Dataverse)
    const code = randomCode6();
    const token = randomToken();

    // TODO: 2) opret lch_surveyinstance med:
    // crcc8_lch_code = code
    // crcc8_lch_token = token
    // crcc8_lch_expiresat = expiresAt (valgfri)
    // crcc8_lch_templateversion = templateVersion
    // crcc8_lch_note = note

    // TODO: 3) opret lch_surveyitem for hvert questionId:
    // lookup til surveyinstance + question, sortorder = index*10 eller bare 10,20,30...

    return json(context, 501, { error: "not_implemented", code, token, hint: "Hook den op til Dataverse som questions-post gør" });
  } catch (e) {
    return json(context, 500, { error: "server_error", message: e?.message || String(e) });
  }
};
