# Required Output Layout

Use this structure for the final answer unless the user explicitly requests a narrower format. Preserve the section order and guided-tour depth. Replace placeholders with inspected names and evidence.

## Opening Mental Model

Open with:

`Think of the system as five building blocks:`

Then define:

- **Workbook:** the overall container.
- **Datasets:** tables or inboxes that hold rows.
- **Workflows:** recipes that process one row.
- **Connections:** conveyor belts connecting a Dataset to a Workflow.
- **Integrations:** outside services a Workflow can consult or write to.

Add one short relationship paragraph:

`A Workflow does not continuously watch a Dataset by itself. The connection determines when a row is sent through that Workflow.`

Mention sources inside the walkthrough or diagram unless source mechanics require their own definition.

## The Normal Path

Use this exact heading:

`## The normal path`

Add a Mermaid flowchart that shows:

- the source or entry mechanism;
- each important Dataset handoff;
- the Workflow attached to each connection;
- the central business branch;
- the terminal business Dataset.

Show integrations as side calls from the Workflow that uses them. Do not draw an integration as though it moves the row between Datasets.

## Numbered Guided Tour

Follow the diagram with numbered `###` headings in execution order:

```markdown
### 1. <Entry Dataset>

<What arrives and why this Dataset exists.>

- <Sources or important fields>

### 2. <Workflow>

<What the connection sends into it and what it owns.>

That Workflow:

1. <Decision or transformation>
2. <Lookup or enrichment>
3. <Branch or output>

From there it chooses:

- <Destination and condition>
- <Destination and condition>
```

Give important queues, shared meeting points, finalizers, and durable outputs their own sections. Group equivalent per-source objects into one section and list the sources rather than repeating the same explanation.

Explain why architecture boundaries exist when evidence supports it—for example, isolating a scorer so hard failures are detectable or using one shared results Dataset so downstream rules do not care how a score was obtained.

## What the Final Datasets Mean

Use this exact heading:

`## What the final Datasets mean`

Include:

| Dataset | Purpose |
|---|---|
| `<name>` | `<plain-language business role>` |

Distinguish:

- source inboxes;
- work queues;
- handoffs;
- connection receipts;
- recovery evidence;
- durable business state;
- terminal output.

Say which Dataset is the important business output. Do not imply that a receipt Dataset is authoritative state.

## The Fallback Path

When fallback or retry is material, use:

`## The fallback path`

Add a separate Mermaid diagram. Then explain:

- what exact failure qualifies;
- who detects or coordinates it;
- how duplicate recovery is prevented;
- the retry bound;
- where the recovered path rejoins;
- what terminal safe result is created after exhaustion.

Omit this section only when inspection proves the system has no material fallback.

## How Integrations Fit In

Use this exact heading:

`## How integrations fit in`

Include:

| Integration | Where used | Current behavior |
|---|---|---|
| `<service>` | `<Workflow or boundary>` | `<read-only, conditional enrichment, active write, disabled, undeployed, or future>` |

State clearly whether each integration reads, enriches, coordinates, or writes. Put safety caveats in the affected row or paragraph.

## Operating State

If the system has an explicit cutover, end with:

`## What becomes automatic later`

List the connections or components that will change state, then close with one direct paragraph stating what is automatic, manual, disabled, undeployed, and untouched right now.

If there is no cutover, use:

`## Current operating state`

State the same current facts without inventing a future plan.

## Writing Rules

- Prefer inspected business names over IDs.
- Include IDs only for verification or disambiguation.
- Use short paragraphs and concrete verbs.
- Use bullets for sources, integrations, inputs, decisions, and branches.
- Keep detail that explains row movement, ownership, safety, and architecture boundaries.
- Do not replace the guided tour with an executive summary or a single generic numbered list.
- Do not include a methodology section, evidence journal link, or inspection narrative unless the user asks.
