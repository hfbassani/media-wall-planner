/* Arch2D — WS2: global keyboard shortcuts and nudge interactions (project.md §3.4). */
(function () {
  'use strict';
  const A = window.Arch2D;
  const U = A.util;

  function onKeyDown(e) {
    // Never intercept shortcuts while user is typing in inputs or textareas
    if (U.isTypingTarget(e.target)) return;

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
    const shift = e.shiftKey;
    const key = e.key;

    // 1. Undo / Redo
    if (cmdOrCtrl && (key === 'z' || key === 'Z')) {
      e.preventDefault();
      if (shift) A.store.redo();
      else A.store.undo();
      return;
    }
    if (cmdOrCtrl && (key === 'y' || key === 'Y')) {
      e.preventDefault();
      A.store.redo();
      return;
    }

    // 2. Duplicate: Ctrl/Cmd + D
    if (cmdOrCtrl && (key === 'd' || key === 'D')) {
      e.preventDefault();
      const sel = A.store.getSelection();
      if (sel.length) A.store.duplicateElements(sel);
      return;
    }

    // 3. Save: Ctrl/Cmd + S
    if (cmdOrCtrl && (key === 's' || key === 'S')) {
      e.preventDefault();
      A.persistence.saveToFile();
      return;
    }

    // 4. Select All: Ctrl/Cmd + A
    if (cmdOrCtrl && (key === 'a' || key === 'A')) {
      e.preventDefault();
      A.store.selectAll();
      return;
    }

    // 5. Annotations Toggle: 'a' or 'A' without modifier
    if (!cmdOrCtrl && (key === 'a' || key === 'A')) {
      e.preventDefault();
      A.canvas.toggleAnnotations();
      return;
    }

    // 5b. Seated Eye Level / TV Center Toggle: 'e' or 'E' without modifier
    if (!cmdOrCtrl && (key === 'e' || key === 'E')) {
      e.preventDefault();
      A.canvas.toggleEyeLevel();
      return;
    }

    // 5c. Ghost Elements Toggle: 'g' or 'G' without modifier
    if (!cmdOrCtrl && (key === 'g' || key === 'G')) {
      e.preventDefault();
      A.canvas.toggleGhost();
      return;
    }

    // 6. Delete / Backspace
    if (key === 'Delete' || key === 'Backspace') {
      const sel = A.store.getSelection();
      if (sel.length) {
        e.preventDefault();
        A.store.removeElements(sel);
      }
      return;
    }

    // 7. Escape: Deselect all
    if (key === 'Escape') {
      e.preventDefault();
      A.store.clearSelection();
      return;
    }

    // 8. Arrow Keys Nudge: 1cm (normal) or 10cm (with Shift)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      const sel = A.store.getSelection();
      if (!sel.length) return;

      e.preventDefault();
      const step = shift ? 10 : 1;
      let dx = 0, dy = 0;
      if (key === 'ArrowLeft') dx = -step;
      if (key === 'ArrowRight') dx = step;
      if (key === 'ArrowUp') dy = step; // +Y is up AFF
      if (key === 'ArrowDown') dy = -step;

      A.store.update((draft) => {
        for (const id of sel) {
          const el = draft.elements.find((item) => item.id === id);
          if (el) {
            el.x = Math.round((el.x + dx) * 10) / 10;
            el.y = Math.round((el.y + dy) * 10) / 10;
          }
        }
      }, { reason: 'nudge' });
    }
  }

  function init() {
    window.addEventListener('keydown', onKeyDown);
  }

  A.input = {
    init,
  };
})();
