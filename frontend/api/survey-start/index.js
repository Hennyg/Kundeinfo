// api/survey-start/index.js
function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function normalizeCode(s) {
  return String(s || "").trim().replace(/\s+/g, "").replace(/\D/g, "");
}

module.exports = async function (context, req) {
  try {
    const code = normalizeCode(req.query?.code ?? req.body?.code);
    if (code.length !== 6) {
      return json(context, 400, { error: "invalid_code" });
    }

    // TODO: genbrug samme dv-fetch helper som dine questions endpoints
    // 1) slå surveyinstance op hvor crcc8_lch_code eq '123456'
    // 2) returnér { token: crcc8_lch_token }

    return json(context, 501, { error: "not_implemented", hint: "Hook den op til Dataverse som questions-get gør" });
  } catch (e) {
    return json(context, 500, { error: "server_error", message: e?.message || String(e) });
  }
};
