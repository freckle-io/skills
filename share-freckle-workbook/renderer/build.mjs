#!/usr/bin/env node
// Deterministic card builder: card spec JSON -> card.html.
// No judgment here — every editorial decision already lives in the spec.
// Usage: node build.mjs <spec.json> <out.html> [measure|final <height>]

import fs from 'node:fs';

const [, , specPath, outPath, mode, fixedH] = process.argv;
if (!specPath || !outPath) {
  console.error('usage: node build.mjs <spec.json> <out.html> [measure|final <height>]');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const D = spec.dag;
// canvas.h in the spec is the MAX height (4:5 portrait). Short cards shrink
// toward square: the measure pass renders height:auto and reports content height.
const MIN_H = 1200;
const MAX_H = (spec.canvas && spec.canvas.h) || 1500;
const measuring = mode === 'measure';
const H = measuring ? MAX_H : Math.max(MIN_H, Math.min(MAX_H, Number(fixedH) || MAX_H));

// ---------- DAG layout ----------
const NODE_W = 560;
const NODE_H = 92;
const RANK_GAP = 48;
// A spine label is a ~48px pill centred in the gap — at RANK_GAP it fills the
// space edge to edge, touching both nodes and hiding the arrow it annotates.
// Gaps that carry one open up; every other gap stays tight.
const LABELED_RANK_GAP = 108;
const COL_GAP = 46;
const PAGE_PAD = 64;

// longest-path ranks
const rank = {};
D.nodes.forEach(n => { rank[n.id] = 0; });
let changed = true;
let guard = 0;
while (changed && guard++ < 100) {
  changed = false;
  for (const e of D.edges) {
    if (rank[e.to] < rank[e.from] + 1) { rank[e.to] = rank[e.from] + 1; changed = true; }
  }
}

const cols = D.cols || {};
const colOf = id => cols[id] ?? 0;
const maxRank = Math.max(...Object.values(rank));

// spine (col 0) sits on the canvas midline; side columns bulge out as
// channels, clamped so nothing leaves the page padding
// per-gap heights: only the gaps holding a spine label are widened
const labelOnSpine = e =>
  e.label && colOf(e.from) === colOf(e.to) && rank[e.to] === rank[e.from] + 1;
const gapAfter = Array.from({ length: Math.max(maxRank, 1) }, () => RANK_GAP);
for (const e of D.edges) {
  if (labelOnSpine(e)) gapAfter[rank[e.from]] = LABELED_RANK_GAP;
}
const yOfRank = [0];
for (let r = 1; r <= maxRank; r++) yOfRank[r] = yOfRank[r - 1] + NODE_H + gapAfter[r - 1];

const innerW = spec.canvas.w - PAGE_PAD * 2;
const SIDE = Math.min(0.72 * (NODE_W + COL_GAP), innerW / 2 - NODE_W / 2);
const dagW = innerW;
const dagH = yOfRank[maxRank] + NODE_H;

const pos = {};
for (const n of D.nodes) {
  pos[n.id] = {
    x: innerW / 2 + colOf(n.id) * SIDE - NODE_W / 2,
    y: yOfRank[rank[n.id]],
  };
}

// ---------- edge routing ----------
// Angled orthogonal edges (drop -> jog -> drop), kept tidy by three rules:
// 1. fan slots at each node face are ORDERED BY COUNTERPART X and widely
//    separated, so paths never cross or crowd at a merge;
// 2. branch labels never sit on the path — they dock on the source node's
//    bottom-right edge;
// 3. near-vertical paths snap perfectly straight (no degenerate S-hooks).
const R = 14;        // corner radius
const SLOT_SEP = 100; // px between fan slots on one node face

const outsOf = {}, insOf = {};
D.edges.forEach(e => {
  (outsOf[e.from] = outsOf[e.from] || []).push(e);
  (insOf[e.to] = insOf[e.to] || []).push(e);
});
const slotOffset = (list, e, counterpartX) => {
  const sorted = [...list].sort((a, b) => counterpartX(a) - counterpartX(b));
  const i = sorted.indexOf(e);
  const n = sorted.length;
  return (i - (n - 1) / 2) * Math.min(SLOT_SEP, (NODE_W - 2 * 44) / Math.max(1, n - 1) || SLOT_SEP);
};

const paths = [];
const labels = [];
for (const e of D.edges) {
  const s = pos[e.from], t = pos[e.to];
  const sx = s.x + NODE_W / 2 + slotOffset(outsOf[e.from], e, ed => pos[ed.to].x);
  const sy = s.y + NODE_H;
  const tx = t.x + NODE_W / 2 + slotOffset(insOf[e.to], e, ed => pos[ed.from].x);
  const ty = t.y;
  let d;
  if (Math.abs(sx - tx) < 26) {
    // near-vertical: snap straight — an S-hook must never render
    d = `M ${sx} ${sy} L ${sx} ${ty - 7}`;
  } else {
    // labels never ride the path anymore, so the bend needs only geometric
    // clearance: room for the corner radius after the source, and a real
    // final drop so the arrowhead always points straight down
    const bendY = Math.max(ty - 38, sy + R);
    const dir = tx > sx ? 1 : -1;
    d = [
      `M ${sx} ${sy}`,
      `L ${sx} ${bendY - R}`,
      `Q ${sx} ${bendY} ${sx + dir * R} ${bendY}`,
      `L ${tx - dir * R} ${bendY}`,
      `Q ${tx} ${bendY} ${tx} ${bendY + R}`,
      `L ${tx} ${ty - 7}`,
    ].join(' ');
  }
  paths.push(`<path d="${d}" fill="none" stroke="#BBBCBC" stroke-width="1.75" marker-end="url(#arrow)"/>`);
  if (e.label) {
    if (labelOnSpine(e)) {
      // centred in a gap that was widened for it, so arrow shows above + below
      labels.push({ x: sx, y: (sy + ty) / 2, text: e.label });
    } else {
      // anything else (side channels, multi-rank skips) would land the pill on
      // top of a node at its midpoint — dock it on the source's bottom-right
      labels.push({ x: s.x + NODE_W - 16, y: sy, text: e.label, dock: true });
    }
  }
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const markImg = m => `<span class="markframe"><img src="assets/marks/${m}.svg" alt=""></span>`;

const nodeHtml = D.nodes.map(n => {
  const p = pos[n.id];
  const marks = (n.marks || []).map(markImg).join('');
  const stat = n.stat
    ? `<span class="nstat"><span class="value">${esc(n.stat.value)}</span><span class="label">${esc(n.stat.label)}</span></span>`
    : '';
  const kindpill = stat ? '' :
    n.kind === 'input' ? '<span class="kindpill input">IN</span>' :
    n.kind === 'output' ? '<span class="kindpill output">OUT</span>' : '';
  return `<div class="node ${n.kind || ''}" style="left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px">
    ${marks ? `<span class="markstack">${marks}</span>` : ''}
    <span class="text"><div class="title">${esc(n.title)}</div>${n.sub ? `<div class="sub">${esc(n.sub)}</div>` : ''}</span>
    ${stat}${kindpill}
  </div>`;
}).join('\n');

const labelHtml = labels.map(l =>
  `<div class="edge-label" style="left:${l.x}px;top:${l.y}px${l.dock ? ';transform:translate(-100%,-50%)' : ''}">${esc(l.text)}</div>`
).join('\n');


const sourcesHtml = (spec.sources || []).map(c => {
  const inner = [
    c.mark ? `<img src="assets/marks/${c.mark}.svg" alt="">`
           : c.dot ? `<span class="dot" style="background:${c.dot}"></span>` : '',
    esc(c.label),
  ].join('');
  return `<span class="source${c.dashed ? ' dashed' : ''}">${inner}</span>`;
}).join('\n');

// the drop-line must land on the input node's top edge, not the dag's center —
// shift the sources block so its center sits over the entry node
const entry = D.nodes.find(n => n.kind === 'input') || D.nodes[0];
const sourcesShift = Math.round(colOf(entry.id) * SIDE);

const rb = spec.runbar || {};
const rbSegments = (rb.segments || []).map((s, i) =>
  `<span class="${i === 0 ? 'strong' : ''}">${esc(s)}</span>`
).join('<span>·</span>');
const runbarHtml = (rb.segments && rb.segments.length)
  ? `<div class="runbar">${rb.live ? '<span class="dot"></span>' : ''}${rbSegments}</div>`
  : '';

// footer meta degrades: role unknown at v1 renders "Name · Company", never "· @ Co"
const footerMeta = spec.footer.role && spec.footer.company
  ? `${esc(spec.footer.role)} @ ${esc(spec.footer.company)}`
  : esc(spec.footer.role || spec.footer.company || '');

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="card.css">
<style>html,body{width:${spec.canvas.w}px}.page{width:${spec.canvas.w}px;height:${measuring ? 'auto' : `${H}px`}}</style>
${measuring ? '<script>addEventListener("load",()=>{document.title=String(document.querySelector(".page").scrollHeight)})</script>' : ''}
</head><body>
<div class="page">
  <div class="topstrip" style="background-image:url('assets/gradients/${spec.gradient || 'event-gradient-2.png'}')"></div>
  <style>.node.score::before{--score-ring:0}.node.score::before{background-image:url('assets/gradients/${spec.gradient || 'event-gradient-2.png'}')}</style>

  <div class="brandrow">
    ${spec.brand
      ? `<span class="brand">${spec.brand.logo ? `<img src="assets/${spec.brand.logo}" alt="">` : ''}<span class="bname">${esc(spec.brand.name)}</span></span>
    <div class="wordmark small">freckle<span class="underscore">_</span></div>`
      : `<div class="wordmark">freckle<span class="underscore">_</span></div>`}
  </div>

  ${spec.series ? `<div class="eyebrow"><span class="line"></span><span class="etext"><span class="chev">❯</span>${esc(spec.series).toUpperCase()}</span><span class="line"></span></div>` : ''}
  ${spec.pill ? `<span class="name-pill">${esc(spec.pill)}</span>` : ''}
  <div class="headline">${esc(spec.headline)}</div>
  ${spec.subline ? `<div class="subline">${esc(spec.subline)}</div>` : ''}

  <div class="stage">
    ${sourcesHtml ? `<div class="sources-wrap" style="transform:translateX(${sourcesShift}px)"><div class="sources">${sourcesHtml}</div>\n    <div class="drop-line"></div></div>` : ''}
    <div class="dag" style="width:${dagW}px;height:${dagH}px">
      <svg class="edges" width="${dagW}" height="${dagH}" viewBox="0 0 ${dagW} ${dagH}" style="position:absolute;inset:0">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0.5 1 L 8.5 5 L 0.5 9 Q 2.4 5 0.5 1 z" fill="#BBBCBC"/>
          </marker>
        </defs>
        ${paths.join('\n')}
      </svg>
      ${nodeHtml}
      ${labelHtml}
    </div>
    ${runbarHtml}
  </div>

  <div class="footer">
    ${spec.footer.avatar ? `<img class="avatar" src="assets/${esc(spec.footer.avatar)}" alt="">` : ''}
    <span class="who"><span class="name">${esc(spec.footer.name)}</span>${footerMeta ? `<span class="meta"> · ${footerMeta}</span>` : ''}</span>
  </div>

</div>
</body></html>`;

fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath}  (dag ${dagW}x${dagH}, ${D.nodes.length} nodes, ${D.edges.length} edges)`);
