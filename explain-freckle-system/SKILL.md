---
name: explain-freckle-system
description: Inspect an existing Freckle Workbook, saved Workflow, or multi-workflow system through the authenticated Freckle CLI and explain its Datasets, connections, sources, integrations, execution paths, fallbacks, and operating state in clear GTM language. Use for walkthroughs, diagrams, architecture explanations, operating guides, system maps, current-state/future-state comparisons, or “how everything fits together” explanations. This public skill requires the freckle skill and never uses internal databases or APIs.
---

# Explain Freckle System

Orchestrate a read-only, evidence-first system explanation. Use the public `freckle` skill (`/freckle` in Claude Code or `$freckle` in Codex) as the only route to live Freckle inspection.

## First Move

1. Create or resume `system-explanation-journal.md` using [references/system-explanation-journal.md](references/system-explanation-journal.md). Store it in a task-specific folder in the current workspace.
2. Load the `freckle` skill and [references/cli-inspection.md](references/cli-inspection.md) before running any `freckle` command.
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
- Use user-supplied artifacts when CLI inspection is unavailable, but label their date and authority.
- Answer in chat unless the user explicitly requests a saved document.
- Treat [references/output-layout.md](references/output-layout.md) as the required final-answer shape. Do not compress the explanation into an executive summary when the inspected system has multiple material stages.

## Hard Rules

- Stay read-only. Never create, edit, publish, invoke, run, trigger, retry, archive, rotate, delete, or otherwise mutate a Freckle object or external system.
- For live Freckle facts, use only authenticated `freckle` CLI inspection commands selected through the `freckle` skill. Never query an internal database, call Freckle HTTP APIs directly, or use internal services.
- Resolve and pin the target organization according to the `freckle` skill before running org-scoped inspection commands.
- Never run pending rows or invoke a saved Workflow merely to understand it.
- Never print tokens, credential IDs, connection constant values, webhook endpoint URLs, full input mappings, raw entry values, raw run inputs or outputs, full Workflow drafts, or private integration payloads.
- An exported Workflow draft is a local inspection artifact. Extract only node families, graph structure, branch labels, and explicit Dataset destinations needed for the explanation; do not reproduce configuration or bindings.
- Never infer automation from a Workflow definition alone. A Workbook connection and its trigger policy determine whether Dataset rows run automatically.
- Never confuse a saved Workflow with a Workbook connection, or a connection output Dataset with durable business state.
- Distinguish `CLI-inspected fact`, `documented intention`, and `inference`.
- Distinguish `automatic now`, `manual now`, `disabled`, `undeployed`, and `future automatic`.
- Every diagram arrow must resolve to CLI-inspected evidence or be explicitly labeled as documented, future, or inferred.
- Use business names first. Include IDs only when they help verification or disambiguation.
- If the CLI does not expose a fact, label it unknown or use a dated user-supplied artifact. Do not reach for an internal inspection surface.
- If artifacts conflict, explain the conflict; do not silently choose the cleaner story.

## References

- [references/system-explanation-journal.md](references/system-explanation-journal.md): durable evidence and handoff template.
- [references/cli-inspection.md](references/cli-inspection.md): mandatory Freckle CLI inspection sequence and safe command boundary.
- [references/freckle-object-model.md](references/freckle-object-model.md): object definitions, inspection rules, and topology traps.
- [references/explanation-framework.md](references/explanation-framework.md): information hierarchy, visual patterns, and output contract.
- [references/output-layout.md](references/output-layout.md): required final-answer structure and section template.
- [references/quality-rubric.md](references/quality-rubric.md): final evidence, accuracy, safety, and readability gate.

## Inspection Source

Treat current output from the authenticated Freckle CLI as live authority for facts it exposes. Record CLI visibility gaps instead of filling them with database access or unsupported assumptions.
