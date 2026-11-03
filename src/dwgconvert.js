/* Converts a LibreDWG DwgDatabase (from @mlightcad/libredwg-web) into a DraftForge document. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  function cleanText(s) {
    return String(s ?? '')
      .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/%%[cC]/g, '⌀').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%%/g, '%')
      .replace(/%%[uUoO]/g, '');
  }
  // Strip MTEXT inline formatting, keep paragraphs as newlines.
  function cleanMText(s) {
    let t = String(s ?? '');
    t = t.replace(/\\P/g, '\n').replace(/\\~/g, ' ');
    t = t.replace(/\\[ACFHQTWfhqtwac][^;\\{}]*;/g, '');
    t = t.replace(/\\S([^;]*?)[\^#/]([^;]*?);/g, '$1/$2');
    t = t.replace(/\\[LlOoKkN]/g, '');
    t = t.replace(/[{}]/g, '');
    t = t.replace(/\\\\/g, '\\');
    return cleanText(t);
  }

  const HALIGN = ['left', 'center', 'right', 'left', 'center', 'left'];
  const VALIGN = ['baseline', 'bottom', 'middle', 'top'];
  const ATTACH = { 1: ['left', 'top'], 2: ['center', 'top'], 3: ['right', 'top'], 4: ['left', 'middle'], 5: ['center', 'middle'], 6: ['right', 'middle'], 7: ['left', 'bottom'], 8: ['center', 'bottom'], 9: ['right', 'bottom'] };

  function colorOf(e) {
    if (e.color != null && e.color !== undefined && typeof e.color === 'number') return '#' + (e.color & 0xffffff).toString(16).padStart(6, '0');
    const ci = e.colorIndex;
    if (ci == null || ci === 256) return null;
    if (ci === 0) return 0;
    return Math.abs(ci) % 256 || 7;
  }
  function ltypeOf(e) {
    const n = (e.lineType || '').toUpperCase();
    if (!n || n === 'BYLAYER' || n === 'BYBLOCK') return null;
    return n;
  }
  function lwOf(v) { return typeof v === 'number' && v >= 0 ? v / 100 : null; }

  function convertDatabase(db) {
    const stats = { converted: 0, skipped: {} };
    const skip = (t) => { stats.skipped[t] = (stats.skipped[t] || 0) + 1; };
    const flipX = (e) => e.extrusionDirection && e.extrusionDirection.z < -0.5;

    function common(e, o) {
      o.layer = e.layer || '0';
      const c = colorOf(e); if (c !== null) o.color = c;
      const lt = ltypeOf(e); if (lt) o.ltype = lt;
      const lw = lwOf(e.lineweight); if (lw !== null) o.lw = lw;
      return o;
    }
    function textFrom(src, e) {
      const ha = HALIGN[src.halign | 0] || 'left', va = VALIGN[src.valign | 0] || 'baseline';
      const useAlign = (src.halign | 0) !== 0 || (src.valign | 0) !== 0;
      const p = useAlign && src.endPoint && (src.endPoint.x || src.endPoint.y) ? src.endPoint : src.startPoint || { x: 0, y: 0 };
      let x = p.x, rot = src.rotation || 0;
      if (flipX(src)) { x = -x; rot = Math.PI - rot; }
      return common(e, { type: 'text', x, y: p.y, h: src.textHeight || 1, rot, text: cleanText(src.text), ha, va, wf: src.xScale && src.xScale !== 1 ? src.xScale : undefined });
    }

    function conv(e, out) {
      if (e.isVisible === false) return;
      switch (e.type) {
        case 'LINE':
          out.push(common(e, { type: 'line', x1: e.startPoint.x, y1: e.startPoint.y, x2: e.endPoint.x, y2: e.endPoint.y })); break;
        case 'CIRCLE': {
          const cx = flipX(e) ? -e.center.x : e.center.x;
          out.push(common(e, { type: 'circle', cx, cy: e.center.y, r: e.radius })); break;
        }
        case 'ARC': {
          let cx = e.center.x, a1 = e.startAngle, a2 = e.endAngle;
          if (flipX(e)) { cx = -cx; [a1, a2] = [Math.PI - a2, Math.PI - a1]; }
          out.push(common(e, { type: 'arc', cx, cy: e.center.y, r: e.radius, a1: ((a1 % TAU) + TAU) % TAU, a2: ((a2 % TAU) + TAU) % TAU })); break;
        }
        case 'LWPOLYLINE': {
          const f = flipX(e);
          const pts = (e.vertices || []).map((v) => ({ x: f ? -v.x : v.x, y: v.y, b: f ? -(v.bulge || 0) : (v.bulge || 0) }));
          if (pts.length) out.push(common(e, { type: 'pline', pts, closed: !!(e.flag & 1) }));
          break;
        }
        case 'POLYLINE2D': {
          const f = flipX(e);
          const pts = (e.vertices || []).filter((v) => !(v.flag & 16)).map((v) => ({ x: f ? -v.x : v.x, y: v.y, b: f ? -(v.bulge || 0) : (v.bulge || 0) }));
          if (pts.length) out.push(common(e, { type: 'pline', pts, closed: !!(e.flag & 1) }));
          break;
        }
        case 'POLYLINE3D': {
          const pts = (e.vertices || []).filter((v) => !(v.flag & 16)).map((v) => ({ x: v.x, y: v.y, b: 0 }));
          if (pts.length) out.push(common(e, { type: 'pline', pts, closed: !!(e.flag & 1) }));
          break;
        }
        case 'TEXT': out.push(textFrom(e, e)); break;
        case 'MTEXT': {
          const [ha, va] = ATTACH[e.attachmentPoint] || ATTACH[1];
          let rot = e.rotation || 0;
          if (e.direction && (e.direction.x || e.direction.y)) rot = Math.atan2(e.direction.y, e.direction.x);
          out.push(common(e, { type: 'text', x: e.insertionPoint.x, y: e.insertionPoint.y, h: e.textHeight || 1, rot, text: cleanMText(e.text), ha, va }));
          break;
        }
        case 'POINT': out.push(common(e, { type: 'point', x: e.position.x, y: e.position.y })); break;
        case 'ELLIPSE': {
          const full = Math.abs(((e.endAngle - e.startAngle) % TAU + TAU) % TAU) < 1e-9;
          const o = { type: 'ellipse', cx: e.center.x, cy: e.center.y, mx: e.majorAxisEndPoint.x, my: e.majorAxisEndPoint.y, ratio: e.axisRatio || 1 };
          if (!full) { o.a1 = e.startAngle; o.a2 = e.endAngle; }
          if (flipX(e)) { o.cx = -o.cx; o.mx = -o.mx; if (!full) { const a1 = -e.endAngle, a2 = -e.startAngle; o.a1 = a1; o.a2 = a2; } }
          out.push(common(e, o));
          break;
        }
        case 'SPLINE': {
          const o = { type: 'spline', closed: !!(e.flag & 1) };
          if (e.controlPoints && e.controlPoints.length > 1) {
            o.ctrl = e.controlPoints.map((p) => ({ x: p.x, y: p.y }));
            o.knots = e.knots; o.degree = e.degree || 3;
            if (e.weights && e.weights.length) o.weights = e.weights;
          } else if (e.fitPoints && e.fitPoints.length > 1) o.fit = e.fitPoints.map((p) => ({ x: p.x, y: p.y }));
          else { skip('SPLINE(empty)'); return; }
          out.push(common(e, o));
          break;
        }
        case 'INSERT': {
          const base = { type: 'insert', name: e.name, x: e.insertionPoint.x, y: e.insertionPoint.y, sx: e.xScale ?? 1, sy: e.yScale ?? 1, rot: e.rotation || 0 };
          if (flipX(e)) { base.x = -base.x; base.sx = -base.sx; base.rot = -base.rot; }
          const attribs = (e.attribs || []).filter((a) => a && a.text && !(a.flags & 1)).map((a) => textFrom({ ...a.text, extrusionDirection: a.extrusionDirection }, a));
          const cols = Math.max(1, e.columnCount | 0), rows = Math.max(1, e.rowCount | 0);
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const dx = c * (e.columnSpacing || 0), dy = r * (e.rowSpacing || 0);
            const cs = Math.cos(base.rot), sn = Math.sin(base.rot);
            const o = common(e, { ...base, x: base.x + dx * cs - dy * sn, y: base.y + dx * sn + dy * cs });
            if (attribs.length && r === 0 && c === 0) o.attribs = attribs;
            out.push(o);
          }
          break;
        }
        case 'DIMENSION':
          if (e.name) out.push(common(e, { type: 'insert', name: e.name, x: 0, y: 0, sx: 1, sy: 1, rot: 0, dimension: true }));
          else skip('DIMENSION');
          break;
        case 'ACAD_TABLE':
          if (e.name) out.push(common(e, { type: 'insert', name: e.name, x: 0, y: 0, sx: 1, sy: 1, rot: 0 }));
          else skip('ACAD_TABLE');
          break;
        case 'SOLID': case 'TRACE': {
          const c4 = e.corner4 || e.corner3;
          out.push(common(e, { type: 'solid', pts: [e.corner1, e.corner2, c4, e.corner3].map((p) => ({ x: p.x, y: p.y })) }));
          break;
        }
        case '3DFACE': {
          const pts = ['corner1', 'corner2', 'corner3', 'corner4'].map((k) => e[k]).filter(Boolean).map((p) => ({ x: p.x, y: p.y, b: 0 }));
          if (pts.length > 2) out.push(common(e, { type: 'pline', pts, closed: true }));
          break;
        }
        case 'XLINE': case 'RAY':
          out.push(common(e, { type: 'xline', ray: e.type === 'RAY', x: e.firstPoint.x, y: e.firstPoint.y, dx: e.unitDirection.x, dy: e.unitDirection.y })); break;
        case 'LEADER':
          if (e.vertices && e.vertices.length > 1) out.push(common(e, { type: 'pline', pts: e.vertices.map((v) => ({ x: v.x, y: v.y, b: 0 })), closed: false }));
          break;
        case 'HATCH': {
          const loops = [];
          for (const path of e.boundaryPaths || []) {
            const pts = [];
            if (path.vertices) {
              const vs = path.vertices;
              for (let i = 0; i < vs.length; i++) {
                const p = vs[i], q = vs[(i + 1) % vs.length];
                pts.push({ x: p.x, y: p.y });
                if (p.bulge && (i + 1 < vs.length || path.isClosed !== false)) {
                  const th = 4 * Math.atan(p.bulge), c = Math.hypot(q.x - p.x, q.y - p.y);
                  const r = c / (2 * Math.sin(Math.abs(th) / 2));
                  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, nx = -(q.y - p.y) / c, ny = (q.x - p.x) / c;
                  const k = (c / 2) * ((1 - p.bulge * p.bulge) / (2 * p.bulge));
                  const cx = mx + nx * k, cy = my + ny * k, a0 = Math.atan2(p.y - cy, p.x - cx);
                  const n = Math.max(4, Math.ceil(Math.abs(th) / (TAU / 64)));
                  for (let j = 1; j < n; j++) { const a = a0 + th * j / n; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
                }
              }
            } else {
              for (const ed of path.edges || []) {
                if (ed.type === 1) { pts.push({ x: ed.start.x, y: ed.start.y }); }
                else if (ed.type === 2) {
                  let a1 = ed.startAngle, a2 = ed.endAngle;
                  const ccw = ed.isCCW !== false;
                  if (!ccw) { a1 = -a1; a2 = -a2; }
                  let s = a2 - a1; if (ccw && s < 0) s += TAU; if (!ccw && s > 0) s -= TAU;
                  const n = Math.max(4, Math.ceil(Math.abs(s) / (TAU / 64)));
                  for (let j = 0; j < n; j++) { const a = a1 + s * j / n; pts.push({ x: ed.center.x + ed.radius * Math.cos(a), y: ed.center.y + ed.radius * Math.sin(a) }); }
                } else if (ed.type === 3) {
                  const mx = ed.end.x, my = ed.end.y, ratio = ed.lengthOfMinorAxis || 1;
                  let a1 = ed.startAngle, a2 = ed.endAngle; const ccw = ed.isCCW !== false;
                  if (!ccw) { a1 = -a1; a2 = -a2; }
                  let s = a2 - a1; if (ccw && s < 0) s += TAU; if (!ccw && s > 0) s -= TAU;
                  const n = Math.max(8, Math.ceil(Math.abs(s) / (TAU / 64)));
                  for (let j = 0; j < n; j++) {
                    const t = a1 + s * j / n;
                    pts.push({ x: ed.center.x + mx * Math.cos(t) - my * ratio * Math.sin(t), y: ed.center.y + my * Math.cos(t) + mx * ratio * Math.sin(t) });
                  }
                } else if (ed.type === 4) {
                  const src = ed.controlPoints && ed.controlPoints.length ? ed.controlPoints : ed.fitDatum || [];
                  for (const p of src) pts.push({ x: p.x, y: p.y });
                }
              }
            }
            if (pts.length > 2) loops.push(pts);
          }
          if (!loops.length) { skip('HATCH(no boundary)'); return; }
          const o = { type: 'hatch', loops, pattern: e.solidFill ? 'SOLID' : (e.patternName || 'ANSI31').toUpperCase() };
          if (!e.solidFill && e.definitionLines && e.definitionLines.length) {
            o.patLines = e.definitionLines.map((d) => ({ angle: d.angle, base: { x: d.base.x, y: d.base.y }, offset: { x: d.offset.x, y: d.offset.y }, dashes: d.dashLengths || [] }));
          }
          out.push(common(e, o));
          break;
        }
        case 'ATTRIB': case 'ATTDEF': case 'VIEWPORT': case 'SEQEND': case 'VERTEX_2D': case 'VERTEX_3D':
          break;
        default: skip(e.type); return;
      }
      stats.converted++;
    }

    const layers = [];
    for (const l of (db.tables && db.tables.LAYER && db.tables.LAYER.entries) || []) {
      const ci = l.colorIndex || 7;
      layers.push({
        name: l.name, color: Math.abs(ci) % 256 || 7, ltype: (l.lineType || 'CONTINUOUS').toUpperCase(),
        on: !l.off && ci >= 0, frozen: !!l.frozen, locked: false, lw: lwOf(l.lineweight) ?? 0.25,
      });
    }
    if (!layers.some((l) => l.name === '0')) layers.unshift({ name: '0', color: 7, ltype: 'CONTINUOUS', on: true, frozen: false, locked: false, lw: 0.25 });

    const blocks = {};
    for (const b of (db.tables && db.tables.BLOCK_RECORD && db.tables.BLOCK_RECORD.entries) || []) {
      if (!b.name || /^\*(Model|Paper)_Space/i.test(b.name)) continue;
      const ents = [];
      for (const e of b.entities || []) conv(e, ents);
      blocks[b.name] = { base: { x: (b.basePoint && b.basePoint.x) || 0, y: (b.basePoint && b.basePoint.y) || 0 }, entities: ents };
    }
    const entities = [];
    for (const e of db.entities || []) {
      if (e.isInPaperSpace) continue;
      conv(e, entities);
    }
    const insunits = db.header && db.header.INSUNITS;
    return {
      doc: { version: 1, entities, layers, blocks, clayer: '0', settings: { insunits: insunits ?? 4 } },
      stats,
    };
  }

  const api = { convertDatabase, cleanText, cleanMText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DwgConvert = api;
})(typeof window !== 'undefined' ? window : globalThis);
