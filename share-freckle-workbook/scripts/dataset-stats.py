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
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        json.dump({'error': out.stderr.strip()[:300], 'total': len(entries)}, sys.stdout)
        sys.exit(0)
    d = json.loads(out.stdout)
    entries += d['entries']
    cursor = d.get('nextCursor')
    if not cursor:
        break

vals = [e['value'] for e in entries if isinstance(e.get('value'), dict)]
fields = Counter()
for v in vals:
    fields.update(k for k in v)

report = {'total': len(vals), 'fields': {}}
for f in fields:
    filled = [v[f] for v in vals if v.get(f) not in (None, '', 'null', False)]
    entry = {'fill': len(filled)}
    scalars = [x for x in filled if isinstance(x, (str, int, bool))]
    distinct = set(map(str, scalars))
    if scalars and len(distinct) <= 12:
        entry['values'] = Counter(map(str, scalars)).most_common(12)
    report['fields'][f] = entry
json.dump(report, sys.stdout, indent=1)
