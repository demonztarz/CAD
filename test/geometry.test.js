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
  assert.strictEqual(txt.text, '30', 'trailing zeros hidden by default');
  const kept = G.dimGeometry({ type: 'dim', kind: 'horizontal', x1: 0, y1: 0, x2: 30, y2: 10, lx: 15, ly: 20, h: 2.5 }, 2, false);
  assert.strictEqual(kept.find((g) => g.type === 'text').text, '30.00');
});

test('break line: zigzag centred on the line, kept inside it, with extension', () => {
  const pts = G.breaklinePts({ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 5 }, 12, 0);
  assert.strictEqual(pts.length, 6);
  nearP(pts[0], 0, 0); nearP(pts[1], 34, 0); nearP(pts[2], 38, 6); nearP(pts[3], 42, -6); nearP(pts[4], 46, 0); nearP(pts[5], 80, 0);
  const edge = G.breaklinePts({ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 79, y: 0 }, 12, 0);
  nearP(edge[4], 80, 0); // symbol pushed back inside the line
  const ext = G.breaklinePts({ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 25 }, 10, 2);
  nearP(ext[0], 0, -2); nearP(ext[5], 0, 52); nearP(ext[2], -5, 25 - 10 / 6);
  assert.strictEqual(G.breaklinePts({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }, 5), null);
});

test('narrow dimensions move arrows and then text outside the extension lines', () => {
  // h = arrow size = 2.5; default text width is 0.72 h per character ("70" is 3.6 wide)
  const dim = (x2, extra) => G.dimGeometry({ type: 'dim', kind: 'horizontal', x1: 0, y1: 0, x2, y2: 0, lx: x2 / 2, ly: 10, h: 2.5, arrow: 'arrow', ...extra }, 0);
  const parts = (g) => ({ text: g.find((x) => x.type === 'text'), tips: g.filter((x) => x.type === 'solid').map((x) => x.pts[0].x), backs: g.filter((x) => x.type === 'solid').map((x) => x.pts[1].x) });
  // wide: all inside, arrow bodies between the extension lines
  let r = parts(dim(70));
  near(r.text.x, 35); assert.ok(r.backs[0] > 0 && r.backs[1] < 70);
  // 6 wide: text fits, arrows do not (they need 2.5 arrow sizes) -> arrows outside pointing in
  r = parts(dim(6));
  near(r.text.x, 3); assert.ok(r.backs[0] < 0 && r.backs[1] > 6, 'arrows outside');
  // 8 wide: both fit; the text is above the line so it does not compete with the arrows
  r = parts(dim(8));
  near(r.text.x, 4); assert.ok(r.backs[0] > 0 && r.backs[1] < 8, 'arrows inside');
  // 7 wide with long text: arrows fit, text does not -> text right of the second extension line
  r = parts(dim(7, { text: 'LONGTEXT' }));
  assert.ok(r.backs[0] > 0 && r.backs[1] < 7, 'arrows inside');
  assert.ok(r.text.x - 2.5 * 0.72 * 8 / 2 > 7, 'text clear of the extension line');
  // 3 wide: nothing fits -> both outside; text beyond the arrow tail
  const g = dim(3, { text: '70' });
  r = parts(g);
  assert.ok(r.backs[0] < 0 && r.backs[1] > 3);
  assert.ok(r.text.x - 3.6 / 2 > 3 + 2 * 2.5, 'text past the arrow tail');
  const under = g.filter((x) => x.type === 'line' && x.y1 === x.y2 && x.y1 === 10).some((x) => Math.max(x.x1, x.x2) >= r.text.x + 3.6 / 2);
  assert.ok(under, 'dimension line extends under the text');
  // dimension line placed left of the first extension line -> text goes left
  r = parts(G.dimGeometry({ type: 'dim', kind: 'horizontal', x1: 0, y1: 0, x2: 3, y2: 0, lx: -4, ly: 10, h: 2.5, text: '70' }, 0));
  assert.strictEqual(g.filter((x) => x.type === 'line' && x.y1 === 10 && Math.min(x.x1, x.x2) >= 3).length, 1, 'no duplicate tail under the text');
  assert.ok(r.text.x + 3.6 / 2 < 0, 'text on the left');
});

test('arrowheads: auto uses ticks only when arrows do not fit; tick and arrow settings', () => {
  const base = { type: 'dim', kind: 'horizontal', x1: 0, y1: 0, y2: 0, ly: 10, h: 2.5 }; // arrows need 2.5 x 2.5 = 6.25
  const g = (x2, extra, opts) => G.dimGeometry({ ...base, x2, lx: x2 / 2, ...extra }, { prec: 0, ...opts });
  const solids = (geo) => geo.filter((x) => x.type === 'solid').length;
  const ticks = (geo) => geo.filter((x) => x.type === 'line' && Math.abs(Math.abs(x.x2 - x.x1) - Math.abs(x.y2 - x.y1)) < 1e-9 && x.x2 !== x.x1);
  assert.strictEqual(solids(g(20)), 2); assert.strictEqual(ticks(g(20)).length, 0);           // auto, room: arrows
  assert.strictEqual(solids(g(5)), 0); assert.strictEqual(ticks(g(5)).length, 2);             // auto, narrow: ticks
  const t = ticks(g(5));
  near((t[0].x1 + t[0].x2) / 2, 0); near((t[0].y1 + t[0].y2) / 2, 10);                         // centred on the extension line
  assert.strictEqual(solids(g(20, {}, { arrow: 'tick' })), 0);                                   // drawing default: ticks
  assert.strictEqual(solids(g(5, {}, { arrow: 'arrow' })), 2);                                   // drawing default: arrows
  assert.ok(g(5, {}, { arrow: 'arrow' }).filter((x) => x.type === 'solid').every((x) => x.pts[1].x < 0 || x.pts[1].x > 5)); // flipped outside
  assert.strictEqual(solids(g(20, { arrow: 'tick' }, { arrow: 'arrow' })), 0);                   // per dimension wins
  assert.strictEqual(solids(G.dimGeometry({ ...base, x2: 5, lx: 2.5 }, 0)), 0);                  // old (e, prec) calls: auto
});

