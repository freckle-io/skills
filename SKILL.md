---
name: clay-to-freckle
description: Migrate one Clay table or an entire Clay workbook into Freckle quickly. Extracts full signed-in Clay v3 configuration plus three representative rows, translates Clay logic into provider-neutral capability intent, lets Freckle choose current primitives, builds approved assets before coordinated replay tests, and offers historical data migration only at the end. Workbook runs add dependency discovery, shared primitive-family planning, and bounded parallel builds; individual-table runs deliberately skip that machinery.
---

# Clay → Freckle

Give the user one continuous experience. Use sub-agents internally when available; never ask the user to manage sessions.

## Route first

Classify the pasted URL immediately:

- `wb_…` → **Workbook track**.
- `t_…` → **Individual-table track**.
- `wf_…` → reject; Clay Workflows are a different product.

Follow [references/migration-tracks.md](references/migration-tracks.md). Never apply Workbook-only roster, reference-expansion, primitive-family, shared-Workbook, or dependency-wave steps to an individual table.

| Lane | Track | Instruction |
|---|---|---|
| Extract | Both | [specialists/extract.md](specialists/extract.md) |
| Prepare Workbook | Workbook only | [specialists/prepare-workbook.md](specialists/prepare-workbook.md) |
| Translate logic | Both | [specialists/translate.md](specialists/translate.md) |
| Build table | Individual table only | [specialists/build-table.md](specialists/build-table.md) |
| Build Workbook | Workbook only | [specialists/build-workbook.md](specialists/build-workbook.md) |
| Replay test | Both | [specialists/replay-test.md](specialists/replay-test.md) |

Only the root orchestrator selects lanes and collects results into the run journal. Specialists stop at their exit contract; they do not cascade directly into another lane.

## Load-bearing invariants

- Extract complete table configuration, schema, sources, prompts, formulas, conditions, and action envelopes, but only **three representative records per table** initially.
- Preserve all Clay columns. `Clay Record ID` is the stable upsert key.
- Preview rows contain historical values and `Imported from Clay = true`; they never re-enrich.
- Replay fixtures use the same three original inputs, omit generated outputs, and set `Imported from Clay = false`. Never append replay fixtures to the production input Dataset.
- Clay translation specifies capability intent, inputs, outputs, conditions, provider semantics, and acceptance criteria. It never chooses Freckle nodes, providers, or workarounds. The current `/freckle` skill alone owns implementation.
- Build all approved assets before testing. Disable, defer, or dry-run external push side effects during tests.
- Historical data migration is optional and happens only after build and replay validation.
- Extracted data stays local except for imports into the user's authenticated Freckle organization. Give the privacy disclosure once.

## Fresh run first

A pasted Clay URL starts fresh unless the user explicitly says **resume**.

1. Immediately run `node <skill>/scripts/new-run.js <Clay-URL> <working-directory>` and retain the returned absolute path as `$JOURNAL`.
2. Before that, do not search for, inspect, reconcile, compare, or mention old journals. Identical targets do not change this rule.
3. Resume only from an exact run path explicitly supplied or already explicit in the active conversation.
4. `$JOURNAL/state.json` is authoritative; `state.md` is generated. Only the root orchestrator mutates shared state.

## Shared flow

1. Extract through [specialists/extract.md](specialists/extract.md). Prefer the authenticated wrapper; never use Clay CLI/MCP or manual CSV export.
2. Prepare each table with `scripts/prepare-table.js`. This creates `data.csv` for historical preview and `replay-fixtures.json` for isolated testing.
3. For logic tables, use [specialists/translate.md](specialists/translate.md) to describe intent without selecting Freckle primitives.
4. Present a short readable review, link the artifact, and request approval with a separate question of at most 15 words.
5. Build through the current `/freckle` skill. Use [specialists/build-table.md](specialists/build-table.md) for a table or [specialists/build-workbook.md](specialists/build-workbook.md) for a workbook.
6. Once all approved assets exist, send: **Everything is built and testing is underway:** with a link constructed from the verified ID: `https://next.freckle.io/workbooks/<id>` for a Workbook or `https://next.freckle.io/tools/<id>` for a Workflow. Never emit `app.freckle.io`. Do this before replay execution.
7. Run [specialists/replay-test.md](specialists/replay-test.md), comparing Freckle results with stored Clay outputs for the same three inputs.
8. Present one consolidated report. Then ask: `Migrate the remaining Clay data now?` Choices: `Migrate all`, `Choose tables` (Workbook only), `Not now`.
9. If approved, extract all remaining records with `--all`, compute Clay-record-ID set difference, and idempotently import historical rows directly. Do not run every historical row through the workflow.

