# Stats — three surfaces, positivity-gated

Stats live inside the card's existing anatomy, never in a separate band:

1. **Per-node stats** → `node.stat` renders a big purple number inside the
   step it describes: input volume on the input node ("293 engagers in"),
   conditional coverage on the enrichment node ("12/13 emails verified"),
   outcome counts on the output node ("4 Tier A alerts"). This is the primary
   stat surface.
2. **Branch outcomes** → prefer putting the count in the BRANCHING node's own
   stat ("13 · made Tier A/B" on the scoring node) over edge labels. Edge
   labels are a fallback for a second simultaneous branch; when used they dock
   on the source node's bottom-right edge, never on the path, and never repeat
   a number a node stat already shows.
3. **The run bar** → qualitative status only ("runs on every new engager"),
   with the green LIVE dot when a connection is active.

Get raw numbers with `scripts/dataset-stats.py <workbook-id> <dataset-id>
--org-id <org>`. Run it against **every dataset in the workbook** — a workflow
whose visible output is an external system (HubSpot, Slack, a CRM) still logs
per-row results to a dataset, and that result dataset is the richest source of
stats in the whole pipeline. Real fields are normally nested one level under a
`result`/`properties` wrapper; the script flattens that for you, so treat a
report showing only 100%-filled wrapper keys as a bug, not as an empty workflow.

## The net-new rule (the strongest stat an enrichment workflow has)

When a field has a `*_source` companion (`phone` + `phone_source`,
`linkedin_url` + `linkedin_source`), the rows whose source is *not* the system
of record are **net-new** — data the workflow found that the CRM didn't have.
That is the workflow's actual value, and it beats raw fill every time:
"239 phones HubSpot didn't have" lands where "346 phones (28%)" reads as a
failure. Same data, honest either way, but only one is worth posting.

## The conditional-coverage rule (the one that matters)

Fill rates must be computed **relative to the gated population**, not the whole
dataset. The LeanScale pilot: 12 emails / 293 rows = 4% (looks broken), but
email lookup only ran on the 13 tier-qualified rows → 12 of 13 = 92% (true and
impressive). Find the gate in the topology first, then divide.

## Positivity filter — hard rules

Only numbers that flatter. This is a share asset, not a dashboard.

- Never render zero, and never render a count so small it reads as failure —
  unless the frame is *selectivity* ("Tier A · 4" on an alert edge is precision,
  "4 emails found" is failure).
- Never render failure/error/disqualified counts or unconditioned low fill rates.
- Never render credit costs or spend unless the owner asks.
- A small total ("34 rows") is fine when framed as flow, not as reach.
- When no number survives the filter: **drop the surface silently.** Run-bar
  segments fall back to qualitative claims ("pay only when a verified email is
  found"), edge labels drop their counts ("Tier A only"), `runbar.live` goes
  false. The card never fails, never shows a bad number, never blocks.

## Numbers style

Unrounded and load-bearing (fdesign voice): "293", "12 of 13" — never "~300",
never "up to". Mono surfaces get mono numerals for free; don't add % signs when
"12 of 13" is stronger than "92%".
