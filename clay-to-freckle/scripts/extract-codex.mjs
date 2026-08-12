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
const VALUE_FLAGS = ['--skip', '--max', '--chrome-path', '--batch', '--concurrency'];
const positional = rawArgs.filter((arg, index) => {
  if (arg === '--runtime-check' || arg === '--list-tables' || arg === '--all') return false;
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

if (!runtimeCheck && (!targetUrl || !outputPath)) {
  fail('Usage: node extract-codex.mjs <Clay table URL> <output.json> [--max N | --all] [--skip N] [--batch N] [--concurrency N] [--chrome-path PATH]\n       node extract-codex.mjs --list-tables <Clay workbook URL> <output.json> [--chrome-path PATH]');
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

if (!chromePath) {
  fail('No supported local Chrome/Chromium executable was found. Set C2F_CHROME_PATH to an executable browser path.');
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
const profileDir = runtimeCheck
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'clay-to-freckle-check-'))
  : persistentProfileDir;
if (!runtimeCheck) fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
let context;
let cleaningUp = false;

const cleanup = async () => {
  if (cleaningUp) return;
  cleaningUp = true;
  try { await context?.close(); } catch { /* best effort */ }
  if (runtimeCheck) {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
};

process.once('SIGINT', () => cleanup().finally(() => process.exit(130)));
process.once('SIGTERM', () => cleanup().finally(() => process.exit(143)));

try {
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: runtimeCheck,
    args: ['--no-first-run', '--no-default-browser-check'],
    viewport: null
  });

  if (runtimeCheck) {
    console.log(JSON.stringify({ ok: true, chromePath, playwright: true }));
    await cleanup();
    process.exit(0);
  }

  let page = context.pages()[0] || await context.newPage();
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
