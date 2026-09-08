#!/usr/bin/env node
'use strict';

const path = require('path');
const { atomicWrite, readJson, renderChanges, sha256 } = require('./lib');

const [, , journalArg, outArg] = process.argv;
if (!journalArg) {
  console.error('Usage: node render-report.js <journal-dir> [out.md]');
  process.exit(1);
}
const journal = path.resolve(journalArg);
const state = readJson(path.join(journal, 'state.json'));
const plan = state.primitivePlan?.path ? readJson(state.primitivePlan.path) : null;
if (plan && sha256(state.primitivePlan.path) !== state.primitivePlan.sha256) throw new Error('Reconcile the changed system plan before rendering the final report');
const out = outArg || path.join(journal, 'final-report.md');
const tables = state.tables.filter((t) => t.included !== false);
const lines = [`# Clay → Freckle migration report`, '', `Clay ${state.mode} **${state.target.name}** (\`${state.target.id}\`)`, `Freckle Workbook: ${state.freckle.workbookId ? `\`${state.freckle.workbookId}\`` : 'pending'}`, '', '| Clay table | Kind | Seed | Workflow | Input Dataset | Output Dataset | Validation |', '|---|---|---:|---|---|---|---|'];
for (const t of tables) lines.push(`| ${t.name} | ${t.kind || 'unknown'} | ${t.counts?.rows ?? 0}/${t.counts?.total ?? 0} | ${t.build.assets?.workflowId || 'pending'} | ${t.build.assets?.inputDatasetId || 'pending'} | ${t.build.assets?.outputDatasetId || 'pending'} | ${t.validation.status} |`);
lines.push('', '## Meaningful omissions and changes', '', ...renderChanges(plan?.changes));
if (plan?.changes?.length) {
  const decision = state.decisions?.omissionReview;
  if (state.gates.omissionReview === 'done' && decision?.systemPlanSha256 === state.primitivePlan.sha256) lines.push('', 'The user chose to keep the result with these differences.');
  else if (decision?.decision === 'restore' && decision.systemPlanSha256 === state.primitivePlan.sha256) lines.push('', 'Restoration requested; update the contract and rerun affected cases before finalizing.');
  else lines.push('', 'Would you like any of these restored?');
}
const sampled = tables.reduce((n, t) => n + (t.counts?.rows || 0), 0);
const total = tables.reduce((n, t) => n + (t.counts?.total || 0), 0);
lines.push('', '## Historical data migration', '', `${sampled} of ${total} source records were sampled locally. Extraction and replay do not establish which records have been imported.`,
  state.primitivePlan?.version === 3 && !['done', 'n/a'].includes(state.gates.omissionReview) ? 'Resolve the omission review before offering historical migration.' : 'Offer historical migration separately using the approved lean contract; reconcile the import ledger before selecting rows.', '');
atomicWrite(out, lines.join('\n'));
console.log(JSON.stringify({ ok: true, tables: tables.length, sampled, total, out }));
