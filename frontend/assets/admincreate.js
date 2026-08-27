let els;

function $(id) {
  return document.getElementById(id);
}

function qs(name) {
  return new URL(location.href).searchParams.get(name);
}

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text().catch(() => "");

  if (!r.ok) {
    throw new Error(`${r.status} ${t}`);
  }

  return t ? JSON.parse(t) : null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(s) {
  const text = s || "";
  els.status.textContent = text;
  if (els.statusBottom) els.statusBottom.textContent = text;
}

function setListStatus(s) {
  els.listStatus.textContent = s || "";
}

function showResult({ code, link, instanceId }) {
  els.result.classList.remove("hidden");
  els.codeOut.textContent = code || "";
  els.linkOut.value = link || "";
  els.btnOpen.href = link || "#";

  els.btnPrefill.href = instanceId
    ? `./admincreate.html?instanceId=${encodeURIComponent(instanceId)}`
    : "#";
}

function getPrefillItems() {
  return [...els.prefillArea.querySelectorAll("tr[data-qid]")]
    .filter(tr => !tr.closest(".prefillGroup")?.classList.contains("excluded"))
    .map(tr => {
      const questionId = tr.dataset.qid || "";
      const groupId = tr.dataset.groupId || "";
      const repeatIndex = Number.parseInt(tr.dataset.repeatIndex || "0", 10) || 0;
      const prefillText = tr.querySelector("[data-prefill]")?.value?.trim() || "";

      return {
        questionId,
        groupId,
        repeatIndex,
        prefillText: prefillText || null
      };
    });
}

/* ---------- Kunde-autocomplete (COREDATA) ---------- */

let acTimer = null;
let acItems = [];
let acActiveIndex = -1;
let currentDebtor = null;
let currentOwners = [];
let currentEmployees = [];
let editInstanceId = null;
let kundeAdresserList = [];      // adresser fra /api/kunde-adresser (Uniconta/Dataverse)
let contactAddressList = [];     // adresser fra kontaktpersoner (Entra ID, primaerAdresse)

// "Leveringsadresse"-gruppen skal have lige så mange gentagelser som der er
// adresser i kundelisten, og felterne skal autoudfyldes med adressen.
const LEVERINGSADRESSE_TITEL = "leveringsadresse";
const LEVERINGSADRESSE_ADRESSE_NR = "0090";     // "Leveringsadresse:"
const LEVERINGSADRESSE_POSTBY_NR = "0100";      // "Postnummer og By:"

function hideSuggestions() {
  els.customerSuggest.classList.add("hidden");
  els.customerSuggest.innerHTML = "";
  acItems = [];
  acActiveIndex = -1;
}

function renderSuggestions(items) {
  acItems = items;
  acActiveIndex = -1;

  if (!items.length) {
    els.customerSuggest.innerHTML =
      `<div class="empty">Ingen kunder fundet</div>`;

    els.customerSuggest.classList.remove("hidden");
    return;
  }

  els.customerSuggest.innerHTML = items
    .map((k, i) => `
      <div class="item" data-index="${i}">
        <div class="navn">
          ${escapeHtml(k.navn || "(uden navn)")}
        </div>

        <div class="meta">
          ${escapeHtml(k.kundenr || "")}
          ${k.omraade
            ? " · " + escapeHtml(k.omraade)
            : ""}
        </div>
      </div>
    `)
    .join("");

  els.customerSuggest.classList.remove("hidden");

  els.customerSuggest
    .querySelectorAll(".item")
    .forEach(el => {
      el.addEventListener("click", () => {
        selectCustomer(
          Number(el.dataset.index)
        );
      });
    });
}

function selectCustomer(index) {
  const k = acItems[index];

  if (!k) {
    return;
  }

  els.customerName.value = k.kundenr
    ? `${k.navn} (${k.kundenr})`
    : k.navn;

  els.customerName.dataset.kundeId =
    k.id || "";

  els.customerName.dataset.kundenr =
    k.kundenr || "";

  els.customerName.dataset.kundenavn =
    k.navn || "";

  hideSuggestions();

  runCustomerLookup(k.kundenr);
}

async function searchCustomers(q) {
  try {
    const data = await fetchJson(
      `/api/kunder-search?q=${encodeURIComponent(q)}`,
      {
        cache: "no-store"
      }
    );

    const kunder = data?.kunder || [];
    renderSuggestions(kunder);

    /*
      Hvis søgningen ikke gav nogen match, men teksten ligner et rent
      kundenummer, forsøger vi alligevel at slå det op direkte i
      Uniconta/Kundeliste/Entra ID – og viser "Kunden findes ikke i
      systemet", hvis heller ikke de finder noget.
    */
    if (!kunder.length && /^\d+$/.test(q)) {
      els.customerName.dataset.kundenr = q;
      delete els.customerName.dataset.kundeId;
      delete els.customerName.dataset.kundenavn;

      runCustomerLookup(q);
    }
  } catch (e) {
    console.error(
      "kunder-search fejl:",
      e
    );

    els.customerSuggest.innerHTML =
      `<div class="empty">` +
      `Kunne ikke hente kundeliste ` +
      `(${escapeHtml(e.message)})` +
      `</div>`;

    els.customerSuggest.classList.remove(
      "hidden"
    );
  }
}

function onCustomerInput() {
  /*
    Hvis brugeren ændrer teksten, er et
    tidligere valg ikke længere gyldigt.
  */
  delete els.customerName.dataset.kundeId;
  delete els.customerName.dataset.kundenr;
  delete els.customerName.dataset.kundenavn;

  clearUnicontaDebtor();
  clearKundeliste();
  clearEntraCustomerContacts();

  const q =
    els.customerName.value.trim();

  clearTimeout(acTimer);

  if (q.length < 2) {
    hideSuggestions();
    return;
  }

  acTimer = setTimeout(
    () => searchCustomers(q),
    250
  );
}

