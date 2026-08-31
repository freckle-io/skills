# Explain Specialist

Translate the proven execution model into a cohesive explanation for the recorded audience.

## Read

1. `system-explanation-journal.md`
2. [../references/system-explanation-journal.md](../references/system-explanation-journal.md)
3. [../references/explanation-framework.md](../references/explanation-framework.md)
4. [../references/output-layout.md](../references/output-layout.md)

Do not read the other specialists.

## Sequence

1. Open with the building-block mental model from `output-layout.md`.
2. Explain that a Workflow does not watch a Dataset by itself; the connection controls row movement and trigger behavior.
3. Add `## The normal path` and draw a complete, readable Mermaid diagram.
4. Add numbered `###` sections for the important Datasets and Workflows in execution order. For each stage, explain:
   - what arrives;
   - what the Workflow decides or learns;
   - which integrations it consults;
   - which Dataset receives the result;
   - why that handoff exists.
5. Use bullets inside a stage when listing sources, inputs, integrations, decisions, or branch destinations. Do not collapse the guided tour into one paragraph or one generic numbered list.
6. Add `## What the final Datasets mean` with a compact Dataset-role table.
7. Add `## The fallback path` with its own Mermaid diagram and bounded retry explanation when fallback is material. Omit the section only when inspection proves there is no fallback.
8. Add `## How integrations fit in` with a table distinguishing reads, enrichment, writes, and current behavior.
9. End with `## What becomes automatic later` when a cutover exists; otherwise use `## Current operating state`. State automatic, manual, disabled, undeployed, and future behavior explicitly.
10. Use names first and IDs selectively.
11. Put caveats next to the affected claim, not in a vague disclaimer.
12. Save a document only if requested; otherwise place the draft in the journal and hand off to validation.

## Style Gate

The explanation must read like a guided system tour for a GTM operator, not a code review, object dump, executive summary, or generic documentation template. Preserve the required section order even when a shorter answer would be possible.

## Exit Contract

1. Update `system-explanation-journal.md` with the draft outline or draft answer.
2. Add `## Handoff` with current lane, completed work, recommended next lane, reason, exact artifacts to read, and one next action.
3. Recommend `validate`.
4. Return to the orchestrator.
