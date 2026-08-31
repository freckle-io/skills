# System Explanation Journal

Sections: task template, evidence inventory, path/state model, draft, validation, and handoff.

Create this file in a task-specific folder in the current workspace. Keep it compact and current; do not store secrets or raw connection mappings.

```markdown
# Freckle System Explanation Journal

Updated: <ISO timestamp>
Lane: <orchestrator | inspect | trace | explain | validate | complete | blocked>
Status: <working | blocked | complete>
Runtime: <codex | claude | other>

## Target

- Workbook/Workflow/system:
- Organization:
- Audience:
- User's question:
- Explanation scope:

## Evidence Ledger

| Claim area | Source | Inspected at | Authority | Notes |
|---|---|---|---|---|
| Workbook topology | | | live-db/local/historical/user | |

## Object Inventory

### Datasets

| Name | ID | Role | Sources | Current state | Evidence |
|---|---|---|---|---|---|

### Connections

| ID | Input Dataset | Workflow | Output Dataset | Trigger policy | Evidence |
|---|---|---|---|---|---|

### Workflows

| Name | ID/revision | Responsibility | Inputs/outputs | Integration families | Evidence |
|---|---|---|---|---|---|

### Integrations

| Integration | Called by | Purpose | Read/enrich/write | Current safety state |
|---|---|---|---|---|

## Path Model

### Normal

1. <source> --<mechanism>--> <object>

### Bypasses

- Condition:
- Path:
- Rejoin/terminal:

### Recovery / Fallback

- Trigger:
- Coordinator:
- Path:
- Retry bound:
- Rejoin/terminal:

### Downstream Writers

- Planned action:
- Adapter/worker:
- Current state:

## State Matrix

| Component | Automatic now | Manual now | Disabled/undeployed | Intended later | Evidence |
|---|---:|---:|---:|---|---|

## Contradictions And Unknowns

- None.

## Draft Explanation

<Outline or full draft.>

## Validation

| Check | Pass/fail | Evidence/fix |
|---|---|---|

## Handoff

Current lane:
Completed work:
Recommended next lane:
Reason:
Artifacts to read:
One next action:
```

Every lane must update `## Handoff`. The next lane should be able to continue from this file without the full conversation.
