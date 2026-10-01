# 🎃💚 CHEMVENTUR v119 - Left Panel Sync & Mobile Fixes Edition! 💚🎃

**The dream since October... the dream since birth!**

## 🆕 What's NEW in v119!

### 🏠 ROOM CODE PANEL
- Creating a room now pops up a **big neon code panel** immediately, with **📋 Copy Code** and **🔗 Copy Link** buttons.
- The share link uses `location.origin + location.pathname + '?room=CODE'`, so it works from either the short GitHub Pages link or a mirrored copy on the same origin.
- Opening a `?room=CODE` link prefills the join box and prompts you to press **JOIN** (never auto-joins without your say-so).

### 🗂️ LEFT PANEL: TASKBAR-STYLE FOLDABLE SECTIONS
- The GUNS, MULTIPLAYER and TURN TIMER sections now fold like the multiplayer chat window does — click/tap the section header to collapse or expand it. Folded state persists per-section in `localStorage`, so the panel remembers how you left it.
- **Folded = still live, just smaller.** Unlike a normal accordion, collapsing a section never hides its controls — buttons, the gun grid, the turn-timer slider all stay clickable, just shrunk (CSS only, real layout, not a visual scale trick). Only the one-line explanation text hides.
- **Expanded = the same controls at full size, plus one line explaining what the section does.**
- This is a reusable pattern (`.lp-section` / `.lp-section-header` / `.lp-section-body` / `.lp-section-explain` in `css/ui.css`, `UI.toggleSection()` in `js/ui.js`) — the rest of the panel's sections (STAGE SELECT, AUDIO, FUN BOTS, MOLECULE RAIN, ENVIRONMENT, ...) can be converted the same way once the wording for each section's explanation is signed off.

### 🖥️ SCREEN MODE MENU
- The **logo** (top of the Left Panel) is now a button: tap it for **⛶ Fullscreen**, **📱 Landscape**, **🔒 Lock Landscape**, and **🔓 Unlock**.
- Landscape lock genuinely isn't supported everywhere (notably iOS Safari, and Android Chrome requires fullscreen first) — rather than silently doing nothing, an unsupported attempt shows a clear status message instead of pretending it worked.

### 🐛 FIXED: buttons that looked "frozen" when changed
Root cause was a real, pre-existing bug, not a CSS styling gap: **`updateButtons()` and `updateStageDisplay()` were each defined twice** in the same `CHEMVENTUR.UI` object (`js/ui.js`) — JavaScript silently keeps only the *later* definition, and the later one was an older, incomplete version that never touched the gravity/boundary/grid buttons or the stage-select highlight at all. Removed the shadowing duplicates and merged their one extra feature each (rain-button opacity, stage-color) into the real, complete version. Along the way, gravity/boundary/grid now also get a color change per mode (not just new text), matching the multiplayer turn-timer button's "colour changing" example.

### 📱 MOBILE CONTROLS NOW TRULY PINNED TO THE SCREEN
The FIRE button and gun picker moved from being children of `#canvas-container` to being `position:fixed` children of `<body>`, so they never move — including while the canvas slides over for the panel drawer (see below).

### ↔️ PANEL DRAWER: canvas slides instead of dimming
Opening the Left Panel on a phone now visually slides the canvas over (via the `<canvas>` element's own `left`, clipped by its non-moving parent's `overflow:hidden`) to reveal the panel beside it, instead of dimming the whole canvas under a backdrop. `canvas.width`/`canvas.height` are never touched, so nothing re-renders or blurs.

**A genuinely surprising bug found along the way:** shifting `#canvas-container` itself (tried both `transform` and `left`) made `window.innerWidth` balloon to include the shifted-off-screen portion on mobile — a real mobile-viewport quirk, not just a visual glitch — which broke the `position:fixed` FIRE button even though it wasn't nested inside the shifting element. Keeping the container itself pinned and stationary, and shifting only its `overflow:hidden`-clipped child, sidesteps it entirely.

### ⏱️ LEFT PANEL: AGREEMENT-COLORED SETTINGS
First working instance of the Left Panel's three-color agreement pattern from the build order:
- A **⏱️ TURN TIMER** slider (1 second → ∞) lives in the Left Panel, synced per-player to Firebase (`players/{id}/settings`).
- The button is **green** when every player in the room has the same value, **grey** when settings differ, and shows a **red pattern** (animated stripes) when another player changed it more recently than you.
- **Right-click** (desktop) or **long-press** (phone) the button for quick presets: 1s / 5s / 10s / 30s / 60s / ∞.
- Built as a reusable pattern (`js/left-panel-sync.js`) — more LP settings can plug into the same agreement logic later.

### 📱 PHONE CONTROLS — ALL THREE FIXES FROM THE ROADMAP
- **Ship turning fixed**: dragging on the canvas now rotates the ship (and aims guns) to face your finger, exactly like the desktop mouse-drag behavior — previously touch only moved the ship without ever turning it.
- **Gun choosing simplified**: a new bottom-left picker (`‹ Gun Name ›`) cycles through all 10 guns with big thumb-sized arrow buttons; long-press the gun name for the full gun-options popup. The old 10-button grid is also enlarged at phone widths (was shrinking to 7px text before — now real touch targets).
- **Shooting fixed**: a new circular **🔫 FIRE** button (bottom-right) fires the current gun in the ship's facing direction. Tap for a single shot, hold for rapid fire. Previously there was **no way to fire at all on touch** — `touchstart`/`touchmove`/`touchend` never called into the gun/fire system.
- **Bonus fix (was blocking all of the above):** on phone-width screens (≤480px) the Left Panel used to be `position:absolute; top:0; bottom:0; width:100%`, completely covering the canvas — the game was literally unplayable on a real phone in portrait. The panel is now a slide-in drawer (☰ button, top-left) with a dimmed backdrop; the canvas is visible and playable by default.

