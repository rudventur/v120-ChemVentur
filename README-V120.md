# 🎃💚 CHEMVENTUR v120: Stage 3 (3D Molecules) Edition 🧬

**The dream since October... the dream since birth!**

v120 is the v118/v119 game unchanged, plus **Stage 3**: a 3D molecule viewer that opens over the game.
The game logic, physics and multiplayer are untouched. The only existing file that changed is `index.html` (3 tags and the version label).

## 🚀 Stage 3 3D game (standalone, new)
A first playable 3D Stage 3: fly a ship, shoot and bond CPK atoms, use the **c2c tone gun** (`c2c 13` chromatic / `c2c 8` major), and press **B** to identify what you built with RDKit and PubChem.
- Play: [`stage3-game/index.html`](stage3-game/index.html)
- Docs: [`stage3-game/README-STAGE3-GAME.md`](stage3-game/README-STAGE3-GAME.md)

Self-contained in `stage3-game/`, and not wired into the main game yet.

## 🆕 What's new in v120

### 🧬 Stage 3: 3D molecules
- **Real 3D conformers from PubChem**, by name, CID or SMILES. Rendered with **3Dmol.js** (stick / ball-and-stick / spheres, spin, reset).
- **Info panel:** name (PubChem Title), formula, molecular weight, XLogP, TPSA, InChIKey, SMILES, and a link to the CID on PubChem.
- **2D structure drawing and descriptors** from **RDKit.js**. It reuses the game's existing `CHEMVENTUR.RDKit` (`js/rdkit-v118.js`).
- **No 3D record on PubChem?** It falls back to an RDKit 2D layout, and the badge says "2D". This is common for salts, metals and very large molecules.
- **🧪 What did I build?** reads your bonded atoms from the game (`CHEMVENTUR.MolecularSystem.bonds`). RDKit gives it a canonical SMILES, PubChem gives it a name, and it is shown in 3D.
- **🚀 Spawn in game** sends the molecule you're viewing back into the 2D game as bonded atoms.
- **Quick picks:** caffeine, aspirin, glucose, dopamine, serotonin, benzene, ethanol, C60, NaCl.
- **Cached in localStorage** (`cv.stage3.v1:*`, 30 days), so repeat lookups need no network.
- **Lazy loading:** 3Dmol.js is only downloaded when Stage 3 first opens.
- **Standalone test page:** `stage3-test.html` (`?q=aspirin`, `?mock=1`).

Details: see [`README-STAGE3.md`](README-STAGE3.md).

## ➕ Add the Stage 3 button (one line)

The stylesheet and scripts are already in `index.html`. Only the button is missing:

```html
<button class="btn" id="btn-stage3" onclick="CHEMVENTUR.Stage3.toggle()">🧬 STAGE 3 (3D)</button>
```

**Where it fits best:** in `index.html`, inside `<div id="left-panel">`, there is a block marked `<!-- BIG FEATURE BUTTONS - ONE ROW! -->`.
It is a two-column grid holding `#btn-periodic-table` (⚛️ TABLE) and `#btn-pubchem` (🔬 PUBCHEM).
Paste the button right after the closing `</button>` of `#btn-pubchem`, still inside that grid `<div>`.
As a third button it wraps to a new row. To make it span the full width, add `style="grid-column:1 / -1;"`.

Alternative spot: the **🔍 STAGE SELECT** box (`#btn-stage-0` / `#btn-stage-1` / `#btn-stage-2`).
If you put it there, keep the id `btn-stage3`. Do **not** call it `btn-stage-3`, because `js/ui.js` only wires `btn-stage-0..2`.

On desktop and tablet widths the Stage 3 overlay opens to the right of `#left-panel`, so the button stays clickable and a second click closes it. On phone widths (drawer layout) the overlay is full-screen; close it with **✕** or **Esc**.

From code / the console: `CHEMVENTUR.Stage3.open('aspirin')`, `.close()`, `.toggle()`, `.whatDidIBuild()`.

## 🌐 Publish with GitHub Pages

