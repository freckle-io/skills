# Prepare Workbook coordinator

Workbook track only. Do not use this coordinator for an individual table and do not invoke Freckle mutations here.

1. Require a resolved roster and dependency-expansion decision.
2. Run `scripts/init-build-context.js $JOURNAL` and `scripts/prepare-table.js <table-dir> <workbook.json>` for every included table. Jobs may run concurrently because output directories do not overlap.
3. Pure-data tables complete deterministically. Spawn bounded translation workers only for `needs_agent` logic tables, following [../references/subagent-contracts.md](../references/subagent-contracts.md).
4. Validate and collect each `prepare-result.json`; retry only failures.
5. Run `scripts/plan-primitive-families.js $JOURNAL`. The output groups repeated capability intent but never selects Freckle implementations.
6. Ask the current `/freckle` skill to resolve each unique family once and record a compact primitive plan for review. Do not independently research replacements or workarounds.
7. Generate `workbook-review.md`. Present a scannable table map, capability plan, live links, boundaries, and artifact link in a normal assistant message.
8. Ask separately: `Approve the workbook build?` Approval freezes every brief and primitive-plan hash.

Progress messages show aggregate counts and changed blockers only. Never relay raw worker logs, records, token commentary, or estimates.

## Exit contract

Return the prepared result paths, `primitive-families.json`, primitive-plan artifact, and review path to the root orchestrator, then stop. The root presents and records approval.
