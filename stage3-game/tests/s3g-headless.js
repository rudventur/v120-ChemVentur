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

  await sleep(5500); // let molecule rain run once
  st = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.state());
  ok(st.fps > 0, 'loop still running after ~15 s', JSON.stringify({ fps: st.fps, atoms: st.atoms, bonds: st.bonds, score: st.score }));
  ok(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
