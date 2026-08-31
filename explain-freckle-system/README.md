# Explain Freckle System

Inspect a live Freckle Workbook, saved Workflow, or multi-workflow system through the read-only Postgres database, then explain how its Datasets, connections, integrations, branches, fallbacks, and activation state fit together.

The skill is evidence-first and read-only. It produces a guided system tour for GTM operators rather than a database dump or architecture guess.

## Who can use it

This skill is intended for Freckle team members who already have:

- access to the read-only Freckle Postgres connection;
- the local `db-query` skill that provides that connection; and
- OpenVPN access when the database requires it.

This public repository contains no database credentials and does not grant database access.

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

- Uses tenant-scoped `SELECT` queries only.
- Never calls the Freckle CLI or product APIs as a fallback.
- Never runs Workflows or pending Dataset rows.
- Never retrieves credentials, secret-bearing configuration, raw payloads, full connection mappings, or full Workflow drafts.
- Separates inspected facts, documented intention, and inference.

The executable instructions live in [`SKILL.md`](SKILL.md). Safe query patterns live in [`references/database-inspection.md`](references/database-inspection.md), and the files under [`specialists/`](specialists/) define the inspection, tracing, explanation, and validation stages.
