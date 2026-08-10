# Card spec schema

The contract between the editorial pass (agent) and the renderer (deterministic).
Everything the card shows is in this JSON; the renderer adds nothing.

```jsonc
{
  "canvas": { "w": 1200, "h": 1500 },   // h is the MAX; short cards auto-shrink toward 1200 square
  "brand": {                             // the OWNER's brand — promotes whoever built it, top-left
    "name": "LeanScale",
    "logo": "brands/leanscale.png"       // fetch via logo.dev at generation time (see below); omit -> name only
  },                                     // omit brand entirely -> freckle_ takes the top-left slot
  "series": "Built with Freckle CLI",   // FIXED series eyebrow — identical on every card, never
                                        // customized; it's the franchise marker that makes the
                                        // format recognizable in the feed
  "headline": "The competitive audience radar",   // the workflow's NAME, not a voicey claim —
                                                  // never write first-person copy in the owner's mouth
  "subline": "Every engager on competitor posts, enriched, scored against the ICP, and routed to the team in Slack.",
                                         // factual one-or-two-line description of what it does
  "pill": "optional small indigo pill above the headline",   // almost always omitted
  "sources": [                           // what feeds the workflow; 2–3 max, last one often dashed "any X"
    { "label": "Competitor posts", "mark": "LinkedIn" },     // mark = filename in renderer/assets/marks/
    { "label": "any engager", "dashed": true }               // no mark -> plain pill; "dot": "#hex" also allowed
  ],
  "dag": {
    "nodes": [
      // kind: input | enrich | score | output. score gets the gradient-ring hero treatment.
      // marks: 0–3 entries, stacked left-to-right = waterfall priority order.
      { "id": "input", "title": "New LinkedIn engager", "sub": "from a tracked post", "marks": ["LinkedIn"], "kind": "input" }
    ],
    "edges": [
      // edges are usually UNLABELED — branch counts belong in the branching
      // node's stat (see stats.md). A label is the fallback for a second
      // simultaneous branch; it docks on the source's bottom-right edge.
      { "from": "score", "to": "contact" }
    ],
    "cols": { "contact": 1 }             // spine = 0 (default); one side channel max (1 or -1)
  },
  // Stats live ON the step they describe: node.stat renders as a right-aligned
  // indigo mono number inside that node's card (the product's score-column
  // idiom) and suppresses the IN/OUT pill. 2–3 statted nodes max, positivity-
  // gated. Keep value ≤6 chars ("293", "12/13") and label ≤2 words so the card
  // doesn't overflow; don't duplicate a number that an edge label already shows.
  // e.g. { "id": "input", ..., "stat": { "value": "293", "label": "engagers in" } }
  "runbar": {
    "live": true,                        // green dot; only when the workflow has a live connection
    "segments": ["runs on every new engager"]
    // status line under the DAG — qualitative claims; stats belong in the tiles
  },
  "footer": { "name": "Andy Toizer", "role": "Head of Growth", "company": "Freckle" }
}
```

## Brand logo fetch (generation time)

```bash
curl -sL -o renderer/assets/brands/<slug>.png \
  "https://img.logo.dev/<their-domain>?token=<logoDevToken from config.json>&size=128&format=png&retina=true"
```
Check the result is a real PNG (`file`), and look at it — a gray placeholder
glyph means no logo exists; fall back to name-only brand. The token lives in
`config.json` (`logoDevToken`) — logo.dev publishable keys are free; without
one, use name-only brands.

## Rendering facts the editorial pass should know

- Ranks are computed by longest path — you control columns, not rows.
- Node width is fixed (560px). Titles ≤3 words; a node with a stat fits
  ~17 title chars + ≤6-char stat value + ≤2-word stat label.
- Headline: ~38 chars per line at 58px; 1–2 lines. Subline ≤2 lines at 26px.
- The brand accent is indigo (#6366F1 family) per the LIVE site — the DS
  repo's purple ramp is the old brand; never reintroduce it.
- The authored gradient appears ONLY as the 10px top-edge strip and the score
  node's ring (spec.gradient picks the PNG; default event-gradient-2.png).
- The renderer never fails on missing data: empty `marks`, no `sub`, no
  `runbar.segments`, no `sources` all degrade cleanly.
- Output: `renderer/render.sh <spec.json> <out-basename>` → `<out>.png` (2x)
  and `<out>_feed540.png`. ALWAYS look at both before delivering; the 540px
  feed test is the acceptance gate.
