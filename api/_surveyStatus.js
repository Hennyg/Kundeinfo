// /api/_surveyStatus.js
//
// cr175_lch_nystatus er et almindeligt tekstfelt (IKKE et Dataverse
// choice-felt) - vi styrer selv de gyldige værdier og deres rækkefølge her,
// så en ny status kan tilføjes med en kodeændring i stedet for at skulle
// redigere et options-sæt i Dataverse og gætte dets bagvedliggende tal
// (sådan som det gamle cr175_lch_status/​_kundeundersoegelseStatus.js gjorde).

const { cdFetch: dvFetch } = require("./_coredata");

const STATUS = {
  KLADDE: "Kladde",       // Oprettet, men mail er ikke sendt endnu
  AFVENTER: "Afventer",   // Mail sendt, kunden har ikke åbnet linket endnu
  SET: "Set",             // Kunden har åbnet linket, men ikke skrevet noget endnu
  IGANG: "Igang",         // Kunden har gemt mindst ét svar (autosave)
  UDFYLDT: "Udfyldt",     // Kunden har trykket "Gem og afslut"
  AFSLUTTET: "Afsluttet"  // Internt: "Send alle mail" er trykket på "Se skema"-siden
};

// Rækkefølgen en kundeundersøgelse naturligt bevæger sig igennem. Bruges til
// at undgå at status ved en fejl "går baglæns" - fx at en admin der åbner
// "Se skema" (ro=1) eller genindlæser kundens link ikke nulstiller en
// allerede fremskreden status som "Udfyldt" tilbage til "Set".
const STATUS_RANK = {
  [STATUS.KLADDE]: 0,
  [STATUS.AFVENTER]: 1,
  [STATUS.SET]: 2,
  [STATUS.IGANG]: 3,
  [STATUS.UDFYLDT]: 4,
  [STATUS.AFSLUTTET]: 5
};

function rankOf(status) {
  return STATUS_RANK[status] ?? -1;
}

async function getCurrentStatus(instanceId) {
  const r = await dvFetch(
    `cr175_lch_kundeinfo_kundeundersoegelses(${instanceId})?$select=cr175_lch_nystatus`
  );
  const data = await r.json();
  return data?.cr175_lch_nystatus || "";
}

// Sætter status uden noget rækkefølge-tjek - bruges kun ved selve oprettelsen,
// hvor der ikke findes en tidligere status at sammenligne med.
async function setStatus(instanceId, status) {
  await dvFetch(`cr175_lch_kundeinfo_kundeundersoegelses(${instanceId})`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "If-Match": "*" },
    body: JSON.stringify({ cr175_lch_nystatus: status })
  });
}

// Flytter status fremad i rækkefølgen ovenfor, men ændrer aldrig noget hvis
// den nuværende status allerede er lige så langt fremme eller længere.
// Returnerer true hvis status blev opdateret, false hvis intet skete.
async function advanceStatus(instanceId, targetStatus) {
  const current = await getCurrentStatus(instanceId);
  if (rankOf(targetStatus) <= rankOf(current)) return false;
  await setStatus(instanceId, targetStatus);
  return true;
}

module.exports = { STATUS, STATUS_RANK, setStatus, advanceStatus, getCurrentStatus };
