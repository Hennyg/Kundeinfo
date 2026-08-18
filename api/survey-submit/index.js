// /api/survey-submit/index.js
//
// Gemmer/opdaterer kundens svar direkte på cr175_lch_kundeinfo_spoergeskemasvars
// (samme tabel som holder admins prefill). Match sker på
// (kundeundersoegelse, spoergsmaal, gentagelsesindeks) – findes rækken ikke
// (kunden har selv tilføjet en gentagelse), oprettes den.

const { cdFetch: dvFetch } = require("../_coredata");
const { getStatusValues } = require("../_kundeundersoegelseStatus");
const { graph } = require("../_graph/graph");

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
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Sender en mail til adresserne i Application Setting "Kundeinfo_Afsluttet_survey"
// når en kunde afslutter et spørgeskema. Fejl her må ikke vælte selve
// indsendelsen af skemaet, så alt er wrappet i try/catch.
async function sendAfsluttetMail(context, { kundenavn, kundenummer, code, req }) {
  try {
    const recipients = String(process.env.Kundeinfo_Afsluttet_survey || "")
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean);

    if (!recipients.length) {
      context.log("Kundeinfo_Afsluttet_survey er ikke sat (eller tom) – ingen mail sendt.");
      return;
    }

    const fromMailbox = String(process.env.KUNDEINFO_MAIL_FROM || "").trim();
    if (!fromMailbox) {
      context.log("KUNDEINFO_MAIL_FROM er ikke sat – ingen mail sendt.");
      return;
    }

    const host = req.headers["x-forwarded-host"];
    const origin = host ? `https://${host}` : "";
    const link = origin ? `${origin}/kundesurvey.html?code=${encodeURIComponent(code)}&ro=1` : "";

    const kundeLabel = kundenavn || kundenummer || "(ukendt kunde)";
    const subjectPrefix = `Spørgeskema ${code}${kundenavn ? ` – ${kundenavn}` : ""}${kundenummer ? ` (${kundenummer})` : ""}`;

    const subject = `Kunde ${kundenavn || kundenummer || ""} har afsluttet spørgeskema ${code}`;
    const htmlBody = `
      <div style="font-family:'Segoe UI', Arial, sans-serif; max-width:620px; margin:0 auto;">
        <div style="background:#1f6c7a; color:#fff; padding:16px 22px; border-radius:10px 10px 0 0;">
          <div style="font-size:16px; font-weight:700;">${escapeHtml(subjectPrefix)}</div>
        </div>
        <div style="border:1px solid #e3e3e3; border-top:none; border-radius:0 0 10px 10px; padding:18px 22px; background:#fff;">
          <div style="padding:10px 0; border-bottom:1px solid #f0f0f0;">
            <div style="font-weight:600; color:#222; font-size:14px;">Kunde</div>
            <div style="color:#444; font-size:14px; margin-top:2px;">
              ${escapeHtml(kundeLabel)}${kundenummer ? ` (${escapeHtml(kundenummer)})` : ""}
            </div>
          </div>
          <div style="padding:10px 0; border-bottom:1px solid #f0f0f0;">
            <div style="font-weight:600; color:#222; font-size:14px;">Status</div>
            <div style="color:#444; font-size:14px; margin-top:2px;">Spørgeskemaet er afsluttet af kunden.</div>
          </div>
          ${link ? `
            <div style="padding:16px 0 4px; text-align:center;">
              <a href="${link}" style="display:inline-block; background:#1f6c7a; color:#fff; text-decoration:none; padding:10px 20px; border-radius:8px; font-weight:600; font-size:14px;">
                Se besvarelsen
              </a>
            </div>
          ` : ""}
        </div>
      </div>
    `;

    await graph("POST", `/users/${encodeURIComponent(fromMailbox)}/sendMail`, {
      message: {
        subject,
        body: { contentType: "HTML", content: htmlBody },
        toRecipients: recipients.map(address => ({ emailAddress: { address } }))
      },
      saveToSentItems: false
    });
  } catch (e) {
    context.log.error("Kunne ikke sende 'afsluttet skema'-mail:", e);
  }
}

