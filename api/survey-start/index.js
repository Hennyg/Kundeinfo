// /api/survey-start/index.js
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
    if (!code) return json(context, 400, { error: "missing_code", message: "Mangler code i body." });

    // 1) Find surveyinstance på code
const instPath =
  `crcc8_lch_surveyinstances` +
  `?$select=crcc8_lch_surveyinstanceid,crcc8_lch_code,crcc8_lch_customername,crcc8_expiresat,crcc8_status` +
  `&$filter=${encodeURIComponent(`crcc8_lch_code eq '${escODataString(code)}'`)}` +
  `&$top=1`;

    const ansPath =
  `crcc8_lch_answers` +
  `?$select=crcc8_lch_value,_crcc8_lch_question_value` +
  `&$filter=${encodeURIComponent(`_crcc8_lch_surveyinstance_value eq ${instanceId}`)}` +
  `&$top=5000`;

const ansRes = await dvFetch(ansPath);
const ansData = await ansRes.json();
const ansRows = ansData?.value || [];

const answerByQuestionId = new Map(
  ansRows
    .filter(a => a?._crcc8_lch_question_value)
    .map(a => [String(a._crcc8_lch_question_value), a.crcc8_lch_value ?? ""])
);



    const instRes = await dvFetch(instPath, {
      headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' }
    });
    const instData = await instRes.json();
    const inst = (instData?.value || [])[0];

    if (!inst) {
      return json(context, 404, { error: "invalid_code", message: "Koden er ugyldig eller findes ikke." });
    }

    // --- Check om survey allerede er gennemført ---
const STATUS_COMPLETED = 776350001; // <-- SKIFT 3 til den rigtige værdi fra crcc8_status

if (Number(inst.crcc8_status) === STATUS_COMPLETED) {
  return json(context, 409, {
    error: "already_completed",
    message: "Surveyen er allerede gennemført."
  });
}

    const instanceId = inst.crcc8_lch_surveyinstanceid;
    const customerName = inst.crcc8_lch_customername || "";

    // 2) Hent survey items for denne instans + udvid question
    // Bemærk: _crcc8_lch_surveyinstance_value er lookupens rå værdi i OData
    const itemsPath =
      `crcc8_lch_surveyitems` +
      `?$select=crcc8_lch_surveyitemid,crcc8_lch_prefilltext,crcc8_lch_sortorder,crcc8_lch_sortordertal,_crcc8_lch_question_value` +
      `&$filter=${encodeURIComponent(`_crcc8_lch_surveyinstance_value eq ${instanceId}`)}` +
      `&$expand=${encodeURIComponent(
        `crcc8_lch_question($select=crcc8_lch_questionid,crcc8_lch_number,crcc8_lch_text,crcc8_lch_explanation,crcc8_lch_group,crcc8_lch_answertype,crcc8_lch_isrequired,crcc8_lch_conditionalon,crcc8_lch_conditionalvalue)`
      )}`;

    const itemsRes = await dvFetch(itemsPath, {
      headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' }
    });
    const itemsData = await itemsRes.json();
    const rows = itemsData?.value || [];

    // 3) Map til frontend-format
    const items = rows
      .map((row) => {
        const q = row.crcc8_lch_question;
        if (!q) return null;

        const answertype =
          q["crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue"] ??
          q.crcc8_lch_answertype ??
          "";

        const qid = String(q.crcc8_lch_questionid || "");
        const savedValue = answerByQuestionId.get(qid);

        return {
          itemId: row.crcc8_lch_surveyitemid,
          questionId: q.crcc8_lch_questionid,
          number: q.crcc8_lch_number,
          text: q.crcc8_lch_text,
          required: !!q.crcc8_lch_isrequired,
          answertype,
          prefillText: row.crcc8_lch_prefilltext || "",
          savedValue: savedValue ?? "",
          explanation: q.crcc8_lch_explanation || "",
          group: q.crcc8_lch_group || "",
          conditionalOn: q.crcc8_lch_conditionalon || null,
          conditionalValue: q.crcc8_lch_conditionalvalue || null
        };
      })
      .filter(Boolean)
      // sortering: brug tal hvis du har det, ellers tekst
      .sort((a, b) => {
        const an = Number(a.number ?? 0);
        const bn = Number(b.number ?? 0);
        return an - bn;
      });

    if (!items.length) {
      return json(context, 404, {
        error: "no_items",
        message: "Ingen survey items fundet for denne kode (eller ingen spørgsmål koblet på)."
      });
    }

    return json(context, 200, { code, customerName, items });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
