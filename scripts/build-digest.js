#!/usr/bin/env node
// clay-to-freckle digest + brief-skeleton builder — deterministic extract.json →
//   digest.md  — compact model-facing summary (field inventory, dependency graph,
//                population/status counts, cross-table refs, ground-truth candidates)
//   brief.md   — the migration brief PRE-FILLED: every mechanical section rendered,
//                verbatim prompts/formulas injected disk-to-disk (byte-faithful,
//                {{f_…}} resolved to {{Column Name}}), with <!-- FILL: … --> slots
//                left only where human-shaped judgment is needed (intents, workflow
//                summary, outcomes, what-doesn't-come-over).
//
// Usage: node build-digest.js <extract.json> <outDir> [workbook.json] [state.json]
//   workbook.json (workbook runs) resolves sibling-table names for the Workbook
//   context line and cross-table references.
//
// The model NEVER reads extract.json or re-types prompts: it reads digest.md,
// then completes brief.md by editing the FILL slots. A brief still containing
// FILL markers is a skeleton, not a finished translation.

const fs = require('fs');
const path = require('path');

const [, , extractPath, outDir, workbookPath, statePath] = process.argv;
if (!extractPath || !outDir) {
  console.error('Usage: node build-digest.js <extract.json> <outDir> [workbook.json] [state.json]');
  process.exit(1);
}

const x = JSON.parse(fs.readFileSync(extractPath, 'utf8'));
const wb = workbookPath ? JSON.parse(fs.readFileSync(workbookPath, 'utf8')) : null;
const state = statePath && fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
const fields = x.table.fields || [];
const records = x.records || [];
const schema = x.tableSchema || {};

const idToName = {};
for (const f of fields) idToName[f.id] = f.name;
const resolve = (s) => String(s).replace(/\{\{(f_[A-Za-z0-9_]+)\}\}/g, (m, id) => idToName[id] ? '{{' + idToName[id] + '}}' : m);
const refsIn = (s) => [...String(s).matchAll(/\{\{(f_[A-Za-z0-9_]+)\}\}/g)].map((m) => m[1]);
// formulaWaterfall rungs are objects in the wild: {formula: "…"} or {prompt: "…"}
// (validated 2026-08-05); tolerate plain strings too.
const rungText = (w) => typeof w === 'string' ? w : (w?.formula ?? w?.prompt ?? JSON.stringify(w));
const rungKind = (w) => typeof w === 'object' && w !== null && w.prompt !== undefined && w.formula === undefined ? 'prompt' : 'formula';
const mdCell = (v, max = 60) => {
  let s = v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  if (s.length > max) s = s.slice(0, max) + '…';
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, '⏎');
};

// ---- dependency graph -------------------------------------------------------
const deps = {}; // field id -> Set of upstream field ids
for (const f of fields) {
  const d = new Set();
  const ts = f.typeSettings || {};
  for (const key of ['inputFieldIds', 'conditionalRunFieldIds', 'delayFieldIds']) {
    for (const id of f[key] || []) if (idToName[id]) d.add(id);
  }
  for (const b of ts.inputsBinding || []) {
    if (b.formulaText) for (const id of refsIn(b.formulaText)) if (idToName[id]) d.add(id);
    if (b.formulaMap) for (const v of Object.values(b.formulaMap)) for (const id of refsIn(v)) if (idToName[id]) d.add(id);
  }
  if (ts.conditionalRunFormulaText) for (const id of refsIn(ts.conditionalRunFormulaText)) if (idToName[id]) d.add(id);
  if (ts.formulaText) for (const id of refsIn(ts.formulaText)) if (idToName[id]) d.add(id);
  for (const w of ts.formulaWaterfall || []) for (const id of refsIn(rungText(w))) if (idToName[id]) d.add(id);
  d.delete(f.id);
  deps[f.id] = d;
}
const downstream = {};
for (const f of fields) downstream[f.id] = [];
for (const f of fields) for (const d of deps[f.id]) downstream[d].push(f.id);

