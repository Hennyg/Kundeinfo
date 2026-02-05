const { dvFetch } = require("../_dataverse");

module.exports = async function (context, req) {
  try {
    const { id, text, required } = req.body || {};
    if (!id) return context.res = { status: 400, body: { error: "id is required" } };

    const update = {};
    if (typeof text === "string") update.cr6da_text = text;
    if (typeof required === "boolean") update.cr6da_required = required;

    // PATCH på entitetens set-navn + (GUID)
    await dvFetch(`/cr6da_questions(${id})`, {
      method: "PATCH",
      headers: { "If-Match": "*" }, // eller med etag for concurrency
      body: JSON.stringify(update)
    });

    context.res = { status: 204 }; // No Content
  } catch (err) {
    context.res = { status: 500, body: { error: err.message } };
  }
};
