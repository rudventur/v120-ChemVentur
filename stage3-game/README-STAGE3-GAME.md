# ChemVentur · Stage 3 · 3D game (standalone)

A 3D chemistry shooter. You fly a ship, shoot and collect CPK-coloured atoms, and bond them in 3D. Press **B** ("What did I build?") to identify the molecule with RDKit and PubChem, then swap in the real PubChem 3D conformer. The **c2c tone gun** fires 13 (chromatic) or 8 (major) musical dots from C4 to C5.

Plain vanilla JS with no build step, so it works on GitHub Pages. Namespace: `CHEMVENTUR.Stage3Game`. Open `index.html` (served over http/https, not `file://`). Add `?autostart=1` to skip the start screen.

## Controls
| Input | Action |
|---|---|
| W/S or ↑/↓ | thrust forward / back |
| A/D or ←/→ | strafe / turn |
| Mouse | aim (crosshair) · **left-click** fire · **right-drag** steer · **right-click** = pellets per shot (guns 1 and 2) · wheel = power (guns 1 and 2) or element (other guns) |
| Space | fire current gun |
| 1 | **shotgun1proton**: red proton mist |
| 2 | **SHOTGUN2neutron**: blue neutron pellets that fall slightly |
| 3 | **Electrogun**: chain lightning that turns atoms into ions |
| 4 | c2c tone gun |
| 5 | *free* (kept for the planned shotgun5) |
| 6 / 7 | ATOM gun / SHOT (atom-pellet shotgun) |
| 8 / 9 / 0 | ANTI / GRAV orb / TIME bubble |
| + / − (or wheel, or the 💪 button) | power (range) of guns 1 and 2 |
| G (or ▦ Grid button) | Grid panel: charge display · gravity · temperature · pressure |
| C | toggle c2c mode: `c2c 13` (chromatic) ↔ `c2c 8` (major) |
| Z / X | previous / next element for the atom gun (H C N O F P S Cl Na Br) |
| B | What did I build? (identifies the molecule nearest the crosshair) |
| T | swap in the PubChem 3D conformer |
| M (or the M RAIN gun button) | molecule rain on/off · P / Esc = pause · H = help (lists the same key map) |
| K / Shift+K | FIRST DISCOVERY banners on/off / reset all discoveries |
| J (or 🤖 Bots button) | deploy all 10 bots / remove them all · `?bots=1` deploys them at load |
| Touch | left half = move joystick, right half = steer/aim, bottom bar = fire / gun / c2c / B. The pellets (`x7`) and power (💪) buttons next to the gun buttons replace right-click and the wheel; ▦ Grid is a button too |

The blaster was removed from the gun rack on `main` (commit d43c80e, "Bring the old gun rack into Stage 3 as tunable real guns") and stays removed.

Free atoms you fly through go into your **Collected** tray. Atoms bond when they meet with enough energy and both still have free valence. The **target** in the top-left (e.g. "Hydrogen H2") scores when you build it and identify it.

## FIRST DISCOVERY banners
The **first time** a new type of matter or energy appears, a neon banner `FIRST DISCOVERY: <name>` shows for about **2.5 s** with a low tone. The camera is not touched; the game slows down briefly while the banner shows (added on `main` in d43c80e).

What counts as a discovery:
- **New element** you fire: Carbon, Oxygen, …
- **New bond order** first formed: single, double, triple. This counts bonds you or your c2c energy made; random bonds between loose world atoms don't count.
- **New molecule** identified with B. It is keyed by PubChem CID (or canonical SMILES) and shows the PubChem name, e.g. `FIRST DISCOVERY: Ethanol`.
- **New c2c note effect**, the first time it actually does something: bond / resonance / dissonance / harmony.
- **Energy events:** first scooped atom, first c2c 13 / c2c 8 series, each target completed.
- **Gun events:** first proton blast (gun 1), first neutron nucleus (gun 2: isotope or proton + neutron nucleus), first ion (gun 3).

Overlapping discoveries **queue** and show one banner at a time (up to 6 waiting, extras just show a status line). Discoveries are saved in localStorage under `cv.s3g.discoveries.v1` and the on/off setting under `cv.s3g.discoverybanners.v1`. With banners off, discoveries are still recorded and shown as a status line only. **K** toggles the banners and **Shift+K** resets all discoveries; from code, use `CHEMVENTUR.Stage3Game.Discovery.toggle()` / `.reset()`.

