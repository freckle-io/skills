# Workflow Brief Format

The brief (`journal/brief.md`, or `journal/tables/<t_…>/brief.md` on workbook runs) is the entire handoff payload — /freckle's BUILD path reads it as the goal. It describes **what** the table achieved, never **how** Freckle should implement it. Node choices, provider choices, and workarounds for gaps are /freckle's job; its server-backed node catalog is the authority.

## Rules

- Every derived piece of data is an **intent** with its dependency order — never an implementation instruction.
- Claygent prompts, waterfall provider orders, and formulas are carried **verbatim**. Unescape `formulaText`; render `{{f_…}}` references as `{{Column Name}}` so the brief is human-readable. The prompts are the payload — do not summarize, tidy, or "improve" them.
- Explain every Clay action as a visible enrichment step. Name its Clay provider/action, purpose, bound inputs, available outputs, downstream usage, existing-data treatment, and future-row intent. This is not a Freckle node selection.
- Preserve every extracted column in `data.csv` by default. Helper columns and compact action envelopes (`status`, rendered value, full structured value) may be grouped separately from business-facing outputs, but they are never silently discarded.
- Add `Clay Record ID` from `record.id` as the stable import/upsert key and `Imported from Clay = true` as a migration-control column for every historical row. Never rely on output emptiness alone to suppress enrichment of imported history.
- Terminal columns are presumed to be outputs. Missing push/export metadata does not make them dead.
- Terminology: Clay "table" → Freckle "workflow"; the destination is a Workbook (input Dataset + Workflow + output Dataset). Never interchangeable. On workbook runs, the Clay *workbook* becomes **one** shared Freckle *Workbook* holding every migrated table's workflow and datasets — qualify both container terms wherever they could collide.
- Workbook runs: the brief opens with a **Workbook context** line (which Clay workbook this table belongs to, its position in the roster, its sibling tables, and that all of them build into the same shared Freckle Workbook). Cross-table references — this table looking up rows in, deduping against, or writing to a sibling — are carried as *wireable* intents in the walkthrough and echoed in Outcomes (the shared Workbook makes them implementable, e.g. via code nodes — /freckle's choice); only a reference to a table *outside* the confirmed roster goes in "What doesn't come over" as a manual follow-up.
- "What doesn't come over" is always present, even when it says "Nothing — everything translated." It lists only what is genuinely dropped. Anything that migrates *in changed form* must be phrased so it is unmistakable the value itself comes over — above all secrets found inline in Clay configs (API keys in HTTP headers, tokens in bindings): the secret migrates into a managed Freckle credential the step references; only the hard-coded storage pattern is left behind. Never word a preserved-but-rehomed value as if it were dropped.
- Real sample values appear only in the Ground truth section; they are PII — the brief and `data.csv` stay in the gitignored `journal/`.
- Never include a cleanup or column-selection section. Every extracted Clay column comes over automatically; downstream usage affects only its explanation.

## Template

```markdown
# Migration Brief: <Clay table name> → Freckle workflow

Source: Clay table `<t_…>` (view `<gv_…>`), workspace <ws>, extracted <date>. <N> rows at extraction.
Workbook context (workbook runs only): table <k> of <n> in Clay workbook "<name>" (`<wb_…>`); siblings: <table names>; all build into the shared Freckle Workbook "<name>". <Cross-table links, or "no cross-table references".>

## 1. Inputs
What a row starts as (the input Dataset), and where rows come from — sources as intent:
- Row shape: <the input fields a row begins with, with types/semantics>
- Sources: <e.g. "weekly Clay search for VPs of Sales at 50–200-person SaaS companies", "CSV upload", "HubSpot sync-in"> — or "manual/CSV only".

## 2. Workflow walkthrough

An **ASCII workflow diagram** at provider level, then a numbered **primitives list**. Conventions (matching /freckle's plan-step diagrams): one connected flow; each step appears exactly once; run-condition branches split at a labeled condition and rejoin; waterfalls collapse to one stack naming provider order; plumbing formulas are implied, not drawn; cross-table links and every end state (including skip paths) are shown. Shape example:

    Inputs: Full Name, Company Name, Primary Email, LinkedIn URL
       │
       ▼
    Lookup in "leads (10)" ──rows found──▶ Enrich Person (Mixrank)
       │ no rows ⇒ row skips enrichment          │
       ▼                                         ▼
     [passes through]              Verified Email (waterfall:
                                    LeadMagic → Prospeo → Hunter)
                                                 │
                                                 ▼
                                   Add Lead to Campaign (Instantly) ⇒ push

    1. Lookup — suppress people already in "leads (10)" (dedupe)
    2. Enrich Person — full profile from LinkedIn URL / email
    3. Verified Email — 3-provider waterfall, first verified wins
    4. Add Lead to Campaign — push qualified rows to Instantly

The diagram + primitives list is the human-readable layer — it is what the review gate shows in chat. The per-step detail below remains the machine-grade payload.

For **every Clay action and derived field**, in dependency order:
### <Clay column name> — <enrichment action | derived output | helper>
- Intent: <plain-language goal, e.g. "find a verified work email">
- Clay's approach (context, not instruction): <provider + action display name/description, or formula/waterfall approach>
- Depends on: <upstream intents/inputs>
- Available outputs: <action output schema, grouped when long; “n/a” for formulas>
- Used downstream by: <field names and selected output paths, or “nothing—this is a terminal result”>
- Verbatim prompt/formula (when AI or formula):
  > <exact text, {{Column Name}} refs resolved>
- Run conditions: <only-run-if conditions, translated to intent>
- Existing rows: <population count and how historical values are preserved>
- Future rows: <the result this step must produce; implementation remains /freckle's decision>

## 3. Preserved columns
Every Clay column in original order:
| Clay column | Role | Populated rows | Migrated value | Future-row behavior |
|---|---|---:|---|---|
| <name> | <input / enrichment result / derived output / helper / system metadata> | <N>/<total> | <preserved verbatim or JSON-serialized> | <reproduced, derived, preserved-history-only, or semantics differ> |

Nothing is removed merely because no later Clay field references it.

## 4. Outcomes
Downstream pushes as intents: <"results push to an Instantly campaign", "Slack alert on qualified leads">. /freckle decides what's wireable via its connections. None → say so.

## 5. Migrated data
The cutover model:
- `data.csv` is the historical **preview** — up to three of <total> rows × <M> columns, containing stable `Clay Record ID`, every extracted Clay column, and `Imported from Clay = true`. It does not imply the full dataset has migrated.
- `replay-fixtures.json` uses those same records as isolated future-row inputs: generated outputs are omitted, `Imported from Clay = false`, and stored Clay outputs remain expected results only. Never append replay fixtures to the production Dataset.
- Close-out offers optional historical data migration for the remaining <total−N> rows. Every approved historical row keeps `Imported from Clay = true` and is imported directly by stable key without re-enrichment.
- Future rows leave `Imported from Clay` blank/false, arrive with empty deliverables, run the full workflow, and land in the same output Dataset — history and new outputs combined.
If the table had 0 rows: "No data to migrate."

## 6. Ground truth
<K> rows as input → output pairs for the parity check (chosen where inputs AND deliverables are populated; drawn from rendered examples or full records):
| Input <field> | … | Clay's <deliverable> | … |
|---|---|---|---|
Parity expectations: exact-match on deterministic fields (emails, domains, URLs); directional-match on AI outputs (differences explained, not failed).
If none qualify: "No qualifying ground-truth rows — parity will be skipped."

## 7. What doesn't come over
Explicit list of anything Clay-specific with no expressible intent, each as a manual follow-up — or "Nothing — everything translated."

```
