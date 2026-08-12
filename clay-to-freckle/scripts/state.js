#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicJson, atomicWrite, readJson, sha256 } = require('./lib');

const [, , command, journalArg, ...args] = process.argv;
if (!command || !journalArg) {
  console.error('Usage: node state.js <init|migrate-legacy|reconcile|status|record-dependencies|resolve-dependencies|record-primitive-plan|collect|approve|patch> <journal-dir> [args]');
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

const tableDir = (state, table) => state.mode === 'workbook' ? path.join(journal, 'tables', table.id) : journal;
const deriveNext = (state) => {
  const included = state.tables.filter((t) => t.included !== false);
  if (included.some((t) => t.local.extract !== 'done')) return 'extract';
  const dependencyGate = state.gates.dependencies || 'resolved_legacy';
  if (dependencyGate === 'pending_discovery') return 'dependency_discovery';
  if (dependencyGate === 'pending_review') return 'dependency_review';
  if (included.some((t) => !['done', 'needs_agent'].includes(t.local.prepare))) return 'prepare';
  if (included.some((t) => t.local.prepare === 'needs_agent')) return 'translate_agents';
  if (state.mode === 'workbook' && (state.gates.primitivePlan || 'pending') === 'pending') return 'primitive_planning';
  if (included.some((t) => t.review.status !== 'approved')) return 'consolidated_review';
  if (included.some((t) => t.build.status === 'external_reconcile_required')) return 'external_reconcile';
  if (included.some((t) => t.build.status !== 'done')) return 'build_assets';
  if (included.some((t) => t.validation.status !== 'done')) return 'replay_tests';
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
  return `# clay-to-freckle run\n\nRun: \`${state.runId}\` · revision ${state.revision} · updated ${state.updatedAt}\nTarget: ${state.mode === 'workbook' ? 'Clay workbook' : 'Clay table'} **${state.target.name}** (\`${state.target.id}\`)\nNext action: **${next}**\n\n\`\`\`text\n${line('Extracted', count((t) => t.local.extract === 'done'), next === 'extract')}\n${line('Prepared', count((t) => t.local.prepare === 'done'), ['prepare', 'translate_agents'].includes(next))}\n${line('Approved', count((t) => t.review.status === 'approved'), next === 'consolidated_review')}\n${line('Built', count((t) => t.build.status === 'done'), next === 'build_assets')}\n${line('Replay tested', count((t) => t.validation.status === 'done'), next === 'replay_tests')}\n\`\`\`\n\n| Table | Kind | Extract | Prepare | Review | Build | Replay |\n|---|---|---|---|---|---|---|\n${rows}\n\nReference dependencies: ${state.gates.dependencies || 'resolved_legacy'}\nPrimitive plan: ${state.gates.primitivePlan || (state.mode === 'table' ? 'n/a' : 'resolved_legacy')}\nFreckle Workbook: ${state.freckle.workbookId ? `\`${state.freckle.workbookId}\`` : 'pending'}\nHistorical data migration: ${state.gates.dataMigration || state.gates.backfill || 'n/a'}\n\n> Generated from \`state.json\`. Do not edit this file.\n`;
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
  if (table.review.briefSha256 && currentBriefHash !== table.review.briefSha256) table.review = { status: 'pending', briefSha256: null, approvedAt: null };
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
  const state = { schemaVersion: 2, runId: runId(target.id), revision: 0, createdAt: now(), updatedAt: now(), mode, target, confirmedRosterIds: tables.map((t) => t.id), gates: { roster: mode === 'workbook' ? 'pending' : 'n/a', dependencies: mode === 'workbook' ? 'pending_discovery' : 'resolved_table_mode', primitivePlan: mode === 'workbook' ? 'pending' : 'n/a', review: 'pending', install: 'pending', dataMigration: tables.some((t) => t.dataMigration.status === 'pending') ? 'pending' : 'n/a' }, decisions: {}, freckle: { orgId: null, workbookId: null, mutationLane: 'idle' }, tables };
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
  state.gates.primitivePlan = state.mode === 'workbook' ? 'resolved_legacy' : 'n/a';
  state.gates.dataMigration = state.gates.dataMigration || state.gates.backfill || 'n/a';
  state.legacy = { path: legacyPath, sha256: sha256(legacyPath), importedAt: now() };
  save(state, 'legacy_migrated');
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction, externalReconcile: state.tables.filter((t) => t.build.status === 'external_reconcile_required').map((t) => t.id) }));
});
else if (command === 'reconcile') withLock(() => {
  const state = load();
  if (!state.gates.dependencies) state.gates.dependencies = 'resolved_legacy';
  if (!state.gates.primitivePlan) state.gates.primitivePlan = state.mode === 'workbook' ? 'resolved_legacy' : 'n/a';
  if (!state.gates.dataMigration) state.gates.dataMigration = state.gates.backfill || 'n/a';
  state.tables = state.tables.map((t) => reconcileTable(state, t)); save(state, 'reconciled');
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction }));
});
else if (command === 'record-dependencies') withLock(() => {
  const [reportFile, expectedArg] = args; const state = load();
  if (expectedArg && Number(expectedArg) !== state.revision) throw new Error(`Revision mismatch: expected ${expectedArg}, got ${state.revision}`);
  const report = readJson(reportFile);
  if (report.runId !== state.runId) throw new Error('Reference report belongs to a different run');
  const candidates = report.expansionCandidates || [];
  state.references = { reportPath: path.resolve(reportFile), reportSha256: sha256(reportFile), activeTargets: (report.activeTargets || []).length, expansionCandidates: candidates.map((item) => item.targetId), unresolvedActiveTargets: (report.unresolvedActiveTargets || []).map((item) => item.targetId), lookupLikeWithoutActiveReference: (report.lookupLikeWithoutActiveReference || []).length };
  state.gates.dependencies = candidates.length ? 'pending_review' : 'resolved_none';
  save(state, 'dependencies_recorded', { candidates: candidates.map((item) => item.targetId) });
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction, expansionCandidates: candidates.length }));
});
else if (command === 'resolve-dependencies') withLock(() => {
  const [selectionFile, expectedArg] = args; const state = load();
  if (expectedArg && Number(expectedArg) !== state.revision) throw new Error(`Revision mismatch: expected ${expectedArg}, got ${state.revision}`);
  if (state.mode !== 'workbook') throw new Error('Dependency expansion is supported only for workbook runs');
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
  state.decisions.dependencies = { include: [...include], decline: [...decline], decidedAt: now() };
  state.gates.dependencies = include.size ? 'pending_discovery' : 'resolved_declined';
  if ([...include].some((id) => (candidates.get(id).target.rowCount ?? 4) > 3)) state.gates.dataMigration = 'pending';
  save(state, 'dependencies_resolved', { include: [...include], decline: [...decline] });
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction, added: [...include] }));
});
else if (command === 'record-primitive-plan') withLock(() => {
  const [planFile, expectedArg] = args; const state = load();
  if (state.mode !== 'workbook') throw new Error('Primitive-family planning is Workbook-only');
  if (expectedArg && Number(expectedArg) !== state.revision) throw new Error(`Revision mismatch: expected ${expectedArg}, got ${state.revision}`);
  const plan = readJson(planFile);
  if (plan.runId && plan.runId !== state.runId) throw new Error('Primitive plan belongs to a different run');
  state.primitivePlan = { path: path.resolve(planFile), sha256: sha256(planFile), families: (plan.families || []).length, recordedAt: now() };
  state.gates.primitivePlan = 'planned';
  save(state, 'primitive_plan_recorded', { families: state.primitivePlan.families });
  console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction }));
})
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
  for (const table of selected) { const brief = path.join(tableDir(state, table), 'brief.md'); table.review = { status: 'approved', briefSha256: sha256(brief), approvedAt: now() }; }
  state.gates.review = state.tables.filter((t) => t.included !== false).every((t) => t.review.status === 'approved') ? 'approved' : 'partial';
  save(state, 'review_approved', { tables: selected.map((t) => t.id) }); console.log(JSON.stringify({ ok: true, revision: state.revision, nextAction: state.nextAction }));
});
else if (command === 'patch') withLock(() => {
  const [patchFile, expectedArg] = args; const state = load();
  if (expectedArg && Number(expectedArg) !== state.revision) throw new Error(`Revision mismatch: expected ${expectedArg}, got ${state.revision}`);
  const merged = deepMerge(state, readJson(patchFile)); merged.runId = state.runId; merged.schemaVersion = state.schemaVersion; merged.revision = state.revision;
  save(merged, 'patched'); console.log(JSON.stringify({ ok: true, revision: merged.revision, nextAction: merged.nextAction }));
});
else throw new Error(`Unknown command: ${command}`);
