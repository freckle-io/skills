#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sha256Text = (text) => crypto.createHash('sha256').update(text).digest('hex');

const atomicWrite = (file, contents) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
};

const atomicJson = (file, value) => atomicWrite(file, JSON.stringify(value, null, 2) + '\n');

const dedupeNames = (names, reserved = []) => {
  const used = new Set(reserved);
  return names.map((raw) => {
    const base = String(raw || 'Unnamed column');
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base} (${n++})`;
    used.add(name);
    return name;
  });
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') {
      row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Malformed CSV: unterminated quoted cell');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
};

const classifyTableReference = (reference, fields = []) => {
  const byId = Object.fromEntries(fields.map((field) => [field.id, field]));
  const evidence = reference?.evidence || [];
  const sourceFields = [...new Map(evidence.map((item) => {
    const detail = item.evidence || item;
    const field = byId[detail.fieldId];
    return [detail.fieldId || detail.fieldName || detail.kind, {
      fieldId: detail.fieldId || null,
      fieldName: detail.fieldName || null,
      actionKey: field?.typeSettings?.actionKey || null
    }];
  })).values()];
  const actionKeys = sourceFields.map((item) => item.actionKey || '').filter(Boolean);
  const pathText = evidence.map((item) => item.path || '').join(' ');
  const sourceEvidence = evidence.some((item) => (item.evidence || item).kind === 'source');
  const outbound = actionKeys.some((key) => /^(route-row|send-row|push-to-table)$/i.test(key)) || sourceFields.some((item) => /send (?:table )?data|push to table/i.test(item.fieldName || ''));
  const readDependency = actionKeys.some((key) => /lookup|find.*(?:row|record)|table.*search/i.test(key));
  const explicitTarget = /(?:^|\.)(?:referencedTableId|targetTableId|sourceTableId|tableId)(?:\.|$|\[)/i.test(pathText);
  const relation = outbound ? 'outbound_write' : readDependency ? 'read_dependency' : sourceEvidence || explicitTarget ? 'active_reference' : 'opaque_metadata_id';
  return { relation, strong: relation !== 'opaque_metadata_id', sourceFields };
};

const isSideEffectCandidate = (field) => field.type === 'action' && /\b(create|update|upsert|delete|merge|associate|association|send|push|route|enroll|append|insert|write|webhook)\b/i.test(`${field.typeSettings?.actionKey || ''} ${field.name || ''}`.replace(/[-_]/g, ' '));

// Validate declared contracts, not semantic parity with Clay. Source evidence is
// reviewed separately; an omitted source behavior is invisible to this graph.
const validateOutcomeContracts = (plan) => {
  if (plan.version !== 3) throw new Error('New or revised system plans require version 3 outcome contracts');
  const destination = plan.destination || {};
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  const names = (value) => Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
  if (!Array.isArray(destination.stages) || !Array.isArray(destination.sourceContract) || !Array.isArray(destination.finalOutputs) || !Array.isArray(destination.outcomes)) throw new Error('Outcome contracts require stages, sourceContract, finalOutputs, and outcomes arrays');
  if (!Array.isArray(plan.changes)) throw new Error('System plan requires a changes array (empty when no meaningful differences exist)');
  const changes = new Set();
  for (const change of plan.changes) {
    if (!change || !['id', 'subject', 'reason', 'impact', 'evidence'].every((key) => text(change[key])) || !['omitted', 'changed', 'deferred'].includes(change.treatment)) throw new Error('Every meaningful change needs id, subject, treatment, reason, impact, and evidence');
    if (changes.has(change.id)) throw new Error(`Duplicate change ID: ${change.id}`);
    changes.add(change.id);
  }
  const sourceFields = destination.sourceContract.map((field) => field.name);
  if (!names(sourceFields)) throw new Error('Source field names must be nonempty and unique');
  const outputs = new Map([['source', new Set(sourceFields)]]);
  const stages = new Map();
  for (const stage of destination.stages) {
    if (!stage || !text(stage.id) || outputs.has(stage.id)) throw new Error(`Missing, duplicate, or reserved stage ID: ${stage?.id}`);
    if (!names(stage.dependsOn) || !names(stage.inputs) || !names(stage.outputs)) throw new Error(`Stage ${stage.id} needs unique dependsOn, inputs, and outputs arrays`);
    const available = new Set();
    for (const producer of stage.dependsOn) {
      if (!outputs.has(producer)) throw new Error(`Stage ${stage.id} has unknown, cyclic, or out-of-order dependency: ${producer}`);
      for (const field of outputs.get(producer)) available.add(field);
    }
    const missing = stage.inputs.filter((field) => !available.has(field));
    if (missing.length) throw new Error(`Stage ${stage.id} is missing fields from its immediate dependencies: ${missing.join(', ')}`);
    outputs.set(stage.id, new Set(stage.outputs));
    stages.set(stage.id, stage);
  }
  const outcomeIds = new Set();
  for (const outcome of destination.outcomes) {
    if (!outcome || !['id', 'from', 'consumer', 'recordUnit', 'when', 'onEmpty', 'onError'].every((key) => text(outcome[key]))) throw new Error('Every outcome needs id, from, consumer, recordUnit, when, onEmpty, and onError');
    if (outcomeIds.has(outcome.id)) throw new Error(`Duplicate outcome ID: ${outcome.id}`);
    outcomeIds.add(outcome.id);
    if (!['dataset', 'external_write', 'handoff', 'status'].includes(outcome.kind) || !names(outcome.fields)) throw new Error(`Outcome ${outcome.id} needs a supported kind and unique fields`);
    if (outcome.kind !== 'status' && !outcome.fields.length) throw new Error(`Outcome ${outcome.id} requires fields`);
    if (!outputs.has(outcome.from)) throw new Error(`Outcome ${outcome.id} has unknown producer: ${outcome.from}`);
    // Writes inside a stage may use its inputs without returning them. Dataset
    // and handoff fields must actually be returned by the producing stage.
    const available = new Set([...outputs.get(outcome.from), ...(outcome.kind === 'external_write' ? stages.get(outcome.from)?.inputs || [] : [])]);
    const missing = outcome.fields.filter((field) => !available.has(field));
    if (missing.length) throw new Error(`Outcome ${outcome.id} has unavailable fields: ${missing.join(', ')}`);
    if (outcome.kind === 'external_write') {
      const write = outcome.write || {};
      if (!['target', 'operation', 'overwrite', 'gate'].every((key) => text(write[key])) || !text(write.match?.rule) || !names(write.match?.fields) || !Array.isArray(write.mappings)) throw new Error(`External write ${outcome.id} needs target, operation, mappings, match fields/rule, overwrite, and gate`);
      const targets = new Set();
      for (const mapping of write.mappings) {
        if (!mapping || !text(mapping.from) || !text(mapping.to) || !outcome.fields.includes(mapping.from)) throw new Error(`External write ${outcome.id} has an unavailable field mapping`);
        if (targets.has(mapping.to)) throw new Error(`External write ${outcome.id} maps a destination property twice: ${mapping.to}`);
        targets.add(mapping.to);
      }
      if (write.match.fields.some((field) => !outcome.fields.includes(field))) throw new Error(`External write ${outcome.id} has unavailable matching fields`);
    }
  }
  if (destination.shape === 'no_build') {
    if (destination.stages.length || destination.outcomes.length || destination.finalOutputs.length) throw new Error('A no_build plan cannot declare executable outcomes or final fields');
  } else if (!destination.outcomes.length) throw new Error('Every build needs at least one explicit outcome');
  for (const field of destination.finalOutputs) {
    if (!destination.outcomes.some((outcome) => outcome.fields.includes(field.name))) throw new Error(`Final field has no outcome: ${field.name}`);
  }
  const liveStages = new Set();
  const visit = (id) => {
    if (id === 'source' || liveStages.has(id)) return;
    liveStages.add(id);
    for (const producer of stages.get(id).dependsOn) visit(producer);
  };
  for (const outcome of destination.outcomes) visit(outcome.from);
  for (const stage of destination.stages) {
    if (!liveStages.has(stage.id)) throw new Error(`Stage ${stage.id} reaches no declared outcome`);
    const unused = stage.outputs.filter((field) => !destination.stages.some((consumer) => consumer.dependsOn.includes(stage.id) && consumer.inputs.includes(field)) && !destination.outcomes.some((outcome) => outcome.from === stage.id && outcome.fields.includes(field)));
    if (unused.length) throw new Error(`Stage ${stage.id} exposes fields without a consumer: ${unused.join(', ')}`);
  }
  const covered = new Set();
  for (const test of [...(plan.tests?.businessReplay || []), ...(plan.tests?.branchCases || [])]) {
    if (!test || !text(test.name) || !text(test.expect) || !names(test.outcomeIds) || !test.outcomeIds.length) throw new Error('Each replay/branch case needs name, outcomeIds, and expect');
    for (const id of test.outcomeIds) {
      if (!outcomeIds.has(id)) throw new Error(`Test ${test.name} cites unknown outcome: ${id}`);
      covered.add(id);
    }
  }
  for (const id of outcomeIds) if (!covered.has(id)) throw new Error(`Outcome ${id} has no replay or branch case`);
};

const renderChanges = (changes) => {
  if (!Array.isArray(changes)) return ['Meaningful omissions were not recorded in this legacy plan; inspect the source before describing differences.'];
  if (!changes.length) return ['No meaningful omissions or changes were identified.'];
  const md = (value) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return ['| Business item | Treatment | Reason | Effect on the result |', '|---|---|---|---|', ...changes.map((item) => `| ${md(item.subject)} | ${md(item.treatment)} | ${md(item.reason)} | ${md(item.impact)} |`)];
};

module.exports = { atomicJson, atomicWrite, classifyTableReference, dedupeNames, isSideEffectCandidate, parseCsv, readJson, renderChanges, sha256, sha256Text, validateOutcomeContracts };
