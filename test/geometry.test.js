// Geometry kernel tests. Run with: node test/geometry.test.js
const assert = require('assert');
const G = require('../src/geom.js');

let passed = 0;
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
const nearP = (p, x, y, tol = 1e-6) => { near(p.x, x, tol); near(p.y, y, tol); };
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }
}

test('coordinate input: absolute, relative, polar', () => {
  nearP(G.parsePointInput('10,20'), 10, 20);
  nearP(G.parsePointInput('@5,-5', { x: 10, y: 20 }), 15, 15);
  nearP(G.parsePointInput('@10<90', { x: 1, y: 1 }), 1, 11);
  nearP(G.parsePointInput('10<180'), -10, 0);
  assert.strictEqual(G.parsePointInput('abc'), null);
});

test('bulge 1 is a CCW semicircle centred on the chord midpoint', () => {
  const a = G.bulgeArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 1);
  nearP(a.c, 5, 0); near(a.r, 5); assert.ok(a.ccw);
  // CCW from (0,0) to (10,0) around (5,0) passes below the chord: angles pi -> 0 going through 3pi/2
  assert.ok(G.angInArc(1.5 * Math.PI, a.a1, a.a2));
});

test('line/line and line/circle intersections', () => {
  const l1 = { k: 'L', a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }, l2 = { k: 'L', a: { x: 0, y: 10 }, b: { x: 10, y: 0 } };
  nearP(G.primInter(l1, l2)[0], 5, 5);
  const c = { k: 'A', c: { x: 0, y: 0 }, r: 5, a1: 0, a2: G.TAU, full: true };
  const h = { k: 'L', a: { x: -10, y: 0 }, b: { x: 10, y: 0 } };
  const xs = G.primInter(h, c).map((p) => p.x).sort((a, b) => a - b);
  near(xs[0], -5); near(xs[1], 5);
});

test('trim a line between two crossing lines removes only the middle', () => {
  const line = { type: 'line', x1: 0, y1: 0, x2: 30, y2: 0 };
  const cutters = [10, 20].map((x) => ({ k: 'L', a: { x, y: -5 }, b: { x, y: 5 } }));
  const r = G.trimEntity(line, { x: 15, y: 0.1 }, cutters);
  assert.strictEqual(r.replace.length, 2);
  near(r.replace[0].x2, 10); near(r.replace[1].x1, 20);
});

test('trim a circle with a line through it leaves an arc', () => {
  const circ = { type: 'circle', cx: 0, cy: 0, r: 5 };
  const r = G.trimEntity(circ, { x: 0, y: 5 }, [{ k: 'L', a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }]);
  const arc = r.replace[0];
  assert.strictEqual(arc.type, 'arc');
  near(G.sweep(arc.a1, arc.a2), Math.PI); // the lower half remains
  assert.ok(G.angInArc(1.5 * Math.PI, arc.a1, arc.a2));
});