## Guns 1, 2 and 3 (`js/s3g-pne.js`)
**shotgun1proton (key 1).** A mist of small red protons. All pellets of one shot fly parallel inside a beam that is **never wider than half the ship's width** (2.1 units; measured from the ship model). Right-click (or tap the `shotgun1proton x7` button) cycles the pellets per shot: **1 · 3 · 7 · 15 · 31** (beam width 0 · 25 · 50 · 75 · 100 % of half the ship's width). The right-click never opens the browser menu, and a right-*drag* still steers. Pellets are drawn with instanced meshes (4 draw calls for any number of pellets) and hit atoms through a spatial hash.
What a proton does on hit:
- pushes the atom a little and adds a little energy (visible as a red flash);
- **proton blast**, by chance (2 % per pellet) or for sure after 6 hits on the same atom within 0.5 s: a bonded atom has all its bonds broken and is knocked out of its molecule; a lone atom gains the proton and becomes the next element (H → He, C → N, …).

**SHOTGUN2neutron (key 2).** The same pellet modes and its own power setting, but blue, slightly bigger, slower pellets. They **disappear after 3 seconds** and **fall under slight gravity** (1.5 units/s²), so their arc is just visible. What a neutron does on hit:
- pushes the atom gently;
- **neutron capture** (12 % per pellet, or for sure after 3 hits within 0.6 s): mass number + 1, giving isotopes such as ²H (deuterium) and ³H (tritium). If the nucleus gets too neutron-rich it beta-decays to the next element;
- **proton + neutron nucleus:** if a proton hit the same atom within the last second, a neutron has a 50 % chance to form a nucleus with it (next element, mass + 2, e.g. H → ³He).
So neutrons form nuclei far more often than protons do (about 12 % against 2 % per pellet, and about 50 % right after a proton).

**Power (range), guns 1 and 2.** Mouse wheel, + / − keys or the 💪 button (which wraps around). Five levels: range **15 · 30 · 50 · 70 · 90** units. The maximum is the arena radius (90), and a pellet is removed the moment it would leave the arena, so a shot never reaches beyond the game space. Pellets per shot and power are saved per gun in localStorage (`cv.s3g.pne.v1`).

**Electrogun (key 3).** A flickering lightning bolt to the atom nearest the crosshair (within 45 units), which then **jumps up to 6 times** to the nearest not-yet-struck atom within 10 units. Every struck atom becomes an **ion**: atoms with electronegativity 2.6 or higher (N, O, F, Cl, Br, S, I, …) gain an electron (−1), the others lose one (+1), up to ±2; noble gases are left alone. Ions push each other apart (same sign) or pull together (opposite sign) within 14 units.

Isotopes and ions are a game layer: "What did I build?" still identifies the neutral molecule.

## Grid panel (`js/s3g-grid.js`)
Press **G** or the **▦ Grid** button. Four toggles, saved in localStorage (`cv.s3g.grid.v1`):
- **Charge display** (on by default): every charged atom gets a small **+** (red) or **−** (blue) marker on its surface and a very subtle red / blue glow. The charge is the ion charge plus a partial charge from bond polarity: for each bond, `q += 0.12 × (partner electronegativity − own electronegativity) × bond order` (water: O ≈ −0.30, each H ≈ +0.15). The marker sits on the side facing away from the atom's bond partners, so molecules show their + and − ends. RDKit's in-browser build has no Gasteiger charge function, so this electronegativity rule is used for everything.
- **Gravity** (off): atoms and proton pellets fall slightly (1.2 units/s²). Neutron pellets always have their own slight gravity.
- **Temperature, kelvin** (off): three flat translucent layers at heights −45, 0 and +45 (base 260 K, 295 K, 330 K) with labels that follow the ship. A layer bulges up and turns red where nearby matter is hot (fast, energetic, unbonded atoms, like a gas) and dips and turns blue where it is cold (bonded molecules, like a liquid or solid). The local temperature sets how fast atoms jiggle.
- **Pressure, kilopascals** (off): two plates. Pressure = 101.3 × (atoms ÷ 70) × (1 + 0.3 × average energy); the higher it is, the closer the plates come (gap 150 down to 30 units). Each plate dents locally over crowded spots. Pressure nudges all atoms towards the centre and squeezes atoms back between the plates.

