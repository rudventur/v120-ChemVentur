# ChemVentur · Stage 3 · 3D game (standalone)

A 3D chemistry shooter. You fly a ship, shoot and collect CPK-coloured atoms, and bond them in 3D. Press **B** ("What did I build?") to identify the molecule with RDKit and PubChem, then swap in the real PubChem 3D conformer. The **c2c tone gun** fires 13 (chromatic) or 8 (major) musical dots from C4 to C5.

Plain vanilla JS with no build step, so it works on GitHub Pages. Namespace: `CHEMVENTUR.Stage3Game`. Open `index.html` (served over http/https, not `file://`). Add `?autostart=1` to skip the start screen.

## Controls
| Input | Action |
|---|---|
| W/S or ↑/↓ | thrust forward / back |
| A/D or ←/→ | strafe / turn |
| Mouse | aim (crosshair) · **left-click** fire · **right-drag** steer · wheel = cycle element |
| Space | fire current gun |
| 1 / 2 / 3 | gun: ATOM / c2c / BLASTER |
| C | toggle c2c mode: `c2c 13` (chromatic) ↔ `c2c 8` (major) |
| Z / X | previous / next element for the atom gun (H C N O F P S Cl Na Br) |
| B | What did I build? (identifies the molecule nearest the crosshair) |
| T | swap in the PubChem 3D conformer |
| M | molecule rain on/off · P / Esc = pause · H = help |
| K / Shift+K | first-discovery cinematics on/off / reset all discoveries |
| Touch | left half = move joystick, right half = steer/aim, bottom bar = fire / gun / c2c / B |

Free atoms you fly through go into your **Collected** tray. Atoms bond when they meet with enough energy and both still have free valence. The **target** in the top-left (e.g. "Hydrogen H2") scores when you build it and identify it.

## First discovery cinematic
The **first time** a new type of matter or energy appears, the camera eases into a close-up of it and game time slows to **0.2×** for about **2.5 s** (real time). A neon banner reads `FIRST DISCOVERY: <name>` and a low tone plays, then the camera and game speed ease back to normal.

What counts as a discovery:
- **New element** you fire: Carbon, Oxygen, …
- **New bond order** first formed: single, double, triple. This counts bonds you or your c2c energy made; random bonds between loose world atoms don't count.
- **New molecule** identified with B. It is keyed by PubChem CID (or canonical SMILES) and shows the PubChem name, e.g. `FIRST DISCOVERY: Ethanol`.
- **New c2c note effect**, the first time it actually does something: bond / resonance / dissonance / harmony.
- **Energy events:** first blaster rip, first scooped atom, first c2c 13 / c2c 8 series, each target completed.

Overlapping discoveries **queue** and play one after another (up to 6 waiting, extras just show a status line). Discoveries are saved in localStorage under `cv.s3g.discoveries.v1` and the on/off setting under `cv.s3g.cinematics.v1`. With cinematics off, discoveries are still recorded and shown as a status line only. You can also call `CHEMVENTUR.Stage3Game.Cinematic.reset()` / `.toggle()` from code.

## c2c tone gun
Each dot gets its own hue (one per pitch class, `hsl(pc·30°)`), its own size (shrinking up the scale) and its own Web Audio tone in equal temperament (A4 = 440 Hz, C4 = 261.63 Hz, C5 = 523.25 Hz). The dots fire one after another, 85 ms apart. There is no mic input.

