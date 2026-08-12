# Freckle skills

Agent skills for [Freckle](https://freckle.io) — install them into Claude Code
or Codex and they teach your coding agent a complete Freckle workflow.

| Skill | What it does |
|---|---|
| [clay-to-freckle](clay-to-freckle/) | Migrate a Clay table or Workbook into Freckle, including logic, testing, and optional historical data. |
| [share-freckle-workbook](share-freckle-workbook/) | Turn any Freckle workflow into a single shareable LinkedIn image — a consolidated DAG on a product-canvas card with outcome stats and attribution. |

## Installing a skill

```bash
git clone https://github.com/freckle-io/skills.git
cp -R skills/<skill-name> ~/.claude/skills/   # Claude Code
cp -R skills/<skill-name> ~/.codex/skills/    # Codex
```

Each skill's README covers its own requirements and first-run setup.