## Workbook track

1. Enumerate live tables and confirm one roster.
2. Discover active `t_…` references with `scripts/discover-references.js`. Show each resolved target with a clickable Clay URL and ask whether to include it. A lookup-like name without live configuration proves nothing.
3. Prepare tables concurrently in isolated directories using [specialists/prepare-workbook.md](specialists/prepare-workbook.md).
4. Run `scripts/plan-primitive-families.js $JOURNAL`. Ask `/freckle` to resolve each unique capability family once; reuse that decision across matching tables.
5. Create one shared Freckle Workbook. Build independent table/family assets with bounded parallel workers; serialize only shared Workbook creation, cross-table wiring, and conflicting shared mutations. See [references/subagent-contracts.md](references/subagent-contracts.md).
6. Replay tests in dependency waves, concurrently within each safe wave. Publish one Workbook report.

## Individual-table track

Use the lean path: extract → prepare/translate → review → direct Freckle plan/build → three-input replay → optional historical data migration.

Do not enumerate a roster, expand dependencies, group primitive families, create Workbook-wide schedules, or coordinate cross-table test waves. If the table contains an external active reference, document it as a boundary; do not turn a table request into a Workbook migration without the user's approval.

## Reference handling

- Only a live `t_…` in Clay field/source configuration establishes a table relationship.
- For a resolved external target, report the table name, source column, row count, and clickable Clay URL. In Workbook mode ask whether to add it.
- For no active target, say only: “No active target is present in Clay's current configuration.” Never claim a lookup was flattened, removed, or formerly linked.

## Testing and completion

Follow [references/replay-testing.md](references/replay-testing.md).

- Deterministic formulas: exact comparison after normalization.
- Provider/API enrichments: compare the business contract, not incidental envelope shape.
- AI/research steps: compare directionally against explicit acceptance criteria.
- Pure-data tables: validate schema and the three-row preview; no workflow replay is required.
- Complete only when every included asset is built, replay validation is recorded, and the historical-data decision is recorded.

## Gate presentation

Keep context and consent separate. First send a readable assistant message with short headings/bullets and clickable links. Then ask one plain question of 15 words or fewer. Never put recaps, IDs, caveats, or “sent above” inside the question control.

## Resources

- [references/migration-tracks.md](references/migration-tracks.md) — explicit Workbook vs individual-table routing.
- [references/replay-testing.md](references/replay-testing.md) — same-input parity method and safety.
- [references/state-model.md](references/state-model.md) — idempotent state and resume rules.
- [references/subagent-contracts.md](references/subagent-contracts.md) — preparation, build, and test worker ownership.
- [specialists/extract.md](specialists/extract.md) — authenticated three-row extraction and approved full-data pull.
- [specialists/prepare-workbook.md](specialists/prepare-workbook.md) — Workbook-only preparation and family plan.
- [specialists/translate.md](specialists/translate.md) — provider-neutral intent brief.
- [specialists/build-table.md](specialists/build-table.md) — lean individual-table builder.
- [specialists/build-workbook.md](specialists/build-workbook.md) — shared Workbook and bounded parallel build.
- [specialists/replay-test.md](specialists/replay-test.md) — isolated replay and comparison.
- `scripts/build-replay-fixtures.js` — split historical preview from replay inputs.
- `scripts/plan-primitive-families.js` — deduplicate Workbook capability families without selecting implementations.
