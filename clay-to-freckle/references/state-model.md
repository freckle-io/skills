# Structured state and approval

`$JOURNAL/state.json` is the sole authority for one isolated run. `state.md` is generated. Only the root orchestrator mutates shared state.

## Run identity

1. A normal URL invocation starts with `new-run.js`. Never inspect old journals first.
2. Resume only when the user explicitly says to resume and identifies the exact run path. Then reconcile and read status.
3. Dependency discovery and its human scope decision apply to table and workbook entry points. Included connected tables join the same journal; declines remain recorded boundaries.
4. Every mutating state call uses the current revision. On mismatch, reconcile and retry.

## Gates

The normal phases are:

`extract → dependency resolution → source preparation → system planning → human review → destination build → replay/branch tests → cleanup → omission review when needed → historical-data decision`

System planning applies to table and workbook sources. `record-primitive-plan` is the backward-compatible command that records `system-plan.json`; it is not limited to workbooks.

Preparation results prove that source evidence is complete. They do not authorize one destination asset per table. The approval gate binds:

- every included table's completed brief hash;
- the exact `system-plan.json` hash;
- table dispositions, declared stage dependencies, intended outcomes, and meaningful changes in that plan.

If a brief or system plan changes, reconcile revokes approval. Never build against an unapproved replacement plan.

New/revised plans require version 3 outcome contracts. A revised plan invalidates build/replay accounting; reconcile compatible assets and explicitly carry forward only evidence that still applies. Previously approved version-2 plans remain readable without rewriting their history.

## Omission decision after replay

Version-3 plans with nonempty `changes` set `gates.omissionReview` to `pending`. After replay, present the actual omissions and offer restoration. Record the reply using `state.js record-omission-review $JOURNAL <decision.json> <revision>`:

```json
{"systemPlanSha256": "approved plan hash", "decision": "keep", "restoreIds": [], "userResponse": "Keep the result as shown"}
```

Use `decision: "restore"` with selected change IDs in `restoreIds` when restoration is requested. This returns the run to planning; revise the contract, obtain approval for material changes, rebuild and retest affected behavior. `keep` resolves the gate for that exact plan. Empty `changes` needs no extra question. The generic state patch cannot resolve this gate. Historical backfill and completion wait for the decision.

## External mutations

The coordinator creates or reconciles shared assets, freezes asset IDs, and owns cross-stage wiring. If parallel workers are used, assign them by destination asset—not by Clay table—and ensure no two workers own the same Workflow, Dataset, or edge.

Before any create/import/publish/append:

- reconcile recorded asset IDs with Freckle;
- reuse only when the current input/output contract is compatible;
- record ID, revision, and plan hash immediately after success;
- treat an unchanged recorded content hash as a no-op;
- never repeat an import chunk already present in the ledger.

A crash after an external success routes to reconciliation, not blind recreation.

## Local artifacts

Full source evidence remains local. Write completed artifacts temp → validate → atomic rename. Do not regenerate a partially completed brief unless its extract changed deliberately.

Historical import uses a separately approved lean manifest. It is never inferred from all Clay columns. `Clay Record ID` may be included as import provenance/idempotency for that backfill without becoming part of the live source contract.
