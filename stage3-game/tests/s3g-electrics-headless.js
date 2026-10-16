/* Headless-Chrome test for the Electrogun electrics (amps, volts, watts, effect tiers) and shotgun5 (dev only).
   npm i puppeteer-core ; serve this folder (python3 -m http.server 8790)
   CHROME=/usr/bin/google-chrome node tests/s3g-electrics-headless.js http://localhost:8790/ [screenshotDir] */
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

  console.log('# ' + url);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await ev(() => CHEMVENTUR.Stage3Game.ready);
  await sleep(600);
  await page.keyboard.press('Enter');
  await page.keyboard.press('KeyK');                        // banners off for the timing-sensitive part
  await ev(() => { const g = CHEMVENTUR.Stage3Game.Game; g.ship.position.set(0, 0, 45); g.yaw = 0; g.pitch = 0; g.shipVel.x = g.shipVel.y = g.shipVel.z = 0; });
  await page.mouse.move(640, 380);
  await sleep(300);
  const st = () => ev(() => CHEMVENTUR.Stage3Game.PNE.debug.state());
  const clear = () => ev(() => { const G = CHEMVENTUR.Stage3Game, W = G.World; [...W.atoms].forEach(a => W.removeAtom(a)); G.PNE.pellets.length = 0; });
  const set = (v, a) => ev((v, a) => { const P = CHEMVENTUR.Stage3Game.PNE; P.voltsIdx = v; P.ampsIdx = a; P._hud(true); }, v, a);

  // ===== Electrogun HUD and controls =====
  await page.keyboard.press('Digit3'); await sleep(150);
  let s = await st();
  ok(s.pelletBtn === '⚡ 1 A · 1 bolt' && /^🔋 1 MV/.test(s.powerBtn) && s.wattText === '1 MW · 300 kJ · 0.3 C → make ions', 'Electrogun HUD: amps, volts and the watts readout', [s.pelletBtn, s.powerBtn, s.wattText].join(' | '));
  for (let i = 0; i < 8; i++) await page.keyboard.press('Minus');
  const steps = [];
  for (let i = 0; i < 9; i++) { s = await st(); steps.push(s.elec.V); await page.keyboard.press('Equal'); }
  const EXP = [0, 1.5, 230, 1e4, 1e6, 1e8, 1e9, 1e12];
  ok(JSON.stringify(steps.slice(0, 8)) === JSON.stringify(EXP) && steps[8] === 1e12, 'volts steps (+ / −): 0 V · 1.5 V · 230 V · 10 kV · 1 MV · 100 MV · 1 GV · 1 TV, capped at the top', steps.map(v => v.toExponential(1)).join(' '));
  const reach = await ev(() => CHEMVENTUR.Stage3Game.PNE.VOLTS.map(l => l.reach + '/' + l.jumps));
  ok(reach.join(' ') === '0/0 8/0 15/1 25/2 35/4 45/6 60/8 90/12', 'volts set reach and jump count (reach never beyond the arena radius 90)', reach.join(' '));
  await page.keyboard.press('Minus'); await page.mouse.wheel({ deltaY: -120 }); await sleep(100); s = await st();
  ok(s.voltsIdx === 7, 'mouse wheel raises the volts too', 'level ' + (s.voltsIdx + 1) + '/8');
  await page.click('.s3g-power'); s = await st();
  ok(s.voltsIdx === 0 && /^🔋 0 V/.test(s.powerBtn), '🔋 button cycles volts (wraps to 0 V)', s.powerBtn);
  await set(4, 0);
  await page.mouse.click(640, 380, { button: 'right' }); await sleep(100); s = await st();
  const rc = s.ampsIdx;
  await page.click('.s3g-pellets'); s = await st();
  ok(rc === 1 && s.ampsIdx === 2 && s.pelletBtn === '⚡ 3 A · 3 bolts', 'right-click and the ⚡ button cycle amps 1 → 2 → 3', s.pelletBtn);

  // ===== watts = volts × amps readout =====
  const cases = [[1, 0, '1.5 W · 450 mJ · 0.3 C → spark only'], [2, 4, '2.3 kW · 690 J · 3 C → make ions'], [5, 2, '300 MW · 90 MJ · 0.9 C → break bonds'],
    [4, 4, '10 MW · 3 MJ · 3 C → break bonds'], [6, 3, '5 GW · 1.5 GJ · 1.5 C → strip electrons'], [7, 4, '10 TW · 3 TJ · 3 C → strip electrons'], [0, 0, '0 W · 0 J · 0.3 C → nothing']];
  const got = [];
  for (const [v, a, want] of cases) { await set(v, a); s = await st(); got.push({ want, txt: s.wattText, prod: s.elec.W === s.elec.V * s.elec.A }); }
  ok(got.every(g => g.txt === g.want && g.prod), 'watts readout = volts × amps (kW / MW / GW / TW), joules = watts × 0.3 s, coulombs = amps × 0.3 s', got.map(g => g.txt).join(' | '));
  const bad = got.filter(g => g.txt !== g.want); if (bad.length) console.log('     mismatches: ' + JSON.stringify(bad));

  // ===== amps = number of bolts =====
  const field = () => ev(() => { const G = CHEMVENTUR.Stage3Game, W = G.World, g = G.Game, n = g._nose(), f = g._aimDir();
    [...W.atoms].forEach(a => W.removeAtom(a));
    for (let i = 0; i < 40; i++) { const d = 10 + (i % 8) * 2.5, sx = ((i * 7) % 9 - 4) * 0.9, sy = ((i * 5) % 7 - 3) * 0.9; W.spawnAtom(i % 3 ? 'C' : 'O', { x: n.x + f.x * d + sx, y: n.y + f.y * d + sy, z: n.z + f.z * d }); } });
  const boltsBy = [];
  for (let ai = 0; ai < 5; ai++) {
    await field(); await set(4, ai); await sleep(400);
    const r = await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE, b0 = P.bolts.length, lb = P.debug.electro(); return { A: lb.A, bolts: lb.bolts, drawn: P.bolts.length - b0, firsts: new Set(lb.perBolt.map(p => p.struck[0] && p.struck[0].id)).size }; });
    boltsBy.push(r);
  }
  ok(boltsBy.every(r => r.bolts === r.A && r.drawn === r.A && r.firsts === r.A), 'amps 1 · 2 · 3 · 5 · 10 give exactly that many simultaneous bolts, each on its own first atom', boltsBy.map(r => r.A + 'A→' + r.bolts + ' bolts').join(' '));
  await clear(); await set(4, 3); await sleep(400);
  const empty = await ev(() => { const lb = CHEMVENTUR.Stage3Game.PNE.debug.electro(); return lb.bolts; });
  ok(empty === 5, 'with nothing to hit, 5 A still draws 5 bolts forking into space', 'bolts ' + empty);
  await set(0, 2);
  const zero = await ev(() => CHEMVENTUR.Stage3Game.PNE.debug.electro().bolts);
  ok(zero === 0, '0 V: no bolt (no current flows)', 'bolts ' + zero);

  // ===== effect tiers by energy per strike, charge size by coulombs =====
  const strike = (v, a, spec) => ev(async (v, a, spec) => {
    const G = CHEMVENTUR.Stage3Game, W = G.World, P = G.PNE, g = G.Game, n = g._nose(), f = g._aimDir();
    [...W.atoms].forEach(x => W.removeAtom(x));
    P.voltsIdx = v; P.ampsIdx = a;
    const at = (sym, d, side) => W.spawnAtom(sym, { x: n.x + f.x * d + (side || 0), y: n.y + f.y * d, z: n.z + f.z * d });
    const first = at(spec.sym, spec.d);
    let partner = null;
    if (spec.bond) { partner = at('C', spec.d, 1.4); W.bond(first, partner, 1, true); }
    const b0 = first.bonds.length;
    const lb = P.debug.electro();
    return { tier: lb.tier, J: lb.J, Q: lb.Q, effect: lb.struck[0] && lb.struck[0].effect, charge: first.charge || 0, bondsBefore: b0, bondsAfter: first.bonds.length, Z: first.Z, big: 0 };
  }, v, a, spec);
  const tSpark = await strike(1, 0, { sym: 'O', d: 5 });
  ok(tSpark.effect === 'spark' && tSpark.charge === 0, 'under 10 J (1.5 V × 1 A = 0.45 J): spark only, no ion', JSON.stringify(tSpark));
  const tIon = await strike(2, 0, { sym: 'O', d: 10 });
  const tIon3 = await strike(2, 2, { sym: 'O', d: 10 });
  const tIon10 = await strike(2, 4, { sym: 'O', d: 10 });
  ok(tIon.effect === 'ion' && tIon.charge === -1 && tIon3.charge === -2 && tIon10.charge === -3, '10 J to 1 MJ makes ions; charge size from coulombs: 0.3 C → −1, 0.9 C → −2, 3 C → −3 (oxygen)',
    [tIon, tIon3, tIon10].map(t => t.Q.toFixed(1) + ' C → ' + t.charge).join(' · '));
  const tBreak = await strike(5, 0, { sym: 'C', d: 12, bond: true });
  ok(tBreak.effect === 'break' && tBreak.bondsBefore === 1 && tBreak.bondsAfter === 0 && tBreak.charge === 1, '1 MJ to 1 GJ (100 MV × 1 A = 30 MJ): bonds broken and the atom charged', JSON.stringify(tBreak));
  const tStrip = await strike(7, 0, { sym: 'O', d: 12 });
  await sleep(400);
  const mk = await ev(() => CHEMVENTUR.Stage3Game.Grid.debugState().markers);
  ok(tStrip.effect === 'strip' && tStrip.charge === 8, '1 GJ and more (1 TV × 1 A = 300 GJ): all electrons stripped, bare oxygen nucleus +8', JSON.stringify(tStrip));
  ok(mk.big >= 1, 'charge of 2 or more shows a bigger marker', JSON.stringify(mk));
  const disc = await ev(() => Object.keys(CHEMVENTUR.Stage3Game.Discovery.discovered));
  ok(disc.includes('ion:stripped') && disc.includes('ion:first'), 'first ion and first bare nucleus recorded as discoveries', disc.filter(k => /^ion/.test(k)).join(', '));

  // ===== bolts hotter / brighter as watts climb =====
  await field(); await set(2, 0); await sleep(400);
  const lo = await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE; P.bolts.forEach(b => { b.t = 99; }); P.debug.electro(); const s = P.debug.state(); return { heat: s.boltHeat.slice(-1)[0], color: s.boltColors.slice(-1)[0], op: s.boltOpacity.slice(-1)[0] }; });
  await sleep(400); await set(7, 4);
  const hi = await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE; P.debug.electro(); const s = P.debug.state(); return { heat: s.boltHeat.slice(-1)[0], color: s.boltColors.slice(-1)[0], op: s.boltOpacity.slice(-1)[0] }; });
  const rgb = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  const [lr, , lb] = rgb(lo.color), [hr, , hb] = rgb(hi.color);
  ok(hi.heat > lo.heat && hi.op > lo.op && lb < lr * 0.6 && hb >= hr, 'bolt colour and brightness climb with watts (orange at 69 W → violet-white at 10 TW)', '#' + lo.color + ' op ' + lo.op.toFixed(2) + ' → #' + hi.color + ' op ' + hi.op.toFixed(2));

  // ===== help card =====
  await page.keyboard.press('KeyH'); await sleep(100);
  const card = await ev(() => { const c = document.querySelector('.s3g-help .s3g-electrics'); return c && !c.closest('.s3g-help').hidden ? c.textContent : null; });
  ok(card && ['1.5 V', '230 V', '100 MV', '30 kA', 'approximate', 'Watts = volts × amps', '12 V', '400 kV'].every(t => card.includes(t)), 'help (H) has the electrics card with real-world comparisons', card ? card.slice(0, 90) + '…' : 'missing');
  await page.keyboard.press('KeyH');

  // ===== screenshot: multi-bolt, high watts =====
  await ev(() => { const G = CHEMVENTUR.Stage3Game, W = G.World, g = G.Game, n = g._nose(), f = g._aimDir();
    [...W.atoms].forEach(a => W.removeAtom(a)); g._spawnStartAtoms();
    const syms = ['C', 'O', 'N', 'H', 'Cl', 'C', 'O', 'S'];
    for (let i = 0; i < 36; i++) { const d = 14 + (i % 6) * 4, sx = ((i * 7) % 11 - 5) * 1.6, sy = ((i * 5) % 9 - 4) * 1.3; W.spawnAtom(syms[i % syms.length], { x: n.x + f.x * d + sx, y: n.y + f.y * d + sy, z: n.z + f.z * d }); }
    G.PNE.E.boltLife = 3; G.PNE.voltsIdx = 6; G.PNE.ampsIdx = 4; G.PNE._hud(true); G.PNE.debug.electro(); });
  await sleep(450);
  await page.screenshot({ path: path.join(shotDir, 'electro-amps.png') });
  await ev(() => { CHEMVENTUR.Stage3Game.PNE.E.boltLife = 0.3; });
  await sleep(300);

  // ===== shotgun5 =====
  await clear();
  await page.keyboard.press('Digit5'); await sleep(150);
  s = await st();
  ok(s.pelletBtn === 'shotgun5 x7' && /^💪 3\/5 · 50u/.test(s.powerBtn) && s.wattText === null, 'key 5 selects shotgun5; HUD "shotgun5 x7" and its power button', s.pelletBtn + ' · ' + s.powerBtn);
  await page.mouse.click(640, 380, { button: 'right' }); await sleep(100);
  await page.keyboard.press('Equal'); await sleep(50); s = await st();
  ok(s.modeIdx.shotgun5 === 3 && s.powerIdx.shotgun5 === 3, 'right-click (pellets) and + (power) work for shotgun5 like guns 1 and 2', s.pelletBtn + ' · ' + s.powerBtn);
  const counts = await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE, out = [];
    for (let i = 0; i < P.MODES.length; i++) { P.modeIdx.shotgun5 = i; const sh = P.debug.shoot('shotgun5'); const m = P.debug.measure(sh.id); out.push({ want: P.MODES[i], n: P.debug.kinds(sh.id).length, spread: m.maxPair }); }
    return { out, half: P.halfShipWidth }; });
  ok(counts.out.every(c => c.n === c.want) && counts.out.every(c => c.spread <= counts.half + 1e-6), 'shotgun5 pellet counts 1 · 3 · 7 · 15 · 31, beam within half the ship\'s width', counts.out.map(c => c.n + ' (' + c.spread.toFixed(2) + ')').join(' '));
  await clear();
  const mix = await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE; const m0 = { ...P.stats.mix }; P.modeIdx.shotgun5 = 2; const shots = [];
    for (let i = 0; i < 30; i++) { const sh = P.debug.shoot('shotgun5'); shots.push(Object.keys(sh.types).length); }
    const m = {}; for (const k in P.stats.mix) m[k] = P.stats.mix[k] - m0[k];
    const signs = new Set(P.pellets.filter(p => p.kind === 'charge').map(p => p.sign));
    const sp = k => { const p = P.pellets.find(x => x.kind === k); return p ? p.speed : 0; };
    return { m, mixedShots: shots.filter(n => n >= 3).length, signs: [...signs], light: sp('light'), proton: sp('proton') }; });
  ok(['string', 'proton', 'neutron', 'charge', 'light', 'sound'].every(k => mix.m[k] > 0), 'across 30 shots shotgun5 fires every component: strings, protons, neutrons, charges, light, sound', JSON.stringify(mix.m));
  ok(mix.mixedShots >= 25 && mix.signs.length === 2 && mix.light > 2 * mix.proton, 'each shot is a random mix; charges come as + and −; light dots fly more than twice as fast as protons', mix.mixedShots + '/30 shots with 3+ types · signs ' + mix.signs.join(',') + ' · light ' + mix.light.toFixed(0) + ' vs proton ' + mix.proton.toFixed(0));
  await sleep(120);
  s = await st();
  ok(s.drawn.strings > 0 && s.drawn.rings > 0 && s.drawn.light > 0 && s.drawn.chargePlus + s.drawn.chargeMinus > 0 && s.drawn.protons > 0 && s.drawn.neutrons > 0, 'all components are drawn (instanced squiggles, rings, light, charge dots, protons, neutrons)', JSON.stringify(s.drawn));
  await page.waitForFunction(() => CHEMVENTUR.Stage3Game.PNE.pellets.length === 0, { timeout: 15000 });
  await ev(() => { const P = CHEMVENTUR.Stage3Game.PNE; P.stats.maxTraveled.shotgun5 = 0; P.stats.maxRadius = 0; P.powerIdx.shotgun5 = 4; P.modeIdx.shotgun5 = 4; for (let i = 0; i < 4; i++) P.debug.shoot('shotgun5'); });
  await page.waitForFunction(() => CHEMVENTUR.Stage3Game.PNE.pellets.length === 0, { timeout: 15000 });
  s = await st();
  ok(s.stats.maxTraveled.shotgun5 <= 90 + 1e-6 && s.stats.maxRadius <= 90 + 1e-6 && s.stats.maxTraveled.shotgun5 > 60, 'full power: shotgun5 pellets stay within their range and the arena', 'travelled ' + s.stats.maxTraveled.shotgun5.toFixed(1) + ', max distance from centre ' + s.stats.maxRadius.toFixed(1));
  // component effects
  const fx = await ev(() => { const G = CHEMVENTUR.Stage3Game, W = G.World, P = G.PNE, out = {};
    const a = W.spawnAtom('C', { x: 0, y: 30, z: 0 }), b = W.spawnAtom('C', { x: 5, y: 30, z: 0 }), c = W.spawnAtom('C', { x: 10, y: 30, z: 0 });
    out.minus = P.debug.applyHit('charge', a, -1) && a.charge; out.plus = P.debug.applyHit('charge', b, +1) && b.charge;
    const e0 = c.energy; out.string = P.debug.applyHit('string', c); const e1 = c.energy; out.light = P.debug.applyHit('light', c); out.energy = [e0, e1, c.energy];
    [a, b, c].forEach(x => W.removeAtom(x)); return out; });
  ok(fx.minus === -1 && fx.plus === 1 && fx.energy[1] > fx.energy[0] && fx.energy[2] > fx.energy[1], 'charge dots charge the atom (+ / −); strings and light add energy', JSON.stringify(fx));
  const snd = await ev(async () => { const G = CHEMVENTUR.Stage3Game, W = G.World, P = G.PNE, g = G.Game, n = g._nose(), f = g._aimDir();
    [...W.atoms].forEach(a => W.removeAtom(a));
    for (let i = 0; i < 12; i++) W.spawnAtom('Ne', { x: n.x + f.x * (5 + i * 1.5) + (i % 3 - 1) * 1.5, y: n.y + f.y * (5 + i * 1.5) + ((i + 1) % 3 - 1) * 1.5, z: n.z + f.z * (5 + i * 1.5) });
    const s0 = P.stats.soundNudges; P.modeIdx.shotgun5 = 4; P.powerIdx.shotgun5 = 2;
    for (let k = 0; k < 6 && P.stats.soundNudges === s0; k++) { P.debug.shoot('shotgun5'); await new Promise(r => setTimeout(r, 900)); }
    return P.stats.soundNudges - s0; });
  ok(snd > 0, 'sound rings nudge the atoms they sweep over', 'nudges ' + snd);
  await ev(() => CHEMVENTUR.Stage3Game.Grid.toggle('pressure', true));
  await sleep(300);
  const pul = await ev(async () => { const P = CHEMVENTUR.Stage3Game.PNE; P.modeIdx.shotgun5 = 4; let best = 0;
    for (let k = 0; k < 4; k++) { P.debug.shoot('shotgun5'); await new Promise(r => setTimeout(r, 150)); best = Math.max(best, CHEMVENTUR.Stage3Game.Grid.debugState().pulses); }
    return best; });
  ok(pul > 0, 'with Grid pressure on, sound rings ripple the pressure plates', 'rings shown on the plates ' + pul);
  await ev(() => CHEMVENTUR.Stage3Game.Grid.toggle('pressure', false));

  // ===== FIRST DISCOVERY banner on the first shotgun5 shot =====
  await page.waitForFunction(() => { const D = CHEMVENTUR.Stage3Game.Discovery; return !D.active && !D.queue.length; }, { timeout: 30000 });
  await page.keyboard.down('ShiftLeft'); await page.keyboard.press('KeyK'); await page.keyboard.up('ShiftLeft');
  await page.keyboard.press('KeyK');
  await ev(() => CHEMVENTUR.Stage3Game.PNE.debug.shoot('shotgun5'));
  await sleep(200);
  const ban = await ev(() => CHEMVENTUR.Stage3Game.Discovery.debugState());
  ok(ban.enabled && /^FIRST DISCOVERY: shotgun5/.test(ban.bannerText || ''), 'first shotgun5 shot shows a FIRST DISCOVERY banner', ban.bannerText);
  await page.waitForFunction(() => !CHEMVENTUR.Stage3Game.Discovery.active, { timeout: 15000 });

  // ===== screenshot: shotgun5 spray =====
  await ev(() => { const G = CHEMVENTUR.Stage3Game, W = G.World, g = G.Game, n = g._nose(), f = g._aimDir();
    [...W.atoms].forEach(a => W.removeAtom(a)); G.PNE.pellets.length = 0; g._spawnStartAtoms();
    ['C', 'O', 'N', 'H', 'C', 'H', 'O'].forEach((s, i) => W.spawnAtom(s, { x: n.x + f.x * (16 + i * 4) + (i % 2 ? 1.6 : -1.6), y: n.y + (i % 3 - 1) * 1.2, z: n.z + f.z * (16 + i * 4) }));
    G.PNE.modeIdx.shotgun5 = 4; G.PNE.powerIdx.shotgun5 = 3; });
  await page.keyboard.down('Space'); await sleep(900);
  await page.screenshot({ path: path.join(shotDir, 'shotgun5.png') });
  await sleep(1500);
  const fr = await ev(() => ({ fps: CHEMVENTUR.Stage3Game.debug.state().fps, alive: CHEMVENTUR.Stage3Game.PNE.pellets.length }));
  await page.keyboard.up('Space');
  ok(fr.fps >= 12 && fr.alive > 50, 'holding shotgun5 at x31: frame rate holds', 'fps ' + fr.fps + ' with ' + fr.alive + ' pellets in flight');

  ok(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
