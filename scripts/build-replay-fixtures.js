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

const cellMap = (record, selectedFields) => Object.fromEntries(selectedFields.map((field) => [field.name, record.cells?.[field.id] ?? null]));
const comparisonMode = (field) => {
  if (field.type === 'formula') return 'exact';
  if (/use-ai|claygent|research/i.test(field.typeSettings?.actionKey || '')) return 'directional';
  return 'business_contract';
};
const sideEffectPattern = /push|send|campaign|sequence|slack|instantly|heyreach|create[-_ ]?(?:contact|company|deal)|update[-_ ]?(?:contact|company|deal)/i;
const sideEffectFields = actionFields.filter((field) => sideEffectPattern.test(`${field.name} ${field.typeSettings?.actionKey || ''}`)).map((field) => ({ fieldId: field.id, fieldName: field.name, actionKey: field.typeSettings?.actionKey || null, replayPolicy: 'disabled_or_dry_run' }));

const fixture = {
  version: 1,
  tableId: extract.tableId,
  tableName: extract.table?.name,
  sourceExtractRecords: records.length,
  selectedRecords: selected.length,
  selection: 'prefer success, no-data, and error/alternate outcomes from the available build sample; fill in source order',
  cases: selected.map((record) => ({
    clayRecordId: record.id,
    outcomeBucket: statusBucket(record),
    preview: { importedFromClay: true, values: cellMap(record, fields) },
    replay: { importedFromClay: false, inputs: cellMap(record, inputFields), generatedOutputsOmitted: generatedFields.map((field) => field.name) },
    clayExpected: cellMap(record, generatedFields)
  })),
  comparison: generatedFields.map((field) => ({ fieldId: field.id, fieldName: field.name, clayType: field.type, mode: comparisonMode(field) })),
  sideEffectFields,
  rules: {
    replayExercisesFuturePath: true,
    neverReplayHistoricalOutputsAsInputs: true,
    doNotAppendReplayFixturesToProductionDataset: true,
    exactMeansNormalizedExactMatch: true,
    businessContractMeansCompareDownstreamOutcomeNotProviderEnvelope: true
  }
};
atomicJson(out, fixture);
console.log(JSON.stringify({ ok: true, tableId: fixture.tableId, cases: fixture.cases.length, comparisons: fixture.comparison.length, sideEffects: sideEffectFields.length, out }));
