// /api/survey-create/index.js
const { dvFetch } = require('../_dataverse');
const crypto = require('crypto');

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function randomToken() {
  return crypto.randomBytes(24).toString('base64url');
}
function randomCode6() {
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, '0');
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
  throw new Error('Kunne ikke generere unik 6-cifret kode. Prøv igen.');
}

// Normaliser input: accepter både questionItems og questionIds
function normalizeQuestions(p) {
  // Ny format: [{ questionId, prefill }]
  if (Array.isArray(p.questionItems) && p.questionItems.length) {
    const items = p.questionItems
      .filter(x => x && x.questionId)
      .map((x, idx) => ({
        questionId: String(x.questionId),
        prefill: (x.prefill ?? null) ? String(x.prefill) : null,
        sort: Number.isFinite(+x.sort) ? +x.sort : (idx + 1) * 10
      }));
    return items;
  }

  // Gammel format: questionIds: ["guid", ...]
  const ids = Array.isArray(p.questionIds) ? p.questionIds.filter(Boolean) : [];
  if (ids.length) {
    return ids.map((qid, idx) => ({
      questionId: String(qid),
      prefill: null,
      sort: (idx + 1) * 10
    }));
  }

  return [];
}

module.exports = async function (context, req) {
  try {
    const p = req.body || {};
    context.log("survey-create payload:", JSON.stringify(p));

    const questionItems = Array.isArray(p.questionItems) ? p.questionItems : [];
    const questionIds = questionItems.map(x => x?.id).filter(Boolean);

    const expiresAt = safeIsoOrNull(p.expiresAt);
    const templateVersion = Number.isFinite(+p.templateVersion) ? +p.templateVersion : 1;

    // Kundenavn (valgfri)
    const customerName = (p.customerName ?? null) ? String(p.customerName).trim() : null;

    // PREFILL map { "<questionId>": "text", ... }
    const prefill = (p.prefill && typeof p.prefill === 'object') ? p.prefill : null;

    if (questionIds.length === 0) {
      return json(context, 400, { error: "missing_questions" });
    }

    const code = await generateUniqueCode();
    const token = randomToken();

    // ✅ RET logical names (fra dit surveyinstance screenshot)
    const instanceBody = {
      crcc8_name: customerName ? `${customerName} (${code})` : `Survey ${code}`,
      crcc8_lch_code: code,
      crcc8_token: token,
      crcc8_templateversion: templateVersion
    };
    if (expiresAt) instanceBody.crcc8_expiresat = expiresAt;

    // OBS: kun hvis du har oprettet feltet på surveyinstance og ved logical name
    // if (customerName) instanceBody.crcc8_lch_customername = customerName;

    context.log("instanceBody:", JSON.stringify(instanceBody));

    const rCreate = await dvFetch('crcc8_lch_surveyinstances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(instanceBody)
    });

    const createText = await rCreate.text();
    if (!rCreate.ok) {
      context.log("DV create surveyinstance failed:", rCreate.status, createText);
      return json(context, 500, { error: "dv_create_instance_failed", status: rCreate.status, detail: createText });
    }

    const location = rCreate.headers.get('OData-EntityId');
    const instanceId = location?.match(/\(([^)]+)\)/)?.[1];
    if (!instanceId) return json(context, 500, { error: "missing_instance_id", detail: location });

    // 2) Opret items (inkl. prefilltext hvis sendt)
    for (let i = 0; i < questionItems.length; i++) {
      const qi = questionItems[i];
      const qid = qi?.id;
      if (!qid) continue;

      const itemBody = {
        crcc8_name: `Item ${(i + 1)}`,
        crcc8_lch_sortorder: String((i + 1) * 10),
        'crcc8_lch_surveyinstance@odata.bind': `/crcc8_lch_surveyinstances(${instanceId})`,
        'crcc8_lch_question@odata.bind': `/crcc8_lch_questions(${qid})`
      };

      // prefill tekst på item (fra din surveyitem tabel: crcc8_lch_prefilltext)
      if (qi.prefillText != null && String(qi.prefillText).trim() !== "") {
        itemBody.crcc8_lch_prefilltext = String(qi.prefillText);
      }

      const rItem = await dvFetch('crcc8_lch_surveyitems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemBody)
      });

      const itemText = await rItem.text();
      if (!rItem.ok) {
        context.log("DV create surveyitem failed:", rItem.status, itemText, itemBody);
        return json(context, 500, { error: "dv_create_item_failed", status: rItem.status, detail: itemText, itemBody });
      }
    }

    // link til kunden (ret kundeinfo.html hvis den hedder andet)
    const origin = req.headers['x-forwarded-host'] ? `https://${req.headers['x-forwarded-host']}` : null;
    const link = origin ? `${origin}/kundeinfo.html?code=${encodeURIComponent(code)}` : null;

    return json(context, 201, { id: instanceId, code, token, link });

  } catch (err) {
    context.log.error("survey-create crashed:", err);
    return json(context, 500, { error: "server_error", detail: err.message, stack: String(err.stack || "") });
  }
};
