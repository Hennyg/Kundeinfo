import { getSurvey } from "./api.js";
import { renderQuestion } from "./components/Question.js";

const app = document.getElementById("app");

async function init() {
    const token = new URLSearchParams(location.search).get("t");

    const survey = await getSurvey(token);
    document.getElementById("loading").style.display = "none";

    // Render alle spørgsmål
    survey.items.forEach(item => {
        const q = renderQuestion(item);
        app.appendChild(q);
    });

    // Send knap
    const sendBtn = document.createElement("button");
    sendBtn.innerText = "Send besvarelse";
    sendBtn.onclick = () => handleSubmit(survey);
    app.appendChild(sendBtn);
}

async function handleSubmit(survey) {
    const values = {};

    survey.items.forEach(item => {
        const el = document.querySelector(`#q_${item.question.id}`);
        values[item.question.id] = el ? el.value : null;
    });

    await fetch("/api/SaveSurvey", {
        method: "POST",
        body: JSON.stringify({
            token: survey.token,
            answers: values
        })
    });

    alert("Tak! Svarene er sendt.");
}

init();
