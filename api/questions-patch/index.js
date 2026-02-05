const { dvFetch } = require("../_dataverse");

module.exports = async function (context, req) {
  try {
    const { id, text, required } = req.body || {};
    if (!id) return context.res = { status: 400, body: { error: "id is required" } };

    const update = {};
    if (typeof text === "string") update.crcc8_lch_text = text;
    if (typeof required === "boolean") update.crcc8_lch_isrequired = required;

    // PATCH på entitetens set-navn + (GUID)
    await dvFetch(`/crcc8_lch_question(${id})`, {
      method: "PATCH",
      headers: { "If-Match": "*" }, // eller med etag for concurrency
      body: JSON.stringify(update)
    });

    context.res = { status: 204 }; // No Content
  } catch (err) {
    context.res = { status: 500, body: { error: err.message } };
  }
};
