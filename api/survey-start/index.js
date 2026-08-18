// /api/survey-start/index.js
//
// Henter en kundeundersøgelse (via kode) + dens spørgeskemasvar-rækker, og
// bygger den flade items/groups-struktur som kundesurvey.js forventer.

const { cdFetch: dvFetch } = require("../_coredata");
const { getStatusValues } = require("../_kundeundersoegelseStatus");

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

// Selvstændigt token scopet til COREDATA_URL (Uniconta/kundeliste-miljøet).
// NB: getCoredataToken() i _coredata.js scoper til HerrupPortal_URL (et andet
// miljø/app-registrering) og kan derfor IKKE bruges til at kalde COREDATA_URL
// – det giver et audience-mismatch og en fejlende (401) request, som fanges
// af try/catch og stille returnerer en tom liste. Samme mønster som i
// /api/kunde-adresser og /api/kunder-search.
async function getUnicontaToken(resource) {
  const tenant = process.env.DV_TENANT_ID;
  const clientId = process.env.DV_CLIENT_ID;
  const clientSecret = process.env.DV_CLIENT_SECRET;

  if (!tenant || !clientId || !clientSecret || !resource) return null;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${resource}/.default`
  });

  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) return null;
  return j.access_token;
}

async function fetchKundeAdresser(kundenr) {
  try {
    if (!kundenr) return [];

    const resource = process.env.COREDATA_URL;
    const table = process.env.COREDATA_KUNDE_TABEL;
    if (!resource || !table) return [];

    const token = await getUnicontaToken(resource);
    if (!token) return [];

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0"
    };

    const kundeUrl =
      `${resource}/api/data/v9.2/${table}?$select=cr1eb_lch_kundeid,cr1eb_lch_kundenr&` +
      `$filter=${encodeURIComponent(`cr1eb_lch_kundenr eq '${escODataString(kundenr)}'`)}&$top=1`;

    const kundeRes = await fetch(kundeUrl, { headers });
    if (!kundeRes.ok) return [];
    const kundeData = await kundeRes.json();
    const kunde = (kundeData.value || [])[0];
    if (!kunde) return [];

    const adresseUrl =
      `${resource}/api/data/v9.2/cr1eb_lch_kundeadresses?` +
      `$select=cr1eb_lch_adressekey,cr1eb_lch_adresse,cr1eb_lch_postnr,cr1eb_lch_by&` +
      `$filter=${encodeURIComponent(`_cr1eb_lch_kunde_value eq '${kunde.cr1eb_lch_kundeid}'`)}&$top=50`;

    const adresseRes = await fetch(adresseUrl, { headers });
    if (!adresseRes.ok) return [];
    const adresseData = await adresseRes.json();

    // Produkter pr. adresse (samme kilde/logik som /api/kunde-adresser), så
    // kundesurvey.js kan vise hvilke produkter der er registreret på hver
    // leveringsadresse, ligesom på admincreate-siden.
    const produktUrl =
      `${resource}/api/data/v9.2/cr1eb_lch_kundeprodukts?` +
      `$select=cr1eb_lch_adressekey,cr1eb_lch_produkt,cr1eb_lch_aktiv&` +
      `$filter=${encodeURIComponent(`cr1eb_lch_kundenr eq '${escODataString(kunde.cr1eb_lch_kundenr || kundenr)}'`)}&$top=5000`;

    const countsByAddressKey = {};
    try {
      const produktRes = await fetch(produktUrl, { headers });
      if (produktRes.ok) {
        const produktData = await produktRes.json();
        for (const p of (produktData.value || [])) {
          const aktiv = p.cr1eb_lch_aktiv ?? true;
          if (!aktiv) continue;

          const key = p.cr1eb_lch_adressekey || "";
          const produkt = p.cr1eb_lch_produkt || "Ukendt";
          if (!countsByAddressKey[key]) countsByAddressKey[key] = {};
          countsByAddressKey[key][produkt] = (countsByAddressKey[key][produkt] || 0) + 1;
        }
      }
    } catch {
      // Produkter er kun til info – fejl her skal ikke blokere resten af siden.
    }

    return (adresseData.value || []).map(a => {
      const counts = countsByAddressKey[a.cr1eb_lch_adressekey || ""] || {};
      const produkter = Object.entries(counts)
        .map(([produkt, antal]) => ({ produkt, antal }))
        .sort((x, y) => y.antal - x.antal || x.produkt.localeCompare(y.produkt, "da"));

      return {
        adresse: a.cr1eb_lch_adresse || "",
        postnr: a.cr1eb_lch_postnr || "",
        by: a.cr1eb_lch_by || "",
        produkter
      };
    });
  } catch {
    return [];
  }
}

module.exports = async function (context, req) {
  try {
    const code = String(req?.body?.code || "").trim();
    if (!code) return json(context, 400, { error: "missing_code", message: "Mangler code i body." });

    // 1) Find kundeundersøgelse på kode
    const instPath =
      `cr175_lch_kundeinfo_kundeundersoegelses` +
      `?$select=cr175_lch_kundeinfo_kundeundersoegelseid,cr175_lch_kode,cr175_lch_kundenavn,cr175_lch_kundenummer,cr175_lch_udloebstidspunkt,cr175_lch_status` +
      `&$filter=${encodeURIComponent(`cr175_lch_kode eq '${escODataString(code)}'`)}` +
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
    const status = await getStatusValues().catch(() => ({ AFSLUTTET: null }));
    if (status.AFSLUTTET != null && Number(inst.cr175_lch_status) === status.AFSLUTTET) {
      return json(context, 409, {
        error: "already_completed",
        message: "Surveyen er allerede gennemført."
      });
    }

    const instanceId = inst.cr175_lch_kundeinfo_kundeundersoegelseid;
    const customerName = inst.cr175_lch_kundenavn || "";
    const kundenr = inst.cr175_lch_kundenummer || "";

    // 2) Hent spørgeskemasvar for denne kundeundersøgelse + udvid spørgsmål + gruppe
    const rowsPath =
      `cr175_lch_kundeinfo_spoergeskemasvars` +
      `?$select=cr175_lch_kundeinfo_spoergeskemasvarid,cr175_lch_unik,cr175_lch_prefillvaerdi,cr175_lch_svarvaerdi,cr175_lch_gentagelsesindeks,_cr175_lch_spoergsmaal_value` +
      `&$filter=${encodeURIComponent(`_cr175_lch_kundeundersoegelse_value eq ${instanceId}`)}` +
      `&$expand=${encodeURIComponent(
        `cr175_lch_spoergsmaal($select=cr175_lch_kundeinfo_spoergsmaalid,cr175_lch_nummer,cr175_lch_spoergsmaalstekst,cr175_lch_forklaring,cr175_lch_svartype,cr175_lch_paakraevet,cr175_lch_sorteringsnummer;` +
        `$expand=cr175_lch_spoergsmaalsgruppe($select=cr175_lch_kundeinfo_spoergsmaalsgruppeid,cr175_lch_titel,cr175_lch_description,cr175_lch_sorteringsnummer,cr175_lch_kangentages))`
      )}`;

    const rowsRes = await dvFetch(rowsPath, {
      headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' }
    });
    const rowsData = await rowsRes.json();
    const rows = rowsData?.value || [];

    if (!rows.length) {
      return json(context, 404, {
        error: "no_items",
        message: "Ingen spørgsmål fundet for denne kode."
      });
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
          repeatable: g ? !!g.cr175_lch_kangentages : false
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

    // 4) Find max repeatIndex pr. gruppe (både fra admin-oprettede rækker og
    //    fra kundens egne besvarede gentagelser)
    const maxRepeatByGroup = new Map();
    for (const [groupId, riSet] of repeatIndexesByGroup) {
      maxRepeatByGroup.set(groupId, Math.max(...riSet));
    }

    // 5) Byg den flade items-liste (inkl. gentagelser) som frontend renderer
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

    const kundeAdresser = await fetchKundeAdresser(kundenr);

    return json(context, 200, { code, customerName, groups, items, kundeAdresser });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
