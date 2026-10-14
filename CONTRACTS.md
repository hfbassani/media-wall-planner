# Arch2D — Module Contracts (frozen in Phase 0)

Every `src/*.js` file is a classic `'use strict'` IIFE that registers itself on `window.Arch2D` (written `A` below).
Modules talk to each other **only** through the APIs listed here and through bus events. They never touch another module's DOM nodes or private variables.
Never write the literal closing script tag sequence inside any JS file, because `build.sh` inlines the files.

## Load order (dev.html and build.sh use the same order)
`00-namespace` → `01-bus` → `02-vocab` → `state` → `persistence` → `photo` → `photo-calibrate` → `textures` → `render` → `export` → `canvas` → `input` → `templates` → `prompt` → `providers` → `studio` → `ui` → `main`

## Units & coordinates
- Model units are **centimetres**. The origin is the bottom-left of the wall at floor level. +Y points up (AFF = Above Finished Floor).
- Screen units are CSS pixels, and the canvas backing store is scaled by `devicePixelRatio` internally.
- `A.render.makeTransform(pxPerCm, originX, originY)` → `{ x(cm)→px, y(cm)→px, cmX(px)→cm, cmY(px)→cm, rect(el)→{x,y,w,h} }`. `originX/originY` is the pixel position of the wall's bottom-left corner.

## Data
```js
State = { schemaVersion: 1, name: string, wallWidth: cm, wallHeight: cm, mood: MoodId, elements: Element[] }
Element = {
  id: string, type: PresetKey | 'custom', label: string,
  x, y, width, height,            // cm; x from the left wall, y = bottom edge AFF
  texture: TextureId, color: '#rrggbb', opacity: 0..1,
  ledHalo: bool, ledTemp: 3000 | 4000, ledUnderglow: bool,
  zIndex: int                     // == array index (the store normalizes it)
}
```
`elements` is ordered back → front. Selection, view/zoom and annotation visibility are **not** part of State and not part of undo history.

## A.util (00-namespace)
`uid()`, `clamp(v,a,b)`, `round(v, step=1)`, `clone(o)`, `h(tag, attrs, ...children)` (DOM builder), `downloadBlob(blob, name)`, `downloadDataUrl(url, name)`, `debounce(fn, ms)`, `hashString(s)→uint32`, `rng(seed)→()=>[0,1)`, `hexToRgb(hex)`, `rgba(hex, a)`, `shade(hex, amt)`, `luminance(hex)`, `isTypingTarget(el)`

## A.bus (01-bus)
`on(evt, fn)→unsubscribe`, `off(evt, fn)`, `emit(evt, payload)`
| Event | Payload | Emitted by |
| --- | --- | --- |
| `state:changed` | `{ state, reason }` | state |
| `selection:changed` | `{ ids }` | state |
| `history:changed` | `{ canUndo, canRedo }` | state |
| `view:changed` | `{ pxPerCm, zoom }` | canvas |
| `annotations:toggled` | `{ visible }` | canvas |
| `project:loaded` | `{ state, source }` | state (`load`) |
| `app:ready` | — | main |

## A.vocab (02-vocab) — data only
`textures{ id: {label, defaultColor, phrase} }`, `moods{ id: {label, short, wall, wallPattern, wallMaterial, phrase, lighting, materials{textureId: phrase}, accent} }`, `presets{ key: {label, width, height, texture, color, y, noun, ledHalo?, ledUnderglow?} }`, `chips{ category: string[] }`, `ledTemps{3000,4000}`, `config{ historyLimit, snapPx, midjourneyVersion, maxPromptUrlChars }`

## A.store (state)
```js
getState()                     // current State (read-only: copy before mutating)
update(fn, { record = true, reason }) // fn(draft) mutates a clone; emits state:changed
begin()                        // start a transaction (e.g. on pointerdown / input focus)
commit()                       // push ONE history entry if state changed since begin()
cancel()                       // revert to the begin() snapshot
getSelection() / select(ids, { additive, toggle }) / selectAll() / clearSelection()
addElement(partial) → id       // fills defaults, appends at front, selects it
addPreset(key) → id            // centred horizontally, preset y
removeElements(ids), duplicateElements(ids) → newIds (+10cm offset)
bringForward(ids), sendBackward(ids)
setWall({ wallWidth, wallHeight }), setMood(id)
undo(), redo(), canUndo(), canRedo(), clearHistory()
serialize() → JSON string, load(objOrString, { source }) → { ok, errors }
validate(obj) → { ok, errors, value }   // normalizes/fills defaults
reset(state)                   // replace state, clear history and selection
```

## A.persistence
`saveToFile()`, `openFile()→Promise<{ok,errors}>`, `hasAutosave()`, `readAutosave()→State|null`, `clearAutosave()`, `startAutosave()`, plus API keys: `getSecret(k)`, `setSecret(k,v)`

## A.textures
`draw(ctx, el, rect{x,y,w,h}, { pxPerCm, time, mood })` — pure Canvas 2D, deterministic (seeded by `el.id`), clipped to `rect`.
`animated(el)→bool` (fireplace), `list()→[{id,label}]`

## A.render
`makeTransform(pxPerCm, originX, originY)`, `handleRects(rect, size)→[{key:'nw'|'n'|…, x,y,w,h}]`,
`drawScene(ctx, state, opts)` with `opts = { pxPerCm, originX, originY, width, height, time, grid=true, annotations=false, labels=true, selection=[], hud=true, guides=[], marquee=null, theme='screen'|'export' }`,
`needsAnimation(state)→bool`

## A.exporter
`renderCanvas({ widthPx=2400, annotations=true, labels=true, grid=false })→HTMLCanvasElement`,
`downloadPNG(opts)`, `referenceDataUrl({ widthPx=1536 })→string` (no annotations, used as AI reference),
`comparisonSheet(renderImg: HTMLImageElement)→Promise<HTMLCanvasElement>`

## A.canvas
`init(hostEl)`, `requestRedraw()`, `fit()`, `zoomBy(f, cx, cy)`, `getView()→{pxPerCm, zoom, originX, originY}`, `setAnnotations(bool)`, `toggleAnnotations()`, `annotationsVisible()`, `setSnapping(bool)`

## A.input
`init()` — global keyboard shortcuts (project.md §3.4)

## A.templates
`list()→[{id, label, description, state}]`, `get(id)`

## A.prompt
`build(state, { format:'prose'|'midjourney'|'sd', modifiers: string[] })→{ prompt, negative, aspectRatio:'W:H', nearestRatio:'16:9', ratio:number }`,
`describeElements(state)→string[]`, `chips()`, `standardRatios`, `nearestStandardRatio(r)`, `stripParams(prompt)`

## A.providers
`list()→[{id,label,needsKey,keyOptional,models,defaultModel,keyUrl,notes}]`,
`getConfig(id)→{apiKey, model, baseUrl, size, useReference}`, `setConfig(id, partial)`, `getActive()`, `setActive(id)`,
`generate(id, { prompt, negative, aspectRatio, ratio, referenceDataUrl, signal })→Promise<Result>`
`Result = { src, kind:'dataurl'|'objecturl'|'url', canvasSafe: bool, provider, model, prompt, createdAt }`
Errors are thrown as `A.providers.ProviderError { code:'auth'|'cors'|'rate'|'blocked'|'server'|'network'|'bad_response'|'aborted'|'config', message, hint }`

## A.studio
`init()`, `open()`, `close()`

## A.ui
`init()`, `toast(msg, type='info'|'success'|'error')`, `confirm({ title, message, okLabel, cancelLabel })→Promise<bool>`
