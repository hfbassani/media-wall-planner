# Media Wall Planner & AI Render Studio 📐✨

> **Interactive 2D architectural elevation planner for custom media walls, cabinetry, and acoustic slat panels with ergonomic TV viewing datums and multimodal AI render studio.**

[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#architecture)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web%20%28HTML5%20Canvas%202D%29-orange.svg)](#architecture)

---

## 🌟 Highlights

* **📐 True-to-Scale 2D Elevation Canvas**: Draft architectural elevations with 10cm major / 5cm minor grids, floor baseline datum ($Y=0$ Above Finished Floor / AFF), magnetic alignment snapping, and live dimension callouts.
* **👁️ Ergonomic Seated Eye-Level & TV Center Datum**: Built-in ergonomic benchmark anchored at **105 cm AFF** (approx. 42" per CEDIA/THX standards) with comfort viewing zones ($\pm 10\text{ cm}$) and one-click automatic TV alignment.
* **🎨 Pure Canvas 2D Textures (No SVG, No External Assets)**: Programmatic rendering of vertical fluted timber slats, continuous cathedral wood grains, acoustic mesh fabrics, ultra-matte lacquers, pitch-black OLED screens, limewashed open niches, and animated linear fireplace flames.
* **💡 Architectural LED Lighting**: Real-time simulation of concealed 2700K–4000K LED halo backlighting and downward under-cabinet wash illumination.
* **🖼️ Real Wall Photo Background & 4-Corner Perspective Calibration**: Upload a smartphone photo of the physical wall taken from any angle. Use the interactive 4-corner calibration tool with 3× loupe magnifier and live perspective grid to rectify the photo into a true-to-scale, distortion-free background elevation.
* **👻 Ghost Mode (X-Ray View)**: Instantly make all furniture elements translucent (40% opacity with cyan dashed outlines) via the <kbd>G</kbd> key or toolbar toggle so existing wall electrical outlets, conduits, and light switches remain visible while arranging cabinetry.
* **✨ Multimodal AI Render & Prompt Studio**:
  * **🖼️ Vision Reference Mode (Gemini / Multimodal)**: Generates prompts optimized for pairing with exported elevation images. Suppresses CAD lines/labels and focuses on tactile materials, lighting physics, and interior atmosphere. Intelligently informs the AI when a real room photo background is present to preserve existing flooring, walls, and ambient lighting.
  * **⚡ Multi-Provider Generation**: Built-in live rendering support for Pollinations (Flux — free, no account needed), Google Gemini / Nano Banana, OpenAI GPT-Image, and Custom/Local OpenAI-compatible endpoints.
  * **🎚️ Side-by-Side & Split Comparison Slider**: Compare 2D architectural CAD drawings with 3D AI renders in real time.
* **💾 Zero-Install & Self-Contained**: The complete application compiles into a single, dependency-free `index.html` that runs by double-clicking in any modern browser without Node.js or npm.
* **📂 Full Persistence**: Export/import projects via `.arch2d.json` (including embedded calibrated wall photo references) and automatic browser `localStorage` recovery.

---

## 🚀 Quick Start

### Running Immediately (Zero Installation)
Simply open `index.html` in any modern web browser (Chrome, Edge, Safari, Firefox):
```bash
# Clone the repository
git clone https://github.com/hfbassani/media-wall-planner.git
cd media-wall-planner

# Open directly in your browser
open index.html   # On macOS
# or start a lightweight server:
python3 -m http.server 8080
```

---

## 📸 Real Wall Photo & Perspective Calibration

Design directly over your existing room:
1. **Upload**: In the Left Sidebar under **Wall Photo Background**, click `📷 Upload Wall Photo` and select any photo of your physical wall.
2. **4-Corner Calibration**: If the photo was taken at an angle, click `📐 Calibrate (4 Corners)`. Drag the four corner handles (TL, TR, BR, BL) to match the wall's actual physical boundary corners. A real-time 3× zoom magnifier loupe and perspective grid ensure sub-millimeter precision.
3. **Ghost Mode (<kbd>G</kbd>)**: Toggle Ghost mode to see through cabinets and slat panels, allowing precise alignment around physical wall sockets, vents, and light switches.
4. **Export Option**: Choose whether the photo background is included or excluded when exporting clean reference renders for AI generation.

---

## 🎯 Ergonomic TV Viewing Datum

Correct vertical TV placement is one of the most critical aspects of media wall design:
* **The 105 cm Benchmark**: In standard living room seating, eye level settles at approximately **105 cm AFF** (Above Finished Floor).
* **Ergonomic TV Axis**: The application renders an amber datum line across the wall and computes the real-time vertical delta between the screen's center and spectator eye level.
* **1-Click Alignment**: Selecting a TV unit provides a `🎯 Align TV Center to Eye Level` button in the Inspector, positioning the screen at the ideal ergonomic height.
* **Toggle Shortcut**: Press <kbd>E</kbd> or click the toolbar toggle at any time.

---

## 🤖 Gemini Multimodal AI Render Workflow

To generate a photorealistic 3D interior render from your 2D elevation drawing:
1. Open the **✨ AI Render Studio** in the top-right header.
2. Click **`🖼️ Clean Ref PNG`** to download an elevation reference image stripped of rulers, gridlines, and dimensions.
3. Click **`📋 Copy Vision Prompt`** to copy the structured prompt with tactile material specifications and CAD-suppression directives.
4. Open [Google Gemini](https://gemini.google.com), attach the clean PNG, paste the prompt, and generate.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Arrow Keys</kbd> | Nudge selected element(s) by 1 cm |
| <kbd>Shift</kbd> + <kbd>Arrow</kbd> | Nudge selected element(s) by 10 cm |
| <kbd>Ctrl/Cmd</kbd> + <kbd>Z</kbd> | Undo (up to 50 states) |
| <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo |
| <kbd>Ctrl/Cmd</kbd> + <kbd>D</kbd> | Duplicate selected element |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete selected element |
| <kbd>Escape</kbd> | Deselect all |
| <kbd>Shift</kbd> + Click | Multi-select elements |
| <kbd>A</kbd> | Toggle dimension callout overlay |
| <kbd>E</kbd> | Toggle seated eye level & TV center datum |
| <kbd>G</kbd> | Toggle Ghost mode (translucent elements over wall photo) |

---

## 🛠️ Architecture & Development

The repository is organized for clean parallel development without complex build chains or bundlers:

```
media-wall-planner/
├── index.html          # Self-contained deliverable bundle
├── build.sh            # Lightweight bundler assembling src/ into index.html
├── src/
│   ├── 00-namespace.js # Arch2D global namespace & utilities
│   ├── 01-bus.js       # Lightweight event bus
│   ├── 02-vocab.js     # Textures, moods, presets & prompt chips
│   ├── state.js        # Immutable state store with undo/redo stack
│   ├── textures.js     # Pure HTML5 Canvas 2D procedural shaders
│   ├── photo.js        # Wall photo ingestion, homography & storage
│   ├── photo-calibrate.js # 4-corner perspective calibration modal
│   ├── render.js       # Elevation renderer, rulers, annotations & TV datum
│   ├── canvas.js       # Viewport controller (pan, zoom, drag, resize, snap)
│   ├── prompt.js       # Multimodal vision & prose prompt generator
│   ├── providers.js    # AI providers (Pollinations, Gemini, OpenAI, Custom)
│   ├── studio.js       # AI Render Studio modal & comparison slider
│   ├── studio.css      # Studio styling & split comparison styles
│   ├── export.js       # Clean reference & CAD blueprint PNG exporter
│   ├── persistence.js  # JSON project save/load & localStorage auto-save
│   ├── templates.js    # Pre-built architectural layout templates
│   ├── input.js        # Keyboard shortcut handling
│   ├── ui.js           # Header, sidebars, and property inspectors
│   ├── ui.css          # Main application stylesheet
│   ├── tokens.css      # CSS design tokens & themes
│   └── main.js         # Application bootstrap & lifecycle
└── project.md          # Architectural specification & engineering notes
```

### Rebuilding `index.html`
When editing files in `src/`, run the build script:
```bash
./build.sh
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
