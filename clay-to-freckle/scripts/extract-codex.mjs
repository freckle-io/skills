#!/usr/bin/env node
// Browser-limited host wrapper for extract.js and list-workbook.js.
//
// Opens a visible Chrome/Chromium profile dedicated to this skill, waits for the
// user to sign in to Clay only when that profile has no valid session, performs
// the row-count precheck, pauses for the agent's privacy/large-table gate, then
// runs the same page-context extract.js used by unrestricted native surfaces. Keeping the profile
// makes authentication a one-time bootstrap instead of a per-run task.
//
// Workbook mode: `--list-tables <workbook-URL> <output.json>` enumerates a Clay
// workbook's live tables (name, id, firstViewId, rowCount) via list-workbook.js and
// writes the roster JSON — metadata only, no row data, no pause. The agent then
// confirms the roster with the user and re-invokes this wrapper once per table.
// Table extraction defaults to a three-record build sample. `--all` is reserved
// for the explicitly approved historical data-migration phase.
//
// Sandboxed hosts: when the host cannot launch Chrome at all (Codex seatbelt,
// containers — Chrome crashes on startup), escalate in order:
//   1. `--no-chrome-sandbox` — Chrome's own sandbox may not nest inside another.
//   2. `--connect-cdp <port|endpoint>` — ATTACH to a Chrome the user launched
//      themselves (`"<chrome>" --remote-debugging-port=9222`). It runs outside the
//      sandbox and is already signed in; this script only connects, reuses an
//      app.clay.com tab when present, and disconnects without closing anything it
//      did not open. `--runtime-check --connect-cdp <port>` verifies the attach.
//   3. Have the user run this script from a normal terminal outside the sandbox.
// An unwritable profile dir is non-fatal: it prints C2F_NOTE and uses a temp
// profile (sign-in simply is not retained).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Prefer the active workspace, then fall back to Codex's bundled runtime. This
// avoids adding an npm install step when the workspace has no node_modules link.
const requireFromWorkspace = createRequire(path.join(process.cwd(), '__c2f_loader__.js'));

const fail = (message, code = 1) => {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(code);
};

let chromium;
try {
  ({ chromium } = requireFromWorkspace('playwright'));
} catch (error) {
  const runtimeRoot = path.join(os.homedir(), '.cache', 'codex-runtimes');
  let runtimeCandidates = [];
  try {
    runtimeCandidates = fs.readdirSync(runtimeRoot)
      .map((name) => path.join(runtimeRoot, name, 'dependencies', 'node', 'node_modules', 'playwright'))
      .filter((candidate) => fs.existsSync(candidate));
  } catch { /* not running in Codex, or no bundled runtime */ }

  for (const candidate of runtimeCandidates) {
    try {
      ({ chromium } = requireFromWorkspace(candidate));
      break;
    } catch { /* try the next bundled runtime */ }
  }
  if (!chromium) fail('Playwright is unavailable. Load Codex workspace dependencies or install Playwright in the active workspace.');
}

const rawArgs = process.argv.slice(2);
const runtimeCheck = rawArgs.includes('--runtime-check');
const listTables = rawArgs.includes('--list-tables');
const noChromeSandbox = rawArgs.includes('--no-chrome-sandbox');
const VALUE_FLAGS = ['--skip', '--max', '--chrome-path', '--batch', '--concurrency', '--connect-cdp'];
const positional = rawArgs.filter((arg, index) => {
  if (arg === '--runtime-check' || arg === '--list-tables' || arg === '--all' || arg === '--no-chrome-sandbox') return false;
  if (VALUE_FLAGS.includes(rawArgs[index - 1])) return false;
  return !VALUE_FLAGS.includes(arg);
});

const valueAfter = (flag, fallback = '') => {
  const index = rawArgs.indexOf(flag);
  return index >= 0 ? (rawArgs[index + 1] ?? fallback) : fallback;
};

const targetUrl = positional[0];
const outputPath = positional[1];
const skipRecords = Number.parseInt(valueAfter('--skip', '0'), 10) || 0;
const allRecords = rawArgs.includes('--all');
const maxRaw = allRecords ? 'ALL' : valueAfter('--max', '3');
const maxRecords = allRecords ? 'ALL' : String(Number.parseInt(maxRaw, 10) || 3);
// Empty strings leave extract.js on its validated defaults (batch 500, concurrency 3).
const batchSize = valueAfter('--batch', '');
const concurrency = valueAfter('--concurrency', '');

