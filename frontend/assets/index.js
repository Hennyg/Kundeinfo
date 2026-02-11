console.log("index.js loaded");
const btn = document.getElementById("continueBtn");
const input = document.getElementById("customerCode");

btn.addEventListener("click", () => {
    console.log("Redirecting to kundesurvey");
    const code = input.value.trim();

    if (code.length !== 6 || isNaN(code)) {
        alert("Indtast et gyldigt 6-cifret nummer");
        return;
    }

    // Redirect til spørgeskema-siden
    location.href = `./kundesurvey.html?code=${encodeURIComponent(code)}`;
});
