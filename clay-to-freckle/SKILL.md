---
name: clay-to-freckle
description: Reconstruct a Clay table or workbook as a lean, Freckle-native system. Use when the user wants to analyze or migrate Clay into Freckle, including table disposition, business primitives, minimal contracts, guarded build, parity testing, and optional historical backfill.
---

# Clay → Freckle

Treat Clay as implementation evidence, not as the destination schema. The default is a semantic reconstruction: understand the system, decide what should survive, obtain human approval, then build the smallest Freckle shape that preserves the required behavior.

Use the current `/freckle` skill for every Freckle read or mutation. Clay evidence describes behavior; it does not justify inventing Freckle primitives.

## Route by source, not destination

- `t_…`: extract the starting table, then discover its live table reads and writes. The user may expand the same run to those connected tables.
- `wb_…`: enumerate live tables, resolve active references, and confirm the analysis roster.
- `wf_…`: stop; Clay Workflows require a different migration path.

Source scope controls extraction only. Either source may become one Workflow, a chained Workbook, a Dataset/reference, several utilities, or no Freckle asset. See [references/migration-tracks.md](references/migration-tracks.md).

## Non-negotiable method

1. Start a fresh journal with `scripts/new-run.js` unless the user explicitly supplies a run path and says to resume.
2. Extract complete signed-in Clay configuration and three representative rows per table through [specialists/extract.md](specialists/extract.md). Keep raw prompts, formulas, envelopes, and columns in local evidence.
3. Run `scripts/discover-references.js $JOURNAL` for either source track. Show every resolved live target with direction, triggering field, row count, and Clay link. For outbound `route-row` writes, recommend bringing the downstream tables into the same migration when they continue the business process, then ask whether to include all, choose some, or keep them as boundaries. Never silently skip them because the entry URL named one table.
4. Extract included targets into the same journal and repeat discovery until no undecided live targets remain. Opaque `t_…` strings in provider/CRM metadata are not scope candidates.
5. Prepare compact source briefs with `scripts/prepare-table.js`. Use [specialists/translate.md](specialists/translate.md) only to resolve business behavior that is not clear from the extract.
6. Build system evidence with `scripts/plan-primitive-families.js $JOURNAL`. Define the intended outcomes and meaningful omissions before pruning dependencies, then write one compact `$JOURNAL/system-plan.json` following [references/brief-format.md](references/brief-format.md).
7. Ask `/freckle` to map only the surviving capabilities to current Freckle primitives and append those implementation choices to the system plan.
8. Render one review with `scripts/render-review.js $JOURNAL`. Present it, then ask a separate short approval question. Do not mutate Freckle before approval.
9. Build the approved destination graph through [specialists/build-workbook.md](specialists/build-workbook.md). The filename is historical; it handles every destination shape. `build-table.md` is only a compatibility router.
10. Announce the verified Freckle URL after all approved assets exist and before replay begins.
11. Run [specialists/replay-test.md](specialists/replay-test.md), present actual omissions with the option to restore them, clean temporary assets, and record the outcome.
12. Offer historical migration last. Backfill only the approved lean contract; never import the entire Clay schema by default.

## System plan gate

Every analyzed table receives exactly one disposition:

- `recreate`: it owns behavior that must remain a distinct destination asset.
- `fold`: its behavior becomes a stage or branch inside another asset.
- `consolidate`: duplicate tables collapse into one reusable capability.
- `embed`: small stable reference data becomes configuration or a narrow Dataset.
- `standalone`: reusable utility remains outside the main chain.
- `defer`: a real boundary is documented but not built now.
- `exclude`: obsolete, one-off, audit-only, or Clay-native behavior is intentionally omitted.

The human approves these choices, intended outcomes, meaningful changes, and target architecture. A table roster is not build authorization.

## Contract minimization

