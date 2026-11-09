// Discord Rich Presence tests against a fake Discord IPC socket. Run with: node test/discord.test.js
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { Presence, encode } = require('../discordpresence.js');

if (process.platform === 'win32') { console.log('discord presence tests skipped on Windows (unix socket fake)'); process.exit(0); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-discord-'));
const sockPath = path.join(dir, 'discord-ipc-0');

// minimal fake of the Discord client: records frames, answers the handshake with READY
function fakeDiscord(mode = 'ok') {
  const got = [];
  const server = net.createServer((c) => {
    let buf = Buffer.alloc(0);
    c.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 8) {
        const op = buf.readInt32LE(0), len = buf.readInt32LE(4);
        if (buf.length < 8 + len) break;
        const msg = JSON.parse(buf.subarray(8, 8 + len).toString('utf8'));
        buf = buf.subarray(8 + len);
        got.push({ op, msg });
        if (op === 0 && mode === 'refuse') { c.write(encode(2, { code: 4000, message: 'Invalid Client ID' })); c.end(); }
        else if (op === 0) c.write(encode(1, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1, user: { username: 'tester' } } }));
        else if (msg.cmd === 'SET_ACTIVITY') c.write(encode(1, mode === 'reject'
          ? { cmd: 'SET_ACTIVITY', evt: 'ERROR', nonce: msg.nonce, data: { code: 4000, message: 'child "activity" fails' } }
          : { cmd: 'SET_ACTIVITY', evt: null, nonce: msg.nonce, data: msg.args.activity }));
      }
    });
  });
  return new Promise((resolve) => server.listen(sockPath, () => resolve({ server, got })));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 2000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out'); await wait(10); } };

(async () => {
  let passed = 0;
  const test = async (name, fn) => {
    try { await fn(); passed++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }
  };

  await test('without an application ID nothing connects', async () => {
    const p = new Presence('', { quiet: true, paths: [sockPath] });
    assert.strictEqual(p.enabled, false);
    p.set({ details: 'Working on a.dfg' });
    assert.strictEqual(p.sock, null);
  });

  await test('handshake, then "Working on <file>" activity; repeats are skipped', async () => {
    const { server, got } = await fakeDiscord();
    const p = new Presence('123456789012345678', { quiet: true, paths: [path.join(dir, 'missing-0'), sockPath], sendDelayMs: 20 });
    p.set({ details: 'Working on Drawing1.dfg', timestamps: { start: 1 } });
    await until(() => got.some((g) => g.msg.cmd === 'SET_ACTIVITY'));
    assert.deepStrictEqual(got[0], { op: 0, msg: { v: 1, client_id: '123456789012345678' } });
    const act = got.find((g) => g.msg.cmd === 'SET_ACTIVITY').msg.args;
    assert.strictEqual(act.pid, process.pid);
    assert.strictEqual(act.activity.details, 'Working on Drawing1.dfg');
    p.set({ details: 'Working on Drawing1.dfg', timestamps: { start: 1 } });
    p.set({ details: 'Working on plan.dxf', timestamps: { start: 1 } });
    await until(() => got.filter((g) => g.msg.cmd === 'SET_ACTIVITY').length === 2);
    await wait(80);
    const sets = got.filter((g) => g.msg.cmd === 'SET_ACTIVITY').map((g) => g.msg.args.activity && g.msg.args.activity.details);
    assert.deepStrictEqual(sets, ['Working on Drawing1.dfg', 'Working on plan.dxf']);
    p.set(null);
    await until(() => got.filter((g) => g.msg.cmd === 'SET_ACTIVITY').length === 3);
    assert.strictEqual(got[got.length - 1].msg.args.activity, null, 'null clears the status');
    p.stop();
    await new Promise((r) => server.close(r));
  });

  await test('Discord not running: retries later, connects once it starts', async () => {
    const p = new Presence('123456789012345678', { quiet: true, paths: [sockPath], retryMs: 30, sendDelayMs: 10 });
    p.set({ details: 'Working on late.dfg' });
    await wait(60);
    const { server, got } = await fakeDiscord();
    await until(() => got.some((g) => g.msg.cmd === 'SET_ACTIVITY'));
    assert.strictEqual(got.find((g) => g.msg.cmd === 'SET_ACTIVITY').msg.args.activity.details, 'Working on late.dfg');
    p.stop();
    await new Promise((r) => server.close(r));
  });

  await test('status: connected and showing, as reported by Discord', async () => {
    const { server } = await fakeDiscord();
    const p = new Presence('123456789012345678', { quiet: true, paths: [sockPath], sendDelayMs: 10 });
    assert.strictEqual(p.describe().status, 'Not connected yet.');
    p.set({ details: 'Working on a.dfg', timestamps: { start: Date.now() } });
    await until(() => /Showing on Discord/.test(p.status));
    assert.strictEqual(p.status, 'Showing on Discord: Working on a.dfg.');
    assert.ok(p.describe().ready);
    p.stop(); await new Promise((r) => server.close(r));
  });

  await test('status: Discord refuses the application ID', async () => {
    const { server } = await fakeDiscord('refuse');
    const p = new Presence('123456789012345678', { quiet: true, paths: [sockPath], retryMs: 10000 });
    p.set({ details: 'Working on a.dfg' });
    await until(() => !!p.lastError);
    assert.ok(/refused the connection: Invalid Client ID \(code 4000\)/.test(p.lastError), p.lastError);
    p.stop(); await new Promise((r) => server.close(r));
  });

  await test('status: Discord rejects the activity', async () => {
    const { server } = await fakeDiscord('reject');
    const p = new Presence('123456789012345678', { quiet: true, paths: [sockPath], sendDelayMs: 10 });
    p.set({ details: 'Working on a.dfg' });
    await until(() => !!p.lastError);
    assert.ok(/rejected the status: child "activity" fails/.test(p.lastError), p.lastError);
    p.stop(); await new Promise((r) => server.close(r));
  });

  await test('status: Discord not running', async () => {
    const p = new Presence('123456789012345678', { quiet: true, paths: [path.join(dir, 'nothing-here')], retryMs: 10000 });
    p.set({ details: 'x' });
    await until(() => /not found/.test(p.status));
    p.stop();
  });

  fs.rmSync(dir, { recursive: true, force: true });
  if (!process.exitCode) console.log(`${passed} discord presence tests passed`);
})();
