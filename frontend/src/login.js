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

async function go() {
  const code = normalizeCode(codeInput?.value);

  if (code.length !== 6) {
    showError("Indtast venligst et gyldigt 6-cifret nummer.");
    return;
  }

  // Ryd evt. gammel fejl
  showError("");
  errBox.classList.add("hidden");

  try {
    // Kun validering – vi ignorerer body
    const res = await fetch("/api/survey-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });

    if (!res.ok) {
      if (res.status === 404) {
        showError(
          "<strong>Denne survey findes ikke</strong><br>" +
          "Indtast det korrekte nummer eller kontakt <strong>Lely Center Herrup</strong>."
        );
        return;
      }
      throw new Error("Uventet fejl");
    }

    // ✅ Kun her går vi videre
    location.href = `kundesurvey.html?code=${encodeURIComponent(code)}`;

  } catch (e) {
    console.error(e);
    showError(
      "Der opstod en fejl. Prøv igen senere eller kontakt <strong>Lely Center Herrup</strong>."
    );
  }
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
