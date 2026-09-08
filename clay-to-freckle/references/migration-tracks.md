# Source tracks and destination shapes

The URL selects the extraction boundary, never the Freckle architecture.

## One Clay table (`t_…`)

Extract the starting table, discover its resolved live table reads and writes, and open a scope gate before analysis. Show all connected targets. When `route-row` or an equivalent action sends rows into downstream Clay tables that continue the same process, recommend bringing those tables into the same Freckle Workbook. Ask whether to include all, choose some, or keep them as explicit boundaries.

Only extract selected targets. Repeat discovery from newly included tables so the user sees the reachable system without silently widening scope. Ignore opaque table-like IDs found only in provider or CRM metadata.

Still perform the system-plan gate. A single table can become:

- one standalone Workflow;
- several meaningful stages in a Workbook;
- an embedded mapping or Dataset;
- a deferred adapter plus a core Workflow;
- no asset when it is obsolete or one-off.

## Clay workbook (`wb_…`)

Enumerate live tables and discover active `t_…` references. Confirm the analysis roster. Analyze all included tables before selecting destination shape.

Do not assume one Freckle Workbook, one asset per table, or preservation of table boundaries. The plan may consolidate duplicates, fold overflow tables into branches, embed small mappings, split reusable utilities, or exclude dead/Clay-native paths.

## Destination choice

Choose after table dispositions and the backward slice:

- `standalone_workflow` for one cohesive reusable capability;
- `chained_workbook` for several stages with meaningful contracts;
- `dataset_or_reference` for durable operator-owned data;
- `mixed` when a main chain and reusable utilities genuinely differ;
- `no_build` when nothing should be recreated.

Literal archival copying is an exception. Use it only when the user explicitly asks to preserve Clay structure or all columns, and label the cost and maintenance tradeoff before approval.