// topological order over action+formula fields (stable; cycles fall back to field order)
const workFields = fields.filter((f) => f.type === 'action' || f.type === 'formula');
const ordered = [];
{
  const pending = new Map(workFields.map((f) => [f.id, new Set([...deps[f.id]].filter((d) => workFields.some((w) => w.id === d)))]));
  let progressed = true;
  while (pending.size && progressed) {
    progressed = false;
    for (const f of workFields) {
      if (!pending.has(f.id)) continue;
      if ([...pending.get(f.id)].every((d) => !pending.has(d))) {
        ordered.push(f); pending.delete(f.id); progressed = true;
      }
    }
  }
  for (const f of workFields) if (pending.has(f.id)) ordered.push(f); // cycle fallback
}

// ---- population + status counts --------------------------------------------
const pop = {}; const statusCounts = {};
for (const f of fields) { pop[f.id] = 0; statusCounts[f.id] = {}; }
for (const r of records) {
  for (const [fid, cell] of Object.entries(r.cells || {})) {
    if (!(fid in pop) || cell === null || cell === undefined || cell === '') continue;
    pop[fid] += 1;
    if (cell && typeof cell === 'object' && !Array.isArray(cell) && cell.status) {
      statusCounts[fid][cell.status] = (statusCounts[fid][cell.status] || 0) + 1;
    }
  }
}
const statusLine = (fid) => Object.entries(statusCounts[fid]).map(([k, v]) => `${k}:${v}`).join(' ') || '';

// ---- roles ------------------------------------------------------------------
const role = (f) => f.type === 'action' ? 'enrichment action'
  : f.type === 'formula' ? 'derived output'
  : 'input';
const terminal = (f) => (downstream[f.id] || []).length === 0;

// ---- cross-table references -------------------------------------------------
const roster = state?.tables?.filter((t) => t.included !== false) || wb?.tables || [];
const rosterById = Object.fromEntries(roster.map((t) => [t.id, t]));
const extractedRefs = Array.isArray(x.tableReferences) ? x.tableReferences : [];
const crossRefMap = new Map();
for (const item of extractedRefs) {
  if (!item?.targetId || item.targetId === x.tableId) continue;
  const target = item.target || {};
  const rosterTarget = rosterById[item.targetId] || {};
  const evidenceItems = Array.isArray(item.evidence) && item.evidence.length ? item.evidence : [{ evidence: { kind: 'source' } }];
  for (const evidenceItem of evidenceItems) {
    const evidence = evidenceItem.evidence || evidenceItem;
    const key = `${evidence.fieldId || evidence.kind || '(source)'}:${item.targetId}`;
    crossRefMap.set(key, {
      field: evidence.fieldName || (evidence.kind === 'source' ? '(source)' : '(configuration)'),
      ref: item.targetId,
      name: target.name || rosterTarget.name || null,
      url: target.url || rosterTarget.url || null,
      status: item.status || 'unresolved',
      alreadyIncluded: Boolean(rosterById[item.targetId])
    });
  }
}
// Legacy extracts may predate tableReferences. IDs in live configuration are
// still valid evidence; names alone never establish a relationship.
if (!extractedRefs.length) {
  for (const f of fields) {
    const blob = JSON.stringify(f.typeSettings || {});
    for (const m of new Set([...blob.matchAll(/t_[A-Za-z0-9]{10,}/g)].map((match) => match[0]))) {
      if (m === x.tableId) continue;
      const target = rosterById[m] || {};
      crossRefMap.set(`${f.id}:${m}`, { field: f.name, ref: m, name: target.name || null, url: target.url || null, status: 'unresolved_legacy', alreadyIncluded: Boolean(rosterById[m]) });
    }
  }
}
const crossRefs = [...crossRefMap.values()];
const refLabel = (c) => `${c.name || c.ref}${c.url ? ` (${c.url})` : ''}${c.alreadyIncluded ? ' [included]' : ''}`;

