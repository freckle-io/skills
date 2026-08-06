#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sha256Text = (text) => crypto.createHash('sha256').update(text).digest('hex');

const atomicWrite = (file, contents) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
};

const atomicJson = (file, value) => atomicWrite(file, JSON.stringify(value, null, 2) + '\n');

const dedupeNames = (names, reserved = []) => {
  const used = new Set(reserved);
  return names.map((raw) => {
    const base = String(raw || 'Unnamed column');
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base} (${n++})`;
    used.add(name);
    return name;
  });
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') {
      row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Malformed CSV: unterminated quoted cell');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
};

module.exports = { atomicJson, atomicWrite, dedupeNames, parseCsv, readJson, sha256, sha256Text };
