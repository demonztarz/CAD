// Pure 2D geometry helpers. World coordinates are Y-up; angles are radians, CCW from +X.
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const EPS = 1e-9;

  const G = {};
  G.TAU = TAU;
  G.EPS = EPS;

  G.pt = (x, y) => ({ x, y });
  G.dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  G.angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  G.polar = (p, ang, d) => ({ x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d });
  G.mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  G.add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  G.sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  G.eq = (a, b, tol = 1e-7) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;

  G.normAng = (a) => {
    a %= TAU;
    if (a < 0) a += TAU;
    return a;
  };
  G.deg = (r) => (r * 180) / Math.PI;
  G.rad = (d) => (d * Math.PI) / 180;

  // CCW sweep from a1 to a2, in (0, TAU].
  G.sweep = (a1, a2) => {
    const s = G.normAng(a2 - a1);
    return s < EPS ? TAU : s;
  };

  // Is angle a on the CCW arc running from a1 to a2?
  G.angleOnArc = (a, a1, a2, tol = 1e-9) =>
    G.normAng(a - a1) <= G.sweep(a1, a2) + tol || G.normAng(a - a1) > TAU - tol;

  // Parameter t (0..1) of the projection of p on segment ab, unclamped.
  G.projectT = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    if (L2 < EPS) return 0;
    return ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  };
  G.lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  G.distToSeg = (p, a, b) => {
    const t = Math.max(0, Math.min(1, G.projectT(p, a, b)));
    return G.dist(p, G.lerp(a, b, t));
  };

  G.distToArc = (p, c, r, a1, a2) => {
    const ang = G.angle(c, p);
    if (G.angleOnArc(ang, a1, a2)) return Math.abs(G.dist(p, c) - r);
    return Math.min(G.dist(p, G.polar(c, a1, r)), G.dist(p, G.polar(c, a2, r)));
  };

  // Intersection of infinite lines ab and cd.
  G.lineLine = (a, b, c, d) => {
    const r = G.sub(b, a), s = G.sub(d, c);
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < EPS) return null;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    return { x: a.x + r.x * t, y: a.y + r.y * t, t, u };
  };

  G.segSeg = (a, b, c, d) => {
    const p = G.lineLine(a, b, c, d);
    if (!p) return [];
    const tol = 1e-9;
    if (p.t < -tol || p.t > 1 + tol || p.u < -tol || p.u > 1 + tol) return [];
    return [{ x: p.x, y: p.y }];
  };

  // Intersections of the infinite line ab with a circle; returns points with param t.
  G.lineCircle = (a, b, c, r) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const fx = a.x - c.x, fy = a.y - c.y;
    const A = dx * dx + dy * dy;
    if (A < EPS) return [];
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - r * r;
    let disc = B * B - 4 * A * C;
    if (disc < -EPS * A) return [];
    disc = Math.max(0, disc);
    const sq = Math.sqrt(disc);
    const ts = sq < 1e-12 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
    return ts.map((t) => ({ x: a.x + dx * t, y: a.y + dy * t, t }));
  };

  G.circleCircle = (c1, r1, c2, r2) => {
    const d = G.dist(c1, c2);
    if (d < EPS || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const m = G.lerp(c1, c2, a / d);
    const ox = (-(c2.y - c1.y) * h) / d, oy = ((c2.x - c1.x) * h) / d;
    if (h < 1e-12) return [m];
    return [{ x: m.x + ox, y: m.y + oy }, { x: m.x - ox, y: m.y - oy }];
  };

  G.circleFrom3 = (p1, p2, p3) => {
    const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < EPS) return null;
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const x = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const y = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    return { x, y, r: Math.hypot(ax - x, ay - y) };
  };

  // Arc through three points: returns {cx, cy, r, a1, a2} (CCW from a1 to a2) or null.
  G.arcFrom3 = (p1, p2, p3) => {
    const c = G.circleFrom3(p1, p2, p3);
    if (!c) return null;
    const s = G.angle(c, p1), m = G.angle(c, p2), e = G.angle(c, p3);
    const ccw = G.normAng(m - s) < G.normAng(e - s);
    return ccw
      ? { cx: c.x, cy: c.y, r: c.r, a1: s, a2: e }
      : { cx: c.x, cy: c.y, r: c.r, a1: e, a2: s };
  };

  // --- Transforms: functions mapping a point to a point, with a `mirror` flag. ---
  G.translate = (dx, dy) => {
    const f = (p) => ({ x: p.x + dx, y: p.y + dy });
    f.mirror = false;
    return f;
  };
  G.rotate = (base, ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const f = (p) => {
      const x = p.x - base.x, y = p.y - base.y;
      return { x: base.x + x * c - y * s, y: base.y + x * s + y * c };
    };
    f.mirror = false;
    return f;
  };
  G.scale = (base, k) => {
    const f = (p) => ({ x: base.x + (p.x - base.x) * k, y: base.y + (p.y - base.y) * k });
    f.mirror = k < 0;
    return f;
  };
  G.mirrorLine = (a, b) => {
    const f = (p) => {
      const t = G.projectT(p, a, b);
      const q = G.lerp(a, b, t);
      return { x: 2 * q.x - p.x, y: 2 * q.y - p.y };
    };
    f.mirror = true;
    return f;
  };

  // Axis-aligned box helpers.
  G.emptyBox = () => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  G.boxAdd = (bx, p) => {
    bx.minX = Math.min(bx.minX, p.x);
    bx.minY = Math.min(bx.minY, p.y);
    bx.maxX = Math.max(bx.maxX, p.x);
    bx.maxY = Math.max(bx.maxY, p.y);
    return bx;
  };
  G.boxUnion = (a, b) => ({
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  });
  G.boxInside = (inner, outer) =>
    inner.minX >= outer.minX && inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY && inner.maxY <= outer.maxY;
  G.boxOverlap = (a, b) =>
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
  G.ptInBox = (p, b) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  root.CAD = root.CAD || {};
  root.CAD.G = G;
})(typeof globalThis !== 'undefined' ? globalThis : this);
