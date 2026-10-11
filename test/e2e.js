// End-to-end test: launches the real Electron app, opens a DWG, draws and edits through the UI.
// Run with: npm run test:e2e   (on Linux CI wrap it in xvfb-run)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright-core');

const root = path.join(__dirname, '..');
(async () => {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, '--no-sandbox', path.join(__dirname, 'fixtures', 'example_2018.dwg')],
    cwd: root,
  });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.stack || String(e)));
  const step = async (name, fn) => { await fn(); console.log('ok', name); };
  const submit = async (...vals) => { for (const v of vals) { await win.evaluate((x) => App.submit(x), v); await win.waitForTimeout(25); } };
  const toPage = (x, y) => win.evaluate(([x, y]) => { const r = document.getElementById('ov').getBoundingClientRect(); const s = App.w2s({ x, y }); return { x: r.left + s.x, y: r.top + s.y }; }, [x, y]);
  const click = async (x, y) => { const p = await toPage(x, y); await win.mouse.move(p.x, p.y, { steps: 2 }); await win.mouse.click(p.x, p.y); await win.waitForTimeout(30); };

  await win.waitForFunction(() => window.App && App.file && App.file.kind === 'dwg', null, { timeout: 30000 });
  await step('opens a DWG passed on the command line', async () => {
    const st = await win.evaluate(() => ({ n: App.doc.entities.length, blocks: Object.keys(App.doc.blocks).length }));
    assert.ok(st.n > 40 && st.blocks > 5, JSON.stringify(st));
  });
  await step('new drawing', async () => {
    await win.evaluate(() => { App.file.dirty = false; return App.fileNew(); });
    await win.evaluate(() => { App.view = { cx: 50, cy: 20, scale: 6 }; App.render(); });
    assert.strictEqual(await win.evaluate(() => App.doc.entities.length), 0);
  });
  await step('draw lines and a circle from the command line', async () => {
    await submit('LINE', '0,0', '100,0', '');
    await submit('LINE', '40,-10', '40,10', '');
    await submit('LINE', '60,-10', '60,10', '');
    await submit('CIRCLE', '50,30', '10');
    assert.strictEqual(await win.evaluate(() => App.doc.entities.length), 4);
  });
  await step('trim with a mouse pick', async () => {
    await submit('TRIM');
    await win.waitForFunction(() => App.input && App.input.kind === 'entity');
    // centre the pick point so window size and the floating command line cannot hide it
    await win.evaluate(() => { App.view = { cx: 50, cy: 0, scale: 6 }; App.render(); });
    await win.waitForTimeout(50);
    const target = await toPage(50, 0);
    const before = await win.evaluate(([x, y]) => {
      const r = document.getElementById('ov').getBoundingClientRect();
      const hit = App.pick(x - r.left, y - r.top);
      const top = document.elementFromPoint(x, y);
      return { rect: [r.left, r.top, r.width, r.height], dpr: devicePixelRatio, inner: [innerWidth, innerHeight], hit: hit && hit.type, top: top && (top.id || top.className || top.tagName) };
    }, [target.x, target.y]);
    await click(50, 0);
    await win.waitForTimeout(100);
    const afterMouse = await win.evaluate(() => ({ mouse: App.mouse, input: App.input && App.input.kind }));
    console.log('trim click diagnostics', JSON.stringify({ target, before, afterMouse }));
    await submit('');
    const xs = await win.evaluate(() => App.doc.entities.filter((e) => e.type === 'line' && e.y1 === 0 && e.y2 === 0).map((e) => [e.x1, e.x2]));
    const ctx = await win.evaluate(() => ({ size: App.size(), view: App.view, hist: [...document.querySelectorAll('#cmd-history .hl')].slice(-5).map((d) => d.textContent) }));
    assert.deepStrictEqual(xs.sort((a, b) => a[0] - b[0]), [[0, 40], [60, 100]], JSON.stringify(ctx));
  });
  await step('undo restores the trimmed line', async () => {
    await win.keyboard.press('Control+z'); await win.waitForTimeout(50);
    const n = await win.evaluate(() => App.doc.entities.filter((e) => e.type === 'line' && e.y1 === 0).length);
    assert.strictEqual(n, 1);
  });
  await step('save as DXF through the main process and read it back', async () => {
    const out = path.join(os.tmpdir(), `draftforge-e2e-${process.pid}.dxf`);
    await win.evaluate((p) => window.desktop.writeFile(p, DXF.writeDxf(App.doc)), out);
    const back = require('../src/dxf.js').readDxf(fs.readFileSync(out, 'utf8')).doc;
    fs.unlinkSync(out);
    assert.strictEqual(back.entities.length, 4);
  });
  await step('isometric drafting: isocircle and angle override', async () => {
    await submit('ISODRAFT', 'Top', 'ELLIPSE', 'I', '200,0', '10');
    const el = await win.evaluate(() => App.E[App.E.length - 1]);
    assert.strictEqual(el.type, 'ellipse');
    assert.ok(Math.abs(el.ratio - Math.tan(Math.PI / 6)) < 1e-9, `isocircle ratio ${el.ratio}`);
    await submit('ISODRAFT', 'Off', 'LINE', '0,50', '<30', '10', '');
    const ln = await win.evaluate(() => App.E[App.E.length - 1]);
    assert.ok(Math.abs(ln.x2 - 10 * Math.cos(Math.PI / 6)) < 1e-9 && Math.abs(ln.y2 - 55) < 1e-9, JSON.stringify(ln));
  });
  await step('object snap tracking locks square to an acquired point', async () => {
    await submit('ISODRAFT', 'Off', 'NEW');
    await win.evaluate(() => { App.file.dirty = false; });
    await win.evaluate(() => { App.view = { cx: 60, cy: 0, scale: 5 }; App.st.ortho = true; App.st.otrack = true; App.st.osnap = true; App.render(); });
    await submit('REC', '0,0', '40,20', 'LINE', '100,-30');
    const toPageXY = (x, y) => win.evaluate(([x, y]) => { const r = document.getElementById('ov').getBoundingClientRect(); const s = App.w2s({ x, y }); return { x: r.left + s.x, y: r.top + s.y }; }, [x, y]);
    let q = await toPageXY(40, 20); await win.mouse.move(q.x, q.y, { steps: 4 }); await win.waitForTimeout(700);
    assert.strictEqual(await win.evaluate(() => App.acq.length), 1, 'point not acquired');
    q = await toPageXY(100.5, 21); await win.mouse.move(q.x, q.y, { steps: 4 }); await win.waitForTimeout(60);
    await win.mouse.down(); await win.mouse.up(); await win.waitForTimeout(40);
    await submit('');
    const ln = await win.evaluate(() => App.E[App.E.length - 1]);
    await win.evaluate(() => { App.st.ortho = false; });
    assert.ok(ln.type === 'line' && ln.x2 === 100 && Math.abs(ln.y2 - 20) < 1e-12, JSON.stringify(ln));
  });
  await step('layout with title block exports an A3 vector PDF', async () => {
    await win.evaluate(() => App.setSpace('Layout1'));
    const vp = await win.evaluate(() => App.E.find((e) => e.type === 'viewport'));
    assert.ok(vp && vp.scale > 0, 'default viewport');
    await submit('TITLEBLOCK');
    await win.waitForSelector('.modal-bg .btn.primary');
    await win.click('.modal-bg .btn.primary');
    assert.ok(await win.evaluate(() => App.E.some((e) => e.type === 'insert' && e.attribs.length === 10)));
    const out = path.join(os.tmpdir(), `draftforge-e2e-${process.pid}.pdf`);
    const r = await win.evaluate((p) => {
      const sheet = App.buildSheet({ layout: App.layoutObj(), style: 'monochrome', lineweights: true });
      return window.desktop.plot({ svg: App.sheetSvg(sheet, false), widthMm: sheet.pw, heightMm: sheet.ph, action: 'pdf', path: p });
    }, out);
    assert.ok(r.ok, JSON.stringify(r));
    const pdf = fs.readFileSync(out, 'latin1');
    if (process.env.KEEP_PDF) fs.copyFileSync(out, process.env.KEEP_PDF);
    fs.unlinkSync(out);
    assert.ok(pdf.startsWith('%PDF-'), 'not a PDF');
    const box = pdf.match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/);
    assert.ok(box, 'no MediaBox');
    // A3 landscape is 420 x 297 mm = 1190.55 x 841.89 pt
    assert.ok(Math.abs(+box[1] - 1190.55) < 1.5 && Math.abs(+box[2] - 841.89) < 1.5, `MediaBox ${box[1]} x ${box[2]}`);
  });
  assert.deepStrictEqual(errors, []);
  await app.evaluate(({ app: a }) => a.exit(0));
  console.log('e2e passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
