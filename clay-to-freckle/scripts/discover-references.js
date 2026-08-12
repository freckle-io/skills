#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicJson, readJson, sha256 } = require('./lib');

const [, , journalArg, outArg] = process.argv;
if (!journalArg) {
  console.error('Usage: node discover-references.js <journal-dir> [reference-report.json]');
  process.exit(1);
}
const journal = path.resolve(journalArg);
const state = readJson(path.join(journal, 'state.json'));
const out = outArg || path.join(journal, 'reference-report.json');
const includedIds = new Set(state.tables.filter((table) => table.included !== false).map((table) => table.id));
const targets = new Map();
const lookupLikeWithoutActiveReference = [];

for (const sourceTable of state.tables.filter((table) => table.included !== false && table.local.extract === 'done')) {
  const dir = state.mode === 'workbook' ? path.join(journal, 'tables', sourceTable.id) : journal;
  const extractPath = path.join(dir, 'extract.json');
  if (!fs.existsSync(extractPath)) continue;
  const extract = readJson(extractPath);
  for (const column of extract.lookupLikeColumnsWithoutActiveReference || []) {
    lookupLikeWithoutActiveReference.push({ sourceTableId: sourceTable.id, sourceTableName: sourceTable.name, ...column });
  }
  for (const ref of extract.tableReferences || []) {
    let target = targets.get(ref.targetId);
    if (!target) {
      target = { targetId: ref.targetId, status: ref.status, target: ref.target || null, alreadyIncluded: includedIds.has(ref.targetId), referencedBy: [] };
      targets.set(ref.targetId, target);
    }
    if (target.status !== 'resolved' && ref.status === 'resolved') { target.status = ref.status; target.target = ref.target; }
    for (const evidence of ref.evidence || []) {
      const item = { sourceTableId: sourceTable.id, sourceTableName: sourceTable.name, ...evidence };
      if (!target.referencedBy.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) target.referencedBy.push(item);
    }
  }
}

const activeTargets = [...targets.values()].sort((a, b) => a.targetId.localeCompare(b.targetId));
const expansionCandidates = activeTargets.filter((item) => item.status === 'resolved' && !item.alreadyIncluded && item.target?.url && !item.target?.deletedAt);
const unresolvedActiveTargets = activeTargets.filter((item) => item.status !== 'resolved' || !item.target?.url || item.target?.deletedAt);
const report = {
  version: 1,
  runId: state.runId,
  stateRevision: state.revision,
  generatedAt: new Date().toISOString(),
  sourceExtracts: state.tables.filter((table) => table.included !== false && table.local.extract === 'done').map((table) => {
    const dir = state.mode === 'workbook' ? path.join(journal, 'tables', table.id) : journal;
    const file = path.join(dir, 'extract.json');
    return { tableId: table.id, sha256: fs.existsSync(file) ? sha256(file) : null };
  }),
  activeTargets,
  expansionCandidates,
  unresolvedActiveTargets,
  lookupLikeWithoutActiveReference,
  truthfulnessRule: 'Only live Clay configuration establishes a link. Names never prove a former or removed link.'
};
atomicJson(out, report);
console.log(JSON.stringify({ ok: true, activeTargets: activeTargets.length, expansionCandidates: expansionCandidates.length, unresolvedActiveTargets: unresolvedActiveTargets.length, lookupLikeWithoutActiveReference: lookupLikeWithoutActiveReference.length, out }));
