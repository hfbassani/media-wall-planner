/* Arch2D — WS3: PNG exporter & comparison sheet generator (project.md §3.1, §4.4, §6).
   Renders offscreen onto pure Canvas 2D (no SVG, no external images) so toDataURL()
   is guaranteed safe against CORS taint. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;

  function renderCanvas(opts = {}) {
    const state = A.store.getState();
    const widthPx = Math.max(600, opts.widthPx || 2400);

    // Measurements master toggle & individual overrides
    const hasMeasurements = opts.measurements !== undefined ? !!opts.measurements : (opts.annotations !== false);
    const hasAnnotations = opts.annotations !== undefined ? !!opts.annotations : hasMeasurements;
    const hasRulers = opts.rulers !== undefined ? !!opts.rulers : hasMeasurements;
    const hasLabels = opts.labels !== undefined ? !!opts.labels : hasMeasurements;

    // Background type: 'white' | 'transparent' | 'dark'
    let bg = opts.background;
    if (opts.bgType === 'transparent' || bg === 'transparent' || bg === null) {
      bg = null;
    } else if (opts.bgType === 'dark') {
      bg = '#0b0d11';
    } else if (opts.bgType === 'white') {
      bg = '#ffffff';
    } else if (bg === undefined) {
      bg = '#ffffff';
    }

    // Photo toggle
    const hasPhoto = opts.photo !== undefined ? !!opts.photo : (state.wallPhoto ? state.wallPhoto.showOnExport : false);

    // Allocate padding for rulers, annotations, and floor baseline
    const padTop = Math.round(widthPx * 0.05);
    const padBottom = (hasRulers || (opts.floor !== false)) ? Math.round(widthPx * 0.09) : Math.round(widthPx * 0.05);
    const padLeft = hasRulers ? Math.round(widthPx * 0.07) : Math.round(widthPx * 0.04);
    const padRight = hasRulers ? Math.round(widthPx * 0.07) : Math.round(widthPx * 0.04);

    let minCmX = 0, maxCmX = state.wallWidth;
    let minCmY = 0, maxCmY = state.wallHeight;

    if (hasPhoto && state.wallPhoto && A.photo) {
      const b = (state.wallPhoto && state.wallPhoto.bounds) || A.photo.bounds(state.wallPhoto.id);
      if (b && b.wCm && b.hCm) {
        minCmX = Math.min(0, b.xCm);
        maxCmX = Math.max(state.wallWidth, b.xCm + b.wCm);
        minCmY = Math.min(0, b.yCm);
        maxCmY = Math.max(state.wallHeight, b.yCm + b.hCm);
      }
    }

    const totalCmW = Math.max(10, maxCmX - minCmX);
    const totalCmH = Math.max(10, maxCmY - minCmY);

    const wallDrawWidth = widthPx - padLeft - padRight;
    const pxPerCm = wallDrawWidth / totalCmW;
    const wallDrawHeight = totalCmH * pxPerCm;
    const heightPx = Math.round(padTop + wallDrawHeight + padBottom);

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');

    // UI scale relative to standard 800px viewport
    const uiScale = Math.max(1, widthPx / 1000);
    const originX = padLeft - minCmX * pxPerCm;
    const originY = padTop + maxCmY * pxPerCm;

    A.render.drawScene(ctx, state, {
      pxPerCm,
      originX,
      originY,
      width: widthPx,
      height: heightPx,
      grid: !!opts.grid,
      annotations: hasAnnotations,
      eyeLevel: opts.eyeLevel !== undefined ? !!opts.eyeLevel : false,
      eyeLevelCm: A.canvas ? A.canvas.getEyeLevelCm() : 105,
      labels: hasLabels,
      rulers: hasRulers,
      selection: [],
      hud: false,
      guides: [],
      marquee: null,
      theme: 'export',
      uiScale,
      dpr: 1,
      background: bg,
      photo: hasPhoto,
      wall: opts.wall !== undefined ? !!opts.wall : true,
      floor: opts.floor !== undefined ? !!opts.floor : true,
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
    const tag = (opts.measurements === false || opts.annotations === false) ? 'clean' : 'cad';
    const bgTag = (opts.bgType === 'transparent' || opts.background === null) ? '-transparent' : '';
    const filename = `${name}-${tag}${bgTag}-${canvas.width}x${canvas.height}.png`;

    canvas.toBlob((blob) => {
      if (blob) {
        U.downloadBlob(blob, filename);
        if (A.ui) A.ui.toast(`Downloaded ${filename}`, 'success');
      }
    }, 'image/png');
  }

  function downloadReferencePNG(opts = {}) {
    // Clean elevation export for AI image-to-image / Gemini / ControlNet: no CAD lines, no rulers
    downloadPNG({
      widthPx: opts.widthPx || 2400,
      measurements: false,
      annotations: false,
      labels: false,
      rulers: false,
      grid: false,
      background: opts.background || '#ffffff',
    });
  }

  function referenceDataUrl(opts = {}) {
    // Generate clean reference image for AI image-to-image / ControlNet: no annotations, no rulers
    const canvas = renderCanvas({
      widthPx: opts.widthPx || 1536,
      measurements: false,
      annotations: false,
      labels: false,
      rulers: false,
      grid: false,
      background: opts.background || '#ffffff',
    });
    return canvas.toDataURL('image/png');
  }

  async function copyToClipboard(opts = {}) {
    try {
      const canvas = renderCanvas(opts);
      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Blob creation failed');
        if (navigator.clipboard && navigator.clipboard.write) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          if (A.ui) A.ui.toast('📋 Elevation copied to clipboard!', 'success');
        } else {
          if (A.ui) A.ui.toast('Clipboard API not supported in this browser.', 'error');
        }
      }, 'image/png');
    } catch (err) {
      console.error('[Arch2D] copy failed', err);
      if (A.ui) A.ui.toast('Could not copy image to clipboard.', 'error');
    }
  }

  /** Interactive Export Dialog with live preview, background choices, and measurement toggles. */
  function openModal() {
    const state = A.store.getState();
    const hasPhoto = !!(state.wallPhoto && A.photo && A.photo.has(state.wallPhoto.id));

    let opts = {
      measurements: true,
      annotations: true,
      rulers: true,
      labels: true,
      bgType: 'white',
      wall: true,
      photo: hasPhoto,
      floor: true,
      grid: false,
      eyeLevel: false,
      widthPx: 2400,
    };

    // Live preview elements
    const prevCanvas = U.h('canvas', { class: 'export-preview-canvas' });
    const checker = U.h('div', { class: 'export-checkerboard' }, prevCanvas);
    const dimPill = U.h('div', { class: 'export-dim-pill' }, 'Loading preview…');
    const previewPane = U.h('div', { class: 'export-preview-pane' }, checker, dimPill);

    // Form inputs
    const chkMeas = U.h('input', { type: 'checkbox', checked: opts.measurements });
    const chkAnnot = U.h('input', { type: 'checkbox', checked: opts.annotations });
    const chkRulers = U.h('input', { type: 'checkbox', checked: opts.rulers });
    const chkLabels = U.h('input', { type: 'checkbox', checked: opts.labels });

    const radWhite = U.h('input', { type: 'radio', name: 'export-bg', value: 'white', checked: true });
    const radTrans = U.h('input', { type: 'radio', name: 'export-bg', value: 'transparent' });
    const radDark = U.h('input', { type: 'radio', name: 'export-bg', value: 'dark' });

    const chkWall = U.h('input', { type: 'checkbox', checked: opts.wall });
    const chkPhoto = hasPhoto ? U.h('input', { type: 'checkbox', checked: opts.photo }) : null;
    const chkFloor = U.h('input', { type: 'checkbox', checked: opts.floor });
    const chkGrid = U.h('input', { type: 'checkbox', checked: opts.grid });
    const chkEye = U.h('input', { type: 'checkbox', checked: opts.eyeLevel });

    const selRes = U.h(
      'select',
      { class: 'select', style: { width: '100%' } },
      U.h('option', { value: '1600' }, '1600 px (Fast / Web)'),
      U.h('option', { value: '2400', selected: true }, '2400 px (Standard Print / Recommended)'),
      U.h('option', { value: '3840' }, '3840 px (4K Ultra-Res)')
    );

    function syncInputs() {
      chkMeas.checked = opts.measurements;
      chkAnnot.checked = opts.annotations;
      chkRulers.checked = opts.rulers;
      chkLabels.checked = opts.labels;

      radWhite.checked = opts.bgType === 'white';
      radTrans.checked = opts.bgType === 'transparent';
      radDark.checked = opts.bgType === 'dark';

      chkWall.checked = opts.wall;
      if (chkPhoto) chkPhoto.checked = opts.photo;
      chkFloor.checked = opts.floor;
      chkGrid.checked = opts.grid;
      chkEye.checked = opts.eyeLevel;

      selRes.value = String(opts.widthPx);
      renderPreview();
    }

    function renderPreview() {
      const previewOptions = Object.assign({}, opts, { widthPx: 800 });
      const c = renderCanvas(previewOptions);
      prevCanvas.width = c.width;
      prevCanvas.height = c.height;
      const ctx = prevCanvas.getContext('2d');
      ctx.drawImage(c, 0, 0);

      const fullW = opts.widthPx;
      const aspect = c.width / c.height;
      const fullH = Math.round(fullW / aspect);
      const photoLabel = (opts.photo && hasPhoto) ? 'w/ Background Photo' : 'w/o Background Photo';
      const measLabel = opts.measurements ? 'w/ Measurements' : 'w/o Measurements';
      const bgLabel = opts.bgType === 'transparent' ? 'Transparent' : (opts.bgType === 'white' ? 'White' : 'Dark');
      dimPill.textContent = `${fullW} × ${fullH} px • ${photoLabel} • ${measLabel} • ${bgLabel}`;
    }

    function applyPreset(name) {
      if (name === 'blueprint') {
        opts.measurements = true;
        opts.annotations = true;
        opts.rulers = true;
        opts.labels = true;
        opts.bgType = 'white';
        opts.wall = true;
        opts.photo = false;
        opts.floor = true;
        opts.grid = false;
      } else if (name === 'clean') {
        opts.measurements = false;
        opts.annotations = false;
        opts.rulers = false;
        opts.labels = false;
        opts.bgType = 'white';
        opts.wall = true;
        opts.photo = false;
        opts.floor = true;
        opts.grid = false;
      } else if (name === 'room') {
        opts.measurements = false;
        opts.annotations = false;
        opts.rulers = false;
        opts.labels = false;
        opts.bgType = 'white';
        opts.wall = true;
        opts.photo = true;
        opts.floor = true;
        opts.grid = false;
      } else if (name === 'cutout') {
        opts.measurements = false;
        opts.annotations = false;
        opts.rulers = false;
        opts.labels = false;
        opts.bgType = 'transparent';
        opts.wall = false;
        opts.photo = false;
        opts.floor = false;
        opts.grid = false;
      }
      syncInputs();
    }

    // Input event listeners
    chkMeas.onchange = () => {
      opts.measurements = chkMeas.checked;
      opts.annotations = opts.measurements;
      opts.rulers = opts.measurements;
      opts.labels = opts.measurements;
      syncInputs();
    };
    chkAnnot.onchange = () => { opts.annotations = chkAnnot.checked; renderPreview(); };
    chkRulers.onchange = () => { opts.rulers = chkRulers.checked; renderPreview(); };
    chkLabels.onchange = () => { opts.labels = chkLabels.checked; renderPreview(); };

    radWhite.onchange = () => { if (radWhite.checked) { opts.bgType = 'white'; renderPreview(); } };
    radTrans.onchange = () => { if (radTrans.checked) { opts.bgType = 'transparent'; renderPreview(); } };
    radDark.onchange = () => { if (radDark.checked) { opts.bgType = 'dark'; renderPreview(); } };

    chkWall.onchange = () => { opts.wall = chkWall.checked; renderPreview(); };
    if (chkPhoto) chkPhoto.onchange = () => { opts.photo = chkPhoto.checked; renderPreview(); };
    chkFloor.onchange = () => { opts.floor = chkFloor.checked; renderPreview(); };
    chkGrid.onchange = () => { opts.grid = chkGrid.checked; renderPreview(); };
    chkEye.onchange = () => { opts.eyeLevel = chkEye.checked; renderPreview(); };
    selRes.onchange = () => { opts.widthPx = parseInt(selRes.value) || 2400; renderPreview(); };

    // Preset buttons
    const btnPreClean = U.h('button', { class: 'btn sm ghost', onclick: () => applyPreset('clean') }, '🖼️ Clean (No Dims)');
    const btnPreCad = U.h('button', { class: 'btn sm ghost', onclick: () => applyPreset('blueprint') }, '📐 CAD (With Dims)');
    const presetsGrid = U.h('div', { class: 'export-presets-grid' }, btnPreClean, btnPreCad);
    if (hasPhoto) {
      const btnPreRoom = U.h('button', { class: 'btn sm ghost', onclick: () => applyPreset('room') }, '📸 Room Photo');
      presetsGrid.appendChild(btnPreRoom);
    }
    const btnPreCutout = U.h('button', { class: 'btn sm ghost', onclick: () => applyPreset('cutout') }, '✨ Transparent');
    presetsGrid.appendChild(btnPreCutout);

    // Option groups
    const grpMeas = U.h(
      'div',
      { class: 'export-opt-group' },
      U.h('div', { class: 'export-opt-title' }, 'Measurements'),
      U.h('label', { class: 'export-check-label', style: { fontWeight: '600' } }, chkMeas, 'Include Measurements'),
      U.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '22px' } },
        U.h('label', { class: 'export-check-label' }, chkAnnot, 'Dimension Callouts'),
        U.h('label', { class: 'export-check-label' }, chkRulers, 'Axis Rulers (Top & Left)'),
        U.h('label', { class: 'export-check-label' }, chkLabels, 'Element Labels')
      )
    );

    const bgOptions = [
      U.h('label', { class: 'export-check-label' }, radWhite, '⚪ White'),
      U.h('label', { class: 'export-check-label' }, radTrans, '🏁 Transparent'),
      U.h('label', { class: 'export-check-label' }, radDark, '⬛ Dark'),
    ];
    const grpBg = U.h(
      'div',
      { class: 'export-opt-group' },
      U.h('div', { class: 'export-opt-title' }, 'Background Photo & Layers'),
      chkPhoto
        ? U.h('label', { class: 'export-check-label', style: { fontWeight: '600' } }, chkPhoto, '📷 Include Background Photo')
        : U.h('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-2)' } }, 'No background photo loaded'),
      U.h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' } }, ...bgOptions),
      U.h('label', { class: 'export-check-label' }, chkWall, 'Include Wall Surface Texture'),
      U.h('label', { class: 'export-check-label' }, chkFloor, 'Include Floor Baseline (FFL ±0)')
    );

    const grpGuides = U.h(
      'div',
      { class: 'export-opt-group' },
      U.h('div', { class: 'export-opt-title' }, 'Guides & Resolution'),
      U.h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
        U.h('label', { class: 'export-check-label' }, chkGrid, 'Grid Lines'),
        U.h('label', { class: 'export-check-label' }, chkEye, 'TV Eye Level Datum')
      ),
      U.h('div', { style: { marginTop: '4px' } }, selRes)
    );

    const btnDownload = U.h(
      'button',
      {
        class: 'btn primary',
        style: { width: '100%', justifyContent: 'center' },
        onclick: () => {
          downloadPNG(opts);
          close();
        },
      },
      '⬇️ Download PNG'
    );

    const btnCopy = U.h(
      'button',
      {
        class: 'btn secondary',
        style: { width: '100%', justifyContent: 'center' },
        onclick: () => copyToClipboard(opts),
      },
      '📋 Copy to Clipboard'
    );

    const btnCancel = U.h(
      'button',
      { class: 'btn ghost sm', style: { width: '100%', justifyContent: 'center' }, onclick: () => close() },
      'Close'
    );

    const btnBar = U.h('div', { class: 'export-btn-bar' }, btnDownload, btnCopy, btnCancel);

    const side = U.h(
      'div',
      { class: 'export-side' },
      U.h('div', { class: 'section-heading' }, 'Export Presets'),
      presetsGrid,
      grpMeas,
      grpBg,
      grpGuides,
      btnBar
    );

    const modal = U.h(
      'div',
      { class: 'studio-modal export-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Export Elevation Drawing' },
      U.h(
        'div',
        { class: 'studio-header' },
        U.h('div', { class: 'studio-title' }, U.h('span', null, '📐'), U.h('span', null, 'Export Elevation Drawing')),
        U.h('button', { class: 'icon-btn', title: 'Close (Esc)', onclick: () => close() }, '✕')
      ),
      U.h('div', { class: 'export-body' }, previewPane, side)
    );

    const backdrop = U.h('div', { class: 'modal-backdrop open', id: 'export-backdrop' }, modal);
    document.body.appendChild(backdrop);

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener('keydown', onKey);

    function close() {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    }

    renderPreview();
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
    copyToClipboard,
    openModal,
    comparisonSheet,
  };
})();
