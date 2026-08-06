# Replay testing

The initial three records serve two different purposes. Never collapse them into one dataset.

## Preview copy

`data.csv` contains the historical records exactly as extracted, plus:

- `Clay Record ID = record.id`
- `Imported from Clay = true`

It previews the migrated schema and historical values. Workflow actions must not execute on these rows.

## Replay fixture

`replay-fixtures.json` contains the same records, split into:

- original input fields only;
- stored Clay outputs as expected results;
- generated/action/formula outputs omitted from the runnable input;
- `Imported from Clay = false`.

Run fixtures through a saved Workflow invocation or an isolated test surface. Never append them to the production input Dataset and never overwrite the preview rows.

## Comparisons

- `exact`: deterministic formulas and transformations after stable normalization.
- `business_contract`: provider/API results may differ in envelope or freshness; compare required business fields, status meaning, and acceptance rules.
- `directional`: AI or research outputs must satisfy the brief's criteria and intended category/meaning, not match prose byte-for-byte.
- Pure-data tables require schema, key, row-count, and value preservation checks only.

Report each fixture as pass, acceptable difference, fail, or blocked, with a concise reason. Never expose raw PII or full action envelopes in chat.

## Safety

Disable, defer, or dry-run CRM writes, sequencer pushes, messages, and other external side effects. A test must not contact prospects or mutate downstream systems. Missing authentication can be reported as blocked without redesigning the workflow.

## Scheduling

For an individual table, run one replay job after its asset is built.

For a Workbook, wait until all approved assets are built and final wiring is complete. Then compute dependency waves. Run independent tables concurrently within a wave and wait before advancing to dependents. Workers write only their table's `replay-result.json`; the coordinator writes the consolidated report.

Immediately before testing, tell the user:

> Everything is built and testing is underway: [Open the Freckle Workbook](<url>)

Use the table URL and singular wording for an individual-table migration.
