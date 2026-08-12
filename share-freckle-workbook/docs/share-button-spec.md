# Product spec: the workflow Share button

**What ships:** a **Share** button on every individual workflow page in
app.freckle.io that copies one prompt to the clipboard. The user pastes it
into their coding agent (Claude Code, Codex, Cursor — anything), and the
agent produces a polished LinkedIn card of their workflow, then refines it
through a short follow-up round. No new API surface is required.

## Why this shape

- Freckle users are CLI users; the paste target (a coding agent with shell
  access) is already on their machine, authenticated. The button needs no
  entitlement checks beyond "is viewing a workflow."
- Everything the agent can't get from the CLI is interpolated into the copied
  text **at copy time** — org logo URL, org name, user name — because the web
  app already knows all three. That's what keeps this zero-API.

## The button

- **Placement:** workflow page header, alongside existing actions. Label:
  `Share`.
- **Action:** copy the payload to the clipboard; toast:
  *"Copied — paste into your coding agent (Claude Code, Codex, Cursor…)"*.
- **No org picker, no options.** The current org and workflow are baked in.

## The payload

The canonical template, interpolation table, and a filled example live in
[`references/share-script.md`](../references/share-script.md) — treat that
file as the source of truth and copy it verbatim into the implementation.
Summary of the data interpolated at copy time:

| Field | Source |
|---|---|
| `org_id` | current org |
| `workflow_id` | workflow being viewed |
| `org_name` | org display name |
| `user_name` | logged-in user's display name (omit line if none) |
| `org_logo_url` | org logo asset URL (omit line if the org has no logo) |

Omission is meaningful: a missing `org_logo_url` line is how the skill knows
to render the org's *name* in the logo slot and to offer the logo upload
afterwards — including offering to add the supplied logo back into the
Freckle org. Never send an empty value.

## Downstream behavior (what the skill does with it)

1. Builds the card immediately — no questions first. Org name text stands in
   for a missing logo; footer shows what's known.
2. One batched follow-up: headline check (always), logo offer (only if no
   logo), headshot + job title offer (only first time). Answers persist on
   the user's machine at `~/.config/freckle/share-freckle-workbook/` — repeat
   shares ask one question or none.
3. If the user supplies a logo Freckle doesn't have, the agent offers to
   upload it to org settings (via the user's browser tooling, or by handing
   them the file + settings URL).

## Future product asks (not blockers)

- Expose the org logo in the CLI (e.g. `freckle org list --json` including a
  `logoUrl` field) so the skill can stop depending on script interpolation.
- An org-logo write path (`freckle org set-logo <file>` or an API endpoint)
  would replace browser-driven upload in step 3 with one clean command.
