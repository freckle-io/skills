// clay-to-freckle extraction script — runs in app.clay.com page context via the
// agent's unrestricted browser JavaScript-evaluation tool (preferably a connected
// user-owned Chrome session, otherwise another qualifying surface). DOM-only/read-only
// browser evaluators do not qualify because this script makes authenticated fetches.
// API calls are read-only in effect; the session cookie applies automatically.
//
// PROTOCOL (for the extract lane):
//   1. Replace __TABLE_ID__ (and __VIEW_ID__ — empty string is fine, falls back to
//      firstViewId). __SKIP_RECORDS__/__MAX_RECORDS__ control the data pull. An
//      unreplaced max defaults to the three-record build sample. Replace max with
//      ALL only after the user approves historical data migration.
//      __BATCH_SIZE__/__CONCURRENCY__ tune the bulk fetch (defaults 500 and 3 when
//      left unreplaced — validated live; drop toward 50/1 only if a table's rows are
//      so heavy that batch responses fail or the browser strains).
//      Execute the whole file as one javascript_tool call. It returns a small JSON
//      status: {ok, bytes, chunks, table, fields, examples, rowCount, recordsFetched}.
//      AWAIT QUIRK (validated live 2026-08-04): REPL-style evaluators — including
//      Claude in Chrome's javascript_tool — do NOT auto-await the async IIFE's
//      promise and return {} instead of the status. On such surfaces prefix the
//      pasted script with `await `. Playwright-style page.evaluate awaits it
//      automatically; do not add the prefix inside this file.
//   2. Retrieve the payload — two transports, in preference order:
//      a. LOCALHOST RECEIVER (preferred whenever the agent can run a local Node
//         process): start a one-shot HTTP server on 127.0.0.1 that writes the request
//         body to journal/extract.json and exits. It must answer OPTIONS preflights
//         with CORS + private-network headers (Access-Control-Allow-Origin: *,
//         Access-Control-Allow-Private-Network: true, Access-Control-Allow-Headers: *,
//         Access-Control-Allow-Methods: POST,OPTIONS), then accept one POST. In the
//         page, call  window.__c2fPost(port)  — the whole payload lands on disk in a
//         single call with nothing ferried through tool results. JSON.parse-validate
//         the file before declaring success.
//      b. CHUNKED PULL (fallback when no local listener is possible; also what
//         extract-codex.mjs uses internally): window.__c2fChunk(i) for
//         i = 0 .. chunks-1 (30,000 chars each; results stay under tool truncation
//         limits) — or window.__c2fChunkB64(i) when raw JSON inside tool results
//         risks mangling. Concatenate in order, JSON.parse to verify, write to
//         journal/extract.json.
//   3. On {ok:false}: 401 means the session dropped (re-run sign-in); 404 means the
//      endpoint moved (stop; update references/clay-v3-api.md before proceeding).
//
// Payload trimming (documented in references/clay-v3-api.md): actionDefinition keeps
// semantic content only; ordinary cells keep their .value; action cells keep a compact
// {status, displayValue, fullValue} envelope. Cell metadata, run ids/hashes/logs,
// credit bookkeeping, and recordMetadata are dropped; soft-deleted records are skipped.

