const { dvFetch } = require("../_dataverse");

module.exports = async function (context, req) {
  try {
    // vælg kolonner I har brug for
    const select = "$select=cr6da_questionid,cr6da_text,cr6da_required,createdon,modifiedon";
    // evt. sortering: &$orderby=createdon desc
    const data = await dvFetch(`/cr6da_questions?${select}`);
    context.res = { status: 200, body: data.value || [] };
  } catch (err) {
    context.res = { status: 500, body: { error: err.message } };
  }
};
