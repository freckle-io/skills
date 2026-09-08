#!/usr/bin/env node
'use strict';

const path = require('path');
const { atomicJson, readJson } = require('./lib');

const [, , tableDirArg, outArg] = process.argv;
if (!tableDirArg) {
  console.error('Usage: node build-replay-fixtures.js <table-dir> [out.json]');
  process.exit(1);
}
const tableDir = path.resolve(tableDirArg);
const extract = readJson(path.join(tableDir, 'extract.json'));
const out = outArg || path.join(tableDir, 'replay-fixtures.json');
const fields = extract.table?.fields || [];
const records = extract.records || [];
const actionFields = fields.filter((field) => field.type === 'action');
const generatedFields = fields.filter((field) => ['action', 'formula'].includes(field.type));
const inputFields = fields.filter((field) => !['action', 'formula'].includes(field.type) && !['f_created_at', 'f_updated_at'].includes(field.id));

const statusBucket = (record) => {
  const statuses = actionFields.map((field) => record.cells?.[field.id]?.status).filter(Boolean);
  if (statuses.some((status) => /^SUCCESS$/.test(status))) return 'success';
  if (statuses.some((status) => /NO_DATA|NOT_FOUND|BLANK/i.test(status))) return 'no_data';
  if (statuses.some((status) => /ERROR|FAIL|TIMEOUT|INVALID/i.test(status))) return 'error';
  return 'other';
};
const selected = [];
for (const bucket of ['success', 'no_data', 'error', 'other']) {
  const record = records.find((candidate) => statusBucket(candidate) === bucket && !selected.includes(candidate));
  if (record && selected.length < 3) selected.push(record);
}
for (const record of records) if (selected.length < 3 && !selected.includes(record)) selected.push(record);

const comparisonMode = (field) => field.type === 'formula' ? 'exact' : /use-ai|claygent|research/i.test(field.typeSettings?.actionKey || '') ? 'directional' : 'business_contract';
const sideEffectPattern = /push|send|campaign|sequence|slack|webhook|create[-_ ]?(?:contact|company|deal)|update[-_ ]?(?:contact|company|deal)/i;
const sideEffectFields = actionFields.filter((field) => sideEffectPattern.test(`${field.name} ${field.typeSettings?.actionKey || ''}`)).map((field) => ({ fieldId: field.id, fieldName: field.name, replayPolicy: 'disabled_or_dry_run' }));

const fixture = {
  version: 2,
  candidateOnly: true,
  tableId: extract.tableId,
  tableName: extract.table?.name,
  sourceExtractRecords: records.length,
  selection: 'representative record pointers only; materialize values after the approved lean contract exists',
  cases: selected.map((record) => ({ clayRecordId: record.id, outcomeBucket: statusBucket(record) })),
  candidateInputFields: inputFields.map((field) => ({ fieldId: field.id, fieldName: field.name })),
  candidateOutcomeFields: generatedFields.map((field) => ({ fieldId: field.id, fieldName: field.name, mode: comparisonMode(field) })),
  sideEffectFields,
  rules: {
    readValuesFromExtractOnlyForApprovedFields: true,
    neverUseProviderEnvelopesAsInputs: true,
    neverAppendFixturesToProductionDataset: true,
    addOnlyNamedHighRiskBranchCases: true
  }
};
atomicJson(out, fixture);
console.log(JSON.stringify({ ok: true, tableId: fixture.tableId, cases: fixture.cases.length, inputCandidates: fixture.candidateInputFields.length, outcomeCandidates: fixture.candidateOutcomeFields.length, sideEffects: sideEffectFields.length, out }));
