# Legacy handoff router

Older journals may point here. Route them without rebuilding completed assets:

- Individual table: [build-table.md](build-table.md)
- Workbook: [build-workbook.md](build-workbook.md)
- Post-build validation: [replay-test.md](replay-test.md)

The initial import is the three-row historical preview only. Replay uses separate isolated fixtures. If the user later approves historical data migration, import by `Clay Record ID` set difference and idempotent upsert; do not execute historical rows through the Workflow.