function onCustomerKeydown(e) {
  if (
    els.customerSuggest.classList.contains("hidden") ||
    !acItems.length
  ) {
    return;
  }

  const nodes = [
    ...els.customerSuggest.querySelectorAll(".item")
  ];

  if (e.key === "ArrowDown") {
    e.preventDefault();

    acActiveIndex = Math.min(
      acActiveIndex + 1,
      nodes.length - 1
    );
  } else if (e.key === "ArrowUp") {
    e.preventDefault();

    acActiveIndex = Math.max(
      acActiveIndex - 1,
      0
    );
  } else if (e.key === "Enter") {
    if (acActiveIndex >= 0) {
      e.preventDefault();
      selectCustomer(acActiveIndex);
    }

    return;
  } else if (e.key === "Escape") {
    hideSuggestions();
    return;
  } else {
    return;
  }

  nodes.forEach((node, index) => {
    node.classList.toggle(
      "active",
      index === acActiveIndex
    );
  });
}

function setPrefillByNumber(number, value) {
  if (!number) return;

  const input = els.prefillArea.querySelector(
    `tr[data-number="${CSS.escape(number)}"][data-repeat-index="0"] [data-prefill]`
  );

  if (input) input.value = value || "";
}

function fillPrefillFields(map) {
  for (const [number, value] of Object.entries(map)) {
    setPrefillByNumber(number, value);
  }
}

/* ---------- Uniconta Debitor data ---------- */

function customerNumberToUnicontaAccount(
  kundenr
) {
  return String(kundenr || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^00/, "");
}

function debtorRow(label, value) {
  const shown =
    value === true
      ? "Ja"
      : value === false
        ? "Nej"
        : (
          String(value || "").trim() ||
          "—"
        );

  return (
    `<div class="debtorLabel">` +
    `${escapeHtml(label)}` +
    `</div>` +
    `<div class="debtorValue">` +
    `${escapeHtml(shown)}` +
    `</div>`
  );
}

// Opdaterer "Opret skema og send mail til: xx"-knappen med kundens e-mail
// fra Uniconta debitor-data, og kræver samtidig at en mailskabelon er
// valgt i dropdown'en øverst. Knappen deaktiveres hvis et af delene mangler.
function updateCreateMailTarget() {
  if (!els.createMailTarget || !els.btnCreateAndMail) return;

  const email = (currentDebtor?.email || "").trim();
  const hasTemplate = !!(els.mailTemplateSelect?.value || "").trim();

  els.createMailTarget.textContent = email || "(ingen e-mail fundet)";
  els.btnCreateAndMail.disabled = !email || !hasTemplate;
}

// Henter mail-skabeloner i kategorien "opret-skema" (se
// adminmailskabeloner.html) og fylder dropdown'en øverst på siden.
// Skabelonens Nøgle sendes med til /api/survey-send-invite-mail, når
// "Opret skema og send mail" trykkes.
async function loadMailTemplates() {
  if (!els.mailTemplateSelect) return;

  try {
    const data = await fetchJson(
      "/api/mailskabeloner-get?kategori=opret-skema&aktiv=1",
      { cache: "no-store" }
    );
    const rows = data?.value || data || [];

    if (!rows.length) {
      els.mailTemplateSelect.innerHTML =
        `<option value="">Ingen skabeloner fundet (kategori "opret-skema")</option>`;
      els.mailTemplateSelect.disabled = true;
      updateCreateMailTarget();
      return;
    }

    els.mailTemplateSelect.disabled = false;
    els.mailTemplateSelect.innerHTML = rows
      .map(t => {
        const key = t.cr175_lch_noegle || "";
        const label = t.cr175_lch_navn || key;
        return `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`;
      })
      .join("");

    updateCreateMailTarget();
  } catch (e) {
    console.error("Kunne ikke hente mailskabeloner:", e);
    els.mailTemplateSelect.innerHTML = `<option value="">Kunne ikke hente skabeloner</option>`;
    els.mailTemplateSelect.disabled = true;
    updateCreateMailTarget();
  }
}

function fillPrefillFromUniconta() {
  if (!currentDebtor) return;

  const d = currentDebtor;

  // Leverandørservice: hvis Uniconta-betalingsformen (Payment) ender på "L",
  // har kunden leverandørservice i forvejen.
  // Kun stort L til sidst i Payment-feltet betyder leverandørservice
  // (fx "lb.mdr+10L") - små bogstaver skal IKKE matche.
  const harLeverandoerservice = /L$/.test(String(d.payment || "").trim());

  fillPrefillFields({
    "0010": d.vatNumber || "",
    "0020": d.name || "",
    "0030": [d.address1, d.address2].filter(Boolean).join(", "),
    "0040": [d.zipCode, d.city].filter(Boolean).join(" "),
    "0050": d.email || "",
    "0080": harLeverandoerservice ? "Ja" : "Nej"
  });
}

function clearUnicontaDebtor() {
  currentDebtor = null;
  updateCreateMailTarget();
  els.unicontaDebtorCard.classList.add(
    "hidden"
  );

  els.unicontaDebtorStatus.classList.remove(
    "hidden"
  );

  els.unicontaDebtorStatus.textContent = "";

  els.unicontaDebtorData.classList.add(
    "hidden"
  );

  els.unicontaDebtorData.innerHTML = "";
}

