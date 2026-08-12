#!/usr/bin/env node
'use strict';

const child = require('child_process');
const path = require('path');
const { atomicJson, readJson } = require('./lib');

const [, , tableDir] = process.argv;
if (!tableDir) {
  console.error('Usage: node prepare-backfill.js <table-dir>');
  process.exit(1);
}
const seedPath = path.join(tableDir, 'extract.json'); // three-row build sample
const pulledPath = path.join(tableDir, 'extract-rest.json');
const manifestPath = path.join(tableDir, 'csv-manifest.json');
const filteredPath = path.join(tableDir, 'extract-backfill.json');
const csvPath = path.join(tableDir, 'data-rest.csv');
const planPath = path.join(tableDir, 'import-rest-plan.json');
const seed = readJson(seedPath);
const pulled = readJson(pulledPath);
const seen = new Set((seed.records || []).map((r) => r.id));
const duplicatesInPull = [];
const selected = [];
for (const record of pulled.records || []) {
  if (!record.id || seen.has(record.id)) { if (record.id) duplicatesInPull.push(record.id); continue; }
  seen.add(record.id); selected.push(record);
}
const filtered = { ...pulled, records: selected, recordsFetched: selected.length, recordsSkipOffset: 0, dataMigrationSelection: { method: 'record-id-set-difference', sampleIds: (seed.records || []).length, pulledIds: (pulled.records || []).length, selectedIds: selected.length, overlapsSkipped: duplicatesInPull.length } };
atomicJson(filteredPath, filtered);
const csv = child.spawnSync(process.execPath, [path.join(__dirname, 'build-csv.js'), filteredPath, manifestPath, csvPath], { encoding: 'utf8' });
if (csv.status !== 0) throw new Error(csv.stderr || csv.stdout || 'build-csv failed');
const preflight = child.spawnSync(process.execPath, [path.join(__dirname, 'import-preflight.js'), csvPath, manifestPath, filteredPath, planPath], { encoding: 'utf8' });
if (preflight.status !== 0) throw new Error(preflight.stderr || preflight.stdout || 'historical data migration preflight failed');
console.log(JSON.stringify({ ok: true, selected: selected.length, overlapsSkipped: duplicatesInPull.length, csv: csvPath, importPlan: planPath }));
