// /api/questions-metadata/index.js
const { cdFetch: dvFetch } = require('../_coredata');

async function getPicklist(entityLogicalName, attributeLogicalName) {
  const path =
    `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')/` +
    `Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`;
  const r = await dvFetch(path);
  const meta = await r.json();
  const options = meta?.OptionSet?.Options || [];
  return options.map(o => ({ value: o.Value, label: o.Label?.UserLocalizedLabel?.Label || `${o.Value}` }));
}

module.exports = async function (context, req) {
  try {
    const svartype = await getPicklist('cr175_lch_kundeinfo_spoergsmaal', 'cr175_lch_svartype');
    context.res = { body: { svartype } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: err.message };
  }
};
