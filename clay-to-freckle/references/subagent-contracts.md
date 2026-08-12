# Worker contracts

Sub-agents are an internal optimization. Keep the user in one session and return aggregate progress rather than worker logs.

## Preparation workers

After extraction, run `prepare-table.js` independently for each table. A translation worker may read its table directory plus read-only Workbook/state context and may write only inside that table directory. It cannot invoke Clay extraction, Freckle, install tools, edit shared state, or ask the user questions.

Pure-data preparation is deterministic and needs no worker. Retry only failed table jobs.

## Workbook build workers

Parallel asset builds are allowed only after review approval is hash-bound, `/freckle` has resolved the unique primitive families, the coordinator has frozen the shared Workbook ID, and dependency waves plus ownership are explicit.

Each builder owns distinct table/family assets and writes only `tables/<id>/build-result.json`. It cannot edit shared state, shared build context, another table, or shared cross-table wiring. The coordinator serializes shared Workbook creation, conflicting shared mutations, final wiring, and result collection.

Use bounded concurrency based on available runtime slots and mutation safety, normally two or three builders. Parallelism is by independent asset ownership, never by racing on one Workflow or Dataset.

## Replay workers

All approved assets and final wiring must be complete before Workbook replay begins. Schedule dependency waves; run independent tables concurrently within one wave. Each worker writes only its table's `replay-result.json`. The coordinator advances waves and writes the consolidated report.

Tests use at most three isolated replay fixtures. They never append fixtures to production Datasets or trigger push side effects.

## Compact return envelope

Workers return only the result path and a small status line. Never return prompts, row values, brief bodies, action envelopes, or PII in chat. Shared state mutations always belong to the root coordinator.
