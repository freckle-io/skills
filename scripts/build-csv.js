#!/usr/bin/env node
// clay-to-freckle CSV builder — deterministic journal/extract.json → journal/data.csv.
//
// Usage:  node build-csv.js <extract.json> <csv-manifest.json> <out.csv>
//
// csv-manifest.json is written by the translate lane after column classification:
//   { "columns": [ { "source": "recordId", "name": "Clay Record ID" },
//                  { "fieldId": "f_…", "name": "Email" }, … ] }
// Column order in the manifest is the CSV column order. Records come from
// extract.records (cells already unwrapped to plain values by extract.js). Prefer
// Clay's explicit Created At / Updated At cells when present; record-level timestamps
// are only a fallback because the two representations can differ by milliseconds.
// Object/array values are JSON-stringified.

const fs = require('fs');

const [, , extractPath, manifestPath, outPath] = process.argv;
if (!extractPath || !manifestPath || !outPath) {
  console.error('Usage: node build-csv.js <extract.json> <csv-manifest.json> <out.csv>');
  process.exit(1);
}

const extract = JSON.parse(fs.readFileSync(extractPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const columns = manifest.columns;
if (!Array.isArray(columns) || columns.length === 0) {
  console.error('Manifest has no columns');
  process.exit(1);
}
const records = extract.records || [];

const recordValue = (record, column) => {
  if (Object.prototype.hasOwnProperty.call(column, 'staticValue')) return column.staticValue;
  if (column.source === 'recordId') return record.id;
  const cellValue = (record.cells || {})[column.fieldId];
  if (cellValue !== undefined) return cellValue;
  if (column.fieldId === 'f_created_at') return record.createdAt;
  if (column.fieldId === 'f_updated_at') return record.updatedAt;
  return undefined;
};

const esc = (v) => {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
};

const lines = [columns.map((c) => esc(c.name)).join(',')];
for (const rec of records) {
  lines.push(columns.map((c) => esc(recordValue(rec, c))).join(','));
}

const atomicWrite = (target, contents) => {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, target);
};

atomicWrite(outPath, lines.join('\n') + '\n');

const nonEmpty = {};
for (const c of columns) {
  nonEmpty[c.name] = records.filter((r) => {
    const v = recordValue(r, c);
    return v !== undefined && v !== null && v !== '';
  }).length;
}
console.log(JSON.stringify({ rows: records.length, columns: columns.length, nonEmptyPerColumn: nonEmpty }, null, 1));
