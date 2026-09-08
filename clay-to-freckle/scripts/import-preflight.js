#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicJson, parseCsv, readJson, sha256 } = require('./lib');

const [, , csvPath, manifestPath, extractPath, outPath, maxRowsArg, maxBytesArg] = process.argv;
if (!csvPath || !manifestPath || !extractPath || !outPath) {
  console.error('Usage: node import-preflight.js <data.csv> <approved-manifest.json> <extract.json> <import-plan.json> [maxRows=100] [maxBytes=1800000]');
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
const expectedHeaders = (manifest.columns || []).map((column) => column.name);
const errors = [];
const warnings = [];

if (new Set(headers).size !== headers.length) errors.push('CSV headers are not unique');
if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) errors.push('CSV headers/order do not match the approved manifest');
for (let index = 0; index < body.length; index++) if (body[index].length !== headers.length) errors.push(`Row ${index + 2} has ${body[index].length} cells; expected ${headers.length}`);
if (body.length !== (extract.records || []).length) errors.push(`CSV has ${body.length} rows; extract has ${(extract.records || []).length}`);

const keyName = manifest.key?.column || null;
let blanks = 0;
let duplicates = 0;
if (keyName) {
  const keyIndex = headers.indexOf(keyName);
  if (keyIndex < 0) errors.push(`Approved key column is absent: ${keyName}`);
  else {
    const keys = body.map((row) => row[keyIndex]);
    blanks = keys.filter((value) => !value).length;
    duplicates = keys.filter(Boolean).length - new Set(keys.filter(Boolean)).size;
    if (blanks) errors.push(`${blanks} blank ${keyName} values`);
    if (duplicates) errors.push(`${duplicates} duplicate ${keyName} values`);
  }
} else warnings.push('Keyless historical import: append/retry behavior must be guarded by the import ledger');

const esc = (value) => {
  const string = String(value ?? '');
  return /[",\n\r]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
};
const headerLine = headers.map(esc).join(',') + '\n';
const rowLines = body.map((row) => row.map(esc).join(',') + '\n');
const chunks = [];
let start = 0;
while (start < rowLines.length) {
  let bytes = Buffer.byteLength(headerLine);
  let end = start;
  while (end < rowLines.length && end - start < maxRows && bytes + Buffer.byteLength(rowLines[end]) <= maxBytes) {
    bytes += Buffer.byteLength(rowLines[end]);
    end++;
  }
  if (end === start) { errors.push(`Row ${start + 2} exceeds max import bytes (${maxBytes}) with its header`); end++; }
  chunks.push({ index: chunks.length + 1, startRow: start + 1, endRow: end, rows: end - start, bytes });
  start = end;
}

const fieldsById = Object.fromEntries((extract.table?.fields || []).map((field) => [field.id, field]));
const schema = {};
for (const column of manifest.columns || []) {
  if (column.source === 'recordId') schema[column.name] = 'string';
  else if (Object.prototype.hasOwnProperty.call(column, 'staticValue')) schema[column.name] = typeof column.staticValue;
  else {
    const clayType = fieldsById[column.fieldId]?.type;
    schema[column.name] = clayType === 'number' ? 'number' : clayType === 'date' ? 'date' : clayType === 'checkbox' ? 'boolean' : 'string';
  }
}
const booleanLookingStringColumns = headers.filter((header, index) => schema[header] === 'string' && body.some((row) => /^(true|false)$/i.test(row[index] || '')));
if (booleanLookingStringColumns.length) warnings.push(`Force these text columns to string after import: ${booleanLookingStringColumns.join(', ')}`);

const plan = {
  version: 2,
  ok: errors.length === 0,
  approvedSystemPlanSha256: manifest.systemPlanSha256 || null,
  source: { csv: path.basename(csvPath), sha256: sha256(csvPath), manifestSha256: sha256(manifestPath), extractSha256: sha256(extractPath) },
  rows: body.length,
  columns: headers.length,
  bytes: Buffer.byteLength(csvText),
  key: keyName ? { column: keyName, blank: blanks, duplicates } : null,
  schema,
  forceStringColumns: booleanLookingStringColumns,
  chunkPolicy: { maxRows, maxBytes },
  chunks,
  errors,
  warnings
};
atomicJson(outPath, plan);
console.log(JSON.stringify({ ok: plan.ok, rows: plan.rows, columns: plan.columns, key: keyName, chunks: chunks.length, errors, warnings }));
if (!plan.ok) process.exitCode = 2;
