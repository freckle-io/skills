# The Share-button script

This is the canonical payload the **Share** button on a workflow page in
app.freckle.io copies to the clipboard. The user pastes it into any coding
agent (Claude Code, Codex, Cursor, …). It is the contract between the product
and this skill: the web app interpolates the placeholders at copy time, and
SKILL.md consumes the `Workflow context` block verbatim.

## Template

```text
Turn my Freckle workflow into a shareable LinkedIn image.

If the "share-freckle-workbook" skill is already installed in this agent,
use it with the context below. Otherwise bootstrap it:
- clone https://github.com/freckle-io/skills to ~/.config/freckle/skills
  (if that folder exists, run `git -C ~/.config/freckle/skills pull --ff-only`)
- then read and follow ~/.config/freckle/skills/share-freckle-workbook/SKILL.md
  exactly, using this context:

Workflow context (from Freckle):
org_id: {ORG_ID}
workflow_id: {WORKFLOW_ID}
org_name: {ORG_NAME}
user_name: {USER_NAME}
org_logo_url: {ORG_LOGO_URL}
```

## Interpolation rules (web app, at copy time)

| Placeholder | Source | If unavailable |
|---|---|---|
| `{ORG_ID}` | current org (`org_...`) | always present |
| `{WORKFLOW_ID}` | the workflow being viewed | always present |
| `{ORG_NAME}` | org display name | always present |
| `{USER_NAME}` | logged-in user's display name | **omit the whole line** |
| `{ORG_LOGO_URL}` | the org's logo asset URL | **omit the whole line** |

- Omit, never blank: an absent value drops its entire line. The skill treats
  a missing `org_logo_url` as "this org has no logo yet", which triggers the
  name-in-the-logo-slot v1 render and the "want your logo up there?" follow-up
  (and, downstream, the offer to add the logo back into Freckle).
- No other data goes in the script — no emails, no tokens, no URLs beyond the
  logo asset. The user's CLI session provides all authentication.

## Filled example

```text
Turn my Freckle workflow into a shareable LinkedIn image.

If the "share-freckle-workbook" skill is already installed in this agent,
use it with the context below. Otherwise bootstrap it:
- clone https://github.com/freckle-io/skills to ~/.config/freckle/skills
  (if that folder exists, run `git -C ~/.config/freckle/skills pull --ff-only`)
- then read and follow ~/.config/freckle/skills/share-freckle-workbook/SKILL.md
  exactly, using this context:

Workflow context (from Freckle):
org_id: org_ExampleOrgId00000000000000
workflow_id: 01989f2e-6f4a-7c3b-9d2e-8a1b2c3d4e5f
org_name: Your Agency
user_name: Taylor Brooks
```

(This example org has no logo set, so `org_logo_url` is omitted.)
