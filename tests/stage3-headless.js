/* Headless-browser check (dev-only). Needs: npm i puppeteer-core, a local Chrome,
   and the folder served over http (e.g. `python3 -m http.server 8765`).
   Usage:
     CHROME=/usr/bin/google-chrome node tests/stage3-headless.js http://localhost:8765/stage3-test.html [screenshot.png]
     ... node tests/stage3-headless.js http://localhost:8766/index.html shot.png --game   (v118 copy with tags added) */
'use strict';
const puppeteer = require('puppeteer-core');

const url = process.argv[2] || 'http://localhost:8765/stage3-test.html';
const shot = process.argv[3] || 'screenshot.png';
const inGame = process.argv.includes('--game');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + m + (x ? '  ' + x : '')); };

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
  // HTTP errors by URL. PubChem 404 = "no such compound / no 3D record" and is expected in these tests.
  const httpErrors = [];
  page.on('response', r => { if (r.status() >= 400) httpErrors.push(r.status() + ' ' + r.url()); });

  console.log('# ' + url + (inGame ? '  (inside game)' : '  (standalone)'));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  ok(await page.evaluate(() => !!(window.CHEMVENTUR && CHEMVENTUR.Stage3 && CHEMVENTUR.Stage3Chem)), 'CHEMVENTUR.Stage3 + Stage3Chem defined');
  ok(await page.evaluate(() => !window.$3Dmol), '3Dmol NOT loaded before Stage 3 opens (lazy)');
  if (inGame) {
    await page.waitForFunction(() => CHEMVENTUR.Game && CHEMVENTUR.Game.ship && CHEMVENTUR.MolecularSystem, { timeout: 30000 });
    ok(true, 'game booted (Game, ship, MolecularSystem present)');
  }

  const waitStatus = (re, t) => page.waitForFunction((src) => {
    const s = document.querySelector('#stage3-panel .s3-status');
    return s && new RegExp(src).test(s.textContent) && !document.querySelector('#stage3-panel.s3-busy');
  }, { timeout: t || 60000 }, re.source);
  const status = () => page.$eval('#stage3-panel .s3-status', e => e.textContent);
  const info = () => page.$$eval('#stage3-panel .s3-info dd', dds => dds.map(d => d.textContent));

  // 1) aspirin via the public entry point
  let t = Date.now();
  await page.evaluate(() => CHEMVENTUR.Stage3.open('aspirin'));
  await waitStatus(/Aspirin/);
  ok(true, 'open("aspirin") loaded', (Date.now() - t) + ' ms');
  ok(await page.evaluate(() => !!(window.$3Dmol && $3Dmol.createViewer)), '3Dmol.js loaded on open');
  const badge = await page.$eval('#stage3-panel .s3-badge', e => e.textContent);
  ok(/^3D/.test(badge), 'badge shows PubChem 3D conformer', badge);
  const inf = await info();
  ok(inf[0] === 'Aspirin' && inf[1] === 'C9H8O4' && /180\.16/.test(inf[2]) && inf[3] === '1.2' && /63\.6/.test(inf[4]) && inf[5] === 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N' && /CID 2244/.test(inf[7]), 'info panel values', JSON.stringify(inf));
  const canvas = await page.evaluate(() => { const c = document.querySelector('#stage3-viewer canvas'); return c ? [c.width, c.height] : null; });
  ok(canvas && canvas[0] > 100 && canvas[1] > 100, '3Dmol canvas sized', JSON.stringify(canvas));
  const atoms = await page.evaluate(() => CHEMVENTUR.Stage3.viewer.getModel().selectedAtoms({}).length);
  ok(atoms === 21, 'viewer model has 21 atoms (aspirin incl. H)', String(atoms));
  const hasZ = await page.evaluate(() => CHEMVENTUR.Stage3.viewer.getModel().selectedAtoms({}).some(a => Math.abs(a.z) > 0.1));
  ok(hasZ, 'coordinates are really 3D (non-zero z)');
  await page.waitForFunction(() => !document.querySelector('#stage3-panel .s3-depict').hidden, { timeout: 60000 }).then(() => ok(true, 'RDKit 2D depiction shown')).catch(() => ok(false, 'RDKit 2D depiction shown'));
  if (inGame) ok(await page.evaluate(() => !!(CHEMVENTUR.RDKit && CHEMVENTUR.RDKit.instance)), 'reused the game\'s CHEMVENTUR.RDKit instance');

  // 2) controls
  for (const s of ['stick', 'sphere', 'ballstick']) await page.evaluate(n => CHEMVENTUR.Stage3.setStyle(n), s);
  await page.evaluate(() => { CHEMVENTUR.Stage3.setSpin(false); CHEMVENTUR.Stage3.reset(); CHEMVENTUR.Stage3.setSpin(true); });
  ok(await page.$eval('#stage3-panel .s3-style.active', b => b.dataset.style) === 'ballstick', 'style buttons + spin + reset run');

  // 3) search box (typed, submitted) by SMILES
  await page.$eval('#stage3-panel .s3-input', i => { i.value = ''; });
  await page.type('#stage3-panel .s3-input', 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C');
  await page.click('#stage3-panel .s3-go');
  await waitStatus(/Caffeine/);
  ok((await info())[7].indexOf('2519') !== -1, 'typed SMILES search -> Caffeine CID 2519');
  if (inGame) ok(await page.evaluate(() => CHEMVENTUR.Game.ship && typeof CHEMVENTUR.Game.ship.x === 'number'), 'typing in the panel did not crash the game');

  // 4) no-3D fallback
  await page.evaluate(() => CHEMVENTUR.Stage3.load('sodium chloride', 'name'));
  await waitStatus(/sodium chloride|Sodium Chloride/i);
  ok(/^2D/.test(await page.$eval('#stage3-panel .s3-badge', e => e.textContent)), 'NaCl (no 3D record) falls back to 2D', await page.$eval('#stage3-panel .s3-badge', e => e.textContent));

  // 5) hostile input is shown as text only
  await page.evaluate(() => CHEMVENTUR.Stage3.load('<img src=x onerror="window.__xss=1">', 'name'));
  await waitStatus(/❌/);
  ok(await page.evaluate(() => window.__xss === undefined && !document.querySelector('#stage3-panel img[src="x"]')), 'HTML in the query is never executed', await status());

  // 6) What did I build?
  if (inGame) {
    await page.evaluate(async () => {
      CHEMVENTUR.MolecularSystem.bonds.length = 0;
      CHEMVENTUR.Game.atoms.length = 0;
      await CHEMVENTUR.RDKit.spawnFromSmiles('CCO', CHEMVENTUR.Game.ship.x, CHEMVENTUR.Game.ship.y - 120, { vx: 0, vy: 0 });
    });
  } else {
    await page.evaluate(() => window.__stage3MockBuild());
  }
  await page.evaluate(() => CHEMVENTUR.Stage3.whatDidIBuild());
  await waitStatus(/You built|❌/);
  const built = await status();
  ok(/You built Ethanol/.test(built), '"What did I build?" -> Ethanol', built);

  // 7) the picture
  await page.evaluate(() => CHEMVENTUR.Stage3.load('caffeine', 'name'));
  await waitStatus(/Caffeine/);
  await page.evaluate(() => CHEMVENTUR.Stage3.setSpin(false));
  await page.waitForFunction(() => !document.querySelector('#stage3-panel .s3-depict').hidden, { timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: shot });
  console.log('  📸 ' + shot);

  // 8) close / toggle
  await page.evaluate(() => CHEMVENTUR.Stage3.close());
  ok(await page.evaluate(() => !CHEMVENTUR.Stage3.isOpen && !document.querySelector('#stage3-panel.visible')), 'close() hides the panel');
  await page.evaluate(() => CHEMVENTUR.Stage3.toggle());
  ok(await page.evaluate(() => CHEMVENTUR.Stage3.isOpen), 'toggle() reopens');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => !CHEMVENTUR.Stage3.isOpen), 'Esc closes');

  // 9) the left-panel button (only if the page has one): open AND close by clicking it
  if (await page.$('#btn-stage3')) {
    await page.click('#btn-stage3');
    await page.waitForFunction(() => CHEMVENTUR.Stage3.isOpen, { timeout: 30000 });
    const hit = await page.evaluate(() => { const r = document.getElementById('btn-stage3').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e && e.closest('#btn-stage3') ? 'button' : (e && e.closest('#stage3-panel') ? 'overlay' : (e && (e.id || e.tagName))); });
    ok(hit === 'button', 'button stays uncovered while Stage 3 is open', 'element at button centre: ' + hit);
    await page.click('#btn-stage3');
    ok(await page.evaluate(() => !CHEMVENTUR.Stage3.isOpen), 'clicking #btn-stage3 again closes Stage 3');
  } else {
    console.log('  (skip) no #btn-stage3 on this page');
  }

  const cacheStats = await page.evaluate(() => CHEMVENTUR.Stage3Chem.Cache.stats());
  ok(cacheStats.persistent && cacheStats.entries > 0, 'localStorage cache in use', JSON.stringify(cacheStats));

  const unexpectedHttp = httpErrors.filter(e => !/pubchem\.ncbi\.nlm\.nih\.gov|favicon|apple-touch-icon|RudVentur\.com\/embed\/icon-/.test(e));
  console.log('  HTTP >= 400 seen: ' + (httpErrors.length ? httpErrors.map(e => e.slice(0, 140)).join('\n    ') : 'none'));
  ok(unexpectedHttp.length === 0, 'no unexpected HTTP errors (PubChem 404s are expected negatives)', unexpectedHttp.join(' | '));
  const relevant = errors.filter(e => !/Failed to load resource: the server responded with a status of 404/.test(e) && !/favicon|soundcloud|youtube|firebase|googleapis|gstatic|apple-touch-icon/i.test(e));
  ok(relevant.length === 0, 'no page errors / failed requests (excluding game\'s 3rd-party noise)', relevant.slice(0, 5).join(' | '));
  if (errors.length !== relevant.length) console.log('  (ignored 3rd-party noise: ' + (errors.length - relevant.length) + ')');

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
