# Consolidation — real DAG to stylized card DAG

The card shows what the workflow *does*, not how it's wired. 36 real nodes become
5–8 stylized ones. These rules were derived from the LeanScale pilot
(36 nodes → 7) and are applied by the agent, not by the renderer.

## Drop (absorb into edges)

- `code@*` nodes — normalize/format/collect/route/build glue. Always dropped.
- `switch@*` gates — become **conditional edge labels** on the surviving edge
  ("Tier A/B only"), never their own node.
- Pure type declarations (blocks without `uses:`) and `result` outputs.
- Duplicate format/audit tails (`formatAudit`, `wrapReviewRow`, ...).

## Collapse

- **Waterfalls** (provider A, fallback B, validator C feeding one collect node):
  one node, title names the *job* ("Find + verify email"), sub names the chain
  ("Findymail → LeadMagic → ZeroBounce"), 2–3 stacked provider marks.
  `chooseFirstAvailable` in a draft is always this pattern.
- **Enrichment stages**: provider + its research-agent fallback = one node
  ("Enrich company · Apollo + research agent").
- If still over 8 nodes, merge adjacent same-category enrichments
  ("Find email" + "Find phone" → "Find email + mobile").

## Keep — always

- The **input** (what starts a run) as the first node, kind `input`.
- Every **branch that tells the story** — tier splits, qualification gates —
  with counts carried by the branching node's stat (see stats.md).
- Every **output with a brand the audience knows** (Slack, HubSpot, a Dataset)
  as its own node, kind `output`. Outputs are the payoff; never merge them.
- The **scoring/judgment node** if one exists — it's usually the hero. Give it
  kind `score` (renderer gives it the gradient ring).

## Node budget

5–8 nodes. Under 4 ranks the card auto-shrinks toward square — that's fine,
don't pad. Over 8, you've under-consolidated.

## Column hints

`cols` in the spec: spine = 0, side branches = 1 (or -1 for left). One side
branch max — a card is not the editor. Gated detours (the email/phone lookup
that only qualified rows take) are the natural side-branch candidates.

## Labels and sanitization

- Titles are jobs, sentence case, ≤3 words ("Enrich profile", "Score ICP fit").
- Subs are one concrete detail ≤5 words ("AI-tiered A through D").
- **Genericize customer-identifying names** found in node titles: a node called
  "Acme enrichment" becomes "Company enrichment". The *workflow owner's own*
  brand may stay (it's their card), but people/company names from their data
  never appear.
- Provider marks come from `renderer/assets/marks/*.svg`. If a provider has no
  mark, name it in the sub instead of using a wrong or generic logo.