async function loadUnicontaDebtor(kundenr) {
  const account =
    customerNumberToUnicontaAccount(kundenr);

  els.unicontaDebtorCard.classList.remove(
    "hidden"
  );

  els.unicontaDebtorStatus.classList.remove(
    "hidden"
  );

  els.unicontaDebtorStatus.textContent =
    account
      ? `Henter Uniconta debitor ${account}…`
      : "Kunden har ikke et gyldigt kundenummer.";

  els.unicontaDebtorData.classList.add(
    "hidden"
  );

  els.unicontaDebtorData.innerHTML = "";

  if (!account) {
    return false;
  }

  try {
    const data = await fetchJson(
      `/api/uniconta/debtors/${encodeURIComponent(account)}`,
      {
        cache: "no-store"
      }
    );

    const d = data?.debtor;
    currentDebtor = d;
    updateCreateMailTarget();

    if (!d) {
      throw new Error(
        "Ingen debitoroplysninger returneret."
      );
    }

    els.unicontaDebtorData.innerHTML = `
      <div class="debtorColumns">
        <div class="debtorGrid">
          ${debtorRow("Debitornr.", d.account)}
          ${debtorRow("Navn", d.name)}
          ${debtorRow("Adresse", [d.address1, d.address2].filter(Boolean).join(", "))}
          ${debtorRow("Postnr. og by", [d.zipCode, d.city].filter(Boolean).join(" "))}
        </div>
        <div class="debtorGrid">
          ${debtorRow("Land", d.country)}
          ${debtorRow("Telefon", d.phone)}
          ${debtorRow("Mobil", d.mobile)}
          ${debtorRow("E-mail", d.email)}
        </div>
        <div class="debtorGrid">
          ${debtorRow("Kontaktperson", d.contactPerson)}
          ${debtorRow("CVR-nr.", d.vatNumber)}
          ${debtorRow("Valuta", d.currency)}
          ${debtorRow("Spærret", d.blocked)}
        </div>
      </div>
    `;

    els.unicontaDebtorStatus.classList.add(
      "hidden"
    );

    els.unicontaDebtorData.classList.remove(
      "hidden"
    );

    fillPrefillFromUniconta();

    return true;
  } catch (e) {
    els.unicontaDebtorStatus.textContent =
      `Kunne ikke finde Uniconta Debitor data ` +
      `for ${account}: ${e.message}`;

    return false;
  }
}



/* ---------- Kundeliste: navn, kundenr og adresser ---------- */

function kundeAdresseRowHtml(a) {
  const cityLine = [a.postnr, a.by].filter(Boolean).join(" ");
  const metaParts = [cityLine, a.omraade].filter(Boolean);
  const inaktivTag = a.aktiv === false ? ` <span class="muted">(inaktiv)</span>` : "";

  const produkter = Array.isArray(a.produkter) ? a.produkter : [];
  const produkterHtml = produkter.length
    ? `<div class="kundeAdresseProdukter">` +
      produkter
        .map(p => `<span class="produktPill">${escapeHtml(p.produkt)} × ${p.antal}</span>`)
        .join("") +
      `</div>`
    : `<div class="muted">Ingen aktive produkter registreret.</div>`;

  return `
    <div class="kundeAdresseItem">
      <div class="kundeAdresseLine">${escapeHtml(a.adresse || "—")}${inaktivTag}</div>
      ${metaParts.length ? `<div class="muted">${escapeHtml(metaParts.join(" · "))}</div>` : ""}
      ${produkterHtml}
    </div>
  `;
}

function updateKundeAdresseOptions(adresser) {
  kundeAdresserList = Array.isArray(adresser) ? adresser : [];
  refreshKundeAdresseOptions();
  syncLeveringsadresseFromKundeliste();
}

function findLeveringsadresseTile() {
  return [...els.prefillArea.querySelectorAll(".prefillGroup")].find(
    t => String(t.querySelector(".prefillGroupBar span")?.textContent || "")
      .trim().toLowerCase() === LEVERINGSADRESSE_TITEL
  );
}

// Sørg for at "Leveringsadresse"-gruppen har lige så mange blokke som der er
// adresser i kundelisten, og udfyld hver blok med den tilhørende adresse.
// 3 adresser -> 3 blokke, 1 adresse -> kun 1 blok.
function syncLeveringsadresseFromKundeliste() {
  const tile = findLeveringsadresseTile();
  if (!tile) return;

  const groupId = tile.dataset.groupId;
  const list = tile.querySelector(".prefillRepeatList");
  const targetCount = Math.max(1, kundeAdresserList.length);

  if (kundeAdresserList.length) {
    kundeAdresserList.slice(0, targetCount).forEach((a, ri) => {
      const cityLine = [a.postnr, a.by].filter(Boolean).join(" ");
      fillPrefillForContact({
        [LEVERINGSADRESSE_ADRESSE_NR]: a.adresse || "",
        [LEVERINGSADRESSE_POSTBY_NR]: cityLine
      }, ri);
    });
  } else {
    // Ingen adresser fundet – ryd evt. autoudfyldte værdier fra en tidligere kunde
    ensureRepeatBlocks(groupId, 0);
    fillPrefillForContact({
      [LEVERINGSADRESSE_ADRESSE_NR]: "",
      [LEVERINGSADRESSE_POSTBY_NR]: ""
    }, 0);
  }

  // Fjern overskydende blokke, hvis den forrige kunde havde flere adresser
  if (list) {
    [...list.querySelectorAll(".prefillRepeatBlock")]
      .filter(b => Number.parseInt(b.dataset.repeatIndex || "0", 10) > targetCount - 1)
      .forEach(b => b.remove());
  }
}

function refreshKundeAdresseOptions() {
  if (!els.kundeAdresseOptions) return;

  const fromKundeliste = kundeAdresserList
    .map(a => {
      const cityLine = [a.postnr, a.by].filter(Boolean).join(" ");
      return [a.adresse, cityLine].filter(Boolean).join(", ");
    })
    .filter(Boolean);

  const fromContacts = contactAddressList.filter(Boolean);

  // Kundeliste-adresser først, derefter kontakt-adresser der ikke allerede er med
  const seen = new Set();
  const combined = [];
  for (const addr of [...fromKundeliste, ...fromContacts]) {
    if (seen.has(addr)) continue;
    seen.add(addr);
    combined.push(addr);
  }

  els.kundeAdresseOptions.innerHTML = combined
    .map(addr => `<option value="${escapeHtml(addr)}"></option>`)
    .join("");
}

function clearKundeliste() {
  els.kundelisteCard.classList.add("hidden");
  els.kundelisteStatus.classList.remove("hidden");
  els.kundelisteStatus.textContent = "";
  els.kundelisteData.classList.add("hidden");
  els.kundelisteData.innerHTML = "";
  updateKundeAdresseOptions([]);
}

