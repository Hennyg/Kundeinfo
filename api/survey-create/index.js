// /api/survey-create/index.js
const { dvFetch } = require("../_dataverse");
const crypto = require("crypto");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function randomToken() {
  return crypto.randomBytes(24).toString("base64url");
}
function randomCode6() {
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, "0");
}
function safeIsoOrNull(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

async function codeExists(code) {
  const filter = `crcc8_lch_code eq '${code}'`;
  const r = await dvFetch(
    `crcc8_lch_surveyinstances?$select=crcc8_lch_surveyinstanceid&$filter=${encodeURIComponent(filter)}&$top=1`
  );
  const data = await r.json();
  return (data?.value || []).length > 0;
}

async function generateUniqueCode(maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    const c = randomCode6();
    if (!(await codeExists(c))) return c;
  }
  throw new Error("Kunne ikke generere unik 6-cifret kode. Prøv igen.");
}

// ✅ Normaliser input så vi altid ender med: [{ id, prefillText }]
function normalizeQuestionItems(p) {
  if (Array.isArray(p.questionItems) && p.questionItems.length) {
    return p.questionItems
      .filter(x => x && x.id)
      .map((x, idx) => ({
        id: String(x.id),
        prefillText: (x.prefillText ?? "").toString(),
        sort: Number.isFinite(+x.sort) ? +x.sort : (idx + 1) * 10
      }));
  }

  // fallback: questionIds
  const ids = Array.isArray(p.questionIds) ? p.questionIds.filter(Boolean) : [];
  return ids.map((qid, idx) => ({
    id: String(qid),
    prefillText: "",
    sort: (idx + 1) * 10
  }));
}

module.exports = async function (context, req) {
  try {
    const p = req.body || {};

    const customerName = (p.customerName ?? null) ? String(p.customerName).trim() : null;
    const expiresAt = safeIsoOrNull(p.expiresAt);
    const templateVersion = Number.isFinite(+p.templateVersion) ? +p.templateVersion : 1;

    // NOTE: kun hvis du HAR feltet på surveyinstance, ellers lad den stå som null og brug den ikke
    const note = (p.note ?? null) ? String(p.note).trim() : null;

    const questionItems = normalizeQuestionItems(p);
    if (!questionItems.length) {
      return json(context, 400, { error: "missing_questions" });
    }

    const code = await generateUniqueCode();
    const token = randomToken();

    // 1) Opret surveyinstance
    const instanceBody = {
      crcc8_name: customerName ? `${customerName} (${code})` : `Survey ${code}`,
      crcc8_lch_code: code,
      crcc8_token: token,
      crcc8_templateversion: templateVersion,
      crcc8_lch_customername: customerName
    };
    if (expiresAt) instanceBody.crcc8_expiresat = expiresAt;

    // ✅ hvis du har note-feltet på surveyinstance, så slå dette til og ret navnet hvis nødvendigt
    // if (note) instanceBody.crcc8_lch_note = note;

    const rCreate = await dvFetch("crcc8_lch_surveyinstances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instanceBody)
    });

    const createText = await rCreate.text();
    if (!rCreate.ok) {
      return json(context, 500, {
        error: "dv_create_instance_failed",
        status: rCreate.status,
        detail: createText,
        instanceBody
      });
    }

    const location = rCreate.headers.get("OData-EntityId");
    const instanceId = location?.match(/\(([^)]+)\)/)?.[1];
    if (!instanceId) {
      return json(context, 500, { error: "missing_instance_id", detail: location });
    }

    // 2) Opret surveyitems
    for (let i = 0; i < questionItems.length; i++) {
      const qi = questionItems[i];
      const qid = qi.id;

      const itemBody = {
        // hvis du har "crcc8_lch_name" på surveyitem er den ok. Hvis ikke → fjern den linje.
        crcc8_lch_name: `Item ${(i + 1)}`,

        // ✅ dit nye heltal
        crcc8_lch_sortordertal: Number.isFinite(+qi.sort) ? +qi.sort : (i + 1) * 10,

        "crcc8_lch_surveyinstance@odata.bind": `/crcc8_lch_surveyinstances(${instanceId})`,
        "crcc8_lch_question@odata.bind": `/crcc8_lch_questions(${qid})`
      };

      const pre = (qi.prefillText ?? "").toString().trim();
      if (pre) itemBody.crcc8_lch_prefilltext = pre;

      const rItem = await dvFetch("crcc8_lch_surveyitems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemBody)
      });

      const itemText = await rItem.text();
      if (!rItem.ok) {
        return json(context, 500, {
          error: "dv_create_item_failed",
          status: rItem.status,
          detail: itemText,
          itemBody
        });
      }
    }

    // link til kunden
    const host = req.headers["x-forwarded-host"];
    const origin = host ? `https://${host}` : "";
    const link = origin ? `${origin}/kundesurvey.html?code=${encodeURIComponent(code)}` : null;

    return json(context, 201, { id: instanceId, code, token, link });

  } catch (err) {
    context.log.error("survey-create crashed:", err);
    return json(context, 500, { error: "server_error", detail: err.message, stack: String(err.stack || "") });
  }
};
