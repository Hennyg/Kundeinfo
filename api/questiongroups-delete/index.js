// /api/questiongroups-delete/index.js
const { cdFetch: dvFetch } = require('../_coredata');

module.exports = async function (context, req) {
  try {
    const { id } = req.query;
    if (!id) return (context.res = { status: 400, body: 'Missing id' });

    await dvFetch(`cr175_lch_kundeinfo_spoergsmaalsgruppes(${id})`, {
      method: 'DELETE',
      headers: { 'If-Match': '*' }
    });

    context.res = { status: 204 };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
