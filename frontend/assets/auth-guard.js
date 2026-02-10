// assets/auth-guard.js
export async function requireAuth(options = {}) {
  const {
    // CSS selectors (du kan ændre dem hvis du vil)
    appSelector = "#app",
    loadingSelector = "#loading",
    deniedSelector = "#authDenied",
    userInfoSelector = "#userInfo",

    // adfærd
    autoRedirect = false, // true => sender direkte til login
  } = options;

  const appEl = document.querySelector(appSelector);
  const loadingEl = document.querySelector(loadingSelector);
  const deniedEl = document.querySelector(deniedSelector);
  const userInfoEl = document.querySelector(userInfoSelector);

  // Hjælpere
  const show = (el) => { if (el) el.style.display = ""; };
  const hide = (el) => { if (el) el.style.display = "none"; };

  // Default: skjul app, vis loading
  hide(appEl);
  show(loadingEl);
  hide(deniedEl);

  try {
    const res = await fetch("/.auth/me", { cache: "no-store" });
    const data = await res.json();
    const user = data?.clientPrincipal;

    hide(loadingEl);

    if (!user) {
      if (autoRedirect) {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/.auth/login/aad?post_login_redirect_uri=${returnTo}`;
        return;
      }
      show(deniedEl);
      return;
    }

    // Sæt userInfo hvis feltet findes
    if (userInfoEl) {
      userInfoEl.textContent = user.userDetails || "Logget ind";
    }

    show(appEl);
  } catch (e) {
    hide(loadingEl);
    if (autoRedirect) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/.auth/login/aad?post_login_redirect_uri=${returnTo}`;
      return;
    }
    show(deniedEl);
  }
}