// ---- ground-truth candidates ------------------------------------------------
const inputFields = fields.filter((f) => role(f) === 'input');
const deliverableFields = fields.filter((f) => f.type !== 'text' ? (f.type === 'formula' || f.type === 'action') : false);
const rowScore = (r) => {
  const cells = r.cells || {};
  const inputsPopulated = inputFields.filter((f) => cells[f.id] !== undefined && cells[f.id] !== null && cells[f.id] !== '').length;
  const delivered = deliverableFields.filter((f) => {
    const c = cells[f.id];
    if (!c) return false;
    if (typeof c === 'object' && !Array.isArray(c)) return c.displayValue !== undefined || c.fullValue !== undefined;
    return c !== '';
  }).length;
  return inputsPopulated === 0 ? -1 : inputsPopulated + delivered * 2;
};
const gtRows = records.map((r) => ({ r, s: rowScore(r) })).filter((e) => e.s > 0)
  .sort((a, b) => b.s - a.s).slice(0, 3).map((e) => e.r);
const gtCols = [
  ...inputFields.map((f) => ({ f, p: pop[f.id] })).sort((a, b) => b.p - a.p).slice(0, 4).map((e) => e.f),
  ...deliverableFields.map((f) => ({ f, p: pop[f.id] })).sort((a, b) => b.p - a.p).slice(0, 4).map((e) => e.f)
];
const cellDisplay = (cell) => {
  if (cell && typeof cell === 'object' && !Array.isArray(cell)) return cell.displayValue ?? cell.status ?? '';
  return cell;
};

// ---- render helpers ---------------------------------------------------------
const FILL = (hint) => `<!-- FILL: ${hint} -->`;
const atomicWrite = (target, contents) => {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, target);
};
const outputSummary = (f) => {
  // outputParameterSchema is an ARRAY of {name, displayName, outputPath, …} in the
  // wild (validated 2026-08-05); tolerate a JSON-schema-style object too.
  const ops = f.actionDefinition?.outputParameterSchema;
  let names = [];
  if (Array.isArray(ops)) names = ops.map((o) => o.name || o.displayName).filter(Boolean);
  else if (ops && ops.properties) names = Object.keys(ops.properties);
  if (!names.length) return 'n/a';
  const shown = names.slice(0, 15).join(', ');
  return names.length > 15 ? `${shown}, … +${names.length - 15} more` : shown;
};
const bindingBlock = (f) => {
  const ts = f.typeSettings || {};
  const lines = [];
  for (const b of ts.inputsBinding || []) {
    if (b.formulaText !== undefined && b.formulaText !== null) {
      const text = resolve(b.formulaText);
      if (text.length > 200 || text.includes('\n')) {
        lines.push(`  - \`${b.name}\`:`, '', '    ```', ...text.split('\n').map((l) => '    ' + l), '    ```');
      } else {
        lines.push(`  - \`${b.name}\`: \`${text}\``);
      }
    } else if (b.formulaMap) {
      lines.push(`  - \`${b.name}\` (map):`);
      for (const [k, v] of Object.entries(b.formulaMap)) lines.push(`    - ${k}: \`${resolve(v)}\``);
    }
  }
  return lines;
};
const waterfallBlock = (f) => {
  // Formula fields in the wild carry formulaText (+ optional formulaPrompt that
  // generated it) and/or an ordered formulaWaterfall — render whichever exist.
  const ts = f.typeSettings || {};
  const lines = [];
  if (ts.formulaText) {
    const text = resolve(ts.formulaText);
    if (text.length > 200 || text.includes('\n')) {
      lines.push('  - formula:', '', '    ```', ...text.split('\n').map((l) => '    ' + l), '    ```');
    } else {
      lines.push(`  - formula: \`${text}\``);
    }
  }
  if (ts.formulaPrompt) lines.push(`  - formula prompt (generated the formula): ${mdCell(resolve(ts.formulaPrompt), 400)}`);
  (ts.formulaWaterfall || []).forEach((w, i) => {
    const text = rungText(w);
    const provs = [...new Set(refsIn(text))].map((id) => {
      const pf = fields.find((g) => g.id === id);
      return pf?.typeSettings?.actionKey ? `${idToName[id]} (${pf.typeSettings.actionKey})` : idToName[id] || id;
    });
    const kind = rungKind(w) === 'prompt' ? ' (prompt-generated rung)' : '';
    const resolved = resolve(text);
    if (resolved.length > 200 || resolved.includes('\n')) {
      lines.push(`  ${i + 1}.${kind}${provs.length ? ` — sources: ${provs.join(', ')}` : ''}`, '', '    ```', ...resolved.split('\n').map((l) => '    ' + l), '    ```');
    } else {
      lines.push(`  ${i + 1}. \`${resolved}\`${kind}${provs.length ? ` — sources: ${provs.join(', ')}` : ''}`);
    }
  });
  return lines;
};

