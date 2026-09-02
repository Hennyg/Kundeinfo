// /api/survey-create/index.js
//
// Opretter en ny kundeundersøgelse (uden skabelon – der er kun ét skema) og en
// cr175_lch_kundeinfo_spoergeskemasvars-række pr. spørgsmål/gentagelse med det
// admin har forudfyldt.

const { cdFetch: dvFetch } = require("../_coredata");
const { STATUS } = require("../_surveyStatus");
const crypto = require("crypto");

function json(context, status, body) {
  context.res = {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body
  };
}

function randomCode6() {
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, "0");
}

function safeIsoOrNull(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function escODataString(s) {
  return String(s ?? "").replace(/'/g, "''");
}

async function codeExists(code) {
  const filter = `cr175_lch_kode eq '${escODataString(code)}'`;
  const r = await dvFetch(
    `cr175_lch_kundeinfo_kundeundersoegelses?$select=cr175_lch_kundeinfo_kundeundersoegelseid&$filter=${encodeURIComponent(filter)}&$top=1`
  );
  const data = await r.json();
  return (data?.value || []).length > 0;
}

async function generateUniqueCode(maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    const c = randomCode6();
    if (!(await codeExists(c))) return c;
  }
  throw new Error("Kunne ikke generere unik 6-cifret kode. Prøv igen.");
}

// ✅ Normaliser input så vi altid ender med: [{ questionId, repeatIndex, prefillText }]
function normalizePrefillItems(p) {
  const items = Array.isArray(p.prefillItems) ? p.prefillItems : [];
  return items
    .map(x => ({
      questionId: String(x?.questionId || "").trim(),
      repeatIndex: Math.max(0, Number.parseInt(x?.repeatIndex ?? 0, 10) || 0),
      prefillText: (x?.prefillText ?? "").toString().trim() || null,
      addedByAdmin: !!x?.addedByAdmin
    }))
    .filter(x => x.questionId);
}

module.exports = async function (context, req) {
  try {
    const p = req.body || {};

    const customerName = (p.customerName ?? "").toString().trim() || null;
    const customerNumber = (p.customerNumber ?? "").toString().trim() || null;
    const expiresAt = safeIsoOrNull(p.expiresAt);

    if (!customerName) {
      return json(context, 400, { error: "missing_customerName", message: "Mangler customerName." });
    }

    const prefillItems = normalizePrefillItems(p);
    if (!prefillItems.length) {
      return json(context, 400, { error: "missing_questions", message: "Ingen spørgsmål at oprette." });
    }

    const code = await generateUniqueCode();

    const instanceBody = {
      cr175_lch_kode: code,
      cr175_lch_kundenavn: customerName,
      cr175_lch_kundenummer: customerNumber,
      // Altid "Kladde" ved selve oprettelsen - bliver til "Afventer" af
      // survey-send-invite-mail, hvis/når mailen rent faktisk sendes.
      cr175_lch_nystatus: STATUS.KLADDE
    };
    if (expiresAt) instanceBody.cr175_lch_udloebstidspunkt = expiresAt;

    const rCreate = await dvFetch("cr175_lch_kundeinfo_kundeundersoegelses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instanceBody)
    });

    const location = rCreate.headers.get("OData-EntityId") || rCreate.headers.get("odata-entityid");
    const instanceId = location?.match(/\(([^)]+)\)/)?.[1];
    if (!instanceId) {
      return json(context, 500, { error: "missing_instance_id", detail: location });
    }

    for (let i = 0; i < prefillItems.length; i++) {
      const item = prefillItems[i];

      const rowBody = {
        // "-ADMIN-" markerer at DEN DER OPRETTER SKEMAET selv har tilføjet
        // denne gentagelse (fx en ekstra leveringsadresse/kontakt) i Prefill,
        // ud over det Uniconta/Entra allerede kendte - bruges af survey-start
        // til at vise en anden farve/badge end kundens egne rettelser.
        cr175_lch_unik: `SVAR-${code}-${i + 1}${item.addedByAdmin ? "-ADMIN-" : ""}`,
        cr175_lch_gentagelsesindeks: item.repeatIndex,
        cr175_lch_prefillvaerdi: item.prefillText,
        "cr175_lch_kundeundersoegelse@odata.bind": `/cr175_lch_kundeinfo_kundeundersoegelses(${instanceId})`,
        "cr175_lch_spoergsmaal@odata.bind": `/cr175_lch_kundeinfo_spoergsmaals(${item.questionId})`
      };

      const rItem = await dvFetch("cr175_lch_kundeinfo_spoergeskemasvars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rowBody)
      });

      if (!rItem.ok) {
        return json(context, 500, {
          error: "dv_create_answerrow_failed",
          detail: await rItem.text(),
          questionId: item.questionId,
          repeatIndex: item.repeatIndex
        });
      }
    }

    const host = req.headers["x-forwarded-host"];
    const origin = host ? `https://${host}` : "";
    const link = origin ? `${origin}/kundesurvey.html?code=${encodeURIComponent(code)}` : null;

    return json(context, 201, { instanceId, code, link });

  } catch (err) {
    context.log.error("survey-create crashed:", err);
    return json(context, 500, { error: "server_error", detail: err.message, stack: String(err.stack || "") });
  }
};
