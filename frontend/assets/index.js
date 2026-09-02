console.log("index.js loaded (v5)");

function hideAllPanels() {
  document.getElementById("checkingAuth")?.classList.add("hidden");
  document.getElementById("internalChoice")?.classList.add("hidden");
  document.getElementById("app")?.classList.add("hidden");
}

function showCustomerPanel() {
  hideAllPanels();
  document.getElementById("app")?.classList.remove("hidden");
}

function showInternalChoice() {
  hideAllPanels();
  document.getElementById("internalChoice")?.classList.remove("hidden");
}

// Afgør om vi skal vise "internt valg" (Se kundeindgang / Admin) eller
// kundens kode-login direkte.
//
// Prioritet:
// 1. ?preview=1  -> tving kundevisning, uanset alt andet (bruges af
//    "Se kundeindgang"-knappen og evt. direkte links).
// 2. ?internal=1 -> tving internt valg. Sættes på linket fra Herrup
//    Portalen, da et opkald derfra i sig selv er nok bevis for at det er
//    en intern bruger - vi behøver ikke vente på en evt. SWA-login-session,
//    som typisk IKKE findes endnu på dette tidspunkt.
// 3. Fallback: tjek /.auth/me for en eksisterende login-session (dækker
//    fx et gemt bogmærke eller direkte besøg fra en allerede logget-ind bruger).
//
// Selve sikkerheden ligger IKKE her - admin.html er stadig beskyttet af
// staticwebapp.config.json (allowedRoles: authenticated), så et gættet
// ?internal=1 udefra giver ikke reel adgang, kun UI-visningen.
async function resolveMode() {
  const params = new URLSearchParams(location.search);

  if (params.has("preview")) {
    console.log("preview=1 fundet - viser kundevisning.");
    return "customer";
  }

  if (params.has("internal")) {
    console.log("internal=1 fundet - viser internt valg (fra Herrup Portalen).");
    return "internal";
  }

  try {
    const r = await fetch("/.auth/me", { cache: "no-store" });
    const data = await r.json();
    const principal = data?.clientPrincipal;
    console.log("Login-status:", principal ? `logget ind som ${principal.userDetails}` : "ikke logget ind");
    return principal ? "internal" : "customer";
  } catch (e) {
    console.warn("Kunne ikke slå login-status op, viser kundevisning som fallback:", e);
    return "customer";
  }
}

async function init() {
  const mode = await resolveMode();

  if (mode === "internal") {
    showInternalChoice();
  } else {
    showCustomerPanel();
  }

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

  document.getElementById("goCustomerBtn")?.addEventListener("click", () => {
    showCustomerPanel();
  });

  document.getElementById("goAdminBtn")?.addEventListener("click", () => {
    location.href = "./admin.html";
  });
}

document.addEventListener("DOMContentLoaded", init);
