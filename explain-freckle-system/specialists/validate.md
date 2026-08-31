# Validate Specialist

Prove that the explanation is accurate, complete, safe, and readable before delivery.

## Read

1. `system-explanation-journal.md`
2. [../references/system-explanation-journal.md](../references/system-explanation-journal.md)
3. [../references/quality-rubric.md](../references/quality-rubric.md)

Do not read the other specialists unless the orchestrator routes back after a failed gate.

## Sequence

1. Score the draft against every required quality dimension.
2. Verify that every live current-state claim came from the read-only database, not the Freckle CLI or product APIs.
3. Verify that each database query was tenant-scoped by the resolved `customer_id` and avoided forbidden secret-bearing or raw JSON fields.
4. Verify each current-state, automation, write, and fallback claim against the evidence ledger.
5. Compare every Mermaid arrow with the path model.
6. Confirm all important Datasets, Workflows, connections, and integrations are explained or intentionally omitted as immaterial.
7. Confirm Dataset roles are not conflated.
8. Confirm integration calls are not presented as row movement.
9. Confirm intended/future behavior is labeled.
10. Confirm no secret, raw payload, full draft, source config, connection mapping, projection JSON, or constant value appears.
11. Read once as a non-technical GTM operator:
   - Can they say where a row starts?
   - Can they say what makes it move?
   - Can they say what each Workflow owns?
   - Can they say where failures go?
   - Can they say what is automatic and what is off?
12. Update the journal with results and exact fixes.

## Validation Gate

All blocking rubric checks must pass. Route back to:

- `inspect` for missing or contradictory evidence;
- `trace` for broken path continuity;
- `explain` for clarity, hierarchy, or diagram problems.

## Exit Contract

1. Update `system-explanation-journal.md`.
2. Add `## Handoff` with current lane, completed work, recommended next lane, reason, exact artifacts to read, and one next action.
3. Recommend `complete` only after every blocking check passes.
4. Return to the orchestrator.
