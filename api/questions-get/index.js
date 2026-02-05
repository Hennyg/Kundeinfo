const { dvFetch } = require("../_dataverse");

module.exports = async function (context, req) {
  try {
    // vælg kolonner I har brug for
    const select = "$select=crcc8_lch_questionid,crcc8_lch_text,crcc8_lch_isrequired,createdon,modifiedon";
    // evt. sortering: &$orderby=createdon desc
    const data = await dvFetch(`/crcc8_lch_question?${select}`);
    context.res = { status: 200, body: data.value || [] };
  } catch (err) {
    context.res = { status: 500, body: { error: err.message } };
  }
};
