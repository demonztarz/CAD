/* DraftForge layouts: paper space, viewports, title blocks, attributes, plotting and PDF output. */
(function () {
  'use strict';
  const S = window.App;
  const { P, M } = G;
  const R = S.register;
  const $ = (id) => document.getElementById(id);
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
    for (const c of kids.flat(Infinity)) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };

  // ============================================================ scales
  // a viewport scale is paper millimetres per model unit
  const SCALES = [[1, 1], [1, 2], [1, 5], [1, 10], [1, 20], [1, 25], [1, 50], [1, 100], [1, 200], [1, 250], [1, 500], [1, 1000], [1, 2000], [1, 5000], [2, 1], [5, 1], [10, 1], [20, 1], [50, 1], [100, 1]];
  const scaleValue = ([a, b]) => a / b;
  S.scaleLabel = (k) => {
    for (const sc of SCALES) if (Math.abs(scaleValue(sc) - k) < 1e-9 * Math.max(1, k)) return `${sc[0]}:${sc[1]}`;
    return k >= 1 ? `${G.fmtNum(k, 4).replace(/\.?0+$/, '')}:1` : `1:${G.fmtNum(1 / k, 4).replace(/\.?0+$/, '')}`;
  };
  S.parseScale = (str) => {
    const m = String(str).trim().match(/^(\d*\.?\d+)\s*[:=/]\s*(\d*\.?\d+)$/);
    if (m && +m[1] > 0 && +m[2] > 0) return +m[1] / +m[2];
    const v = parseFloat(str);
    return v > 0 ? v : null;
  };
  // largest standard scale that still fits, falling back to the exact value for tiny/huge drawings
  const fitScale = (raw) => {
    const std = SCALES.map(scaleValue).filter((k) => k <= raw * (1 + 1e-9)).sort((a, b) => b - a)[0];
    return std && std >= raw / 20 ? std : raw;
  };

  // ============================================================ layouts
  const newLayout = (name) => ({ name, paper: 'A3', orient: 'landscape', style: 'monochrome', entities: [], init: false });
  const layouts = () => (S.doc.layouts = S.doc.layouts || []);
  S.views = {};
  const vpLayer = () => { S.ensureLayer('Defpoints'); return 'Defpoints'; };

  S.fitViewport = (vp) => {
    const bb = S.extents(S.doc.entities);
    if (!bb) return { ...vp, cx: vp.w / 2, cy: vp.h / 2, scale: 1 };
    const bw = Math.max(1e-9, bb[2] - bb[0]), bh = Math.max(1e-9, bb[3] - bb[1]);
    const raw = Math.min(vp.w / (bw * 1.06), vp.h / (bh * 1.06));
    return { ...vp, cx: (bb[0] + bb[2]) / 2, cy: (bb[1] + bb[3]) / 2, scale: fitScale(raw) };
  };

  function initLayout(l) {
    if (l.init) return;
    l.init = true;
    const [pw, ph] = S.paperSize(l);
    // default viewport inside the drawing frame, leaving room for a title block strip
    const vp = S.fitViewport({ type: 'viewport', layer: vpLayer(), x: 25, y: 70, w: pw - 40, h: ph - 85, cx: 0, cy: 0, scale: 1 });
    l.entities = [...l.entities, vp];
  }

  S.setSpace = (name) => {
    if (S.input) S.cancelInput();
    S.views[S.space || '*model'] = { ...S.view };
    S.space = name;
    if (name) S.lastLayout = name;
    const l = S.layoutObj();
    if (name && !l) S.space = null;
    if (l) initLayout(l);
    S.selection.clear();
    S.clearCaches();
    const v = S.views[S.space || '*model'];
    if (v) { S.view = { ...v }; S.render(); } else S.zoomExtents();
    S.emit('space'); S.emit('selection'); S.emit('doc');
    S.msg(S.space ? `Switched to layout "${S.space}" (paper space, millimetres).` : 'Switched to Model space.');
  };
  S.on('space', () => buildTabs());

  function uniqueName(base) {
    let i = 1;
    while (layouts().some((l) => l.name === `${base}${i}`)) i++;
    return `${base}${i}`;
  }
  S.newLayout = (switchTo = true) => {
    S.runningName = 'New layout'; S.mark();
    const l = newLayout(uniqueName('Layout'));
    S.doc.layouts = [...layouts(), l];
    S.endOp();
    if (switchTo) S.setSpace(l.name); else buildTabs();
    return l;
  };
  S.renameLayout = async (oldName) => {
    const nv = await S.promptDialog('Rename Layout', 'Layout name:', oldName);
    if (!nv || nv === oldName) return;
    if (nv.toLowerCase() === 'model' || layouts().some((l) => l.name === nv)) { S.alert('Rename Layout', `A layout named "${nv}" already exists or the name is reserved.`); return; }
    S.runningName = 'Rename layout'; S.mark();
    S.doc.layouts = layouts().map((l) => (l.name === oldName ? { ...l, name: nv } : l));
    S.endOp();
    if (S.space === oldName) S.space = nv;
    buildTabs();
  };
  S.deleteLayout = async (name) => {
    const ok = await S.dialog('Delete Layout', h('div', {}, `Delete layout "${name}" and everything drawn on it?`), [{ label: 'Delete', primary: true, value: true }, { label: 'Cancel', value: false }], { cancelValue: false });
    if (!ok) return;
    if (S.space === name) S.setSpace(null);
    S.runningName = 'Delete layout'; S.mark();
    S.doc.layouts = layouts().filter((l) => l.name !== name);
    S.endOp();
    buildTabs();
  };

  // ------------------------------------------------------------ tabs in the status bar
  function buildTabs() {
    const host = document.querySelector('#statusbar .layouts');
    if (!host) return;
    host.innerHTML = '';
    const tab = (label, name) => {
      const el = h('div', { cls: 'ltab' + ((S.space || null) === name ? ' active' : ''), title: name ? `${label} - right-click for options` : 'Model space' }, label);
      el.addEventListener('click', () => { if ((S.space || null) !== name) S.setSpace(name); });
      el.addEventListener('dblclick', () => { if (name) S.renameLayout(name); });
      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        const items = [{ label: 'New Layout', act: () => S.newLayout() }];
        if (name) items.push({ label: 'Rename', act: () => S.renameLayout(name) }, { label: 'Delete', act: () => S.deleteLayout(name) }, '-',
          { label: 'Page Setup...', act: () => { if (S.space !== name) S.setSpace(name); S.runCommand('PAGESETUP'); } });
        items.push({ label: 'Plot / Export PDF...', act: () => { if ((S.space || null) !== name) S.setSpace(name); S.runCommand('PLOT'); } });
        S.showMenu(ev.clientX, ev.clientY - 10, items);
      });
      host.append(el);
    };
    tab('Model', null);
    for (const l of layouts()) tab(l.name, l.name);
    host.append(h('div', { cls: 'ltab plus', title: 'New layout', onclick: () => S.newLayout() }, '+'));
    const mb = document.querySelector('#toggles .tg.text');
    if (mb) mb.textContent = S.space ? 'PAPER' : 'MODEL';
  }
  S.buildLayoutTabs = buildTabs;
  S.on('doc', () => { if (S.space && !S.layoutObj()) S.space = null; buildTabs(); });

  // ============================================================ attributes and title blocks
  // Attribute definition: a text entity with `tag` (and optional `prompt`); its `text` is the default value.
  // Attribute instance on a block reference: a text entity in insert.attribs with `attr` = tag.
  S.attDefs = (blk) => (blk ? blk.entities.filter(G.isAttDef) : []);
  S.makeAttribs = (blk, ins, values) => {
    const m = M.insert(ins, blk.base);
    return S.attDefs(blk).map((d) => {
      const t = G.transformEntity({ ...d }, m);
      delete t.tag; delete t.prompt;
      return { ...t, attr: d.tag, text: values[d.tag] != null ? String(values[d.tag]) : d.text || '', layer: d.layer === '0' ? ins.layer : d.layer };
    });
  };
  S.attributeDialog = (title, defs, values = {}) => {
    const inputs = {};
    const body = h('div', { style: 'display:grid; grid-template-columns: 170px 320px; gap:6px 10px; align-items:center' },
      defs.map((d) => {
        const inp = h('input', { value: values[d.tag] ?? d.text ?? '', style: 'height:24px; padding:0 6px' });
        inp.addEventListener('keydown', (e) => e.stopPropagation());
        inputs[d.tag] = inp;
        return [h('label', { title: d.tag }, d.prompt || d.tag), inp];
      }));
    const collect = () => Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.value]));
    return S.dialog(title, body, [{ label: 'OK', primary: true, get: collect }, { label: 'Cancel', value: null }], { cancelValue: null, enterValue: collect });
  };
  S.editAttributes = async (ins) => {
    const atts = ins.attribs || [];
    if (!atts.length) { S.msg('This block reference has no attributes.', 'err'); return; }
    const blk = S.doc.blocks[ins.name];
    const defs = atts.map((a, i) => {
      const d = (S.attDefs(blk).find((x) => x.tag === a.attr)) || {};
      return { tag: a.attr || `ATTR${i + 1}`, prompt: d.prompt || a.attr || `Attribute ${i + 1}`, text: a.text };
    });
    const vals = await S.attributeDialog(`Edit Attributes - ${ins.name}`, defs);
    if (!vals) return;
    S.runningName = 'Edit attributes';
    const n = { ...ins, attribs: atts.map((a, i) => ({ ...a, text: vals[defs[i].tag] ?? a.text })) };
    S.replace(new Map([[ins, [n]]])); S.endOp();
    S.emit('doc');
  };
  S.on('editattribs', (e) => S.editAttributes(e));

  // ISO 5457-style frame (20 mm binding margin, 10 mm elsewhere) and a 180 mm title block
  function titleBlockDef(pw, ph) {
    const ents = [];
    const L = (x1, y1, x2, y2, lw = 0.25) => ents.push({ type: 'line', x1, y1, x2, y2, layer: '0', lw });
    const rect = (x0, y0, x1, y1, lw) => { L(x0, y0, x1, y0, lw); L(x1, y0, x1, y1, lw); L(x1, y1, x0, y1, lw); L(x0, y1, x0, y0, lw); };
    const label = (x, y, t) => ents.push({ type: 'text', x, y, h: 1.8, rot: 0, text: t, ha: 'left', va: 'top', layer: '0' });
    const att = (x, y, tag, prompt, def, hh = 3.5, ha = 'left') => ents.push({ type: 'text', x, y, h: hh, rot: 0, text: def, tag, prompt, ha, va: 'middle', layer: '0' });
    const fx0 = 20, fy0 = 10, fx1 = pw - 10, fy1 = ph - 10;
    rect(fx0, fy0, fx1, fy1, 0.7);
    // centring marks
    L(pw / 2, 0, pw / 2, fy0, 0.5); L(pw / 2, ph, pw / 2, fy1, 0.5); L(0, ph / 2, fx0, ph / 2, 0.5); L(pw, ph / 2, fx1, ph / 2, 0.5);
    const W = Math.min(180, fx1 - fx0), x0 = fx1 - W, y0 = fy0, rows = [10, 10, 14, 12];
    const top = y0 + rows.reduce((a, b) => a + b, 0);
    rect(x0, y0, fx1, top, 0.5);
    const c = W / 4;
    // row 1 (bottom): SCALE | DATE | DRAWN | CHECKED
    let y = y0;
    L(x0, y + rows[0], fx1, y + rows[0]);
    for (let i = 1; i < 4; i++) L(x0 + c * i, y, x0 + c * i, y + rows[0]);
    [['SCALE', 'Scale', 'Scale', '1:1'], ['DATE', 'Date', 'Date', new Date().toISOString().slice(0, 10)], ['DRAWN', 'Drawn by', 'Drawn by', ''], ['CHECKED', 'Checked by', 'Checked', '']]
      .forEach(([tag, prompt, lab, def], i) => { label(x0 + c * i + 1.5, y + rows[0] - 1.2, lab); att(x0 + c * i + 2, y + rows[0] * 0.38, tag, prompt, def, 3); });
    // row 2: DWGNO | REV | SHEET
    y += rows[0];
    L(x0, y + rows[1], fx1, y + rows[1]);
    L(x0 + W * 0.5, y, x0 + W * 0.5, y + rows[1]); L(x0 + W * 0.66, y, x0 + W * 0.66, y + rows[1]);
    label(x0 + 1.5, y + rows[1] - 1.2, 'Drawing No.'); att(x0 + 2, y + rows[1] * 0.38, 'DWGNO', 'Drawing number', 'DWG-001', 3.5);
    label(x0 + W * 0.5 + 1.5, y + rows[1] - 1.2, 'Rev'); att(x0 + W * 0.5 + 2, y + rows[1] * 0.38, 'REV', 'Revision', 'A', 3.5);
    label(x0 + W * 0.66 + 1.5, y + rows[1] - 1.2, 'Sheet'); att(x0 + W * 0.66 + 2, y + rows[1] * 0.38, 'SHEET', 'Sheet', '1 of 1', 3.5);
    // row 3: TITLE
    y += rows[1];
    L(x0, y + rows[2], fx1, y + rows[2]);
    label(x0 + 1.5, y + rows[2] - 1.2, 'Title'); att(x0 + 2, y + rows[2] * 0.4, 'TITLE', 'Drawing title', 'DRAWING TITLE', 5);
    // row 4: PROJECT | COMPANY
    y += rows[2];
    L(x0 + W * 0.6, y, x0 + W * 0.6, y + rows[3]);
    label(x0 + 1.5, y + rows[3] - 1.2, 'Project'); att(x0 + 2, y + rows[3] * 0.4, 'PROJECT', 'Project', 'PROJECT NAME', 3.5);
    label(x0 + W * 0.6 + 1.5, y + rows[3] - 1.2, 'Company'); att(x0 + W * 0.6 + 2, y + rows[3] * 0.4, 'COMPANY', 'Company / organisation', 'COMPANY', 3.5);
    return { base: { x: 0, y: 0 }, entities: ents };
  }
  S.titleBlockName = (paper, orient) => `DF_TITLE_${String(paper).replace(/\W+/g, '')}_${orient === 'portrait' ? 'P' : 'L'}`;

  R('TITLEBLOCK', async () => {
    const lay = S.layoutObj();
    let paper, orient, scale = 1, at = P(0, 0);
    if (lay) { paper = lay.paper; orient = lay.orient; }
    else {
      paper = await S.getKeyword('Paper size', Object.keys(S.PAPERS), 'A3');
      orient = await S.getKeyword('Orientation', ['Landscape', 'Portrait'], 'Landscape');
      orient = orient.toLowerCase();
      const sc = await S.getString('Drawing scale for the title block, e.g. 1:100', { def: '1:1' });
      const k = S.parseScale(sc || '1:1');
      if (!k) { S.msg('Invalid scale.', 'err'); return; }
      scale = 1 / k;
      const [pw, ph] = S.paperSize({ paper, orient });
      at = await S.getPoint('Specify lower-left corner of the sheet', { noRubber: true, preview: (p) => [{ type: 'pline', closed: true, pts: [P(p.x, p.y), P(p.x + pw * scale, p.y), P(p.x + pw * scale, p.y + ph * scale), P(p.x, p.y + ph * scale)].map((q) => ({ ...q, b: 0 })), color: 8 }] });
    }
    const [pw, ph] = S.paperSize({ paper, orient });
    const name = S.titleBlockName(paper, orient);
    S.runningName = 'TITLEBLOCK';
    S.mark();
    if (!S.doc.blocks[name]) { S.doc.blocks = { ...S.doc.blocks, [name]: titleBlockDef(pw, ph) }; S.clearCaches(); }
    S.ensureLayer('TITLEBLOCK');
    const blk = S.doc.blocks[name];
    const defaults = {};
    const vp = lay && lay.entities.find((e) => e.type === 'viewport');
    defaults.SCALE = vp ? S.scaleLabel(vp.scale) : S.scaleLabel(1 / scale);
    defaults.TITLE = S.file.name.replace(/\.[^.]+$/, '').toUpperCase();
    const vals = await S.attributeDialog('Title Block', S.attDefs(blk), defaults);
    if (!vals) return;
    const ins = { type: 'insert', name, x: at.x, y: at.y, sx: scale, sy: scale, rot: 0, layer: 'TITLEBLOCK' };
    ins.attribs = S.makeAttribs(blk, ins, vals);
    S.add(ins);
    S.msg('Title block inserted. Double-click it to edit its fields.');
  }, { aliases: ['TB'], desc: 'Inserts a drawing frame and title block sized to the paper', group: 'Layout', pickfirst: false });

  R('ATTDEF', async () => {
    const tag = (await S.getString('Enter attribute tag (no spaces)', {})).trim().toUpperCase().replace(/\s+/g, '_');
    if (!tag) return;
    const prompt = await S.getString('Enter attribute prompt', { allowSpaces: true, def: tag });
    const def = await S.getString('Enter default value', { allowSpaces: true, def: '' });
    const p = await S.getPoint('Specify start point');
    const ht = await S.getDistance('Specify text height', { base: p, def: S.fmt(S.doc.settings.textHeight) });
    S.add({ type: 'text', x: p.x, y: p.y, h: ht, rot: 0, text: def || '', tag, prompt: prompt || tag, ha: 'left', va: 'baseline' });
    S.msg(`Attribute definition ${tag} created. Include it when you use BLOCK; INSERT will ask for its value.`);
  }, { aliases: ['ATT'], desc: 'Creates an attribute definition (a fillable field) for blocks and title blocks', group: 'Block', pickfirst: false });

  R('ATTEDIT', async () => {
    const { e } = await S.getEntity('Select block reference', { filter: (x) => x.type === 'insert' && x.attribs && x.attribs.length });
    await S.editAttributes(e);
  }, { aliases: ['ATE', 'EATTEDIT'], desc: 'Edits the attribute values of a block reference (or double-click it)', group: 'Block', pickfirst: false });

  // ============================================================ viewports
  const needLayout = () => { if (!S.layoutObj()) { S.msg('This command works in a layout. Click a layout tab at the bottom-left first.', 'err'); return false; } return true; };
  R('MVIEW', async () => {
    if (!needLayout()) return;
    const lay = S.layoutObj(), [pw, ph] = S.paperSize(lay);
    const a = await S.getPoint('Specify corner of viewport or', { keywords: ['Fit'], def: 'Fit' }).catch((e) => { throw e; });
    let x0, y0, x1, y1;
    if (a === 'Fit' || a == null) { x0 = 20; y0 = 10; x1 = pw - 10; y1 = ph - 10; }
    else {
      const b = await S.getPoint('Specify opposite corner', { base: a, noRubber: true, preview: (p) => [{ type: 'pline', closed: true, pts: [P(a.x, a.y), P(p.x, a.y), P(p.x, p.y), P(a.x, p.y)].map((q) => ({ ...q, b: 0 })) }] });
      x0 = Math.min(a.x, b.x); y0 = Math.min(a.y, b.y); x1 = Math.max(a.x, b.x); y1 = Math.max(a.y, b.y);
    }
    if (x1 - x0 < 1 || y1 - y0 < 1) { S.msg('Viewport is too small.', 'err'); return; }
    const vp = S.fitViewport({ type: 'viewport', layer: vpLayer(), x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: 0, cy: 0, scale: 1 });
    S.add(vp);
    S.msg(`Viewport created at scale ${S.scaleLabel(vp.scale)}. Use VPSCALE to change it.`);
  }, { aliases: ['MV', 'VPORTS'], desc: 'Creates a layout viewport showing model space at a scale', group: 'Layout', pickfirst: false });

  const pickViewport = async () => {
    const sel = [...S.selection].filter((e) => e.type === 'viewport');
    if (S.pickfirst && sel.length === 1) { S.pickfirst = false; return sel[0]; }
    const { e } = await S.getEntity('Select viewport (click its border)', { filter: (x) => x.type === 'viewport' });
    return e;
  };
  R('VPSCALE', async () => {
    if (!needLayout()) return;
    const vp = await pickViewport();
    S.msg(`Current viewport scale: ${S.scaleLabel(vp.scale)}`);
    const str = await S.getString('Enter scale, e.g. 1:50, 1:100, 2:1', { def: S.scaleLabel(vp.scale) });
    const k = S.parseScale(str);
    if (!k) { S.msg('Invalid scale.', 'err'); return; }
    S.replace(new Map([[vp, [{ ...vp, scale: k }]]]));
  }, { aliases: ['VS'], desc: 'Sets the scale of a layout viewport', group: 'Layout' });
  R('VPFIT', async () => {
    if (!needLayout()) return;
    const vp = await pickViewport();
    const n = S.fitViewport(vp);
    S.replace(new Map([[vp, [n]]]));
    S.msg(`Viewport fitted to the drawing at ${S.scaleLabel(n.scale)}.`);
  }, { desc: 'Fits the whole model drawing into a viewport at a standard scale', group: 'Layout' });
  R('VPPAN', async () => {
    if (!needLayout()) return;
    const vp = await pickViewport();
    const a = await S.getPoint('Specify base point');
    const b = await S.getPoint('Specify second point', { base: a });
    S.replace(new Map([[vp, [{ ...vp, cx: vp.cx - (b.x - a.x) / vp.scale, cy: vp.cy - (b.y - a.y) / vp.scale }]]]));
  }, { desc: 'Pans the model view inside a viewport', group: 'Layout' });

  R('LAYOUT', async () => {
    const op = await S.getKeyword('Enter layout option', ['New', 'Rename', 'Delete', 'Set', 'Model'], 'Set');
    if (op === 'New') { S.newLayout(); return; }
    if (op === 'Model') { S.setSpace(null); return; }
    const names = layouts().map((l) => l.name);
    if (!names.length) { S.msg('There are no layouts yet. Use LAYOUT New.', 'err'); return; }
    const name = await S.getKeyword('Layout', names, S.space || names[0]);
    if (op === 'Set') S.setSpace(name);
    else if (op === 'Rename') await S.renameLayout(name);
    else await S.deleteLayout(name);
  }, { aliases: ['LO'], desc: 'Creates, renames, deletes or switches layouts', group: 'Layout', noUndo: true, pickfirst: false });

  // ============================================================ page setup
  function paperControls(init) {
    const paper = h('select', {}, Object.keys(S.PAPERS).map((k) => h('option', { value: k }, `${k}  (${S.PAPERS[k][0]} x ${S.PAPERS[k][1]} mm)`)));
    paper.value = init.paper || 'A3';
    const orient = h('select', {}, h('option', { value: 'landscape' }, 'Landscape'), h('option', { value: 'portrait' }, 'Portrait'));
    orient.value = init.orient || 'landscape';
    const style = h('select', {}, h('option', { value: 'monochrome' }, 'Monochrome (black lines)'), h('option', { value: 'grayscale' }, 'Grayscale'), h('option', { value: 'color' }, 'Color as displayed'));
    style.value = init.style || 'monochrome';
    return { paper, orient, style };
  }
  const grid2 = (rows) => h('div', { style: 'display:grid; grid-template-columns: 150px 1fr; gap:8px 12px; align-items:center; min-width:460px' }, rows.map(([l, c]) => [h('span', {}, l), c]));
  R('PAGESETUP', async () => {
    const lay = S.layoutObj();
    const cur = lay || S.doc.settings.plot || {};
    const c = paperControls(cur);
    const ok = await S.dialog(`Page Setup - ${lay ? lay.name : 'Model'}`, grid2([['Paper size', c.paper], ['Orientation', c.orient], ['Plot style', c.style]]),
      [{ label: 'OK', primary: true, value: true }, { label: 'Cancel', value: false }], { cancelValue: false });
    if (!ok) return;
    const patch = { paper: c.paper.value, orient: c.orient.value, style: c.style.value };
    S.mark();
    if (lay) S.doc.layouts = layouts().map((l) => (l === lay ? { ...l, ...patch } : l));
    else S.doc.settings = { ...S.doc.settings, plot: patch };
    S.endOp(); S.zoomExtents(); S.emit('doc');
  }, { desc: 'Sets paper size, orientation and plot style', group: 'Layout', noUndo: true, pickfirst: false });

  // ============================================================ sheet rendering to SVG (vector)
  const GRAY = (hex) => { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); const v = Math.round(0.3 * r + 0.59 * g + 0.11 * b); const s = Math.min(200, v).toString(16).padStart(2, '0'); return `#${s}${s}${s}`; };
  /**
   * Render a sheet as SVG in millimetres.
   * sheet: { pw, ph, paper: [entities in paper space], viewports: [viewport entities], style, lineweights, borders }
   */
  S.sheetSvg = (sheet, prolog = true) => {
    const { pw, ph } = sheet;
    const n = (v) => +(+v).toFixed(5);
    const out = [];
    let clipId = 0;
    const style = sheet.style || 'monochrome';
    const resolveColor = (e, inh) => {
      let c = e.color;
      if (c === 0) c = inh ? inh.color : 7;
      if (c == null) { const l = S.layer(e.layer === '0' && inh ? inh.layer : e.layer); c = l ? l.color : 7; }
      return c;
    };
    const css = (c) => { if (style === 'monochrome') return '#000000'; const hex = S.colorCss(c, true); return style === 'grayscale' ? GRAY(hex) : hex; };
    const lwOf = (e, inh) => {
      if (!sheet.lineweights) return 0.25;
      if (e.lw != null) return Math.max(0.05, e.lw);
      const l = S.layer(e.layer === '0' && inh ? inh.layer : e.layer);
      return Math.max(0.05, (l && l.lw) || (inh && inh.lw) || 0.25);
    };
    const ltOf = (e, inh) => { let t = e.ltype; if (t === 'BYBLOCK') t = inh && inh.ltype; if (!t) { const l = S.layer(e.layer === '0' && inh ? inh.layer : e.layer); t = l && l.ltype; } return t || 'CONTINUOUS'; };
    const plotted = (e, inh) => {
      const name = e.layer === '0' && inh ? inh.layer : e.layer;
      if (/^defpoints$/i.test(name)) return false;
      const l = S.layer(name);
      return !l || (l.on !== false && !l.frozen);
    };
    const pathOf = (prims) => prims.map((p) => {
      if (p.k === 'L') return `M${n(p.a.x)} ${n(p.a.y)}L${n(p.b.x)} ${n(p.b.y)}`;
      if (p.full) return `M${n(p.c.x + p.r)} ${n(p.c.y)}A${n(p.r)} ${n(p.r)} 0 1 1 ${n(p.c.x - p.r)} ${n(p.c.y)}A${n(p.r)} ${n(p.r)} 0 1 1 ${n(p.c.x + p.r)} ${n(p.c.y)}`;
      const s = G.polar(p.c, p.a1, p.r), e = G.polar(p.c, p.a2, p.r), large = G.sweep(p.a1, p.a2) > Math.PI ? 1 : 0;
      return `M${n(s.x)} ${n(s.y)}A${n(p.r)} ${n(p.r)} 0 ${large} 1 ${n(e.x)} ${n(e.y)}`;
    }).join('');
    const loopsPath = (loops) => loops.map((lp) => 'M' + lp.map((p) => `${n(p.x)} ${n(p.y)}`).join('L') + 'Z').join('');
    // k: paper mm per local unit (to keep line widths and dash lengths constant on paper)
    const emit = (e, inh, k, vr) => {
      if (!plotted(e, inh) || G.isAttDef(e) && inh) return;
      const c = resolveColor(e, inh), col = css(c), u = 1 / k;
      const sw = n(lwOf(e, inh) * u);
      switch (e.type) {
        case 'text': {
          const box = G.textBox(e);
          const anchor = e.ha === 'center' || e.ha === 'middle' ? 'middle' : e.ha === 'right' ? 'end' : 'start';
          out.push(`<g transform="translate(${n(e.x)} ${n(e.y)}) rotate(${n(G.deg(e.rot || 0))}) scale(${n(e.wf || 1)} -1)">`);
          box.lines.forEach((ln, i) => out.push(`<text x="0" y="${n(-(box.oy - i * box.gap))}" font-family="Arial, Helvetica, sans-serif" font-size="${n(e.h / 0.716)}" text-anchor="${anchor}" fill="${col}">${esc(ln)}</text>`));
          out.push('</g>');
          return;
        }
        case 'solid': out.push(`<path d="M${e.pts.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}Z" fill="${col}"/>`); return;
        case 'hatch': {
          const d = loopsPath(e.loops);
          if (e.pattern === 'SOLID') { out.push(`<path d="${d}" fill="${col}" fill-rule="evenodd"/>`); return; }
          const id = `h${clipId++}`;
          const { segs } = G.hatchSegments(e, S.bbox(e), 0.35 * u, 30000);
          out.push(`<clipPath id="${id}"><path d="${d}" clip-rule="evenodd"/></clipPath><path clip-path="url(#${id})" d="${segs.map((g) => `M${n(g[0])} ${n(g[1])}L${n(g[2])} ${n(g[3])}`).join('')}" stroke="${col}" stroke-width="${n(0.13 * u)}" fill="none"/>`);
          return;
        }
        case 'dim': for (const g of G.dimGeometry(e, S.doc.settings.dimPrec ?? 2)) emit({ ...g, layer: e.layer, color: e.color, lw: e.lw }, inh, k, vr); return;
        case 'insert': {
          const blk = S.doc.blocks[e.name];
          if (blk) {
            const m = M.insert(e, blk.base);
            const sub = { layer: e.layer === '0' && inh ? inh.layer : e.layer, color: c, ltype: ltOf(e, inh), lw: lwOf(e, inh) };
            out.push(`<g transform="matrix(${m.map(n).join(' ')})">`);
            for (const ch of blk.entities) emit(ch, sub, k * (M.scaleOf(m) || 1), null);
            out.push('</g>');
          }
          for (const a of e.attribs || []) emit(a, inh, k, vr);
          return;
        }
        case 'point': out.push(`<circle cx="${n(e.x)}" cy="${n(e.y)}" r="${n(0.3 * u)}" fill="${col}"/>`); return;
        case 'viewport':
          if (sheet.borders) out.push(`<rect x="${n(e.x)}" y="${n(e.y)}" width="${n(e.w)}" height="${n(e.h)}" fill="none" stroke="${col}" stroke-width="${sw}"/>`);
          return;
        case 'xline': {
          const big = 1e6 * u, d = G.norm(P(e.dx, e.dy)), p = P(e.x, e.y);
          const a = e.ray ? p : G.sub(p, G.mul(d, big)), b = G.add(p, G.mul(d, big));
          out.push(`<path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}" stroke="${col}" stroke-width="${sw}" fill="none"/>`);
          return;
        }
        default: {
          const def = DXF.LTYPES[ltOf(e, inh)];
          const lts = S.doc.settings.ltscale || 1;
          const dash = def && def.dashes.length ? ` stroke-dasharray="${def.dashes.map((x) => n(Math.max(Math.abs(x) * lts, 0.15) * u)).join(' ')}"` : '';
          out.push(`<path d="${pathOf(G.prims(e, S.ctx()))}" fill="none" stroke="${col}" stroke-width="${sw}"${dash} stroke-linecap="round" stroke-linejoin="round"/>`);
        }
      }
    };
    // viewports first so paper-space content (title block) draws on top
    for (const vp of sheet.viewports) {
      if (!(vp.scale > 0)) continue;
      const id = `v${clipId++}`, k = vp.scale, mx = vp.x + vp.w / 2, my = vp.y + vp.h / 2;
      const vr = [vp.cx - vp.w / 2 / k, vp.cy - vp.h / 2 / k, vp.cx + vp.w / 2 / k, vp.cy + vp.h / 2 / k];
      out.push(`<clipPath id="${id}"><rect x="${n(vp.x)}" y="${n(vp.y)}" width="${n(vp.w)}" height="${n(vp.h)}"/></clipPath>`);
      out.push(`<g clip-path="url(#${id})"><g transform="matrix(${n(k)} 0 0 ${n(k)} ${n(mx - vp.cx * k)} ${n(my - vp.cy * k)})">`);
      for (const e of S.doc.entities) {
        if (e.type !== 'xline') { const b = S.bbox(e); if (b[2] < vr[0] || b[0] > vr[2] || b[3] < vr[1] || b[1] > vr[3]) continue; }
        emit(e, null, k, vr);
      }
      out.push('</g></g>');
    }
    for (const e of sheet.paper) emit(e, null, 1, null);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(pw)}mm" height="${n(ph)}mm" viewBox="0 0 ${n(pw)} ${n(ph)}">\n<rect width="${n(pw)}" height="${n(ph)}" fill="#ffffff"/>\n<g transform="matrix(1 0 0 -1 0 ${n(ph)})">\n${out.join('\n')}\n</g>\n</svg>\n`;
    return prolog ? `<?xml version="1.0" encoding="UTF-8"?>\n${svg}` : svg;
  };

  // A sheet for the active layout, or a model-space plot of an area at a scale.
  S.buildSheet = (opt) => {
    const lay = opt.layout;
    if (lay) {
      const [pw, ph] = S.paperSize({ paper: opt.paper || lay.paper, orient: opt.orient || lay.orient });
      return { pw, ph, paper: lay.entities, viewports: lay.entities.filter((e) => e.type === 'viewport' && S.layer(e.layer) ? S.layer(e.layer).on !== false && !S.layer(e.layer).frozen : e.type === 'viewport'), style: opt.style, lineweights: opt.lineweights, borders: opt.borders };
    }
    const [pw, ph] = S.paperSize({ paper: opt.paper, orient: opt.orient });
    const m = 10, aw = pw - 2 * m, ah = ph - 2 * m;
    const bb = opt.area;
    const bw = Math.max(1e-9, bb[2] - bb[0]), bh = Math.max(1e-9, bb[3] - bb[1]);
    const k = opt.scale === 'fit' ? Math.min(aw / bw, ah / bh) : opt.scale;
    const vp = { type: 'viewport', x: m, y: m, w: aw, h: ah, cx: (bb[0] + bb[2]) / 2, cy: (bb[1] + bb[3]) / 2, scale: k };
    return { pw, ph, paper: [], viewports: [vp], style: opt.style, lineweights: opt.lineweights, borders: false, scale: k };
  };

  // ============================================================ plot dialog and output
  async function plotDialog(presetPdf) {
    const lay = S.layoutObj();
    const saved = (lay ? { paper: lay.paper, orient: lay.orient, style: lay.style } : S.doc.settings.plot) || {};
    const c = paperControls({ paper: saved.paper || 'A3', orient: saved.orient || 'landscape', style: saved.style || 'monochrome' });
    const output = h('select', {}, h('option', { value: 'pdf' }, 'PDF file (vector)'), window.desktop ? h('option', { value: 'print' }, 'Printer...') : h('option', { value: 'print' }, 'Browser print dialog'));
    output.value = presetPdf ? 'pdf' : (S.lastPlotOutput || 'pdf');
    const area = h('select', {}, lay ? h('option', { value: 'layout' }, 'Layout') : [h('option', { value: 'extents' }, 'Extents'), h('option', { value: 'display' }, 'Display'), h('option', { value: 'window' }, 'Window...')]);
    const scale = h('select', {}, h('option', { value: 'fit' }, 'Fit to paper'), SCALES.map((sc) => h('option', { value: String(scaleValue(sc)) }, `${sc[0]}:${sc[1]}  (${sc[0]} mm = ${sc[1]} units)`)));
    if (lay) { scale.innerHTML = ''; scale.append(h('option', { value: '1' }, '1:1 (layout)')); scale.disabled = true; }
    const lw = h('input', { type: 'checkbox' }); lw.checked = saved.lineweights !== false;
    const borders = h('input', { type: 'checkbox' }); borders.checked = !!saved.borders;
    const rows = [['Output', output], ['Paper size', c.paper], ['Orientation', c.orient], ['What to plot', area], ['Plot scale', scale], ['Plot style', c.style],
      ['Options', h('div', { style: 'display:flex; gap:16px' }, h('label', { style: 'display:flex;gap:6px' }, lw, 'Plot lineweights'), lay ? h('label', { style: 'display:flex;gap:6px' }, borders, 'Plot viewport borders') : null)]];
    const settings = () => ({ output: output.value, paper: c.paper.value, orient: c.orient.value, style: c.style.value, area: area.value, scale: scale.value, lineweights: lw.checked, borders: borders.checked });
    const note = h('div', { style: 'color:#a3adba; margin-top:10px; max-width:460px; line-height:1.45' },
      lay ? 'Layouts plot at 1:1 on the chosen paper. Viewport scales set the drawing scale.' : 'Model space plots centre the chosen area on the paper with a 10 mm margin. Scales assume drawing units are millimetres.');
    const r = await S.dialog(presetPdf ? 'Export PDF' : 'Plot', h('div', {}, grid2(rows), note), [
      { label: 'Preview...', value: () => ({ ...settings(), preview: true }) },
      { label: presetPdf ? 'Export' : 'Plot', primary: true, value: () => settings() },
      { label: 'Cancel', value: null },
    ], { cancelValue: null });
    return r;
  }
  async function sheetFor(st) {
    const lay = S.layoutObj();
    if (lay) return S.buildSheet({ layout: lay, ...st });
    let area;
    if (st.area === 'display') area = S.viewRect();
    else if (st.area === 'window') {
      const a = await S.getPoint('Specify first corner of plot area');
      const b = await S.getPoint('Specify opposite corner', { base: a, noRubber: true, preview: (p) => [{ type: 'pline', closed: true, pts: [P(a.x, a.y), P(p.x, a.y), P(p.x, p.y), P(a.x, p.y)].map((q) => ({ ...q, b: 0 })), color: 3 }] });
      area = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
    } else area = S.extents(S.doc.entities) || [0, 0, 100, 100];
    return S.buildSheet({ ...st, area, scale: st.scale === 'fit' ? 'fit' : +st.scale });
  }
  S.previewSheet = (sheet, title) => {
    const svg = S.sheetSvg(sheet, false);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const ratio = sheet.pw / sheet.ph, W = Math.min(innerWidth * 0.8, innerHeight * 0.72 * ratio);
    const img = h('img', { src: url, style: `width:${W}px; height:${W / ratio}px; background:#fff; box-shadow:0 6px 24px rgba(0,0,0,.6); display:block` });
    const info = h('div', { style: 'color:#a3adba; margin-top:8px' }, `${G.fmtNum(sheet.pw, 1)} x ${G.fmtNum(sheet.ph, 1)} mm${sheet.scale ? `   |   scale ${S.scaleLabel(sheet.scale)}` : ''}`);
    return S.dialog(title || 'Plot Preview', h('div', { style: 'background:#5a616b; padding:18px' }, img, info), [{ label: 'Close', primary: true, value: true }]).finally(() => URL.revokeObjectURL(url));
  };
  S.outputSheet = async (sheet, output) => {
    const svg = S.sheetSvg(sheet, false);
    const stem = S.file.name.replace(/\.[^.]+$/, '') + (S.space ? `-${S.space}` : '');
    if (window.desktop && window.desktop.plot) {
      let path = null;
      if (output === 'pdf') {
        path = await window.desktop.saveDialog(stem + '.pdf', [{ name: 'PDF (*.pdf)', extensions: ['pdf'] }]);
        if (!path) return false;
      }
      const r = await window.desktop.plot({ svg, widthMm: sheet.pw, heightMm: sheet.ph, action: output, path });
      if (!r || !r.ok) { S.msg(`Plot failed${r && r.error ? ': ' + r.error : ''}.`, 'err'); return false; }
      S.msg(output === 'pdf' ? `PDF saved: ${path}` : 'Sent to printer.');
      return true;
    }
    // browser fallback: the browser's own print dialog (choose "Save as PDF" for a PDF)
    const w = window.open('', '_blank');
    if (!w) { S.msg('Allow pop-ups to plot from the browser.', 'err'); return false; }
    w.document.write(`<!doctype html><title>${esc(stem)}</title><style>@page{size:${sheet.pw}mm ${sheet.ph}mm;margin:0}html,body{margin:0}svg{display:block}</style>${svg}`);
    w.document.close(); w.focus(); w.print();
    return true;
  };

  async function plot(presetPdf) {
    const st = await plotDialog(presetPdf);
    if (!st) return;
    S.lastPlotOutput = st.output;
    const lay = S.layoutObj();
    const saveSettings = { paper: st.paper, orient: st.orient, style: st.style, lineweights: st.lineweights, borders: st.borders };
    if (lay) S.doc.layouts = S.doc.layouts.map((l) => (l === lay ? { ...l, ...saveSettings } : l));
    else S.doc.settings = { ...S.doc.settings, plot: saveSettings };
    const sheet = await sheetFor(st);
    if (st.preview) {
      await S.previewSheet(sheet);
      return plot(presetPdf);
    }
    S.msg('Plotting...');
    await S.outputSheet(sheet, st.output);
  }
  R('PLOT', () => plot(false), { aliases: ['PRINT'], desc: 'Prints the layout or model space, or saves it as a PDF (Ctrl+P)', group: 'Layout', noUndo: true, pickfirst: false });
  R('EXPORTPDF', () => plot(true), { aliases: ['PDF', 'PDFOUT'], desc: 'Saves the layout or model space as a vector PDF', group: 'Layout', noUndo: true, pickfirst: false });
  R('PREVIEW', async () => {
    const lay = S.layoutObj();
    const saved = (lay ? lay : S.doc.settings.plot) || {};
    const sheet = await sheetFor({ paper: saved.paper || 'A3', orient: saved.orient || 'landscape', style: saved.style || 'monochrome', area: lay ? 'layout' : 'extents', scale: 'fit', lineweights: true, borders: !!saved.borders });
    await S.previewSheet(sheet);
  }, { aliases: ['PRE'], desc: 'Shows a preview of the plotted sheet', group: 'Layout', noUndo: true, pickfirst: false });

  // ============================================================ ribbon
  if (S.ribbon) {
    const big = (icon, label, cmd) => ({ t: 'big', icon, label, cmd });
    const sm = (icon, label, cmd) => ({ t: 'sm', icon, label, cmd });
    const col = (...items) => ({ t: 'col', items });
    S.ribbon.Layout = [
      { title: 'Layout', items: [big('layoutnew', 'New Layout', () => S.newLayout()), big('pagesetup', 'Page Setup', 'PAGESETUP'), col(sm('model', 'Model Space', () => S.setSpace(null)), sm('layoutnew', 'Layout Options', 'LAYOUT'))] },
      { title: 'Viewports', items: [big('viewport', 'Viewport', 'MVIEW'), col(sm('vpscale', 'Viewport Scale', 'VPSCALE'), sm('zoomext', 'Fit Drawing', 'VPFIT'), sm('pan', 'Pan in Viewport', 'VPPAN'))] },
      { title: 'Title Block', items: [big('titleblock', 'Title Block', 'TITLEBLOCK'), col(sm('attdef', 'Define Attribute', 'ATTDEF'), sm('attedit', 'Edit Attributes', 'ATTEDIT'), sm('block', 'Create Block', 'BLOCK'))] },
      { title: 'Plot', items: [big('plot', 'Plot', 'PLOT'), big('pdf', 'Export PDF', 'EXPORTPDF'), big('preview', 'Preview', 'PREVIEW')] },
    ];
    S.ribbon.Output.unshift({ title: 'Plot', items: [big('plot', 'Plot', 'PLOT'), big('pdf', 'Export PDF', 'EXPORTPDF'), big('preview', 'Preview', 'PREVIEW'), big('pagesetup', 'Page Setup', 'PAGESETUP')] });
    S.ribbon.Insert[0].items.push(big('titleblock', 'Title Block', 'TITLEBLOCK'), big('attdef', 'Define Attribute', 'ATTDEF'));
    S.buildRibbon();
  }
  buildTabs();
})();