test('trim one side off a closed rectangle polyline', () => {
  const rect = { type: 'pline', closed: true, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
  const cut = { k: 'L', a: { x: 5, y: -5 }, b: { x: 5, y: 15 } };
  const r = G.trimEntity(rect, { x: 0, y: 5 }, [cut]); // remove the left part
  const pl = r.replace[0];
  assert.strictEqual(pl.closed, false);
  assert.ok(pl.pts.every((p) => p.x >= 5 - 1e-9), JSON.stringify(pl.pts));
  near(G.plineLength(pl), 5 + 10 + 5);
});

test('extend a line to a boundary', () => {
  const l = { type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 };
  const r = G.extendEntity(l, { x: 4, y: 0 }, [{ k: 'L', a: { x: 12, y: -5 }, b: { x: 12, y: 5 } }]);
  near(r.x2, 12);
});

test('fillet two perpendicular lines', () => {
  const a = { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, b = { type: 'line', x1: 0, y1: 0, x2: 0, y2: 10 };
  const f = G.filletLines(a, { x: 8, y: 0 }, b, { x: 0, y: 8 }, 2);
  nearP({ x: f.arc.cx, y: f.arc.cy }, 2, 2);
  near(f.l1.x2, 2); near(f.l2.y2, 2);
  near(G.sweep(f.arc.a1, f.arc.a2), Math.PI / 2);
});

test('offset a closed square outwards', () => {
  const sq = { type: 'pline', closed: true, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
  const o = G.offsetEntity(sq, 1, { x: 20, y: 5 });
  const xs = o.pts.map((p) => p.x), ys = o.pts.map((p) => p.y);
  near(Math.min(...xs), -1); near(Math.max(...xs), 11); near(Math.min(...ys), -1); near(Math.max(...ys), 11);
});

test('rotate, mirror and scale entities', () => {
  const l = G.transformEntity({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, G.M.rotate(Math.PI / 2));
  nearP({ x: l.x2, y: l.y2 }, 0, 10);
  const arc = { type: 'arc', cx: 0, cy: 0, r: 1, a1: 0, a2: Math.PI / 2 };
  const m = G.transformEntity(arc, G.M.mirror({ x: 0, y: 0 }, { x: 0, y: 1 })); // mirror across Y axis
  near(G.normAng(m.a1), Math.PI / 2); near(G.normAng(m.a2), Math.PI);
  const c = G.transformEntity({ type: 'circle', cx: 1, cy: 1, r: 2 }, G.M.scale(3));
  near(c.r, 6); nearP({ x: c.cx, y: c.cy }, 3, 3);
});

test('insert transform decomposes rotation and scale', () => {
  const ins = { type: 'insert', name: 'B', x: 0, y: 0, sx: 2, sy: 2, rot: 0 };
  const r = G.transformEntity(ins, G.M.rotate(Math.PI / 2, { x: 0, y: 0 }));
  near(r.rot, Math.PI / 2); near(r.sx, 2); near(r.sy, 2);
  const mi = G.transformEntity(ins, G.M.mirror({ x: 0, y: 0 }, { x: 1, y: 0 }));
  near(mi.sy, -2);
});

test('block reference bounding box uses block geometry', () => {
  const blocks = { SQ: { base: { x: 0, y: 0 }, entities: [{ type: 'pline', closed: true, pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }] } };
  const bb = G.bbox({ type: 'insert', name: 'SQ', x: 10, y: 10, sx: 5, sy: 5, rot: 0 }, { blocks });
  near(bb[0], 10); near(bb[1], 10); near(bb[2], 15); near(bb[3], 15);
});

test('polyline area including a bulge', () => {
  // half-disc of radius 5 on top of a 10-wide chord: area = pi*25/2
  const pl = { type: 'pline', closed: true, pts: [{ x: 10, y: 0, b: 1 }, { x: 0, y: 0, b: 0 }] };
  near(G.plineArea(pl), Math.PI * 25 / 2, 1e-6);
});

test('linear dimension measures horizontal distance', () => {
  const geo = G.dimGeometry({ type: 'dim', kind: 'horizontal', x1: 0, y1: 0, x2: 30, y2: 10, lx: 15, ly: 20, h: 2.5 }, 2);
  const txt = geo.find((g) => g.type === 'text');
  assert.strictEqual(txt.text, '30.00');
});

test('NURBS curve passes through clamped end points', () => {
  const pts = G.nurbs([{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }], null, 2);
  nearP(pts[0], 0, 0); nearP(pts[pts.length - 1], 10, 0, 1e-6);
});

test('ACI palette matches known reference colours', () => {
  assert.strictEqual(G.ACI[1], '#ff0000');
  assert.strictEqual(G.ACI[11], '#ff8080');
  assert.strictEqual(G.ACI[12], '#cc0000');
  assert.strictEqual(G.ACI[250], '#333333');
});

console.log(`${passed} geometry tests passed${process.exitCode ? ' (with failures)' : ''}`);
