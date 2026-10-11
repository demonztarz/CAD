/* DraftForge geometry kernel: pure functions shared by the app, importers and tests. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const EPS = 1e-9;

  // ---------- vectors ----------
  const P = (x, y) => ({ x, y });
  const add = (a, b) => P(a.x + b.x, a.y + b.y);
  const sub = (a, b) => P(a.x - b.x, a.y - b.y);
  const mul = (a, k) => P(a.x * k, a.y * k);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const len = (a) => Math.hypot(a.x, a.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const norm = (a) => { const l = len(a) || 1; return P(a.x / l, a.y / l); };
  const perp = (a) => P(-a.y, a.x);
  const lerp = (a, b, t) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const mid = (a, b) => lerp(a, b, 0.5);
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const polar = (p, a, d) => P(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
  const same = (a, b, tol = 1e-7) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
  const normAng = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
  const sweep = (a1, a2) => { const s = normAng(a2 - a1); return s < 1e-12 ? TAU : s; };
  const angInArc = (a, a1, a2, tol = 1e-9) => normAng(a - a1) <= sweep(a1, a2) + tol;
  const rad = (d) => d * Math.PI / 180;
  const deg = (r) => r * 180 / Math.PI;

  // ---------- affine matrices [a,b,c,d,e,f]: x' = a x + c y + e, y' = b x + d y + f ----------
  const M = {
    identity: () => [1, 0, 0, 1, 0, 0],
    mul: (m, n) => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ],
    translate: (dx, dy) => [1, 0, 0, 1, dx, dy],
    rotate: (a, c = P(0, 0)) => {
      const cs = Math.cos(a), sn = Math.sin(a);
      return [cs, sn, -sn, cs, c.x - cs * c.x + sn * c.y, c.y - sn * c.x - cs * c.y];
    },
    scale: (sx, sy = sx, c = P(0, 0)) => [sx, 0, 0, sy, c.x - sx * c.x, c.y - sy * c.y],
    mirror: (p1, p2) => {
      const a = ang(p1, p2), c2 = Math.cos(2 * a), s2 = Math.sin(2 * a);
      return M.mul(M.translate(p1.x, p1.y), M.mul([c2, s2, s2, -c2, 0, 0], M.translate(-p1.x, -p1.y)));
    },
    apply: (m, p) => P(m[0] * p.x + m[2] * p.y + m[4], m[1] * p.x + m[3] * p.y + m[5]),
    applyVec: (m, v) => P(m[0] * v.x + m[2] * v.y, m[1] * v.x + m[3] * v.y),
    det: (m) => m[0] * m[3] - m[1] * m[2],
    invert: (m) => {
      const d = m[0] * m[3] - m[1] * m[2];
      if (Math.abs(d) < 1e-300) return M.identity();
      return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
    },
    // uniform scale factor (sqrt|det|) and whether it is a similarity
    scaleOf: (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])),
    isSimilar: (m) => Math.abs(Math.hypot(m[0], m[1]) - Math.hypot(m[2], m[3])) < 1e-9 * Math.max(1, Math.hypot(m[0], m[1])) &&
      Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-9 * Math.max(1, m[0] * m[0] + m[1] * m[1]),
    insert: (e, base) => {
      const b = base || P(0, 0);
      return M.mul(M.translate(e.x, e.y), M.mul(M.rotate(e.rot || 0), M.mul(M.scale(e.sx ?? 1, e.sy ?? 1), M.translate(-b.x, -b.y))));
    },
  };

  // ---------- standard CAD colour index (ACI) palette ----------
  const ACI = (() => {
    const t = new Array(256).fill('#ffffff');
    const fixed = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0' };
    for (const k in fixed) t[k] = fixed[k];
    const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
    const bright = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3];
    for (let i = 10; i < 250; i++) {
      const g = Math.floor((i - 10) / 10), j = (i - 10) % 10;
      const h = (g * 15) / 60, x = 1 - Math.abs((h % 2) - 1);
      let rgb = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
      if (j % 2) rgb = rgb.map((v) => 0.5 + v * 0.5);
      t[i] = hex(...rgb.map((v) => v * bright[j]));
    }
    ['#333333', '#505050', '#696969', '#828282', '#bebebe', '#ffffff'].forEach((c, k) => (t[250 + k] = c));
    t[0] = '#ffffff';
    return t;
  })();
  const aciFromRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    let best = 7, bd = Infinity;
    for (let i = 1; i < 256; i++) {
      const c = ACI[i];
      const d = (parseInt(c.slice(1, 3), 16) - r) ** 2 + (parseInt(c.slice(3, 5), 16) - g) ** 2 + (parseInt(c.slice(5, 7), 16) - b) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  // ---------- bulge arcs ----------
  function bulgeArc(p, q, b) {
    const c = dist(p, q);
    if (Math.abs(b) < 1e-12 || c < 1e-12) return null;
    const m = mid(p, q), n = perp(norm(sub(q, p)));
    const ctr = add(m, mul(n, (c / 2) * ((1 - b * b) / (2 * b))));
    const r = dist(ctr, p);
    return b > 0 ? { c: ctr, r, a1: ang(ctr, p), a2: ang(ctr, q), ccw: true } : { c: ctr, r, a1: ang(ctr, q), a2: ang(ctr, p), ccw: false };
  }
  const bulgeFromSweep = (s) => Math.tan(s / 4);

  // ---------- splines ----------
  function catmull(pts, closed, per = 12) {
    if (pts.length < 2) return pts.slice();
    const n = pts.length, out = [];
    const get = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        out.push(P(
          0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)));
      }
    }
    out.push(closed ? P(pts[0].x, pts[0].y) : P(pts[n - 1].x, pts[n - 1].y));
    return out;
  }
  function nurbs(ctrl, knots, degree, weights, samples) {
    const n = ctrl.length;
    if (n < 2) return ctrl.slice();
    const p = Math.min(degree || 3, n - 1);
    let U = knots && knots.length === n + p + 1 ? knots : null;
    if (!U) { // clamped uniform
      U = [];
      for (let i = 0; i <= n + p; i++) U.push(i <= p ? 0 : i >= n ? n - p : i - p);
    }
    const w = weights && weights.length === n ? weights : null;
    const lo = U[p], hi = U[n], out = [];
    const N = samples || Math.max(16, n * 10);
    for (let s = 0; s <= N; s++) {
      let t = lo + (hi - lo) * (s / N);
      if (t >= hi) t = hi - 1e-12 * Math.max(1, Math.abs(hi));
      let k = p; while (k < n - 1 && U[k + 1] <= t) k++;
      const d = [];
      for (let j = 0; j <= p; j++) {
        const c = ctrl[k - p + j], ww = w ? w[k - p + j] : 1;
        d.push([c.x * ww, c.y * ww, ww]);
      }
      for (let r = 1; r <= p; r++) {
        for (let j = p; j >= r; j--) {
          const i = k - p + j, den = U[i + p - r + 1] - U[i];
          const a = den === 0 ? 0 : (t - U[i]) / den;
          d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1], (1 - a) * d[j - 1][2] + a * d[j][2]];
        }
      }
      out.push(P(d[p][0] / d[p][2], d[p][1] / d[p][2]));
    }
    return out;
  }
  function splinePoints(e) {
    if (e.ctrl && e.ctrl.length > 1) return nurbs(e.ctrl, e.knots, e.degree, e.weights);
    return catmull(e.fit || [], !!e.closed);
  }

  // ---------- ellipse ----------
  function ellipsePoint(e, t) {
    const mx = e.mx, my = e.my, r = e.ratio;
    return P(e.cx + mx * Math.cos(t) - my * r * Math.sin(t), e.cy + my * Math.cos(t) + mx * r * Math.sin(t));
  }
  function ellipsePoints(e, n = 96) {
    const a1 = e.a1 ?? 0, s = e.a2 == null ? TAU : sweep(a1, e.a2);
    const k = Math.max(8, Math.ceil(n * s / TAU)), out = [];
    for (let i = 0; i <= k; i++) out.push(ellipsePoint(e, a1 + s * i / k));
    return out;
  }
  const isFullEllipse = (e) => e.a2 == null || Math.abs(sweep(e.a1 ?? 0, e.a2) - TAU) < 1e-9;

  // ---------- text metrics (pluggable) ----------
  const TEXT = {
    measure: (str, h) => str.length * h * 0.72, // overridden by the UI with canvas metrics
    lineGap: 1.6667,
  };
  // Text layout in local coordinates (before rotation). `oy` is the first line's baseline.
  function textBox(e) {
    const lines = String(e.tag ? e.tag : e.text ?? '').split('\n'); // attribute definitions display their tag
    const h = e.h || 1, gap = h * TEXT.lineGap, L = lines.length;
    const w = Math.max(h * 0.2, ...lines.map((l) => TEXT.measure(l, h) * (e.wf || 1)));
    const x0 = e.ha === 'center' || e.ha === 'middle' ? -w / 2 : e.ha === 'right' ? -w : 0;
    const span = h + (L - 1) * gap; // cap top of first line to baseline of last line
    let oy;
    switch (e.va) {
      case 'top': oy = -h; break;
      case 'middle': oy = span / 2 - h; break;
      case 'bottom': oy = (L - 1) * gap; break;
      default: oy = 0;
    }
    return { x0, x1: x0 + w, y0: oy - (L - 1) * gap - h * 0.22, y1: oy + h, w, h, lines, oy, gap };
  }
  function textCorners(e) {
    const b = textBox(e), m = M.mul(M.translate(e.x, e.y), M.rotate(e.rot || 0));
    return [P(b.x0, b.y0), P(b.x1, b.y0), P(b.x1, b.y1), P(b.x0, b.y1)].map((p) => M.apply(m, p));
  }

  // ---------- dimensions (generated geometry) ----------
  function fmtNum(v, prec = 2) {
    let s = (+v).toFixed(prec);
    if (s === '-0' || /^-0\.0*$/.test(s)) s = s.slice(1);
    return s;
  }
  function dimGeometry(e, prec = 2) {
    const h = e.h || 2.5, asz = e.asz || h, gap = h * 0.25, ext = h * 0.5;
    const out = [];
    const arrow = (tip, dir) => {
      const d = norm(dir), n = perp(d), b = sub(tip, mul(d, asz));
      out.push({ type: 'solid', pts: [tip, add(b, mul(n, asz / 6)), sub(b, mul(n, asz / 6))] });
    };
    // place text centred on `at`, lifted by `gap` on the reading-up side
    const label = (at, rot, val) => {
      let r = normAng(rot);
      if (r > Math.PI / 2 + 1e-9 && r <= Math.PI * 1.5 + 1e-9) r -= Math.PI;
      const pos = polar(at, r + Math.PI / 2, gap);
      const txt = e.text != null && e.text !== '' ? String(e.text).replace('<>', val) : val;
      out.push({ type: 'text', x: pos.x, y: pos.y, h, rot: r, text: txt, ha: 'center', va: 'bottom' });
    };
    if (e.kind === 'radius' || e.kind === 'diameter') {
      const c = P(e.cx, e.cy), r = e.r, a = ang(c, P(e.lx, e.ly));
      const onC = polar(c, a, r), loc = P(e.lx, e.ly);
      const val = (e.kind === 'radius' ? 'R' : '⌀') + fmtNum(e.kind === 'radius' ? r : 2 * r, prec);
      const start = e.kind === 'diameter' ? polar(c, a + Math.PI, r) : c;
      const far = dist(c, loc) > r ? loc : onC;
      out.push({ type: 'line', x1: start.x, y1: start.y, x2: far.x, y2: far.y });
      arrow(onC, sub(onC, c));
      if (e.kind === 'diameter') arrow(polar(c, a + Math.PI, r), sub(polar(c, a + Math.PI, r), c));
      label(far, a, val);
      return out;
    }
    if (e.kind === 'angular') {
      const c = P(e.cx, e.cy), a1 = e.a1, a2 = e.a2, R = dist(c, P(e.lx, e.ly));
      out.push({ type: 'arc', cx: c.x, cy: c.y, r: R, a1, a2 });
      const s = sweep(a1, a2);
      arrow(polar(c, a1, R), P(Math.sin(a1), -Math.cos(a1)));
      arrow(polar(c, a2, R), P(-Math.sin(a2), Math.cos(a2)));
      const am = a1 + s / 2;
      label(polar(c, am, R), am - Math.PI / 2, fmtNum(deg(s), Math.max(0, prec - 2)) + '°');
      return out;
    }
    const p1 = P(e.x1, e.y1), p2 = P(e.x2, e.y2), loc = P(e.lx, e.ly);
    let dir;
    if (e.kind === 'horizontal') dir = P(1, 0);
    else if (e.kind === 'vertical') dir = P(0, 1);
    else dir = norm(sub(p2, p1));
    const n = perp(dir);
    const off = dot(sub(loc, p1), n);
    const d1 = add(p1, mul(n, off)), d2raw = add(p2, mul(n, dot(sub(loc, p2), n)));
    // project p2 onto the dimension line through d1 along dir
    const d2 = add(d1, mul(dir, dot(sub(d2raw, d1), dir)));
    const meas = Math.abs(dot(sub(p2, p1), dir));
    const extLine = (p, d) => {
      const v = sub(d, p), L = len(v);
      if (L < 1e-12) return;
      const u = mul(v, 1 / L);
      const s = add(p, mul(u, Math.min(gap, L))), t = add(d, mul(u, ext));
      out.push({ type: 'line', x1: s.x, y1: s.y, x2: t.x, y2: t.y });
    };
    extLine(p1, d1); extLine(p2, d2);
    out.push({ type: 'line', x1: d1.x, y1: d1.y, x2: d2.x, y2: d2.y });
    const dl = sub(d2, d1);
    if (len(dl) > 1e-12) { arrow(d1, mul(dl, -1)); arrow(d2, dl); }
    label(mid(d1, d2), Math.atan2(dir.y, dir.x), fmtNum(meas, prec));
    return out;
  }

  // ---------- hatch patterns ----------
  const PATTERNS = {
    ANSI31: [{ angle: 45, base: [0, 0], offset: [0, 3.175], dashes: [] }],
    ANSI32: [{ angle: 45, base: [0, 0], offset: [0, 9.525], dashes: [] }, { angle: 45, base: [4.49, 0], offset: [0, 9.525], dashes: [] }],
    ANSI37: [{ angle: 45, base: [0, 0], offset: [0, 3.175], dashes: [] }, { angle: 135, base: [0, 0], offset: [0, 3.175], dashes: [] }],
    NET: [{ angle: 0, base: [0, 0], offset: [0, 3.175], dashes: [] }, { angle: 90, base: [0, 0], offset: [0, 3.175], dashes: [] }],
    LINE: [{ angle: 0, base: [0, 0], offset: [0, 3.175], dashes: [] }],
    DASH: [{ angle: 0, base: [0, 0], offset: [3.175, 3.175], dashes: [3.175, -3.175] }],
    BRICK: [
      { angle: 0, base: [0, 0], offset: [0, 6.35], dashes: [] },
      { angle: 90, base: [0, 0], offset: [0, 12.7], dashes: [6.35, -6.35] },
      { angle: 90, base: [6.35, 0], offset: [0, 12.7], dashes: [-6.35, 6.35] },
    ],
    DOTS: [{ angle: 0, base: [0, 0], offset: [0.79375, 1.5875], dashes: [0, -1.5875] }],
  };
  // Pattern definition lines in world units (handles scale/angle) – {angle(rad), base:{x,y}, offset:{x,y}, dashes:[]}
  function hatchLines(e) {
    if (e.patLines && e.patLines.length) return e.patLines;
    const def = PATTERNS[e.pattern] || PATTERNS.ANSI31;
    const s = e.scale || 1, ra = e.angle || 0;
    return def.map((d) => {
      const a = rad(d.angle) + ra;
      const rot = (v) => P(v[0] * Math.cos(ra) - v[1] * Math.sin(ra), v[0] * Math.sin(ra) + v[1] * Math.cos(ra));
      // offsets in pattern definitions are expressed in the line's own frame
      const la = rad(d.angle);
      const off = P(d.offset[0] * Math.cos(la) - d.offset[1] * Math.sin(la), d.offset[0] * Math.sin(la) + d.offset[1] * Math.cos(la));
      return { angle: a, base: mul(rot(d.base), s), offset: mul(rot([off.x, off.y]), s), dashes: d.dashes.map((x) => x * s) };
    });
  }

  // attribute definitions (tagged text) live in block definitions but are not drawn in references
  const isAttDef = (e) => e.type === 'text' && !!e.tag;

  // Hatch pattern line segments clipped to the boundary's bounding box (boundary clipping is left to the
  // renderer). minSpacing: skip families denser than this; returns { segs: [[x1,y1,x2,y2]], dense }.
  function hatchSegments(e, bb, minSpacing = 0, maxSegs = 40000) {
    const segs = [];
    let dense = false;
    const corners = [P(bb[0], bb[1]), P(bb[2], bb[1]), P(bb[2], bb[3]), P(bb[0], bb[3])];
    for (const d of hatchLines(e)) {
      const u = P(Math.cos(d.angle), Math.sin(d.angle)), n = perp(u);
      const op = dot(d.offset, n);
      if (Math.abs(op) < 1e-12) continue;
      if (Math.abs(op) < minSpacing) { dense = true; continue; }
      const proj = corners.map((c) => dot(sub(c, d.base), n) / op);
      const k0 = Math.ceil(Math.min(...proj)), k1 = Math.floor(Math.max(...proj));
      if (k1 - k0 > maxSegs) { dense = true; continue; }
      const total = d.dashes.reduce((a, x) => a + Math.abs(x), 0);
      for (let k = k0; k <= k1; k++) {
        if (segs.length > maxSegs) { dense = true; break; }
        const o = add(d.base, mul(d.offset, k));
        const ts = corners.map((c) => dot(sub(c, o), u));
        const tmin = Math.min(...ts), tmax = Math.max(...ts);
        if (!d.dashes.length || total <= 0 || (tmax - tmin) / total > 400 || total < minSpacing) {
          const a = add(o, mul(u, tmin)), b = add(o, mul(u, tmax));
          segs.push([a.x, a.y, b.x, b.y]);
          continue;
        }
        let t = Math.floor(tmin / total) * total;
        while (t < tmax) {
          for (const dl of d.dashes) {
            const L = Math.abs(dl);
            if (dl >= 0) {
              const a = add(o, mul(u, t)), b = add(o, mul(u, t + Math.max(L, minSpacing * 0.3 || total * 0.01)));
              segs.push([a.x, a.y, b.x, b.y]);
            }
            t += L;
            if (t >= tmax) break;
          }
        }
      }
    }
    return { segs, dense };
  }

  // ---------- primitive decomposition ----------
  // Each entity decomposes into primitives: {k:'L', a, b} segments and {k:'A', c, r, a1, a2, full} CCW arcs.
  function plinePrims(pts, closed, out = []) {
    const n = pts.length, segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const ba = bulgeArc(p, q, p.b || 0);
      if (ba) out.push({ k: 'A', c: ba.c, r: ba.r, a1: ba.a1, a2: ba.a2, seg: i, rev: !ba.ccw });
      else out.push({ k: 'L', a: P(p.x, p.y), b: P(q.x, q.y), seg: i });
    }
    return out;
  }
  function polyPrims(pts, closed, out = []) {
    for (let i = 0; i + 1 < pts.length; i++) out.push({ k: 'L', a: pts[i], b: pts[i + 1] });
    if (closed && pts.length > 2) out.push({ k: 'L', a: pts[pts.length - 1], b: pts[0] });
    return out;
  }
  function primsOf(e, ctx) {
    const out = [];
    switch (e.type) {
      case 'line': out.push({ k: 'L', a: P(e.x1, e.y1), b: P(e.x2, e.y2) }); break;
      case 'xline': {
        const big = 1e7, d = norm(P(e.dx, e.dy)), p = P(e.x, e.y);
        out.push({ k: 'L', a: e.ray ? p : sub(p, mul(d, big)), b: add(p, mul(d, big)) });
        break;
      }
      case 'circle': out.push({ k: 'A', c: P(e.cx, e.cy), r: e.r, a1: 0, a2: TAU, full: true }); break;
      case 'arc': out.push({ k: 'A', c: P(e.cx, e.cy), r: e.r, a1: e.a1, a2: e.a2 }); break;
      case 'pline': plinePrims(e.pts, e.closed, out); break;
      case 'ellipse': polyPrims(ellipsePoints(e), false, out); break;
      case 'spline': polyPrims(splinePoints(e), !!e.closed && !!e.ctrl, out); break;
      case 'point': out.push({ k: 'L', a: P(e.x, e.y), b: P(e.x, e.y), pt: true }); break;
      case 'solid': polyPrims(e.pts, true, out); break;
      case 'text': polyPrims(textCorners(e), true, out); break;
      case 'hatch': for (const l of e.loops) polyPrims(l, true, out); break;
      case 'viewport': polyPrims([P(e.x, e.y), P(e.x + e.w, e.y), P(e.x + e.w, e.y + e.h), P(e.x, e.y + e.h)], true, out); break;
      case 'dim': for (const s of dimGeometry(e, ctx && ctx.dimPrec)) out.push(...primsOf(s, ctx)); break;
      case 'insert': {
        const blk = ctx && ctx.blocks && ctx.blocks[e.name];
        if (!blk || (ctx.depth || 0) > 12) { out.push({ k: 'L', a: P(e.x, e.y), b: P(e.x, e.y), pt: true }); break; }
        const m = M.insert(e, blk.base);
        const sub = { ...ctx, depth: (ctx.depth || 0) + 1 };
        for (const c of blk.entities) { if (isAttDef(c)) continue; for (const pr of primsOf(c, sub)) out.push(transformPrim(pr, m)); }
        for (const a of e.attribs || []) out.push(...primsOf(a, ctx));
        break;
      }
    }
    return out;
  }
  function transformPrim(pr, m) {
    if (pr.k === 'L') return { ...pr, a: M.apply(m, pr.a), b: M.apply(m, pr.b) };
    if (M.isSimilar(m)) {
      const c = M.apply(m, pr.c), r = pr.r * M.scaleOf(m);
      if (pr.full) return { ...pr, c, r };
      let a1 = ang(c, M.apply(m, polar(pr.c, pr.a1, pr.r))), a2 = ang(c, M.apply(m, polar(pr.c, pr.a2, pr.r)));
      if (M.det(m) < 0) [a1, a2] = [a2, a1];
      return { ...pr, c, r, a1, a2 };
    }
    // non-uniform scale: tessellate (returned as a polyline group)
    const s = pr.full ? TAU : sweep(pr.a1, pr.a2), n = Math.max(8, Math.ceil(48 * s / TAU));
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(M.apply(m, polar(pr.c, pr.a1 + s * i / n, pr.r)));
    return { k: 'G', prims: polyPrims(pts, false) };
  }
  const flatPrims = (list) => {
    const out = [];
    for (const p of list) if (p.k === 'G') out.push(...p.prims); else out.push(p);
    return out;
  };
  const prims = (e, ctx) => flatPrims(primsOf(e, ctx));

  function arcPoints(pr, n) {
    const s = pr.full ? TAU : sweep(pr.a1, pr.a2), k = n || Math.max(8, Math.ceil(64 * s / TAU)), out = [];
    for (let i = 0; i <= k; i++) out.push(polar(pr.c, pr.a1 + s * i / k, pr.r));
    return out;
  }
  function primBox(pr, bb) {
    const ext = (p) => { if (p.x < bb[0]) bb[0] = p.x; if (p.y < bb[1]) bb[1] = p.y; if (p.x > bb[2]) bb[2] = p.x; if (p.y > bb[3]) bb[3] = p.y; };
    if (pr.k === 'L') { ext(pr.a); ext(pr.b); return bb; }
    ext(polar(pr.c, pr.a1, pr.r)); ext(polar(pr.c, pr.full ? pr.a1 : pr.a2, pr.r));
    for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; if (pr.full || angInArc(a, pr.a1, pr.a2)) ext(polar(pr.c, a, pr.r)); }
    return bb;
  }
  function bbox(e, ctx) {
    if (e.type === 'xline') return [e.x, e.y, e.x, e.y];
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const pr of prims(e, ctx)) primBox(pr, bb);
    return bb;
  }

  // ---------- distances / projections ----------
  function closestOnSeg(p, a, b) {
    const ab = sub(b, a), L2 = dot(ab, ab);
    const t = L2 < 1e-24 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2));
    return { p: add(a, mul(ab, t)), t };
  }
  function closestOnPrim(p, pr) {
    if (pr.k === 'L') return closestOnSeg(p, pr.a, pr.b).p;
    const a = ang(pr.c, p);
    if (pr.full || angInArc(a, pr.a1, pr.a2)) return polar(pr.c, a, pr.r);
    const e1 = polar(pr.c, pr.a1, pr.r), e2 = polar(pr.c, pr.a2, pr.r);
    return dist(p, e1) < dist(p, e2) ? e1 : e2;
  }
  const distToPrim = (p, pr) => dist(p, closestOnPrim(p, pr));

  function pointInPoly(p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  // ---------- intersections ----------
  function segSeg(a, b, c, d, infinite) {
    const r = sub(b, a), s = sub(d, c), den = cross(r, s);
    if (Math.abs(den) < 1e-14 * (len(r) * len(s) + 1e-300)) return [];
    const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
    const tol = 1e-9;
    if (!infinite && (t < -tol || t > 1 + tol || u < -tol || u > 1 + tol)) return [];
    return [{ p: add(a, mul(r, t)), t, u }];
  }
  function lineCircle(a, b, c, r) {
    const d = sub(b, a), f = sub(a, c);
    const A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - r * r;
    let disc = B * B - 4 * A * C;
    if (A < 1e-24) return [];
    if (disc < 0) { if (disc > -1e-9 * B * B) disc = 0; else return []; }
    const sq = Math.sqrt(disc);
    const ts = disc === 0 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
    return ts.map((t) => ({ p: add(a, mul(d, t)), t }));
  }
  function circleCircle(c1, r1, c2, r2) {
    const d = dist(c1, c2);
    if (d < 1e-12 || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h2 = r1 * r1 - a * a, h = h2 > 0 ? Math.sqrt(h2) : 0;
    const m = add(c1, mul(sub(c2, c1), a / d)), n = perp(norm(sub(c2, c1)));
    return h < 1e-12 ? [m] : [add(m, mul(n, h)), sub(m, mul(n, h))];
  }
  // Intersection points between two primitives. ext1/ext2: treat as infinite line / full circle.
  function primInter(p1, p2, ext1, ext2) {
    const res = [];
    const onArc = (pr, pt, ext) => ext || pr.full || angInArc(ang(pr.c, pt), pr.a1, pr.a2, 1e-9);
    if (p1.k === 'L' && p2.k === 'L') {
      if (p1.pt || p2.pt) return res;
      const r = segSeg(p1.a, p1.b, p2.a, p2.b, true);
      for (const x of r) {
        const tol = 1e-9;
        if ((ext1 || (x.t >= -tol && x.t <= 1 + tol)) && (ext2 || (x.u >= -tol && x.u <= 1 + tol))) res.push(x.p);
      }
      return res;
    }
    if (p1.k === 'A' && p2.k === 'L') return primInter(p2, p1, ext2, ext1);
    if (p1.k === 'L' && p2.k === 'A') {
      if (p1.pt) return res;
      for (const x of lineCircle(p1.a, p1.b, p2.c, p2.r)) {
        if ((ext1 || (x.t >= -1e-9 && x.t <= 1 + 1e-9)) && onArc(p2, x.p, ext2)) res.push(x.p);
      }
      return res;
    }
    for (const pt of circleCircle(p1.c, p1.r, p2.c, p2.r)) if (onArc(p1, pt, ext1) && onArc(p2, pt, ext2)) res.push(pt);
    return res;
  }

  // parameter of a point along a primitive (0..1 for lines, angle offset for arcs)
  function primParam(pr, p) {
    if (pr.k === 'L') {
      const ab = sub(pr.b, pr.a), L2 = dot(ab, ab);
      return L2 < 1e-24 ? 0 : dot(sub(p, pr.a), ab) / L2;
    }
    return normAng(ang(pr.c, p) - pr.a1) / (pr.full ? TAU : sweep(pr.a1, pr.a2));
  }
  const primAt = (pr, t) => pr.k === 'L' ? lerp(pr.a, pr.b, t) : polar(pr.c, pr.a1 + t * (pr.full ? TAU : sweep(pr.a1, pr.a2)), pr.r);
  const primLength = (pr) => pr.k === 'L' ? dist(pr.a, pr.b) : pr.r * (pr.full ? TAU : sweep(pr.a1, pr.a2));

  // ---------- entity helpers ----------
  function plineLength(e) { return prims(e).reduce((s, p) => s + primLength(p), 0); }
  function polyArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
    return a / 2;
  }
  function plineArea(e) {
    let a = -polyArea(e.pts);
    const n = e.pts.length;
    for (let i = 0; i < (e.closed ? n : n - 1); i++) {
      const b = e.pts[i].b || 0;
      if (!b) continue;
      const p = e.pts[i], q = e.pts[(i + 1) % n], c = dist(p, q), th = 4 * Math.atan(b);
      const r = c / (2 * Math.sin(Math.abs(th) / 2));
      const seg = (r * r / 2) * (Math.abs(th) - Math.sin(Math.abs(th)));
      a += Math.sign(b) * seg;
    }
    return Math.abs(a);
  }

  // Transform an entity by an affine similarity matrix. Returns a new entity.
  function transformEntity(e, m) {
    const o = JSON.parse(JSON.stringify(e));
    const ap = (x, y) => M.apply(m, P(x, y));
    const det = M.det(m), sc = M.scaleOf(m), mir = det < 0;
    const rotA = Math.atan2(m[1], m[0]);
    const mapAngle = (cx, cy, r, a) => { const c = ap(cx, cy); return ang(c, ap(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); };
    switch (o.type) {
      case 'line': { const a = ap(o.x1, o.y1), b = ap(o.x2, o.y2); Object.assign(o, { x1: a.x, y1: a.y, x2: b.x, y2: b.y }); break; }
      case 'xline': { const a = ap(o.x, o.y), d = M.applyVec(m, P(o.dx, o.dy)); Object.assign(o, { x: a.x, y: a.y, dx: d.x, dy: d.y }); break; }
      case 'point': { const a = ap(o.x, o.y); o.x = a.x; o.y = a.y; break; }
      case 'circle': { const c = ap(o.cx, o.cy); o.cx = c.x; o.cy = c.y; o.r *= sc; break; }
      case 'arc': {
        let a1 = mapAngle(e.cx, e.cy, e.r, e.a1), a2 = mapAngle(e.cx, e.cy, e.r, e.a2);
        if (mir) [a1, a2] = [a2, a1];
        const c = ap(o.cx, o.cy); Object.assign(o, { cx: c.x, cy: c.y, r: o.r * sc, a1, a2 }); break;
      }
      case 'pline': o.pts = o.pts.map((p) => { const q = ap(p.x, p.y); return { x: q.x, y: q.y, b: mir ? -(p.b || 0) : (p.b || 0) }; }); break;
      case 'solid': o.pts = o.pts.map((p) => ap(p.x, p.y)); break;
      case 'hatch':
        o.loops = o.loops.map((l) => l.map((p) => ap(p.x, p.y)));
        if (o.patLines) o.patLines = o.patLines.map((d) => {
          const b = ap(d.base.x, d.base.y), off = M.applyVec(m, d.offset), dv = M.applyVec(m, P(Math.cos(d.angle), Math.sin(d.angle)));
          return { angle: Math.atan2(dv.y, dv.x), base: b, offset: off, dashes: d.dashes.map((x) => x * sc) };
        });
        else { o.angle = (o.angle || 0) + rotA; o.scale = (o.scale || 1) * sc; }
        break;
      case 'ellipse': {
        const c = ap(o.cx, o.cy), v = M.applyVec(m, P(o.mx, o.my));
        Object.assign(o, { cx: c.x, cy: c.y, mx: v.x, my: v.y });
        if (mir && o.a2 != null && !isFullEllipse(e)) { const a1 = -e.a2, a2 = -e.a1; o.a1 = a1; o.a2 = a2; }
        break;
      }
      case 'spline':
        if (o.fit) o.fit = o.fit.map((p) => ap(p.x, p.y));
        if (o.ctrl) o.ctrl = o.ctrl.map((p) => ap(p.x, p.y));
        break;
      case 'text': {
        const c = ap(o.x, o.y), dv = M.applyVec(m, P(Math.cos(o.rot || 0), Math.sin(o.rot || 0)));
        let r = Math.atan2(dv.y, dv.x);
        if (mir) { r = normAng(r); if (r > Math.PI / 2 + 1e-9 && r <= 1.5 * Math.PI + 1e-9) r -= Math.PI; }
        Object.assign(o, { x: c.x, y: c.y, rot: r, h: o.h * sc });
        break;
      }
      case 'dim': {
        for (const [kx, ky] of [['x1', 'y1'], ['x2', 'y2'], ['lx', 'ly'], ['cx', 'cy']]) {
          if (o[kx] != null) { const q = ap(o[kx], o[ky]); o[kx] = q.x; o[ky] = q.y; }
        }
        if (o.r != null) o.r *= sc;
        if (o.kind === 'angular') { let a1 = mapAngle(e.cx, e.cy, 1, e.a1), a2 = mapAngle(e.cx, e.cy, 1, e.a2); if (mir) [a1, a2] = [a2, a1]; o.a1 = a1; o.a2 = a2; }
        if ((o.kind === 'horizontal' || o.kind === 'vertical') && Math.abs(Math.sin(rotA)) > 1e-9) o.kind = 'aligned';
        o.h = (o.h || 2.5) * sc; if (o.asz) o.asz *= sc;
        break;
      }
      case 'viewport': {
        const c = ap(o.x + o.w / 2, o.y + o.h / 2);
        o.w *= sc; o.h *= sc; o.scale *= sc; o.x = c.x - o.w / 2; o.y = c.y - o.h / 2;
        break;
      }
      case 'insert': {
        const c = ap(o.x, o.y);
        const base = [Math.cos(o.rot || 0) * (o.sx ?? 1), Math.sin(o.rot || 0) * (o.sx ?? 1), -Math.sin(o.rot || 0) * (o.sy ?? 1), Math.cos(o.rot || 0) * (o.sy ?? 1), 0, 0];
        const L = M.mul([m[0], m[1], m[2], m[3], 0, 0], base);
        const sx = Math.hypot(L[0], L[1]);
        Object.assign(o, { x: c.x, y: c.y, rot: Math.atan2(L[1], L[0]), sx, sy: (L[0] * L[3] - L[1] * L[2]) / sx });
        if (o.attribs) o.attribs = o.attribs.map((a) => transformEntity(a, m));
        break;
      }
    }
    return o;
  }

  // ---------- offset ----------
  function offsetEntity(e, d, side) {
    // side: a point indicating which side to offset towards
    switch (e.type) {
      case 'line': {
        const a = P(e.x1, e.y1), b = P(e.x2, e.y2), n = perp(norm(sub(b, a)));
        const s = dot(sub(side, a), n) >= 0 ? 1 : -1;
        const o = mul(n, d * s);
        return { ...e, x1: a.x + o.x, y1: a.y + o.y, x2: b.x + o.x, y2: b.y + o.y };
      }
      case 'circle': case 'arc': {
        const out = dist(side, P(e.cx, e.cy)) > e.r;
        const r = e.r + (out ? d : -d);
        return r > 1e-9 ? { ...e, r } : null;
      }
      case 'ellipse': {
        // approximate with a polyline offset
        const pts = ellipsePoints(e, 128), closed = isFullEllipse(e);
        if (closed) pts.pop();
        const base = { type: 'pline', layer: e.layer, color: e.color, ltype: e.ltype, lw: e.lw };
        return offsetEntity({ ...base, pts: pts.map((p) => ({ x: p.x, y: p.y, b: 0 })), closed }, d, side);
      }
      case 'pline': {
        const pts = e.pts, n = pts.length;
        if (n < 2) return null;
        // decide side using the closest segment
        const pr = prims(e);
        let best = pr[0], bd = Infinity;
        for (const q of pr) { const dd = distToPrim(side, q); if (dd < bd) { bd = dd; best = q; } }
        let sgn;
        if (best.k === 'L') sgn = cross(sub(best.b, best.a), sub(side, best.a)) >= 0 ? 1 : -1; // left = +1
        else { const outside = dist(side, best.c) > best.r; sgn = (best.rev ? !outside : outside) ? -1 : 1; }
        const off = d * sgn; // positive = to the left of travel direction
        const segs = [];
        const segCount = e.closed ? n : n - 1;
        for (let i = 0; i < segCount; i++) {
          const p = pts[i], q = pts[(i + 1) % n], b = p.b || 0;
          if (!b) {
            const nn = perp(norm(sub(q, p)));
            segs.push({ arc: false, a: add(p, mul(nn, off)), b: add(q, mul(nn, off)), bulge: 0 });
          } else {
            const ba = bulgeArc(p, q, b);
            const r2 = ba.r + (b > 0 ? -off : off);
            if (r2 <= 1e-9) return null;
            const kk = r2 / ba.r;
            segs.push({ arc: true, a: add(ba.c, mul(sub(p, ba.c), kk)), b: add(ba.c, mul(sub(q, ba.c), kk)), bulge: b });
          }
        }
        const outPts = [];
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          let start = s.a;
          const prevIdx = i === 0 ? (e.closed ? segs.length - 1 : -1) : i - 1;
          if (prevIdx >= 0) {
            const pv = segs[prevIdx];
            if (!pv.arc && !s.arc) {
              const x = segSeg(pv.a, pv.b, s.a, s.b, true);
              if (x.length) start = x[0].p;
            } else start = mid(pv.b, s.a);
          }
          outPts.push({ x: start.x, y: start.y, b: s.bulge });
        }
        if (!e.closed) { const last = segs[segs.length - 1]; outPts.push({ x: last.b.x, y: last.b.y, b: 0 }); }
        return { ...e, pts: outPts };
      }
    }
    return null;
  }

  // ---------- trim / extend ----------
  // Cut locations along an entity given cutting primitives; returns sorted params (entity-specific parameterisation).
  function cutParams(e, cutters, ctx) {
    const own = prims(e, ctx);
    const ts = [];
    own.forEach((pr, i) => {
      for (const c of cutters) for (const p of primInter(pr, c, false, false)) {
        const t = primParam(pr, p);
        ts.push(e.type === 'pline' ? i + Math.max(0, Math.min(1, t)) : t);
      }
    });
    return ts.sort((a, b) => a - b);
  }
  function splitBulge(b, f) { // bulge for fraction f of the sweep
    return Math.tan(Math.atan(b) * f);
  }
  // Extract a sub-polyline between global params t0 < t1 (segment index + fraction)
  function plineSlice(e, t0, t1) {
    const pts = e.pts, n = pts.length, segc = e.closed ? n : n - 1;
    const pr = prims(e);
    const pointAt = (t) => { const i = Math.max(0, Math.min(segc - 1, Math.floor(t))); return primAt(pr[i], pr[i].rev ? 1 - (t - i) : t - i); };
    const out = [];
    const i0 = Math.floor(t0), i1 = Math.min(segc - 1, Math.ceil(t1) - 1);
    for (let i = i0; i <= i1; i++) {
      const s = Math.max(t0, i), en = Math.min(t1, i + 1);
      if (en - s < 1e-12) continue;
      const p = pointAt(s), b = pts[i % n].b || 0;
      out.push({ x: p.x, y: p.y, b: b ? splitBulge(b, en - s) : 0 });
    }
    const q = pointAt(t1);
    out.push({ x: q.x, y: q.y, b: 0 });
    return out;
  }
  // param for a pline primitive must account for reversed arcs
  function plineParamOf(e, p) {
    const pr = prims(e);
    let best = 0, bd = Infinity;
    pr.forEach((q, i) => {
      const c = closestOnPrim(p, q), d = dist(c, p);
      if (d < bd) { bd = d; let t = primParam(q, c); if (q.rev) t = 1 - t; best = i + Math.max(0, Math.min(1, t)); }
    });
    return best;
  }
  function plineCuts(e, cutters) {
    const pr = prims(e), ts = [];
    pr.forEach((q, i) => {
      for (const c of cutters) for (const p of primInter(q, c, false, false)) {
        let t = primParam(q, p); if (q.rev) t = 1 - t;
        ts.push(i + Math.max(0, Math.min(1, t)));
      }
    });
    return ts.sort((a, b) => a - b);
  }

  /**
   * Trim entity `e` at the portion nearest `pick`, using cutter primitives.
   * Returns { remove: true } | { replace: [entities] } | null when nothing to trim.
   */
  function trimEntity(e, pick, cutters) {
    const tol = 1e-7;
    if (e.type === 'line') {
      const pr = { k: 'L', a: P(e.x1, e.y1), b: P(e.x2, e.y2) };
      const ts = cutParams(e, cutters).filter((t) => t > tol && t < 1 - tol);
      const tp = primParam(pr, closestOnSeg(pick, pr.a, pr.b).p);
      let lo = 0, hi = 1;
      for (const t of ts) { if (t < tp) lo = Math.max(lo, t); else { hi = Math.min(hi, t); } }
      if (lo === 0 && hi === 1) return { remove: true };
      const out = [];
      if (lo > tol) { const q = primAt(pr, lo); out.push({ ...e, x2: q.x, y2: q.y }); }
      if (hi < 1 - tol) { const q = primAt(pr, hi); out.push({ ...e, x1: q.x, y1: q.y }); }
      return { replace: out };
    }
    if (e.type === 'arc' || e.type === 'circle') {
      const full = e.type === 'circle';
      const pr = full ? { k: 'A', c: P(e.cx, e.cy), r: e.r, a1: 0, a2: TAU, full: true } : { k: 'A', c: P(e.cx, e.cy), r: e.r, a1: e.a1, a2: e.a2 };
      const angs = [];
      for (const c of cutters) for (const p of primInter(pr, c, false, false)) angs.push(ang(pr.c, p));
      const pa = ang(pr.c, pick);
      if (full) {
        const uniq = [...new Set(angs.map((a) => +normAng(a).toFixed(10)))].sort((a, b) => a - b);
        if (uniq.length < 2) return uniq.length ? null : { remove: true };
        // find the gap containing pa
        const rel = uniq.map((a) => normAng(a - pa)).sort((a, b) => a - b);
        const after = normAng(pa + rel[0]), before = normAng(pa + rel[rel.length - 1]);
        return { replace: [{ ...e, type: 'arc', a1: after, a2: before, cx: e.cx, cy: e.cy, r: e.r }] };
      }
      const S = sweep(e.a1, e.a2), tp = normAng(pa - e.a1);
      const ts = angs.map((a) => normAng(a - e.a1)).filter((t) => t > tol && t < S - tol).sort((a, b) => a - b);
      let lo = 0, hi = S;
      for (const t of ts) { if (t < tp) lo = Math.max(lo, t); else hi = Math.min(hi, t); }
      if (lo === 0 && hi === S) return { remove: true };
      const out = [];
      if (lo > tol) out.push({ ...e, a2: e.a1 + lo });
      if (hi < S - tol) out.push({ ...e, a1: e.a1 + hi });
      return { replace: out.map((x) => ({ ...x, a1: normAng(x.a1), a2: normAng(x.a2) })) };
    }
    if (e.type === 'pline') {
      const segc = e.closed ? e.pts.length : e.pts.length - 1;
      const T = segc;
      const raw = plineCuts(e, cutters);
      const ts = [...new Set(raw.map((t) => +t.toFixed(10)))].filter((t) => e.closed || (t > tol && t < T - tol));
      const tp = plineParamOf(e, pick);
      if (!e.closed) {
        let lo = 0, hi = T;
        for (const t of ts) { if (t < tp) lo = Math.max(lo, t); else hi = Math.min(hi, t); }
        if (lo === 0 && hi === T) return { remove: true };
        const out = [];
        if (lo > tol) out.push({ ...e, pts: plineSlice(e, 0, lo), closed: false });
        if (hi < T - tol) out.push({ ...e, pts: plineSlice(e, hi, T), closed: false });
        return { replace: out };
      }
      if (ts.length < 2) return ts.length ? null : { remove: true };
      // closed: keep from hi around to lo
      let lo = -Infinity, hi = Infinity;
      for (const t of ts) { if (t < tp) lo = Math.max(lo, t); else hi = Math.min(hi, t); }
      if (lo === -Infinity) lo = ts[ts.length - 1] - T;
      if (hi === Infinity) hi = ts[0] + T;
      // remaining part: hi -> lo + T, may wrap around
      let ks = hi, ke = lo + T;
      while (ks >= T - 1e-12) { ks -= T; ke -= T; }
      let pts;
      if (ke <= T + 1e-12) pts = plineSlice(e, ks, Math.min(ke, T));
      else {
        const a = plineSlice(e, ks, T), b = plineSlice(e, 0, ke - T);
        a.pop(); pts = a.concat(b);
      }
      return { replace: [{ ...e, closed: false, pts }] };
    }
    return null;
  }

  /** Extend the end of a line/arc/open pline nearest `pick` to the closest boundary. */
  function extendEntity(e, pick, bounds) {
    if (e.type === 'line') {
      const a = P(e.x1, e.y1), b = P(e.x2, e.y2);
      const fromEnd = dist(pick, b) < dist(pick, a);
      const pr = { k: 'L', a, b };
      let best = null;
      for (const c of bounds) for (const p of primInter(pr, c, true, false)) {
        const t = primParam(pr, p);
        if (fromEnd ? t > 1 + 1e-9 : t < -1e-9) { const d = fromEnd ? t - 1 : -t; if (!best || d < best.d) best = { d, p }; }
      }
      if (!best) return null;
      return fromEnd ? { ...e, x2: best.p.x, y2: best.p.y } : { ...e, x1: best.p.x, y1: best.p.y };
    }
    if (e.type === 'arc') {
      const c = P(e.cx, e.cy);
      const fromEnd = dist(pick, polar(c, e.a2, e.r)) < dist(pick, polar(c, e.a1, e.r));
      const full = { k: 'A', c, r: e.r, a1: 0, a2: TAU, full: true };
      let best = null;
      for (const b of bounds) for (const p of primInter(full, b, false, false)) {
        const a = ang(c, p);
        if (angInArc(a, e.a1, e.a2, 1e-9)) continue;
        const d = fromEnd ? normAng(a - e.a2) : normAng(e.a1 - a);
        if (!best || d < best.d) best = { d, a };
      }
      if (!best) return null;
      return fromEnd ? { ...e, a2: best.a } : { ...e, a1: best.a };
    }
    if (e.type === 'pline' && !e.closed && e.pts.length >= 2) {
      const n = e.pts.length, fromEnd = dist(pick, e.pts[n - 1]) < dist(pick, e.pts[0]);
      const i = fromEnd ? n - 2 : 0;
      if (e.pts[i].b) return null;
      const seg = { type: 'line', x1: e.pts[i].x, y1: e.pts[i].y, x2: e.pts[i + 1].x, y2: e.pts[i + 1].y };
      const r = extendEntity(seg, fromEnd ? e.pts[n - 1] : e.pts[0], bounds);
      if (!r) return null;
      const pts = e.pts.map((p) => ({ ...p }));
      if (fromEnd) Object.assign(pts[n - 1], { x: r.x2, y: r.y2 }); else Object.assign(pts[0], { x: r.x1, y: r.y1 });
      return { ...e, pts };
    }
    return null;
  }

  /** Fillet two lines with radius r. Picks indicate the portions to keep. */
  function filletLines(l1, pick1, l2, pick2, r) {
    const a1 = P(l1.x1, l1.y1), b1 = P(l1.x2, l1.y2), a2 = P(l2.x1, l2.y1), b2 = P(l2.x2, l2.y2);
    const x = segSeg(a1, b1, a2, b2, true);
    if (!x.length) return null;
    const X = x[0].p;
    // keep the far endpoint on the picked side
    const keepFar = (a, b, pick) => {
      const d = norm(sub(b, a)), tp = dot(sub(pick, X), d);
      const ta = dot(sub(a, X), d), tb = dot(sub(b, X), d);
      // choose the endpoint on the same side of X as the pick
      if (tp >= 0) return ta > tb ? a : b;
      return ta < tb ? a : b;
    };
    const f1 = keepFar(a1, b1, pick1), f2 = keepFar(a2, b2, pick2);
    if (r <= 1e-12) {
      return { l1: { ...l1, x1: f1.x, y1: f1.y, x2: X.x, y2: X.y }, l2: { ...l2, x1: f2.x, y1: f2.y, x2: X.x, y2: X.y }, arc: null };
    }
    const u1 = norm(sub(f1, X)), u2 = norm(sub(f2, X));
    const th = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
    if (th < 1e-9 || Math.PI - th < 1e-9) return null;
    const t = r / Math.tan(th / 2);
    const t1 = add(X, mul(u1, t)), t2 = add(X, mul(u2, t));
    const bis = norm(add(u1, u2)), c = add(X, mul(bis, r / Math.sin(th / 2)));
    let s1 = ang(c, t1), s2 = ang(c, t2);
    if (sweep(s1, s2) > Math.PI) [s1, s2] = [s2, s1];
    return {
      l1: { ...l1, x1: f1.x, y1: f1.y, x2: t1.x, y2: t1.y },
      l2: { ...l2, x1: f2.x, y1: f2.y, x2: t2.x, y2: t2.y },
      arc: { type: 'arc', cx: c.x, cy: c.y, r, a1: s1, a2: s2 },
    };
  }
  function chamferLines(l1, pick1, l2, pick2, d1, d2) {
    const f = filletLines(l1, pick1, l2, pick2, 0);
    if (!f) return null;
    const X = P(f.l1.x2, f.l1.y2);
    const u1 = norm(sub(P(f.l1.x1, f.l1.y1), X)), u2 = norm(sub(P(f.l2.x1, f.l2.y1), X));
    const c1 = add(X, mul(u1, d1)), c2 = add(X, mul(u2, d2));
    return { l1: { ...f.l1, x2: c1.x, y2: c1.y }, l2: { ...f.l2, x2: c2.x, y2: c2.y }, line: { type: 'line', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y } };
  }

  // ---------- coordinate parsing ----------
  function parsePointInput(str, last) {
    const s = str.trim().replace(/\s+/g, '');
    let m = s.match(/^(@?)(-?\d*\.?\d+(?:e-?\d+)?)<(-?\d*\.?\d+(?:e-?\d+)?)$/i);
    if (m) {
      const d = +m[2], a = rad(+m[3]), base = m[1] ? (last || P(0, 0)) : P(0, 0);
      return polar(base, a, d);
    }
    m = s.match(/^(@?)(-?\d*\.?\d+(?:e-?\d+)?),(-?\d*\.?\d+(?:e-?\d+)?)(?:,-?\d*\.?\d+)?$/i);
    if (m) {
      const x = +m[2], y = +m[3];
      return m[1] ? add(last || P(0, 0), P(x, y)) : P(x, y);
    }
    if (s === '@') return last ? P(last.x, last.y) : P(0, 0);
    return null;
  }

  const api = {
    TAU, EPS, P, add, sub, mul, dot, cross, len, dist, norm, perp, lerp, mid, ang, polar, same, normAng, sweep, angInArc, rad, deg,
    M, ACI, aciFromRgb, bulgeArc, bulgeFromSweep, catmull, nurbs, splinePoints, ellipsePoint, ellipsePoints, isFullEllipse,
    TEXT, textBox, textCorners, fmtNum, dimGeometry, PATTERNS, hatchLines, hatchSegments, isAttDef,
    prims, primsOf, flatPrims, transformPrim, arcPoints, primBox, bbox, closestOnSeg, closestOnPrim, distToPrim, pointInPoly,
    segSeg, lineCircle, circleCircle, primInter, primParam, primAt, primLength, plinePrims, polyPrims,
    plineLength, polyArea, plineArea, transformEntity, offsetEntity, trimEntity, extendEntity, filletLines, chamferLines,
    plineSlice, plineParamOf, parsePointInput,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.G = api;
})(typeof window !== 'undefined' ? window : globalThis);
