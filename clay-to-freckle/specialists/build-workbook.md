# Destination-graph builder

Use after approval for every destination shape, whether the source was one table or a workbook.

1. Read the approved `system-plan.json`, its bound hash, build context, and current `/freckle` instructions. Do not infer assets from the Clay roster.
2. Revalidate current Freckle primitives and every proposed reuse contract. If a material contract changes, update the plan and return to human approval.
3. Reconcile stable destination identities, then create only the assets named in the plan. A `no_build` plan completes without mutations.
4. Build in destination dependency order. Parallelize only distinct assets with explicit ownership. The coordinator owns shared Workbook creation and final wiring.
5. Verify each stage's inputs against its declared immediate dependencies and reconcile the resulting connection mappings. Check outcome fields, row meaning, branch endings, and external action mappings against the approved plan. Clone a reusable Workflow when its contract cannot be safely changed in place.
6. Keep external writes and sends disabled until the plan's live gate is satisfied. Implement unsupported listeners or approval surfaces only when explicitly in scope; otherwise preserve the documented adapter boundary.
7. Do not import historical preview rows during build. Create only the minimum isolated fixtures needed for replay.
8. Record asset IDs, URLs, revisions, contracts, plan hash, and temporary-asset ledger in build results. Reconcile final wiring before testing.
9. When all approved assets exist, tell the user: **Everything is built and testing is underway:** followed by the verified `https://next.freckle.io/workbooks/<id>` or `https://next.freckle.io/tools/<id>` URL.

## Exit contract

Return the build result paths and verified primary URL. Recommend replay testing but do not enter it directly.