Backward-slice from approved business sinks across all included tables. Define each sink in `destination.outcomes`: a final Dataset, external write, handoff/export, or intentional status/no-op. State its consumer, required fields, what one result represents, conditions, and empty/error behavior. A Dataset can be the final product without any later action.

Trace both data and control dependencies through enrichment, matching, dedupe, validation, routing, and external write mappings. Keep only source fields and intermediate values on those paths, plus approved human-facing final fields and necessary operational evidence.

Preserve required formula behavior; inline helpers when their intermediate values need no consumer. Drop unreachable logic. A formula with no detected dependent column is only an outcome candidate, and “no consumer identified” is an uncertainty when a human may use the value. Put such proposed omissions in the review.

Classify surviving fields as `source_input`, `stage_handoff`, or `final_output`. Use explicit stage dependencies and carry only needed context across each handoff. Keep raw envelopes, aliases, and test diagnostics local unless an approved outcome needs them.

`Clay Record ID` is optional historical provenance, not a universal live key. Prefer the actual source identifier, CRM object ID, or a keyless batch when that is the real contract.

## Architecture rules

Split stages only at meaningful boundaries: responsibility, reuse, cost/retry, fan-out, trigger/cadence, human approval, or external side effects. Prefer explicit chaining, but do not force a fixed stage count.

- Reuse an existing Freckle Workflow only after input/output contract compatibility is verified.
- Model the actual future upstream payload, not a Clay wrapper used only during migration.
- Create a runtime audit Dataset only when a real operator or downstream consumer needs it. The journal holds migration evidence.
- Human approval and unsupported listener/adapter boundaries are explicit gates or deferred components, not hidden workflow steps.
- Disable writes, sends, enrollments, and other side effects until their live gate is approved.

## Testing

Use three real same-input business cases against the approved lean contract, plus the smallest synthetic branch fixtures needed for high-risk logic. Relevant examples include provider miss, existing CRM record, rebrand, multi-segment fan-out, and write-gate behavior.

Verify each declared outcome: final fields and row meaning, empty/error results, handoff continuity, and external write payloads, matching, and overwrite rules in dry-run form. Compare deterministic behavior exactly and provider/AI results against the approved business contract. A retained email waterfall is preserved capability; never report changes in provider, node, formula, or step counts.

After replay, summarize actual omitted fields, capabilities, actions, and deferred boundaries with reasons, and offer restoration. Omit safely inlined helpers and equivalent implementations from that summary. Resolve restoration choices before completion; update the plan and rerun affected cases when a choice changes the contract. Follow [references/replay-testing.md](references/replay-testing.md).

## Context discipline

- Full Clay evidence stays in `extract.json`; do not paste it into briefs or prompts.
- Inspect outcome candidates and external action mappings before pruning; then read only evidence needed for surviving dependencies or uncertain omissions.
- Resolve each repeated capability family once.
- Keep the review to decisions, contracts, risks, and acceptance tests—not a column-by-column inventory.
- When uncertainty could change scope, mark it in the plan for human decision instead of guessing.

## Privacy and completion

Give the privacy disclosure once. Extracted data remains local except for approved imports into the user's authenticated Freckle organization.

Complete only when the approved assets exist, replay and branch checks are recorded, omission choices are resolved, temporary assets are cleaned, side-effect gates are explicit, and the historical-data decision is recorded.

## References

- [references/brief-format.md](references/brief-format.md) — compact evidence and `system-plan.json` contract.
- [references/state-model.md](references/state-model.md) — journal, approval hashes, and resume rules.
- [references/replay-testing.md](references/replay-testing.md) — business replay and branch coverage.
- [references/subagent-contracts.md](references/subagent-contracts.md) — safe ownership when parallel workers are used.
- [specialists/prepare-workbook.md](specialists/prepare-workbook.md) — analysis and plan coordinator for both source scopes.
- [specialists/build-workbook.md](specialists/build-workbook.md) — destination-graph builder for all shapes.
