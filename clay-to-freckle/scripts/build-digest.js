#!/usr/bin/env node
'use strict';

// Produce compact, model-facing evidence. Full prompts, formulas, action envelopes,
// and row values remain only in extract.json and are queried selectively later.

const fs = require('fs');
const path = require('path');
const { atomicWrite, classifyTableReference, isSideEffectCandidate } = require('./lib');

const [, , extractArg, outDirArg, workbookArg, stateArg] = process.argv;
if (!extractArg || !outDirArg) {
  console.error('Usage: node build-digest.js <extract.json> <out-dir> [workbook.json] [state.json]');
  process.exit(1);
}

const extract = JSON.parse(fs.readFileSync(path.resolve(extractArg), 'utf8'));
const outDir = path.resolve(outDirArg);
const workbook = workbookArg && fs.existsSync(workbookArg) ? JSON.parse(fs.readFileSync(workbookArg, 'utf8')) : null;
const state = stateArg && fs.existsSync(stateArg) ? JSON.parse(fs.readFileSync(stateArg, 'utf8')) : null;
const fields = extract.table?.fields || [];
const records = extract.records || [];
const byId = Object.fromEntries(fields.map((field) => [field.id, field]));
const generated = new Set(fields.filter((field) => ['action', 'formula'].includes(field.type)).map((field) => field.id));
const refsIn = (value) => [...String(value || '').matchAll(/\{\{(f_[A-Za-z0-9_]+)\}\}/g)].map((match) => match[1]);
const dependencies = {};
const downstream = Object.fromEntries(fields.map((field) => [field.id, []]));

for (const field of fields) {
  const refs = new Set();
  const settings = field.typeSettings || {};
  for (const key of ['inputFieldIds', 'conditionalRunFieldIds', 'delayFieldIds']) {
    for (const id of field[key] || []) if (byId[id]) refs.add(id);
  }
  for (const id of refsIn(JSON.stringify(settings))) if (byId[id] && id !== field.id) refs.add(id);
  dependencies[field.id] = [...refs];
  for (const id of refs) downstream[id].push(field.id);
}

const classifiedRefs = (extract.tableReferences || []).filter((item) => item?.targetId && item.targetId !== extract.tableId).map((item) => ({ item, classification: classifyTableReference(item, fields) }));
const activeRefs = classifiedRefs.filter(({ classification }) => classification.strong);
const opaqueRefs = classifiedRefs.filter(({ classification }) => !classification.strong);
const roster = state?.tables || workbook?.tables || [];
const rosterById = Object.fromEntries(roster.map((table) => [table.id, table]));
const referenceLines = activeRefs.map(({ item, classification }) => {
  const evidence = (item.evidence?.[0]?.evidence || item.evidence?.[0] || {});
  const target = item.target || rosterById[item.targetId] || {};
  return `${classification.relation}: ${evidence.fieldName || evidence.kind || 'configuration'} -> ${target.name || item.targetId} (${item.status || 'unresolved'})${target.url ? ` ${target.url}` : ''}`;
});

const workFields = fields.filter((field) => generated.has(field.id));
const inputCandidates = fields.filter((field) => !generated.has(field.id) && (workFields.length === 0 || downstream[field.id].length > 0));
const outcomeCandidates = workFields.filter((field) => downstream[field.id].length === 0);
const sideEffects = workFields.filter(isSideEffectCandidate);
const population = (field) => records.filter((record) => {
  const value = record.cells?.[field.id];
  return value !== undefined && value !== null && value !== '';
}).length;
const names = (ids) => ids.map((id) => byId[id]?.name || id);
const compactList = (items, limit = 20) => {
  const shown = items.slice(0, limit);
  return { shown, omitted: Math.max(0, items.length - shown.length) };
};

