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
