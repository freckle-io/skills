// clay-to-freckle workbook enumeration — runs in app.clay.com page context via the
// same unrestricted browser JavaScript surface as extract.js. Read-only in effect.
//
// PROTOCOL (for the extract lane, workbook runs):
//   Replace __WORKSPACE_ID__ (numeric, from the URL) and __WORKBOOK_ID__ (wb_…).
//   Execute the whole file as one javascript_tool call. AWAIT QUIRK: REPL-style
//   evaluators (including Claude in Chrome's javascript_tool) do not auto-await the
//   async IIFE and return {} — prefix the pasted script with `await ` there;
//   Playwright-style page.evaluate needs no prefix. The result is compact JSON
//   returned directly — no chunk protocol needed:
//     {ok:true, workbook:{id,name,description}, tables:[{id,name,firstViewId,rowCount}]}
//   Write it to journal/workbook.json (add a listedAt timestamp when writing).
//   On {ok:false}: errorType "NotFound" → workbook deleted/mistyped/inaccessible to
//   this Clay account (report, stop); "NoMatchingURL" → endpoint moved (stop; update
//   references/clay-v3-api.md); status 401 → session dropped (re-run sign-in).
//
// Tables come back in workbook display order: settings.tablePresentationSettings
// ranks the tables it mentions (the map can be stale/partial), unmentioned tables
// follow in createdAt order. Soft-deleted tables (deletedAt) are skipped.

(async () => {
  const WORKSPACE_ID = '__WORKSPACE_ID__';
  const WORKBOOK_ID = '__WORKBOOK_ID__';

  const api = async (path) => {
    const r = await fetch('https://api.clay.com' + path, { credentials: 'include' });
    let body = null;
    try { body = await r.json(); } catch (e) { /* non-JSON */ }
    if (!r.ok) {
      const err = new Error(r.status + ' on ' + path + ': ' + (body && body.message ? body.message : 'HTTP ' + r.status));
      err.status = r.status;
      err.errorType = body && body.type;
      throw err;
    }
    return body;
  };

  try {
    const base = '/v3/workspaces/' + WORKSPACE_ID + '/workbooks/' + WORKBOOK_ID;
    const workbook = await api(base);
    const tables = (await api(base + '/tables')).filter((t) => !t.deletedAt);

    const order = (workbook.settings && workbook.settings.tablePresentationSettings) || {};
    tables.sort((a, b) => {
      const ai = order[a.id]; const bi = order[b.id];
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });

    const out = [];
    for (const t of tables) {
      let rowCount = null;
      try { rowCount = (await api('/v3/tables/' + t.id + '/count')).tableTotalRecordsCount; }
      catch (e) { /* roster still useful without a count */ }
      out.push({ id: t.id, name: t.name, firstViewId: t.firstViewId, rowCount: rowCount });
    }

    return JSON.stringify({
      ok: true,
      workspaceId: WORKSPACE_ID,
      workbookId: WORKBOOK_ID,
      workbook: { id: workbook.id, name: workbook.name, description: workbook.description },
      tables: out
    });
  } catch (e) {
    return JSON.stringify({ ok: false, status: e.status || null, errorType: e.errorType || null, error: String(e.message || e) });
  }
})()
