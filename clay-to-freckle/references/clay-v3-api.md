# Clay v3 API Reference

Clay's internal, unversioned API — the same calls Deepline's bookmarklet makes. It can change without notice; when a call's shape disagrees with this file, trust the live response and record the diff in a table-scoped result warning for the orchestrator (installed skills may be read-only). Validated live 2026-08-04 against real tables.

Sections: Auth & sign-in · URL parsing · Endpoints · Quirks

## Auth & transport

- Host: `https://api.clay.com`. Call from **app.clay.com page context** with `credentials: 'include'` — the `claysession` cookie applies automatically. Prefer a connected user-owned Chrome session when its tooling supports unrestricted async page-context JavaScript. UI-only computer use and DOM-only/read-only evaluation do not qualify. Otherwise use `scripts/extract-codex.mjs`, which launches a dedicated persistent local Chrome/Chromium profile and runs the same page-context script; an unrestricted embedded JavaScript surface is the last resort. CORS permits the calls (it's how Clay's own app works).
- Unauthenticated → `401 {"type":"Unauthorized","message":"You must be logged in"}` (session dropped: send the user back through sign-in).
- Bad path → `404 {"type":"NoMatchingURL","message":"Invalid URL"}` (endpoint moved/renamed: stop and report, don't guess).

### Sign-in guidance (the browser surface matters)

- **Embedded panes and automated profiles** (including most Playwright-style browsers): passkeys may not work because WebAuthn prompts cannot reliably reach Touch ID or a phone (often dies with "Something went wrong / check Bluetooth"). The user must use a password or another 2FA option (authenticator code, SMS). Most reliable: Clay's email login — email → Continue → one-time code typed into the pane. "Sign in with Google" may additionally be refused outright in webviews ("this browser or app may not be secure").
- **The user's own real Chrome/Safari session** driven through a connected browser/computer-use surface: passkeys work normally — no warning needed.
- Users whose org enforces passkey-only Google SSO may be unable to sign in on an embedded surface at all. Known limitation; say so and stop.

## URL parsing

- Canonical: `https://app.clay.com/workspaces/{ws}/workbooks/{wb_…}/tables/{t_…}/views/{gv_…}`
- Also valid (home-screen links): `/workspaces/{ws}/tables/{t_…}` — no workbook/view segments.
- **Workbook URL** (no `/tables/` segment): `/workspaces/{ws}/workbooks/{wb_…}` — identifies a workbook, i.e. a container of tables. The workspace id in the path is load-bearing: the workbook API is workspace-scoped (below).
- Regexes: table `t_[A-Za-z0-9]+`, view `gv_[A-Za-z0-9]+`, workbook `wb_[A-Za-z0-9]+`.
- No view in the URL → use `table.firstViewId` from the table config.
- Never mix ids across tables: template-copied tables have been observed sharing a `firstViewId` value — always take the (table, view) pair from the same table's config/URL.

## Endpoints (validated)

### `GET /v3/tables/{t}` — table config

Returns `{table, extraData}` (`extraData` observed empty).

`table`: `id, workspaceId, name, description, type, icon, parentFolderId, tableSettings, fieldGroupMap, workbookId, budgetId, ownerId, abilities, firstViewId, owner, fields, views, …`

- `fields` is an **array**. Every field: `id (f_…), tableId, type, name, typeSettings, isLocked, …`. Types seen: `text`, `date`, `formula`, `action`.
- **`action` fields** — enrichments and integration pushes:
  - `typeSettings`: `actionKey` (e.g. `enrich-person`, `use-ai`, `leadmagic-find-linkedin-profile`), `actionVersion`, `actionPackageId`, `inputsBinding`, `authAccountId`, `dataTypeSettings`
  - `inputsBinding`: array of `{name, formulaText}` (map-shaped inputs such as `headers`/`queryString` carry `formulaMap` instead). **For `actionKey: "use-ai"` (Claygent), the binding named `prompt` carries the full verbatim prompt** as a formula string with `{{f_…}}` field references concatenated in; the binding named `useCase` is `"claygent"`.
  - **Run conditions** (validated live 2026-08-04): the condition formula lives at `typeSettings.conditionalRunFormulaText` (e.g. `{{f_…}}?.toLowerCase()!=="gmail.com"`), with the prompt that generated it at `typeSettings.conditionalRunFormulaPrompt`; both null when no condition is set. Top-level `conditionalRunFieldIds` lists only the *referenced field ids* — read the formula text for the actual gate. Cells skipped by a condition get status `ERROR_RUN_CONDITION_NOT_MET`.
  - **Auth**: `typeSettings.authAccountId` (`aa_…`) points to a Clay-managed auth account. Observed live: an `http-api-v2` column's inline secret header (`X-TOKEN` in the `headers` formulaMap) later moved into an auth account, after which the secret appears nowhere in the column config. Check both places when hunting credentials; an inline secret is a migration flag (managed credential in the destination), and a bare `authAccountId` means the secret itself is not extractable.
  - Top-level: `inputFieldIds`, `conditionalRunFieldIds`, `delayFieldIds`, `groupId`, `actionDefinition` (catalog metadata: `key, displayName, description, inputParameterSchema, outputParameterSchema, pricing, auth, …` — large). **`outputParameterSchema` is an array** of `{name, type, outputPath, displayName, sampleValue, semanticType}` entries (validated 2026-08-05, not JSON-schema); it can be empty even on real enrichments.
- **`formula` fields**: `typeSettings` — two live shapes (validated 2026-08-05): most formulas carry **`formulaText`** (a single formula string with `{{f_…}}` refs) plus optionally `formulaPrompt` (the natural-language prompt that generated it — carry both verbatim) and `mappedResultPath`; waterfall-style formulas instead carry `formulaWaterfall` — an **ordered array of rung objects** `{formula: "…"}` or `{prompt: "…"}` (prompt-generated rungs; validated 2026-08-05 — not plain strings), each referencing provider fields (`{{f_…}}?.path.to.value`), with `waterfallType`/`truncateValue`. Waterfall provider order = map referenced field ids → those fields' `actionKey`s. Dependency edges must scan `formulaText` **and** `formulaWaterfall`.
- `views`: array of `{id (gv_…), name, description, order, fields, sort, filter, limit, offset, …}` — the full view list; no extra call needed for find-by-view-name.
- `tableSettings`: boolean flags (`HAS_SIGNALS`, `HAS_SCHEDULED_RUNS`, `HAS_SCHEDULED_SOURCES`) — hints only; actual sources come from the sources endpoint.
- Dependency-graph edge sources (all three, complementary): `inputFieldIds` + `conditionalRunFieldIds`, `{{f_…}}` in `inputsBinding[].formulaText`, `{{f_…}}` in `formulaWaterfall` strings.
- **Cross-table references:** recursively scan live field `typeSettings` and source payloads for `t_…` ids. Resolve each with `GET /v3/tables/{t}` while the authenticated page context is available; use `workspaceId`, `workbookId`, `id`, and `firstViewId` to construct the canonical Clay URL and optionally call `/count` for the row count. A column name containing “lookup” is not relationship evidence. If its current configuration contains no target id, record only `no_active_target_in_current_config`; never infer that a link was flattened, removed, or formerly existed.

### `GET /v3/tables/{t}/views/{gv}/table-schema-v2` — schema + rendered examples

Returns `{tableSchema, exampleRecords}`.

- `tableSchema`: object **keyed by field id** → `{type: basic|action|formula…, name, dataType, semanticType, children}`. `semanticType` values seen: `email`, `full-name`, `company-name`, `company-linkedin-url` — use these for the deterministic-vs-AI split in parity. Action entries nest `children` describing rendered output structure.
- `exampleRecords`: array of **flat records keyed by field id** → rendered values, plus `f_created_at`/`f_updated_at`. Observed: 27 examples on a 100-row table (documented range ~2–66).

### `GET /v3/tables/{t}/count`

`{tableTotalRecordsCount: <number>}` — cheap pre-check before extraction; 0 means no ground truth.

### Workbook endpoints (validated live 2026-08-04)

All workspace-scoped — a bare `/v3/workbooks/{wb}` is 404 `NoMatchingURL`. The 404 vocabulary matters here: `{"type":"NoMatchingURL","message":"Invalid URL"}` means the *path* is wrong (endpoint moved — stop and report), while `{"type":"NotFound","message":"Workbook not found"}` means the path is right but the workbook is deleted, mistyped, or inaccessible to this account (report it to the user; do not retry).

#### `GET /v3/workspaces/{ws}/workbooks` — list workbooks

200 → array of workbook objects: `id (wb_…), workspaceId, name, description, parentFolderId, settings, annotations, defaultAccess, ownerId, createdAt, updatedAt, deletedAt, isHidden, isHiddenFromNavigation, creditLimit, budgetId, abilities, tags`. **Quirk:** the array can contain `wf_…` ids (Clay's separate "Workflows" product leaks into this listing) — filter to `wb_` when enumerating workbooks.

#### `GET /v3/workspaces/{ws}/workbooks/{wb}` — one workbook

200 → the same workbook object. `settings` may carry `isAutoRun` and `tablePresentationSettings` (`{t_… → display order index}`). **`tablePresentationSettings` can be stale/partial** — observed live: a workbook whose newest table was absent from the map. Use it only to order tables it does mention; the `/tables` endpoint below is the sole authority on membership.

#### `GET /v3/workspaces/{ws}/workbooks/{wb}/tables` — the workbook's tables

200 → array of **full table config objects**, same shape as `GET /v3/tables/{t}`'s `table` (id, name, description, type, icon, tableSettings, fieldGroupMap, workbookId, abilities, firstViewId, owner, fields, views, deletedAt, …). Observed `type`: `spreadsheet`. For enumeration, keep `{id, name, firstViewId, deletedAt}` per table and skip entries with non-null `deletedAt`; each table's `(id, firstViewId)` pair comes from the same object, satisfying the never-mix-ids rule. Per-table extraction still runs the normal `extract.js` route (schema, count, records, sources are separate per-table calls).

### `GET /v3/sources?tableId={t}` — table-level sources

200 with an array. **Sources do not appear in the table config JSON at all** — this endpoint is the only place to find them (imports, scheduled searches, CRM sync-in). Caveat: the non-empty element shape is unvalidated (validation table had none) — inspect live and carry what you find into the brief as intent.

## Quirks

- **REPL evaluators don't auto-await the extraction scripts** (observed live 2026-08-04 on Claude in Chrome's `javascript_tool`): both `extract.js` and `list-workbook.js` are async IIFEs; a REPL-style surface returns `{}` instead of the result unless the pasted script is prefixed with `await `. Playwright-style `page.evaluate` (the local wrapper) awaits automatically. An empty-object result from either script means the promise wasn't awaited — re-run with the prefix, don't diagnose it as an API change.
- **Renderer freeze / CDP timeout on heavy pulls** (observed live 2026-08-05): on Claude in Chrome, a heavy page-context evaluation (parsing a multi-MB bulk-fetch response) can exceed the tool's 45s CDP timeout — "The renderer may be frozen or unresponsive." The script is usually still running. Do **not** re-run extraction; wait a few seconds, then probe cheaply (`typeof window.__c2fPayload` / `window.__c2fPayload?.length`) and continue retrieval once the payload exists.
- **Local Network Access permission gates the localhost receiver** (observed live 2026-08-05): the first `window.__c2fPost(port)` to 127.0.0.1 hangs silently — no preflight, no error — until the user clicks Chrome's one-time **Allow** prompt for local-network access on app.clay.com. Fire the POST without awaiting it, ask the user to click Allow, then verify the file landed; subsequent POSTs are instant for that origin.
- **Claude in Chrome tool results pass a content filter** (observed live 2026-08-05): long uniform/base64-looking strings in `javascript_tool` results are replaced with "[BLOCKED: Base64 encoded data]", making `__c2fChunkB64` unusable on that surface. Raw JSON chunks (`__c2fChunk`) pass; the localhost receiver avoids the issue entirely and stays the preferred transport.
- **Action-cell status vocabulary** (observed live 2026-08-04): `SUCCESS`, `SUCCESS_NO_DATA` (ran, provider found nothing — e.g. "No profile found" / "Company Not Found"), `ERROR_TIMEOUT`, `ERROR_INVALID_INPUT`, `ERROR_BLANK_TOKEN` (a blank *input reference* — the bound column was empty; **not** an auth error despite the name), `ERROR_RUN_CONDITION_NOT_MET` (run condition evaluated false). Treat the list as open.
- **Session persistence depends on the surface.** User-owned Chrome normally keeps its existing session; the local wrapper deliberately retains its dedicated profile. Embedded-pane cookies can drop when the pane restarts (observed: session valid, then 401 twenty minutes later in a new session). On an embedded resume, expect to re-run the sign-in gate before extraction calls.
- **Empty tables** → `exampleRecords: []`. Handle before extraction via `/count`.
- **Sparse examples** — records contain only populated cells; per-column density on the validation table ranged 0–20 of 27. Ground-truth rows must be chosen where inputs AND deliverables are populated.
- **Size** — the migration's standard pull is **three records** (`MAX_RECORDS=3`) while full configuration, schema, and sources still come over. Full-table pulls happen only after explicit historical-data approval (`MAX_RECORDS=ALL` or wrapper `--all`). Bulk fetch may still use 500-record internal batches with three requests in flight.
- Pushes are action fields with integration `actionKey`s (CRM/sequencer/Slack) — inferred, not yet observed live; confirm on first real push-bearing table and update this file.

### `GET /v3/tables/{t}/views/{gv}/records/ids` — all record ids

200 → `{results: ["r_…", …]}` for the view. Feed these to bulk-fetch in batches of 50.

### `POST /v3/tables/{t}/bulk-fetch-records` — full cell data

Body `{recordIds: [ids], includeExternalContentFieldIds: [action field ids]}` → 200 `{results: [record…]}`. A fetch-POST — read-only in effect. Supplying action field ids is required to retain structured enrichment content where Clay exposes it; an empty list can collapse action cells to rendered status labels.

**Batch size & concurrency (validated live 2026-08-05):** the old 50-id batch was convention, not a server cap — 100/200/500/1,000/2,000-id batches and 4 concurrent calls all returned 200 with full results and no rate limiting (a 2,000-record batch on an 89-field / 37-action-field table was ~59MB in ~6s; 500 ≈ 17MB). `extract.js` defaults to 500/batch with 3 in flight and retries 429/5xx/network errors with backoff (401 still aborts as a session drop). Treat larger batches as available headroom, not a guarantee — drop toward 50/1 if a table's rows are heavy enough that responses fail or the browser strains.

Record: `{id (r_…), tableId, cells, recordMetadata, createdAt, updatedAt, deletedBy, dedupeValue}`.
- **`cells[f_id] = {value?, metadata?, externalContent?}`** — values are wrapped, unlike `exampleRecords`' flat values. Ordinary cells use `.value`. Requested action fields may expose the structured provider result at `externalContent.fullValue` even when `.value` is absent or only a rendered label. The extraction script stores action cells as `{status, displayValue, fullValue}` and drops run ids, input hashes, logs, credit bookkeeping, cell metadata, and `recordMetadata`.
- Skip records with non-null `deletedBy` when building the data CSV.
