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
    this.quiet = !!opts.quiet;
    this.sock = null;
    this.ready = false;
    this.activity = null;
    this.sent = undefined; // JSON of the last activity sent, to skip repeats
    this.buf = Buffer.alloc(0);
    this.retryTimer = null;
    this.sendTimer = null;
    this.stopped = false;
    // what happened last, for the DISCORD command (and the console)
    this.status = this.enabled ? 'Not connected yet.' : 'Off: no Discord application ID is set.';
    this.lastError = null;
  }

  note(status, isError) {
    this.status = status;
    if (isError) this.lastError = status;
    if (typeof console !== 'undefined' && !this.quiet) console.log('[discord]', status);
  }

  // why no connection point answered, from the error each one gave
  notFoundReason() {
    const t = this.tried || [], codes = new Set(t.map((x) => x.code));
    const where = process.platform === 'win32' ? 'pipes discord-ipc-0 to 9' : `sockets discord-ipc-0 to 9 in ${[...new Set(t.map((x) => path.dirname(x.path)))].join(', ')}`;
    if (codes.has('EACCES') || codes.has('EPERM')) {
      return `Discord found but access was denied (${[...codes].join(', ')}). Usually one of DraftForgeCAD and Discord runs "as administrator" and the other does not: run both normally. Retrying every 30 s.`;
    }
    const other = [...codes].filter((c) => c !== 'ENOENT');
    return `Discord not found: no Discord connection point exists (checked ${where}${other.length ? '; errors: ' + other.join(', ') : ''}). ` +
      'The official Discord desktop app creates one while it is running; the browser version and some third-party clients (e.g. Vesktop without arRPC) do not. Retrying every 30 s.';
  }

  describe() { return { enabled: this.enabled, ready: this.ready, status: this.status, lastError: this.lastError }; }

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
    if (index === 0) this.tried = [];
    if (index >= this.paths.length) {
      this.note(this.notFoundReason(), true);
      this.retryLater(); return;
    }
    const sock = net.createConnection(this.paths[index]);
    let opened = false;
    sock.on('connect', () => {
      opened = true;
      this.sock = sock;
      this.buf = Buffer.alloc(0);
      sock.write(encode(OP_HANDSHAKE, { v: 1, client_id: this.clientId }));
      this.note('Found Discord, waiting for it to accept the connection...');
    });
    sock.on('data', (d) => this.onData(d));
    sock.on('error', (err) => {
      if (opened) return;
      this.tried.push({ path: this.paths[index], code: (err && err.code) || 'error' });
      sock.destroy(); this.connect(index + 1);
    });
    sock.on('close', () => {
      if (!opened) return;
      this.sock = null; this.ready = false; this.sent = undefined;
      if (!this.lastClose) this.note('Discord closed the connection. Retrying every 30 s.');
      this.lastClose = null;
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
      else if (op === OP_CLOSE) { // e.g. an unknown application ID
        this.lastClose = true;
        this.note(`Discord refused the connection: ${(msg && msg.message) || 'no reason given'} (code ${msg && msg.code}).`, true);
        this.sock.destroy();
      } else if (op === OP_FRAME && msg && msg.evt === 'READY') {
        this.ready = true;
        const u = msg.data && msg.data.user;
        this.note(`Connected to Discord${u && u.username ? ' as ' + u.username : ''}.`);
        this.flush();
      } else if (op === OP_FRAME && msg && msg.evt === 'ERROR') {
        this.note(`Discord rejected the status: ${(msg.data && msg.data.message) || 'unknown error'} (code ${msg.data && msg.data.code}).`, true);
      } else if (op === OP_FRAME && msg && msg.cmd === 'SET_ACTIVITY' && !msg.evt) {
        this.note(this.activity ? `Showing on Discord: ${this.activity.details}.` : 'Status cleared on Discord.');
      }
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