module.exports = async function (context, req) {
  try {
    const code = String(req?.body?.code || "").trim();
    const answers = Array.isArray(req?.body?.answers) ? req.body.answers : [];
    const removed = Array.isArray(req?.body?.removed) ? req.body.removed : [];

    if (!code) return json(context, 400, { error: "missing_code", message: "Mangler code." });
    if (!answers.length && !removed.length) {
      return json(context, 400, { error: "missing_answers", message: "Ingen svar modtaget." });
    }

    // 1) Find kundeundersøgelse via kode
    const instPath =
      `cr175_lch_kundeinfo_kundeundersoegelses` +
      `?$select=cr175_lch_kundeinfo_kundeundersoegelseid,cr175_lch_kode,cr175_lch_kundenavn,cr175_lch_kundenummer` +
      `&$filter=${encodeURIComponent(`cr175_lch_kode eq '${escODataString(code)}'`)}` +
      `&$top=1`;

    const instRes = await dvFetch(instPath);
    const instData = await instRes.json();
    const inst = (instData?.value || [])[0];
    if (!inst) return json(context, 404, { error: "invalid_code", message: "Ugyldig kode." });

    const instanceId = inst.cr175_lch_kundeinfo_kundeundersoegelseid;

    let created = 0, updated = 0, deleted = 0, skipped = 0;
    let newRowCounter = 0;

    // 2) Gem/opdatér svar – match på (kundeundersoegelse, spoergsmaal, gentagelsesindeks)
    for (const a of answers) {
      const questionId = String(a.questionId || "").trim();
      const repeatIndex = Number.isFinite(Number(a.repeatIndex)) ? Number(a.repeatIndex) : 0;
      const value = a.value == null ? null : String(a.value);

      if (!questionId) { skipped++; continue; }

      const findPath =
        `cr175_lch_kundeinfo_spoergeskemasvars` +
        `?$select=cr175_lch_kundeinfo_spoergeskemasvarid` +
        `&$filter=${encodeURIComponent(
          `_cr175_lch_kundeundersoegelse_value eq ${instanceId} and _cr175_lch_spoergsmaal_value eq ${questionId} and cr175_lch_gentagelsesindeks eq ${repeatIndex}`
        )}` +
        `&$top=1`;

      let existingId = null;
      try {
        const fr = await dvFetch(findPath);
        const fd = await fr.json();
        existingId = (fd?.value || [])[0]?.cr175_lch_kundeinfo_spoergeskemasvarid || null;
      } catch (e) {
        return json(context, 500, { error: "answer_find_failed", message: e.message || String(e) });
      }

      if (existingId) {
        await dvFetch(`cr175_lch_kundeinfo_spoergeskemasvars(${existingId})`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cr175_lch_svarvaerdi: value,
            cr175_lch_gentagelsesindeks: repeatIndex
          })
        });
        updated++;
      } else {
        newRowCounter++;
        await dvFetch(`cr175_lch_kundeinfo_spoergeskemasvars`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cr175_lch_unik: `SVAR-${code}-NY-${newRowCounter}`,
            cr175_lch_svarvaerdi: value,
            cr175_lch_gentagelsesindeks: repeatIndex,
            "cr175_lch_kundeundersoegelse@odata.bind": `/cr175_lch_kundeinfo_kundeundersoegelses(${instanceId})`,
            "cr175_lch_spoergsmaal@odata.bind": `/cr175_lch_kundeinfo_spoergsmaals(${questionId})`
          })
        });
        created++;
      }
    }

    // 3) Slet svar for gentagelser kunden har fjernet
    for (const rem of removed) {
      const questionId = String(rem.questionId || "").trim();
      const repeatIndex = Number.isFinite(Number(rem.repeatIndex)) ? Number(rem.repeatIndex) : 0;
      if (!questionId) continue;

      const findPath =
        `cr175_lch_kundeinfo_spoergeskemasvars` +
        `?$select=cr175_lch_kundeinfo_spoergeskemasvarid` +
        `&$filter=${encodeURIComponent(
          `_cr175_lch_kundeundersoegelse_value eq ${instanceId} and _cr175_lch_spoergsmaal_value eq ${questionId} and cr175_lch_gentagelsesindeks eq ${repeatIndex}`
        )}` +
        `&$top=1`;

      const fr = await dvFetch(findPath);
      const fd = await fr.json();
      const existingId = (fd?.value || [])[0]?.cr175_lch_kundeinfo_spoergeskemasvarid || null;

      if (existingId) {
        await dvFetch(`cr175_lch_kundeinfo_spoergeskemasvars(${existingId})`, { method: "DELETE" });
        deleted++;
      }
    }

    // --- Markér survey som gennemført/startet ---
    const finalize = !!req?.body?.finalize;
    const status = await getStatusValues().catch(() => ({ AFSLUTTET: null, STARTET: null }));

    const nextStatus = finalize ? status.AFSLUTTET : status.STARTET;
    if (nextStatus != null) {
      await dvFetch(`cr175_lch_kundeinfo_kundeundersoegelses(${instanceId})`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cr175_lch_status: nextStatus })
      });
    }

    if (finalize) {
      await sendAfsluttetMail(context, {
        kundenavn: inst.cr175_lch_kundenavn || "",
        kundenummer: inst.cr175_lch_kundenummer || "",
        code,
        req
      });
    }

    return json(context, 200, { ok: true, created, updated, deleted, skipped, finalize });
  } catch (err) {
    context.log.error(err);
    return json(context, 500, { error: "server_error", message: err.message || String(err) });
  }
};
