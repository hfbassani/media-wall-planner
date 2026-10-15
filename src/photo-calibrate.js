/* Arch2D — Wall photo upload & 4-corner calibration modal.
   Flow: pick image → mark wall corners (perspective grid + magnifier) → rectify to the
   wall's W×H → store reference in State (one undo step). Owns its own modal DOM. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;

  const HANDLE_R = 9;
  const HIT_R = 24; // generous for touch
  const MARGIN = 40; // lets handles go slightly past the photo edge
  const LOUPE = 132;
  const LOUPE_ZOOM = 3;
  const CORNER_LABELS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];

  function pickFile() {
    return new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), {
        type: 'file',
        accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/*',
      });
      input.addEventListener('change', () => resolve((input.files && input.files[0]) || null));
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  /**
   * Opens the calibration modal.
   * Resolves { corners, wallWidth, wallHeight, dataUrl, luminance } or null when cancelled.
   */
  function open({ source, corners, wallWidth, wallHeight }) {
    return new Promise((resolve) => {
      const sw = source.width, sh = source.height;
      let pts = corners && corners.length === 4
        ? corners.map((c) => ({ x: c.x, y: c.y }))
        : [
            { x: 0, y: 0 },
            { x: sw, y: 0 },
            { x: sw, y: sh },
            { x: 0, y: sh },
          ];
      let active = -1; // handle being dragged
      let focusIdx = 0; // handle nudged by arrow keys
      let grabOffset = { x: 0, y: 0 };
      let view = { scale: 1, ox: 0, oy: 0, cw: 0, ch: 0, dpr: 1 };
      let busy = false;

      /* ----- DOM ----- */
      const canvas = U.h('canvas', { class: 'calib-canvas', id: 'calib-canvas' });
      const stage = U.h('div', { class: 'calib-stage' }, canvas);
      const inputW = U.h('input', { type: 'number', class: 'input', id: 'calib-wall-width', min: '50', max: '5000', value: Math.round(wallWidth) });
      const inputH = U.h('input', { type: 'number', class: 'input', id: 'calib-wall-height', min: '50', max: '2000', value: Math.round(wallHeight) });
      const btnApply = U.h('button', { class: 'btn primary', id: 'btn-calib-apply', onclick: apply }, '✓ Apply photo');
      const btnCancel = U.h('button', { class: 'btn ghost', id: 'btn-calib-cancel', onclick: () => close(null) }, 'Cancel');
      const btnReset = U.h('button', { class: 'btn ghost sm', id: 'btn-calib-reset', onclick: resetCorners }, '↺ Reset corners');

      const side = U.h(
        'div',
        { class: 'calib-side' },
        U.h('div', { class: 'section-heading' }, 'How to calibrate'),
        U.h(
          'ol',
          { class: 'calib-steps' },
          U.h('li', null, 'Drag each handle onto a corner of the wall: where it meets the ceiling and the floor.'),
          U.h('li', null, 'If a corner is hidden (furniture, curtains), place it where the corner would be. Handles can go slightly past the photo edge.'),
          U.h('li', null, 'Check that the blue grid follows the wall lines (skirting board, ceiling edge).')
        ),
        U.h('div', { class: 'section-heading', style: { marginTop: '6px' } }, 'Real wall size (cm)'),
        U.h(
          'div',
          { class: 'form-row' },
          U.h('div', { class: 'form-field' }, U.h('label', { class: 'form-label', for: 'calib-wall-width' }, 'Width'), inputW),
          U.h('div', { class: 'form-field' }, U.h('label', { class: 'form-label', for: 'calib-wall-height' }, 'Height'), inputH)
        ),
        U.h('div', { class: 'calib-note' }, 'Measure the wall: the cm grid and every dimension depend on these two numbers.'),
        btnReset,
        U.h('div', { class: 'calib-note' }, 'Tip: arrow keys move the last handle by 1 px (Shift = 10 px).'),
        U.h('div', { class: 'calib-actions' }, btnCancel, btnApply)
      );

      const modal = U.h(
        'div',
        { class: 'studio-modal calib-modal', id: 'calib-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mark the wall corners' },
        U.h(
          'div',
          { class: 'studio-header' },
          U.h('div', { class: 'studio-title' }, U.h('span', null, '📷'), U.h('span', null, 'Mark the wall corners')),
          U.h('button', { class: 'icon-btn', title: 'Cancel (Esc)', 'aria-label': 'Cancel', onclick: () => close(null) }, '✕')
        ),
        U.h('div', { class: 'calib-body' }, stage, side)
      );
      const backdrop = U.h('div', { class: 'modal-backdrop open', id: 'calib-backdrop' }, modal);
      document.body.appendChild(backdrop);

      const ctx = canvas.getContext('2d');
      const ro = new ResizeObserver(layout);
      ro.observe(stage);
      document.addEventListener('keydown', onKey, true);
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);

      /* ----- geometry ----- */
      function layout() {
        const r = stage.getBoundingClientRect();
        view.dpr = window.devicePixelRatio || 1;
        view.cw = Math.max(100, Math.floor(r.width));
        view.ch = Math.max(100, Math.floor(r.height));
        canvas.width = Math.round(view.cw * view.dpr);
        canvas.height = Math.round(view.ch * view.dpr);
        canvas.style.width = view.cw + 'px';
        canvas.style.height = view.ch + 'px';
        view.scale = Math.min((view.cw - MARGIN * 2) / sw, (view.ch - MARGIN * 2) / sh);
        view.ox = (view.cw - sw * view.scale) / 2;
        view.oy = (view.ch - sh * view.scale) / 2;
        draw();
      }
      const toScreen = (p) => ({ x: view.ox + p.x * view.scale, y: view.oy + p.y * view.scale });
      const toImage = (x, y) => ({ x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale });
      function clampImage(p) {
        const m = MARGIN / view.scale;
        return { x: U.clamp(p.x, -m, sw + m), y: U.clamp(p.y, -m, sh + m) };
      }
      function localPoint(e) {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }

      /* ----- drawing ----- */
      function draw() {
        const { cw, ch, dpr } = view;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#07090c';
        ctx.fillRect(0, 0, cw, ch);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, view.ox, view.oy, sw * view.scale, sh * view.scale);

        const s = pts.map(toScreen);
        const convex = A.photo.isConvexQuad(pts);

        // Dim everything outside the wall quad.
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, cw, ch);
        ctx.moveTo(s[0].x, s[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(s[i].x, s[i].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fill('evenodd');
        ctx.restore();

        // Perspective grid: shows how the photo will be straightened.
        if (convex) {
          const map = A.photo.squareToQuad(pts);
          ctx.save();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 1; k < 8; k++) {
            const t = k / 8;
            const a = toScreen(map(t, 0)), b = toScreen(map(t, 1));
            const c = toScreen(map(0, t)), d = toScreen(map(1, t));
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(d.x, d.y);
          }
          ctx.stroke();
          ctx.restore();
        }

        // Quad outline
        ctx.save();
        ctx.strokeStyle = convex ? 'hsl(190, 85%, 60%)' : 'hsl(4, 72%, 62%)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s[0].x, s[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(s[i].x, s[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Handles + labels
        s.forEach((p, i) => {
          const hot = i === active || (active < 0 && i === focusIdx);
          ctx.save();
          ctx.beginPath();
          ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(11, 15, 23, 0.9)';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = hot ? 'hsl(36, 70%, 62%)' : 'hsl(190, 85%, 60%)';
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p.x - 4, p.y);
          ctx.lineTo(p.x + 4, p.y);
          ctx.moveTo(p.x, p.y - 4);
          ctx.lineTo(p.x, p.y + 4);
          ctx.stroke();
          // label pill, pushed outward from the quad centre
          const cx = (s[0].x + s[1].x + s[2].x + s[3].x) / 4, cy = (s[0].y + s[1].y + s[2].y + s[3].y) / 4;
          const dx = p.x - cx, dy = p.y - cy, len = Math.hypot(dx, dy) || 1;
          const lx = p.x + (dx / len) * 26, ly = p.y + (dy / len) * 22;
          ctx.font = "600 11px Inter, sans-serif";
          const tw = ctx.measureText(CORNER_LABELS[i]).width;
          ctx.fillStyle = 'rgba(11, 15, 23, 0.9)';
          A.render.roundRect(ctx, lx - tw / 2 - 6, ly - 9, tw + 12, 18, 5);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(CORNER_LABELS[i], lx, ly + 0.5);
          ctx.restore();
        });

        if (active >= 0) drawLoupe(pts[active], s[active]);

        btnApply.disabled = busy || !convex;
        btnApply.title = convex ? '' : 'The corners cross over. Put them in order: top-left, top-right, bottom-right, bottom-left.';
      }

      function drawLoupe(p, sp) {
        // Sit in the top corner away from the handle, so the finger/cursor never covers it.
        const pad = 12;
        const lx = sp.x < view.cw / 2 ? view.cw - LOUPE - pad : pad;
        const ly = pad;
        const span = LOUPE / (view.scale * LOUPE_ZOOM); // image px shown
        ctx.save();
        ctx.beginPath();
        ctx.arc(lx + LOUPE / 2, ly + LOUPE / 2, LOUPE / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#07090c';
        ctx.fill();
        ctx.clip();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, p.x - span / 2, p.y - span / 2, span, span, lx, ly, LOUPE, LOUPE);
        ctx.strokeStyle = 'hsl(36, 70%, 62%)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx + LOUPE / 2, ly);
        ctx.lineTo(lx + LOUPE / 2, ly + LOUPE);
        ctx.moveTo(lx, ly + LOUPE / 2);
        ctx.lineTo(lx + LOUPE, ly + LOUPE / 2);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(lx + LOUPE / 2, ly + LOUPE / 2, LOUPE / 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      /* ----- interaction ----- */
      function nearestHandle(x, y) {
        let best = -1, bestD = HIT_R;
        pts.forEach((p, i) => {
          const s = toScreen(p);
          const d = Math.hypot(s.x - x, s.y - y);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        return best;
      }
      function onDown(e) {
        const lp = localPoint(e);
        const i = nearestHandle(lp.x, lp.y);
        if (i < 0) return;
        active = focusIdx = i;
        const s = toScreen(pts[i]);
        grabOffset = { x: s.x - lp.x, y: s.y - lp.y };
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
        draw();
      }
      function onMove(e) {
        const lp = localPoint(e);
        if (active < 0) {
          canvas.style.cursor = nearestHandle(lp.x, lp.y) >= 0 ? 'grab' : 'crosshair';
          return;
        }
        pts[active] = clampImage(toImage(lp.x + grabOffset.x, lp.y + grabOffset.y));
        draw();
      }
      function onUp(e) {
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        active = -1;
        canvas.style.cursor = 'crosshair';
        draw();
      }
      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close(null);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          apply();
          return;
        }
        if (U.isTypingTarget(e.target)) return;
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!d) return;
        e.preventDefault();
        e.stopPropagation(); // keep the main canvas from nudging elements
        const step = e.shiftKey ? 10 : 1;
        pts[focusIdx] = clampImage({ x: pts[focusIdx].x + d[0] * step, y: pts[focusIdx].y + d[1] * step });
        draw();
      }
      function resetCorners() {
        pts = [
          { x: 0, y: 0 },
          { x: sw, y: 0 },
          { x: sw, y: sh },
          { x: 0, y: sh },
        ];
        draw();
      }

      function apply() {
        if (busy) return;
        if (!A.photo.isConvexQuad(pts)) {
          A.ui.toast('The corners cross over. Put them in order: top-left, top-right, bottom-right, bottom-left.', 'error');
          return;
        }
        const w = U.clamp(parseFloat(inputW.value) || 0, 50, 5000);
        const h = U.clamp(parseFloat(inputH.value) || 0, 50, 2000);
        if (!w || !h) {
          A.ui.toast('Enter the real wall width and height in cm.', 'error');
          return;
        }
        busy = true;
        btnApply.textContent = '⏳ Straightening…';
        draw();
        // Let the button repaint before the synchronous warp.
        setTimeout(() => {
          try {
            const out = A.photo.rectify(source, pts, w, h);
            close({
              corners: pts.map((p) => ({ x: p.x, y: p.y })),
              wallWidth: w,
              wallHeight: h,
              dataUrl: out.dataUrl,
              luminance: out.luminance,
              bounds: out.bounds,
            });
          } catch (err) {
            console.error('[Arch2D] rectify failed', err);
            busy = false;
            btnApply.textContent = '✓ Apply photo';
            draw();
            A.ui.toast('Could not process this photo. Try a smaller image.', 'error');
          }
        }, 30);
      }

      function close(result) {
        ro.disconnect();
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        resolve(result);
      }
    });
  }

  /* ---------- flows used by the sidebar ---------- */
  async function calibrateAndApply(source, corners) {
    const st = A.store.getState();
    const res = await open({ source, corners, wallWidth: st.wallWidth, wallHeight: st.wallHeight });
    if (!res) return false;
    const id = A.photo.register(res.dataUrl, {
      luminance: res.luminance,
      source,
      corners: res.corners,
      bounds: res.bounds,
      aspect: res.bounds ? res.bounds.wCm / res.bounds.hCm : res.wallWidth / res.wallHeight,
    });
    if (!id) {
      A.ui.toast('Could not store the processed photo.', 'error');
      return false;
    }
    const prev = st.wallPhoto;
    A.store.begin(); // wall size + photo = one undo step
    if (res.wallWidth !== st.wallWidth || res.wallHeight !== st.wallHeight) {
      A.store.setWall({ wallWidth: res.wallWidth, wallHeight: res.wallHeight });
    }
    A.store.setWallPhoto({ id, visible: true, showOnExport: prev ? prev.showOnExport : false, bounds: res.bounds });
    A.store.commit();
    A.canvas.fit();
    A.ui.toast('Wall photo calibrated. Entire room photo is visible.', 'success');
    return true;
  }

  async function upload() {
    const file = await pickFile();
    if (!file) return false;
    let source;
    try {
      source = await A.photo.ingest(file);
    } catch (e) {
      const heic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
      A.ui.toast(
        heic
          ? 'This browser cannot read HEIC photos. Export the photo as JPG (on iPhone: Settings → Camera → Formats → Most Compatible).'
          : 'Could not read this image. Use a JPG, PNG or WebP photo.',
        'error'
      );
      return false;
    }
    return calibrateAndApply(source, null);
  }

  /** Re-open calibration for the current photo. */
  async function adjust() {
    const p = A.store.getState().wallPhoto;
    if (!p) return upload();
    const cal = A.photo.calibration(p.id);
    let source = cal && cal.source;
    if (!source) {
      const img = A.photo.image(p.id);
      if (!img) {
        A.ui.toast('Photo is still loading…', 'info');
        return false;
      }
      source = document.createElement('canvas');
      source.width = img.naturalWidth || img.width;
      source.height = img.naturalHeight || img.height;
      source.getContext('2d').drawImage(img, 0, 0);
    }
    return calibrateAndApply(source, cal && cal.corners);
  }

  A.photoCalibrate = { open, upload, adjust, pickFile };
})();
