/* DraftForge user interface: ribbon, command line, status bar, palettes, dialogs and file handling. */
(function () {
  'use strict';
  const S = window.App;
  const $ = (id) => document.getElementById(id);
  const I = Icons.get;
  const desk = window.desktop || null;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'cls') el.className = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const run = (cmd) => (typeof cmd === 'function' ? cmd() : S.runCommand(cmd));

  // ======================================================== constants
  const LWS = [0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.53, 0.6, 0.7, 0.8, 0.9, 1, 1.06, 1.2, 1.4, 1.58, 2, 2.11];
  const LTS = Object.keys(DXF.LTYPES);
  const COLOR_NAMES = { 1: 'Red', 2: 'Yellow', 3: 'Green', 4: 'Cyan', 5: 'Blue', 6: 'Magenta', 7: 'White' };
  const colorLabel = (c) => (c == null ? 'ByLayer' : c === 0 ? 'ByBlock' : typeof c === 'string' ? c.toUpperCase() : COLOR_NAMES[c] || `Color ${c}`);
  const swatch = (c) => h('span', { cls: 'swatch', style: `background:${c == null || c === 0 ? 'transparent' : S.colorCss(c)}` });

  // ======================================================== ribbon
  const big = (icon, label, cmd, tip) => ({ t: 'big', icon, label, cmd, tip });
  const sm = (icon, label, cmd, tip) => ({ t: 'sm', icon, label, cmd, tip });
  const col = (...items) => ({ t: 'col', items });
  const ctl = (kind) => ({ t: 'ctl', kind });
  const RIBBON = {
    Home: [
      { title: 'Draw', items: [big('line', 'Line', 'LINE'), big('pline', 'Polyline', 'PLINE'), big('circle', 'Circle', 'CIRCLE'), big('arc', 'Arc', 'ARC'),
        col(sm('rect', 'Rectangle', 'RECTANG'), sm('polygon', 'Polygon', 'POLYGON'), sm('ellipse', 'Ellipse', 'ELLIPSE')),
        col(sm('hatch', 'Hatch', 'HATCH'), sm('spline', 'Spline', 'SPLINE'), sm('point', 'Point', 'POINT'))] },
      { title: 'Modify', items: [
        col(sm('move', 'Move', 'MOVE'), sm('copy', 'Copy', 'COPY'), sm('stretch', 'Stretch', 'STRETCH')),
        col(sm('rotate', 'Rotate', 'ROTATE'), sm('mirror', 'Mirror', 'MIRROR'), sm('scale', 'Scale', 'SCALE')),
        col(sm('trim', 'Trim', 'TRIM'), sm('fillet', 'Fillet', 'FILLET'), sm('array', 'Array', 'ARRAYRECT')),
        col(sm('extend', 'Extend', 'EXTEND'), sm('chamfer', 'Chamfer', 'CHAMFER'), sm('offset', 'Offset', 'OFFSET')),
        col(sm('erase', 'Erase', 'ERASE'), sm('explode', 'Explode', 'EXPLODE'), sm('join', 'Join', 'JOIN'))] },
      { title: 'Annotation', items: [big('text', 'Text', 'TEXT'), big('dimlinear', 'Dimension', 'DIMLINEAR'),
        col(sm('dimaligned', 'Aligned', 'DIMALIGNED'), sm('dimradius', 'Radius', 'DIMRADIUS'), sm('dimangular', 'Angular', 'DIMANGULAR'))] },
      { title: 'Layers', items: [big('layers', 'Layer Properties', 'LAYER'), col(ctl('layer'), { t: 'row', items: [sm('layers', 'Make Current', 'LAYMCUR'), sm('matchprop', 'Match Layer', 'MATCHPROP')] })] },
      { title: 'Block', items: [big('insert', 'Insert', 'INSERT'), col(sm('block', 'Create', 'BLOCK'), sm('explode', 'Explode', 'EXPLODE'))] },
      { title: 'Properties', items: [big('matchprop', 'Match Properties', 'MATCHPROP'), col(ctl('color'), ctl('lw'), ctl('ltype'))] },
      { title: 'Utilities', items: [big('measure', 'Measure', 'DIST'), col(sm('id', 'ID Point', 'ID'), sm('list', 'List', 'LIST'), sm('area', 'Area', 'AREA'))] },
      { title: 'Clipboard', items: [big('paste', 'Paste', 'PASTECLIP'), col(sm('copyclip', 'Copy Clip', 'COPYCLIP'), sm('cut', 'Cut', 'CUTCLIP'))] },
    ],
    Insert: [
      { title: 'Block', items: [big('insert', 'Insert', 'INSERT'), big('block', 'Create Block', 'BLOCK'), big('explode', 'Explode', 'EXPLODE')] },
      { title: 'Import', items: [big('open', 'Open DWG / DXF', 'OPEN')] },
    ],
    Annotate: [
      { title: 'Text', items: [big('mtext', 'Multiline Text', 'MTEXT'), big('text', 'Single Line', 'TEXT')] },
      { title: 'Dimensions', items: [big('dimlinear', 'Linear', 'DIMLINEAR'), big('dimaligned', 'Aligned', 'DIMALIGNED'), col(sm('dimradius', 'Radius', 'DIMRADIUS'), sm('dimdiameter', 'Diameter', 'DIMDIAMETER'), sm('dimangular', 'Angular', 'DIMANGULAR'))] },
      { title: 'Hatch', items: [big('hatch', 'Hatch', 'HATCH')] },
    ],
    View: [
      { title: 'Navigate', items: [big('zoomext', 'Extents', () => S.zoomExtents()), big('zoomwin', 'Window', 'ZOOM'), big('pan', 'Pan', 'PAN'), big('regen', 'Regen', 'REGEN')] },
      { title: 'Palettes', items: [big('props', 'Properties', () => togglePalette()), big('layers', 'Layers', 'LAYER'), big('help', 'Commands', 'HELP')] },
      { title: 'Display', items: [col(sm('gridicon', 'Grid', 'GRID'), sm('lwt', 'Lineweight', 'LWDISPLAY'), sm('osnap', 'Object Snaps', 'OSNAP'))] },
    ],
    Output: [
      { title: 'Export', items: [big('exportf', 'Export DXF', 'DXFOUT'), big('exportf', 'Export SVG', 'SVGOUT'), big('plot', 'Export PNG', 'PNGOUT')] },
      { title: 'Save', items: [big('save', 'Save', 'QSAVE'), big('saveas', 'Save As', 'SAVEAS')] },
    ],
  };
  const tipFor = (label, cmd) => {
    if (typeof cmd !== 'string') return label;
    const c = S.commands[cmd];
    const al = Object.entries(S.aliases).filter(([, v]) => v === cmd).map(([k]) => k);
    return `${label}\n${c ? c.desc : ''}\nCommand: ${cmd}${al.length ? '  (' + al.join(', ') + ')' : ''}`;
  };
  const ribbonCtls = {};
  function buildItem(it) {
    if (it.t === 'big' || it.t === 'sm') {
      return h('button', { cls: 'rbtn' + (it.t === 'big' ? ' big' : ''), title: tipFor(it.label, it.cmd), onclick: () => run(it.cmd), html: I(it.icon, it.t === 'big' ? 34 : 18) + `<span>${esc(it.label)}</span>` });
    }
    if (it.t === 'col') return h('div', { cls: 'rcol' }, it.items.map(buildItem));
    if (it.t === 'row') return h('div', { cls: 'rctl' }, it.items.map((x) => { const b = buildItem(x); b.classList.add('icon-only'); b.querySelector('span').remove(); return b; }));
    if (it.t === 'ctl') {
      const sel = h('select', { title: { layer: 'Layer', color: 'Object color', lw: 'Lineweight', ltype: 'Linetype' }[it.kind] });
      (ribbonCtls[it.kind] = ribbonCtls[it.kind] || []).push(sel);
      sel.addEventListener('change', () => onPropSelect(it.kind, sel));
      sel.addEventListener('mousedown', (e) => e.stopPropagation());
      const icon = { layer: 'layers', color: null, lw: 'lwt', ltype: 'line' }[it.kind];
      const lbl = h('span', { cls: 'lbl', html: icon ? I(icon, 16) : '' });
      if (it.kind === 'color') { lbl.innerHTML = ''; lbl.append(swatch(7)); }
      return h('div', { cls: 'rctl' }, lbl, sel);
    }
    return null;
  }
  let activeTab = 'Home';
  function buildRibbon() {
    const tabs = $('ribbon-tabs'), rib = $('ribbon');
    tabs.innerHTML = ''; rib.innerHTML = '';
    for (const k of Object.keys(RIBBON).concat()) for (const key of Object.keys(ribbonCtls)) void key;
    for (const k of Object.keys(ribbonCtls)) ribbonCtls[k] = [];
    for (const name of Object.keys(RIBBON)) {
      tabs.append(h('div', { cls: 'rt' + (name === activeTab ? ' active' : ''), onclick: () => { activeTab = name; buildRibbon(); } }, name));
    }
    for (const p of RIBBON[activeTab]) {
      rib.append(h('div', { cls: 'rpanel' }, h('div', { cls: 'rbody' }, p.items.map(buildItem)), h('div', { cls: 'rtitle' }, p.title)));
    }
    refreshControls();
  }

  // property dropdowns (ribbon + palette share this logic)
  function selValue(key) {
    const list = [...S.selection];
    if (!list.length) return { cur: true, v: key === 'layer' ? S.doc.clayer : S.cur[key] };
    const vals = new Set(list.map((e) => (key === 'layer' ? e.layer : e[key] === undefined ? null : e[key])));
    return vals.size === 1 ? { v: [...vals][0] } : { varies: true };
  }
  function fillSelect(sel, kind) {
    const st = selValue(kind === 'lw' ? 'lw' : kind === 'ltype' ? 'ltype' : kind === 'color' ? 'color' : 'layer');
    sel.innerHTML = '';
    const opt = (val, label) => h('option', { value: val }, label);
    if (st.varies) sel.append(opt('__varies', '*VARIES*'));
    if (kind === 'layer') {
      for (const l of S.doc.layers) sel.append(opt('L:' + l.name, `${l.on === false ? '○' : '●'} ${l.frozen ? '❄' : '☀'} ${l.locked ? '🔒' : ''} ${l.name}`));
      sel.value = st.varies ? '__varies' : 'L:' + st.v;
    } else if (kind === 'color') {
      sel.append(opt('c:null', 'ByLayer'), opt('c:0', 'ByBlock'));
      for (let i = 1; i <= 7; i++) sel.append(opt('c:' + i, COLOR_NAMES[i]));
      const v = st.v;
      if (!st.varies && v != null && v !== 0 && !(v >= 1 && v <= 7)) sel.append(opt('c:' + v, colorLabel(v)));
      sel.append(opt('__more', 'More Colors...'));
      sel.value = st.varies ? '__varies' : 'c:' + (v == null ? 'null' : v);
      const sw = sel.parentElement && sel.parentElement.querySelector('.swatch');
      if (sw) { const real = v == null ? (S.layer(S.doc.clayer) || {}).color : v; sw.style.background = st.varies || v === 0 ? 'transparent' : S.colorCss(real); }
    } else if (kind === 'lw') {
      sel.append(opt('w:null', 'ByLayer'));
      for (const w of LWS) sel.append(opt('w:' + w, w.toFixed(2) + ' mm'));
      sel.value = st.varies ? '__varies' : 'w:' + (st.v == null ? 'null' : st.v);
    } else if (kind === 'ltype') {
      sel.append(opt('t:null', 'ByLayer'), opt('t:BYBLOCK', 'ByBlock'));
      for (const t of LTS) sel.append(opt('t:' + t, t.charAt(0) + t.slice(1).toLowerCase()));
      sel.value = st.varies ? '__varies' : 't:' + (st.v == null ? 'null' : st.v);
    }
  }
  function refreshControls() {
    for (const [kind, sels] of Object.entries(ribbonCtls)) for (const s of sels) if (document.activeElement !== s) fillSelect(s, kind);
  }
  function changeSelection(fn, label) {
    const list = [...S.selection];
    if (!list.length) return false;
    S.runningName = label;
    const map = new Map(), fresh = [];
    for (const e of list) { const n = fn({ ...e }); for (const k of Object.keys(n)) if (n[k] === undefined) delete n[k]; map.set(e, [n]); fresh.push(n); }
    S.replace(map); S.endOp();
    S.selection = new Set(fresh);
    S.emit('selection'); S.render();
    return true;
  }
  async function onPropSelect(kind, sel) {
    const v = sel.value;
    if (v === '__varies') return;
    if (kind === 'layer') {
      const name = v.slice(2);
      if (!changeSelection((e) => ({ ...e, layer: name }), 'Change layer')) { S.doc.clayer = name; S.msg(`Current layer: ${name}`); }
    } else if (kind === 'color') {
      let c;
      if (v === '__more') { c = await colorPicker(selValue('color').v); if (c === undefined) { refreshControls(); return; } }
      else c = v === 'c:null' ? null : v === 'c:0' ? 0 : /^c:\d+$/.test(v) ? +v.slice(2) : v.slice(2);
      if (!changeSelection((e) => ({ ...e, color: c === null ? undefined : c }), 'Change color')) S.cur.color = c;
    } else if (kind === 'lw') {
      const w = v === 'w:null' ? null : +v.slice(2);
      if (!changeSelection((e) => ({ ...e, lw: w === null ? undefined : w }), 'Change lineweight')) S.cur.lw = w;
    } else if (kind === 'ltype') {
      const t = v === 't:null' ? null : v.slice(2);
      if (!changeSelection((e) => ({ ...e, ltype: t === null ? undefined : t }), 'Change linetype')) S.cur.ltype = t;
    }
    S.emit('doc');
    S.inputEl.focus();
  }

  // ======================================================== title bar
  const QAT = [['newf', 'New (Ctrl+N)', 'NEW'], ['open', 'Open (Ctrl+O)', 'OPEN'], ['save', 'Save (Ctrl+S)', 'QSAVE'], ['saveas', 'Save As (Ctrl+Shift+S)', 'SAVEAS'], ['undo', 'Undo (Ctrl+Z)', 'U'], ['redo', 'Redo (Ctrl+Y)', 'REDO'], ['plot', 'Export PNG', 'PNGOUT']];
  for (const [icon, tip, cmd] of QAT) $('qat').append(h('button', { title: tip, html: I(icon, 18), onclick: () => run(cmd) }));
  function updateTitle() {
    const n = S.file.name + (S.file.dirty ? '*' : '');
    $('title').innerHTML = `DraftForge &nbsp; <b>${esc(n)}</b>`;
    $('ftab-name').textContent = n;
    document.title = `${n} - DraftForge`;
    if (desk) desk.setTitle(`DraftForge - ${n}`);
  }
  S.on('title', updateTitle);
  $('appbtn').addEventListener('click', (ev) => {
    ev.stopPropagation();
    const r = $('appbtn').getBoundingClientRect();
    showMenu(r.left, r.bottom, [
      { label: 'New', key: 'Ctrl+N', icon: 'newf', act: 'NEW' },
      { label: 'Open...', key: 'Ctrl+O', icon: 'open', act: 'OPEN' },
      { label: 'Save', key: 'Ctrl+S', icon: 'save', act: 'QSAVE' },
      { label: 'Save As...', key: 'Ctrl+Shift+S', icon: 'saveas', act: 'SAVEAS' },
      '-',
      { label: 'Export DXF...', icon: 'exportf', act: 'DXFOUT' },
      { label: 'Export SVG...', icon: 'exportf', act: 'SVGOUT' },
      { label: 'Export PNG...', icon: 'plot', act: 'PNGOUT' },
      '-',
      { label: 'Command Reference', key: 'F1', icon: 'help', act: 'HELP' },
      ...(desk ? [{ label: 'Exit DraftForge', icon: 'erase', act: () => S.quit() }] : []),
    ], 'appmenu');
  });
  $('cmdsearch').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { const v = ev.target.value.trim(); ev.target.value = ''; if (v) S.runCommand(v); S.inputEl.focus(); }
    if (ev.key === 'Escape') { ev.target.value = ''; S.inputEl.focus(); }
    ev.stopPropagation();
  });

  // ======================================================== menus
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  function showMenu(x, y, items, extra) {
    closeMenu();
    const m = h('div', { cls: 'menu ' + (extra || '') });
    for (const it of items) {
      if (it === '-') { m.append(h('div', { cls: 'sep' })); continue; }
      if (it.head) { m.append(h('div', { cls: 'mhead' }, it.head)); continue; }
      const el = h('div', { cls: 'mi' + (it.disabled ? ' dis' : '') + (it.checked ? ' chk' : ''), onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); closeMenu(); run(it.act); } },
        h('span', { html: (it.icon ? I(it.icon, 18) + ' ' : '') + esc(it.label) }), it.key ? h('span', { cls: 'k' }, it.key) : null);
      if (it.icon) el.firstChild.style.display = 'flex', el.firstChild.style.gap = '10px', el.firstChild.style.alignItems = 'center';
      m.append(el);
    }
    $('menu-root').append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 4) + 'px';
    m.style.top = Math.min(y, innerHeight - r.height - 4) + 'px';
    openMenu = m;
  }
  window.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); });
  const SNAPS = [['end', 'Endpoint'], ['mid', 'Midpoint'], ['int', 'Intersection'], ['cen', 'Center'], ['qua', 'Quadrant'], ['tan', 'Tangent'], ['per', 'Perpendicular'], ['ins', 'Insertion'], ['nod', 'Node'], ['nea', 'Nearest']];
  S.on('contextmenu', (ev) => {
    const items = [];
    const inp = S.input;
    const snapItems = () => SNAPS.map(([k, label]) => ({ label, act: () => { S.oneShot = k; S.msg(label.slice(0, 3).toLowerCase() + ' of'); } }));
    if (ev.shiftKey && inp) items.push({ head: 'Object Snap Overrides' }, ...snapItems());
    else if (inp) {
      items.push({ label: 'Enter', act: () => S.submit('') }, { label: 'Cancel', act: () => S.escape() });
      if (inp.keywords && inp.keywords.length) { items.push('-'); for (const k of inp.keywords) items.push({ label: k, act: () => S.submit(k) }); }
      if (inp.kind === 'point' || inp.kind === 'distance') items.push('-', { head: 'Snap Overrides' }, ...snapItems());
      items.push('-', { label: 'Zoom Extents', act: () => S.zoomExtents() });
    } else {
      if (S.lastCommand) items.push({ label: `Repeat ${S.lastCommand}`, act: S.lastCommand }, '-');
      const has = S.selection.size > 0;
      items.push(
        { label: 'Cut', key: 'Ctrl+X', act: 'CUTCLIP', disabled: !has }, { label: 'Copy', key: 'Ctrl+C', act: 'COPYCLIP', disabled: !has },
        { label: 'Paste', key: 'Ctrl+V', act: 'PASTECLIP', disabled: !S.clipboard }, '-',
        { label: 'Erase', key: 'Del', act: 'ERASE', disabled: !has }, { label: 'Move', act: 'MOVE', disabled: !has }, { label: 'Copy Selection', act: 'COPY', disabled: !has },
        { label: 'Scale', act: 'SCALE', disabled: !has }, { label: 'Rotate', act: 'ROTATE', disabled: !has }, '-',
        { label: 'Deselect All', act: () => { S.selection.clear(); S.emit('selection'); S.render(); }, disabled: !has },
        { label: 'Select All', key: 'Ctrl+A', act: 'SELECTALL' }, '-',
        { label: 'Zoom Extents', act: () => S.zoomExtents() }, { label: 'Undo', key: 'Ctrl+Z', act: 'U' }, { label: 'Properties', key: 'Ctrl+1', act: () => togglePalette(true) });
    }
    showMenu(ev.clientX, ev.clientY, items);
  });

  // ======================================================== command line
  const input = S.inputEl, ac = $('autocomplete');
  const history = [];
  let histIdx = -1, acItems = [], acSel = -1;
  function updateAutocomplete() {
    const v = input.value.trim().toUpperCase();
    if (!v || S.input || v.length < 1 || /[\d@,<.-]/.test(v[0])) { ac.classList.add('hidden'); acItems = []; return; }
    const names = Object.keys(S.commands);
    const aliasHits = Object.entries(S.aliases).filter(([a]) => a.startsWith(v)).map(([a, n]) => ({ n, a }));
    const nameHits = names.filter((n) => n.startsWith(v)).map((n) => ({ n }));
    const contains = names.filter((n) => !n.startsWith(v) && n.includes(v)).map((n) => ({ n }));
    const seen = new Set(), list = [];
    for (const x of [...aliasHits.filter((x) => x.a === v), ...nameHits, ...aliasHits, ...contains]) { const key = x.n + (x.a || ''); if (seen.has(x.n) && !x.a) continue; if (seen.has(key)) continue; seen.add(key); seen.add(x.n); list.push(x); if (list.length >= 12) break; }
    acItems = list; acSel = list.length ? 0 : -1;
    ac.innerHTML = '';
    list.forEach((x, i) => ac.append(h('div', { cls: 'ac' + (i === acSel ? ' sel' : ''), onmousedown: (e) => { e.preventDefault(); input.value = ''; ac.classList.add('hidden'); S.runCommand(x.n); } },
      h('b', {}, x.a ? `${x.a} (${x.n})` : x.n), h('span', {}, (S.commands[x.n] || {}).desc || ''))));
    ac.classList.toggle('hidden', !list.length);
  }
  function paintAc() { [...ac.children].forEach((c, i) => c.classList.toggle('sel', i === acSel)); }
  input.addEventListener('input', () => { updateAutocomplete(); S.emit('typed', input.value); updateDyn(); });
  const isSubmitKey = (k) => k === 'Enter' || (k === ' ' && !(S.input && S.input.kind === 'string' && S.input.allowSpaces));
  input.addEventListener('keydown', (ev) => {
    const k = ev.key;
    if (isSubmitKey(k)) {
      ev.preventDefault();
      let v = input.value;
      if (!ac.classList.contains('hidden') && acSel >= 0 && acItems[acSel] && !S.input) {
        const typed = v.trim().toUpperCase();
        const it = acItems[acSel];
        if (!(S.resolveCommand(typed))) v = it.n;
      }
      ac.classList.add('hidden');
      if (v.trim()) { history.push(v.trim()); if (history.length > 100) history.shift(); }
      histIdx = -1;
      S.submit(v);
      updateDyn();
      return;
    }
    if (k === 'Tab' && !ac.classList.contains('hidden') && acItems[acSel]) { ev.preventDefault(); input.value = acItems[acSel].n; updateAutocomplete(); return; }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      ev.preventDefault();
      if (!ac.classList.contains('hidden') && acItems.length) { acSel = (acSel + (k === 'ArrowDown' ? 1 : -1) + acItems.length) % acItems.length; paintAc(); return; }
      if (!history.length) return;
      histIdx = k === 'ArrowUp' ? (histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1)) : histIdx < 0 ? -1 : histIdx + 1;
      if (histIdx >= history.length) histIdx = -1;
      input.value = histIdx < 0 ? '' : history[histIdx];
    }
  });
  $('cmd-x').addEventListener('click', () => $('cmdline').classList.toggle('hidden'));
  S.on('prompt', () => updateDyn());

  // ======================================================== dynamic input tooltip
  const dyn = $('dyn');
  function updateDyn() {
    const inp = S.input;
    const show = S.st.dyn && S.mouse.inside && (inp || input.value) && !S.win;
    dyn.classList.toggle('hidden', !show);
    if (!show) return;
    const promptText = inp ? inp.prompt + (inp.keywords && inp.keywords.length ? ' ↓' : '') : 'Command';
    $('dyn-prompt').textContent = promptText;
    const f = $('dyn-fields'); f.innerHTML = '';
    const typed = input.value;
    const p = S.cursorWorld || S.mouse.w;
    if (inp && inp.base && (inp.kind === 'point' || inp.kind === 'distance' || inp.kind === 'angle')) {
      const d = G.dist(inp.base, p), a = G.deg(G.normAng(G.ang(inp.base, p)));
      f.append(h('span', { cls: typed ? 'typed' : '' }, typed || S.fmt(d)), h('span', {}, S.fmt(a, 0) + '°'));
    } else if (inp && (inp.kind === 'point' || inp.kind === 'distance')) {
      f.append(h('span', { cls: typed ? 'typed' : '' }, typed || S.fmt(p.x)), typed ? null : h('span', {}, S.fmt(p.y)));
    } else if (typed) f.append(h('span', { cls: 'typed' }, typed));
    dyn.style.left = S.mouse.sx + 22 + 'px';
    dyn.style.top = S.mouse.sy + 22 + 'px';
  }
  S.on('cursor', () => {
    const p = S.cursorWorld || S.mouse.w;
    $('coords').textContent = `${S.fmt(p.x)}, ${S.fmt(p.y)}, ${S.fmt(0)}`;
    updateDyn();
  });

  // ======================================================== status bar
  const TOGGLES = [
    ['grid', 'gridicon', 'Display drawing grid (F7)'], ['snap', 'snapgrid', 'Snap mode (F9)'], ['ortho', 'ortho', 'Ortho mode (F8)'],
    ['polar', 'polar', 'Polar tracking (F10)'], ['osnap', 'osnap', 'Object snap (F3) - right-click for settings'], ['lwt', 'lwt', 'Show lineweights'], ['dyn', 'dyn', 'Dynamic input (F12)'],
  ];
  function buildStatus() {
    const t = $('toggles'); t.innerHTML = '';
    t.append(h('button', { cls: 'tg text on', title: 'Model space' }, 'MODEL'), h('div', { cls: 'tg-sep' }));
    for (const [key, icon, tip] of TOGGLES) {
      const b = h('button', { cls: 'tg' + (S.st[key] ? ' on' : ''), title: tip, html: I(icon, 18), onclick: () => { S.st[key] = !S.st[key]; S.saveSettings(); buildStatus(); S.render(); S.msg(`<${tip.split(' (')[0]} ${S.st[key] ? 'on' : 'off'}>`); } });
      if (key === 'osnap' || key === 'polar' || key === 'snap' || key === 'grid') b.addEventListener('contextmenu', (e) => { e.preventDefault(); S.openOsnapDialog(); });
      t.append(b);
    }
    t.append(h('div', { cls: 'tg-sep' }), h('button', { cls: 'tg text on', title: 'Annotation scale' }, '1:1'), h('button', { cls: 'tg', title: 'Properties (Ctrl+1)', html: I('props', 18), onclick: () => togglePalette() }));
  }
  S.on('status', buildStatus);

  // ======================================================== keyboard
  const toggleKey = (key, label) => { S.st[key] = !S.st[key]; S.saveSettings(); buildStatus(); S.render(); S.msg(`<${label} ${S.st[key] ? 'on' : 'off'}>`); };
  document.addEventListener('keydown', (ev) => {
    if (document.querySelector('.modal-bg')) return; // dialogs handle their own keys
    const t = ev.target;
    const inField = t && t !== input && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
    const fk = { F1: () => S.showHelp(), F2: () => $('cmdline').classList.toggle('expanded'), F3: () => toggleKey('osnap', 'Osnap'), F7: () => toggleKey('grid', 'Grid'), F8: () => toggleKey('ortho', 'Ortho'), F9: () => toggleKey('snap', 'Snap'), F10: () => toggleKey('polar', 'Polar'), F12: () => toggleKey('dyn', 'Dynamic input') };
    if (fk[k]) { ev.preventDefault(); fk[k](); return; }
    if (k === 'Escape') { ev.preventDefault(); closeMenu(); input.value = ''; ac.classList.add('hidden'); S.escape(); if (inField) input.focus(); updateDyn(); return; }
    if (inField) return;
    if (ctrl) {
      const map = { z: 'U', y: 'REDO', c: 'COPYCLIP', x: 'CUTCLIP', v: 'PASTECLIP', a: 'SELECTALL', o: 'OPEN', n: 'NEW', p: 'PNGOUT' };
      const key = k.toLowerCase();
      if (key === 's') { ev.preventDefault(); run(ev.shiftKey ? 'SAVEAS' : 'QSAVE'); return; }
      if (key === '1') { ev.preventDefault(); togglePalette(); return; }
      if (key === '9') { ev.preventDefault(); $('cmdline').classList.toggle('hidden'); return; }
      if (map[key] && !(t === input && input.value && (key === 'c' || key === 'v' || key === 'x' || key === 'a'))) {
        ev.preventDefault();
        if (key === 'z' && S.input) { S.cancelInput(); setTimeout(() => S.undo(), 0); return; }
        run(map[key]); return;
      }
      return;
    }
    if (k === 'Delete' && !S.input && S.selection.size && !input.value) { ev.preventDefault(); run('ERASE'); return; }
    if (t !== input && isSubmitKey(k) && !ev.altKey && !(t && t.tagName === 'BUTTON')) {
      // focus was elsewhere (e.g. after clicking the ribbon): route Enter/Space to the command line
      ev.preventDefault(); input.focus(); input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: false })); return;
    }
    if (t !== input && k.length === 1 && !ev.altKey) input.focus();
  });

  // ======================================================== properties palette
  let paletteOn = false, typeFilter = 'All';
  function togglePalette(force) {
    paletteOn = force === true ? true : force === false ? false : !paletteOn;
    $('props').classList.toggle('hidden', !paletteOn);
    if (paletteOn) buildPalette();
  }
  S.on('properties', (on) => togglePalette(on));
  $('props-close').addEventListener('click', () => togglePalette(false));
  const TYPE_NAMES = { line: 'Line', circle: 'Circle', arc: 'Arc', pline: 'Polyline', ellipse: 'Ellipse', spline: 'Spline', text: 'Text', point: 'Point', solid: 'Solid', hatch: 'Hatch', dim: 'Dimension', insert: 'Block Reference', xline: 'Construction Line' };
  function buildPalette() {
    if (!paletteOn) return;
    const body = $('props-body');
    const focusedName = document.activeElement && body.contains(document.activeElement) ? document.activeElement.dataset.f : null;
    body.innerHTML = '';
    const all = [...S.selection];
    const counts = {};
    for (const e of all) counts[e.type] = (counts[e.type] || 0) + 1;
    if (typeFilter !== 'All' && !counts[typeFilter]) typeFilter = 'All';
    const list = typeFilter === 'All' ? all : all.filter((e) => e.type === typeFilter);
    const ts = h('select', { cls: 'typesel', onchange: (e) => { typeFilter = e.target.value; buildPalette(); } });
    if (!all.length) ts.append(h('option', { value: 'All' }, 'No selection'));
    else {
      ts.append(h('option', { value: 'All' }, Object.keys(counts).length === 1 ? `${TYPE_NAMES[all[0].type] || all[0].type} (${all.length})` : `All (${all.length})`));
      if (Object.keys(counts).length > 1) for (const [t, n] of Object.entries(counts)) ts.append(h('option', { value: t }, `${TYPE_NAMES[t] || t} (${n})`));
      ts.value = typeFilter;
    }
    body.append(ts);
    const group = (title, rows) => h('div', { cls: 'pgroup' }, h('div', { cls: 'ph' }, title), rows);
    const row = (label, valEl) => h('div', { cls: 'prow' }, h('label', { title: label }, label), h('div', { cls: 'pv' }, valEl));
    const ro = (v) => h('div', { cls: 'ro', title: String(v) }, String(v));
    const apply = (fn) => {
      S.runningName = 'Properties';
      const map = new Map(), fresh = [];
      for (const e of list) { const n = fn(JSON.parse(JSON.stringify(e))); if (!n) continue; map.set(e, [n]); fresh.push(n); }
      S.replace(map); S.endOp();
      const others = all.filter((e) => !map.has(e));
      S.selection = new Set([...others, ...fresh]);
      S.emit('selection'); S.emit('doc'); S.render();
    };
    const num = (label, get, set, f) => {
      const vals = new Set(list.map((e) => S.fmt(get(e))));
      const inp = h('input', { value: vals.size === 1 ? [...vals][0] : '*VARIES*', 'data-f': f || label });
      inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (isFinite(v)) apply((e) => set(e, v)); else buildPalette(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); });
      return row(label, inp);
    };
    const str = (label, get, set) => {
      const vals = new Set(list.map(get));
      const inp = h('input', { value: vals.size === 1 ? [...vals][0] : '*VARIES*', 'data-f': label });
      inp.addEventListener('change', () => apply((e) => set(e, inp.value)));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); });
      return row(label, inp);
    };
    const sel = (label, opts, get, set) => {
      const vals = new Set(list.map(get));
      const s = h('select', {}, opts.map(([v, l]) => h('option', { value: v }, l)));
      if (vals.size === 1) s.value = [...vals][0]; else { s.prepend(h('option', { value: '__v' }, '*VARIES*')); s.value = '__v'; }
      s.addEventListener('change', () => { if (s.value !== '__v') apply((e) => set(e, s.value)); });
      return row(label, s);
    };
    // General
    const gen = [];
    const selects = { color: h('select'), layer: h('select'), ltype: h('select'), lw: h('select') };
    for (const [kind, s] of Object.entries(selects)) {
      if (list.length) {
        const saved = S.selection; S.selection = new Set(list); fillSelect(s, kind); S.selection = saved;
        s.addEventListener('change', async () => {
          const v = s.value;
          if (v === '__varies') return;
          if (kind === 'color') {
            let c = v === 'c:null' ? null : v === 'c:0' ? 0 : /^c:\d+$/.test(v) ? +v.slice(2) : v === '__more' ? await colorPicker() : v.slice(2);
            if (c === undefined) { buildPalette(); return; }
            apply((e) => { if (c === null) delete e.color; else e.color = c; return e; });
          } else if (kind === 'layer') apply((e) => ({ ...e, layer: v.slice(2) }));
          else if (kind === 'lw') apply((e) => { if (v === 'w:null') delete e.lw; else e.lw = +v.slice(2); return e; });
          else apply((e) => { if (v === 't:null') delete e.ltype; else e.ltype = v.slice(2); return e; });
        });
      } else {
        fillSelect(s, kind);
        s.addEventListener('change', () => onPropSelect(kind, s));
      }
    }
    gen.push(row('Color', selects.color), row('Layer', selects.layer), row('Linetype', selects.ltype), row('Lineweight', selects.lw));
    body.append(group('General', gen));
    if (!list.length) {
      const st = S.doc.settings;
      const setting = (label, key) => {
        const inp = h('input', { value: S.fmt(st[key] ?? 1), 'data-f': key });
        inp.addEventListener('change', () => {
          const v = parseFloat(inp.value);
          if (v > 0) { S.runningName = label; S.mark(); S.doc.settings[key] = v; S.endOp(); S.clearCaches(); S.render(); }
          else inp.value = S.fmt(st[key] ?? 1);
        });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); });
        return row(label, inp);
      };
      body.append(group('Drawing', [
        row('Objects', ro(S.doc.entities.length)), row('Layers', ro(S.doc.layers.length)), row('Blocks', ro(Object.keys(S.doc.blocks).length)),
        setting('Linetype scale', 'ltscale'), setting('Text height', 'textHeight'), setting('Dim text height', 'dimHeight'),
      ]));
      return;
    }
    const types = new Set(list.map((e) => e.type));
    if (types.size === 1) {
      const t = [...types][0], one = list.length === 1 ? list[0] : null, rows = [];
      const deg = (r) => G.deg(G.normAng(r));
      switch (t) {
        case 'line':
          rows.push(num('Start X', (e) => e.x1, (e, v) => ({ ...e, x1: v })), num('Start Y', (e) => e.y1, (e, v) => ({ ...e, y1: v })),
            num('End X', (e) => e.x2, (e, v) => ({ ...e, x2: v })), num('End Y', (e) => e.y2, (e, v) => ({ ...e, y2: v })));
          if (one) rows.push(row('Delta X', ro(S.fmt(one.x2 - one.x1))), row('Delta Y', ro(S.fmt(one.y2 - one.y1))), row('Length', ro(S.fmt(Math.hypot(one.x2 - one.x1, one.y2 - one.y1)))), row('Angle', ro(S.fmt(deg(Math.atan2(one.y2 - one.y1, one.x2 - one.x1)), 2) + '°')));
          break;
        case 'circle':
          rows.push(num('Center X', (e) => e.cx, (e, v) => ({ ...e, cx: v })), num('Center Y', (e) => e.cy, (e, v) => ({ ...e, cy: v })),
            num('Radius', (e) => e.r, (e, v) => (v > 0 ? { ...e, r: v } : e)), num('Diameter', (e) => 2 * e.r, (e, v) => (v > 0 ? { ...e, r: v / 2 } : e)));
          if (one) rows.push(row('Circumference', ro(S.fmt(2 * Math.PI * one.r))), row('Area', ro(S.fmt(Math.PI * one.r * one.r))));
          break;
        case 'arc':
          rows.push(num('Center X', (e) => e.cx, (e, v) => ({ ...e, cx: v })), num('Center Y', (e) => e.cy, (e, v) => ({ ...e, cy: v })),
            num('Radius', (e) => e.r, (e, v) => (v > 0 ? { ...e, r: v } : e)),
            num('Start angle', (e) => deg(e.a1), (e, v) => ({ ...e, a1: G.normAng(G.rad(v)) })), num('End angle', (e) => deg(e.a2), (e, v) => ({ ...e, a2: G.normAng(G.rad(v)) })));
          if (one) rows.push(row('Total angle', ro(S.fmt(G.deg(G.sweep(one.a1, one.a2)), 2) + '°')), row('Arc length', ro(S.fmt(one.r * G.sweep(one.a1, one.a2)))));
          break;
        case 'pline':
          rows.push(sel('Closed', [['1', 'Yes'], ['0', 'No']], (e) => (e.closed ? '1' : '0'), (e, v) => ({ ...e, closed: v === '1' })));
          if (one) rows.push(row('Vertices', ro(one.pts.length)), row('Length', ro(S.fmt(G.plineLength(one)))), ...(one.closed ? [row('Area', ro(S.fmt(G.plineArea(one))))] : []));
          break;
        case 'text':
          rows.push(str('Contents', (e) => e.text.replace(/\n/g, '\\P'), (e, v) => ({ ...e, text: v.replace(/\\P/g, '\n') })),
            num('Height', (e) => e.h, (e, v) => (v > 0 ? { ...e, h: v } : e)), num('Rotation', (e) => deg(e.rot || 0), (e, v) => ({ ...e, rot: G.rad(v) })),
            sel('Justify', [['left|baseline', 'Left'], ['center|baseline', 'Center'], ['right|baseline', 'Right'], ['center|middle', 'Middle'], ['left|top', 'Top Left'], ['center|top', 'Top Center'], ['right|top', 'Top Right'], ['left|middle', 'Middle Left'], ['right|middle', 'Middle Right'], ['left|bottom', 'Bottom Left'], ['center|bottom', 'Bottom Center'], ['right|bottom', 'Bottom Right']],
              (e) => `${e.ha || 'left'}|${e.va || 'baseline'}`, (e, v) => { const [ha, va] = v.split('|'); return { ...e, ha, va }; }),
            num('Position X', (e) => e.x, (e, v) => ({ ...e, x: v })), num('Position Y', (e) => e.y, (e, v) => ({ ...e, y: v })));
          break;
        case 'insert':
          if (one) rows.push(row('Name', ro(one.name)));
          rows.push(num('Position X', (e) => e.x, (e, v) => ({ ...e, x: v })), num('Position Y', (e) => e.y, (e, v) => ({ ...e, y: v })),
            num('Scale X', (e) => e.sx ?? 1, (e, v) => (v ? { ...e, sx: v } : e)), num('Scale Y', (e) => e.sy ?? 1, (e, v) => (v ? { ...e, sy: v } : e)),
            num('Rotation', (e) => deg(e.rot || 0), (e, v) => ({ ...e, rot: G.rad(v) })));
          break;
        case 'ellipse':
          rows.push(num('Center X', (e) => e.cx, (e, v) => ({ ...e, cx: v })), num('Center Y', (e) => e.cy, (e, v) => ({ ...e, cy: v })),
            num('Radius ratio', (e) => e.ratio, (e, v) => (v > 0 && v <= 1 ? { ...e, ratio: v } : e)));
          if (one) rows.push(row('Major radius', ro(S.fmt(Math.hypot(one.mx, one.my)))), row('Minor radius', ro(S.fmt(Math.hypot(one.mx, one.my) * one.ratio))));
          break;
        case 'point':
          rows.push(num('Position X', (e) => e.x, (e, v) => ({ ...e, x: v })), num('Position Y', (e) => e.y, (e, v) => ({ ...e, y: v })));
          break;
        case 'dim':
          if (one) { const txt = (G.dimGeometry(one, S.doc.settings.dimPrec).find((g) => g.type === 'text') || {}).text; rows.push(row('Measurement', ro(txt || ''))); }
          rows.push(str('Text override', (e) => e.text || '', (e, v) => { const n = { ...e }; if (v) n.text = v; else delete n.text; return n; }),
            num('Text height', (e) => e.h || 2.5, (e, v) => (v > 0 ? { ...e, h: v } : e)));
          break;
        case 'hatch':
          rows.push(sel('Pattern', ['SOLID', 'ANSI31', 'ANSI32', 'ANSI37', 'NET', 'LINE', 'DASH', 'BRICK', 'DOTS'].map((p) => [p, p]).concat(list.some((e) => !G.PATTERNS[e.pattern] && e.pattern !== 'SOLID') ? [[list[0].pattern, list[0].pattern]] : []),
            (e) => e.pattern, (e, v) => { const n = { ...e, pattern: v }; delete n.patLines; return n; }),
            num('Scale', (e) => e.scale || 1, (e, v) => (v > 0 ? (() => { const n = { ...e, scale: v }; delete n.patLines; return n; })() : e)),
            num('Angle', (e) => deg(e.angle || 0), (e, v) => { const n = { ...e, angle: G.rad(v) }; delete n.patLines; return n; }));
          if (one) rows.push(row('Area', ro(S.fmt(one.loops.reduce((s, l, i) => s + (i ? -1 : 1) * Math.abs(G.polyArea(l)), 0)))));
          break;
      }
      if (rows.length) body.append(group('Geometry', rows));
    }
    if (focusedName) { const f = body.querySelector(`[data-f="${focusedName}"]`); if (f) f.focus(); }
  }
  S.on('selection', () => { buildPalette(); refreshControls(); });
  S.on('doc', () => { buildPalette(); refreshControls(); });

  // ======================================================== dialogs
  function dialog(title, body, buttons, opts = {}) {
    return new Promise((resolve) => {
      const bg = h('div', { cls: 'modal-bg' });
      const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); S.inputEl.focus(); };
      const foot = h('div', { cls: 'df' }, buttons.map((b) => h('button', { cls: 'btn' + (b.primary ? ' primary' : ''), onclick: () => close(b.value === undefined ? b.get && b.get() : typeof b.value === 'function' ? b.value() : b.value) }, b.label)));
      const dlg = h('div', { cls: 'dlg', style: opts.width ? `width:${opts.width}px` : '' }, h('div', { cls: 'dh' }, h('span', {}, title), h('button', { onclick: () => close(opts.cancelValue) }, '×')), h('div', { cls: 'db' }, body), foot);
      bg.append(dlg);
      $('modal-root').append(bg);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(opts.cancelValue); }
        if (e.key === 'Enter' && opts.enterValue && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); e.stopPropagation(); close(opts.enterValue()); }
        if (e.key === 'Enter' && e.ctrlKey && opts.enterValue) { e.preventDefault(); close(opts.enterValue()); }
      };
      document.addEventListener('keydown', onKey, true);
      const first = dlg.querySelector('textarea, input, select');
      if (first) setTimeout(() => first.focus(), 0);
      if (opts.onOpen) opts.onOpen(dlg, close);
    });
  }
  S.dialog = dialog;
  S.alert = (title, text) => dialog(title, h('div', { style: 'max-width:520px; white-space:pre-wrap; line-height:1.5' }, text), [{ label: 'OK', primary: true, value: true }]);

  S.textDialog = (title, initial) => {
    const ta = h('textarea', { rows: 8, style: 'width:460px; font-family:Arial; font-size:14px; padding:6px' });
    ta.value = initial || '';
    return dialog(title, h('div', {}, ta, h('div', { style: 'color:#a3adba; margin-top:6px' }, 'Ctrl+Enter to accept')), [
      { label: 'OK', primary: true, get: () => ta.value.replace(/\s+$/, '') }, { label: 'Cancel', value: null },
    ], { cancelValue: null, enterValue: () => ta.value.replace(/\s+$/, '') });
  };
  S.on('edittext', async (e) => {
    const v = await S.textDialog('Edit Text', e.text);
    if (v == null || v === e.text) return;
    S.runningName = 'Edit text';
    if (v === '') S.remove([e]); else S.replace(new Map([[e, [{ ...e, text: v }]]]));
    S.endOp(); S.emit('doc');
  });
  S.blockPicker = (names) => {
    const s = h('select', { size: Math.min(12, Math.max(4, names.length)), style: 'width:320px' }, names.map((n) => h('option', { value: n }, `${n}   (${S.doc.blocks[n].entities.length} objects)`)));
    s.value = names[0];
    s.addEventListener('dblclick', () => document.querySelector('.modal-bg .btn.primary').click());
    return dialog('Insert Block', h('div', {}, h('div', { style: 'margin-bottom:6px' }, 'Block name:'), s), [{ label: 'OK', primary: true, get: () => s.value }, { label: 'Cancel', value: null }], { cancelValue: null, enterValue: () => s.value });
  };

  function colorPicker(initial) {
    let chosen;
    const body = h('div', {});
    const pick = (v) => { chosen = v; document.querySelector('.modal-bg .btn.primary').click(); };
    const grid = h('div', { cls: 'aci-grid' });
    for (let row = 0; row < 10; row++) for (let c = 0; c < 24; c++) {
      const i = 10 + c * 10 + row;
      grid.append(h('div', { style: `background:${G.ACI[i]}`, title: `Index color ${i}`, onclick: () => pick(i) }));
    }
    const std = h('div', { cls: 'aci-row' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => h('div', { style: `background:${G.ACI[i]}`, title: `${COLOR_NAMES[i] || 'Index color ' + i} (${i})`, onclick: () => pick(i) })),
      h('span', { style: 'width:14px' }), [250, 251, 252, 253, 254, 255].map((i) => h('div', { style: `background:${G.ACI[i]}`, title: `Index color ${i}`, onclick: () => pick(i) })));
    const tc = h('input', { type: 'color', value: typeof initial === 'string' ? initial : '#ff8800', style: 'width:60px;height:24px;padding:0' });
    body.append(h('div', { style: 'margin-bottom:8px;color:#a3adba' }, 'Index colors (ACI)'), grid, std,
      h('div', { style: 'display:flex; gap:8px; margin-top:12px; align-items:center' },
        h('button', { cls: 'btn', onclick: () => pick(null) }, 'ByLayer'), h('button', { cls: 'btn', onclick: () => pick(0) }, 'ByBlock'),
        h('span', { style: 'margin-left:14px;color:#a3adba' }, 'True color:'), tc, h('button', { cls: 'btn', onclick: () => pick(tc.value) }, 'Use')));
    return dialog('Select Color', body, [{ label: 'OK', primary: true, get: () => chosen }, { label: 'Cancel', value: undefined }], { cancelValue: undefined });
  }
  S.colorPicker = colorPicker;

  // ---------------- layer manager
  S.openLayerManager = () => {
    let selName = S.doc.clayer;
    const wrap = h('div', { style: 'max-height:60vh; overflow:auto; min-width:720px' });
    const mutate = (fn) => { S.runningName = 'Layer'; S.mark(); fn(); S.endOp(); S.refreshLayers(); S.clearCaches(); S.render(); S.emit('doc'); draw(); };
    const usage = () => { const u = new Map(); const visit = (l) => { for (const e of l) u.set(e.layer, (u.get(e.layer) || 0) + 1); }; visit(S.doc.entities); for (const b of Object.values(S.doc.blocks)) visit(b.entities); return u; };
    function draw() {
      wrap.innerHTML = '';
      const tb = h('table', { cls: 'ltable' });
      tb.append(h('tr', {}, ['Status', 'Name', 'On', 'Freeze', 'Lock', 'Color', 'Linetype', 'Lineweight', 'Objects'].map((x) => h('th', {}, x))));
      const u = usage();
      for (const l of S.doc.layers) {
        const name = h('input', { cls: 'nm', value: l.name });
        name.addEventListener('change', () => {
          const nv = name.value.trim();
          if (!nv || S.doc.layers.some((x) => x !== l && x.name === nv)) { S.msg('Invalid or duplicate layer name.', 'err'); draw(); return; }
          if (l.name === '0') { S.msg('Layer 0 cannot be renamed.', 'err'); draw(); return; }
          const old = l.name;
          mutate(() => {
            const idx = S.doc.layers.indexOf(l);
            S.doc.layers[idx] = { ...l, name: nv };
            const fix = (e) => (e.layer === old ? { ...e, layer: nv } : e);
            S.doc.entities = S.doc.entities.map(fix);
            const nb = {};
            for (const [k, b] of Object.entries(S.doc.blocks)) nb[k] = { ...b, entities: b.entities.map(fix) };
            S.doc.blocks = nb;
            if (S.doc.clayer === old) S.doc.clayer = nv;
            selName = nv;
          });
        });
        name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); e.stopPropagation(); });
        const setL = (patch) => mutate(() => { const idx = S.doc.layers.findIndex((x) => x.name === l.name); S.doc.layers[idx] = { ...S.doc.layers[idx], ...patch }; });
        const ltSel = h('select', {}, LTS.map((t) => h('option', { value: t }, t)));
        if (!LTS.includes(l.ltype)) ltSel.append(h('option', { value: l.ltype }, l.ltype));
        ltSel.value = l.ltype || 'CONTINUOUS';
        ltSel.addEventListener('change', () => setL({ ltype: ltSel.value }));
        const lwSel = h('select', {}, LWS.map((w) => h('option', { value: w }, w.toFixed(2) + ' mm')));
        lwSel.value = String(l.lw ?? 0.25);
        lwSel.addEventListener('change', () => setL({ lw: +lwSel.value }));
        const tr = h('tr', { cls: (l.name === S.doc.clayer ? 'cur ' : '') + (l.name === selName ? 'sel' : ''), onclick: () => { selName = l.name; [...tb.querySelectorAll('tr')].forEach((r) => r.classList.remove('sel')); tr.classList.add('sel'); }, ondblclick: (e) => { if (e.target.tagName !== 'INPUT') { S.doc.clayer = l.name; S.emit('doc'); draw(); } } },
          h('td', { cls: 'ic', title: 'Current layer' }, l.name === S.doc.clayer ? '✔' : ''),
          h('td', {}, name),
          h('td', { cls: 'ic', title: 'On/Off', onclick: () => setL({ on: l.on === false }) }, h('span', { style: `color:${l.on === false ? '#5b6472' : '#ffd166'}; font-size:15px` }, '●')),
          h('td', { cls: 'ic', title: 'Freeze/Thaw', onclick: () => { if (l.name === S.doc.clayer && !l.frozen) { S.msg('Cannot freeze the current layer.', 'err'); return; } setL({ frozen: !l.frozen }); } }, l.frozen ? '❄' : '☀'),
          h('td', { cls: 'ic', title: 'Lock/Unlock', onclick: () => setL({ locked: !l.locked }) }, l.locked ? '🔒' : '🔓'),
          h('td', { style: 'cursor:pointer', onclick: async () => { const c = await colorPicker(l.color); if (c !== undefined && c !== null && c !== 0) setL({ color: c }); } }, h('span', { style: 'display:flex;gap:6px;align-items:center' }, swatch(l.color), colorLabel(l.color))),
          h('td', {}, ltSel), h('td', {}, lwSel), h('td', { style: 'color:#a3adba' }, String(u.get(l.name) || 0)));
        tb.append(tr);
      }
      wrap.append(tb);
    }
    draw();
    const tools = h('div', { style: 'display:flex; gap:6px; margin-bottom:8px' },
      h('button', { cls: 'btn', onclick: () => {
        let i = 1; while (S.doc.layers.some((l) => l.name === `Layer${i}`)) i++;
        mutate(() => { S.doc.layers.push({ name: `Layer${i}`, color: 7, ltype: 'CONTINUOUS', on: true, frozen: false, locked: false, lw: 0.25 }); selName = `Layer${i}`; });
      } }, 'New Layer'),
      h('button', { cls: 'btn', onclick: () => {
        const l = S.layer(selName);
        if (!l) return;
        if (l.name === '0' || l.name === 'Defpoints') { S.alert('Delete Layer', `Layer "${l.name}" cannot be deleted.`); return; }
        if (l.name === S.doc.clayer) { S.alert('Delete Layer', 'The current layer cannot be deleted.'); return; }
        if (usage().get(l.name)) { S.alert('Delete Layer', `Layer "${l.name}" contains objects and cannot be deleted.`); return; }
        mutate(() => { S.doc.layers = S.doc.layers.filter((x) => x.name !== l.name); selName = S.doc.clayer; });
      } }, 'Delete Layer'),
      h('button', { cls: 'btn', onclick: () => { const l = S.layer(selName); if (l && !l.frozen) { S.doc.clayer = l.name; S.emit('doc'); draw(); } } }, 'Set Current'));
    return dialog('Layer Properties Manager', h('div', {}, tools, wrap), [{ label: 'Close', primary: true, value: true }]);
  };

  // ---------------- drafting settings
  S.openOsnapDialog = () => {
    const boxes = SNAPS.map(([k, label]) => {
      const cb = h('input', { type: 'checkbox' }); cb.checked = S.st.osmodes.has(k);
      return { k, cb, el: h('label', {}, cb, label) };
    });
    const on = h('input', { type: 'checkbox' }); on.checked = S.st.osnap;
    const polarOn = h('input', { type: 'checkbox' }); polarOn.checked = S.st.polar;
    const inc = h('select', {}, [90, 45, 30, 22.5, 18, 15, 10, 5].map((v) => h('option', { value: v }, v + '°'))); inc.value = String(S.st.polarInc);
    const grid = h('input', { type: 'number', value: S.st.gridSpacing, min: 0.0001, step: 'any', style: 'width:90px' });
    const snapS = h('input', { type: 'number', value: S.st.snapSpacing, min: 0.0001, step: 'any', style: 'width:90px' });
    const body = h('div', { style: 'min-width:420px' },
      h('label', { style: 'display:flex;gap:8px;margin-bottom:10px;font-weight:600' }, on, 'Object Snap On (F3)'),
      h('div', { cls: 'osgrid' }, boxes.map((b) => b.el)),
      h('div', { style: 'display:flex; gap:8px; margin-top:12px' },
        h('button', { cls: 'btn', onclick: () => boxes.forEach((b) => (b.cb.checked = true)) }, 'Select All'),
        h('button', { cls: 'btn', onclick: () => boxes.forEach((b) => (b.cb.checked = false)) }, 'Clear All')),
      h('hr', { style: 'border:0;border-top:1px solid #4b5463;margin:14px 0' }),
      h('div', { style: 'display:grid; grid-template-columns: 170px 1fr; gap:8px; align-items:center' },
        h('label', { style: 'display:flex;gap:8px' }, polarOn, 'Polar Tracking On (F10)'), h('span', {}, 'Increment angle: ', inc),
        h('span', {}, 'Grid spacing'), grid, h('span', {}, 'Snap spacing (F9)'), snapS));
    return dialog('Drafting Settings', body, [
      { label: 'OK', primary: true, value: () => {
        S.st.osmodes = new Set(boxes.filter((b) => b.cb.checked).map((b) => b.k));
        S.st.osnap = on.checked; S.st.polar = polarOn.checked; S.st.polarInc = +inc.value;
        if (+grid.value > 0) S.st.gridSpacing = +grid.value; if (+snapS.value > 0) S.st.snapSpacing = +snapS.value;
        S.saveSettings(); buildStatus(); S.render(); return true;
      } },
      { label: 'Cancel', value: false },
    ]);
  };

  // ---------------- help
  S.showHelp = () => {
    const groups = {};
    for (const c of Object.values(S.commands)) (groups[c.group] = groups[c.group] || []).push(c);
    const body = h('div', { cls: 'helpgrid', style: 'width:760px' });
    const order = ['Draw', 'Modify', 'Annotate', 'Block', 'Layers', 'Utilities', 'View', 'Settings', 'Edit', 'File', 'Help', 'Other'];
    for (const g of order) {
      if (!groups[g]) continue;
      body.append(h('div', { cls: 'h' }, g));
      for (const c of groups[g].sort((a, b) => a.name.localeCompare(b.name))) {
        const al = Object.entries(S.aliases).filter(([, v]) => v === c.name).map(([k]) => k).join(', ');
        body.append(h('div', { cls: 'c' }, c.name), h('div', { cls: 'a' }, al), h('div', { cls: 'd' }, c.desc));
      }
    }
    body.append(h('div', { cls: 'h' }, 'Keys & mouse'));
    for (const [k, d] of [['Enter / Space', 'Finish input or repeat the last command'], ['Esc', 'Cancel the current command / clear selection'], ['F1', 'This reference'], ['F2', 'Expand command history'], ['F3', 'Object snap on/off'], ['F7', 'Grid'], ['F8', 'Ortho'], ['F9', 'Snap'], ['F10', 'Polar tracking'], ['F12', 'Dynamic input'], ['Ctrl+1', 'Properties palette'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Wheel', 'Zoom at cursor'], ['Middle drag', 'Pan'], ['Middle double-click', 'Zoom extents'], ['Shift+Right click', 'Object snap overrides'], ['Coordinates', 'x,y   @dx,dy   @dist<angle   or type a distance to follow the cursor direction']]) {
      body.append(h('div', { cls: 'c' }, k), h('div', {}), h('div', { cls: 'd' }, d));
    }
    return dialog('DraftForge Command Reference', body, [{ label: 'Close', primary: true, value: true }]);
  };

  // ======================================================== files
  const untitled = { n: 1 };
  const baseName = (p) => String(p).split(/[\\/]/).pop();
  const normalizeDoc = (d) => {
    const base = S.newDoc();
    const doc = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) }, blocks: d.blocks || {}, entities: Array.isArray(d.entities) ? d.entities : [] };
    if (!Array.isArray(doc.layers) || !doc.layers.length) doc.layers = base.layers;
    if (!doc.layers.some((l) => l.name === '0')) doc.layers.unshift(base.layers[0]);
    const known = new Set(doc.layers.map((l) => l.name));
    const visit = (list) => { for (const e of list) if (e.layer && !known.has(e.layer)) { known.add(e.layer); doc.layers.push({ name: e.layer, color: 7, ltype: 'CONTINUOUS', on: true, frozen: false, locked: false, lw: 0.25 }); } };
    visit(doc.entities); for (const b of Object.values(doc.blocks)) visit(b.entities || []);
    if (!known.has(doc.clayer)) doc.clayer = '0';
    return doc;
  };
  S.setDoc = (doc, file) => {
    S.doc = normalizeDoc(doc);
    S.file = { path: null, name: 'Drawing1.dfg', kind: 'dfg', dirty: false, ...file };
    S.undoStack.length = 0; S.redoStack.length = 0;
    S.selection.clear(); S.refreshLayers(); S.clearCaches();
    S.emit('doc'); S.emit('selection'); updateTitle();
    S.zoomExtents();
  };
  async function confirmDiscard() {
    if (!S.file.dirty) return true;
    if (desk) {
      const r = await desk.confirmDiscard();
      if (r === 'cancel') return false;
      if (r === 'save') return S.fileSave(false);
      return true;
    }
    const v = await dialog('DraftForge', h('div', {}, `Save changes to ${S.file.name}?`), [{ label: 'Save', primary: true, value: 'save' }, { label: "Don't Save", value: 'discard' }, { label: 'Cancel', value: 'cancel' }], { cancelValue: 'cancel' });
    if (v === 'cancel') return false;
    if (v === 'save') return S.fileSave(false);
    return true;
  }
  S.fileNew = async () => {
    if (!(await confirmDiscard())) return;
    untitled.n++;
    S.setDoc(S.newDoc(), { name: `Drawing${untitled.n}.dfg` });
    S.view = { cx: 50, cy: 50, scale: Math.min(S.size().W, S.size().H) / 120 }; S.render();
    S.msg('New drawing created.');
  };
  function loadFile(f) {
    try {
      if (f.error) throw new Error(f.error);
      const kind = f.kind || (/\.dxf$/i.test(f.path || f.name) ? 'dxf' : /\.dwg$/i.test(f.path || f.name) ? 'dwg' : 'dfg');
      let res;
      if (kind === 'dwg') res = { doc: f.doc, stats: f.stats };
      else if (kind === 'dxf') res = DXF.readDxf(f.text);
      else {
        const d = JSON.parse(f.text);
        if (!d || !Array.isArray(d.entities)) throw new Error('Not a DraftForge drawing.');
        res = { doc: d };
      }
      const name = baseName(f.path || f.name || 'Drawing');
      S.setDoc(res.doc, { path: f.path || null, name, kind });
      const st = res.stats;
      S.msg(`Opened ${name}: ${S.doc.entities.length} objects, ${S.doc.layers.length} layers, ${Object.keys(S.doc.blocks).length} block definitions.`);
      if (st && st.skipped && Object.keys(st.skipped).length) {
        S.msg(`Not displayed (unsupported object types): ${Object.entries(st.skipped).map(([k, v]) => `${k} x${v}`).join(', ')}`);
      }
      if (kind === 'dwg') S.msg('DWG files open for viewing and editing. Use Save As to keep your changes as DXF or DFG.');
      remember(f.path);
    } catch (err) {
      console.error(err);
      S.msg('Could not open file: ' + err.message, 'err');
      S.alert('Open failed', `${baseName(f.path || f.name || '')}\n\n${err.message}`);
    }
  }
  S.loadFile = loadFile;
  S.fileOpen = async () => {
    if (!(await confirmDiscard())) return;
    if (desk) {
      const f = await desk.openDialog();
      if (f) loadFile(f);
      return;
    }
    const inp = h('input', { type: 'file', accept: '.dfg,.dxf,.json' });
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      if (/\.dwg$/i.test(file.name)) { S.alert('Open', 'Opening DWG files requires the desktop app.'); return; }
      loadFile({ name: file.name, text: await file.text() });
    };
    inp.click();
  };
  const serialize = () => JSON.stringify({ format: 'DraftForge', ...S.doc });
  const download = (name, data, type) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  async function writeOut(kind, defaultName, filters, makeData, encoding) {
    if (desk) {
      const path = await desk.saveDialog(defaultName, filters);
      if (!path) return null;
      await desk.writeFile(path, makeData(path), encoding);
      return path;
    }
    const data = makeData(defaultName);
    if (encoding === 'base64') { const bin = atob(data), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); download(defaultName, new Blob([arr], { type: 'image/png' })); }
    else download(defaultName, data, 'text/plain');
    return defaultName;
  }
  const stem = () => S.file.name.replace(/\.[^.]+$/, '');
  S.fileSave = async (saveAs) => {
    try {
      if (!saveAs && S.file.path && desk && (S.file.kind === 'dfg' || S.file.kind === 'dxf')) {
        await desk.writeFile(S.file.path, S.file.kind === 'dxf' ? DXF.writeDxf(S.doc) : serialize());
        S.setDirty(false); S.msg(`Saved ${S.file.name}`); return true;
      }
      if (!saveAs && S.file.kind === 'dwg') S.msg('Saving back to DWG is not supported; choose DXF (opens in any CAD program) or DFG.');
      const path = await writeOut('save', stem() + '.dfg', [{ name: 'DraftForge Drawing (*.dfg)', extensions: ['dfg'] }, { name: 'DXF R12 (*.dxf)', extensions: ['dxf'] }],
        (p) => (/\.dxf$/i.test(p) ? DXF.writeDxf(S.doc) : serialize()));
      if (!path) return false;
      S.file = { ...S.file, path: desk ? path : null, name: baseName(path), kind: /\.dxf$/i.test(path) ? 'dxf' : 'dfg' };
      S.setDirty(false); remember(desk ? path : null);
      S.msg(`Saved ${S.file.name}`);
      return true;
    } catch (err) {
      S.msg('Save failed: ' + err.message, 'err'); S.alert('Save failed', err.message); return false;
    }
  };
  S.exportFile = async (kind) => {
    try {
      let path;
      if (kind === 'dxf') path = await writeOut(kind, stem() + '.dxf', [{ name: 'DXF R12 (*.dxf)', extensions: ['dxf'] }], () => DXF.writeDxf(S.doc));
      else if (kind === 'svg') path = await writeOut(kind, stem() + '.svg', [{ name: 'SVG (*.svg)', extensions: ['svg'] }], () => buildSvg());
      else path = await writeOut(kind, stem() + '.png', [{ name: 'PNG image (*.png)', extensions: ['png'] }], () => buildPng(), 'base64');
      if (path) S.msg(`Exported ${baseName(path)}`);
    } catch (err) { S.msg('Export failed: ' + err.message, 'err'); }
  };
  function buildPng() {
    const { W, H } = S.size(), c = document.createElement('canvas');
    c.width = W * 2; c.height = H * 2;
    S.drawDoc(c.getContext('2d'), { W, H, DPR: 2, view: S.view, plot: true });
    return c.toDataURL('image/png').split(',')[1];
  }
  function buildSvg() {
    const bb = S.extents() || [0, 0, 100, 100];
    const pad = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.02 + 1e-6;
    const [x0, y0, x1, y1] = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
    const n = (v) => +(+v).toFixed(6);
    const out = [];
    const colorOf = (e, inh) => {
      let c = e.color;
      if (c === 0) c = inh ? inh.color : 7;
      if (c == null) { const l = S.layer(e.layer === '0' && inh ? inh.layer : e.layer); c = l ? l.color : 7; }
      return { c, css: S.colorCss(c, true) };
    };
    const pathOf = (prims) => prims.map((p) => {
      if (p.k === 'L') return `M${n(p.a.x)} ${n(p.a.y)}L${n(p.b.x)} ${n(p.b.y)}`;
      if (p.full) return `M${n(p.c.x + p.r)} ${n(p.c.y)}A${n(p.r)} ${n(p.r)} 0 1 1 ${n(p.c.x - p.r)} ${n(p.c.y)}A${n(p.r)} ${n(p.r)} 0 1 1 ${n(p.c.x + p.r)} ${n(p.c.y)}`;
      const s = G.polar(p.c, p.a1, p.r), e = G.polar(p.c, p.a2, p.r), large = G.sweep(p.a1, p.a2) > Math.PI ? 1 : 0;
      return `M${n(s.x)} ${n(s.y)}A${n(p.r)} ${n(p.r)} 0 ${large} 1 ${n(e.x)} ${n(e.y)}`;
    }).join('');
    const emit = (e, inh) => {
      const l = S.layer(e.layer === '0' && inh ? inh.layer : e.layer);
      if (l && (l.on === false || l.frozen)) return;
      const { c, css } = colorOf(e, inh);
      switch (e.type) {
        case 'text': {
          const box = G.textBox(e);
          const anchor = e.ha === 'center' || e.ha === 'middle' ? 'middle' : e.ha === 'right' ? 'end' : 'start';
          out.push(`<g transform="translate(${n(e.x)} ${n(e.y)}) rotate(${n(G.deg(e.rot || 0))}) scale(${n(e.wf || 1)} -1)">`);
          box.lines.forEach((ln, i) => out.push(`<text x="0" y="${n(-(box.oy - i * box.gap))}" font-family="Arial" font-size="${n(e.h / 0.716)}" text-anchor="${anchor}" fill="${css}">${esc(ln)}</text>`));
          out.push('</g>');
          break;
        }
        case 'solid': out.push(`<path d="M${e.pts.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}Z" fill="${css}"/>`); break;
        case 'hatch': {
          const d = e.loops.map((lp) => 'M' + lp.map((p) => `${n(p.x)} ${n(p.y)}`).join('L') + 'Z').join('');
          out.push(e.pattern === 'SOLID' ? `<path d="${d}" fill="${css}" fill-rule="evenodd"/>` : `<path d="${d}" fill="${css}" fill-opacity="0.25" fill-rule="evenodd" stroke="${css}" stroke-width="0.5" vector-effect="non-scaling-stroke"/>`);
          break;
        }
        case 'dim': for (const g of G.dimGeometry(e, S.doc.settings.dimPrec)) emit({ ...g, layer: e.layer, color: e.color }, inh); break;
        case 'insert': {
          const blk = S.doc.blocks[e.name];
          if (blk) {
            const m = G.M.insert(e, blk.base);
            out.push(`<g transform="matrix(${m.map(n).join(' ')})">`);
            for (const ch of blk.entities) emit(ch, { layer: e.layer === '0' && inh ? inh.layer : e.layer, color: c });
            out.push('</g>');
          }
          for (const a of e.attribs || []) emit(a, inh);
          break;
        }
        case 'point': out.push(`<circle cx="${n(e.x)}" cy="${n(e.y)}" r="${n((x1 - x0) / 800)}" fill="${css}"/>`); break;
        case 'xline': break;
        default: out.push(`<path d="${pathOf(G.prims(e, S.ctx()))}" fill="none" stroke="${css}" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`);
      }
    };
    for (const e of S.doc.entities) emit(e, null);
    const w = x1 - x0, hh = y1 - y0;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(hh)}" width="${Math.round(Math.min(2000, 1000 * w / Math.max(w, hh)))}" height="${Math.round(Math.min(2000, 1000 * hh / Math.max(w, hh)))}">\n<rect width="100%" height="100%" fill="#ffffff"/>\n<g transform="matrix(1 0 0 -1 ${n(-x0)} ${n(y1)})">\n${out.join('\n')}\n</g>\n</svg>\n`;
  }

  // recent files + start tab
  const recentKey = 'df-recent';
  function remember(path) {
    if (!path) return;
    try { const r = JSON.parse(localStorage.getItem(recentKey) || '[]').filter((p) => p !== path); r.unshift(path); localStorage.setItem(recentKey, JSON.stringify(r.slice(0, 10))); } catch (_) { /* ignore */ }
  }
  function showStart() {
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem(recentKey) || '[]'); } catch (_) { /* ignore */ }
    const body = h('div', { style: 'width:560px' },
      h('div', { style: 'font-size:22px; font-weight:700; margin-bottom:4px' }, 'DraftForge'),
      h('div', { style: 'color:#a3adba; margin-bottom:16px' }, '2D drafting with a command-line workflow. Opens DWG and DXF drawings.'),
      h('div', { style: 'display:flex; gap:10px; margin-bottom:18px' },
        h('button', { cls: 'btn primary', onclick: () => { document.querySelector('.modal-bg .dh button').click(); S.fileNew(); } }, 'New Drawing'),
        h('button', { cls: 'btn', onclick: () => { document.querySelector('.modal-bg .dh button').click(); S.fileOpen(); } }, 'Open Files...')),
      h('div', { style: 'font-weight:600; margin-bottom:6px' }, 'Recent documents'),
      recent.length && desk ? h('div', {}, recent.map((p) => h('div', { style: 'padding:5px 8px; cursor:pointer; border-bottom:1px solid #39404b', onclick: async () => {
        document.querySelector('.modal-bg .dh button').click();
        if (!(await confirmDiscard())) return;
        loadFile(await desk.openPath(p));
      } }, h('div', {}, baseName(p)), h('div', { style: 'color:#7f8a99; font-size:11px' }, p)))) : h('div', { style: 'color:#7f8a99' }, 'No recent documents.'));
    dialog('Start', body, [{ label: 'Close', value: true }]);
  }
  $('tab-start').addEventListener('click', showStart);
  $('tab-new').addEventListener('click', () => S.fileNew());
  $('tab-close').addEventListener('click', (e) => { e.stopPropagation(); S.fileNew(); });

  // drag & drop
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!(await confirmDiscard())) return;
    if (desk && desk.pathForFile) { const p = desk.pathForFile(file); if (p) { loadFile(await desk.openPath(p)); return; } }
    if (/\.dwg$/i.test(file.name)) { S.alert('Open', 'Opening DWG files requires the desktop app.'); return; }
    loadFile({ name: file.name, text: await file.text() });
  });

  // desktop integration
  S.quit = async () => { if (await confirmDiscard()) { if (desk) desk.reallyClose(); } };
  if (desk) {
    desk.onMenu(async (cmd) => {
      if (cmd === 'APP_CLOSE') { S.quit(); return; }
      if (cmd === 'ZOOM E') { S.zoomExtents(); return; }
      const map = { NEW: 'NEW', OPEN: 'OPEN', SAVE: 'QSAVE', SAVEAS: 'SAVEAS', DXFOUT: 'DXFOUT', SVGOUT: 'SVGOUT', PNGOUT: 'PNGOUT', UNDO: 'U', REDO: 'REDO', HELP: 'HELP', GRID: 'GRID', SELECTALL: 'SELECTALL' };
      if (map[cmd]) run(map[cmd]);
    });
    desk.onFileOpened((f) => loadFile(f));
  }

  // ======================================================== boot
  buildRibbon();
  buildStatus();
  updateTitle();
  S.zoomExtents();
  S.view = { cx: 100, cy: 60, scale: Math.max(1, Math.min(S.size().W / 260, S.size().H / 160)) };
  S.render();
  S.msg('DraftForge 1.0  -  type a command or click a tool. F1 shows every command and alias.');
  S.msg('Tip: L = LINE, C = CIRCLE, TR = TRIM, M = MOVE. Enter or Space repeats the last command.');
  S.inputEl.focus();
  window.addEventListener('beforeunload', (e) => { if (!desk && S.file.dirty) { e.preventDefault(); e.returnValue = ''; } });
})();