---

## 🎮 HOW TO PLAY (phone additions)

### Mobile:
- **Drag anywhere on the canvas**: ship flies toward your finger and turns to face it.
- **🔫 FIRE button** (bottom-right): tap = one shot, hold = rapid fire.
- **‹ Gun ›** picker (bottom-left): tap arrows to cycle guns, long-press the name for gun options.
- **☰ button** (top-left): opens/closes the full Left Panel as a drawer.

### Multiplayer room links:
1. Click **🌐 CREATE ROOM** → the room code panel pops up with the code and share link.
2. Send the link to a friend — opening it prefills their join box.
3. The **⏱️ TURN TIMER** button in the Left Panel shows at a glance whether everyone in the room agrees on the setting.

---

## 📁 New/changed files

```
js/left-panel-sync.js     # 🆕 Agreement-colored LP settings (turn timer)
js/touch-v117.js          # Ship now turns + aims on drag; FIRE button + gun picker wiring
js/multiplayer-v117.js    # Player node now carries a `settings` sub-object
js/main.js                # Extracted fireCurrentGun() shared by mouse-up and the FIRE button
js/ui.js                  # Room code panel, copy-code/copy-link, selectGun() helper, panel drawer toggle
index.html                # Room code panel, turn-timer control, mobile controls, panel toggle + backdrop
css/main.css              # Phone-width Left Panel becomes a slide-in drawer
css/ui.css                # Mobile controls, LP agreement colors, enlarged gun buttons on phone widths
```

---

## 📝 Version History

- **v119** (Sep 19, 2026) - Room code panel, Left Panel agreement-colored turn timer, all three named phone-control fixes (ship turning, simplified gun picker, working FIRE button), the panel-covers-canvas bug, the RudVentur.com stale-copy/redirect fix, a game-loop hardening fix for the Android freeze, taskbar-style foldable Left Panel sections, the screen-mode menu, and the duplicate-`updateButtons()` bug that made several buttons look frozen.
- **v118** - AI Players & Chat Edition
- **v117 Multi** (Feb 14, 2026) - Multiplayer + Touch + Microphone! 💝
- **v116** - Right-click menus, ship movement, upgrades
- ...and many more!

---

## 🔭 Still open from the multiplayer build order (not in this pass)

Scoped out to keep this pass focused and testable — flagging so the next session knows where to pick up:
- Waiting list / observer cap / subscriber-brings-a-friend rules (build order item 1's tail).
- The full turn engine (turn timer *driving* actual turns, SKIP button, time-step keys, hot-seat).
- Voting and the subscriber voting-type tab.
- Sub-only ship shapes, chat.bot, Stage 3.

---

## 🎲 Side Quests (small, low-priority polish items)

- **More duplicate-method bugs, same class as the `updateButtons()` fix above.** A quick audit while fixing that bug found `js/guns.js` defines `fireGravityOrb` and `fireAntiGun` twice each, and `js/enhancements.js` defines `init` **four times** and `update` twice, in their respective object literals — JS silently keeps only the last one, so whatever the earlier definitions did is currently dead code. Not touched in this pass (out of scope, and `enhancements.js`'s 4x `init` needs a careful read before merging, not a blind delete like the `ui.js` case) — worth the same treatment: read each pair, check what functionality the shadowed-away one had that the winner doesn't, merge, delete the duplicate.
- **Roll the foldable-section pattern out panel-wide.** STAGE SELECT, AUDIO, FUN BOTS, MOLECULE RAIN, ENVIRONMENT and the rest still use the old flat `.info-window` markup. The CSS/JS pattern is built and battle-tested on GUNS/MULTIPLAYER/TURN TIMER — converting the rest is mostly mechanical (wrap existing content, add one explanation line), just needs someone to sign off on what each section's one-liner should say.

- **Kill the `I`/`l` lookalike problem.** `VT323` (the game's own display font) renders capital `I` and lowercase `l` almost identically — same in a lot of monospace fonts generally. Anywhere the UI shows an acronym, a code, or a room code (`CI`, `Cl`, a Firebase key, a room code with an `I`/`l`/`1` in it...) it's a squint-and-guess. Fix: either swap in a font with disambiguated glyphs for code-ish text (`JetBrains Mono`, `Fira Code`, `Space Mono` all do this well) scoped to labels/codes/chat, or add a small CSS trick (e.g. a serif on capital I, or extra letter-spacing) just for those spots — no need to touch the main VT323/Press Start 2P look everywhere else. Room codes already avoid ambiguous characters (see `generateRoomId()` in `multiplayer-v117.js`) — this would close the same gap everywhere else text gets read at a glance.

---

**🎃 ENJOY THE GAME, PUMPKIN! 💚**
