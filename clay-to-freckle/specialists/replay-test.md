# Replay test worker

Own replay validation after assets are built. Follow [../references/replay-testing.md](../references/replay-testing.md).

For each assigned table:

1. Read its `replay-fixtures.json`, approved intent brief, and `build-result.json`.
2. Confirm push/message/CRM side effects are disabled, deferred, or dry-run.
3. Run each replay fixture through a direct saved Workflow invocation or isolated test surface, never the production input Dataset.
4. Compare the new result with `clayExpected` using the fixture's declared mode: exact, business contract, or directional.
5. Write only `replay-result.json` inside the assigned table directory. Include fixture IDs, statuses, concise normalized differences, blockers, and tested asset revision. Exclude raw PII.

In Workbook mode, the coordinator schedules workers concurrently within dependency waves and creates one consolidated report. In table mode, run this once without Workbook scheduling.

## Exit contract

Write the scoped `replay-result.json`, return its absolute path and compact status to the root orchestrator, and stop. The root alone chooses the next wave or historical-data gate.
