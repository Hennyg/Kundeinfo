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

    const questions = normalizeQuestions(p);
    const expiresAt = safeIsoOrNull(p.expiresAt);
    const templateVersion = Number.isFinite(+p.templateVersion) ? +p.templateVersion : 1;
    const note = (p.note ?? null) ? String(p.note).trim() : null;

    if (questions.length === 0) {
      return json(context, 400, { error: 'missing_questions' });
    }

    const code = await generateUniqueCode();
    const token = randomToken();

    // 1) Opret surveyinstance
    const instanceBody = {
      crcc8_lch_name: `Survey ${code}`,
      crcc8_lch_code: code,
      crcc8_lch_token: token,
      crcc8_lch_templateversion: templateVersion
    };
    if (expiresAt) instanceBody.crcc8_lch_expiresat = expiresAt;
    if (note) instanceBody.crcc8_lch_note = note;

    const rCreate = await dvFetch('crcc8_lch_surveyinstances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(instanceBody)
    });

    if (!rCreate.ok) {
      return json(context, rCreate.status, { error: 'instance_create_failed', detail: await rCreate.text() });
    }

    const location = rCreate.headers.get('OData-EntityId');
    const instanceId = location?.match(/\(([^)]+)\)/)?.[1];
    if (!instanceId) return json(context, 500, { error: 'missing_instance_id' });

    // 2) Opret surveyitems (med prefill direkte på item)
    for (let i = 0; i < questions.length; i++) {
      const { questionId, prefill, sort } = questions[i];

      const itemBody = {
        crcc8_lch_name: `Item ${i + 1}`,
        crcc8_lch_sortorder: String(sort),               // din sortorder kolonne er tekst
        crcc8_lch_prefilltext: prefill ?? null,          // ✅ prefill i surveyitem
        crcc8_lch_answertext: null,                      // start tom
        'crcc8_lch_surveyinstance@odata.bind': `/crcc8_lch_surveyinstances(${instanceId})`,
        'crcc8_lch_question@odata.bind': `/crcc8_lch_questions(${questionId})`
      };

      const rItem = await dvFetch('crcc8_lch_surveyitems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemBody)
      });

      if (!rItem.ok) {
        return json(context, rItem.status, {
          error: 'item_create_failed',
          detail: await rItem.text(),
          questionId
        });
      }
    }

    // 3) Returnér code + token (+ link hvis du vil)
    const origin =
      req.headers['x-forwarded-host']
        ? `https://${req.headers['x-forwarded-host']}`
        : null;

    const link = origin ? `${origin}/kundeinfo.html?code=${encodeURIComponent(code)}` : null;

    return json(context, 201, { id: instanceId, code, token, link });

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
