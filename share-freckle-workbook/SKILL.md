---
name: share-freckle-workbook
description: Turn any Freckle workflow into a single shareable LinkedIn image — a stylized, consolidated DAG on a product-canvas card with outcome stats and poster attribution. Use when someone wants to share a workflow, make a workflow image/card, or show off what they built in Freckle — including when they paste the Share-button script copied from app.freckle.io. Invoke with /share-freckle-workbook <Freckle workbook or workflow URL>.
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

**Golden rule of flow: render first, ask after.** The user gets a finished v1
card before they answer a single question. Never block the first render on
missing identity, logo, or headshot — degrade gracefully, then refine.

## Invocation

Two entry paths, same pipeline:

1. **Share-button script** (primary). The user pastes a block copied from the
   Share button on a workflow page in app.freckle.io. It carries a
   `Workflow context` section with `org_id`, `workflow_id`, `org_name`,
   `user_name`, and — only when the org has one — `org_logo_url`. Treat these
   as trusted input for *this run* and as seed values for the local config
   (see Persistence). See [references/share-script.md](references/share-script.md)
   for the exact format.
2. **Direct URL or name.** The user pastes a Freckle URL (extract the
   `org_...` id and workbook/workflow UUID) or gives a name — fall back to
   fuzzy-matching `freckle workflow saved list [--all]`. Given a workbook,
   pick its most story-rich workflow.

Pass `--org-id` to every CLI call in both paths.

## Persistence

User data lives OUTSIDE this skill directory so skill updates can never touch
it, at `~/.config/freckle/share-freckle-workbook/`:

```
config.json      identity {name, role, company}, headshot (file path or ""),
                 orgs { "<org_id>": { name, logo } }
headshot.png     the user's headshot, saved once, reused forever
logos/<org>.*    per-org brand logos, saved when the user supplies one
```

