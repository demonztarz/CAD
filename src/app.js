/* DraftForge core: document, view, rendering, input, snapping, selection, undo. */
(function () {
  'use strict';
  const { P, M } = G;
  const S = (window.App = {});

  // ======================= document =======================
  S.newDoc = () => ({
    version: 1,
    entities: [],
    layers: [{ name: '0', color: 7, ltype: 'CONTINUOUS', on: true, frozen: false, locked: false, lw: 0.25 }],
    blocks: {},
    layouts: [{ name: 'Layout1', paper: 'A3', orient: 'landscape', style: 'monochrome', entities: [], init: false }],
    clayer: '0',
    settings: { ltscale: 1, textHeight: 2.5, dimHeight: 2.5, dimPrec: 2, prec: 4, insunits: 4 },
  });
  S.doc = S.newDoc();
  // Paper sizes in mm (landscape: width >= height)
  S.PAPERS = {
    A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841],
    Letter: [279.4, 215.9], Legal: [355.6, 215.9], Tabloid: [431.8, 279.4],
    'ANSI C': [558.8, 431.8], 'ANSI D': [863.6, 558.8], 'ARCH D': [914.4, 609.6],
  };
  // Active space: null = model space, otherwise the name of a layout (paper space)
  S.space = null;
  S.layoutObj = () => (S.space ? (S.doc.layouts || []).find((l) => l.name === S.space) || null : null);
  S.paperSize = (l) => { const p = S.PAPERS[l.paper] || S.PAPERS.A3; return l.orient === 'portrait' ? [p[1], p[0]] : [p[0], p[1]]; };
  // S.E is the entity list of the active space
  Object.defineProperty(S, 'E', {
    get() { const l = S.layoutObj(); return l ? l.entities : S.doc.entities; },
    set(v) { const l = S.layoutObj(); if (l) l.entities = v; else S.doc.entities = v; },
  });
  S.file = { path: null, name: 'Drawing1.dfg', kind: 'dfg', dirty: false };
  S.cur = { color: null, ltype: null, lw: null }; // properties for new objects (null = ByLayer)
  S.selection = new Set();
  S.clipboard = null;
  S.st = {
    grid: true, snap: false, ortho: false, polar: true, osnap: true, lwt: false, dyn: true,
    osmodes: new Set(['end', 'mid', 'cen', 'int', 'qua', 'nod', 'ins', 'per']),
    snapSpacing: 10, gridSpacing: 10, polarInc: 45, pickbox: 5, aperture: 10, cursorSize: 5,
  };
  try {
    const saved = JSON.parse(localStorage.getItem('df-settings') || 'null');
    if (saved) { Object.assign(S.st, saved, { osmodes: new Set(saved.osmodes || [...S.st.osmodes]) }); }
  } catch (_) { /* ignore */ }
  S.saveSettings = () => {
    try { localStorage.setItem('df-settings', JSON.stringify({ ...S.st, osmodes: [...S.st.osmodes] })); } catch (_) { /* ignore */ }
  };

  const listeners = {};
  S.on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
  S.emit = (ev, ...a) => (listeners[ev] || []).forEach((f) => f(...a));

  // caches keyed on (immutable) entity objects
  let primCache = new WeakMap(), boxCache = new WeakMap(), splineCache = new WeakMap(), dimCache = new WeakMap();
  S.clearCaches = () => { primCache = new WeakMap(); boxCache = new WeakMap(); splineCache = new WeakMap(); dimCache = new WeakMap(); };
  S.ctx = () => ({ blocks: S.doc.blocks, dimPrec: S.doc.settings.dimPrec ?? 2 });
  S.prims = (e) => { let p = primCache.get(e); if (!p) { p = G.prims(e, S.ctx()); primCache.set(e, p); } return p; };
  S.bbox = (e) => { let b = boxCache.get(e); if (!b) { b = G.bbox(e, S.ctx()); boxCache.set(e, b); } return b; };
  const splinePts = (e) => { let p = splineCache.get(e); if (!p) { p = G.splinePoints(e); splineCache.set(e, p); } return p; };
  const dimGeo = (e) => {
    let g = dimCache.get(e);
    if (!g) { g = G.dimGeometry(e, S.doc.settings.dimPrec ?? 2).map((s) => ({ ...s, layer: e.layer, color: e.color, ltype: 'CONTINUOUS', lw: e.lw })); dimCache.set(e, g); }
    return g;
  };

  // layers
  let layerMap = new Map();
  S.refreshLayers = () => { layerMap = new Map(S.doc.layers.map((l) => [l.name, l])); };
  S.layer = (name) => layerMap.get(name);
  S.ensureLayer = (name) => {
    if (!layerMap.has(name)) { S.doc.layers.push({ name, color: 7, ltype: 'CONTINUOUS', on: true, frozen: false, locked: false, lw: 0.25 }); S.refreshLayers(); }
    return layerMap.get(name);
  };
  S.refreshLayers();
  const visibleLayer = (name) => { const l = layerMap.get(name); return !l || (l.on !== false && !l.frozen); };
  S.isSelectable = (e) => { const l = layerMap.get(e.layer); return visibleLayer(e.layer) && !(l && l.locked); };

  S.fmt = (v, prec) => G.fmtNum(v, prec ?? S.doc.settings.prec ?? 4);
  S.fmtPt = (p) => `${S.fmt(p.x)}, ${S.fmt(p.y)}`;

  // ======================= undo / modification =======================
  S.undoStack = []; S.redoStack = [];
  let opMarked = false;
  const snapshot = () => ({
    entities: S.doc.entities.slice(), layers: JSON.parse(JSON.stringify(S.doc.layers)), blocks: { ...S.doc.blocks },
    layouts: (S.doc.layouts || []).map((l) => ({ ...l, entities: l.entities.slice() })),
    clayer: S.doc.clayer, settings: { ...S.doc.settings }, label: S.runningName || '',
  });
  S.mark = () => {
    if (opMarked) return;
    S.undoStack.push(snapshot());
    if (S.undoStack.length > 200) S.undoStack.shift();
    S.redoStack.length = 0;
    opMarked = true;
    S.setDirty(true);
  };
  S.endOp = () => { opMarked = false; };
  const restore = (s) => {
    Object.assign(S.doc, { entities: s.entities, layers: s.layers, blocks: s.blocks, clayer: s.clayer, settings: s.settings, layouts: s.layouts });
    if (S.space && !S.layoutObj()) S.space = null;
    S.refreshLayers(); S.clearCaches(); S.selection.clear(); S.setDirty(true); S.emit('doc'); S.render();
  };
  S.undo = () => {
    const s = S.undoStack.pop();
    if (!s) { S.msg('Nothing to undo.'); return; }
    S.redoStack.push(snapshot());
    restore(s); S.msg(`Undo ${s.label}`.trim());
  };
  S.redo = () => {
    const s = S.redoStack.pop();
    if (!s) { S.msg('Nothing to redo.'); return; }
    S.undoStack.push(snapshot());
    restore(s); S.msg(`Redo ${s.label}`.trim());
  };
  S.setDirty = (d) => { S.file.dirty = d; S.emit('title'); };

  S.decorate = (e) => {
    if (!e.layer) e.layer = S.doc.clayer;
    if (e.color === undefined && S.cur.color !== null) e.color = S.cur.color;
    if (e.ltype === undefined && S.cur.ltype) e.ltype = S.cur.ltype;
    if (e.lw === undefined && S.cur.lw != null) e.lw = S.cur.lw;
    for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
    return e;
  };
  S.add = (e) => { S.mark(); S.decorate(e); S.E.push(e); S.last = e; S.render(); return e; };
  S.addRaw = (list) => { S.mark(); for (const e of list) S.E.push(e); if (list.length) S.last = list[list.length - 1]; S.render(); };
  // replace entities: map old -> array of new (or [] to delete)
  S.replace = (map) => {
    if (!map.size) return;
    S.mark();
    const out = [];
    for (const e of S.E) {
      if (map.has(e)) { for (const n of map.get(e)) out.push(n); } else out.push(e);
    }
    S.E = out;
    for (const e of map.keys()) S.selection.delete(e);
    S.render();
  };
  S.remove = (list) => S.replace(new Map([...list].map((e) => [e, []])));

  // ======================= view =======================
  const cv = document.getElementById('cv'), ov = document.getElementById('ov');
  const cx = cv.getContext('2d'), ox = ov.getContext('2d');
  S.canvas = ov;
  let W = 800, H = 600, DPR = 1;
  S.view = { cx: 50, cy: 50, scale: 6 };
  S.size = () => ({ W, H });
  S.w2s = (p) => P((p.x - S.view.cx) * S.view.scale + W / 2, H / 2 - (p.y - S.view.cy) * S.view.scale);
  S.s2w = (x, y) => P((x - W / 2) / S.view.scale + S.view.cx, (H / 2 - y) / S.view.scale + S.view.cy);
  S.viewRect = () => { const a = S.s2w(0, H), b = S.s2w(W, 0); return [a.x, a.y, b.x, b.y]; };

  function resize() {
    const r = ov.parentElement.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1; W = Math.max(1, r.width); H = Math.max(1, r.height);
    // CSS sizes the canvases to the viewport; only the backing store follows the device pixel ratio
    for (const c of [cv, ov]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    S.render();
  }
  new ResizeObserver(resize).observe(ov.parentElement);

  S.zoomAt = (sx, sy, f) => {
    const before = S.s2w(sx, sy);
    S.view.scale = Math.min(1e7, Math.max(1e-7, S.view.scale * f));
    const after = S.s2w(sx, sy);
    S.view.cx += before.x - after.x; S.view.cy += before.y - after.y;
    S.render();
  };
  // space covered by the floating command line, kept clear when zooming to fit
  const bottomInset = () => { const c = document.getElementById('cmdline'); return c && c.offsetParent ? c.offsetHeight + 16 : 0; };
  S.zoomRect = (x0, y0, x1, y1, margin = 0.05) => {
    const w = Math.max(1e-9, x1 - x0), h = Math.max(1e-9, y1 - y0), inset = bottomInset(), top = 24;
    S.view.scale = Math.min(W / (w * (1 + 2 * margin)), Math.max(40, H - inset - top) / (h * (1 + 2 * margin)));
    if (!isFinite(S.view.scale) || S.view.scale <= 0) S.view.scale = 1;
    S.view.cx = (x0 + x1) / 2;
    S.view.cy = (y0 + y1) / 2 - (inset - top) / (2 * S.view.scale);
    S.render();
  };
  S.extents = (list) => {
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const e of list || S.E) {
      if (e.type === 'xline' || !visibleLayer(e.layer)) continue;
      const b = S.bbox(e);
      if (!b.every(isFinite)) continue;
      bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])];
    }
    return isFinite(bb[0]) ? bb : null;
  };
  S.zoomExtents = () => {
    const lay = S.layoutObj();
    if (lay) { const [pw, ph] = S.paperSize(lay); S.zoomRect(-pw * 0.02, -ph * 0.02, pw * 1.02, ph * 1.02, 0.01); return; }
    const bb = S.extents();
    if (!bb) { S.view = { cx: 50, cy: 50, scale: Math.min(W, H) / 120 }; S.render(); return; }
    const pad = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.001 + 1e-6;
    S.zoomRect(bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad, 0.03);
  };

  // ======================= colors / styles =======================
  S.bg = '#212830';
  S.colorCss = (c, plot) => {
    if (typeof c === 'string') return c;
    if (c === 7 || c == null) return plot ? '#000000' : '#ffffff';
    return G.ACI[c] || '#ffffff';
  };
  // resolved colour value (number or hex) of an entity, given inherited block properties
  function colorVal(e, inh) {
    let c = e.color;
    if (c === 0) return inh ? inh.color : 7;
    if (c == null) { const l = layerMap.get(e.layer === '0' && inh ? inh.layer : e.layer); return l ? l.color : 7; }
    return c;
  }
  function layerOf(e, inh) { return e.layer === '0' && inh ? inh.layer : e.layer; }
  function ltypeVal(e, inh) {
    let t = e.ltype;
    if (t === 'BYBLOCK') return inh ? inh.ltype : 'CONTINUOUS';
    if (!t) { const l = layerMap.get(layerOf(e, inh)); t = l ? l.ltype : 'CONTINUOUS'; }
    return t || 'CONTINUOUS';
  }
  function lwVal(e, inh) {
    if (e.lw != null) return e.lw;
    const l = layerMap.get(layerOf(e, inh));
    return (l && l.lw) || (inh && inh.lw) || 0.25;
  }
  S.resolved = (e) => ({ color: colorVal(e), ltype: ltypeVal(e), lw: lwVal(e) });

  // ======================= rendering =======================
  let needDoc = true, needOv = true, rafId = 0;
  S.render = () => { needDoc = true; needOv = true; schedule(); };
  S.overlay = () => { needOv = true; schedule(); };
  function schedule() { if (!rafId) rafId = requestAnimationFrame(frame); }
  function frame() {
    rafId = 0;
    if (needDoc) { needDoc = false; drawDoc(cx, { W, H, DPR, view: S.view, grid: S.st.grid, sel: S.selection }); }
    if (needOv) { needOv = false; drawOverlay(); }
  }

  const CAP = 0.716, FONT_PX = 100, FONT = `${FONT_PX}px Arial, "Helvetica Neue", Helvetica, sans-serif`;
  const mctx = document.createElement('canvas').getContext('2d');
  mctx.font = FONT;
  const measureCache = new Map();
  G.TEXT.measure = (s, h) => {
    let w = measureCache.get(s);
    if (w === undefined) { w = mctx.measureText(s).width / (CAP * FONT_PX); if (measureCache.size > 20000) measureCache.clear(); measureCache.set(s, w); }
    return w * h;
  };

  // draw context state for batched stroking
  function Painter(ctx, opts) {
    this.ctx = ctx; this.opts = opts; this.key = ''; this.open = false;
  }
  Painter.prototype.begin = function (color, widthPx, dash, upp) {
    const key = color + '|' + widthPx + '|' + (dash ? dash.join(',') : '') + '|' + upp;
    if (key !== this.key || !this.open) {
      this.flush();
      const c = this.ctx;
      c.strokeStyle = color; c.lineWidth = widthPx * upp; c.setLineDash(dash || []);
      c.beginPath(); this.open = true; this.key = key;
    }
  };
  Painter.prototype.flush = function () { if (this.open) { this.ctx.stroke(); this.open = false; } };

  function dashFor(ltype, upp, lts) {
    if (!ltype || ltype === 'CONTINUOUS') return null;
    const def = DXF.LTYPES[ltype];
    if (!def || !def.dashes.length) return null;
    const segs = def.dashes.map((d) => Math.abs(d) * lts);
    const total = segs.reduce((a, b) => a + b, 0);
    if (total / upp < 6) return null; // too dense on screen: draw continuous
    const arr = def.dashes.map((d) => (d === 0 ? upp * 1.5 : Math.abs(d) * lts));
    return arr.length % 2 ? arr.concat(arr) : arr;
  }

  function drawEntity(pt, e, inh, upp, plot, override) {
    const ctx = pt.ctx;
    const cval = colorVal(e, inh);
    const color = override || S.colorCss(cval, !!plot);
    const lwPx = S.st.lwt || plot === true ? Math.max(1, Math.min(10, lwVal(e, inh) * (plot === true ? 4 : 3.2))) : 1;
    const lts = (S.doc.settings.ltscale || 1);
    const dash = dashFor(ltypeVal(e, inh), upp, lts);
    const width = (pt.extraWidth || 0) + lwPx;
    switch (e.type) {
      case 'line':
        pt.begin(color, width, dash, upp); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); break;
      case 'xline': {
        const d = G.norm(P(e.dx, e.dy)), vr = pt.opts.vr;
        const big = Math.hypot(vr[2] - vr[0], vr[3] - vr[1]) * 2 + G.dist(P(e.x, e.y), P((vr[0] + vr[2]) / 2, (vr[1] + vr[3]) / 2));
        const a = e.ray ? P(e.x, e.y) : G.sub(P(e.x, e.y), G.mul(d, big)), b = G.add(P(e.x, e.y), G.mul(d, big));
        pt.begin(color, width, dash, upp); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); break;
      }
      case 'circle':
        pt.begin(color, width, dash, upp); ctx.moveTo(e.cx + e.r, e.cy); ctx.arc(e.cx, e.cy, e.r, 0, G.TAU, false); break;
      case 'arc':
        pt.begin(color, width, dash, upp); ctx.moveTo(e.cx + e.r * Math.cos(e.a1), e.cy + e.r * Math.sin(e.a1)); ctx.arc(e.cx, e.cy, e.r, e.a1, e.a2, false); break;
      case 'pline': {
        pt.begin(color, width, dash, upp);
        const pts = e.pts, n = pts.length;
        if (!n) break;
        ctx.moveTo(pts[0].x, pts[0].y);
        const segs = e.closed ? n : n - 1;
        for (let i = 0; i < segs; i++) {
          const p = pts[i], q = pts[(i + 1) % n];
          if (p.b) {
            const ba = G.bulgeArc(p, q, p.b);
            if (ba) { ctx.arc(ba.c.x, ba.c.y, ba.r, G.ang(ba.c, p), G.ang(ba.c, q), p.b < 0); continue; }
          }
          ctx.lineTo(q.x, q.y);
        }
        if (n === 1) ctx.lineTo(pts[0].x + upp, pts[0].y);
        break;
      }
      case 'ellipse': {
        pt.begin(color, width, dash, upp);
        const R = Math.hypot(e.mx, e.my), rot = Math.atan2(e.my, e.mx);
        const full = G.isFullEllipse(e), a1 = full ? 0 : e.a1, a2 = full ? G.TAU : e.a2;
        const s = G.ellipsePoint(e, a1);
        ctx.moveTo(s.x, s.y); ctx.ellipse(e.cx, e.cy, R, R * e.ratio, rot, a1, a2, false); break;
      }
      case 'spline': {
        const pts = splinePts(e);
        pt.begin(color, width, dash, upp);
        if (pts.length) { ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); if (e.closed && e.ctrl) ctx.closePath(); }
        break;
      }
      case 'point': {
        pt.flush();
        ctx.fillStyle = color;
        const s = 2 * upp;
        ctx.fillRect(e.x - s, e.y - s, 2 * s, 2 * s);
        break;
      }
      case 'solid': {
        pt.flush();
        ctx.fillStyle = color; ctx.beginPath();
        e.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'text': {
        pt.flush();
        const box = G.textBox(e);
        if (e.h / upp < 1.5) { // too small to read: draw a placeholder bar
          ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rot || 0);
          ctx.fillStyle = color; ctx.globalAlpha *= 0.5; ctx.fillRect(box.x0, box.y0 + box.h * 0.22, box.w, box.y1 - box.y0 - box.h * 0.22); ctx.restore();
          break;
        }
        ctx.save();
        ctx.translate(e.x, e.y); ctx.rotate(e.rot || 0);
        const k = e.h / (CAP * FONT_PX);
        ctx.scale(k * (e.wf || 1), -k);
        ctx.font = FONT; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
        ctx.textAlign = e.ha === 'center' || e.ha === 'middle' ? 'center' : e.ha === 'right' ? 'right' : 'left';
        box.lines.forEach((ln, i) => ctx.fillText(ln, 0, -(box.oy - i * box.gap) / k));
        ctx.restore();
        break;
      }
      case 'hatch': drawHatch(pt, e, color, upp); break;
      case 'viewport':
        pt.begin(color, width, null, upp);
        ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.w, e.y); ctx.lineTo(e.x + e.w, e.y + e.h); ctx.lineTo(e.x, e.y + e.h); ctx.closePath();
        break;
      case 'dim':
        for (const g of dimGeo(e)) drawEntity(pt, g, inh, upp, plot, override);
        break;
      case 'insert': {
        const blk = S.doc.blocks[e.name];
        if (blk && (pt.depth || 0) < 12) {
          pt.flush();
          const m = M.insert(e, blk.base);
          ctx.save(); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
          const sub = { layer: layerOf(e, inh), color: cval, ltype: ltypeVal(e, inh), lw: lwVal(e, inh) };
          const k = M.scaleOf(m) || 1;
          pt.depth = (pt.depth || 0) + 1;
          pt.key = '';
          for (const c of blk.entities) if (!G.isAttDef(c) && visibleLayer(layerOf(c, sub))) drawEntity(pt, c, sub, upp / k, plot, override);
          pt.flush(); pt.depth--; pt.key = '';
          ctx.restore();
        }
        for (const a of e.attribs || []) drawEntity(pt, a, inh, upp, plot, override);
        break;
      }
    }
  }

  function loopPath(ctx, loops) {
    ctx.beginPath();
    for (const l of loops) { l.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }
  }
  function drawHatch(pt, e, color, upp) {
    const ctx = pt.ctx;
    pt.flush();
    if (e.pattern === 'SOLID') {
      ctx.fillStyle = color; loopPath(ctx, e.loops); ctx.fill('evenodd'); return;
    }
    const { segs, dense } = G.hatchSegments(e, S.bbox(e), 3 * upp, 20000);
    ctx.save();
    loopPath(ctx, e.loops); ctx.clip('evenodd');
    ctx.strokeStyle = color; ctx.lineWidth = upp; ctx.setLineDash([]);
    ctx.beginPath();
    for (const g of segs) { ctx.moveTo(g[0], g[1]); ctx.lineTo(g[2], g[3]); }
    ctx.stroke();
    if (dense) { ctx.globalAlpha *= 0.35; ctx.fillStyle = color; loopPath(ctx, e.loops); ctx.fill('evenodd'); }
    ctx.restore();
  }

  function drawIsoGrid(ctx, o, vr) {
    let step = S.st.gridSpacing || 10;
    while (step * COS30 * o.view.scale < 10) step *= 5;
    while (step * COS30 * o.view.scale > 400) step /= 5;
    const lw = 1 / o.view.scale;
    const corners = [P(vr[0], vr[1]), P(vr[2], vr[1]), P(vr[2], vr[3]), P(vr[0], vr[3])];
    const diag = Math.hypot(vr[2] - vr[0], vr[3] - vr[1]);
    const family = (deg, spacing, color, every) => {
      const a = G.rad(deg), u = P(Math.cos(a), Math.sin(a)), n = P(-u.y, u.x);
      const ds = corners.map((c) => G.dot(c, n) / spacing);
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
      for (let k = Math.floor(Math.min(...ds)); k <= Math.ceil(Math.max(...ds)); k++) {
        if (every && k % every) continue;
        const base = G.mul(n, k * spacing), mid = G.add(base, G.mul(u, G.dot(P((vr[0] + vr[2]) / 2, (vr[1] + vr[3]) / 2), u)));
        const a1 = G.sub(mid, G.mul(u, diag)), b1 = G.add(mid, G.mul(u, diag));
        ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y);
      }
      ctx.stroke();
    };
    for (const d of [30, 90, 150]) family(d, step * COS30, '#283039');
    for (const d of [30, 90, 150]) family(d, step * COS30, '#323c48', 5);
  }

  function drawGrid(ctx, o, vr) {
    if (S.st.iso) return drawIsoGrid(ctx, o, vr);
    let step = S.st.gridSpacing || 10;
    while (step * o.view.scale < 8) step *= 5;
    while (step * o.view.scale > 400) step /= 5;
    const major = step * 5;
    const lw = 1 / o.view.scale;
    const lines = (st, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
      const x0 = Math.floor(vr[0] / st) * st, y0 = Math.floor(vr[1] / st) * st;
      for (let x = x0; x <= vr[2]; x += st) { ctx.moveTo(x, vr[1]); ctx.lineTo(x, vr[3]); }
      for (let y = y0; y <= vr[3]; y += st) { ctx.moveTo(vr[0], y); ctx.lineTo(vr[2], y); }
      ctx.stroke();
    };
    lines(step, '#283039');
    lines(major, '#323c48');
    // axes
    ctx.lineWidth = lw * 1.2;
    ctx.strokeStyle = 'rgba(200,60,60,0.45)'; ctx.beginPath(); ctx.moveTo(vr[0], 0); ctx.lineTo(vr[2], 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,180,80,0.45)'; ctx.beginPath(); ctx.moveTo(0, vr[1]); ctx.lineTo(0, vr[3]); ctx.stroke();
  }

  // model geometry seen through a paper-space viewport (paper units are mm)
  function drawViewport(ctx, vp, upp, plot) {
    if (!(vp.scale > 0) || !(vp.w > 0) || !(vp.h > 0)) return;
    const k = vp.scale, mx = vp.x + vp.w / 2, my = vp.y + vp.h / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(vp.x, vp.y, vp.w, vp.h); ctx.clip();
    ctx.transform(k, 0, 0, k, mx - vp.cx * k, my - vp.cy * k);
    const vr = [vp.cx - vp.w / 2 / k, vp.cy - vp.h / 2 / k, vp.cx + vp.w / 2 / k, vp.cy + vp.h / 2 / k];
    const pt = new Painter(ctx, { vr });
    for (const e of S.doc.entities) {
      if (!visibleLayer(e.layer)) continue;
      if (e.type !== 'xline') { const b = S.bbox(e); if (b[2] < vr[0] || b[0] > vr[2] || b[3] < vr[1] || b[1] > vr[3]) continue; }
      drawEntity(pt, e, null, upp / k, plot);
    }
    pt.flush();
    ctx.restore();
  }
  S.drawViewport = drawViewport;

  function drawDoc(ctx, o) {
    const lay = o.layout === undefined ? S.layoutObj() : o.layout;
    ctx.setTransform(o.DPR, 0, 0, o.DPR, 0, 0);
    ctx.fillStyle = o.plot ? '#ffffff' : lay ? '#3b4048' : S.bg; ctx.fillRect(0, 0, o.W, o.H);
    const s = o.view.scale;
    ctx.setTransform(o.DPR * s, 0, 0, -o.DPR * s, o.DPR * (o.W / 2 - o.view.cx * s), o.DPR * (o.H / 2 + o.view.cy * s));
    const vr = [o.view.cx - o.W / 2 / s, o.view.cy - o.H / 2 / s, o.view.cx + o.W / 2 / s, o.view.cy + o.H / 2 / s];
    const upp = 1 / s;
    const plot = o.plot ? true : lay ? 'paper' : false;
    if (lay) {
      const [pw, ph] = S.paperSize(lay);
      if (!o.plot) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(pw * 0.006, -ph * 0.008, pw, ph); }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pw, ph);
      if (!o.plot) {
        ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = upp; ctx.setLineDash([4 * upp, 3 * upp]);
        ctx.strokeRect(5, 5, pw - 10, ph - 10); ctx.setLineDash([]);
      }
      for (const e of lay.entities) if (e.type === 'viewport' && visibleLayer(e.layer)) drawViewport(ctx, e, upp, plot);
    } else if (o.grid && !o.plot) drawGrid(ctx, o, vr);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pt = new Painter(ctx, { vr });
    const visible = (e) => {
      if (!visibleLayer(e.layer)) return false;
      if (e.type === 'xline') return true;
      const b = S.bbox(e);
      return !(b[2] < vr[0] || b[0] > vr[2] || b[3] < vr[1] || b[1] > vr[3]);
    };
    for (const e of lay ? lay.entities : S.doc.entities) {
      if (!visible(e)) continue;
      const l = layerMap.get(e.layer);
      if (l && l.locked && !o.plot) { pt.flush(); ctx.globalAlpha = 0.5; drawEntity(pt, e, null, upp, plot); pt.flush(); ctx.globalAlpha = 1; pt.key = ''; }
      else drawEntity(pt, e, null, upp, plot);
    }
    pt.flush();
    // selection highlight
    if (o.sel && o.sel.size && !o.plot) {
      const hp = new Painter(ctx, { vr });
      ctx.globalAlpha = 0.55; hp.extraWidth = 3;
      for (const e of o.sel) if (visible(e)) drawEntity(hp, e, null, upp, false, '#3d8bff');
      hp.flush(); ctx.globalAlpha = 1;
      const dp = new Painter(ctx, { vr });
      for (const e of o.sel) if (visible(e)) drawEntity(dp, e, null, upp, false, lay ? '#1d4fa8' : '#ffffff');
      dp.flush();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  S.drawDoc = drawDoc;

  // ======================= overlay =======================
  S.mouse = { sx: -1, sy: -1, w: P(0, 0), inside: false };
  S.hover = null; S.preview = null; S.ghost = null;
  S.snapPt = null; S.track = null; S.win = null; S.hotGrip = null;

  function drawOverlay() {
    const c = ox;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, W, H);
    const s = S.view.scale;
    const worldT = () => c.setTransform(DPR * s, 0, 0, -DPR * s, DPR * (W / 2 - S.view.cx * s), DPR * (H / 2 + S.view.cy * s));
    const vr = S.viewRect(), upp = 1 / s;
    // hover highlight
    if (S.hover && !S.selection.has(S.hover)) {
      worldT();
      const pt = new Painter(c, { vr }); pt.extraWidth = 2;
      c.globalAlpha = 0.9;
      drawEntity(pt, S.hover, null, upp, false, '#9fd0ff'); pt.flush();
      c.globalAlpha = 1;
    }
    // ghost (objects being moved/copied) and preview geometry
    if ((S.ghost && S.ghost.length) || (S.preview && S.preview.length)) {
      worldT();
      const pt = new Painter(c, { vr });
      for (const e of S.ghost || []) drawEntity(pt, e, null, upp, false);
      pt.flush();
      for (const e of S.preview || []) {
        if (e._rubber) { pt.flush(); c.setLineDash([6 * upp, 4 * upp]); c.strokeStyle = '#d7dde5'; c.lineWidth = upp; c.beginPath(); c.moveTo(e.x1, e.y1); c.lineTo(e.x2, e.y2); c.stroke(); c.setLineDash([]); pt.key = ''; continue; }
        drawEntity(pt, S.decorate({ ...e }), null, upp, false);
      }
      pt.flush();
    }
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    // grips
    if (!S.input || S.input.grip) {
      for (const g of S.grips()) {
        const p = S.w2s(g.p), hot = S.hotGrip && S.hotGrip.e === g.e && S.hotGrip.idx === g.idx;
        const hov = S.hoverGrip && S.hoverGrip.e === g.e && S.hoverGrip.idx === g.idx;
        c.fillStyle = hot ? '#ff2a2a' : hov ? '#ff7f66' : '#2f7fff';
        c.strokeStyle = '#0b1220'; c.lineWidth = 1;
        c.fillRect(p.x - 4.5, p.y - 4.5, 9, 9); c.strokeRect(p.x - 4.5, p.y - 4.5, 9, 9);
      }
    }
    // selection window
    if (S.win && S.win.b) {
      const a = S.w2s(S.win.a), b = S.w2s(S.win.b), crossing = b.x < a.x;
      c.fillStyle = crossing ? 'rgba(60,200,90,0.18)' : 'rgba(60,120,255,0.18)';
      c.strokeStyle = crossing ? '#5fe07a' : '#6ea0ff';
      c.setLineDash(crossing ? [6, 4] : []); c.lineWidth = 1;
      c.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      c.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      c.setLineDash([]);
    }
    // polar / ortho tracking ray
    if (S.track) {
      const a = S.w2s(S.track.base), dir = P(Math.cos(S.track.ang), -Math.sin(S.track.ang));
      c.strokeStyle = 'rgba(120,255,120,0.75)'; c.setLineDash([3, 4]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + dir.x * 4000, a.y + dir.y * 4000); c.stroke(); c.setLineDash([]);
    }
    // snap marker
    if (S.snapPt) drawSnapMarker(c, S.w2s(S.snapPt.p), S.snapPt.kind);
    // cursor
    if (S.mouse.inside) {
      const { sx, sy } = S.mouse;
      const mode = S.cursorMode();
      c.strokeStyle = '#ffffff'; c.lineWidth = 1;
      if (mode !== 'pick') {
        const L = Math.max(W, H) * (S.st.cursorSize >= 100 ? 2 : S.st.cursorSize / 100);
        c.beginPath();
        if (S.st.iso || S.st.snapAng) {
          for (const a of S.orthoAxes()) {
            const dx = Math.cos(a) * L, dy = -Math.sin(a) * L;
            c.moveTo(sx - dx, sy - dy); c.lineTo(sx + dx, sy + dy);
          }
        } else {
          c.moveTo(Math.round(sx - L) + 0.5, Math.round(sy) + 0.5); c.lineTo(Math.round(sx + L) + 0.5, Math.round(sy) + 0.5);
          c.moveTo(Math.round(sx) + 0.5, Math.round(sy - L) + 0.5); c.lineTo(Math.round(sx) + 0.5, Math.round(sy + L) + 0.5);
        }
        c.stroke();
      }
      if (mode !== 'point') {
        const b = S.st.pickbox;
        c.strokeRect(Math.round(sx - b) + 0.5, Math.round(sy - b) + 0.5, 2 * b, 2 * b);
      }
    }
  }

  function drawSnapMarker(c, p, kind) {
    const r = 6;
    c.save();
    c.strokeStyle = '#e8d82a'; c.lineWidth = 2;
    c.beginPath();
    switch (kind) {
      case 'end': c.rect(p.x - r, p.y - r, 2 * r, 2 * r); break;
      case 'mid': c.moveTo(p.x, p.y - r); c.lineTo(p.x + r, p.y + r * 0.8); c.lineTo(p.x - r, p.y + r * 0.8); c.closePath(); break;
      case 'cen': c.arc(p.x, p.y, r, 0, G.TAU); break;
      case 'qua': c.moveTo(p.x, p.y - r); c.lineTo(p.x + r, p.y); c.lineTo(p.x, p.y + r); c.lineTo(p.x - r, p.y); c.closePath(); break;
      case 'int': c.moveTo(p.x - r, p.y - r); c.lineTo(p.x + r, p.y + r); c.moveTo(p.x + r, p.y - r); c.lineTo(p.x - r, p.y + r); break;
      case 'per': c.moveTo(p.x - r, p.y + r); c.lineTo(p.x + r, p.y + r); c.moveTo(p.x - r, p.y + r); c.lineTo(p.x - r, p.y - r); c.moveTo(p.x - r, p.y); c.lineTo(p.x, p.y); c.lineTo(p.x, p.y + r); break;
      case 'tan': c.arc(p.x, p.y, r * 0.75, 0, G.TAU); c.moveTo(p.x - r, p.y - r); c.lineTo(p.x + r, p.y - r); break;
      case 'nea': c.moveTo(p.x - r, p.y - r); c.lineTo(p.x + r, p.y - r); c.lineTo(p.x - r, p.y + r); c.lineTo(p.x + r, p.y + r); c.closePath(); break;
      case 'nod': c.arc(p.x, p.y, r, 0, G.TAU); c.moveTo(p.x - r, p.y - r); c.lineTo(p.x + r, p.y + r); c.moveTo(p.x + r, p.y - r); c.lineTo(p.x - r, p.y + r); break;
      case 'ins': c.rect(p.x - r, p.y - r, r, r); c.rect(p.x, p.y, r, r); break;
      default: c.rect(p.x - r, p.y - r, 2 * r, 2 * r);
    }
    c.stroke();
    const names = { end: 'Endpoint', mid: 'Midpoint', cen: 'Center', qua: 'Quadrant', int: 'Intersection', per: 'Perpendicular', tan: 'Tangent', nea: 'Nearest', nod: 'Node', ins: 'Insertion', grid: '' };
    const label = names[kind];
    if (label) {
      c.font = '12px "Segoe UI", system-ui, sans-serif';
      const w = c.measureText(label).width + 10;
      c.fillStyle = 'rgba(255,255,225,0.95)'; c.fillRect(p.x + 12, p.y + 12, w, 18);
      c.fillStyle = '#111'; c.fillText(label, p.x + 17, p.y + 25);
    }
    c.restore();
  }

  // ======================= picking =======================
  S.entitiesNear = (w, tolW) => {
    const out = [];
    for (const e of S.E) {
      if (!visibleLayer(e.layer)) continue;
      if (e.type !== 'xline') {
        const b = S.bbox(e);
        if (w.x < b[0] - tolW || w.x > b[2] + tolW || w.y < b[1] - tolW || w.y > b[3] + tolW) continue;
      }
      out.push(e);
    }
    return out;
  };
  function entDist(e, w) {
    if (e.type === 'text') { const c = G.textCorners(e); if (G.pointInPoly(w, c)) return 0; }
    if (e.type === 'solid' && G.pointInPoly(w, e.pts)) return 0;
    if (e.type === 'hatch') { let inside = false; for (const l of e.loops) if (G.pointInPoly(w, l)) inside = !inside; if (inside) return 0; }
    let best = Infinity;
    for (const pr of S.prims(e)) { const d = G.distToPrim(w, pr); if (d < best) best = d; }
    return best;
  }
  S.pick = (sx, sy, filter) => {
    const w = S.s2w(sx, sy), tol = S.st.pickbox / S.view.scale;
    let best = null, bd = Infinity;
    const list = S.entitiesNear(w, tol);
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!S.isSelectable(e) || (filter && !filter(e))) continue;
      let d = entDist(e, w);
      if (e.type === 'hatch' && d === 0) d = tol * 0.9; // prefer edges of other objects over hatch interiors
      if (d <= tol && d < bd) { bd = d; best = e; }
    }
    return best;
  };
  function inRect(p, r) { return p.x >= r[0] && p.x <= r[2] && p.y >= r[1] && p.y <= r[3]; }
  S.windowSelect = (a, b, crossing) => {
    const r = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
    const edges = [
      { k: 'L', a: P(r[0], r[1]), b: P(r[2], r[1]) }, { k: 'L', a: P(r[2], r[1]), b: P(r[2], r[3]) },
      { k: 'L', a: P(r[2], r[3]), b: P(r[0], r[3]) }, { k: 'L', a: P(r[0], r[3]), b: P(r[0], r[1]) },
    ];
    const out = [];
    for (const e of S.E) {
      if (!S.isSelectable(e)) continue;
      if (e.type === 'xline') {
        if (crossing && S.prims(e).some((pr) => edges.some((ed) => G.primInter(pr, ed).length))) out.push(e);
        continue;
      }
      const bb = S.bbox(e);
      if (bb[0] >= r[0] && bb[2] <= r[2] && bb[1] >= r[1] && bb[3] <= r[3]) { out.push(e); continue; }
      if (!crossing || bb[2] < r[0] || bb[0] > r[2] || bb[3] < r[1] || bb[1] > r[3]) continue;
      const pr = S.prims(e);
      let hit = pr.some((p) => (p.k === 'L' ? inRect(p.a, r) || inRect(p.b, r) : inRect(G.polar(p.c, p.a1, p.r), r)));
      if (!hit) hit = pr.some((p) => edges.some((ed) => G.primInter(p, ed).length));
      if (!hit) { const cpt = P((r[0] + r[2]) / 2, (r[1] + r[3]) / 2); hit = entDist(e, cpt) === 0 && (e.type === 'text' || e.type === 'hatch' || e.type === 'solid'); }
      if (hit) out.push(e);
    }
    return out;
  };

  // ======================= snapping =======================
  function snapCandidates(e, w, tolW, base) {
    const out = [];
    const modes = S.oneShot ? new Set([S.oneShot]) : S.st.osmodes;
    const add = (kind, p) => { if (modes.has(kind)) out.push({ kind, p }); };
    const pr = S.prims(e);
    const tess = e.type === 'ellipse' || e.type === 'spline' || e.type === 'text' || e.type === 'hatch';
    if (e.type === 'point') add('nod', P(e.x, e.y));
    if (e.type === 'text' || e.type === 'insert') add('ins', P(e.x, e.y));
    if (e.type === 'ellipse') {
      add('cen', P(e.cx, e.cy));
      if (G.isFullEllipse(e)) for (const t of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) add('qua', G.ellipsePoint(e, t));
      else { add('end', G.ellipsePoint(e, e.a1)); add('end', G.ellipsePoint(e, e.a2)); }
    }
    if (e.type === 'spline') { const sp = splinePts(e); if (sp.length) { add('end', sp[0]); add('end', sp[sp.length - 1]); } }
    for (const p of pr) {
      if (p.k === 'L') {
        if (p.pt) continue;
        if (!tess) { add('end', p.a); add('end', p.b); add('mid', G.mid(p.a, p.b)); }
        if (base && modes.has('per')) {
          const ab = G.sub(p.b, p.a), L2 = G.dot(ab, ab);
          if (L2 > 1e-24) { const t = G.dot(G.sub(base, p.a), ab) / L2; if (t >= -1e-9 && t <= 1 + 1e-9) add('per', G.add(p.a, G.mul(ab, t))); }
        }
      } else {
        if (G.dist(w, p.c) <= p.r + tolW * 2 || G.dist(w, p.c) < tolW * 3) add('cen', p.c);
        for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; if (p.full || G.angInArc(a, p.a1, p.a2)) add('qua', G.polar(p.c, a, p.r)); }
        if (!p.full) { add('end', G.polar(p.c, p.a1, p.r)); add('end', G.polar(p.c, p.a2, p.r)); add('mid', G.polar(p.c, p.a1 + G.sweep(p.a1, p.a2) / 2, p.r)); }
        if (base && modes.has('per')) { const a = G.ang(p.c, base); if (p.full || G.angInArc(a, p.a1, p.a2)) add('per', G.polar(p.c, a, p.r)); }
        if (base && modes.has('tan')) {
          const d = G.dist(base, p.c);
          if (d > p.r) { const a0 = G.ang(p.c, base), da = Math.acos(p.r / d); for (const a of [a0 + da, a0 - da]) if (p.full || G.angInArc(a, p.a1, p.a2)) add('tan', G.polar(p.c, a, p.r)); }
        }
      }
    }
    if (modes.has('nea')) {
      let best = null, bd = Infinity;
      for (const p of pr) { const c = G.closestOnPrim(w, p), d = G.dist(c, w); if (d < bd) { bd = d; best = c; } }
      if (best) add('nea', best);
    }
    return out;
  }
  S.findSnap = (sx, sy, base) => {
    if (!S.st.osnap && !S.oneShot) return null;
    const w = S.s2w(sx, sy), tolW = S.st.aperture / S.view.scale;
    const near = S.entitiesNear(w, tolW).filter((e) => visibleLayer(e.layer)).slice(-400);
    let best = null, bd = Infinity;
    const prio = { end: 0, int: 0, cen: 1, mid: 1, qua: 1, nod: 0, ins: 1, per: 2, tan: 2, nea: 5 };
    const consider = (c) => {
      const s = S.w2s(c.p), d = Math.hypot(s.x - sx, s.y - sy);
      if (d > S.st.aperture) return;
      const score = d + (prio[c.kind] || 0) * 1.5;
      if (score < bd) { bd = score; best = c; }
    };
    for (const e of near) for (const c of snapCandidates(e, w, tolW, base)) consider(c);
    const modes = S.oneShot ? new Set([S.oneShot]) : S.st.osmodes;
    if (modes.has('int') && near.length) {
      const prs = [];
      for (const e of near) for (const p of S.prims(e)) if (!p.pt && G.distToPrim(w, p) < tolW * 2) prs.push(p);
      for (let i = 0; i < prs.length && i < 200; i++) for (let j = i + 1; j < prs.length && j < 200; j++) {
        for (const p of G.primInter(prs[i], prs[j])) consider({ kind: 'int', p });
      }
    }
    return best;
  };

  // Drafting axes used by ortho, the crosshair and the grid: the current isometric plane, or the snap angle.
  S.ISO_AXES = { left: [150, 90], top: [30, 150], right: [30, 90] };
  S.orthoAxes = () => {
    if (S.st.iso) return S.ISO_AXES[S.st.isoplane || 'left'].map(G.rad);
    const a = G.rad(S.st.snapAng || 0);
    return [a, a + Math.PI / 2];
  };
  const COS30 = Math.cos(Math.PI / 6);
  // nearest point of the snap grid (rectangular, or the isometric lattice)
  S.gridSnap = (p) => {
    const g = S.st.snapSpacing || 10;
    if (S.st.iso) {
      const dx = g * COS30, i = Math.round(p.x / dx), j = Math.round((p.y - i * g / 2) / g);
      return P(i * dx, j * g + i * g / 2);
    }
    return P(Math.round(p.x / g) * g, Math.round(p.y / g) * g);
  };

  // Compute the effective point for a point request (snap, ortho, polar, grid snap, angle override)
  S.effectivePoint = (sx, sy, base) => {
    S.track = null;
    const raw = S.s2w(sx, sy);
    const sn = S.findSnap(sx, sy, base);
    if (sn) return { p: sn.p, snap: sn };
    let p = raw;
    if (S.st.snap) p = S.gridSnap(p);
    if (base) {
      const v = G.sub(p, base), d = G.len(v);
      if (S.angleLock != null && d > 0) {
        // angle override (<angle typed at the prompt): stay on the locked direction
        const u = P(Math.cos(S.angleLock), Math.sin(S.angleLock)), t = G.dot(v, u);
        p = G.add(base, G.mul(u, t));
        S.track = { base, ang: t >= 0 ? S.angleLock : S.angleLock + Math.PI, dist: Math.abs(t) };
      } else if (S.st.ortho && d > 0) {
        let best = null;
        for (const a of S.orthoAxes()) {
          const u = P(Math.cos(a), Math.sin(a)), t = G.dot(v, u);
          if (!best || Math.abs(t) > Math.abs(best.t)) best = { a, u, t };
        }
        p = G.add(base, G.mul(best.u, best.t));
        S.track = { base, ang: best.t >= 0 ? best.a : best.a + Math.PI, dist: Math.abs(best.t) };
      } else if (S.st.polar && d * S.view.scale > 10) {
        const inc = G.rad(S.st.polarInc || 45), a = Math.atan2(v.y, v.x), k = Math.round(a / inc), snapA = k * inc;
        const perpPx = Math.abs(Math.sin(a - snapA)) * d * S.view.scale;
        if (perpPx < 8) {
          const proj = d * Math.cos(a - snapA);
          p = G.polar(base, snapA, proj);
          S.track = { base, ang: snapA, dist: proj };
        }
      }
    }
    return { p, snap: null };
  };

  // ======================= grips =======================
  S.gripsOf = (e) => {
    const g = [];
    const add = (p, idx) => g.push({ e, p, idx });
    switch (e.type) {
      case 'line': add(P(e.x1, e.y1), 'p1'); add(P((e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2), 'mid'); add(P(e.x2, e.y2), 'p2'); break;
      case 'circle': add(P(e.cx, e.cy), 'c'); [0, 1, 2, 3].forEach((q) => add(G.polar(P(e.cx, e.cy), q * Math.PI / 2, e.r), 'q' + q)); break;
      case 'arc': {
        const c = P(e.cx, e.cy);
        add(c, 'c'); add(G.polar(c, e.a1, e.r), 'a1'); add(G.polar(c, e.a1 + G.sweep(e.a1, e.a2) / 2, e.r), 'am'); add(G.polar(c, e.a2, e.r), 'a2');
        break;
      }
      case 'pline': e.pts.forEach((p, i) => add(P(p.x, p.y), 'v' + i)); break;
      case 'ellipse': add(P(e.cx, e.cy), 'c'); add(P(e.cx + e.mx, e.cy + e.my), 'maj'); add(G.ellipsePoint(e, Math.PI / 2), 'min'); break;
      case 'spline': (e.fit || e.ctrl || []).forEach((p, i) => add(P(p.x, p.y), 's' + i)); break;
      case 'text': case 'insert': case 'point': add(P(e.x, e.y), 'pos'); break;
      case 'xline': add(P(e.x, e.y), 'pos'); break;
      case 'solid': e.pts.forEach((p, i) => add(P(p.x, p.y), 'v' + i)); break;
      case 'dim':
        if (e.kind === 'radius' || e.kind === 'diameter' || e.kind === 'angular') { add(P(e.cx, e.cy), 'c'); add(P(e.lx, e.ly), 'loc'); }
        else { add(P(e.x1, e.y1), 'd1'); add(P(e.x2, e.y2), 'd2'); add(P(e.lx, e.ly), 'loc'); }
        break;
      case 'hatch': { const b = S.bbox(e); add(P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), 'pos'); break; }
      case 'viewport':
        add(P(e.x, e.y), 'k0'); add(P(e.x + e.w, e.y), 'k1'); add(P(e.x + e.w, e.y + e.h), 'k2'); add(P(e.x, e.y + e.h), 'k3');
        add(P(e.x + e.w / 2, e.y + e.h / 2), 'pos');
        break;
    }
    return g;
  };
  S.grips = () => {
    if (S.selection.size > 150) return [];
    const out = [];
    for (const e of S.selection) out.push(...S.gripsOf(e));
    return out;
  };
  // apply a grip move: returns the new entity
  S.gripEdit = (e, idx, p, from) => {
    const d = G.sub(p, from);
    const moved = () => G.transformEntity(e, M.translate(d.x, d.y));
    switch (e.type) {
      case 'line':
        if (idx === 'p1') return { ...e, x1: p.x, y1: p.y };
        if (idx === 'p2') return { ...e, x2: p.x, y2: p.y };
        return moved();
      case 'circle':
        if (idx === 'c') return moved();
        return { ...e, r: Math.max(1e-9, G.dist(P(e.cx, e.cy), p)) };
      case 'arc': {
        if (idx === 'c') return moved();
        const c = P(e.cx, e.cy);
        let A = G.polar(c, e.a1, e.r), B = G.polar(c, e.a2, e.r), Mi = G.polar(c, e.a1 + G.sweep(e.a1, e.a2) / 2, e.r);
        if (idx === 'a1') A = p; else if (idx === 'a2') B = p; else Mi = p;
        return S.arc3(A, Mi, B, e) || e;
      }
      case 'pline': { const i = +idx.slice(1); const pts = e.pts.map((q) => ({ ...q })); pts[i].x = p.x; pts[i].y = p.y; return { ...e, pts }; }
      case 'solid': { const i = +idx.slice(1); const pts = e.pts.map((q) => ({ ...q })); pts[i] = P(p.x, p.y); return { ...e, pts }; }
      case 'spline': {
        const i = +idx.slice(1), key = e.fit ? 'fit' : 'ctrl';
        const arr = e[key].map((q) => ({ ...q })); arr[i] = P(p.x, p.y); return { ...e, [key]: arr };
      }
      case 'ellipse':
        if (idx === 'c') return moved();
        if (idx === 'maj') return { ...e, mx: p.x - e.cx, my: p.y - e.cy };
        { const R = Math.hypot(e.mx, e.my); return { ...e, ratio: Math.max(1e-6, Math.min(1, G.dist(P(e.cx, e.cy), p) / R)) }; }
      case 'viewport': {
        if (idx === 'pos') return moved();
        const i = +idx.slice(1), corners = [P(e.x, e.y), P(e.x + e.w, e.y), P(e.x + e.w, e.y + e.h), P(e.x, e.y + e.h)];
        const opp = corners[(i + 2) % 4];
        const w = Math.abs(p.x - opp.x), h = Math.abs(p.y - opp.y);
        if (w < 1e-6 || h < 1e-6) return e;
        return { ...e, x: Math.min(p.x, opp.x), y: Math.min(p.y, opp.y), w, h };
      }
      case 'dim':
        if (idx === 'd1') return { ...e, x1: p.x, y1: p.y };
        if (idx === 'd2') return { ...e, x2: p.x, y2: p.y };
        if (idx === 'loc') return { ...e, lx: p.x, ly: p.y };
        return moved();
      default: return moved();
    }
  };
  S.arc3 = (a, b, c, base) => {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-12) return null;
    const ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y) + (b.x * b.x + b.y * b.y) * (c.y - a.y) + (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
    const uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x) + (b.x * b.x + b.y * b.y) * (a.x - c.x) + (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;
    const ctr = P(ux, uy), r = G.dist(ctr, a);
    const aa = G.ang(ctr, a), ab = G.ang(ctr, b), ac = G.ang(ctr, c);
    const ccw = G.angInArc(ab, aa, ac);
    return { ...(base || { type: 'arc' }), type: 'arc', cx: ux, cy: uy, r, a1: G.normAng(ccw ? aa : ac), a2: G.normAng(ccw ? ac : aa) };
  };

  // ======================= messages / prompt =======================
  const hist = document.getElementById('cmd-history');
  const promptEl = document.getElementById('cmd-prompt');
  const inputEl = document.getElementById('cmd-input');
  S.inputEl = inputEl;
  S.msg = (text, cls) => {
    const div = document.createElement('div');
    div.className = 'hl' + (cls ? ' ' + cls : '');
    div.textContent = text;
    hist.appendChild(div);
    while (hist.childElementCount > 500) hist.firstChild.remove();
    hist.scrollTop = hist.scrollHeight;
  };
  S.setPrompt = (text, keywords, def) => {
    promptEl.innerHTML = '';
    const base = document.createElement('span');
    base.textContent = text || 'Type a command';
    promptEl.appendChild(base);
    if (keywords && keywords.length) {
      promptEl.appendChild(document.createTextNode(' ['));
      keywords.forEach((k, i) => {
        if (i) promptEl.appendChild(document.createTextNode('/'));
        const a = document.createElement('span');
        a.className = 'kw';
        const m = k.match(/[A-Z]/);
        a.innerHTML = m ? k.replace(m[0], `<u>${m[0]}</u>`) : k;
        a.onclick = () => S.submit(k);
        promptEl.appendChild(a);
      });
      promptEl.appendChild(document.createTextNode(']'));
    }
    if (def != null && def !== '') promptEl.appendChild(document.createTextNode(` <${def}>`));
    promptEl.appendChild(document.createTextNode(':'));
    S.emit('prompt');
  };

  // ======================= input requests =======================
  class Cancel extends Error { constructor() { super('*Cancel*'); this.cancel = true; } }
  S.Cancel = Cancel;
  S.input = null;
  S.lastPoint = null;
  S.cursorMode = () => {
    const k = S.input && S.input.kind;
    if (!k) return S.hotGrip ? 'point' : 'idle';
    if (k === 'select' || k === 'entity') return 'pick';
    return 'point';
  };
  function request(kind, prompt, opts = {}) {
    return new Promise((resolve, reject) => {
      S.input = { kind, prompt, ...opts, resolve, reject };
      S.oneShot = null;
      S.setPrompt(prompt, opts.keywords, opts.def);
      S.updatePreview();
      S.overlay();
    });
  }
  const finishInput = (value, echo) => {
    const inp = S.input;
    if (!inp) return;
    S.input = null; S.preview = null; S.ghost = null; S.track = null; S.snapPt = null; S.oneShot = null; S.angleLock = null;
    if (echo != null) S.msg(`${inp.prompt}${inp.keywords && inp.keywords.length ? ' [' + inp.keywords.join('/') + ']' : ''}: ${echo}`, 'echo');
    S.overlay();
    inp.resolve(value);
  };
  S.cancelInput = () => {
    const inp = S.input;
    if (!inp) return false;
    S.input = null; S.preview = null; S.ghost = null; S.track = null; S.snapPt = null; S.win = null; S.angleLock = null;
    S.overlay();
    inp.reject(new Cancel());
    return true;
  };

  /** opts: base, keywords, def, allowNone, preview(p) -> entities, ghost(p) -> entities */
  S.getPoint = (prompt, opts = {}) => request('point', prompt, opts);
  S.getDistance = (prompt, opts = {}) => request('distance', prompt, opts);
  S.getAngle = (prompt, opts = {}) => request('angle', prompt, opts);
  S.getString = (prompt, opts = {}) => request('string', prompt, opts);
  S.getKeyword = (prompt, keywords, def) => request('keyword', prompt, { keywords, def, allowNone: def != null });
  S.getEntity = (prompt, opts = {}) => request('entity', prompt, opts);
  S.getNumber = (prompt, opts = {}) => request('number', prompt, opts);
  S.getSelection = async (prompt = 'Select objects', opts = {}) => {
    if (S.selection.size && S.pickfirst) {
      const list = [...S.selection];
      S.pickfirst = false;
      S.msg(`${list.length} found`);
      return list;
    }
    S.pickfirst = false;
    const temp = new Set(S.selection);
    S.selection = temp;
    S.render();
    for (;;) {
      const r = await request('select', prompt, { ...opts, temp, allowNone: true });
      if (r == null) break;
      if (r === 'ALL') { for (const e of S.E) if (S.isSelectable(e)) temp.add(e); S.msg(`${temp.size} found`); S.render(); continue; }
      if (r === 'L' && S.last && S.E.includes(S.last)) { temp.add(S.last); S.render(); continue; }
      if (r === 'P' && S.prevSel) { for (const e of S.prevSel) if (S.E.includes(e)) temp.add(e); S.render(); continue; }
    }
    const list = [...temp].filter((e) => S.E.includes(e));
    S.prevSel = list;
    S.selection = new Set();
    S.render();
    return list;
  };

  // text submitted from the command line (or a clicked keyword)
  S.submit = (raw) => {
    const text = String(raw).trim();
    inputEl.value = '';
    S.emit('typed', '');
    const inp = S.input;
    if (!inp) {
      if (!text) { if (S.lastCommand) S.runCommand(S.lastCommand); return; }
      S.runCommand(text);
      return;
    }
    const kw = matchKeyword(inp.keywords, text);
    if (text === '') {
      if (inp.kind === 'select') return finishInput(null, '');
      if (inp.def != null) {
        if (inp.kind === 'distance' || inp.kind === 'angle' || inp.kind === 'number') return finishInput(parseFloat(inp.def), String(inp.def));
        if (inp.kind === 'keyword') return finishInput(inp.def, String(inp.def));
        if (inp.kind === 'string') return finishInput(String(inp.def), String(inp.def));
      }
      if (inp.allowNone || inp.kind === 'string') return finishInput(inp.kind === 'string' ? '' : null, '');
      return;
    }
    if (kw) return finishInput(kw, kw);
    const osnapCodes = { END: 'end', MID: 'mid', CEN: 'cen', INT: 'int', PER: 'per', TAN: 'tan', NEA: 'nea', QUA: 'qua', NOD: 'nod', INS: 'ins' };
    const up = text.toUpperCase();
    switch (inp.kind) {
      case 'string': return finishInput(String(raw).replace(/^\s+|\s+$/g, ''), text);
      case 'keyword': S.msg('Invalid option keyword.', 'err'); return;
      case 'select':
        if (up === 'ALL' || up === 'L' || up === 'P') return finishInput(up, up);
        S.msg('*Invalid selection*  Expects a point or ALL/Last/Previous', 'err'); return;
      case 'entity': S.msg('Select an object.', 'err'); return;
      case 'number': {
        const v = parseFloat(text);
        if (isFinite(v)) return finishInput(v, text);
        S.msg('Requires a number.', 'err'); return;
      }
      default: {
        const lock = text.match(/^<\s*(-?\d*\.?\d+)$/);
        if (lock && (inp.kind === 'point' || inp.kind === 'distance')) {
          if (!inp.base) { S.msg('Angle override needs a previous point.', 'err'); return; }
          S.angleLock = G.rad(+lock[1]);
          S.msg(`Angle Override: ${lock[1]}`);
          S.overlay();
          return;
        }
        if (osnapCodes[up.slice(0, 3)] && (inp.kind === 'point' || inp.kind === 'distance')) {
          S.oneShot = osnapCodes[up.slice(0, 3)]; S.msg(`of`); return;
        }
        const v = parseFloat(text);
        if (/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(text)) {
          if (inp.kind === 'distance' || inp.kind === 'angle') return finishInput(v, text);
          if (inp.kind === 'point' && inp.base) { // direct distance entry along the cursor direction
            const cur = S.cursorWorld || G.add(inp.base, P(1, 0));
            let dir = G.sub(cur, inp.base);
            if (S.angleLock != null) dir = P(Math.cos(S.angleLock), Math.sin(S.angleLock));
            else if (S.track) dir = P(Math.cos(S.track.ang), Math.sin(S.track.ang));
            if (G.len(dir) < 1e-12) dir = P(1, 0);
            const p = G.add(inp.base, G.mul(G.norm(dir), v));
            S.lastPoint = p;
            return finishInput(p, text);
          }
        }
        const p = G.parsePointInput(text, S.lastPoint);
        if (p) {
          if (inp.kind === 'distance' && inp.base) return finishInput(G.dist(inp.base, p), text);
          if (inp.kind === 'angle' && inp.base) return finishInput(G.deg(G.ang(inp.base, p)), text);
          S.lastPoint = p;
          return finishInput(p, text);
        }
        S.msg(inp.kind === 'point' ? 'Invalid point.' : 'Requires numeric value or a point.', 'err');
      }
    }
  };
  function matchKeyword(keywords, text) {
    if (!keywords || !text) return null;
    const up = text.toUpperCase();
    for (const k of keywords) {
      const caps = (k.match(/[A-Z]+/) || [k.toUpperCase()])[0];
      if (up === k.toUpperCase() || up === caps || (up.length >= caps.length && k.toUpperCase().startsWith(up))) return k;
    }
    return null;
  }

  // point delivered from the mouse
  function clickPoint(w, raw) {
    const inp = S.input;
    if (inp.kind === 'point') { S.lastPoint = w; return finishInput(w, S.fmtPt(w)); }
    if (inp.kind === 'distance') {
      if (inp.base) return finishInput(G.dist(inp.base, w), S.fmt(G.dist(inp.base, w)));
      // two-point distance
      const from = w;
      S.input = null;
      S.getPoint('Specify second point', { base: from, preview: (p) => [{ _rubber: true, x1: from.x, y1: from.y, x2: p.x, y2: p.y }] })
        .then((q) => inp.resolve(G.dist(from, q))).catch(inp.reject);
      return;
    }
    if (inp.kind === 'angle') {
      if (inp.base) return finishInput(G.deg(G.ang(inp.base, w)), S.fmt(G.deg(G.ang(inp.base, w)), 2));
      const from = w;
      S.input = null;
      S.getPoint('Specify second point', { base: from }).then((q) => inp.resolve(G.deg(G.ang(from, q)))).catch(inp.reject);
      return;
    }
    void raw;
  }

  S.updatePreview = () => {
    const inp = S.input;
    if (!inp || !S.cursorWorld) return;
    const p = S.cursorWorld;
    S.preview = inp.preview ? inp.preview(p) : null;
    S.ghost = inp.ghost ? inp.ghost(p) : null;
    if (!inp.preview && inp.base && (inp.kind === 'point' || inp.kind === 'distance' || inp.kind === 'angle') && !inp.noRubber) {
      S.preview = [{ _rubber: true, x1: inp.base.x, y1: inp.base.y, x2: p.x, y2: p.y }];
    }
    S.emit('cursor');
  };

  // ======================= mouse =======================
  let panning = null;
  const wantsPoint = () => S.input && (S.input.kind === 'point' || S.input.kind === 'distance' || S.input.kind === 'angle');
  function onMove(ev) {
    const r = ov.getBoundingClientRect();
    const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    S.mouse.sx = sx; S.mouse.sy = sy; S.mouse.inside = true;
    if (panning) {
      S.view.cx -= (sx - panning.sx) / S.view.scale; S.view.cy += (sy - panning.sy) / S.view.scale;
      panning.sx = sx; panning.sy = sy; S.render();
    }
    const base = S.input ? S.input.base : S.hotGrip ? S.hotGrip.p : null;
    if (wantsPoint() || (S.input && S.input.grip)) {
      const ep = S.effectivePoint(sx, sy, base);
      S.snapPt = ep.snap; S.cursorWorld = ep.p;
    } else {
      S.snapPt = null; S.track = null; S.cursorWorld = S.s2w(sx, sy);
    }
    S.mouse.w = S.s2w(sx, sy);
    if (S.win) S.win.b = S.mouse.w;
    // hover feedback
    if (!panning && !S.win && (!S.input || S.input.kind === 'select' || S.input.kind === 'entity')) {
      S.hoverGrip = null;
      if (!S.input) {
        for (const g of S.grips()) { const p = S.w2s(g.p); if (Math.abs(p.x - sx) <= 6 && Math.abs(p.y - sy) <= 6) { S.hoverGrip = g; break; } }
      }
      S.hover = S.hoverGrip ? null : S.pick(sx, sy, S.input && S.input.filter);
    } else S.hover = null;
    S.updatePreview();
    S.emit('cursor');
    S.overlay();
  }
  ov.addEventListener('mousemove', onMove);
  ov.addEventListener('mouseleave', () => { S.mouse.inside = false; S.hover = null; S.overlay(); S.emit('cursor'); });
  ov.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = ov.getBoundingClientRect();
    S.zoomAt(ev.clientX - r.left, ev.clientY - r.top, ev.deltaY < 0 ? 1.2 : 1 / 1.2);
    onMove(ev);
  }, { passive: false });
  let lastMiddle = 0;
  ov.addEventListener('mousedown', (ev) => {
    const r = ov.getBoundingClientRect();
    const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    ev.preventDefault(); // keep keyboard focus on the command line
    S.inputEl.focus({ preventScroll: true });
    if (ev.button === 1) {
      ev.preventDefault();
      const now = Date.now();
      if (now - lastMiddle < 350) { S.zoomExtents(); lastMiddle = 0; return; }
      lastMiddle = now;
      panning = { sx, sy };
      ov.classList.add('panning');
      return;
    }
    if (ev.button !== 0) return;
    const w = S.s2w(sx, sy);
    // window selection in progress (click-click mode)
    if (S.win) { finishWindow(w, ev.shiftKey); return; }
    const inp = S.input;
    if (inp) {
      if (inp.grip || wantsPoint()) { const ep = S.effectivePoint(sx, sy, inp.base); clickPoint(ep.p, w); return; }
      if (inp.kind === 'entity') {
        const e = S.pick(sx, sy, inp.filter);
        if (e) finishInput({ e, p: w }, '');
        else S.msg(inp.emptyMsg || 'No object found.', 'err');
        return;
      }
      if (inp.kind === 'select') {
        const e = S.pick(sx, sy);
        if (e) {
          if (ev.shiftKey) inp.temp.delete(e); else inp.temp.add(e);
          S.msg(`1 found, ${inp.temp.size} total`);
          S.render();
        } else startWindow(w, sx, sy);
        return;
      }
      return;
    }
    // idle
    if (S.hoverGrip) { startGripEdit(S.hoverGrip); return; }
    const e = S.pick(sx, sy);
    if (e) {
      if (ev.shiftKey) S.selection.delete(e); else S.selection.add(e);
      S.emit('selection'); S.render();
    } else startWindow(w, sx, sy);
  });
  window.addEventListener('mouseup', (ev) => {
    if (ev.button === 1 && panning) { panning = null; ov.classList.remove('panning'); return; }
    if (ev.button === 0 && S.win && S.win.dragged) finishWindow(S.mouse.w, ev.shiftKey);
  });
  window.addEventListener('mousemove', (ev) => {
    if (S.win && !S.win.dragged && (ev.buttons & 1)) {
      const r = ov.getBoundingClientRect();
      if (Math.hypot(ev.clientX - r.left - S.win.sx, ev.clientY - r.top - S.win.sy) > 6) S.win.dragged = true;
    }
  });
  function startWindow(w, sx, sy) { S.win = { a: w, b: w, sx, sy, dragged: false }; S.overlay(); }
  function finishWindow(w, shift) {
    const a = S.win.a, sa = S.w2s(a), sb = S.w2s(w);
    S.win = null;
    if (Math.hypot(sa.x - sb.x, sa.y - sb.y) < 3) { S.overlay(); return; }
    const crossing = sb.x < sa.x;
    const found = S.windowSelect(a, w, crossing);
    const target = S.input && S.input.kind === 'select' ? S.input.temp : S.selection;
    for (const e of found) { if (shift) target.delete(e); else target.add(e); }
    if (S.input && S.input.kind === 'select') S.msg(`${found.length} found, ${target.size} total`);
    S.emit('selection'); S.render();
  }

  async function startGripEdit(g) {
    S.hotGrip = g;
    S.hoverGrip = null;
    S.overlay();
    try {
      const p = await S.getPoint('Specify stretch point', {
        base: g.p, grip: true, keywords: ['Copy', 'Undo', 'eXit'], noRubber: false,
        ghost: (q) => [S.gripEdit(g.e, g.idx, q, g.p)],
      });
      if (p && typeof p === 'object') {
        const n = S.decorate(S.gripEdit(g.e, g.idx, p, g.p));
        S.runningName = 'Grip edit';
        S.replace(new Map([[g.e, [n]]]));
        S.endOp();
        S.selection = new Set([n]);
      }
    } catch (err) { if (!err.cancel) throw err; }
    S.hotGrip = null;
    S.setPrompt('');
    S.emit('selection');
    S.render();
  }

  ov.addEventListener('contextmenu', (ev) => { ev.preventDefault(); S.emit('contextmenu', ev); });
  ov.addEventListener('dblclick', (ev) => {
    if (S.input) return;
    const r = ov.getBoundingClientRect();
    const e = S.pick(ev.clientX - r.left, ev.clientY - r.top);
    if (e && e.type === 'text') S.emit('edittext', e);
    else if (e && e.type === 'insert' && e.attribs && e.attribs.length) S.emit('editattribs', e);
    else if (e) { S.selection = new Set([e]); S.emit('selection'); S.emit('properties', true); S.render(); }
  });

  // ======================= commands =======================
  S.commands = {};
  S.aliases = {};
  S.register = (name, fn, opts = {}) => {
    S.commands[name] = { name, fn, desc: opts.desc || '', group: opts.group || 'Other', noUndo: !!opts.noUndo, pickfirst: opts.pickfirst !== false };
    for (const a of opts.aliases || []) S.aliases[a] = name;
  };
  S.resolveCommand = (text) => {
    const up = text.trim().toUpperCase().replace(/^[_.'-]+/, '');
    if (S.commands[up]) return up;
    if (S.aliases[up]) return S.aliases[up];
    return null;
  };
  S.running = null;
  S.runCommand = async (text) => {
    const name = S.resolveCommand(text);
    if (!name) { S.msg(`Unknown command "${text.toUpperCase()}".  Press F1 for help.`, 'err'); return; }
    if (S.running) { S.cancelInput(); await new Promise((r) => setTimeout(r, 0)); }
    if (S.hotGrip) { S.cancelInput(); await new Promise((r) => setTimeout(r, 0)); }
    const cmd = S.commands[name];
    S.msg(`Command: ${name}`, 'cmd');
    S.lastCommand = name;
    S.pickfirst = cmd.pickfirst && S.selection.size > 0;
    if (!S.pickfirst && S.selection.size) { S.selection.clear(); S.render(); }
    S.running = name; S.runningName = name;
    opTouched();
    S.emit('command', name);
    try {
      await cmd.fn(S);
    } catch (err) {
      if (err && err.cancel) S.msg('*Cancel*');
      else { console.error(err); S.msg('Error: ' + (err && err.message ? err.message : err), 'err'); }
    } finally {
      S.running = null; S.input = null; S.preview = null; S.ghost = null; S.track = null; S.snapPt = null; S.win = null; S.oneShot = null;
      S.pickfirst = false;
      S.endOp();
      S.setPrompt('');
      S.emit('command', null);
      S.emit('doc');
      S.render();
    }
  };
  function opTouched() { S.endOp(); }

  // escape handling
  S.escape = () => {
    if (S.win) { S.win = null; S.overlay(); return; }
    if (S.input) { S.cancelInput(); return; }
    if (S.selection.size) { S.selection.clear(); S.emit('selection'); S.render(); }
  };

  S.setPrompt('');
  // expose for the other modules
  S._finishInput = finishInput;
})();
