// /api/_survey/filterLeveringsadresser.js
//
// Fjerner leveringsadresser uden produkter (ifølge kundelisten) fra et
// skemas items, før de bruges i PDF-kopien. Samme regel som
// filterLeveringsadresseEntries() i frontend/assets/kundesurvey.js, som
// gør det samme for opsummeringsvinduet og -mailen - ret begge steder.
//
// Regel pr. leveringsadresse-blok (gentagelse i gruppen "Leveringsadresse"):
//   - blokken vises, hvis adressen (forudfyldt ELLER kundens rettede) findes
//     på kundelisten med mindst ét aktivt produkt
//   - blokken vises altid, hvis kunden selv har tilføjet den (ny adresse)
//   - ellers fjernes den
// Er der ingen blokke tilbage, indsættes én linje "Ingen leveringsadresse"
// (plus "Gårdens kontakt mailadresse", som gælder hele gruppen).
//
// Kan kundelisten ikke hentes, eller har kunden ingen adresser der, filtreres
// der ikke - så kan vi ikke vide hvilke adresser der er forkerte.

const { getKundeAdresserMedProdukter } = require("../_kundeAdresser");

const LEVERINGSADRESSE_TITEL = "leveringsadresse";
const LINJE1_NR = "0090";
const LINJE2_NR = "0100";
const MAIL_NR = "0110";
const INGEN_TEKST = "Ingen leveringsadresse";

function norm(s) {
  return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formatAdresse(a) {
  const cityLine = [a.postnr, a.by].filter(Boolean).join(" ");
  return [a.adresse, cityLine].filter(Boolean).join(", ");
}

async function filterLeveringsadresser({ items, groups, kundenummer }, log = () => {}) {
  const group = (groups || []).find(g => norm(g.title) === LEVERINGSADRESSE_TITEL);
  if (!group || !kundenummer) return items;

  const groupItems = items.filter(it => it.groupId === group.id);
  if (!groupItems.length) return items;

  let adresser;
  try {
    adresser = (await getKundeAdresserMedProdukter(kundenummer)).adresser || [];
  } catch (e) {
    log(`filterLeveringsadresser: kundelisten kunne ikke hentes (${e.message}) - filtrerer ikke.`);
    return items;
  }
  if (!adresser.length) return items;

  const withProducts = new Set(
    adresser.filter(a => (a.produkter || []).length > 0).map(a => norm(formatAdresse(a)))
  );

  const byRepeat = new Map();
  for (const it of groupItems) {
    if (!byRepeat.has(it.repeatIndex)) byRepeat.set(it.repeatIndex, []);
    byRepeat.get(it.repeatIndex).push(it);
  }

  const keepRepeats = [];
  for (const [ri, rowItems] of [...byRepeat.entries()].sort((a, b) => a[0] - b[0])) {
    const l1 = rowItems.find(it => String(it.number) === LINJE1_NR);
    const l2 = rowItems.find(it => String(it.number) === LINJE2_NR);
    const prefillAddr = [l1?.prefillText, l2?.prefillText].map(s => String(s || "").trim()).filter(Boolean).join(", ");
    const finalAddr = [l1, l2]
      .map(it => String(it?.savedValue || "").trim() || String(it?.prefillText || "").trim())
      .filter(Boolean).join(", ");

    const addedByCustomer = rowItems.every(it => it.addedByCustomer);
    const hasProducts = withProducts.has(norm(prefillAddr)) || withProducts.has(norm(finalAddr));

    if (addedByCustomer || hasProducts) keepRepeats.push(ri);
    else log(`filterLeveringsadresser: skjuler "${finalAddr || prefillAddr}" (ingen produkter på kundelisten).`);
  }

  const others = items.filter(it => it.groupId !== group.id);
  let kept;

  if (keepRepeats.length) {
    // Nummerér de tilbageværende blokke 0..n-1, så PDF'en tegner gruppe-
    // overskriften (ri 0) og "Nr. 2", "Nr. 3" … i rækkefølge.
    kept = [];
    keepRepeats.forEach((ri, newRi) => {
      for (const it of byRepeat.get(ri)) kept.push({ ...it, repeatIndex: newRi });
    });
  } else {
    const first = byRepeat.get(Math.min(...byRepeat.keys())) || [];
    const l1 = first.find(it => String(it.number) === LINJE1_NR) || first[0];
    const mail = first.find(it => String(it.number) === MAIL_NR);
    kept = [{
      ...l1,
      itemId: null,
      repeatIndex: 0,
      number: LINJE1_NR,
      text: "Leveringsadresse",
      prefillText: "",
      savedValue: INGEN_TEKST,
      addedByCustomer: false,
      removed: false
    }];
    if (mail) kept.push({ ...mail, repeatIndex: 0 });
  }

  // Bevar den oprindelige sortering (gruppe -> spørgsmål -> gentagelse).
  const result = [...others, ...kept];
  const sortOf = new Map((groups || []).map(g => [g.id, g.sort ?? 0]));
  result.sort((a, b) => {
    const gs = (sortOf.get(a.groupId) ?? 0) - (sortOf.get(b.groupId) ?? 0);
    if (gs !== 0) return gs;
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return a.repeatIndex - b.repeatIndex;
  });
  return result;
}

module.exports = { filterLeveringsadresser, INGEN_TEKST };
