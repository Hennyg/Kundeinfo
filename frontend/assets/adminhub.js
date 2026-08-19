// /frontend/assets/adminhub.js
//
// Login/logout-visning på admin.html håndteres allerede af den indlejrede
// auth-guard.js (viser/skjuler #loading, #app, #authDenied og sætter
// #userInfo). Denne fil forsøgte tidligere selv at styre #btnLogin/
// #btnLogout, som ikke findes i admin.html - det gav et uncaught
// TypeError ("Cannot read properties of null") på hver sideindlæsning.
//
// Filen er bevidst tømt for at undgå det crash. Tilføj evt. admin.html-
// specifik logik her igen, men brug optional chaining (?.) hvis du
// refererer til elementer, så en manglende knap ikke vælter resten af siden.
