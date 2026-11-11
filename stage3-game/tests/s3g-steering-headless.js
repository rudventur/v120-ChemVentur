/* Headless-Chrome test for the Stage 3 STEERING MODES (dev only).
   npm i puppeteer-core ; serve the repo (python3 -m http.server 8790)
   CHROME=/usr/bin/google-chrome node tests/s3g-steering-headless.js http://localhost:8790/stage3-game/ [outDir] [screenshotDir]
   Works with the game-folder URL and the repository-root URL. Uses isolated browser contexts so localStorage never leaks between scenarios.
   Physics checks pause the game loop and step Game._updateShip by hand, so they are deterministic. */
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
const KEY = 'cv.s3g.steering.v1';
const errors = [];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  });

  // open a fresh, isolated page. o: {w,h,touch,dsf,pre(fn run before the page's scripts),query}
  async function open(o) {
    o = o || {};
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.setViewport({ width: o.w || 1280, height: o.h || 760, isMobile: !!o.touch, hasTouch: !!o.touch, deviceScaleFactor: o.dsf || 1 });
    if (o.pre) await page.evaluateOnNewDocument(o.pre, o.preArg);
    await page.goto(url + (o.query || ''), { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => CHEMVENTUR.Stage3Game.ready);
    await sleep(500);
    page._ctx = ctx;
    return page;
  }
  const close = async (page) => { await page.close(); await page._ctx.close(); };
  const S = (page, fn, ...args) => page.evaluate(fn, ...args);

  // deterministic physics: pause the loop and step by hand
  const setup = (page, mode, assist) => S(page, (mode, assist) => {
    const G = CHEMVENTUR.Stage3Game, g = G.Game, St = G.Steering;
    g.start(); g.paused = true; g.keys.clear();
    St.opts.assist = assist || 'arcade'; St.setMode(mode, { quiet: true });
    g.ship.position.set(0, 0, 0); g.ship.quaternion.identity(); g.shipVel.set(0, 0, 0); g.yaw = 0; g.pitch = 0;
    g.camera.up.set(0, 1, 0); const f = St.flight; f.w.roll = f.w.pitch = f.w.yaw = 0; f.kb.roll = f.kb.pitch = f.kb.yaw = 0;
    f.throttle = 0.35; f.speed = 0; f.hardClamps = 0; f.softTurns = 0; f.maxDist = 0; return true;
  }, mode, assist);
  const step = (page, n, keys, dt) => S(page, (n, keys, dt) => {
    const g = CHEMVENTUR.Stage3Game.Game; g.keys.clear(); (keys || []).forEach(k => g.keys.add(k));
    for (let i = 0; i < n; i++) g._updateShip(dt || 1 / 60);
    g.keys.clear(); return true;
  }, n, keys, dt);
  const att = (page) => S(page, () => {
    const g = CHEMVENTUR.Stage3Game.Game, T = CHEMVENTUR.Stage3Game.THREE, q = g.ship.quaternion;
    const f = new T.Vector3(0, 0, -1).applyQuaternion(q), r = new T.Vector3(1, 0, 0).applyQuaternion(q), u = new T.Vector3(0, 1, 0).applyQuaternion(q);
    const St = CHEMVENTUR.Stage3Game.Steering;
    return { bank: Math.atan2(-r.y, u.y), pitch: Math.asin(f.y), fx: f.x, fy: f.y, fz: f.z, thr: St.flight.throttle, wr: St.flight.w.roll, wp: St.flight.w.pitch, wy: St.flight.w.yaw,
      pos: g.ship.position.toArray(), dist: g.ship.position.length(), camUp: g.camera.up.toArray(), yaw: g.yaw, pitchE: g.pitch };
  });
  const dbg = (page) => S(page, () => CHEMVENTUR.Stage3Game.Steering.debugState());

  console.log('# ' + url);

  // ================= 1. DESKTOP: start picker, default, persistence =================
  console.log('## start screen picker + defaults (desktop)');
  let page = await open({});
  let d = await dbg(page);
  ok(d.mode === 'classic' && !d.stored, 'default mode is Classic, nothing stored yet', d.mode);
  ok(d.device.cls === 'desktop' && !d.device.touchPrimary, 'desktop detected: mouse + keyboard, no touch layout', J(d.device));
  const pick = await S(page, () => {
    const b = [...document.querySelectorAll('.s3g-start .s3g-steerbtn')];
    return { ids: b.map(x => x.dataset.mode), active: b.filter(x => x.classList.contains('active')).map(x => x.dataset.mode), hint: document.querySelector('.s3g-steerhint').textContent, visible: b.every(x => x.getBoundingClientRect().width > 0) };
  });
  ok(J(pick.ids) === J(['classic', 'cessna', 'gamepad']) && J(pick.active) === J(['classic']) && pick.visible, 'start screen shows the picker: Classic (selected), Cessna, Gamepad', J(pick));
  ok(/arrows/i.test(pick.hint), 'picker hint explains the selected mode', pick.hint);
  await page.screenshot({ path: path.join(shotDir, 'steer-start.png') });
  await page.click('.s3g-steerbtn[data-mode=cessna]');
  d = await dbg(page);
  const act2 = await S(page, () => [...document.querySelectorAll('.s3g-start .s3g-steerbtn.active')].map(x => x.dataset.mode));
  ok(d.mode === 'cessna' && J(act2) === J(['cessna']) && d.stored && d.stored.mode === 'cessna' && d.instrVisible, 'picking Cessna switches mode, stores it and shows the instruments', J({ mode: d.mode, stored: d.stored && d.stored.mode }));
  const pageErrBefore = errors.length;
  await page.reload({ waitUntil: 'load' }); await page.evaluate(() => CHEMVENTUR.Stage3Game.ready); await sleep(400);
  d = await dbg(page);
  ok(d.mode === 'cessna' && d.opts.modeChosen, 'saved steering mode survives a page reload', d.mode);
  await S(page, () => { const St = CHEMVENTUR.Stage3Game.Steering; St.setMode('classic', { user: true, quiet: true }); });
  await page.reload({ waitUntil: 'load' }); await page.evaluate(() => CHEMVENTUR.Stage3Game.ready); await sleep(400);
  d = await dbg(page);
  ok(d.mode === 'classic', 'switching back to Classic is remembered too', d.mode);
  await close(page);

  // ?steer= override applies for the visit only
  page = await open({ query: '?steer=cessna' });
  d = await dbg(page);
  ok(d.mode === 'cessna' && !d.stored, '?steer=cessna selects Cessna for this visit without saving', J({ mode: d.mode, stored: d.stored }));
  await close(page);

  // ================= 2. CLASSIC through the command object (unchanged behaviour) =================
  console.log('## Classic (default) through the command object');
  page = await open({});
  await setup(page, 'classic');
  const C = await S(page, () => CHEMVENTUR.Stage3Game.Config.SHIP_TURN);
  await step(page, 60, ['ArrowLeft'], 1 / 60);
  let a = await att(page);
  ok(Math.abs(a.yaw - C) < 0.01, 'ArrowLeft for 1 s turns left by SHIP_TURN (' + C + ' rad/s), as before', 'yaw=' + a.yaw.toFixed(3));
  await step(page, 30, ['ArrowUp'], 1 / 60);
  a = await att(page);
  ok(Math.abs(a.pitchE - Math.min(1.35, C * 0.5)) < 0.01 && Math.abs(a.bank) < 1e-6, 'ArrowUp pitches up, still no roll in Classic', 'pitch=' + a.pitchE.toFixed(3) + ' bank=' + a.bank.toFixed(4));
  await setup(page, 'classic');
  await step(page, 30, ['KeyW'], 1 / 60);
  a = await att(page);
  ok(a.pos[2] < -1 && Math.abs(a.pos[0]) < 1e-6, 'W flies forward (−z)', 'z=' + a.pos[2].toFixed(2));
  await S(page, () => { const g = CHEMVENTUR.Stage3Game.Game; g.yaw = 0; g.pitch = 0; g.touch.pad = { x: 1, y: 0 }; });
  await step(page, 30, [], 1 / 60);
  a = await att(page);
  await S(page, () => { CHEMVENTUR.Stage3Game.Game.touch.pad = null; });
  ok(Math.abs(a.yaw + C * 0.5) < 0.01, 'steer pad right turns right (yaw −)', 'yaw=' + a.yaw.toFixed(3));
  const inv = await S(page, () => { const St = CHEMVENTUR.Stage3Game.Steering, g = CHEMVENTUR.Stage3Game.Game; St.opts.invertPitch = true; g.pitch = 0; g.keys.add('ArrowUp'); g._updateShip(0.1); g.keys.clear(); const p = g.pitch; St.opts.invertPitch = false; return p; });
  ok(inv < 0, 'invert pitch option flips Classic pitch', 'pitch=' + inv.toFixed(3));
  await close(page);

  // ================= 3. CESSNA keyboard =================
  console.log('## Cessna keyboard: aileron, elevator, rudder, throttle');
  page = await open({});
  await setup(page, 'cessna', 'off');
  await step(page, 30, ['KeyD']); a = await att(page);
  ok(a.bank > 0.4, 'D = aileron right: banks right', 'bank=' + a.bank.toFixed(2));
  await setup(page, 'cessna', 'off');
  await step(page, 30, ['KeyA']); a = await att(page);
  ok(a.bank < -0.4, 'A = aileron left: banks left', 'bank=' + a.bank.toFixed(2));
  await setup(page, 'cessna', 'off');
  await step(page, 30, ['KeyS']); a = await att(page);
  ok(a.pitch > 0.2, 'S = elevator back: nose up', 'pitch=' + a.pitch.toFixed(2));
  await setup(page, 'cessna', 'off');
  await step(page, 30, ['KeyW']); a = await att(page);
  ok(a.pitch < -0.2, 'W = elevator forward: nose down', 'pitch=' + a.pitch.toFixed(2));
  await setup(page, 'cessna', 'off');
  await step(page, 30, ['KeyE']); a = await att(page);
  ok(a.fx > 0.1 && Math.abs(a.bank) < 0.05, 'E = rudder right: yaws right without rolling', 'fx=' + a.fx.toFixed(2) + ' bank=' + a.bank.toFixed(3));
  await setup(page, 'cessna', 'off');
  await step(page, 30, ['KeyQ']); a = await att(page);
  ok(a.fx < -0.1, 'Q = rudder left: yaws left', 'fx=' + a.fx.toFixed(2));
  await setup(page, 'cessna', 'arcade');
  await step(page, 30, ['KeyR']); const t1 = (await att(page)).thr;
  await step(page, 60, []); const t2 = (await att(page)).thr;
  ok(t1 > 0.55 && Math.abs(t2 - t1) < 1e-9, 'R raises the throttle and it is HELD after release', t1.toFixed(3) + ' → ' + t2.toFixed(3));
  await step(page, 30, ['KeyF']); const t3 = (await att(page)).thr;
  ok(t3 < t1 - 0.2, 'F lowers the throttle', t3.toFixed(3));
  await step(page, 400, ['KeyR']); const t4 = (await att(page)).thr;
  ok(t4 === 1, 'throttle is clamped at 100 %', String(t4));
  await step(page, 120, []); a = await att(page);
  const speed = await S(page, () => CHEMVENTUR.Stage3Game.Game.shipVel.length());
  ok(speed > 15 && a.pos[2] < -20, 'full throttle flies fast along the nose', 'speed=' + speed.toFixed(1) + ' z=' + a.pos[2].toFixed(1));
  await setup(page, 'cessna', 'arcade');
  await step(page, 60, ['KeyD']);
  a = await att(page);
  ok(Math.abs(a.camUp[1]) < 0.999 && a.camUp[0] > 0.05, 'camera up blends towards the ship up when banked right', J(a.camUp.map(x => +x.toFixed(2))));
  ok(await S(page, () => CHEMVENTUR.Stage3Game.Steering.setMode('classic', { quiet: true }) && CHEMVENTUR.Stage3Game.Game.camera.up.y === 1), 'leaving Cessna restores the camera up vector');
  await close(page);

  // ================= 4. ASSIST LEVELS =================
  console.log('## assist levels');
  const assistRun = async (lvl) => {
    const p = await open({}); await setup(p, 'cessna', lvl);
    await step(p, 24, ['KeyD']); await step(p, 24, ['KeyS']);
    const mid = await att(p); await step(p, 60, []);
    const r1 = await att(p); await step(p, 240, []); const r2 = await att(p);
    await close(p); return { mid, r1, r2 };
  };
  const off = await assistRun('off'), stab = await assistRun('stability'), arc = await assistRun('arcade');
  ok(Math.abs(off.r1.wr) > 0.15, 'Off: the ship keeps rolling after the stick is released', 'roll rate after 1 s=' + off.r1.wr.toFixed(2));
  ok(Math.abs(stab.r1.wr) < 0.02 && Math.abs(stab.r2.bank) > 0.3, 'Stability: rotation stops when released, bank is kept', 'rate=' + stab.r1.wr.toFixed(3) + ' bank=' + stab.r2.bank.toFixed(2));
  ok(Math.abs(arc.mid.bank) > 0.3 && Math.abs(arc.r2.bank) < 0.1 && Math.abs(arc.r2.pitch) < 0.1, 'Arcade: auto-levels wings and nose within 5 s', 'bank ' + arc.mid.bank.toFixed(2) + ' → ' + arc.r2.bank.toFixed(3) + ', pitch ' + arc.mid.pitch.toFixed(2) + ' → ' + arc.r2.pitch.toFixed(3));
  const turn = await (async () => { const p = await open({}); await setup(p, 'cessna', 'arcade'); await step(p, 30, ['KeyD']); await step(p, 60, []); const r = await att(p); await close(p); return r; })();
  ok(turn.fx > 0.1, 'Arcade: a banked ship also turns (coordinated turn) with no rudder', 'fx=' + turn.fx.toFixed(2));

  // ================= 5. SOFT TURN-BACK =================
  console.log('## soft turn-back near the arena edge');
  page = await open({});
  const R = await S(page, () => ({ soft: CHEMVENTUR.Stage3Game.Steering.R_SOFT, hard: CHEMVENTUR.Stage3Game.Steering.R_HARD }));
  for (const [name, lvl, dir] of [['heading straight at the wall', 'arcade', [0, 0, -1]], ['heading at the wall (assist Off)', 'off', [0, 0, -1]], ['grazing the wall', 'arcade', [0.9, 0, -0.44]]]) {
    await setup(page, 'cessna', lvl);
    await S(page, (R, dir) => {
      const g = CHEMVENTUR.Stage3Game.Game, T = CHEMVENTUR.Stage3Game.THREE, St = CHEMVENTUR.Stage3Game.Steering;
      const f = new T.Vector3(...dir).normalize(); g.ship.position.copy(f).multiplyScalar(R.soft - 2);
      g.ship.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), f); St.flight.throttle = 1; St.flight.speed = 26; g.shipVel.copy(f).multiplyScalar(26);
    }, R, dir);
    await step(page, 60 * 8, []);
    const dd = await dbg(page); a = await att(page);
    const outward = await S(page, () => { const g = CHEMVENTUR.Stage3Game.Game, T = CHEMVENTUR.Stage3Game.THREE; const f = new T.Vector3(0, 0, -1).applyQuaternion(g.ship.quaternion); return f.dot(g.ship.position.clone().normalize()); });
    ok(dd.flight.hardClamps === 0 && dd.flight.softTurns > 10 && dd.flight.maxDist < R.hard, 'soft turn-back, ' + name + ': never reaches the hard wall (no bounce)', 'max dist ' + dd.flight.maxDist.toFixed(1) + ' < ' + R.hard.toFixed(1) + ', soft frames=' + dd.flight.softTurns + ', clamps=' + dd.flight.hardClamps);
    ok(outward < 0.3, '  … and is heading back inwards afterwards', 'outward component ' + outward.toFixed(2));
  }
  await setup(page, 'cessna', 'arcade');
  await S(page, () => { const g = CHEMVENTUR.Stage3Game.Game; g.ship.position.set(0, 0, -(CHEMVENTUR.Stage3Game.Steering.R_SOFT + 8)); });
  await step(page, 5, []);
  ok((await dbg(page)).flight.edge === true, 'edge warning flag is set in the soft zone');
  await close(page);

  // ================= 6. OPTIONS PANEL =================
  console.log('## options window');
  page = await open({});
  await page.click('.s3g-start .s3g-start-btn'); await sleep(200);
  ok(!(await dbg(page)).panelOpen, 'options window is closed at first');
  await page.keyboard.press('KeyO'); d = await dbg(page);
  ok(d.panelOpen, 'O opens the options window');
  await page.keyboard.press('Escape'); d = await dbg(page);
  ok(!d.panelOpen, 'Escape closes it');
  await page.click('.s3g-ptog-gear'); d = await dbg(page);
  ok(d.panelOpen, 'the ⚙ gear button opens it');
  const opt = (sel) => page.$(sel);
  const setRange = (key, v) => S(page, (key, v) => { const i = document.querySelector('.s3g-optpanel input[data-opt=' + key + ']'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, key, v);
  await setRange('sens', 1.5); await setRange('deadzone', 0.15); await setRange('expo', 0.5);
  await page.click('.s3g-optpanel input[data-opt=invertPitch]'); await page.click('.s3g-optpanel input[data-opt=leftHanded]'); await page.click('.s3g-optpanel input[data-opt=autoPad]');
  await page.click('.s3g-optpanel .s3g-assistbtn[data-assist=stability]');
  await page.click('.s3g-optpanel .s3g-steerbtn[data-mode=cessna]');
  d = await dbg(page);
  ok(d.opts.sens === 1.5 && d.opts.deadzone === 0.15 && d.opts.expo === 0.5, 'sensitivity, deadzone and expo sliders change the settings', J({ s: d.opts.sens, dz: d.opts.deadzone, ex: d.opts.expo }));
  ok(d.opts.invertPitch === true && d.opts.leftHanded === true && d.opts.autoPad === false && d.opts.assist === 'stability' && d.mode === 'cessna', 'invert pitch, left-handed, auto-switch, assist and mode controls work', J(d.opts));
  ok(await S(page, () => document.querySelector('.s3g-hud').classList.contains('s3g-lefty')), 'left-handed adds the swap class to the HUD');
  ok(d.stored && d.stored.sens === 1.5 && d.stored.assist === 'stability' && d.stored.leftHanded === true && d.stored.mode === 'cessna', 'every option is stored in localStorage ' + KEY, J(d.stored));
  await page.screenshot({ path: path.join(shotDir, 'steer-options.png') });
  await page.reload({ waitUntil: 'load' }); await page.evaluate(() => CHEMVENTUR.Stage3Game.ready); await sleep(400);
  d = await dbg(page);
  const lefty = await S(page, () => document.querySelector('.s3g-hud').classList.contains('s3g-lefty'));
  ok(d.opts.sens === 1.5 && d.opts.deadzone === 0.15 && d.opts.invertPitch && d.opts.assist === 'stability' && d.mode === 'cessna' && lefty, 'options are all restored after reload', J(d.opts));
  await page.keyboard.press('KeyO');
  await page.click('.s3g-optpanel .s3g-row .s3g-btn');   // ↺ Defaults (first button)
  d = await dbg(page);
  ok(d.opts.sens === 1 && d.mode === 'classic' && !d.opts.leftHanded && d.opts.assist === 'arcade', '↺ Defaults resets everything', J(d.opts));
  // shaping + invert effect in Cessna
  const sh = await S(page, () => { const s = CHEMVENTUR.Stage3Game.Steering.shape; return [s(0.05, 0.08, 0.35), s(1, 0.08, 0.35), s(-1, 0.08, 0.35), s(0.5, 0.08, 0.35), s(0.5, 0.08, 0)]; });
  ok(sh[0] === 0 && Math.abs(sh[1] - 1) < 1e-9 && Math.abs(sh[2] + 1) < 1e-9 && sh[3] < sh[4] && sh[3] > 0, 'deadzone zeroes small deflections; expo softens the middle but keeps the full-scale end', J(sh.map(x => +x.toFixed(3))));
  await page.keyboard.press('Escape');
  await setup(page, 'cessna', 'off');
  await S(page, () => { CHEMVENTUR.Stage3Game.Steering.opts.invertPitch = true; });
  await step(page, 30, ['KeyS']); a = await att(page);
  ok(a.pitch < -0.2, 'invert pitch flips the Cessna elevator', 'pitch=' + a.pitch.toFixed(2));
  await close(page);
  await page.screenshot; // no-op

  // ================= 7. CESSNA DESKTOP SCREENSHOT =================
  page = await open({ query: '?steer=cessna' });
  await S(page, () => { const G = CHEMVENTUR.Stage3Game, g = G.Game; g.start(); g.keys.add('KeyD'); g.keys.add('KeyS'); });
  await sleep(1100);
  await S(page, () => { CHEMVENTUR.Stage3Game.Game.keys.clear(); });
  await sleep(250);
  await page.screenshot({ path: path.join(shotDir, 'steer-cessna-desktop.png') });
  d = await dbg(page);
  ok(d.instrVisible && Math.abs(d.flight.bank) > 0.1, 'desktop Cessna: instruments visible and the real frame loop banks the ship', 'bank=' + d.flight.bank.toFixed(2) + ' speed=' + d.flight.speed.toFixed(1));
  const instr = await S(page, () => { const r = document.querySelector('.s3g-att').getBoundingClientRect(); const c = document.querySelector('.s3g-att'); const px = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data; return { w: r.width, painted: px[3] > 0 }; });
  ok(instr.w >= 60 && instr.painted, 'attitude indicator is drawn', J(instr));
  await close(page);

  // ================= 8. TOUCH: phone + tablet, landscape + portrait =================
  const SIZES = [
    ['phone landscape', 844, 390, 'phone', 'landscape'], ['phone portrait', 390, 844, 'phone', 'portrait'],
    ['tablet landscape', 1180, 820, 'tablet', 'landscape'], ['tablet portrait', 1024, 1366, 'tablet', 'portrait']
  ];
  const stickW = {};
  for (const [label, w, h, cls, orient] of SIZES) {
    console.log('## touch: ' + label + ' ' + w + '×' + h);
    page = await open({ w, h, touch: true, dsf: 2, query: '?steer=cessna' });
    d = await dbg(page);
    ok(d.device.cls === cls && d.device.touchPrimary && d.device.orient === orient, 'device detected as ' + cls + ' · touch · ' + orient, J(d.device));
    ok(d.mode === 'cessna', 'Cessna selected for this visit');
    const prompt = await S(page, () => getComputedStyle(document.querySelector('#v120-rotate')).display);
    ok((orient === 'portrait' && w <= 900) ? prompt === 'flex' : prompt === 'none', 'rotate prompt unchanged: ' + ((orient === 'portrait' && w <= 900) ? 'shown on a narrow portrait screen' : 'not shown'), prompt);
    if (prompt !== 'none') await page.addStyleTag({ content: '#v120-rotate{display:none!important}' });   // only to test the portrait layout underneath
    await S(page, () => { CHEMVENTUR.Stage3Game.Game.start(); });
    await sleep(300);
    const lay = await S(page, () => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, disp: getComputedStyle(e).display }; };
      return { L: r('.s3g-stick-left'), R: r('.s3g-stick-right'), bar: r('.s3g-touchbar'), instr: r('.s3g-instr'), guns: r('.s3g-guns'), oldPad: r('.s3g-pad-left'), vw: innerWidth, vh: innerHeight,
        ta: getComputedStyle(document.querySelector('.s3g-stick-left')).touchAction, ta2: getComputedStyle(document.querySelector('.s3g-stick-right')).touchAction };
    });
    const hit = (A, B) => A && B && A.x < B.r && A.r > B.x && A.y < B.b && A.b > B.y;
    ok(lay.L.disp === 'block' && lay.R.disp === 'block' && lay.oldPad.disp === 'none' && lay.bar.disp === 'flex', 'both sticks and the touch bar are shown; the Classic pads are hidden', J({ L: lay.L.disp, R: lay.R.disp, bar: lay.bar.disp }));
    ok(lay.ta === 'none' && lay.ta2 === 'none', 'sticks use touch-action: none');
    ok(Math.abs(lay.L.w - lay.R.w) < 1 && lay.L.w >= 96 && lay.L.w <= 190, 'sticks are ' + Math.round(lay.L.w) + ' px wide (scaled with the screen, within 96–190)');
    stickW[label] = lay.L.w;
    const inside = (A) => A.x >= 0 && A.r <= lay.vw + 0.5 && A.y >= 0 && A.b <= lay.vh + 0.5;
    ok(inside(lay.L) && inside(lay.R) && inside(lay.bar), 'sticks and touch bar are fully on screen');
    ok(!hit(lay.L, lay.R) && !hit(lay.L, lay.bar) && !hit(lay.R, lay.bar), 'touch bar does not overlap either stick, and the sticks do not overlap each other', J({ L: [lay.L.x, lay.L.r], bar: [lay.bar.x, lay.bar.r], R: [lay.R.x, lay.R.r] }));
    ok(!hit(lay.instr, lay.L) && !hit(lay.instr, lay.R) && !hit(lay.instr, lay.bar), 'instruments do not overlap sticks or touch bar');
    ok(!hit(lay.guns, lay.L) && !hit(lay.guns, lay.R), 'gun icons do not overlap the sticks', J({ guns: lay.guns && [lay.guns.x, lay.guns.r, lay.guns.y, lay.guns.b] }));

    // multi-touch via the browser's own touch input: both sticks + FIRE at the same time
    const cdp = await page.createCDPSession();
    const ctr = (A) => ({ x: Math.round(A.x + A.w / 2), y: Math.round(A.y + A.h / 2) });
    const cL = ctr(lay.L), cR = ctr(lay.R), fireBtn = await S(page, () => { const b = document.querySelector('.s3g-tbtn').getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; });
    const thrBefore = (await dbg(page)).flight.throttle;
    const pt = (p, id, dx, dy) => ({ x: p.x + (dx || 0), y: p.y + (dy || 0), id });
    const rr = lay.R.w / 2, lr = lay.L.w / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cL, 1), pt(cR, 2), pt(fireBtn, 3)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(cL, 1, lr * 0.7, -lr * 0.7), pt(cR, 2, rr * 0.7, -rr * 0.7), pt(fireBtn, 3)] });
    await sleep(500);
    d = await dbg(page);
    const fire = await S(page, () => CHEMVENTUR.Stage3Game.Game.touch.fire);
    ok(d.sticks.L.active && d.sticks.R.active, 'both sticks are active at the same time (multi-touch pointer capture)', J(d.sticks));
    ok(d.sticks.R.x > 0.5 && d.sticks.R.y < -0.5, 'right stick: right + up read as aileron right / elevator (stick up reads as negative y)', J(d.sticks.R));
    ok(d.sticks.L.x > 0.5 && d.sticks.L.y < -0.5, 'left stick: right + up read as rudder right / throttle up', J(d.sticks.L));
    ok(fire === true, 'the FIRE button works while both sticks are held (third finger)');
    ok(d.flight.throttle > thrBefore + 0.1 && d.last && d.last.rollRate > 0.3 && d.last.yawRate > 0.3, 'command carries aileron, rudder and throttle', J({ thr: d.flight.throttle, roll: d.last && d.last.rollRate, yaw: d.last && d.last.yawRate, pitch: d.last && d.last.pitchRate }));
    if (label === 'phone landscape') await page.screenshot({ path: path.join(shotDir, 'steer-cessna-phone.png') });
    if (label === 'tablet landscape') await page.screenshot({ path: path.join(shotDir, 'steer-cessna-tablet.png') });
    const knob = await S(page, () => document.querySelector('.s3g-stick-right .s3g-stick-knob').style.transform);
    ok(/translate\(/.test(knob) && !/translate\(0px, ?0px\)/.test(knob), 'stick knob follows the finger', knob);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pt(cR, 2, rr * 0.7, -rr * 0.7)] });   // lift only the right stick
    await sleep(120);
    d = await dbg(page);
    ok(!d.sticks.R.active && d.sticks.L.active, 'lifting one finger releases only that stick');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
    d = await dbg(page);
    const thrHeld = d.flight.throttle; await sleep(400); const d2 = await dbg(page);
    ok(Math.abs(d.sticks.R.x) < 0.01 && Math.abs(d.sticks.L.x) < 0.01 && Math.abs(d.sticks.L.y) < 0.01 && !d.sticks.L.active, 'sticks spring back to the centre', J({ R: d.sticks.R, L: d.sticks.L }));
    ok(d2.flight.throttle === thrHeld && thrHeld > thrBefore + 0.1, 'the throttle lever HOLDS after release', thrBefore.toFixed(2) + ' → ' + d2.flight.throttle.toFixed(2));
    ok(!(await S(page, () => CHEMVENTUR.Stage3Game.Game.touch.fire)), 'FIRE is released with the finger');
    // page must not scroll / zoom: no scroll offset and the document does not overflow
    const sc = await S(page, () => ({ y: scrollY, x: scrollX, ow: document.documentElement.scrollWidth <= innerWidth + 1 }));
    ok(sc.y === 0 && sc.x === 0 && sc.ow, 'no scrolling or overflow while steering', J(sc));
    // left-handed: swap
    await S(page, () => { CHEMVENTUR.Stage3Game.Steering.opts.leftHanded = true; CHEMVENTUR.Stage3Game.Steering.layout(); });
    await sleep(100);
    const lh = await S(page, () => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom }; }; return { L: r('.s3g-stick-left'), R: r('.s3g-stick-right'), bar: r('.s3g-touchbar'), vw: innerWidth }; });
    ok(lh.L.x > lh.R.x && !hit(lh.L, lh.bar) && !hit(lh.R, lh.bar) && lh.bar.x >= 0 && lh.bar.r <= lh.vw, 'left-handed swaps the sticks and the touch bar without overlap', J({ Lx: Math.round(lh.L.x), Rx: Math.round(lh.R.x), bar: [Math.round(lh.bar.x), Math.round(lh.bar.r)] }));
    await close(page);
  }
  ok(stickW['tablet landscape'] > stickW['phone landscape'], 'tablet sticks are larger than phone sticks', Math.round(stickW['phone landscape']) + ' px (phone) < ' + Math.round(stickW['tablet landscape']) + ' px (tablet)');

  // layout hooks that need a real notch: check the CSS carries the safe-area insets and the viewport meta asks for the full screen
  page = await open({});
  const css = await S(page, async () => {
    const txt = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n');
    return { env: /safe-area-inset-left/.test(txt) && /safe-area-inset-bottom/.test(txt) && /safe-area-inset-right/.test(txt) && /safe-area-inset-top/.test(txt), meta: document.querySelector('meta[name=viewport]').content };
  });
  ok(css.env && /viewport-fit=cover/.test(css.meta), 'safe-area insets are used (env(safe-area-inset-*)) and the viewport covers notched screens', css.meta);
  await close(page);

  // touch tablet with a Classic default: touch devices keep Classic pads; no Cessna sticks until chosen
  page = await open({ w: 1180, h: 820, touch: true });
  d = await dbg(page);
  const vis = await S(page, () => ({ st: getComputedStyle(document.querySelector('.s3g-stick-left')).display, pad: getComputedStyle(document.querySelector('.s3g-pad-left')).display }));
  ok(d.mode === 'classic' && vis.st === 'none' && vis.pad !== 'none', 'touch default: Classic pads; the Cessna sticks only appear after choosing Cessna', J(vis));
  await S(page, () => CHEMVENTUR.Stage3Game.Steering.setMode('cessna', { user: true, quiet: true }));
  const vis2 = await S(page, () => ({ st: getComputedStyle(document.querySelector('.s3g-stick-left')).display, pad: getComputedStyle(document.querySelector('.s3g-pad-left')).display }));
  ok(vis2.st === 'block' && vis2.pad === 'none', 'choosing Cessna on touch swaps the pads for the sticks', J(vis2));
  await close(page);

  // ================= 9. GAMEPAD (mocked navigator.getGamepads) =================
  console.log('## gamepad (mocked)');
  const mockPre = () => {
    window.__pad = null;
    navigator.getGamepads = () => [window.__pad, null, null, null];
    window.__mkpad = (axes, pressed) => ({ id: 'Mock Controller (STANDARD GAMEPAD Vendor: 0000)', index: 0, connected: true, mapping: 'standard', axes: axes || [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => { const v = (pressed && pressed[i] != null) ? pressed[i] : 0; return { pressed: v > 0.5, touched: v > 0, value: v }; }) });
    window.__connect = (p) => { window.__pad = p; const e = new Event('gamepadconnected'); e.gamepad = p; window.dispatchEvent(e); };
    window.__disconnect = () => { const p = window.__pad; window.__pad = null; const e = new Event('gamepaddisconnected'); e.gamepad = p; window.dispatchEvent(e); };
  };
  page = await open({ pre: mockPre });
  ok(await S(page, () => !CHEMVENTUR.Stage3Game.Game.started), 'game waits on the start screen');
  await S(page, () => window.__connect(window.__mkpad()));
  await sleep(150);
  let toast = await S(page, () => document.querySelector('.s3g-status').textContent);
  ok(/Controller connected/.test(toast) && /Mock Controller/.test(toast), 'connect toast names the controller', toast);
  d = await dbg(page);
  ok(d.pad && d.mode === 'classic' && !d.panelOpen, 'controller is read but does not take over until a button is pressed');
  await S(page, () => { window.__pad = window.__mkpad([0, 0, 0, 0], { 0: 1 }); });   // press A
  await sleep(250);
  d = await dbg(page);
  ok(d.mode === 'gamepad' && await S(page, () => CHEMVENTUR.Stage3Game.Game.started), '"press any button": the first press starts the game and switches to Gamepad (auto-switch)', 'mode=' + d.mode);
  ok(d.fireHeld, 'A / R1 hold = fire', String(d.fireHeld));
  await S(page, () => { window.__pad = window.__mkpad([0.05, 0.9, 0.9, -0.6], { 7: 1 }); });
  await sleep(250);
  const gc = await S(page, () => { const St = CHEMVENTUR.Stage3Game.Steering; return St.command(CHEMVENTUR.Stage3Game.Game, 1 / 60); });
  ok(gc.move.x === 0, 'left stick inside the deadzone is ignored', 'move.x=' + gc.move.x);
  ok(gc.move.z > 0.5, 'left stick back = move back (+z)', 'move.z=' + gc.move.z.toFixed(2));
  ok(gc.yawRate > 0.5 && gc.pitchRate > 0.3, 'right stick right / up = turn right / nose up', 'yaw=' + gc.yawRate.toFixed(2) + ' pitch=' + gc.pitchRate.toFixed(2));
  ok(gc.move.y > 0.9, 'R2 = move up', 'move.y=' + gc.move.y.toFixed(2));
  // Cessna + controller: axes steer the aircraft
  await setup(page, 'cessna', 'off');
  await S(page, () => { window.__pad = window.__mkpad([0, 0, 0.9, 0], {}); });
  await sleep(120);
  await step(page, 30, []); a = await att(page);
  ok(a.bank > 0.4, 'Cessna + controller: right stick right banks right', 'bank=' + a.bank.toFixed(2));
  await S(page, () => window.__disconnect());
  await sleep(150);
  toast = await S(page, () => document.querySelector('.s3g-status').textContent);
  d = await dbg(page);
  ok(/Controller disconnected/.test(toast) && d.pad === null && d.fireHeld === false, 'disconnect toast shown and the controller is released', toast);
  await close(page);

  page = await open({ pre: mockPre });
  await S(page, () => { const St = CHEMVENTUR.Stage3Game.Steering; St.opts.autoPad = false; St.save(); window.__connect(window.__mkpad()); window.__pad = window.__mkpad([0, 0, 0, 0], { 0: 1 }); });
  await sleep(250);
  d = await dbg(page);
  ok(d.mode === 'classic' && await S(page, () => CHEMVENTUR.Stage3Game.Game.started), 'with auto-switch off the mode stays but a button press still starts the game', d.mode);
  await close(page);

  // ================= 10. page health =================
  ok(errors.length === 0, 'no page or console errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
