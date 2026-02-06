const continueBtn = document.getElementById("continueBtn");
const codeInput = document.getElementById("customerCode");
const errBox = document.getElementById("loginError");

function showError(msg) {
  if (!errBox) return;
  errBox.style.display = "block";
  errBox.className = "panel"; // hvis du vil genbruge din panel styling
  errBox.innerHTML = msg;
}

function normalizeCode(s) {
  // fjern mellemrum og alt der ikke er tal
  return String(s || "").trim().replace(/\s+/g, "").replace(/\D/g, "");
}

function go() {
  const code = normalizeCode(codeInput?.value);

  if (code.length !== 6) {
    showError("Indtast venligst en gyldig 6-cifret kode.");
    return;
  }

  // Hvis de 6 cifre ER token:
  location.href = `kundeinfo.html?t=${encodeURIComponent(code)}`;

  // Hvis de 6 cifre skal valideres og mappes til token via API:
  // startSurveyWithCode(code);
}

// Enter-tast i feltet
codeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") go();
});

continueBtn?.addEventListener("click", go);

// Optional: hvis du vil mappe 6-cifret kode -> token via API
async function startSurveyWithCode(code) {
  try {
    const res = await fetch(`/api/StartSurvey?code=${encodeURIComponent(code)}`);
    if (!res.ok) {
      showError("Koden er ugyldig eller udløbet.");
      return;
    }
    const data = await res.json(); // { token }
    location.href = `kundeinfo.html?t=${encodeURIComponent(data.token)}`;
  } catch (e) {
    console.error(e);
    showError("Der opstod en fejl. Prøv igen.");
  }
}
