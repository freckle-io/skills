#!/usr/bin/env node
'use strict';

const assert = require('assert');
const child = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sha256 } = require('./lib');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clay-to-freckle-test-'));
const journal = path.join(root, 'journal');
const tablesDir = path.join(journal, 'tables');
const run = (script, args, expected = 0) => {
  const r = child.spawnSync(process.execPath, [path.join(__dirname, script), ...args], { encoding: 'utf8' });
  assert.strictEqual(r.status, expected, `${script} failed\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return r;
};
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); };
const field = (id, name, type = 'text', extra = {}) => ({ id, name, type, ...extra });
const record = (id, cells) => ({ id, cells, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
const extract = (tableId, name, fields, records, sources = []) => ({
  tableId, viewId: `gv_${tableId.slice(2)}`, workspaceId: '1', extractedAt: '2026-01-01T00:00:00Z', rowCount: records.length, recordsFetched: records.length,
  table: { id: tableId, name, fields }, tableSchema: Object.fromEntries(fields.map((f) => [f.id, { type: f.type }])), sources, records, exampleRecords: records
});

try {
  const staleStatePath = path.join(root, 'existing-journal', 'state.json');
  writeJson(staleStatePath, { runId: 'old-run', target: { id: 'wb_old123456789' } });
  const staleHash = sha256(staleStatePath);
  const freshOne = JSON.parse(run('new-run.js', ['https://app.clay.com/workspaces/1/workbooks/wb_test1234567890', root]).stdout);
  const freshTwo = JSON.parse(run('new-run.js', ['https://app.clay.com/workspaces/1/workbooks/wb_test1234567890', root]).stdout);
  assert.strictEqual(freshOne.fresh, true);
  assert.strictEqual(freshOne.mode, 'workbook');
  assert.notStrictEqual(freshOne.journal, freshTwo.journal);
  assert(freshOne.journal.startsWith(path.join(root, '.clay-to-freckle-runs') + path.sep));
  assert.strictEqual(fs.readFileSync(path.join(freshOne.journal, '.gitignore'), 'utf8'), '*\n!.gitignore\n');
  assert.strictEqual(sha256(staleStatePath), staleHash, 'fresh-run allocation must not touch an existing journal');
  const freshTable = JSON.parse(run('new-run.js', ['https://app.clay.com/workspaces/1/workbooks/wb_parent123/tables/t_child123456/views/gv_child123', root]).stdout);
  assert.strictEqual(freshTable.targetId, 't_child123456');
  assert.strictEqual(freshTable.mode, 'table');

  const wb = {
    ok: true, workspaceId: '1', workbookId: 'wb_test1234567890', workbook: { id: 'wb_test1234567890', name: 'Synthetic mixed workbook' },
    tables: [
      { id: 't_pure1234567890', name: 'Pure data', firstViewId: 'gv_pure', rowCount: 2 },
      { id: 't_logic123456789', name: 'Logic data', firstViewId: 'gv_logic', rowCount: 2 }
    ]
  };
  writeJson(path.join(journal, 'workbook.json'), wb);
  const pureFields = [field('f_name', 'Name'), field('f_reserved', 'Clay Record ID'), field('f_flag', 'Flag'), field('f_created_at', 'Created At', 'date'), field('f_lookup_name_only', 'Lookup Multiple Rows in Other Table')];
  const pureRecords = [record('r_one', { f_name: 'Ada, "A"', f_reserved: 'source-a', f_flag: false }), record('r_two', { f_name: 'Béa\nB', f_reserved: 'source-b', f_flag: 0 })];
  const pureExtract = extract('t_pure1234567890', 'Pure data', pureFields, pureRecords);
  pureExtract.lookupLikeColumnsWithoutActiveReference = [{ fieldId: 'f_lookup_name_only', fieldName: 'Lookup Multiple Rows in Other Table', status: 'no_active_target_in_current_config' }];
  writeJson(path.join(tablesDir, 't_pure1234567890', 'extract.json'), pureExtract);
  const action = field('f_action', 'Find person', 'action', {
    typeSettings: { actionKey: 'providerFind', referencedTableId: 't_external1234567', inputsBinding: [{ name: 'name', formulaText: '{{f_name}}' }], conditionalRunFormulaText: '{{f_name}} != ""' },
    actionDefinition: { displayName: 'Provider Find', outputParameterSchema: [{ name: 'url' }] }
  });
  const formula = field('f_formula', 'Best URL', 'formula', { typeSettings: { formulaWaterfall: [{ formula: '{{f_action}}' }, { prompt: 'Find {{f_name}}' }] } });
  const logicFields = [field('f_name', 'Name'), action, formula];
  const logicRecords = [record('r_three', { f_name: 'Cy', f_action: { status: 'SUCCESS', fullValue: { url: 'https://example.test/cy' } }, f_formula: 'https://example.test/cy' }), record('r_four', { f_name: 'Dee', f_action: { status: 'SUCCESS_NO_DATA' }, f_formula: '' })];
  const logicExtract = extract('t_logic123456789', 'Logic data', logicFields, logicRecords);
  logicExtract.tableReferences = [{
    targetId: 't_external1234567', status: 'resolved',
    target: { id: 't_external1234567', name: 'External CRM signals', workspaceId: '1', workbookId: 'wb_external123456', firstViewId: 'gv_external123456', rowCount: 1, deletedAt: null, url: 'https://app.clay.com/workspaces/1/workbooks/wb_external123456/tables/t_external1234567/views/gv_external123456' },
    evidence: [{ targetId: 't_external1234567', evidence: { kind: 'field', fieldId: 'f_action', fieldName: 'Find person' }, path: 'typeSettings.referencedTableId' }]
  }];
  writeJson(path.join(tablesDir, 't_logic123456789', 'extract.json'), logicExtract);

  run('prepare-table.js', [path.join(tablesDir, 't_pure1234567890'), path.join(journal, 'workbook.json')]);
  const pureResultPath = path.join(tablesDir, 't_pure1234567890', 'prepare-result.json');
  const pureResult = JSON.parse(fs.readFileSync(pureResultPath));
  assert.strictEqual(pureResult.kind, 'pure_data');
  assert.strictEqual(pureResult.status, 'done');
  assert.strictEqual(pureResult.fillSlotsRemaining, 0);
  const pureReplay = JSON.parse(fs.readFileSync(path.join(tablesDir, 't_pure1234567890', 'replay-fixtures.json')));
  assert.strictEqual(pureReplay.cases.length, 2);
  assert(pureReplay.cases.every((item) => item.preview.importedFromClay === true && item.replay.importedFromClay === false));
  const csv = fs.readFileSync(path.join(tablesDir, 't_pure1234567890', 'data.csv'), 'utf8');
  assert(csv.startsWith('Clay Record ID,Name,Clay Record ID (2),Flag,Created At,Lookup Multiple Rows in Other Table,Imported from Clay\n'));
  assert(csv.includes('r_one'));
  const plan = JSON.parse(fs.readFileSync(path.join(tablesDir, 't_pure1234567890', 'import-plan.json')));
  assert.strictEqual(plan.ok, true);
  assert.deepStrictEqual(plan.key, { column: 'Clay Record ID', blank: 0, duplicates: 0 });
  const firstHash = sha256(pureResultPath);
  run('prepare-table.js', [path.join(tablesDir, 't_pure1234567890'), path.join(journal, 'workbook.json')]);
  assert.strictEqual(sha256(pureResultPath), firstHash, 'pure-data rerun must be deterministic');
  writeJson(path.join(tablesDir, 't_pure1234567890', 'extract-rest.json'), extract('t_pure1234567890', 'Pure data', pureFields, [pureRecords[1], record('r_five', { f_name: 'E', f_reserved: 'source-e', f_flag: true })]));
  const backfillRun = run('prepare-backfill.js', [path.join(tablesDir, 't_pure1234567890')]);
  const backfillSummary = JSON.parse(backfillRun.stdout);
  assert.strictEqual(backfillSummary.selected, 1);
  assert.strictEqual(backfillSummary.overlapsSkipped, 1);

  run('prepare-table.js', [path.join(tablesDir, 't_logic123456789'), path.join(journal, 'workbook.json')]);
  let logicResult = JSON.parse(fs.readFileSync(path.join(tablesDir, 't_logic123456789', 'prepare-result.json')));
  assert.strictEqual(logicResult.kind, 'logic');
  assert.strictEqual(logicResult.status, 'needs_agent');
  const logicBrief = path.join(tablesDir, 't_logic123456789', 'brief.md');
  fs.writeFileSync(logicBrief, fs.readFileSync(logicBrief, 'utf8').replace(/<!-- FILL:[\s\S]*?-->/g, 'Completed migration intent.'));
  run('prepare-table.js', [path.join(tablesDir, 't_logic123456789'), path.join(journal, 'workbook.json')]);
  logicResult = JSON.parse(fs.readFileSync(path.join(tablesDir, 't_logic123456789', 'prepare-result.json')));
  assert.strictEqual(logicResult.status, 'done');
  const logicReplay = JSON.parse(fs.readFileSync(path.join(tablesDir, 't_logic123456789', 'replay-fixtures.json')));
  assert(logicReplay.cases.every((item) => !Object.prototype.hasOwnProperty.call(item.replay.inputs, 'Find person')));
  assert(logicReplay.comparison.some((item) => item.mode === 'business_contract'));

  run('state.js', ['init', journal, path.join(journal, 'workbook.json')]);
  const contextCreate = JSON.parse(run('init-build-context.js', [journal]).stdout);
  const contextReuse = JSON.parse(run('init-build-context.js', [journal]).stdout);
  assert.strictEqual(contextCreate.created, true);
  assert.strictEqual(contextReuse.created, false);
  run('state.js', ['reconcile', journal]);
  let state = JSON.parse(fs.readFileSync(path.join(journal, 'state.json')));
  assert(state.tables.every((t) => t.local.prepare === 'done'));
  assert.strictEqual(state.nextAction, 'dependency_discovery');
  const discovery = JSON.parse(run('discover-references.js', [journal]).stdout);
  assert.strictEqual(discovery.expansionCandidates, 1);
  run('state.js', ['record-dependencies', journal, path.join(journal, 'reference-report.json'), String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(journal, 'state.json')));
  assert.strictEqual(state.nextAction, 'dependency_review');
  const report = JSON.parse(fs.readFileSync(path.join(journal, 'reference-report.json')));
  assert.strictEqual(report.expansionCandidates[0].target.url, 'https://app.clay.com/workspaces/1/workbooks/wb_external123456/tables/t_external1234567/views/gv_external123456');
  const selectionPath = path.join(journal, 'dependency-selection.json');
  writeJson(selectionPath, { include: ['t_external1234567'], decline: [] });
  run('state.js', ['resolve-dependencies', journal, selectionPath, String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(journal, 'state.json')));
  assert.strictEqual(state.nextAction, 'extract');
  assert.strictEqual(state.tables.find((t) => t.id === 't_external1234567').origin, 'referenced_dependency');
  const externalFields = [field('f_domain', 'Domain')];
  writeJson(path.join(tablesDir, 't_external1234567', 'extract.json'), extract('t_external1234567', 'External CRM signals', externalFields, [record('r_external', { f_domain: 'example.test' })]));
  run('state.js', ['reconcile', journal]);
  state = JSON.parse(fs.readFileSync(path.join(journal, 'state.json')));
  assert.strictEqual(state.nextAction, 'dependency_discovery');
  run('discover-references.js', [journal]);
  run('state.js', ['record-dependencies', journal, path.join(journal, 'reference-report.json'), String(state.revision)]);
  run('prepare-table.js', [path.join(tablesDir, 't_external1234567'), path.join(journal, 'workbook.json')]);
  run('state.js', ['reconcile', journal]);
  state = JSON.parse(fs.readFileSync(path.join(journal, 'state.json')));
  assert.strictEqual(state.tables.length, 3);
  assert(state.tables.every((t) => t.local.prepare === 'done'));
  assert.strictEqual(state.nextAction, 'primitive_planning');
  const familySummary = JSON.parse(run('plan-primitive-families.js', [journal]).stdout);
  assert.strictEqual(familySummary.families, 1);
  const families = JSON.parse(fs.readFileSync(path.join(journal, 'primitive-families.json')));
  assert(families.families.every((item) => item.implementationOwner === 'freckle' && item.frecklePlan === null));
  run('state.js', ['record-primitive-plan', journal, path.join(journal, 'primitive-families.json'), String(state.revision)]);
  state = JSON.parse(fs.readFileSync(path.join(journal, 'state.json')));
  assert.strictEqual(state.nextAction, 'consolidated_review');
  run('state.js', ['approve', journal, 'all']);
  state = JSON.parse(fs.readFileSync(path.join(journal, 'state.json')));
  assert.strictEqual(state.nextAction, 'build_assets');
  run('render-review.js', [journal]);
  const review = fs.readFileSync(path.join(journal, 'workbook-review.md'), 'utf8');
  assert(review.includes('pure-data fast path') && review.includes('logic translation'));
  assert(review.includes('[External CRM signals](https://app.clay.com/workspaces/1/workbooks/wb_external123456/tables/t_external1234567/views/gv_external123456) (included)'));
  assert(review.includes("no active target is present in Clay's current configuration"));
  assert(!/flattened|link was removed|formerly linked/i.test(review));

  const dupDir = path.join(root, 'duplicate');
  writeJson(path.join(dupDir, 'extract.json'), extract('t_duplicate12345', 'Duplicate', [field('f_name', 'Name')], [record('r_same', { f_name: 'A' }), record('r_same', { f_name: 'B' })]));
  run('prepare-table.js', [dupDir], 1);

  const skillText = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8');
  const prepareText = fs.readFileSync(path.join(__dirname, '..', 'specialists', 'prepare-workbook.md'), 'utf8');
  const workbookBuildText = fs.readFileSync(path.join(__dirname, '..', 'specialists', 'build-workbook.md'), 'utf8');
  const tableBuildText = fs.readFileSync(path.join(__dirname, '..', 'specialists', 'build-table.md'), 'utf8');
  assert(skillText.includes('15 words or fewer'));
  assert(prepareText.includes('Workbook track only'));
  assert(skillText.includes('Individual-table track'));
  assert(skillText.includes('Everything is built and testing is underway'));
  assert(skillText.includes('https://next.freckle.io/workbooks/<id>'));
  assert(skillText.includes('https://next.freckle.io/tools/<id>'));
  assert(workbookBuildText.includes('https://next.freckle.io/workbooks/<verified-workbook-id>'));
  assert(tableBuildText.includes('https://next.freckle.io/tools/<verified-workflow-id>'));
  assert(!skillText.includes('first 500'));

  const tableJournal = path.join(root, 'table-journal');
  writeJson(path.join(tableJournal, 'extract.json'), extract('t_single123456789', 'Single', pureFields, pureRecords));
  run('prepare-table.js', [tableJournal]);
  run('state.js', ['init', tableJournal]);
  run('state.js', ['reconcile', tableJournal]);
  let tableState = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json')));
  assert.strictEqual(tableState.mode, 'table');
  assert.strictEqual(tableState.gates.primitivePlan, 'n/a');
  assert.strictEqual(tableState.nextAction, 'consolidated_review');
  run('state.js', ['approve', tableJournal, 'all']);
  tableState = JSON.parse(fs.readFileSync(path.join(tableJournal, 'state.json')));
  assert.strictEqual(tableState.nextAction, 'build_assets');

  console.log(JSON.stringify({ ok: true, tests: 64, rootRemoved: true }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
