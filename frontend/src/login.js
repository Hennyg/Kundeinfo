const continueBtn = document.getElementById("continueBtn");
const codeInput = document.getElementById("customerCode");
const errBox = document.getElementById("loginError");

function showError(msg) {
  if (!errBox) return;
  errBox.style.display = "block";
  errBox.className = "panel";
  errBox.innerHTML = msg;
}

function normalizeCode(s) {
  return String(s || "").trim().replace(/\s+/g, "").replace(/\D/g, "");
}

function go() {
  const code = normalizeCode(codeInput?.value);

  if (code.length !== 6) {
    showError("Indtast venligst en gyldig 6-cifret kode.");
    return;
  }

  // Hvis de 6 cifre ER token:
  location.href = `kundesurvey.html?t=${encodeURIComponent(code)}`;

  // Hvis de 6 cifre skal valideres og mappes til token via API:
  // startSurveyWithCode(code);
}

codeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") go();
});

continueBtn?.addEventListener("click", go);

async function startSurveyWithCode(code) {
  try {
    const res = await fetch(`/api/StartSurvey?code=${encodeURIComponent(code)}`);
    if (!res.ok) {
      showError("Koden er ugyldig eller udløbet.");
      return;
    }
    const data = await res.json(); // { token }

    // Her også:
    location.href = `kundesurvey.html?t=${encodeURIComponent(data.token)}`;
  } catch (e) {
    console.error(e);
    showError("Der opstod en fejl. Prøv igen.");
  }
}
