// /api/template-save/index.js
const { dvFetch } = require("../_dataverse");

function json(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json; charset=utf-8" }, body };
}

module.exports = async function (context, req) {
  try {
    const templateId = String(req?.body?.templateId || "").trim() || null;
    const name = String(req?.body?.name || "").trim();
    const description = String(req?.body?.description || "").trim();
    const isActive = req?.body?.isActive !== false;
    const questionItems = Array.isArray(req?.body?.questionItems) ? req.body.questionItems : [];

    if (!name) return json(context, 400, { error: "missing_name", message: "Mangler template name." });
    if (!questionItems.length) return json(context, 400, { error: "missing_items", message: "Vælg mindst ét spørgsmål." });

    let id = templateId;

    // 1) create/update template
    if (!id) {
      const createBody = {
        crcc8_lch_name: name,
        crcc8_lch_description: description || null,
        crcc8_lch_isactive: isActive
      };
      const r = await dvFetch("crcc8_lch_surveytemplates", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(createBody)
      });
      if (!r.ok) return json(context, r.status, { error: "template_create_failed", detail: await r.text() });

      // Dataverse returnerer ofte OData-EntityId i header – men dvFetch wrapperen kan variere.
      // Derfor: hent id via Location header hvis muligt; ellers kræver det at dvFetch returnerer body med id.
      const loc = r.headers.get("OData-EntityId") || r.headers.get("odata-entityid") || r.headers.get("Location") || "";
      const m = loc.match(/\(([^)]+)\)/);
      if (m) id = m[1];
      if (!id) {
        // fallback: læs nyeste på navn (ikke perfekt, men ok som fallback)
        const rr = await dvFetch(`crcc8_lch_surveytemplates?$select=crcc8_lch_surveytemplateid&$filter=crcc8_lch_name eq '${name.replace(/'/g,"''")}'&$top=1&$orderby=createdon desc`);
        const jj = rr.ok ? await rr.json() : null;
        id = jj?.value?.[0]?.crcc8_lch_surveytemplateid || null;
      }
      if (!id) return json(context, 500, { error: "template_id_missing", message: "Template oprettet, men kunne ikke finde id." });
    } else {
      const patchBody = {
        crcc8_lch_name: name,
        crcc8_lch_description: description || null,
        crcc8_lch_isactive: isActive
      };
      const r = await dvFetch(`crcc8_lch_surveytemplates(${id})`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(patchBody)
      });
      if (!r.ok) return json(context, r.status, { error: "template_update_failed", detail: await r.text() });
    }

    // 2) delete existing templateitems for template
    // (vi sletter og genskaber – simpelt)
    const existingRes = await dvFetch(
      `crcc8_lch_surveytemplateitems?$select=crcc8_lch_surveytemplateitemid&$filter=_crcc8_lch_surveytemplate_value eq ${id}&$top=5000`
    );
    if (!existingRes.ok) return json(context, existingRes.status, { error: "templateitems_list_failed", detail: await existingRes.text() });
    const existing = await existingRes.json();

    for (const row of (existing.value || [])) {
      const itemId = row.crcc8_lch_surveytemplateitemid;
      if (!itemId) continue;
      const del = await dvFetch(`crcc8_lch_surveytemplateitems(${itemId})`, { method: "DELETE" });
      if (!del.ok) return json(context, del.status, { error: "templateitems_delete_failed", detail: await del.text() });
    }

    // 3) create new items
    for (const qi of questionItems) {
      const qid = String(qi?.questionId || "").trim();
      if (!qid) continue;

      const body = {
        crcc8_lch_name: name, // primærnavn på item kan bare være template name
        crcc8_lch_sortorder: Number.isFinite(Number(qi.sortOrder)) ? Number(qi.sortOrder) : null,
        crcc8_lch_defaultprefilltext: String(qi.defaultPrefillText || "").trim() || null,
        "crcc8_lch_surveytemplate@odata.bind": `/crcc8_lch_surveytemplates(${id})`,
        "crcc8_lch_question@odata.bind": `/crcc8_lch_questions(${qid})`
      };

      const r = await dvFetch("crcc8_lch_surveytemplateitems", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body)
      });

      if (!r.ok) return json(context, r.status, { error: "templateitem_create_failed", detail: await r.text(), questionId: qid });
    }

    return json(context, 200, { ok: true, templateId: id });
  } catch (e) {
    return json(context, 500, { error: "server_error", detail: String(e?.message || e) });
  }
};
