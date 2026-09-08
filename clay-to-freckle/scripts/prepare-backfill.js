#!/usr/bin/env node
'use strict';

const child = require('child_process');
const path = require('path');
const { atomicJson, readJson, sha256 } = require('./lib');

const [, , tableDirArg, manifestArg] = process.argv;
if (!tableDirArg || !manifestArg) {
  console.error('Usage: node prepare-backfill.js <table-dir> <approved-manifest.json>');
  process.exit(1);
}
const tableDir = path.resolve(tableDirArg);
const manifestPath = path.resolve(manifestArg);
const pulledPath = path.join(tableDir, 'extract-rest.json');
const filteredPath = path.join(tableDir, 'extract-backfill.json');
const csvPath = path.join(tableDir, 'data-rest.csv');
const planPath = path.join(tableDir, 'import-rest-plan.json');
const pulled = readJson(pulledPath);
const manifest = readJson(manifestPath);
if (manifest.approved !== true || !manifest.systemPlanSha256) throw new Error('Historical manifest must be approved and bound to a system-plan hash');
const statePaths = [path.join(tableDir, 'state.json'), path.join(tableDir, '..', '..', 'state.json')];
const statePath = statePaths.find((candidate) => { try { readJson(candidate); return true; } catch { return false; } });
if (!statePath) throw new Error('Cannot locate the run state for historical migration');
const state = readJson(statePath);
if (state.gates?.review !== 'approved' || state.primitivePlan?.sha256 !== manifest.systemPlanSha256) throw new Error('Historical manifest is not bound to the currently approved system plan');
if (state.primitivePlan?.path && sha256(state.primitivePlan.path) !== manifest.systemPlanSha256) throw new Error('Approved system plan has changed');
if (state.primitivePlan?.version === 3 && !['done', 'n/a'].includes(state.gates?.omissionReview)) throw new Error('Historical migration waits for the omission review decision');
const includedTables = (state.tables || []).filter((table) => table.included !== false);
if (includedTables.some((table) => !['done', 'n/a'].includes(table.build?.status) || !['done', 'n/a'].includes(table.validation?.status)) || !['done', 'n/a'].includes(state.gates?.cleanup || 'n/a')) throw new Error('Historical migration requires completed build, replay validation, and cleanup');
if (!Array.isArray(manifest.columns) || !manifest.columns.length) throw new Error('Historical manifest has no columns');
if (new Set(manifest.columns.map((column) => column.name)).size !== manifest.columns.length) throw new Error('Historical manifest column names must be unique');
const sourceFieldIds = new Set((pulled.table?.fields || []).map((field) => field.id));
for (const column of manifest.columns) {
  if (!column.name) throw new Error('Every historical manifest column needs a name');
  const supported = column.source === 'recordId' || column.fieldId || Object.prototype.hasOwnProperty.call(column, 'staticValue');
  if (!supported) throw new Error(`Unsupported historical mapping for ${column.name}`);
  if (column.fieldId && !sourceFieldIds.has(column.fieldId)) throw new Error(`Unknown Clay field mapping for ${column.name}: ${column.fieldId}`);
}

const keyColumn = manifest.key?.column ? manifest.columns.find((column) => column.name === manifest.key.column) : null;
if (manifest.key?.column && !keyColumn) throw new Error(`Manifest key column not found: ${manifest.key.column}`);
const valueFor = (record, column) => {
  if (column.source === 'recordId') return record.id;
  if (column.fieldId) return record.cells?.[column.fieldId];
  return column.staticValue;
};
const seen = new Set();
let duplicatesSkipped = 0;
const selected = [];
for (const record of pulled.records || []) {
  if (!keyColumn) { selected.push(record); continue; }
  const key = valueFor(record, keyColumn);
  if (key !== undefined && key !== null && key !== '' && seen.has(String(key))) { duplicatesSkipped++; continue; }
  if (key !== undefined && key !== null && key !== '') seen.add(String(key));
  selected.push(record);
}
const filtered = {
  ...pulled,
  records: selected,
  recordsFetched: selected.length,
  dataMigrationSelection: { method: keyColumn ? `dedupe-by-${manifest.key.column}` : 'all-approved-rows-keyless', pulled: (pulled.records || []).length, selected: selected.length, duplicatesSkipped }
};
atomicJson(filteredPath, filtered);
const csv = child.spawnSync(process.execPath, [path.join(__dirname, 'build-csv.js'), filteredPath, manifestPath, csvPath], { encoding: 'utf8' });
if (csv.status !== 0) throw new Error(csv.stderr || csv.stdout || 'build-csv failed');
const preflight = child.spawnSync(process.execPath, [path.join(__dirname, 'import-preflight.js'), csvPath, manifestPath, filteredPath, planPath], { encoding: 'utf8' });
if (preflight.status !== 0) throw new Error(preflight.stderr || preflight.stdout || 'historical migration preflight failed');
console.log(JSON.stringify({ ok: true, selected: selected.length, duplicatesSkipped, columns: manifest.columns.length, key: manifest.key?.column || null, csv: csvPath, importPlan: planPath }));
