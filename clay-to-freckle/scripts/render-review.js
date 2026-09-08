#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWrite, readJson, renderChanges, sha256, validateOutcomeContracts } = require('./lib');

const [, , journalArg, outArg] = process.argv;
if (!journalArg) {
  console.error('Usage: node render-review.js <journal-dir> [out.md]');
  process.exit(1);
}
const journal = path.resolve(journalArg);
const state = readJson(path.join(journal, 'state.json'));
const planPath = path.join(journal, 'system-plan.json');
if (!fs.existsSync(planPath)) throw new Error('Missing system-plan.json');
const plan = readJson(planPath);
const out = outArg || path.join(journal, 'workbook-review.md');
const included = state.tables.filter((table) => table.included !== false);
if (included.some((table) => table.local.prepare !== 'done')) throw new Error('All included tables must be prepared before review');

const allowed = new Set(['recreate', 'fold', 'consolidate', 'embed', 'standalone', 'defer', 'exclude']);
const dispositions = plan.tableDispositions || [];
for (const table of included) {
  const matches = dispositions.filter((item) => item.tableId === table.id);
  if (matches.length !== 1) throw new Error(`system-plan.json must contain exactly one disposition for ${table.id}`);
  if (!allowed.has(matches[0].disposition)) throw new Error(`Invalid disposition for ${table.id}: ${matches[0].disposition}`);
}
if (!plan.destination?.shape || !Array.isArray(plan.destination?.stages) || !Array.isArray(plan.destination?.sourceContract) || !Array.isArray(plan.destination?.finalOutputs)) throw new Error('system-plan.json has an incomplete destination contract');
if (plan.implementation?.resolvedByFreckleSkill !== true) throw new Error('Freckle implementation choices must be resolved before review');
if (plan.version === 3) validateOutcomeContracts(plan);

const md = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const itemText = (item) => typeof item === 'string' ? item : item?.name || item?.id || JSON.stringify(item);
const lines = [
  `# Freckle reconstruction review: ${md(plan.destination.name || state.target.name)}`,
  '',
  `Objective: ${md(plan.objective || 'Not stated')}`,
  '',
  '## Table decisions',
  '',
  '| Clay table | Disposition | Destination | Why |',
  '|---|---|---|---|'
];
for (const disposition of dispositions) {
  const table = included.find((candidate) => candidate.id === disposition.tableId);
  lines.push(`| ${md(table?.name || disposition.tableId)} | **${md(disposition.disposition)}** | ${md(disposition.destination || 'none')} | ${md(disposition.reason)} |`);
}

lines.push('', '## Destination graph', '', `Shape: **${md(plan.destination.shape)}**`, '', '```text');
if (plan.version === 3) {
  const stageNames = new Map([['source', 'Source'], ...plan.destination.stages.map((stage) => [stage.id, stage.name])]);
  if (plan.destination.shape === 'no_build') lines.push('[No Freckle build]');
  for (const stage of plan.destination.stages) {
    if (!stage.dependsOn.length) lines.push(`[${stage.name}]`);
    for (const producer of stage.dependsOn) lines.push(`[${stageNames.get(producer)}] -> [${stage.name}]`);
  }
  for (const outcome of plan.destination.outcomes) lines.push(`[${stageNames.get(outcome.from)}] -> [${outcome.kind}: ${outcome.consumer}]`);
} else if (!plan.destination.stages.length) lines.push('[No Freckle build]');
else {
  const sourceNames = plan.destination.sourceContract.map(itemText);
  const stageNames = plan.destination.stages.map((stage) => stage.name || stage.id);
  const outputNames = plan.destination.finalOutputs.map(itemText);
  lines.push(`[${sourceNames.join(', ') || 'source'}] -> ${stageNames.map((name) => `[${name}]`).join(' -> ')} -> [${outputNames.join(', ') || 'consumer outputs'}]`);
}
lines.push('```', '');
for (const stage of plan.destination.stages) {
  lines.push(`- **${md(stage.name || stage.id)}** — ${md(stage.intent)} Inputs: ${(stage.inputs || []).map(md).join(', ') || 'none'}. Outputs: ${(stage.outputs || []).map(md).join(', ') || 'none'}. Boundary: ${md(stage.boundaryReason || 'unspecified')}.`);
}

