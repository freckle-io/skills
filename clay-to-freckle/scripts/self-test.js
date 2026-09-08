#!/usr/bin/env node
'use strict';

const assert = require('assert');
const child = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sha256, validateOutcomeContracts } = require('./lib');

const scripts = __dirname;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clay-to-freckle-test-'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
const run = (script, args, expected = 0) => {
  const result = child.spawnSync(process.execPath, [path.join(scripts, script), ...args], { encoding: 'utf8' });
  if (result.status !== expected) throw new Error(`${script} exited ${result.status}; expected ${expected}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
};
const field = (id, name, type = 'text', extra = {}) => ({ id, name, type, ...extra });
const record = (id, cells) => ({ id, cells });
const extract = (tableId, name, fields, records) => ({
  version: 1,
  workspaceId: 'ws_test',
  workbookId: 'wb_test',
  tableId,
  viewId: `gv_${tableId.slice(2)}`,
  extractedAt: '2026-09-04T00:00:00.000Z',
  rowCount: records.length,
  recordsFetched: records.length,
  table: { id: tableId, name, fields },
  tableSchema: {},
  sources: [],
  tableReferences: [],
  records
});
const completeBrief = (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/<!-- FILL:[\s\S]*?-->/g, 'Completed evidence-backed decision.'));

try {
  const tableJournal = path.join(root, 'table-run');
  const action = field('f_find', 'Find person', 'action', {
    typeSettings: {
      actionKey: 'providerFind',
      inputsBinding: [{ name: 'company', formulaText: '{{f_company}}' }],
      conditionalRunFormulaText: '{{f_company}} != ""',
      prompt: 'PRIVATE PROMPT THAT MUST STAY IN EXTRACT'
    },
    actionDefinition: { displayName: 'Provider Find', outputParameterSchema: [{ name: 'profileUrl' }] }
  });
  const formula = field('f_score', 'Fit score', 'formula', { typeSettings: { formulaText: '{{f_find}} ? 1 : 0' } });
  const fields = [field('f_company', 'Company'), field('f_unused', 'Unused debug value'), field('f_note', 'Legacy operator note'), action, formula];
  const records = [
    record('r_one', { f_company: 'A', f_unused: 'debug-a', f_find: { status: 'SUCCESS', fullValue: { profileUrl: 'https://example.test/a' } }, f_score: 1 }),
    record('r_two', { f_company: 'B', f_unused: 'debug-b', f_find: { status: 'SUCCESS_NO_DATA' }, f_score: 0 })
  ];
  writeJson(path.join(tableJournal, 'extract.json'), extract('t_single123456789', 'Single table', fields, records));

  let prepared = JSON.parse(run('prepare-table.js', [tableJournal]).stdout);
  assert.strictEqual(prepared.kind, 'logic_candidate');
  assert.strictEqual(prepared.status, 'needs_agent');
  assert(!fs.existsSync(path.join(tableJournal, 'data.csv')), 'preparation must not create a full-schema preview import');
  assert(!fs.existsSync(path.join(tableJournal, 'csv-manifest.json')), 'preparation must not auto-approve a historical manifest');
  const briefText = fs.readFileSync(path.join(tableJournal, 'brief.md'), 'utf8');
  assert(!briefText.includes('PRIVATE PROMPT'));
  assert(!briefText.includes('Preserved columns'));
  assert(briefText.length < 5000, 'source brief should stay compact');
  const replayCandidates = JSON.parse(fs.readFileSync(path.join(tableJournal, 'replay-fixtures.json')));
  assert.strictEqual(replayCandidates.candidateOnly, true);
  assert(replayCandidates.cases.every((item) => !item.inputs && !item.clayExpected));

  completeBrief(path.join(tableJournal, 'brief.md'));
  prepared = JSON.parse(run('prepare-table.js', [tableJournal]).stdout);
  assert.strictEqual(prepared.status, 'done');
  run('state.js', ['init', tableJournal]);
  let state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.mode, 'table');
  assert.strictEqual(state.nextAction, 'dependency_discovery');
  run('discover-references.js', [tableJournal]);
  run('state.js', ['record-dependencies', tableJournal, path.join(tableJournal, 'reference-report.json'), String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.nextAction, 'system_planning');

  const evidenceSummary = JSON.parse(run('plan-primitive-families.js', [tableJournal]).stdout);
  assert.strictEqual(evidenceSummary.tables, 1);
  const evidence = JSON.parse(fs.readFileSync(path.join(tableJournal, 'system-evidence.json')));
  assert.strictEqual(evidence.tables[0].inputCandidates.length, 1);
  assert.strictEqual(evidence.tables[0].inputCandidates[0].name, 'Company');
  assert.strictEqual(evidence.tables[0].outcomeCandidates[0].name, 'Fit score');

  const planPath = path.join(tableJournal, 'system-plan.json');
  const basePlan = {
    version: 3,
    runId: state.runId,
    objective: 'Find and score the right person',
    tableDispositions: [{ tableId: 't_single123456789', role: 'person research', disposition: 'recreate', destination: 'research', reason: 'owns the surviving behavior' }],
    destination: {
      shape: 'chained_workbook',
      name: 'Lean person research',
      sourceContract: [{ name: 'company', clayField: 'Company', source: 'upstream payload', required: true, purpose: 'research input' }],
      stages: [
        { id: 'research', name: 'Research person', intent: 'find a matching profile', sourceTables: ['t_single123456789'], dependsOn: ['source'], inputs: ['company'], outputs: ['profile_url'], boundaryReason: 'cost_retry' },
        { id: 'score', name: 'Score fit', intent: 'produce a deterministic fit score', sourceTables: ['t_single123456789'], dependsOn: ['research'], inputs: ['profile_url'], outputs: ['fit_score'], boundaryReason: 'single_stage' }
      ],
      finalOutputs: [{ name: 'fit_score', consumer: 'operator', purpose: 'prioritize qualified records' }],
      outcomes: [{ id: 'ranked_people', kind: 'dataset', from: 'score', consumer: 'operator', fields: ['fit_score'], recordUnit: 'one row per input company', when: 'every input', onEmpty: 'return a zero score', onError: 'retain an explicit failed result' }]
    },
    implementation: { resolvedByFreckleSkill: true, assets: [{ id: 'research', name: 'Research person', type: 'Workflow' }], stageMappings: [] },
    deferredBoundaries: [],
    changes: [{ id: 'legacy_note', subject: 'Legacy operator note', treatment: 'omitted', reason: 'No consumer identified in the configured graph', impact: 'Manual notes will not appear in the final table; confirm human use', evidence: 't_single123456789#f_note' }],
    safety: { sideEffects: 'disabled_until_live_gate', liveGate: 'human approval required' },
    tests: { businessReplay: [{ name: 'success row', outcomeIds: ['ranked_people'], expect: 'one row with the deterministic fit score' }, { name: 'no-data row', outcomeIds: ['ranked_people'], expect: 'one row with zero score' }], branchCases: [{ name: 'provider miss', outcomeIds: ['ranked_people'], expect: 'explicit no-match result; no silent row loss' }], cleanup: ['remove isolated test Dataset'] }
  };
  writeJson(planPath, basePlan);
  validateOutcomeContracts(basePlan);

  // Actual boundary omissions fail even when another earlier stage had the field.
  const invalid = (mutate, expected) => {
    const candidate = structuredClone(basePlan); mutate(candidate);
    assert.throws(() => validateOutcomeContracts(candidate), expected);
  };
  invalid((p) => { p.destination.stages[1].dependsOn = ['source']; }, /immediate dependencies/);
  invalid((p) => { p.destination.stages[0].outputs.push('debug'); }, /without a consumer/);
  invalid((p) => { p.destination.outcomes = []; }, /explicit outcome/);
  invalid((p) => { delete p.destination.outcomes[0].recordUnit; }, /recordUnit/);
  invalid((p) => { delete p.destination.outcomes[0].onEmpty; }, /onEmpty/);
  invalid((p) => { delete p.destination.outcomes[0].onError; }, /onError/);
  invalid((p) => { p.tests.branchCases = []; p.tests.businessReplay = []; }, /no replay/);
  invalid((p) => { p.destination.outcomes[0].fields.push('city'); }, /unavailable fields/);
  invalid((p) => { p.destination.outcomes[0].fields.push('profile_url'); }, /unavailable fields/);
  invalid((p) => { p.destination.stages[0].dependsOn = ['score']; }, /cyclic/);
  invalid((p) => { p.destination.finalOutputs.push({ name: 'company' }); }, /no outcome/);
  invalid((p) => { p.changes[0].treatment = 'inlined'; }, /meaningful change/);

  const crmPlan = structuredClone(basePlan);
  crmPlan.changes = [];
  const crmFields = ['email', 'city', 'state', 'country'];
  crmPlan.destination.sourceContract = crmFields.map((name) => ({ name, source: 'source payload', purpose: 'contact mutation' }));
  crmPlan.destination.stages = [
    { ...basePlan.destination.stages[0], id: 'normalize', inputs: crmFields, outputs: crmFields },
    { ...basePlan.destination.stages[1], id: 'write', dependsOn: ['normalize'], inputs: crmFields, outputs: [] }
  ];
  crmPlan.destination.finalOutputs = [];
  crmPlan.destination.outcomes = [{ id: 'contact_write', kind: 'external_write', from: 'write', consumer: 'HubSpot contact', fields: crmFields, recordUnit: 'one contact per matched email', when: 'valid email and writable empty properties', onEmpty: 'skip when no usable identity', onError: 'retain failure for review', write: { target: 'HubSpot contact', operation: 'upsert', mappings: crmFields.map((name) => ({ from: name, to: name })), match: { fields: ['email'], rule: 'exact normalized email' }, overwrite: 'empty properties only', gate: 'disabled until approved' } }];
  crmPlan.tests = { businessReplay: [{ name: 'contact write mapping', outcomeIds: ['contact_write'], expect: 'dry-run payload has city, state, country; existing values are preserved' }], branchCases: [], cleanup: [] };
  validateOutcomeContracts(crmPlan);
  for (const name of ['city', 'state', 'country']) {
    const missingHandoff = structuredClone(crmPlan);
    missingHandoff.destination.stages[0].outputs = crmFields.filter((field) => field !== name);
    assert.throws(() => validateOutcomeContracts(missingHandoff), /immediate dependencies/);
  }
  const missingMapping = structuredClone(crmPlan);
  missingMapping.destination.outcomes[0].write.mappings[0].from = 'absent_email';
  assert.throws(() => validateOutcomeContracts(missingMapping), /unavailable field mapping/);
  const missingPolicy = structuredClone(crmPlan);
  delete missingPolicy.destination.outcomes[0].write.overwrite;
  assert.throws(() => validateOutcomeContracts(missingPolicy), /overwrite/);

  const referencePlan = structuredClone(basePlan);
  referencePlan.destination.shape = 'dataset_or_reference';
  referencePlan.destination.stages = [];
  referencePlan.destination.finalOutputs = [{ name: 'company', consumer: 'operator', purpose: 'company reference' }];
  referencePlan.destination.outcomes[0].from = 'source';
  referencePlan.destination.outcomes[0].fields = ['company'];
  validateOutcomeContracts(referencePlan);

  const noBuildPlan = structuredClone(basePlan);
  noBuildPlan.destination = { shape: 'no_build', sourceContract: [], stages: [], finalOutputs: [], outcomes: [] };
  noBuildPlan.tests = { businessReplay: [], branchCases: [], cleanup: [] };
  validateOutcomeContracts(noBuildPlan);
  run('state.js', ['record-primitive-plan', tableJournal, planPath, String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.nextAction, 'consolidated_review');
  run('render-review.js', [tableJournal]);
  const review = fs.readFileSync(path.join(tableJournal, 'workbook-review.md'), 'utf8');
  assert(review.includes('**recreate**'));
  assert(review.includes('[Source] -> [Research person]'));
  assert(review.includes('[Research person] -> [Score fit]'));
  assert(review.includes('one row per input company'));
  assert(review.includes('Legacy operator note'));
  assert(!review.includes('Unused debug value'));
  run('state.js', ['approve', tableJournal, 'all']);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.nextAction, 'build_assets');
  assert.strictEqual(state.tables[0].review.systemPlanSha256, sha256(planPath));

  const completionPatch = path.join(tableJournal, 'test-completion-patch.json');
  writeJson(completionPatch, { tables: state.tables.map((table) => ({ ...table, build: { ...table.build, status: 'done' }, validation: { ...table.validation, status: 'done' } })), gates: { cleanup: 'done' } });
  run('state.js', ['patch', tableJournal, completionPatch, String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.nextAction, 'omission_review');
  run('render-report.js', [tableJournal]);
  const finalReport = fs.readFileSync(path.join(tableJournal, 'final-report.md'), 'utf8');
  assert(finalReport.includes('Legacy operator note') && finalReport.includes('restored'));
  assert(!finalReport.includes('Unused debug value'));
  const bypassPatch = path.join(tableJournal, 'bypass-review.json');
  writeJson(bypassPatch, { gates: { omissionReview: 'done' } });
  run('state.js', ['patch', tableJournal, bypassPatch, String(state.revision)], 1);

  const approvedManifest = path.join(tableJournal, 'approved-historical-manifest.json');
  writeJson(approvedManifest, {
    version: 2,
    approved: true,
    systemPlanSha256: state.primitivePlan.sha256,
    key: { column: 'Clay Record ID' },
    columns: [
      { source: 'recordId', name: 'Clay Record ID' },
      { fieldId: 'f_company', name: 'company' },
      { name: 'Imported from Clay', staticValue: true }
    ]
  });
  writeJson(path.join(tableJournal, 'extract-rest.json'), extract('t_single123456789', 'Single table', fields, [records[0], records[0], records[1]]));
  run('prepare-backfill.js', [tableJournal, approvedManifest], 1);
  const omissionDecision = path.join(tableJournal, 'omission-decision.json');
  writeJson(omissionDecision, { systemPlanSha256: 'stale-hash', decision: 'keep', restoreIds: [], userResponse: 'Keep the result as shown' });
  run('state.js', ['record-omission-review', tableJournal, omissionDecision, String(state.revision)], 1);
  writeJson(omissionDecision, { systemPlanSha256: state.primitivePlan.sha256, decision: 'keep', restoreIds: [], userResponse: 'Keep the result as shown' });
  run('state.js', ['record-omission-review', tableJournal, omissionDecision, String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.nextAction, 'complete');
  const backfill = JSON.parse(run('prepare-backfill.js', [tableJournal, approvedManifest]).stdout);
  assert.strictEqual(backfill.selected, 2);
  assert.strictEqual(backfill.duplicatesSkipped, 1);
  assert.strictEqual(backfill.columns, 3);
  const csv = fs.readFileSync(path.join(tableJournal, 'data-rest.csv'), 'utf8');
  assert(csv.startsWith('Clay Record ID,company,Imported from Clay\n'));
  assert(!csv.includes('debug-a'));

  // A requested restoration returns to planning and invalidates stale test credit.
  const revisedPlan = structuredClone(basePlan);
  revisedPlan.changes[0].impact = 'The operator may still want this note restored';
  writeJson(planPath, revisedPlan);
  run('state.js', ['record-primitive-plan', tableJournal, planPath, String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.tables[0].build.status, 'pending');
  assert.strictEqual(state.tables[0].validation.status, 'pending');
  assert.strictEqual(state.gates.omissionReview, 'pending');
  run('state.js', ['approve', tableJournal, 'all']);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  writeJson(completionPatch, { tables: state.tables.map((table) => ({ ...table, build: { ...table.build, status: 'done' }, validation: { ...table.validation, status: 'done' } })), gates: { cleanup: 'done' } });
  run('state.js', ['patch', tableJournal, completionPatch, String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  writeJson(omissionDecision, { systemPlanSha256: state.primitivePlan.sha256, decision: 'restore', restoreIds: ['legacy_note'], userResponse: 'Bring the operator note back' });
  run('state.js', ['record-omission-review', tableJournal, omissionDecision, String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.nextAction, 'system_planning');
  assert.strictEqual(state.tables[0].review.status, 'pending');

  run('state.js', ['record-primitive-plan', tableJournal, planPath, String(state.revision)], 1);
  const restoredPlan = structuredClone(basePlan);
  restoredPlan.changes = [];
  restoredPlan.destination.sourceContract.push({ name: 'operator_note', source: 'source payload', required: false, purpose: 'manual context in final Dataset' });
  for (const stage of restoredPlan.destination.stages) {
    stage.inputs.push('operator_note');
    stage.outputs.push('operator_note');
  }
  restoredPlan.destination.outcomes[0].fields.push('operator_note');
  restoredPlan.destination.finalOutputs.push({ name: 'operator_note', consumer: 'operator', purpose: 'manual context' });
  writeJson(planPath, restoredPlan);
  run('state.js', ['record-primitive-plan', tableJournal, planPath, String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.gates.omissionReview, 'n/a');
  assert.strictEqual(state.tables[0].validation.status, 'pending');
  run('state.js', ['approve', tableJournal, 'all']);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  writeJson(completionPatch, { tables: state.tables.map((table) => ({ ...table, build: { ...table.build, status: 'done' }, validation: { ...table.validation, status: 'done' } })), gates: { cleanup: 'done' } });
  run('state.js', ['patch', tableJournal, completionPatch, String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.nextAction, 'complete');
  run('render-report.js', [tableJournal]);
  assert(!fs.readFileSync(path.join(tableJournal, 'final-report.md'), 'utf8').includes('Would you like'));

  // Reading an approved legacy journal does not manufacture a new approval gate.
  const legacyJournal = path.join(root, 'legacy-run');
  fs.cpSync(tableJournal, legacyJournal, { recursive: true });
  const legacyPlan = structuredClone(basePlan);
  legacyPlan.version = 2;
  delete legacyPlan.destination.outcomes;
  delete legacyPlan.changes;
  const legacyPlanPath = path.join(legacyJournal, 'system-plan.json');
  writeJson(legacyPlanPath, legacyPlan);
  const legacyState = structuredClone(state);
  delete legacyState.primitivePlan.version;
  delete legacyState.gates.omissionReview;
  legacyState.primitivePlan.path = legacyPlanPath;
  legacyState.primitivePlan.sha256 = sha256(legacyPlanPath);
  writeJson(path.join(legacyJournal, 'state.json'), legacyState);
  assert.strictEqual(JSON.parse(run('state.js', ['status', legacyJournal, '--json']).stdout).nextAction, 'complete');
  run('render-review.js', [legacyJournal]);
  run('render-report.js', [legacyJournal]);
  assert(fs.readFileSync(path.join(legacyJournal, 'final-report.md'), 'utf8').includes('legacy plan'));

  fs.appendFileSync(planPath, '\n');
  run('state.js', ['reconcile', tableJournal]);
  state = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json'), 'utf8'));
  assert.strictEqual(state.nextAction, 'system_planning');
  assert.strictEqual(state.tables[0].review.status, 'pending');

  const scopeJournal = path.join(root, 'table-scope-run');
  const scopeSourceId = 't_scope11111111111';
  const scopeTargetId = 't_downstream222222';
  const routeField = field('f_route', 'Send table data', 'action', {
    typeSettings: { actionKey: 'route-row', referencedTableId: scopeTargetId, inputsBinding: [{ name: 'row', formulaText: '{{f_name}}' }] },
    actionDefinition: { displayName: 'Send table data', description: 'Send data to a Clay table or source as a new row.' }
  });
  const crmField = field('f_crm', 'Create contact', 'action', { typeSettings: { actionKey: 'hubspot-create-contact', inputsBinding: [{ name: 't_opaque_metadata', formulaText: 'opaque schema label' }] } });
  const normalizeCity = field('f_clean_city', 'Normalize city', 'formula', { typeSettings: { formulaText: '{{f_city}}.trim()' } });
  const updateDate = field('f_update', 'Update exportly date', 'action', { typeSettings: { actionKey: 'hubspot-update-object', inputsBinding: [{ name: 'city', formulaText: '{{f_clean_city}}' }], conditionalRunFormulaText: '{{f_name}} != ""' } });
  const scopeExtract = extract(scopeSourceId, 'Starting table', [field('f_name', 'Name'), field('f_city', 'City'), normalizeCity, updateDate, routeField, crmField], [record('r_scope', { f_name: 'A' })]);
  scopeExtract.tableReferences = [
    {
      targetId: scopeTargetId,
      status: 'resolved',
      target: { id: scopeTargetId, name: 'Downstream enrichment', workspaceId: 'ws_test', workbookId: 'wb_other', firstViewId: 'gv_downstream', rowCount: 12, deletedAt: null, url: `https://app.clay.com/workspaces/ws_test/workbooks/wb_other/tables/${scopeTargetId}/views/gv_downstream` },
      evidence: [{ targetId: scopeTargetId, evidence: { kind: 'field', fieldId: 'f_route', fieldName: 'Send table data' }, path: 'typeSettings.referencedTableId' }]
    },
    {
      targetId: 't_opaque_metadata',
      status: 'not_found_or_inaccessible',
      target: null,
      evidence: [{ targetId: 't_opaque_metadata', evidence: { kind: 'field', fieldId: 'f_crm', fieldName: 'Create contact' }, path: 'typeSettings.inputsBinding[20].name' }]
    }
  ];
  writeJson(path.join(scopeJournal, 'extract.json'), scopeExtract);
  run('state.js', ['init', scopeJournal]);
  run('plan-primitive-families.js', [scopeJournal]);
  const mutationEvidence = JSON.parse(fs.readFileSync(path.join(scopeJournal, 'system-evidence.json'))).tables[0];
  assert(mutationEvidence.sideEffectCandidates.some((candidate) => candidate.fieldId === 'f_update'));
  assert.deepStrictEqual(new Set(mutationEvidence.fieldDependencies.f_update), new Set(['f_clean_city', 'f_name']));
  assert.deepStrictEqual(mutationEvidence.fieldDependencies.f_clean_city, ['f_city']);
  let scopeState = JSON.parse(fs.readFileSync(path.join(scopeJournal, 'state.json'), 'utf8'));
  const scopeDiscovery = JSON.parse(run('discover-references.js', [scopeJournal]).stdout);
  assert.strictEqual(scopeDiscovery.expansionCandidates, 1);
  assert.strictEqual(scopeDiscovery.outboundCandidates, 1);
  assert.strictEqual(scopeDiscovery.opaqueMetadataIds, 1);
  const scopeReport = JSON.parse(fs.readFileSync(path.join(scopeJournal, 'reference-report.json'), 'utf8'));
  assert.strictEqual(scopeReport.expansionCandidates[0].relation, 'outbound_write');
  run('state.js', ['record-dependencies', scopeJournal, path.join(scopeJournal, 'reference-report.json'), String(scopeState.revision)]);
  scopeState = JSON.parse(fs.readFileSync(path.join(scopeJournal, 'state.json'), 'utf8'));
  assert.strictEqual(scopeState.nextAction, 'dependency_review');
  const scopeSelection = path.join(scopeJournal, 'dependency-selection.json');
  writeJson(scopeSelection, { include: [scopeTargetId], decline: [] });
  run('state.js', ['resolve-dependencies', scopeJournal, scopeSelection, String(scopeState.revision)]);
  scopeState = JSON.parse(fs.readFileSync(path.join(scopeJournal, 'state.json'), 'utf8'));
  assert.strictEqual(scopeState.nextAction, 'extract');
  assert.strictEqual(scopeState.tables.find((table) => table.id === scopeTargetId).origin, 'referenced_dependency');
  writeJson(path.join(scopeJournal, 'tables', scopeTargetId, 'extract.json'), extract(scopeTargetId, 'Downstream enrichment', [field('f_phone', 'Phone')], [record('r_downstream', { f_phone: '555' })]));
  run('state.js', ['reconcile', scopeJournal]);
  scopeState = JSON.parse(fs.readFileSync(path.join(scopeJournal, 'state.json'), 'utf8'));
  assert.strictEqual(scopeState.nextAction, 'dependency_discovery');
  const repeatDiscovery = JSON.parse(run('discover-references.js', [scopeJournal]).stdout);
  assert.strictEqual(repeatDiscovery.expansionCandidates, 0);

  const workbookJournal = path.join(root, 'workbook-run');
  const tableIds = ['t_duplicate111111', 't_duplicate222222'];
  writeJson(path.join(workbookJournal, 'workbook.json'), { workbookId: 'wb_test', workspaceId: 'ws_test', workbook: { id: 'wb_test', name: 'Duplicates' }, tables: tableIds.map((id, index) => ({ id, name: `Duplicate ${index + 1}`, firstViewId: `gv_${index}`, rowCount: 1 })) });
  for (const [index, id] of tableIds.entries()) {
    const duplicateAction = field(`f_action_${index}`, 'Warm intro research', 'action', { typeSettings: { actionKey: 'warmIntro', inputsBinding: [{ name: 'company', formulaText: `{{f_company_${index}}}` }] }, actionDefinition: { outputParameterSchema: [{ name: 'introPath' }] } });
    const duplicateExtract = extract(id, `Duplicate ${index + 1}`, [field(`f_company_${index}`, 'Company'), duplicateAction], [record(`r_${index}`, { [`f_company_${index}`]: 'A' })]);
    writeJson(path.join(workbookJournal, 'tables', id, 'extract.json'), duplicateExtract);
    run('prepare-table.js', [path.join(workbookJournal, 'tables', id), path.join(workbookJournal, 'workbook.json')]);
  }
  run('state.js', ['init', workbookJournal, path.join(workbookJournal, 'workbook.json')]);
  const workbookEvidenceSummary = JSON.parse(run('plan-primitive-families.js', [workbookJournal]).stdout);
  assert.strictEqual(workbookEvidenceSummary.repeatedFamilies, 1);
  assert.strictEqual(workbookEvidenceSummary.similarityGroups, 1);

  const skill = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8');
  assert(skill.includes('A table roster is not build authorization'));
  assert(skill.includes('Backward-slice from approved business sinks'));
  assert(skill.includes('Clay Record ID` is optional historical provenance'));
  assert(!skill.includes('Preserve all Clay columns'));
  assert(skill.length < 14000, 'entrypoint should remain compact');

  console.log(JSON.stringify({ ok: true, suites: ['preparation', 'outcome contracts', 'write dependencies', 'review and restoration', 'historical gating', 'reference discovery', 'consolidation'] }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
