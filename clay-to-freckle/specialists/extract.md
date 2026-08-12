# Extract Specialist

Owns: getting a signed-in app.clay.com browser session, identifying the target table — or enumerating a Clay workbook's tables and confirming the roster — running the v3 extraction, and writing `$JOURNAL/extract.json` (table runs) or `$JOURNAL/workbook.json` + `$JOURNAL/tables/<t_…>/extract.json` per table (workbook runs). `$JOURNAL` is the fresh absolute run path already allocated by `new-run.js`; never discover or substitute an older journal.

## Read

- `$JOURNAL/state.json` when initialized (read-only to this lane; the orchestrator collects completion)
- [../references/clay-v3-api.md](../references/clay-v3-api.md) — endpoints, shapes, URL parsing, error handling
- [../scripts/extract.js](../scripts/extract.js) — native page-context route, when you reach step 5
- [../scripts/list-workbook.js](../scripts/list-workbook.js) — workbook enumeration (page context), workbook runs at step 3a
- [../scripts/extract-codex.mjs](../scripts/extract-codex.mjs) — local-wrapper route, when you reach step 1

## Rules

- The user signs in themselves. Never enter credentials, never touch CAPTCHAs or 2FA prompts, never click through OAuth account choosers.
- All extraction calls run from the authenticated page context (session cookie applies automatically via `credentials: 'include'`). The bulk-fetch POST is read-only in effect.
- Never inspect, copy, or print browser cookies. The Codex wrapper keeps its own locked-down browser profile solely so a completed Clay sign-in can be reused on future runs. Never copy authentication material into or out of it.
- Do not substitute Clay CLI, Clay MCP, or a manual CSV export. Those surfaces cannot reproduce the complete v3 payload on every plan/table.
- Treat computer-use UI control and browser JavaScript evaluation as separate capabilities. The extraction surface must support unrestricted async page-context JavaScript and authenticated `fetch`; DOM-only or read-only evaluation does not qualify. Never work around that restriction through DevTools, the address bar, or a pasted `javascript:` URL.
- Clay tables and workbooks of tables only. A URL with a `t_…` id is a table run; a `/workbooks/{wb_…}` URL without a `/tables/` segment is a workbook run. If the identified URL or surface is Clay's "Workflows" product (`wf_…` — these ids also leak into Clay's workbook listings) or anything else, state the scope and stop.

## Sequence

1. **Open the extraction surface** for the target URL passed into this fresh run. Do not inspect the working directory for state before opening it.
   - **User-owned Chrome + unrestricted page JavaScript (preferred):** connect to the user's existing Chrome through the available Chrome/browser-extension or computer-use surface, reuse an existing `app.clay.com` tab when possible, and read the page to determine sign-in state. In Claude Code, this means the Claude in Chrome tools (`mcp__claude-in-chrome__navigate`, `read_page`, `javascript_tool`), not the embedded `mcp__Claude_Browser__*` pane. Use only a documented unrestricted JavaScript capability; do not assume that a Playwright-like `evaluate` permits network calls. If the surface is UI-only, DOM-only, or read-only, return to the orchestrator and select the local wrapper.
   - **Local Chrome wrapper:** run `node <skill>/scripts/extract-codex.mjs --runtime-check`. On a table run, start `node <skill>/scripts/extract-codex.mjs <Clay-table-URL> $JOURNAL/extract.json` in a TTY and keep the session id — the wrapper opens Chrome itself and prints `C2F_SIGN_IN_REQUIRED` only if authentication is needed; it prints `C2F_READY {…rowCount…}` after the count precheck and then pauses for step 4. On a workbook run, the first real invocation is step 3a's `--list-tables` (it exits after writing the roster; per-table extraction invocations come at step 5). Do not start a second browser controller.
   - **Embedded pane + unrestricted page JavaScript:** open `https://app.clay.com` with the pane's native browser tools (for legacy Claude Code, `mcp__Claude_Browser__preview_start`, or `navigate` if already open). Read the page to determine sign-in state.
2. **Sign-in gate (if login page shows).** Hand control to the user — guidance depends on the surface:
   - **User-owned Chrome:** no passkey warning needed — they sign in as they normally would. Just: "Sign in to app.clay.com as usual and tell me when you're in."
   - **Embedded in-app pane:** give this guidance, then poll with short waits until the workspace loads:
     > You'll need to sign in. Heads up: **passkeys won't work in this embedded browser** — the prompt can't reach Touch ID or your phone — so **use your password or any other 2FA option** (authenticator code, SMS). The most reliable path is **Clay's email login** (type your email, hit Continue, then enter the one-time code Clay emails you); Google sign-in may be blocked entirely in embedded browsers. Tell me when you're in.
   - **Local Chrome wrapper:** this is an automated Chrome profile dedicated to the skill. On its first use (or after Clay expires the session), ask the user to sign in; Clay email + one-time code is the most reliable route. Future runs reuse the session and require no sign-in work. If a passkey or Google SSO stalls, use the embedded-pane guidance above. Keep polling the running wrapper; it detects completion itself.
   - **Other automated browsers (Playwright-style):** start with the normal ask; if a passkey prompt stalls, give the embedded-pane guidance above.
   If the user reports they cannot sign in at all without a passkey-only Google SSO (e.g. their org enforces it) on an embedded surface, this is a known limitation — say so plainly and stop; do not improvise credential workarounds.
