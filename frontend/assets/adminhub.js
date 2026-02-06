async function getClientPrincipal() {
  const res = await fetch("/.auth/me");
  if (!res.ok) return null;
  const data = await res.json();
  return data?.clientPrincipal || null;
}

function setAuthUi(user) {
  const userInfo = document.getElementById("userInfo");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");

  if (user) {
    userInfo.textContent = `Logget ind: ${user.userDetails || ""}`;
    btnLogin.classList.add("hidden");
    btnLogout.classList.remove("hidden");
  } else {
    userInfo.textContent = "Ikke logget ind";
    btnLogin.classList.remove("hidden");
    btnLogout.classList.add("hidden");
  }
}

(async () => {
  const user = await getClientPrincipal();
  setAuthUi(user);
})();
