#!/usr/bin/env node
'use strict';

const child = require('child_process');
const fs = require('fs');
const path = require('path');
const { atomicJson, classifyTableReference, readJson, sha256 } = require('./lib');

const [, , tableDirArg, workbookArg] = process.argv;
if (!tableDirArg) {
  console.error('Usage: node prepare-table.js <table-dir> [workbook.json]');
  process.exit(1);
}
const tableDir = path.resolve(tableDirArg);
const extractPath = path.join(tableDir, 'extract.json');
const digestPath = path.join(tableDir, 'digest.md');
const briefPath = path.join(tableDir, 'brief.md');
const replayPath = path.join(tableDir, 'replay-fixtures.json');
const resultPath = path.join(tableDir, 'prepare-result.json');
const statePaths = [path.join(tableDir, 'state.json'), path.join(tableDir, '..', '..', 'state.json')];
const statePath = statePaths.find((candidate) => fs.existsSync(candidate));
const extract = readJson(extractPath);
const fields = extract.table?.fields || [];
const actions = fields.filter((field) => field.type === 'action').length;
const formulas = fields.filter((field) => field.type === 'formula').length;
const activeRefs = (extract.tableReferences || []).filter((item) => item?.targetId && item.targetId !== extract.tableId).map((item) => ({ item, classification: classifyTableReference(item, fields) })).filter(({ classification }) => classification.strong);
const kind = actions || formulas || (extract.sources || []).length ? 'logic_candidate' : 'reference_candidate';

if (!fs.existsSync(digestPath) || !fs.existsSync(briefPath)) {
  const args = [path.join(__dirname, 'build-digest.js'), extractPath, tableDir];
  if (workbookArg) args.push(path.resolve(workbookArg));
  if (workbookArg && statePath) args.push(statePath);
  else if (!workbookArg && statePath) args.push('', statePath);
  const run = child.spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr || run.stdout || 'build-digest failed');
}

const replay = child.spawnSync(process.execPath, [path.join(__dirname, 'build-replay-fixtures.js'), tableDir, replayPath], { encoding: 'utf8' });
if (replay.status !== 0) throw new Error(replay.stderr || replay.stdout || 'replay candidate build failed');

const fillSlotsRemaining = (fs.readFileSync(briefPath, 'utf8').match(/<!-- FILL:/g) || []).length;
const replayEvidence = readJson(replayPath);
const result = {
  version: 2,
  tableId: extract.tableId,
  tableName: extract.table?.name,
  phase: 'prepare',
  status: fillSlotsRemaining === 0 ? 'done' : 'needs_agent',
  kind,
  input: { extractSha256: sha256(extractPath) },
  artifacts: {
    digest: { path: digestPath, sha256: sha256(digestPath) },
    brief: { path: briefPath, sha256: sha256(briefPath) },
    replayCandidates: { path: replayPath, sha256: sha256(replayPath), localEvidenceOnly: true }
  },
  counts: { fields: fields.length, actions, formulas, rows: (extract.records || []).length, total: extract.rowCount ?? (extract.records || []).length },
  fillSlotsRemaining,
  crossTableRefs: [...new Set(activeRefs.map(({ item }) => item.targetId))],
  referenceTargets: activeRefs.map(({ item, classification }) => ({ targetId: item.targetId, name: item.target?.name || null, url: item.target?.url || null, status: item.status || 'unresolved', relation: classification.relation })),
  safety: { sideEffectCandidates: replayEvidence.sideEffectFields.length, fullExtractRemainsLocal: true },
  warnings: []
};
atomicJson(resultPath, result);
console.log(JSON.stringify({ tableId: result.tableId, kind, status: result.status, fillSlotsRemaining, rows: result.counts.rows, fields: result.counts.fields, result: resultPath }));
