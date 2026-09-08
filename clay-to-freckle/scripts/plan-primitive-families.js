#!/usr/bin/env node
'use strict';

// Backward-compatible filename: this now produces run-level system evidence for
// both source tracks. It detects repetition; a human/agent still decides scope.

const fs = require('fs');
const path = require('path');
const { atomicJson, classifyTableReference, isSideEffectCandidate, readJson, sha256Text } = require('./lib');

const [, , journalArg, outArg] = process.argv;
if (!journalArg) {
  console.error('Usage: node plan-primitive-families.js <journal-dir> [out.json]');
  process.exit(1);
}
const journal = path.resolve(journalArg);
const state = readJson(path.join(journal, 'state.json'));
const out = outArg || path.join(journal, 'system-evidence.json');
const included = state.tables.filter((table) => table.included !== false);
const familyMap = new Map();
const signatureMap = new Map();
const tables = [];
const dependencyEdges = [];

const extractPathFor = (table) => state.mode === 'workbook' || table.origin === 'referenced_dependency' ? path.join(journal, 'tables', table.id, 'extract.json') : path.join(journal, 'extract.json');
const outputNames = (field) => {
  const schema = field.actionDefinition?.outputParameterSchema;
  if (Array.isArray(schema)) return schema.map((item) => item.name || item.displayName).filter(Boolean).sort();
  return Object.keys(schema?.properties || {}).sort();
};

for (const table of included) {
  const extractPath = extractPathFor(table);
  if (!fs.existsSync(extractPath)) throw new Error(`Missing extract for ${table.id}`);
  const extract = readJson(extractPath);
  const fields = extract.table?.fields || [];
  const byId = Object.fromEntries(fields.map((field) => [field.id, field]));
  const refs = (value) => [...String(value || '').matchAll(/\{\{(f_[A-Za-z0-9_]+)\}\}/g)].map((match) => match[1]).filter((id) => byId[id]);
  const downstream = Object.fromEntries(fields.map((field) => [field.id, []]));
  const dependencies = {};
  for (const field of fields) {
    const direct = ['inputFieldIds', 'conditionalRunFieldIds', 'delayFieldIds'].flatMap((key) => field[key] || []).filter((id) => byId[id]);
    dependencies[field.id] = [...new Set([...direct, ...refs(JSON.stringify(field.typeSettings || {}))])].filter((id) => id !== field.id);
    for (const id of dependencies[field.id]) downstream[id].push(field.id);
  }
  const actions = fields.filter((field) => field.type === 'action');
  const formulas = fields.filter((field) => field.type === 'formula');
  const generated = new Set([...actions, ...formulas].map((field) => field.id));
  const inputCandidates = fields.filter((field) => !generated.has(field.id) && (actions.length + formulas.length === 0 || downstream[field.id].length > 0));
  const outcomeCandidates = [...actions, ...formulas].filter((field) => downstream[field.id].length === 0);
  const activeRefs = (extract.tableReferences || []).filter((item) => item?.targetId && item.targetId !== table.id).map((item) => ({ item, classification: classifyTableReference(item, fields) })).filter(({ classification }) => classification.strong);
  for (const { item: ref, classification } of activeRefs) {
    const readsTarget = classification.relation === 'read_dependency';
    dependencyEdges.push({ fromTableId: readsTarget ? ref.targetId : table.id, toTableId: readsTarget ? table.id : ref.targetId, relation: classification.relation, status: ref.status || 'unresolved' });
  }

  const actionKeys = [];
  for (const field of actions) {
    const signature = {
      clayActionKey: field.typeSettings?.actionKey || 'unknown-action',
      inputNames: (field.typeSettings?.inputsBinding || []).map((item) => item.name).filter(Boolean).sort(),
      outputNames: outputNames(field)
    };
    actionKeys.push(signature.clayActionKey);
    const familyId = `cf_${sha256Text(JSON.stringify(signature)).slice(0, 12)}`;
    if (!familyMap.has(familyId)) familyMap.set(familyId, { familyId, signature, members: [], implementationOwner: 'freckle', frecklePlan: null });
    familyMap.get(familyId).members.push({ tableId: table.id, fieldId: field.id, fieldName: field.name });
  }

  const tableSignature = {
    actionKeys: actionKeys.sort(),
    formulaCount: formulas.length,
    sourceCount: (extract.sources || []).length,
    referenceCount: activeRefs.length,
    inputCandidateCount: inputCandidates.length,
    outcomeCandidateCount: outcomeCandidates.length
  };
  const signatureId = `ts_${sha256Text(JSON.stringify(tableSignature)).slice(0, 12)}`;
  if (!signatureMap.has(signatureId)) signatureMap.set(signatureId, { signatureId, signature: tableSignature, members: [] });
  signatureMap.get(signatureId).members.push({ tableId: table.id, tableName: table.name });
  tables.push({
    tableId: table.id,
    tableName: table.name,
    kind: actions.length + formulas.length ? 'logic_candidate' : 'reference_candidate',
    counts: { fields: fields.length, actions: actions.length, formulas: formulas.length, sources: (extract.sources || []).length },
    inputCandidates: inputCandidates.slice(0, 20).map((field) => ({ fieldId: field.id, name: field.name })),
    inputCandidatesOmitted: Math.max(0, inputCandidates.length - 20),
    outcomeCandidates: outcomeCandidates.slice(0, 20).map((field) => ({ fieldId: field.id, name: field.name })),
    outcomeCandidatesOmitted: Math.max(0, outcomeCandidates.length - 20),
    sideEffectCandidates: actions.filter(isSideEffectCandidate).map((field) => ({ fieldId: field.id, name: field.name, inputFieldIds: dependencies[field.id] })),
    fieldDependencies: Object.fromEntries(Object.entries(dependencies).filter(([, ids]) => ids.length)),
    activeReferenceTargets: activeRefs.map(({ item, classification }) => ({ tableId: item.targetId, relation: classification.relation })),
    signatureId
  });
}

const report = {
  version: 2,
  runId: state.runId,
  generatedAt: new Date().toISOString(),
  rule: 'Candidates are incomplete local evidence. No detected dependent column does not prove a terminal outcome or an unused field. Inspect external action mappings and human-facing results, then trace approved outcomes through field dependencies and mapped table references. This file does not choose dispositions or implementations.',
  tables,
  capabilityFamilies: [...familyMap.values()].sort((a, b) => a.familyId.localeCompare(b.familyId)),
  similarityGroups: [...signatureMap.values()].filter((group) => group.members.length > 1).sort((a, b) => a.signatureId.localeCompare(b.signatureId)),
  referenceCandidates: tables.filter((table) => table.kind === 'reference_candidate').map((table) => ({ tableId: table.tableId, tableName: table.tableName })),
  dependencyEdges
};
atomicJson(out, report);
console.log(JSON.stringify({ ok: true, tables: tables.length, families: report.capabilityFamilies.length, repeatedFamilies: report.capabilityFamilies.filter((family) => family.members.length > 1).length, similarityGroups: report.similarityGroups.length, referenceCandidates: report.referenceCandidates.length, out }));