// ---- brief.md ---------------------------------------------------------------
const total = x.rowCount ?? records.length;
const seeded = x.recordsFetched ?? records.length;
const remaining = Math.max(0, (total || 0) - seeded);
const B = [];
B.push(`# Migration Brief: ${x.table.name} → Freckle workflow`, '');
B.push(`Source: Clay table \`${x.tableId}\` (view \`${x.viewId}\`), workspace ${x.workspaceId}, extracted ${x.extractedAt}. ${total} rows at extraction; ${seeded} build-sample rows retained.`);
if (wb || state) {
  const idx = roster.findIndex((t) => t.id === x.tableId);
  const sibs = roster.filter((t) => t.id !== x.tableId).map((t) => `${t.name}${t.origin === 'referenced_dependency' ? ' (referenced dependency)' : ''}`);
  const xr = crossRefs.length
    ? 'Cross-table links: ' + crossRefs.map((c) => `${c.field} → ${refLabel(c)}`).join('; ')
    : 'No cross-table references detected.';
  B.push(`Migration context: table ${idx + 1} of ${roster.length} for Clay workbook "${wb?.workbook?.name || state?.target?.name}" (\`${wb?.workbookId || state?.target?.id}\`); other included tables: ${sibs.join(', ') || 'none'}; all build into the shared Freckle Workbook "${wb?.workbook?.name || state?.target?.name}". ${xr}`);
}
B.push('', '## 1. Inputs', '');
B.push('What a row starts as (the input Dataset), and where rows come from:');
for (const f of inputFields) {
  const sem = schema[f.id]?.semanticType ? `, ${schema[f.id].semanticType}` : '';
  B.push(`- ${f.name} (${f.type}${sem}) — ${pop[f.id]}/${records.length} populated in build sample${terminal(f) ? '' : `; feeds ${downstream[f.id].map((d) => idToName[d]).slice(0, 6).join(', ')}${downstream[f.id].length > 6 ? ', …' : ''}`}`);
}
B.push(`- Sources: ${Array.isArray(x.sources) && x.sources.length ? mdCell(x.sources, 400) + ' ' + FILL('state each source as an intent') : 'none detected — manual/CSV only.'}`);
B.push('', '## 2. Workflow walkthrough', '');
B.push(FILL('ASCII workflow diagram at provider level (one connected flow; run-condition branches labeled; waterfalls collapsed to one stack; plumbing formulas implied; cross-table links and end states shown) followed by a numbered primitives list — one line per step: step — intent'), '');
for (const f of ordered) {
  const ts = f.typeSettings || {};
  B.push(`### ${f.name} — ${role(f)}`);
  B.push(`- Intent: ${FILL('one sentence: the business goal of this step')}`);
  if (f.type === 'action') {
    const def = f.actionDefinition || {};
    B.push(`- Clay's approach (context, not instruction): ${def.displayName || ts.actionKey || 'unknown action'}${def.description ? ` — ${mdCell(def.description, 200)}` : ''} (\`${ts.actionKey}\`)${ts.authAccountId ? ` — uses Clay-managed auth account \`${ts.authAccountId}\`` : ''}`);
  } else {
    B.push(`- Clay's approach (context, not instruction): formula${ts.waterfallType ? ` (waterfall: ${ts.waterfallType})` : ''}`);
  }
  B.push(`- Depends on: ${[...deps[f.id]].map((d) => idToName[d]).join(', ') || 'nothing — runs on row arrival'}`);
  B.push(`- Available outputs: ${outputSummary(f)}`);
  B.push(`- Used downstream by: ${downstream[f.id].map((d) => idToName[d]).join(', ') || 'nothing — this is a terminal result'}`);
  const bindings = f.type === 'action' ? bindingBlock(f) : waterfallBlock(f);
  if (bindings.length) { B.push('- Verbatim bindings/formula:'); B.push(...bindings); }
  if (ts.conditionalRunFormulaText) {
    B.push(`- Run conditions: \`${resolve(ts.conditionalRunFormulaText)}\` — ${FILL('translate the gate to intent')}`);
  } else {
    B.push('- Run conditions: none.');
  }
  B.push(`- Existing rows: ${pop[f.id]}/${records.length} populated in the three-row build sample${statusLine(f.id) ? ` (${statusLine(f.id)})` : ''}; historical values are preserved verbatim only when the user later approves data migration.`);
  B.push('- Future rows: reproduce this result for new rows — implementation is /freckle\'s decision.');
  B.push('');
}
B.push('## 3. Preserved columns', '');
B.push('Every Clay column in original order — all migrate automatically:', '');
B.push('| Clay column | Role | Populated (sample) | Preview value | Future-row behavior |');
B.push('|---|---|---:|---|---|');
B.push(`| Clay Record ID | stable migration key | ${records.filter((r) => r.id).length}/${records.length} | preserved from Clay record | assigned by the future source |`);
for (const f of fields) {
  const mv = f.type === 'action' ? 'JSON envelope (status/displayValue/fullValue)' : 'preserved verbatim';
  const fr = f.type === 'action' ? 'reproduced by workflow' : f.type === 'formula' ? 'derived' : 'arrives with new rows';
  B.push(`| ${mdCell(f.name)} | ${role(f)}${terminal(f) && f.type !== 'text' ? ' (terminal)' : ''} | ${pop[f.id]}/${records.length} | ${mv} | ${fr} |`);
}
B.push('| Imported from Clay | migration control | all | static `true` | blank/false |');
B.push('', 'Nothing is removed merely because no later Clay field references it.');
B.push('', '## 4. Outcomes', '');
B.push(FILL('downstream pushes as intents (CRM/sequencer/Slack action columns count), or "none detected"'));
B.push('', '## 5. Migrated data', '');
if (records.length === 0) {
  B.push('No data to migrate — the table had 0 rows.');
} else {
  B.push(`- \`data.csv\` is the **build sample** — ${seeded} of ${total} rows × ${fields.length + 2} columns, with stable \`Clay Record ID\`, every extracted Clay column, and \`Imported from Clay = true\`. It exists to preview and validate the new Freckle assets, not to imply the historical dataset is migrated.`);
  B.push(remaining > 0
    ? `- The remaining ${remaining} rows stay in Clay unless the user accepts the final historical data-migration offer.`
    : '- The table has no rows beyond the build sample.');
  B.push('- Historical preview/data-migration rows use `Imported from Clay = true` and never re-enrich. Separate input-only replay fixtures set it false and omit Clay-generated outputs so the new Freckle logic is genuinely exercised without adding duplicate production rows.');
  B.push('- Future rows leave `Imported from Clay` blank/false, run the full workflow, and land in the same output Dataset.');
}
B.push('', '## 6. Ground truth', '');
if (gtRows.length === 0) {
  B.push('No qualifying ground-truth rows — parity will be skipped.');
} else {
  B.push(`${gtRows.length} candidate rows (inputs AND deliverables populated; adjust selection if better rows exist):`, '');
  B.push('| ' + gtCols.map((f) => mdCell(f.name, 24)).join(' | ') + ' |');
  B.push('|' + gtCols.map(() => '---').join('|') + '|');
  for (const r of gtRows) B.push('| ' + gtCols.map((f) => mdCell(cellDisplay((r.cells || {})[f.id]), 40)).join(' | ') + ' |');
  B.push('', 'Parity expectations: exact-match on deterministic fields (emails, domains, URLs); directional-match on AI outputs (differences explained, not failed).');
}
B.push('', '## 7. What doesn\'t come over', '');
B.push(FILL('list anything genuinely dropped as manual follow-ups, or "Nothing — everything translated." Remember: rehomed values (inline secrets → managed credentials) are NOT dropped'));
B.push('');

