import { getSurvey } from "./api.js";
import { renderQuestion } from "./components/Question.js";

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
    app.innerHTML = `<div class="panel">Der opstod en fejl ved indlæsning af spørgeskemaet.</div>`;
  }
}

async function handleSubmit(survey) {
  const values = {};

  survey.items.forEach(item => {
    const el = document.querySelector(`#q_${item.question.id}`);
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
``