async function loadKundeliste(kundenr) {
  const nr = String(kundenr || "").trim();

  els.kundelisteCard.classList.remove("hidden");
  els.kundelisteStatus.classList.remove("hidden");
  els.kundelisteStatus.textContent = nr
    ? `Henter kundedata for ${nr}…`
    : "Kunden har ikke et gyldigt kundenummer.";
  els.kundelisteData.classList.add("hidden");
  els.kundelisteData.innerHTML = "";
  updateKundeAdresseOptions([]);

  if (!nr) return false;

  try {
    const data = await fetchJson(
      `/api/kunde-adresser?kundenr=${encodeURIComponent(nr)}`,
      { cache: "no-store" }
    );

    const kunde = data?.kunde;
    if (!kunde) {
      throw new Error("Ingen kundedata returneret.");
    }

    const adresser = Array.isArray(data?.adresser) ? data.adresser : [];
    updateKundeAdresseOptions(adresser);

    const adresserHtml = adresser.length
      ? `<div class="kundeAdresseList">${adresser.map(kundeAdresseRowHtml).join("")}</div>`
      : `<div class="muted">Ingen adresser fundet.</div>`;

    els.kundelisteData.innerHTML = `
      <div class="debtorGrid" style="margin-bottom:14px;">
        ${debtorRow("Navn", kunde.navn)}
        ${debtorRow("Kundenummer", kunde.kundenr)}
      </div>
      ${adresserHtml}
    `;

    els.kundelisteStatus.classList.add("hidden");
    els.kundelisteData.classList.remove("hidden");
    return true;
  } catch (e) {
    els.kundelisteStatus.textContent =
      `Kunne ikke hente kundedata for ${nr}: ${e.message}`;
    return false;
  }
}



/* ---------- Entra ID: Ejere og medarbejdere ---------- */

function contactDetailRow(label, value) {
  const shown = String(value || "").trim();
  if (!shown) return "";

  return `
    <div class="contactLabel">${escapeHtml(label)}</div>
    <div class="contactValue">${escapeHtml(shown)}</div>
  `;
}

function contactCardHtml(contact, kind, index) {
  return `
    <article class="contactItem">
      <div class="contactName">${escapeHtml(contact.displayName || "(uden navn)")}</div>
      <div class="contactDetails">
        ${contactDetailRow("E-mail", contact.email)}
        ${contactDetailRow("Mobil", contact.mobilePhone)}
        ${contactDetailRow("Telefon", contact.businessPhone)}
        ${contactDetailRow("Primæradresse", contact.primaerAdresse)}
        ${contactDetailRow("2. adresse", contact.adresse2)}
        ${contactDetailRow("3. adresse", contact.adresse3)}
      </div>
      <div class="contactActions" style="display:flex;justify-content:flex-end;margin-top:10px;">
        <button
          type="button"
          class="btn contactFillButton"
          data-contact-kind="${escapeHtml(kind)}"
          data-contact-index="${index}"
        >Udfyld</button>
      </div>
    </article>
  `;
}

function ensureRepeatBlocks(groupId, repeatIndex) {
  const tile = els.prefillArea.querySelector(
    `.prefillGroup[data-group-id="${CSS.escape(groupId)}"]`
  );
  if (!tile) return;

  const list = tile.querySelector(".prefillRepeatList");
  if (!list) return;

  let count = list.querySelectorAll(".prefillRepeatBlock").length;

  while (count <= repeatIndex) {
    const addBtn = tile.querySelector("[data-add-repeat]");
    if (!addBtn) break;
    addBtn.click();
    count = list.querySelectorAll(".prefillRepeatBlock").length;
  }
}

function fillPrefillForContact(numberMap, repeatIndex) {
  const numbers = Object.keys(numberMap);
  if (!numbers.length) return;

  const anyRow = els.prefillArea.querySelector(
    `tr[data-number="${CSS.escape(numbers[0])}"]`
  );
  const groupId = anyRow?.dataset.groupId;

  if (groupId && repeatIndex > 0) {
    ensureRepeatBlocks(groupId, repeatIndex);
  }

  for (const [number, value] of Object.entries(numberMap)) {
    const input = els.prefillArea.querySelector(
      `tr[data-number="${CSS.escape(number)}"][data-repeat-index="${repeatIndex}"] [data-prefill]`
    );
    if (input) input.value = value || "";
  }
}

function extractParenRole(text) {
  const m = String(text || "").match(/\(([^)]+)\)/);
  return m ? m[1].trim() : "";
}

function extractPersonName(displayName, givenName) {
  let s = String(displayName || "");

  // Fjern eventuel parentes med rolle-markering, fx "(ejer)" / "(medhælper)"
  s = s.replace(/\([^)]*\)/g, " ");

  // "First name" (givenName) i Entra ID indeholder fejlagtigt firmanavnet,
  // ikke personens fornavn – fjern den værdi fra teksten, uanset placering
  const company = String(givenName || "").trim();
  if (company) {
    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(escaped, "i"), " ");
  }

  return s.replace(/\s+/g, " ").trim();
}

function emailOrEmpty(email) {
  const v = String(email || "").trim();
  return v.toLowerCase() === "ukendt" ? "" : v;
}

function fillContactPrefill(kind, index) {
  const contact = kind === "owner" ? currentOwners[index] : currentEmployees[index];
  if (!contact) return;

  const firstName = extractPersonName(contact.displayName, contact.givenName);
  const email = emailOrEmpty(contact.email);

  if (kind === "owner") {
    const phone = contact.businessPhone || contact.mobilePhone || "";

    fillPrefillForContact({
      "0120": firstName,
      "0130": phone,
      "0140": email
    }, index);
  } else {
    const phone = contact.mobilePhone || contact.businessPhone || "";
    const title = extractParenRole(contact.displayName);

    fillPrefillForContact({
      "0150": firstName,
      "0160": phone,
      "0170": title,
      "0180": email,
      "0190": contact.primaerAdresse || ""
    }, index);
  }
}

function onContactFillClick(e) {
  const btn = e.target.closest(".contactFillButton");
  if (!btn) return;

  const kind = btn.dataset.contactKind;
  const index = Number.parseInt(btn.dataset.contactIndex, 10);

  fillContactPrefill(kind, index);
}

