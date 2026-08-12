# Migration tracks

Choose exactly one track from the URL. Shared mechanics do not erase the boundary between them.

## Workbook track (`wb_…` only)

Use when the user asks to migrate a Clay Workbook.

1. Enumerate and confirm the table roster.
2. Extract full configuration plus three rows for every included table.
3. Resolve live cross-table references and offer optional dependency expansion.
4. Prepare table artifacts independently; use bounded translation workers for logic tables.
5. Group repeated capabilities with `plan-primitive-families.js`.
6. Have `/freckle` choose one implementation contract per unique family.
7. Review the full Workbook once.
8. Create one shared Freckle Workbook, then build independent assets in bounded parallel workers.
9. Serialize shared Workbook creation, cross-table wiring, and any conflicting mutation.
10. Announce that everything is built with the clickable Workbook URL.
11. Replay the same three inputs in dependency waves, parallel within a safe wave.
12. Present one consolidated comparison and one Workbook-level historical-data choice.

## Individual-table track (`t_…` only)

Use when the user asks to migrate one table.

1. Extract that table's full configuration plus three rows.
2. Prepare its preview/replay artifacts and provider-neutral intent brief.
3. Review once.
4. Ask `/freckle` to plan and build the table directly.
5. Announce that it is built with its clickable Freckle URL.
6. Replay the same three inputs and compare results.
7. Offer optional historical-data migration for that table.

Explicitly skip roster enumeration, dependency expansion, primitive-family grouping, shared-Workbook scheduling, cross-table wiring, and dependency-wave coordination. A live external reference is documented as a boundary unless the user expands scope.

## Shared lessons

Both tracks use:

- three rows, not hundreds, for the initial build and preview;
- complete Clay configuration and verbatim logic extraction;
- Clay capability intent with Freckle-owned implementation choice;
- separate historical preview and isolated replay fixtures;
- the same original inputs for Clay/Freckle comparison;
- side-effect-safe tests;
- explicit optional historical data migration after validation.
