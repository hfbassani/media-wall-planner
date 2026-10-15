/* Arch2D — WS6: AI Render & Prompt Studio controller (project.md §4).
   Handles prompt tuning, live rendering feedback, provider settings, gallery,
   interactive CAD vs 3D split-slider comparison, and downloads. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;

  let modalBackdrop, modalEl;
  let activeTab = 'generate'; // 'generate' | 'compare'
  let selectedFormat = 'vision'; // default to high-realism vision reference prompt
  let activeModifiers = new Set();
  let latestRender = null;
  let isGenerating = false;
  let abortController = null;
  let splitPercent = 50;
  let galleryHistory = [];

  function init() {
    createModalDOM();
    bindEvents();
    loadGallery();
  }

  function createModalDOM() {
    modalBackdrop = U.h('div', { class: 'modal-backdrop', id: 'studio-backdrop' });

    modalEl = U.h(
      'div',
      { class: 'studio-modal', id: 'studio-modal' },
      // Header
      U.h(
        'div',
        { class: 'studio-header' },
        U.h(
          'div',
          { class: 'studio-title' },
          U.h('span', null, '✨'),
          U.h('span', null, 'AI Render & Prompt Studio')
        ),
        U.h(
          'div',
          { class: 'studio-tabs' },
          U.h('button', { class: 'studio-tab active', id: 'tab-generate', onclick: () => switchTab('generate') }, 'Prompt & Render'),
          U.h('button', { class: 'studio-tab', id: 'tab-compare', onclick: () => switchTab('compare') }, 'Side-by-Side Compare')
        ),
        U.h('button', { class: 'icon-btn', id: 'btn-close-studio', title: 'Close (Esc)', onclick: close }, '✕')
      ),
      // Body Container
      U.h('div', { class: 'studio-body', id: 'studio-body' })
    );

    modalBackdrop.appendChild(modalEl);
    document.body.appendChild(modalBackdrop);

    // Close on backdrop click
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) close();
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    modalEl.querySelector('#tab-generate').classList.toggle('active', tab === 'generate');
    modalEl.querySelector('#tab-compare').classList.toggle('active', tab === 'compare');
    renderBody();
  }

  function loadGallery() {
    galleryHistory = A.persistence.getJSON('render_gallery', []);
    if (galleryHistory.length > 0) latestRender = galleryHistory[0];
  }

  function saveToGallery(item) {
    galleryHistory.unshift(item);
    if (galleryHistory.length > 12) galleryHistory.pop();
    A.persistence.setJSON('render_gallery', galleryHistory);
  }

  function renderBody() {
    const body = modalEl.querySelector('#studio-body');
    body.innerHTML = '';

    if (activeTab === 'generate') {
      renderGenerateTab(body);
    } else {
      renderCompareTab(body);
    }
  }

  /* ---------- Generate Tab ---------- */
  function renderGenerateTab(container) {
    const leftCol = U.h('div', { class: 'studio-col-left' });
    const rightCol = U.h('div', { class: 'studio-col-right' });

    // 1. Format selector
    const formatRow = U.h(
      'div',
      { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      U.h('span', { class: 'studio-section-title', style: { margin: '0 8px 0 0' } }, 'Syntax:'),
      createFormatBtn('vision', '🖼️ Vision Reference (Gemini / Multimodal)'),
      createFormatBtn('prose', '📝 Natural Prose (Text-to-Image)'),
      createFormatBtn('midjourney', 'Midjourney v6.1'),
      createFormatBtn('sd', 'Stable Diffusion')
    );

    // Tip Banner for Vision Mode
    let tipBanner = null;
    if (selectedFormat === 'vision') {
      tipBanner = U.h(
        'div',
        { class: 'studio-tip-banner' },
        U.h('span', { style: { fontSize: '15px' } }, '💡'),
        U.h(
          'div',
          null,
          U.h('strong', null, 'Gemini Vision Workflow: '),
          'Download the Clean Reference PNG below and paste it together with this prompt into Gemini. All measurement numbers are replaced with photorealistic material craftsmanship, lighting physics, and strict CAD-suppression directives.'
        )
      );
    }

    // 2. Prompt Textarea
    const promptData = A.prompt.build(A.store.getState(), { format: selectedFormat, modifiers: Array.from(activeModifiers) });
    const textarea = U.h('textarea', { class: 'prompt-textarea', id: 'studio-prompt-input' }, promptData.prompt);

    // Reference Image Export State for AI
    const st = A.store.getState();
    const hasPhotoLoaded = !!(st.wallPhoto && A.photo && A.photo.has(st.wallPhoto.id));
    let studioIncludePhoto = hasPhotoLoaded && st.wallPhoto.visible;
    let studioIncludeMeas = false; // clean reference by default for AI

    function updateStudioPrompt() {
      const pData = A.prompt.build(A.store.getState(), {
        format: selectedFormat,
        modifiers: Array.from(activeModifiers),
        photo: studioIncludePhoto,
      });
      textarea.value = pData.prompt;
    }

    // Quick Action Bar
    const promptActions = U.h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      U.h(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } },
        U.h('span', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-2)' } }, `Aspect: ${promptData.aspectRatio} · Wall: ${st.wallWidth}×${st.wallHeight}cm`),
        U.h(
          'button',
          {
            class: 'btn secondary sm',
            id: 'btn-copy-studio-prompt',
            onclick: () => {
              navigator.clipboard.writeText(textarea.value);
              A.ui.toast(selectedFormat === 'vision' ? 'Copied Gemini Vision prompt!' : 'Prompt copied to clipboard!', 'success');
            },
          },
          selectedFormat === 'vision' ? '📋 Copy Vision Prompt' : '📋 Copy Prompt'
        )
      ),
      U.h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            background: 'var(--bg-2)',
            padding: '8px 12px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--line)',
          },
        },
        U.h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } },
          U.h('span', { style: { fontSize: 'var(--fs-xs)', fontWeight: '600', color: 'var(--text-1)' } }, 'Reference Image:'),
          hasPhotoLoaded
            ? U.h(
                'label',
                { class: 'export-check-label', style: { fontSize: 'var(--fs-xs)', color: 'var(--text-0)', cursor: 'pointer' } },
                U.h('input', {
                  type: 'checkbox',
                  checked: studioIncludePhoto,
                  id: 'chk-studio-photo',
                  onchange: (e) => {
                    studioIncludePhoto = e.target.checked;
                    updateStudioPrompt();
                    A.ui.toast(studioIncludePhoto ? '📷 Background photo included in AI reference' : '📷 Background photo excluded from AI reference', 'info');
                  },
                }),
                '📷 Background Photo'
              )
            : U.h(
                'span',
                { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                '📷 Background Photo:',
                U.h('span', { style: { color: 'var(--text-3)' } }, 'none loaded ·'),
                U.h(
                  'a',
                  {
                    href: '#',
                    style: { color: 'var(--brass-strong)', textDecoration: 'underline', cursor: 'pointer' },
                    onclick: async (e) => {
                      e.preventDefault();
                      if (A.photo && A.photo.pickFile) {
                        const file = await A.photo.pickFile();
                        if (file) {
                          await A.photo.upload(file);
                          renderBody();
                        }
                      }
                    },
                  },
                  'Upload'
                )
              ),
          U.h(
            'label',
            { class: 'export-check-label', style: { fontSize: 'var(--fs-xs)', color: 'var(--text-0)', cursor: 'pointer' } },
            U.h('input', {
              type: 'checkbox',
              checked: studioIncludeMeas,
              id: 'chk-studio-meas',
              onchange: (e) => {
                studioIncludeMeas = e.target.checked;
                A.ui.toast(studioIncludeMeas ? '📐 Measurements included in reference' : '📐 Clean reference (measurements excluded)', 'info');
              },
            }),
            '📐 Measurements'
          )
        ),
        U.h(
          'div',
          { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
          U.h(
            'button',
            {
              class: 'btn ghost sm',
              id: 'btn-copy-ref-image',
              title: 'Copy reference image to clipboard to paste directly into Gemini (Cmd+V)',
              onclick: () => {
                A.exporter.copyToClipboard({
                  widthPx: 2400,
                  measurements: studioIncludeMeas,
                  photo: studioIncludePhoto,
                  background: '#ffffff',
                });
              },
            },
            '📋 Copy Image'
          ),
          U.h(
            'button',
            {
              class: 'btn ghost sm',
              id: 'btn-download-clean-ref',
              title: 'Download reference image for Gemini or Midjourney',
              onclick: () => {
                A.exporter.downloadPNG({
                  widthPx: 2400,
                  measurements: studioIncludeMeas,
                  photo: studioIncludePhoto,
                  background: '#ffffff',
                });
              },
            },
            '⬇️ Download PNG'
          ),
          U.h(
            'button',
            {
              class: 'btn ghost sm',
              id: 'btn-more-export-opts',
              title: 'Open full Export Elevation dialog with live preview and custom options',
              onclick: () => {
                A.exporter.openModal();
              },
            },
            '⚙️ More...'
          )
        )
      )
    );

    // 3. Modifier Chips
    const chipsSection = U.h('div', { class: 'chip-group' });
    chipsSection.appendChild(U.h('div', { class: 'studio-section-title' }, 'Architectural Tuning Modifiers:'));

    const chipCategories = A.prompt.chips();
    for (const [catName, chipList] of Object.entries(chipCategories)) {
      const row = U.h('div', { class: 'chip-row' });
      for (const chip of chipList) {
        const isAct = activeModifiers.has(chip);
        const btn = U.h(
          'button',
          {
            class: `chip-btn ${isAct ? 'active' : ''}`,
            onclick: () => {
              if (activeModifiers.has(chip)) activeModifiers.delete(chip);
              else activeModifiers.add(chip);
              renderBody();
            },
          },
          chip
        );
        row.appendChild(btn);
      }
      chipsSection.appendChild(row);
    }

    leftCol.appendChild(formatRow);
    if (tipBanner) leftCol.appendChild(tipBanner);
    leftCol.appendChild(textarea);
    leftCol.appendChild(promptActions);
    leftCol.appendChild(chipsSection);

    // Right Column: Provider Selection & Live Generation
    const providerTitle = U.h('div', { class: 'studio-section-title' }, 'AI Render Provider:');
    const providerCards = U.h('div', { class: 'provider-cards' });

    const activeProvider = A.providers.getActive();
    for (const p of A.providers.list()) {
      const isAct = p.id === activeProvider;
      const card = U.h(
        'div',
        {
          class: `provider-card ${isAct ? 'active' : ''}`,
          onclick: () => {
            A.providers.setActive(p.id);
            renderBody();
          },
        },
        U.h('div', { class: 'provider-card-name' }, p.label),
        U.h('div', { class: 'provider-card-sub' }, p.needsKey ? 'API Key required' : 'Free / Instant')
      );
      providerCards.appendChild(card);
    }

    // Active Provider Config
    const curP = A.providers.list().find((p) => p.id === activeProvider);
    const curCfg = A.providers.getConfig(activeProvider);
    const configBox = U.h('div', { class: 'provider-config-box' });

    configBox.appendChild(U.h('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-1)' } }, curP.notes));

    if (curP.needsKey || curP.keyOptional) {
      const keyWrap = U.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
      keyWrap.appendChild(
        U.h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)' } },
          U.h('span', null, 'API Key:'),
          curP.keyUrl ? U.h('a', { href: curP.keyUrl, target: '_blank', style: { color: 'var(--brass)' } }, 'Get Key ↗') : null
        )
      );
      const keyInput = U.h('input', {
        type: 'password',
        class: 'input',
        placeholder: curP.keyOptional ? 'Optional key' : 'Paste API key here…',
        value: curCfg.apiKey || '',
        onchange: (e) => A.providers.setConfig(activeProvider, { apiKey: e.target.value }),
      });
      keyWrap.appendChild(keyInput);
      configBox.appendChild(keyWrap);
    }

    if (curP.models && curP.models.length > 0) {
      const modelWrap = U.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
      modelWrap.appendChild(U.h('span', { style: { fontSize: 'var(--fs-xs)' } }, 'Model:'));
      const select = U.h(
        'select',
        {
          class: 'select',
          onchange: (e) => A.providers.setConfig(activeProvider, { model: e.target.value }),
        },
        ...curP.models.map((m) => U.h('option', { value: m, selected: m === curCfg.model }, m))
      );
      modelWrap.appendChild(select);
      configBox.appendChild(modelWrap);
    }

    if (activeProvider === 'custom') {
      const baseWrap = U.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
      baseWrap.appendChild(U.h('span', { style: { fontSize: 'var(--fs-xs)' } }, 'Base URL:'));
      const baseInput = U.h('input', {
        class: 'input',
        value: curCfg.baseUrl || 'http://localhost:8080/v1',
        onchange: (e) => A.providers.setConfig(activeProvider, { baseUrl: e.target.value }),
      });
      baseWrap.appendChild(baseInput);
      configBox.appendChild(baseWrap);
    }

    // Security note
    const secNote = U.h(
      'div',
      { class: 'security-note' },
      '🔒 Security Notice: API keys are stored only in your browser (localStorage) and sent directly to the selected AI provider. Never use shared public computers.'
    );
    configBox.appendChild(secNote);

    // Generate CTA Button
    const generateBtn = U.h(
      'button',
      {
        class: `btn primary lg ${isGenerating ? 'loading' : ''}`,
        style: { width: '100%', justifyContent: 'center', padding: '14px', fontSize: 'var(--fs-md)' },
        onclick: () => triggerGeneration(textarea.value),
      },
      isGenerating ? '⏳ Generating Render…' : '✨ Generate 3D Render'
    );

    // Result Preview or Status
    const previewBox = U.h('div', { class: 'render-preview-box', id: 'studio-preview-box' });
    if (latestRender) {
      previewBox.appendChild(U.h('img', { src: latestRender.src, class: 'render-preview-img' }));
    } else {
      previewBox.appendChild(U.h('div', { style: { color: 'var(--text-3)', fontSize: 'var(--fs-sm)' } }, 'Rendered AI images will appear here'));
    }

    rightCol.appendChild(providerTitle);
    rightCol.appendChild(providerCards);
    rightCol.appendChild(configBox);
    rightCol.appendChild(generateBtn);
    rightCol.appendChild(previewBox);

    container.appendChild(leftCol);
    container.appendChild(rightCol);
  }

  function createFormatBtn(fmt, label) {
    const isAct = selectedFormat === fmt;
    return U.h(
      'button',
      {
        class: `btn sm ${isAct ? 'secondary' : 'ghost'}`,
        onclick: () => {
          selectedFormat = fmt;
          renderBody();
        },
      },
      label
    );
  }

  /* ---------- Generation Action ---------- */
  async function triggerGeneration(promptText) {
    if (isGenerating) return;
    isGenerating = true;
    abortController = new AbortController();
    renderBody();

    const activeProvider = A.providers.getActive();
    const promptData = A.prompt.build(A.store.getState());

    try {
      A.ui.toast(`Requesting render from ${activeProvider}…`, 'info');
      const result = await A.providers.generate(activeProvider, {
        prompt: promptText,
        nearestRatio: promptData.nearestRatio,
        ratio: promptData.ratio,
        signal: abortController.signal,
      });

      latestRender = result;
      saveToGallery(result);
      A.ui.toast('Render generated successfully!', 'success');
      activeTab = 'compare'; // Jump directly to comparison
    } catch (err) {
      console.error('[Arch2D Render Error]', err);
      let errMsg = err.message || 'Generation failed.';
      if (err.hint) errMsg += `\nHint: ${err.hint}`;
      A.ui.toast(errMsg, 'error');
    } finally {
      isGenerating = false;
      renderBody();
    }
  }

  /* ---------- Compare Tab (Split Slider & Downloads) ---------- */
  function renderCompareTab(container) {
    const leftCol = U.h('div', { class: 'studio-col-left', style: { flex: '1.4' } });
    const rightCol = U.h('div', { class: 'studio-col-right', style: { flex: '0.6' } });

    if (!latestRender) {
      leftCol.appendChild(
        U.h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' } },
          U.h('div', { style: { fontSize: '40px' } }, '🖼️'),
          U.h('div', { style: { color: 'var(--text-2)' } }, 'No AI renders generated yet.'),
          U.h('button', { class: 'btn primary', onclick: () => switchTab('generate') }, 'Generate Your First Render')
        )
      );
      container.appendChild(leftCol);
      container.appendChild(rightCol);
      return;
    }

    // Interactive Split Slider Viewer
    const viewer = U.h('div', { class: 'split-viewer', id: 'split-viewer' });

    // CAD canvas render
    const cadCanvas = A.exporter.renderCanvas({ widthPx: 1400, annotations: true, rulers: true, grid: true });
    cadCanvas.className = 'split-img-cad';

    // 3D Render Image
    const renderImg = U.h('img', { src: latestRender.src, class: 'split-img-render' });

    // Overlay containing the render, clipped by splitPercent
    const overlay = U.h('div', { class: 'split-overlay', style: { width: `${splitPercent}%` } });
    overlay.appendChild(renderImg);

    // Drag Handle
    const handle = U.h('div', { class: 'split-handle', style: { left: `${splitPercent}%` } });

    viewer.appendChild(cadCanvas);
    viewer.appendChild(overlay);
    viewer.appendChild(handle);

    // Mouse / touch drag for split slider
    let isDraggingSplit = false;
    const updateSplit = (clientX) => {
      const rect = viewer.getBoundingClientRect();
      const p = U.clamp(((clientX - rect.left) / rect.width) * 100, 2, 98);
      splitPercent = p;
      overlay.style.width = `${p}%`;
      handle.style.left = `${p}%`;
    };

    viewer.addEventListener('pointerdown', (e) => {
      isDraggingSplit = true;
      viewer.setPointerCapture(e.pointerId);
      updateSplit(e.clientX);
    });
    viewer.addEventListener('pointermove', (e) => {
      if (isDraggingSplit) updateSplit(e.clientX);
    });
    viewer.addEventListener('pointerup', () => {
      isDraggingSplit = false;
    });

    leftCol.appendChild(viewer);

    // Right Column: Download Actions & History
    rightCol.appendChild(U.h('div', { class: 'studio-section-title' }, 'Export & Downloads:'));

    const btnDownload3D = U.h(
      'button',
      {
        class: 'btn primary',
        style: { width: '100%', justifyContent: 'center' },
        onclick: () => {
          if (latestRender.kind === 'dataurl' || latestRender.kind === 'objecturl') {
            U.downloadDataUrl(latestRender.src, `arch2d-render-${Date.now()}.png`);
          } else {
            window.open(latestRender.src, '_blank');
          }
        },
      },
      '💾 Download 3D Render'
    );

    const btnDownloadCAD = U.h(
      'button',
      {
        class: 'btn',
        style: { width: '100%', justifyContent: 'center' },
        onclick: () => A.exporter.downloadPNG({ widthPx: 2400 }),
      },
      '📷 Download CAD PNG (2400px)'
    );

    const btnDownloadSheet = U.h(
      'button',
      {
        class: 'btn',
        style: { width: '100%', justifyContent: 'center' },
        onclick: async () => {
          if (!latestRender.canvasSafe) {
            A.ui.toast('Cannot create comparison sheet: external URL image cannot be rasterized safely without CORS.', 'error');
            return;
          }
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = async () => {
            try {
              const sheet = await A.exporter.comparisonSheet(img);
              sheet.toBlob((blob) => {
                if (blob) U.downloadBlob(blob, `arch2d-comparison-sheet-${Date.now()}.png`);
              });
            } catch (e) {
              A.ui.toast('Export sheet failed: ' + e.message, 'error');
            }
          };
          img.src = latestRender.src;
        },
      },
      '📑 Download Comparison Sheet'
    );

    rightCol.appendChild(btnDownload3D);
    rightCol.appendChild(btnDownloadCAD);
    rightCol.appendChild(btnDownloadSheet);

    // Gallery history
    rightCol.appendChild(U.h('div', { class: 'studio-section-title', style: { marginTop: '16px' } }, 'Render History:'));
    const galleryGrid = U.h('div', { class: 'gallery-grid' });
    for (const item of galleryHistory) {
      const thumb = U.h(
        'div',
        {
          class: 'gallery-thumb',
          onclick: () => {
            latestRender = item;
            renderBody();
          },
        },
        U.h('img', { src: item.src })
      );
      galleryGrid.appendChild(thumb);
    }
    rightCol.appendChild(galleryGrid);

    container.appendChild(leftCol);
    container.appendChild(rightCol);
  }

  /* ---------- Public API ---------- */
  function open() {
    modalBackdrop.classList.add('open');
    renderBody();
  }

  function close() {
    modalBackdrop.classList.remove('open');
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  function bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop.classList.contains('open')) {
        close();
      }
    });
  }

  A.studio = {
    init,
    open,
    close,
  };
})();