function clearEntraCustomerContacts() {
  currentOwners = [];
  currentEmployees = [];
  contactAddressList = [];
  refreshKundeAdresseOptions();

  for (const key of ["Owners", "Employees"]) {
    const card = els[`entra${key}Card`];
    const status = els[`entra${key}Status`];
    const list = els[`entra${key}List`];

    card?.classList.add("hidden");
    status?.classList.remove("hidden");
    if (status) status.textContent = "";
    list?.classList.add("hidden");
    if (list) list.innerHTML = "";
  }
}

function renderEntraContactGroup(type, contacts, emptyText) {
  const status = els[`entra${type}Status`];
  const list = els[`entra${type}List`];

  if (!contacts.length) {
    status.textContent = emptyText;
    status.classList.remove("hidden");
    list.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  list.innerHTML = contacts
    .map((c, i) => contactCardHtml(c, type === "Owners" ? "owner" : "employee", i))
    .join("");
  status.classList.add("hidden");
  list.classList.remove("hidden");
}

async function loadEntraCustomerContacts(kundenr) {
  const customerNumber = String(kundenr || "").trim();

  els.entraOwnersCard.classList.remove("hidden");
  els.entraEmployeesCard.classList.remove("hidden");
  els.entraOwnersStatus.classList.remove("hidden");
  els.entraEmployeesStatus.classList.remove("hidden");
  els.entraOwnersList.classList.add("hidden");
  els.entraEmployeesList.classList.add("hidden");
  els.entraOwnersList.innerHTML = "";
  els.entraEmployeesList.innerHTML = "";

  if (!customerNumber) {
    els.entraOwnersStatus.textContent = "Kunden har ikke et gyldigt kundenummer.";
    els.entraEmployeesStatus.textContent = "Kunden har ikke et gyldigt kundenummer.";
    return false;
  }

  els.entraOwnersStatus.textContent = `Henter ejere for ${customerNumber} fra Entra ID…`;
  els.entraEmployeesStatus.textContent = `Henter medarbejdere for ${customerNumber} fra Entra ID…`;

  try {
    const data = await fetchJson(
      `/api/entra-customer-contacts?kundenr=${encodeURIComponent(customerNumber)}`,
      { cache: "no-store" }
    );

    currentOwners = Array.isArray(data?.owners) ? data.owners : [];
    currentEmployees = Array.isArray(data?.employees) ? data.employees : [];

    contactAddressList = [...currentOwners, ...currentEmployees]
      .map(c => c.primaerAdresse)
      .filter(Boolean);
    refreshKundeAdresseOptions();

    renderEntraContactGroup(
      "Owners",
      currentOwners,
      "Ingen ejere fundet i Entra ID."
    );

    renderEntraContactGroup(
      "Employees",
      currentEmployees,
      "Ingen medarbejdere fundet i Entra ID."
    );

    for (let i = 0; i < currentOwners.length; i++) fillContactPrefill("owner", i);
    for (let i = 0; i < currentEmployees.length; i++) fillContactPrefill("employee", i);

    return currentOwners.length > 0 || currentEmployees.length > 0;
  } catch (e) {
    console.error("entra-customer-contacts fejl:", e);
    const message = `Kunne ikke hente kontakter fra Entra ID: ${e.message}`;
    els.entraOwnersStatus.textContent = message;
    els.entraEmployeesStatus.textContent = message;
    return false;
  }
}


/* ---------- Samlet opslag: Uniconta + Kundeliste + Entra ID ---------- */

async function runCustomerLookup(kundenr) {
  const shouldContinue = await warnIfExistingSurveyForCustomer(kundenr);
  if (!shouldContinue) return;

  const [unicontaFound, kundelisteFound, entraFound] = await Promise.all([
    loadUnicontaDebtor(kundenr),
    loadKundeliste(kundenr),
    loadEntraCustomerContacts(kundenr)
  ]);

  if (!unicontaFound && !kundelisteFound && !entraFound) {
    const msg = "Kunden findes ikke i systemet";
    els.unicontaDebtorStatus.textContent = msg;
    els.kundelisteStatus.textContent = msg;
    els.entraOwnersStatus.textContent = msg;
    els.entraEmployeesStatus.textContent = msg;
  }
}


/* ---------- Spørgeskema (grupper + spørgsmål, uden skabelon) ---------- */

async function loadQuestionnaire() {
  setListStatus("Indlæser spørgsmål…");
  els.prefillArea.classList.add("hidden");
  els.prefillArea.innerHTML = "";
  els.prefillBottomActions?.classList.add("hidden");

  let groupRows, questionRows;
  try {
    const [gData, qData] = await Promise.all([
      fetchJson("/api/questiongroups-get?top=500", { cache: "no-store" }),
      fetchJson("/api/questions-get?top=500", { cache: "no-store" })
    ]);
    groupRows = (gData?.value || gData || []).filter(g => (g.cr175_lch_aktiv ?? true) !== false);
    questionRows = qData?.value || qData || [];
  } catch (e) {
    console.error("Kunne ikke hente spørgeskema:", e);
    setListStatus(`Fejl: kunne ikke hente spørgsmål (${e.message})`);
    return;
  }

  if (!questionRows.length) {
    setListStatus("Der er ingen spørgsmål oprettet endnu.");
    return;
  }

  const groupMetaById = new Map(
    groupRows.map(g => [g.cr175_lch_kundeinfo_spoergsmaalsgruppeid, g])
  );

  questionRows.sort((a, b) =>
    String(a.cr175_lch_nummer || "").localeCompare(String(b.cr175_lch_nummer || ""))
  );

  let groups = new Map();
  for (const q of questionRows) {
    const questionId = q.cr175_lch_kundeinfo_spoergsmaalid;
    if (!questionId) continue;

    const groupId = q._cr175_lch_spoergsmaalsgruppe_value || "_uden_gruppe_";
    const groupMeta = groupMetaById.get(groupId);

    // Spring spørgsmål over hvis deres gruppe findes, men er inaktiv
    if (q._cr175_lch_spoergsmaalsgruppe_value && !groupMeta) continue;

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        name: groupMeta?.cr175_lch_titel || "Uden gruppe",
        repeatable: !!groupMeta?.cr175_lch_kangentages,
        sort: groupMeta?.cr175_lch_sorteringsnummer ?? 999999,
        items: []
      });
    }

    groups.get(groupId).items.push({
      questionId,
      groupId,
      number: q.cr175_lch_nummer || "",
      text: q.cr175_lch_spoergsmaalstekst || "",
      answertypeLabel:
        q["cr175_lch_svartype@OData.Community.Display.V1.FormattedValue"] || "",
      defaultPrefillText: ""
    });
  }

  // Sortér grupperne efter deres sorteringsnummer
  const sortedEntries = [...groups.entries()].sort(
    (a, b) => (a[1].sort ?? 0) - (b[1].sort ?? 0)
  );
  groups = new Map(sortedEntries);

