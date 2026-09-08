#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicJson, atomicWrite, readJson, sha256, validateOutcomeContracts } = require('./lib');

const [, , command, journalArg, ...args] = process.argv;
if (!command || !journalArg) {
  console.error('Usage: node state.js <init|migrate-legacy|reconcile|status|record-dependencies|resolve-dependencies|record-primitive-plan|record-omission-review|collect|approve|patch> <journal-dir> [args]');
  process.exit(1);
}
const journal = path.resolve(journalArg);
const statePath = path.join(journal, 'state.json');
const viewPath = path.join(journal, 'state.md');
const eventsPath = path.join(journal, 'events.jsonl');
const lockPath = path.join(journal, '.state.lock');

const now = () => new Date().toISOString();
const existsJson = (file) => { try { readJson(file); return true; } catch { return false; } };
const hashIf = (file) => fs.existsSync(file) ? sha256(file) : null;
const runId = (targetId) => `c2f_${crypto.createHash('sha256').update(`${targetId}:${Date.now()}`).digest('hex').slice(0, 16)}`;

const withLock = (fn) => {
  fs.mkdirSync(journal, { recursive: true });
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: now() }));
    fs.closeSync(fd);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const age = Date.now() - fs.statSync(lockPath).mtimeMs;
    if (age < 300000) throw new Error(`State is locked: ${lockPath}`);
    fs.unlinkSync(lockPath);
    return withLock(fn);
  }
  try { return fn(); } finally { try { fs.unlinkSync(lockPath); } catch {} }
};

const event = (type, payload = {}) => fs.appendFileSync(eventsPath, JSON.stringify({ at: now(), type, ...payload }) + '\n');
const deepMerge = (target, patch) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = { ...(target || {}) };
  for (const [key, value] of Object.entries(patch)) out[key] = value && typeof value === 'object' && !Array.isArray(value) ? deepMerge(out[key], value) : value;
  return out;
};

const tableDir = (state, table) => state.mode === 'workbook' || table.origin === 'referenced_dependency' ? path.join(journal, 'tables', table.id) : journal;
const deriveNext = (state) => {
  const included = state.tables.filter((t) => t.included !== false);
  if (included.some((t) => t.local.extract !== 'done')) return 'extract';
  const dependencyGate = state.gates.dependencies || 'resolved_legacy';
  if (dependencyGate === 'pending_discovery') return 'dependency_discovery';
  if (dependencyGate === 'pending_review') return 'dependency_review';
  if (included.some((t) => !['done', 'needs_agent'].includes(t.local.prepare))) return 'prepare';
  if (included.some((t) => t.local.prepare === 'needs_agent')) return 'translate_agents';
  if ((state.gates.primitivePlan || 'pending') === 'pending') return 'system_planning';
  if (included.some((t) => t.review.status !== 'approved')) return 'consolidated_review';
  if (included.some((t) => t.build.status === 'external_reconcile_required')) return 'external_reconcile';
  if (included.some((t) => !['done', 'n/a'].includes(t.build.status))) return 'build_assets';
  if (included.some((t) => !['done', 'n/a'].includes(t.validation.status))) return 'replay_tests';
  if ((state.gates.cleanup || 'n/a') === 'pending') return 'cleanup';
  if (state.primitivePlan?.version === 3 && !['done', 'n/a'].includes(state.gates.omissionReview)) return 'omission_review';
  if ((state.gates.dataMigration || state.gates.backfill) === 'pending') return 'data_migration_offer';
  return 'complete';
};

