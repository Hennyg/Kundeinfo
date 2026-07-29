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
    ? `./adminprefill.html?id=${encodeURIComponent(instanceId)}`
    : "#";
}

function getPrefillItems() {
  return [...els.prefillArea.querySelectorAll("tr[data-qid]")].map(tr => {
    const questionId = tr.dataset.qid || "";
    const groupId = tr.dataset.groupId || "";
    const repeatIndex = Number.parseInt(tr.dataset.repeatIndex || "0", 10) || 0;
    const prefillText = tr.querySelector("input[data-prefill]")?.value?.trim() || "";

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
    `tr[data-number="${CSS.escape(number)}"][data-repeat-index="0"] input[data-prefill]`
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

function fillPrefillFromUniconta() {
  if (!currentDebtor) return;

  const d = currentDebtor;

  fillPrefillFields({
    "001": d.vatNumber || "",
    "002": d.name || "",
    "003": [d.address1, d.address2].filter(Boolean).join(", "),
    "004": [d.zipCode, d.city].filter(Boolean).join(" "),
    "005": d.email || ""
  });
}

function clearUnicontaDebtor() {
  currentDebtor = null;
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
  if (!els.kundeAdresseOptions) return;

  const list = Array.isArray(adresser) ? adresser : [];

  els.kundeAdresseOptions.innerHTML = list
    .map(a => {
      const cityLine = [a.postnr, a.by].filter(Boolean).join(" ");
      const full = [a.adresse, cityLine].filter(Boolean).join(", ");
      return full ? `<option value="${escapeHtml(full)}"></option>` : "";
    })
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
      `tr[data-number="${CSS.escape(number)}"][data-repeat-index="${repeatIndex}"] input[data-prefill]`
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
      "011": firstName,
      "012": phone,
      "013": email
    }, index);
  } else {
    const phone = contact.mobilePhone || contact.businessPhone || "";
    const title = extractParenRole(contact.displayName);

    fillPrefillForContact({
      "015": firstName,
      "016": phone,
      "017": title,
      "018": email
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

    if (currentOwners.length) fillContactPrefill("owner", 0);
    if (currentEmployees.length) fillContactPrefill("employee", 0);

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


/* ---------- Skema/template ---------- */

async function loadTemplates() {
  if (els.templateInfo) els.templateInfo.textContent =
    "Indlæser…";

  const data = await fetchJson(
    "/api/templates-get?top=500",
    {
      cache: "no-store"
    }
  );

  const rows =
    data?.value ||
    data ||
    [];

  const getId = template =>
    template.crcc8_lch_surveytemplateid ||
    template.crcc8_lch_surveytemplate ||
    template.lch_surveytemplateid ||
    template.id ||
    null;

  const getName = template =>
    template.crcc8_lch_name ||
    template.lch_name ||
    template.name ||
    template[
      "crcc8_lch_name@OData.Community.Display.V1.FormattedValue"
    ] ||
    "";

  const getActive = template =>
    template.crcc8_lch_isactive ??
    template.lch_isactive ??
    template.isactive ??
    true;

  const active = rows.filter(template =>
    getActive(template) !== false &&
    getId(template)
  );

  if (!active.length) {
    if (els.templateInfo) els.templateInfo.textContent =
      "Intet aktivt skema fundet – kontakt IT.";

    setStatus(
      "Kan ikke oprette: intet aktivt skema."
    );

    return;
  }

  /*
    Foretræk skema med "kundeinfo" i navnet.
    Ellers bruges det første aktive skema.
  */
  const preferred =
    active.find(template =>
      /kundeinfo/i.test(
        getName(template)
      )
    ) ||
    active[0];

  const id =
    String(getId(preferred));

  const name =
    (
      getName(preferred) ||
      "Kundeinfo"
    ).trim();

  if (els.templateInfo) els.templateInfo.textContent =
    name;

  els.templateSelect.innerHTML =
    `<option value="${escapeHtml(id)}">` +
    `${escapeHtml(name)}` +
    `</option>`;

  els.templateSelect.value =
    id;

  await loadTemplateItems(id);
}

/* ---------- Load template items og Prefill ---------- */

async function loadTemplateItems(templateId) {
  if (!templateId) {
    els.prefillArea.classList.add("hidden");
    els.prefillArea.innerHTML = "";
    els.prefillBottomActions?.classList.add("hidden");
    setListStatus("Intet skema valgt.");
    return;
  }

  setListStatus("Indlæser spørgsmål…");
  els.prefillArea.classList.add("hidden");
  els.prefillArea.innerHTML = "";
  els.prefillBottomActions?.classList.add("hidden");

  let data;
  try {
    data = await fetchJson(
      `/api/templateitems-get?templateId=${encodeURIComponent(templateId)}`,
      { cache: "no-store" }
    );
  } catch (e) {
    console.error("templateitems-get fejl:", e);
    setListStatus(`Fejl: kunne ikke hente spørgsmål (${e.message})`);
    return;
  }

  const rows = data?.value || data || [];
  if (!rows.length) {
    setListStatus("Dette skema har ingen spørgsmål.");
    return;
  }

  const groups = new Map();
  for (const item of rows) {
    const questionId = item.questionId || null;
    if (!questionId) continue;

    const groupId = item.groupId || "_uden_gruppe_";
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        name: item.groupLabel || "Uden gruppe",
        repeatable: item.repeatable === true,
        items: []
      });
    }
    groups.get(groupId).items.push(item);
  }

function rowsHtml(group, repeatIndex) {
  const ADDRESS_FIELD_NUMBERS = ["014", "019"];

  return group.items.map(item => {
    const isAddressField = ADDRESS_FIELD_NUMBERS.includes(item.number);
    const listAttr = isAddressField ? `list="kundeAdresseOptions"` : "";

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
        <td>
          <input
            type="text"
            data-prefill="1"
            value="${repeatIndex === 0 ? escapeHtml(item.defaultPrefillText || "") : ""}"
            placeholder="${isAddressField ? "Vælg eller skriv en adresse" : "valgfrit"}"
            ${listAttr}
            style="width:100%;padding:.5rem"
          />
        </td>
      </tr>
    `;
  }).join("");
  }

  function repeatBlockHtml(group, repeatIndex) {
    const heading = group.repeatable
      ? `<div class="prefillRepeatHeading">
           <span>${escapeHtml(group.name)}${repeatIndex > 0 ? ` – ${repeatIndex + 1}` : ""}</span>
           ${repeatIndex > 0
             ? `<button type="button" class="prefillRemoveButton" data-remove-repeat="1" title="Fjern denne gentagelse" aria-label="Fjern denne gentagelse">×</button>`
             : ""}
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
        ${group.repeatable
          ? `<div class="prefillGroupActions">
               <button type="button" class="prefillAddButton" data-add-repeat="1" title="Tilføj endnu en" aria-label="Tilføj endnu en">+</button>
             </div>`
          : ""}
      </div>
      <div class="prefillGroupBody">
        <div class="prefillRepeatList">
          ${repeatBlockHtml(group, 0)}
        </div>
      </div>
    `;

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

async function createFromTemplate() {
  try {
    setStatus("");

    els.result.classList.add(
      "hidden"
    );

    const templateId =
      els.templateSelect.value;

    if (!templateId) {
      setStatus(
        "Intet skema valgt."
      );

      return;
    }

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
      templateId,
      customerName,
      customerNumber,
      expiresAt,
      note,
      prefillItems
    };

    const res = await fetchJson(
      "/api/survey-create-from-template",
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
        res.crcc8_lch_surveyinstanceid ||
        res.id
    });

    setStatus(
      "Oprettet ✔"
    );
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
      templateRow:
        $("templateRow"),

      templateSelect:
        $("templateSelect"),

      templateInfo:
        $("templateInfo"),

      customerName:
        $("customerName"),

      customerSuggest:
        $("customerSuggest"),

      expiresAt:
        $("expiresAt"),

      btnCreateBottom:
        $("btnCreateBottom"),

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

    els.btnCreateBottom?.addEventListener(
      "click",
      createFromTemplate
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

    await loadTemplates();
  }
);
