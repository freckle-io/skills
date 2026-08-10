---
name: share-freckle-workbook
description: Turn any Freckle workflow into a single shareable LinkedIn image — a stylized, consolidated DAG on a product-canvas card with outcome stats and poster attribution. Use when someone wants to share a workflow, make a workflow image/card, or show off what they built in Freckle. Invoke with /share-freckle-workbook <Freckle workbook or workflow URL>.
---

# share-freckle-workbook

One Freckle workflow in, one beautiful PNG out. The card is the *user's* flex —
"look what I built" — with Freckle's wordmark riding along. Fully automatic:
no spec editing by the user, no failing loudly, always deliver a card.

The design is settled (see the fixtures): the card IS the product canvas —
dot-grid surface, gradient top strip, owner's brand top-left with freckle_
top-right, the fixed series eyebrow, centered workflow-name headline + factual
subline, the consolidated DAG as hero (angled edges, per-node indigo stats
reading as a funnel), a mono run bar, attribution footer. Do not reinvent the
composition; your editorial freedom is the *content* of the spec.

## Pipeline

1. **Resolve the workflow.** The user pastes a Freckle URL — extract the
   org id (`org_...`) and the workbook/workflow UUID from it, and pass
   `--org-id` to every CLI call. If they gave a name instead, fall back to
   fuzzy-matching `freckle workflow saved list [--all]`. Given a workbook,
   pick its most story-rich workflow.

2. **Pull the truth.**
   - Topology: `freckle workflow saved get-draft [--org-id ORG] <id> | python3 scripts/parse-draft.py`
   - Stats: find the dataset the workflow writes to (`pushToDataset` node, or
     the workbook's datasets), then
     `python3 scripts/dataset-stats.py <workbook-id> <dataset-id> --org-id ORG`.
     Skip silently if there's no dataset or it errors.

3. **Consolidate** per [references/consolidation.md](references/consolidation.md):
   drop code/switch glue, collapse waterfalls, keep branches and outputs,
   5–8 nodes, sanitize customer-identifying labels.

4. **Pick stats** per [references/stats.md](references/stats.md): three
   surfaces, conditional-coverage rule, positivity filter. Only flattering
   numbers; degrade to qualitative claims, never to zeros.

5. **Write the copy.** Headline in the builder's first-person voice — concrete,
   named providers, unrounded numbers, ≤2 lines (~45 chars/line). No banned
   marketing words (effortless/seamless/unlock/supercharge/AI-powered). No CTA,
   no URLs, no comment-bait — this is a share asset, not a lead magnet.

6. **Identity + brand.** Read `config.json`. If `identity` is empty, ask
   once for name, role, and company. If `brand` is empty, ask for the
   agency/company name and its domain (or a logo file path) — fetch the logo
   via logo.dev using `logoDevToken` when both are set, else render the brand
   name-only. Save everything back to `config.json` so it's never asked again.
   No headshots, ever.

7. **Build the spec** per [references/card-spec.md](references/card-spec.md)
   and render:
   ```bash
   renderer/render.sh <spec.json> <out-basename>
   ```

8. **Look at what you made** — the full PNG *and* `_feed540.png`. The 540px
   feed test is the acceptance gate: headline and node titles must be readable.
   Fix and re-render (≤3 iterations), then send the user the full-size PNG.

## Hard rules

- Read-only against Freckle: never run, invoke, or mutate anything.
- Positivity filter is absolute: no zeros, no failure counts, no unconditioned
  low fill rates, no credit spend.
- Sanitize: no person/company names from the owner's *data* on the card
  (the owner's own brand is fine).
- `series` is always exactly "Built with Freckle CLI" — it's the franchise
  marker; never rename or drop it per card.
- The renderer is deterministic — if the card looks wrong, fix the spec or the
  shared CSS deliberately; never inline-hack one card.
- Never block on missing data. No runs? No dataset? Ship the card without
  stats surfaces, using qualitative run-bar segments.

## Files

- `renderer/` — build.mjs (spec→HTML, DAG layout), card.css (all styling),
  render.sh (measure→render→feed-test via headless Chrome), assets/ (fonts,
  58 provider marks, gradients, logos)
- `scripts/` — parse-draft.py, dataset-stats.py
- `fixtures/` — radar.json (7-node branching fixture), email-waterfall.json
  (3-node degenerate case). Render these after any renderer change.
