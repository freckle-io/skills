# Inspect Specialist

Inventory the actual Freckle system without changing it.

## Read

1. `system-explanation-journal.md`
2. [../references/system-explanation-journal.md](../references/system-explanation-journal.md)
3. [../references/freckle-object-model.md](../references/freckle-object-model.md)
4. [../references/database-inspection.md](../references/database-inspection.md)
5. The `db-query` skill

Do not read the other specialists.

## Sequence

1. Resolve the named Workbook, Workflow, URL, ID, or local artifact. Do not invent a target.
2. Record evidence source, inspection time, and authority:
   - live read-only database inspection;
   - current local source;
   - historical document;
   - user statement.
3. Inventory:
   - Workbook;
   - Datasets and sources;
   - connections and trigger policies;
   - saved Workflows and revisions;
   - Workflow inputs, outputs, node families, internal Dataset pushes, and external integrations;
   - current run/activation state when relevant;
   - disabled writer or safety controls.
4. Use only `SELECT` queries against `FRECKLE_READONLY_POSTGRES_URL` with SSL required. Never call the Freckle CLI or product APIs.
5. Resolve the target in `workbooks` or `workflows`, derive its `customer_id`, and include that `customer_id` in every subsequent tenant-scoped query.
6. Verify unfamiliar table columns and indexes before querying. Use the safe projections in `database-inspection.md`; never select whole secret-bearing JSON columns.
7. Establish topology from `datasets`, `dataset_sources`, `workflow_dataset_connections`, `workflows`, and `workflow_revisions`.
8. Establish recent activation and health from `dataset_entry_runs`, `workflow_runs`, `workflow_run_views`, and `workflow_node_run_views`. Projection-table rows may lag; record the inspection time and any mismatch with base run tables.
9. Record unknowns and contradictions. Do not turn intended architecture into current-state fact.
10. Update the journal inventory, evidence ledger, integrations, state table, and handoff.

## Inspection Gate

Do not exit to tracing until each connection has an input Dataset, output Dataset, Workflow, and trigger policy—or is clearly labeled unresolved—and all topology queries are scoped to the resolved `customer_id`.

## Exit Contract

1. Update `system-explanation-journal.md`.
2. Add `## Handoff` with current lane, completed work, recommended next lane, reason, exact artifacts to read, and one next action.
3. Recommend `trace` when the inventory is sufficient, or `blocked` when the target cannot be established.
4. Return to the orchestrator.
