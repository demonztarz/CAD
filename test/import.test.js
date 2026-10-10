// DWG/DXF import tests. Run with: node test/import.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const G = require('../src/geom.js');
const DXF = require('../src/dxf.js');
const { loadDwg } = require('../dwgload.js');

(async () => {
  const dir = path.join(__dirname, 'fixtures');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.dwg')).sort();
  assert.ok(files.length > 0, 'no DWG fixtures');
  for (const f of files) {
    const { doc, stats } = await loadDwg(fs.readFileSync(path.join(dir, f)));
    const types = {};
    for (const e of doc.entities) types[e.type] = (types[e.type] || 0) + 1;
    for (const t of ['line', 'pline', 'arc', 'text', 'insert', 'hatch', 'ellipse', 'spline']) assert.ok(types[t] > 0, `${f}: no ${t} entities`);
    // every block reference must resolve, and every entity must have a finite bounding box
    const ctx = { blocks: doc.blocks };
    for (const e of doc.entities) {
      if (e.type === 'insert') assert.ok(doc.blocks[e.name], `${f}: missing block ${e.name}`);
      if (e.type !== 'xline') assert.ok(G.bbox(e, ctx).every(Number.isFinite), `${f}: bad bbox for ${e.type}`);
    }
    // round-trip through DXF
    const dxf = DXF.writeDxf(doc);
    const back = DXF.readDxf(dxf).doc;
    assert.ok(back.entities.length >= doc.entities.filter((e) => e.type !== 'xline').length, `${f}: DXF round-trip lost entities`);
    assert.deepStrictEqual(Object.keys(back.blocks).sort(), Object.keys(doc.blocks).sort(), `${f}: DXF round-trip lost blocks`);
    console.log(`ok ${f}: ${doc.entities.length} entities, ${Object.keys(doc.blocks).length} blocks, ${doc.layers.length} layers, skipped ${JSON.stringify(stats.skipped)}`);
  }
})().catch((e) => { console.error('FAIL', e); process.exitCode = 1; });
