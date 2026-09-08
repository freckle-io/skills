# Replay and branch testing

Testing validates the approved Freckle contract, not a copied Clay schema.

## Business replay

Select up to three representative real records from the local extract. For each case:

- map only approved source-contract fields into the test input;
- retain the relevant Clay business outcomes as expected evidence;
- omit generated fields, provider envelopes, debug columns, and side-effect payloads from runnable input;
- invoke a saved Workflow or isolated test Dataset, never a production input Dataset.

Use `clayField` mappings in `system-plan.json` when semantic names differ from Clay columns. The automatically generated `replay-fixtures.json` is candidate evidence only until narrowed by the approved plan.

## Branch fixtures

Three live rows rarely cover branching systems. Add the smallest synthetic or isolated fixtures required by the plan's high-risk branches. Examples: source present vs absent, provider miss/fallback, existing CRM record, rebrand, multi-segment fan-out, and side-effect gate denied/approved.

Do not generate a combinatorial suite. Every branch case must name the decision or contract it protects.

## Comparisons

- `exact`: deterministic transforms after stable normalization.
- `business_contract`: required fields, statuses, and semantics for provider/API results.
- `directional`: explicit acceptance criteria for AI/research behavior.

Verify every outcome's fields, what one result represents, and empty/error behavior. A final Dataset is a valid outcome even without a later consumer node. For external writes, inspect the dry-run payload, destination properties, matching/association behavior, eligibility, overwrite policy, and applicable dedupe/idempotency rules; a status label alone does not prove these. Verify each actual connection carries the next stage's required inputs.

Compare capabilities by business behavior. An email waterfall remains preserved when implemented as a Freckle email waterfall with the required contract. Do not report provider, node, formula, or step counts as differences. Test formula behavior through the outcomes and decisions it affects; inlining does not constitute an omission.

## Omission review

After replay, reconcile the actual build with `system-plan.json` and render `scripts/render-report.js $JOURNAL`. Use the plan's compact `changes` list as the source of truth, with business subject, treatment, reason, and impact. Include omitted operator-facing fields, capabilities, external actions, changed business rules, and deferred boundaries. Group related omissions when useful; do not list plumbing or inlined helpers. “No consumer identified” remains a judgment for human review, not proof that a field is unneeded.

Material changes must already have been disclosed before build. An accidental gap is a failure to fix, not a new intentional omission. If replay discovers a desired contract change, update the plan and return to approval. For meaningful omissions, ask: “Would you like any of these restored?” Record the actual reply with `state.js record-omission-review $JOURNAL <decision.json> <revision>` as described in [state-model.md](state-model.md). Do not infer acceptance from silence. If `changes` is empty, state that no meaningful omissions were identified and continue without another gate.

A restoration updates the affected outcomes and contracts, rebuilds the affected graph, and reruns relevant cases before finalization. Preserve earlier test evidence for unaffected behavior only when its plan and implementation provenance still applies.

## Safety and cleanup

Disable or dry-run CRM writes, messages, enrollments, webhooks, and other external effects. Testing must not contact prospects or mutate live downstream systems.

Record each case as pass, acceptable difference, fail, or blocked with a concise reason. After validation, remove temporary Datasets, replay rows, isolated audit assets, and test-only wiring unless the approved plan intentionally retains them. Record cleanup status in the journal.

Immediately before execution, tell the user that everything approved is built and testing is underway, with the verified `next.freckle.io` URL.