1. Upload the **contents** of this folder to the root of the new repo (`index.html` must be at the top level).
   With "Add files via upload", drag the folders in as-is so `js/`, `css/`, `tests/` and `patches/` keep their structure.
2. Repo **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**. Pick **`main`** and **`/ (root)`**, then **Save**.
3. After a minute the game is at `https://rudventur.github.io/<repo-name>/`, and the Stage 3 test page at `.../stage3-test.html`.

## ⚠️ Things tied to the old repo / hosting (check after renaming)

| Where | What | Works in a new repo? |
|---|---|---|
| `manifest.webmanifest` | `"name": "RUDVENTUR ChemVentur-Multi-v118"` | Yes, but the installed-app name still says v118. Edit if you want. |
| `manifest.webmanifest` icons, `index.html` apple-touch-icon | Root-relative `/RudVentur.com/embed/...png` | Yes on `rudventur.github.io` (they currently return 200). They break on a custom domain or local server. |
| `index.html` | `https://rudventur.github.io/RudVentur.com/embed/rvView.js` | Yes (absolute URL). Its microphone rule matches paths starting with `/ChemVentur...` (any case), so keep "ChemVentur" at the start of the repo name for the mic gun/mode inside the RUDVENTUR layer. |
| `js/multiplayer-v117.js` | Firebase project `chemventurmulti117` | Same database as v118, so v118 and v120 players share rooms. Any domain restriction on the API key can't be checked from the code. |
| `js/ui.js` room links | Built from `location.origin + location.pathname` | Yes, adapts automatically. |
| RudVentur.com repo | Hub links (`embed/rvDesk.js`, `index universe`, `punk-script/universe.html`) point to `ChemVentur-Multi-v118` | They won't show v120 until updated there. |

Still saying v119 (left as-is): `js/left-panel-sync.js` header comment, the `js/main.js` comment "(v119)", `README-V119.md`, and the edition subtitle "Left Panel Taskbar Edition!" in `index.html`.
`README.md` still describes v116.

## 🔭 Next steps

1. **Real stage switch:** `patches/main-stage3.patch` (not applied) makes SHIFT+scroll past Stage 2 open Stage 3. The game stays on Stage 2 underneath, because `changeStage()` in `js/main.js` limits stages to 0–2. Apply it with `git apply patches/main-stage3.patch`.
2. **Multiplayer sync:** `js/multiplayer-v117.js` doesn't sync atoms or molecules. A first step could share the current Stage 3 CID per player, using the `players/{id}/settings` pattern from `js/left-panel-sync.js`.
3. **Known v118 bugs in `js/pubchem-api.js`** (Stage 3 avoids them in its own code; the old file is untouched):
   - `parseCompoundData()` stores properties by label only. The last one wins, so SMILES becomes the stereo-less "Connectivity" version and the name becomes the "Traditional" IUPAC name instead of e.g. "Aspirin". Switch to the `/property/Title,MolecularFormula,...` endpoint.
   - `getElementSymbol()` only knows H–Ca. Anything heavier shows as `'X'`.
   - `searchPubChemLive()` builds `onclick="...spawnFromAPI('${query}')"` from user input. That breaks on quotes and is an injection risk.
   - `spawnFromAPI()` falls back to a blob without trying `CHEMVENTUR.RDKit.spawnFromSmiles()`.
   - PubChem 2D coordinates (about 1 unit per bond) and RDKit's (about 1.5) both use `SCALE = 30`, so RDKit-spawned molecules come out about 1.5× larger.
   - The live API is only tried when the 45-compound local table has no match.
4. **Side quests from `README-V119.md`:** duplicate method definitions in `js/guns.js` (`fireGravityOrb`, `fireAntiGun`) and `js/enhancements.js` (`init` ×4, `update` ×2).

## 📝 Version history
- **v120** (Oct 2026): Stage 3 3D molecules (PubChem 3D + RDKit.js + 3Dmol.js), What did I build?, Spawn in game.
- **v119** (Sep 2026): Left Panel taskbar, room code panel, phone controls. See `README-V119.md`.
- **v118**: AI Players & Chat Edition. **v117 Multi**: multiplayer + touch + microphone.
