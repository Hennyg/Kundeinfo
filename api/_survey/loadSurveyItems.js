// /api/_survey/loadSurveyItems.js
//
// Henter en kundeundersøgelses spørgsmål/svar (via kode) og bygger den samme
// flade items/groups-struktur som survey-start bruger til kundesurvey.js.
// Delt logik (uddraget fra survey-start), så survey-submit kan bruge den
// samme struktur til at bygge PDF-kopien der vedhæftes "afsluttet skema"-
// mailen, uden at duplikere hele Dataverse-forespørgslen.

const { cdFetch: dvFetch } = require("../_coredata");

function escODataString(s) {
  return String(s ?? "").replace(/'/g, "''");
}

/**
 * @param {string} code
 * @returns {Promise<null | {
 *   instanceId: string, code: string, customerName: string, kundenummer: string,
 *   groups: Array<{ id:string, title:string, description:string, sort:number, repeatable:boolean, rapporterTil:string|null }>,
 *   items: Array<{ itemId:string|null, questionId:string, groupId:string, repeatIndex:number, number:string, text:string,
 *                  required:boolean, answertype:string, explanation:string, prefillText:string, savedValue:string,
 *                  addedByCustomer:boolean, sortKey:number }>
 * }>}
 */
async function loadSurveyItems(code) {
  // 1) Find kundeundersøgelse på kode
  const instPath =
    `cr175_lch_kundeinfo_kundeundersoegelses` +
    `?$select=cr175_lch_kundeinfo_kundeundersoegelseid,cr175_lch_kode,cr175_lch_kundenavn,cr175_lch_kundenummer` +
    `&$filter=${encodeURIComponent(`cr175_lch_kode eq '${escODataString(code)}'`)}` +
    `&$top=1`;

  const instRes = await dvFetch(instPath);
  const instData = await instRes.json();
  const inst = (instData?.value || [])[0];
  if (!inst) return null;

  const instanceId = inst.cr175_lch_kundeinfo_kundeundersoegelseid;
  const customerName = inst.cr175_lch_kundenavn || "";
  const kundenummer = inst.cr175_lch_kundenummer || "";

  // 2) Hent spørgeskemasvar for denne kundeundersøgelse + udvid spørgsmål + gruppe
  const rowsPath =
    `cr175_lch_kundeinfo_spoergeskemasvars` +
    `?$select=cr175_lch_kundeinfo_spoergeskemasvarid,cr175_lch_unik,cr175_lch_prefillvaerdi,cr175_lch_svarvaerdi,cr175_lch_gentagelsesindeks,_cr175_lch_spoergsmaal_value` +
    `&$filter=${encodeURIComponent(`_cr175_lch_kundeundersoegelse_value eq ${instanceId}`)}` +
    `&$expand=${encodeURIComponent(
      `cr175_lch_spoergsmaal($select=cr175_lch_kundeinfo_spoergsmaalid,cr175_lch_nummer,cr175_lch_spoergsmaalstekst,cr175_lch_forklaring,cr175_lch_svartype,cr175_lch_paakraevet,cr175_lch_sorteringsnummer;` +
      `$expand=cr175_lch_spoergsmaalsgruppe($select=cr175_lch_kundeinfo_spoergsmaalsgruppeid,cr175_lch_titel,cr175_lch_description,cr175_lch_sorteringsnummer,cr175_lch_kangentages,cr175_lch_rapporterer_til))`
    )}`;

  const rowsRes = await dvFetch(rowsPath, {
    headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' }
  });
  const rowsData = await rowsRes.json();
  const rows = rowsData?.value || [];

  if (!rows.length) {
    return { instanceId, code, customerName, kundenummer, groups: [], items: [] };
  }

  // 3) Byg grupper + basale spørgsmåls-skabeloner (fra repeatIndex=0-rækken
  //    pr. spørgsmål) + prefill/svar-opslag pr. faktisk gentagelse
  const groupsById = new Map();
  const baseQuestionByQid = new Map();
  const prefillByQuestionRepeat = new Map();
  const answerByQuestionRepeat = new Map();
  const addedByQuestionRepeat = new Map();
  const repeatIndexesByGroup = new Map();

  for (const row of rows) {
    const q = row.cr175_lch_spoergsmaal;
    if (!q) continue;

    const g = q.cr175_lch_spoergsmaalsgruppe || null;
    const groupId = g ? String(g.cr175_lch_kundeinfo_spoergsmaalsgruppeid) : "_ingen_gruppe_";

    if (!groupsById.has(groupId)) {
      groupsById.set(groupId, {
        id: groupId,
        title: g ? (g.cr175_lch_titel || "Andet") : "Andet",
        description: g ? (g.cr175_lch_description || "") : "",
        sort: g ? (g.cr175_lch_sorteringsnummer ?? 0) : 999999,
        repeatable: g ? !!g.cr175_lch_kangentages : false,
        rapporterTil: g
          ? (g["cr175_lch_rapporterer_til@OData.Community.Display.V1.FormattedValue"] || null)
          : null
      });
    }

    const answertype =
      q["cr175_lch_svartype@OData.Community.Display.V1.FormattedValue"] ??
      q.cr175_lch_svartype ??
      "";

    const qid = String(q.cr175_lch_kundeinfo_spoergsmaalid || "");
    const ri = Number.isFinite(Number(row.cr175_lch_gentagelsesindeks)) ? Number(row.cr175_lch_gentagelsesindeks) : 0;

    prefillByQuestionRepeat.set(`${qid}|${ri}`, row.cr175_lch_prefillvaerdi || "");
    answerByQuestionRepeat.set(`${qid}|${ri}`, row.cr175_lch_svarvaerdi || "");
    addedByQuestionRepeat.set(`${qid}|${ri}`, /-NY-/.test(String(row.cr175_lch_unik || "")));

    if (!repeatIndexesByGroup.has(groupId)) repeatIndexesByGroup.set(groupId, new Set());
    repeatIndexesByGroup.get(groupId).add(ri);

    if (ri === 0 || !baseQuestionByQid.has(qid)) {
      baseQuestionByQid.set(qid, {
        itemId: row.cr175_lch_kundeinfo_spoergeskemasvarid,
        questionId: qid,
        groupId,
        number: q.cr175_lch_nummer,
        text: q.cr175_lch_spoergsmaalstekst,
        required: !!q.cr175_lch_paakraevet,
        answertype,
        explanation: q.cr175_lch_forklaring || "",
        sortKey: Number(q.cr175_lch_sorteringsnummer ?? 0)
      });
    }
  }

  const baseQuestions = [...baseQuestionByQid.values()];

  // 4) Find max repeatIndex pr. gruppe
  const maxRepeatByGroup = new Map();
  for (const [groupId, riSet] of repeatIndexesByGroup) {
    maxRepeatByGroup.set(groupId, Math.max(...riSet));
  }

  // 5) Byg den flade items-liste (inkl. gentagelser)
  const items = [];

  for (const bq of baseQuestions) {
    const g = groupsById.get(bq.groupId);
    const maxRi = g?.repeatable ? (maxRepeatByGroup.get(bq.groupId) ?? 0) : 0;

    for (let ri = 0; ri <= maxRi; ri++) {
      const savedValue = answerByQuestionRepeat.get(`${bq.questionId}|${ri}`) ?? "";
      const prefillText = prefillByQuestionRepeat.get(`${bq.questionId}|${ri}`) || "";
      const addedByCustomer = addedByQuestionRepeat.get(`${bq.questionId}|${ri}`) || false;

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
        prefillText,
        savedValue,
        addedByCustomer,
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

  return { instanceId, code, customerName, kundenummer, groups, items };
}

module.exports = { loadSurveyItems };
