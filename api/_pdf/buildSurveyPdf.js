// /api/_pdf/buildSurveyPdf.js
//
// Bygger en PDF-kopi af et udfyldt kundespørgeskema (grupper, spørgsmål og
// kundens svar – falder tilbage til "Vores info"-prefill hvis kunden ikke
// selv har rettet feltet), til brug som vedhæftet fil på mails om skemaet.
//
// Designet efterligner farver/opbygning fra opsummerings-mailen (den teal
// header-bar, gruppe-overskrifter, spørgsmål/svar-rækker – se
// buildAreaEmailHtml i kundesurvey.js), bare tegnet direkte med pdfkit i
// stedet for HTML/CSS.
//
// Bruger pdfkit (rent JS, ingen native afhængigheder eller headless
// browser), fordi funktionerne der kalder denne kører som Azure Static Web
// Apps Managed Functions, hvor et tungt headless-browser-bibliotek er
// upraktisk (stor pakke, langsom cold start, risiko for timeout).

const TEAL = "#1f6c7a";
const TEXT_DARK = "#222222";
const TEXT_ANSWER = "#444444";
const BORDER_LIGHT = "#e3e3e3";
const MUTED = "#666666";

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
      const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const leftX = doc.page.margins.left;
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

      // --- Teal header-bar (samme farve/stil som toppen af opsummerings-mailen) ---
      function drawHeaderBar() {
        const startY = doc.y;
        const barHeight = 54;
        doc.rect(leftX, startY, contentWidth, barHeight).fill(TEAL);

        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(15)
          .text(`Spørgeskema – ${customerName || "(uden navn)"}`, leftX + 16, startY + 12, {
            width: contentWidth - 32
          });
        doc.font("Helvetica").fontSize(9).fillColor("#e6f0f2")
          .text(`Kode: ${code}`, leftX + 16, startY + 34, { width: contentWidth - 32 });

        doc.x = leftX;
        doc.y = startY + barHeight + 20;
        doc.fillColor(TEXT_DARK);
      }

      drawHeaderBar();

      const byGroup = groupItemsByGroupAndRepeat(items);
      const sortedGroups = [...groups].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

      // --- Gruppe-overskrift: store bogstaver, teal, med en teal streg under
      //     (efterligner .text-transform:uppercase + border-bottom:2px teal
      //     fra mailen) ---
      function drawGroupHeading(text) {
        doc.x = leftX;
        doc.font("Helvetica-Bold").fontSize(10).fillColor(TEAL)
          .text(text.toUpperCase(), { width: contentWidth, characterSpacing: 0.6 });
        const lineY = doc.y + 4;
        doc.moveTo(leftX, lineY).lineTo(leftX + contentWidth, lineY).lineWidth(1.5).strokeColor(TEAL).stroke();
        doc.y = lineY + 10;
        doc.x = leftX;
      }

      // --- "Nr. X"-label mellem gentagelser (samme som mailens skillelinje
      //     mellem fx flere ejere/kontakter) ---
      function drawRepeatLabel(n) {
        const lineY = doc.y + 2;
        doc.save();
        doc.dash(2, { space: 2 }).moveTo(leftX, lineY).lineTo(leftX + contentWidth, lineY)
          .lineWidth(0.75).strokeColor(BORDER_LIGHT).stroke();
        doc.undash();
        doc.restore();
        doc.x = leftX;
        doc.y = lineY + 8;
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text(`Nr. ${n}`);
        doc.y += 6;
        doc.x = leftX;
      }

      // --- Spørgsmål/svar-række: fed spørgsmålstekst, svar under i gråt,
      //     tynd bundlinje (samme som .rowFor i mailen) ---
      function drawQaRow(question, answer) {
        doc.x = leftX;
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(TEXT_DARK)
          .text(question || "", { width: contentWidth });
        doc.x = leftX;
        doc.moveDown(0.15);
        doc.font("Helvetica").fontSize(10.5).fillColor(TEXT_ANSWER)
          .text(answer, { width: contentWidth });

        const lineY = doc.y + 8;
        doc.moveTo(leftX, lineY).lineTo(leftX + contentWidth, lineY)
          .lineWidth(0.5).strokeColor("#f0f0f0").stroke();
        doc.x = leftX;
        doc.y = lineY + 8;
      }

      for (const group of sortedGroups) {
        const byRepeat = byGroup.get(group.id);
        if (!byRepeat) continue;

        const repeatIndexes = [...byRepeat.keys()].sort((a, b) => a - b);

        for (const ri of repeatIndexes) {
          const rowItems = byRepeat.get(ri).sort((a, b) => a.sortKey - b.sortKey);
          if (!rowItems.length) continue;

          // Ny side hvis der ikke er plads til overskrift + mindst ét spørgsmål
          if (doc.y > bottomLimit() - 100) doc.addPage();

          if (ri === 0) {
            drawGroupHeading(group.title);
          } else if (group.repeatable) {
            drawRepeatLabel(ri + 1);
          }

          for (const it of rowItems) {
            if (doc.y > bottomLimit() - 60) doc.addPage();
            drawQaRow(it.text, displayValue(it));
          }

          doc.moveDown(0.3);
        }
      }

      // --- Sidetal nederst på hver side. Sat margins.bottom=0 midlertidigt,
      //     ellers kan selve det at skrive tæt på sidens bund trigge
      //     pdfkits automatiske sidetilføjelse (en tom ekstra side). ---
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        const originalBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font("Helvetica").fontSize(8).fillColor(MUTED)
          .text(`Side ${i + 1} af ${pageCount}`, leftX, doc.page.height - 30, {
            width: contentWidth,
            align: "center",
            lineBreak: false
          });
        doc.page.margins.bottom = originalBottomMargin;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildSurveyPdf };
