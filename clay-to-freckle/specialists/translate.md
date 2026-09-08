# Translate source evidence

Own one table directory. Complete a compact provider-neutral source brief. Do not invoke Freckle, decide the run-level architecture, or mutate shared state.

## Input boundary

Read `digest.md`, the `brief.md` skeleton, and read-only roster/decision context. Do not stream the full extract into context. Use targeted `jq` or Node queries against `extract.json` only for a named ambiguity in a potentially surviving capability.

## Sequence

1. Run `prepare-table.js`; every table, including pure data, requires semantic classification.
2. Fill only the marked slots in `brief.md`.
3. Describe the business role, capability primitives, important conditions, likely source inputs, business outcomes, disposition evidence, and real boundaries.
4. Treat provider names as evidence of what Clay did, not as Freckle recommendations.
5. For pure reference data, explain its consumer and change cadence so the coordinator can choose `embed`, Dataset, or `exclude`.
6. Do not preserve every column. Mention internal/provider/debug fields only when they create a risk or are consumed downstream.
7. Finish when no FILL markers remain and rerun `prepare-table.js` to validate and write `prepare-result.json`.

## Return contract

Return only `Prepared <table-id>: <kind>, result <absolute path>.` Exclude row values, prompts, and brief content.
