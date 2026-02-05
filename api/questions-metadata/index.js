// /api/questions-metadata/index.js
const { dvFetch } = require('../_dataverse');

async function getPicklist(logicalAttributeName) {
  const path = `EntityDefinitions(LogicalName='crcc8_lch_question')/Attributes(LogicalName='${logicalAttributeName}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`;
  const r = await dvFetch(path);
  const meta = await r.json();
  const options = meta?.OptionSet?.Options || [];
  return options.map(o => ({ value: o.Value, label: o.Label?.UserLocalizedLabel?.Label || `${o.Value}` }));
}

module.exports = async function (context, req) {
  try {
    const group = await getPicklist('crcc8_lch_group');
    const answertype = await getPicklist('crcc8_lch_answertype');
    context.res = { body: { group, answertype } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
