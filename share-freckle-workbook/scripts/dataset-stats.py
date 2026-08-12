#!/usr/bin/env python3
"""Paginate a Freckle Dataset and report stat candidates for a workflow card.

Usage: python3 dataset-stats.py <workbook-id> <dataset-id> --org-id <org>
Emits JSON: total, per-field fill counts, and value distributions for
low-cardinality fields (tiers, statuses, sources) — the raw material for
outcome stats. Positivity judgment happens in the skill, not here.
"""
import json
import subprocess
import sys
import tempfile
from collections import Counter

wb, ds = sys.argv[1], sys.argv[2]
org = sys.argv[sys.argv.index('--org-id') + 1] if '--org-id' in sys.argv else None

entries, cursor = [], None
while True:
    cmd = ['freckle', 'workbook', 'dataset', 'entry', 'list', wb, ds, '--limit', '500', '--json']
    if org:
        cmd += ['--org-id', org]
    if cursor:
        cmd += ['--cursor', cursor]
    # The CLI truncates PIPED stdout at 64KB (exits without flushing), which
    # silently corrupts any page holding wide rows. A real file never truncates.
    with tempfile.TemporaryFile('w+') as fh:
        out = subprocess.run(cmd, stdout=fh, stderr=subprocess.PIPE, text=True)
        fh.seek(0)
        raw = fh.read()
    if out.returncode != 0:
        json.dump({'error': out.stderr.strip()[:300], 'total': len(entries)}, sys.stdout)
        sys.exit(0)
    try:
        d = json.loads(raw)
    except json.JSONDecodeError as e:
        json.dump({'error': f'unparseable CLI output at page {len(entries)//500 + 1}: {e}',
                   'total': len(entries)}, sys.stdout)
        sys.exit(0)
    entries += d['entries']
    cursor = d.get('nextCursor')
    if not cursor:
        break

def flatten(v):
    """One level of nesting, dotted. Rows usually wrap the real fields in a
    `result`/`properties` object — without this every row reads 100% filled on
    the wrapper and no genuine coverage is ever visible."""
    flat = {}
    for k, x in v.items():
        if isinstance(x, dict):
            for k2, x2 in x.items():
                flat[f'{k}.{k2}'] = x2
        else:
            flat[k] = x
    return flat


vals = [flatten(e['value']) for e in entries if isinstance(e.get('value'), dict)]
fields = Counter()
for v in vals:
    fields.update(k for k in v)

EMPTY = (None, '', 'null', False, [], {}, 0)
report = {'total': len(vals), 'fields': {}}
for f in fields:
    filled = [v[f] for v in vals if v.get(f) not in EMPTY]
    entry = {'fill': len(filled)}
    scalars = [x for x in filled if isinstance(x, (str, int, bool))]
    distinct = set(map(str, scalars))
    if scalars and len(distinct) <= 12:
        entry['values'] = Counter(map(str, scalars)).most_common(12)
    report['fields'][f] = entry
json.dump(report, sys.stdout, indent=1)
