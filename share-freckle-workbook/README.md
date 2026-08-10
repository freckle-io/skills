# share-freckle-workbook

Turn any Freckle workflow into a single shareable LinkedIn image — a stylized,
consolidated DAG on a product-canvas card with outcome stats and poster
attribution. Built for Claude Code and Codex.

![example card](docs/example-card.png)

## Install

Copy this folder into your agent's skills directory:

```bash
cp -R share-freckle-workbook ~/.claude/skills/share-freckle-workbook   # Claude Code
cp -R share-freckle-workbook ~/.codex/skills/share-freckle-workbook    # Codex
```

Then invoke with `/share-freckle-workbook <Freckle workbook or workflow URL>`.

## Requirements

- The [Freckle CLI](https://install.freckle.dev), authenticated (`freckle auth`)
- Google Chrome (headless rendering)
- Node.js 20+ and Python 3

## First run

The skill asks once for your name, role, and company (footer attribution) and
your agency's name + domain (header brand), all stored in `config.json`. Add a
free [logo.dev](https://logo.dev) publishable key as `logoDevToken` and it
fetches your logo automatically; otherwise the header shows your brand
name-only.

## How it works

`SKILL.md` is the pipeline: resolve the workflow via the Freckle CLI →
consolidate 30+ real nodes into 5–8 stylized ones → compute positivity-gated
outcome stats → emit a spec JSON → deterministic HTML/Chrome render at 2x with
a mandatory 540px feed test. Design rules live in `references/`, the renderer
in `renderer/`, example specs in `fixtures/`.
