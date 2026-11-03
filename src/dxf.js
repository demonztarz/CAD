/* DXF import (ASCII, R12–2018 common entities) and export (R12/AC1009, readable by all major CAD programs). */
(function (root) {
  'use strict';
  const G = typeof module !== 'undefined' && module.exports ? require('./geom.js') : root.G;
  const DC = typeof module !== 'undefined' && module.exports ? require('./dwgconvert.js') : root.DwgConvert;
  const TAU = Math.PI * 2, D2R = Math.PI / 180;

  // ---------------- reader ----------------
  function tokenize(text) {
    const lines = text.split(/\r\n|\r|\n/);
    const out = [];
    for (let i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i].trim(), 10), lines[i + 1]]);
    return out;
  }
  // Split a flat token list into records starting at each code-0 token.
  function records(tokens, start, endName) {
    const recs = [];
    let i = start;
    while (i < tokens.length) {
      const [c, v] = tokens[i];
      if (c === 0 && v.trim() === endName) return { recs, next: i + 1 };
      if (c === 0) {
        const rec = { type: v.trim(), g: [] };
        i++;
        while (i < tokens.length && tokens[i][0] !== 0) { rec.g.push(tokens[i]); i++; }
        recs.push(rec);
      } else i++;
    }
    return { recs, next: i };
  }
  const first = (rec, code, def) => { for (const [c, v] of rec.g) if (c === code) return v; return def; };
  const num = (rec, code, def = 0) => { const v = first(rec, code); return v == null ? def : parseFloat(v); };
  const all = (rec, code) => rec.g.filter(([c]) => c === code).map(([, v]) => v);

  function readDxf(text) {
    const tokens = tokenize(text);
    const layers = [], blocks = {}, entities = [];
    const stats = { converted: 0, skipped: {} };
    let insunits = 4;
    let i = 0;
    while (i < tokens.length) {
      const [c, v] = tokens[i];
      if (c === 0 && v.trim() === 'SECTION') {
        const name = (tokens[i + 1] || [0, ''])[1].trim();
        const { recs, next } = records(tokens, i + 2, 'ENDSEC');
        i = next;
        if (name === 'HEADER') {
          const hdr = tokens.slice(0, next);
          for (let k = 0; k < hdr.length; k++) if (hdr[k][0] === 9 && hdr[k][1].trim() === '$INSUNITS' && hdr[k + 1]) insunits = parseInt(hdr[k + 1][1], 10);
        } else if (name === 'TABLES') {
          for (const r of recs) if (r.type === 'LAYER' && first(r, 2) != null) {
            const ci = parseInt(first(r, 62, '7'), 10), fl = parseInt(first(r, 70, '0'), 10);
            const tc = first(r, 420);
            const lwv = parseInt(first(r, 370, '-3'), 10);
            layers.push({
              name: first(r, 2).trim(), color: tc != null ? '#' + (parseInt(tc, 10) & 0xffffff).toString(16).padStart(6, '0') : Math.abs(ci) % 256 || 7,
              ltype: (first(r, 6, 'CONTINUOUS') || 'CONTINUOUS').trim().toUpperCase(), on: ci >= 0, frozen: !!(fl & 1), locked: !!(fl & 4), lw: lwv >= 0 ? lwv / 100 : 0.25,
            });
          }
        } else if (name === 'BLOCKS') {
          let cur = null;
          for (let k = 0; k < recs.length; k++) {
            const r = recs[k];
            if (r.type === 'BLOCK') { cur = { name: (first(r, 2, '') || '').trim(), base: { x: num(r, 10), y: num(r, 20) }, recs: [] }; continue; }
            if (r.type === 'ENDBLK') { if (cur && cur.name) blocks[cur.name] = { base: cur.base, entities: convertRecords(cur.recs, stats) }; cur = null; continue; }
            if (cur) cur.recs.push(r);
          }
        } else if (name === 'ENTITIES') {
          entities.push(...convertRecords(recs, stats, true));
        }
        continue;
      }
      i++;
    }
    for (const k of Object.keys(blocks)) if (/^\*(Model|Paper)_Space/i.test(k)) delete blocks[k];
    if (!layers.some((l) => l.name === '0')) layers.unshift({ name: '0', color: 7, ltype: 'CONTINUOUS', on: true, frozen: false, locked: false, lw: 0.25 });
    // make sure every referenced layer exists
    const known = new Set(layers.map((l) => l.name));
    const visit = (list) => { for (const e of list) if (e.layer && !known.has(e.layer)) { known.add(e.layer); layers.push({ name: e.layer, color: 7, ltype: 'CONTINUOUS', on: true, frozen: false, locked: false, lw: 0.25 }); } };
    visit(entities); for (const b of Object.values(blocks)) visit(b.entities);
    return { doc: { version: 1, entities, layers, blocks, clayer: '0', settings: { insunits } }, stats };
  }

  function convertRecords(recs, stats, modelOnly) {
    const out = [];
    const skip = (t) => { stats.skipped[t] = (stats.skipped[t] || 0) + 1; };
    for (let k = 0; k < recs.length; k++) {
      const r = recs[k];
      if (modelOnly && first(r, 67) === '1') { // paper space: also skip its trailing vertices
        if (r.type === 'POLYLINE' || (r.type === 'INSERT' && first(r, 66) === '1')) while (k + 1 < recs.length && recs[k].type !== 'SEQEND') k++;
        continue;
      }
      const com = (o) => {
        o.layer = (first(r, 8, '0') || '0').trim();
        const tc = first(r, 420);
        const ci = first(r, 62);
        if (tc != null) o.color = '#' + (parseInt(tc, 10) & 0xffffff).toString(16).padStart(6, '0');
        else if (ci != null) { const n = parseInt(ci, 10); if (n === 0) o.color = 0; else if (n > 0 && n < 256) o.color = n; }
        const lt = first(r, 6); if (lt && !/^BY(LAYER|BLOCK)$/i.test(lt.trim())) o.ltype = lt.trim().toUpperCase();
        const lw = first(r, 370); if (lw != null && parseInt(lw, 10) >= 0) o.lw = parseInt(lw, 10) / 100;
        stats.converted++;
        return o;
      };
      const flip = num(r, 230, 1) < -0.5;
      const fx = (x) => (flip ? -x : x);
      switch (r.type) {
        case 'LINE': out.push(com({ type: 'line', x1: num(r, 10), y1: num(r, 20), x2: num(r, 11), y2: num(r, 21) })); break;
        case 'CIRCLE': out.push(com({ type: 'circle', cx: fx(num(r, 10)), cy: num(r, 20), r: num(r, 40) })); break;
        case 'ARC': {
          let a1 = num(r, 50) * D2R, a2 = num(r, 51) * D2R;
          if (flip) [a1, a2] = [Math.PI - a2, Math.PI - a1];
          out.push(com({ type: 'arc', cx: fx(num(r, 10)), cy: num(r, 20), r: num(r, 40), a1: G.normAng(a1), a2: G.normAng(a2) }));
          break;
        }
        case 'LWPOLYLINE': {
          const pts = [];
          for (const [c, v] of r.g) {
            if (c === 10) pts.push({ x: fx(parseFloat(v)), y: 0, b: 0 });
            else if (c === 20 && pts.length) pts[pts.length - 1].y = parseFloat(v);
            else if (c === 42 && pts.length) pts[pts.length - 1].b = (flip ? -1 : 1) * parseFloat(v);
          }
          if (pts.length) out.push(com({ type: 'pline', pts, closed: !!(num(r, 70) & 1) }));
          break;
        }
        case 'POLYLINE': {
          const fl = num(r, 70), pts = [];
          while (k + 1 < recs.length && recs[k + 1].type === 'VERTEX') {
            k++;
            const v = recs[k];
            if (num(v, 70) & 16) continue; // spline frame control point
            pts.push({ x: fx(num(v, 10)), y: num(v, 20), b: (flip ? -1 : 1) * num(v, 42) });
          }
          if (k + 1 < recs.length && recs[k + 1].type === 'SEQEND') k++;
          if (fl & (16 | 64)) { skip('POLYLINE(mesh)'); break; }
          if (pts.length) out.push(com({ type: 'pline', pts, closed: !!(fl & 1) }));
          break;
        }
        case 'TEXT': case 'ATTRIB': {
          if (r.type === 'ATTRIB' && num(r, 70) & 1) break;
          const ha = ['left', 'center', 'right', 'left', 'center', 'left'][num(r, 72) | 0] || 'left';
          const va = ['baseline', 'bottom', 'middle', 'top'][num(r, r.type === 'ATTRIB' ? 74 : 73) | 0] || 'baseline';
          const useAlign = (num(r, 72) | 0) !== 0 || (num(r, r.type === 'ATTRIB' ? 74 : 73) | 0) !== 0;
          const x = useAlign && first(r, 11) != null ? num(r, 11) : num(r, 10), y = useAlign && first(r, 21) != null ? num(r, 21) : num(r, 20);
          let rot = num(r, 50) * D2R;
          const o = com({ type: 'text', x: fx(x), y, h: num(r, 40, 1), rot: flip ? Math.PI - rot : rot, text: DC.cleanText(first(r, 1, '')), ha, va });
          if (num(r, 41, 1) !== 1) o.wf = num(r, 41, 1);
          out.push(o);
          break;
        }
        case 'MTEXT': {
          const att = num(r, 71, 1) | 0;
          const map = { 1: ['left', 'top'], 2: ['center', 'top'], 3: ['right', 'top'], 4: ['left', 'middle'], 5: ['center', 'middle'], 6: ['right', 'middle'], 7: ['left', 'bottom'], 8: ['center', 'bottom'], 9: ['right', 'bottom'] }[att] || ['left', 'top'];
          let rot = num(r, 50) * D2R;
          if (first(r, 11) != null) rot = Math.atan2(num(r, 21), num(r, 11));
          const txt = all(r, 3).join('') + (first(r, 1, '') || '');
          out.push(com({ type: 'text', x: num(r, 10), y: num(r, 20), h: num(r, 40, 1), rot, text: DC.cleanMText(txt), ha: map[0], va: map[1] }));
          break;
        }
        case 'POINT': out.push(com({ type: 'point', x: num(r, 10), y: num(r, 20) })); break;
        case 'ELLIPSE': {
          const p1 = num(r, 41, 0), p2 = num(r, 42, TAU);
          const o = { type: 'ellipse', cx: num(r, 10), cy: num(r, 20), mx: num(r, 11), my: num(r, 21), ratio: num(r, 40, 1) };
          if (Math.abs(((p2 - p1) % TAU + TAU) % TAU) > 1e-9) { o.a1 = p1; o.a2 = p2; }
          out.push(com(o));
          break;
        }
        case 'SPLINE': {
          const ctrl = [], fit = [], knots = all(r, 40).map(parseFloat), weights = all(r, 41).map(parseFloat);
          for (const [c, v] of r.g) {
            if (c === 10) ctrl.push({ x: parseFloat(v), y: 0 }); else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1].y = parseFloat(v);
            else if (c === 11) fit.push({ x: parseFloat(v), y: 0 }); else if (c === 21 && fit.length) fit[fit.length - 1].y = parseFloat(v);
          }
          const o = { type: 'spline', closed: !!(num(r, 70) & 1) };
          if (ctrl.length > 1) { o.ctrl = ctrl; o.knots = knots; o.degree = num(r, 71, 3); if (weights.length === ctrl.length) o.weights = weights; }
          else if (fit.length > 1) o.fit = fit;
          else { skip('SPLINE'); break; }
          out.push(com(o));
          break;
        }
        case 'INSERT': {
          const o = com({ type: 'insert', name: (first(r, 2, '') || '').trim(), x: fx(num(r, 10)), y: num(r, 20), sx: (flip ? -1 : 1) * num(r, 41, 1), sy: num(r, 42, 1), rot: (flip ? -1 : 1) * num(r, 50) * D2R });
          if (first(r, 66) === '1') {
            const atts = [];
            while (k + 1 < recs.length && recs[k + 1].type === 'ATTRIB') { k++; atts.push(recs[k]); }
            if (k + 1 < recs.length && recs[k + 1].type === 'SEQEND') k++;
            const conv = convertRecords(atts, stats);
            if (conv.length) o.attribs = conv;
          }
          const cols = Math.max(1, num(r, 70, 1) | 0), rows = Math.max(1, num(r, 71, 1) | 0);
          if (cols * rows > 1) {
            const cs = Math.cos(o.rot), sn = Math.sin(o.rot), dc = num(r, 44), dr = num(r, 45);
            for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) {
              const dx = b * dc, dy = a * dr;
              out.push({ ...o, x: o.x + dx * cs - dy * sn, y: o.y + dx * sn + dy * cs, attribs: a || b ? undefined : o.attribs });
            }
          } else out.push(o);
          break;
        }
        case 'DIMENSION': {
          const name = first(r, 2);
          if (name) out.push(com({ type: 'insert', name: name.trim(), x: 0, y: 0, sx: 1, sy: 1, rot: 0, dimension: true }));
          break;
        }
        case 'SOLID': case 'TRACE': {
          const p = [0, 1, 3, 2].map((j) => ({ x: num(r, 10 + j), y: num(r, 20 + j) }));
          if (first(r, 13) == null) p[2] = { ...p[3] };
          out.push(com({ type: 'solid', pts: [p[0], p[1], p[2], p[3]] }));
          break;
        }
        case '3DFACE': {
          const pts = [0, 1, 2, 3].map((j) => ({ x: num(r, 10 + j), y: num(r, 20 + j), b: 0 }));
          out.push(com({ type: 'pline', pts, closed: true }));
          break;
        }
        case 'XLINE': case 'RAY':
          out.push(com({ type: 'xline', ray: r.type === 'RAY', x: num(r, 10), y: num(r, 20), dx: num(r, 11, 1), dy: num(r, 21) }));
          break;
        case 'LEADER': {
          const pts = [];
          for (const [c, v] of r.g) { if (c === 10) pts.push({ x: parseFloat(v), y: 0, b: 0 }); else if (c === 20 && pts.length) pts[pts.length - 1].y = parseFloat(v); }
          if (pts.length > 1) out.push(com({ type: 'pline', pts, closed: false }));
          break;
        }
        case 'HATCH': {
          const h = parseHatch(r);
          if (h) out.push(com(h)); else skip('HATCH');
          break;
        }
        case 'VERTEX': case 'SEQEND': case 'ATTDEF': case 'VIEWPORT': break;
        default: skip(r.type);
      }
    }
    return out;
  }

  function parseHatch(r) {
    const g = r.g;
    let i = 0;
    const pattern = (first(r, 2, 'ANSI31') || 'ANSI31').trim().toUpperCase();
    const solid = num(r, 70) === 1;
    const loops = [], patLines = [];
    // advance to path count (91)
    while (i < g.length && g[i][0] !== 91) i++;
    const nPaths = i < g.length ? parseInt(g[i][1], 10) : 0; i++;
    const val = (code) => { while (i < g.length && g[i][0] !== code) i++; const v = i < g.length ? parseFloat(g[i][1]) : 0; i++; return v; };
    const peek = () => (i < g.length ? g[i][0] : -1);
    for (let p = 0; p < nPaths; p++) {
      const flag = val(92) | 0;
      const pts = [];
      if (flag & 2) {
        const hasBulge = val(72) | 0; val(73);
        const n = val(93) | 0;
        const vs = [];
        for (let k = 0; k < n; k++) { const x = val(10), y = val(20); let b = 0; if (hasBulge && peek() === 42) b = val(42); vs.push({ x, y, b }); }
        for (let k = 0; k < vs.length; k++) {
          const a = vs[k], bnext = vs[(k + 1) % vs.length];
          pts.push({ x: a.x, y: a.y });
          if (a.b) { const arc = G.bulgeArc(a, bnext, a.b); const s = G.sweep(arc.a1, arc.a2), n2 = Math.max(4, Math.ceil(s / (TAU / 64)));
            for (let j = 1; j < n2; j++) { const t = a.b > 0 ? arc.a1 + s * j / n2 : arc.a2 - s * j / n2; pts.push(G.polar(arc.c, t, arc.r)); } }
        }
      } else {
        const ne = val(93) | 0;
        for (let k = 0; k < ne; k++) {
          const t = val(72) | 0;
          if (t === 1) { const x = val(10), y = val(20); val(11); val(21); pts.push({ x, y }); }
          else if (t === 2) {
            const cx = val(10), cy = val(20), rr = val(40); let a1 = val(50) * D2R, a2 = val(51) * D2R; const ccw = (val(73) | 0) !== 0;
            if (!ccw) { a1 = -a1; a2 = -a2; }
            let s = a2 - a1; if (ccw && s < 0) s += TAU; if (!ccw && s > 0) s -= TAU;
            const n2 = Math.max(4, Math.ceil(Math.abs(s) / (TAU / 64)));
            for (let j = 0; j < n2; j++) pts.push(G.polar({ x: cx, y: cy }, a1 + s * j / n2, rr));
          } else if (t === 3) {
            const cx = val(10), cy = val(20), mx = val(11), my = val(21), ratio = val(40); let a1 = val(50) * D2R, a2 = val(51) * D2R; const ccw = (val(73) | 0) !== 0;
            if (!ccw) { a1 = -a1; a2 = -a2; }
            let s = a2 - a1; if (ccw && s < 0) s += TAU; if (!ccw && s > 0) s -= TAU;
            const n2 = Math.max(8, Math.ceil(Math.abs(s) / (TAU / 64)));
            for (let j = 0; j < n2; j++) { const tt = a1 + s * j / n2; pts.push({ x: cx + mx * Math.cos(tt) - my * ratio * Math.sin(tt), y: cy + my * Math.cos(tt) + mx * ratio * Math.sin(tt) }); }
          } else if (t === 4) {
            val(94); val(73); val(74); const nk = val(95) | 0, nc = val(96) | 0;
            for (let j = 0; j < nk; j++) val(40);
            for (let j = 0; j < nc; j++) { const x = val(10), y = val(20); pts.push({ x, y }); if (peek() === 42) val(42); }
            if (peek() === 97) { const nf = val(97) | 0; for (let j = 0; j < nf; j++) { val(11); val(21); } }
          }
        }
      }
      // skip source boundary handles
      if (peek() === 97) { const ns = val(97) | 0; for (let j = 0; j < ns; j++) val(330); }
      if (pts.length > 2) loops.push(pts);
    }
    // pattern definition lines
    while (i < g.length && g[i][0] !== 78) i++;
    if (i < g.length && !solid) {
      const nl = parseInt(g[i][1], 10); i++;
      for (let k = 0; k < nl; k++) {
        const a = val(53) * D2R, bx = val(43), by = val(44), ox = val(45), oy = val(46), nd = val(79) | 0;
        const dashes = []; for (let j = 0; j < nd; j++) dashes.push(val(49));
        patLines.push({ angle: a, base: { x: bx, y: by }, offset: { x: ox, y: oy }, dashes });
      }
    }
    if (!loops.length) return null;
    const o = { type: 'hatch', loops, pattern: solid ? 'SOLID' : pattern };
    if (patLines.length) o.patLines = patLines;
    return o;
  }

  // ---------------- writer (R12) ----------------
  const LTYPES = {
    CONTINUOUS: { desc: 'Solid line', dashes: [] },
    DASHED: { desc: '__ __ __ __', dashes: [12.7, -6.35] },
    HIDDEN: { desc: '_ _ _ _ _ _', dashes: [6.35, -3.175] },
    CENTER: { desc: '____ _ ____ _', dashes: [31.75, -6.35, 6.35, -6.35] },
    PHANTOM: { desc: '_____ _ _ _____', dashes: [31.75, -6.35, 6.35, -6.35, 6.35, -6.35] },
    DOT: { desc: '. . . . . . .', dashes: [0, -6.35] },
    DASHDOT: { desc: '__ . __ . __', dashes: [12.7, -6.35, 0, -6.35] },
  };

  function writeDxf(doc, opts = {}) {
    const o = [];
    const w = (c, v) => { o.push(String(c)); o.push(typeof v === 'number' ? fmt(v) : String(v)); };
    const fmt = (v) => { if (!isFinite(v)) return '0.0'; const s = (+v).toFixed(10).replace(/0+$/, '').replace(/\.$/, '.0'); return s === '-0.0' ? '0.0' : s; };
    const ctx = { blocks: doc.blocks || {}, dimPrec: (doc.settings && doc.settings.dimPrec) ?? 2 };
    const safe = (s) => String(s).replace(/[\r\n]+/g, ' ');
    const aci = (c) => (c == null ? 256 : c === 0 ? 0 : typeof c === 'string' ? G.aciFromRgb(c) : c);

    // header
    w(0, 'SECTION'); w(2, 'HEADER');
    w(9, '$ACADVER'); w(1, 'AC1009');
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const e of doc.entities) { const b = G.bbox(e, ctx); if (isFinite(b[0])) bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])]; }
    if (!isFinite(bb[0])) bb = [0, 0, 100, 100];
    w(9, '$EXTMIN'); w(10, bb[0]); w(20, bb[1]); w(30, 0);
    w(9, '$EXTMAX'); w(10, bb[2]); w(20, bb[3]); w(30, 0);
    w(9, '$CLAYER'); w(8, doc.clayer || '0');
    w(9, '$LTSCALE'); w(40, (doc.settings && doc.settings.ltscale) || 1);
    w(0, 'ENDSEC');

    // tables
    w(0, 'SECTION'); w(2, 'TABLES');
    w(0, 'TABLE'); w(2, 'LTYPE'); w(70, Object.keys(LTYPES).length);
    for (const [name, lt] of Object.entries(LTYPES)) {
      w(0, 'LTYPE'); w(2, name); w(70, 0); w(3, lt.desc); w(72, 65); w(73, lt.dashes.length);
      w(40, lt.dashes.reduce((s, d) => s + Math.abs(d), 0));
      for (const d of lt.dashes) w(49, d);
    }
    w(0, 'ENDTAB');
    w(0, 'TABLE'); w(2, 'LAYER'); w(70, doc.layers.length);
    for (const l of doc.layers) {
      w(0, 'LAYER'); w(2, safe(l.name)); w(70, (l.frozen ? 1 : 0) | (l.locked ? 4 : 0));
      const c = aci(l.color) || 7; w(62, l.on === false ? -c : c); w(6, LTYPES[l.ltype] ? l.ltype : 'CONTINUOUS');
    }
    w(0, 'ENDTAB');
    w(0, 'TABLE'); w(2, 'STYLE'); w(70, 1);
    w(0, 'STYLE'); w(2, 'STANDARD'); w(70, 0); w(40, 0); w(41, 1); w(50, 0); w(71, 0); w(42, 2.5); w(3, 'txt'); w(4, '');
    w(0, 'ENDTAB');
    w(0, 'ENDSEC');

    const emit = (e, inBlock) => {
      const head = (type, ent = e) => {
        w(0, type); w(8, safe(ent.layer || '0'));
        if (ent.color != null) w(62, aci(ent.color));
        if (ent.ltype && LTYPES[ent.ltype]) w(6, ent.ltype);
      };
      const polyline = (pts, closed, ent = e) => {
        head('POLYLINE', ent); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, closed ? 1 : 0);
        for (const p of pts) { w(0, 'VERTEX'); w(8, safe(ent.layer || '0')); w(10, p.x); w(20, p.y); w(30, 0); if (p.b) w(42, p.b); }
        w(0, 'SEQEND'); w(8, safe(ent.layer || '0'));
      };
      switch (e.type) {
        case 'line': head('LINE'); w(10, e.x1); w(20, e.y1); w(30, 0); w(11, e.x2); w(21, e.y2); w(31, 0); break;
        case 'circle': head('CIRCLE'); w(10, e.cx); w(20, e.cy); w(30, 0); w(40, e.r); break;
        case 'arc': head('ARC'); w(10, e.cx); w(20, e.cy); w(30, 0); w(40, e.r); w(50, G.deg(G.normAng(e.a1))); w(51, G.deg(G.normAng(e.a2))); break;
        case 'point': head('POINT'); w(10, e.x); w(20, e.y); w(30, 0); break;
        case 'pline': polyline(e.pts, e.closed); break;
        case 'ellipse': polyline(G.ellipsePoints(e, 96), false); break;
        case 'spline': polyline(G.splinePoints(e), false); break;
        case 'xline': {
          const d = G.norm({ x: e.dx, y: e.dy }), big = 1e5;
          const a = e.ray ? { x: e.x, y: e.y } : G.sub(e, G.mul(d, big)), b = G.add(e, G.mul(d, big));
          head('LINE'); w(10, a.x); w(20, a.y); w(30, 0); w(11, b.x); w(21, b.y); w(31, 0);
          break;
        }
        case 'solid': {
          const p = e.pts, p4 = p[3] || p[2];
          head('SOLID'); w(10, p[0].x); w(20, p[0].y); w(30, 0); w(11, p[1].x); w(21, p[1].y); w(31, 0);
          w(12, p4.x); w(22, p4.y); w(32, 0); w(13, p[2].x); w(23, p[2].y); w(33, 0);
          break;
        }
        case 'text': {
          const lines = String(e.text).split('\n'), gap = e.h * G.TEXT.lineGap;
          const ha = { left: 0, center: 1, right: 2, middle: 1 }[e.ha || 'left'] || 0;
          const box = G.textBox(e);
          lines.forEach((ln, idx) => {
            // place each line on its own baseline (R12 TEXT is single-line)
            const local = { x: 0, y: box.oy - idx * gap };
            const p = G.M.apply(G.M.mul(G.M.translate(e.x, e.y), G.M.rotate(e.rot || 0)), local);
            head('TEXT'); w(10, p.x); w(20, p.y); w(30, 0); w(40, e.h); w(1, safe(ln) || ' ');
            if (e.rot) w(50, G.deg(e.rot));
            if (e.wf && e.wf !== 1) w(41, e.wf);
            if (ha) { w(72, ha); w(11, p.x); w(21, p.y); w(31, 0); }
          });
          break;
        }
        case 'hatch':
          for (const l of e.loops) polyline(l.map((p) => ({ x: p.x, y: p.y, b: 0 })), true);
          break;
        case 'dim':
          for (const g of G.dimGeometry(e, ctx.dimPrec)) emit({ ...g, layer: e.layer, color: e.color }, inBlock);
          break;
        case 'insert':
          if (!ctx.blocks[e.name]) break;
          head('INSERT'); w(2, safe(e.name)); w(10, e.x); w(20, e.y); w(30, 0);
          if ((e.sx ?? 1) !== 1) w(41, e.sx); if ((e.sy ?? 1) !== 1) w(42, e.sy); w(43, 1);
          if (e.rot) w(50, G.deg(e.rot));
          for (const a of e.attribs || []) emit(a, inBlock);
          break;
      }
    };

    // blocks
    w(0, 'SECTION'); w(2, 'BLOCKS');
    for (const [name, b] of Object.entries(ctx.blocks)) {
      w(0, 'BLOCK'); w(8, '0'); w(2, safe(name)); w(70, /^\*/.test(name) ? 1 : 0); w(10, b.base.x); w(20, b.base.y); w(30, 0); w(3, safe(name));
      for (const e of b.entities) emit(e, true);
      w(0, 'ENDBLK'); w(8, '0');
    }
    w(0, 'ENDSEC');

    w(0, 'SECTION'); w(2, 'ENTITIES');
    for (const e of opts.entities || doc.entities) emit(e, false);
    w(0, 'ENDSEC');
    w(0, 'EOF');
    return o.join('\r\n') + '\r\n';
  }

  const api = { readDxf, writeDxf, LTYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DXF = api;
})(typeof window !== 'undefined' ? window : globalThis);