if (plan.version === 3) {
  lines.push('', '## Results and actions', '');
  for (const outcome of plan.destination.outcomes) {
    lines.push(`- **${md(outcome.id)}** — ${md(outcome.kind)} for ${md(outcome.consumer)}. Result: ${md(outcome.recordUnit)}. Fields: ${outcome.fields.map(md).join(', ') || 'none (intentional no-op)'}.`,
      `  When: ${md(outcome.when)}. Empty: ${md(outcome.onEmpty)}. Error: ${md(outcome.onError)}.`);
    if (outcome.write) {
      const write = outcome.write;
      lines.push(`  Action: ${md(write.operation)} on ${md(write.target)}. Mappings: ${write.mappings.map((mapping) => `${md(mapping.from)} → ${md(mapping.to)}`).join(', ') || 'none required'}.`,
        `  Match: ${md(write.match.rule)} (${write.match.fields.map(md).join(', ') || 'no matching fields'}). Overwrite: ${md(write.overwrite)}. Gate: ${md(write.gate)}.`);
    }
  }
  lines.push('', '## Meaningful omissions and changes', '', ...renderChanges(plan.changes));
}

lines.push('', '## Lean contracts', '', '### Source inputs', '');
if (!plan.destination.sourceContract.length) lines.push('- None.');
for (const field of plan.destination.sourceContract) lines.push(`- **${md(field.name)}**${field.required ? ' (required)' : ''} — from ${md(field.source)}; ${md(field.purpose)}.`);
lines.push('', '### Final outputs', '');
if (!plan.destination.finalOutputs.length) lines.push('- None.');
for (const field of plan.destination.finalOutputs) lines.push(`- **${md(field.name)}** — ${md(field.purpose)}; consumer: ${md(field.consumer)}.`);

lines.push('', '## Freckle implementation', '');
const assets = plan.implementation.assets || [];
if (!assets.length) lines.push('- No destination assets required.');
for (const asset of assets) lines.push(`- ${md(asset.name || asset.id)} — ${md(asset.type || 'asset')}${asset.reuse ? '; reuse contract verified' : ''}.`);

lines.push('', '## Gates, tests, and boundaries', '');
lines.push(`- Side effects: ${md(plan.safety?.sideEffects || 'not specified')}.`);
lines.push(`- Live gate: ${md(plan.safety?.liveGate || 'not specified')}.`);
lines.push(`- Real business replay cases: ${(plan.tests?.businessReplay || []).map(itemText).join(', ') || 'none specified'}.`);
lines.push(`- High-risk branch cases: ${(plan.tests?.branchCases || []).map(itemText).join(', ') || 'none specified'}.`);
if (plan.version === 3) for (const test of [...plan.tests.businessReplay, ...plan.tests.branchCases]) lines.push(`- ${md(test.name)} → ${test.outcomeIds.map(md).join(', ')}: ${md(test.expect)}.`);
lines.push(`- Cleanup: ${(plan.tests?.cleanup || []).map(itemText).join(', ') || 'none specified'}.`);
lines.push(`- Deferred boundaries: ${(plan.deferredBoundaries || []).map(itemText).join(', ') || 'none'}.`);
lines.push('', '## Approval', '', `Approval binds this system plan (SHA-256 \`${sha256(planPath)}\`) and the completed source briefs. Any material change returns to review.`, '');

atomicWrite(out, lines.join('\n'));
console.log(JSON.stringify({ ok: true, tables: included.length, stages: plan.destination.stages.length, sourceFields: plan.destination.sourceContract.length, finalOutputs: plan.destination.finalOutputs.length, out }));
