#!/usr/bin/env node
'use strict';

const path = require('path');
const { atomicWrite, readJson } = require('./lib');

const [, , journalArg, outArg] = process.argv;
if (!journalArg) {
  console.error('Usage: node render-report.js <journal-dir> [out.md]');
  process.exit(1);
}
const journal = path.resolve(journalArg);
const state = readJson(path.join(journal, 'state.json'));
const out = outArg || path.join(journal, 'final-report.md');
const tables = state.tables.filter((t) => t.included !== false);
const lines = [`# Clay → Freckle migration report`, '', `Clay ${state.mode} **${state.target.name}** (\`${state.target.id}\`)`, `Freckle Workbook: ${state.freckle.workbookId ? `\`${state.freckle.workbookId}\`` : 'pending'}`, '', '| Clay table | Kind | Seed | Workflow | Input Dataset | Output Dataset | Validation |', '|---|---|---:|---|---|---|---|'];
for (const t of tables) lines.push(`| ${t.name} | ${t.kind || 'unknown'} | ${t.counts?.rows ?? 0}/${t.counts?.total ?? 0} | ${t.build.assets?.workflowId || 'pending'} | ${t.build.assets?.inputDatasetId || 'pending'} | ${t.build.assets?.outputDatasetId || 'pending'} | ${t.validation.status} |`);
const sampled = tables.reduce((n, t) => n + (t.counts?.rows || 0), 0);
const total = tables.reduce((n, t) => n + (t.counts?.total || 0), 0);
lines.push('', '## Historical data migration', '', total > sampled ? `The build used ${sampled} of ${total} historical records for preview. Ask whether to migrate the remaining ${total - sampled} directly now.` : 'All available rows were included in the three-row preview; no further historical migration is needed.', '');
atomicWrite(out, lines.join('\n'));
console.log(JSON.stringify({ ok: true, tables: tables.length, sampled, total, out }));