// simpel mapping baseret på formatted label / eller fallback
function resolveInputType(answertypeLabel) {
  const s = String(answertypeLabel || "").toLowerCase();

  if (s.includes("ja") || s.includes("nej") || s.includes("yes") || s.includes("no")) return "yesno";
  if (s.includes("tal") || s.includes("number") || s.includes("numeric")) return "number";
  if (s.includes("lang") || s.includes("long")) return "longtext";
  return "text";
}

function rowsHtml(group, repeatIndex) {
  const ADDRESS_FIELD_NUMBERS = ["0190"];

  return group.items.map(item => {
    const isAddressField = ADDRESS_FIELD_NUMBERS.includes(item.number);
    const listAttr = isAddressField ? `list="kundeAdresseOptions"` : "";
    const inputType = resolveInputType(item.answertypeLabel);
    const prefillValue = repeatIndex === 0 ? (item.defaultPrefillText || "") : "";

    let fieldHtml;
    if (inputType === "yesno") {
      fieldHtml = `
          <select
            data-prefill="1"
            style="width:100%;padding:.5rem"
          >
            <option value="">Vælg…</option>
            <option value="Ja"  ${prefillValue === "Ja"  ? "selected" : ""}>Ja</option>
            <option value="Nej" ${prefillValue === "Nej" ? "selected" : ""}>Nej</option>
          </select>
      `;
    } else if (inputType === "number") {
      fieldHtml = `
          <input
            type="number"
            data-prefill="1"
            value="${escapeHtml(prefillValue)}"
            placeholder="valgfrit"
            style="width:100%;padding:.5rem"
          />
      `;
    } else if (inputType === "longtext") {
      fieldHtml = `
          <textarea
            data-prefill="1"
            placeholder="valgfrit"
            style="width:100%;padding:.5rem"
          >${escapeHtml(prefillValue)}</textarea>
      `;
    } else {
      fieldHtml = `
          <input
            type="text"
            data-prefill="1"
            value="${escapeHtml(prefillValue)}"
            placeholder="${isAddressField ? "Vælg eller skriv en adresse" : "valgfrit"}"
            ${listAttr}
            style="width:100%;padding:.5rem"
          />
      `;
    }

    return `
    <tr
      data-qid="${escapeHtml(item.questionId)}"
      data-group-id="${escapeHtml(group.id)}"
      data-repeat-index="${repeatIndex}"
      data-number="${escapeHtml(item.number || "")}"
    >
        <td>${escapeHtml(item.number || "")}</td>
        <td>${escapeHtml(item.text || "")}</td>
        <td>${escapeHtml(item.answertypeLabel || "–")}</td>
        <td>${fieldHtml}</td>
      </tr>
    `;
  }).join("");
  }

  function repeatBlockHtml(group, repeatIndex) {
    const heading = (group.repeatable && repeatIndex > 0)
      ? `<div class="prefillRepeatHeading">
           <span>${escapeHtml(group.name)} – ${repeatIndex + 1}</span>
           <button type="button" class="prefillRemoveButton" data-remove-repeat="1" title="Fjern denne gentagelse" aria-label="Fjern denne gentagelse">×</button>
         </div>`
      : "";

    return `
      <div class="prefillRepeatBlock" data-repeat-index="${repeatIndex}">
        ${heading}
        <table class="prefillTable">
          <thead>
            <tr>
              <th>Nr</th>
              <th>Spørgsmål</th>
              <th>Svar-type</th>
              <th>Prefill (valgfri)</th>
            </tr>
          </thead>
          <tbody>${rowsHtml(group, repeatIndex)}</tbody>
        </table>
      </div>
    `;
  }

  els.prefillArea.innerHTML = "";

  for (const group of groups.values()) {
    const tile = document.createElement("section");
    tile.className = "prefillGroup";
    tile.dataset.groupId = group.id;
    tile.dataset.repeatable = group.repeatable ? "true" : "false";
    tile._prefillGroup = group;

    tile.innerHTML = `
      <div class="prefillGroupBar">
        <span>${escapeHtml(group.name)}</span>
        <div class="prefillGroupActions">
          <label class="prefillGroupIncludeToggle" title="Fravælg for at udelade denne gruppe fra skemaet til kunden">
            <input type="checkbox" class="prefillGroupIncludeCheckbox" checked />
            Medtag i skema
          </label>
          ${group.repeatable
            ? `<button type="button" class="prefillAddButton" data-add-repeat="1" title="Tilføj endnu en" aria-label="Tilføj endnu en">+</button>`
            : ""}
        </div>
      </div>
      <div class="prefillGroupBody">
        <div class="prefillRepeatList">
          ${repeatBlockHtml(group, 0)}
        </div>
      </div>
    `;

    tile.querySelector(".prefillGroupIncludeCheckbox")?.addEventListener("change", (e) => {
      tile.classList.toggle("excluded", !e.target.checked);
    });

    tile.querySelector("[data-add-repeat]")?.addEventListener("click", () => {
      const list = tile.querySelector(".prefillRepeatList");
      const existing = [...list.querySelectorAll(".prefillRepeatBlock")];
      const nextIndex = existing.length
        ? Math.max(...existing.map(x => Number.parseInt(x.dataset.repeatIndex || "0", 10))) + 1
        : 0;

      list.insertAdjacentHTML("beforeend", repeatBlockHtml(group, nextIndex));
    });

    tile.addEventListener("click", event => {
      const removeButton = event.target.closest("[data-remove-repeat]");
      if (!removeButton) return;
      removeButton.closest(".prefillRepeatBlock")?.remove();
    });

    els.prefillArea.appendChild(tile);
  }

  els.prefillArea.classList.remove("hidden");
  els.prefillBottomActions?.classList.remove("hidden");
  setListStatus("");
}

