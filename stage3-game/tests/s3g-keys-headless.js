/* Headless-Chrome test for the Stage 3 KEYBOARD LAYER and the STAGE SELECTOR (dev only).
   npm i puppeteer-core ; serve the repo (python3 -m http.server 8790)
   CHROME=/usr/bin/google-chrome node tests/s3g-keys-headless.js http://localhost:8790/stage3-game/ [outDir] [screenshotDir]
   Works with the game-folder URL (the repository-root URL is checked for the stage links too).
   Uses isolated browser contexts so localStorage never leaks between scenarios. Synthetic key events are used for
   modifier, composition and focus guards (a real keyboard cannot be attached to headless Chrome). */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const url = process.argv[2] || 'http://localhost:8790/stage3-game/';
const outDir = process.argv[3] || path.join(__dirname, '..');
const shotDir = process.argv[4] || outDir;
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + m + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = JSON.stringify;
const KEY = 'cv.s3g.keys.v1';
const errors = [];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  });
  async function open(o) {
    o = o || {};
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.setViewport({ width: o.w || 1280, height: o.h || 760, isMobile: !!o.touch, hasTouch: !!o.touch, deviceScaleFactor: o.dsf || 1 });
    if (o.pre) await page.evaluateOnNewDocument(o.pre);
    await page.goto((o.base || url) + (o.query || ''), { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => CHEMVENTUR.Stage3Game.ready);
    await sleep(400);
    page._ctx = ctx;
    return page;
  }
  const close = async (page) => { await page.close(); await page._ctx.close(); };
  const S = (page, fn, ...args) => page.evaluate(fn, ...args);
  const start = (page) => S(page, () => { const g = CHEMVENTUR.Stage3Game.Game; g.start(); g.keys.clear(); return true; });
  // a synthetic key press on window (or a target); returns nothing, the game state tells what happened
  const fire = (page, code, init, sel) => S(page, (code, init, sel) => {
    const t = sel ? document.querySelector(sel) : window;
    const base = Object.assign({ code, key: code.replace(/^Key|^Digit/, '').toLowerCase(), bubbles: true, cancelable: true }, init || {});
    t.dispatchEvent(new KeyboardEvent('keydown', base));
    return true;
  }, code, init, sel);
  const up = (page, code) => S(page, (code) => { window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); return true; }, code);
  const st = (page) => S(page, () => ({ gun: CHEMVENTUR.Stage3Game.Game.gun, rain: CHEMVENTUR.Stage3Game.Game.rainOn, paused: CHEMVENTUR.Stage3Game.Game.paused,
    help: !CHEMVENTUR.Stage3Game.Game.hud.help.hidden, c2c: CHEMVENTUR.Stage3Game.Game.c2cMode, keys: Array.from(CHEMVENTUR.Stage3Game.Game.keys), opt: !CHEMVENTUR.Stage3Game.Steering.panel.hidden,
    kwin: !CHEMVENTUR.Stage3Game.Keys.panel.hidden, grid: !!(CHEMVENTUR.Stage3Game.Grid.panel && !CHEMVENTUR.Stage3Game.Grid.panel.hidden), disc: CHEMVENTUR.Stage3Game.Discovery.enabled }));
  // is there any trace of an on-screen keyboard? (class / id names, text inputs inside our windows)
  const oskScan = (page) => S(page, () => {
    const bad = [];
    document.querySelectorAll('[id],[class]').forEach(n => {
      const s = (n.id || '') + ' ' + (typeof n.className === 'string' ? n.className : '');
      if (/keyboard|(^|[\s_-])osk([\s_-]|$)|keypad|virtualkeyboard|softkey/i.test(s)) bad.push(n.tagName + '#' + n.id + '.' + s);
    });
    const win = document.querySelector('.s3g-keywin');
    const textInputs = win ? win.querySelectorAll('input[type=text],input:not([type]),textarea,[contenteditable]').length : 0;
    const vk = (navigator.virtualKeyboard && navigator.virtualKeyboard.boundingRect) ? navigator.virtualKeyboard.boundingRect.height : 0;
    return { bad, textInputs, vk };
  });

  // ===================================================================
  console.log('\n# Keyboard layer + stage selector: ' + url);

  // ---------- 1. bindings table and the original key map ----------
  {
    const page = await open();
    const K = await S(page, () => { const k = CHEMVENTUR.Stage3Game.Keys; return { actions: k.ACTIONS.map(a => ({ id: a.id, codes: k.codes(a.id), hold: a.hold })), conflicts: k.conflicts(), preset: k.preset }; });
    const want = { gunProton: 'Digit1', gunNeutron: 'Digit2', gunElectron: 'Digit3', gunC2c: 'Digit4', gunShotgun5: 'Digit5', gunAtom: 'Digit6', gunShotgun: 'Digit7', gunAnti: 'Digit8', gunGrav: 'Digit9', gunTime: 'Digit0',
      rain: 'KeyM', grid: 'KeyG', help: 'KeyH', bots: 'KeyJ', discovery: 'KeyK', identify: 'KeyB', swap: 'KeyT', pause: 'KeyP', options: 'KeyO', c2cMode: 'KeyC',
      moveForward: 'KeyW', moveLeft: 'KeyA', moveBack: 'KeyS', moveRight: 'KeyD', moveUp: 'KeyR', moveDown: 'KeyF', turnLeft: 'ArrowLeft', turnRight: 'ArrowRight', pitchUp: 'ArrowUp', pitchDown: 'ArrowDown',
      rudderLeft: 'KeyQ', rudderRight: 'KeyE', fire: 'Space', elementPrev: 'KeyZ', elementNext: 'KeyX' };
    const bad = Object.keys(want).filter(id => { const a = K.actions.find(x => x.id === id); return !a || a.codes[0] !== want[id]; });
    ok(bad.length === 0, 'bindings table: every action has today\'s default key code', bad.join(',') || Object.keys(want).length + ' checked');
    const pw = K.actions.find(a => a.id === 'powerUp').codes, pd = K.actions.find(a => a.id === 'powerDown').codes;
    ok(pw.includes('Equal') && pw.includes('NumpadAdd') && pd.includes('Minus') && pd.includes('NumpadSubtract'), 'power keys keep both the main and the number-pad key', J(pw) + J(pd));
    ok(K.conflicts.length === 0 && K.preset === 'wasd', 'defaults have no conflicts and match the W A S D preset', J(K.conflicts));
    ok(K.actions.filter(a => a.hold).length === 13, 'flying keys and fire are "held" actions, everything else fires once per press');

    // hotkeys by real key presses (event.code based)
    await start(page);
    const guns = { Digit1: 'proton', Digit2: 'neutron', Digit3: 'electron', Digit4: 'c2c', Digit6: 'atom', Digit7: 'shotgun', Digit8: 'anti', Digit9: 'grav', Digit0: 'time' };
    let badg = [];
    for (const c of Object.keys(guns)) { await page.keyboard.press(c); await sleep(60); const s = await st(page); if (s.gun !== guns[c]) badg.push(c + '→' + s.gun); }
    ok(badg.length === 0, 'number keys still pick the same guns', badg.join(',') || '9 guns');
    const hasS5 = await S(page, () => !!CHEMVENTUR.Stage3Game.Game.hud.gunBtns.shotgun5);
    await page.keyboard.press('Digit5'); await sleep(60);
    const g5 = (await st(page)).gun;
    ok(hasS5 ? g5 === 'shotgun5' : g5 === 'time', 'key 5 = shotgun five when that gun is in the build, otherwise nothing happens', 'shotgun5 in build: ' + hasS5 + ', gun = ' + g5);
    const a = await st(page); await page.keyboard.press('KeyM'); const b = await st(page); await page.keyboard.press('KeyM');
    ok(a.rain !== b.rain, 'M toggles molecule rain'); 
    await page.keyboard.press('KeyH'); const h1 = (await st(page)).help; await page.keyboard.press('KeyH'); ok(h1 === true && (await st(page)).help === false, 'H toggles help');
    await page.keyboard.press('KeyP'); const p1 = (await st(page)).paused; await page.keyboard.press('KeyP'); ok(p1 === true && (await st(page)).paused === false, 'P pauses and resumes');
    await page.keyboard.press('KeyC'); const c1 = (await st(page)).c2c; await page.keyboard.press('KeyC'); ok(c1 === 'major' && (await st(page)).c2c === 'chromatic', 'C switches the c2c mode');
    await page.keyboard.press('KeyG'); const g1 = (await st(page)).grid; await page.keyboard.press('KeyG'); ok(g1 === true, 'G opens the Grid panel');
    await page.keyboard.press('KeyK'); const k1 = (await st(page)).disc; await page.keyboard.press('KeyK'); ok(k1 === false && (await st(page)).disc === true, 'K toggles the discovery banners');
    await page.keyboard.press('KeyO'); const o1 = (await st(page)).opt; await page.keyboard.press('Escape'); ok(o1 === true && (await st(page)).opt === false, 'O opens the steering options, Escape closes them');
    await page.keyboard.press('F2'); const f1 = (await st(page)).kwin; await page.keyboard.press('Escape'); ok(f1 === true && (await st(page)).kwin === false, 'F2 opens the keyboard options window, Escape closes it');
    // flying keys are held actions
    await page.keyboard.down('KeyW'); await page.keyboard.down('ArrowLeft');
    const hf = await S(page, () => { const g = CHEMVENTUR.Stage3Game.Game; return [g.held('moveForward'), g.held('turnLeft'), g.held('moveBack')]; });
    await page.keyboard.up('KeyW'); await page.keyboard.up('ArrowLeft');
    ok(hf[0] && hf[1] && !hf[2], 'W and the left arrow are held while down', J(hf));
    // ship really moves with the keys (classic steering), deterministic stepping
    const mv = await S(page, () => { const G = CHEMVENTUR.Stage3Game, g = G.Game; g.paused = true; g.keys.clear(); g.ship.position.set(0, 0, 0); g.shipVel.set(0, 0, 0); g.yaw = 0; g.pitch = 0; g.ship.quaternion.identity();
      g.keys.add('KeyW'); for (let i = 0; i < 30; i++) g._updateShip(1 / 60); g.keys.clear(); const z = g.ship.position.z; g.paused = false; return z; });
    ok(mv < -0.1, 'holding W flies the ship forward (−z)', 'z = ' + mv.toFixed(2));
    await close(page);
  }

  // ---------- 2. guards ----------
  {
    const page = await open(); await start(page);
    const base = await st(page);
    await fire(page, 'KeyC', { ctrlKey: true }); const s1 = await st(page);
    ok(s1.c2c === base.c2c && !s1.keys.includes('KeyC'), 'Ctrl+C does not toggle c2c (and the key is not held)');
    await up(page, 'KeyC');
    await fire(page, 'KeyM', { ctrlKey: true, altKey: true }); const s2 = await st(page);
    ok(s2.rain === base.rain, 'AltGr on Windows (Ctrl+Alt) does not fire hotkeys (M)');
    await fire(page, 'KeyH', { modifierAltGraph: true }); const s3 = await st(page);
    ok(s3.help === base.help, 'AltGr reported by the browser (AltGraph state) does not fire hotkeys (H)');
    await fire(page, 'KeyP', { metaKey: true }); const s4 = await st(page);
    ok(s4.paused === base.paused, 'Meta (Windows or Command key) combinations are ignored (P)');
    await fire(page, 'KeyM', { isComposing: true }); await fire(page, 'KeyM', { keyCode: 229 }); const s5 = await st(page);
    ok(s5.rain === base.rain && s5.keys.length === 0, 'keys during IME composition are ignored (isComposing and keyCode 229)');
    await S(page, () => { const i = document.createElement('input'); i.type = 'text'; i.id = 'tin'; document.body.appendChild(i); const d = document.createElement('div'); d.id = 'ced'; d.contentEditable = 'true'; d.tabIndex = 0; document.body.appendChild(d); const t = document.createElement('textarea'); t.id = 'tta'; document.body.appendChild(t); });
    await fire(page, 'KeyM', {}, '#tin'); await fire(page, 'KeyH', {}, '#ced'); await fire(page, 'KeyP', {}, '#tta'); const s6 = await st(page);
    ok(s6.rain === base.rain && s6.help === base.help && s6.paused === base.paused && s6.keys.length === 0, 'typing in an input, textarea or editable element fires no hotkeys');
    await fire(page, 'KeyM', { shiftKey: true }); const s7 = await st(page);
    ok(s7.rain !== base.rain, 'a plain key (and Shift) still works after all that'); await fire(page, 'KeyM'); await up(page, 'KeyM');
    // clear on blur and when the tab is hidden
    await fire(page, 'KeyW'); await fire(page, 'ArrowUp'); const held1 = (await st(page)).keys.length;
    await S(page, () => { window.dispatchEvent(new Event('blur')); return 1; }); const held2 = (await st(page)).keys.length;
    ok(held1 === 2 && held2 === 0, 'held keys are cleared when the window loses focus', held1 + ' → ' + held2);
    await fire(page, 'KeyA'); const held3 = (await st(page)).keys.length;
    await S(page, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); return 1; }); const held4 = (await st(page)).keys.length;
    ok(held3 === 1 && held4 === 0, 'held keys are cleared when the tab becomes hidden', held3 + ' → ' + held4);
    const rs = await S(page, () => { const K = CHEMVENTUR.Stage3Game.Keys; const mk = (i) => Object.assign({ code: 'KeyW', target: document.body }, i);
      return [K.ignoreReason(mk({ ctrlKey: true })), K.ignoreReason(mk({ metaKey: true })), K.ignoreReason(mk({ altKey: true })), K.ignoreReason(mk({ isComposing: true })), K.ignoreReason(mk({})), K.ignoreReason(mk({ getModifierState: (m) => m === 'AltGraph' }))]; });
    ok(J(rs) === J(['modifier', 'modifier', 'alt', 'composition', null, 'altgr']), 'Keys.ignoreReason names each reason', J(rs));
    await close(page);
  }

  // ---------- 3. rebinding, conflicts, presets, persistence ----------
  {
    const page = await open(); await start(page);
    const r1 = await S(page, () => { const K = CHEMVENTUR.Stage3Game.Keys; return [K.set('help', 0, 'KeyY'), K.codes('help'), K.preset]; });
    ok(r1[0].ok && r1[1][0] === 'KeyY' && r1[2] === 'custom', 'set() rebinds an action and the preset becomes "custom"', J(r1));
    await page.keyboard.press('KeyH'); const o1 = (await st(page)).help; await page.keyboard.press('KeyY'); const o2 = (await st(page)).help; await page.keyboard.press('KeyY');
    ok(o1 === false && o2 === true, 'the new key works and the old key no longer does');
    const r2 = await S(page, () => { const K = CHEMVENTUR.Stage3Game.Keys; return [K.set('help', 1, 'KeyM'), K.codes('rain'), K.codes('help')]; });
    ok(r2[0].ok === false && r2[0].reason === 'conflict' && r2[0].conflicts[0] === 'rain' && r2[1][0] === 'KeyM' && r2[2].length === 1, 'a key owned by another action is refused with the conflict named', J(r2[0]));
    const r3 = await S(page, () => { const K = CHEMVENTUR.Stage3Game.Keys; const r = K.set('help', 1, 'KeyM', { steal: true }); return [r, K.codes('rain'), K.codes('help'), K.conflicts()]; });
    ok(r3[0].ok && r3[1].length === 0 && r3[2].includes('KeyM') && r3[3].length === 0, '"take it" moves the key and leaves the other action without one, never two on one key', J(r3));
    const r4 = await S(page, () => { const K = CHEMVENTUR.Stage3Game.Keys; return ['Escape', 'ControlLeft', 'AltRight', 'MetaLeft', 'Tab'].map(c => K.set('rain', 0, c).reason); });
    ok(r4.every(x => x === 'forbidden'), 'Escape, Ctrl, Alt, Meta and Tab cannot be bound', J(r4));
    const r5 = await S(page, () => { const K = CHEMVENTUR.Stage3Game.Keys; K.set('rain', 0, 'KeyU'); K.set('rain', 1, 'KeyU'); const one = K.bind.rain.filter(c => c === 'KeyU').length; return [one, K.set('rain', 1, null).ok, K.codes('rain')]; });
    ok(r5[0] === 1 && r5[1] === true && r5[2].length === 0, 'the same key twice on one action keeps one slot; a slot can be cleared', J(r5));
    const saved = await S(page, () => JSON.parse(localStorage.getItem('cv.s3g.keys.v1')));
    ok(saved && saved.v === 1 && saved.bind && saved.bind.help && saved.bind.help.includes('KeyM'), 'bindings are saved in localStorage ' + KEY);
    await page.reload({ waitUntil: 'load' }); await page.evaluate(() => CHEMVENTUR.Stage3Game.ready); await sleep(300);
    const after = await S(page, () => CHEMVENTUR.Stage3Game.Keys.codes('help'));
    ok(after.includes('KeyM'), 'bindings survive a reload', J(after));
    await S(page, () => CHEMVENTUR.Stage3Game.Keys.reset());
    const rst = await S(page, () => { const K = CHEMVENTUR.Stage3Game.Keys; return [K.codes('help'), K.codes('rain'), K.preset]; });
    ok(J(rst[0]) === '["KeyH"]' && J(rst[1]) === '["KeyM"]' && rst[2] === 'wasd', 'reset puts every key back', J(rst));
    // presets: complete and conflict-free; each one really flies with its keys
    const presets = await S(page, () => { const K = CHEMVENTUR.Stage3Game.Keys, out = {}; K.PRESET_ORDER.forEach(n => { K.applyPreset(n); out[n] = { conflicts: K.conflicts().length, preset: K.preset, fwd: K.codes('moveForward'), back: K.codes('moveBack'), left: K.codes('moveLeft'), right: K.codes('moveRight'), turnL: K.codes('turnLeft'), bots: K.codes('bots'), disc: K.codes('discovery'), fire: K.codes('fire') }; }); K.reset(); return out; });
    ok(Object.keys(presets).length === 5 && Object.values(presets).every(p => p.conflicts === 0), 'five presets (W A S D, arrows, E S D F, I J K L, left-handed numpad) have no conflicts', Object.keys(presets).join(','));
    ok(presets.arrows.fwd[0] === 'ArrowUp' && presets.arrows.turnL[0] === 'KeyA' && presets.esdf.fwd[0] === 'KeyE' && presets.ijkl.fwd[0] === 'KeyI' && presets.ijkl.bots[0] === 'KeyV' && presets.ijkl.disc[0] === 'KeyY' && presets.numpad.fwd[0] === 'Numpad8' && presets.numpad.fire.includes('Numpad0'), 'preset keys are what the buttons say', J(presets.ijkl));
    ok(Object.keys(presets).every(n => presets[n].preset === n), 'applying a preset is recognised as that preset');
    for (const n of ['arrows', 'esdf', 'ijkl', 'numpad']) {
      const z = await S(page, (n) => { const G = CHEMVENTUR.Stage3Game, g = G.Game, K = G.Keys; K.applyPreset(n); g.paused = true; g.keys.clear(); g.ship.position.set(0, 0, 0); g.shipVel.set(0, 0, 0); g.yaw = 0; g.pitch = 0; g.ship.quaternion.identity();
        g.keys.add(K.codes('moveForward')[0]); for (let i = 0; i < 30; i++) g._updateShip(1 / 60); g.keys.clear(); const zf = g.ship.position.z;
        g.ship.position.set(0, 0, 0); g.shipVel.set(0, 0, 0); g.keys.add('KeyW'); for (let i = 0; i < 30; i++) g._updateShip(1 / 60); g.keys.clear(); const zw = g.ship.position.z;   // old W must not fly in a preset that moved it
        g.paused = false; K.reset(); return [zf, zw]; }, n);
      ok(z[0] < -0.1 && (n === 'arrows' ? z[1] > -0.01 : n === 'esdf' || n === 'ijkl' || n === 'numpad' ? z[1] > -0.01 : true), 'preset ' + n + ': its forward key flies forward and W no longer does', z.map(v => v.toFixed(2)).join(' / '));
    }
    // cessna mode follows the bindings too (roll with the strafe keys)
    const ces = await S(page, () => { const G = CHEMVENTUR.Stage3Game, g = G.Game, K = G.Keys, S = G.Steering; S.setMode('cessna', { quiet: true }); K.applyPreset('ijkl'); g.paused = true; g.keys.clear(); g.ship.quaternion.identity();
      g.keys.add('KeyL'); for (let i = 0; i < 40; i++) g._updateShip(1 / 60); const roll = S.flight.w.roll; g.keys.clear(); g.paused = false; K.reset(); S.setMode('classic', { quiet: true }); return roll; });
    ok(Math.abs(ces) > 0.05, 'Cessna steering follows the bindings (I J K L preset: L rolls right)', 'roll rate ' + ces.toFixed(2));
    await close(page);
  }

  // ---------- 4. window: click-to-rebind, conflicts, presets by clicking ----------
  {
    const page = await open(); await start(page);
    await page.keyboard.press('F2'); await sleep(150);
    const cellSel = (id, slot) => '.s3g-keys-slot[data-action="' + id + '"][data-slot="' + slot + '"]';
    const txt = (sel) => page.$eval(sel, n => n.textContent);
    ok((await txt(cellSel('help', 0))) === 'H' && (await txt(cellSel('gunProton', 0))) === '1' && (await txt(cellSel('fire', 0))) === 'Space', 'the window lists the keys by the names on your keyboard', await txt(cellSel('help', 0)));
    await page.click(cellSel('help', 0)); await sleep(80);
    ok((await txt(cellSel('help', 0))).startsWith('Press'), 'clicking a key box waits for a key');
    await page.keyboard.press('KeyY'); await sleep(100);
    ok((await txt(cellSel('help', 0))) === 'Y' && (await S(page, () => CHEMVENTUR.Stage3Game.Keys.capturing)) === null, 'pressing a key rebinds it');
    ok((await st(page)).help === false, 'the capturing key press did not also fire a game action');
    await page.click(cellSel('help', 0)); await page.keyboard.press('KeyM'); await sleep(100);
    const msg = await page.$eval('.s3g-keys-msg', n => n.textContent), take = await page.$eval('.s3g-keys-take', n => !n.hidden);
    ok(/already used by Molecule rain/.test(msg) && take && (await txt(cellSel('help', 0))) === 'Y', 'a conflict is shown with the owner\'s name and a "Take it" button, nothing changed yet', msg);
    await page.click('.s3g-keys-take'); await sleep(100);
    ok((await txt(cellSel('help', 0))) === 'M' && (await txt(cellSel('rain', 0))) === '—', '"Take it" gives the key over');
    await page.click(cellSel('help', 1)); await page.keyboard.press('Escape'); await sleep(80);
    ok((await S(page, () => CHEMVENTUR.Stage3Game.Keys.capturing)) === null && (await st(page)).kwin === true, 'Escape while rebinding only cancels the rebinding (the window stays)');
    await page.click(cellSel('help', 0)); await page.keyboard.press('Backspace'); await sleep(80);
    ok((await txt(cellSel('help', 0))) === '—', 'Backspace clears a key box');
    await page.click(cellSel('gunProton', 0)); await page.keyboard.down('ControlLeft'); await page.keyboard.up('ControlLeft'); await sleep(60);
    ok((await S(page, () => CHEMVENTUR.Stage3Game.Keys.capturing)) !== null, 'pressing only Ctrl while rebinding waits for a real key'); await page.keyboard.press('Escape');
    await page.click('.s3g-keys-presets [data-preset="esdf"]'); await sleep(100);
    ok((await txt(cellSel('moveForward', 0))) === 'E' && (await page.$eval('.s3g-keys-presets [data-preset="esdf"]', n => n.classList.contains('active'))), 'a preset button rewrites the window and lights up');
    // layout-aware labels: a fake layout map like Chromium's (Russian letters) and a German style learned label
    const lab = await S(page, () => { const K = CHEMVENTUR.Stage3Game.Keys; K.reset(); const before = [K.label('KeyW'), K.label('Digit1'), K.label('ArrowUp'), K.label('NumpadAdd'), K.label('Space'), K.label('F2')];
      K._map = new Map([['KeyW', 'ц'], ['KeyA', 'ф'], ['KeyH', 'р']]); K.layoutSource = 'map'; K.emit('change', {}); const mapped = [K.label('KeyW'), K.label('KeyA'), K.label('Digit1')];
      const help = Array.from(CHEMVENTUR.Stage3Game.Game.hud.helpList.querySelectorAll('dt')).map(n => n.textContent).join(' | '); const gtitle = CHEMVENTUR.Stage3Game.Game.hud.gunBtns.proton.title;
      const hb = CHEMVENTUR.Stage3Game.Game.hud.actionBtns.help.textContent; K._map = null; K.layoutSource = 'derived'; K.emit('change', {});
      // learned from real key presses (German layout: the key at KeyY prints z, the key at KeyZ prints y)
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'y', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', bubbles: true }));
      const learned = K.label('KeyZ'), src = K.layoutSource; K._learned = {}; K.layoutSource = 'derived'; K.emit('change', {});
      return { before, mapped, help, gtitle, hb, learned, src, text: K.describeLayout() }; });
    ok(J(lab.before) === J(['W', '1', '↑', 'Num +', 'Space', 'F2']), 'labels fall back to code-derived names without a layout', J(lab.before));
    ok(J(lab.mapped) === J(['Ц', 'Ф', '1']), 'labels show the character on your own key from the layout map (Russian example)', J(lab.mapped));
    ok(/Ц Ф/.test(lab.help) && /р|Р/.test(lab.hb) && lab.gtitle.startsWith('1 ·'), 'help list and buttons use the layout-aware labels', lab.help.slice(0, 40) + ' | ' + lab.hb);
    ok(lab.learned === 'Y' && lab.src === 'learned', 'without a layout map, names are learned from key presses (German KeyZ prints Y)', lab.learned + ' ' + lab.src);
    const real = await S(page, () => ({ has: !!(navigator.keyboard && navigator.keyboard.getLayoutMap), src: CHEMVENTUR.Stage3Game.Keys.layoutSource }));
    console.log('  ℹ️ real layout map in this browser: available=' + real.has + ', source now = ' + real.src);
    const hl = await S(page, () => { const K = CHEMVENTUR.Stage3Game.Keys, g = CHEMVENTUR.Stage3Game.Game; K.set('gunProton', 0, 'KeyV'); const t = g.hud.gunBtns.proton.title, dt = Array.from(g.hud.helpList.querySelectorAll('dt')).map(n => n.textContent).join('|'); K.reset(); return [t, dt]; });
    ok(hl[0].startsWith('V ·') && /(^|\|)V · 2 · 3(\||$)/.test(hl[1]), 'after rebinding, the gun button hint and the help follow at once', hl[0]);
    await close(page);
  }

  // ---------- 5. keyboard button: only with a keyboard; never an on-screen keyboard ----------
  {
    // headless Chrome reports no mouse at all, so a real laptop is imitated: a fine pointer with hover (what a mouse or trackpad reports)
    const fakeMouse = () => { const orig = window.matchMedia.bind(window); window.matchMedia = (q) => (/any-pointer:\s*fine/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null } : orig(q)); };
    const desk = await open({ pre: fakeMouse });
    const d = await S(desk, () => { const K = CHEMVENTUR.Stage3Game.Keys; return { vis: !K.btn.hidden, by: K.detectedBy, link: !document.querySelector('.s3g-start .s3g-keys-link').hidden, shown: getComputedStyle(K.btn).display !== 'none' }; });
    ok(d.vis && d.shown && d.by === 'pointer' && d.link, 'desktop (fine pointer and hover): the keyboard button and the start-screen link show at once', J(d));
    await close(desk);
    const nat = await open();
    const n0 = await S(nat, () => ({ fine: matchMedia('(any-pointer: fine)').matches, det: CHEMVENTUR.Stage3Game.Keys.detected }));
    console.log('  ℹ️ headless Chrome native: any-pointer fine=' + n0.fine + ', detected at load=' + n0.det);
    ok(n0.fine === n0.det, 'detection at load follows the browser\'s pointer report (fine pointer = keyboard likely)', J(n0));
    await nat.keyboard.press('KeyA'); await sleep(80);
    ok(await S(nat, () => CHEMVENTUR.Stage3Game.Keys.detected && !CHEMVENTUR.Stage3Game.Keys.btn.hidden), 'whatever the pointer says, the first real key press shows the button');
    await close(nat);

    const ph = await open({ touch: true, w: 844, h: 390, dsf: 2 });
    const t0 = await S(ph, () => { const K = CHEMVENTUR.Stage3Game.Keys; return { fine: matchMedia('(any-pointer: fine)').matches, hover: matchMedia('(any-hover: hover)').matches, vis: !K.btn.hidden, det: K.detected,
      btnShown: getComputedStyle(K.btn).display !== 'none', link: Array.from(document.querySelectorAll('.s3g-keys-link')).map(b => getComputedStyle(b).display !== 'none') }; });
    console.log('  ℹ️ touch phone media: any-pointer fine=' + t0.fine + ', any-hover=' + t0.hover);
    ok(!t0.det && !t0.vis && !t0.btnShown && t0.link.every(x => !x), 'touch-only phone: no keyboard button and no link before a key is pressed', J(t0));
    const o0 = await oskScan(ph);
    ok(o0.bad.length === 0 && o0.vk === 0, 'no on-screen keyboard element on the touch phone', J(o0));
    await ph.keyboard.press('KeyA'); await sleep(100);
    const t1 = await S(ph, () => { const K = CHEMVENTUR.Stage3Game.Keys; return { vis: !K.btn.hidden, by: K.detectedBy, shown: getComputedStyle(K.btn).display !== 'none', link: Array.from(document.querySelectorAll('.s3g-keys-link')).map(b => getComputedStyle(b).display !== 'none').some(Boolean) }; });
    ok(t1.vis && t1.shown && t1.by === 'key' && t1.link, 'after the first real key press the button and links appear', J(t1));
    await ph.screenshot({ path: path.join(shotDir, 'keys-phone-start.png') });
    await start(ph); await ph.evaluate(() => CHEMVENTUR.Stage3Game.Keys.btn.click()); await sleep(200);
    ok((await st(ph)).kwin === true, 'the button opens the keyboard window'); 
    const o1 = await oskScan(ph); ok(o1.bad.length === 0 && o1.textInputs === 0 && o1.vk === 0, 'the keyboard window has no keyboard drawing, no text field, no on-screen keyboard', J(o1));
    const fit = await S(ph, () => { const r = CHEMVENTUR.Stage3Game.Keys.panel.getBoundingClientRect(); return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, sh: CHEMVENTUR.Stage3Game.Keys.panel.scrollHeight, ch: CHEMVENTUR.Stage3Game.Keys.panel.clientHeight }; });
    ok(fit.w <= fit.vw && fit.h <= fit.vh, 'the window fits the phone screen (it scrolls inside)', J(fit));
    await ph.screenshot({ path: path.join(shotDir, 'keys-phone-window.png') });
    await close(ph);

    const desk2 = await open({ w: 1280, h: 760, pre: fakeMouse });
    await desk2.screenshot({ path: path.join(shotDir, 'keys-desktop-start.png') });
    await start(desk2); await desk2.keyboard.press('F2'); await sleep(200);
    const o2 = await oskScan(desk2); ok(o2.bad.length === 0 && o2.textInputs === 0, 'desktop: window open, still no on-screen keyboard element', J(o2));
    await desk2.screenshot({ path: path.join(shotDir, 'keys-desktop-window.png') });
    await desk2.keyboard.press('Escape');
    await desk2.keyboard.press('KeyO'); await sleep(150);
    const lk = await S(desk2, () => { const l = CHEMVENTUR.Stage3Game.Steering.panel.querySelector('.s3g-keys-link'); return l ? getComputedStyle(l).display !== 'none' : null; });
    ok(lk === true, 'the steering options window has a link to the keyboard options'); 
    await desk2.click('.s3g-optpanel .s3g-keys-link'); await sleep(150);
    const sw = await st(desk2); ok(sw.kwin && !sw.opt, 'the link switches from the steering window to the keyboard window (never both)');
    await close(desk2);
  }

  // ---------- 6. opening screen = options + stage selector ----------
  {
    const page = await open();
    const sel = await S(page, () => CHEMVENTUR.Stage3Game.Stages.debugState());
    ok(sel.length === 5 && sel.map(s => s.id).join('') === '01234', 'stage selector lists Stages 0 to 4');
    const olds = sel.filter(s => s.id <= 2);
    ok(olds.every(s => s.tag === 'A' && /game-v118\.html$/.test(s.href)), 'Stages 0, 1 and 2 link to the older game (game-v118.html)', olds.map(s => s.href).join(' '));
    ok(sel[3].current && sel[3].tag === 'BUTTON' && sel[4].soon && sel[4].tag === 'SPAN', 'Stage 3 is the current game, Stage 4 is a disabled card');
    const s4 = await S(page, () => { const n = document.querySelector('.s3g-stage.soon'); return { disabled: n.getAttribute('aria-disabled'), text: n.textContent, href: n.getAttribute('href') }; });
    ok(s4.disabled === 'true' && /Coming soon/.test(s4.text) && !s4.href, 'Stage 4 says "Coming soon" and is not a link', J(s4));
    const age = await S(page, async (u) => (await fetch(u)).status, sel[0].href);
    ok(age === 200, 'the older game page really loads', 'status ' + age);
    const picker = await S(page, () => ({ steer: !!document.querySelector('.s3g-start .s3g-steerpick'), mode: CHEMVENTUR.Stage3Game.Steering.mode, active: document.querySelector('.s3g-start .s3g-steerbtn.active') && document.querySelector('.s3g-start .s3g-steerbtn.active').dataset.mode,
      order: Array.from(document.querySelector('.s3g-start').children).map(n => n.className.split(' ')[0]).join(' > ') }));
    ok(picker.steer && picker.mode === 'classic', 'the steering picker is still on the opening screen and Classic is the default', J(picker));
    ok(/s3g-stagepick.*s3g-steerpick/.test(picker.order) && /s3g-start-keys/.test(picker.order), 'opening screen order: stages, steering, keyboard link', picker.order);
    await S(page, () => { document.querySelector('.s3g-stage.current').click(); return 1; }); await sleep(100);
    ok(await S(page, () => CHEMVENTUR.Stage3Game.Game.started && CHEMVENTUR.Stage3Game.Game.hud.startOverlay.hidden), 'the Stage 3 card starts the game');
    await close(page);
    // the same page from the repository root
    const root = new URL('../', url).href;
    const rp = await open({ base: root });
    const rsel = await S(rp, () => CHEMVENTUR.Stage3Game.Stages.debugState());
    const rage = await S(rp, async (u) => (await fetch(u)).status, rsel[0].href);
    ok(rsel.slice(0, 3).every(s => /\/game-v118\.html$/.test(s.href)) && rage === 200, 'from the repository root the links also reach game-v118.html', rsel[0].href + ' → ' + rage);
    await close(rp);
  }

  ok(errors.length === 0, 'no page or console errors', errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e); process.exit(2); });
