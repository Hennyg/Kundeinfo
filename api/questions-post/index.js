const { dvFetch } = require("../_dataverse");

module.exports = async function (context, req) {
  try {
    const { text, required } = req.body || {};
    if (!text) return context.res = { status: 400, body: { error: "text is required" } };

    // Opret post-body med jeres felter
    const payload = {
      cr6da_text: text,
      cr6da_required: !!required
    };

    // Returnér den oprettede række
    const created = await dvFetch(`/cr6da_questions`, {
      method: "POST",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify(payload)
    });

    context.res = { status: 201, body: created };
  } catch (err) {
    context.res = { status: 500, body: { error: err.message } };
  }
};
