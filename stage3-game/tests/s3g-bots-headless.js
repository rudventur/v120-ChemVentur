/* Headless-Chrome test for the 3D bots (dev only).
   CHROME=/usr/bin/google-chrome node tests/s3g-bots-headless.js http://127.0.0.1:8877/ [outDir] */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const url = process.argv[2] || 'http://127.0.0.1:8877/';
const outDir = process.argv[3] || path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + m + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 760 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push('console: ' + m.text()); });
  console.log('# bots @ ' + url);
  await page.goto(url + '?autostart=1', { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => CHEMVENTUR.Stage3Game.ready);
  await sleep(500);
  const st = () => page.evaluate(() => CHEMVENTUR.Stage3Game.Bots.debugState());

  await page.keyboard.press('KeyJ');
  await sleep(300);
  let s = await st();
  ok(s.count === 10 && s.bots.every(b => b.inScene), 'J deploys all 10 bots (3D meshes in the scene)', s.bots.map(b => b.type).join(','));

  // give some bots something to do right next to them
  await page.evaluate(() => {
    const G = CHEMVENTUR.Stage3Game, W = G.World, B = G.Bots, V = G.V;
    const by = t => B.bots.find(b => b.type === t);
    const put = (t, sym, n, d) => { const b = by(t); for (let i = 0; i < n; i++) W.spawnAtom(sym, V.add(b.pos, V.scale(V.randUnit(), d)), null, 'world'); };
    put('collector', 'O', 3, 5); put('homeless', 'H', 3, 4); put('scraper', 'Br', 1, 5); put('chaos', 'C', 4, 6);
    const sc = by('scientist');
    W.spawnAtom('C', V.add(sc.pos, { x: 2, y: 0, z: 0 }), null, 'world');
    W.spawnAtom('C', V.add(sc.pos, { x: -2, y: 0, z: 0 }), null, 'world');
  });
  await sleep(16500);   // reporter snapshot at 5 s, producer every 8 s, helper gift at 12 s, scientist eureka at 15 s
  s = await st();
  const B = Object.fromEntries(s.bots.map(b => [b.type, b]));
  ok(s.bots.every(b => b.moved > 1), 'every bot moves', s.bots.map(b => b.type + ' ' + b.moved).join(', '));
  ok(B.collector.stats.collected >= 1, '📦 Collector collects loose atoms', JSON.stringify(B.collector.stats));
  ok(B.scientist.stats.bonds >= 1, '🔬 Scientist fuses (bonds) nearby atoms', JSON.stringify(B.scientist.stats));
  await page.waitForFunction(() => CHEMVENTUR.Stage3Game.Bots.log.some(l => l.bot === 'scientist' && /Eureka|not in PubChem|offline/.test(l.text)), { timeout: 30000 }).catch(() => {});
  const sciLog = (await st()).log.filter(l => l.bot === 'scientist').map(l => l.text);
  ok(sciLog.some(t => /Eureka|not in PubChem/.test(t)), '🔬 Scientist asks RDKit + PubChem what it built', JSON.stringify(sciLog.slice(-2)));
  ok(B.chaos.stats.actions >= 3, '💥 Chaos creates mayhem (kicks / c2c dots / bond rips)', JSON.stringify(B.chaos.stats) + ' gun=' + B.chaos.gun);
  const gameGun = await page.evaluate(() => CHEMVENTUR.Stage3Game.Game.gun);
  ok(B.helper.stats.gifts >= 1 && B.helper.toShip < 26 && B.helper.gun === gameGun, '💚 Helper follows you, copies your gun, gifts atoms', JSON.stringify({ toShip: B.helper.toShip, gun: B.helper.gun, gifts: B.helper.stats.gifts }));
  const shots = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('s3g_reporter_screenshot_')).map(k => localStorage.getItem(k).slice(0, 23)));
  ok(B.reporter.stats.snapshots >= 1 && shots.length >= 1 && shots[0] === 'data:image/jpeg;base64,', '📰 Reporter flash snapshot saved to localStorage', JSON.stringify({ snapshots: B.reporter.stats.snapshots, stored: shots.length }));
  ok(B.peace.stats.quotes >= 1 && /🙏 ".+" — /.test(s.log.find(l => l.bot === 'peace').text), '⛪ Peace Bot shares a quote', JSON.stringify(s.log.find(l => l.bot === 'peace').text.slice(0, 90)));
  ok(B.homeless.stats.electrons >= 1, '🏠 Homeless Bot collects stray H (electrons)', JSON.stringify(B.homeless.stats));
  ok(Math.abs(B.lover.toOrbitCenter - 8) < 3 && B.lover.toShip < 16, '💕 Lover Bot orbits your ship', 'orbit radius ' + B.lover.toOrbitCenter + ', to ship ' + B.lover.toShip);
  ok(B.scraper.stats.annihilated >= 1 && B.scraper.stats.scrap >= 8, '🔩 Scraper annihilates heavy atoms into scrap', JSON.stringify(B.scraper.stats));
  ok(B.producer.stats.produced >= 1, '🏭 Produce Bot produces molecules', JSON.stringify(B.producer.stats) + ' ' + JSON.stringify(s.log.filter(l => l.bot === 'producer').map(l => l.text)));

  // staged photo: line the bots up in front of the ship
  await page.evaluate(() => {
    const G = CHEMVENTUR.Stage3Game, g = G.Game, n = g._nose(), f = g._forward();
    G.Bots.bots.forEach((b, i) => {
      if (b.type === 'lover' || b.type === 'helper') return;
      const k = i - 4.5;
      b.pos = { x: n.x + f.x * 30 + k * 5.5, y: n.y + f.y * 30 + (i % 2 ? 3 : -3), z: n.z + f.z * 30 };
      b.vel = { x: 0, y: 0, z: 0 };
    });
    G.Bots.bots.forEach(b => { if (b.type !== 'lover' && b.type !== 'helper') G.Bots.say(b, b.msg || (b.emoji + ' ' + b.job)); });
  });
  await sleep(400);
  s = await st();
  ok(s.bots.filter(b => b.labelVisible).length >= 8, 'bot name tags + speech bubbles render over the 3D view', s.bots.filter(b => b.labelVisible).length + ' visible');
  await page.screenshot({ path: path.join(outDir, 'screenshot-bots.png') });

  await page.keyboard.press('KeyJ');
  await sleep(200);
  const after = await page.evaluate(() => ({ n: CHEMVENTUR.Stage3Game.Bots.bots.length, labels: document.querySelectorAll('.s3g-botlabel').length }));
  ok(after.n === 0 && after.labels === 0, 'J again removes all bots', JSON.stringify(after));
  ok(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