## Bots (3D)
These are 3D versions of the v118 bots. Each one is a glowing core with a spinning ring and a name tag, info line and speech bubble above it. Everything runs locally: no multiplayer, no Firebase. Press **J** to deploy all of them or remove them all. From code, use `CHEMVENTUR.Stage3Game.Bots.spawn('scientist')`, `.spawnAll()` or `.removeAll()`.

| Bot | v118 (2D) | Stage 3 (3D) |
|---|---|---|
| 📦 Collector (cyan) | `ai-players-v118.js`: flies to the nearest atom, cautious, Proton gun | Flies to the nearest loose atom and collects it into its own tray (`C×2 O×4`). It always leaves at least 40 atoms in the arena. |
| 🔬 Scientist (magenta) | Looks for pairs of atoms close together and moves between them ("fusion"); otherwise switches guns and makes atoms; Gluon gun | Finds two atoms with free valence close together, flies between them, pulls them together and **bonds** them. Otherwise it makes H/C/O/N atoms. After 10 s, then every 15 s, it asks **RDKit + PubChem** what its biggest build is ("🔬 Eureka! I synthesised Aziridine (C2H5N, CID 9033)"). |
| 💥 Chaos (red) | Random moves, random gun every 0.5 s, lunges at atoms; Anti-gun | Jittery 3D flight and lunges. Every 0.5 s it picks a random gun: **kick** (shockwave that energises nearby atoms), a random **c2c note dot**, or **rip** (breaks a bond). |
| 💚 Helper (green) | Follows players at 100–200 px, copies their gun | Follows your ship at 10–20 units and copies your gun. Every 12 s it **gifts** you one atom of your selected element (added to your Collected tray). |
| 📰 Reporter (orange) | Random flight; first snapshot after 5 s, headline + flash screenshot every minute | The same 3D flight, flash and timing, with the same 20 headlines. It saves 320×180 snapshots in localStorage (`s3g_reporter_screenshot_*`, last 5). |
| ⛪ Peace (pink) | Gentle sine float, glow, a quote from many traditions every 15 s | Gentle 3D sine float with a pulsing halo, using the same 62 quotes. |
| 🏠 Homeless (brown) | Slow drift, collects stray free electrons, counts `e⁻` | Slow drift. Stage 3 has no free electrons, so it collects **lone H atoms** (one electron each) and shows `e⁻: n`. |
| 💕 Lover (pink) | Orbits the player ship with little hearts | Orbits your ship in 3D with three hearts, centred a little ahead of the ship so it stays out of the camera. |
| 🔩 Scraper (violet) | **Not in v118.** Based on v114 Gun 8 "antimatter scrapping" (bigger atoms give more scrap) | When the arena is crowded, it hunts the heaviest loose atoms and annihilates them into scrap (+1 + Z/5). |
| 🏭 Produce (lime) | **Not in v118.** Based on v118 molecule rain | Hovers high and produces a PubChem 3D molecule every 8 s (water, ethanol, benzene, …) and drops it in. Offline it hand-builds water. It pauses when the arena is near the atom limit. |

