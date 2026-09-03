// /api/kunde-adresser/index.js
//
// Henter navn, kundenr og adresser (+ registrerede produkter pr. adresse)
// for en kunde. Selve logikken ligger i den delte ../_kundeAdresser.js -
// samme funktion bruges også af /api/survey-start, så Kundeliste-tile'et
// på admincreate.html og Leveringsadresse-blokkene på kundesurvey.html
// altid viser identisk produktinfo.

const { getKundeAdresserMedProdukter } = require("../_kundeAdresser");

module.exports = async function (context, req) {
  try {
    const kundenr = String(req.query.kundenr || "").trim();
    if (!kundenr) {
      context.res = { status: 400, body: { error: "Mangler kundenr" } };
      return;
    }

    const { kunde, adresser } = await getKundeAdresserMedProdukter(kundenr);

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: { kunde, adresser }
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: err.status || 500, body: { error: err.message } };
  }
};
