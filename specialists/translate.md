# Translate Table Worker

Own one table directory. Convert its extracted Clay logic into a completed intent brief. Do not invoke Freckle or mutate shared state.

## Input boundary

Read only:

- the assigned table's `digest.md`, brief skeleton, and import plan;
- `journal/workbook.json` for sibling-name resolution;
- the table's read-only state entry and shared decision context;
- [../references/brief-format.md](../references/brief-format.md).

Never read the whole `extract.json`. Use targeted `jq`/Node queries only for a named ambiguity. Never read another table's data or write outside the assigned directory.

## Sequence

1. Run `node <skill>/scripts/prepare-table.js <table-dir> <workbook.json>`. If it returns `pure_data/done`, stop; the deterministic fast path has completed the table.
2. Read `digest.md`, then edit only the `<!-- FILL: … -->` slots in `brief.md`. Do not retype injected prompts/formulas or regenerate the skeleton.
3. Describe Clay actions as capability intent, provider semantics, bound inputs, outputs, dependencies, conditions, acceptance criteria, historical preservation, and future-row behavior. A provider name explains what Clay did; it is not a Freckle implementation recommendation. Do not choose, rank, or research Freckle nodes/providers/workarounds; `/freckle` remains the implementation authority.
4. Preserve every column. `Clay Record ID` is the stable import/upsert key. The three preview rows use `Imported from Clay = true`. Separate replay fixtures use the same source inputs, omit generated outputs, and set the marker false so future logic runs in isolation.
5. Resolve in-roster cross-table references as wireable shared-Workbook intent. Put external/excluded references in “What doesn't come over.”
6. Finish only when no FILL markers remain. Rerun `prepare-table.js`; it validates preview, replay, and import artifacts and writes the final `prepare-result.json`.

## Return contract

Return only: `Prepared <table-id>: <kind>, result <absolute prepare-result.json path>.` Keep the response under 2 KB and exclude row values, prompts, and brief content. Never edit `state.json` or `state.md`; the orchestrator collects the result.
