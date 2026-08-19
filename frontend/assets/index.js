console.log("index.js loaded (v2)");

async function checkAuthAndMaybeRedirect() {
  // Tillader at se kundeforsiden selv når man er logget ind som
  // lcherrup.dk-bruger, fx via "Kundeindgang"-linket i admin's navbar.
  const skipRedirect = new URLSearchParams(location.search).has("preview");
  console.log("checkAuthAndMaybeRedirect: url =", location.href, "| skipRedirect =", skipRedirect);

  if (skipRedirect) {
    console.log("preview=1 fundet - viser kundevisning uden at tjekke login.");
    return false;
  }

  try {
    const r = await fetch("/.auth/me", { cache: "no-store" });
    const data = await r.json();
    const principal = data?.clientPrincipal;
    console.log("Login-status:", principal ? `logget ind som ${principal.userDetails}` : "ikke logget ind");

    if (principal) {
      // Allerede logget ind som lcherrup.dk-bruger - spring kundevisningen
      // over og gå direkte til admin. Dette tjek fremtvinger IKKE login -
      // det kigger bare på en evt. eksisterende session.
      console.log("Sender videre til admin.html…");
      location.replace("./admin.html");
      return true;
    }
  } catch (e) {
    console.warn("Kunne ikke slå login-status op, viser kundevisning som fallback:", e);
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
