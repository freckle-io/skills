#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicJson, parseCsv, readJson, sha256 } = require('./lib');

const [, , csvPath, manifestPath, extractPath, outPath, maxRowsArg, maxBytesArg] = process.argv;
if (!csvPath || !manifestPath || !extractPath || !outPath) {
  console.error('Usage: node import-preflight.js <data.csv> <csv-manifest.json> <extract.json> <import-plan.json> [maxRows=100] [maxBytes=1800000]');
  process.exit(1);
}

const maxRows = Number(maxRowsArg || 100);
const maxBytes = Number(maxBytesArg || 1800000);
const csvText = fs.readFileSync(csvPath, 'utf8');
const rows = parseCsv(csvText);
if (!rows.length) throw new Error('CSV has no header');
const headers = rows[0];
const body = rows.slice(1);
const manifest = readJson(manifestPath);
const extract = readJson(extractPath);
const errors = [];
const warnings = [];

if (new Set(headers).size !== headers.length) errors.push('CSV headers are not unique');
if (headers[0] !== 'Clay Record ID') errors.push('Clay Record ID must be the first column');
if (headers[headers.length - 1] !== 'Imported from Clay') errors.push('Imported from Clay must be the final column');
for (let i = 0; i < body.length; i++) if (body[i].length !== headers.length) errors.push(`Row ${i + 2} has ${body[i].length} cells; expected ${headers.length}`);
if (body.length !== (extract.records || []).length) errors.push(`CSV has ${body.length} rows; extract has ${(extract.records || []).length}`);

const keyIndex = headers.indexOf('Clay Record ID');
const keys = body.map((r) => r[keyIndex]);
const blanks = keys.filter((v) => !v).length;
const duplicates = keys.length - new Set(keys).size;
if (blanks) errors.push(`${blanks} blank Clay Record ID values`);
if (duplicates) errors.push(`${duplicates} duplicate Clay Record ID values`);

const esc = (value) => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const headerLine = headers.map(esc).join(',') + '\n';
const rowLines = body.map((r) => r.map(esc).join(',') + '\n');
const chunks = [];
let start = 0;
while (start < rowLines.length) {
  let bytes = Buffer.byteLength(headerLine);
  let end = start;
  while (end < rowLines.length && end - start < maxRows) {
    const rowBytes = Buffer.byteLength(rowLines[end]);
    if (bytes + rowBytes > maxBytes) break;
    bytes += rowBytes; end++;
  }
  if (end === start) {
    errors.push(`Row ${start + 2} exceeds max import bytes (${maxBytes}) with its header`);
    end++;
  }
  chunks.push({ index: chunks.length + 1, startRow: start + 1, endRow: end, rows: end - start, bytes });
  start = end;
}

const fieldsById = Object.fromEntries((extract.table?.fields || []).map((f) => [f.id, f]));
const schema = {};
for (const column of manifest.columns || []) {
  if (column.source === 'recordId') schema[column.name] = 'string';
  else if (Object.prototype.hasOwnProperty.call(column, 'staticValue')) schema[column.name] = typeof column.staticValue;
  else {
    const clayType = fieldsById[column.fieldId]?.type;
    schema[column.name] = clayType === 'number' ? 'number' : clayType === 'date' ? 'date' : 'string';
  }
}
const booleanLookingStringColumns = headers.filter((h, idx) => schema[h] === 'string' && body.some((r) => /^(true|false)$/i.test(r[idx] || '')));
if (booleanLookingStringColumns.length) warnings.push(`Force these text columns to string after import: ${booleanLookingStringColumns.join(', ')}`);

const plan = {
  version: 1,
  ok: errors.length === 0,
  source: { csv: path.basename(csvPath), sha256: sha256(csvPath), manifestSha256: sha256(manifestPath), extractSha256: sha256(extractPath) },
  rows: body.length,
  columns: headers.length,
  bytes: Buffer.byteLength(csvText),
  key: { column: 'Clay Record ID', blank: blanks, duplicates },
  schema,
  forceStringColumns: booleanLookingStringColumns,
  chunkPolicy: { maxRows, maxBytes },
  chunks,
  errors,
  warnings
};
atomicJson(outPath, plan);
console.log(JSON.stringify({ ok: plan.ok, rows: plan.rows, columns: plan.columns, bytes: plan.bytes, chunks: chunks.length, errors, warnings }));
if (!plan.ok) process.exitCode = 2;
