# 🧬 CHEMVENTUR Stage 3: 3D Molecules

An add-on for **ChemVentur-Multi-v118** (v119 UI). It adds only new files and changes none of the existing ones.
It opens a full-screen overlay that shows real **3D conformers from PubChem**, rendered with **3Dmol.js**.
**RDKit.js** provides 2D depictions, descriptors and a fallback when PubChem has no 3D record.
The **"What did I build?"** button identifies the molecule you bonded together in the game.

## Files

| Path | Purpose |
|---|---|
| `js/stage3-chem.js` | `CHEMVENTUR.Stage3Chem`: PubChem client (property endpoint, 3D/2D SDF), localStorage cache, full 118-element table, RDKit fallback, game→molblock builder |
| `js/stage3-viewer.js` | `CHEMVENTUR.Stage3`: the panel UI and the 3Dmol.js viewer (loaded lazily); public `open/close/toggle` |
| `css/stage3.css` | Panel styling in the game's neon-green style (uses `css/main.css` variables when present, has fallbacks standalone) |
| `stage3-test.html` | Standalone test page (no game needed), e.g. `stage3-test.html?q=aspirin` or `?mock=1` |
| `tests/stage3-node-test.js` | Dev only: Node checks (element table, builder, RDKit, live PubChem) |
| `tests/stage3-headless.js` | Dev only: headless-Chrome end-to-end check plus screenshot |

## Install (3 steps)

> **In v120, steps 1–2 are already done.** Only add the button (step 3); see `README-V120.md`.

1. Copy `js/stage3-chem.js` and `js/stage3-viewer.js` into the repo's `js/` folder, and `css/stage3.css` into `css/`.
   Optionally copy `stage3-test.html` to the repo root.
2. In `index.html`, add the stylesheet after the other `<link>` tags in `<head>`:
   ```html
   <link rel="stylesheet" href="css/stage3.css">
   ```
   Then add the two scripts after `<script src="js/pubchem-api.js"></script>`, at the very end of `<body>`:
   ```html
   <script src="js/stage3-chem.js"></script>
   <script src="js/stage3-viewer.js"></script>
   ```
3. Add a button anywhere in the left panel:
   ```html
   <button class="btn" id="btn-stage3" onclick="CHEMVENTUR.Stage3.toggle()">🧬 STAGE 3 (3D)</button>
   ```
   The onclick is just `CHEMVENTUR.Stage3.toggle()`.

You don't need a build step or a backend. It works on GitHub Pages.

## API

```js
CHEMVENTUR.Stage3.open()              // open (loads caffeine the first time)
CHEMVENTUR.Stage3.open('aspirin')     // open + load by name / CID / SMILES (auto-detected)
CHEMVENTUR.Stage3.close()
CHEMVENTUR.Stage3.toggle()
CHEMVENTUR.Stage3.load('CCO', 'smiles')   // mode: 'auto' | 'name' | 'cid' | 'smiles'
CHEMVENTUR.Stage3.whatDidIBuild()     // identify the largest bonded fragment in the game
CHEMVENTUR.Stage3.setStyle('stick' | 'ballstick' | 'sphere'); CHEMVENTUR.Stage3.setSpin(true); CHEMVENTUR.Stage3.reset()
CHEMVENTUR.Stage3Chem.Cache.clear()   // wipe the localStorage cache
```

## How it works

- **Lookup:** name, CID or SMILES is turned into a CID (`/compound/name|smiles/.../cids/JSON`). Then:
  - **Properties** come from `/compound/cid/{cid}/property/Title,MolecularFormula,MolecularWeight,SMILES,ConnectivitySMILES,InChIKey,XLogP,TPSA,IUPACName/JSON`.
  - **The 3D conformer** comes from `/compound/cid/{cid}/record/SDF?record_type=3d`.
- **When PubChem has no 3D record** (salts, metals, very large or flexible molecules), RDKit.js lays the molecule out in 2D from its SMILES. The badge then says "2D". If RDKit isn't available, the PubChem 2D record is used instead.
- **RDKit:** inside the game, Stage 3 reuses `CHEMVENTUR.RDKit` (from `rdkit-v118.js`). On the standalone page it lazy-loads the same build (`@rdkit/rdkit@2025.3.4-1.0.0` from unpkg).
- **3Dmol.js 2.5.2** is loaded from jsDelivr (with unpkg as a fallback) only when Stage 3 first opens.
- **What did I build?:**
  1. Reads `CHEMVENTUR.MolecularSystem.bonds`, skipping special particles, holes and blobs.
  2. Picks the largest bonded fragment and writes a V2000 molblock.
  3. RDKit fills in the implicit hydrogens and produces canonical SMILES; PubChem turns that into a CID, which is then shown in 3D.
  4. If RDKit rejects the build, the molblock is POSTed to PubChem (`/compound/sdf/cids/JSON`) instead.
- **Fixes compared with `pubchem-api.js`** (only in the new code):
  - It uses the property endpoint, so the name is PubChem's Title and SMILES keeps its stereo.
  - The UI is built with DOM/`textContent` and `addEventListener`, with no inline handlers built from user input.
  - All 118 element symbols are covered.
  - Results are cached in localStorage (prefix `cv.stage3.v1:`, 30-day expiry, oldest entries evicted when storage is full).
  - Requests are spaced ≥220 ms apart, with a 12 s timeout and one retry.

## Testing

```bash
python3 -m http.server 8765            # in this folder
# open http://localhost:8765/stage3-test.html?q=caffeine

npm i @rdkit/rdkit@2025.3.4-1.0.0 puppeteer-core     # dev only
node tests/stage3-node-test.js
node tests/stage3-headless.js http://localhost:8765/stage3-test.html screenshot.png
```

## Caveats

- **Network needed:** PubChem and the CDNs must be reachable; without them you get clear error messages instead of a crash. The 3D viewer needs WebGL.
- **Stage 3 is an overlay.** It doesn't change `Game.stage`, because `changeStage()` in `main.js` still stops at stage 2. Making SHIFT+scroll reach Stage 3 would mean editing `main.js`.
- **Auto-detect can guess wrong.** Strings like `CO` or `CCO` are treated as SMILES (`CO` gives methanol, not carbon monoxide). Use the Name/CID/SMILES selector to force a mode.
- **What did I build?** ignores ionic charges (protons vs. electrons). Ionic and metallic bonds are written as single bonds. Only the largest fragment is used.
- **Spawn in game** uses the existing `CHEMVENTUR.RDKit.spawnFromSmiles()` (2D). Molecules are not synced in multiplayer.
- **Download size:** the RDKit WASM file is about 6.9 MB and 3Dmol.js about 0.5 MB.
