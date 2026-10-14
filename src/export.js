/* Arch2D — WS3: PNG exporter & comparison sheet generator (project.md §3.1, §4.4, §6).
   Renders offscreen onto pure Canvas 2D (no SVG, no external images) so toDataURL()
   is guaranteed safe against CORS taint. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;

  function renderCanvas(opts = {}) {
    const state = A.store.getState();
    const widthPx = Math.max(1200, opts.widthPx || 2400);
    const aspect = state.wallWidth / state.wallHeight;

    // Allocate padding for rulers, annotations, and floor baseline
    const hasRulers = opts.rulers !== false;
    const padTop = Math.round(widthPx * 0.05);
    const padBottom = hasRulers ? Math.round(widthPx * 0.09) : Math.round(widthPx * 0.05);
    const padLeft = hasRulers ? Math.round(widthPx * 0.07) : Math.round(widthPx * 0.04);
    const padRight = hasRulers ? Math.round(widthPx * 0.07) : Math.round(widthPx * 0.04);

    const wallDrawWidth = widthPx - padLeft - padRight;
    const pxPerCm = wallDrawWidth / state.wallWidth;
    const wallDrawHeight = state.wallHeight * pxPerCm;
    const heightPx = Math.round(padTop + wallDrawHeight + padBottom);

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');

    // UI scale relative to standard 800px viewport
    const uiScale = Math.max(1, widthPx / 1000);
    const originX = padLeft;
    const originY = padTop + wallDrawHeight;

    A.render.drawScene(ctx, state, {
      pxPerCm,
      originX,
      originY,
      width: widthPx,
      height: heightPx,
      grid: !!opts.grid,
      annotations: opts.annotations !== undefined ? !!opts.annotations : true,
      eyeLevel: opts.eyeLevel !== undefined ? !!opts.eyeLevel : (A.canvas ? A.canvas.isEyeLevel() : false),
      eyeLevelCm: A.canvas ? A.canvas.getEyeLevelCm() : 105,
      labels: opts.labels !== undefined ? !!opts.labels : true,
      rulers: hasRulers,
      selection: [],
      hud: false,
      guides: [],
      marquee: null,
      theme: 'export',
      uiScale,
      dpr: 1,
      background: opts.background || '#ffffff',
      photo: opts.photo !== undefined ? !!opts.photo : true,
    });

    return canvas;
  }

  function downloadPNG(opts = {}) {
    const canvas = renderCanvas(opts);
    const state = A.store.getState();
    const name = (state.name || 'elevation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'elevation';
    const filename = `${name}-cad-${canvas.width}x${canvas.height}.png`;

    canvas.toBlob((blob) => {
      if (blob) U.downloadBlob(blob, filename);
    }, 'image/png');
  }

  function downloadReferencePNG(opts = {}) {
    // Clean elevation export for AI image-to-image / Gemini / ControlNet: no CAD lines, no rulers
    const canvas = renderCanvas({
      widthPx: opts.widthPx || 2400,
      annotations: false,
      labels: false,
      rulers: false,
      grid: false,
      background: opts.background || '#ffffff',
    });
    const state = A.store.getState();
    const name = (state.name || 'elevation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'elevation';
    const filename = `${name}-clean-reference-${canvas.width}x${canvas.height}.png`;

    canvas.toBlob((blob) => {
      if (blob) U.downloadBlob(blob, filename);
    }, 'image/png');
  }

  function referenceDataUrl(opts = {}) {
    // Generate clean reference image for AI image-to-image / ControlNet: no annotations, no rulers
    const canvas = renderCanvas({
      widthPx: opts.widthPx || 1536,
      annotations: false,
      labels: false,
      rulers: false,
      grid: false,
      background: opts.background || '#ffffff',
    });
    return canvas.toDataURL('image/png');
  }

  /** Generates side-by-side comparison sheet of CAD elevation vs AI render. */
  function comparisonSheet(renderImg) {
    return new Promise((resolve, reject) => {
      try {
        const cadCanvas = renderCanvas({ widthPx: 1600, annotations: true, rulers: true, grid: true });
        const sheetWidth = 3200;
        const targetHalfW = 1520;
        const pad = 40;
        const headerH = 100;

        // Calculate heights maintaining aspect ratios
        const cadAspect = cadCanvas.width / cadCanvas.height;
        const cadH = targetHalfW / cadAspect;

        const imgW = renderImg.naturalWidth || renderImg.width || targetHalfW;
        const imgH = renderImg.naturalHeight || renderImg.height || cadH;
        const imgAspect = imgW / imgH;
        const renderDrawH = targetHalfW / imgAspect;

        const contentH = Math.max(cadH, renderDrawH);
        const sheetHeight = Math.round(headerH + contentH + pad * 2);

        const sheet = document.createElement('canvas');
        sheet.width = sheetWidth;
        sheet.height = sheetHeight;
        const ctx = sheet.getContext('2d');

        // Background
        ctx.fillStyle = '#0f1217';
        ctx.fillRect(0, 0, sheetWidth, sheetHeight);

        // Header Title
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 36px Inter, sans-serif';
        ctx.fillText('Arch2D Elevation Architect — CAD vs AI 3D Render', pad, 58);

        const state = A.store.getState();
        ctx.fillStyle = '#8a909c';
        ctx.font = '500 22px Inter, sans-serif';
        ctx.fillText(`Project: ${state.name} (${state.wallWidth}×${state.wallHeight} cm) · Mood: ${state.mood}`, pad, 92);

        // Draw Left: CAD
        const leftX = pad;
        const leftY = headerH + pad;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(leftX, leftY, targetHalfW, cadH);
        ctx.drawImage(cadCanvas, leftX, leftY, targetHalfW, cadH);

        // CAD label overlay
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(leftX + 20, leftY + 20, 220, 44);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '600 20px Inter, sans-serif';
        ctx.fillText('2D CAD ELEVATION', leftX + 35, leftY + 49);

        // Draw Right: AI Render
        const rightX = pad + targetHalfW + pad;
        const rightY = headerH + pad;
        ctx.drawImage(renderImg, rightX, rightY, targetHalfW, renderDrawH);

        // Render label overlay
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(rightX + 20, rightY + 20, 220, 44);
        ctx.fillStyle = '#eab308';
        ctx.font = '600 20px Inter, sans-serif';
        ctx.fillText('AI 3D RENDER', rightX + 35, rightY + 49);

        resolve(sheet);
      } catch (err) {
        reject(err);
      }
    });
  }

  A.exporter = {
    renderCanvas,
    downloadPNG,
    downloadReferencePNG,
    referenceDataUrl,
    comparisonSheet,
  };
})();
