/* Arch2D — WS3: procedural Canvas 2D textures (project.md §3.7). No SVG, no external
   images, so export via toDataURL() can never be tainted. Deterministic per element id. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;

  const cache = new Map(); // LRU of pre-rendered static textures
  const CACHE_MAX = 96;

  /* ---------- helpers ---------- */
  function seeded(el, salt) {
    return U.rng(U.hashString(el.id + '|' + (salt || '')));
  }
  function doorSplits(ctx, w, h, s, color) {
    const doorCm = 60;
    if (w / s < 90 || h / s < 30) return;
    const n = Math.max(2, Math.round(w / s / doorCm));
    ctx.save();
    for (let i = 1; i < n; i++) {
      const x = Math.round((w / n) * i) + 0.5;
      ctx.strokeStyle = U.rgba(U.shade(color, -0.55), 0.55);
      ctx.lineWidth = Math.max(1, 0.25 * s);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.strokeStyle = U.rgba('#ffffff', 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 1, 0);
      ctx.lineTo(x + 1, h);
      ctx.stroke();
    }
    ctx.restore();
  }
  function edgeShading(ctx, w, h, s) {
    // top highlight + bottom shadow lip gives every box a sense of depth
    const lip = Math.max(1, Math.min(h * 0.12, 1.2 * s));
    let g = ctx.createLinearGradient(0, 0, 0, lip * 2);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, lip * 2);
    g = ctx.createLinearGradient(0, h - lip * 2, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h - lip * 2, w, lip * 2);
  }
  function noise(ctx, w, h, rand, density, alpha) {
    const count = Math.min(2200, Math.floor(w * h * density));
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
      ctx.fillRect(rand() * w, rand() * h, 1, 1);
    }
  }

  /* ---------- texture painters: draw into (0,0,w,h) ---------- */
  const painters = {
    slats(ctx, el, w, h, s) {
      const c = el.color;
      const rand = seeded(el, 'slats');
      ctx.fillStyle = U.shade(c, -0.55); // shadow gaps
      ctx.fillRect(0, 0, w, h);
      let slat = 3 * s;
      let gap = 1.2 * s;
      const minPitch = 4; // px — keep slats readable when zoomed out
      if (slat + gap < minPitch) {
        const k = minPitch / (slat + gap);
        slat *= k;
        gap *= k;
      }
      const pitch = slat + gap;
      const count = Math.ceil(w / pitch);
      const offset = (w - count * pitch + gap) / 2;
      for (let i = 0; i < count; i++) {
        const x = offset + i * pitch;
        const tone = U.shade(c, (rand() - 0.5) * 0.1);
        const g = ctx.createLinearGradient(x, 0, x + slat, 0);
        g.addColorStop(0, U.shade(tone, 0.18));
        g.addColorStop(0.35, tone);
        g.addColorStop(1, U.shade(tone, -0.28));
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, slat, h);
        // subtle vertical grain
        if (slat > 5) {
          ctx.strokeStyle = U.rgba(U.shade(tone, -0.4), 0.12);
          ctx.lineWidth = 0.6;
          for (let k = 0; k < 2; k++) {
            const gx = x + slat * (0.2 + rand() * 0.6);
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.bezierCurveTo(gx + rand() * 2 - 1, h * 0.33, gx + rand() * 2 - 1, h * 0.66, gx, h);
            ctx.stroke();
          }
        }
      }
      // floor/ceiling shadow falloff
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,0.12)');
      g.addColorStop(0.15, 'rgba(0,0,0,0)');
      g.addColorStop(0.9, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },

    woodgrain(ctx, el, w, h, s) {
      const c = el.color;
      const rand = seeded(el, 'grain');
      const base = ctx.createLinearGradient(0, 0, w, h);
      base.addColorStop(0, U.shade(c, 0.06));
      base.addColorStop(1, U.shade(c, -0.06));
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      const spacing = Math.max(2.5, 1.1 * s);
      const lines = Math.ceil(h / spacing) + 2;
      ctx.lineWidth = Math.max(0.6, 0.12 * s);
      for (let i = 0; i < lines; i++) {
        const y0 = i * spacing + (rand() - 0.5) * spacing;
        const amp = (0.3 + rand() * 0.9) * spacing;
        const freq = (0.6 + rand() * 1.4) * (Math.PI * 2) / Math.max(w, 1);
        const phase = rand() * Math.PI * 2;
        ctx.strokeStyle = U.rgba(U.shade(c, -0.45), 0.08 + rand() * 0.14);
        ctx.beginPath();
        for (let x = 0; x <= w; x += Math.max(4, w / 60)) {
          const y = y0 + Math.sin(x * freq + phase) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // cathedral arches / knots
      const knots = Math.min(6, Math.floor((w * h) / (90 * s * 40 * s)) + 1);
      for (let k = 0; k < knots; k++) {
        const cx = rand() * w;
        const cy = rand() * h;
        const rx = (8 + rand() * 14) * s;
        const ry = (1.2 + rand() * 2) * s;
        for (let r = 1; r <= 4; r++) {
          ctx.strokeStyle = U.rgba(U.shade(c, -0.5), 0.07);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx * (r / 4), ry * (r / 4), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      doorSplits(ctx, w, h, s, c);
      // recessed handle groove along the top
      if (h / s >= 25 && w / s >= 60) {
        const gy = Math.max(2, 2.5 * s);
        ctx.fillStyle = U.rgba(U.shade(c, -0.7), 0.55);
        ctx.fillRect(0, gy, w, Math.max(1, 0.6 * s));
      }
      edgeShading(ctx, w, h, s);
    },

    matte(ctx, el, w, h, s) {
      const c = el.color;
      const rand = seeded(el, 'matte');
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, U.shade(c, 0.05));
      g.addColorStop(1, U.shade(c, -0.05));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      noise(ctx, w, h, rand, 0.12, 0.035);
      doorSplits(ctx, w, h, s, c);
      edgeShading(ctx, w, h, s);
    },

    glass(ctx, el, w, h, s) {
      const c = el.color;
      const bezel = Math.max(1.5, 0.7 * s);
      ctx.fillStyle = U.shade(c, -0.35);
      ctx.fillRect(0, 0, w, h);
      const ix = bezel, iy = bezel, iw = w - bezel * 2, ih = h - bezel * 2;
      const g = ctx.createLinearGradient(0, iy, 0, iy + ih);
      g.addColorStop(0, U.shade(c, 0.1));
      g.addColorStop(1, U.shade(c, -0.1));
      ctx.fillStyle = g;
      ctx.fillRect(ix, iy, iw, ih);
      // soft inner glow (panel backlight)
      const rg = ctx.createRadialGradient(ix + iw * 0.3, iy + ih * 0.25, 0, ix + iw * 0.3, iy + ih * 0.25, Math.max(iw, ih) * 0.9);
      rg.addColorStop(0, 'rgba(120,150,190,0.16)');
      rg.addColorStop(1, 'rgba(120,150,190,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(ix, iy, iw, ih);
      // diagonal sheen band
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix, iy, iw, ih);
      ctx.clip();
      const sheen = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
      sheen.addColorStop(0.0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.28, 'rgba(255,255,255,0.10)');
      sheen.addColorStop(0.36, 'rgba(255,255,255,0.02)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);
    },

    mesh(ctx, el, w, h, s) {
      const c = el.color;
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, w, h);
      const pitch = Math.max(3, 0.7 * s);
      const tile = document.createElement('canvas');
      const tp = Math.max(2, Math.round(pitch));
      tile.width = tile.height = tp;
      const t = tile.getContext('2d');
      t.fillStyle = U.rgba(U.shade(c, 0.35), 0.5);
      t.beginPath();
      t.arc(tp / 2, tp / 2, Math.max(0.5, tp * 0.2), 0, Math.PI * 2);
      t.fill();
      t.fillStyle = U.rgba(U.shade(c, -0.5), 0.35);
      t.fillRect(0, 0, tp, Math.max(0.5, tp * 0.12));
      ctx.fillStyle = ctx.createPattern(tile, 'repeat');
      ctx.fillRect(0, 0, w, h);
      edgeShading(ctx, w, h, s);
      // rounded end caps feel
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.25)');
      g.addColorStop(0.04, 'rgba(0,0,0,0)');
      g.addColorStop(0.96, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },

    niche(ctx, el, w, h, s) {
      const c = el.color;
      const rand = seeded(el, 'niche');
      const frame = Math.max(2, 2 * s);
      ctx.fillStyle = U.shade(c, 0.04);
      ctx.fillRect(0, 0, w, h);
      const ix = frame, iy = frame, iw = Math.max(0, w - frame * 2), ih = Math.max(0, h - frame * 2);
      // recess with inset shadow
      ctx.fillStyle = U.shade(c, -0.22);
      ctx.fillRect(ix, iy, iw, ih);
      let g = ctx.createLinearGradient(0, iy, 0, iy + Math.min(ih, 12 * s));
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ix, iy, iw, Math.min(ih, 12 * s));
      g = ctx.createLinearGradient(ix, 0, ix + Math.min(iw, 6 * s), 0);
      g.addColorStop(0, 'rgba(0,0,0,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ix, iy, Math.min(iw, 6 * s), ih);

      // shelves every ~35cm with objects
      const shelfCm = 35;
      const nShelves = Math.max(0, Math.floor(ih / s / shelfCm) - 1);
      const levels = [];
      for (let i = 1; i <= nShelves; i++) levels.push(iy + (ih / (nShelves + 1)) * i);
      levels.push(iy + ih); // base
      const thick = Math.max(1.5, 2.5 * s);
      const palette = ['#7d6b5d', '#a79584', '#5d6a72', '#b9a88f', '#8b5e4a', '#3f4a52', '#d8cfc0'];
      let prev = iy;
      for (const ly of levels) {
        const bay = ly - prev - thick;
        if (bay / s >= 22 && iw / s >= 20) {
          let x = ix + iw * (0.08 + rand() * 0.2);
          const end = ix + iw * (0.55 + rand() * 0.3);
          while (x < end) {
            const bw = (2 + rand() * 2.5) * s;
            const bh = Math.min(bay * 0.9, (17 + rand() * 9) * s);
            ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
            const lean = rand() < 0.08;
            if (lean) {
              ctx.save();
              ctx.translate(x, ly);
              ctx.rotate(-0.25);
              ctx.fillRect(0, -bh, bw, bh);
              ctx.restore();
              x += bw * 2.2;
            } else {
              ctx.fillRect(x, ly - bh, bw, bh);
              x += bw + 0.25 * s;
            }
          }
          if (rand() < 0.65 && end + 14 * s < ix + iw) {
            // vase
            const vx = end + (5 + rand() * 6) * s;
            const vh = Math.min(bay * 0.7, (12 + rand() * 10) * s);
            const vw = vh * (0.45 + rand() * 0.2);
            ctx.fillStyle = rand() < 0.5 ? '#e9e3d8' : '#3b3633';
            ctx.beginPath();
            ctx.ellipse(vx, ly - vh / 2, vw / 2, vh / 2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (ly < iy + ih - 0.5) {
          ctx.fillStyle = U.shade(c, 0.12);
          ctx.fillRect(ix, ly - thick, iw, thick);
          g = ctx.createLinearGradient(0, ly, 0, ly + 4 * s);
          g.addColorStop(0, 'rgba(0,0,0,0.25)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(ix, ly, iw, 4 * s);
        }
        prev = ly;
      }
    },

    fireplace(ctx, el, w, h, s, time) {
      const c = el.color;
      const rand = seeded(el, 'fire');
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, w, h);
      const inset = Math.max(2, 3 * s);
      const ix = inset, iy = inset, iw = Math.max(0, w - inset * 2), ih = Math.max(0, h - inset * 2);
      ctx.fillStyle = '#060504';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix, iy, iw, ih);
      ctx.clip();
      // ember bed
      const bedH = Math.max(2, ih * 0.16);
      let g = ctx.createLinearGradient(0, iy + ih - bedH, 0, iy + ih);
      g.addColorStop(0, 'rgba(255,120,40,0.0)');
      g.addColorStop(0.5, 'rgba(255,110,30,0.65)');
      g.addColorStop(1, 'rgba(120,30,10,0.9)');
      ctx.fillStyle = g;
      ctx.fillRect(ix, iy + ih - bedH, iw, bedH);
      // flames
      ctx.globalCompositeOperation = 'lighter';
      const n = Math.max(4, Math.round(iw / (9 * s)));
      const t = (time || 0) / 1000;
      for (let i = 0; i < n; i++) {
        const phase = rand() * Math.PI * 2;
        const speed = 2 + rand() * 2.5;
        const fx = ix + (iw / n) * (i + 0.5) + Math.sin(t * 1.3 + phase) * (iw / n) * 0.15;
        const fh = ih * (0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * speed + phase)) + rand() * 0.1);
        const fw = (iw / n) * (0.9 + rand() * 0.6);
        const base = iy + ih - bedH * 0.4;
        const fg = ctx.createLinearGradient(0, base, 0, base - fh);
        fg.addColorStop(0, 'rgba(255,170,60,0.85)');
        fg.addColorStop(0.45, 'rgba(255,110,30,0.55)');
        fg.addColorStop(1, 'rgba(255,60,10,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(fx - fw / 2, base);
        ctx.quadraticCurveTo(fx - fw * 0.45, base - fh * 0.55, fx + Math.sin(t * 3 + phase) * fw * 0.15, base - fh);
        ctx.quadraticCurveTo(fx + fw * 0.45, base - fh * 0.55, fx + fw / 2, base);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // glass reflection
      g = ctx.createLinearGradient(ix, iy, ix + iw * 0.6, iy + ih);
      g.addColorStop(0, 'rgba(255,255,255,0.08)');
      g.addColorStop(0.4, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.restore();
    },

    marble(ctx, el, w, h, s) {
      const c = el.color;
      const rand = seeded(el, 'marble');
      // Honed stone base with soft diagonal gradient
      const base = ctx.createLinearGradient(0, 0, w, h);
      base.addColorStop(0, U.shade(c, 0.04));
      base.addColorStop(0.5, c);
      base.addColorStop(1, U.shade(c, -0.04));
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      // Soft mineral clouding / mottling
      noise(ctx, w, h, rand, 0.15, 0.025);

      // Procedural flowing diagonal veins
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();

      const numVeins = Math.max(2, Math.min(6, Math.round((w + h) / (60 * s))));
      const veinColor = U.luminance(c) > 0.4 ? U.shade(c, -0.38) : U.shade(c, 0.35);

      for (let v = 0; v < numVeins; v++) {
        const startX = (rand() * 1.4 - 0.2) * w;
        const startY = -h * 0.1;
        const endX = startX + (0.5 + rand() * 0.5) * w;
        const endY = h * 1.1;

        ctx.strokeStyle = U.rgba(veinColor, 0.12 + rand() * 0.18);
        ctx.lineWidth = Math.max(0.8, (0.4 + rand() * 0.8) * s);
        ctx.beginPath();
        ctx.moveTo(startX, startY);

        const cp1x = startX + (endX - startX) * 0.35 + (rand() - 0.5) * 40 * s;
        const cp1y = startY + (endY - startY) * 0.33 + (rand() - 0.5) * 20 * s;
        const cp2x = startX + (endX - startX) * 0.65 + (rand() - 0.5) * 50 * s;
        const cp2y = startY + (endY - startY) * 0.66 + (rand() - 0.5) * 20 * s;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
        ctx.stroke();

        // Branching sub-veins
        if (rand() < 0.75) {
          ctx.strokeStyle = U.rgba(veinColor, 0.07 + rand() * 0.09);
          ctx.lineWidth = Math.max(0.5, 0.25 * s);
          ctx.beginPath();
          const bx = cp1x;
          const by = cp1y;
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + (rand() - 0.5) * 35 * s, by + 20 * s, bx + (rand() - 0.5) * 60 * s, by + 45 * s);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Stone chamfer edge highlight
      edgeShading(ctx, w, h, s);
    },

    travertine(ctx, el, w, h, s) {
      const c = el.color;
      const rand = seeded(el, 'travertine');

      // Base warm stone
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, w, h);

      // Horizontal sediment bands
      const bandHeight = Math.max(3, 1.4 * s);
      const bands = Math.ceil(h / bandHeight);
      for (let i = 0; i < bands; i++) {
        const toneShift = (rand() - 0.5) * 0.12;
        ctx.fillStyle = U.rgba(U.shade(c, toneShift), 0.25 + rand() * 0.2);
        ctx.fillRect(0, i * bandHeight, w, bandHeight);
      }

      // Horizontal micropores and voids
      const numPores = Math.min(250, Math.floor((w * h) / (18 * s * 18 * s)));
      const poreColor = U.shade(c, -0.45);
      for (let p = 0; p < numPores; p++) {
        const px = rand() * w;
        const py = rand() * h;
        const pw = (1.5 + rand() * 4.5) * s;
        const ph = Math.max(0.8, (0.3 + rand() * 0.6) * s);
        ctx.fillStyle = U.rgba(poreColor, 0.22 + rand() * 0.25);
        ctx.fillRect(px, py, pw, ph);
      }

      edgeShading(ctx, w, h, s);
    },

    fluted(ctx, el, w, h, s) {
      const c = el.color;
      const rand = seeded(el, 'fluted');

      // Tighter pitch than slats (approx 1.8cm pitch)
      let pitch = Math.max(4, 1.8 * s);
      const count = Math.ceil(w / pitch);
      const offset = (w - count * pitch) / 2;

      ctx.fillStyle = U.shade(c, -0.45); // shadow grooves
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < count; i++) {
        const x = offset + i * pitch;
        const tone = U.shade(c, (rand() - 0.5) * 0.08);

        // Cylindrical rounded fluting gradient
        const g = ctx.createLinearGradient(x, 0, x + pitch, 0);
        g.addColorStop(0, U.shade(tone, -0.35));
        g.addColorStop(0.2, tone);
        g.addColorStop(0.5, U.shade(tone, 0.22)); // apex highlight
        g.addColorStop(0.8, tone);
        g.addColorStop(1, U.shade(tone, -0.38));

        ctx.fillStyle = g;
        ctx.fillRect(x + 0.5, 0, pitch - 1, h);
      }

      // Subtle vertical light falloff
      const vg = ctx.createLinearGradient(0, 0, 0, h);
      vg.addColorStop(0, 'rgba(0,0,0,0.14)');
      vg.addColorStop(0.12, 'rgba(0,0,0,0)');
      vg.addColorStop(0.88, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    },

    concrete(ctx, el, w, h, s) {
      const c = el.color;
      const rand = seeded(el, 'concrete');

      ctx.fillStyle = c;
      ctx.fillRect(0, 0, w, h);

      // Directional trowel passes / sweeping clouding
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      const numSweeps = Math.max(3, Math.min(10, Math.round((w + h) / (50 * s))));
      for (let i = 0; i < numSweeps; i++) {
        const sx = rand() * w;
        const sy = rand() * h;
        const sw = (20 + rand() * 40) * s;
        const sh = (15 + rand() * 30) * s;
        const tg = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(sw, sh));
        const delta = (rand() - 0.5) * 0.16;
        tg.addColorStop(0, U.rgba(U.shade(c, delta), 0.35));
        tg.addColorStop(1, U.rgba(c, 0));
        ctx.fillStyle = tg;
        ctx.fillRect(sx - sw, sy - sh, sw * 2, sh * 2);
      }
      ctx.restore();

      // Fine aggregate texture noise
      noise(ctx, w, h, rand, 0.18, 0.04);
      edgeShading(ctx, w, h, s);
    },

    metal(ctx, el, w, h, s) {
      const c = el.color;
      const rand = seeded(el, 'metal');

      // Metallic gradient base
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, U.shade(c, 0.12));
      g.addColorStop(0.5, c);
      g.addColorStop(1, U.shade(c, -0.15));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Fine brushed hairline micro-streaks
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      const lines = Math.min(120, Math.floor(h / Math.max(1, 0.6 * s)));
      ctx.lineWidth = 0.5;
      for (let i = 0; i < lines; i++) {
        const y = rand() * h;
        const streakAlpha = 0.05 + rand() * 0.09;
        ctx.strokeStyle = rand() < 0.5 ? `rgba(255,255,255,${streakAlpha})` : `rgba(0,0,0,${streakAlpha})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Anisotropic diagonal reflection sheen
      const sheen = ctx.createLinearGradient(0, 0, w, h * 0.7);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.42, 'rgba(255,255,255,0.18)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // Precision engineered chamfer edges
      edgeShading(ctx, w, h, s);
    },

    fabric(ctx, el, w, h, s) {
      const c = el.color;
      const rand = seeded(el, 'fabric');
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, w, h);

      // Woven cross-hatch fabric pattern
      const pitch = Math.max(2, Math.round(1 * s));
      const tile = document.createElement('canvas');
      tile.width = tile.height = pitch * 2;
      const t = tile.getContext('2d');
      t.fillStyle = U.rgba(U.shade(c, 0.15), 0.4);
      t.fillRect(0, 0, pitch, pitch);
      t.fillRect(pitch, pitch, pitch, pitch);
      t.fillStyle = U.rgba(U.shade(c, -0.2), 0.35);
      t.fillRect(pitch, 0, pitch, pitch);
      t.fillRect(0, pitch, pitch, pitch);

      ctx.fillStyle = ctx.createPattern(tile, 'repeat');
      ctx.fillRect(0, 0, w, h);

      // Organic linen slub noise
      noise(ctx, w, h, rand, 0.12, 0.03);

      // Soft fabric light-absorbent edge vignette
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    },

    mirror(ctx, el, w, h, s) {
      const c = el.color;
      const bezel = Math.max(2, 1.2 * s);

      // Frame / bevel border
      ctx.fillStyle = U.shade(c, -0.45);
      ctx.fillRect(0, 0, w, h);

      const ix = bezel, iy = bezel, iw = w - bezel * 2, ih = h - bezel * 2;

      // Smoked mirror glass
      const g = ctx.createLinearGradient(0, iy, 0, iy + ih);
      g.addColorStop(0, U.shade(c, 0.15));
      g.addColorStop(0.5, c);
      g.addColorStop(1, U.shade(c, -0.25));
      ctx.fillStyle = g;
      ctx.fillRect(ix, iy, iw, ih);

      // High-contrast diagonal reflection bands
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix, iy, iw, ih);
      ctx.clip();

      const sheen1 = ctx.createLinearGradient(ix, iy, ix + iw * 0.8, iy + ih);
      sheen1.addColorStop(0, 'rgba(255,255,255,0)');
      sheen1.addColorStop(0.3, 'rgba(255,255,255,0.24)');
      sheen1.addColorStop(0.38, 'rgba(255,255,255,0.03)');
      sheen1.addColorStop(0.65, 'rgba(255,255,255,0.12)');
      sheen1.addColorStop(0.72, 'rgba(255,255,255,0)');
      sheen1.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen1;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.restore();

      // Polished mirror edge highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);
    },
  };

  function paint(ctx, el, w, h, s, time) {
    (painters[el.texture] || painters.matte)(ctx, el, w, h, s, time);
  }

  const textures = {
    list() {
      return Object.entries(A.vocab.textures).map(([id, t]) => ({ id, label: t.label }));
    },
    animated(el) {
      return el.texture === 'fireplace';
    },
    /** Draw el's texture into rect (CSS px). opts: { pxPerCm, time } */
    draw(ctx, el, rect, opts = {}) {
      const s = opts.pxPerCm || 1;
      const w = rect.w, h = rect.h;
      if (w < 1 || h < 1) return;
      ctx.save();
      ctx.globalAlpha *= el.opacity == null ? 1 : el.opacity;
      if (textures.animated(el)) {
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, w, h);
        ctx.clip();
        ctx.translate(rect.x, rect.y);
        paint(ctx, el, w, h, s, opts.time || 0);
        ctx.restore();
        return;
      }
      const m = ctx.getTransform();
      const scale = Math.max(1, Math.hypot(m.a, m.b));
      const key = [el.id, el.texture, el.color, Math.round(w), Math.round(h), s.toFixed(3), scale.toFixed(2)].join('|');
      let tile = cache.get(key);
      if (tile) {
        cache.delete(key);
        cache.set(key, tile);
      } else {
        tile = document.createElement('canvas');
        tile.width = Math.max(1, Math.ceil(w * scale));
        tile.height = Math.max(1, Math.ceil(h * scale));
        const tctx = tile.getContext('2d');
        tctx.scale(scale, scale);
        paint(tctx, el, w, h, s, 0);
        cache.set(key, tile);
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      }
      ctx.drawImage(tile, rect.x, rect.y, w, h);
      ctx.restore();
    },
    clearCache() {
      cache.clear();
    },
  };

  A.textures = textures;
})();
