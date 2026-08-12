# Individual-table builder

Own the lean `t_…` build path. Read the approved brief, import plan, replay fixture, and the current `/freckle` skill.

1. Ask `/freckle` for the current primitives that satisfy the intent contract. Clay translation must not prescribe nodes/providers.
2. Reconcile stable asset identity, then create/update the table's Dataset(s) and Workflow idempotently.
3. Import only the three-row historical preview during the initial build. Do not execute it through the workflow.
4. Do not use Workbook roster, dependency-expansion, primitive-family, or dependency-wave machinery.
5. Record asset IDs, URLs, revisions, and plan hashes in `build-result.json`.
6. After the asset exists, tell the user everything is built and testing is underway with `https://next.freckle.io/tools/<verified-workflow-id>`. Never emit `app.freckle.io`.
7. Hand off to `replay-test.md`; do not perform replay while still building.

External active table references remain documented boundaries unless the user explicitly expands scope.

## Exit contract

Write `build-result.json`, return its absolute path and compact status to the root orchestrator, and stop. Recommend replay testing but do not enter it directly.
