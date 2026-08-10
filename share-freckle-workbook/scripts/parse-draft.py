#!/usr/bin/env python3
"""Parse a Freckle workflow draft (YAML from `freckle workflow saved get-draft`)
into a node/dependency JSON the consolidation pass can reason over.

Usage: freckle workflow saved get-draft [--org-id ORG] <id> | python3 parse-draft.py
Emits: {"<nodeId>": {"uses": str, "title": str, "deps": [ids], "gated": bool}}
Type-declaration blocks (no `uses:`) are excluded.
"""
import json
import re
import sys

text = sys.stdin.read()
node_starts = [(m.start(), m.group(1)) for m in re.finditer(r'^  (\w+):\n', text, re.M)]
nodes = {}
for i, (pos, name) in enumerate(node_starts):
    end = node_starts[i + 1][0] if i + 1 < len(node_starts) else len(text)
    block = text[pos:end]
    uses = re.search(r'uses: ([\w@.]+)', block)
    if not uses:
        continue  # type declaration, not a node
    title = re.search(r'^\s+title: (.+)$', block, re.M)
    deps = sorted(set(re.findall(r'\$nodes\.(\w+)', block)))
    nodes[name] = {
        'uses': uses.group(1),
        'title': title.group(1).strip() if title else name,
        'deps': [d for d in deps if d != name],
        'gated': bool(re.search(r'^\s+when:', block, re.M)),
    }
json.dump(nodes, sys.stdout, indent=1)