const inputList = compactList(inputCandidates);
const outputList = compactList(outcomeCandidates);
const digest = [
  `# Source digest: ${extract.table?.name || extract.tableId}`,
  '',
  `- Table: \`${extract.tableId}\`${extract.viewId ? ` / view \`${extract.viewId}\`` : ''}`,
  `- Rows sampled: ${records.length} of ${extract.rowCount ?? records.length}`,
  `- Shape: ${fields.length} fields; ${workFields.filter((field) => field.type === 'action').length} actions; ${workFields.filter((field) => field.type === 'formula').length} formulas; ${(extract.sources || []).length} sources`,
  `- Active table references: ${referenceLines.length ? referenceLines.join('; ') : 'none detected'}`,
  `- Opaque table-like metadata IDs ignored: ${opaqueRefs.length}`,
  '',
  '## Capability evidence',
  ''
];
if (!workFields.length) digest.push('- No executable actions or formulas. Determine the data consumer and change cadence before choosing embed, Dataset, or exclusion.');
for (const field of workFields) {
  const key = field.type === 'action' ? field.typeSettings?.actionKey || field.actionDefinition?.displayName || 'unknown action' : 'formula';
  const condition = field.typeSettings?.conditionalRunFormulaText ? 'conditional' : 'always';
  digest.push(`- **${field.name}** — ${key}; ${condition}; inputs: ${names(dependencies[field.id]).join(', ') || 'none detected'}; consumers: ${names(downstream[field.id]).join(', ') || 'none detected (human use unresolved)'}; sample population: ${population(field)}/${records.length}.`);
}
digest.push('', '## Contract candidates', '');
digest.push(`- Possible source inputs: ${inputList.shown.map((field) => field.name).join(', ') || 'none inferred'}${inputList.omitted ? `; ${inputList.omitted} more remain in extract.json` : ''}.`);
digest.push(`- Possible business outcomes: ${outputList.shown.map((field) => field.name).join(', ') || 'none inferred'}${outputList.omitted ? `; ${outputList.omitted} more remain in extract.json` : ''}.`);
digest.push(`- Possible external side effects: ${sideEffects.map((field) => field.name).join(', ') || 'none detected by name/action key'}.`);
digest.push('', '> Candidates are incomplete evidence. Inspect external mappings and human-facing final values before pruning; no detected dependent column proves neither an outcome nor an omission. Trace approved consumers across included tables.', '');

const fill = (hint) => `<!-- FILL: ${hint} -->`;
const brief = [
  `# Source evidence: ${extract.table?.name || extract.tableId}`,
  '',
  `Clay table \`${extract.tableId}\`; ${records.length}/${extract.rowCount ?? records.length} representative rows retained locally. Full configuration remains in \`extract.json\`.`,
  '',
  '## Verified facts',
  '',
  `- ${fields.length} fields: ${workFields.filter((field) => field.type === 'action').length} actions, ${workFields.filter((field) => field.type === 'formula').length} formulas.`,
  `- Sources: ${(extract.sources || []).length ? `${extract.sources.length} configured source(s); inspect targeted source configuration if this path survives.` : 'none detected.'}`,
  `- Active table references: ${referenceLines.length ? referenceLines.join('; ') : 'none detected.'}`,
  `- Opaque table-like metadata IDs ignored: ${opaqueRefs.length}.`,
  '',
  '## Business role and live behavior',
  '',
  fill('two to five sentences describing what starts this table, what decisions it makes, and who consumes the result'),
  '',
  '## Capability primitives',
  '',
  fill('short ordered list of business capabilities and material run conditions; omit plumbing and provider envelope details'),
  '',
  '## Contract candidates',
  '',
  `- Source candidates from dependency evidence: ${inputList.shown.map((field) => field.name).join(', ') || 'none inferred'}.`,
  `- Terminal outcome candidates: ${outputList.shown.map((field) => field.name).join(', ') || 'none inferred'}.`,
  fill('identify only fields likely required by the actual upstream source, downstream decisions, side effects, or final consumers; note uncertain consumers'),
  '',
  '## Proposed table disposition',
  '',
  fill('choose recreate, fold, consolidate, embed, standalone, defer, or exclude; give evidence and name any likely destination relationship'),
  '',
  '## Risks and deferred boundaries',
  '',
  fill('list only uncertainties that could change scope, contract, side effects, or acceptance tests; otherwise say none'),
  ''
];

fs.mkdirSync(outDir, { recursive: true });
atomicWrite(path.join(outDir, 'digest.md'), digest.join('\n'));
atomicWrite(path.join(outDir, 'brief.md'), brief.join('\n'));
console.log(JSON.stringify({ ok: true, tableId: extract.tableId, fields: fields.length, capabilities: workFields.length, inputCandidates: inputCandidates.length, outcomeCandidates: outcomeCandidates.length }));