3. **Identify the target.** The pasted URL already created this fresh `$JOURNAL`. A URL containing `/tables/t_…` is a table run even when it also contains a workbook ID; parse its `t_…` and `gv_…` per the reference. A `/workbooks/{wb_…}` URL with no `/tables/` segment is a workbook run; parse `{ws}` and `wb_…` (the workspace id is required — the workbook API is workspace-scoped). If they only know the name, the root must allocate the fresh run immediately after the user confirms the resolved target URL; never inspect prior runs while resolving it.
   **3a. Workbook enumeration + roster gate (workbook runs only).** Run [../scripts/list-workbook.js](../scripts/list-workbook.js) in page context per its header protocol (substitute `__WORKSPACE_ID__`/`__WORKBOOK_ID__`; it returns compact JSON directly — no chunking; note the header's await-prefix quirk for REPL evaluators) or, on the local wrapper, `node <skill>/scripts/extract-codex.mjs --list-tables <workbook-URL> $JOURNAL/workbook.json`. On `{ok:false}`: a `NotFound` error means the workbook is deleted, mistyped, or inaccessible to this Clay account — report exactly that and stop (do not guess at ids); `NoMatchingURL` means the endpoint moved — stop and update the reference. Write the result to `$JOURNAL/workbook.json`. Then show the user the roster — every live table with name, id, and row count, in workbook order — and get an explicit yes before extracting anything. The orchestrator initializes `state.json` with the confirmed roster and exclusions.
4. **Privacy line + row-count pre-check.** On an unrestricted page-JavaScript surface, call `GET /v3/tables/{t}/count` from page context; on a workbook run the counts are already in `$JOURNAL/workbook.json`. On the local wrapper, read the row count from its `C2F_READY` line. Then tell the user, one line, verbatim (say it **once per run** — on workbook runs it covers every confirmed table):
   > Heads up: extraction includes a sample of real people's data from your table(s). Everything stays in this run's local, gitignored folder and goes nowhere except your own Freckle org.
   Say **nothing else about data volume** — no size warnings, row-count consent questions, or time estimates. The three-row pull is one call per table; the full-data decision belongs to close-out. Only exception: if a count is **0**, note briefly that the table has no rows, so no data migration, ground truth, or replay check — migration proceeds on structure alone.
5. **Run the extraction script — three rows only.** The wrapper defaults to `--max 3`; native extraction uses `__MAX_RECORDS__ = 3`. Full config, schema, and sources still come over. On workbook runs, loop the confirmed roster in order, one table at a time, writing each payload to `$JOURNAL/tables/<t_…>/extract.json`; never mix table/view IDs. After extraction, the orchestrator reconciles state.
   - **Unrestricted page-JavaScript browser:** follow [../scripts/extract.js](../scripts/extract.js), set MAX to 3 and SKIP to 0, and JSON.parse-validate the result.
   - **Local wrapper:** after the privacy line, send one newline to the running TTY. It writes the three-row result and retains its authenticated profile. On Workbook runs invoke it once per table using that table's canonical IDs.
6. **Sanity-check** per table: require table name, fields, schema, and `recordsFetched` approximately `min(rowCount, 3)`. Preserve compact action cells with status/display/fullValue. Validate live table references and canonical URLs. Name-only lookup diagnostics never prove a former link. On auth or shape errors, stop rather than guessing.
7. **Route through dependency discovery before preparation (workbook runs).** After the current roster is extracted, the root orchestrator runs `discover-references.js` and handles the expansion gate. If the user includes resolved targets, extract those tables serially from each stored canonical URL into `$JOURNAL/tables/<target-id>/extract.json`, then repeat discovery. Do not re-enumerate or silently absorb the target workbook; only the explicitly selected referenced tables join this migration.

## Historical data migration re-entry (approved only)

The orchestrator re-enters only after the user approves historical data migration. Per selected table:

1. Pull all current records with wrapper `--all` (or native MAX `ALL`) into `extract-rest.json`. Selection is a set difference on stable Clay record IDs.
2. Run `node <skill>/scripts/prepare-backfill.js <table-dir>`. It computes record-ID set difference, reuses the immutable manifest, writes `data-rest.csv`, and produces a checksummed import plan. The `Imported from Clay = true` control column applies to every selected row.
3. Import each `data-rest.csv` directly by idempotent upsert on `Clay Record ID`. Do not run historical rows through the Workflow.

## Exit Contract

1. Return a compact list of completed table IDs and artifact paths; no row values.
2. The orchestrator enters `prepare-workbook` only for Workbook mode; individual-table mode stays on its lean track.
3. Do not start translation or edit shared state here.
