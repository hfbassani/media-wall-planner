/* Arch2D — WS3: scene renderer shared by the interactive canvas and the PNG exporter
   (project.md §3.3, §3.7). Draws in CSS pixels; callers handle devicePixelRatio. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;
  const V = A.vocab;

  const SEL = 'hsl(190, 85%, 60%)';
  const wallPatternCache = new Map();

  function makeTransform(s, ox, oy) {
    return {
      s,
      x: (cm) => ox + cm * s,
      y: (cm) => oy - cm * s,
      cmX: (px) => (px - ox) / s,
      cmY: (px) => (oy - px) / s,
      rect: (el) => ({ x: ox + el.x * s, y: oy - (el.y + el.height) * s, w: el.width * s, h: el.height * s }),
    };
  }

  function handleRects(r, size = 9) {
    const hs = size / 2;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, x2 = r.x + r.w, y2 = r.y + r.h;
    return [
      { key: 'nw', x: r.x - hs, y: r.y - hs },
      { key: 'n', x: cx - hs, y: r.y - hs },
      { key: 'ne', x: x2 - hs, y: r.y - hs },
      { key: 'e', x: x2 - hs, y: cy - hs },
      { key: 'se', x: x2 - hs, y: y2 - hs },
      { key: 's', x: cx - hs, y: y2 - hs },
      { key: 'sw', x: r.x - hs, y: y2 - hs },
      { key: 'w', x: r.x - hs, y: cy - hs },
    ].map((h) => Object.assign(h, { w: size, h: size }));
  }

  /* ---------- wall surface ---------- */
  function wallPattern(ctx, mood, s) {
    const m = V.moods[mood] || V.moods.japandi;
    const key = mood + '|' + s.toFixed(2);
    if (wallPatternCache.has(key)) return wallPatternCache.get(key);
    const tile = document.createElement('canvas');
    let pat;
    if (m.wallPattern === 'brick') {
      const bw = Math.max(8, 21.5 * s), bh = Math.max(3, 6.5 * s), mortar = Math.max(1, 1 * s);
      tile.width = Math.ceil(bw * 2);
      tile.height = Math.ceil((bh + mortar) * 2);
      const t = tile.getContext('2d');
      t.fillStyle = U.shade(m.wall, 0.35);
      t.fillRect(0, 0, tile.width, tile.height);
      const rand = U.rng(7);
      for (let row = 0; row < 2; row++) {
        for (let col = -1; col < 3; col++) {
          const x = col * (bw + mortar) + (row % 2 ? bw / 2 : 0);
          t.fillStyle = U.shade(m.wall, (rand() - 0.5) * 0.22);
          t.fillRect(x, row * (bh + mortar), bw, bh);
        }
      }
      pat = ctx.createPattern(tile, 'repeat');
    } else {
      tile.width = tile.height = 96;
      const t = tile.getContext('2d');
      const rand = U.rng(U.hashString(mood));
      for (let i = 0; i < 900; i++) {
        t.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.03)';
        t.fillRect(rand() * 96, rand() * 96, 1 + rand() * 2, 1 + rand() * 2);
      }
      pat = ctx.createPattern(tile, 'repeat');
    }
    wallPatternCache.set(key, pat);
    if (wallPatternCache.size > 24) wallPatternCache.delete(wallPatternCache.keys().next().value);
    return pat;
  }

  /** Ready photo image for this render pass, or null (no photo, hidden, excluded, or decoding). */
  function photoFor(state, o) {
    const p = state.wallPhoto;
    if (o.photo === false || !p || !A.photo) return null;
    if (o.photo === true) return A.photo.image(p.id);
    if (o.theme === 'export' ? !p.showOnExport : !p.visible) return null;
    return A.photo.image(p.id);
  }

  function drawWall(ctx, state, T, o) {
    if (o.wall === false) return;
    const m = V.moods[state.mood] || V.moods.japandi;
    const x = T.x(0), y = T.y(state.wallHeight), w = state.wallWidth * T.s, h = state.wallHeight * T.s;
    const photo = photoFor(state, o);
    if (photo) {
      const b = (state.wallPhoto && state.wallPhoto.bounds) || (A.photo && A.photo.bounds(state.wallPhoto.id));
      let px, py, dw, dh;

      if (b && b.wCm && b.hCm) {
        // Calibrated image with full room bounds: wall quad is aligned 1:1, surrounding room is visible!
        px = T.x(b.xCm);
        py = T.y(b.yCm + b.hCm); // screen Y of top edge
        dw = b.wCm * T.s;
        dh = b.hCm * T.s;
      } else {
        // Uncalibrated raw image: anchor to floor (Y=0), scale to wall height
        const pw = photo.naturalWidth || photo.width || 1;
        const ph = photo.naturalHeight || photo.height || 1;
        const ar = pw / ph;
        const cmH = state.wallHeight;
        const cmW = cmH * ar;
        const cmX = (state.wallWidth - cmW) / 2;
        const cmY = 0;
        px = T.x(cmX);
        py = T.y(cmY + cmH);
        dw = cmW * T.s;
        dh = cmH * T.s;
      }

      // Draw room photo cropped with elegant rounded corners
      const cornerR = Math.max(8, Math.min(28, Math.round(14 * (o.uiScale || 1))));

      if (o.theme === 'screen') {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 32 * o.dpr;
        ctx.shadowOffsetY = 10 * o.dpr;
        ctx.fillStyle = '#141820';
        roundRect(ctx, px, py, dw, dh, cornerR);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      roundRect(ctx, px, py, dw, dh, cornerR);
      ctx.clip();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(photo, px, py, dw, dh);
      ctx.restore();

      // Soft architectural border around the rounded photo frame
      ctx.save();
      roundRect(ctx, px, py, dw, dh, cornerR);
      ctx.strokeStyle = o.theme === 'export' ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = Math.max(1, 1.5 * (o.uiScale || 1));
      ctx.stroke();
      ctx.restore();

      // Subtle dashed border for the media wall boundary over the room photo
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.restore();
      return; // real photo carries its own texture and lighting
    }

    ctx.save();
    if (o.theme === 'screen') {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 30 * o.dpr;
      ctx.shadowOffsetY = 8 * o.dpr;
    }
    ctx.fillStyle = m.wall;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = wallPattern(ctx, state.mood, T.s);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // ceiling shadow
    const g = ctx.createLinearGradient(0, y, 0, y + Math.min(h, 40 * T.s));
    g.addColorStop(0, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, Math.min(h, 40 * T.s));
  }

  function inkFor(state, o) {
    const m = V.moods[state.mood] || V.moods.japandi;
    const lum = o && photoFor(state, o) ? A.photo.luminance(state.wallPhoto.id) : U.luminance(m.wall);
    return lum > 0.5 ? '0,0,0' : '255,255,255';
  }

  function drawGrid(ctx, state, T, o) {
    const ink = inkFor(state, o);
    const x0 = T.x(0), x1 = T.x(state.wallWidth), y0 = T.y(0), y1 = T.y(state.wallHeight);
    const levels = [
      { step: 5, alpha: 0.07, dash: [2, 3], min: 6 },
      { step: 10, alpha: 0.13, dash: [], min: 5 },
      { step: 50, alpha: 0.2, dash: [], min: 4 },
      { step: 100, alpha: 0.28, dash: [], min: 3 },
    ];
    ctx.save();
    for (const lv of levels) {
      if (lv.step * T.s < lv.min) continue;
      ctx.strokeStyle = `rgba(${ink},${lv.alpha})`;
      ctx.lineWidth = lv.step >= 50 ? 1 : 0.75;
      ctx.setLineDash(lv.dash);
      ctx.beginPath();
      for (let cm = lv.step; cm < state.wallWidth; cm += lv.step) {
        if (lv.step < 100 && cm % (lv.step * 2) === 0 && lv.step >= 10 && lv.step * 2 * T.s >= lv.min) continue;
        const px = Math.round(T.x(cm)) + 0.5;
        ctx.moveTo(px, y1);
        ctx.lineTo(px, y0);
      }
      for (let cm = lv.step; cm < state.wallHeight; cm += lv.step) {
        const py = Math.round(T.y(cm)) + 0.5;
        ctx.moveTo(x0, py);
        ctx.lineTo(x1, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFloor(ctx, state, T, o) {
    if (o.floor === false) return;
    const k = o.uiScale;
    const y = T.y(0);
    const x0 = T.x(0) - 20 * k, x1 = T.x(state.wallWidth) + 20 * k;
    const depth = 14 * k;
    const ink = o.theme === 'export' ? '40,40,40' : '200,205,215';
    ctx.save();
    ctx.fillStyle = o.theme === 'export' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(x0, y, x1 - x0, depth);
    ctx.beginPath();
    ctx.rect(x0, y, x1 - x0, depth);
    ctx.clip();
    ctx.strokeStyle = `rgba(${ink},0.35)`;
    ctx.lineWidth = 1 * k;
    ctx.beginPath();
    for (let x = x0 - depth; x < x1; x += 8 * k) {
      ctx.moveTo(x, y + depth);
      ctx.lineTo(x + depth, y);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = `rgba(${ink},0.9)`;
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.fillStyle = `rgba(${ink},0.85)`;
    ctx.font = `600 ${10 * k}px Inter, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    ctx.fillText('FFL ±0', T.x(0) - 6 * k, y - 3 * k);
  }

  function drawRulers(ctx, state, T, o) {
    const k = o.uiScale;
    const ink = o.theme === 'export' ? '40,40,40' : '160,166,178';
    const step = pickStep(T.s / k);
    ctx.save();
    ctx.fillStyle = `rgba(${ink},0.9)`;
    ctx.strokeStyle = `rgba(${ink},0.55)`;
    ctx.lineWidth = 1 * k;
    ctx.font = `500 ${9.5 * k}px 'JetBrains Mono', monospace`;
    // bottom ruler (below floor hatch)
    const by = T.y(0) + 22 * k;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.beginPath();
    for (let cm = 0; cm <= state.wallWidth + 0.001; cm += step) {
      const x = T.x(cm);
      ctx.moveTo(x, by);
      ctx.lineTo(x, by + 5 * k);
      ctx.fillText(String(Math.round(cm)), x, by + 7 * k);
    }
    ctx.moveTo(T.x(0), by);
    ctx.lineTo(T.x(state.wallWidth), by);
    ctx.stroke();
    // left ruler
    const lx = T.x(0) - 12 * k;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    for (let cm = 0; cm <= state.wallHeight + 0.001; cm += step) {
      const y = T.y(cm);
      ctx.moveTo(lx, y);
      ctx.lineTo(lx - 5 * k, y);
      if (cm > 0) ctx.fillText(String(Math.round(cm)), lx - 7 * k, y);
    }
    ctx.moveTo(lx, T.y(0));
    ctx.lineTo(lx, T.y(state.wallHeight));
    ctx.stroke();
    ctx.restore();
    // overall dimensions
    dimLine(ctx, T.x(0), T.y(0) + 46 * k, T.x(state.wallWidth), T.y(0) + 46 * k, `${fmt(state.wallWidth)} cm`, o, ink);
    dimLine(ctx, T.x(state.wallWidth) + 22 * k, T.y(0), T.x(state.wallWidth) + 22 * k, T.y(state.wallHeight), `${fmt(state.wallHeight)} cm`, o, ink);
  }
  function pickStep(pxPerCm) {
    for (const st of [10, 20, 25, 50, 100, 200, 500]) if (st * pxPerCm >= 34) return st;
    return 1000;
  }
  const fmt = (v) => (Math.round(v * 10) / 10).toString();

  /** Architectural dimension line with ticks and a centred label. */
  /** Architectural dimension line with ticks and a centred high-contrast label. */
  function dimLine(ctx, x1, y1, x2, y2, label, o, inkOverride) {
    const k = o.uiScale;
    const horiz = Math.abs(y2 - y1) < Math.abs(x2 - x1);
    const isExport = o.theme === 'export';

    // High contrast color scheme
    const lineStroke = isExport ? 'rgba(30, 41, 59, 0.85)' : 'rgba(56, 189, 248, 0.85)'; // crisp architectural cyan on screen
    const tickStroke = isExport ? 'rgba(30, 41, 59, 0.95)' : 'rgba(56, 189, 248, 0.95)';
    const pillBg = isExport ? '#ffffff' : 'rgba(11, 15, 23, 0.94)';
    const pillBorder = isExport ? 'rgba(30, 41, 59, 0.65)' : 'rgba(56, 189, 248, 0.7)';
    const textColor = isExport ? '#0f172a' : '#ffffff'; // Always crisp pure white on screen

    ctx.save();
    ctx.strokeStyle = lineStroke;
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 45° architectural ticks
    ctx.strokeStyle = tickStroke;
    ctx.lineWidth = 1.5 * k;
    ctx.beginPath();
    const t = 4 * k;
    ctx.moveTo(x1 - t, y1 + t);
    ctx.lineTo(x1 + t, y1 - t);
    ctx.moveTo(x2 - t, y2 + t);
    ctx.lineTo(x2 + t, y2 - t);
    ctx.stroke();

    ctx.font = `700 ${10 * k}px 'JetBrains Mono', monospace`;
    const tw = ctx.measureText(label).width;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.translate(mx, my);
    if (!horiz) ctx.rotate(-Math.PI / 2);

    // Pill background with rounded edges & crisp border
    ctx.fillStyle = pillBg;
    roundRect(ctx, -tw / 2 - 5 * k, -8 * k, tw + 10 * k, 16 * k, 4 * k);
    ctx.fill();

    ctx.strokeStyle = pillBorder;
    ctx.lineWidth = 1 * k;
    ctx.stroke();

    // Label text in maximum contrast
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0.5 * k);
    ctx.restore();
  }

  /* ---------- LED effects ---------- */
  function drawHalo(ctx, el, r, T, o) {
    const temp = V.ledTemps[el.ledTemp] || V.ledTemps[3000];
    ctx.save();
    ctx.shadowColor = U.rgba(temp.color, 0.95);
    ctx.shadowBlur = U.clamp(28 * T.s, 10, 140) * o.dpr;
    ctx.fillStyle = U.rgba(temp.color, 0.9);
    const pad = Math.min(4 * T.s, r.w * 0.05);
    for (let i = 0; i < 2; i++) ctx.fillRect(r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2);
    ctx.restore();
  }
  function drawUnderglow(ctx, el, r, T) {
    const temp = V.ledTemps[el.ledTemp] || V.ledTemps[3000];
    const depth = Math.min(55 * T.s, T.y(0) - (r.y + r.h));
    if (depth <= 1) return;
    const top = r.y + r.h;
    ctx.save();
    const g = ctx.createLinearGradient(0, top, 0, top + depth);
    g.addColorStop(0, U.rgba(temp.color, 0.6));
    g.addColorStop(1, U.rgba(temp.color, 0));
    ctx.fillStyle = g;
    const spread = Math.min(18 * T.s, r.w * 0.15);
    ctx.beginPath();
    ctx.moveTo(r.x + spread * 0.3, top);
    ctx.lineTo(r.x + r.w - spread * 0.3, top);
    ctx.lineTo(r.x + r.w + spread, top + depth);
    ctx.lineTo(r.x - spread, top + depth);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = U.rgba('#fff4e0', 0.9);
    ctx.fillRect(r.x + spread * 0.3, top - 0.5, r.w - spread * 0.6, Math.max(1, 0.4 * T.s));
    ctx.restore();
  }

  /* ---------- element labels & annotations ---------- */
  function drawLabel(ctx, el, r, o) {
    const k = o.uiScale;
    if (r.w < 54 * k || r.h < 16 * k) return;
    const text = el.label;
    ctx.save();
    ctx.font = `600 ${10.5 * k}px Inter, sans-serif`;
    let t = text;
    while (ctx.measureText(t).width > r.w - 14 * k && t.length > 3) t = t.slice(0, -2);
    if (t !== text) t = t.slice(0, -1) + '…';
    const tw = ctx.measureText(t).width;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.fillStyle = 'rgba(10,12,16,0.82)';
    roundRect(ctx, cx - tw / 2 - 6 * k, cy - 8 * k, tw + 12 * k, 16 * k, 8 * k);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, cx, cy + 0.5 * k);
    ctx.restore();
  }

  function drawAnnotations(ctx, state, T, o) {
    const k = o.uiScale;
    const isExport = o.theme === 'export';
    const markerBg = isExport ? '#ffffff' : 'rgba(11, 15, 23, 0.94)';
    const markerBorder = isExport ? 'rgba(30, 41, 59, 0.65)' : 'rgba(56, 189, 248, 0.7)';
    const markerText = isExport ? '#0f172a' : '#ffffff';

    for (const el of state.elements) {
      const r = T.rect(el);
      // Width dimension line (above element)
      if (r.w > 26 * k) {
        dimLine(ctx, r.x, r.y - 10 * k, r.x + r.w, r.y - 10 * k, `${fmt(el.width)} cm`, o);
      }
      // Height dimension line (to right of element)
      if (r.h > 26 * k) {
        dimLine(ctx, r.x + r.w + 10 * k, r.y + r.h, r.x + r.w + 10 * k, r.y, `${fmt(el.height)} cm`, o);
      }

      // AFF elevation marker at bottom-left
      ctx.save();
      const affText = `+${fmt(el.y)} cm AFF`;
      ctx.font = `700 ${9 * k}px 'JetBrains Mono', monospace`;
      const atw = ctx.measureText(affText).width;
      const tri = 4 * k;
      const bx = r.x;
      const by = r.y + r.h;

      // Small high-contrast pill for AFF marker
      ctx.fillStyle = markerBg;
      roundRect(ctx, bx - 2 * k, by + 3 * k, atw + 16 * k, 16 * k, 4 * k);
      ctx.fill();
      ctx.strokeStyle = markerBorder;
      ctx.lineWidth = 1 * k;
      ctx.stroke();

      // Elevation triangle indicator
      ctx.fillStyle = isExport ? '#0f172a' : '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(bx + 3 * k, by + 6 * k);
      ctx.lineTo(bx + 3 * k + tri, by + 6 * k + tri * 1.2);
      ctx.lineTo(bx + 3 * k, by + 6 * k + tri * 1.2);
      ctx.closePath();
      ctx.fill();

      // AFF Text in pure high-contrast white (or dark on export)
      ctx.fillStyle = markerText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(affText, bx + 5 * k + tri, by + 11 * k);
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- selection, HUD, guides, marquee ---------- */
  function drawSelection(ctx, state, T, o) {
    const sel = state.elements.filter((e) => o.selection.includes(e.id));
    if (!sel.length) return;
    ctx.save();
    ctx.strokeStyle = SEL;
    ctx.lineWidth = 1.5;
    for (const el of sel) {
      const r = T.rect(el);
      ctx.strokeRect(r.x - 0.75, r.y - 0.75, r.w + 1.5, r.h + 1.5);
    }
    let hudText, anchor;
    if (sel.length === 1) {
      const el = sel[0];
      const r = T.rect(el);
      for (const hnd of handleRects(r)) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(hnd.x, hnd.y, hnd.w, hnd.h);
        ctx.strokeStyle = SEL;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(hnd.x + 0.5, hnd.y + 0.5, hnd.w - 1, hnd.h - 1);
      }
      hudText = `${el.label}  ·  ${fmt(el.width)} × ${fmt(el.height)} cm  ·  X ${fmt(el.x)}  ·  Y ${fmt(el.y)} AFF`;
      anchor = r;
    } else {
      const minX = Math.min(...sel.map((e) => e.x)), minY = Math.min(...sel.map((e) => e.y));
      const maxX = Math.max(...sel.map((e) => e.x + e.width)), maxY = Math.max(...sel.map((e) => e.y + e.height));
      const r = { x: T.x(minX), y: T.y(maxY), w: (maxX - minX) * T.s, h: (maxY - minY) * T.s };
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
      ctx.setLineDash([]);
      hudText = `${sel.length} selected  ·  ${fmt(maxX - minX)} × ${fmt(maxY - minY)} cm  ·  X ${fmt(minX)}  ·  Y ${fmt(minY)} AFF`;
      anchor = r;
    }
    if (o.hud) {
      ctx.font = "600 11px Inter, sans-serif";
      const tw = ctx.measureText(hudText).width;
      let hx = anchor.x + anchor.w / 2 - tw / 2 - 10;
      let hy = anchor.y - 34;
      if (hy < 6) hy = anchor.y + anchor.h + 12;
      hx = U.clamp(hx, 6, o.width - tw - 26);
      ctx.fillStyle = 'rgba(12,15,20,0.92)';
      roundRect(ctx, hx, hy, tw + 20, 22, 11);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,200,230,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#e8f8fc';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(hudText, hx + 10, hy + 11.5);
    }
    ctx.restore();
  }

  function drawGuides(ctx, state, T, o) {
    if (!o.guides || !o.guides.length) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 90, 160, 0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (const g of o.guides) {
      if (g.axis === 'x') {
        const x = Math.round(T.x(g.value)) + 0.5;
        ctx.moveTo(x, T.y(state.wallHeight) - 12);
        ctx.lineTo(x, T.y(0) + 12);
      } else {
        const y = Math.round(T.y(g.value)) + 0.5;
        ctx.moveTo(T.x(0) - 12, y);
        ctx.lineTo(T.x(state.wallWidth) + 12, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawMarquee(ctx, m) {
    if (!m) return;
    ctx.save();
    ctx.fillStyle = 'rgba(80,200,230,0.08)';
    ctx.strokeStyle = SEL;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w, m.h);
    ctx.restore();
  }

  /* ---------- Eye Level & Ergonomic TV Center Guide ---------- */
  function drawEyeLevelGuide(ctx, state, T, o) {
    const eyeCm = o.eyeLevelCm !== undefined ? o.eyeLevelCm : V.config.defaultEyeLevelCm;
    const bandCm = V.config.eyeComfortBandCm;
    const k = o.uiScale;

    const x0 = T.x(0) - 15 * k;
    const x1 = T.x(state.wallWidth) + 15 * k;
    const eyeY = T.y(eyeCm);
    const bandTopY = T.y(eyeCm + bandCm);
    const bandBottomY = T.y(eyeCm - bandCm);

    ctx.save();

    // 1. Ergonomic comfort band wash (±10cm)
    ctx.fillStyle = o.theme === 'export' ? 'rgba(234, 179, 8, 0.08)' : 'rgba(234, 179, 8, 0.07)';
    ctx.fillRect(T.x(0), bandTopY, state.wallWidth * T.s, bandBottomY - bandTopY);

    // Band boundary dashed lines
    ctx.strokeStyle = o.theme === 'export' ? 'rgba(200, 150, 20, 0.35)' : 'rgba(234, 179, 8, 0.25)';
    ctx.lineWidth = 1 * k;
    ctx.setLineDash([3 * k, 3 * k]);
    ctx.beginPath();
    ctx.moveTo(T.x(0), bandTopY);
    ctx.lineTo(T.x(state.wallWidth), bandTopY);
    ctx.moveTo(T.x(0), bandBottomY);
    ctx.lineTo(T.x(state.wallWidth), bandBottomY);
    ctx.stroke();

    // 2. Main eye-level datum line
    ctx.strokeStyle = o.theme === 'export' ? 'rgba(180, 120, 10, 0.9)' : 'rgba(234, 179, 8, 0.85)';
    ctx.lineWidth = 1.5 * k;
    ctx.setLineDash([10 * k, 3 * k, 2 * k, 3 * k]); // Architectural centerline / datum dash
    ctx.beginPath();
    ctx.moveTo(x0, eyeY);
    ctx.lineTo(x1, eyeY);
    ctx.stroke();

    // 3. Eye Level Badge Callout on Left
    ctx.setLineDash([]);
    const badgeText = `👁 Seated Eye Level · ${eyeCm} cm AFF (Ideal TV Center)`;
    ctx.font = `600 ${10 * k}px Inter, sans-serif`;
    const tw = ctx.measureText(badgeText).width;
    const bx = T.x(0) + 12 * k;
    const by = eyeY - 11 * k;

    ctx.fillStyle = o.theme === 'export' ? 'rgba(245, 245, 240, 0.95)' : 'rgba(18, 16, 12, 0.92)';
    roundRect(ctx, bx - 6 * k, by - 8 * k, tw + 12 * k, 18 * k, 9 * k);
    ctx.fill();

    ctx.strokeStyle = o.theme === 'export' ? 'rgba(200, 150, 20, 0.8)' : 'rgba(234, 179, 8, 0.7)';
    ctx.lineWidth = 1 * k;
    ctx.stroke();

    ctx.fillStyle = o.theme === 'export' ? '#854d0e' : '#fef08a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, bx, by + 1 * k);

    // 4. TV Center Alignment Markers & Delta Brackets
    const tvs = state.elements.filter((e) => e.type === 'tv' || e.label.toLowerCase().includes('tv'));
    for (const tv of tvs) {
      const tvCenterCm = tv.y + tv.height / 2;
      const tvCenterY = T.y(tvCenterCm);
      const tvX1 = T.x(tv.x);
      const tvX2 = T.x(tv.x + tv.width);
      const tvMidX = (tvX1 + tvX2) / 2;
      const deltaCm = tvCenterCm - eyeCm;

      // Draw dashed horizontal TV midpoint line through the screen
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1 * k;
      ctx.setLineDash([4 * k, 3 * k]);
      ctx.beginPath();
      ctx.moveTo(tvX1, tvCenterY);
      ctx.lineTo(tvX2, tvCenterY);
      ctx.stroke();

      // Draw vertical alignment connector between TV center and eye level
      ctx.setLineDash([]);
      if (Math.abs(deltaCm) > 0.5) {
        ctx.strokeStyle = deltaCm > 0 ? 'rgba(234, 179, 8, 0.85)' : 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 1.2 * k;
        ctx.beginPath();
        ctx.moveTo(tvMidX, eyeY);
        ctx.lineTo(tvMidX, tvCenterY);
        ctx.stroke();
      }

      // Delta Pill Tag
      let statusText, statusBg, statusColor;
      if (Math.abs(deltaCm) <= 1.5) {
        statusText = `✓ TV Center Aligned (${fmt(tvCenterCm)} cm AFF)`;
        statusBg = 'rgba(20, 83, 45, 0.92)';
        statusColor = '#86efac';
      } else if (deltaCm > 0) {
        statusText = `TV Center ${fmt(tvCenterCm)} cm (+${fmt(deltaCm)} cm above eye level)`;
        statusBg = deltaCm > 25 ? 'rgba(120, 53, 15, 0.92)' : 'rgba(30, 27, 22, 0.92)';
        statusColor = '#fde047';
      } else {
        statusText = `TV Center ${fmt(tvCenterCm)} cm (${fmt(deltaCm)} cm below eye level)`;
        statusBg = 'rgba(12, 74, 110, 0.92)';
        statusColor = '#7dd3fc';
      }

      ctx.font = `600 ${9.5 * k}px Inter, sans-serif`;
      const sw = ctx.measureText(statusText).width;
      const tagY = tvCenterY < eyeY ? (tvCenterY + eyeY) / 2 : (tvCenterY + eyeY) / 2;
      const tagBoxY = tagY - 8 * k;

      ctx.fillStyle = statusBg;
      roundRect(ctx, tvMidX - sw / 2 - 6 * k, tagBoxY, sw + 12 * k, 17 * k, 8.5 * k);
      ctx.fill();

      ctx.strokeStyle = statusColor;
      ctx.lineWidth = 1 * k;
      ctx.stroke();

      ctx.fillStyle = statusColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(statusText, tvMidX, tagBoxY + 8.5 * k);
    }

    ctx.restore();
  }

  /* ---------- public ---------- */
  function drawScene(ctx, state, opts) {
    const o = Object.assign(
      { time: 0, grid: true, annotations: false, eyeLevel: false, eyeLevelCm: V.config.defaultEyeLevelCm, labels: true, rulers: true, selection: [], hud: true, guides: [], marquee: null, theme: 'screen', uiScale: 1, dpr: 1, background: null, photo: true, ghost: false },
      opts
    );
    const T = makeTransform(o.pxPerCm, o.originX, o.originY);
    if (o.background && o.background !== 'transparent') {
      ctx.fillStyle = o.background;
      ctx.fillRect(0, 0, o.width, o.height);
    }
    drawWall(ctx, state, T, o);
    if (o.grid) drawGrid(ctx, state, T, o);
    drawFloor(ctx, state, T, o);
    if (o.rulers) drawRulers(ctx, state, T, o);

    const textureOpts = { pxPerCm: T.s, time: o.time, mood: state.mood };
    // Ghost mode: see outlets/switches in the photo behind the millwork. Textures multiply globalAlpha.
    ctx.save();
    if (o.ghost) ctx.globalAlpha = 0.4;
    for (const el of state.elements) {
      const r = T.rect(el);
      if (el.ledHalo) drawHalo(ctx, el, r, T, o);
      A.textures.draw(ctx, el, r, textureOpts);
      ctx.save();
      ctx.strokeStyle = U.rgba(U.shade(el.color, -0.6), 0.55);
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.restore();
      if (el.ledUnderglow) drawUnderglow(ctx, el, r, T);
    }
    ctx.restore();
    if (o.ghost) {
      // Keep footprints readable while translucent.
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
      ctx.lineWidth = 1.25;
      for (const el of state.elements) {
        const r = T.rect(el);
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      ctx.restore();
    }
    if (o.labels) for (const el of state.elements) drawLabel(ctx, el, T.rect(el), o);
    if (o.annotations) drawAnnotations(ctx, state, T, o);
    if (o.eyeLevel) drawEyeLevelGuide(ctx, state, T, o);
    drawGuides(ctx, state, T, o);
    if (o.selection.length) drawSelection(ctx, state, T, o);
    drawMarquee(ctx, o.marquee);
  }

  A.render = {
    makeTransform,
    handleRects,
    drawScene,
    dimLine,
    roundRect,
    needsAnimation: (state) => state.elements.some((e) => A.textures.animated(e)),
  };
})();
