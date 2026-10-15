/* Arch2D — WS2: interactive canvas engine & pointer manipulation (project.md §3.3, §3.6).
   Handles Pointer Events API (mouse, touch, stylus), pinch-to-zoom, panning,
   drag/resize with 8 handles, magnetic grid/edge snapping, guides, marquee multi-select. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;
  const V = A.vocab;

  let host, canvas, ctx;
  let animId = null;
  let redrawRequested = false;

  // Viewport / transform state
  let width = 800, height = 600, dpr = 1;
  let baseScale = 1; // px per cm to fit wall
  let zoom = 1;
  let panX = 0, panY = 0; // translation offset in px
  let annotations = false;
  let snapping = true;
  let eyeLevel = true; // Seated spectator eye level & ideal TV vertical center
  let eyeLevelCm = V.config.defaultEyeLevelCm || 105;
  let ghost = false; // draw elements translucent to see the wall photo behind them

  // Active pointers map for multitouch / pinch zoom
  const activePointers = new Map();
  let initialPinchDist = null;
  let initialPinchZoom = 1;

  // Interaction mode state
  let dragMode = null; // 'pan' | 'move' | 'resize' | 'marquee'
  let dragStart = null; // { x, y, cmX, cmY, elementsSnapshot, handle, marqueeStart }
  let activeGuides = []; // [{ axis: 'x'|'y', value: cm }]
  let currentMarquee = null; // { x, y, w, h }

  function getPxPerCm() {
    return baseScale * zoom;
  }

  function getTransform() {
    const s = getPxPerCm();
    const state = A.store.getState();
    let minCmX = 0, maxCmX = state.wallWidth;
    let minCmY = 0, maxCmY = state.wallHeight;

    if (state.wallPhoto && state.wallPhoto.visible && A.photo) {
      const b = (state.wallPhoto && state.wallPhoto.bounds) || A.photo.bounds(state.wallPhoto.id);
      if (b && b.wCm && b.hCm) {
        minCmX = Math.min(0, b.xCm);
        maxCmX = Math.max(state.wallWidth, b.xCm + b.wCm);
        minCmY = Math.min(0, b.yCm);
        maxCmY = Math.max(state.wallHeight, b.yCm + b.hCm);
      }
    }

    const ox = Math.round(width / 2 - ((minCmX + maxCmX) * s) / 2 + panX);
    const oy = Math.round(height / 2 + ((minCmY + maxCmY) * s) / 2 + panY);
    return A.render.makeTransform(s, ox, oy);
  }

  function resize() {
    if (!host || !canvas) return;
    const rect = host.getBoundingClientRect();
    width = Math.max(200, Math.floor(rect.width));
    height = Math.max(200, Math.floor(rect.height));
    dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx = canvas.getContext('2d');
    fitScale();
    requestRedraw();
  }

  function fitScale() {
    const state = A.store.getState();
    const padX = Math.max(80, width * 0.14);
    const padY = Math.max(90, height * 0.16);
    const availW = Math.max(100, width - padX * 2);
    const availH = Math.max(100, height - padY * 2);

    let contentW = state.wallWidth;
    let contentH = state.wallHeight;

    if (state.wallPhoto && state.wallPhoto.visible && A.photo) {
      const b = (state.wallPhoto && state.wallPhoto.bounds) || A.photo.bounds(state.wallPhoto.id);
      if (b && b.wCm && b.hCm) {
        const minCmX = Math.min(0, b.xCm);
        const maxCmX = Math.max(state.wallWidth, b.xCm + b.wCm);
        const minCmY = Math.min(0, b.yCm);
        const maxCmY = Math.max(state.wallHeight, b.yCm + b.hCm);
        contentW = maxCmX - minCmX;
        contentH = maxCmY - minCmY;
      } else {
        const ar = A.photo.aspect(state.wallPhoto.id);
        if (ar > 0) {
          const photoW = state.wallHeight * ar;
          contentW = Math.max(contentW, photoW);
        }
      }
    }

    baseScale = Math.min(availW / contentW, availH / contentH);
  }

  function fit() {
    zoom = 1;
    panX = 0;
    panY = 0;
    fitScale();
    requestRedraw();
    emitView();
  }

  function zoomBy(factor, clientX, clientY) {
    const prevZoom = zoom;
    const nextZoom = U.clamp(zoom * factor, 0.25, 6);
    if (Math.abs(prevZoom - nextZoom) < 0.001) return;

    if (clientX !== undefined && clientY !== undefined && host) {
      const rect = host.getBoundingClientRect();
      const mx = clientX - rect.left - width / 2 - panX;
      const my = clientY - rect.top - height / 2 - panY;
      const scaleRatio = nextZoom / prevZoom;
      panX -= mx * (scaleRatio - 1);
      panY -= my * (scaleRatio - 1);
    }
    zoom = nextZoom;
    requestRedraw();
    emitView();
  }

  function emitView() {
    A.bus.emit('view:changed', { pxPerCm: getPxPerCm(), zoom, originX: getTransform().x(0), originY: getTransform().y(0) });
  }

  /* ---------- Pointer coordinate helper ---------- */
  function getCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const T = getTransform();
    return { x, y, cmX: T.cmX(x), cmY: T.cmY(y) };
  }

  /* ---------- Hit testing ---------- */
  function hitTest(x, y) {
    const state = A.store.getState();
    const selIds = A.store.getSelection();
    const T = getTransform();

    // 1. Check resize handles if single element selected
    if (selIds.length === 1) {
      const el = state.elements.find((e) => e.id === selIds[0]);
      if (el) {
        const r = T.rect(el);
        const handles = A.render.handleRects(r, 12);
        for (const h of handles) {
          if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
            return { type: 'handle', handle: h.key, element: el };
          }
        }
      }
    }

    // 2. Check elements in reverse z-index (front-to-back)
    for (let i = state.elements.length - 1; i >= 0; i--) {
      const el = state.elements[i];
      const r = T.rect(el);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return { type: 'element', element: el };
      }
    }

    return { type: 'none' };
  }

  /* ---------- Snapping calculations ---------- */
  function calculateSnaps(el, proposedX, proposedY, state, excludeIds) {
    if (!snapping) return { x: proposedX, y: proposedY, guides: [] };

    const snapThresholdCm = V.config.snapPx / getPxPerCm();
    let bestX = proposedX;
    let bestDistX = snapThresholdCm;
    let guideX = null;

    let bestY = proposedY;
    let bestDistY = snapThresholdCm;
    let guideY = null;

    // A. Wall bounds snapping (X=0, X+width=wallWidth, Y=0, Y+height=wallHeight)
    const xTargets = [0, state.wallWidth - el.width, Math.round(state.wallWidth / 2 - el.width / 2)];
    for (const tx of xTargets) {
      const d = Math.abs(proposedX - tx);
      if (d < bestDistX) {
        bestDistX = d;
        bestX = tx;
        guideX = tx;
      }
    }

    // Floor line snap (Y=0) and ceiling snap
    const yTargets = [0, state.wallHeight - el.height];
    for (const ty of yTargets) {
      const d = Math.abs(proposedY - ty);
      if (d < bestDistY) {
        bestDistY = d;
        bestY = ty;
        guideY = ty;
      }
    }

    // Eye level ideal TV center snap (when el is a TV or eyeLevel guide is visible)
    if (eyeLevel || el.type === 'tv' || el.label.toLowerCase().includes('tv')) {
      const idealTvY = eyeLevelCm - el.height / 2;
      const dEye = Math.abs(proposedY - idealTvY);
      if (dEye < bestDistY) {
        bestDistY = dEye;
        bestY = idealTvY;
        guideY = eyeLevelCm;
      }
    }

    // B. Neighbor elements edge snapping
    const others = state.elements.filter((e) => !excludeIds.has(e.id));
    for (const o of others) {
      // X edges: left-to-left, left-to-right, right-to-left, right-to-right, centers
      const oxEdges = [
        { val: o.x, guide: o.x },
        { val: o.x + o.width, guide: o.x + o.width },
        { val: o.x - el.width, guide: o.x },
        { val: o.x + o.width - el.width, guide: o.x + o.width },
        { val: o.x + o.width / 2 - el.width / 2, guide: o.x + o.width / 2 },
      ];
      for (const edge of oxEdges) {
        const d = Math.abs(proposedX - edge.val);
        if (d < bestDistX) {
          bestDistX = d;
          bestX = edge.val;
          guideX = edge.guide;
        }
      }

      // Y edges: bottom-to-bottom, top-to-bottom, bottom-to-top, top-to-top
      const oyEdges = [
        { val: o.y, guide: o.y },
        { val: o.y + o.height, guide: o.y + o.height },
        { val: o.y - el.height, guide: o.y },
        { val: o.y + o.height - el.height, guide: o.y + o.height },
        { val: o.y + o.height / 2 - el.height / 2, guide: o.y + o.height / 2 },
      ];
      for (const edge of oyEdges) {
        const d = Math.abs(proposedY - edge.val);
        if (d < bestDistY) {
          bestDistY = d;
          bestY = edge.val;
          guideY = edge.guide;
        }
      }
    }

    // C. 5cm / 10cm Grid Snap fallback if no magnetic neighbor snap
    if (bestDistX === snapThresholdCm) {
      const snapGrid = 5;
      const nearest = Math.round(proposedX / snapGrid) * snapGrid;
      if (Math.abs(proposedX - nearest) < snapThresholdCm) {
        bestX = nearest;
      }
    }
    if (bestDistY === snapThresholdCm) {
      const snapGrid = 5;
      const nearest = Math.round(proposedY / snapGrid) * snapGrid;
      if (Math.abs(proposedY - nearest) < snapThresholdCm) {
        bestY = nearest;
      }
    }

    const guides = [];
    if (guideX !== null) guides.push({ axis: 'x', value: guideX });
    if (guideY !== null) guides.push({ axis: 'y', value: guideY });

    return { x: Math.round(bestX * 10) / 10, y: Math.round(bestY * 10) / 10, guides };
  }

  /* ---------- Pointer Event Handlers ---------- */
  function onPointerDown(e) {
    if (U.isTypingTarget(document.activeElement)) document.activeElement.blur();

    // Only respond to left button (0) or middle button (1)
    if (e.button !== 0 && e.button !== 1) return;

    try {
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    // Multi-touch pinch-zoom setup (touch only, never mouse)
    if (e.pointerType === 'touch') {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        initialPinchZoom = zoom;
        dragMode = 'pinch';
        return;
      }
    } else {
      activePointers.clear();
    }

    const pt = getCanvasPoint(e);
    const hit = hitTest(pt.x, pt.y);
    const sel = A.store.getSelection();

    // Middle click or Alt+click => pan
    if (e.button === 1 || (e.altKey && e.button === 0)) {
      dragMode = 'pan';
      dragStart = { x: pt.x, y: pt.y, panX, panY };
      canvas.style.cursor = 'grabbing';
      return;
    }

    if (hit.type === 'handle') {
      // Resize handle hit
      dragMode = 'resize';
      A.store.begin();
      dragStart = {
        handle: hit.handle,
        element: hit.element,
        startX: pt.cmX,
        startY: pt.cmY,
        origX: hit.element.x,
        origY: hit.element.y,
        origW: hit.element.width,
        origH: hit.element.height,
      };
      setCursorForHandle(hit.handle);
    } else if (hit.type === 'element') {
      // Element hit
      if (e.shiftKey) {
        A.store.select(hit.element.id, { toggle: true });
      } else if (!sel.includes(hit.element.id)) {
        A.store.select(hit.element.id);
      }

      const currentSelected = A.store.getSelectedElements();
      if (!currentSelected.length) {
        dragMode = null;
        dragStart = null;
        return;
      }

      dragMode = 'move';
      A.store.begin();
      dragStart = {
        startX: pt.cmX,
        startY: pt.cmY,
        snappedDeltaX: 0,
        snappedDeltaY: 0,
        elements: currentSelected.map((el) => ({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height })),
      };
      canvas.style.cursor = 'move';
    } else {
      // Clicked on empty canvas
      if (!e.shiftKey) {
        A.store.clearSelection();
      }
      dragMode = 'marquee';
      dragStart = { startX: pt.x, startY: pt.y };
      currentMarquee = { x: pt.x, y: pt.y, w: 0, h: 0 };
    }
  }

  function onPointerMove(e) {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Handle 2-finger pinch zoom
    if (dragMode === 'pinch' && activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (initialPinchDist > 0) {
        const factor = currentDist / initialPinchDist;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        zoom = U.clamp(initialPinchZoom * factor, 0.25, 6);
        requestRedraw();
        emitView();
      }
      return;
    }

    const pt = getCanvasPoint(e);

    if (!dragMode) {
      // Hover cursor updates
      const hit = hitTest(pt.x, pt.y);
      if (hit.type === 'handle') {
        setCursorForHandle(hit.handle);
      } else if (hit.type === 'element') {
        canvas.style.cursor = 'move';
      } else {
        canvas.style.cursor = 'default';
      }
      return;
    }

    if (dragMode === 'pan') {
      if (!dragStart) return;
      panX = dragStart.panX + (pt.x - dragStart.x);
      panY = dragStart.panY + (pt.y - dragStart.y);
      requestRedraw();
      emitView();
    } else if (dragMode === 'move') {
      if (!dragStart || !dragStart.elements || !dragStart.elements.length) {
        dragMode = null;
        return;
      }
      const primary = dragStart.elements[0];
      if (!primary) {
        dragMode = null;
        return;
      }

      const rawDeltaX = pt.cmX - dragStart.startX;
      const rawDeltaY = pt.cmY - dragStart.startY;
      const state = A.store.getState();
      const excludeIds = new Set(dragStart.elements.map((e) => e.id));

      const proposedX = primary.x + rawDeltaX;
      const proposedY = primary.y + rawDeltaY;
      const snapResult = calculateSnaps(primary, proposedX, proposedY, state, excludeIds);

      const deltaX = snapResult.x - primary.x;
      const deltaY = snapResult.y - primary.y;
      activeGuides = snapResult.guides;

      A.store.update(
        (draft) => {
          for (const item of dragStart.elements) {
            const target = draft.elements.find((el) => el.id === item.id);
            if (target) {
              target.x = Math.round((item.x + deltaX) * 10) / 10;
              target.y = Math.round((item.y + deltaY) * 10) / 10;
            }
          }
        },
        { record: false, reason: 'drag' }
      );
      requestRedraw();
    } else if (dragMode === 'resize') {
      if (!dragStart || !dragStart.element) {
        dragMode = null;
        return;
      }
      const hnd = dragStart.handle;
      const el = dragStart.element;
      const rawDx = pt.cmX - dragStart.startX;
      const rawDy = pt.cmY - dragStart.startY;

      let newX = dragStart.origX;
      let newY = dragStart.origY;
      let newW = dragStart.origW;
      let newH = dragStart.origH;

      if (hnd.includes('e')) newW = Math.max(V.config.minSizeCm, dragStart.origW + rawDx);
      if (hnd.includes('w')) {
        const potentialW = dragStart.origW - rawDx;
        if (potentialW >= V.config.minSizeCm) {
          newW = potentialW;
          newX = dragStart.origX + rawDx;
        }
      }
      if (hnd.includes('n')) newH = Math.max(V.config.minSizeCm, dragStart.origH + rawDy);
      if (hnd.includes('s')) {
        const potentialH = dragStart.origH - rawDy;
        if (potentialH >= V.config.minSizeCm) {
          newH = potentialH;
          newY = dragStart.origY + rawDy;
        }
      }

      // Snap resizing edges to 5cm grid
      const grid = 5;
      newW = Math.round(newW / grid) * grid;
      newH = Math.round(newH / grid) * grid;
      newX = Math.round(newX / grid) * grid;
      newY = Math.round(newY / grid) * grid;

      A.store.update(
        (draft) => {
          const target = draft.elements.find((item) => item.id === el.id);
          if (target) {
            target.x = newX;
            target.y = newY;
            target.width = Math.max(V.config.minSizeCm, newW);
            target.height = Math.max(V.config.minSizeCm, newH);
          }
        },
        { record: false, reason: 'resize' }
      );
      requestRedraw();
    } else if (dragMode === 'marquee') {
      if (!dragStart) return;
      const x1 = Math.min(dragStart.startX, pt.x);
      const y1 = Math.min(dragStart.startY, pt.y);
      const x2 = Math.max(dragStart.startX, pt.x);
      const y2 = Math.max(dragStart.startY, pt.y);
      currentMarquee = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };

      // Live select elements inside marquee
      const state = A.store.getState();
      const T = getTransform();
      const insideIds = [];
      for (const el of state.elements) {
        const r = T.rect(el);
        if (r.x + r.w >= x1 && r.x <= x2 && r.y + r.h >= y1 && r.y <= y2) {
          insideIds.push(el.id);
        }
      }
      A.store.select(insideIds, { additive: e.shiftKey });
      requestRedraw();
    }
  }

  function onPointerUp(e) {
    if (e && e.pointerId !== undefined) {
      if (activePointers.has(e.pointerId)) {
        activePointers.delete(e.pointerId);
      }
      try {
        if (canvas && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    } else {
      activePointers.clear();
    }

    if (dragMode === 'move' || dragMode === 'resize') {
      A.store.commit();
    }

    dragMode = null;
    dragStart = null;
    activeGuides = [];
    currentMarquee = null;
    initialPinchDist = null;
    if (canvas) canvas.style.cursor = 'default';
    requestRedraw();
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch or Ctrl+wheel zoom
      const zoomFactor = Math.exp(-e.deltaY * 0.01);
      zoomBy(zoomFactor, e.clientX, e.clientY);
    } else {
      // Pan
      panX -= e.deltaX;
      panY -= e.deltaY;
      requestRedraw();
      emitView();
    }
  }

  function setCursorForHandle(hnd) {
    const map = {
      n: 'ns-resize',
      s: 'ns-resize',
      e: 'ew-resize',
      w: 'ew-resize',
      nw: 'nwse-resize',
      se: 'nwse-resize',
      ne: 'nesw-resize',
      sw: 'nesw-resize',
    };
    canvas.style.cursor = map[hnd] || 'default';
  }

  /* ---------- Render Loop ---------- */
  function requestRedraw() {
    redrawRequested = true;
  }

  function loop(time) {
    const state = A.store.getState();
    const needsAnim = A.render.needsAnimation(state);

    if (redrawRequested || needsAnim) {
      redrawRequested = false;
      renderNow(time);
    }

    animId = requestAnimationFrame(loop);
  }

  function renderNow(time) {
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const s = getPxPerCm();
    const T = getTransform();
    const sel = A.store.getSelection();

    A.render.drawScene(ctx, A.store.getState(), {
      pxPerCm: s,
      originX: T.x(0),
      originY: T.y(0),
      width,
      height,
      time: time || performance.now(),
      grid: true,
      annotations,
      eyeLevel,
      eyeLevelCm,
      labels: true,
      rulers: true,
      selection: sel,
      hud: true,
      guides: activeGuides,
      marquee: currentMarquee,
      theme: 'screen',
      uiScale: 1,
      dpr,
      background: '#0b0d11',
      ghost,
    });

    ctx.restore();
  }

  /* ---------- Initialization ---------- */
  function init(hostEl) {
    host = hostEl;
    host.innerHTML = '';

    canvas = document.createElement('canvas');
    canvas.id = 'arch2d-canvas';
    canvas.setAttribute('tabindex', '0');
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none'; // Essential for Pointer Events pinch/pan
    host.appendChild(canvas);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Safety: global pointerup & blur to prevent stuck drags when pointer leaves canvas or window
    window.addEventListener('pointerup', (e) => {
      if (dragMode) onPointerUp(e);
    });
    window.addEventListener('pointercancel', (e) => {
      if (dragMode) onPointerUp(e);
    });
    window.addEventListener('blur', () => {
      activePointers.clear();
      if (dragMode) onPointerUp();
    });

    // Double click to reset / fit zoom
    canvas.addEventListener('dblclick', () => fit());

    window.addEventListener('resize', U.debounce(resize, 80));

    // ResizeObserver on canvas host container so layout changes (sidebars open/close) resize immediately
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        resize();
      });
      ro.observe(hostEl);
    }

    // Listen to store updates
    A.bus.on('state:changed', () => requestRedraw());
    A.bus.on('selection:changed', () => requestRedraw());
    A.bus.on('photo:ready', () => requestRedraw());

    resize();
    fit();

    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
  }

  A.canvas = {
    init,
    requestRedraw,
    fit,
    zoomBy,
    getView: () => ({ pxPerCm: getPxPerCm(), zoom, originX: getTransform().x(0), originY: getTransform().y(0) }),
    setAnnotations: (val) => {
      annotations = !!val;
      requestRedraw();
      A.bus.emit('annotations:toggled', { visible: annotations });
    },
    toggleAnnotations: () => {
      A.canvas.setAnnotations(!annotations);
    },
    annotationsVisible: () => annotations,
    setEyeLevel: (val) => {
      eyeLevel = !!val;
      requestRedraw();
      A.bus.emit('eyelevel:toggled', { visible: eyeLevel, cm: eyeLevelCm });
    },
    toggleEyeLevel: () => {
      A.canvas.setEyeLevel(!eyeLevel);
    },
    isEyeLevel: () => eyeLevel,
    getEyeLevelCm: () => eyeLevelCm,
    setEyeLevelCm: (val) => {
      eyeLevelCm = U.clamp(Number(val) || 105, 50, 250);
      requestRedraw();
      A.bus.emit('eyelevel:toggled', { visible: eyeLevel, cm: eyeLevelCm });
    },
    setSnapping: (val) => {
      snapping = !!val;
    },
    isSnapping: () => snapping,
    setGhost: (val) => {
      ghost = !!val;
      requestRedraw();
      A.bus.emit('ghost:toggled', { visible: ghost });
    },
    toggleGhost: () => A.canvas.setGhost(!ghost),
    isGhost: () => ghost,
  };
})();
