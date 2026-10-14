/* Arch2D — Wall photo library: decode, 4-corner perspective rectification, storage.
   The State only holds a small reference { id, visible, showOnExport }. Image bytes live
   here (in memory + one localStorage key), so undo snapshots stay small and drags stay fast.
   Photos come from <input type="file"> as data URLs, so they never taint the canvas. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;

  const STORAGE_KEY = 'arch2d_wallphoto';
  const SOURCE_MAX = 2400; // longest side kept for the calibration step (memory only)
  const OUTPUT_MAX = 1600; // longest side of the rectified wall image (≈4 px/cm on a 4 m wall)
  const JPEG_QUALITY = 0.82;

  // id -> { dataUrl, img, ready, luminance, source?: HTMLCanvasElement, corners?: [{x,y}×4] }
  const library = new Map();

  /* ---------- decoding ---------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode'));
      img.src = src;
    });
  }

  /** File → downscaled source canvas used by the calibration modal. Browsers apply EXIF orientation. */
  async function ingest(file) {
    if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('not-image');
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, SOURCE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* ---------- perspective math ---------- */
  /** Homography mapping the unit square (u,v) → quad [TL, TR, BR, BL] (Heckbert's square-to-quad). */
  function squareToQuad(q) {
    const [p0, p1, p2, p3] = q;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
    let g = 0, h = 0;
    if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
      const den = dx1 * dy2 - dx2 * dy1;
      g = (dx3 * dy2 - dx2 * dy3) / den;
      h = (dx1 * dy3 - dx3 * dy1) / den;
    }
    const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x;
    const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y;
    return (u, v) => {
      const w = g * u + h * v + 1;
      return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
    };
  }

  /** True when the quad [TL, TR, BR, BL] is convex and not self-intersecting. */
  function isConvexQuad(q) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < 1e-6) return false;
      const s = Math.sign(cross);
      if (sign && s !== sign) return false;
      sign = s;
    }
    return true;
  }

  /**
   * Warp the quad of `source` into a flat image with the wall's aspect ratio.
   * Inverse mapping with bilinear sampling; runs once per calibration (~100–250 ms).
   */
  function rectify(source, corners, wallW, wallH) {
    const aspect = wallW / wallH;
    const outW = aspect >= 1 ? OUTPUT_MAX : Math.round(OUTPUT_MAX * aspect);
    const outH = aspect >= 1 ? Math.round(OUTPUT_MAX / aspect) : OUTPUT_MAX;
    const sw = source.width, sh = source.height;
    const src = source.getContext('2d').getImageData(0, 0, sw, sh).data;
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const octx = out.getContext('2d');
    const img = octx.createImageData(outW, outH);
    const dst = img.data;
    const map = squareToQuad(corners);
    let lumSum = 0, lumN = 0;

    for (let j = 0; j < outH; j++) {
      const v = (j + 0.5) / outH;
      for (let i = 0; i < outW; i++) {
        const p = map((i + 0.5) / outW, v);
        const o = (j * outW + i) * 4;
        const x = p.x - 0.5, y = p.y - 0.5;
        const x0 = Math.floor(x), y0 = Math.floor(y);
        if (x0 < 0 || y0 < 0 || x0 + 1 >= sw || y0 + 1 >= sh) {
          // Corner dragged past the photo edge: neutral grey fill.
          dst[o] = dst[o + 1] = dst[o + 2] = 128;
          dst[o + 3] = 255;
          continue;
        }
        const fx = x - x0, fy = y - y0;
        const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        for (let ch = 0; ch < 3; ch++) {
          const top = src[i00 + ch] + (src[i10 + ch] - src[i00 + ch]) * fx;
          const bot = src[i01 + ch] + (src[i11 + ch] - src[i01 + ch]) * fx;
          dst[o + ch] = top + (bot - top) * fy;
        }
        dst[o + 3] = 255;
        if ((i & 15) === 0 && (j & 15) === 0) {
          lumSum += (0.2126 * dst[o] + 0.7152 * dst[o + 1] + 0.0722 * dst[o + 2]) / 255;
          lumN++;
        }
      }
    }
    octx.putImageData(img, 0, 0);
    return { dataUrl: out.toDataURL('image/jpeg', JPEG_QUALITY), luminance: lumN ? lumSum / lumN : 0.5 };
  }

  /* ---------- library ---------- */
  function idFor(dataUrl) {
    return 'ph_' + U.hashString(dataUrl).toString(36) + dataUrl.length.toString(36);
  }

  /** Adds a rectified data URL to the library and returns its id. Safe to call repeatedly. */
  function register(dataUrl, extra = {}) {
    if (typeof dataUrl !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) return null;
    const id = idFor(dataUrl);
    let entry = library.get(id);
    if (!entry) {
      entry = { dataUrl, img: null, ready: false, luminance: extra.luminance == null ? 0.5 : extra.luminance };
      library.set(id, entry);
      loadImage(dataUrl)
        .then((img) => {
          entry.img = img;
          entry.ready = true;
          if (extra.luminance == null) entry.luminance = measureLuminance(img);
          A.bus.emit('photo:ready', { id });
        })
        .catch(() => library.delete(id));
    }
    if (extra.source) entry.source = extra.source;
    if (extra.corners) entry.corners = extra.corners.map((c) => ({ x: c.x, y: c.y }));
    return id;
  }

  function measureLuminance(img) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    return s / 256;
  }

  /* ---------- storage (one localStorage slot for the current photo) ---------- */
  function readStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  let storedId = (readStored() || {}).id || null;
  let quotaWarned = false;

  /** Keeps the single storage slot in sync with the photo referenced by the current state. */
  function syncStorage(state) {
    const id = state.wallPhoto ? state.wallPhoto.id : null;
    if (id === storedId) return true;
    try {
      if (!id) {
        localStorage.removeItem(STORAGE_KEY);
        storedId = null;
        return true;
      }
      const entry = library.get(id);
      if (!entry) return false; // not decoded yet; next autosave retries
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, dataUrl: entry.dataUrl }));
      storedId = id;
      return true;
    } catch (e) {
      if (!quotaWarned && A.ui) {
        quotaWarned = true;
        A.ui.toast('Browser storage is full: the wall photo will not survive a reload. Use 💾 Save to keep it.', 'error');
      }
      return false;
    }
  }

  /** Loads the stored photo into the library (called once at startup). */
  function restoreFromStorage() {
    const s = readStored();
    if (s && s.dataUrl) register(s.dataUrl);
  }

  A.photo = {
    ingest,
    rectify,
    isConvexQuad,
    squareToQuad,
    register,
    restoreFromStorage,
    syncStorage,
    has: (id) => library.has(id),
    /** Ready HTMLImageElement for drawing, or null while decoding / unknown id. */
    image: (id) => {
      const e = id && library.get(id);
      return e && e.ready ? e.img : null;
    },
    dataUrl: (id) => {
      const e = id && library.get(id);
      return e ? e.dataUrl : null;
    },
    luminance: (id) => {
      const e = id && library.get(id);
      return e ? e.luminance : 0.5;
    },
    /** Original photo + corners, available only in the session where it was uploaded. */
    calibration: (id) => {
      const e = id && library.get(id);
      return e && e.source ? { source: e.source, corners: e.corners } : null;
    },
  };

  restoreFromStorage();
})();
