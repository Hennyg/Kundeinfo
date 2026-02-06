


Du sagde:
Uploadet billede
Uploadet billede
Uploadet billede
Uploadet billede
Uploadet billede
Uploadet billede
Uploadet billede
Jeg er ved at lave en kundeinfo hjemmeside i static web app.
Jeg har 5 dataverse tabeller
På min side har jeg en adminedit.html hvor jeg opretter/retter spørgsmålene.
Jeg vil gerne have din hjælpe til at oprette en opretsurvey.html side, hvor jeg danner selve spørgeskemaet og opdatere min kundeinfo.html side til at vise selve spørgeskemaet for kunden. 
Lige nu er min index.html, således at jer der skal indtaste en 6 cifret kode for at få vist den specifikke kundeinfo side, men logikken bagved er ikke på plads: Skal du bruge flere info om min side for at komme til mine spørgmål?
min kundeinfo.html er meget tom:
<script type="module" src="./src/app.js"></script>
Min app.js:
import { getSurvey } from "./api.js";
import { renderQuestion } from "./components/question.js";

const app = document.getElementById("app");

async function init() {
  try {
    const token = new URLSearchParams(location.search).get("t");

    const survey = await getSurvey(token);

    const loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";

    // Render alle spørgsmål
    survey.items.forEach(item => {
      const q = renderQuestion(item);
      app.appendChild(q);
    });

    // Send knap
    const sendBtn = document.createElement("button");
    sendBtn.className = "btn"; // matcher din CSS
    sendBtn.innerText = "Send besvarelse";
    sendBtn.onclick = () => handleSubmit(survey);
    app.appendChild(sendBtn);
  } catch (err) {
    console.error(err);
    app.innerHTML = <div class="panel">Der opstod en fejl ved indlæsning af spørgeskemaet.</div>;
  }
}

async function handleSubmit(survey) {
  const values = {};

  survey.items.forEach(item => {
    const el = document.querySelector(#q_${item.question.id});
    values[item.question.id] = el ? el.value : null;
  });

  const res = await fetch("/api/SaveSurvey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: survey.token,
      answers: values
    })
  });

  if (!res.ok) {
    alert("Kunne ikke sende svarene. Prøv igen.");
    return;
  }

  alert("Tak! Svarene er sendt.");
}

init();

const continueBtn = document.getElementById("continueBtn");
const codeInput = document.getElementById("customerCode");

if (continueBtn) {
    continueBtn.addEventListener("click", () => {
        const code = codeInput.value.trim();

        if (code.length !== 6 || isNaN(code)) {
            alert("Indtast venligst en gyldig 6-cifret kode.");
            return;
        }

        // Redirect med token
        location.href = index.html?t=${code};
    });
}

ChatGPT sagde:

Tænkte i 20s
Nej — jeg kan godt komme i gang ud fra det du har sendt. Jeg antager bare én ting for at få det til at hænge sammen:

Kunden skal ende på kundeinfo.html?t=<token> (hvor t er din lch_surveyinstance.ich_token eller en “6-cifret kode” som kan mappes til token via API).

Din eksisterende /api/GetSurvey returnerer noget ala:

{ token, items: [ { question: {...}, sortorder: ... } ] }
Din /api/SaveSurvey kan modtage { token, answers }.

Nedenfor får du:

en opretsurvey.html (admin-side) der bygger en surveyinstance + surveyitems

en opdateret kundeinfo.html (viser spørgeskemaet)

en oprydning af din app.js (så den ikke også prøver at være “login side”)

en lille login.js til index.html (6-cifret kode → redirect til kundeinfo)

1) frontend/opretsurvey.html (admin: opret spørgeskema og få link)
<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Opret spørgeskema – LCH</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  <main style="max-width:1100px;margin:2rem auto;font-family:system-ui;padding:0 1rem">
    <h1>Opret spørgeskema</h1>

    <div class="panel" style="margin-bottom:1rem">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end">
        <label>
          Udløber (valgfri)
          <input id="expiresAt" type="datetime-local" style="width:100%;padding:.5rem">
        </label>

        <label>
          Template version (valgfri)
          <input id="templateVersion" type="number" min="1" value="1" style="width:100%;padding:.5rem">
        </label>
      </div>

      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
        <button id="reloadBtn" class="btn" type="button">Genindlæs spørgsmål</button>
        <button id="createBtn" class="btn" type="button">Opret spørgeskema</button>
      </div>
    </div>

    <div class="panel">
      <h2>Vælg spørgsmål</h2>
      <div id="loading">Indlæser…</div>
      <div id="list"></div>
    </div>

    <div id="result" class="panel" style="display:none;margin-top:1rem">
      <h2>Link til kunden</h2>
      <p>Kopiér og send dette link:</p>
      <input id="linkOut" style="width:100%;padding:.6rem" readonly>
      <div style="margin-top:.5rem;display:flex;gap:10px;flex-wrap:wrap">
        <button id="copyBtn" class="btn" type="button">Kopiér</button>
        <a id="openBtn" class="btn" href="#" target="_blank" rel="noopener">Åbn</a>
      </div>
    </div>

    <div id="err" class="panel" style="display:none;margin-top:1rem"></div>
  </main>

  <script type="module" src="./src/opretsurvey.js"></script>
