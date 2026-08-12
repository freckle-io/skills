#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicJson, readJson, sha256Text } = require('./lib');

const [, , journalArg, outArg] = process.argv;
if (!journalArg) {
  console.error('Usage: node plan-primitive-families.js <journal-dir> [out.json]');
  process.exit(1);
}
const journal = path.resolve(journalArg);
const state = readJson(path.join(journal, 'state.json'));
if (state.mode !== 'workbook') throw new Error('Primitive-family grouping is Workbook-only; table runs go directly to Freckle planning');
const out = outArg || path.join(journal, 'primitive-families.json');
const families = new Map();
const pureDataTables = [];

for (const table of state.tables.filter((item) => item.included !== false)) {
  const extractPath = path.join(journal, 'tables', table.id, 'extract.json');
  if (!fs.existsSync(extractPath)) throw new Error(`Missing extract for ${table.id}`);
  const extract = readJson(extractPath);
  const actions = (extract.table?.fields || []).filter((field) => field.type === 'action');
  if (!actions.length) pureDataTables.push({ tableId: table.id, tableName: table.name });
  for (const field of actions) {
    const definition = field.actionDefinition || {};
    const outputs = Array.isArray(definition.outputParameterSchema)
      ? definition.outputParameterSchema.map((item) => item.name || item.displayName).filter(Boolean).sort()
      : Object.keys(definition.outputParameterSchema?.properties || {}).sort();
    const signature = {
      clayActionKey: field.typeSettings?.actionKey || 'unknown-action',
      clayDisplayName: definition.displayName || field.name,
      inputNames: (field.typeSettings?.inputsBinding || []).map((item) => item.name).filter(Boolean).sort(),
      availableOutputs: outputs
    };
    const familyId = `pf_${sha256Text(JSON.stringify(signature)).slice(0, 12)}`;
    if (!families.has(familyId)) families.set(familyId, { familyId, signature, members: [], implementationOwner: 'freckle', frecklePlan: null });
    families.get(familyId).members.push({ tableId: table.id, tableName: table.name, fieldId: field.id, fieldName: field.name });
  }
}
const report = {
  version: 1,
  runId: state.runId,
  generatedAt: new Date().toISOString(),
  rule: 'Families describe repeated Clay capabilities only. They never select or recommend Freckle providers, nodes, or workarounds.',
  families: [...families.values()].sort((a, b) => a.familyId.localeCompare(b.familyId)),
  pureDataTables
};
atomicJson(out, report);
console.log(JSON.stringify({ ok: true, families: report.families.length, repeatedFamilies: report.families.filter((family) => family.members.length > 1).length, pureDataTables: pureDataTables.length, out }));
