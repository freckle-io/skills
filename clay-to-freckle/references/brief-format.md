# Compact evidence and system plan

## Per-table source brief

`brief.md` is a compact interpretation of `extract.json`, not a second copy of it. It contains:

1. verified source facts and active references;
2. the table's business role;
3. business capability primitives and important conditions;
4. candidate outcomes, their human/system consumers, and inputs needed to reach them;
5. a proposed disposition with evidence;
6. unresolved risks or deferred boundaries.

Inspect external action mappings and possible human-facing final values before deciding what survives. Treat automatic candidates as incomplete evidence; a terminal formula may be dead, while a pass-through field may be a final result. Keep raw configuration in `extract.json` and summarize business behavior rather than every column.

## Run-level `system-plan.json`

Keep the schema small and semantic:

```json
{
  "version": 3,
  "objective": "business outcome",
  "tableDispositions": [
    {
      "tableId": "t_...",
      "role": "what this table did",
      "disposition": "recreate|fold|consolidate|embed|standalone|defer|exclude",
      "destination": "stage or asset id, or null",
      "reason": "evidence-backed rationale"
    }
  ],
  "destination": {
    "shape": "standalone_workflow|chained_workbook|dataset_or_reference|mixed|no_build",
    "name": "human-readable name",
    "sourceContract": [
      {"name": "field", "source": "actual upstream source", "required": true, "purpose": "consumer"}
    ],
    "stages": [
      {
        "id": "stable-id",
        "name": "stage name",
        "intent": "one responsibility",
        "sourceTables": ["t_..."],
        "dependsOn": ["source"],
        "inputs": ["field"],
        "outputs": ["field"],
        "boundaryReason": "reuse|cost_retry|fan_out|trigger|human_gate|side_effect|single_stage"
      }
    ],
    "finalOutputs": [
      {"name": "field", "consumer": "who/what uses it", "purpose": "why it survives"}
    ],
    "outcomes": [
      {
        "id": "results",
        "kind": "dataset",
        "from": "stable-id",
        "consumer": "operator reviewing qualified records",
        "fields": ["field"],
        "recordUnit": "one row per input record",
        "when": "each completed input",
        "onEmpty": "return an explicit no-match result",
        "onError": "retain an error status for operator review"
      }
    ]
  },
  "implementation": {
    "resolvedByFreckleSkill": true,
    "assets": [],
    "stageMappings": []
  },
  "deferredBoundaries": [],
  "changes": [],
  "safety": {"sideEffects": "disabled_until_live_gate", "liveGate": "human approval required"},
  "tests": {
    "businessReplay": [{"name": "representative case", "outcomeIds": ["results"], "expect": "one usable result with the required field"}],
    "branchCases": [],
    "cleanup": []
  }
}
```

Names in contracts are semantic. Add `clayField` only for exact replay/backfill mappings. Keep source field IDs and dependency details in local evidence. Do not expose internal-only fields to document their existence.

## Outcome and change rules

- `dependsOn` lists immediate producing stages or `source`; only their declared outputs are available. List stages in dependency order. A field from a sibling branch or an ancestor must be explicitly carried to its consumer. Cross-table Clay reads/writes must be traced through their actual mapped fields before choosing the Freckle contracts.
- Outcome `kind` is `dataset`, `external_write`, `handoff`, or `status`. `from` is a stage ID or `source`. Dataset/handoff fields must appear in that producer's outputs; a write within a stage may also consume its inputs. `fields` includes necessary payload, identity, condition, and matching dependencies at that boundary. `recordUnit`, `when`, `onEmpty`, and `onError` define row multiplicity and every material branch ending; intentional no-op outcomes may have no fields. Each outcome needs replay/branch coverage through `outcomeIds` and `expect`.
- For `external_write`, also include `write: {target, operation, mappings: [{from, to}], match: {fields, rule}, overwrite, gate}`. Targets and properties must be concrete; mappings and matching fields must be in the outcome's fields. Use an explicit not-applicable rule and empty mappings/match fields when the operation needs neither. Include condition/association dependencies in `fields`. Tests inspect intended payloads without executing live writes.
- `finalOutputs` selects fields intentionally exposed to an operator or downstream consumer. Each must belong to an outcome. Outcomes can consume fields without requiring separate operator-facing columns.
- `changes` records meaningful differences only: `{id, subject, treatment: "omitted|changed|deferred", reason, impact, evidence}`. Reference the relevant Clay table/field or local evidence. Include omitted human-facing fields, capabilities, actions, and deferred boundaries. Where human use is uncertain, say “no consumer identified” and explain the possible use; do not declare the field useless. Material choices are presented before approval and revisited after replay. Empty `changes` means no meaningful difference was identified.
- Semantic capabilities preserved through Freckle implementations need no change entry. Do not compare provider or step counts or report safely inlined formulas and unused plumbing. Do not create a column-by-column behavior ledger.

Before review, validate source-to-outcome field availability along the declared graph, write mappings, final fields, outcome tests, and meaningful changes. The scripts enforce structural coverage; the agent must verify source behavior, branch conditions, and semantic fidelity from Clay evidence. An omitted source action cannot be discovered by validating a self-consistent destination plan alone.

New and revised plans use version 3. Existing approved version-2 journals remain readable; upgrade their plan only when resuming planning or changing the contract.