</body>
</html>
frontend/src/opretsurvey.js
import { listQuestions, createSurvey } from "./api.js";

const elLoading = document.getElementById("loading");
const elList = document.getElementById("list");
const elErr = document.getElementById("err");
const elResult = document.getElementById("result");
const elLinkOut = document.getElementById("linkOut");
const elOpenBtn = document.getElementById("openBtn");

const expiresAt = document.getElementById("expiresAt");
const templateVersion = document.getElementById("templateVersion");

document.getElementById("reloadBtn").addEventListener("click", load);
document.getElementById("createBtn").addEventListener("click", onCreate);

document.getElementById("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(elLinkOut.value);
  alert("Link kopieret.");
});

async function load() {
  elErr.style.display = "none";
  elResult.style.display = "none";
  elLoading.style.display = "block";
  elList.innerHTML = "";

  try {
    const questions = await listQuestions();

    // grupper efter ich_group (valg)
    const groups = new Map();
    for (const q of questions) {
      const g = q.group ?? "Uden gruppe";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(q);
    }

    for (const [g, qs] of groups.entries()) {
      const wrap = document.createElement("div");
      wrap.style.margin = "12px 0";

      const h = document.createElement("h3");
      h.textContent = g;
      wrap.appendChild(h);

      const tbl = document.createElement("div");
      tbl.style.display = "grid";
      tbl.style.gridTemplateColumns = "48px 90px 1fr 160px 90px";
      tbl.style.gap = "8px";
      tbl.style.alignItems = "center";

      // header
      tbl.appendChild(cell("✓", true));
      tbl.appendChild(cell("#", true));
      tbl.appendChild(cell("Tekst", true));
      tbl.appendChild(cell("Type", true));
      tbl.appendChild(cell("Required", true));

      // rows (sort på ich_number hvis den findes)
      qs.sort((a, b) => Number(a.number ?? 0) - Number(b.number ?? 0));

      for (const q of qs) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "qpick";
        cb.dataset.id = q.id;
        cb.checked = true;

        tbl.appendChild(cb);
        tbl.appendChild(cell(String(q.number ?? "")));
        tbl.appendChild(cell(q.text ?? ""));
        tbl.appendChild(cell(q.answertype ?? ""));
        tbl.appendChild(cell(q.isrequired ? "Ja" : "Nej"));
      }

      wrap.appendChild(tbl);
      elList.appendChild(wrap);
    }
  } catch (e) {
    showErr(e);
  } finally {
    elLoading.style.display = "none";
  }
}

function cell(text, isHeader = false) {
  const d = document.createElement("div");
  d.textContent = text;
  if (isHeader) d.style.fontWeight = "700";
  return d;
}

async function onCreate() {
  elErr.style.display = "none";
  elResult.style.display = "none";

  const selected = [...document.querySelectorAll(".qpick:checked")]
    .map(x => x.dataset.id);

  if (selected.length === 0) {
    alert("Vælg mindst ét spørgsmål.");
    return;
  }

  try {
    // datetime-local → ISO hvis udfyldt
    const exp = expiresAt.value ? new Date(expiresAt.value).toISOString() : null;

    const res = await createSurvey({
      questionIds: selected,
      expiresAt: exp,
      templateVersion: Number(templateVersion.value || 1)
    });

    // res: { token }
    const origin = location.origin;
    const link = `${origin}/kundeinfo.html?t=${encodeURIComponent(res.token)}`;

    elLinkOut.value = link;
    elOpenBtn.href = link;
    elResult.style.display = "block";
  } catch (e) {
    showErr(e);
  }
}

