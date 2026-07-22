// /api/survey-start/index.js
//
// NB: forudsætter at crcc8_lch_answers har et heltalsfelt "crcc8_lch_repeatindex"
// (samme navn/mønster som på crcc8_lch_surveyitems), så flere besvarelser af
// samme spørgsmål (fra en "gentagelig" gruppe) kan gemmes side om side.
// Hvis feltet ikke findes på crcc8_lch_answers endnu, skal det tilføjes i
// Dataverse før gentagelige grupper virker korrekt.

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

    const instRes = await dvFetch(instPath, {
      headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' }
    });
    const instData = await instRes.json();
    const inst = (instData?.value || [])[0];

    if (!inst) {
      return json(context, 404, { error: "invalid_code", message: "Koden er ugyldig eller findes ikke." });
    }

    // --- Check om survey allerede er gennemført ---
    const STATUS_COMPLETED = 776350001;
    if (Number(inst.crcc8_status) === STATUS_COMPLETED) {
      return json(context, 409, {
        error: "already_completed",
        message: "Surveyen er allerede gennemført."
      });
    }

    const instanceId = inst.crcc8_lch_surveyinstanceid;
    const customerName = inst.crcc8_lch_customername || "";

    // 2) Hent survey items for denne instans + udvid question + questiongroup
    const itemsPath =
      `crcc8_lch_surveyitems` +
      `?$select=crcc8_lch_surveyitemid,crcc8_lch_prefilltext,crcc8_lch_sortorder,crcc8_lch_sortordertal,_crcc8_lch_question_value` +
      `&$filter=${encodeURIComponent(`_crcc8_lch_surveyinstance_value eq ${instanceId}`)}` +
      `&$expand=${encodeURIComponent(
        `crcc8_lch_question($select=crcc8_lch_questionid,crcc8_lch_number,crcc8_lch_text,crcc8_lch_explanation,crcc8_lch_answertype,crcc8_lch_isrequired,crcc8_lch_sortorder;` +
        `$expand=crcc8_lch_questiongroup($select=crcc8_lch_questiongroupid,crcc8_lch_name,crcc8_lch_title,crcc8_lch_sortorder,crcc8_crcc8_repeatable))`
      )}`;

    const itemsRes = await dvFetch(itemsPath, {
      headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' }
    });
    const itemsData = await itemsRes.json();
    const itemRows = itemsData?.value || [];

    if (!itemRows.length) {
      return json(context, 404, {
        error: "no_items",
        message: "Ingen survey items fundet for denne kode (eller ingen spørgsmål koblet på)."
      });
    }

    // 3) Hent tidligere svar (inkl. repeatindex) for denne surveyinstance
    const ansPath =
      `crcc8_lch_answers` +
      `?$select=crcc8_lch_value,crcc8_lch_repeatindex,_crcc8_lch_question_value` +
      `&$filter=${encodeURIComponent(`_crcc8_lch_surveyinstance_value eq ${instanceId}`)}` +
      `&$top=5000`;

    const ansRes = await dvFetch(ansPath);
    const ansData = await ansRes.json();
    const ansRows = ansData?.value || [];

    // Map: `${questionId}|${repeatIndex}` -> value
    const answerMap = new Map();
    for (const a of ansRows) {
      const qid = a?._crcc8_lch_question_value ? String(a._crcc8_lch_question_value) : null;
      if (!qid) continue;
      const ri = Number.isFinite(Number(a.crcc8_lch_repeatindex)) ? Number(a.crcc8_lch_repeatindex) : 0;
      answerMap.set(`${qid}|${ri}`, a.crcc8_lch_value ?? "");
    }

    // 4) Byg grupper + basale (repeatIndex 0) spørgsmål ud fra surveyitems
    const groupsById = new Map();
    const baseQuestions = []; // { question meta, groupId, itemId, prefillText, sortKey }

    for (const row of itemRows) {
      const q = row.crcc8_lch_question;
      if (!q) continue;

      const g = q.crcc8_lch_questiongroup || null;
      const groupId = g ? String(g.crcc8_lch_questiongroupid) : "_ingen_gruppe_";

      if (!groupsById.has(groupId)) {
        groupsById.set(groupId, {
          id: groupId,
          title: g ? (g.crcc8_lch_title || g.crcc8_lch_name || "Andet") : "Andet",
          sort: g ? (g.crcc8_lch_sortorder ?? 0) : 999999,
          repeatable: g ? !!g.crcc8_crcc8_repeatable : false
        });
      }

      const answertype =
        q["crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue"] ??
        q.crcc8_lch_answertype ??
        "";

      const qid = String(q.crcc8_lch_questionid || "");

      baseQuestions.push({
        itemId: row.crcc8_lch_surveyitemid,
        questionId: qid,
        groupId,
        number: q.crcc8_lch_number,
        text: q.crcc8_lch_text,
        required: !!q.crcc8_lch_isrequired,
        answertype,
        explanation: q.crcc8_lch_explanation || "",
        prefillText: row.crcc8_lch_prefilltext || "",
        sortKey: Number(row.crcc8_lch_sortordertal ?? row.crcc8_lch_sortorder ?? q.crcc8_lch_sortorder ?? 0)
      });
    }

    // 5) Find hvor mange gentagelser der allerede findes pr. gruppe (ud fra gemte svar)
    const maxRepeatByGroup = new Map();
    for (const bq of baseQuestions) {
      const g = groupsById.get(bq.groupId);
      if (!g?.repeatable) continue;
      for (const [key, ] of answerMap) {
        const [qid, riStr] = key.split("|");
        if (qid !== bq.questionId) continue;
        const ri = Number(riStr);
        if (ri > (maxRepeatByGroup.get(bq.groupId) ?? 0)) maxRepeatByGroup.set(bq.groupId, ri);
      }
    }

    // 6) Byg den flade items-liste (inkl. gentagelser) som frontend renderer
    const items = [];

    for (const bq of baseQuestions) {
      const g = groupsById.get(bq.groupId);
      const maxRi = g?.repeatable ? (maxRepeatByGroup.get(bq.groupId) ?? 0) : 0;

      for (let ri = 0; ri <= maxRi; ri++) {
        const savedValue = answerMap.get(`${bq.questionId}|${ri}`) ?? "";
        items.push({
          itemId: ri === 0 ? bq.itemId : null,
          questionId: bq.questionId,
          groupId: bq.groupId,
          repeatIndex: ri,
          number: bq.number,
          text: bq.text,
          required: bq.required,
          answertype: bq.answertype,
          explanation: bq.explanation,
          prefillText: ri === 0 ? bq.prefillText : "",
          savedValue,
          sortKey: bq.sortKey
        });
      }
    }

    items.sort((a, b) => {
      const ga = groupsById.get(a.groupId), gb = groupsById.get(b.groupId);
      const gsort = (ga?.sort ?? 0) - (gb?.sort ?? 0);
      if (gsort !== 0) return gsort;
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      return a.repeatIndex - b.repeatIndex;
    });

    const groups = [...groupsById.values()].sort((a, b) => a.sort - b.sort);

    return json(context, 200, { code, customerName, groups, items });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
