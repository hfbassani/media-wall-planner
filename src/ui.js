/* Arch2D — WS4: UI Shell, sidebars, and inspector controller (project.md §3, §3.1, §3.2, §3.7). */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;
  const V = A.vocab;

  let leftSidebar, rightSidebar, stageToolbar;

  function init() {
    leftSidebar = document.getElementById('sidebar-left');
    rightSidebar = document.getElementById('sidebar-right');
    stageToolbar = document.getElementById('stage-toolbar');

    initHeader();
    initStageToolbar();
    renderLeftSidebar();
    renderInspector();

    // Listen to changes to re-render inspector or update buttons
    A.bus.on('state:changed', (e) => {
      renderInspector();
      updateHeaderState();
      const r = e && e.reason;
      if (r === 'photo' || r === 'wall' || r === 'mood' || r === 'reset' || r === 'undo' || r === 'redo') {
        renderLeftSidebar();
      }
    });
    A.bus.on('selection:changed', () => {
      renderInspector();
    });
    A.bus.on('history:changed', () => {
      updateHeaderState();
    });
    A.bus.on('annotations:toggled', () => {
      updateToolbarState();
    });
    A.bus.on('eyelevel:toggled', () => {
      updateToolbarState();
    });
    A.bus.on('ghost:toggled', () => {
      updateToolbarState();
    });
    A.bus.on('photo:ready', () => {
      renderLeftSidebar();
    });
    A.bus.on('autosave:written', () => {
      const badge = document.getElementById('badge-dirty');
      if (badge) {
        badge.textContent = 'Autosaved';
        badge.style.color = 'var(--success)';
        setTimeout(() => {
          if (badge) badge.style.color = '';
        }, 1200);
      }
    });

    // Mobile sidebar toggles
    const btnToggleLeft = document.getElementById('btn-toggle-left');
    if (btnToggleLeft) {
      btnToggleLeft.addEventListener('click', () => leftSidebar.classList.toggle('open'));
    }
  }

  /* ---------- Header Bindings ---------- */
  function initHeader() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const selectTpl = document.getElementById('select-template');
    const btnSave = document.getElementById('btn-save');
    const btnLoad = document.getElementById('btn-load');
    const inputLoad = document.getElementById('input-load');
    const btnExport = document.getElementById('btn-export');
    const btnStudio = document.getElementById('btn-studio');

    if (btnUndo) btnUndo.addEventListener('click', () => A.store.undo());
    if (btnRedo) btnRedo.addEventListener('click', () => A.store.redo());

    // Populate templates dropdown
    if (selectTpl) {
      for (const tpl of A.templates.list()) {
        const opt = document.createElement('option');
        opt.value = tpl.id;
        opt.textContent = tpl.label;
        selectTpl.appendChild(opt);
      }
      selectTpl.addEventListener('change', async (e) => {
        const id = e.target.value;
        if (!id) return;
        const confirmed = await confirmModal({
          title: 'Load Template?',
          message: 'Loading a template will replace your current canvas. Unsaved changes will be cleared.',
          okLabel: 'Load Template',
        });
        if (confirmed) {
          const tplState = A.templates.get(id);
          if (tplState) {
            A.store.load(tplState, { source: 'template' });
            A.canvas.fit();
            toast('Template loaded.', 'success');
          }
        }
        selectTpl.value = '';
      });
    }

    if (btnSave) btnSave.addEventListener('click', () => A.persistence.saveToFile());
    if (btnLoad) {
      btnLoad.addEventListener('click', async () => {
        const res = await A.persistence.openFile(inputLoad);
        if (res.ok) {
          A.canvas.fit();
          toast('Project loaded successfully!', 'success');
        } else if (res.errors && res.errors.length) {
          toast(res.errors[0], 'error');
        }
      });
    }

    if (btnExport) btnExport.addEventListener('click', () => A.exporter.downloadPNG({ widthPx: 2400 }));
    if (btnStudio) btnStudio.addEventListener('click', () => A.studio.open());

    updateHeaderState();
  }

  function updateHeaderState() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = !A.store.canUndo();
    if (btnRedo) btnRedo.disabled = !A.store.canRedo();
  }

  /* ---------- Stage Toolbar ---------- */
  function initStageToolbar() {
    if (!stageToolbar) return;
    stageToolbar.innerHTML = '';

    const btnZoomOut = U.h('button', { class: 'icon-btn', title: 'Zoom Out (-)', onclick: () => A.canvas.zoomBy(0.8) }, '−');
    const btnZoomIn = U.h('button', { class: 'icon-btn', title: 'Zoom In (+)', onclick: () => A.canvas.zoomBy(1.25) }, '+');
    const btnFit = U.h('button', { class: 'icon-btn', title: 'Fit to Viewport (Double-click)', onclick: () => A.canvas.fit() }, '⊡');

    const sep1 = U.h('div', { style: { width: '1px', height: '16px', background: 'var(--line)' } });

    const btnAnnot = U.h(
      'button',
      {
        class: 'btn ghost sm',
        id: 'btn-toggle-annot',
        title: 'Toggle Dimensions Overlay (A)',
        onclick: () => A.canvas.toggleAnnotations(),
      },
      '📐 Dimensions'
    );

    const btnEyeLevel = U.h(
      'button',
      {
        class: `btn sm ${A.canvas.isEyeLevel() ? 'secondary' : 'ghost'}`,
        id: 'btn-toggle-eyelevel',
        title: 'Toggle Seated Spectator Eye Level & Ideal TV Center (E)',
        onclick: () => A.canvas.toggleEyeLevel(),
      },
      '👁 TV Eye Level'
    );

    const btnSnap = U.h(
      'button',
      {
        class: `btn sm ${A.canvas.isSnapping() ? 'secondary' : 'ghost'}`,
        id: 'btn-toggle-snap',
        title: 'Toggle Magnetic Snapping',
        onclick: () => {
          A.canvas.setSnapping(!A.canvas.isSnapping());
          updateToolbarState();
        },
      },
      '🧲 Snap'
    );

    const btnGhost = U.h(
      'button',
      {
        class: `btn sm ${A.canvas.isGhost() ? 'secondary' : 'ghost'}`,
        id: 'btn-toggle-ghost',
        title: 'See-Through Ghost Mode (G) — View wall photo and outlets behind furniture',
        onclick: () => {
          A.canvas.toggleGhost();
          updateToolbarState();
        },
      },
      '👻 Ghost'
    );

    stageToolbar.appendChild(btnZoomOut);
    stageToolbar.appendChild(btnZoomIn);
    stageToolbar.appendChild(btnFit);
    stageToolbar.appendChild(sep1);
    stageToolbar.appendChild(btnAnnot);
    stageToolbar.appendChild(btnEyeLevel);
    stageToolbar.appendChild(btnSnap);
    stageToolbar.appendChild(btnGhost);

    updateToolbarState();
  }

  function updateToolbarState() {
    const btnAnnot = document.getElementById('btn-toggle-annot');
    if (btnAnnot) {
      btnAnnot.classList.toggle('primary', A.canvas.annotationsVisible());
    }
    const btnEye = document.getElementById('btn-toggle-eyelevel');
    if (btnEye) {
      btnEye.classList.toggle('primary', A.canvas.isEyeLevel());
    }
    const btnSnap = document.getElementById('btn-toggle-snap');
    if (btnSnap) {
      btnSnap.classList.toggle('primary', A.canvas.isSnapping());
    }
    const btnGhost = document.getElementById('btn-toggle-ghost');
    if (btnGhost) {
      btnGhost.classList.toggle('primary', A.canvas.isGhost());
    }
  }

  /* ---------- Left Sidebar (Wall & Presets) ---------- */
  function renderLeftSidebar() {
    if (!leftSidebar) return;
    leftSidebar.innerHTML = '';
    const state = A.store.getState();

    // 1. Project Info
    const secProject = U.h('div', { class: 'sidebar-section' });
    secProject.appendChild(U.h('div', { class: 'section-heading' }, 'Project'));
    const inputName = U.h('input', {
      class: 'input',
      value: state.name,
      placeholder: 'Media wall title…',
      onchange: (e) => {
        A.store.update((d) => (d.name = e.target.value.trim() || 'Untitled media wall'), { reason: 'name' });
      },
    });
    secProject.appendChild(inputName);

    // 2. Wall Envelope Dimensions
    const secWall = U.h('div', { class: 'sidebar-section' });
    secWall.appendChild(U.h('div', { class: 'section-heading' }, 'Wall Envelope (cm)'));

    const wallRow = U.h('div', { class: 'form-row' });
    const fieldW = U.h(
      'div',
      { class: 'form-field' },
      U.h('label', { class: 'form-label' }, 'Width cm'),
      U.h('input', {
        type: 'number',
        class: 'input',
        min: '50',
        max: '5000',
        value: state.wallWidth,
        onchange: (e) => A.store.setWall({ wallWidth: parseInt(e.target.value) || 400 }),
      })
    );
    const fieldH = U.h(
      'div',
      { class: 'form-field' },
      U.h('label', { class: 'form-label' }, 'Height cm'),
      U.h('input', {
        type: 'number',
        class: 'input',
        min: '50',
        max: '2000',
        value: state.wallHeight,
        onchange: (e) => A.store.setWall({ wallHeight: parseInt(e.target.value) || 280 }),
      })
    );
    wallRow.appendChild(fieldW);
    wallRow.appendChild(fieldH);
    secWall.appendChild(wallRow);

    // 2b. Wall Photo Background
    const secPhoto = U.h('div', { class: 'sidebar-section' });
    secPhoto.appendChild(U.h('div', { class: 'section-heading' }, 'Wall Photo Background'));

    const photoRef = state.wallPhoto;
    const photoData = photoRef && A.photo ? A.photo.dataUrl(photoRef.id) : null;

    if (!photoRef || !photoData) {
      const btnUpload = U.h(
        'button',
        {
          class: 'btn',
          id: 'btn-upload-wall-photo',
          style: { width: '100%', justifyContent: 'center' },
          onclick: () => A.photoCalibrate.upload(),
        },
        '📷 Upload Wall Photo'
      );
      secPhoto.appendChild(btnUpload);
      secPhoto.appendChild(
        U.h('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-2)', marginTop: '4px', lineHeight: '1.4' } },
          'Use a real photo of your wall as a drafting backdrop. You will align the 4 corners to scale the wall precisely.'
        )
      );
    } else {
      const card = U.h('div', { class: 'photo-card' });
      const thumbWrap = U.h('div', { class: 'photo-thumb-wrap' });
      const thumb = U.h('img', { class: 'photo-thumb', src: photoData, alt: 'Wall photo background' });
      thumbWrap.appendChild(thumb);
      card.appendChild(thumbWrap);

      // Visibility toggle & Recalibrate row
      const rowActs = U.h('div', { class: 'form-row' });
      const btnVis = U.h(
        'button',
        {
          class: `btn sm ${photoRef.visible ? 'secondary' : 'ghost'}`,
          style: { flex: 1, justifyContent: 'center' },
          onclick: () => A.store.patchWallPhoto({ visible: !photoRef.visible }),
        },
        photoRef.visible ? '👁 Visible' : '👁‍🗨 Hidden'
      );
      const btnAdjust = U.h(
        'button',
        {
          class: 'btn sm ghost',
          style: { flex: 1, justifyContent: 'center' },
          title: 'Adjust 4 corner calibration points',
          onclick: () => A.photoCalibrate.adjust(),
        },
        '📐 Calibrate'
      );
      rowActs.appendChild(btnVis);
      rowActs.appendChild(btnAdjust);
      card.appendChild(rowActs);

      // Replace & Delete row
      const rowActs2 = U.h('div', { class: 'form-row' });
      const btnReplace = U.h(
        'button',
        {
          class: 'btn sm ghost',
          style: { flex: 1, justifyContent: 'center' },
          onclick: () => A.photoCalibrate.upload(),
        },
        '📷 Replace'
      );
      const btnRemove = U.h(
        'button',
        {
          class: 'btn sm danger',
          style: { flex: 1, justifyContent: 'center' },
          onclick: async () => {
            const confirmed = await confirmModal({
              title: 'Remove Wall Photo?',
              message: 'This will remove the photo backdrop from your project.',
              okLabel: 'Remove Photo',
            });
            if (confirmed) {
              A.store.setWallPhoto(null);
            }
          },
        },
        '🗑 Remove'
      );
      rowActs2.appendChild(btnReplace);
      rowActs2.appendChild(btnRemove);
      card.appendChild(rowActs2);

      // Export option checkbox
      const chkExport = U.h(
        'label',
        { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-xs)', cursor: 'pointer', marginTop: '4px' } },
        U.h('input', {
          type: 'checkbox',
          checked: photoRef.showOnExport,
          onchange: (e) => A.store.patchWallPhoto({ showOnExport: e.target.checked }),
        }),
        'Include photo in exported PNG'
      );
      card.appendChild(chkExport);

      secPhoto.appendChild(card);
    }

    // 3. Style & Aesthetic Mood
    const secMood = U.h('div', { class: 'sidebar-section' });
    secMood.appendChild(U.h('div', { class: 'section-heading' }, 'Design Mood & Style'));
    const selectMood = U.h(
      'select',
      {
        class: 'select',
        onchange: (e) => A.store.setMood(e.target.value),
      },
      ...Object.entries(V.moods).map(([id, m]) => U.h('option', { value: id, selected: id === state.mood }, m.label))
    );
    secMood.appendChild(selectMood);

    // 4. Quick Add Presets Library
    const secPresets = U.h('div', { class: 'sidebar-section' });
    secPresets.appendChild(U.h('div', { class: 'section-heading' }, 'Quick Add Presets'));

    const presetsGrid = U.h('div', { class: 'presets-grid' });
    for (const [key, p] of Object.entries(V.presets)) {
      if (key === 'custom') continue;
      const btn = U.h(
        'button',
        {
          class: 'preset-item-btn',
          onclick: () => {
            A.store.addPreset(key);
            if (window.innerWidth <= 900) rightSidebar.classList.add('open');
          },
        },
        U.h('span', null, p.label),
        U.h('span', { class: 'preset-dims' }, `${p.width}×${p.height}`)
      );
      presetsGrid.appendChild(btn);
    }
    secPresets.appendChild(presetsGrid);

    // Custom Block button
    const btnCustom = U.h(
      'button',
      {
        class: 'btn',
        style: { width: '100%', justifyContent: 'center', marginTop: '6px' },
        onclick: () => A.store.addPreset('custom'),
      },
      '+ Custom 50×50 Block'
    );
    secPresets.appendChild(btnCustom);

    // 5. Ergonomics & Seated Eye Level
    const secErgo = U.h('div', { class: 'sidebar-section' });
    secErgo.appendChild(U.h('div', { class: 'section-heading' }, 'Spectator Eye Level'));
    const ergoRow = U.h('div', { class: 'form-row' });
    ergoRow.appendChild(
      U.h(
        'div',
        { class: 'form-field' },
        U.h('label', { class: 'form-label' }, 'Eye Level AFF (cm)'),
        U.h('input', {
          type: 'number',
          class: 'input',
          min: '60',
          max: '200',
          value: A.canvas.getEyeLevelCm(),
          onchange: (e) => A.canvas.setEyeLevelCm(parseInt(e.target.value) || 105),
        })
      )
    );
    secErgo.appendChild(ergoRow);

    const chkEye = U.h(
      'label',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-xs)', cursor: 'pointer', marginTop: '6px' } },
      U.h('input', {
        type: 'checkbox',
        checked: A.canvas.isEyeLevel(),
        onchange: (e) => A.canvas.setEyeLevel(e.target.checked),
      }),
      'Show Eye Level Datum (E)'
    );
    secErgo.appendChild(chkEye);

    leftSidebar.appendChild(secProject);
    leftSidebar.appendChild(secWall);
    leftSidebar.appendChild(secPhoto);
    leftSidebar.appendChild(secMood);
    leftSidebar.appendChild(secErgo);
    leftSidebar.appendChild(secPresets);
  }

  /* ---------- Right Sidebar (Element Inspector) ---------- */
  function renderInspector() {
    if (!rightSidebar) return;
    rightSidebar.innerHTML = '';

    const selIds = A.store.getSelection();
    const selElements = A.store.getSelectedElements();

    if (!selElements.length) {
      rightSidebar.appendChild(
        U.h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-2)', textAlign: 'center', gap: '12px', padding: '24px' } },
          U.h('div', { style: { fontSize: '32px' } }, '📐'),
          U.h('div', { style: { fontWeight: '600', color: 'var(--text-1)' } }, 'No Selection'),
          U.h('div', { style: { fontSize: 'var(--fs-xs)' } }, 'Select an element on canvas to adjust dimensions, materials, colors and LED backlighting.')
        )
      );
      return;
    }

    if (selElements.length > 1) {
      // Multi-selection summary
      renderMultiInspector(selElements);
      return;
    }

    // Single element inspector
    const el = selElements[0];
    const secHeader = U.h(
      'div',
      { class: 'sidebar-section' },
      U.h('div', { class: 'section-heading' }, 'Selected Component'),
      U.h('input', {
        class: 'input',
        value: el.label,
        onchange: (e) => mutateEl(el.id, { label: e.target.value.trim() || el.label }),
      })
    );

    // Dimensions: W, H
    const secDims = U.h('div', { class: 'sidebar-section' });
    secDims.appendChild(U.h('div', { class: 'section-heading' }, 'Dimensions & Position (cm)'));
    const rowDim = U.h('div', { class: 'form-row' });
    rowDim.appendChild(
      makeNumField('Width', el.width, (v) => mutateEl(el.id, { width: Math.max(V.config.minSizeCm, v) }))
    );
    rowDim.appendChild(
      makeNumField('Height', el.height, (v) => mutateEl(el.id, { height: Math.max(V.config.minSizeCm, v) }))
    );
    const rowPos = U.h('div', { class: 'form-row' });
    rowPos.appendChild(
      makeNumField('X (Left)', el.x, (v) => mutateEl(el.id, { x: v }))
    );
    rowPos.appendChild(
      makeNumField('Y (Floor AFF)', el.y, (v) => mutateEl(el.id, { y: v }))
    );
    secDims.appendChild(rowDim);
    secDims.appendChild(rowPos);

    // Ergonomic TV Center Alignment Card (if selected element is a TV)
    let secTvErgo = null;
    if (el.type === 'tv' || el.label.toLowerCase().includes('tv')) {
      secTvErgo = U.h('div', {
        class: 'sidebar-section',
        style: {
          background: 'rgba(234, 179, 8, 0.08)',
          padding: '12px',
          borderRadius: 'var(--r-md)',
          border: '1px solid rgba(234, 179, 8, 0.28)',
          gap: '6px',
        },
      });
      const eyeCm = A.canvas.getEyeLevelCm();
      const tvCenterCm = Math.round((el.y + el.height / 2) * 10) / 10;
      const deltaCm = Math.round((tvCenterCm - eyeCm) * 10) / 10;
      const isAligned = Math.abs(deltaCm) <= 1.5;

      secTvErgo.appendChild(
        U.h('div', { class: 'section-heading', style: { color: 'var(--brass)', display: 'flex', justifyContent: 'space-between' } },
          U.h('span', null, '👁 Ergonomic TV Center'),
          U.h('span', { style: { color: isAligned ? 'var(--success)' : 'var(--text-1)' } }, isAligned ? '✓ Aligned' : `${deltaCm > 0 ? '+' : ''}${deltaCm} cm`)
        )
      );

      secTvErgo.appendChild(
        U.h('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-1)', lineHeight: '1.4' } },
          `Ideal Center: ${eyeCm} cm AFF · Current: ${tvCenterCm} cm AFF`
        )
      );

      const btnAlign = U.h(
        'button',
        {
          class: 'btn sm primary',
          style: { width: '100%', justifyContent: 'center', marginTop: '4px' },
          onclick: () => {
            const idealY = Math.round(eyeCm - el.height / 2);
            mutateEl(el.id, { y: Math.max(0, idealY) });
            A.canvas.requestRedraw();
            toast('TV center aligned to spectator eye level.', 'success');
          },
        },
        '🎯 Align TV Center to Eye Level'
      );
      secTvErgo.appendChild(btnAlign);
    }

    // Materials / Textures Picker
    const secMat = U.h('div', { class: 'sidebar-section' });
    secMat.appendChild(U.h('div', { class: 'section-heading' }, 'Material Texture'));
    const texGrid = U.h('div', { class: 'texture-picker-grid' });
    for (const [tId, tObj] of Object.entries(V.textures)) {
      const isAct = el.texture === tId;
      const tile = U.h(
        'button',
        {
          class: `texture-tile ${isAct ? 'active' : ''}`,
          onclick: () => mutateEl(el.id, { texture: tId, color: isAct ? el.color : tObj.defaultColor }),
        },
        tObj.label
      );
      texGrid.appendChild(tile);
    }
    secMat.appendChild(texGrid);

    // Color & Opacity
    const rowColor = U.h('div', { class: 'form-row', style: { alignItems: 'center', marginTop: '6px' } });
    rowColor.appendChild(
      U.h(
        'div',
        { class: 'form-field' },
        U.h('label', { class: 'form-label' }, 'Base Color'),
        U.h('input', {
          type: 'color',
          class: 'input',
          style: { height: '36px', padding: '2px', cursor: 'pointer' },
          value: el.color,
          oninput: (e) => mutateEl(el.id, { color: e.target.value }),
        })
      )
    );
    rowColor.appendChild(
      U.h(
        'div',
        { class: 'form-field' },
        U.h('label', { class: 'form-label' }, `Opacity (${Math.round(el.opacity * 100)}%)`),
        U.h('input', {
          type: 'range',
          min: '0.1',
          max: '1',
          step: '0.05',
          value: el.opacity,
          oninput: (e) => mutateEl(el.id, { opacity: parseFloat(e.target.value) }),
        })
      )
    );
    secMat.appendChild(rowColor);

    // LED Lighting Modifiers
    const secLed = U.h('div', { class: 'sidebar-section' });
    secLed.appendChild(U.h('div', { class: 'section-heading' }, 'LED Lighting Effects'));

    // Halo toggle
    const chkHalo = U.h(
      'label',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-sm)', cursor: 'pointer' } },
      U.h('input', {
        type: 'checkbox',
        checked: el.ledHalo,
        onchange: (e) => mutateEl(el.id, { ledHalo: e.target.checked }),
      }),
      'Concealed Backlight Halo'
    );
    secLed.appendChild(chkHalo);

    if (el.ledHalo) {
      const rowTemp = U.h('div', { style: { display: 'flex', gap: '6px', marginLeft: '22px' } });
      rowTemp.appendChild(
        U.h(
          'button',
          {
            class: `btn sm ${el.ledTemp === 3000 ? 'secondary' : 'ghost'}`,
            onclick: () => mutateEl(el.id, { ledTemp: 3000 }),
          },
          'Warm 3000K'
        )
      );
      rowTemp.appendChild(
        U.h(
          'button',
          {
            class: `btn sm ${el.ledTemp === 4000 ? 'secondary' : 'ghost'}`,
            onclick: () => mutateEl(el.id, { ledTemp: 4000 }),
          },
          'Neutral 4000K'
        )
      );
      secLed.appendChild(rowTemp);
    }

    // Underglow toggle
    const chkUnderglow = U.h(
      'label',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-sm)', cursor: 'pointer', marginTop: '4px' } },
      U.h('input', {
        type: 'checkbox',
        checked: el.ledUnderglow,
        onchange: (e) => mutateEl(el.id, { ledUnderglow: e.target.checked }),
      }),
      'Under-Cabinet Downward Glow'
    );
    secLed.appendChild(chkUnderglow);

    // Layer & Actions
    const secActions = U.h('div', { class: 'sidebar-section' });
    secActions.appendChild(U.h('div', { class: 'section-heading' }, 'Stacking & Actions'));

    const layerRow = U.h('div', { class: 'btn-group', style: { width: '100%' } });
    layerRow.appendChild(
      U.h(
        'button',
        {
          class: 'btn',
          style: { flex: '1', justifyContent: 'center' },
          onclick: () => A.store.bringForward([el.id]),
        },
        '▲ Bring Forward'
      )
    );
    layerRow.appendChild(
      U.h(
        'button',
        {
          class: 'btn',
          style: { flex: '1', justifyContent: 'center' },
          onclick: () => A.store.sendBackward([el.id]),
        },
        '▼ Send Backward'
      )
    );
    secActions.appendChild(layerRow);

    const actionRow = U.h('div', { class: 'form-row', style: { marginTop: '6px' } });
    actionRow.appendChild(
      U.h(
        'button',
        {
          class: 'btn',
          style: { justifyContent: 'center' },
          onclick: () => A.store.duplicateElements([el.id]),
        },
        '📋 Duplicate'
      )
    );
    actionRow.appendChild(
      U.h(
        'button',
        {
          class: 'btn danger',
          style: { justifyContent: 'center' },
          onclick: () => A.store.removeElements([el.id]),
        },
        '🗑 Delete'
      )
    );
    secActions.appendChild(actionRow);

    rightSidebar.appendChild(secHeader);
    rightSidebar.appendChild(secDims);
    if (secTvErgo) rightSidebar.appendChild(secTvErgo);
    rightSidebar.appendChild(secMat);
    rightSidebar.appendChild(secLed);
    rightSidebar.appendChild(secActions);
  }

  function renderMultiInspector(elements) {
    const ids = elements.map((e) => e.id);
    const sec = U.h(
      'div',
      { class: 'sidebar-section' },
      U.h('div', { class: 'section-heading' }, 'Multiple Selection'),
      U.h('div', { style: { fontSize: 'var(--fs-sm)', color: 'var(--text-1)' } }, `${elements.length} components selected`),
      U.h('div', { class: 'form-row', style: { marginTop: '8px' } },
        U.h('button', { class: 'btn', onclick: () => A.store.duplicateElements(ids) }, '📋 Duplicate All'),
        U.h('button', { class: 'btn danger', onclick: () => A.store.removeElements(ids) }, '🗑 Delete All')
      ),
      U.h('button', { class: 'btn ghost sm', style: { marginTop: '8px' }, onclick: () => A.store.clearSelection() }, 'Deselect All')
    );
    rightSidebar.appendChild(sec);
  }

  function mutateEl(id, partial) {
    A.store.update((draft) => {
      const target = draft.elements.find((e) => e.id === id);
      if (target) Object.assign(target, partial);
    }, { reason: 'inspector' });
  }

  function makeNumField(label, val, onChange) {
    return U.h(
      'div',
      { class: 'form-field' },
      U.h('label', { class: 'form-label' }, label),
      U.h('input', {
        type: 'number',
        class: 'input',
        value: Math.round(val),
        onchange: (e) => onChange(parseFloat(e.target.value) || 0),
      })
    );
  }

  /* ---------- Toasts & Confirmations ---------- */
  function toast(msg, type = 'info') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const t = U.h('div', { class: `toast ${type}` }, msg);
    stack.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      t.style.transition = 'all 200ms ease';
      setTimeout(() => t.remove(), 220);
    }, 3200);
  }

  function confirmModal({ title, message, okLabel = 'OK', cancelLabel = 'Cancel' }) {
    return new Promise((resolve) => {
      const backdrop = U.h('div', { class: 'modal-backdrop open' });
      const modal = U.h(
        'div',
        { class: 'studio-modal', style: { maxWidth: '420px', height: 'auto', padding: '24px', gap: '16px' } },
        U.h('div', { style: { fontSize: 'var(--fs-lg)', fontWeight: '700' } }, title),
        U.h('div', { style: { fontSize: 'var(--fs-sm)', color: 'var(--text-1)' } }, message),
        U.h(
          'div',
          { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' } },
          U.h('button', { class: 'btn ghost', onclick: () => close(false) }, cancelLabel),
          U.h('button', { class: 'btn primary', onclick: () => close(true) }, okLabel)
        )
      );
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      function close(val) {
        backdrop.remove();
        resolve(val);
      }
    });
  }

  A.ui = {
    init,
    toast,
    confirm: confirmModal,
  };
})();