/* ---------- Opret survey fra template ---------- */

/* ---------- Redigering af eksisterende kundesurvey ---------- */

function setPrefillValueByQuestionRepeat(questionId, repeatIndex, value) {
  const tile = els.prefillArea.querySelector(`tr[data-qid="${CSS.escape(questionId)}"]`)?.closest(".prefillGroup");
  if (tile && repeatIndex > 0) {
    const list = tile.querySelector(".prefillRepeatList");
    let count = list ? list.querySelectorAll(".prefillRepeatBlock").length : 0;
    while (count <= repeatIndex) {
      const addBtn = tile.querySelector("[data-add-repeat]");
      if (!addBtn) break;
      addBtn.click();
      count = list.querySelectorAll(".prefillRepeatBlock").length;
    }
  }

  const input = els.prefillArea.querySelector(
    `tr[data-qid="${CSS.escape(questionId)}"][data-repeat-index="${repeatIndex}"] [data-prefill]`
  );
  if (input) input.value = value || "";
}

async function loadInstanceForEdit(instanceId) {
  editInstanceId = instanceId;

  setStatus("Indlæser eksisterende skema…");

  // I redigeringstilstand er kunden allerede fastlagt, og selve
  // opslags-tiles (Uniconta/Kundeliste/Entra ID) er ikke relevante –
  // det handler kun om at rette prefill-teksterne.
  els.unicontaDebtorCard?.classList.add("hidden");
  els.kundelisteCard?.classList.add("hidden");
  els.entraOwnersCard?.classList.add("hidden");
  els.entraEmployeesCard?.classList.add("hidden");

  try {
    const data = await fetchJson(
      `/api/survey-instance-get?id=${encodeURIComponent(instanceId)}`,
      { cache: "no-store" }
    );

    els.customerName.value = data.customerName || "";
    els.customerName.disabled = true;
    els.customerName.dataset.kundenavn = data.customerName || "";

    for (const it of (data.items || [])) {
      setPrefillValueByQuestionRepeat(it.questionId, it.repeatIndex, it.prefillText);
    }

    if (els.btnCreateNoMail) {
      els.btnCreateNoMail.textContent = "Gem ændringer";
    }
    els.btnCreateAndMail?.classList.add("hidden");
    document.getElementById("mailTemplateRow")?.classList.add("hidden");

    setStatus(`Redigerer eksisterende skema (kode: ${data.code || "—"})`);
  } catch (e) {
    console.error("survey-instance-get fejl:", e);
    setStatus(`Kunne ikke indlæse skema til redigering: ${e.message}`);
  }
}

async function saveEditedInstance() {
  try {
    setStatus("Gemmer ændringer…");

    const prefillItems = getPrefillItems();

    const payload = {
      instanceId: editInstanceId,
      items: prefillItems.map(p => ({
        questionId: p.questionId,
        repeatIndex: p.repeatIndex,
        prefillText: p.prefillText
      }))
    };

    await fetchJson("/api/survey-items-update", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload)
    });

    setStatus("Ændringer gemt ✔");
  } catch (e) {
    console.error(e);
    setStatus("Fejl: " + (e.message || e));
  }
}

// Tjekker om kunden allerede har et spørgeskema der ikke er afsluttet endnu.
// Bruges til at advare admin, når kunden vælges.
async function hasUnfinishedSurveyForCustomer(kundenummer) {
  const nr = String(kundenummer || "").trim();
  if (!nr) return false;

  try {
    const data = await fetchJson(
      `/api/survey-list?kundenummer=${encodeURIComponent(nr)}&top=20`,
      { cache: "no-store" }
    );
    const rows = data?.value || [];
    // afsluttet === false eller null (status ukendt) betragtes som "ikke afsluttet"
    return rows.some(r => r.afsluttet !== true);
  } catch (e) {
    console.error("Kunne ikke kontrollere eksisterende spørgeskemaer:", e);
    return false; // Fejl i opslaget skal ikke blokere valget
  }
}

// Advarer admin hvis kunden allerede har et ikke-afsluttet spørgeskema, og
// giver mulighed for at fortsætte eller annullere kundevalget.
// Returnerer true hvis der skal fortsættes (indlæse kundedata), false hvis
// kundevalget skal annulleres.
async function warnIfExistingSurveyForCustomer(kundenummer) {
  const hasUnfinished = await hasUnfinishedSurveyForCustomer(kundenummer);
  if (!hasUnfinished) return true;

  const proceed = window.confirm(
    "Der findes allerede et spørgeskema for denne kunde, som ikke er afsluttet endnu.\n\n" +
    "Vil du stadig fortsætte med denne kunde?"
  );

  if (!proceed) {
    els.customerName.value = "";
    delete els.customerName.dataset.kundeId;
    delete els.customerName.dataset.kundenr;
    delete els.customerName.dataset.kundenavn;
    setStatus("Kundevalg annulleret – der findes allerede et igangværende skema for kunden.");
    return false;
  }

  return true;
}

