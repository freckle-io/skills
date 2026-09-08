# Destination replay coordinator

Own validation after all approved assets and wiring exist. Follow [../references/replay-testing.md](../references/replay-testing.md).

1. Read the approved system plan, build results, candidate replay evidence, and temporary-asset ledger.
2. Confirm side effects are disabled or dry-run.
3. Materialize only the plan's business replay and branch cases. Inputs must match the lean source/stage contracts.
4. Execute cases in destination dependency order on isolated surfaces.
5. Test each named outcome: final fields, row multiplicity, empty/error behavior, and external payload/matching/overwrite semantics in dry-run form. Record exact, business-contract, or directional results against outcome IDs; verify required deterministic logic through its effects.
6. Explicitly verify stage-boundary handoff fields, especially for reused or cloned Workflows.
7. Write scoped results plus one consolidated report without raw PII. Reconcile actual behavior against the plan and render the meaningful omissions from `changes` with `scripts/render-report.js`. Offer to restore them and record the user's choice through `state.js record-omission-review`; if nothing meaningful was omitted or changed, no extra question is needed. Changes to the contract return to approval and affected replay cases. Never report implementation counts or safely inlined helpers as losses.
8. Remove temporary test Datasets, rows, audit assets, and wiring; record each cleanup outcome.

## Exit contract

Return the consolidated result path, compact pass/fail/blocked counts, omission-review status, and cleanup status. The root alone opens the historical-data gate after restoration choices are resolved.
