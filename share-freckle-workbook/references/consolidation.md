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
- Every **business branch that tells the story** — tier splits, qualification
  gates, fallbacks — with counts carried by the branching node's stat (see
  stats.md). Business branch, not dependency fan-out; see Column hints below.
- Every **output with a brand the audience knows** (Slack, HubSpot, a Dataset)
  as its own node, kind `output`. Outputs are the payoff; never merge them.
- The **scoring/judgment node** if one exists — it's usually the hero. Give it
  kind `score` (renderer gives it the gradient ring).

## Node budget

5–8 nodes. Under 4 ranks the card auto-shrinks toward square — that's fine,
don't pad. Over 8, you've under-consolidated.

## Column hints — the spine is the default, a side branch must be earned

`cols` in the spec: spine = 0, side branches = 1 (or -1 for left). One side
branch max — a card is not the editor.

**Only a business branch goes off-spine.** A business branch is one where
*different rows take different paths*: a tier split, a qualification gate, a
gated detour only some rows enter, a fallback the row takes only when the first
attempt fails. If you cannot say "these rows go here, those rows go there," it
is not a branch.

**Data fan-out is not a branch, and it is the trap.** In the raw draft, every
node that reads the same upstream value looks like a fork — one fetch feeding a
check node *and* a normalize node reads as two children, but every row goes
through both. Those are the same step wearing two hats; collapse them onto the
spine. Judge branches by what happens to a *row*, never by counting children in
the dependency graph.

**A cascade is a spine, not a fork.** Try A, and if A comes up empty try B, then
C — that's the shape of most fallback workflows, and it reads as one descending
column with conditional edge labels ("when the feed is empty"). Drawing it as a
diamond implies a routing decision the workflow never makes.

When in doubt: single spine. A straight card that's true beats a branched card
that's decorative, and the fixtures are examples, not templates — radar.json has
a side channel because that workflow genuinely gates, not because cards look
better with a jog in them.

## Labels and sanitization

- Titles are jobs, sentence case, ≤3 words ("Enrich profile", "Score ICP fit").
- Subs are one concrete detail ≤5 words ("AI-tiered A through D").
- **Genericize customer-identifying names** found in node titles: a node called
  "Acme enrichment" becomes "Company enrichment". The *workflow owner's own*
  brand may stay (it's their card), but people/company names from their data
  never appear.
- Provider marks come from `renderer/assets/marks/*.svg`. If a provider has no
  mark, name it in the sub instead of using a wrong or generic logo.
