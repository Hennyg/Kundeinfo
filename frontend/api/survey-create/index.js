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
  const r = await dvFetch(`crcc8_lch_surveyinstances?$select=crcc8_lch_surveyinstanceid&$filter=${encodeURIComponent(filter)}&$top=1`);
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

module.exports = async function (context, req) {
  try {
    const p = req.body || {};
    const questionIds = Array.isArray(p.questionIds) ? p.questionIds.filter(Boolean) : [];
    const expiresAt = safeIsoOrNull(p.expiresAt);
    const templateVersion = Number.isFinite(+p.templateVersion) ? +p.templateVersion : 1;
    const note = (p.note ?? null) ? String(p.note).trim() : null;

    // PREFILL: object { "<questionId>": "value", ... } (valgfri)
    const prefill = (p.prefill && typeof p.prefill === 'object') ? p.prefill : null;

    if (questionIds.length === 0) {
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
      return json(context, rCreate.status, await rCreate.text());
    }

    const location = rCreate.headers.get('OData-EntityId');
    const instanceId = location?.match(/\(([^)]+)\)/)?.[1];
    if (!instanceId) return json(context, 500, 'Kunne ikke aflæse surveyinstance id');

    // 2) Opret surveyitems
    for (let i = 0; i < questionIds.length; i++) {
      const qid = questionIds[i];

      const itemBody = {
        crcc8_lch_name: `Item ${(i + 1)}`,
        crcc8_lch_sortorder: String((i + 1) * 10), // <-- HER er den!
        'crcc8_lch_surveyinstance@odata.bind': `/crcc8_lch_surveyinstances(${instanceId})`,
        'crcc8_lch_question@odata.bind': `/crcc8_lch_questions(${qid})`
      };

      const rItem = await dvFetch('crcc8_lch_surveyitems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemBody)
      });

      if (!rItem.ok) {
        return json(context, rItem.status, `Kunne ikke oprette surveyitem: ${await rItem.text()}`);
      }
    }

    // 3) Prefill -> opret svar-rækker (kræver ny tabel crcc8_lch_answers)
    // Kun hvis du har oprettet lch_answer tabellen.
    if (prefill) {
      for (const [questionId, value] of Object.entries(prefill)) {
        if (!questionId) continue;

        const body = {
          crcc8_lch_name: `Prefill ${code}`,
          crcc8_lch_value: value == null ? null : String(value),
          // evt choice:
          // crcc8_lch_source: 100000000,
          'crcc8_lch_surveyinstance@odata.bind': `/crcc8_lch_surveyinstances(${instanceId})`,
          'crcc8_lch_question@odata.bind': `/crcc8_lch_questions(${questionId})`
        };

        const rAns = await dvFetch('crcc8_lch_answers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!rAns.ok) {
          // vi stopper ikke nødvendigvis hele processen, men det er oftest bedst at fejle så admin opdager det
          return json(context, rAns.status, `Kunne ikke oprette prefill answer: ${await rAns.text()}`);
        }
      }
    }

    return json(context, 201, { id: instanceId, code, token });

  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
