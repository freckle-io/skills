# Workbook builder

Own the `wb_…` build phase after approval. Read all approved briefs, `build-context.json`, `primitive-families.json`, table preparation results, and the current `/freckle` skill.

1. Ask `/freckle` to resolve each unique capability family once. Record the selected current Freckle primitives and contracts in shared build context. Clay artifacts provide intent and provider semantics only.
2. One coordinator creates/reconciles the shared Freckle Workbook and freezes its ID before table workers begin.
3. Derive build waves from cross-table dependencies and shared-resource conflicts.
4. Run bounded parallel builders for independent tables/family assets. Each worker owns distinct Freckle assets and writes only its table's `build-result.json`; it never edits shared state or another result.
5. Keep shared Workbook creation, conflicting shared mutations, and final cross-table wiring in the coordinator lane.
6. Import only each table's three-row historical preview. Do not run workflows during the build phase.
7. Reconcile every result and complete final wiring. Retry only failed tables; never duplicate completed assets.
8. When every approved asset is built, tell the user: **Everything is built and testing is underway:** with `https://next.freckle.io/workbooks/<verified-workbook-id>`. Construct it from the ID; never echo an `app.freckle.io` host.
9. Only then start coordinated replay tests.

Parallelism is bounded by runtime slots and Freckle mutation safety, normally two or three independent builders. One slow provider investigation must not block unrelated table builds.

## Exit contract

Ensure every table has a scoped `build-result.json`, return the Workbook URL plus compact aggregate status to the root orchestrator, and stop. Recommend replay testing but do not enter it directly.
