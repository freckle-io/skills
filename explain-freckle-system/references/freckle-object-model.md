# Freckle Object Model And Inspection Rules

## Core Objects

| Object | Plain-language meaning | What proves it |
|---|---|---|
| Workbook | Container holding Datasets and their connections | `freckle workbook inspect` |
| Dataset | Table/inbox containing rows | Workbook or Dataset inspect output and its field catalog |
| Source | Mechanism that creates Dataset rows, such as webhook, manual input, import, or integration | `freckle workbook dataset source list`; keep endpoint URLs secret |
| Saved Workflow | Reusable recipe; it does not watch a Dataset by itself | `freckle workflow saved inspect` and the current CLI-exported draft |
| Connection | Conveyor belt attaching one input Dataset to one saved Workflow and creating an output Dataset | Workbook inspect output |
| Integration node | Outside service consulted by a Workflow | Node definition keys in the current CLI-exported draft; do not reproduce config |
| Internal Dataset push | A Workflow explicitly writes a handoff row to another Dataset | Push to Dataset node and its explicit target Dataset ID in the current CLI-exported draft |
| Connection output Dataset | Dataset created by the connection for Workflow outputs and receipts | Connection output Dataset ID in Workbook inspect output |
| External coordinator/worker | Process outside the visible Freckle connection chain | Dated user-supplied documentation plus any safe CLI evidence; otherwise label unknown |

## Evidence Precedence

Use the most current direct evidence available:

1. Authenticated CLI inspection of the exact Workbook, Dataset, connection, source, or saved Workflow.
2. Current Workflow draft exported by the CLI and tied to the inspected saved revision.
3. Recent bounded CLI run status.
4. Current local source or architecture document with a proven relationship to the inspected object.
5. Historical artifact.
6. User statement.
7. Inference.

Do not let a lower-precedence intention override a higher-precedence current state. Record conflicts.

## Read-Only Inspection Pattern

Load the `freckle` skill and use only the authenticated Freckle CLI. Never use an internal database or call Freckle APIs directly.

Typical inspection sequence:

1. Resolve the exact target and pin its organization through the `freckle` skill.
2. Inspect the Workbook graph or saved Workflow identity.
3. Inventory Datasets, source kinds, connections, trigger policies, and input/output relationships.
4. Inspect each attached saved Workflow and export its current draft to the private task-specific temporary folder.
5. Extract only node families, graph edges, branch labels, and explicit Dataset destinations; never reproduce config or bindings.
6. Inspect bounded connection or Workflow run lists only when recent activation or health matters.
7. Compare user-supplied artifacts only after establishing their relationship to the CLI-inspected object.

Follow [cli-inspection.md](cli-inspection.md) for commands and safety boundaries. Never invoke a Workflow or run a Dataset row for explanation work.

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
- Workflow Push to Dataset creates a new row;
- integration node reads/enriches data but does not move the row;
- documented external coordinator polls, claims, or delivers;
- disabled writer describes an action but does not execute it.

## Common Traps

- A saved Workflow can exist without being connected anywhere.
- Publishing a Workflow revision does not make a connection automatic.
- A Workflow may push to a Dataset in addition to returning connection output.
- A receipt Dataset is not automatically the authoritative business table.
- An HTTP integration call is not a Dataset handoff.
- A failed node may prevent downstream branching; verify whether recovery occurs inside or outside the Workflow.
- A connection described as “future auto” is still manual until its inspected trigger policy says otherwise.
- “Writes disabled” in one adapter does not prove every external writer is disabled; inspect each visible boundary and label invisible ones unknown.
- A bounded run list proves only the inspected window, not all history.
- A CLI-exported draft proves configured Workflow structure, not whether a Workbook connection is automatic or recently active.
- Multiple Workflows can live in one system even when the UI emphasizes one Dataset or connection at a time.
- IDs prove identity; names explain meaning. Use both selectively.
