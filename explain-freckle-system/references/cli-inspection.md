# Read-Only CLI Inspection

Use this reference for every live inspection performed by `explain-freckle-system`.

## Operating Boundary

Load the `freckle` skill before running any `freckle` command. For a named Workbook or saved Workflow, follow its existing-target route to locate the object and pin the organization, then stop at read-only inspection.

Allowed live inspection surfaces:

- authenticated `freckle` CLI list and inspect commands;
- `freckle workflow saved get-draft` for a local structural artifact;
- read-only run-list commands when recent activity matters.

Never use an internal database, direct HTTP API, browser request, or internal service to fill a CLI visibility gap.

Do not run commands that create, update, publish, invoke, trigger, retry, archive, unarchive, rotate, delete, import, or otherwise mutate an object. Authentication may be completed through the `freckle` skill when necessary, but explanation work itself remains read-only.

## Sensitive Output Rules

CLI access proves the requester can inspect their Freckle organization; it does not make every returned value suitable for an explanation or journal.

Never copy into chat or the journal:

- CLI tokens or local auth configuration;
- credential IDs or integration secrets;
- webhook endpoint URLs;
- connection constant values or complete input mappings;
- raw Dataset entries;
- raw Workflow run inputs or outputs;
- full Workflow drafts, node configuration, or bindings;
- private integration payloads.

Record safe structural facts instead: business labels, object IDs when useful, Dataset field names, connection endpoints, trigger policy, Workflow input/output shape, node definition families, branch structure, explicit Dataset destinations, run status, and timestamps.

Because some inspect commands return more than an explanation should expose, create a task-specific temporary folder with owner-only permissions outside the repository and direct raw output there. Read only targeted safe fields from those files; never dump the complete artifact into chat or the journal. Keep the files out of version control and remove the temporary folder when the explanation is complete.

## Target And Organization Resolution

Use the `freckle` skill to resolve authentication and organization context.

1. Extract a Workbook or Workflow ID from the supplied URL when present.
2. Locate a saved Workflow when its organization is unknown, capturing the list privately:

   ```bash
   freckle workflow saved list --all > <private-temp-folder>/workflow-list.yaml
   ```

3. Locate a Workbook by checking each organization available to the authenticated user, again capturing output privately:

   ```bash
   freckle workbook list --org-id <org-id> --json > <private-temp-folder>/workbook-list-<org-id>.json
   ```

4. On one exact match, pin `FRECKLE_ORG_ID` in the reused shell. Do not use `freckle org switch`.
5. Stop and ask for disambiguation only after the CLI produces zero or multiple plausible matches.

Do not invent a target when lookup fails.

## Workbook Inventory

Inspect the Workbook graph:

```bash
freckle workbook inspect <workbook-id> --json > <private-temp-folder>/workbook-inspect.json
```

Record:

- Workbook label and description;
- Dataset IDs, labels, descriptions, archive state, and field catalogs;
- connection IDs;
- each connection's input Dataset, saved Workflow, output Dataset, trigger policy, and unfold behavior;
- field-to-input relationships when they clarify the path, without reproducing the full mapping or any constant value.

The inspection gate fails if a connection cannot be tied to an input Dataset, saved Workflow, output Dataset, and trigger policy. Label unresolved CLI output instead of guessing.

Inspect an individual Dataset only when the Workbook graph lacks needed safe metadata:

```bash
freckle workbook dataset inspect <workbook-id> <dataset-id> --json > <private-temp-folder>/dataset-inspect.json
```

Do not list Dataset entries for ordinary explanation work.

## Sources

When the source mechanism matters, list configured sources for the exact Dataset:

```bash
freckle workbook dataset source list <workbook-id> <dataset-id> --json > <private-temp-folder>/dataset-sources.json
```

Record only source kind, state, and safe scheduling facts. A returned webhook endpoint is a bearer credential: never reproduce it in chat, the journal, a diagram, or a user-facing deliverable.

Use a source-specific inspect command only when the `freckle` skill routes to it and the explanation needs current source state. Keep credentials, request identifiers, endpoint URLs, and provider payloads out of the explanation.

## Saved Workflow Structure

For each attached or directly targeted saved Workflow:

```bash
freckle workflow saved inspect <workflow-id> > <private-temp-folder>/<workflow-id>-inspect.yaml
freckle workflow saved get-draft <workflow-id> --out <private-temp-folder>/<workflow-id>.yaml
```

Use `saved inspect` for identity, lifecycle, revision, input/output schema, and customer-facing cost metadata when relevant.

Treat the exported draft as a private local inspection artifact. Extract only:

- node IDs and definition keys;
- graph edges and branch labels;
- input/output names and types needed to explain handoffs;
- explicit Dataset IDs used by Push to Dataset nodes;
- integration families implied by node definitions.

Do not quote or persist node config, credentials, constants, bindings, prompts, headers, URLs, or the full draft in the journal. Remove the temporary draft with the other raw CLI artifacts when the explanation is complete.

When two objects share a name, retain IDs for disambiguation. Otherwise explain with business names.

## Current Activation And Recent Health

A connection's `triggerPolicy` establishes whether new pending rows are admitted automatically or manually. A saved Workflow definition alone does not establish automation.

When recent activity is material, use bounded run lists:

```bash
freckle workbook dataset connection runs <workbook-id> <connection-id> --limit 25 --json > <private-temp-folder>/<connection-id>-runs.json
freckle workflow saved runs list <workflow-id> --limit 25 > <private-temp-folder>/<workflow-id>-runs.yaml
```

Record status, time, and safe product error categories. Do not reproduce row values, run inputs, run outputs, or provider payloads. Do not invoke a Workflow, trigger a connection, or retry a failed run to gather evidence.

Absence from a bounded run list means “not observed in the inspected window,” not “never ran.” State the inspection window and avoid universal claims.

## Evidence Limits

The CLI can prove the configured Workbook graph, saved Workflow structure, trigger policy, source setup, and recent run state that its commands expose. It may not prove:

- undocumented external workers or coordinators;
- future architecture not represented in current objects;
- business intention behind ambiguous labels;
- downstream behavior outside Freckle;
- historical state outside the inspected run window.

Use a dated user-supplied artifact for those facts when available. Label documented intention and inference separately from CLI-inspected fact.

## Failure Handling

- Missing or expired authentication: follow the `freckle` skill's auth route.
- Zero or multiple target matches: show the lookup result and ask for the exact target or organization.
- Permission denied: report the CLI access boundary; do not try another inspection surface.
- Unfamiliar output or flags: return to the `freckle` skill and confirm the command's documented shape or `--help` before proceeding.
- Required fact not exposed by the CLI: record it as unknown or request a dated artifact. Never fall back to an internal database or direct API.
