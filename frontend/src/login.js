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
