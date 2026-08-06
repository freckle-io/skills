#!/usr/bin/env node
'use strict';

const child = require('child_process');
const fs = require('fs');
const path = require('path');
const { atomicJson, atomicWrite, dedupeNames, readJson, sha256 } = require('./lib');

const [, , tableDir, workbookPath] = process.argv;
if (!tableDir) {
  console.error('Usage: node prepare-table.js <table-dir> [workbook.json]');
  process.exit(1);
}
const extractPath = path.join(tableDir, 'extract.json');
const digestPath = path.join(tableDir, 'digest.md');
const briefPath = path.join(tableDir, 'brief.md');
const manifestPath = path.join(tableDir, 'csv-manifest.json');
const csvPath = path.join(tableDir, 'data.csv');
const preflightPath = path.join(tableDir, 'import-plan.json');
const replayPath = path.join(tableDir, 'replay-fixtures.json');
const resultPath = path.join(tableDir, 'prepare-result.json');
const statePath = path.join(tableDir, '..', '..', 'state.json');
const extract = readJson(extractPath);
const fields = extract.table?.fields || [];
const actions = fields.filter((f) => f.type === 'action').length;
const formulas = fields.filter((f) => f.type === 'formula').length;
const executableSources = Array.isArray(extract.sources) && extract.sources.length > 0;
const activeRefs = Array.isArray(extract.tableReferences) ? extract.tableReferences.filter((item) => item?.targetId && item.targetId !== extract.tableId) : [];
const settingsBlob = JSON.stringify(fields.map((f) => f.typeSettings || {}));
const legacyRefs = activeRefs.length ? [] : [...new Set(settingsBlob.match(/t_[A-Za-z0-9]{10,}/g) || [])].filter((id) => id !== extract.tableId);
const crossTableRefs = [...new Set([...activeRefs.map((item) => item.targetId), ...legacyRefs])];
const kind = actions === 0 && formulas === 0 && !executableSources && crossTableRefs.length === 0 ? 'pure_data' : 'logic';

if (!fs.existsSync(digestPath) || !fs.existsSync(briefPath)) {
  const args = [path.join(__dirname, 'build-digest.js'), extractPath, tableDir];
  if (workbookPath) args.push(workbookPath);
  if (workbookPath && fs.existsSync(statePath)) args.push(statePath);
  const run = child.spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr || run.stdout || 'build-digest failed');
}

if (kind === 'pure_data') {
  let brief = fs.readFileSync(briefPath, 'utf8');
  const diagram = [
    '```text',
    '[3 Clay sample rows] -> [Imported-history preview] -> [Freckle output Dataset]',
    '```',
    '',
    '1. Preview — load up to three Clay rows without changing any historical value.',
    '2. Passthrough — preserve every row; this table contains no executable enrichment logic.',
    '3. Output — expose the same columns for shared-Workbook lookups and future appends.'
  ].join('\n');
  brief = brief.replace(/<!-- FILL: ASCII workflow diagram[\s\S]*?step — intent -->/, diagram);
  brief = brief.replace(/<!-- FILL: downstream pushes[\s\S]*?"none detected" -->/, 'None detected; this is a pure-data passthrough workflow.');
  brief = brief.replace(/<!-- FILL: list anything genuinely dropped[\s\S]*?are NOT dropped -->/, 'Nothing from the structure — every source column is preserved; remaining historical rows await the final data-migration choice.');
  atomicWrite(briefPath, brief);
}

const names = dedupeNames(fields.map((f) => f.name), ['Clay Record ID', 'Imported from Clay']);
const manifest = {
  version: 2,
  sourceTableId: extract.tableId,
  extractSha256: sha256(extractPath),
  columns: [
    { source: 'recordId', name: 'Clay Record ID' },
    ...fields.map((f, i) => ({ fieldId: f.id, name: names[i] })),
    { name: 'Imported from Clay', staticValue: true }
  ]
};
atomicJson(manifestPath, manifest);
const csv = child.spawnSync(process.execPath, [path.join(__dirname, 'build-csv.js'), extractPath, manifestPath, csvPath], { encoding: 'utf8' });
if (csv.status !== 0) throw new Error(csv.stderr || csv.stdout || 'build-csv failed');
const preflight = child.spawnSync(process.execPath, [path.join(__dirname, 'import-preflight.js'), csvPath, manifestPath, extractPath, preflightPath], { encoding: 'utf8' });
if (preflight.status !== 0) throw new Error(preflight.stderr || preflight.stdout || 'import preflight failed');
const replay = child.spawnSync(process.execPath, [path.join(__dirname, 'build-replay-fixtures.js'), tableDir, replayPath], { encoding: 'utf8' });
if (replay.status !== 0) throw new Error(replay.stderr || replay.stdout || 'replay fixture build failed');

const fillSlotsRemaining = (fs.readFileSync(briefPath, 'utf8').match(/<!-- FILL:/g) || []).length;
const result = {
  version: 1,
  tableId: extract.tableId,
  tableName: extract.table?.name,
  phase: 'prepare',
  status: fillSlotsRemaining === 0 ? 'done' : 'needs_agent',
  kind,
  input: { extractSha256: sha256(extractPath) },
  artifacts: {
    digest: { path: digestPath, sha256: sha256(digestPath) },
    brief: { path: briefPath, sha256: sha256(briefPath) },
    manifest: { path: manifestPath, sha256: sha256(manifestPath) },
    csv: { path: csvPath, sha256: sha256(csvPath) },
    importPlan: { path: preflightPath, sha256: sha256(preflightPath) },
    replayFixtures: { path: replayPath, sha256: sha256(replayPath) }
  },
  counts: { fields: fields.length, actions, formulas, rows: (extract.records || []).length, total: extract.rowCount ?? (extract.records || []).length },
  fillSlotsRemaining,
  crossTableRefs,
  referenceTargets: activeRefs.flatMap((item) => {
    const evidenceItems = Array.isArray(item.evidence) && item.evidence.length ? item.evidence : [{ evidence: { kind: 'source' } }];
    return evidenceItems.map((evidenceItem) => { const evidence = evidenceItem.evidence || evidenceItem; return { targetId: item.targetId, name: item.target?.name || null, url: item.target?.url || null, status: item.status || 'unresolved', sourceField: evidence.fieldName || (evidence.kind === 'source' ? 'source' : null) }; });
  }),
  lookupLikeWithoutActiveReference: (extract.lookupLikeColumnsWithoutActiveReference || []).map((item) => ({ fieldId: item.fieldId, fieldName: item.fieldName, status: 'no_active_target_in_current_config' })),
  warnings: readJson(preflightPath).warnings || []
};
atomicJson(resultPath, result);
console.log(JSON.stringify({ tableId: result.tableId, kind, status: result.status, fillSlotsRemaining, rows: result.counts.rows, fields: result.counts.fields, result: resultPath }));