(async () => {
  const TABLE_ID = '__TABLE_ID__';
  let VIEW_ID = '__VIEW_ID__';
  const SKIP_RECORDS = parseInt('__SKIP_RECORDS__', 10) || 0; // 0 = from the start
  const MAX_RAW = '__MAX_RECORDS__';
  const MAX_RECORDS = MAX_RAW === 'ALL' ? Infinity : (parseInt(MAX_RAW, 10) || 3);
  const CHUNK = 30000;
  // Bulk-fetch tuning, validated live 2026-08-05 (see references/clay-v3-api.md):
  // Clay accepts batches of at least 2,000 ids and 4 concurrent calls without rate
  // limiting; 500/batch (~17MB responses on a 37-action-field table) with 3 in
  // flight is the safe default. Unreplaced placeholders fall back to the defaults.
  const BATCH = parseInt('__BATCH_SIZE__', 10) || 500;
  const CONCURRENCY = parseInt('__CONCURRENCY__', 10) || 3;

  const api = async (path, opts) => {
    const r = await fetch('https://api.clay.com' + path, Object.assign({ credentials: 'include' }, opts || {}));
    let body = null;
    try { body = await r.json(); } catch (e) { /* non-JSON */ }
    if (!r.ok) {
      const msg = body && body.message ? body.message : ('HTTP ' + r.status);
      const err = new Error(r.status + ' on ' + path + ': ' + msg);
      err.status = r.status;
      throw err;
    }
    return body;
  };

  const slimActionDef = (def) => {
    if (!def || typeof def !== 'object') return def;
    const keep = ['key', 'name', 'displayName', 'description', 'version', 'package',
      'categories', 'inputParameterSchema', 'outputParameterSchema',
      'suggestedOutputParams', 'requiredInputCombinations', 'auth'];
    const out = {};
    for (const k of keep) if (def[k] !== undefined) out[k] = def[k];
    return out;
  };

  const collectTableRefs = (value, evidence, path, out) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') {
      for (const match of value.matchAll(/t_[A-Za-z0-9]{10,}/g)) {
        if (match[0] !== TABLE_ID) out.push({ targetId: match[0], evidence, path });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => collectTableRefs(item, evidence, `${path}[${index}]`, out));
      return;
    }
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) collectTableRefs(item, evidence, path ? `${path}.${key}` : key, out);
    }
  };

  const tableUrl = (target) => {
    if (!target?.workspaceId || !target?.id) return null;
    if (target.workbookId && target.firstViewId) return `https://app.clay.com/workspaces/${target.workspaceId}/workbooks/${target.workbookId}/tables/${target.id}/views/${target.firstViewId}`;
    return `https://app.clay.com/workspaces/${target.workspaceId}/tables/${target.id}`;
  };

  try {
    const tableRes = await api('/v3/tables/' + TABLE_ID);
    const table = tableRes.table || tableRes;
    if (!VIEW_ID) VIEW_ID = table.firstViewId;

    const countRes = await api('/v3/tables/' + TABLE_ID + '/count');
    const schemaRes = await api('/v3/tables/' + TABLE_ID + '/views/' + VIEW_ID + '/table-schema-v2');
    let sources = null;
    try { sources = await api('/v3/sources?tableId=' + TABLE_ID); }
    catch (e) { sources = { unavailable: String(e.message || e) }; }

    // Resolve active cross-table configuration while the authenticated Clay page
    // context is available. A lookup-like column name is never treated as evidence:
    // only a live t_… reference in typeSettings/sources creates a table link.
    const rawRefs = [];
    for (const field of table.fields || []) {
      collectTableRefs(field.typeSettings || {}, { kind: 'field', fieldId: field.id, fieldName: field.name }, 'typeSettings', rawRefs);
    }
    collectTableRefs(sources, { kind: 'source' }, 'sources', rawRefs);
    const refsByTarget = new Map();
    for (const ref of rawRefs) {
      if (!refsByTarget.has(ref.targetId)) refsByTarget.set(ref.targetId, []);
      const evidenceKey = JSON.stringify(ref);
      if (!refsByTarget.get(ref.targetId).some((item) => JSON.stringify(item) === evidenceKey)) refsByTarget.get(ref.targetId).push(ref);
    }
    const tableReferences = [];
    for (const [targetId, evidence] of refsByTarget) {
      try {
        const targetRes = await api('/v3/tables/' + targetId);
        const target = targetRes.table || targetRes;
        let rowCount = null;
        try {
          const targetCount = await api('/v3/tables/' + targetId + '/count');
          rowCount = targetCount?.tableTotalRecordsCount ?? null;
        } catch (_) { /* metadata and URL are still useful without a count */ }
        tableReferences.push({
          targetId,
          status: target.deletedAt ? 'deleted' : 'resolved',
          target: {
            id: target.id,
            name: target.name,
            workspaceId: target.workspaceId,
            workbookId: target.workbookId || null,
            firstViewId: target.firstViewId || null,
            rowCount,
            deletedAt: target.deletedAt || null,
            url: tableUrl(target)
          },
          evidence
        });
      } catch (error) {
        tableReferences.push({
          targetId,
          status: error.status === 404 ? 'not_found_or_inaccessible' : 'unresolved',
          target: null,
          evidence,
          error: `HTTP ${error.status || 'unknown'}`
        });
      }
    }
    const activeFieldRefIds = new Set(rawRefs.filter((ref) => ref.evidence?.kind === 'field').map((ref) => ref.evidence.fieldId));
    const lookupLikeColumnsWithoutActiveReference = (table.fields || [])
      .filter((field) => /lookup.*(?:table|rows)|(?:table|rows).*lookup/i.test(field.name || '') && !activeFieldRefIds.has(field.id))
      .map((field) => ({ fieldId: field.id, fieldName: field.name, status: 'no_active_target_in_current_config' }));

    // Full cell data: all record ids, then bulk-fetch in batches of 50. Request
    // external content for action fields so successful enrichment cells retain
    // their structured provider payload instead of only a rendered status label.
    const idsRes = await api('/v3/tables/' + TABLE_ID + '/views/' + VIEW_ID + '/records/ids');
    const allIds = (idsRes.results || []).slice(SKIP_RECORDS, SKIP_RECORDS + MAX_RECORDS);
    const externalContentFieldIds = (table.fields || [])
      .filter((field) => field.type === 'action')
      .map((field) => field.id);
    const actionFieldIds = new Set(externalContentFieldIds);
    const fetchBatch = async (batchIds) => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await api('/v3/tables/' + TABLE_ID + '/bulk-fetch-records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recordIds: batchIds,
              includeExternalContentFieldIds: externalContentFieldIds
            })
          });
        } catch (e) {
          // 401 aborts (session drop); 429/5xx/network errors back off and retry.
          const retriable = !e.status || e.status === 429 || e.status >= 500;
          if (!retriable || attempt >= 3) throw e;
          await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
        }
      }
    };

    const batches = [];
    for (let i = 0; i < allIds.length; i += BATCH) batches.push(allIds.slice(i, i + BATCH));
    const records = [];
    for (let g = 0; g < batches.length; g += CONCURRENCY) {
      const groupResults = await Promise.all(batches.slice(g, g + CONCURRENCY).map(fetchBatch));
      for (const batchRes of groupResults) {
        for (const rec of (batchRes.results || [])) {
          if (!rec || rec.deletedBy) continue;
          const cells = {};
          for (const fid of Object.keys(rec.cells || {})) {
            const cell = rec.cells[fid];
            if (!cell) continue;
            if (actionFieldIds.has(fid)) {
              const status = cell.externalContent?.status ?? cell.metadata?.status;
              const displayValue = cell.value;
              const fullValue = cell.externalContent?.fullValue;
              if (status !== undefined || displayValue !== undefined || fullValue !== undefined) {
                cells[fid] = {
                  ...(status !== undefined ? { status } : {}),
                  ...(displayValue !== undefined ? { displayValue } : {}),
                  ...(fullValue !== undefined ? { fullValue } : {})
                };
              }
            } else if (cell.value !== undefined) {
              cells[fid] = cell.value;
            }
          }
          records.push({ id: rec.id, cells: cells, createdAt: rec.createdAt, updatedAt: rec.updatedAt });
        }
      }
    }

    for (const f of table.fields || []) {
      if (f.actionDefinition) f.actionDefinition = slimActionDef(f.actionDefinition);
    }

    const extract = {
      extractedAt: new Date().toISOString(),
      workspaceId: table.workspaceId,
      tableId: TABLE_ID,
      viewId: VIEW_ID,
      rowCount: countRes ? countRes.tableTotalRecordsCount : null,
      recordsFetched: records.length,
      recordsSkipOffset: SKIP_RECORDS,
      table: table,
      tableSchema: schemaRes.tableSchema,
      exampleRecords: schemaRes.exampleRecords,
      records: records,
      sources: sources,
      tableReferences,
      lookupLikeColumnsWithoutActiveReference
    };

    const s = JSON.stringify(extract);
    window.__c2fPayload = s;
    window.__c2fChunk = (i) => s.slice(i * CHUNK, (i + 1) * CHUNK);
    window.__c2fChunkB64 = (i) => {
      const bytes = new TextEncoder().encode(s.slice(i * CHUNK, (i + 1) * CHUNK));
      let bin = '';
      for (let k = 0; k < bytes.length; k++) bin += String.fromCharCode(bytes[k]);
      return btoa(bin);
    };
    window.__c2fPost = (port) =>
      fetch('http://127.0.0.1:' + port + '/', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: s
      }).then((r) => r.status);

    return JSON.stringify({
      ok: true,
      bytes: s.length,
      chunks: Math.ceil(s.length / CHUNK),
      table: table.name,
      fields: (table.fields || []).length,
      examples: (schemaRes.exampleRecords || []).length,
      rowCount: extract.rowCount,
      recordsFetched: records.length,
      tableReferences: tableReferences.length,
      unresolvedTableReferences: tableReferences.filter((ref) => ref.status !== 'resolved').length,
      lookupLikeColumnsWithoutActiveReference: lookupLikeColumnsWithoutActiveReference.length
    });
  } catch (e) {
    return JSON.stringify({ ok: false, status: e.status || null, error: String(e.message || e) });
  }
})()
