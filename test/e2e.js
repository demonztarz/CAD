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
    await click(50, 0);
    await win.waitForTimeout(100);
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
  assert.deepStrictEqual(errors, []);
  await app.evaluate(({ app: a }) => a.exit(0));
  console.log('e2e passed');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
