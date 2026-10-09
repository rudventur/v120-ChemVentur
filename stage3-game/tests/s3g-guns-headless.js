/* Headless-Chrome test for guns 1–3 (shotgun1proton, SHOTGUN2neutron, Electrogun) and the Grid panel (dev only).
   npm i puppeteer-core ; serve this folder (python3 -m http.server 8790)
   CHROME=/usr/bin/google-chrome node tests/s3g-guns-headless.js http://localhost:8790/ [screenshotDir] */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const url = process.argv[2] || 'http://localhost:8790/';
const shotDir = process.argv[3] || path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + m + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const boot = async () => {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await ev(() => CHEMVENTUR.Stage3Game.ready);
    await sleep(600);
  };

  console.log('# ' + url);
  await boot();
  await page.keyboard.press('Enter');                       // START
  await page.keyboard.press('KeyK');                        // banners off for timing-sensitive checks (re-enabled at the end)
  await sleep(300);
  const pne = () => ev(() => CHEMVENTUR.Stage3Game.PNE.debug.state());
  const gun = () => ev(() => CHEMVENTUR.Stage3Game.Game.gun);

  // ===== key map =====
  const km = {};
  for (const [k, want] of [['Digit1', 'proton'], ['Digit2', 'neutron'], ['Digit3', 'electron'], ['Digit4', 'c2c'], ['Digit5', 'shotgun5'], ['Digit6', 'atom'], ['Digit7', 'shotgun'], ['Digit8', 'anti'], ['Digit9', 'grav'], ['Digit0', 'time']]) {
    await page.keyboard.press(k); km[k] = await gun(); if (km[k] !== want) km.bad = (km.bad || '') + k + '=' + km[k] + ' ';
  }
  ok(!km.bad, 'key map 1 proton · 2 neutron · 3 electro · 4 c2c · 5 shotgun5 · 6 atom · 7 shot · 8 anti · 9 grav · 0 time', km.bad || 'all keys select their gun');
  const rain0 = await ev(() => CHEMVENTUR.Stage3Game.Game.rainOn); await page.keyboard.press('KeyM');
  const rain1 = await ev(() => CHEMVENTUR.Stage3Game.Game.rainOn); await page.keyboard.press('KeyM');
  const labels = await page.$$eval('.s3g-gun', bs => bs.map(b => b.textContent));
  ok(rain0 !== rain1 && labels.some(l => l.startsWith('M RAIN')) && labels.some(l => l.startsWith('1 p⁺')) && labels.some(l => l.startsWith('3 ⚡')), 'rain on M (HUD button kept), gun buttons relabelled', labels.join(' | '));

  // ===== gun 1: HUD label, right-click cycle, no context menu =====
  await page.keyboard.press('Digit1'); await sleep(150);
  let s = await pne();
  ok(s.pelletBtn === 'shotgun1proton x7' && /💪 3\/5 · 50u/.test(s.powerBtn), 'HUD shows "shotgun1proton x7" and the power button', s.pelletBtn + ' · ' + s.powerBtn);
  await ev(() => { window.__ctx = []; document.addEventListener('contextmenu', e => window.__ctx.push(e.defaultPrevented)); });
  await page.mouse.click(640, 380, { button: 'right' });
  s = await pne();
  const ctx = await ev(() => window.__ctx);
  ok(s.modeIdx.proton === 3 && s.pelletBtn === 'shotgun1proton x15', 'right-click cycles pellets per shot (x7 → x15)', s.pelletBtn);
  ok(ctx.length > 0 && ctx.every(Boolean), 'right-click opens no context menu (contextmenu default prevented)', JSON.stringify(ctx));
  const yaw0 = await ev(() => CHEMVENTUR.Stage3Game.Game.yaw);
  await page.mouse.move(640, 380); await page.mouse.down({ button: 'right' }); await page.mouse.move(700, 380, { steps: 5 }); await page.mouse.up({ button: 'right' });
  const yaw1 = await ev(() => CHEMVENTUR.Stage3Game.Game.yaw);
  s = await pne();
  ok(s.modeIdx.proton === 3 && Math.abs(yaw1 - yaw0) > 0.1, 'right-DRAG still steers and does not change the pellet mode', 'yaw ' + yaw0.toFixed(2) + ' → ' + yaw1.toFixed(2));
  await ev(() => { const g = CHEMVENTUR.Stage3Game.Game; g.yaw = 0; g.pitch = 0; });
  await page.click('.s3g-pellets');
  s = await pne();
  ok(s.modeIdx.proton === 4 && s.pelletBtn === 'shotgun1proton x31', 'phone-friendly pellets button cycles too (x31)', s.pelletBtn);

  // ===== pellet counts and spread (empty arena so nothing is hit) =====
  await ev(() => { const G = CHEMVENTUR.Stage3Game, g = G.Game; [...G.World.atoms].forEach(a => G.World.removeAtom(a)); g.ship.position.set(0, 0, 45); g.shipVel.x = g.shipVel.y = g.shipVel.z = 0; g.yaw = 0; g.pitch = 0; });
  const counts = await ev(() => {
    const P = CHEMVENTUR.Stage3Game.PNE, out = [];
    for (const kind of ['proton', 'neutron']) for (let i = 0; i < P.MODES.length; i++) {
      P.modeIdx[kind] = i; const sh = P.debug.shoot(kind); const m = P.debug.measure(sh.id);
      out.push({ kind, want: P.MODES[i], alive: m.alive, spread: Math.round(m.maxPair * 1000) / 1000 });
    }
    P.modeIdx.proton = 4; P.modeIdx.neutron = 4;
    return { out, half: P.halfShipWidth };
  });
  ok(counts.out.every(c => c.alive === c.want), 'pellet counts per shot: 1 · 3 · 7 · 15 · 31 (both guns)', counts.out.map(c => c.kind[0] + c.alive).join(' '));
  ok(counts.half > 1.5 && counts.out.every(c => c.spread <= counts.half + 1e-6) && counts.out.find(c => c.want === 31).spread > counts.half * 0.7,
    'beam width never more than half the ship\'s width', 'half ship width ' + counts.half.toFixed(2) + ', widest beam ' + Math.max(...counts.out.map(c => c.spread)).toFixed(3));
  const flight = await ev(async () => {
    const P = CHEMVENTUR.Stage3Game.PNE; P.modeIdx.proton = 4; const sh = P.debug.shoot('proton');
    await new Promise(r => setTimeout(r, 350)); return P.debug.measure(sh.id);
  });
  ok(flight.alive === 31 && flight.maxPair <= counts.half + 1e-6, 'spread stays within half the ship\'s width in flight (parallel pellets)', 'after ' + flight.age.toFixed(2) + ' s: ' + flight.maxPair.toFixed(3));

  // ===== power / range =====
  await page.keyboard.press('Equal'); await page.keyboard.press('Equal'); await page.keyboard.press('Equal');
  s = await pne(); const pUp = s.powerIdx.proton;
  await page.keyboard.press('Minus'); s = await pne(); const pDown = s.powerIdx.proton;
  await page.mouse.move(640, 380); await page.mouse.wheel({ deltaY: -120 }); await sleep(100); s = await pne(); const pWheel = s.powerIdx.proton;
  ok(pUp === 4 && pDown === 3 && pWheel === 4, '+ / − keys and the mouse wheel change the power (capped at 5/5)', 'up→' + (pUp + 1) + ' minus→' + (pDown + 1) + ' wheel→' + (pWheel + 1));
  await page.click('.s3g-power'); s = await pne(); const pBtn = s.powerIdx.proton; await page.click('.s3g-power');
  ok(pBtn === 0, 'HUD power button cycles power (wraps 5 → 1)', 'power ' + (pBtn + 1) + '/5');
  const rg = await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE; const r = []; for (let i = 0; i < P.POWER.length; i++) { P.powerIdx.proton = i; r.push(P.range('proton')); } return { r, arena: CHEMVENTUR.Stage3Game.Config.ARENA_RADIUS }; });
  ok(rg.r.every(x => x <= rg.arena) && rg.r[4] === rg.arena, 'every power level\'s range is within the arena radius', rg.r.join(' / ') + ' ≤ ' + rg.arena);
  // full-power shot across the empty arena: travel stops at the range and never leaves the arena
  await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE; P.pellets.length = 0; P.stats.maxTraveled.proton = 0; P.stats.maxRadius = 0; P.powerIdx.proton = 4; P.modeIdx.proton = 0; P.debug.shoot('proton'); });
  await page.waitForFunction(() => CHEMVENTUR.Stage3Game.PNE.pellets.length === 0, { timeout: 15000 });
  let st = await pne();
  ok(st.stats.maxTraveled.proton > 85 && st.stats.maxTraveled.proton <= 90 + 1e-6 && st.stats.maxRadius <= 90 + 1e-6, 'full power: the pellet flies its 90-unit range, no further, inside the arena', 'travelled ' + st.stats.maxTraveled.proton.toFixed(2) + ', max distance from centre ' + st.stats.maxRadius.toFixed(2));
  await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE, g = CHEMVENTUR.Stage3Game.Game; P.stats.maxRadius = 0; P.stats.maxTraveled.proton = 0; g.ship.position.set(0, 0, -80); g.yaw = 0; g.pitch = 0; P.debug.shoot('proton'); });   // facing −z = outwards
  await page.waitForFunction(() => CHEMVENTUR.Stage3Game.PNE.pellets.length === 0, { timeout: 15000 });
  st = await pne();
  ok(st.stats.maxRadius <= 90 + 1e-6 && st.stats.maxTraveled.proton < 15, 'shooting outwards near the edge: pellets stop at the arena boundary', 'travelled ' + st.stats.maxTraveled.proton.toFixed(2) + ', max distance from centre ' + st.stats.maxRadius.toFixed(2));
  await ev(() => { const g = CHEMVENTUR.Stage3Game.Game; g.ship.position.set(0, 0, 45); g.yaw = 0; g.pitch = 0; }); await sleep(300);

  // ===== gun 2: neutrons — blue, bigger, gravity, lifetime =====
  const look = await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE; return { pColor: P.meshP.material.color.getHexString(), nColor: P.meshN.material.color.getHexString(), pVis: P.P.vis, nVis: P.N.vis }; });
  const blue = parseInt(look.nColor.slice(4, 6), 16) > parseInt(look.nColor.slice(0, 2), 16), red = parseInt(look.pColor.slice(0, 2), 16) > parseInt(look.pColor.slice(4, 6), 16);
  ok(blue && red && look.nVis > look.pVis, 'neutron pellets blue and bigger than the red protons', '#' + look.nColor + ' size ' + look.nVis + ' vs #' + look.pColor + ' size ' + look.pVis);
  await page.keyboard.press('Digit2'); await sleep(150); s = await pne();
  ok(/^SHOTGUN2neutron x\d+$/.test(s.pelletBtn) && s.powerBtn, 'gun 2 HUD shows "SHOTGUN2neutron xN" and its own power setting', s.pelletBtn + ' · ' + s.powerBtn);
  const n0 = await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE; P.modeIdx.neutron = 2; P.powerIdx.neutron = 2; const sh = P.debug.shoot('neutron'); window.__nid = sh.id; return Object.assign(P.debug.measure(sh.id), { life: sh.life }); });
  await sleep(1200);
  const n1 = await ev(() => CHEMVENTUR.Stage3Game.PNE.debug.measure(window.__nid));
  ok(n1.alive === 7 && n1.vy < n0.vy - 0.5 && n1.y < n0.y - 0.2, 'neutrons fall under slight gravity (visible arc)', 'vertical speed ' + n0.vy.toFixed(2) + ' → ' + n1.vy.toFixed(2) + ', height ' + n0.y.toFixed(2) + ' → ' + n1.y.toFixed(2));
  let lastAge = 0;
  for (let i = 0; i < 60; i++) { const m = await ev(() => CHEMVENTUR.Stage3Game.PNE.debug.measure(window.__nid)); if (!m.alive) break; lastAge = m.age; await sleep(150); }
  const gone = (await ev(() => CHEMVENTUR.Stage3Game.PNE.debug.measure(window.__nid))).alive === 0;
  ok(gone && n0.life === 3 && lastAge > 2.4 && lastAge <= 3.0 + 1e-6, 'neutron pellets disappear after 3 seconds', 'last seen at age ' + lastAge.toFixed(2) + ' s');

  // ===== hit effects: rates, blasts, captures, nuclei =====
  const stats = await ev(() => {
    const G = CHEMVENTUR.Stage3Game, P = G.PNE, W = G.World, g = G.Game;
    const a = W.spawnAtom('C', { x: 0, y: 30, z: 0 });
    const N = 2000; let blast = 0, cap = 0, nuc = 0;
    const reset = () => { a._pWin = a._nWin = a._lastP = null; a._pCount = a._nCount = 0; if (a.symbol !== 'C' || a.A !== 12) P.transmute(a, 6, 12); };
    for (let i = 0; i < N; i++) { reset(); if (P.debug.applyHit('proton', a) === 'blast') blast++; }
    for (let i = 0; i < N; i++) { reset(); const r = P.debug.applyHit('neutron', a); if (r === 'capture' || r === 'nucleus') cap++; }
    for (let i = 0; i < N; i++) { reset(); a._lastP = P.time; const r = P.debug.applyHit('neutron', a); if (r === 'nucleus') nuc++; }
    W.removeAtom(a);
    return { blast: blast / N, cap: cap / N, combo: nuc / N };
  });
  ok(stats.cap > 3 * stats.blast && stats.combo > 0.35, 'neutrons form nuclei far more often than protons blast (and proton + neutron combine)',
    'proton blast ' + (stats.blast * 100).toFixed(1) + '% · neutron capture ' + (stats.cap * 100).toFixed(1) + '% · neutron right after a proton → nucleus ' + (stats.combo * 100).toFixed(1) + '%');
  const fx = await ev(() => {
    const G = CHEMVENTUR.Stage3Game, P = G.PNE, W = G.World, out = {};
    const h = W.spawnAtom('H', { x: 5, y: 30, z: 0 });
    let r = []; for (let i = 0; i < 6; i++) r.push(P.debug.applyHit('proton', h));
    out.rapid = r; out.lone = h.symbol;
    const c1 = W.spawnAtom('C', { x: 10, y: 30, z: 0 }), c2 = W.spawnAtom('C', { x: 11.4, y: 30, z: 0 }); W.bond(c1, c2, 1, true);
    const b0 = c1.bonds.length; P.protonBlast(c1); out.bonded = { before: b0, after: c1.bonds.length, symbol: c1.symbol };
    const d = W.spawnAtom('H', { x: 15, y: 30, z: 0 }); P.capture(d); out.iso1 = { s: d.symbol, A: d.A, name: P.isoName(d.symbol, d.A) }; P.capture(d); out.iso2 = { s: d.symbol, A: d.A, name: P.isoName(d.symbol, d.A) };
    const e = W.spawnAtom('H', { x: 20, y: 30, z: 0 }); P.formNucleus(e); out.nucleus = { s: e.symbol, A: e.A };
    [h, c1, c2, d, e].forEach(x => W.removeAtom(x));
    out.disc = Object.keys(G.Discovery.discovered);
    return out;
  });
  ok(fx.rapid.includes('blast') && fx.lone === 'He', '6 rapid proton hits always blast; a lone H blasts up to He', fx.rapid.join(',') + ' → ' + fx.lone);
  ok(fx.bonded.before === 1 && fx.bonded.after === 0 && fx.bonded.symbol === 'C', 'proton blast on a bonded atom breaks its bonds (knocked out of the molecule)', JSON.stringify(fx.bonded));
  ok(fx.iso1.A === 2 && /deuterium/i.test(fx.iso1.name) && fx.iso2.A === 3 && /tritium/i.test(fx.iso2.name), 'neutron capture makes isotopes: ²H deuterium, ³H tritium', fx.iso1.name + ' → ' + fx.iso2.name);
  ok(fx.nucleus.s === 'He' && fx.nucleus.A === 3, 'proton + neutron on H forms a helium-3 nucleus', JSON.stringify(fx.nucleus));
  ok(['blast:proton', 'nucleus:neutron'].every(k => fx.disc.includes(k)), 'first proton blast and first neutron nucleus recorded as discoveries', fx.disc.filter(k => /blast|nucleus/.test(k)).join(', '));
  // real pellets hitting a real atom
  const real = await ev(async () => {
    const G = CHEMVENTUR.Stage3Game, P = G.PNE, W = G.World, g = G.Game, n = g._nose(), f = g._aimDir();
    const a = W.spawnAtom('O', { x: n.x + f.x * 12, y: n.y + f.y * 12, z: n.z + f.z * 12 });
    const h0 = P.stats.protonHits; P.modeIdx.proton = 2; P.powerIdx.proton = 2; P.debug.shoot('proton');
    await new Promise(r => setTimeout(r, 600));
    const out = { hits: P.stats.protonHits - h0, moved: Math.hypot(a.vel.x, a.vel.y, a.vel.z) };
    if (W.atoms.includes(a)) W.removeAtom(a);
    return out;
  });
  ok(real.hits > 0 && real.moved > 0.1, 'proton pellets hit an atom in front of the ship and push it', JSON.stringify(real));

  // ===== gun 3: Electrogun =====
  await page.keyboard.press('Digit3');
  const chain = (syms) => ev((syms) => {
    const G = CHEMVENTUR.Stage3Game, W = G.World, g = G.Game, n = g._nose(), f = g._forward();
    [...W.atoms].forEach(a => W.removeAtom(a));
    const side = { x: 1, y: 0, z: 0 };
    syms.forEach((s, i) => W.spawnAtom(s, { x: n.x + f.x * 15 + side.x * 6 * i, y: n.y + f.y * 15, z: n.z + f.z * 15 + side.z * 6 * i }));
    return G.PNE.debug.electro();
  }, syms);
  const b5 = await chain(['O', 'H', 'C', 'N', 'Cl']);
  const q5 = b5.struck.map(x => x.symbol + (x.charge > 0 ? '+' : '−')).join(' ');
  ok(b5.struck.length === 5 && b5.jumps === 4, 'bolt chains along 5 atoms 6 units apart (4 jumps)', 'struck ' + b5.struck.map(x => x.symbol).join('→'));
  ok(q5 === 'O− H+ C+ N− Cl−', 'electronegative atoms become negative ions, the others positive', q5);
  await sleep(150);
  st = await pne();
  ok(st.bolts > 0, 'lightning bolt is drawn', 'bolts on screen ' + st.bolts);
  await sleep(400);
  st = await pne();
  ok(st.bolts === 0, 'bolt fades after a fraction of a second', 'bolts ' + st.bolts);
  await ev(() => { CHEMVENTUR.Stage3Game.PNE.voltsIdx = 5; });          // 100 MV: 6 jumps (default 1 MV: 4 jumps)
  const b10 = await chain(['C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C', 'C']);
  await ev(() => { CHEMVENTUR.Stage3Game.PNE.voltsIdx = 4; });
  ok(b10.struck.length === 7 && b10.jumps === 6, 'at 100 MV the chain is capped at 6 jumps (7 atoms struck of 10)', 'struck ' + b10.struck.length);
  const far = await ev(() => { const G = CHEMVENTUR.Stage3Game, W = G.World, g = G.Game, n = g._nose(), f = g._forward();
    [...W.atoms].forEach(a => W.removeAtom(a));
    W.spawnAtom('O', { x: n.x + f.x * 15, y: n.y + f.y * 15, z: n.z + f.z * 15 }); W.spawnAtom('O', { x: n.x + f.x * 15 + 12, y: n.y + f.y * 15, z: n.z + f.z * 15 });
    return G.PNE.debug.electro(); });
  ok(far.struck.length === 1, 'no jump to an atom beyond the 10-unit jump radius', 'struck ' + far.struck.length);
  await sleep(400);
  const mk = await ev(() => CHEMVENTUR.Stage3Game.Grid.debugState());
  ok(mk.markersVisible && mk.markers.plus + mk.markers.minus > 0, 'charge markers shown on ions (+ red / − blue)', JSON.stringify(mk.markers));
  const ionDisc = await ev(() => Object.keys(CHEMVENTUR.Stage3Game.Discovery.discovered).includes('ion:first'));
  ok(ionDisc, 'first ion recorded as a discovery');
  // partial charges from bond polarity (water-like)
  const water = await ev(async () => {
    const G = CHEMVENTUR.Stage3Game, W = G.World, g = G.Game, n = g._nose(), f = g._forward();
    [...W.atoms].forEach(a => W.removeAtom(a));
    const c = { x: n.x + f.x * 14, y: n.y + f.y * 14, z: n.z + f.z * 14 };
    const o = W.spawnAtom('O', c), h1 = W.spawnAtom('H', { x: c.x - 1.3, y: c.y + 0.9, z: c.z }), h2 = W.spawnAtom('H', { x: c.x + 1.3, y: c.y + 0.9, z: c.z });
    W.bond(o, h1, 1, true); W.bond(o, h2, 1, true);
    await new Promise(r => setTimeout(r, 400));
    return { o: G.Grid.chargeOf(o), h1: G.Grid.chargeOf(h1), h2: G.Grid.chargeOf(h2), markers: G.Grid.debugState().markers };
  });
  ok(water.o < -0.2 && water.h1 > 0.1 && water.h2 > 0.1 && water.markers.minus >= 1 && water.markers.plus >= 2, 'water: partial charges O negative, H positive, with markers', 'O ' + water.o.toFixed(2) + ' H ' + water.h1.toFixed(2) + ' / ' + water.h2.toFixed(2) + ' ' + JSON.stringify(water.markers));
  // screenshot: electro bolt over a small cluster
  await ev(() => { const G = CHEMVENTUR.Stage3Game, W = G.World, g = G.Game, n = g._nose(), f = g._forward(); G.PNE.E.boltLife = 3;
    ['O', 'H', 'C', 'N', 'Cl', 'C', 'O'].forEach((s, i) => W.spawnAtom(s, { x: n.x + f.x * (16 + i * 2) + (i % 2 ? 3 : -3) * (i / 2), y: n.y + f.y * 16 + (i % 3 - 1) * 2.5, z: n.z + f.z * (16 + i * 2) }));
    G.PNE.debug.electro(); });
  await sleep(500);
  await page.screenshot({ path: path.join(shotDir, 'gun3-electro.png') });
  await ev(() => { CHEMVENTUR.Stage3Game.PNE.E.boltLife = 0.3; });

  // ===== Grid panel =====
  const gs = () => ev(() => CHEMVENTUR.Stage3Game.Grid.debugState());
  await page.keyboard.press('KeyG');
  let g = await gs();
  ok(g.panelOpen && (await page.$$('.s3g-gridpanel input[data-opt]')).length === 4, 'G opens the Grid panel with 4 toggles');
  await page.click('.s3g-gridpanel input[data-opt="charge"]'); await sleep(200); g = await gs();
  const chOff = g.state.charge === false && !g.markersVisible;
  await page.click('.s3g-gridpanel input[data-opt="charge"]'); await sleep(200); g = await gs();
  ok(chOff && g.state.charge && g.markersVisible, 'Charge display toggles off / on');
  // gravity
  const grav = async (on) => {
    await ev((on) => CHEMVENTUR.Stage3Game.Grid.toggle('gravity', on), on);
    return ev(async () => { const G = CHEMVENTUR.Stage3Game, W = G.World; [...W.atoms].forEach(a => W.removeAtom(a));
      const a = W.spawnAtom('Ne', { x: 0, y: 20, z: -20 }); const y0 = a.pos.y; await new Promise(r => setTimeout(r, 1000)); const out = { vy: a.vel.y, dy: a.pos.y - y0 }; W.removeAtom(a); return out; });
  };
  const gOn = await grav(true), gOff = await grav(false);
  ok(gOn.dy < -0.3 && gOn.vy < -0.2 && Math.abs(gOff.dy) < 0.1, 'Gravity on: atoms fall; off: they float', 'on: fell ' + gOn.dy.toFixed(2) + ' · off: ' + gOff.dy.toFixed(3));
  // temperature
  await page.click('.s3g-gridpanel input[data-opt="temperature"]'); await sleep(600); g = await gs();
  ok(g.state.temperature && g.layers.length === 3 && g.layers.every(l => l.visible && / K/.test(l.label)), 'Temperature on: 3 translucent layers labelled in kelvin', g.layers.map(l => l.label).join(' | '));
  const jig = await ev(async () => { const G = CHEMVENTUR.Stage3Game, W = G.World; [...W.atoms].forEach(a => W.removeAtom(a));
    const hot = W.spawnAtom('Ne', { x: 0, y: 44, z: -20 }), cold = W.spawnAtom('Ne', { x: 0, y: -44, z: -20 });
    return { hot: G.Grid.localT(hot), cold: G.Grid.localT(cold) }; });
  ok(jig.hot > jig.cold, 'local temperature: upper layer warmer than lower (drives faster jiggle)', Math.round(jig.hot) + ' K vs ' + Math.round(jig.cold) + ' K');
  await page.click('.s3g-gridpanel input[data-opt="temperature"]'); await sleep(200); g = await gs();
  ok(!g.state.temperature && g.layers.every(l => !l.visible), 'Temperature off: layers hidden');
  // pressure
  await ev(() => { const G = CHEMVENTUR.Stage3Game, W = G.World; [...W.atoms].forEach(a => W.removeAtom(a)); for (let i = 0; i < 40; i++) W.spawnAtom('Ne', { x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 60 }); });
  await page.click('.s3g-gridpanel input[data-opt="pressure"]'); await sleep(2500); g = await gs();
  const gap0 = g.gap, p0 = g.pressure;
  ok(g.state.pressure && g.plates.length === 2 && g.plates.every(p => p.visible) && /kPa/.test(g.pLabel), 'Pressure on: two plates with a kPa label', g.pLabel);
  await ev(() => { const W = CHEMVENTUR.Stage3Game.World; for (let i = 0; i < 120; i++) W.spawnAtom('Ne', { x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 60 }); });
  await sleep(3000); g = await gs();
  ok(g.pressure > p0 && g.gap < gap0 - 10, 'more atoms → higher pressure → plates move closer', 'P ' + p0 + ' → ' + g.pressure + ' kPa · gap ' + gap0 + ' → ' + g.gap);
  const sq = await ev(async () => { const W = CHEMVENTUR.Stage3Game.World; const rad = () => W.atoms.reduce((s, a) => s + Math.hypot(a.pos.x, a.pos.y, a.pos.z), 0) / W.atoms.length; const r0 = rad(); await new Promise(r => setTimeout(r, 1500)); return { r0, r1: rad() }; });
  ok(sq.r1 < sq.r0, 'pressure nudges atoms closer together', 'mean distance from centre ' + sq.r0.toFixed(1) + ' → ' + sq.r1.toFixed(1));
  // screenshot: panel open with all four on
  await page.click('.s3g-gridpanel input[data-opt="temperature"]'); await sleep(1500);
  await page.screenshot({ path: path.join(shotDir, 'grid-panel.png') });
  await page.click('.s3g-gridpanel input[data-opt="pressure"]'); await page.click('.s3g-gridpanel input[data-opt="temperature"]'); await sleep(200); g = await gs();
  ok(!g.state.pressure && g.plates.every(p => !p.visible), 'Pressure off: plates hidden');
  await page.keyboard.press('KeyG'); await sleep(100); g = await gs();
  ok(!g.panelOpen, 'G closes the Grid panel');

  // ===== screenshots of guns 1 and 2, then frame rate with maximum pellets held =====
  await ev(() => { const G = CHEMVENTUR.Stage3Game, W = G.World, g = G.Game; [...W.atoms].forEach(a => W.removeAtom(a)); G.PNE.pellets.length = 0; g._spawnStartAtoms(); g.ship.position.set(0, 0, 45); g.yaw = 0; g.pitch = 0;
    const n = g._nose(), f = g._forward(); ['C', 'O', 'N', 'H', 'C', 'H'].forEach((s, i) => W.spawnAtom(s, { x: n.x + f.x * (18 + i * 4) + (i % 2 ? 1.2 : -1.2), y: n.y + (i % 3 - 1) * 0.8, z: n.z + f.z * (18 + i * 4) }));
    G.PNE.modeIdx.proton = 4; G.PNE.modeIdx.neutron = 4; G.PNE.powerIdx.proton = 4; G.PNE.powerIdx.neutron = 4; });
  await page.mouse.move(640, 380);
  await page.keyboard.press('Digit1'); await sleep(1500);
  const fps0 = (await ev(() => CHEMVENTUR.Stage3Game.debug.state())).fps;
  await page.keyboard.down('Space'); await sleep(700);
  await page.screenshot({ path: path.join(shotDir, 'gun1-spray.png') });
  await sleep(2300);
  const f1 = await ev(() => ({ fps: CHEMVENTUR.Stage3Game.debug.state().fps, alive: CHEMVENTUR.Stage3Game.PNE.pellets.length }));
  await page.keyboard.up('Space');
  await page.keyboard.press('Digit2'); await sleep(400);
  await page.keyboard.down('Space'); await sleep(1600);
  await page.screenshot({ path: path.join(shotDir, 'gun2-neutron.png') });
  await sleep(1400);
  const f2 = await ev(() => ({ fps: CHEMVENTUR.Stage3Game.debug.state().fps, alive: CHEMVENTUR.Stage3Game.PNE.pellets.length }));
  await page.keyboard.up('Space');
  ok(f1.alive >= 100 && f1.fps >= Math.max(12, fps0 * 0.5), 'gun 1 held at x31 + full power: frame rate holds', 'fps ' + fps0 + ' → ' + f1.fps + ' with ' + f1.alive + ' pellets in flight');
  ok(f2.alive >= 100 && f2.fps >= Math.max(12, fps0 * 0.5), 'gun 2 held at x31 + full power: frame rate holds', 'fps ' + fps0 + ' → ' + f2.fps + ' with ' + f2.alive + ' pellets in flight');

  // ===== banners: first proton blast / neutron nucleus / ion =====
  await page.keyboard.down('ShiftLeft'); await page.keyboard.press('KeyK'); await page.keyboard.up('ShiftLeft');
  await page.keyboard.press('KeyK');                        // banners back on
  const ban = await ev(() => { const G = CHEMVENTUR.Stage3Game, W = G.World, P = G.PNE;
    const a = W.spawnAtom('C', { x: 0, y: -30, z: 0 }); P.protonBlast(a); P.capture(a); P.ionize(a, { x: 0, y: 0, z: 0 }, { x: 0, y: -30, z: 0 });
    const D = G.Discovery, d = D.debugState(); return { enabled: d.enabled, items: [d.active && d.active.key, ...D.queue.map(q => q.key)], text: d.bannerText }; });
  ok(ban.enabled && ['blast:proton', 'nucleus:neutron', 'ion:first'].every(k => ban.items.includes(k)), 'FIRST DISCOVERY banners queued for proton blast, neutron nucleus and ion', ban.items.join(', '));
  await sleep(300);
  const btxt = (await ev(() => CHEMVENTUR.Stage3Game.Discovery.debugState())).bannerText;
  ok(/^FIRST DISCOVERY: Proton blast/.test(btxt), 'banner text', btxt);

  // ===== persistence across reload =====
  await ev(() => { const G = CHEMVENTUR.Stage3Game; G.Grid.toggle('gravity', true); G.PNE.modeIdx.neutron = 1; G.PNE.powerIdx.neutron = 0; G.PNE.save(); });
  await boot();
  const per = await ev(() => { const G = CHEMVENTUR.Stage3Game; return { grid: G.Grid.state, mode: G.PNE.modeIdx.neutron, power: G.PNE.powerIdx.neutron }; });
  ok(per.grid.gravity === true && per.grid.charge === true && per.mode === 1 && per.power === 0, 'Grid toggles and pellets / power settings persist after reload', JSON.stringify(per));
  await ev(() => CHEMVENTUR.Stage3Game.Grid.toggle('gravity', false));

  ok(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
