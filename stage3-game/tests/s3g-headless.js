/* Headless-Chrome test for the Stage 3 3D game (dev only).
   npm i puppeteer-core ; serve this folder (python3 -m http.server 8790)
   CHROME=/usr/bin/google-chrome node tests/s3g-headless.js http://localhost:8790/ [outDir] */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const url = process.argv[2] || 'http://localhost:8790/';
const outDir = process.argv[3] || path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + m + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const expectFreq = st => Math.round(440 * Math.pow(2, (st - 9) / 12) * 100) / 100;
const CHROMATIC = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 760 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push('console: ' + m.text()); });

  console.log('# ' + url);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => CHEMVENTUR.Stage3Game.ready);
  await sleep(800);
  let st = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.state());
  ok(st.booted && st.three === '169', 'boots, three.js r' + st.three + ' loaded', st.threeUrl);
  await page.screenshot({ path: path.join(outDir, 'screenshot-start.png') });

  await page.evaluate(() => CHEMVENTUR.Stage3Game.start());
  await sleep(600);
  // the core checks below run with cinematics OFF (slow motion would change their timing); K is tested here
  await page.keyboard.press('KeyK');
  const cinOff = await page.evaluate(() => CHEMVENTUR.Stage3Game.Cinematic.debugState().enabled);
  ok(cinOff === false, 'K turns first-discovery cinematics off', 'enabled=' + cinOff);
  const px = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.sampleCanvas());
  st = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.state());
  ok(px.litFraction > 0.01 && st.drawCalls > 20, 'WebGL renders the 3D scene', JSON.stringify({ px, drawCalls: st.drawCalls, triangles: st.triangles, atoms: st.atoms, fps: st.fps }));
  ok(st.audio === 'running', 'Web Audio context running', st.audio);

  // --- c2c 13 / c2c 8 via the debug hook
  for (const [mode, sts, label] of [['chromatic', CHROMATIC, 'c2c 13'], ['major', MAJOR, 'c2c 8']]) {
    const r = await page.evaluate(m => CHEMVENTUR.Stage3Game.debug.fireC2C(m), mode);
    const exp = sts.map(expectFreq);
    ok(r.label === label && r.count === sts.length, label + ': exactly ' + sts.length + ' projectiles', 'count=' + r.count + ' projIds=' + new Set(r.shots.map(s => s.projId)).size);
    ok(r.distinctColors === sts.length && r.distinctRadii === sts.length, label + ': every dot has its own colour and size', 'colours=' + r.distinctColors + ' sizes=' + r.distinctRadii);
    const fOk = r.shots.every((s, i) => Math.abs(s.freq - exp[i]) < 0.011) && r.tones.length === sts.length && r.tones.every((t, i) => Math.abs(t.oscFreq - exp[i]) < 0.02 && t.state === 'running');
    ok(fOk, label + ': oscillator frequencies = equal temperament C4→C5', r.tones.map(t => t.note + '=' + (Math.round(t.oscFreq * 100) / 100)).join(' '));
    const times = r.shots.map(s => s.t);
    ok(times.every((t, i) => i === 0 || t > times[i - 1]), label + ': fired in sequence', times.join(',') + ' ms');
  }

  // --- keyboard: gun 2 + C toggles label
  await page.keyboard.press('Digit2');
  const lbl1 = await page.$eval('.s3g-mode', b => b.textContent);
  await page.keyboard.press('KeyC');
  const lbl2 = await page.$eval('.s3g-mode', b => b.textContent);
  await page.keyboard.press('KeyC');
  ok(lbl1 !== lbl2 && ['c2c 13', 'c2c 8'].includes(lbl1) && ['c2c 13', 'c2c 8'].includes(lbl2), 'C key toggles HUD label', lbl1 + ' -> ' + lbl2);

  // --- mid-flight c2c screenshot (keyboard fire)
  await page.evaluate(() => { CHEMVENTUR.Stage3Game.Game.c2cMode = 'chromatic'; });
  await page.keyboard.press('Space');
  await sleep(950);
  const dots = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.state().dots);
  ok(dots >= 8, 'Space fires c2c dots (in flight)', 'dots=' + dots);
  await page.screenshot({ path: path.join(outDir, 'screenshot-c2c.png') });

  // --- atom gun + flight
  await page.keyboard.press('Digit1');
  const a0 = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.state().atoms);
  const z0 = await page.evaluate(() => CHEMVENTUR.Stage3Game.Game.ship.position.z);
  await page.keyboard.down('Space'); await page.keyboard.down('KeyW');
  await sleep(800);
  await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
  const a1 = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.state().atoms);
  const z1 = await page.evaluate(() => CHEMVENTUR.Stage3Game.Game.ship.position.z);
  ok(a1 > a0 || a1 >= 255, 'ATOM gun spawns atoms', a0 + ' -> ' + a1);
  ok(z1 < z0 - 2, 'W flies the ship forward', z0.toFixed(1) + ' -> ' + z1.toFixed(1));

  // --- RDKit + PubChem identification, then swap in conformer
  const id = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.identifyEthanolSkeleton());
  ok(id && id.title === 'Ethanol' && id.cid === 702 && id.canonical === 'CCO' && id.is3D, 'What did I build? C–C–O -> Ethanol (RDKit + PubChem)', JSON.stringify(id));
  const sw = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.swap());
  ok(sw && sw.atoms === 9 && sw.bonds === 8, 'swap in PubChem 3D conformer (9 atoms incl. H)', JSON.stringify(sw));
  await sleep(500);
  await page.screenshot({ path: path.join(outDir, 'screenshot-identify.png') });

  // ===== FIRST DISCOVERY cinematic =====
  const cin = () => page.evaluate(() => CHEMVENTUR.Stage3Game.Cinematic.debugState());
  await page.keyboard.down('ShiftLeft'); await page.keyboard.press('KeyK'); await page.keyboard.up('ShiftLeft');
  let cs = await cin();
  const storedBefore = await page.evaluate(() => localStorage.getItem('cv.s3g.discoveries.v1'));
  ok(cs.discovered.length === 0 && storedBefore === '{}', 'Shift+K resets discoveries (localStorage cleared)', 'discovered=' + cs.discovered.length);
  await page.keyboard.press('KeyK');
  cs = await cin();
  ok(cs.enabled === true && cs.active === null && cs.timeScale === 1, 'K turns cinematics back on', JSON.stringify({ enabled: cs.enabled, timeScale: cs.timeScale }));

  // first single bond, 25 units ahead of the ship (world atoms, so no element discovery)
  const makeBond = () => page.evaluate(() => {
    const G = CHEMVENTUR.Stage3Game, W = G.World, g = G.Game, n = g._nose(), f = g._forward();
    const c = { x: n.x + f.x * 25, y: n.y + f.y * 25, z: n.z + f.z * 25 };
    const a = W.spawnAtom('C', { x: c.x - 0.8, y: c.y, z: c.z }, null, 'world');
    const b = W.spawnAtom('C', { x: c.x + 0.8, y: c.y, z: c.z }, null, 'world');
    W.bond(a, b, 1, true);
    const cp = g.camera.position;
    return { c, camDist: Math.hypot(cp.x - c.x, cp.y - c.y, cp.z - c.z) };
  });
  const ev = await makeBond();
  await sleep(1100);
  cs = await cin();
  const camDist = Math.hypot(cs.camera.x - ev.c.x, cs.camera.y - ev.c.y, cs.camera.z - ev.c.z);
  const camOff = Math.hypot(cs.camera.x - cs.camBase.x, cs.camera.y - cs.camBase.y, cs.camera.z - cs.camBase.z);
  ok(cs.active && cs.active.key === 'bond:1' && cs.timeScale <= 0.25, 'first bond starts a cinematic with slow motion', JSON.stringify({ active: cs.active && cs.active.name, t: cs.active && cs.active.t, timeScale: cs.timeScale }));
  ok(camDist < ev.camDist * 0.5 && camOff > 5, 'camera moves into a close-up', 'distance to event ' + ev.camDist.toFixed(1) + ' -> ' + camDist.toFixed(1) + ', offset from chase cam ' + camOff.toFixed(1));
  ok(cs.bannerVisible && cs.bannerText === 'FIRST DISCOVERY: Single bond', 'neon banner shows', JSON.stringify(cs.bannerText));
  await page.waitForFunction(() => !CHEMVENTUR.Stage3Game.Cinematic.active, { timeout: 8000 });
  cs = await cin();
  const ended = cs.log.find(l => l.key === 'bond:1');
  ok(ended && Math.abs(ended.ms - 2500) < 400 && cs.timeScale === 1 && !cs.bannerVisible, 'cinematic ends after ~2.5 s, speed and camera back to normal', JSON.stringify({ ms: ended && ended.ms, timeScale: cs.timeScale, banner: cs.bannerVisible }));
  await sleep(300);
  const back = await cin();
  const camBack = Math.hypot(back.camera.x - back.camBase.x, back.camera.y - back.camBase.y, back.camera.z - back.camBase.z);
  ok(camBack < 0.01, 'camera is back on the chase position', 'offset=' + camBack.toFixed(3));
  const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cv.s3g.discoveries.v1'))));
  ok(stored.includes('bond:1'), 'discovery persisted in localStorage', JSON.stringify(stored));

  const logLen = back.log.length;
  await makeBond();
  await sleep(700);
  cs = await cin();
  ok(!cs.active && cs.queue.length === 0 && cs.log.length === logLen && cs.timeScale === 1, 'a second identical bond does NOT retrigger', JSON.stringify({ active: cs.active, queue: cs.queue, log: cs.log.length }));

  // new molecule: C-C-O skeleton -> queue (Carbon, Oxygen) then Ethanol once identified; one at a time
  const idP = page.evaluate(() => CHEMVENTUR.Stage3Game.debug.identifyEthanolSkeleton());
  await sleep(250);
  cs = await cin();
  ok(cs.active && cs.active.name === 'Carbon' && cs.queue.includes('Oxygen'), 'overlapping discoveries queue (one plays, others wait)', JSON.stringify({ active: cs.active && cs.active.name, queue: cs.queue }));
  const id2 = await idP;
  await page.waitForFunction(() => { const a = CHEMVENTUR.Stage3Game.Cinematic.active; return a && a.key === 'mol:cid702' && a.t > 1.0; }, { timeout: 15000, polling: 50 });
  cs = await cin();
  ok(id2 && id2.cid === 702 && cs.bannerText === 'FIRST DISCOVERY: Ethanol' && cs.timeScale <= 0.25, 'new molecule -> FIRST DISCOVERY: Ethanol (PubChem name)', JSON.stringify({ banner: cs.bannerText, timeScale: cs.timeScale }));
  await page.screenshot({ path: path.join(outDir, 'screenshot-cinematic.png') });
  await page.waitForFunction(() => !CHEMVENTUR.Stage3Game.Cinematic.active && !CHEMVENTUR.Stage3Game.Cinematic.queue.length, { timeout: 8000 });
  const n2 = (await cin()).log.length;
  const id3 = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.identifyEthanolSkeleton());
  await sleep(500);
  cs = await cin();
  ok(id3 && id3.cid === 702 && !cs.active && cs.log.length === n2, 'identifying Ethanol again does NOT retrigger', JSON.stringify(cs.log.map(l => l.name + ' ' + l.ms + 'ms')));

  await sleep(5500); // let molecule rain run once
  st = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.state());
  ok(st.fps > 0, 'loop still running after ~15 s', JSON.stringify({ fps: st.fps, atoms: st.atoms, bonds: st.bonds, score: st.score }));
  ok(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
