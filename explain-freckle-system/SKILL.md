---
name: explain-freckle-system
description: Inspect the live Freckle v2 system through the read-only Postgres database and explain real Workbooks, saved Workflows, Datasets, connections, sources, integrations, retries, fallbacks, writer boundaries, and activation state in clear GTM language. Use when a user asks for a walkthrough, diagram, architecture explanation, operating guide, system map, current-state/future-state comparison, or “how everything fits together” explanation of a Freckle workflow or multi-workflow system.
---

# Explain Freckle System

Act as the orchestrator for a read-only, evidence-first system explanation. Keep the top-level context small and route through one specialist at a time.

## First Move

1. Create or resume `system-explanation-journal.md` using [references/system-explanation-journal.md](references/system-explanation-journal.md). Store it in a task-specific folder in the current workspace.
2. Load the `db-query` skill and [references/database-inspection.md](references/database-inspection.md).
3. Record the target, audience, available evidence, and runtime. Default the audience to a non-technical GTM operator.
4. Route to [specialists/inspect.md](specialists/inspect.md).
5. After inspection, route to [specialists/trace.md](specialists/trace.md).
6. After the path model is complete, route to [specialists/explain.md](specialists/explain.md).
7. Before answering, route to [specialists/validate.md](specialists/validate.md).

If the task resumes after compaction, read the task journal first and follow its current `## Handoff`.

## Lane Table

| Need | Specialist |
|---|---|
| Inventory the real Workbook, Datasets, connections, Workflows, integrations, and state | [specialists/inspect.md](specialists/inspect.md) |
| Trace normal, bypass, fallback, terminal, and writer paths | [specialists/trace.md](specialists/trace.md) |
| Translate the proven model into a clear GTM explanation | [specialists/explain.md](specialists/explain.md) |
| Check evidence, continuity, terminology, diagrams, and readability | [specialists/validate.md](specialists/validate.md) |

## Orchestration Contract

- The orchestrator owns target resolution, lane selection, evidence status, contradiction handling, and final synthesis.
- Each specialist must read the journal before its own named references.
- Keep the active working set to this file, the journal, one specialist, and that specialist's references.
- Each specialist must update the journal and finish with a compact `## Handoff`.
- Specialists recommend a next lane; only the orchestrator selects it.
- Use user-supplied artifacts when live inspection is unavailable, but label their date and authority.
- Answer in chat unless the user explicitly requests a saved document.
- Treat [references/output-layout.md](references/output-layout.md) as the required final-answer shape. Do not compress the explanation into an executive summary when the inspected system has multiple material stages.

## Hard Rules

- Stay read-only. Never create, edit, publish, run, trigger, archive, rotate, or mutate a Freckle object or external system.
- Use the read-only Postgres database as the only live Freckle inspection surface. Never call the `freckle` CLI or Freckle product APIs for this skill, including list, inspect, source, connection, Workflow, and run commands.
- Run only `SELECT` queries through the connection described by the `db-query` skill. If the database is unavailable, report the database/VPN blocker; do not fall back to the CLI.
- Never run pending rows or invoke a saved Workflow merely to understand it.
- Never print connection constant values, credentials, tokens, secrets, webhook URLs, or private integration payloads.
- Never select or display credential-store rows, secret tables, raw source configs, full connection mappings, full Workflow drafts, raw webhook payload rows, or unfiltered JSON blobs.
- Never infer automation from a Workflow definition alone. A connection or source determines whether rows run.
- Never confuse a saved Workflow with a Workbook connection, or a connection receipt Dataset with durable business state.
- Distinguish `inspected fact`, `documented intention`, and `inference`.
- Distinguish `automatic now`, `manual now`, `disabled`, `undeployed`, and `future automatic`.
- Every diagram arrow must resolve to inspected evidence or be explicitly labeled as future/intended.
- Use business names first. Include IDs only when they help verification or disambiguation.
- If artifacts conflict, explain the conflict; do not silently choose the cleaner story.

## References

- [references/system-explanation-journal.md](references/system-explanation-journal.md): durable evidence and handoff template.
- [references/database-inspection.md](references/database-inspection.md): mandatory read-only Postgres inspection sequence and safe query patterns.
- [references/freckle-object-model.md](references/freckle-object-model.md): object definitions, inspection rules, and topology traps.
- [references/explanation-framework.md](references/explanation-framework.md): information hierarchy, visual patterns, and output contract.
- [references/output-layout.md](references/output-layout.md): required final-answer structure and section template.
- [references/quality-rubric.md](references/quality-rubric.md): final evidence, accuracy, safety, and readability gate.

## Inspection Source

Use the v2 tables documented in [references/database-inspection.md](references/database-inspection.md). Treat current rows from the read-only database as live authority, subject to the projection-table and ingestion-lag caveats recorded there.
