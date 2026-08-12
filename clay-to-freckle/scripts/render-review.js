#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWrite, readJson } = require('./lib');

const [, , journalArg, outArg] = process.argv;
if (!journalArg) {
  console.error('Usage: node render-review.js <journal-dir> [out.md]');
  process.exit(1);
}
const journal = path.resolve(journalArg);
const state = readJson(path.join(journal, 'state.json'));
const buildContextPath = path.join(journal, 'build-context.json');
const buildContext = fs.existsSync(buildContextPath) ? readJson(buildContextPath) : null;
const out = outArg || path.join(journal, 'workbook-review.md');
const included = state.tables.filter((t) => t.included !== false);
if (included.some((t) => t.local.prepare !== 'done')) throw new Error('All included tables must be prepared before rendering consolidated review');

const compactOpening = (opening, result) => {
  if (opening.length <= 2200) return opening;
  const primitives = opening.split('\n').map((line) => line.trim()).filter((line) => /^\d+\.\s/.test(line));
  const shown = primitives.slice(0, 8).map((line) => line.length > 180 ? `${line.slice(0, 177)}…` : line);
  if (primitives.length > shown.length) shown.push(`… ${primitives.length - shown.length} more primitives in the full brief.`);
  return [
    '```text',
    `[Clay rows] -> [${result.counts.actions} actions + ${result.counts.formulas} formulas] -> [Freckle output Dataset]`,
    '```',
    '',
    ...(shown.length ? shown : ['See the full brief for the detailed primitives.'])
  ].join('\n');
};

const lines = [`# Workbook migration review: ${state.target.name}`, '', `Clay ${state.mode} \`${state.target.id}\` → one shared Freckle Workbook.`, '', '## Workbook map', '', '```text'];
for (const table of included) lines.push(`[${table.order + 1}] ${table.name} (${table.kind === 'pure_data' ? 'pure-data passthrough' : 'logic workflow'})`);
lines.push('```', '', '## Tables', '');
for (const table of included) {
  const dir = state.mode === 'workbook' ? path.join(journal, 'tables', table.id) : journal;
  const brief = fs.readFileSync(path.join(dir, 'brief.md'), 'utf8');
  const walkthrough = (brief.match(/## 2\. Workflow walkthrough\s*\n([\s\S]*?)\n## 3\./) || [])[1]?.trim() || '';
  const result = readJson(path.join(dir, 'prepare-result.json'));
  const opening = walkthrough.split(/\n###\s+/)[0].trim();
  const section = compactOpening(/```|^\d+\.\s/m.test(opening) ? opening : [
    '```text',
    `[Clay rows] -> [${result.counts.actions} actions + ${result.counts.formulas} formulas] -> [Freckle output Dataset]`,
    '```',
    '',
    '1. Preview — preserve three historical Clay rows and the stable record key.',
    '2. Reproduce logic — carry the approved action/formula intents into the Freckle build.',
    '3. Output — land preserved history and future results in the shared Workbook.',
    '',
    opening ? `${opening.slice(0, 600)}${opening.length > 600 ? '…' : ''}` : '(workflow summary unavailable)'
  ].join('\n'), result);
  lines.push(`### ${table.order + 1}. ${table.name}`, '', `- Kind: **${table.kind === 'pure_data' ? 'pure-data fast path' : 'logic translation'}**`);
  lines.push(`- Rows: ${result.counts.rows} in the three-row build sample of ${result.counts.total}; columns: ${result.counts.fields + 2} including migration controls.`);
  const refs = result.referenceTargets || [];
  const refLabels = refs.map((ref) => {
    const label = ref.name || ref.targetId;
    const target = ref.url ? `[${label}](${ref.url})` : `\`${label}\``;
    const includedTarget = included.find((candidate) => candidate.id === ref.targetId);
    const declined = (state.decisions?.dependencies?.decline || []).includes(ref.targetId);
    return `${ref.sourceField || 'source'} → ${target}${includedTarget ? ' (included)' : declined ? ' (external boundary; not included)' : ` (${ref.status})`}`;
  });
  lines.push(`- Cross-table references: ${refLabels.length ? refLabels.join('; ') : result.crossTableRefs.length ? result.crossTableRefs.map((id) => `\`${id}\``).join(', ') : 'none detected'}.`);
  const noActive = result.lookupLikeWithoutActiveReference || [];
  if (noActive.length) lines.push(`- Lookup status: ${noActive.map((item) => item.fieldName).join(', ')} — no active target is present in Clay's current configuration.`);
  if (result.warnings.length) lines.push(`- Warnings: ${result.warnings.join('; ')}`);
  lines.push('', section, '');
}
if (buildContext) {
  lines.push('## Workbook-wide decisions', '');
  const substitutions = Object.entries(buildContext.providerSubstitutions || {});
  lines.push('- Provider substitutions:');
  if (substitutions.length) for (const [name, value] of substitutions) lines.push(`  - ${name}: ${value}`);
  else lines.push('  - none recorded');
  lines.push(`- Deferred actions: ${(buildContext.deferredActions || []).length ? buildContext.deferredActions.join('; ') : 'none recorded'}.`, '');
}
lines.push('## Approval', '', 'Approval freezes the exact brief hashes recorded in `state.json`. Any later artifact change automatically revokes approval.', '');
atomicWrite(out, lines.join('\n'));
console.log(JSON.stringify({ ok: true, tables: included.length, out }));
