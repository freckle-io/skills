# Explain Freckle System

Inspect an existing Freckle Workbook, saved Workflow, or multi-workflow system through the authenticated Freckle CLI, then explain how its Datasets, connections, sources, integrations, branches, fallbacks, and activation state fit together.

The skill is evidence-first and read-only. It produces a guided system tour for GTM operators rather than a CLI dump or architecture guess.

## Requirements

- A Freckle account with access to the system being explained
- The [Freckle CLI](https://install.freckle.dev)
- The `freckle` skill, invoked as `/freckle` in Claude Code or `$freckle` in Codex, with CLI authentication completed through that skill

The public skill does not require database access, a VPN, or any internal Freckle tooling.

## Install

Clone the public skills repository and copy this folder into your agent's skill directory.

### Codex

```bash
git clone https://github.com/freckle-io/skills.git
cp -R skills/explain-freckle-system ~/.codex/skills/
```

Then ask Codex:

```text
Use $explain-freckle-system to inspect this Freckle Workbook and explain how everything fits together: <Workbook URL>
```

### Claude Code

```bash
git clone https://github.com/freckle-io/skills.git
cp -R skills/explain-freckle-system ~/.claude/skills/
```

Then invoke the skill with a Workbook URL, Workflow URL, or exact ID.

## Safety boundaries

- Uses authenticated Freckle CLI inspection commands through the `freckle` skill.
- Never queries an internal database or calls Freckle APIs directly.
- Never creates, edits, publishes, invokes, triggers, retries, archives, rotates, or deletes anything.
- Never exposes tokens, credential IDs, webhook endpoints, constant values, full mappings, raw entries, or full Workflow drafts.
- Separates CLI-inspected facts, documented intention, and inference.

The executable instructions live in [`SKILL.md`](SKILL.md). The read-only command boundary lives in [`references/cli-inspection.md`](references/cli-inspection.md), and the files under [`specialists/`](specialists/) define the inspection, tracing, explanation, and validation stages.
