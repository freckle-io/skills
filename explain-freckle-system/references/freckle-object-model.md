# Freckle Object Model And Inspection Rules

## Core Objects

| Object | Plain-language meaning | What proves it |
|---|---|---|
| Workbook | Container holding Datasets and their connections | `workbooks` row plus joined Datasets/connections |
| Dataset | Table/inbox containing rows | `datasets` row and `field_catalog` shape |
| Source | Mechanism that creates Dataset rows, such as webhook, manual input, import, or integration | `dataset_sources.kind`; inspect only safe config keys |
| Saved Workflow | Reusable recipe; it does not watch a Dataset by itself | `workflows` plus its latest `workflow_revisions` row |
| Connection | Conveyor belt attaching one input Dataset to one saved Workflow and creating an output Dataset | `workflow_dataset_connections` row |
| Integration node | Outside service consulted by a Workflow | Safe `uses` projection from `workflow_revisions.draft.nodes` |
| Internal Dataset push | A Workflow explicitly writes a handoff row to another Dataset | `pushToDataset` node and its explicit `datasetId` only |
| Connection output Dataset | Dataset created by the connection for Workflow outputs and receipts | `workflow_dataset_connections.output_dataset_id` |
| External coordinator/worker | Cloud process that detects, leases, retries, or delivers work outside the native connection chain | Current source/config documentation plus database run/state evidence |

## Evidence Precedence

Use the most current direct evidence available:

1. Live read-only database inspection of the exact object.
2. Saved revision/draft retrieved from the system.
3. Current local source that is proven equal to the saved revision.
4. Current architecture document.
5. Historical run evidence.
6. User statement.
7. Inference.

Do not let a lower-precedence intention override a higher-precedence current state. Record conflicts.

## Read-Only Inspection Pattern

Load the `db-query` skill and use the read-only Postgres connection. Never use the Freckle CLI or product APIs for this skill.

Typical inspection sequence:

1. Resolve the target row and derive `customer_id`.
2. Verify relevant columns and indexes.
3. Query Workbook, Dataset, source-kind, and connection topology using safe columns.
4. Query attached saved Workflows and latest revision metadata.
5. Project only Workflow node `uses` values and approved structural fields; never retrieve whole drafts into chat or the journal.
6. Inspect connection trigger policies and recent run state from execution tables.
7. Compare local artifacts only after establishing their relationship to the saved database revision.

Follow [database-inspection.md](database-inspection.md) for query templates and safety boundaries. Never invoke a Workflow or run a Dataset row for explanation work.

## Dataset Classification

Assign business roles from evidence, not labels alone:

- **Source inbox:** receives original source payloads.
- **Work queue:** rows wait for a specific Workflow or worker.
- **Handoff:** normalized contract between stages.
- **Connection receipt:** confirms a Workflow/connection ran; may duplicate another durable output.
- **Durable business state:** authoritative event, decision, claim, or action record.
- **Terminal output:** final business result for this system.
- **Recovery evidence:** exception-path evidence intended to rejoin another stage.

A Dataset may have two roles. Explain why when it does.

## Path Mechanics

Label every arrow with one mechanism:

- webhook/source creates row;
- automatic connection runs on row arrival;
- manual connection requires an explicit row run;
- Workflow `pushToDataset` creates a new row;
- integration node reads/enriches data but does not move the row;
- external coordinator polls/claims/delivers;
- disabled writer describes an action but does not execute it.

## Common Traps

- A saved Workflow can exist without being connected anywhere.
- Publishing a Workflow revision does not make a connection automatic.
- A Workflow may push to a Dataset in addition to returning connection output.
- A receipt Dataset is not automatically the authoritative business table.
- An HTTP integration call is not a Dataset handoff.
- A failed node may prevent downstream branching; verify whether recovery occurs inside or outside the Workflow.
- A connection described as “future auto” is still manual until inspected otherwise.
- “Writes disabled” in one adapter does not prove every external writer is disabled; inspect each relevant boundary.
- Multiple Workflows can live in one system even when the UI emphasizes one Dataset or connection at a time.
- `workflow_run_views` and `workflow_node_run_views` are projection tables, not SQL views; compare their timestamps with base run tables before treating them as perfectly current.
- Every tenant-scoped join must include `customer_id`, even when UUIDs appear globally unique.
- IDs prove identity; names explain meaning. Use both selectively.
