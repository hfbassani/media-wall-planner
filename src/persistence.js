/* Arch2D — WS1: JSON save/load, localStorage autosave and API-key storage (project.md §5). */
(function () {
  'use strict';
  const A = window.Arch2D;
  const AUTOSAVE_KEY = 'arch2d_autosave';
  const SECRET_PREFIX = 'arch2d_secret_';

  function safeStorage() {
    try {
      const k = '__arch2d_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return localStorage;
    } catch (e) {
      return null; // private mode / blocked storage: app still works, just without autosave
    }
  }
  const storage = safeStorage();

  function fileName() {
    const name = (A.store.getState().name || 'arch2d')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'arch2d';
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
    return `${name}-${ts}.arch2d.json`;
  }

  const persistence = {
    available: !!storage,

    /** Saves the project; the wall photo (if any) is embedded so the file is self-contained. */
    saveToFile() {
      const state = A.store.getState();
      let json = A.store.serialize();
      const dataUrl = state.wallPhoto && A.photo ? A.photo.dataUrl(state.wallPhoto.id) : null;
      if (dataUrl) {
        const obj = JSON.parse(json);
        obj.wallPhoto.dataUrl = dataUrl;
        json = JSON.stringify(obj, null, 2);
      }
      const blob = new Blob([json], { type: 'application/json' });
      A.util.downloadBlob(blob, fileName());
    },

    /** Opens a file picker and loads the chosen project. Resolves {ok, errors, cancelled}. */
    openFile(inputEl) {
      return new Promise((resolve) => {
        const input = inputEl || Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
        const onChange = () => {
          input.removeEventListener('change', onChange);
          const file = input.files && input.files[0];
          input.value = '';
          if (!file) return resolve({ ok: false, cancelled: true, errors: [] });
          if (file.size > 5 * 1024 * 1024) return resolve({ ok: false, errors: ['File is larger than 5 MB — not an Arch2D project.'] });
          const reader = new FileReader();
          reader.onload = () => {
            let obj;
            try {
              obj = JSON.parse(String(reader.result));
            } catch (e) {
              return resolve({ ok: false, errors: ['File is not valid JSON.'] });
            }
            // Move an embedded photo into the photo library; State keeps only the id.
            if (obj && obj.wallPhoto && obj.wallPhoto.dataUrl && A.photo) {
              const id = A.photo.register(obj.wallPhoto.dataUrl);
              obj.wallPhoto = id ? Object.assign({}, obj.wallPhoto, { id, dataUrl: undefined }) : null;
            }
            resolve(A.store.load(obj, { source: 'file' }));
          };
          reader.onerror = () => resolve({ ok: false, errors: ['Could not read the file.'] });
          reader.readAsText(file);
        };
        input.addEventListener('change', onChange);
        input.click();
      });
    },

    hasAutosave() {
      return !!(storage && storage.getItem(AUTOSAVE_KEY));
    },
    readAutosave() {
      if (!storage) return null;
      try {
        const res = A.store.validate(JSON.parse(storage.getItem(AUTOSAVE_KEY)));
        return res.ok ? res.value : null;
      } catch (e) {
        return null;
      }
    },
    clearAutosave() {
      if (storage) storage.removeItem(AUTOSAVE_KEY);
    },
    writeAutosave() {
      if (!storage) return false;
      try {
        storage.setItem(AUTOSAVE_KEY, JSON.stringify(A.store.getState()));
        if (A.photo) A.photo.syncStorage(A.store.getState());
        A.bus.emit('autosave:written', { at: Date.now() });
        return true;
      } catch (e) {
        console.warn('[Arch2D] autosave failed', e);
        return false;
      }
    },
    startAutosave() {
      const write = A.util.debounce(() => persistence.writeAutosave(), 400);
      A.bus.on('state:changed', write);
    },

    /* API keys — localStorage is NOT a secure vault (project.md §2 Security Note). */
    getSecret(k) {
      return storage ? storage.getItem(SECRET_PREFIX + k) || '' : '';
    },
    setSecret(k, v) {
      if (!storage) return;
      if (v) storage.setItem(SECRET_PREFIX + k, v);
      else storage.removeItem(SECRET_PREFIX + k);
    },
    getJSON(k, fallback) {
      if (!storage) return fallback;
      try {
        const v = storage.getItem('arch2d_' + k);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    setJSON(k, v) {
      if (storage) storage.setItem('arch2d_' + k, JSON.stringify(v));
    },
  };

  A.persistence = persistence;
})();
