// /api/_pdf/buildSurveyPdf.js
//
// Bygger en PDF-kopi af et udfyldt kundespørgeskema (grupper, spørgsmål og
// kundens svar – falder tilbage til "Vores info"-prefill hvis kunden ikke
// selv har rettet feltet), til brug som vedhæftet fil på "afsluttet
// skema"-mailen.
//
// Bruger pdfkit (rent JS, ingen native afhængigheder eller headless
// browser), fordi survey-submit kører som en Azure Static Web Apps Managed
// Function, hvor et tungt headless-browser-bibliotek er upraktisk (stor
// pakke, langsom cold start, risiko for timeout). PDF'en bliver derfor IKKE
// pixel-for-pixel identisk med kundesurvey.html, men indeholder samme
// grupper/spørgsmål/svar i et pænt, læsbart layout.

// Kræves "lazy" (inde i buildSurveyPdf, ikke her øverst) med vilje: et
// top-level require af et npm-modul der ikke er installeret får HELE
// Azure Function-kaldet til at crashe med et tomt 500-svar, før noget som
// helst af vores egen fejlhåndtering når at køre. Ved at kræve pdfkit
// først når funktionen rent faktisk bruges, og i et try/catch, kan en
// manglende pakke i stedet fanges og rapporteres pænt som "pdfError" i
// JSON-svaret.
function getPdfDocumentClass() {
  try {
    return require("pdfkit");
  } catch (e) {
    throw new Error(
      "pdfkit er ikke installeret i api-mappen (require fejlede: " + (e?.message || e) + "). " +
      "Kør 'npm install pdfkit' i api-mappen og commit package.json/package-lock.json."
    );
  }
}

function groupItemsByGroupAndRepeat(items) {
  const byGroup = new Map();
  for (const it of items) {
    if (!byGroup.has(it.groupId)) byGroup.set(it.groupId, new Map());
    const byRepeat = byGroup.get(it.groupId);
    if (!byRepeat.has(it.repeatIndex)) byRepeat.set(it.repeatIndex, []);
    byRepeat.get(it.repeatIndex).push(it);
  }
  return byGroup;
}

function displayValue(it) {
  const val = String(it.savedValue || "").trim();
  if (val) return val;
  const prefill = String(it.prefillText || "").trim();
  return prefill || "(ikke besvaret)";
}

/**
 * @param {{ customerName: string, code: string, groups: any[], items: any[] }} data
 * @returns {Promise<Buffer>}
 */
function buildSurveyPdf({ customerName, code, groups, items }) {
  return new Promise((resolve, reject) => {
    try {
      const PDFDocument = getPdfDocumentClass();
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(18).fillColor("#000").text(`Spørgeskema – ${customerName || "(uden navn)"}`);
      doc.fontSize(10).fillColor("#555").text(`Kode: ${code}`);
      doc.moveDown(1);
      doc.fillColor("#000");

      const byGroup = groupItemsByGroupAndRepeat(items);
      const sortedGroups = [...groups].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

      const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

      for (const group of sortedGroups) {
        const byRepeat = byGroup.get(group.id);
        if (!byRepeat) continue;

        const repeatIndexes = [...byRepeat.keys()].sort((a, b) => a - b);

        for (const ri of repeatIndexes) {
          const rowItems = byRepeat.get(ri).sort((a, b) => a.sortKey - b.sortKey);
          if (!rowItems.length) continue;

          // Ny side hvis der ikke er plads til overskrift + mindst ét spørgsmål
          if (doc.y > bottomLimit() - 90) doc.addPage();

          doc.fontSize(13).fillColor("#7a1f1f")
            .text(group.repeatable && ri > 0 ? `${group.title} – ${ri + 1}` : group.title);
          doc.moveDown(0.3);
          doc.fillColor("#000");

          for (const it of rowItems) {
            if (doc.y > bottomLimit() - 55) doc.addPage();

            doc.fontSize(10).fillColor("#444").text(it.text || "");
            doc.fontSize(11).fillColor("#000").text(displayValue(it));
            doc.moveDown(0.6);
          }

          doc.moveDown(0.4);
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildSurveyPdf };
