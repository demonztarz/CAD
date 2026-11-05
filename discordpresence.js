// Discord Rich Presence over Discord's local IPC socket (no dependencies).
// Shows "DraftForgeCAD" (the name of the Discord application whose ID is configured)
// with a details line such as "Working on Drawing1.dfg".
const net = require('net');
const path = require('path');

const OP_HANDSHAKE = 0, OP_FRAME = 1, OP_CLOSE = 2, OP_PING = 3, OP_PONG = 4;
const RETRY_MS = 30000; // Discord may be started after DraftForgeCAD
const SEND_DELAY_MS = 1500; // Discord rate-limits activity updates; coalesce bursts

function socketPaths() {
  const ids = [...Array(10).keys()];
  if (process.platform === 'win32') return ids.map((i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  // regular install, then the Flatpak and Snap sandboxes
  const dirs = [base, path.join(base, 'app', 'com.discordapp.Discord'), path.join(base, '.flatpak', 'com.discordapp.Discord', 'xdg-run'), path.join(base, 'snap.discord')];
  return dirs.flatMap((d) => ids.map((i) => path.join(d, `discord-ipc-${i}`)));
}

function encode(op, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

class Presence {
  constructor(clientId, opts = {}) {
    this.clientId = String(clientId || '').trim();
    this.paths = opts.paths || socketPaths();
    this.retryMs = opts.retryMs ?? RETRY_MS;
    this.sendDelayMs = opts.sendDelayMs ?? SEND_DELAY_MS;
    this.sock = null;
    this.ready = false;
    this.activity = null;
    this.sent = undefined; // JSON of the last activity sent, to skip repeats
    this.buf = Buffer.alloc(0);
    this.retryTimer = null;
    this.sendTimer = null;
    this.stopped = false;
  }

  get enabled() { return /^\d{5,30}$/.test(this.clientId); }

  // activity: { details, state, timestamps, ... } or null to clear
  set(activity) {
    this.activity = activity;
    if (!this.enabled || this.stopped) return;
    if (this.ready) this.scheduleSend();
    else this.connect();
  }

  scheduleSend() {
    if (this.sendTimer) return;
    this.sendTimer = setTimeout(() => { this.sendTimer = null; this.flush(); }, this.sendDelayMs);
    if (this.sendTimer.unref) this.sendTimer.unref();
  }

  flush() {
    if (!this.ready || !this.sock) return;
    const json = JSON.stringify(this.activity);
    if (json === this.sent) return;
    this.sent = json;
    this.sock.write(encode(OP_FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: this.activity }, nonce: `${Date.now()}-${Math.random()}` }));
  }

  connect(index = 0) {
    if (this.sock || this.stopped || !this.enabled) return;
    if (index >= this.paths.length) { this.retryLater(); return; }
    const sock = net.createConnection(this.paths[index]);
    let opened = false;
    sock.on('connect', () => {
      opened = true;
      this.sock = sock;
      this.buf = Buffer.alloc(0);
      sock.write(encode(OP_HANDSHAKE, { v: 1, client_id: this.clientId }));
    });
    sock.on('data', (d) => this.onData(d));
    sock.on('error', () => { if (!opened) { sock.destroy(); this.connect(index + 1); } });
    sock.on('close', () => {
      if (!opened) return;
      this.sock = null; this.ready = false; this.sent = undefined;
      this.retryLater();
    });
  }

  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0), len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) break;
      let msg = null;
      try { msg = JSON.parse(this.buf.subarray(8, 8 + len).toString('utf8')); } catch (_) { /* ignore malformed frame */ }
      this.buf = this.buf.subarray(8 + len);
      if (op === OP_PING) this.sock.write(encode(OP_PONG, msg || {}));
      else if (op === OP_CLOSE) this.sock.destroy();
      else if (op === OP_FRAME && msg && msg.evt === 'READY') { this.ready = true; this.flush(); }
    }
  }

  retryLater() {
    if (this.retryTimer || this.stopped) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.connect(); }, this.retryMs);
    if (this.retryTimer.unref) this.retryTimer.unref();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer); clearTimeout(this.sendTimer);
    if (this.sock) this.sock.destroy();
    this.sock = null; this.ready = false;
  }
}

module.exports = { Presence, encode, socketPaths };
