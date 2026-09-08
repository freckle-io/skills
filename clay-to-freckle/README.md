# Clay to Freckle

Reconstruct a Clay table or Workbook as a lean, Freckle-native system.

This skill reads Clay's configuration and sample results, identifies the business capabilities and intended outcomes, and asks you to approve what should move. It then works with the Freckle skill to build and test the approved system. Clay's columns are evidence, not a schema to copy wholesale.

It works in both Codex and Claude Code.

## What it can migrate

- A Clay table, Workbook, or connected group of tables
- Business behavior from formulas, prompts, waterfalls, run conditions, and routing
- Required enrichment inputs, stage handoffs, and final Dataset fields
- External actions such as CRM writes, with explicit mappings and live-action gates
- Reference data and historical values that belong in the approved destination contract

The destination may be a Workflow, a chained Workbook, a Dataset/reference, reusable utilities, or no asset for intentionally excluded behavior. Related tables can become stages inside the same Workbook when you approve their inclusion.

Clay's separate Workflows product, identified by `wf_...` URLs, is outside the current scope.

## How to use it

Install the repository as a personal skill for your agent.

### Codex

```bash
git clone https://github.com/freckle-io/skills.git
cp -R skills/clay-to-freckle ~/.codex/skills/
```

Then paste a Clay table or Workbook URL into Codex:

```text
Use $clay-to-freckle to migrate this into Freckle:
https://app.clay.com/workspaces/.../workbooks/wb_...
```

### Claude Code

```bash
git clone https://github.com/freckle-io/skills.git
cp -R skills/clay-to-freckle ~/.claude/skills/
```

Then run:

```text
/clay-to-freckle https://app.clay.com/workspaces/.../tables/t_.../views/gv_...
```

You stay in one conversation. The skill may use sub-agents for table preparation, building, and testing, but you do not need to manage them.

## What happens during a migration

1. **Read the Clay setup.** Extract the complete configuration and three representative rows per table. Discover live reads and writes to other tables and ask which connected tables to include.
2. **Define the outcomes.** Identify what must remain: final Dataset results, external actions, handoffs, or intentional status/no-op behavior. A Dataset can be the final product without a later action.
3. **Review the plan.** Approve each table's disposition, the business primitives, the destination contracts, and meaningful omissions. Required formula behavior survives; intermediate fields are kept only when needed.
4. **Build in Freckle.** Build the approved destination graph using current Freckle primitives, carrying only the data needed by downstream stages or final consumers.
5. **Replay and review.** Replay the same three source inputs and targeted branch cases. Check final results and dry-run action payloads, then summarize meaningful omissions and give you the option to restore them. Changed contracts require an updated plan and affected tests to run again.
6. **Choose whether to migrate the data.** Once testing and omission review are resolved, you can import historical rows into the approved lean contract or leave them in Clay.

The initial three rows keep migrations fast. They give you enough real data to inspect the schema and test the new logic without importing hundreds of records before you know the build works.

## Table and Workbook migrations

The entry URL determines where inspection starts, not the destination architecture. Both individual-table and Workbook migrations inspect live cross-table references before planning.

When Clay sends rows to another table that continues the same business process, the skill proposes bringing it into the same migration and asks whether to include all connected tables, choose some, or leave them as explicit boundaries. It resolves references from configuration rather than guessing from column names.

Every analyzed table gets a human-approved disposition: recreate, fold into another asset, consolidate with duplicate behavior, embed as reference data, keep standalone, defer, or exclude. Approval of the table roster alone does not authorize building.

## Safety and data handling

- Every pasted Clay URL starts a fresh local run unless you ask to resume a specific one.
- Extracted data stays in a local, gitignored run folder until it goes into your Freckle organization.
- Historical imports use the approved identity and deduplication rules. Clay record IDs are optional provenance, not a mandatory live input.
- Imported history does not rerun paid enrichments.
- Tests disable or defer actions that could push to a CRM, sequencer, messaging tool, or another external system.
- Completion requires resolved omission choices. Restoring behavior updates the plan and triggers affected tests before continuing.
- Full historical data migration requires a separate approval after the build, replay tests, and omission review finish.

## Requirements

- Codex or Claude Code
- Node.js
- Access to the source Clay table or Workbook
- A Freckle account and organization

You handle sign-in, 2FA, and any connection approvals. The skill never asks for or stores your credentials.

## Updating

Pull the latest monorepo version, then copy the skill over your installed version:

```bash
git -C skills pull
cp -R skills/clay-to-freckle ~/.codex/skills/
```

The skill's executable instructions live in [`SKILL.md`](SKILL.md). The files under [`specialists/`](specialists/) describe each migration stage, while [`references/`](references/) and [`scripts/`](scripts/) hold the supporting rules and deterministic tooling.