// Attach mode: connect to a Chrome the USER launched with --remote-debugging-port,
// instead of launching one here. This is the escape hatch for agent hosts whose
// sandbox cannot start Chrome (Codex seatbelt/containers): the browser runs as the
// user's own process, outside the sandbox, already signed in to Clay.
const cdpRaw = valueAfter('--connect-cdp', process.env.C2F_CDP_ENDPOINT || '');
const cdpEndpoint = !cdpRaw ? '' : (/^\d+$/.test(String(cdpRaw).trim()) ? `http://127.0.0.1:${String(cdpRaw).trim()}` : String(cdpRaw).trim());

if (!runtimeCheck && (!targetUrl || !outputPath)) {
  fail('Usage: node extract-codex.mjs <Clay table URL> <output.json> [--max N | --all] [--skip N] [--batch N] [--concurrency N] [--chrome-path PATH] [--connect-cdp PORT|ENDPOINT] [--no-chrome-sandbox]\n       node extract-codex.mjs --list-tables <Clay workbook URL> <output.json> [--chrome-path PATH] [--connect-cdp PORT|ENDPOINT]');
}

const candidates = [
  valueAfter('--chrome-path', ''),
  process.env.C2F_CHROME_PATH || '',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

const chromePath = candidates.find((candidate) => {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

// Attach mode never launches a browser, so a local executable is irrelevant there.
if (!chromePath && !cdpEndpoint) {
  fail('No supported local Chrome/Chromium executable was found. Set C2F_CHROME_PATH to an executable browser path, or attach to a user-launched Chrome with --connect-cdp <port>.');
}

let parsedUrl;
let tableId;
let viewId = '';
let workspaceId = '';
let workbookId = '';
if (!runtimeCheck) {
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    fail('The target is not a valid URL.');
  }
  if (parsedUrl.hostname !== 'app.clay.com') fail('The target URL must be on app.clay.com.');
  tableId = parsedUrl.pathname.match(/(?:^|\/)(t_[A-Za-z0-9]+)(?:\/|$)/)?.[1];
  viewId = parsedUrl.pathname.match(/(?:^|\/)(gv_[A-Za-z0-9]+)(?:\/|$)/)?.[1] || '';
  workspaceId = parsedUrl.pathname.match(/\/workspaces\/(\d+)(?:\/|$)/)?.[1] || '';
  workbookId = parsedUrl.pathname.match(/(?:^|\/)(wb_[A-Za-z0-9]+)(?:\/|$)/)?.[1] || '';
  if (listTables) {
    if (!workbookId) fail('The target URL does not contain a Clay workbook id (wb_...).');
    if (!workspaceId) fail('The target URL does not contain a workspace id — the workbook API is workspace-scoped (expected /workspaces/<id>/workbooks/wb_...).');
  } else if (!tableId) {
    fail('The target URL does not contain a Clay table id (t_...). For a whole workbook, use --list-tables first.');
  }
}

const persistentProfileDir = path.resolve(
  process.env.C2F_PROFILE_DIR || path.join(os.homedir(), '.codex', 'browser-profiles', 'clay-to-freckle')
);
// A sandboxed host (Codex workspace-write, containers) may not allow writes under
// $HOME. Fall back to a temp profile rather than dying — the only cost is that the
// Clay sign-in is not retained between runs.
let profileFallbackReason = null;
const ensureProfileDir = (dir) => {
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.accessSync(dir, fs.constants.W_OK); return dir; }
  catch (error) {
    profileFallbackReason = `${dir} is not writable (${error?.code || error?.message}); using a temporary profile — sign-in will not persist.`;
    return fs.mkdtempSync(path.join(os.tmpdir(), 'clay-to-freckle-profile-'));
  }
};
const profileDir = cdpEndpoint ? null
  : runtimeCheck ? fs.mkdtempSync(path.join(os.tmpdir(), 'clay-to-freckle-check-'))
  : ensureProfileDir(persistentProfileDir);
let context;
let cdpBrowser = null;
let createdPage = null;
let cleaningUp = false;

const cleanup = async () => {
  if (cleaningUp) return;
  cleaningUp = true;
  if (cdpBrowser) {
    // Attached to the user's own Chrome: close only a tab we opened, then
    // DISCONNECT. Never close their context — that would kill their tabs.
    try { await createdPage?.close(); } catch { /* best effort */ }
    try { await cdpBrowser.close(); } catch { /* best effort */ }
  } else {
    try { await context?.close(); } catch { /* best effort */ }
  }
  if (runtimeCheck && profileDir) {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
};

process.once('SIGINT', () => cleanup().finally(() => process.exit(130)));
process.once('SIGTERM', () => cleanup().finally(() => process.exit(143)));

try {
  if (cdpEndpoint) {
    try {
      cdpBrowser = await chromium.connectOverCDP(cdpEndpoint);
    } catch (error) {
      const attachError = new Error(`Could not attach to Chrome at ${cdpEndpoint}: ${error?.message || error}. Have the user launch Chrome with a debugging port first — quit Chrome fully, then run:  "${chromePath || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}" --remote-debugging-port=9222`);
      attachError.exitCode = 4;
      throw attachError;
    }
    context = cdpBrowser.contexts()[0] || await cdpBrowser.newContext();
  } else {
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        executablePath: chromePath,
        headless: runtimeCheck,
        // --no-sandbox is opt-in: Chrome's own sandbox cannot always initialize
        // inside another sandbox (Codex seatbelt, containers), which shows up as an
        // immediate crash on startup.
        args: ['--no-first-run', '--no-default-browser-check',
          ...(noChromeSandbox ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : [])],
        viewport: null
      });
    } catch (error) {
      const hint = noChromeSandbox
        ? 'Chrome still failed to start with --no-sandbox. This host cannot launch a browser; attach to a user-launched Chrome instead: have the user quit Chrome, run  "<chrome> --remote-debugging-port=9222", then re-run this script with --connect-cdp 9222. Running the script from a normal terminal (outside the agent sandbox) also works.'
        : 'Chrome failed to start. If this host is sandboxed (Codex, a container), retry once with --no-chrome-sandbox; if that also fails, attach to a user-launched Chrome with --connect-cdp 9222, or run this script from a normal terminal outside the sandbox.';
      const launchError = new Error(`${error?.message || error}\n${hint}`);
      launchError.exitCode = 5;
      throw launchError;
    }
  }

  if (runtimeCheck) {
    console.log(JSON.stringify({ ok: true, chromePath: chromePath || null, playwright: true, mode: cdpEndpoint ? 'attached' : 'launched', endpoint: cdpEndpoint || null, profileFallback: profileFallbackReason }));
    await cleanup();
    process.exit(0);
  }

  if (profileFallbackReason) console.log(`C2F_NOTE ${profileFallbackReason}`);

  // In attach mode, reuse an existing app.clay.com tab when there is one so the
  // user's own browsing is left alone; only open (and later close) our own tab.
  let page = null;
  if (cdpEndpoint) {
    page = context.pages().find((candidate) => !candidate.isClosed() && candidate.url().startsWith('https://app.clay.com')) || null;
    if (!page) { page = await context.newPage(); createdPage = page; }
  } else {
    page = context.pages()[0] || await context.newPage();
  }
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const signInTimeoutMs = Number.parseInt(process.env.C2F_SIGNIN_TIMEOUT_MS || '600000', 10);
  const startedAt = Date.now();
  const probePath = listTables
    ? `/v3/workspaces/${workspaceId}/workbooks/${workbookId}`
    : `/v3/tables/${tableId}/count`;
  let announcedSignIn = false;
  let ready = false;
  let rowCount = null;

  while (Date.now() - startedAt < signInTimeoutMs) {
    const clayPages = context.pages().filter((candidate) => !candidate.isClosed() && candidate.url().startsWith('https://app.clay.com'));
    if (clayPages.length) page = clayPages[clayPages.length - 1];

    try {
      const result = await page.evaluate(async ({ path }) => {
        const response = await fetch(`https://api.clay.com${path}`, { credentials: 'include' });
        return { status: response.status, text: await response.text() };
      }, { path: probePath });

      if (result.status === 200) {
        if (!listTables) rowCount = JSON.parse(result.text).tableTotalRecordsCount;
        ready = true;
        break;
      }
      if (listTables && result.status === 404) {
        // Authenticated but the workbook does not resolve: deleted, mistyped, or
        // inaccessible to this Clay account ("NotFound"), or the endpoint moved
        // ("NoMatchingURL"). Surface the API's own message and stop.
        let detail = `HTTP 404 on ${probePath}`;
        try { const parsed = JSON.parse(result.text); detail = `${parsed.type}: ${parsed.message}`; } catch { /* keep fallback */ }
        const notFoundError = new Error(`Workbook lookup failed — ${detail}`);
        notFoundError.exitCode = 3;
        throw notFoundError;
      }
      if (result.status !== 401) throw new Error(`Clay ${listTables ? 'workbook' : 'row-count'} precheck failed with HTTP ${result.status}.`);
    } catch (error) {
      if (error?.exitCode === 3) throw error;
      // The login flow can briefly replace or navigate the page; keep polling.
    }

    if (!announcedSignIn) {
      console.log(`C2F_SIGN_IN_REQUIRED ${targetUrl}`);
      announcedSignIn = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (!ready) {
    const timeoutError = new Error('Timed out waiting for a signed-in Clay session.');
    timeoutError.exitCode = 2;
    throw timeoutError;
  }

  if (listTables) {
    // Enumeration is metadata-only (no row data), so there is no consent pause here —
    // the agent's roster-confirmation gate happens in chat before any extraction runs.
    const listScriptPath = fileURLToPath(new URL('./list-workbook.js', import.meta.url));
    const listSource = fs.readFileSync(listScriptPath, 'utf8')
      .replaceAll('__WORKSPACE_ID__', workspaceId)
      .replaceAll('__WORKBOOK_ID__', workbookId);
    const roster = JSON.parse(await page.evaluate(listSource));
    if (!roster.ok) throw new Error(roster.error || 'Workbook enumeration failed.');
    if (!Array.isArray(roster.tables)) throw new Error('Workbook enumeration sanity check failed: tables missing.');
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    const rosterTmp = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(rosterTmp, `${JSON.stringify({ listedAt: new Date().toISOString(), ...roster }, null, 2)}\n`, 'utf8');
    JSON.parse(fs.readFileSync(rosterTmp, 'utf8'));
    fs.renameSync(rosterTmp, outputPath);
    console.log(JSON.stringify({ ok: true, workbook: roster.workbook?.name, tables: roster.tables.length, outputPath: path.resolve(outputPath) }));
    await cleanup();
    process.exit(0);
  }

  console.log(`C2F_READY ${JSON.stringify({ tableId, viewId: viewId || null, rowCount })}`);

  // The agent prints the privacy line and handles the >5,000-row confirmation,
  // then sends one newline to continue. This pause keeps consent before extraction.
  const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  await new Promise((resolve) => input.once('line', resolve));
  input.close();

  if (!page.url().startsWith(targetUrl)) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }

  const scriptPath = fileURLToPath(new URL('./extract.js', import.meta.url));
  const source = fs.readFileSync(scriptPath, 'utf8')
    .replaceAll('__TABLE_ID__', tableId)
    .replaceAll('__VIEW_ID__', viewId)
    .replaceAll('__SKIP_RECORDS__', String(skipRecords))
    .replaceAll('__MAX_RECORDS__', maxRecords)
    .replaceAll('__BATCH_SIZE__', batchSize)
    .replaceAll('__CONCURRENCY__', concurrency);

  const status = JSON.parse(await page.evaluate(source));
  if (!status.ok) throw new Error(status.error || 'Clay extraction failed.');

  const chunks = [];
  for (let index = 0; index < status.chunks; index += 1) {
    chunks.push(await page.evaluate((chunkIndex) => window.__c2fChunk(chunkIndex), index));
  }

  const payload = chunks.join('');
  const extract = JSON.parse(payload);
  if (!extract.table?.name) throw new Error('Extract sanity check failed: table.name is missing.');
  if (!Array.isArray(extract.table?.fields) || extract.table.fields.length === 0) throw new Error('Extract sanity check failed: fields are missing.');
  if (!extract.tableSchema || Object.keys(extract.tableSchema).length === 0) throw new Error('Extract sanity check failed: tableSchema is missing.');
  if (rowCount > 0 && (!Array.isArray(extract.exampleRecords) || extract.exampleRecords.length === 0)) throw new Error('Extract sanity check failed: examples are missing for a non-empty table.');
  const actionFieldIds = extract.table.fields.filter((field) => field.type === 'action').map((field) => field.id);
  const actionCells = (extract.records || []).flatMap((record) => actionFieldIds
    .map((fieldId) => record.cells?.[fieldId])
    .filter((cell) => cell !== undefined && cell !== null));
  if (actionCells.some((cell) => typeof cell !== 'object' || Array.isArray(cell))) {
    throw new Error('Extract sanity check failed: an action cell collapsed to a rendered string instead of a structured envelope.');
  }
  if (skipRecords === 0 && allRecords) {
    const examplesContainStructuredAction = (extract.exampleRecords || []).some((record) => actionFieldIds.some((fieldId) => {
      const value = record[fieldId];
      return value && typeof value === 'object' && !Array.isArray(value);
    }));
    const fullRecordsContainStructuredAction = actionCells.some((cell) => cell.fullValue !== undefined);
    if (examplesContainStructuredAction && !fullRecordsContainStructuredAction) {
      throw new Error('Extract sanity check failed: action examples contain structured data but full records do not.');
    }
  }

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  const extractTmp = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(extractTmp, `${JSON.stringify(extract, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(extractTmp, 'utf8'));
  fs.renameSync(extractTmp, outputPath);
  console.log(JSON.stringify({ ...status, outputPath: path.resolve(outputPath) }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }));
  process.exitCode = error?.exitCode || 1;
} finally {
  await cleanup();
}
