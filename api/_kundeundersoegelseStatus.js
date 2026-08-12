// /api/_kundeundersoegelseStatus.js
//
// cr175_lch_status er et lokalt choice-felt på cr175_lch_kundeinfo_kundeundersoegelse.
// Vi kender ikke de rå heltal-værdier Dataverse har tildelt (de afhænger af hvordan
// feltet blev oprettet i Maker Portal), så vi slår dem op dynamisk via metadata og
// matcher på label-tekst i stedet for at gætte på tal.

const { dvFetch } = require('./_dataverse');

let cache = null; // { byLabel: Map(lowercased label -> value), options: [{value,label}] }

async function loadStatusOptions() {
  if (cache) return cache;

  const path =
    `EntityDefinitions(LogicalName='cr175_lch_kundeinfo_kundeundersoegelse')/` +
    `Attributes(LogicalName='cr175_lch_status')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata` +
    `?$select=LogicalName&$expand=OptionSet($select=Options)`;

  const r = await dvFetch(path);
  const meta = await r.json();
  const options = (meta?.OptionSet?.Options || []).map(o => ({
    value: o.Value,
    label: o.Label?.UserLocalizedLabel?.Label || String(o.Value)
  }));

  const byLabel = new Map();
  for (const o of options) byLabel.set(o.label.toLowerCase(), o.value);

  cache = { byLabel, options };
  return cache;
}

function findByHint(byLabel, hints) {
  for (const [label, value] of byLabel) {
    for (const hint of hints) {
      if (label.includes(hint)) return value;
    }
  }
  return null;
}

// Returnerer { AFVENTER, STARTET, AFSLUTTET, options } – værdier er null hvis der
// ikke findes en option der matcher label-hintet (så koden ovenpå kan falde tilbage).
async function getStatusValues() {
  const { byLabel, options } = await loadStatusOptions();

  return {
    AFVENTER: findByHint(byLabel, ['afvent']),
    STARTET: findByHint(byLabel, ['start']),
    AFSLUTTET: findByHint(byLabel, ['afslut', 'gennemf', 'complet']),
    options
  };
}

module.exports = { getStatusValues };
