#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicJson, readJson } = require('./lib');

const [, , journalArg] = process.argv;
if (!journalArg) {
  console.error('Usage: node init-build-context.js <journal-dir>');
  process.exit(1);
}
const journal = path.resolve(journalArg);
const state = readJson(path.join(journal, 'state.json'));
const out = path.join(journal, 'build-context.json');
if (fs.existsSync(out)) {
  const current = readJson(out);
  if (current.runId !== state.runId) throw new Error('build-context.json belongs to a different run');
  console.log(JSON.stringify({ ok: true, created: false, out }));
  process.exit(0);
}
atomicJson(out, {
  version: 1,
  runId: state.runId,
  orgId: null,
  workbookId: null,
  decisions: {},
  primitiveFamilies: {},
  frecklePrimitivePlans: {},
  nodeContracts: {},
  importConstraints: { initialPreviewRows: 3, maxRowsPerHistoricalChunk: 500, maxBytesPerChunk: 1800000 },
  deferredActions: [],
  buildWaves: [],
  testWaves: [],
  postBuildPatchTasks: []
});
console.log(JSON.stringify({ ok: true, created: true, out }));
