# System preparation coordinator

Use for both table and workbook sources. It prepares evidence and the human-gated destination plan; it does not mutate Freckle.

1. Require completed extraction and resolved reference decisions. Workbook sources also require a confirmed initial roster. A table-source run may already contain user-approved connected tables.
2. Run `scripts/init-build-context.js $JOURNAL` and `scripts/prepare-table.js <table-dir> [workbook.json]` for every included table. A table source uses the journal root as its table directory.
3. Complete unresolved `brief.md` slots with [translate.md](translate.md). Full `extract.json` stays local; inspect only targeted configuration needed to understand business behavior.
4. Collect every preparation result, then run `scripts/plan-primitive-families.js $JOURNAL`. Use its similarity and dependency evidence to detect duplicates and shared capabilities; it does not decide dispositions.
5. Write one compact `system-plan.json` following [../references/brief-format.md](../references/brief-format.md). First inspect candidate human-facing results and external action mappings; define each path's outcome, required fields, row meaning, conditions, and empty/error behavior. Then trace data and control dependencies backward across included tables, inline needed helpers, and drop unreachable logic. Give every analyzed table one disposition and record meaningful omissions or changes with evidence, including uncertain human use.
6. Invoke the current `/freckle` skill to resolve only surviving capabilities. Record implementation mappings and verified reuse contracts in the system plan; do not build yet.
7. Record the plan with `state.js record-primitive-plan`, render `workbook-review.md`, and present table decisions, the actual graph, final results/actions, meaningful changes, risks, and tests. Judge preserved capabilities by business contract. Never compare provider or step counts.
8. Ask separately: `Approve this Freckle build plan?` Approval freezes the brief and system-plan hashes.

Keep progress aggregate. Never relay raw records, prompts, action envelopes, token commentary, or full column inventories.

## Exit contract

Return the preparation-result paths, `system-evidence.json`, `system-plan.json`, and review path to the root orchestrator, then stop.