const render = (state) => {
  const included = state.tables.filter((t) => t.included !== false);
  const count = (fn) => included.filter(fn).length;
  const n = included.length;
  const line = (label, done, active) => `${done === n ? '✓' : active ? '●' : '○'} ${label.padEnd(14)} ${done}/${n}`;
  const next = deriveNext(state);
  const rows = included.map((t) => `| ${t.name} | ${t.kind || 'unclassified'} | ${t.local.extract} | ${t.local.prepare} | ${t.review.status} | ${t.build.status} | ${t.validation.status} |`).join('\n');
  return `# clay-to-freckle run\n\nRun: \`${state.runId}\` · revision ${state.revision} · updated ${state.updatedAt}\nTarget: ${state.mode === 'workbook' ? 'Clay workbook' : 'Clay table'} **${state.target.name}** (\`${state.target.id}\`)\nNext action: **${next}**\n\n\`\`\`text\n${line('Extracted', count((t) => t.local.extract === 'done'), next === 'extract')}\n${line('Prepared', count((t) => t.local.prepare === 'done'), ['prepare', 'translate_agents'].includes(next))}\n${line('Approved', count((t) => t.review.status === 'approved'), next === 'consolidated_review')}\n${line('Built', count((t) => t.build.status === 'done'), next === 'build_assets')}\n${line('Replay tested', count((t) => t.validation.status === 'done'), next === 'replay_tests')}\n\`\`\`\n\n| Source table | Kind | Extract | Prepare | Review | Build accounting | Replay accounting |\n|---|---|---|---|---|---|---|\n${rows}\n\nReference dependencies: ${state.gates.dependencies || 'resolved_legacy'}\nSystem plan: ${state.gates.primitivePlan || 'pending'}\nPrimary Freckle Workbook: ${state.freckle.workbookId ? `\`${state.freckle.workbookId}\`` : 'pending or not required'}\nHistorical data migration: ${state.gates.dataMigration || state.gates.backfill || 'n/a'}\n\n> Source-table build fields are accounting only; the approved system plan owns destination shape. Generated from \`state.json\`.\n`;
};

const save = (state, eventType, payload = {}) => {
  state.revision = (state.revision || 0) + 1;
  state.updatedAt = now();
  state.nextAction = deriveNext(state);
  atomicJson(statePath, state);
  atomicWrite(viewPath, render(state));
  event(eventType, { revision: state.revision, ...payload });
};

