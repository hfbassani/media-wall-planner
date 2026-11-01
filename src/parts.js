/* Arch2D — multi-part furniture painters. Composes the procedural texture painters
   (A.textures.paintSurface) into objects with a primary and a secondary material zone
   plus structural parameters (shelves, bays, drawers, slabs, plinths, arches, handles).
   Pure Canvas 2D, deterministic per element id. Draws into (0,0,w,h). */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;
  const V = A.vocab;

  /* ---------- helpers ---------- */
  // Textures that carry their own internal structure are flattened when used as a sub-surface.
  const flat = (tex) => (tex === 'niche' ? 'matte' : tex);

  function surf(ctx, el, tex, color, x, y, w, h, s, time, salt) {
    if (w < 0.5 || h < 0.5) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    const sub = Object.assign({}, el, { texture: flat(tex), color, id: el.id + '|' + (salt || ''), _bare: true });
    A.textures.paintSurface(ctx, sub, w, h, s, time);
    ctx.restore();
  }
  const prim = (ctx, el, x, y, w, h, s, t, salt) => surf(ctx, el, el.texture, el.color, x, y, w, h, s, t, 'p' + (salt || ''));
  const sec = (ctx, el, x, y, w, h, s, t, salt) =>
    surf(ctx, el, el.secondaryTexture || el.texture, el.secondaryColor || U.shade(el.color, -0.25), x, y, w, h, s, t, 's' + (salt || ''));

  function archPath(ctx, x, y, w, h) {
    const ry = Math.min(w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + ry);
    ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, Math.PI, 0);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }
  function shapePath(ctx, x, y, w, h, arch) {
    if (arch) archPath(ctx, x, y, w, h);
    else {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  /** Paint a material clipped to an arbitrary path built by pathFn(ctx). */
  function fillWith(ctx, pathFn, paint) {
    ctx.save();
    ctx.beginPath();
    pathFn(ctx);
    ctx.clip();
    paint();
    ctx.restore();
  }
  function insetShadow(ctx, x, y, w, h, s) {
    let g = ctx.createLinearGradient(0, y, 0, y + Math.min(h, 10 * s));
    g.addColorStop(0, 'rgba(0,0,0,0.38)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, Math.min(h, 10 * s));
    g = ctx.createLinearGradient(x, 0, x + Math.min(w, 5 * s), 0);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, Math.min(w, 5 * s), h);
  }
  function seam(ctx, x1, y1, x2, y2, color, s) {
    ctx.save();
    ctx.strokeStyle = U.rgba(U.shade(color, -0.6), 0.7);
    ctx.lineWidth = Math.max(1, 0.3 * s);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1 + (x1 === x2 ? 1 : 0), y1 + (y1 === y2 ? 1 : 0));
    ctx.lineTo(x2 + (x1 === x2 ? 1 : 0), y2 + (y1 === y2 ? 1 : 0));
    ctx.stroke();
    ctx.restore();
  }
  function autoBays(p, wCm, pitchCm) {
    return p.bays > 0 ? p.bays : Math.max(1, Math.round(wCm / pitchCm));
  }
  const rngFor = (el, salt) => U.rng(U.hashString(el.id + '|' + salt));

  /* ---------- decor inside compartments ---------- */
  const BOOK_PALETTE = ['#7d6b5d', '#a79584', '#5d6a72', '#b9a88f', '#8b5e4a', '#3f4a52', '#d8cfc0'];
  function drawDecor(ctx, rand, x, floorY, cw, bayH, s) {
    if (bayH / s < 14 || cw / s < 14) return;
    let bx = x + cw * (0.1 + rand() * 0.15);
    const end = x + cw * (0.45 + rand() * 0.25);
    while (bx < end) {
      const bw = (2 + rand() * 2.5) * s;
      const bh = Math.min(bayH * 0.82, (16 + rand() * 9) * s);
      ctx.fillStyle = BOOK_PALETTE[Math.floor(rand() * BOOK_PALETTE.length)];
      ctx.fillRect(bx, floorY - bh, bw, bh);
      bx += bw + 0.3 * s;
    }
    if (rand() < 0.75 && end + 12 * s < x + cw) {
      const vh = Math.min(bayH * 0.7, (11 + rand() * 9) * s);
      const vw = vh * (0.45 + rand() * 0.25);
      const vx = end + (5 + rand() * 4) * s + vw / 2;
      ctx.fillStyle = rand() < 0.5 ? '#e9e3d8' : '#3b3633';
      ctx.beginPath();
      ctx.ellipse(vx, floorY - vh / 2, vw / 2, vh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawLogs(ctx, rand, x, y, w, h, s) {
    const r = Math.max(2, 5.5 * s);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    let row = 0;
    for (let cy = y + h - r; cy > y - r; cy -= r * 1.75, row++) {
      for (let cx = x + r + (row % 2 ? r : 0); cx < x + w + r; cx += r * 2.05) {
        const rr = r * (0.85 + rand() * 0.25);
        const tone = ['#8a6a4a', '#9c7a55', '#7a5a3c', '#a88660'][Math.floor(rand() * 4)];
        ctx.fillStyle = U.shade(tone, -0.35);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = tone;
        ctx.beginPath();
        ctx.arc(cx, cy, rr * 0.82, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = U.rgba(U.shade(tone, -0.4), 0.5);
        ctx.lineWidth = Math.max(0.5, 0.2 * s);
        ctx.beginPath();
        ctx.arc(cx, cy, rr * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---------- handles ---------- */
  function drawHandle(ctx, style, x, y, w, h, s, isDrawer, hingeLeft) {
    if (style === 'none' || w < 4 || h < 4) return;
    ctx.save();
    if (style === 'groove') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + w * 0.08, y + Math.max(1, 1.5 * s), w * 0.84, Math.max(1, 0.6 * s));
    } else if (style === 'knob') {
      const r = Math.max(1.2, 1.2 * s);
      const cx = isDrawer ? x + w / 2 : hingeLeft ? x + w - 4 * s : x + 4 * s;
      const cy = isDrawer ? y + h / 2 : y + Math.min(h * 0.25, 12 * s);
      ctx.fillStyle = '#b59153';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = style === 'bar_brass' ? '#c2a061' : '#1b1c1e';
      const t = Math.max(1, 0.8 * s);
      if (isDrawer) {
        const bw = Math.min(w * 0.4, 30 * s);
        ctx.fillRect(x + (w - bw) / 2, y + h / 2 - t / 2, bw, t);
      } else {
        const bh = Math.min(h * 0.35, 25 * s);
        const bx = hingeLeft ? x + w - 3.5 * s : x + 3.5 * s - t;
        ctx.fillRect(bx, y + Math.min(h * 0.12, 6 * s), t, bh);
      }
    }
    ctx.restore();
  }

  /* ---------- archetype painters ---------- */
  function niche(ctx, el, w, h, s, time, opts) {
    const p = el.params || {};
    const preset = V.presets[el.type] || {};
    const isVitrine = opts && opts.vitrine;
    const f = p.frameWidthCm > 0 ? Math.max(1, p.frameWidthCm * s) : 0;
    const arch = !!p.archTop;
    const ix = f, iy = f, iw = Math.max(0, w - 2 * f), ih = Math.max(0, h - 2 * f);

    fillWith(ctx, (c) => shapePath(c, 0, 0, w, h, arch), () => {
      if (f > 0) prim(ctx, el, 0, 0, w, h, s, time, 'frame');
      fillWith(ctx, (c) => shapePath(c, ix, iy, iw, ih, arch), () => {
        sec(ctx, el, ix, iy, iw, ih, s, time, 'back');
        insetShadow(ctx, ix, iy, iw, ih, s);
      });
    });
    if (iw < 2 || ih < 2) return;

    const rand = rngFor(el, 'decor');
    if (preset.propKind === 'logs') {
      if (p.showProps) drawLogs(ctx, rand, ix, iy, iw, ih, s);
      return;
    }

    const bays = autoBays(p, iw / s, isVitrine ? 50 : 999);
    const rows = Math.max(1, (p.shelves || 0) + 1);
    const plank = Math.max(1.2, 2.5 * s);
    const divider = Math.max(1, Math.min(2.5 * s, f || 2 * s));
    const archClearance = arch ? Math.min(iw / 2, ih) * 0.6 : 0; // keep shelves out of the arch crown
    const usableTop = iy + archClearance;
    const usableH = iy + ih - usableTop;
    const colW = (iw - divider * (bays - 1)) / bays;

    // vertical dividers
    for (let b = 1; b < bays; b++) {
      const dx = ix + b * colW + (b - 1) * divider;
      fillWith(ctx, (c) => shapePath(c, ix, iy, iw, ih, arch), () => prim(ctx, el, dx, iy, divider, ih, s, time, 'div' + b));
    }
    // shelves + decor per compartment
    const rowH = usableH / rows;
    for (let r = 0; r < rows; r++) {
      const floorY = usableTop + rowH * (r + 1) - (r < rows - 1 ? plank : 0);
      if (r < rows - 1) {
        prim(ctx, el, ix, floorY, iw, plank, s, time, 'shelf' + r);
        const g = ctx.createLinearGradient(0, floorY + plank, 0, floorY + plank + 4 * s);
        g.addColorStop(0, 'rgba(0,0,0,0.28)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(ix, floorY + plank, iw, 4 * s);
      }
      if (p.showProps) {
        const bayTop = r === 0 ? usableTop : usableTop + rowH * r;
        for (let b = 0; b < bays; b++) drawDecor(ctx, rand, ix + b * (colW + divider), floorY, colW, floorY - bayTop, s);
      }
    }

    if (isVitrine) {
      // glass doors with slim mullions + sheen, one per bay
      const m = Math.max(1, 1.2 * s);
      for (let b = 0; b < bays; b++) {
        const dx = ix + b * (colW + divider), dw = colW;
        fillWith(ctx, (c) => shapePath(c, ix, iy, iw, ih, arch), () => {
          ctx.fillStyle = 'rgba(205,222,232,0.10)';
          ctx.fillRect(dx, iy, dw, ih);
          const sh = ctx.createLinearGradient(dx, iy, dx + dw, iy + ih * 0.6);
          sh.addColorStop(0, 'rgba(255,255,255,0)');
          sh.addColorStop(0.35, 'rgba(255,255,255,0.16)');
          sh.addColorStop(0.45, 'rgba(255,255,255,0.03)');
          sh.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sh;
          ctx.fillRect(dx, iy, dw, ih);
          ctx.strokeStyle = U.rgba(U.shade(el.color, -0.2), 0.95);
          ctx.lineWidth = m;
          ctx.strokeRect(dx + m / 2, iy + m / 2, dw - m, ih - m);
        });
        drawHandle(ctx, p.handleStyle, dx, iy + ih * 0.35, dw, ih * 0.6, s, false, b % 2 === 0);
      }
    }
  }

  function cabinet(ctx, el, w, h, s, time) {
    const p = el.params || {};
    const top = Math.min(h * 0.4, (p.topSlabCm || 0) * s);
    const plinth = Math.min(h * 0.4, (p.plinthHeightCm || 0) * s);
    const bodyY = top, bodyH = Math.max(0, h - top - plinth);

    // recessed plinth / legs
    if (plinth > 0) {
      const inset = Math.min(w * 0.08, 4 * s);
      sec(ctx, el, inset, h - plinth, w - inset * 2, plinth, s, time, 'plinth');
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(inset, h - plinth, w - inset * 2, plinth);
    }
    // body fronts
    prim(ctx, el, 0, bodyY, w, bodyH, s, time, 'body');
    // top slab
    if (top > 0) {
      const over = Math.min(1.5 * s, w * 0.02);
      sec(ctx, el, -over, 0, w + over * 2, top, s, time, 'top');
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-over, 0, w + over * 2, Math.max(1, 0.3 * s));
      const g = ctx.createLinearGradient(0, top, 0, top + 3 * s);
      g.addColorStop(0, 'rgba(0,0,0,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, top, w, 3 * s);
    }
    if (bodyH < 3) return;

    // drawer rows on top, door bays below
    const nDr = p.drawers || 0;
    const bays = autoBays(p, w / s, 60);
    let drawerH = nDr ? Math.min(20 * s, bodyH / nDr) : 0;
    let doorsH = bodyH - drawerH * nDr;
    if (doorsH < 8 * s) {
      drawerH = nDr ? bodyH / nDr : 0;
      doorsH = nDr ? 0 : bodyH;
    }
    const style = p.handleStyle || 'groove';
    for (let d = 0; d < nDr; d++) {
      const dy = bodyY + d * drawerH;
      if (d > 0) seam(ctx, 0, dy, w, dy, el.color, s);
      drawHandle(ctx, style, 0, dy, w, drawerH, s, true);
    }
    if (doorsH > 0) {
      const dy = bodyY + nDr * drawerH;
      if (nDr) seam(ctx, 0, dy, w, dy, el.color, s);
      const bw = w / bays;
      for (let b = 0; b < bays; b++) {
        if (b > 0) seam(ctx, b * bw, dy, b * bw, dy + doorsH, el.color, s);
        drawHandle(ctx, style, b * bw, dy, bw, doorsH, s, bays === 1 || doorsH < 18 * s, b % 2 === 0);
      }
    }
    // body depth shading
    const g = ctx.createLinearGradient(0, bodyY + bodyH - 2 * s, 0, bodyY + bodyH);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(0, bodyY + bodyH - 2 * s, w, 2 * s);
  }

  const PITCH = { fine: [2, 0.7], standard: [3, 1.2], wide: [6, 2] };
  function cladding(ctx, el, w, h, s, time) {
    const p = el.params || {};
    sec(ctx, el, 0, 0, w, h, s, time, 'back');
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, w, h);
    let [slat, gap] = PITCH[p.slatPitch] || PITCH.standard;
    slat *= s;
    gap *= s;
    if (slat + gap < 4) {
      const k = 4 / (slat + gap);
      slat *= k;
      gap *= k;
    }
    const pitch = slat + gap;
    const n = Math.ceil(w / pitch);
    const off = (w - n * pitch + gap) / 2;
    const rand = rngFor(el, 'slat');
    for (let i = 0; i < n; i++) {
      const x = off + i * pitch;
      prim(ctx, el, x, 0, slat, h, s, time, 'slat' + (i % 7));
      const g = ctx.createLinearGradient(x, 0, x + slat, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.14)');
      g.addColorStop(0.35, 'rgba(255,255,255,0)');
      g.addColorStop(1, `rgba(0,0,0,${0.22 + rand() * 0.08})`);
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, slat, h);
    }
    const v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(0,0,0,0.12)');
    v.addColorStop(0.15, 'rgba(0,0,0,0)');
    v.addColorStop(0.9, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function framed(ctx, el, w, h, s, time) {
    const p = el.params || {};
    const f = Math.max(0, (p.frameWidthCm || 0) * s);
    const arch = !!p.archTop;
    fillWith(ctx, (c) => shapePath(c, 0, 0, w, h, arch), () => {
      sec(ctx, el, 0, 0, w, h, s, time, 'frame');
      fillWith(ctx, (c) => shapePath(c, f, f, w - 2 * f, h - 2 * f, arch), () => prim(ctx, el, f, f, w - 2 * f, h - 2 * f, s, time, 'face'));
    });
    if (f > 0) {
      ctx.save();
      shapePath(ctx, f, f, w - 2 * f, h - 2 * f, arch);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1, 0.4 * s);
      ctx.stroke();
      shapePath(ctx, 0.5, 0.5, w - 1, h - 1, arch);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  function fireplace(ctx, el, w, h, s, time) {
    const p = el.params || {};
    const f = Math.min(w / 4, h / 4, Math.max(0, (p.frameWidthCm || 0) * s));
    if (f > 0) sec(ctx, el, 0, 0, w, h, s, time, 'surround');
    ctx.save();
    ctx.beginPath();
    ctx.rect(f, f, w - 2 * f, h - 2 * f);
    ctx.clip();
    ctx.translate(f, f);
    A.textures.paintSurface(ctx, Object.assign({}, el, { _bare: true }), w - 2 * f, h - 2 * f, s, time);
    ctx.restore();
  }

  function panelGrid(ctx, el, w, h, s, time) {
    const p = el.params || {};
    sec(ctx, el, 0, 0, w, h, s, time, 'trim');
    const cols = Math.max(1, p.bays || 2), rows = Math.max(1, p.shelves || 3);
    const gap = Math.max(1, 0.8 * s);
    const tw = (w - gap * (cols + 1)) / cols, th = (h - gap * (rows + 1)) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = gap + c * (tw + gap), y = gap + r * (th + gap);
        prim(ctx, el, x, y, tw, th, s, time, 't' + ((r * cols + c) % 5));
        const g = ctx.createRadialGradient(x + tw / 2, y + th / 2, Math.min(tw, th) * 0.2, x + tw / 2, y + th / 2, Math.max(tw, th) * 0.7);
        g.addColorStop(0, 'rgba(255,255,255,0.06)');
        g.addColorStop(1, 'rgba(0,0,0,0.22)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, tw, th);
      }
    }
  }

  /* ---------- silhouettes (seating, lighting, decor) ---------- */
  const shapes = {
    bench(ctx, el, w, h, s, t) {
      fillWith(ctx, (c) => c.rect(w * 0.03, h * 0.38, w * 0.94, h * 0.62), () => sec(ctx, el, 0, 0, w, h, s, t, 'base'));
      fillWith(ctx, (c) => roundRect(c, 0, 0, w, h * 0.42, 4 * s), () => prim(ctx, el, 0, 0, w, h * 0.42, s, t, 'cush'));
    },
    lounge(ctx, el, w, h, s, t) {
      const legH = h * 0.14;
      fillWith(ctx, (c) => {
        c.beginPath();
        c.rect(w * 0.1, h - legH, Math.max(1, 2 * s), legH);
        c.rect(w * 0.9 - 2 * s, h - legH, Math.max(1, 2 * s), legH);
      }, () => sec(ctx, el, 0, 0, w, h, s, t, 'legs'));
      fillWith(ctx, (c) => roundRect(c, w * 0.14, 0, w * 0.72, h * 0.66, 10 * s), () => prim(ctx, el, 0, 0, w, h, s, t, 'back'));
      fillWith(ctx, (c) => roundRect(c, w * 0.04, h * 0.48, w * 0.92, h * 0.38, 8 * s), () => prim(ctx, el, 0, 0, w, h, s, t, 'seat'));
      for (const ax of [0, w * 0.82]) fillWith(ctx, (c) => roundRect(c, ax, h * 0.3, w * 0.18, h * 0.56, 7 * s), () => prim(ctx, el, 0, 0, w, h, s, t, 'arm'));
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(w * 0.18, h * 0.48, w * 0.64, Math.max(1, 0.5 * s));
    },
    chair(ctx, el, w, h, s, t) {
      const leg = Math.max(1, 1.6 * s);
      fillWith(ctx, (c) => {
        c.beginPath();
        c.rect(w * 0.12, h * 0.55, leg, h * 0.45);
        c.rect(w * 0.88 - leg, h * 0.55, leg, h * 0.45);
      }, () => sec(ctx, el, 0, 0, w, h, s, t, 'legs'));
      fillWith(ctx, (c) => roundRect(c, w * 0.16, 0, w * 0.68, h * 0.5, 5 * s), () => prim(ctx, el, 0, 0, w, h, s, t, 'back'));
      fillWith(ctx, (c) => roundRect(c, w * 0.04, h * 0.5, w * 0.92, h * 0.12, 3 * s), () => prim(ctx, el, 0, 0, w, h, s, t, 'seat'));
    },
    sofa(ctx, el, w, h, s, t) {
      fillWith(ctx, (c) => c.rect(w * 0.04, h * 0.88, w * 0.92, h * 0.12), () => sec(ctx, el, 0, 0, w, h, s, t, 'base'));
      fillWith(ctx, (c) => roundRect(c, w * 0.04, 0, w * 0.92, h * 0.6, 6 * s), () => prim(ctx, el, 0, 0, w, h, s, t, 'back'));
      const armW = Math.min(22 * s, w * 0.1);
      const seatX = armW, seatW = w - armW * 2, n = 3;
      for (let i = 0; i < n; i++) {
        const cx = seatX + (seatW / n) * i;
        fillWith(ctx, (c) => roundRect(c, cx + 0.5 * s, h * 0.5, seatW / n - 1 * s, h * 0.38, 5 * s), () => prim(ctx, el, 0, 0, w, h, s, t, 'c' + i));
      }
      for (const ax of [0, w - armW]) fillWith(ctx, (c) => roundRect(c, ax, h * 0.3, armW, h * 0.58, 6 * s), () => prim(ctx, el, 0, 0, w, h, s, t, 'arm'));
    },
    floorLamp(ctx, el, w, h, s, t) {
      const pole = Math.max(1, 1.2 * s), cx = w / 2;
      fillWith(ctx, (c) => {
        c.beginPath();
        c.rect(cx - pole / 2, h * 0.26, pole, h * 0.72);
        c.rect(w * 0.25, h - Math.max(1.5, 2 * s), w * 0.5, Math.max(1.5, 2 * s));
      }, () => prim(ctx, el, 0, 0, w, h, s, t, 'pole'));
      fillWith(ctx, (c) => {
        c.beginPath();
        c.moveTo(w * 0.2, 0);
        c.lineTo(w * 0.8, 0);
        c.lineTo(w, h * 0.27);
        c.lineTo(0, h * 0.27);
        c.closePath();
      }, () => {
        sec(ctx, el, 0, 0, w, h * 0.27, s, t, 'shade');
        ctx.fillStyle = 'rgba(255,200,120,0.22)';
        ctx.fillRect(0, 0, w, h * 0.27);
      });
    },
    tableLamp(ctx, el, w, h, s, t) {
      fillWith(ctx, (c) => {
        c.beginPath();
        c.ellipse(w / 2, h * 0.72, w * 0.32, h * 0.28, 0, 0, Math.PI * 2);
      }, () => prim(ctx, el, 0, 0, w, h, s, t, 'base'));
      fillWith(ctx, (c) => {
        c.beginPath();
        c.moveTo(w * 0.22, 0);
        c.lineTo(w * 0.78, 0);
        c.lineTo(w, h * 0.45);
        c.lineTo(0, h * 0.45);
        c.closePath();
      }, () => {
        sec(ctx, el, 0, 0, w, h * 0.45, s, t, 'shade');
        ctx.fillStyle = 'rgba(255,200,120,0.25)';
        ctx.fillRect(0, 0, w, h * 0.45);
      });
    },
    pendant(ctx, el, w, h, s, t) {
      ctx.fillStyle = U.shade(el.color, -0.2);
      ctx.fillRect(w / 2 - 0.5, 0, 1, h * 0.62);
      fillWith(ctx, (c) => roundRect(c, 0, h * 0.62, w, h * 0.34, 1.5 * s), () => prim(ctx, el, 0, 0, w, h, s, t, 'shade'));
      fillWith(ctx, (c) => c.rect(w * 0.08, h * 0.95, w * 0.84, h * 0.05), () => {
        ctx.fillStyle = el.secondaryColor || '#f0e0c0';
        ctx.fillRect(0, 0, w, h);
      });
    },
    turntable(ctx, el, w, h, s, t) {
      fillWith(ctx, (c) => c.rect(0, h * 0.4, w, h * 0.6), () => prim(ctx, el, 0, 0, w, h, s, t, 'plinth'));
      fillWith(ctx, (c) => c.rect(w * 0.08, h * 0.25, w * 0.6, h * 0.15), () => {
        ctx.fillStyle = '#141414';
        ctx.fillRect(0, 0, w, h);
      });
      ctx.strokeStyle = el.secondaryColor || '#b2b6ba';
      ctx.lineWidth = Math.max(1, 0.5 * s);
      ctx.beginPath();
      ctx.moveTo(w * 0.85, h * 0.4);
      ctx.lineTo(w * 0.85, h * 0.1);
      ctx.lineTo(w * 0.55, h * 0.22);
      ctx.stroke();
    },
    decor(ctx, el, w, h, s, t) {
      const rand = rngFor(el, 'decor');
      let y = h;
      for (let i = 0; i < 3; i++) {
        const bh = (3 + rand() * 2) * s, bw = w * (0.5 - i * 0.05);
        ctx.fillStyle = i === 0 ? el.color : BOOK_PALETTE[Math.floor(rand() * BOOK_PALETTE.length)];
        ctx.fillRect(w * 0.02 + i * 1.2 * s, y - bh, bw, bh);
        y -= bh;
      }
      const vw = w * 0.22, vh = h * 0.7;
      ctx.fillStyle = el.secondaryColor || '#7d6b5d';
      ctx.beginPath();
      ctx.ellipse(w * 0.8, h - vh / 2, vw / 2, vh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8c7a5c';
      ctx.lineWidth = Math.max(0.5, 0.3 * s);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.8, h - vh);
        ctx.quadraticCurveTo(w * (0.7 + rand() * 0.25), h * 0.2, w * (0.62 + rand() * 0.36), -h * 0.3);
        ctx.stroke();
      }
    },
    plant(ctx, el, w, h, s, t) {
      const potH = h * 0.32;
      fillWith(ctx, (c) => {
        c.beginPath();
        c.moveTo(w * 0.15, h - potH);
        c.lineTo(w * 0.85, h - potH);
        c.lineTo(w * 0.75, h);
        c.lineTo(w * 0.25, h);
        c.closePath();
      }, () => prim(ctx, el, 0, 0, w, h, s, t, 'pot'));
      const rand = rngFor(el, 'leaf');
      const leaf = el.secondaryColor || '#5f6e52';
      ctx.strokeStyle = U.shade(leaf, -0.4);
      ctx.lineWidth = Math.max(0.6, 0.4 * s);
      ctx.beginPath();
      ctx.moveTo(w / 2, h - potH);
      ctx.lineTo(w / 2, h * 0.15);
      ctx.stroke();
      for (let i = 0; i < 46; i++) {
        const lx = w * (0.1 + rand() * 0.8), ly = h * (0.02 + rand() * 0.62);
        ctx.fillStyle = U.shade(leaf, (rand() - 0.5) * 0.35);
        ctx.beginPath();
        ctx.ellipse(lx, ly, (3 + rand() * 3) * s, (1.6 + rand() * 1.4) * s, rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
  function silhouette(ctx, el, w, h, s, time) {
    const shape = (V.presets[el.type] || {}).shape;
    (shapes[shape] || shapes.bench)(ctx, el, w, h, s, time);
  }

  const painters = {
    niche,
    vitrine: (ctx, el, w, h, s, t) => niche(ctx, el, w, h, s, t, { vitrine: true }),
    cabinet,
    cladding,
    framed,
    fireplace,
    panelGrid,
    silhouette,
  };

  A.parts = {
    /** Archetype id for an element ('plain' when it has no multi-part painter). */
    archetypeOf(el) {
      const a = (V.presets[el.type] || {}).archetype;
      return a && painters[a] ? a : 'plain';
    },
    /** Returns true when it painted the element (caller falls back to the plain texture otherwise). */
    paint(ctx, el, w, h, s, time) {
      const a = A.parts.archetypeOf(el);
      if (a === 'plain') return false;
      painters[a](ctx, el, w, h, s, time || 0);
      return true;
    },
  };
})();