| Note | Effect on an atom it hits |
|---|---|
| C4 (root) | **bond**: pulls the hit atom to its nearest neighbour and bonds them if valence allows |
| C5 (octave) | **resonance**: raises the bond order of the hit atom's weakest bond (1→2→3) |
| sharps (C#, D#, F#, G#, A#) | **dissonance**: breaks one bond on the hit atom |
| other naturals (D E F G A B) | **harmony**: a gentle push plus bonding energy |

## Files
```
index.html                 page + boot snippet
css/stage3-game.css        neon HUD
js/stage3-chem.js          shared chemistry: elements, PubChem, RDKit, cache (same file as the Stage 3 overlay)
js/s3g-core.js             config, elements/CPK, maths, molblock parser, C2C note series
js/s3g-audio.js            Web Audio (tones, blips)
js/s3g-world.js            pure simulation: atoms, bonds, projectiles, physics
js/s3g-game.js             three.js scene, input, HUD, guns, identify, rain, debug hook
js/s3g-cinematic.js        FIRST DISCOVERY cinematic (close-up, slow motion, banner, queue, persistence)
tests/s3g-headless.js      headless Chrome test (puppeteer-core)
screenshot-*.png
```
CDNs (pinned): three.js `0.169.0` (jsDelivr, unpkg fallback) and RDKit.js `2025.3.4-1.0.0` (unpkg). Lookups use the PubChem PUG-REST API, and results are cached in localStorage under `cv.stage3.v1:`.

## Attaching it to ChemVentur later
1. Copy `css/stage3-game.css` and `js/s3g-*.js` into the main repo. `js/stage3-chem.js` is shared with the Stage 3 overlay, so keep only one copy.
2. Load the scripts in this order: `stage3-chem.js`, `s3g-core.js`, `s3g-audio.js`, `s3g-world.js`, `s3g-game.js`, `s3g-cinematic.js` (optional; the game runs without it).
3. Mount the game into any sized container, e.g. a full-screen overlay div:
```js
const box = document.getElementById('stage3-game-overlay');      // position:fixed; inset:0
CHEMVENTUR.Stage3Game.boot(box, { autostart: true }).then(() => { /* ready */ });
CHEMVENTUR.Stage3Game.pause(); CHEMVENTUR.Stage3Game.resume();
CHEMVENTUR.Stage3Game.destroy();   // removes canvas, HUD and listeners
CHEMVENTUR.Stage3Game.identify();  // same as B
CHEMVENTUR.Stage3Game.fireC2C('chromatic' | 'major');
```
`CHEMVENTUR.Stage3Game.debug` (`state()`, `fireC2C()`, `identifyEthanolSkeleton()`, `swap()`, `sampleCanvas()`) is there for tests.

## Tests
```
npm i puppeteer-core            # dev only
python3 -m http.server 8877     # in this folder
node tests/s3g-headless.js http://127.0.0.1:8877/
```
The test checks:
- the game boots with no errors and three r169 loads
- WebGL draws (non-black pixels, draw calls > 0)
- c2c 13 gives exactly 13 projectiles with 13 distinct colours and sizes, and the oscillator frequencies match ET C4…C5
- c2c 8 gives exactly 8 projectiles (261.63 … 523.25)
- the C key toggles the label
- the atom gun and flight work
- C–C–O is identified as Ethanol (CID 702) and the 9-atom 3D conformer swap works
- the first-discovery cinematic (the core checks above run with it switched off via K):
  - Shift+K resets discoveries and K switches cinematics back on
  - a first C–C bond starts a cinematic: time scale 0.2, the camera closes in from about 37 to 6 units, and the banner reads `FIRST DISCOVERY: Single bond`
  - it ends after about 2.5 s with speed and camera back to normal, and the discovery is saved in localStorage
  - a second identical bond does not retrigger
  - overlapping discoveries (Carbon, Oxygen, Ethanol) queue and play one at a time, with the banner showing `FIRST DISCOVERY: Ethanol`
  - identifying Ethanol again does not retrigger

## Caveats (it's a beginning)
- No multiplayer (deliberately out of scope).
- Bonds are simple springs with 1-3 repulsion. Geometry is approximate, not real VSEPR. The PubChem conformer swap shows real geometry.
- Rain and identification need network access (PubChem, unpkg for RDKit). If RDKit is unavailable or can't parse the build, identification sends the molblock straight to PubChem. Without network, the rain falls back to random H/O atoms.
- Browsers only allow sound after a user gesture (the START button handles this).
- Tested in headless Chrome (SwiftShader). Mobile and touch were only sanity-built and are not tuned.
