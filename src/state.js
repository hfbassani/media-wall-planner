/* Arch2D — WS1: state store, selection and undo/redo history (project.md §3.5, §5). */
(function () {
  'use strict';
  const A = window.Arch2D;
  const { clamp, clone, uid } = A.util;
  const V = A.vocab;

  const SCHEMA_VERSION = 1;
  const LIMIT = V.config.historyLimit;

  let state = emptyState();
  let selection = [];
  const undoStack = []; // serialized snapshots (strings)
  const redoStack = [];
  let txnSnapshot = null; // snapshot taken at begin()

  function emptyState() {
    return { schemaVersion: SCHEMA_VERSION, name: 'Untitled media wall', wallWidth: 400, wallHeight: 280, mood: 'japandi', wallPhoto: null, elements: [] };
  }

  /** wallPhoto is an optional reference into A.photo; image bytes never live in State. */
  function normalizeWallPhoto(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
    return {
      id: raw.id.slice(0, 64),
      visible: raw.visible !== false,
      showOnExport: raw.showOnExport !== false,
      bounds: raw.bounds && typeof raw.bounds === 'object' ? {
        uMin: Number(raw.bounds.uMin) || 0,
        uMax: Number(raw.bounds.uMax) || 1,
        vMin: Number(raw.bounds.vMin) || 0,
        vMax: Number(raw.bounds.vMax) || 1,
        xCm: Number(raw.bounds.xCm) || 0,
        yCm: Number(raw.bounds.yCm) || 0,
        wCm: Number(raw.bounds.wCm) || 400,
        hCm: Number(raw.bounds.hCm) || 280,
      } : null,
    };
  }

  /* ---------- validation / normalization ---------- */
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

  function normalizeElement(raw, i, errors) {
    if (!raw || typeof raw !== 'object') {
      errors.push(`elements[${i}] is not an object`);
      return null;
    }
    const type = V.presets[raw.type] ? raw.type : 'custom';
    const preset = V.presets[type];
    const texture = V.textures[raw.texture] ? raw.texture : preset.texture;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      type,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.slice(0, 80) : preset.label,
      x: num(raw.x, 0),
      y: num(raw.y, 0),
      width: Math.max(V.config.minSizeCm, num(raw.width, preset.width)),
      height: Math.max(V.config.minSizeCm, num(raw.height, preset.height)),
      texture,
      color: isHex(raw.color) ? raw.color.toLowerCase() : V.textures[texture].defaultColor,
      opacity: clamp(num(raw.opacity, 1), 0.05, 1),
      ledHalo: !!raw.ledHalo,
      ledTemp: raw.ledTemp === 4000 ? 4000 : 3000,
      ledUnderglow: !!raw.ledUnderglow,
      zIndex: i,
    };
  }

  function validate(obj) {
    const errors = [];
    if (!obj || typeof obj !== 'object') return { ok: false, errors: ['Project file is not a JSON object.'], value: null };
    if (obj.schemaVersion !== SCHEMA_VERSION) {
      return { ok: false, errors: [`Unsupported schemaVersion: ${obj.schemaVersion} (expected ${SCHEMA_VERSION}).`], value: null };
    }
    if (!Array.isArray(obj.elements)) return { ok: false, errors: ['"elements" must be an array.'], value: null };
    const value = {
      schemaVersion: SCHEMA_VERSION,
      name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.slice(0, 120) : 'Untitled media wall',
      wallWidth: clamp(num(obj.wallWidth, 400), 50, 5000),
      wallHeight: clamp(num(obj.wallHeight, 280), 50, 2000),
      mood: V.moods[obj.mood] ? obj.mood : 'japandi',
      wallPhoto: normalizeWallPhoto(obj.wallPhoto),
      elements: [],
    };
    const sorted = obj.elements
      .map((e, i) => ({ e, i }))
      .sort((a, b) => num(a.e && a.e.zIndex, a.i) - num(b.e && b.e.zIndex, b.i) || a.i - b.i);
    const seen = new Set();
    sorted.forEach(({ e }, i) => {
      const el = normalizeElement(e, i, errors);
      if (!el) return;
      if (seen.has(el.id)) el.id = uid();
      seen.add(el.id);
      value.elements.push(el);
    });
    value.elements.forEach((el, i) => (el.zIndex = i));
    return { ok: true, errors, value };
  }

  /* ---------- core ---------- */
  const snap = () => JSON.stringify(state);

  function emitState(reason) {
    A.bus.emit('state:changed', { state, reason });
  }
  function emitHistory() {
    A.bus.emit('history:changed', { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
  }
  function pushUndo(snapshot) {
    undoStack.push(snapshot);
    if (undoStack.length > LIMIT) undoStack.shift();
    redoStack.length = 0;
    emitHistory();
  }
  function pruneSelection() {
    const ids = new Set(state.elements.map((e) => e.id));
    const next = selection.filter((id) => ids.has(id));
    if (next.length !== selection.length) {
      selection = next;
      A.bus.emit('selection:changed', { ids: selection.slice() });
    }
  }

  function update(fn, opts = {}) {
    const record = opts.record !== false && !txnSnapshot;
    const before = record ? snap() : null;
    const draft = clone(state);
    fn(draft);
    draft.elements.forEach((el, i) => (el.zIndex = i));
    state = draft;
    if (record && before !== snap()) pushUndo(before);
    pruneSelection();
    emitState(opts.reason || 'update');
  }

  const store = {
    SCHEMA_VERSION,
    getState: () => state,
    validate,
    update,

    begin() {
      if (!txnSnapshot) txnSnapshot = snap();
    },
    commit() {
      if (!txnSnapshot) return;
      const before = txnSnapshot;
      txnSnapshot = null;
      if (before !== snap()) pushUndo(before);
    },
    cancel() {
      if (!txnSnapshot) return;
      state = JSON.parse(txnSnapshot);
      txnSnapshot = null;
      pruneSelection();
      emitState('cancel');
    },
    inTransaction: () => !!txnSnapshot,

    /* selection */
    getSelection: () => selection.slice(),
    getSelectedElements: () => state.elements.filter((e) => selection.includes(e.id)),
    select(ids, opts = {}) {
      ids = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      let next;
      if (opts.toggle) {
        next = selection.slice();
        for (const id of ids) {
          const i = next.indexOf(id);
          if (i >= 0) next.splice(i, 1);
          else next.push(id);
        }
      } else if (opts.additive) {
        next = [...new Set([...selection, ...ids])];
      } else next = ids.slice();
      const changed = next.length !== selection.length || next.some((id, i) => id !== selection[i]);
      selection = next;
      if (changed) A.bus.emit('selection:changed', { ids: selection.slice() });
    },
    selectAll() {
      store.select(state.elements.map((e) => e.id));
    },
    clearSelection() {
      store.select([]);
    },

    /* element helpers */
    addElement(partial = {}) {
      const type = V.presets[partial.type] ? partial.type : 'custom';
      const p = V.presets[type];
      const el = normalizeElement(
        Object.assign(
          {
            type,
            label: p.label,
            width: p.width,
            height: p.height,
            texture: p.texture,
            color: p.color,
            x: Math.round((state.wallWidth - (partial.width || p.width)) / 2),
            y: p.y,
            ledHalo: !!p.ledHalo,
            ledUnderglow: !!p.ledUnderglow,
          },
          partial,
          { id: uid() }
        ),
        state.elements.length,
        []
      );
      update((d) => d.elements.push(el), { reason: 'add' });
      store.select([el.id]);
      return el.id;
    },
    addPreset(key) {
      return store.addElement({ type: key });
    },
    removeElements(ids) {
      if (!ids || !ids.length) return;
      const set = new Set(ids);
      update((d) => (d.elements = d.elements.filter((e) => !set.has(e.id))), { reason: 'remove' });
    },
    duplicateElements(ids) {
      const set = new Set(ids || []);
      if (!set.size) return [];
      const newIds = [];
      update(
        (d) => {
          const copies = d.elements
            .filter((e) => set.has(e.id))
            .map((e) => {
              const c = Object.assign(clone(e), { id: uid(), x: e.x + 10, y: e.y + 10 });
              newIds.push(c.id);
              return c;
            });
          d.elements.push(...copies);
        },
        { reason: 'duplicate' }
      );
      store.select(newIds);
      return newIds;
    },
    bringForward(ids) {
      const set = new Set(ids || []);
      update(
        (d) => {
          const a = d.elements;
          for (let i = a.length - 2; i >= 0; i--) {
            if (set.has(a[i].id) && !set.has(a[i + 1].id)) [a[i], a[i + 1]] = [a[i + 1], a[i]];
          }
        },
        { reason: 'layer' }
      );
    },
    sendBackward(ids) {
      const set = new Set(ids || []);
      update(
        (d) => {
          const a = d.elements;
          for (let i = 1; i < a.length; i++) {
            if (set.has(a[i].id) && !set.has(a[i - 1].id)) [a[i], a[i - 1]] = [a[i - 1], a[i]];
          }
        },
        { reason: 'layer' }
      );
    },
    setWall({ wallWidth, wallHeight }) {
      update(
        (d) => {
          if (wallWidth !== undefined) d.wallWidth = clamp(Number(wallWidth) || d.wallWidth, 50, 5000);
          if (wallHeight !== undefined) d.wallHeight = clamp(Number(wallHeight) || d.wallHeight, 50, 2000);
        },
        { reason: 'wall' }
      );
    },
    setMood(id) {
      if (!V.moods[id]) return;
      update((d) => (d.mood = id), { reason: 'mood' });
    },
    /** Replace (or clear with null) the wall photo reference. */
    setWallPhoto(ref) {
      update((d) => (d.wallPhoto = normalizeWallPhoto(ref)), { reason: 'photo' });
    },
    /** Toggle photo flags, e.g. { visible: false }. No-op without a photo. */
    patchWallPhoto(partial) {
      if (!state.wallPhoto) return;
      update((d) => (d.wallPhoto = normalizeWallPhoto(Object.assign({}, d.wallPhoto, partial))), { reason: 'photo' });
    },

    /* history */
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undo() {
      if (txnSnapshot) store.commit();
      if (!undoStack.length) return false;
      redoStack.push(snap());
      state = JSON.parse(undoStack.pop());
      pruneSelection();
      emitHistory();
      emitState('undo');
      return true;
    },
    redo() {
      if (!redoStack.length) return false;
      undoStack.push(snap());
      state = JSON.parse(redoStack.pop());
      pruneSelection();
      emitHistory();
      emitState('redo');
      return true;
    },
    clearHistory() {
      undoStack.length = 0;
      redoStack.length = 0;
      emitHistory();
    },

    /* persistence primitives */
    serialize: () => JSON.stringify(state, null, 2),
    load(input, opts = {}) {
      let obj = input;
      if (typeof input === 'string') {
        try {
          obj = JSON.parse(input);
        } catch (e) {
          return { ok: false, errors: ['File is not valid JSON.'] };
        }
      }
      const res = validate(obj);
      if (!res.ok) return res;
      store.reset(res.value);
      A.bus.emit('project:loaded', { state, source: opts.source || 'load' });
      return { ok: true, errors: res.errors };
    },
    reset(next) {
      state = clone(next);
      txnSnapshot = null;
      store.clearHistory();
      selection = [];
      A.bus.emit('selection:changed', { ids: [] });
      emitState('reset');
    },
  };

  A.store = store;
})();