async function createOrSaveInstance(sendMailAfter) {
  if (editInstanceId) {
    return saveEditedInstance();
  }

  try {
    setStatus("");

    els.result.classList.add(
      "hidden"
    );

    const customerNumber =
      els.customerName.dataset.kundenr ||
      "";

    const selectedCustomerName =
      els.customerName.dataset.kundenavn ||
      "";

    if (
      !customerNumber ||
      !selectedCustomerName
    ) {
      setStatus(
        "Vælg en kunde fra listen."
      );

      return;
    }

    const customerName =
      `${selectedCustomerName} ` +
      `(${customerNumber})`;

    const expiresRaw =
      els.expiresAt.value ||
      "";

    const expiresAt =
      expiresRaw
        ? new Date(
          expiresRaw
        ).toISOString()
        : null;

    const note = null;

    const prefillItems =
      getPrefillItems();

    setStatus(
      "Opretter kundesurvey…"
    );

    const payload = {
      customerName,
      customerNumber,
      expiresAt,
      note,
      prefillItems
    };

    const res = await fetchJson(
      "/api/survey-create",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json; charset=utf-8"
        },

        body: JSON.stringify(payload)
      }
    );

    showResult({
      code: res.code,
      link: res.link,

      instanceId:
        res.instanceId ||
        res.id
    });

    let mailFailed = false;

    if (sendMailAfter) {
      setStatus("Oprettet ✔ – sender invitations-mail…");

      // TEST-FASE: sender altid til hng@lcherrup.dk lige nu, uanset hvilken
      // e-mail knappen viste. Skift til `currentDebtor?.email` her, når det
      // er klar til at gå i drift med rigtige kundemails.
      const testRecipient = "hng@lcherrup.dk";
      const templateKey = (els.mailTemplateSelect?.value || "").trim();

      try {
        await fetchJson("/api/survey-send-invite-mail", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            code: res.code,
            link: res.link,
            customerName,
            customerNumber,
            instanceId: res.instanceId || res.id,
            to: testRecipient,
            templateKey
          })
        });

        setStatus(`Oprettet ✔ – mail sendt til ${testRecipient} – sender dig til listen…`);
      } catch (mailErr) {
        console.error("survey-send-invite-mail fejl:", mailErr);
        mailFailed = true;
        setStatus(
          `Oprettet ✔ – men mailen kunne ikke sendes: ${mailErr.message}. ` +
          `Skemaet er stadig oprettet, du kan sende linket manuelt (se link ovenfor).`
        );
      }
    } else {
      setStatus(
        "Oprettet ✔ – sender dig til listen…"
      );
    }

    if (!mailFailed) {
      setTimeout(() => {
        location.href = "./adminoversigt.html";
      }, 900);
    }
  } catch (e) {
    console.error(e);

    setStatus(
      "Fejl: " +
      (e.message || e)
    );
  }
}

/* ---------- Init ---------- */

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    els = {
      customerName:
        $("customerName"),

      customerSuggest:
        $("customerSuggest"),

      expiresAt:
        $("expiresAt"),

      btnCreateNoMail:
        $("btnCreateNoMail"),

      btnCreateAndMail:
        $("btnCreateAndMail"),

      createMailTarget:
        $("createMailTarget"),

      mailTemplateSelect:
        $("mailTemplateSelect"),

      prefillBottomActions:
        $("prefillBottomActions"),

      statusBottom:
        $("statusBottom"),

      status:
        $("status"),

      unicontaDebtorCard:
        $("unicontaDebtorCard"),

      unicontaDebtorStatus:
        $("unicontaDebtorStatus"),

      unicontaDebtorData:
        $("unicontaDebtorData"),

      btnFillFromUniconta:
        $("btnFillFromUniconta"),

      kundelisteCard:
        $("kundelisteCard"),

      kundelisteStatus:
        $("kundelisteStatus"),

      kundelisteData:
        $("kundelisteData"),

      entraOwnersCard:
        $("entraOwnersCard"),

      entraOwnersStatus:
        $("entraOwnersStatus"),

      entraOwnersList:
        $("entraOwnersList"),

      entraEmployeesCard:
        $("entraEmployeesCard"),

      entraEmployeesStatus:
        $("entraEmployeesStatus"),

      entraEmployeesList:
        $("entraEmployeesList"),

      listStatus:
        $("listStatus"),

      prefillArea:
        $("prefillArea"),

      kundeAdresseOptions:
        $("kundeAdresseOptions"),

      result:
        $("result"),

      codeOut:
        $("codeOut"),

      linkOut:
        $("linkOut"),

      btnCopy:
        $("btnCopy"),

      btnOpen:
        $("btnOpen"),

      btnPrefill:
        $("btnPrefill")
    };

    els.customerName.addEventListener(
      "input",
      onCustomerInput
    );

    els.customerName.addEventListener(
      "keydown",
      onCustomerKeydown
    );

    document.addEventListener(
      "click",
      e => {
        if (
          !e.target.closest(
            ".autocomplete"
          )
        ) {
          hideSuggestions();
        }
      }
    );

    /*
      Standard udløbsdato:
      I dag + 14 dage.
    */
    if (
      els.expiresAt &&
      !els.expiresAt.value
    ) {
      const d = new Date();

      d.setDate(
        d.getDate() + 14
      );

      const yyyy =
        d.getFullYear();

      const mm =
        String(
          d.getMonth() + 1
        ).padStart(2, "0");

      const dd =
        String(
          d.getDate()
        ).padStart(2, "0");

      els.expiresAt.value =
        `${yyyy}-${mm}-${dd}`;
    }

    els.btnCreateNoMail?.addEventListener(
      "click",
      () => createOrSaveInstance(false)
    );

    els.btnCreateAndMail?.addEventListener(
      "click",
      () => createOrSaveInstance(true)
    );

    els.btnFillFromUniconta?.addEventListener(
      "click",
      fillPrefillFromUniconta
    );

    els.entraOwnersList?.addEventListener(
      "click",
      onContactFillClick
    );

    els.entraEmployeesList?.addEventListener(
      "click",
      onContactFillClick
    );

    if (
      els.btnCopy &&
      els.linkOut
    ) {
      els.btnCopy.addEventListener(
        "click",
        async () => {
          const text =
            els.linkOut.value ||
            "";

          if (!text) {
            return;
          }

          try {
            await navigator.clipboard
              .writeText(text);

            setStatus(
              "Link kopieret ✔"
            );
          } catch {
            els.linkOut.focus();
            els.linkOut.select();

            document.execCommand(
              "copy"
            );

            setStatus(
              "Link kopieret ✔"
            );
          }
        }
      );
    }

    clearUnicontaDebtor();
    clearKundeliste();
    clearEntraCustomerContacts();

    els.mailTemplateSelect?.addEventListener("change", updateCreateMailTarget);
    await loadMailTemplates();

    await loadQuestionnaire();

    const instanceIdFromUrl = qs("instanceId");
    if (instanceIdFromUrl) {
      await loadInstanceForEdit(instanceIdFromUrl);
    }
  }
);

