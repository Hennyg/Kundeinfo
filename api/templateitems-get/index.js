const { dvFetch } = require("../_dataverse");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

module.exports = async function (context, req) {
  try {
    const templateId = String(req.query?.templateId || "").trim();
    if (!templateId) {
      return json(context, 400, { error: "missing_templateId", message: "Mangler templateId i query." });
    }

    const top = Math.min(parseInt(req.query?.top || "500", 10) || 500, 2000);

    // TemplateItems: crcc8_lch_surveytemplateitems
    // Lookup til template ligger som _crcc8_lch_surveytemplate_value
    // Lookup til question: crcc8_lch_question
    const select =
      [
        "crcc8_lch_surveytemplateitemid",
        "crcc8_lch_defaultprefilltext",
        "crcc8_lch_sortorder",
        "_crcc8_lch_question_value"
      ].join(",");

const expand =
  "crcc8_lch_question(" +
    "$select=" +
      [
        "crcc8_lch_questionid",
        "crcc8_lch_number",
        "crcc8_lch_text",
        "crcc8_lch_answertype",
        "_crcc8_lch_questiongroup_value"
      ].join(",") +
    ";$expand=" +
      "crcc8_lch_questiongroup($select=crcc8_lch_title,crcc8_lch_name,crcc8_lch_sortorder)" +
  ")";


const path =
  "crcc8_lch_surveytemplateitems" +
  `?$select=${encodeURIComponent(select)}` +
  `&$expand=${encodeURIComponent(expand)}` +
  `&$filter=_crcc8_lch_surveytemplate_value eq ${templateId}` +
  `&$top=${top}`;

    const res = await dvFetch(path, {
      headers: {
        "Prefer": 'odata.include-annotations="*"'
      }
    });

    if (!res.ok) {
      return json(context, res.status, { error: "read_failed", detail: await res.text() });
    }

    const data = await res.json();
    const rows = data?.value || [];

    function numberKey(n) {
  // Sortér "006a" efter 006 og bogstav
  const s = String(n || "").trim();
  const m = /^(\d+)([a-zA-Z]*)$/.exec(s);
  if (!m) return { num: 999999, suf: s.toLowerCase() };
  return { num: parseInt(m[1], 10) || 0, suf: (m[2] || "").toLowerCase() };
}

rows.sort((a, b) => {
  const qa = a.crcc8_lch_question || {};
  const qb = b.crcc8_lch_question || {};

  // gruppe-sort (fra expand hvis den findes)
  const ga = qa.crcc8_lch_questiongroup || {};
  const gb = qb.crcc8_lch_questiongroup || {};

  const gsa = ga.crcc8_lch_sortorder ?? 999999;
  const gsb = gb.crcc8_lch_sortorder ?? 999999;
  if (gsa !== gsb) return gsa - gsb;

  // fallback hvis group sortorder ikke findes: brug group title/name alfabetisk
  const gna = String(ga.crcc8_lch_title || ga.crcc8_lch_name || "").toLowerCase();
  const gnb = String(gb.crcc8_lch_title || gb.crcc8_lch_name || "").toLowerCase();
  if (gna && gnb && gna !== gnb) return gna.localeCompare(gnb, "da");

  // spørgsmålsnummer
  const na = numberKey(qa.crcc8_lch_number);
  const nb = numberKey(qb.crcc8_lch_number);
  if (na.num !== nb.num) return na.num - nb.num;
  if (na.suf !== nb.suf) return na.suf.localeCompare(nb.suf, "da");

  // til sidst template-item sortorder hvis du har den
  const ta = a.crcc8_lch_sortorder ?? 999999;
  const tb = b.crcc8_lch_sortorder ?? 999999;
  return ta - tb;
});


    function numberKey(n) {
  // Sortér "006a" efter 006 og bogstav
  const s = String(n || "").trim();
  const m = /^(\d+)([a-zA-Z]*)$/.exec(s);
  if (!m) return { num: 999999, suf: s.toLowerCase() };
  return { num: parseInt(m[1], 10) || 0, suf: (m[2] || "").toLowerCase() };
}

rows.sort((a, b) => {
  const qa = a.crcc8_lch_question || {};
  const qb = b.crcc8_lch_question || {};

  // gruppe-sort (fra expand hvis den findes)
  const ga = qa.crcc8_lch_questiongroup || {};
  const gb = qb.crcc8_lch_questiongroup || {};

  const gsa = ga.crcc8_lch_sortorder ?? 999999;
  const gsb = gb.crcc8_lch_sortorder ?? 999999;
  if (gsa !== gsb) return gsa - gsb;

  // fallback hvis group sortorder ikke findes: brug group title/name alfabetisk
  const gna = String(ga.crcc8_lch_title || ga.crcc8_lch_name || "").toLowerCase();
  const gnb = String(gb.crcc8_lch_title || gb.crcc8_lch_name || "").toLowerCase();
  if (gna && gnb && gna !== gnb) return gna.localeCompare(gnb, "da");

  // spørgsmålsnummer
  const na = numberKey(qa.crcc8_lch_number);
  const nb = numberKey(qb.crcc8_lch_number);
  if (na.num !== nb.num) return na.num - nb.num;
  if (na.suf !== nb.suf) return na.suf.localeCompare(nb.suf, "da");

  // til sidst template-item sortorder hvis du har den
  const ta = a.crcc8_lch_sortorder ?? 999999;
  const tb = b.crcc8_lch_sortorder ?? 999999;
  return ta - tb;
});


    // Map til frontend-venligt format
    const out = rows.map(x => {
      const q = x.crcc8_lch_question || {};
      const qid =
        q.crcc8_lch_questionid ||
        x._crcc8_lch_question_value ||
        null;

const groupLabel =
  q?.crcc8_lch_questiongroup?.crcc8_lch_title ||
  q?.crcc8_lch_questiongroup?.crcc8_lch_name ||
  q["_crcc8_lch_questiongroup_value@OData.Community.Display.V1.FormattedValue"] ||
  "";

      const answertypeLabel =
        q["crcc8_lch_answertype@OData.Community.Display.V1.FormattedValue"] ||
        (q.crcc8_lch_answertype != null ? String(q.crcc8_lch_answertype) : "");

      return {
        templateItemId: x.crcc8_lch_surveytemplateitemid,
        questionId: qid,
        number: q.crcc8_lch_number || "",
        text: q.crcc8_lch_text || "",
        groupLabel,
        answertypeLabel,
        defaultPrefillText: x.crcc8_lch_defaultprefilltext || "",
        sortorder: x.crcc8_lch_sortorder ?? null
      };
    }).filter(r => r.questionId); // kun gyldige

    return json(context, 200, { value: out });
  } catch (e) {
    return json(context, 500, { error: "server_error", detail: String(e?.message || e) });
  }
};
