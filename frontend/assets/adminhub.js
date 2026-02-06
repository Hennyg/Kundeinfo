const els = {
  me: document.getElementById('userInfo'),
  login: document.getElementById('btnLogin'),
  logout: document.getElementById('btnLogout'),
};

async function getMe() {
  try {
    const r = await fetch('/.auth/me');
    if (!r.ok) return null;
    const data = await r.json();
    return data?.clientPrincipal || null;
  } catch { return null; }
}

function setAuthUI(me) {
  if (me) {
    els.me.textContent = `${me.userDetails}`;
    els.login.classList.add('hidden');
    els.logout.classList.remove('hidden');
  } else {
    els.me.textContent = 'Ikke logget ind';
    els.login.classList.remove('hidden');
    els.logout.classList.add('hidden');
  }
}

(async function init() {
  const me = await getMe();
  setAuthUI(me);
})();
