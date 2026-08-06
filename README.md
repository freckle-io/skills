# Clay to Freckle

Move a Clay table or Workbook into Freckle without rebuilding the enrichment logic by hand.

This skill reads the table structure, formulas, prompts, enrichment steps, conditions, and sample results from Clay. It then works with the Freckle skill to build the equivalent datasets and workflows, test them against the same inputs, and give you the option to bring over the rest of the historical data.

It works in both Codex and Claude Code.

## What it can migrate

- One Clay table into a Freckle workflow
- A full Clay Workbook into one Freckle Workbook
- Formulas, prompts, waterfalls, run conditions, and enrichment intent
- Existing columns and historical values
- Live references to other Clay tables, when you choose to include them
- Pure data tables that have no enrichment logic

Clay's separate Workflows product, identified by `wf_...` URLs, is outside the current scope.

## How to use it

Install the repository as a personal skill for your agent.

### Codex

```bash
git clone git@github.com:freckle-io/clay-to-freckle.git ~/.codex/skills/clay-to-freckle
```

Then paste a Clay table or Workbook URL into Codex:

```text
Use $clay-to-freckle to migrate this into Freckle:
https://app.clay.com/workspaces/.../workbooks/wb_...
```

### Claude Code

```bash
git clone git@github.com:freckle-io/clay-to-freckle.git ~/.claude/skills/clay-to-freckle
```

Then run:

```text
/clay-to-freckle https://app.clay.com/workspaces/.../tables/t_.../views/gv_...
```

You stay in one conversation. The skill may use sub-agents for table preparation, building, and testing, but you do not need to manage them.

## What happens during a migration

1. **Read the Clay setup.** The skill uses your signed-in Clay session to extract the complete configuration and three representative rows from each table.
2. **Map the logic.** It translates the Clay setup into the business capability Freckle needs to reproduce. Freckle chooses the current provider or primitive that fits the job.
3. **Review the plan.** You get a concise summary before anything is built.
4. **Build in Freckle.** A table becomes a workflow. A Workbook becomes one shared Freckle Workbook, with independent tables built in parallel where safe.
5. **Replay the same inputs.** The skill runs the same three source inputs through Freckle and compares the new results with the stored Clay outputs.
6. **Choose whether to migrate the data.** Once replay testing finishes, you can import the remaining historical Clay rows or leave them where they are.

The initial three rows keep migrations fast. They give you enough real data to inspect the schema and test the new logic without importing hundreds of records before you know the build works.

## Table and Workbook migrations

An individual table follows a short path: inspect, build, test, then optionally migrate its data.

A Workbook migration also handles the table roster, cross-table references, repeated enrichment capabilities, build order, and coordinated testing. Every migrated table lives inside the same Freckle Workbook.

If a Clay column points to a table outside the Workbook, the skill shows you the source table and asks whether you want to include it. It does not guess from column names.

## Safety and data handling

- Every pasted Clay URL starts a fresh local run unless you ask to resume a specific one.
- Extracted data stays in a local, gitignored run folder until it goes into your Freckle organization.
- Historical rows use stable Clay record IDs, so retries do not create duplicate imports.
- Imported history does not rerun paid enrichments.
- Tests disable or defer actions that could push to a CRM, sequencer, messaging tool, or another external system.
- Full historical data migration requires a separate approval after the build and replay tests finish.

## Requirements

- Codex or Claude Code
- Node.js
- Access to the source Clay table or Workbook
- A Freckle account and organization

You handle sign-in, 2FA, and any connection approvals. The skill never asks for or stores your credentials.

## Updating

Pull the latest version from inside the installed skill directory:

```bash
git pull
```

The skill's executable instructions live in [`SKILL.md`](SKILL.md). The files under [`specialists/`](specialists/) describe each migration stage, while [`references/`](references/) and [`scripts/`](scripts/) hold the supporting rules and deterministic tooling.