Logos are keyed **per org**, not globally — one person builds in several
Freckle orgs (their own, a client's), and each card must wear the right brand.

Rules:

- **Migration:** if `config.json` is missing there but a legacy
  `config.json` inside this skill directory has non-empty values, copy them
  to the new home first, then use only the new home. Drop any legacy
  `brand`/`logoDevToken` keys — logos now come from Freckle (see step 6).
- **Precedence:** saved config wins over script-embedded values; script values
  fill blanks only. Never re-ask for anything already saved.
- After the follow-up round, write every new answer (role, headshot path,
  logo, declined-flags) back to `config.json` so it is never asked again.
  Record declines too (e.g. `"headshot": "declined"`) — a "no" is an answer.

## Pipeline

1. **Resolve the workflow** per Invocation above.

2. **Pull the truth.**
   - Topology: `freckle workflow saved get-draft [--org-id ORG] <id> | python3 scripts/parse-draft.py`
   - **Intent:** `freckle workbook inspect --org-id ORG --json <workbook-id>` —
     read the workbook and workflow **descriptions**. This is the owner
     explaining their own system in their own words, and it is the single best
     input to step 5's copy. Never write the headline or subline without
     reading it first.
   - Stats: run `dataset-stats.py` against **every dataset in the workbook**,
     not just a `pushToDataset` target — a workflow that writes to HubSpot (or
     any external system) still logs its per-row results to a dataset, and
     that dataset is where the story lives:
     `python3 scripts/dataset-stats.py <workbook-id> <dataset-id> --org-id ORG`.
   - **An error from that script is a bug to fix, not a fact about the
     workflow.** If it returns `error`, or returns only 100%-filled wrapper
     fields, or yields no usable candidates, investigate before concluding
     anything: look at a raw row (`freckle workbook dataset entry list ... --limit 3`),
     confirm the fields are being read at the right nesting depth, and fix the
     script. "This workflow has no numbers" is a conclusion you may only reach
     after the tool ran clean. Only a workbook with genuinely no datasets, or
     datasets with no rows, ships without stats.

3. **Consolidate** per [references/consolidation.md](references/consolidation.md):
   drop code/switch glue, collapse waterfalls, keep branches and outputs,
   5–8 nodes, sanitize customer-identifying labels.

4. **Pick stats** per [references/stats.md](references/stats.md): three
   surfaces, conditional-coverage rule, positivity filter. Only flattering
   numbers; degrade to qualitative claims, never to zeros.

5. **Understand it, then write the copy.**

   **First, say what it does in plain GTM language** — out loud, before drafting
   anything. Answer these five about the workflow as a whole (borrowed from the
   `explain-freckle-system` playbook): what arrives? what does it decide,
   normalize, or learn? which outside services does it consult? where does the
   result go? why does that handoff exist? Read the workbook and workflow
   **descriptions** too — the owner usually wrote a clean sentence about the
   point of the thing, and it beats anything you'd infer from node names.

   **Then write the headline: name the thing it produces, in words a stranger
   understands.** The workflow's own label is evidence, not the answer —
   renaming it mechanically is how you get a phrase like "The current jobs
   cascade," which is technically derived from the label and means nothing to
   a reader. Say what comes out ("Every open role, three ways to find it"),
   not what the pipeline is called. Test it: someone who has never seen this
   workflow reads the headline in a feed — do they know what it makes?
   Never first-person copy in the owner's mouth, never marketing voice.

   **The subline is the plain-English mechanism**, ≤2 lines: what goes in, what
   happens, where it lands. The workbook description is often already this
   sentence.

   No banned words (effortless/seamless/unlock/supercharge/AI-powered), no CTA,
   no URLs, no comment-bait — this is a share asset, not a lead magnet.

6. **Assemble identity + brand from what you already have.** No questions yet.
   - Brand slot (top-left), first match wins: `org_logo_url` from the script
     (download to `renderer/assets/brands/<org>.png`, verify it's a real
     image) → the saved `logos/<org_id>.*` for **this org** → **org name as
     text** (the renderer's name-only brand). The text fallback is a feature:
     v1 shows their name where their logo will go.
   - **The logo comes from Freckle, or from the user's own hand — never from
     the web.** Do not fetch a logo by domain, do not guess a domain from an
     org name, do not use a logo service. A logo the org didn't set is a logo
     nobody can verify, and it defeats step 10: every logo that enters here
     should also be offered back to Freckle, so the org becomes the source of
     truth. Text-in-the-slot is always the correct answer over a guess.
   - Footer: `name` from saved identity or script `user_name`; `role` from
     saved identity (else omit — the renderer degrades to "Name · Company");
     `company` from saved identity or script `org_name`; `avatar` only if a
     saved headshot exists (copy it to `renderer/assets/user/headshot.png`,
     set `footer.avatar` to `user/headshot.png`).

7. **Build the spec** per [references/card-spec.md](references/card-spec.md)
   and render v1:
   ```bash
   renderer/render.sh <spec.json> <out-basename>
   ```
   Look at the full PNG *and* `_feed540.png` — the 540px feed test is the
   acceptance gate (headline and node titles readable). Fix and re-render
   (≤3 iterations), then send the user the v1 PNG.

8. **Deliver the card, then ask — ONE short message.**

   **How the delivery message reads.** Here's the card, then the questions.
   That's it. Specifically:
   - **Never narrate your process.** No node counts, no "39 real nodes → 6",
     no list of what got absorbed or collapsed, no explanation of which node
     got the hero ring. The user is looking at the picture; they can see it.
   - **Never explain what isn't there.** If a stat, a logo, or a brand slot
     didn't make the card, say nothing about it. Absences are invisible unless
     you point at them, and pointing at them makes the card look diminished.
     (If something is missing because a *tool* failed, that's a bug — go fix
     it per step 2, don't write a paragraph about it.)
   - **No "one judgment call" essays.** Design decisions are yours; make them.
   - Plain language, no marketing register, no "punch it up" ad-speak.

   **The questions** — only the applicable ones, in the user's words:
   1. *Always:* say where the headline came from, then offer two alternate
      angles built from numbers you already pulled — so they pick rather than
      invent:

      > The headline names what the workflow makes:
      > 「Every high-priority contact, complete」
      >
      > Two other angles if you want them:
      > 「1,257 prospects checked for missing contact details」 (the volume)
      > 「239 mobile numbers HubSpot didn't have」 (the outcome)

      The **volume** angle leads with what went in; the **outcome** angle
      leads with the strongest net-new or delivered result (see
      [references/stats.md](references/stats.md)).

      **Every angle must stand on its own.** A number is not a headline —
      「847 jobs found」 tells a reader nothing about whose jobs, from where, or
      why it's hard. Each option needs its subject and its point in the same
      breath, and has to make sense to someone scrolling past who has never
      heard of this workflow. If an angle only makes sense to someone who
      already saw the card, it isn't one.

      Both must be real numbers from step 4 — never invent one to fill the
      slot — and both must clear the positivity filter *and* the headline's
      own copy rules: no first person, no marketing words, short enough to
      render (~38 chars per line, ≤2 lines). If the stats pass yielded nothing
      usable, or the numbers can't carry a sentence a stranger would
      understand, don't fake the menu — ask the plain version instead: "Keep
      it, or want something different?"
   2. *Only if the brand slot rendered as text* (no org logo in the script,
      none saved): "Want your logo up there instead of the name? Drop a file
      and I'll use it." Ask for a file — never offer to look one up.
   3. *Only if identity is incomplete* (no saved role and/or no saved
      headshot, and not previously declined): "Want your headshot and job
      title on the footer next to your name?"

   Never ask about anything already known or declined. A repeat user with a
   logo'd org gets exactly one question (headline).

9. **Apply answers, re-render ONCE, deliver the final PNG.**
   - Headline tweaks: revise per step 5's rules. If they took the volume or
     outcome angle, the headline now carries a number — rewrite the subline so
     it doesn't repeat it, and drop that number's per-node stat if it would
     say the same thing twice.
   - Logo: take the file they gave you, verify it's a real image, copy it to
     `renderer/assets/brands/<org>.png` for the render and to
     `~/.config/freckle/share-freckle-workbook/logos/<org_id>.<ext>` to keep.
     Record it under `orgs.<org_id>.logo`. If they gave a URL or a domain
     instead of a file, ask for the file — you don't fetch brand marks.
   - Headshot: reject sources smaller than ~200px on a side (ask for a bigger
     one); save to `~/.config/freckle/share-freckle-workbook/headshot.png`;
     the renderer crops it to a 48px circle in the footer. Save `role` to
     config too.

10. **Offer the logo push-back.** Only when the user supplied a logo this run
    AND the org had none in Freckle (no `org_logo_url` in the script): offer
    to add it to their Freckle org so future cards (and Freckle itself) have
    it. On a yes: if your agent has browser automation (Claude in Chrome,
    built-in browser), drive app.freckle.io → org settings and upload the
    file, confirming what you're about to change before you do it. No browser
    tools? Give them the logo's file path and the org settings URL and tell
    them where to drop it. Never touch their org without the explicit yes.

## Hard rules

- Read-only against Freckle: never run, invoke, or mutate anything — the sole
  exception is the logo push-back in step 10, opt-in and confirmed.
- Render first, ask after. v1 ships before any question.
- Positivity filter is absolute: no zeros, no failure counts, no unconditioned
  low fill rates, no credit spend.
- Sanitize: no person/company names from the owner's *data* on the card
  (the owner's own brand and identity are fine).
- Headshots are opt-in only: never fetch one from the web, never add one
  unasked, footer stays text-only by default.
- Brand marks come from the Freckle org or from a file the user hands you —
  never from a logo service, a domain guess, or anywhere else online. Name-only
  is the right answer whenever those two sources come up empty.
- `series` is always exactly "Built with Freckle CLI" — it's the franchise
  marker; never rename or drop it per card.
- The renderer is deterministic — if the card looks wrong, fix the spec or the
  shared CSS deliberately; never inline-hack one card.
- Never block on missing data. No runs? No dataset? No logo? No role? Ship the
  card with what exists — and say nothing about what's absent.
- Never explain a gap you could have closed. Reaching "there are no numbers
  here" without a clean tool run is how a fixable bug becomes a worse card.

## Files

- `renderer/` — build.mjs (spec→HTML, DAG layout), card.css (all styling),
  render.sh (measure→render→feed-test via headless Chrome), assets/ (fonts,
  58 provider marks, gradients, logos)
- `scripts/` — parse-draft.py, dataset-stats.py
- `references/` — consolidation.md, stats.md, card-spec.md, share-script.md
  (the Share-button script contract)
- `fixtures/` — radar.json (7-node branching fixture), email-waterfall.json
  (3-node degenerate case), cascade.json (6-node spine with conditional edge
  labels). Render all three after any renderer change.
- `config.json` (repo root) — legacy location, kept only for migration; user
  data now lives in `~/.config/freckle/share-freckle-workbook/`.
