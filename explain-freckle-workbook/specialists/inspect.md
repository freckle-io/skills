# Inspect Specialist

Inventory the actual Freckle system without changing it.

## Read

1. `system-explanation-journal.md`
2. [../references/system-explanation-journal.md](../references/system-explanation-journal.md)
3. [../references/freckle-object-model.md](../references/freckle-object-model.md)
4. [../references/cli-inspection.md](../references/cli-inspection.md)
5. The `freckle` skill

Do not read the other specialists.

## Sequence

1. Resolve the named Workbook, Workflow, URL, ID, or local artifact. Do not invent a target.
2. Record evidence source, inspection time, and authority:
   - authenticated Freckle CLI inspection;
   - current local artifact tied to the inspected object;
   - historical document;
   - user statement.
3. Inventory:
   - Workbook;
   - Datasets and safe source kinds;
   - connections and trigger policies;
   - saved Workflows and current revisions;
   - Workflow inputs, outputs, node families, internal Dataset pushes, and external integrations;
   - bounded recent run/activation state when relevant;
   - disabled writer or safety controls visible through the CLI or a dated artifact.
4. Use only authenticated `freckle` CLI inspection commands selected through the `freckle` skill. Never query an internal database or call Freckle APIs directly.
5. Resolve and pin the target organization before running org-scoped commands.
6. Direct raw CLI inspection output to a task-specific temporary folder with owner-only permissions outside the repository, inspect only targeted safe fields, and remove the folder when the explanation is complete. Never dump complete CLI output into chat or the journal.
7. Inspect a Workbook with `workbook inspect`; inspect each attached saved Workflow with `workflow saved inspect` and a task-local `workflow saved get-draft` export.
8. Use the exported draft only for safe structural evidence. Never put credentials, constants, mappings, prompts, URLs, config, bindings, or the full draft in the journal or response.
9. Inspect Dataset sources only when their mechanism matters, and never reproduce webhook endpoint URLs.
10. Use bounded connection or Workflow run lists only when activation or recent health matters. Never invoke, trigger, retry, or run anything to gather evidence.
11. Record CLI visibility gaps, unknowns, and contradictions. Do not turn intended architecture into current-state fact.
12. Update the journal inventory, evidence ledger, integrations, state table, and handoff.

## Inspection Gate

Do not exit to tracing until the exact target and organization are resolved, and each visible connection has an input Dataset, output Dataset, saved Workflow, and trigger policy—or is clearly labeled unresolved. Every live fact must trace to an authenticated CLI command.

## Exit Contract

1. Update `system-explanation-journal.md`.
2. Add `## Handoff` with current lane, completed work, recommended next lane, reason, exact artifacts to read, and one next action.
3. Recommend `trace` when the inventory is sufficient, or `blocked` when the target cannot be established.
4. Return to the orchestrator.