test('dimension text position: left / right / moved / angle (DIMTEDIT)', () => {
  const base = { type: 'dim', kind: 'horizontal', x1: 0, y1: 0, x2: 40, y2: 0, lx: 20, ly: 10, h: 2.5, text: '70' }; // "70" is 3.6 wide
  const textOf = (extra) => G.dimGeometry({ ...base, ...extra }, 0).find((g) => g.type === 'text');
  near(textOf({}).x, 20);
  near(textOf({ tpos: 'left' }).x, 0.625 + 1.8);   // inside, at the left end
  near(textOf({ tpos: 'right' }).x, 40 - 0.625 - 1.8);
  near(textOf({ tpos: 'center' }).x, 20);
  // points picked right to left: "left" still means the left end on screen
  near(G.dimGeometry({ ...base, x1: 40, x2: 0, tpos: 'left' }, 0).find((g) => g.type === 'text').x, 2.425);
  // too narrow for the text: left/right choose the outside side
  const narrow = { ...base, x2: 3, lx: 1.5 };
  assert.ok(G.dimGeometry({ ...narrow, tpos: 'left' }, 0).find((g) => g.type === 'text').x < 0);
  assert.ok(G.dimGeometry({ ...narrow, tpos: 'right' }, 0).find((g) => g.type === 'text').x > 3);
  // center is forced: stays centred even without room (auto would move it outside)
  assert.ok(G.dimGeometry(narrow, 0).find((g) => g.type === 'text').x > 3);
  const forced = G.dimGeometry({ ...narrow, tpos: 'center' }, 0);
  near(forced.find((g) => g.type === 'text').x, 1.5);
  assert.ok(!forced.some((x) => x.type === 'line' && x.y1 === 10 && x.y2 === 10 && Math.max(x.x1, x.x2) > 3 + 2 * 2.5), 'no extension under outside text');
  // moved past the second extension line: the dimension line reaches under the text
  const g = G.dimGeometry({ ...base, tpos: 55 }, 0);
  near(g.find((x) => x.type === 'text').x, 55);
  assert.ok(g.some((x) => x.type === 'line' && x.y1 === 10 && x.y2 === 10 && Math.min(x.x1, x.x2) === 40 && Math.max(x.x1, x.x2) >= 55 + 1.8));
  // rotated text
  near(textOf({ tang: Math.PI / 4 }).rot, Math.PI / 4);
  // frame helper used by DIMTEDIT
  const f = G.dimFrame(base);
  nearP(f.d1, 0, 10); nearP(f.d2, 40, 10); near(f.L, 40);
});

test('reference image: frame, pixel matrix and transforms', () => {
  const img = { type: 'image', x: 10, y: 20, ux: 40, uy: 0, vx: 0, vy: 30, pw: 400, ph: 300, src: 'data:image/png;base64,AAAA', fade: 50 };
  const c = G.imageCorners(img);
  nearP(c[0], 10, 20); nearP(c[2], 50, 50);
  const b = G.bbox(img); assert.deepStrictEqual(b.map((v) => +v.toFixed(9)), [10, 20, 50, 50]);
  // pixel (0,0) is the top-left corner, (pw,ph) the bottom-right
  const m = G.imageMatrix(img), ap = (x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  nearP(ap(0, 0), 10, 50); nearP(ap(400, 300), 50, 20);
  // rotate 90 degrees about the corner; the picture data is shared, not copied
  const r = G.transformEntity(img, G.M.rotate(Math.PI / 2, { x: 10, y: 20 }));
  nearP({ x: r.ux, y: r.uy }, 0, 40); nearP({ x: r.vx, y: r.vy }, -30, 0);
  assert.strictEqual(r.src, img.src); assert.strictEqual(r.fade, 50);
  const s2 = G.transformEntity(img, G.M.scale(2, 2, { x: 10, y: 20 }));
  near(s2.ux, 80); near(s2.vy, 60); near(s2.x, 10);
});

test('dimension text hides trailing zeros only', () => {
  assert.strictEqual(G.fmtDim(50, 2, true), '50');
  assert.strictEqual(G.fmtDim(12.5, 2, true), '12.5');
  assert.strictEqual(G.fmtDim(12.25, 2, true), '12.25');
  assert.strictEqual(G.fmtDim(100, 0, true), '100', 'zeros before the decimal point stay');
  assert.strictEqual(G.fmtDim(1205.004, 2, true), '1205');
  assert.strictEqual(G.fmtDim(-0.001, 2, true), '0');
  assert.strictEqual(G.fmtDim(12.5, 2, false), '12.50');
  const r = G.dimGeometry({ type: 'dim', kind: 'radius', cx: 0, cy: 0, r: 7.5, lx: 20, ly: 0, h: 2.5 }, 2).find((g) => g.type === 'text');
  assert.strictEqual(r.text, 'R7.5');
  const a = G.dimGeometry({ type: 'dim', kind: 'angular', cx: 0, cy: 0, a1: 0, a2: Math.PI / 2, lx: 10, ly: 10, h: 2.5 }, 4).find((g) => g.type === 'text');
  assert.strictEqual(a.text, '90°');
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
