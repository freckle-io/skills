# Explanation Quality Rubric

All blocking checks must pass before delivery.

## Blocking Checks

| Dimension | Pass condition |
|---|---|
| Target | Exact Workbook/Workflow/system is identified, or the answer clearly states it is artifact-only |
| Evidence | Current-state claims trace to the evidence ledger |
| Inspection source | Every live Freckle fact comes from authenticated CLI inspection through the `freckle` skill; no internal database, direct API, browser request, or internal service was used |
| Object accuracy | Dataset, Workflow, connection, source, integration, worker, and writer are not conflated |
| Path continuity | Every arrow has a mechanism and every branch rejoins or terminates |
| Automation | Automatic, manual, disabled, undeployed, and future states are distinct |
| Safety | No token, credential ID, webhook endpoint, constant value, full mapping, raw entry, run input/output, full Workflow draft, node config, binding, private payload, or unfiltered CLI dump appears |
| Diagram parity | Mermaid diagram matches the journal path model |
| Layout | The answer follows `output-layout.md`: building blocks, connection rule, normal path, numbered walkthrough, Dataset map, fallback when material, integrations, and operating state |
| Failure behavior | Retry/fallback trigger, coordinator, bound, rejoin, and exhaustion are explained when present |
| Writer behavior | Planned/disabled actions are not described as executed writes |
| Audience | A non-technical GTM operator can identify start, movement, ownership, failure path, and current state |

## Quality Score

Score each 0–2:

- **Mental model:** absent / partial / immediately clear
- **Layout fidelity:** compressed or reordered / mostly follows contract / follows the complete guided-tour contract
- **Business sequence:** object dump / mostly ordered / guided row journey
- **Dataset purpose:** names only / mixed / each important role explained
- **Integration clarity:** vague / listed / caller-purpose-read/write distinguished
- **Visual economy:** confusing or absent when needed / useful / minimal and exact
- **Current/future clarity:** ambiguous / mostly clear / explicit state matrix
- **Caveat quality:** hidden or generic / present / claim-local and evidence-backed
- **Concision:** bloated / acceptable / detailed without repetition

Require at least 15/18 and all blocking checks.

## Repair Routing

- Missing facts or contradictions → `inspect`
- Orphan paths or unclear rejoin → `trace`
- Jargon, hierarchy, diagram, or length problems → `explain`

## Final Reader Test

Without rereading, the reader should be able to answer:

1. Where does a new row enter?
2. What makes it move?
3. What does each major Workflow own?
4. Which integrations only read/enrich, and which can write?
5. What happens when normal processing cannot continue?
6. What is automatic today?
7. What remains manual, disabled, undeployed, or future?
8. Which Dataset is the durable business output rather than a monitoring receipt?