// ---- digest.md --------------------------------------------------------------
const D = [];
D.push(`# Digest: ${x.table.name} (${x.tableId})`, '');
D.push(`${fields.length} fields (${workFields.filter((f) => f.type === 'action').length} action / ${workFields.filter((f) => f.type === 'formula').length} formula / ${inputFields.length} input) · ${seeded}/${total} build-sample rows · extracted ${x.extractedAt}`);
D.push(`Sources: ${Array.isArray(x.sources) ? (x.sources.length || 'none') : 'unavailable'} · Cross-table refs: ${crossRefs.length ? crossRefs.map((c) => `${c.field}→${refLabel(c)}`).join('; ') : 'none'}`, '');
D.push('| Field | id | Type | Deps | Downstream | Pop | Status |');
D.push('|---|---|---|---|---|---:|---|');
for (const f of fields) {
  D.push(`| ${mdCell(f.name, 40)} | ${f.id} | ${f.type}${f.typeSettings?.actionKey ? ':' + f.typeSettings.actionKey : ''} | ${mdCell([...deps[f.id]].map((d) => idToName[d]).join(', '), 60)} | ${mdCell(downstream[f.id].map((d) => idToName[d]).join(', '), 60)} | ${pop[f.id]} | ${mdCell(statusLine(f.id), 40)} |`);
}
D.push('', `Dependency order (actions+formulas): ${ordered.map((f) => f.name).join(' → ') || 'n/a'}`);
// waterfall groups: formula fields whose formulaWaterfall pulls from action fields —
// collapse these to one stack when drawing the workflow diagram.
const waterfalls = [];
for (const f of fields) {
  const wf = f.typeSettings?.formulaWaterfall;
  if (!wf || !wf.length) continue;
  const provs = [...new Set(wf.flatMap((w) => refsIn(rungText(w))))].map((id) => {
    const pf = fields.find((g) => g.id === id);
    return pf?.typeSettings?.actionKey ? `${idToName[id]} (${pf.typeSettings.actionKey})` : idToName[id] || id;
  });
  if (provs.length) waterfalls.push(`${f.name} ← ${provs.join(' → ')}`);
}
if (waterfalls.length) D.push('', 'Waterfall groups (collapse each to one stack in the diagram):', ...waterfalls.map((w) => `- ${w}`));
D.push('', `Ground-truth candidates: ${gtRows.map((r) => r.id).join(', ') || 'none'}`);
D.push('', 'Prompts/formulas are already injected verbatim into brief.md — do not re-read or re-type them. Complete the brief by editing its `<!-- FILL: … -->` slots only.');
D.push('');

fs.mkdirSync(outDir, { recursive: true });
const briefOut = path.join(outDir, 'brief.md');
const digestOut = path.join(outDir, 'digest.md');
const briefText = B.join('\n');
let briefPreserved = false;
if (fs.existsSync(briefOut) && fs.readFileSync(briefOut, 'utf8') !== briefText) briefPreserved = true;
else atomicWrite(briefOut, briefText);
atomicWrite(digestOut, D.join('\n'));

console.log(JSON.stringify({
  ok: true,
  fields: fields.length,
  actions: workFields.filter((f) => f.type === 'action').length,
  formulas: workFields.filter((f) => f.type === 'formula').length,
  seeded, total,
  crossTableRefs: crossRefs.length,
  gtCandidates: gtRows.length,
  fillSlots: (briefText.match(/<!-- FILL:/g) || []).length,
  digestBytes: fs.statSync(digestOut).size,
  briefBytes: fs.statSync(briefOut).size,
  digest: digestOut, brief: briefOut, briefPreserved
}, null, 1));
