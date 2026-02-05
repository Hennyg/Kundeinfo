const { dvFetch } = require("../_dataverse");

module.exports = async function (context, req) {
  try {
    const id = (req.query.id || req.body?.id || "").trim();
    if (!id) return context.res = { status: 400, body: { error: "id is required" } };

    await dvFetch(`/crcc8_lch_question(${id})`, { method: "DELETE" });
    context.res = { status: 204 };
  } catch (err) {
    context.res = { status: 500, body: { error: err.message } };
  }
};