function showErr(e) {
  console.error(e);
  elErr.style.display = "block";
  elErr.innerHTML = `<b>Fejl:</b> ${escapeHtml(e?.message || String(e))}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

load();
2) frontend/kundeinfo.html (viser spørgeskemaet for kunden)
<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kundeinfo – LCH</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  <main style="max-width:900px;margin:2rem auto;font-family:system-ui;padding:0 1rem">
    <h1>Kundeinfo</h1>

    <div id="loading" class="panel">Indlæser spørgeskema…</div>
    <div id="app"></div>
  </main>

  <script type="module" src="./src/app.js"></script>
</body>
</html>
3) Opryd din frontend/src/app.js (kun spørgeskema – ikke login)
Din nuværende app.js har også “continueBtn/customerCode”-logik. Den hører hjemme i index.html (login), ikke i kundeinfo.

Erstat din app.js med:

import { getSurvey, saveSurvey } from "./api.js";
import { renderQuestion, readAnswerValue } from "./components/question.js";
import { wireConditionalLogic } from "./utils/conditional.js";

const app = document.getElementById("app");

async function init() {
  try {
    const token = new URLSearchParams(location.search).get("t");
    if (!token) throw new Error("Mangler token i linket.");

    const survey = await getSurvey(token);

    const loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";

    // render spørgsmål (sortér hvis backend ikke sorterer)
    const items = [...(survey.items || [])]
      .sort((a, b) => Number(a.sortorder ?? 0) - Number(b.sortorder ?? 0));

    for (const item of items) {
      const qEl = renderQuestion(item);
      app.appendChild(qEl);
    }

    // conditional show/hide
    wireConditionalLogic(items);

    const sendBtn = document.createElement("button");
    sendBtn.className = "btn";
    sendBtn.innerText = "Send besvarelse";
    sendBtn.onclick = () => handleSubmit(survey, items);
    app.appendChild(sendBtn);

  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="panel">Der opstod en fejl: ${escapeHtml(err?.message || String(err))}</div>`;
  }
}

async function handleSubmit(survey, items) {
  const answers = {};

  for (const item of items) {
    const q = item.question;
    const el = document.querySelector(`#q_${q.id}`);
    answers[q.id] = readAnswerValue(q, el);
  }

  const ok = await saveSurvey({ token: survey.token, answers });
  if (!ok) {
    alert("Kunne ikke sende svarene. Prøv igen.");
    return;
  }

  alert("Tak! Svarene er sendt.");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

init();
4) frontend/src/api.js (tilføj endpoints til opretsurvey)
Tilpas din api.js så den har disse funktioner (behold dine eksisterende, men tilføj dem her):

export async function getSurvey(token) {
  const res = await fetch(`/api/GetSurvey?t=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error("Kunne ikke hente spørgeskema.");
  return await res.json();
}

export async function saveSurvey(payload) {
  const res = await fetch("/api/SaveSurvey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.ok;
}

// ADMIN
export async function listQuestions() {
  const res = await fetch("/api/ListQuestions");
  if (!res.ok) throw new Error("Kunne ikke hente spørgsmål.");
  return await res.json(); // array
}

export async function createSurvey(payload) {
  const res = await fetch("/api/CreateSurvey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Kunne ikke oprette spørgeskema.");
  return await res.json(); // { token }
}
Du skal altså have 2 små Azure Functions: ListQuestions og CreateSurvey. (Jeg kan skrive dem til dig i Node, så de matcher din nuværende GetSurvey/SaveSurvey-stil.)

5) Fix din “6-cifret kode” flow (index → kundeinfo)
Lige nu gør du:

location.href = `index.html?t=${code}`;
Det giver loop. Det skal være:

location.href = `kundeinfo.html?t=${code}`;
Lav hellere en dedikeret frontend/src/login.js og hold index clean:

frontend/index.html (idé)
<!-- ... -->
<input id="customerCode" />
<button id="continueBtn" class="btn">Fortsæt</button>
<script type="module" src="./src/login.js"></script>
frontend/src/login.js
const continueBtn = document.getElementById("continueBtn");
const codeInput = document.getElementById("customerCode");

continueBtn?.addEventListener("click", async () => {
  const code = codeInput.value.trim();

  if (code.length !== 6 || isNaN(code)) {
    alert("Indtast venligst en gyldig 6-cifret kode.");
    return;
  }

  // Hvis de 6 cifre ER token:
  location.href = `kundeinfo.html?t=${encodeURIComponent(code)}`;

  // Hvis de 6 cifre skal valideres og mappes til token:
  // const res = await fetch(`/api/StartSurvey?code=${encodeURIComponent(code)}`);
  // if(!res.ok) return alert("Koden er ugyldig");
  // const { token } = await res.json();
  // location.href = `kundeinfo.html?t=${encodeURIComponent(token)}`;
});
Næste skridt (så jeg kan lave backend helt korrekt uden at gætte)
Hvis du vil have mig til at skrive ListQuestions/CreateSurvey Azure Functions 100% rigtigt til dine tabeller, så send (copy/paste) hvad du bruger i dag i:

api/GetSurvey/index.js

api/SaveSurvey/index.js

…så matcher jeg præcis samme auth + Dataverse-kald, og jeg bruger dine felter:

lch_question (ich_number, ich_answertype, ich_group, ich_isrequired, ich_text, ich_conditionalon, ich_conditionalvalue)

lch_surveyinstance (ich_token, ich_expiresat, ich_status, ich_templateversion)

lch_surveyitem (ich_surveyinstance lookup, ich_question lookup, ich_sortorder)

Hvis du sender de 2 filer, svarer jeg med de 2 nye API’er + evt. små tilpasninger i GetSurvey, så conditional og sortorder kommer “rent” ud til frontend.




