console.log("index.js loaded");

async function checkAuthAndMaybeRedirect() {
  try {
    const r = await fetch("/.auth/me", { cache: "no-store" });
    const data = await r.json();
    const principal = data?.clientPrincipal;

    if (principal) {
      // Allerede logget ind som lcherrup.dk-bruger - spring kundevisningen
      // over og gå direkte til admin. Dette tjek fremtvinger IKKE login -
      // det kigger bare på en evt. eksisterende session.
      location.replace("./admin.html");
      return true;
    }
  } catch {
    // Kunne ikke slå login-status op - vis kundevisningen som fallback
  }
  return false;
}

async function init() {
  const redirected = await checkAuthAndMaybeRedirect();
  if (redirected) return;

  document.getElementById("checkingAuth")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");

  const btn = document.getElementById("continueBtn");
  const input = document.getElementById("customerCode");

  const goToSurvey = () => {
    console.log("Redirecting to kundesurvey");
    const code = input.value.trim();

    if (code.length !== 6 || isNaN(code)) {
      alert("Indtast et gyldigt 6-cifret nummer");
      return;
    }

    location.href = `./kundesurvey.html?code=${encodeURIComponent(code)}`;
  };

  btn.addEventListener("click", goToSurvey);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") goToSurvey();
  });
}

document.addEventListener("DOMContentLoaded", init);
