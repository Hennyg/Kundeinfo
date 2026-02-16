// /api/admin-survey-load/index.js
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
    const instanceId = String(req?.body?.instanceId || "").trim();
    const code = String(req?.body?.code || "").trim();

    if (!instanceId && !code) {
      return json(context, 400, { error: "missing_input", message: "Mangler instanceId eller code." });
    }

    // 1) Find instance
    let inst = null;

    if (instanceId) {
      const instPath =
        `crcc8_lch_surveyinstances(${instanceId})` +
        `?$select=crcc8_lch_surveyinstanceid,crcc8_lch_code,crcc8_lch_customername,crcc8_status`;

      const instRes = await dvFetch(instPath);
      if (!instRes.ok) {
        const t = await instRes.text();
        return json(context, instRes.status, { error: "instance_read_failed", message: "Kunne ikke hente surveyinstance.", detail: t });
      }
      inst = await instRes.json();
    } else {
      const instPath =
        `crcc8_lch_surveyinstances` +
        `?$select=crcc8_lch_surveyinstanceid,crcc8_lch_code,crcc8_lch_customername,crcc8_status` +
        `&$filter=crcc8_lch_code eq '${escODataString(code)}'` +
        `&$top=1`;

      const instRes = await dvFetch(instPath);
      if (!instRes.ok) {
        const t = await instRes.text();
        return json(context, instRes.status, { error: "instance_lookup_failed", message: "Kunne ikke slå surveyinstance op på code.", detail: t });
      }
      const instJson = await instRes.json();
      inst = instJson.value?.[0] || null;
    }

    if (!inst?.crcc8_lch_surveyinstanceid) {
      return json(context, 404, { error: "instance_not_found", message: "Surveyinstance ikke fundet." });
    }

    const instId = inst.crcc8_lch_surveyinstanceid;

    // 2) Hent grupper
    // NB: repeatable felt = crcc8_crcc8_repeatable (som du skrev)
    const groupsPath =
      `crcc8_lch_questiongroups` +
      `?$select=crcc8_lch_questiongroupid,crcc8_lch_name,crcc8_lch_sort,crcc8_crcc8_repeatable` +
      `&$orderby=crcc8_lch_sort asc`;

    const groupsRes = await dvFetch(groupsPath);
    if (!groupsRes.ok) {
      const t = await groupsRes.text();
      return json(context, groupsRes.status, { error: "groups_failed", message: "Kunne ikke hente questiongroups.", detail: t });
    }
    const groupsJson = await groupsRes.json();

    // 3) Hent spørgsmål
    // Antager lookup feltet hedder crcc8_lch_questiongroupid (standard for lookup på samme navn).
    // Hvis dit schema har et andet navn, siger du lige til – så retter jeg select/expand.
    const questionsPath =
      `crcc8_lch_questions` +
      `?$select=crcc8_lch_questionid,crcc8_lch_qtext,crcc8_lch_qexplanation,crcc8_lch_answertype,crcc8_lch_sort,_crcc8_lch_questiongroupid_value` +
      `&$orderby=_crcc8_lch_questiongroupid_value asc,crcc8_lch_sort asc`;

    const questionsRes = await dvFetch(questionsPath);
    if (!questionsRes.ok) {
      const t = await questionsRes.text();
      return json(context, questionsRes.status, { error: "questions_failed", message: "Kunne ikke hente questions.", detail: t });
    }
    const questionsJson = await questionsRes.json();

    // 4) Hent items for instansen
    const itemsPath =
      `crcc8_lch_surveyitems` +
      `?$select=crcc8_lch_surveyitemid,crcc8_lch_value,crcc8_repeatindex,_crcc8_lch_questionid_value,_crcc8_lch_surveyinstanceid_value` +
      `&$filter=_crcc8_lch_surveyinstanceid_value eq ${instId}` +
      `&$top=5000`;

    const itemsRes = await dvFetch(itemsPath);
    if (!itemsRes.ok) {
      const t = await itemsRes.text();
      return json(context, itemsRes.status, { error: "items_failed", message: "Kunne ikke hente surveyitems.", detail: t });
    }
    const itemsJson = await itemsRes.json();

    // 5) Normalize til frontend
    const out = {
      instance: {
        id: instId,
        code: inst.crcc8_lch_code || "",
        customerName: inst.crcc8_lch_customername || "",
        status: inst.crcc8_status || ""
      },
      groups: (groupsJson.value || []).map(g => ({
        id: g.crcc8_lch_questiongroupid,
        name: g.crcc8_lch_name,
        sort: g.crcc8_lch_sort ?? 0,
        repeatable: !!g.crcc8_crcc8_repeatable
      })),
      questions: (questionsJson.value || []).map(q => ({
        id: q.crcc8_lch_questionid,
        text: q.crcc8_lch_qtext,
        explanation: q.crcc8_lch_qexplanation,
        answerType: q.crcc8_lch_answertype,
        sort: q.crcc8_lch_sort ?? 0,
        groupId: q._crcc8_lch_questiongroupid_value || null
      })),
      items: (itemsJson.value || []).map(it => ({
        id: it.crcc8_lch_surveyitemid,
        questionId: it._crcc8_lch_questionid_value,
        repeatIndex: (it.crcc8_repeatindex ?? 0),
        value: it.crcc8_lch_value ?? ""
      }))
    };

    return json(context, 200, out);
  } catch (e) {
    context.log("admin-survey-load failed", e);
    return json(context, 500, { error: "server_error", message: "Serverfejl i admin-survey-load.", detail: String(e?.message || e) });
  }
};