Bots run on game time, so they freeze with P. Their atoms and bonds don't count as *your* FIRST DISCOVERIES.

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
js/s3g-guns.js             the old gun rack as tunable guns (ATOM, SHOT, ANTI, GRAV, TIME, rain)
js/s3g-pne.js              guns 1–3: shotgun1proton, SHOTGUN2neutron, Electrogun (pellets, power, hits, ions)
js/s3g-grid.js             Grid panel: charge markers, gravity, temperature layers, pressure plates
js/s3g-discovery.js        FIRST DISCOVERY banners (discovered set, queue, localStorage, K toggle)
js/s3g-bots.js             10 bots in 3D (v118 Collector/Scientist/Chaos/Helper/Reporter/Peace/Homeless/Lover + Scraper, Produce)
tests/s3g-headless.js      headless Chrome test (puppeteer-core)
tests/s3g-bots-headless.js headless Chrome test for the bots
tests/s3g-guns-headless.js headless Chrome test for guns 1–3 and the Grid panel
screenshot-*.png
```
CDNs (pinned): three.js `0.169.0` (jsDelivr, unpkg fallback) and RDKit.js `2025.3.4-1.0.0` (unpkg). Lookups use the PubChem PUG-REST API, and results are cached in localStorage under `cv.stage3.v1:`.

## Attaching it to ChemVentur later
1. Copy `css/stage3-game.css` and `js/s3g-*.js` into the main repo. `js/stage3-chem.js` is shared with the Stage 3 overlay, so keep only one copy.
2. Load the scripts in this order: `stage3-chem.js`, `s3g-core.js`, `s3g-audio.js`, `s3g-world.js`, `s3g-game.js`, `s3g-guns.js`, `s3g-discovery.js`, `s3g-bots.js`, `s3g-pne.js`, `s3g-grid.js` (as in `index.html`). Discovery, bots, guns 1–3 and the Grid are optional; the game runs without them.
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
- the atom gun (key 6), the c2c gun (key 4) and flight work
- C–C–O is identified as Ethanol (CID 702) and the 9-atom 3D conformer swap works
- FIRST DISCOVERY banners:
  - Shift+K resets discoveries and K toggles the banners
  - a first C–C bond shows `FIRST DISCOVERY: Single bond`, the camera stays on the chase position, the game slows down briefly and is back to 1× after the banner
  - the banner hides after about 2.5 s and the discovery is saved in localStorage
  - a second identical bond shows nothing
  - overlapping discoveries (Carbon, Oxygen, Ethanol) queue, with `FIRST DISCOVERY: Ethanol` showing the PubChem name
  - identifying Ethanol again shows nothing


`node tests/s3g-bots-headless.js http://127.0.0.1:8877/` runs the bots test:
- J deploys all 10 bots and every bot moves
- each bot does its job: the Collector collects, the Scientist bonds atoms and gets an RDKit + PubChem answer, Chaos acts at least 3 times, the Helper follows, copies your gun and gifts, the Reporter's snapshot lands in localStorage, the Peace Bot quotes, the Homeless Bot collects H, the Lover orbits at radius about 8, the Scraper annihilates a Br atom, and the Produce Bot produces PubChem molecules
- name tags render, J removes all bots, and there are no page errors
- for `screenshot-bots.png`, the test lines the bots up in front of the ship

`node tests/s3g-guns-headless.js http://127.0.0.1:8877/ [screenshotDir]` runs the guns and Grid test:
- key map (5 is free), rain on M, HUD labels such as `shotgun1proton x7`
- right-click cycles pellets per shot with no browser menu; right-drag still steers; the HUD button cycles too
- pellet counts 1 · 3 · 7 · 15 · 31 for both guns; beam never wider than half the ship's width, also in flight
- power via + / −, wheel and button; every range within the arena; a full-power shot stops at 90 units and a shot outwards stops at the arena edge
- neutrons are blue and bigger, fall under gravity and disappear within 3 s
- 2,000 simulated hits each: neutron nucleus rate well above the proton blast rate; 6 rapid proton hits always blast; isotopes ²H / ³H; proton + neutron → ³He; real pellets hit and push an atom
- Electrogun: chain of 5 atoms (O− H+ C+ N− Cl−), cap of 7 struck atoms of 10, no jump beyond 10 units, bolt drawn and fading, markers on ions, water partial charges
- Grid: panel opens and closes with G; each toggle on and off (charge markers, gravity makes atoms fall, temperature layers with kelvin labels, pressure plates with a kilopascal label that close in when atoms are added and nudge atoms together); settings persist after reload
- frame rate while holding fire at x31 and full power (guns 1 and 2)
- FIRST DISCOVERY banners for proton blast, neutron nucleus and ion; no page errors
- screenshots `gun1-spray.png`, `gun2-neutron.png`, `gun3-electro.png`, `grid-panel.png`

## Caveats (it's a beginning)
- No multiplayer (deliberately out of scope).
- Bonds are simple springs with 1-3 repulsion. Geometry is approximate, not real VSEPR. The PubChem conformer swap shows real geometry.
- Rain and identification need network access (PubChem, unpkg for RDKit). If RDKit is unavailable or can't parse the build, identification sends the molblock straight to PubChem. Without network, the rain falls back to random H/O atoms.
- Browsers only allow sound after a user gesture (the START button handles this).
- Tested in headless Chrome (SwiftShader). Mobile and touch were only sanity-built and are not tuned.