const validateState = (state) => {
  if (state.schemaVersion !== 2 || !state.runId || !Array.isArray(state.tables)) throw new Error('Invalid state.json schema');
  const ids = state.tables.map((t) => t.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error('state.json has missing or duplicate table IDs');
  return state;
};
const load = () => validateState(readJson(statePath));
const reconcileTable = (state, table) => {
  const dir = tableDir(state, table);
  const extract = path.join(dir, 'extract.json');
  const brief = path.join(dir, 'brief.md');
  const result = path.join(dir, 'prepare-result.json');
  table.artifacts = table.artifacts || {};
  if (existsJson(extract)) {
    table.local.extract = 'done';
    table.artifacts.extractSha256 = hashIf(extract);
  } else table.local.extract = 'pending';
  if (existsJson(result)) {
    const r = readJson(result);
    const valid = r.tableId === table.id && r.input?.extractSha256 === table.artifacts.extractSha256 && r.artifacts?.brief?.sha256 === hashIf(brief);
    table.local.prepare = valid && r.status === 'done' ? 'done' : valid && r.status === 'needs_agent' ? 'needs_agent' : 'pending';
    if (valid) {
      table.kind = r.kind;
      table.artifacts.prepareResultSha256 = hashIf(result);
      table.artifacts.briefSha256 = hashIf(brief);
      table.counts = r.counts;
    }
  } else if (fs.existsSync(brief) && !fs.readFileSync(brief, 'utf8').includes('<!-- FILL:')) {
    table.local.prepare = 'pending';
  } else table.local.prepare = table.local.extract === 'done' ? 'pending' : 'blocked';
  const currentBriefHash = hashIf(brief);
  if (table.review.briefSha256 && currentBriefHash !== table.review.briefSha256) table.review = { status: 'pending', briefSha256: null, systemPlanSha256: null, approvedAt: null };
  return table;
};

if (command === 'init') withLock(() => {
  if (fs.existsSync(statePath)) throw new Error(`state.json already exists: ${statePath}`);
  const workbookArg = args[0] || path.join(journal, 'workbook.json');
  let mode; let target; let tables;
  if (existsJson(workbookArg)) {
    const wb = readJson(workbookArg); mode = 'workbook';
    target = { id: wb.workbookId || wb.workbook?.id, name: wb.workbook?.name || wb.name, workspaceId: wb.workspaceId };
    tables = (wb.tables || []).map((t, index) => ({ id: t.id, name: t.name, viewId: t.firstViewId, order: index, included: true, kind: null, counts: { total: t.rowCount }, local: { extract: 'pending', prepare: 'pending' }, review: { status: 'pending', briefSha256: null, approvedAt: null }, build: { status: 'pending', planSha256: null, assets: {} }, validation: { status: 'pending' }, dataMigration: { status: t.rowCount > 3 ? 'pending' : 'n/a' }, artifacts: {} }));
  } else {
    const extractPath = path.join(journal, 'extract.json');
    if (!existsJson(extractPath)) throw new Error('init requires workbook.json or journal/extract.json');
    const x = readJson(extractPath); mode = 'table'; target = { id: x.tableId, name: x.table?.name, workspaceId: x.workspaceId };
    tables = [{ id: x.tableId, name: x.table?.name, viewId: x.viewId, order: 0, included: true, kind: null, counts: { total: x.rowCount }, local: { extract: 'pending', prepare: 'pending' }, review: { status: 'pending', briefSha256: null, approvedAt: null }, build: { status: 'pending', planSha256: null, assets: {} }, validation: { status: 'pending' }, dataMigration: { status: x.rowCount > 3 ? 'pending' : 'n/a' }, artifacts: {} }];
  }
  const state = { schemaVersion: 2, runId: runId(target.id), revision: 0, createdAt: now(), updatedAt: now(), mode, target, confirmedRosterIds: tables.map((t) => t.id), gates: { roster: mode === 'workbook' ? 'pending' : 'n/a', dependencies: 'pending_discovery', primitivePlan: 'pending', review: 'pending', install: 'pending', cleanup: 'pending', dataMigration: tables.some((t) => t.dataMigration.status === 'pending') ? 'pending' : 'n/a' }, decisions: {}, freckle: { orgId: null, workbookId: null, mutationLane: 'idle' }, tables };
  state.tables = state.tables.map((t) => reconcileTable(state, t));
  save(state, 'initialized');
  console.log(JSON.stringify({ ok: true, runId: state.runId, revision: state.revision, nextAction: state.nextAction }));
});
else if (command === 'migrate-legacy') withLock(() => {
  const legacyPath = args[0] || viewPath;
  if (!fs.existsSync(legacyPath)) throw new Error(`Legacy state not found: ${legacyPath}`);
  const legacy = fs.readFileSync(legacyPath, 'utf8');
  const state = load();
  for (const table of state.tables) {
    const escaped = table.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const row = legacy.match(new RegExp(`^\\|[^\\n]*\\|\\s*${escaped}\\s*\\|[^\\n]*$`, 'm'))?.[0] || '';
    const cells = row.split('|').map((v) => v.trim()).filter(Boolean);
    if (cells.some((v) => /^approved\b/i.test(v))) {
      const brief = path.join(tableDir(state, table), 'brief.md');
      if (fs.existsSync(brief) && !fs.readFileSync(brief, 'utf8').includes('<!-- FILL:')) table.review = { status: 'approved', briefSha256: sha256(brief), approvedAt: 'legacy-import' };
    }
    const tableNotes = legacy.match(new RegExp(`${table.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,3000}`, 'i'))?.[0] || '';
    const numberedAssets = legacy.match(new RegExp(`Freckle assets table\\s+${table.order + 1}:[^\\n]*`, 'i'))?.[0] || '';
    const numberedParity = legacy.match(new RegExp(`(?:Parity|Handoff)[^\\n]*table\\s+${table.order + 1}[^\\n]*`, 'i'))?.[0] || '';
    if (/Workflow\s+"|workflow\s+[`"]?[0-9a-f]{8}-/i.test(`${tableNotes}\n${numberedAssets}`) || /(exact|match|parity shown)/i.test(numberedParity)) {
      table.build.status = 'external_reconcile_required';
      table.validation.status = 'external_reconcile_required';
      table.build.assets = {
        ...table.build.assets,
        workflowId: numberedAssets.match(/Workflow\s+"[^"]*"\s+([0-9a-f-]{20,})/i)?.[1] || table.build.assets.workflowId,
        connectionId: numberedAssets.match(/connection\s+([0-9a-f-]{20,})/i)?.[1] || table.build.assets.connectionId,
        outputDatasetId: numberedAssets.match(/output Dataset\s+"[^"]*"\s+([0-9a-f-]{20,})/i)?.[1] || table.build.assets.outputDatasetId,
        revision: Number(numberedAssets.match(/\(rev\s+(\d+)\)/i)?.[1] || table.build.assets.revision || 0) || null
      };
    }
  }
  const workbookId = legacy.match(/Freckle Workbook:[^\n]*?\(([0-9a-f-]{20,})[,)]/i)?.[1];
  if (workbookId) state.freckle.workbookId = workbookId;
  const inputDatasetId = legacy.match(/input Dataset\s+"[^"]*"\s+\(([0-9a-f-]{20,})/i)?.[1];
  if (inputDatasetId && state.tables[0]) state.tables[0].build.assets.inputDatasetId = inputDatasetId;
  if (/Roster confirmation:\s*confirmed/i.test(legacy)) state.gates.roster = 'confirmed';
  if (/Install:\s*(verified|installed)/i.test(legacy)) state.gates.install = legacy.match(/Install:\s*([^\n]+)/i)?.[1].trim() || 'verified';
  state.gates.dependencies = 'resolved_legacy';
  state.gates.primitivePlan = 'resolved_legacy';
  state.gates.dataMigration = state.gates.dataMigration || state.gates.backfill || 'n/a';
  state.legacy = { path: legacyPath, sha256: sha256(legacyPath), importedAt: now() };
  save(state, 'legacy_migrated');
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction, externalReconcile: state.tables.filter((t) => t.build.status === 'external_reconcile_required').map((t) => t.id) }));
});
else if (command === 'reconcile') withLock(() => {
  const state = load();
  if (!state.gates.dependencies) state.gates.dependencies = 'resolved_legacy';
  if (state.mode === 'table' && state.gates.dependencies === 'resolved_table_mode') state.gates.dependencies = 'pending_discovery';
  if (!state.gates.primitivePlan || state.gates.primitivePlan === 'n/a') state.gates.primitivePlan = state.primitivePlan ? 'planned' : 'pending';
  if (!state.gates.dataMigration) state.gates.dataMigration = state.gates.backfill || 'n/a';
  if (!state.gates.cleanup) state.gates.cleanup = 'n/a';
  state.tables = state.tables.map((t) => reconcileTable(state, t));
  if (state.primitivePlan) {
    const currentPlanHash = state.primitivePlan.path && fs.existsSync(state.primitivePlan.path) ? sha256(state.primitivePlan.path) : null;
    if (!currentPlanHash || currentPlanHash !== state.primitivePlan.sha256) {
      state.gates.primitivePlan = 'pending';
      state.gates.review = 'pending';
      for (const table of state.tables.filter((item) => item.included !== false)) table.review = { status: 'pending', briefSha256: null, systemPlanSha256: null, approvedAt: null };
    }
  }
  save(state, 'reconciled');
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction }));
});
else if (command === 'record-dependencies') withLock(() => {
  const [reportFile, expectedArg] = args; const state = load();
  if (expectedArg && Number(expectedArg) !== state.revision) throw new Error(`Revision mismatch: expected ${expectedArg}, got ${state.revision}`);
  const report = readJson(reportFile);
  if (report.runId !== state.runId) throw new Error('Reference report belongs to a different run');
  const candidates = report.expansionCandidates || [];
  state.references = { reportPath: path.resolve(reportFile), reportSha256: sha256(reportFile), activeTargets: (report.activeTargets || []).filter((item) => item.relation !== 'opaque_metadata_id').length, expansionCandidates: candidates.map((item) => ({ targetId: item.targetId, relation: item.relation })), outboundCandidates: candidates.filter((item) => item.relation === 'outbound_write').map((item) => item.targetId), unresolvedActiveTargets: (report.unresolvedActiveTargets || []).map((item) => item.targetId), opaqueMetadataIds: (report.opaqueMetadataIds || []).length, lookupLikeWithoutActiveReference: (report.lookupLikeWithoutActiveReference || []).length };
  state.gates.dependencies = candidates.length ? 'pending_review' : 'resolved_none';
  save(state, 'dependencies_recorded', { candidates: candidates.map((item) => item.targetId) });
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction, expansionCandidates: candidates.length }));
});
else if (command === 'resolve-dependencies') withLock(() => {
  const [selectionFile, expectedArg] = args; const state = load();
  if (expectedArg && Number(expectedArg) !== state.revision) throw new Error(`Revision mismatch: expected ${expectedArg}, got ${state.revision}`);
  if (!state.references?.reportPath || !existsJson(state.references.reportPath)) throw new Error('No recorded reference report');
  const report = readJson(state.references.reportPath);
  if (sha256(state.references.reportPath) !== state.references.reportSha256) throw new Error('Reference report changed after review');
  const selection = readJson(selectionFile);
  const include = new Set(selection.include || []);
  const decline = new Set(selection.decline || []);
  const candidates = new Map((report.expansionCandidates || []).map((item) => [item.targetId, item]));
  for (const id of [...include, ...decline]) if (!candidates.has(id)) throw new Error(`Unknown dependency selection: ${id}`);
  const unhandled = [...candidates.keys()].filter((id) => !include.has(id) && !decline.has(id));
  if (unhandled.length) throw new Error(`Dependency choices missing for: ${unhandled.join(', ')}`);
  for (const id of include) {
    if (state.tables.some((table) => table.id === id)) continue;
    const candidate = candidates.get(id); const target = candidate.target;
    const total = target.rowCount;
    state.tables.push({ id, name: target.name, viewId: target.firstViewId, url: target.url, origin: 'referenced_dependency', referencedBy: candidate.referencedBy, order: state.tables.length, included: true, kind: null, counts: { total }, local: { extract: 'pending', prepare: 'pending' }, review: { status: 'pending', briefSha256: null, approvedAt: null }, build: { status: 'pending', planSha256: null, assets: {} }, validation: { status: 'pending' }, dataMigration: { status: total === null || total > 3 ? 'pending' : 'n/a' }, artifacts: {} });
    if (!state.confirmedRosterIds.includes(id)) state.confirmedRosterIds.push(id);
  }
  const priorInclude = new Set(state.decisions.dependencies?.include || []);
  const priorDecline = new Set(state.decisions.dependencies?.decline || []);
  for (const id of include) { priorInclude.add(id); priorDecline.delete(id); }
  for (const id of decline) if (!priorInclude.has(id)) priorDecline.add(id);
  state.decisions.dependencies = { include: [...priorInclude], decline: [...priorDecline], decidedAt: now() };
  state.gates.dependencies = include.size ? 'pending_discovery' : 'resolved_declined';
  if ([...include].some((id) => (candidates.get(id).target.rowCount ?? 4) > 3)) state.gates.dataMigration = 'pending';
  save(state, 'dependencies_resolved', { include: [...include], decline: [...decline] });
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction, added: [...include] }));
});
else if (command === 'record-primitive-plan') withLock(() => {
  const [planFile, expectedArg] = args; const state = load();
  if (expectedArg && Number(expectedArg) !== state.revision) throw new Error(`Revision mismatch: expected ${expectedArg}, got ${state.revision}`);
  if (state.tables.filter((table) => table.included !== false).some((table) => table.local.prepare !== 'done')) throw new Error('System planning requires completed source preparation');
  const plan = readJson(planFile);
  if (plan.runId && plan.runId !== state.runId) throw new Error('System plan belongs to a different run');
  const includedIds = state.tables.filter((table) => table.included !== false).map((table) => table.id);
  const dispositions = plan.tableDispositions || [];
  const allowed = new Set(['recreate', 'fold', 'consolidate', 'embed', 'standalone', 'defer', 'exclude']);
  if (dispositions.some((item) => !includedIds.includes(item.tableId))) throw new Error('System plan contains a disposition for a table outside the approved analysis roster');
  for (const id of includedIds) {
    const matches = dispositions.filter((item) => item.tableId === id);
    if (matches.length !== 1 || !allowed.has(matches[0].disposition)) throw new Error(`System plan needs exactly one valid disposition for ${id}`);
    if (!['defer', 'exclude'].includes(matches[0].disposition) && !matches[0].destination) throw new Error(`Disposition ${matches[0].disposition} for ${id} needs a destination`);
  }
  if (!plan.destination?.shape || !Array.isArray(plan.destination?.stages) || !Array.isArray(plan.destination?.sourceContract) || !Array.isArray(plan.destination?.finalOutputs)) throw new Error('System plan has an incomplete destination contract');
  if (plan.implementation?.resolvedByFreckleSkill !== true) throw new Error('System plan must contain Freckle-resolved implementation choices');
  for (const asset of plan.implementation.assets || []) if (asset.reuse === true && asset.contractVerified !== true) throw new Error(`Reused asset lacks a verified contract: ${asset.name || asset.id || 'unnamed asset'}`);
  const shapes = new Set(['standalone_workflow', 'chained_workbook', 'dataset_or_reference', 'mixed', 'no_build']);
  if (!shapes.has(plan.destination.shape)) throw new Error(`Unsupported destination shape: ${plan.destination.shape}`);
  const available = new Set();
  for (const field of plan.destination.sourceContract) {
    if (!field.name || !field.source || !field.purpose) throw new Error('Every source-contract field needs name, source, and purpose');
    if (available.has(field.name)) throw new Error(`Duplicate source-contract field: ${field.name}`);
    available.add(field.name);
  }
  for (const stage of plan.destination.stages) {
    if (!stage.id || !stage.name || !stage.intent || !Array.isArray(stage.sourceTables) || !Array.isArray(stage.inputs) || !Array.isArray(stage.outputs) || !stage.boundaryReason) throw new Error('Every destination stage needs id, name, intent, sourceTables, inputs, outputs, and boundaryReason');
    if (stage.sourceTables.some((id) => !includedIds.includes(id))) throw new Error(`Stage ${stage.id} cites a source table outside the approved roster`);
    const missing = stage.inputs.filter((name) => !available.has(name));
    if (missing.length) throw new Error(`Stage ${stage.id} has unavailable inputs: ${missing.join(', ')}`);
    for (const name of stage.outputs) available.add(name);
  }
  if (!Array.isArray(plan.tests?.businessReplay) || plan.tests.businessReplay.length > 3 || !Array.isArray(plan.tests?.branchCases) || !Array.isArray(plan.tests?.cleanup)) throw new Error('System plan tests need up to three business replays plus explicit branch and cleanup arrays');
  if (!plan.safety?.sideEffects || !plan.safety?.liveGate) throw new Error('System plan must state side-effect policy and live gate');
  for (const field of plan.destination.finalOutputs) {
    if (!field.name || !field.consumer || !field.purpose) throw new Error('Every final output needs name, consumer, and purpose');
    if (!available.has(field.name)) throw new Error(`Final output is not supplied by the source or a stage: ${field.name}`);
  }
  if (plan.destination.shape === 'no_build' && plan.destination.stages.length) throw new Error('A no_build plan cannot contain destination stages');
  validateOutcomeContracts(plan);
  const planHash = sha256(planFile);
  if (state.decisions.omissionReview?.decision === 'restore' && state.decisions.omissionReview.systemPlanSha256 === planHash) throw new Error('Restoration requires a revised plan before approval');
  const changedPlan = state.primitivePlan?.sha256 && state.primitivePlan.sha256 !== planHash;
  for (const table of state.tables.filter((item) => item.included !== false)) {
    const disposition = dispositions.find((item) => item.tableId === table.id)?.disposition;
    const noAsset = ['exclude', 'defer'].includes(disposition) || plan.destination.shape === 'no_build';
    table.build.status = noAsset ? 'n/a' : changedPlan || table.build.status === 'n/a' ? 'pending' : table.build.status;
    table.validation.status = noAsset ? 'n/a' : changedPlan || table.validation.status === 'n/a' ? 'pending' : table.validation.status;
    if (noAsset) table.dataMigration.status = 'n/a';
  }
  if (state.gates.dataMigration === 'pending' && !state.tables.some((table) => table.included !== false && table.dataMigration.status === 'pending')) state.gates.dataMigration = 'n/a';
  state.gates.cleanup = plan.destination.shape === 'no_build' ? 'n/a' : 'pending';
  state.gates.omissionReview = !plan.changes.length ? 'n/a' : state.primitivePlan?.sha256 === planHash && state.gates.omissionReview === 'done' ? 'done' : 'pending';
  state.primitivePlan = { version: plan.version, path: path.resolve(planFile), sha256: planHash, dispositions: dispositions.length, stages: plan.destination.stages.length, recordedAt: now() };
  state.gates.primitivePlan = 'planned';
  state.gates.review = 'pending';
  for (const table of state.tables.filter((item) => item.included !== false)) table.review = { status: 'pending', briefSha256: null, systemPlanSha256: null, approvedAt: null };
  save(state, 'system_plan_recorded', { dispositions: state.primitivePlan.dispositions, stages: state.primitivePlan.stages });
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction, dispositions: state.primitivePlan.dispositions, stages: state.primitivePlan.stages }));
});
else if (command === 'record-omission-review') withLock(() => {
  const [decisionFile, expectedArg] = args; const state = load();
  if (!expectedArg || Number(expectedArg) !== state.revision) throw new Error(`Omission review requires the current revision: ${state.revision}`);
  const decision = readJson(decisionFile);
  if (state.primitivePlan?.version !== 3 || state.gates.omissionReview !== 'pending') throw new Error('No pending omission review for this plan');
  if (state.gates.review !== 'approved' || state.gates.primitivePlan !== 'planned' || decision.systemPlanSha256 !== state.primitivePlan.sha256 || sha256(state.primitivePlan.path) !== decision.systemPlanSha256) throw new Error('Omission decision must match the currently approved plan');
  if (state.tables.filter((table) => table.included !== false).some((table) => !['done', 'n/a'].includes(table.build.status) || !['done', 'n/a'].includes(table.validation.status))) throw new Error('Omission review requires completed build and replay');
  const plan = readJson(state.primitivePlan.path);
  if (!['keep', 'restore'].includes(decision.decision) || !Array.isArray(decision.restoreIds) || typeof decision.userResponse !== 'string' || !decision.userResponse.trim()) throw new Error('Record the user reply, keep/restore decision, and restoreIds');
  const changeIds = new Set(plan.changes.map((change) => change.id));
  if (new Set(decision.restoreIds).size !== decision.restoreIds.length || decision.restoreIds.some((id) => !changeIds.has(id))) throw new Error('Restore selections must name unique changes in the approved plan');
  if ((decision.decision === 'keep' && decision.restoreIds.length) || (decision.decision === 'restore' && !decision.restoreIds.length)) throw new Error('A restore decision needs selected changes; a keep decision needs none');
  state.decisions.omissionReview = { ...decision, recordedAt: now() };
  if (decision.decision === 'keep') state.gates.omissionReview = 'done';
  else {
    state.gates.primitivePlan = 'pending';
    state.gates.review = 'pending';
    for (const table of state.tables.filter((item) => item.included !== false)) table.review = { status: 'pending', briefSha256: null, systemPlanSha256: null, approvedAt: null };
  }
  save(state, 'omission_review_recorded', { decision: decision.decision, restoreIds: decision.restoreIds });
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction }));
});
else if (command === 'status') {
  const state = load();
  if (args.includes('--json')) console.log(JSON.stringify({ runId: state.runId, revision: state.revision, nextAction: deriveNext(state), dependencyGate: state.gates.dependencies || 'resolved_legacy', tables: state.tables.map((t) => ({ id: t.id, name: t.name, origin: t.origin || 'workbook', url: t.url || null, kind: t.kind, extract: t.local.extract, prepare: t.local.prepare, review: t.review.status, build: t.build.status, validation: t.validation.status })) }, null, 2));
  else process.stdout.write(render(state));
}
else if (command === 'collect') withLock(() => {
  const [tableId, resultFile, expectedArg] = args; const state = load();
  if (expectedArg && Number(expectedArg) !== state.revision) throw new Error(`Revision mismatch: expected ${expectedArg}, got ${state.revision}`);
  const table = state.tables.find((t) => t.id === tableId); if (!table) throw new Error(`Unknown table ${tableId}`);
  const dir = tableDir(state, table); const brief = path.join(dir, 'brief.md');
  const resolvedResult = path.resolve(resultFile);
  if (!resolvedResult.startsWith(path.resolve(dir) + path.sep)) throw new Error('Prepare result must live inside its table directory');
  if (fs.statSync(resultFile).size > 8192) throw new Error('Prepare result exceeds 8 KB contract');
  const result = readJson(resultFile); if (result.tableId !== tableId || result.status !== 'done') throw new Error('Invalid or incomplete prepare result');
  for (const artifact of Object.values(result.artifacts || {})) {
    const resolved = path.resolve(artifact.path || '');
    if (resolved !== path.resolve(dir) && !resolved.startsWith(path.resolve(dir) + path.sep)) throw new Error(`Prepare result points outside table directory: ${resolved}`);
  }
  if (result.input?.extractSha256 !== hashIf(path.join(dir, 'extract.json')) || result.artifacts?.brief?.sha256 !== hashIf(brief)) throw new Error('Prepare result hashes do not match current artifacts');
  table.local.prepare = 'done'; table.kind = result.kind; table.counts = result.counts; table.artifacts.briefSha256 = hashIf(brief); table.artifacts.prepareResultSha256 = hashIf(resultFile);
  save(state, 'prepare_collected', { tableId }); console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction }));
});
else if (command === 'approve') withLock(() => {
  const target = args[0] || 'all'; const state = load(); const selected = target === 'all' ? state.tables.filter((t) => t.included !== false) : state.tables.filter((t) => t.id === target);
  if (!selected.length || selected.some((t) => t.local.prepare !== 'done')) throw new Error('Approval requires completed preparation');
  if (!state.primitivePlan?.path || !fs.existsSync(state.primitivePlan.path) || sha256(state.primitivePlan.path) !== state.primitivePlan.sha256 || state.gates.primitivePlan !== 'planned') throw new Error('Approval requires the current recorded system plan');
  for (const table of selected) { const brief = path.join(tableDir(state, table), 'brief.md'); table.review = { status: 'approved', briefSha256: sha256(brief), systemPlanSha256: state.primitivePlan.sha256, approvedAt: now() }; }
  state.gates.review = state.tables.filter((t) => t.included !== false).every((t) => t.review.status === 'approved') ? 'approved' : 'partial';
  save(state, 'review_approved', { tables: selected.map((t) => t.id) }); console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction }));
});
else if (command === 'patch') withLock(() => {
  const [patchFile, expectedArg] = args; const state = load();
  if (expectedArg && Number(expectedArg) !== state.revision) throw new Error(`Revision mismatch: expected ${expectedArg}, got ${state.revision}`);
  const patch = readJson(patchFile);
  if (patch.gates && Object.prototype.hasOwnProperty.call(patch.gates, 'omissionReview')) throw new Error('Use record-omission-review to record the actual user decision');
  const merged = deepMerge(state, patch); merged.runId = state.runId; merged.schemaVersion = state.schemaVersion; merged.revision = state.revision;
  save(merged, 'patched'); console.log(JSON.stringify({ ok: true, revision: merged.revision, nextAction: merged.nextAction }));
});
else throw new Error(`Unknown command: ${command}`);
