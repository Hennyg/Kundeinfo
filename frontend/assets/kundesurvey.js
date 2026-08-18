// /frontend/assets/kundesurvey.js
function $(id){ return document.getElementById(id); }

const ui = {
  loading: $("loading"),
  error: $("error"),
  errorText: $("errorText"),
  app: $("app"),
  title: $("surveyTitle"),
  subtitle: $("surveySubtitle"),
  questions: $("questions"),
  form: $("surveyForm"),
  status: $("status"),
  btnSubmit: $("btnSubmit"),
  readonlyBanner: $("readonlyBanner"),
  openAsCustomerLink: $("openAsCustomerLink"),
  kundeAdresseOptions: $("kundeAdresseOptions"),
  finishModal: $("finishModal"),
  finishModalClose: $("finishModalClose"),
  changesModal: $("changesModal"),
  changesModalBody: $("changesModalBody"),
  changesModalClose: $("changesModalClose"),
};

function isReadOnly() {
  const u = new URL(location.href);
  return ["1", "true"].includes((u.searchParams.get("ro") || "").toLowerCase());
}

function show(el){ el?.classList.remove("hidden"); }
function hide(el){ el?.classList.add("hidden"); }

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

function getCodeFromUrl() {
  const u = new URL(location.href);
  return (u.searchParams.get("code") || u.searchParams.get("t") || u.searchParams.get("token") || "").trim();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// simpel mapping baseret på formatted label / eller fallback
function resolveInputType(answertypeLabel) {
  const s = String(answertypeLabel || "").toLowerCase();

  if (s.includes("ja") || s.includes("nej") || s.includes("yes") || s.includes("no")) return "yesno";
  if (s.includes("tal") || s.includes("number") || s.includes("numeric")) return "number";
  if (s.includes("lang") || s.includes("long")) return "longtext";
  return "text";
}

/* ---------- State ---------- */
let DATA = null;                     // { code, customerName, groups, items }
let lastChangeSummary = { changes: [], additions: [] }; // til opsummeringsdialog ved gennemsyn
const repeatCounters = {};           // groupId -> højeste synlige repeatIndex
const removedRepeats = new Set();    // `${groupId}:${repeatIndex}`

// Unik pr. sideindlæsning, tilføjes til hvert felts "name"-attribut.
// Chromes autofill matcher gemte forslag på feltets name/id – uden dette
// vil browseren efter et stykke tid begynde at foreslå tidligere indtastede
// værdier (fra denne eller andre kunders skemaer) i adressefelter, selv med
// autocomplete="off". Et unikt suffiks pr. load forhindrer den matchning.
const FORM_INSTANCE_TOKEN = Math.random().toString(36).slice(2);

const ADDRESS_FIELD_NUMBERS = ["0090", "0190"];

// De to felter der sammen udgør en leveringsadresse (linje 1 = vejnavn/nr,
// linje 2 = postnummer + by). Bruges til at bygge adresseforslag dynamisk
// og til at vise produkter pr. adresse.
const LEVERINGSADRESSE_LINJE1_NR = "0090";
const LEVERINGSADRESSE_LINJE2_NR = "0100";

let kundeAdresserList = []; // adresser fra data.kundeAdresser (survey-start) – bruges til adresseforslag + produktinfo

function formatAdresse(a) {
  if (!a) return "";
  const cityLine = [a.postnr, a.by].filter(Boolean).join(" ");
  return [a.adresse, cityLine].filter(Boolean).join(", ");
}

// Sammenligner forudfyldt værdi ("Vores info") med kundens faktiske svar,
// normaliseret for mellemrum/store-/små bogstaver. Bruges til at markere
// felter kunden har rettet, når skemaet gennemses (ro=1).
function valuesDiffer(prefillText, value) {
  const norm = s => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const p = norm(prefillText);
  const v = norm(value);
  if (!p || !v) return false; // intet at sammenligne, eller kunden har ikke svaret
  return p !== v;
}

// Map: formateret adressetekst -> produkter (fra kundelisten), til visning
// af "Produkter på denne adresse" under Leveringsadresse-blokke.
function produkterByAddressText() {
  const map = new Map();
  for (const a of kundeAdresserList) {
    const full = formatAdresse(a);
    if (full && Array.isArray(a.produkter) && a.produkter.length) {
      map.set(full, a.produkter);
    }
  }
  return map;
}

// Adresseforslag til datalist: både adresser fra kundelisten og de adresser
// der faktisk står i Leveringsadresse-blokkene på selve skemaet lige nu –
// så en ny adresse kunden selv tilføjer, også bliver valgbar andre steder
// (f.eks. "Primær arbejdsadresse").
function collectAddressSuggestions() {
  const set = new Set();

  for (const a of kundeAdresserList) {
    const full = formatAdresse(a);
    if (full) set.add(full);
  }

  const byRepeat = new Map(); // `${groupId}|${ri}` -> { linje1, linje2 }
  ui.form?.querySelectorAll(
    `[data-number="${LEVERINGSADRESSE_LINJE1_NR}"], [data-number="${LEVERINGSADRESSE_LINJE2_NR}"]`
  ).forEach(el => {
    if (el.closest(".repeat-block.removed")) return;
    const key = `${el.dataset.groupid}|${el.dataset.repeatindex}`;
    const entry = byRepeat.get(key) || {};
    if (el.dataset.number === LEVERINGSADRESSE_LINJE1_NR) entry.linje1 = (el.value || "").trim();
    else entry.linje2 = (el.value || "").trim();
    byRepeat.set(key, entry);
  });

  for (const { linje1, linje2 } of byRepeat.values()) {
    const full = [linje1, linje2].filter(Boolean).join(", ");
    if (full) set.add(full);
  }

  return [...set];
}

function refreshAddressSuggestions() {
  if (!ui.kundeAdresseOptions) return;
  ui.kundeAdresseOptions.innerHTML = collectAddressSuggestions()
    .map(full => `<option value="${escapeHtml(full)}"></option>`)
    .join("");
}

function buildInput(it, value) {
  const inputType = resolveInputType(it.answertype);
  const name = `q_${it.questionId}_${it.repeatIndex}_${FORM_INSTANCE_TOKEN}`;
  const isAddressField = ADDRESS_FIELD_NUMBERS.includes(String(it.number || ""));

  let el;
  if (inputType === "yesno") {
    el = document.createElement("select");
    el.innerHTML = `
      <option value="">Vælg…</option>
      <option value="Ja"  ${value === "Ja"  ? "selected" : ""}>Ja</option>
      <option value="Nej" ${value === "Nej" ? "selected" : ""}>Nej</option>
    `;
  } else if (inputType === "number") {
    el = document.createElement("input");
    el.type = "number";
    el.value = value ?? "";
  } else if (inputType === "longtext") {
    el = document.createElement("textarea");
    el.value = value ?? "";
  } else {
    el = document.createElement("input");
    el.type = "text";
    el.value = value ?? "";
    if (isAddressField) {
      el.setAttribute("list", "kundeAdresseOptions");
      el.placeholder = "Vælg eller skriv en adresse";
    }
  }

  el.name = name;
  el.autocomplete = "off";
  el.dataset.questionid = it.questionId;
  el.dataset.groupid = it.groupId;
  el.dataset.repeatindex = String(it.repeatIndex);
  el.dataset.number = String(it.number || "");
  el.dataset.prefill = it.prefillText || "";
  // Et påkrævet felt med en prefill-værdi ("Vores info") betragtes som
  // udfyldt, selv hvis kunden ikke selv har skrevet noget i feltet – derfor
  // sætter vi kun required, hvis der IKKE er en prefill-tekst at falde tilbage på.
  if (it.required && !it.prefillText) el.required = true;

  return el;
}

function renderQuestions() {
  ui.questions.innerHTML = "";
  lastChangeSummary = { changes: [], additions: [] };

  const produktMap = produkterByAddressText();
  const groups = [...(DATA.groups || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  // Basale spørgsmål (repeatIndex 0) pr. gruppe – bruges som skabelon for gentagelser
  const baseByGroup = new Map();
  const seenQuestionByGroup = new Map();
  // Gemte/aktuelle værdier: `${questionId}|${ri}` -> value
  const valueMap = new Map();
  // Prefill-tekst pr. faktisk gentagelse: `${questionId}|${ri}` -> prefillText
  const prefillMap = new Map();
  // Er feltet tilføjet af kunden selv (ny gentagelse/blok, ingen admin-prefill)?
  const addedMap = new Map();

  for (const it of (DATA.items || [])) {
    valueMap.set(`${it.questionId}|${it.repeatIndex}`, it.savedValue || "");
    prefillMap.set(`${it.questionId}|${it.repeatIndex}`, it.prefillText || "");
    addedMap.set(`${it.questionId}|${it.repeatIndex}`, !!it.addedByCustomer);

    if (it.repeatIndex === 0) {
      if (!baseByGroup.has(it.groupId)) {
        baseByGroup.set(it.groupId, []);
        seenQuestionByGroup.set(it.groupId, new Set());
      }

      // Forsvar mod dubletrækker i Dataverse (samme spørgsmål oprettet to
      // gange med repeatIndex 0) – behold kun den første forekomst.
      const seen = seenQuestionByGroup.get(it.groupId);
      if (seen.has(it.questionId)) continue;
      seen.add(it.questionId);

      baseByGroup.get(it.groupId).push(it);
    }
  }
  for (const [, arr] of baseByGroup) {
    arr.sort((a, b) => {
      const sortDiff = (a.sortKey ?? 0) - (b.sortKey ?? 0);
      if (sortDiff !== 0) return sortDiff;
      return String(a.number || "").localeCompare(String(b.number || ""), "da", { numeric: true });
    });
  }

  for (const g of groups) {
    const baseQs = baseByGroup.get(g.id) || [];
    if (!baseQs.length) continue;

    const card = document.createElement("div");
    card.className = "card";

    const titleRow = document.createElement("div");
    titleRow.className = "group-title";
    const h2 = document.createElement("h2");
    h2.textContent = g.title || "Spørgsmål";
    titleRow.appendChild(h2);
    card.appendChild(titleRow);

    if (g.description) {
      const desc = document.createElement("div");
      desc.className = "group-desc";
      desc.textContent = g.description;
      card.appendChild(desc);
    }

    const maxRi = g.repeatable ? (repeatCounters[g.id] ?? 0) : 0;

    for (let ri = 0; ri <= maxRi; ri++) {
      const removedKey = `${g.id}:${ri}`;
      const isRemoved = removedRepeats.has(removedKey);

      // Hele blokken betragtes som tilføjet af kunden, hvis ingen af dens
      // felter har admin-prefill, og mindst ét besvaret felt er markeret som
      // kunde-oprettet (ny gentagelse via "+ Tilføj flere").
      const hasAnyPrefillInBlock = baseQs.some(bq => !!(prefillMap.get(`${bq.questionId}|${ri}`) || ""));
      const isAddedBlock = !hasAnyPrefillInBlock && baseQs.some(bq => {
        const val = valueMap.get(`${bq.questionId}|${ri}`) || "";
        return !!val && (addedMap.get(`${bq.questionId}|${ri}`) || false);
      });

      const block = document.createElement("div");
      block.className = g.repeatable ? "repeat-block" : "";
      if (isRemoved) block.classList.add("removed");
      block.id = `repeat_${g.id}_${ri}`;

      if (g.repeatable) {
        const head = document.createElement("div");
        head.className = "repeat-head";

        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = (ri === 0) ? "1." : `${ri + 1}.`;
        head.appendChild(tag);

        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.alignItems = "center";
        right.style.gap = "8px";

        if (isRemoved) {
          const badge = document.createElement("span");
          badge.className = "removed-badge";
          badge.textContent = "Slettet";
          right.appendChild(badge);
        } else if (isAddedBlock) {
          const badge = document.createElement("span");
          badge.className = "added-badge";
          badge.textContent = "Tilføjet af kunden";
          right.appendChild(badge);
        }

        if (!isReadOnly()) {
          const toggleBtn = document.createElement("button");
          toggleBtn.type = "button";
          toggleBtn.className = isRemoved ? "btn" : "btn danger";
          toggleBtn.textContent = isRemoved ? "Fortryd" : "Slet";
          toggleBtn.onclick = () => {
            if (isRemoved) removedRepeats.delete(removedKey);
            else removedRepeats.add(removedKey);
            renderQuestions();
          };
          right.appendChild(toggleBtn);
        }

        head.appendChild(right);
        block.appendChild(head);
      }

      baseQs.forEach((bq) => {
        const it = {
          questionId: bq.questionId,
          groupId: bq.groupId,
          repeatIndex: ri,
          number: bq.number,
          text: bq.text,
          required: bq.required,
          answertype: bq.answertype,
          explanation: bq.explanation,
          prefillText: prefillMap.get(`${bq.questionId}|${ri}`) || "",
          addedByCustomer: addedMap.get(`${bq.questionId}|${ri}`) || false
        };

        const value = valueMap.get(`${it.questionId}|${ri}`) || "";

        // Vis tydeligt hvilke felter kunden selv har rettet ift. det vi
        // havde forudfyldt, eller selv har tilføjet (ny gentagelse/blok
        // uden admin-prefill) – kun relevant når man kigger skemaet
        // igennem bagefter (ro=1).
        const isChangedFromPrefill = valuesDiffer(it.prefillText, value);
        const isAddedByCustomer = !it.prefillText && it.addedByCustomer && !!value;
        const isMarked = isChangedFromPrefill || isAddedByCustomer;

        if (isChangedFromPrefill) {
          lastChangeSummary.changes.push({
            group: g, groupId: g.id, repeatIndex: ri, number: it.number,
            question: it.text || "", before: it.prefillText, after: value
          });
        } else if (isAddedByCustomer) {
          lastChangeSummary.additions.push({
            group: g, groupId: g.id, repeatIndex: ri, number: it.number,
            question: it.text || "", value
          });
        }

        const wrap = document.createElement("div");
        wrap.style.padding = "10px 0";
        wrap.style.borderBottom = "1px solid #eee";

        const label = document.createElement("div");
        label.innerHTML = `
          <div class="qtitle">${escapeHtml(it.text || "")} ${it.required ? '<span class="muted">(påkrævet)</span>' : ''}</div>
          ${it.explanation ? `<div class="qhelp">${escapeHtml(it.explanation)}</div>` : ""}
          ${it.prefillText ? `<div class="prefill-box${isChangedFromPrefill ? " changed" : ""}">Vores info:<br><strong>${escapeHtml(it.prefillText)}</strong></div>` : ""}
        `;
        wrap.appendChild(label);

        const input = buildInput(it, value);
        if (isMarked) input.classList.add("changed");
        if (isReadOnly() || isRemoved) input.disabled = true;
        input.addEventListener("blur", () => autosaveOnBlur());
        if (it.number === LEVERINGSADRESSE_LINJE1_NR || it.number === LEVERINGSADRESSE_LINJE2_NR) {
          input.addEventListener("input", () => refreshAddressSuggestions());
        }
        wrap.appendChild(input);

        block.appendChild(wrap);
      });

      // Vis hvilke produkter der er registreret på denne leveringsadresse
      // (samme info som ses på kundelisten i admincreate), hvis blokken har
      // begge adressefelter og adressen matcher en kendt kundeliste-adresse.
      if (!isRemoved) {
        const linje1 = block.querySelector(`[data-number="${LEVERINGSADRESSE_LINJE1_NR}"]`)?.value?.trim() || "";
        const linje2 = block.querySelector(`[data-number="${LEVERINGSADRESSE_LINJE2_NR}"]`)?.value?.trim() || "";
        const fullAddress = [linje1, linje2].filter(Boolean).join(", ");
        const produkter = fullAddress ? produktMap.get(fullAddress) : null;

        if (produkter && produkter.length) {
          const hint = document.createElement("div");
          hint.className = "produkt-hint";
          hint.innerHTML =
            `<span class="muted">Produkter på denne adresse:</span> ` +
            produkter.map(p => `<span class="produkt-pill">${escapeHtml(p.produkt)} × ${p.antal}</span>`).join("");
          block.appendChild(hint);
        }
      }

      card.appendChild(block);
    }

    if (g.repeatable && !isReadOnly()) {
      const addRow = document.createElement("div");
      addRow.className = "btnrow";
      addRow.style.marginTop = "8px";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn";
      addBtn.textContent = "+ Tilføj flere";
      addBtn.onclick = () => {
        const next = (repeatCounters[g.id] ?? 0) + 1;
        repeatCounters[g.id] = next;
        renderQuestions();
        setTimeout(() => document.getElementById(`repeat_${g.id}_${next}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      };
      addRow.appendChild(addBtn);
      card.appendChild(addRow);
    }

    ui.questions.appendChild(card);
  }

  refreshAddressSuggestions();
}

function initRepeatCounters() {
  Object.keys(repeatCounters).forEach(k => delete repeatCounters[k]);
  for (const it of (DATA.items || [])) {
    if (it.repeatIndex > (repeatCounters[it.groupId] ?? 0)) {
      repeatCounters[it.groupId] = it.repeatIndex;
    }
  }
}

async function loadSurvey() {
  const code = getCodeFromUrl();
  if (!code) throw new Error("Mangler kode i linket.");

  const data = await fetchJson("/api/survey-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, ro: isReadOnly() })
  });

  const items = data?.items || [];
  if (!items.length) throw new Error("Spørgeskemaet indeholder ingen spørgsmål (eller koden er ugyldig).");

  DATA = data;
  removedRepeats.clear();
  initRepeatCounters();

  ui.title.textContent = data?.customerName ? `Spørgeskema – ${data.customerName}` : "Spørgeskema";
  ui.subtitle.textContent = `Kode: ${data?.code || code}`;

  updateKundeAdresseOptions(data?.kundeAdresser);

  if (isReadOnly()) {
    show(ui.readonlyBanner);
    ui.btnSubmit?.classList.add("hidden");

    if (ui.openAsCustomerLink) {
      const customerUrl = new URL(location.href);
      customerUrl.searchParams.delete("ro");
      customerUrl.searchParams.set("code", data?.code || code);
      ui.openAsCustomerLink.href = customerUrl.toString();
    }
  }

  renderQuestions();

  return { code };
}

function updateKundeAdresseOptions(adresser) {
  kundeAdresserList = Array.isArray(adresser) ? adresser : [];
}

let autosaveTimer = null;
let autosaveCode = null;

function autosaveOnBlur() {
  if (isReadOnly() || !autosaveCode) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    submitSurvey(autosaveCode, false, { silent: true });
  }, 600);
}

function collectAnswers() {
  const inputs = ui.form.querySelectorAll("[data-questionid]");
  const answers = [];

  inputs.forEach(el => {
    if (el.closest(".repeat-block.removed")) return; // håndteres separat via collectRemoved()

    const questionId = (el.dataset.questionid || "").trim();
    const groupId = (el.dataset.groupid || "").trim();
    const repeatIndex = parseInt(el.dataset.repeatindex || "0", 10);
    const typedValue = (el.value ?? "").trim();
    const prefillFallback = (el.dataset.prefill ?? "").trim();
    const value = typedValue || prefillFallback;

    if (!questionId) return;
    answers.push({ questionId, groupId, repeatIndex, value: value || null });
  });

  return answers;
}

function collectRemoved() {
  const removed = [];
  for (const key of removedRepeats) {
    const [groupId, riStr] = key.split(":");
    const repeatIndex = parseInt(riStr, 10);

    // find alle spørgsmål i denne gruppe (fra DATA.items, uanset repeatIndex)
    const questionIds = new Set(
      (DATA.items || []).filter(it => it.groupId === groupId).map(it => it.questionId)
    );
    for (const questionId of questionIds) {
      removed.push({ questionId, repeatIndex });
    }
  }
  return removed;
}

async function submitSurvey(code, finalize, opts = {}) {
  const silent = !!opts.silent;

  if (!silent) {
    ui.status.textContent = finalize ? "Afslutter…" : "Gemmer…";
    ui.btnSubmit.disabled = true;
  } else {
    ui.status.textContent = "Gemmer automatisk…";
  }

  try {
    const answers = collectAnswers();
    const removed = collectRemoved();

    const result = await fetchJson("/api/survey-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, answers, removed, finalize: !!finalize })
    });

    if (finalize) {
      ui.status.textContent = "Tak! Besvarelsen er sendt ✔";
      ui.form.querySelectorAll("input,textarea,select,button").forEach(x => x.disabled = true);
      show(ui.finishModal);
    } else {
      ui.status.textContent = "Gemt ✔";
      if (!silent) {
        ui.btnSubmit.disabled = false;
      }
    }

    return result;
  } catch (e) {
    console.error(e);
    ui.status.textContent = `Fejl: ${e.message}`;
  } finally {
    if (!finalize && !silent) {
      ui.btnSubmit.disabled = false;
    }
  }
}

async function init() {
  try {
    show(ui.loading); hide(ui.error); hide(ui.app);
    const { code } = await loadSurvey();
    hide(ui.loading); show(ui.app);
    autosaveCode = code;

    ui.form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitSurvey(code, true); // afslut
    });

    ui.finishModalClose?.addEventListener("click", () => hide(ui.finishModal));
    ui.changesModalClose?.addEventListener("click", () => hide(ui.changesModal));

    if (isReadOnly()) showChangesSummary();

  } catch (e) {
    console.error(e);
    hide(ui.loading); hide(ui.app); show(ui.error);
    ui.errorText.textContent = e.message;
  }
}

const SYSTEM_ICONS = {
  "Kontakter": "👤",
  "Kundeliste": "📋",
  "Uniconta": "🏢"
};
const UKENDT_SYSTEM = "Ikke tildelt endnu";

// Afgør hvilke bagvedliggende systemer en gruppe rapporterer til. Bruger
// primært det admin har sat på gruppen (cr175_lch_rapporterer_til er en
// multi-select valgliste, så en gruppe kan godt rapportere til flere
// systemer på samme tid, fx både Kontakter og Kundeliste). For grupper hvor
// det endnu ikke er sat, gættes der på titlen som en overgangsløsning.
function sourceSystemsForGroup(group) {
  const raw = String(group?.rapporterTil || "").trim();
  if (raw) {
    const list = raw.split(",").map(s => s.trim()).filter(Boolean);
    if (list.length) return list;
  }

  const t = String(group?.title || "").toLowerCase();
  if (t.includes("leveringsadresse")) return ["Kontakter"];
  if (t.includes("ejer")) return ["Kontakter"];
  if (t.includes("medarbejder")) return ["Kontakter"];
  if (t.includes("leverandørservice") || t.includes("leverandorservice")) return ["Kundeliste"];
  return [UKENDT_SYSTEM];
}

// Leveringsadresse-gruppens to felter (vejnavn + postnr/by) vises som én
// samlet linje i stedet for to separate punkter i opsummeringen.
function mergeAddressLineEntries(entries) {
  const merged = [];
  const byRepeat = new Map(); // `${groupId}|${repeatIndex}|${kind}` -> { linje1?, linje2? }

  for (const e of entries) {
    if (e.number === LEVERINGSADRESSE_LINJE1_NR || e.number === LEVERINGSADRESSE_LINJE2_NR) {
      const key = `${e.groupId}|${e.repeatIndex}|${e.kind}`;
      const bucket = byRepeat.get(key) || {};
      if (e.number === LEVERINGSADRESSE_LINJE1_NR) bucket.linje1 = e;
      else bucket.linje2 = e;
      byRepeat.set(key, bucket);
    } else {
      merged.push(e);
    }
  }

  for (const { linje1, linje2 } of byRepeat.values()) {
    const anyEntry = linje1 || linje2;
    if (!anyEntry) continue;

    if (anyEntry.kind === "changed") {
      const before = [linje1?.before, linje2?.before].filter(Boolean).join(", ");
      const after = [linje1?.after, linje2?.after].filter(Boolean).join(", ");
      merged.push({ ...anyEntry, question: "Leveringsadresse", before, after });
    } else {
      const value = [linje1?.value, linje2?.value].filter(Boolean).join(", ");
      merged.push({ ...anyEntry, question: "Leveringsadresse", value });
    }
  }

  return merged;
}

// Viser en opsummering af hvad kunden har rettet/tilføjet, grupperet efter
// hvilket bagvedliggende system oplysningen skal rapporteres til (Kontakter,
// Kundeliste eller Uniconta) – så man ikke skal gennemgå hele skemaet
// manuelt for at finde det. Bruges kun ved gennemsyn.
function showChangesSummary() {
  if (!ui.changesModal || !ui.changesModalBody) return;

  const { changes, additions } = lastChangeSummary;
  const allEntries = mergeAddressLineEntries([
    ...changes.map(c => ({ ...c, kind: "changed" })),
    ...additions.map(a => ({ ...a, kind: "added" }))
  ]);

  if (!allEntries.length) {
    ui.changesModalBody.innerHTML = `<p class="muted">Ingen rettelser fundet.</p>`;
    show(ui.changesModal);
    return;
  }

  const bySystem = new Map();
  for (const entry of allEntries) {
    const systems = sourceSystemsForGroup(entry.group);
    for (const system of systems) {
      if (!bySystem.has(system)) bySystem.set(system, []);
      bySystem.get(system).push(entry);
    }
  }

  let html = "";
  for (const [system, entries] of bySystem) {
    const icon = SYSTEM_ICONS[system] || "❔";
    html += `<h3 style="margin:16px 0 6px;">${icon} ${escapeHtml(system)}</h3><ul style="margin:0;padding-left:18px;">`;
    html += entries.map(e => {
      if (e.kind === "changed") {
        return `<li style="margin-bottom:8px;"><strong>${escapeHtml(e.question)}</strong> <span class="muted">(${escapeHtml(e.group?.title || "")})</span><br>` +
          `"${escapeHtml(e.before)}" → "${escapeHtml(e.after)}"</li>`;
      }
      return `<li style="margin-bottom:8px;"><strong>${escapeHtml(e.question)}</strong> <span class="muted">(${escapeHtml(e.group?.title || "")})</span> – tilføjet: "${escapeHtml(e.value)}"</li>`;
    }).join("");
    html += `</ul>`;
  }

  ui.changesModalBody.innerHTML = html;
  show(ui.changesModal);
}

document.addEventListener("DOMContentLoaded", init);
