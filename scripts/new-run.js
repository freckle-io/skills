#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const [, , targetArg, workingDirArg] = process.argv;
if (!targetArg) {
  console.error('Usage: node new-run.js <Clay-table-or-workbook-URL-or-ID> [working-directory]');
  process.exit(1);
}
if (/wf_[A-Za-z0-9]+/.test(targetArg)) throw new Error("Clay's separate Workflows product is not supported");
const tableId = targetArg.match(/(?:\/tables\/|^)(t_[A-Za-z0-9]+)/)?.[1];
const workbookId = targetArg.match(/(?:\/workbooks\/|^)(wb_[A-Za-z0-9]+)/)?.[1];
const targetId = tableId || workbookId;
if (!targetId) throw new Error('Target must contain a Clay wb_… or t_… ID');

const workingDir = path.resolve(workingDirArg || process.cwd());
const base = path.join(workingDir, '.clay-to-freckle-runs');
fs.mkdirSync(base, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, 'Z');
const stem = `${stamp}-${targetId}`;
let journal = path.join(base, stem);
let suffix = 2;
while (fs.existsSync(journal)) journal = path.join(base, `${stem}-${suffix++}`);
fs.mkdirSync(journal, { mode: 0o700 });
fs.writeFileSync(path.join(journal, '.gitignore'), '*\n!.gitignore\n', { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ ok: true, fresh: true, targetId, mode: targetId.startsWith('t_') ? 'table' : 'workbook', journal }));
