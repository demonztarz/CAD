/* DraftForge command set. Each command is an async function driving App prompts. */
(function () {
  'use strict';
  const S = window.App;
  const { P, M } = G;
  const R = S.register;
  const isPt = (v) => v && typeof v === 'object' && 'x' in v;
  const line = (a, b) => ({ type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  const pv = (list) => list.map((e) => S.decorate({ ...e }));
  const MAXGHOST = 600;
  const ghostOf = (list, m) => (list.length > MAXGHOST ? list.slice(0, MAXGHOST) : list).map((e) => G.transformEntity(e, m));

  // ---------------------------------------------------------------- DRAW
  R('LINE', async () => {
    const p0 = await S.getPoint('Specify first point');
    let prev = p0;
    const segs = [];
    for (;;) {
      const kws = segs.length >= 2 ? ['Close', 'Undo'] : segs.length ? ['Undo'] : [];
      const r = await S.getPoint('Specify next point', { base: prev, keywords: kws, allowNone: true, preview: (p) => [line(prev, p)] });
      if (r == null) break;
      if (r === 'Undo') { const e = segs.pop(); if (e) { S.remove([e]); prev = P(e.x1, e.y1); } continue; }
      if (r === 'Close') { S.add(line(prev, p0)); break; }
      segs.push(S.add(line(prev, r)));
      prev = r;
    }
  }, { aliases: ['L'], desc: 'Creates straight line segments', group: 'Draw' });

  R('PLINE', async () => {
    const p0 = await S.getPoint('Specify start point');
    const pts = [{ x: p0.x, y: p0.y, b: 0 }];
    let arcMode = false, dir = P(1, 0);
    const tangentEnd = () => {
      if (pts.length < 2) return dir;
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const chord = G.norm(G.sub(b, a));
      if (!a.b) return chord;
      const th = 4 * Math.atan(a.b); // sweep; end tangent = chord rotated by sweep/2
      return P(chord.x * Math.cos(th / 2) - chord.y * Math.sin(th / 2), chord.x * Math.sin(th / 2) + chord.y * Math.cos(th / 2));
    };
    const bulgeTo = (from, to) => {
      const t = tangentEnd(), c = G.sub(to, from);
      const th = Math.atan2(G.cross(t, c), G.dot(t, c));
      return Math.tan(th / 2);
    };
    const build = (extra, closed) => {
      const list = pts.map((p) => ({ ...p }));
      if (extra) {
        if (arcMode) list[list.length - 1].b = bulgeTo(list[list.length - 1], extra);
        list.push({ x: extra.x, y: extra.y, b: 0 });
      }
      return { type: 'pline', pts: list, closed: !!closed };
    };
    for (;;) {
      const last = pts[pts.length - 1];
      const kws = arcMode ? ['Line', 'Close', 'Undo'] : ['Arc', 'Close', 'Undo'];
      const r = await S.getPoint(arcMode ? 'Specify endpoint of arc' : 'Specify next point', {
        base: P(last.x, last.y), keywords: pts.length > 1 ? kws : kws.filter((k) => k !== 'Close' && k !== 'Undo'), allowNone: true,
        preview: (p) => [build(p)],
      });
      if (r == null) break;
      if (r === 'Arc') { arcMode = true; continue; }
      if (r === 'Line') { arcMode = false; continue; }
      if (r === 'Undo') { if (pts.length > 1) { pts.pop(); pts[pts.length - 1].b = 0; } continue; }
      if (r === 'Close') {
        if (arcMode) pts[pts.length - 1].b = bulgeTo(pts[pts.length - 1], pts[0]);
        S.add(build(null, true)); return;
      }
      if (arcMode) pts[pts.length - 1].b = bulgeTo(pts[pts.length - 1], r);
      if (pts.length >= 1) dir = G.norm(G.sub(r, P(last.x, last.y)));
      pts.push({ x: r.x, y: r.y, b: 0 });
    }
    if (pts.length > 1) S.add(build(null, false));
  }, { aliases: ['PL'], desc: 'Creates a 2D polyline of line and arc segments', group: 'Draw' });

  const rectPts = (a, b) => [P(a.x, a.y), P(b.x, a.y), P(b.x, b.y), P(a.x, b.y)].map((p) => ({ ...p, b: 0 }));
  R('RECTANG', async () => {
    const a = await S.getPoint('Specify first corner point');
    S.lastPoint = a;
    const b = await S.getPoint('Specify other corner point', { base: a, noRubber: true, preview: (p) => [{ type: 'pline', closed: true, pts: rectPts(a, p) }] });
    S.add({ type: 'pline', closed: true, pts: rectPts(a, b) });
  }, { aliases: ['REC', 'RECTANGLE'], desc: 'Creates a rectangular polyline', group: 'Draw' });

  R('POLYGON', async () => {
    let n = await S.getNumber('Enter number of sides', { def: S.polySides || 4 });
    n = Math.max(3, Math.min(1024, Math.round(n))); S.polySides = n;
    const c = await S.getPoint('Specify center of polygon or', { keywords: ['Edge'] });
    if (c === 'Edge') {
      const a = await S.getPoint('Specify first endpoint of edge');
      const mk = (b) => {
        const side = G.dist(a, b), R0 = side / (2 * Math.sin(Math.PI / n)), mid = G.mid(a, b);
        const ctr = G.add(mid, G.mul(G.perp(G.norm(G.sub(b, a))), R0 * Math.cos(Math.PI / n)));
        const a0 = G.ang(ctr, a);
        return { type: 'pline', closed: true, pts: Array.from({ length: n }, (_, i) => ({ ...G.polar(ctr, a0 + i * G.TAU / n, R0), b: 0 })) };
      };
      const b = await S.getPoint('Specify second endpoint of edge', { base: a, preview: (p) => [mk(p)] });
      S.add(mk(b)); return;
    }
    const mode = await S.getKeyword('Enter an option', ['Inscribed in circle', 'Circumscribed about circle'], S.polyMode || 'Inscribed in circle');
    S.polyMode = mode;
    const mk = (p) => {
      const r = G.dist(c, p), a0 = G.ang(c, p);
      const R0 = mode.startsWith('C') ? r / Math.cos(Math.PI / n) : r, start = mode.startsWith('C') ? a0 + Math.PI / n : a0;
      return { type: 'pline', closed: true, pts: Array.from({ length: n }, (_, i) => ({ ...G.polar(c, start + i * G.TAU / n, R0), b: 0 })) };
    };
    const r = await S.getPoint('Specify radius of circle', { base: c, preview: (p) => [mk(p)] });
    S.add(mk(r));
  }, { aliases: ['POL'], desc: 'Creates an equilateral closed polyline', group: 'Draw' });

  R('CIRCLE', async () => {
    const c = await S.getPoint('Specify center point for circle or', { keywords: ['3P', '2P'] });
    if (c === '3P') {
      const a = await S.getPoint('Specify first point on circle');
      const b = await S.getPoint('Specify second point on circle', { base: a });
      const mk = (p) => { const arc = S.arc3(a, b, p); return arc ? { type: 'circle', cx: arc.cx, cy: arc.cy, r: arc.r } : null; };
      const p = await S.getPoint('Specify third point on circle', { preview: (q) => [mk(q)].filter(Boolean) });
      const e = mk(p); if (e) S.add(e); else S.msg('Points are collinear.', 'err');
      return;
    }
    if (c === '2P') {
      const a = await S.getPoint('Specify first end point of circle\'s diameter');
      const mk = (b) => { const m = G.mid(a, b); return { type: 'circle', cx: m.x, cy: m.y, r: G.dist(a, b) / 2 }; };
      const b = await S.getPoint('Specify second end point of circle\'s diameter', { base: a, preview: (p) => [mk(p)] });
      S.add(mk(b)); return;
    }
    let r = await S.getDistance('Specify radius of circle or', { base: c, keywords: ['Diameter'], def: S.lastRadius != null ? S.fmt(S.lastRadius) : undefined, preview: (p) => [{ type: 'circle', cx: c.x, cy: c.y, r: G.dist(c, p) }] });
    if (r === 'Diameter') {
      const d = await S.getDistance('Specify diameter of circle', { base: c, def: S.lastRadius != null ? S.fmt(S.lastRadius * 2) : undefined, preview: (p) => [{ type: 'circle', cx: c.x, cy: c.y, r: G.dist(c, p) / 2 }] });
      r = d / 2;
    }
    if (!(r > 0)) { S.msg('Value must be positive and nonzero.', 'err'); return; }
    S.lastRadius = r;
    S.add({ type: 'circle', cx: c.x, cy: c.y, r });
  }, { aliases: ['C'], desc: 'Creates a circle', group: 'Draw' });

  const arcCSE = (c, s, e) => ({ type: 'arc', cx: c.x, cy: c.y, r: G.dist(c, s), a1: G.normAng(G.ang(c, s)), a2: G.normAng(G.ang(c, e)) });
  R('ARC', async () => {
    const s = await S.getPoint('Specify start point of arc or', { keywords: ['Center'] });
    if (s === 'Center') {
      const c = await S.getPoint('Specify center point of arc');
      const st = await S.getPoint('Specify start point of arc', { base: c });
      const en = await S.getPoint('Specify end point of arc', { base: c, preview: (p) => [arcCSE(c, st, p)] });
      S.add(arcCSE(c, st, en)); return;
    }
    const m = await S.getPoint('Specify second point of arc or', { base: s, keywords: ['Center', 'End'] });
    if (m === 'Center') {
      const c = await S.getPoint('Specify center point of arc', { base: s });
      const en = await S.getPoint('Specify end point of arc', { base: c, preview: (p) => [arcCSE(c, s, p)] });
      S.add(arcCSE(c, s, en)); return;
    }
    if (m === 'End') {
      const en = await S.getPoint('Specify end point of arc', { base: s });
      const rad = await S.getDistance('Specify radius of arc', { base: en, preview: (p) => {
        const r = G.dist(en, p), d = G.dist(s, en); if (r < d / 2) return [];
        const mid = G.mid(s, en), h = Math.sqrt(r * r - d * d / 4), c = G.add(mid, G.mul(G.perp(G.norm(G.sub(en, s))), h));
        return [arcCSE(c, s, en)];
      } });
      const d = G.dist(s, en);
      if (rad < d / 2) { S.msg('Radius too small.', 'err'); return; }
      const h = Math.sqrt(rad * rad - d * d / 4), c = G.add(G.mid(s, en), G.mul(G.perp(G.norm(G.sub(en, s))), h));
      S.add(arcCSE(c, s, en)); return;
    }
    const e = await S.getPoint('Specify end point of arc', { base: m, preview: (p) => [S.arc3(s, m, p)].filter(Boolean) });
    const a = S.arc3(s, m, e);
    if (a) S.add(a); else S.msg('Points are collinear.', 'err');
  }, { aliases: ['A'], desc: 'Creates an arc', group: 'Draw' });

  R('ELLIPSE', async () => {
    let c, a1p;
    const first = await S.getPoint('Specify axis endpoint of ellipse or', { keywords: S.st.iso ? ['Center', 'Isocircle'] : ['Center'] });
    if (first === 'Isocircle') {
      const ic = await S.getPoint('Specify center of isocircle');
      let r = await S.getDistance('Specify radius of isocircle or', { base: ic, keywords: ['Diameter'], preview: (p) => [S.isocircle(ic, G.dist(ic, p))] });
      if (r === 'Diameter') r = (await S.getDistance('Specify diameter of isocircle', { base: ic, preview: (p) => [S.isocircle(ic, G.dist(ic, p) / 2)] })) / 2;
      if (!(r > 0)) { S.msg('Value must be positive and nonzero.', 'err'); return; }
      S.add(S.isocircle(ic, r));
      return;
    }
    if (first === 'Center') {
      c = await S.getPoint('Specify center of ellipse');
      a1p = await S.getPoint('Specify endpoint of axis', { base: c });
    } else {
      const second = await S.getPoint('Specify other endpoint of axis', { base: first });
      c = G.mid(first, second); a1p = second;
    }
    const mk = (p) => {
      const mx = a1p.x - c.x, my = a1p.y - c.y, R0 = Math.hypot(mx, my);
      const u = G.norm(P(mx, my)), d = Math.abs(G.cross(u, G.sub(p, c)));
      const ratio = d / R0;
      if (ratio > 1) return { type: 'ellipse', cx: c.x, cy: c.y, mx: -u.y * d, my: u.x * d, ratio: R0 / d };
      return { type: 'ellipse', cx: c.x, cy: c.y, mx, my, ratio: Math.max(1e-6, ratio) };
    };
    const r = await S.getDistance('Specify distance to other axis', { base: c, preview: (p) => [mk(p)] });
    const u = G.norm(G.sub(a1p, c));
    S.add(mk(G.add(c, G.mul(G.perp(u), r))));
  }, { aliases: ['EL'], desc: 'Creates an ellipse', group: 'Draw' });

  // Isometric circle in the current isoplane: an ellipse through r along both plane axes.
  S.isocircle = (c, r) => {
    const [a1, a2] = S.ISO_AXES[S.st.isoplane || 'left'].map(G.rad);
    const A = P(Math.cos(a1) * r, Math.sin(a1) * r), B = P(Math.cos(a2) * r, Math.sin(a2) * r);
    // principal axes of P(t) = A cos t + B sin t (conjugate semi-diameters)
    const t0 = 0.5 * Math.atan2(2 * G.dot(A, B), G.dot(A, A) - G.dot(B, B));
    const at = (t) => G.add(G.mul(A, Math.cos(t)), G.mul(B, Math.sin(t)));
    let maj = at(t0), min = at(t0 + Math.PI / 2);
    if (G.len(min) > G.len(maj)) [maj, min] = [min, maj];
    return { type: 'ellipse', cx: c.x, cy: c.y, mx: maj.x, my: maj.y, ratio: G.len(min) / G.len(maj) };
  };

  R('SPLINE', async () => {
    const fit = [await S.getPoint('Specify first point')];
    for (;;) {
      const r = await S.getPoint('Enter next point or', { base: fit[fit.length - 1], keywords: fit.length > 2 ? ['Close', 'Undo'] : ['Undo'], allowNone: true,
        preview: (p) => [{ type: 'spline', fit: [...fit, p] }] });
      if (r == null) break;
      if (r === 'Undo') { if (fit.length > 1) fit.pop(); continue; }
      if (r === 'Close') { S.add({ type: 'spline', fit, closed: true }); return; }
      fit.push(r);
    }
    if (fit.length > 1) S.add({ type: 'spline', fit });
  }, { aliases: ['SPL'], desc: 'Creates a smooth curve through fit points', group: 'Draw' });

  R('POINT', async () => {
    for (;;) {
      const p = await S.getPoint('Specify a point', { allowNone: true });
      if (p == null) return;
      S.add({ type: 'point', x: p.x, y: p.y });
    }
  }, { aliases: ['PO'], desc: 'Creates point objects', group: 'Draw' });

  R('XLINE', async () => {
    const r = await S.getPoint('Specify a point or', { keywords: ['Hor', 'Ver'] });
    if (r === 'Hor' || r === 'Ver') {
      for (;;) {
        const p = await S.getPoint('Specify through point', { allowNone: true });
        if (p == null) return;
        S.add({ type: 'xline', x: p.x, y: p.y, dx: r === 'Hor' ? 1 : 0, dy: r === 'Hor' ? 0 : 1 });
      }
    }
    for (;;) {
      const p = await S.getPoint('Specify through point', { base: r, allowNone: true, preview: (q) => [{ type: 'xline', x: r.x, y: r.y, dx: q.x - r.x, dy: q.y - r.y }] });
      if (p == null) return;
      if (G.dist(p, r) > 1e-12) S.add({ type: 'xline', x: r.x, y: r.y, dx: p.x - r.x, dy: p.y - r.y });
    }
  }, { aliases: ['XL'], desc: 'Creates a construction line of infinite length', group: 'Draw' });

  R('RAY', async () => {
    const b = await S.getPoint('Specify start point');
    for (;;) {
      const p = await S.getPoint('Specify through point', { base: b, allowNone: true, preview: (q) => [{ type: 'xline', ray: true, x: b.x, y: b.y, dx: q.x - b.x, dy: q.y - b.y }] });
      if (p == null) return;
      S.add({ type: 'xline', ray: true, x: b.x, y: b.y, dx: p.x - b.x, dy: p.y - b.y });
    }
  }, { desc: 'Creates a semi-infinite construction line', group: 'Draw' });

  // ---------------------------------------------------------------- TEXT
  const JUST = { L: ['left', 'baseline'], C: ['center', 'baseline'], R: ['right', 'baseline'], M: ['center', 'middle'], TL: ['left', 'top'], TC: ['center', 'top'], TR: ['right', 'top'], ML: ['left', 'middle'], MC: ['center', 'middle'], MR: ['right', 'middle'], BL: ['left', 'bottom'], BC: ['center', 'bottom'], BR: ['right', 'bottom'] };
  R('TEXT', async () => {
    let just = 'L';
    let p = await S.getPoint('Specify start point of text or', { keywords: ['Justify'] });
    if (p === 'Justify') {
      just = (await S.getKeyword('Enter an option', ['Left', 'Center', 'Right', 'Middle', 'TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'], 'Left'));
      just = { Left: 'L', Center: 'C', Right: 'R', Middle: 'M' }[just] || just;
      p = await S.getPoint('Specify insertion point of text');
    }
    const h = await S.getDistance('Specify height', { base: p, def: S.fmt(S.doc.settings.textHeight) });
    S.doc.settings.textHeight = h;
    const rot = await S.getAngle('Specify rotation angle of text', { base: p, def: 0 });
    let at = p;
    for (;;) {
      const txt = await S.getString('Enter text', { allowSpaces: true, live: true });
      if (!txt) break;
      const [ha, va] = JUST[just] || JUST.L;
      S.add({ type: 'text', x: at.x, y: at.y, h, rot: G.rad(rot), text: txt, ha, va });
      at = G.polar(at, G.rad(rot) - Math.PI / 2, h * G.TEXT.lineGap);
    }
  }, { aliases: ['DT', 'DTEXT'], desc: 'Creates single-line text', group: 'Annotate' });

  R('MTEXT', async () => {
    const a = await S.getPoint('Specify first corner');
    const b = await S.getPoint('Specify opposite corner', { base: a, noRubber: true, preview: (p) => [{ type: 'pline', closed: true, pts: rectPts(a, p) }] });
    const txt = await S.textDialog('Multiline Text', '');
    if (!txt) return;
    S.add({ type: 'text', x: Math.min(a.x, b.x), y: Math.max(a.y, b.y), h: S.doc.settings.textHeight, rot: 0, text: txt, ha: 'left', va: 'top' });
  }, { aliases: ['MT', 'T'], desc: 'Creates multiline text', group: 'Annotate' });

  // ---------------------------------------------------------------- DIMENSIONS
  const dimBase = () => ({ type: 'dim', h: S.doc.settings.dimHeight || 2.5 });
  async function twoPoints() {
    const a = await S.getPoint('Specify first extension line origin or', { keywords: [], allowNone: true });
    if (a == null) {
      const { e } = await S.getEntity('Select object to dimension', { filter: (x) => x.type === 'line' || (x.type === 'pline' && x.pts.length === 2) });
      if (e.type === 'line') return [P(e.x1, e.y1), P(e.x2, e.y2)];
      return [P(e.pts[0].x, e.pts[0].y), P(e.pts[1].x, e.pts[1].y)];
    }
    const b = await S.getPoint('Specify second extension line origin', { base: a });
    return [a, b];
  }
  const linearKind = (a, b, loc) => {
    const minx = Math.min(a.x, b.x), maxx = Math.max(a.x, b.x), miny = Math.min(a.y, b.y), maxy = Math.max(a.y, b.y);
    const ox = loc.x < minx ? minx - loc.x : loc.x > maxx ? loc.x - maxx : 0;
    const oy = loc.y < miny ? miny - loc.y : loc.y > maxy ? loc.y - maxy : 0;
    return oy >= ox ? 'horizontal' : 'vertical';
  };
  R('DIMLINEAR', async () => {
    const [a, b] = await twoPoints();
    const mk = (p) => ({ ...dimBase(), kind: linearKind(a, b, p), x1: a.x, y1: a.y, x2: b.x, y2: b.y, lx: p.x, ly: p.y });
    const loc = await S.getPoint('Specify dimension line location', { preview: (p) => [mk(p)] });
    S.add(mk(loc));
  }, { aliases: ['DLI', 'DIMLIN'], desc: 'Creates a horizontal or vertical dimension', group: 'Annotate' });
  R('DIMALIGNED', async () => {
    const [a, b] = await twoPoints();
    const mk = (p) => ({ ...dimBase(), kind: 'aligned', x1: a.x, y1: a.y, x2: b.x, y2: b.y, lx: p.x, ly: p.y });
    const loc = await S.getPoint('Specify dimension line location', { preview: (p) => [mk(p)] });
    S.add(mk(loc));
  }, { aliases: ['DAL', 'DIMALI'], desc: 'Creates an aligned dimension', group: 'Annotate' });
  async function radial(kind) {
    const { e } = await S.getEntity('Select arc or circle', { filter: (x) => x.type === 'arc' || x.type === 'circle' });
    const mk = (p) => ({ ...dimBase(), kind, cx: e.cx, cy: e.cy, r: e.r, lx: p.x, ly: p.y });
    const loc = await S.getPoint('Specify dimension line location', { preview: (p) => [mk(p)] });
    S.add(mk(loc));
  }
  R('DIMRADIUS', () => radial('radius'), { aliases: ['DRA', 'DIMRAD'], desc: 'Creates a radius dimension', group: 'Annotate' });
  R('DIMDIAMETER', () => radial('diameter'), { aliases: ['DDI', 'DIMDIA'], desc: 'Creates a diameter dimension', group: 'Annotate' });
  R('DIMANGULAR', async () => {
    const { e: l1 } = await S.getEntity('Select arc, circle or line', { filter: (x) => x.type === 'line' || x.type === 'arc' });
    let mk;
    if (l1.type === 'arc') {
      mk = (p) => ({ ...dimBase(), kind: 'angular', cx: l1.cx, cy: l1.cy, a1: l1.a1, a2: l1.a2, lx: p.x, ly: p.y });
    } else {
      const { e: l2 } = await S.getEntity('Select second line', { filter: (x) => x.type === 'line' && x !== l1 });
      const x = G.segSeg(P(l1.x1, l1.y1), P(l1.x2, l1.y2), P(l2.x1, l2.y1), P(l2.x2, l2.y2), true);
      if (!x.length) { S.msg('Lines are parallel.', 'err'); return; }
      const c = x[0].p;
      const d1 = G.ang(P(l1.x1, l1.y1), P(l1.x2, l1.y2)), d2 = G.ang(P(l2.x1, l2.y1), P(l2.x2, l2.y2));
      const dirs = [d1, d1 + Math.PI, d2, d2 + Math.PI].map(G.normAng);
      mk = (p) => {
        const a = G.normAng(G.ang(c, p));
        // pick the sector bounded by one direction of each line that contains the cursor
        let best = null;
        for (const u of [dirs[0], dirs[1]]) for (const v of [dirs[2], dirs[3]]) {
          for (const [s, t] of [[u, v], [v, u]]) {
            const sw = G.sweep(s, t);
            if (sw < Math.PI + 1e-9 && G.angInArc(a, s, t) && (!best || sw < best.sw)) best = { s, t, sw };
          }
        }
        if (!best) best = { s: dirs[0], t: dirs[2] };
        return { ...dimBase(), kind: 'angular', cx: c.x, cy: c.y, a1: best.s, a2: best.t, lx: p.x, ly: p.y };
      };
    }
    const loc = await S.getPoint('Specify dimension arc line location', { preview: (p) => [mk(p)] });
    S.add(mk(loc));
  }, { aliases: ['DAN', 'DIMANG'], desc: 'Creates an angular dimension', group: 'Annotate' });

  // ---------------------------------------------------------------- HATCH
  function closedLoop(e) {
    switch (e.type) {
      case 'circle': return G.arcPoints({ c: P(e.cx, e.cy), r: e.r, a1: 0, a2: G.TAU, full: true }, 96).slice(0, -1);
      case 'ellipse': return G.isFullEllipse(e) ? G.ellipsePoints(e, 96).slice(0, -1) : null;
      case 'pline': {
        if (!e.closed && !(e.pts.length > 2 && G.same(e.pts[0], e.pts[e.pts.length - 1], 1e-6))) return null;
        const out = [];
        for (const pr of G.prims(e)) {
          if (pr.k === 'L') out.push(pr.a);
          else { const pts = G.arcPoints(pr, 24); if (pr.rev) pts.reverse(); out.push(...pts.slice(0, -1)); }
        }
        return out;
      }
      case 'spline': return e.closed ? G.splinePoints(e) : null;
      case 'solid': return e.pts.slice();
    }
    return null;
  }
  S.closedLoop = closedLoop;
  R('HATCH', async () => {
    const hs = S.hatchSettings || (S.hatchSettings = { pattern: 'ANSI31', scale: 1, angle: 0 });
    const loops = [];
    for (;;) {
      const r = await S.getPoint(`Pick internal point or  (${hs.pattern}, scale ${hs.scale}, angle ${hs.angle}°)`, { keywords: ['Select objects', 'Pattern', 'sCale', 'Angle'], allowNone: true });
      if (r == null) break;
      if (r === 'Pattern') {
        hs.pattern = await S.getKeyword('Enter a pattern name', ['SOLID', 'ANSI31', 'ANSI32', 'ANSI37', 'NET', 'LINE', 'DASH', 'BRICK', 'DOTS'], hs.pattern);
        continue;
      }
      if (r === 'sCale') { hs.scale = await S.getNumber('Specify hatch pattern scale', { def: hs.scale }); continue; }
      if (r === 'Angle') { hs.angle = await S.getNumber('Specify hatch pattern angle', { def: hs.angle }); continue; }
      if (r === 'Select objects') {
        const list = await S.getSelection('Select objects');
        for (const e of list) { const l = closedLoop(e); if (l && l.length > 2) loops.push([l]); }
        if (!list.length) S.msg('No closed boundaries selected.', 'err');
        break;
      }
      // pick internal point: smallest closed object containing the point, plus closed islands inside it
      const closed = S.E.filter((e) => S.isSelectable(e) && e.type !== 'hatch').map((e) => ({ e, l: closedLoop(e) })).filter((x) => x.l && x.l.length > 2);
      const containing = closed.filter((x) => G.pointInPoly(r, x.l)).map((x) => ({ ...x, area: Math.abs(G.polyArea(x.l)) })).sort((a, b) => a.area - b.area);
      if (!containing.length) { S.msg('Valid hatch boundary not found. Use closed objects (circle, closed polyline, ellipse) or "Select objects".', 'err'); continue; }
      const outer = containing[0];
      const islands = closed.filter((x) => x !== outer && x.e !== outer.e && x.l.every((p) => G.pointInPoly(p, outer.l)) && !G.pointInPoly(r, x.l));
      loops.push([outer.l, ...islands.map((x) => x.l)]);
      S.preview = loops.map((ls) => ({ type: 'hatch', loops: ls, pattern: hs.pattern, scale: hs.scale, angle: G.rad(hs.angle) }));
    }
    if (!loops.length) return;
    S.mark();
    for (const ls of loops) S.add({ type: 'hatch', loops: ls, pattern: hs.pattern, scale: hs.scale, angle: G.rad(hs.angle) });
  }, { aliases: ['H', 'BHATCH'], desc: 'Fills an enclosed area with a hatch pattern or solid fill', group: 'Draw' });

  // ---------------------------------------------------------------- MODIFY
  R('ERASE', async () => {
    const list = await S.getSelection();
    if (list.length) S.remove(list);
  }, { aliases: ['E', 'DELETE'], desc: 'Removes objects from the drawing', group: 'Modify' });

  async function moveCopy(copy) {
    const list = await S.getSelection();
    if (!list.length) return;
    let base = await S.getPoint('Specify base point or', { keywords: ['Displacement'], def: copy ? undefined : 'Displacement' });
    if (base === 'Displacement') {
      const d = await S.getPoint('Specify displacement', { def: '0,0' });
      const m = M.translate(d.x, d.y);
      if (copy) S.addRaw(list.map((e) => G.transformEntity(e, m)));
      else S.replace(new Map(list.map((e) => [e, [G.transformEntity(e, m)]])));
      return;
    }
    for (;;) {
      const to = await S.getPoint('Specify second point or', { base, allowNone: copy, keywords: copy ? [] : [], ghost: (p) => ghostOf(list, M.translate(p.x - base.x, p.y - base.y)) });
      if (to == null) return;
      const m = M.translate(to.x - base.x, to.y - base.y);
      if (!copy) { S.replace(new Map(list.map((e) => [e, [G.transformEntity(e, m)]]))); return; }
      S.addRaw(list.map((e) => G.transformEntity(e, m)));
    }
  }
  R('MOVE', () => moveCopy(false), { aliases: ['M'], desc: 'Moves objects a specified distance in a specified direction', group: 'Modify' });
  R('COPY', () => moveCopy(true), { aliases: ['CO', 'CP'], desc: 'Copies objects a specified distance in a specified direction', group: 'Modify' });

  R('ROTATE', async () => {
    const list = await S.getSelection();
    if (!list.length) return;
    const base = await S.getPoint('Specify base point');
    let copy = false;
    for (;;) {
      const r = await S.getAngle('Specify rotation angle or', { base, keywords: ['Copy', 'Reference'], def: S.lastRot ?? 0,
        ghost: (p) => ghostOf(list, M.rotate(G.ang(base, p), base)) });
      if (r === 'Copy') { copy = true; S.msg('Rotating a copy of the selected objects.'); continue; }
      let ang = r;
      if (r === 'Reference') {
        const ref = await S.getAngle('Specify the reference angle', { def: 0 });
        const nw = await S.getAngle('Specify the new angle', { base, ghost: (p) => ghostOf(list, M.rotate(G.ang(base, p) - G.rad(ref), base)) });
        ang = nw - ref;
      }
      S.lastRot = ang;
      const m = M.rotate(G.rad(ang), base);
      if (copy) S.addRaw(list.map((e) => G.transformEntity(e, m)));
      else S.replace(new Map(list.map((e) => [e, [G.transformEntity(e, m)]])));
      return;
    }
  }, { aliases: ['RO'], desc: 'Rotates objects around a base point', group: 'Modify' });

  R('SCALE', async () => {
    const list = await S.getSelection();
    if (!list.length) return;
    const base = await S.getPoint('Specify base point');
    let copy = false;
    for (;;) {
      // a picked point gives its distance from the base point as the factor
      const r = await S.getDistance('Specify scale factor or', { base, keywords: ['Copy', 'Reference'], def: 1,
        ghost: (p) => { const f = Math.max(1e-6, G.dist(base, p)); return ghostOf(list, M.scale(f, f, base)); } });
      if (r === 'Copy') { copy = true; continue; }
      let f = r;
      if (r === 'Reference') {
        const a = await S.getDistance('Specify reference length', { def: 1 });
        const b = await S.getDistance('Specify new length', { base, ghost: (p) => ghostOf(list, M.scale(G.dist(base, p) / a, G.dist(base, p) / a, base)) });
        f = b / a;
      }
      if (!(f > 0)) { S.msg('Value must be positive and nonzero.', 'err'); return; }
      const m = M.scale(f, f, base);
      if (copy) S.addRaw(list.map((e) => G.transformEntity(e, m)));
      else S.replace(new Map(list.map((e) => [e, [G.transformEntity(e, m)]])));
      return;
    }
  }, { aliases: ['SC'], desc: 'Enlarges or reduces objects, keeping proportions', group: 'Modify' });

  R('MIRROR', async () => {
    const list = await S.getSelection();
    if (!list.length) return;
    const a = await S.getPoint('Specify first point of mirror line');
    const b = await S.getPoint('Specify second point of mirror line', { base: a, ghost: (p) => (G.dist(a, p) > 1e-9 ? ghostOf(list, M.mirror(a, p)) : []) });
    const del = await S.getKeyword('Erase source objects?', ['Yes', 'No'], 'No');
    const m = M.mirror(a, b);
    if (del === 'Yes') S.replace(new Map(list.map((e) => [e, [G.transformEntity(e, m)]])));
    else S.addRaw(list.map((e) => G.transformEntity(e, m)));
  }, { aliases: ['MI'], desc: 'Creates a mirrored copy of selected objects', group: 'Modify' });

  R('OFFSET', async () => {
    let d = await S.getDistance('Specify offset distance or', { keywords: ['Through'], def: S.offsetDist != null ? S.fmt(S.offsetDist) : 'Through' });
    const through = d === 'Through';
    if (!through) { if (!(d > 0)) { S.msg('Value must be positive and nonzero.', 'err'); return; } S.offsetDist = d; }
    const can = (e) => ['line', 'circle', 'arc', 'pline', 'ellipse'].includes(e.type);
    for (;;) {
      const r = await S.getEntity('Select object to offset or <exit>', { filter: can, allowNone: true, keywords: ['Exit'] }).catch((err) => { throw err; });
      if (r == null || r === 'Exit') return;
      const e = r.e;
      const side = await S.getPoint(through ? 'Specify through point' : 'Specify point on side to offset', {
        preview: (p) => {
          const dd = through ? Math.min(...S.prims(e).map((pr) => G.distToPrim(p, pr))) : d;
          const o = G.offsetEntity(e, dd, p); return o ? [o] : [];
        },
      });
      const dd = through ? Math.min(...S.prims(e).map((pr) => G.distToPrim(side, pr))) : d;
      const o = G.offsetEntity(e, dd, side);
      if (o) S.addRaw([o]); else S.msg('Cannot offset that object by that distance.', 'err');
    }
  }, { aliases: ['O'], desc: 'Creates concentric circles, parallel lines and parallel curves', group: 'Modify', pickfirst: false });

  function cuttersFor(exclude) {
    const vr = S.viewRect(), out = [];
    for (const e of S.E) {
      if (e === exclude || !S.isSelectable(e) || e.type === 'text' || e.type === 'hatch') continue;
      const b = S.bbox(e);
      if (e.type !== 'xline' && (b[2] < vr[0] || b[0] > vr[2] || b[3] < vr[1] || b[1] > vr[3])) continue;
      out.push(...S.prims(e).filter((p) => !p.pt));
    }
    return out;
  }
  R('TRIM', async () => {
    S.msg('Current settings: Mode = Quick, all visible objects act as cutting edges');
    for (;;) {
      const r = await S.getEntity('Select object to trim or', { filter: (e) => ['line', 'arc', 'circle', 'pline'].includes(e.type), allowNone: true, keywords: ['Undo'] });
      if (r == null) return;
      if (r === 'Undo') { S.undo(); continue; }
      const res = G.trimEntity(r.e, r.p, cuttersFor(r.e));
      if (!res) { S.msg('Object does not intersect a cutting edge.', 'err'); continue; }
      S.replace(new Map([[r.e, res.remove ? [] : res.replace]]));
      S.endOp();
    }
  }, { aliases: ['TR'], desc: 'Trims objects to meet the edges of other objects', group: 'Modify', pickfirst: false });

  R('EXTEND', async () => {
    S.msg('Current settings: Mode = Quick, all visible objects act as boundary edges');
    for (;;) {
      const r = await S.getEntity('Select object to extend or', { filter: (e) => ['line', 'arc', 'pline'].includes(e.type), allowNone: true, keywords: ['Undo'] });
      if (r == null) return;
      if (r === 'Undo') { S.undo(); continue; }
      const res = G.extendEntity(r.e, r.p, cuttersFor(r.e));
      if (!res) { S.msg('Object does not intersect an edge.', 'err'); continue; }
      S.replace(new Map([[r.e, [res]]]));
      S.endOp();
    }
  }, { aliases: ['EX'], desc: 'Extends objects to meet the edges of other objects', group: 'Modify', pickfirst: false });

  R('FILLET', async () => {
    S.filletR = S.filletR ?? 0;
    for (;;) {
      S.msg(`Current settings: Radius = ${S.fmt(S.filletR)}`);
      const r1 = await S.getEntity('Select first object or', { filter: (e) => e.type === 'line', keywords: ['Radius'] });
      if (r1 === 'Radius') { S.filletR = await S.getDistance('Specify fillet radius', { def: S.fmt(S.filletR) }); continue; }
      const r2 = await S.getEntity('Select second object', { filter: (e) => e.type === 'line' && e !== r1.e });
      const f = G.filletLines(r1.e, r1.p, r2.e, r2.p, S.filletR);
      if (!f) { S.msg('Lines are parallel or the radius is too large.', 'err'); return; }
      S.replace(new Map([[r1.e, [f.l1]], [r2.e, [f.l2]]]));
      if (f.arc) S.add({ ...f.arc, layer: r1.e.layer, color: r1.e.color });
      return;
    }
  }, { aliases: ['F'], desc: 'Rounds and fillets the edges of objects', group: 'Modify', pickfirst: false });

  R('CHAMFER', async () => {
    S.chamD = S.chamD || [0, 0];
    for (;;) {
      S.msg(`(TRIM mode) Current chamfer Dist1 = ${S.fmt(S.chamD[0])}, Dist2 = ${S.fmt(S.chamD[1])}`);
      const r1 = await S.getEntity('Select first line or', { filter: (e) => e.type === 'line', keywords: ['Distance'] });
      if (r1 === 'Distance') {
        const a = await S.getDistance('Specify first chamfer distance', { def: S.fmt(S.chamD[0]) });
        const b = await S.getDistance('Specify second chamfer distance', { def: S.fmt(a) });
        S.chamD = [a, b]; continue;
      }
      const r2 = await S.getEntity('Select second line', { filter: (e) => e.type === 'line' && e !== r1.e });
      const f = G.chamferLines(r1.e, r1.p, r2.e, r2.p, S.chamD[0], S.chamD[1]);
      if (!f) { S.msg('Lines are parallel.', 'err'); return; }
      S.replace(new Map([[r1.e, [f.l1]], [r2.e, [f.l2]]]));
      if (G.dist(P(f.line.x1, f.line.y1), P(f.line.x2, f.line.y2)) > 1e-9) S.add({ ...f.line, layer: r1.e.layer, color: r1.e.color });
      return;
    }
  }, { aliases: ['CHA'], desc: 'Bevels the edges of objects', group: 'Modify', pickfirst: false });

  function explodeOne(e) {
    const keep = (x) => ({ ...x, layer: x.layer ?? e.layer, ...(x.color === undefined && e.color !== undefined ? { color: e.color } : {}) });
    if (e.type === 'pline') {
      return G.prims(e).map((pr) => (pr.k === 'L' ? { ...line(pr.a, pr.b) } : { type: 'arc', cx: pr.c.x, cy: pr.c.y, r: pr.r, a1: G.normAng(pr.a1), a2: G.normAng(pr.a2) }))
        .map((x) => ({ ...x, layer: e.layer, ...(e.color !== undefined ? { color: e.color } : {}), ...(e.ltype ? { ltype: e.ltype } : {}), ...(e.lw != null ? { lw: e.lw } : {}) }));
    }
    if (e.type === 'insert') {
      const blk = S.doc.blocks[e.name];
      if (!blk) return null;
      const m = M.insert(e, blk.base);
      const out = [];
      for (const c of blk.entities) {
        let x;
        if (M.isSimilar(m) || c.type === 'line' || c.type === 'pline' && !c.pts.some((p) => p.b) || c.type === 'point' || c.type === 'solid' || c.type === 'hatch' || c.type === 'spline') x = G.transformEntity(c, m);
        else {
          // non-uniformly scaled curves become polylines
          const pts = [];
          for (const pr of G.prims(c, S.ctx())) { const ps = pr.k === 'L' ? [pr.a, pr.b] : G.arcPoints(pr, 48); for (const q of ps) pts.push({ ...M.apply(m, q), b: 0 }); }
          x = { type: 'pline', pts, closed: false, layer: c.layer, color: c.color };
        }
        if (x.layer === '0') x.layer = e.layer;
        if (x.color === 0) { if (e.color !== undefined) x.color = e.color; else delete x.color; }
        out.push(x);
      }
      for (const a of e.attribs || []) out.push({ ...a });
      return out;
    }
    if (e.type === 'dim') return S.dimParts(e).map(keep);
    if (e.type === 'hatch') return e.loops.map((l) => ({ type: 'pline', closed: true, pts: l.map((p) => ({ x: p.x, y: p.y, b: 0 })), layer: e.layer, ...(e.color !== undefined ? { color: e.color } : {}) }));
    return null;
  }
  S.dimParts = (e) => G.dimGeometry(e, S.doc.settings.dimPrec ?? 2);
  R('EXPLODE', async () => {
    const list = await S.getSelection();
    const map = new Map();
    let n = 0;
    for (const e of list) { const r = explodeOne(e); if (r) { map.set(e, r); n++; } }
    if (n < list.length) S.msg(`${list.length - n} object(s) could not be exploded.`);
    S.replace(map);
  }, { aliases: ['X'], desc: 'Breaks a compound object into its component objects', group: 'Modify' });

  R('STRETCH', async () => {
    S.msg('Select objects to stretch by crossing-window or crossing-polygon...');
    const a = await S.getPoint('Specify first corner of crossing window', {});
    const b = await S.getPoint('Specify opposite corner', { base: a, noRubber: true, preview: (p) => [{ type: 'pline', closed: true, pts: rectPts(a, p), color: 3 }] });
    const r = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
    const inR = (x, y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
    const list = S.windowSelect(a, b, true);
    if (!list.length) return;
    S.msg(`${list.length} found`);
    const stretch = (e, d) => {
      const bb = S.bbox(e);
      if (bb[0] >= r[0] && bb[2] <= r[2] && bb[1] >= r[1] && bb[3] <= r[3]) return G.transformEntity(e, M.translate(d.x, d.y));
      switch (e.type) {
        case 'line': return { ...e, ...(inR(e.x1, e.y1) ? { x1: e.x1 + d.x, y1: e.y1 + d.y } : {}), ...(inR(e.x2, e.y2) ? { x2: e.x2 + d.x, y2: e.y2 + d.y } : {}) };
        case 'pline': return { ...e, pts: e.pts.map((p) => (inR(p.x, p.y) ? { ...p, x: p.x + d.x, y: p.y + d.y } : p)) };
        case 'dim': return { ...e, ...(e.x1 != null && inR(e.x1, e.y1) ? { x1: e.x1 + d.x, y1: e.y1 + d.y } : {}), ...(e.x2 != null && inR(e.x2, e.y2) ? { x2: e.x2 + d.x, y2: e.y2 + d.y } : {}), ...(inR(e.lx, e.ly) ? { lx: e.lx + d.x, ly: e.ly + d.y } : {}) };
        case 'arc': {
          const c = P(e.cx, e.cy), A = G.polar(c, e.a1, e.r), B = G.polar(c, e.a2, e.r), Mi = G.polar(c, e.a1 + G.sweep(e.a1, e.a2) / 2, e.r);
          const A2 = inR(A.x, A.y) ? G.add(A, d) : A, B2 = inR(B.x, B.y) ? G.add(B, d) : B;
          return S.arc3(A2, Mi, B2, e) || e;
        }
        default: return inR(e.x ?? e.cx, e.y ?? e.cy) ? G.transformEntity(e, M.translate(d.x, d.y)) : e;
      }
    };
    const base = await S.getPoint('Specify base point');
    const to = await S.getPoint('Specify second point', { base, ghost: (p) => list.slice(0, MAXGHOST).map((e) => stretch(e, G.sub(p, base))) });
    const d = G.sub(to, base);
    S.replace(new Map(list.map((e) => [e, [stretch(e, d)]])));
  }, { aliases: ['S'], desc: 'Stretches objects crossed by a selection window', group: 'Modify', pickfirst: false });

  R('ARRAYRECT', async () => {
    const list = await S.getSelection();
    if (!list.length) return;
    const rows = Math.max(1, Math.round(await S.getNumber('Enter the number of rows', { def: 3 })));
    const cols = Math.max(1, Math.round(await S.getNumber('Enter the number of columns', { def: 4 })));
    const bb = S.extents(list) || [0, 0, 10, 10];
    const dr = await S.getDistance('Specify the distance between rows', { def: S.fmt((bb[3] - bb[1]) * 1.5 || 10) });
    const dc = await S.getDistance('Specify the distance between columns', { def: S.fmt((bb[2] - bb[0]) * 1.5 || 10) });
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!r && !c) continue;
      const m = M.translate(c * dc, r * dr);
      for (const e of list) out.push(G.transformEntity(e, m));
    }
    S.addRaw(out);
  }, { aliases: ['AR', 'ARRAY'], desc: 'Distributes copies of objects in rows and columns', group: 'Modify' });

  R('ARRAYPOLAR', async () => {
    const list = await S.getSelection();
    if (!list.length) return;
    const c = await S.getPoint('Specify center point of array');
    const n = Math.max(2, Math.round(await S.getNumber('Enter number of items', { def: 6 })));
    const fill = await S.getNumber('Specify the angle to fill (+=ccw, -=cw)', { def: 360 });
    const step = Math.abs(Math.abs(fill) - 360) < 1e-9 ? G.rad(fill) / n : G.rad(fill) / (n - 1);
    const out = [];
    for (let i = 1; i < n; i++) { const m = M.rotate(step * i, c); for (const e of list) out.push(G.transformEntity(e, m)); }
    S.addRaw(out);
  }, { aliases: ['ARPO'], desc: 'Distributes copies of objects evenly around a center point', group: 'Modify' });

  R('JOIN', async () => {
    const list = (await S.getSelection('Select objects to join')).filter((e) => e.type === 'line' || e.type === 'arc' || (e.type === 'pline' && !e.closed));
    if (list.length < 2) { S.msg('Select at least two lines, arcs or open polylines.', 'err'); return; }
    // each source becomes an ordered vertex chain with bulges
    const chainOf = (e) => {
      if (e.type === 'line') return [{ x: e.x1, y: e.y1, b: 0 }, { x: e.x2, y: e.y2, b: 0 }];
      if (e.type === 'arc') {
        const c = P(e.cx, e.cy), a = G.polar(c, e.a1, e.r), b = G.polar(c, e.a2, e.r);
        return [{ ...a, b: G.bulgeFromSweep(G.sweep(e.a1, e.a2)) }, { ...b, b: 0 }];
      }
      return e.pts.map((p) => ({ ...p, b: p.b || 0 }));
    };
    const rev = (ch) => {
      const n = ch.length, r = ch.slice().reverse().map((p) => ({ ...p }));
      for (let i = 0; i < n - 1; i++) r[i].b = -(ch[n - 2 - i].b || 0);
      r[n - 1].b = 0;
      return r;
    };
    const size = Math.max(1, ...list.map((e) => { const b = S.bbox(e); return Math.max(b[2] - b[0], b[3] - b[1]); }));
    const tol = 1e-6 * size;
    const items = list.map((e, idx) => ({ idx, pts: chainOf(e) }));
    let cur = items.shift().pts;
    const used = [0];
    for (let progress = true; progress && items.length;) {
      progress = false;
      for (let i = 0; i < items.length; i++) {
        const ch = items[i].pts, s0 = cur[0], s1 = cur[cur.length - 1];
        let add = null, front = false;
        if (G.same(s1, ch[0], tol)) add = ch; else if (G.same(s1, ch[ch.length - 1], tol)) add = rev(ch);
        else if (G.same(s0, ch[ch.length - 1], tol)) { add = ch; front = true; } else if (G.same(s0, ch[0], tol)) { add = rev(ch); front = true; }
        if (!add) continue;
        if (front) cur = add.slice(0, -1).concat(cur);
        else { cur[cur.length - 1].b = add[0].b; cur = cur.concat(add.slice(1)); }
        used.push(items[i].idx); items.splice(i, 1); progress = true; break;
      }
    }
    if (used.length < 2) { S.msg('The objects do not share end points.', 'err'); return; }
    const closed = cur.length > 3 && G.same(cur[0], cur[cur.length - 1], tol);
    if (closed) cur.pop();
    const src = list[used[0]];
    const pl = { type: 'pline', pts: cur, closed, layer: src.layer, ...(src.color !== undefined ? { color: src.color } : {}) };
    S.replace(new Map(used.map((idx, k) => [list[idx], k === 0 ? [pl] : []])));
    S.msg(`${used.length} objects joined into 1 polyline${items.length ? `, ${items.length} could not be joined` : ''}`);
  }, { aliases: ['J'], desc: 'Joins lines, arcs and polylines into a single polyline', group: 'Modify' });

  R('BREAK', async () => {
    const r = await S.getEntity('Select object', { filter: (e) => ['line', 'arc', 'circle', 'pline'].includes(e.type) });
    let p1 = r.p;
    let p2 = await S.getPoint('Specify second break point or', { keywords: ['First point'] });
    if (p2 === 'First point') { p1 = await S.getPoint('Specify first break point'); p2 = await S.getPoint('Specify second break point'); }
    const e = r.e;
    const near = (p) => { let best = null, bd = Infinity; for (const pr of S.prims(e)) { const c = G.closestOnPrim(p, pr), d = G.dist(c, p); if (d < bd) { bd = d; best = c; } } return best; };
    const a = near(p1), b = near(p2);
    // two zero-length cutters at the break points, trim the piece between them
    const cutAt = (p) => { const pr = S.prims(e), c = pr.find((q) => G.distToPrim(p, q) < 1e-7) || pr[0]; let dir; if (c.k === 'L') dir = G.norm(G.sub(c.b, c.a)); else dir = G.perp(G.norm(G.sub(p, c.c))); const n = G.perp(dir); const k = 1e-3 * (S.bbox(e)[2] - S.bbox(e)[0] + 1); return { k: 'L', a: G.sub(p, G.mul(n, k)), b: G.add(p, G.mul(n, k)) }; };
    const cutters = [cutAt(a), cutAt(b)];
    let pick;
    if (e.type === 'circle') { const c = P(e.cx, e.cy); const a1 = G.ang(c, a), a2 = G.ang(c, b); pick = G.polar(c, a1 + G.sweep(a1, a2) / 2, e.r); }
    else if (e.type === 'arc') { const c = P(e.cx, e.cy); const t1 = G.normAng(G.ang(c, a) - e.a1), t2 = G.normAng(G.ang(c, b) - e.a1); pick = G.polar(c, e.a1 + (t1 + t2) / 2, e.r); }
    else if (e.type === 'pline') { const t1 = G.plineParamOf(e, a), t2 = G.plineParamOf(e, b); const tm = (t1 + t2) / 2, i = Math.floor(tm), pr = G.prims(e)[Math.min(i, G.prims(e).length - 1)]; pick = G.primAt(pr, pr.rev ? 1 - (tm - i) : tm - i); }
    else pick = G.mid(a, b);
    const res = G.trimEntity(e, pick, cutters);
    if (!res) { S.msg('Unable to break the object there.', 'err'); return; }
    S.replace(new Map([[e, res.remove ? [] : res.replace]]));
  }, { aliases: ['BR'], desc: 'Breaks the selected object between two points', group: 'Modify', pickfirst: false });

  R('MATCHPROP', async () => {
    const { e: src } = await S.getEntity('Select source object');
    S.msg(`Current active settings: Color Layer Ltype Lineweight`);
    for (;;) {
      const r = await S.getEntity('Select destination object(s)', { allowNone: true });
      if (r == null) return;
      const n = { ...r.e, layer: src.layer };
      for (const k of ['color', 'ltype', 'lw']) { if (src[k] !== undefined) n[k] = src[k]; else delete n[k]; }
      if (src.type === 'text' && n.type === 'text') n.h = src.h;
      S.replace(new Map([[r.e, [n]]]));
    }
  }, { aliases: ['MA', 'PAINTER'], desc: 'Applies the properties of a selected object to other objects', group: 'Modify', pickfirst: false });

  // ---------------------------------------------------------------- BLOCKS
  R('BLOCK', async () => {
    let name = await S.getString('Enter block name', {});
    name = (name || '').trim();
    if (!name) return;
    if (S.doc.blocks[name]) {
      const ow = await S.getKeyword(`Block "${name}" already exists. Redefine it?`, ['Yes', 'No'], 'No');
      if (ow !== 'Yes') return;
    }
    const base = await S.getPoint('Specify insertion base point');
    const list = await S.getSelection();
    if (!list.length) return;
    S.mark();
    S.doc.blocks = { ...S.doc.blocks, [name]: { base: { x: base.x, y: base.y }, entities: list.map((e) => JSON.parse(JSON.stringify(e))) } };
    S.clearCaches();
    const ins = S.decorate({ type: 'insert', name, x: base.x, y: base.y, sx: 1, sy: 1, rot: 0 });
    const map = new Map(list.map((e, i) => [e, i === 0 ? [ins] : []]));
    S.replace(map);
    S.msg(`Block "${name}" created from ${list.length} objects.`);
    S.emit('doc');
  }, { aliases: ['B', 'BMAKE'], desc: 'Creates a block definition from selected objects', group: 'Block' });

  R('INSERT', async () => {
    const names = Object.keys(S.doc.blocks).filter((n) => !n.startsWith('*')).sort();
    if (!names.length) { S.msg('This drawing contains no blocks. Use BLOCK to create one.', 'err'); return; }
    let name = await S.blockPicker(names);
    if (!name) return;
    const blk = S.doc.blocks[name];
    const mk = (p, s = 1, rot = 0) => ({ type: 'insert', name, x: p.x, y: p.y, sx: s, sy: s, rot });
    const p = await S.getPoint('Specify insertion point', { ghost: (q) => [S.decorate(mk(q))] });
    const s = await S.getNumber('Enter scale factor', { def: 1 });
    const rot = await S.getAngle('Specify rotation angle', { base: p, def: 0, ghost: (q) => [S.decorate(mk(p, s, G.ang(p, q)))] });
    const ins = mk(p, s, G.rad(rot));
    const defs = S.attDefs(blk);
    if (defs.length) {
      const vals = await S.attributeDialog(`Attributes - ${name}`, defs);
      if (vals) ins.attribs = S.makeAttribs(blk, S.decorate({ ...ins }), vals);
    }
    S.add(ins);
  }, { aliases: ['I', 'DDINSERT'], desc: 'Inserts a block into the drawing', group: 'Block', pickfirst: false });

  // ---------------------------------------------------------------- INQUIRY
  R('DIST', async () => {
    const a = await S.getPoint('Specify first point');
    const b = await S.getPoint('Specify second point', { base: a });
    const d = G.dist(a, b), ang = G.deg(G.normAng(G.ang(a, b)));
    S.msg(`Distance = ${S.fmt(d)},  Angle in XY Plane = ${S.fmt(ang, 2)}°`);
    S.msg(`Delta X = ${S.fmt(b.x - a.x)},  Delta Y = ${S.fmt(b.y - a.y)}`);
  }, { aliases: ['DI'], desc: 'Measures the distance and angle between two points', group: 'Utilities', noUndo: true, pickfirst: false });
  R('ID', async () => { const p = await S.getPoint('Specify point'); S.msg(`X = ${S.fmt(p.x)}     Y = ${S.fmt(p.y)}     Z = ${S.fmt(0)}`); },
    { desc: 'Displays the coordinate of a location', group: 'Utilities', noUndo: true, pickfirst: false });
  R('AREA', async () => {
    const first = await S.getPoint('Specify first corner point or', { keywords: ['Object'] });
    let area, perim;
    if (first === 'Object') {
      const { e } = await S.getEntity('Select objects', { filter: (x) => ['circle', 'pline', 'ellipse', 'arc', 'hatch'].includes(x.type) });
      if (e.type === 'circle') { area = Math.PI * e.r * e.r; perim = 2 * Math.PI * e.r; }
      else if (e.type === 'pline') { area = G.plineArea(e); perim = G.plineLength(e); }
      else if (e.type === 'hatch') { area = e.loops.reduce((s, l, i) => s + (i ? -1 : 1) * Math.abs(G.polyArea(l)), 0); perim = 0; }
      else { const l = S.closedLoop(e) || G.ellipsePoints(e, 256); area = Math.abs(G.polyArea(l)); perim = S.prims(e).reduce((s, p) => s + G.primLength(p), 0); }
    } else {
      const pts = [first];
      for (;;) {
        const p = await S.getPoint('Specify next point or', { base: pts[pts.length - 1], allowNone: true, preview: (q) => [{ type: 'pline', closed: true, pts: [...pts, q].map((v) => ({ ...v, b: 0 })), color: 3 }] });
        if (p == null) break;
        pts.push(p);
      }
      area = Math.abs(G.polyArea(pts)); perim = pts.reduce((s, p, i) => s + G.dist(p, pts[(i + 1) % pts.length]), 0);
    }
    S.msg(`Area = ${S.fmt(area)}, Perimeter = ${S.fmt(perim)}`);
  }, { aliases: ['AA'], desc: 'Calculates area and perimeter', group: 'Utilities', noUndo: true, pickfirst: false });
  R('LIST', async () => {
    const list = await S.getSelection();
    for (const e of list.slice(0, 50)) {
      const lay = `Layer: "${e.layer}"`;
      const col = e.color === undefined ? 'BYLAYER' : e.color === 0 ? 'BYBLOCK' : e.color;
      S.msg(`${e.type.toUpperCase()}   ${lay}   Color: ${col}   Linetype: ${e.ltype || 'BYLAYER'}`);
      switch (e.type) {
        case 'line': S.msg(`  from point X=${S.fmt(e.x1)} Y=${S.fmt(e.y1)}  to point X=${S.fmt(e.x2)} Y=${S.fmt(e.y2)}  Length = ${S.fmt(Math.hypot(e.x2 - e.x1, e.y2 - e.y1))}`); break;
        case 'circle': S.msg(`  center point X=${S.fmt(e.cx)} Y=${S.fmt(e.cy)}  radius ${S.fmt(e.r)}  circumference ${S.fmt(2 * Math.PI * e.r)}  area ${S.fmt(Math.PI * e.r * e.r)}`); break;
        case 'arc': S.msg(`  center point X=${S.fmt(e.cx)} Y=${S.fmt(e.cy)}  radius ${S.fmt(e.r)}  start angle ${S.fmt(G.deg(e.a1), 2)}  end angle ${S.fmt(G.deg(e.a2), 2)}  length ${S.fmt(e.r * G.sweep(e.a1, e.a2))}`); break;
        case 'pline': S.msg(`  ${e.closed ? 'Closed' : 'Open'}  vertices ${e.pts.length}  length ${S.fmt(G.plineLength(e))}${e.closed ? '  area ' + S.fmt(G.plineArea(e)) : ''}`); break;
        case 'text': S.msg(`  text "${e.text.replace(/\n/g, '\\P')}"  height ${S.fmt(e.h)}  rotation ${S.fmt(G.deg(e.rot || 0), 2)}`); break;
        case 'insert': S.msg(`  block name "${e.name}"  at X=${S.fmt(e.x)} Y=${S.fmt(e.y)}  scale ${S.fmt(e.sx ?? 1)}, ${S.fmt(e.sy ?? 1)}  rotation ${S.fmt(G.deg(e.rot || 0), 2)}`); break;
      }
    }
    if (list.length > 50) S.msg(`... and ${list.length - 50} more`);
    S.selection = new Set(list); S.render();
  }, { aliases: ['LI', 'LS'], desc: 'Displays property data for selected objects', group: 'Utilities', noUndo: true });

  // ---------------------------------------------------------------- VIEW
  R('ZOOM', async () => {
    const r = await S.getPoint('Specify corner of window, enter a scale factor (nX), or', { keywords: ['All', 'Extents', 'Window', 'Previous', 'In', 'Out'], def: 'real time', allowNone: true });
    if (r == null) return;
    if (r === 'All' || r === 'Extents') { S.zoomPrev = { ...S.view }; S.zoomExtents(); return; }
    if (r === 'In') { S.zoomAt(S.size().W / 2, S.size().H / 2, 2); return; }
    if (r === 'Out') { S.zoomAt(S.size().W / 2, S.size().H / 2, 0.5); return; }
    if (r === 'Previous') { if (S.zoomPrev) { const v = { ...S.view }; S.view = S.zoomPrev; S.zoomPrev = v; S.render(); } return; }
    const a = r === 'Window' ? await S.getPoint('Specify first corner') : r;
    const b = await S.getPoint('Specify opposite corner', { base: a, noRubber: true, preview: (p) => [{ type: 'pline', closed: true, pts: rectPts(a, p), color: 4 }] });
    S.zoomPrev = { ...S.view };
    S.zoomRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), 0);
  }, { aliases: ['Z'], desc: 'Increases or decreases the magnification of the view', group: 'View', noUndo: true, pickfirst: false });
  R('PAN', async () => {
    const a = await S.getPoint('Specify base point or displacement');
    const b = await S.getPoint('Specify second point', { base: a });
    S.view.cx -= b.x - a.x; S.view.cy -= b.y - a.y; S.render();
  }, { aliases: ['P'], desc: 'Moves the view (or drag with the middle mouse button)', group: 'View', noUndo: true, pickfirst: false });
  R('REGEN', () => { S.clearCaches(); S.render(); S.msg('Regenerating model.'); }, { aliases: ['RE', 'REGENALL'], desc: 'Regenerates the drawing', group: 'View', noUndo: true, pickfirst: false });

  // ---------------------------------------------------------------- SETTINGS / TOGGLES
  const toggle = (key, label) => () => { S.st[key] = !S.st[key]; S.saveSettings(); S.msg(`<${label} ${S.st[key] ? 'on' : 'off'}>`); S.emit('status'); S.render(); };
  R('GRID', toggle('grid', 'Grid'), { desc: 'Toggles the grid display (F7)', group: 'Settings', noUndo: true, pickfirst: false });
  R('SNAP', toggle('snap', 'Snap'), { aliases: ['SN'], desc: 'Toggles snap mode (F9)', group: 'Settings', noUndo: true, pickfirst: false });
  S.cycleIsoplane = () => {
    const order = ['left', 'top', 'right'];
    S.st.isoplane = order[(order.indexOf(S.st.isoplane || 'left') + 1) % 3];
    S.saveSettings(); S.emit('status'); S.render();
    S.msg(`<Isoplane ${S.st.isoplane[0].toUpperCase() + S.st.isoplane.slice(1)}>`);
  };
  R('ISODRAFT', async () => {
    const r = await S.getKeyword('Enter isometric setting', ['Left', 'Top', 'Right', 'Off'], S.st.iso ? 'Off' : (S.st.isoplane ? S.st.isoplane[0].toUpperCase() + S.st.isoplane.slice(1) : 'Left'));
    if (r === 'Off') { S.st.iso = false; S.msg('<Isometric drafting off>'); }
    else { S.st.iso = true; S.st.isoplane = r.toLowerCase(); S.msg(`<Isometric drafting on, isoplane ${r}>  F5 cycles planes; F8 locks to the plane's axes.`); }
    S.saveSettings(); S.emit('status'); S.render();
  }, { aliases: ['ISO'], desc: 'Turns isometric drafting on/off and picks the isoplane (F5 cycles planes)', group: 'Settings', noUndo: true, pickfirst: false });
  R('ISOPLANE', () => S.cycleIsoplane(), { desc: 'Cycles the isometric plane: left, top, right (F5 / Ctrl+E)', group: 'Settings', noUndo: true, pickfirst: false });
  R('SNAPANG', async () => {
    const v = await S.getAngle('Specify snap/ortho angle', { def: S.st.snapAng || 0 });
    S.st.snapAng = ((v % 360) + 360) % 360; if (S.st.snapAng > 359.999999) S.st.snapAng = 0;
    S.saveSettings(); S.render();
    S.msg(`Ortho and crosshair locked to ${S.fmt(S.st.snapAng, 2)}° / ${S.fmt((S.st.snapAng + 90) % 360, 2)}°. Set 0 to return to normal.`);
  }, { desc: 'Rotates the ortho lock and crosshair to an angle', group: 'Settings', noUndo: true, pickfirst: false });
  R('ORTHO', toggle('ortho', 'Ortho'), { desc: 'Toggles orthogonal mode (F8)', group: 'Settings', noUndo: true, pickfirst: false });
  R('LWDISPLAY', toggle('lwt', 'Lineweight'), { aliases: ['LWT'], desc: 'Toggles lineweight display', group: 'Settings', noUndo: true, pickfirst: false });
  R('OSNAP', () => S.openOsnapDialog(), { aliases: ['OS', 'DDOSNAP'], desc: 'Sets running object snap modes', group: 'Settings', noUndo: true, pickfirst: false });
  R('LAYER', () => S.openLayerManager(), { aliases: ['LA', 'DDLMODES'], desc: 'Manages layers and layer properties', group: 'Layers', noUndo: true });
  R('PROPERTIES', () => S.emit('properties', true), { aliases: ['PR', 'CH', 'MO', 'PROPS'], desc: 'Shows the Properties palette', group: 'Utilities', noUndo: true });
  R('LAYMCUR', async () => {
    const { e } = await S.getEntity('Select object whose layer will become current');
    S.doc.clayer = e.layer; S.msg(`${e.layer} is now the current layer.`); S.emit('doc');
  }, { desc: 'Makes the layer of a selected object current', group: 'Layers', noUndo: true, pickfirst: false });
  const setvar = (key, label, opts = {}) => async () => {
    const v = await S.getNumber(`Enter new value for ${label}`, { def: S.doc.settings[key] });
    if (!(v >= (opts.min ?? 0))) { S.msg('Invalid value.', 'err'); return; }
    S.mark(); S.doc.settings[key] = opts.int ? Math.round(v) : v; S.clearCaches(); S.render(); S.emit('doc');
  };
  R('LTSCALE', setvar('ltscale', 'LTSCALE', { min: 1e-9 }), { aliases: ['LTS'], desc: 'Sets the global linetype scale factor', group: 'Settings' });
  R('TEXTSIZE', setvar('textHeight', 'TEXTSIZE', { min: 1e-9 }), { desc: 'Sets the default text height', group: 'Settings' });
  R('DIMTXT', setvar('dimHeight', 'DIMTXT', { min: 1e-9 }), { aliases: ['DIMSCALE'], desc: 'Sets the dimension text height', group: 'Settings' });
  R('LUPREC', setvar('prec', 'LUPREC', { int: true }), { desc: 'Sets the number of decimal places displayed', group: 'Settings' });
  R('DIMDEC', setvar('dimPrec', 'DIMDEC', { int: true }), { desc: 'Sets dimension decimal places', group: 'Settings' });

  // ---------------------------------------------------------------- EDIT / FILE
  R('U', () => S.undo(), { aliases: ['UNDO'], desc: 'Reverses the most recent operation', group: 'Edit', noUndo: true, pickfirst: false });
  R('REDO', () => S.redo(), { aliases: ['MREDO'], desc: 'Reverses the effects of the previous UNDO', group: 'Edit', noUndo: true, pickfirst: false });
  R('COPYCLIP', async () => {
    const list = await S.getSelection();
    if (!list.length) return;
    const bb = S.extents(list) || [0, 0, 0, 0];
    S.clipboard = { base: P(bb[0], bb[1]), entities: JSON.parse(JSON.stringify(list)) };
    S.msg(`${list.length} object(s) copied to the clipboard.`);
  }, { desc: 'Copies objects to the clipboard (Ctrl+C)', group: 'Edit', noUndo: true });
  R('CUTCLIP', async () => {
    const list = await S.getSelection();
    if (!list.length) return;
    const bb = S.extents(list) || [0, 0, 0, 0];
    S.clipboard = { base: P(bb[0], bb[1]), entities: JSON.parse(JSON.stringify(list)) };
    S.remove(list);
  }, { desc: 'Cuts objects to the clipboard (Ctrl+X)', group: 'Edit' });
  R('PASTECLIP', async () => {
    const cb = S.clipboard;
    if (!cb) { S.msg('The clipboard is empty.', 'err'); return; }
    const p = await S.getPoint('Specify insertion point', { ghost: (q) => ghostOf(cb.entities, M.translate(q.x - cb.base.x, q.y - cb.base.y)) });
    S.addRaw(cb.entities.map((e) => G.transformEntity(e, M.translate(p.x - cb.base.x, p.y - cb.base.y))));
  }, { desc: 'Pastes objects from the clipboard (Ctrl+V)', group: 'Edit', pickfirst: false });
  R('SELECTALL', () => { S.selection = new Set(S.E.filter(S.isSelectable)); S.emit('selection'); S.render(); S.msg(`${S.selection.size} found`); },
    { aliases: ['AI_SELALL'], desc: 'Selects all objects (Ctrl+A)', group: 'Edit', noUndo: true, pickfirst: false });

  R('NEW', () => S.fileNew(), { aliases: ['QNEW'], desc: 'Creates a new drawing', group: 'File', noUndo: true, pickfirst: false });
  R('OPEN', () => S.fileOpen(), { desc: 'Opens a DWG, DXF or DraftForge drawing', group: 'File', noUndo: true, pickfirst: false });
  R('QSAVE', () => S.fileSave(false), { aliases: ['SAVE'], desc: 'Saves the current drawing', group: 'File', noUndo: true, pickfirst: false });
  R('SAVEAS', () => S.fileSave(true), { desc: 'Saves the drawing under a new name or format', group: 'File', noUndo: true, pickfirst: false });
  R('DXFOUT', () => S.exportFile('dxf'), { desc: 'Exports the drawing to DXF', group: 'File', noUndo: true, pickfirst: false });
  R('SVGOUT', () => S.exportFile('svg'), { desc: 'Exports the drawing to SVG', group: 'File', noUndo: true, pickfirst: false });
  R('PNGOUT', () => S.exportFile('png'), { aliases: ['JPGOUT'], desc: 'Exports the current view as a PNG image', group: 'File', noUndo: true, pickfirst: false });
  R('HELP', () => S.showHelp(), { aliases: ['?'], desc: 'Shows the command reference (F1)', group: 'Help', noUndo: true, pickfirst: false });
  R('QUIT', () => S.quit && S.quit(), { aliases: ['EXIT'], desc: 'Exits DraftForge', group: 'File', noUndo: true, pickfirst: false });
})();
