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

  loadUnicontaDebtor(k.kundenr);
  loadEntraCustomerContacts(k.kundenr);
}

async function searchCustomers(q) {
  try {
    const data = await fetchJson(
      `/api/kunder-search?q=${encodeURIComponent(q)}`,
      {
        cache: "no-store"
      }
    );

    renderSuggestions(
      data?.kunder || []
    );
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

function clearUnicontaDebtor() {
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
    return;
  }

  try {
    const data = await fetchJson(
      `/api/uniconta/debtors/${encodeURIComponent(account)}`,
      {
        cache: "no-store"
      }
    );

    const d = data?.debtor;

    if (!d) {
      throw new Error(
        "Ingen debitoroplysninger returneret."
      );
    }

    els.unicontaDebtorData.innerHTML = [
      debtorRow(
        "Debitornr.",
        d.account
      ),

      debtorRow(
        "Navn",
        d.name
      ),

      debtorRow(
        "Adresse",
        [
          d.address1,
          d.address2
        ]
          .filter(Boolean)
          .join(", ")
      ),

      debtorRow(
        "Postnr. og by",
        [
          d.zipCode,
          d.city
        ]
          .filter(Boolean)
          .join(" ")
      ),

      debtorRow(
        "Land",
        d.country
      ),

      debtorRow(
        "Telefon",
        d.phone
      ),

      debtorRow(
        "Mobil",
        d.mobile
      ),

      debtorRow(
        "E-mail",
        d.email
      ),

      debtorRow(
        "Kontaktperson",
        d.contactPerson
      ),

      debtorRow(
        "CVR-nr.",
        d.vatNumber
      ),

      debtorRow(
        "Valuta",
        d.currency
      ),

      debtorRow(
        "Betaling",
        d.payment
      ),

      debtorRow(
        "Spærret",
        d.blocked
      )
    ].join("");

    els.unicontaDebtorStatus.classList.add(
      "hidden"
    );

    els.unicontaDebtorData.classList.remove(
      "hidden"
    );
  } catch (e) {
    els.unicontaDebtorStatus.textContent =
      `Kunne ikke finde Uniconta Debitor data ` +
      `for ${account}: ${e.message}`;
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

function contactCardHtml(contact) {
  return `
    <article class="contactItem">
      <div class="contactName">${escapeHtml(contact.displayName || "(uden navn)")}</div>
      <div class="contactDetails">
        ${contactDetailRow("E-mail", contact.email)}
        ${contactDetailRow("Mobil", contact.mobilePhone)}
        ${contactDetailRow("Telefon", contact.businessPhone)}
        ${contactDetailRow("Jobtitel", contact.jobTitle)}
        ${contactDetailRow("Primæradresse", contact.primaerAdresse)}
        ${contactDetailRow("2. adresse", contact.adresse2)}
        ${contactDetailRow("3. adresse", contact.adresse3)}
      </div>
    </article>
  `;
}

function clearEntraCustomerContacts() {
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

  list.innerHTML = contacts.map(contactCardHtml).join("");
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
    return;
  }

  els.entraOwnersStatus.textContent = `Henter ejere for ${customerNumber} fra Entra ID…`;
  els.entraEmployeesStatus.textContent = `Henter medarbejdere for ${customerNumber} fra Entra ID…`;

  try {
    const data = await fetchJson(
      `/api/entra-customer-contacts?kundenr=${encodeURIComponent(customerNumber)}`,
      { cache: "no-store" }
    );

    renderEntraContactGroup(
      "Owners",
      Array.isArray(data?.owners) ? data.owners : [],
      "Ingen ejere fundet i Entra ID."
    );

    renderEntraContactGroup(
      "Employees",
      Array.isArray(data?.employees) ? data.employees : [],
      "Ingen medarbejdere fundet i Entra ID."
    );
  } catch (e) {
    console.error("entra-customer-contacts fejl:", e);
    const message = `Kunne ikke hente kontakter fra Entra ID: ${e.message}`;
    els.entraOwnersStatus.textContent = message;
    els.entraEmployeesStatus.textContent = message;
  }
}


/* ---------- Skema/template ---------- */

async function loadTemplates() {
  els.templateInfo.textContent =
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
    els.templateInfo.textContent =
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

  els.templateInfo.textContent =
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
    return group.items.map(item => `
      <tr
        data-qid="${escapeHtml(item.questionId)}"
        data-group-id="${escapeHtml(group.id)}"
        data-repeat-index="${repeatIndex}"
      >
        <td>${escapeHtml(item.number || "")}</td>
        <td>${escapeHtml(item.text || "")}</td>
        <td>${escapeHtml(item.answertypeLabel || "–")}</td>
        <td>
          <input
            type="text"
            data-prefill="1"
            value="${repeatIndex === 0 ? escapeHtml(item.defaultPrefillText || "") : ""}"
            placeholder="valgfrit"
            style="width:100%;padding:.5rem"
          />
        </td>
      </tr>
    `).join("");
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

    const note =
      els.note.value.trim() ||
      null;

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

      note:
        $("note"),

      btnCreate:
        $("btnCreate"),

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

    els.btnCreate.addEventListener(
      "click",
      createFromTemplate
    );

    els.btnCreateBottom?.addEventListener(
      "click",
      createFromTemplate
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
    clearEntraCustomerContacts();

    await loadTemplates();
  }
);
