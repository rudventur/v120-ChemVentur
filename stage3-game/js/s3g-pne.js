/* CHEMVENTUR Stage 3: guns 1-3 — shotgun1proton, SHOTGUN2neutron, Electrogun.
   1 shotgun1proton: a mist of fast, short-lived red protons. Right-click (or tap the "x7" button) cycles the
     pellets per shot: 1 · 3 · 7 · 15 · 31. The beam width grows with the count, up to HALF the ship's width
     (pellets fly parallel, so the beam never gets wider than that). Power (wheel, + / −, or the power button)
     sets the range: 15 · 30 · 50 · 70 · 90 units, never more than the arena radius.
     On hit: pushes the atom. Low chance (2 %) — or 6 proton hits on one atom within 0.5 s — of a PROTON BLAST:
     a bonded atom is knocked out of its molecule (all its bonds break); a lone atom captures the proton and
     moves up one element (H → He, C → N …).
   2 SHOTGUN2neutron: the same, with bigger blue pellets that live 3 s (power sets their speed, so they still
     reach the chosen range) and fall under slight gravity, so their arc is visible.
     On hit: smaller push. 12 % chance — or 3 neutron hits within 0.6 s — of NEUTRON CAPTURE: the nucleus gets
     one more neutron (an isotope: ¹H → ²H deuterium → ³H tritium, ¹²C → ¹³C …); too many neutrons and it
     beta-decays (a neutron turns into a proton: one element up). If a proton hit the same atom in the last
     second, 50 % chance the proton and neutron FORM A NUCLEUS together: one element up and two mass units more.
   3 Electrogun: a lightning bolt to the atom nearest the crosshair (reach set by the volts), then it jumps to the
     nearest not-yet-struck atom within 10 units (number of jumps set by the volts). Struck atoms become IONS: atoms
     with electronegativity ≥ 2.6 (N, O, F, Cl, Br, I) catch electrons (−), the others lose them (+), charge
     limited to ±3 (a fully stripped atom is +Z). Ions attract / repel each other (simple Coulomb push). Charges show in the Grid charge display.
   Electrogun ELECTRICS: AMPS (right-click or the ⚡ button) = number of simultaneous bolts, 1 · 2 · 3 · 5 · 10
     (1 A per bolt). VOLTS (wheel, + / −, or the 🔋 button), logarithmic: 0 V · 1.5 V (AA battery) · 230 V (mains)
     · 10 kV · 1 MV · 100 MV (lightning) · 1 GV · 1 TV = 10¹² V (pulsar wind, approximate). Volts set the bolt reach
     and the number of jumps. Watts = V × A (HUD readout); bolts get brighter and hotter in colour as watts climb.
     Energy per strike, joules = watts × 0.3 s (strike time), picks the effect tier: under 10 J spark only ·
     10 J – 1 MJ make ions · 1 MJ – 1 GJ also break the atom's bonds · 1 GJ and more strip ALL electrons (bare
     nucleus, charge +Z). Charge per strike, coulombs = amps × 0.3 s, sets the ion charge size: ±1, from 0.9 C ±2,
     from 2.5 C ±3.
   5 shotgun5: the same pellet modes and power as guns 1 and 2, but every pellet is a random pick from a mix:
     tiny STRING squiggles (vibrate the atom they hit), red PROTONS and blue NEUTRONS (exactly as guns 1 and 2),
     CHARGE dots (+ red / − blue: give the atom that charge), LIGHT dots (very fast, short bright flashes that
     excite the atom) and SOUND (a small expanding translucent ring, a pressure wave that nudges every atom it
     passes and ripples the Grid pressure plates when they are on).
   Isotopes and ions are not passed to "What did I build?" (it identifies the neutral elements).
   Hooks: Game.boot -> attach(game); Game._trigger -> fire(game); Game._frame -> tick(game, dt);
   right-click / wheel / + − keys -> cycleMode / adjustPower. */
(function () {
  'use strict';
  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});
  const V = G.V, C = G.Config;

  const MODES = [1, 3, 7, 15, 31];
  const WIDTH_FRAC = [0, 0.25, 0.5, 0.75, 1];          // × half the ship's width
  const POWER = [15, 30, 50, 70, 90];                   // range in world units (clamped to the arena radius)
  const P = { speed: 70, cooldown: 0.12, radius: 0.09, vis: 0.16, push: 0.35, energy: 0.05, blastChance: 0.02, burstHits: 6, burstWindow: 0.5, color: '#ff2a2a' };
  const N = { life: 3.0, minSpeed: 4, cooldown: 0.22, radius: 0.15, vis: 0.26, push: 0.25, energy: 0.05, gravity: 1.5, captureChance: 0.12, burstHits: 3, burstWindow: 0.6, comboChance: 0.5, comboWindow: 1.0, color: '#3d8bff' };
  const E = { cone: 0.16, jumpRadius: 10, cooldown: 0.35, boltLife: 0.3, enThreshold: 2.6, coulomb: 6, coulombRange: 14 };
  const CAP = 2000;                                      // pellets alive at once (per kind)
  // Electrogun electrics
  const VOLTS = [
    { v: 0, name: '0 V', note: 'off: no current flows', reach: 0, jumps: 0 },
    { v: 1.5, name: '1.5 V', note: 'AA battery', reach: 8, jumps: 0 },
    { v: 230, name: '230 V', note: 'mains socket', reach: 15, jumps: 1 },
    { v: 1e4, name: '10 kV', note: 'static spark', reach: 25, jumps: 2 },
    { v: 1e6, name: '1 MV', note: 'big Van de Graaff', reach: 35, jumps: 4 },
    { v: 1e8, name: '100 MV', note: 'lightning', reach: 45, jumps: 6 },
    { v: 1e9, name: '1 GV', note: 'strongest lightning', reach: 60, jumps: 8 },
    { v: 1e12, name: '1 TV', note: 'pulsar wind (approx.)', reach: 90, jumps: 12 }
  ];
  const AMPS = [1, 2, 3, 5, 10];                         // = simultaneous bolts (1 A per bolt)
  const STRIKE_TIME = 0.3;                               // seconds per strike (energy and charge)
  const TIERS = [{ min: 0, id: 'spark', name: 'spark only' }, { min: 10, id: 'ion', name: 'make ions' },
    { min: 1e6, id: 'break', name: 'break bonds' }, { min: 1e9, id: 'strip', name: 'strip electrons' }];
  // shotgun5 mix: type and weight
  const MIX = [['string', 0.24], ['proton', 0.16], ['neutron', 0.16], ['charge', 0.18], ['light', 0.14], ['sound', 0.12]];
  const K5 = { cooldown: 0.25, string: { speed: 45, radius: 0.1, vis: 0.3 }, charge: { speed: 50, radius: 0.1, vis: 0.15 },
    light: { speed: 160, radius: 0.08, vis: 0.13 }, sound: { speed: 22, life: 1.4, grow: 2.4 } };
  const pickMix = () => { let r = Math.random(); for (const [k, w] of MIX) { if ((r -= w) < 0) return k; } return 'string'; };
  // 1234 -> "1.23 k" + unit
  function fmtUnit(x, u) {
    if (!x) return '0 ' + u;
    for (const [f, pre] of [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm']]) {
      if (Math.abs(x) >= f * 0.9995) { const v = x / f; return (v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100) + ' ' + pre + u; }
    }
    return x.toExponential(1) + ' ' + u;
  }
  // bolt colour ramp by watts: dull orange → yellow → white → blue-white → violet-white
  const RAMP = [[0, [1, 0.42, 0.23]], [0.35, [1, 0.82, 0.29]], [0.6, [1, 1, 1]], [0.8, [0.62, 0.85, 1]], [1, [0.8, 0.66, 1]]];
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) { const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i], k = (t - t0) / (t1 - t0); return c0.map((c, j) => c + (c1[j] - c) * k); }
    return RAMP[RAMP.length - 1][1];
  }
  const STORE = 'cv.s3g.pne.v1';

  // Pauling electronegativity (0 = noble gas / unknown: no polarity)
  const EN = { H: 2.20, Li: 0.98, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.90,
    P: 2.19, S: 2.58, Cl: 3.16, K: 0.82, Ca: 1.00, Fe: 1.83, Cu: 1.90, Zn: 1.65, Br: 2.96, I: 2.66, U: 1.38 };
  const A0 = [0, 1, 4, 7, 9, 11, 12, 14, 16, 19, 20, 23, 24, 27, 28, 31, 32, 35, 40, 39, 40];
  const massNumber = (Z) => A0[Z] || Math.round(Z * 2.3);
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻' };
  const sup = (s) => String(s).split('').map(c => SUP[c] || c).join('');
  const isoName = (sym, A) => sym === 'H' && A === 2 ? '²H (deuterium)' : sym === 'H' && A === 3 ? '³H (tritium)' : sup(A) + sym;
  const ionName = (sym, q) => sym + (Math.abs(q) > 1 ? sup(Math.abs(q)) : '') + (q > 0 ? '⁺' : '⁻');
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

  const PNE = {
    MODES, POWER, P, N, E, EN, massNumber, isoName, VOLTS, AMPS, STRIKE_TIME, TIERS, MIX, K5, fmtUnit,
    game: null, pellets: [], shotId: 0, time: 0, halfShipWidth: 2.1,
    modeIdx: { proton: 2, neutron: 2, shotgun5: 2 }, powerIdx: { proton: 2, neutron: 2, shotgun5: 2 }, ampsIdx: 0, voltsIdx: 4,
    bolts: [], lastShot: null, lastBolt: null, log: [],
    stats: { protonShots: 0, neutronShots: 0, shotgun5Shots: 0, protonHits: 0, neutronHits: 0, blasts: 0, captures: 0, nuclei: 0, decays: 0, ions: 0, strikes: 0,
      sparks: 0, bondsBroken: 0, stripped: 0, mix: { string: 0, proton: 0, neutron: 0, charge: 0, light: 0, sound: 0 },
      stringHits: 0, chargeHits: 0, lightHits: 0, soundNudges: 0, maxTraveled: { proton: 0, neutron: 0, shotgun5: 0 }, maxRadius: 0 },

    usesPellets(gun) { return gun === 'proton' || gun === 'neutron' || gun === 'shotgun5'; },
    hasPower(gun) { return this.usesPellets(gun) || gun === 'electron'; },          // wheel / + − / 💪 button
    range(kind) { return Math.min(POWER[this.powerIdx[kind]], C.ARENA_RADIUS); },
    count(kind) { return MODES[this.modeIdx[kind]]; },
    gunName(kind) { return kind === 'proton' ? 'shotgun1proton' : kind === 'neutron' ? 'SHOTGUN2neutron' : 'shotgun5'; },
    label(kind) { return this.gunName(kind) + ' x' + this.count(kind); },
    // electrics of the current Electrogun setting
    elec() {
      const L = VOLTS[this.voltsIdx], A = AMPS[this.ampsIdx], V = L.v, W = V * A, J = +(W * STRIKE_TIME).toPrecision(12), Q = +(A * STRIKE_TIME).toPrecision(12);   // toPrecision: 3 × 0.3 = 0.9, not 0.8999…
      let tier = TIERS[0]; for (const t of TIERS) if (J >= t.min) tier = t;
      return { V, A, W, J, Q, dq: Q < 0.9 ? 1 : Q < 2.5 ? 2 : 3, tier: tier.id, tierName: tier.name, reach: Math.min(L.reach, C.ARENA_RADIUS), jumps: L.jumps,
        voltsName: L.name, voltsNote: L.note, text: fmtUnit(W, 'W') + ' · ' + fmtUnit(J, 'J') + ' · ' + (Math.round(Q * 100) / 100) + ' C → ' + (V ? tier.name : 'nothing') };
    },

    attach(game) {
      this.game = game;
      const T = G.THREE;
      try {
        const s = JSON.parse(localStorage.getItem(STORE) || 'null');
        if (s) { Object.assign(this.modeIdx, s.modeIdx); Object.assign(this.powerIdx, s.powerIdx); if (s.ampsIdx != null) this.ampsIdx = s.ampsIdx; if (s.voltsIdx != null) this.voltsIdx = s.voltsIdx; }
      } catch (e) { /* ignore */ }
      const size = new T.Box3().setFromObject(game.ship).getSize(new T.Vector3());
      this.shipWidth = size.x;
      this.halfShipWidth = size.x / 2;
      const mk = (color, opacity) => {
        const m = new T.InstancedMesh(new T.SphereGeometry(1, 6, 4), new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, blending: opacity < 1 ? T.AdditiveBlending : T.NormalBlending, depthWrite: opacity >= 1 }), CAP);
        m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.count = 0; m.frustumCulled = false;
        game.scene.add(m); return m;
      };
      this.meshP = mk(P.color, 1); this.haloP = mk('#ff5a3a', 0.22);
      this.meshN = mk(N.color, 1); this.haloN = mk('#5aa8ff', 0.2);
      // shotgun5 extras: string squiggles, charge dots, light flashes, sound rings
      const mkG = (geo, mat) => { const m = new T.InstancedMesh(geo, mat, CAP); m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; game.scene.add(m); return m; };
      const pts = []; for (let i = 0; i <= 16; i++) { const x = i / 16 * 2 - 1; pts.push(new T.Vector3(x, 0.35 * Math.sin(3 * Math.PI * x), 0.25 * Math.cos(2 * Math.PI * x))); }
      this.meshS = mkG(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, 0.09, 3, false), new T.MeshBasicMaterial({ color: '#e070ff' }));
      this.meshCp = mk('#ff6a6a', 1); this.meshCm = mk('#6aa8ff', 1);
      this.meshL = mk('#fffbe8', 1); this.haloL = mk('#fff0a0', 0.35);
      this.meshR = mkG(new T.RingGeometry(0.86, 1, 40), new T.MeshBasicMaterial({ color: '#a8ffe0', transparent: true, opacity: 0.24, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
      this._dummy = new T.Object3D(); this._zAxis = new T.Vector3(0, 0, 1); this._tv = new T.Vector3();

      // HUD: pellets-per-shot and power buttons (phone-friendly alternatives to right-click / wheel)
      const h = game.hud;
      const btn = (cls, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 's3g-btn ' + cls; b.title = title; b.addEventListener('click', fn); h.guns.appendChild(b); return b; };
      this.pelletBtn = btn('s3g-pellets', 'Right-click on the game (or tap here): pellets per shot (guns 1, 2, 5) or amps = number of bolts (Electrogun)', () => this.cycleMode(game.gun));
      this.powerBtn = btn('s3g-power', 'Mouse wheel or + / − (or tap here): shot power = range (guns 1, 2, 5) or volts (Electrogun)', () => this.adjustPower(game.gun, +1, true));
      this.wattEl = document.createElement('span'); this.wattEl.className = 's3g-watts'; this.wattEl.title = 'Electrogun: watts = volts × amps · joules per strike = watts × 0.3 s · coulombs per strike = amps × 0.3 s'; this.wattEl.hidden = true;
      h.guns.appendChild(this.wattEl);
      h.root.addEventListener('contextmenu', e => e.preventDefault());
      this._electricsCard(h);
      this._hud(true);
    },

    save() { try { localStorage.setItem(STORE, JSON.stringify({ modeIdx: this.modeIdx, powerIdx: this.powerIdx, ampsIdx: this.ampsIdx, voltsIdx: this.voltsIdx })); } catch (e) { /* ignore */ } },

    // "Electrics" card in the help panel (H): units and well-known real-world figures
    _electricsCard(h) {
      if (!h.help) return;
      const card = document.createElement('div'); card.className = 's3g-electrics';
      const title = document.createElement('div'); title.className = 's3g-electrics-title'; title.textContent = '⚡ ELECTRICS (Electrogun, key 3)';
      const p = (t) => { const e = document.createElement('p'); e.className = 's3g-small'; e.textContent = t; return e; };
      const dl = document.createElement('dl'); dl.className = 's3g-help-list';
      [['AA battery', '1.5 V'], ['car battery', '12 V'], ['mains socket (UK / Europe)', '230 V · a 13 A plug fuse allows about 3 kW (a kettle)'],
        ['static shock (door handle)', 'a few thousand volts, tiny current'], ['overhead power lines (UK)', 'up to 400 kV'],
        ['lightning', 'about 100 MV (estimates reach about 1 GV) · about 30 kA typical peak current · under a millisecond per stroke'],
        ['pulsar (spinning neutron star)', 'about 10¹² V or more across its magnetic field (approximate)']
      ].forEach(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); });
      card.append(title,
        p('Watts = volts × amps · joules = watts × seconds · coulombs = amps × seconds. In the game, amps = number of bolts (1 A each) and every strike lasts 0.3 s.'),
        p('Volts (wheel, + / −, 🔋): 0 V · 1.5 V · 230 V · 10 kV · 1 MV · 100 MV · 1 GV · 1 TV (10¹² V); more volts = longer reach and more jumps. Amps (right-click, ⚡): 1 · 2 · 3 · 5 · 10 bolts.'),
        p('Energy per strike: under 10 J = spark only · 10 J to 1 MJ = makes ions · 1 MJ to 1 GJ = also breaks bonds · 1 GJ and more = strips all electrons (bare nucleus). Charge per strike: under 0.9 C = ±1 · 0.9 C = ±2 · 2.5 C and more = ±3.'),
        dl);
      h.help.insertBefore(card, h.help.lastChild);
      this.card = card;
    },

    cycleMode(gun) {
      if (gun === 'electron') {
        this.ampsIdx = (this.ampsIdx + 1) % AMPS.length;
        this.save(); this._hud(true);
        const e = this.elec();
        this.game._status('⚡ Electrogun ' + e.A + ' A = ' + e.A + ' bolt' + (e.A > 1 ? 's' : '') + ' · ' + e.text);
        return true;
      }
      if (!this.usesPellets(gun)) return false;
      this.modeIdx[gun] = (this.modeIdx[gun] + 1) % MODES.length;
      this.save(); this._hud(true);
      this.game._status('🔫 ' + this.label(gun) + ' · beam ' + (this.halfShipWidth * WIDTH_FRAC[this.modeIdx[gun]]).toFixed(2) + ' u wide (max ' + this.halfShipWidth.toFixed(2) + ')');
      return true;
    },

    adjustPower(gun, d, wrap) {
      if (gun === 'electron') {
        let i = this.voltsIdx + d;
        if (wrap) i = (i + VOLTS.length) % VOLTS.length; else i = Math.max(0, Math.min(VOLTS.length - 1, i));
        this.voltsIdx = i; this.save(); this._hud(true);
        const e = this.elec();
        this.game._status('🔋 Electrogun ' + e.voltsName + ' (' + e.voltsNote + ') · reach ' + e.reach + ' u · ' + e.jumps + ' jumps · ' + e.text);
        return true;
      }
      if (!this.usesPellets(gun)) return false;
      let i = this.powerIdx[gun] + d;
      if (wrap) i = (i + POWER.length) % POWER.length; else i = Math.max(0, Math.min(POWER.length - 1, i));
      this.powerIdx[gun] = i;
      this.save(); this._hud(true);
      this.game._status('💪 ' + this.gunName(gun) + ' power ' + (i + 1) + '/' + POWER.length + ' · range ' + this.range(gun) + ' u (arena radius ' + C.ARENA_RADIUS + ')');
      return true;
    },

    _hud(force) {
      const g = this.game; if (!g || !this.pelletBtn) return;
      const el = g.gun === 'electron', on = this.usesPellets(g.gun) || el, e = el ? this.elec() : null;
      const pt = el ? '⚡ ' + e.A + ' A · ' + e.A + ' bolt' + (e.A > 1 ? 's' : '') : on ? this.label(g.gun) : '';
      const wt = el ? '🔋 ' + e.voltsName + ' · ' + e.voltsNote : on ? '💪 ' + (this.powerIdx[g.gun] + 1) + '/' + POWER.length + ' · ' + this.range(g.gun) + 'u' : '';
      const xt = el ? e.text : '';
      if (force || this.pelletBtn.textContent !== pt) { this.pelletBtn.textContent = pt; this.pelletBtn.hidden = !on; }
      if (force || this.powerBtn.textContent !== wt) { this.powerBtn.textContent = wt; this.powerBtn.hidden = !on; }
      if (this.wattEl && (force || this.wattEl.textContent !== xt)) { this.wattEl.textContent = xt; this.wattEl.hidden = !el; }
    },

    // ---------- firing ----------
    fire(game) {
      const id = game.gun;
      if (!this.hasPower(id)) return false;
      if (game.fireCooldown > 0) return true;
      if (id === 'electron') this.electro(game); else this.shoot(game, id);
      return true;
    },

    shoot(game, gun) {
      const mi = this.modeIdx[gun], n = MODES[mi];
      if (this.pellets.length + n > CAP * 2) return null;
      const width = this.halfShipWidth * WIDTH_FRAC[mi];       // full beam width, never more than half the ship's width
      const R = width / 2;
      const d0 = game._aimDir(), dir = { x: d0.x, y: d0.y, z: d0.z }, nose = game._nose();
      const up = Math.abs(dir.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      const u = V.norm(cross(dir, up)), v = cross(u, dir);
      const range = this.range(gun), sv = game.shipVel;
      const id = ++this.shotId, rot = Math.random() * Math.PI * 2, types = {};
      let first = null;
      for (let i = 0; i < n; i++) {
        const kind = gun === 'shotgun5' ? pickMix() : gun;
        types[kind] = (types[kind] || 0) + 1;
        const speed = kind === 'proton' ? P.speed : kind === 'neutron' ? Math.max(N.minSpeed, 0.85 * range / N.life) : K5[kind].speed;
        const vel = V.add(V.scale(dir, speed), { x: sv.x, y: sv.y, z: sv.z });
        const vlen = V.len(vel) || 1;
        const life = kind === 'neutron' ? N.life : kind === 'sound' ? Math.min(K5.sound.life, range / vlen) : range / vlen + 0.05;
        let r = 0, th = 0;
        if (n > 1) { r = R * Math.sqrt((i + 0.5) / n); th = i * 2.399963 + rot; }       // sunflower disc
        const jr = Math.max(0, Math.min(R, r + (Math.random() - 0.5) * R * 0.15));      // jitter, but stay inside the beam
        const ox = Math.cos(th) * jr, oy = Math.sin(th) * jr, st = Math.random() * 0.8;  // st: stagger along the beam (mist)
        const p = { kind, gun, shot: id, x: nose.x + u.x * ox + v.x * oy + dir.x * st, y: nose.y + u.y * ox + v.y * oy + dir.y * st, z: nose.z + u.z * ox + v.z * oy + dir.z * st,
          vx: vel.x, vy: vel.y, vz: vel.z, life, age: 0, traveled: 0, range, speed: vlen,
          sign: kind === 'charge' ? (Math.random() < 0.5 ? 1 : -1) : 0, spin: Math.random() * 6.283, dir, hitSet: kind === 'sound' ? new Set() : null };
        this.pellets.push(p);
        if (!first) first = p;
        if (gun === 'shotgun5') this.stats.mix[kind]++;
      }
      game.fireCooldown = gun === 'proton' ? P.cooldown : gun === 'neutron' ? N.cooldown : K5.cooldown;
      this.stats[gun + 'Shots']++;
      if (game.started && G.Audio) G.Audio.blip(gun === 'proton' ? 1400 : gun === 'neutron' ? 320 : 700 + Math.random() * 900, 0.04, gun === 'neutron' ? 'sine' : 'square', 0.03);
      if (gun === 'shotgun5') G.World.emit('discover', { key: 'shot:shotgun5', name: 'shotgun5: strings, nucleons, charges, light and sound', kind: 'NEW ENERGY' });
      this.lastShot = { id, kind: gun, gun, n, width, range, types, life: Math.round(first.life * 1000) / 1000, speed: Math.round(first.speed * 100) / 100, dir };
      return this.lastShot;
    },

    // ---------- per-frame ----------
    tick(game, dt) {
      const W = G.World;
      const sim = game.slow > 0 ? dt * 0.22 : dt;              // same brief slow-down as World.step
      this.time += sim;
      this._buildHash(W.atoms);
      const gOn = !!(G.Grid && G.Grid.state.gravity), gW = G.Grid ? G.Grid.GRAVITY : 0;
      const AR = C.ARENA_RADIUS, AR2 = AR * AR, ps = this.pellets;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.vy -= (p.kind === 'neutron' ? N.gravity : (gOn && p.kind !== 'light' && p.kind !== 'sound' ? gW : 0)) * sim;
        let sx = p.vx * sim, sy = p.vy * sim, sz = p.vz * sim;
        const step = Math.hypot(sx, sy, sz), rem = p.range - p.traveled;
        let dead = false;
        if (step >= rem) { const k = rem / (step || 1); sx *= k; sy *= k; sz *= k; dead = true; }   // never travel past the range
        const nx = p.x + sx, ny = p.y + sy, nz = p.z + sz;
        if (nx * nx + ny * ny + nz * nz > AR2) dead = true;                                          // never leave the arena
        else {
          const a = p.kind === 'sound' ? null : this._hit(p.x, p.y, p.z, nx, ny, nz, p.kind === 'proton' ? P.radius : p.kind === 'neutron' ? N.radius : K5[p.kind].radius);
          p.x = nx; p.y = ny; p.z = nz; p.traveled += Math.min(step, rem); p.age += sim;
          if (a) { this._applyHit(p, a); dead = true; }
          if (p.kind === 'sound') this._sound(p, W);
          if (p.age >= p.life) dead = true;
          const mt = this.stats.maxTraveled, mk = p.gun === 'shotgun5' ? 'shotgun5' : p.kind; if (p.traveled > mt[mk]) mt[mk] = p.traveled;
          const rr = Math.sqrt(nx * nx + ny * ny + nz * nz); if (rr > this.stats.maxRadius) this.stats.maxRadius = rr;
        }
        if (dead) { ps[i] = ps[ps.length - 1]; ps.pop(); }
      }
      this._coulomb(W, sim);
      this._draw();
      this._bolts(dt);
      this._hud(false);
    },

    _draw() {
      let np = 0, nn = 0, ns = 0, ncp = 0, ncm = 0, nl = 0, nr = 0;
      const mp = this.meshP.instanceMatrix.array, hp = this.haloP.instanceMatrix.array, mn = this.meshN.instanceMatrix.array, hn = this.haloN.instanceMatrix.array;
      const mcp = this.meshCp.instanceMatrix.array, mcm = this.meshCm.instanceMatrix.array, ml = this.meshL.instanceMatrix.array, hl = this.haloL.instanceMatrix.array;
      const put = (arr, i, s, p) => { const o = i * 16; arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0; arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
        arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0; arr[o + 12] = p.x; arr[o + 13] = p.y; arr[o + 14] = p.z; arr[o + 15] = 1; };
      const d = this._dummy;
      for (const p of this.pellets) {
        if (p.kind === 'proton') { put(mp, np, P.vis, p); put(hp, np, P.vis * 2.6, p); np++; }
        else if (p.kind === 'neutron') { put(mn, nn, N.vis, p); put(hn, nn, N.vis * 2.4, p); nn++; }
        else if (p.kind === 'charge') { if (p.sign > 0) put(mcp, ncp++, K5.charge.vis, p); else put(mcm, ncm++, K5.charge.vis, p); }
        else if (p.kind === 'light') { const f = 0.7 + 0.6 * Math.random(); put(ml, nl, K5.light.vis * f, p); put(hl, nl, K5.light.vis * 4 * f, p); nl++; }
        else if (p.kind === 'string') {          // wriggling squiggle
          d.position.set(p.x, p.y, p.z); d.rotation.set(p.spin + p.age * 9, p.spin * 0.7 + p.age * 5, p.age * 13); d.scale.setScalar(K5.string.vis * (1 + 0.25 * Math.sin(p.age * 30)));
          d.updateMatrix(); this.meshS.setMatrixAt(ns++, d.matrix);
        } else if (p.kind === 'sound') {         // expanding ring facing its travel direction
          d.position.set(p.x, p.y, p.z); d.quaternion.setFromUnitVectors(this._zAxis, this._tv.set(p.dir.x, p.dir.y, p.dir.z));
          d.scale.setScalar(this.ringRadius(p)); d.updateMatrix(); this.meshR.setMatrixAt(nr++, d.matrix);
        }
      }
      this.meshP.count = this.haloP.count = np; this.meshN.count = this.haloN.count = nn;
      this.meshS.count = ns; this.meshCp.count = ncp; this.meshCm.count = ncm; this.meshL.count = this.haloL.count = nl; this.meshR.count = nr;
      [this.meshP, this.haloP, this.meshN, this.haloN, this.meshS, this.meshCp, this.meshCm, this.meshL, this.haloL, this.meshR].forEach(m => { m.instanceMatrix.needsUpdate = true; });
    },
    ringRadius(p) { return 0.3 + p.age * K5.sound.grow; },
    // sound: the ring nudges every atom it sweeps over (once per ring)
    _sound(p, W) {
      const r = this.ringRadius(p), d = p.dir;
      for (const a of W.atoms) {
        if (p.hitSet.has(a.id)) continue;
        const rx = a.pos.x - p.x, ry = a.pos.y - p.y, rz = a.pos.z - p.z, along = rx * d.x + ry * d.y + rz * d.z;
        if (Math.abs(along) > 1.2) continue;
        const px = rx - d.x * along, py = ry - d.y * along, pz = rz - d.z * along, radial = Math.hypot(px, py, pz);
        if (radial > r + a.r) continue;
        p.hitSet.add(a.id);
        const k = radial > 1e-3 ? 0.4 / radial : 0;
        a.vel.x += d.x * 0.6 + px * k; a.vel.y += d.y * 0.6 + py * k; a.vel.z += d.z * 0.6 + pz * k;
        a.energy = Math.min(2.4, a.energy + 0.03);
        this.stats.soundNudges++;
      }
    },

    // spatial hash of atoms (cell 4 units) for cheap pellet collisions
    _buildHash(atoms) {
      const h = this._hash || (this._hash = new Map());
      h.clear();
      for (const a of atoms) {
        const k = this._key(Math.floor(a.pos.x / 4), Math.floor(a.pos.y / 4), Math.floor(a.pos.z / 4));
        let l = h.get(k); if (!l) { l = []; h.set(k, l); } l.push(a);
      }
    },
    _key(i, j, k) { return ((i + 512) * 1048576) + ((j + 512) * 1024) + (k + 512); },
    _hit(x0, y0, z0, x1, y1, z1, pr) {
      const mx = Math.floor((x0 + x1) / 8), my = Math.floor((y0 + y1) / 8), mz = Math.floor((z0 + z1) / 8);
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L2 = dx * dx + dy * dy + dz * dz || 1e-9;
      let best = null, bt = 2;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const l = this._hash.get(this._key(mx + i, my + j, mz + k)); if (!l) continue;
        for (const a of l) {
          const cx = a.pos.x - x0, cy = a.pos.y - y0, cz = a.pos.z - z0;
          const t = Math.max(0, Math.min(1, (cx * dx + cy * dy + cz * dz) / L2));
          const ex = cx - dx * t, ey = cy - dy * t, ez = cz - dz * t, rr = a.r + pr;
          if (ex * ex + ey * ey + ez * ez < rr * rr && t < bt) { bt = t; best = a; }
        }
      }
      return best;
    },

    // ---------- hit effects ----------
    _applyHit(p, a) {
      const W = G.World;
      if (p.kind === 'string') {               // a glimpse of string scale: the atom vibrates
        V.addTo(a.vel, V.randUnit(), 0.3); a.energy = Math.min(2.4, a.energy + 0.12); a.flash = { color: '#e070ff', t: 0.3 };
        this.stats.stringHits++; return 'string';
      }
      if (p.kind === 'light') {                // a photon excites the atom
        a.energy = Math.min(2.4, a.energy + 0.15); a.flash = { color: '#ffffff', t: 0.35 };
        this.stats.lightHits++; return 'light';
      }
      if (p.kind === 'charge') {               // a + or − charge sticks to the atom
        const before = a.charge || 0;
        a.charge = Math.max(-3, Math.min(3, before + p.sign));
        a.flash = { color: p.sign > 0 ? '#ff7a7a' : '#7ab0ff', t: 0.4 };
        this.stats.chargeHits++;
        if (before === 0 && a.charge !== 0) { this.stats.ions++; W.emit('discover', { key: 'ion:first', name: 'Ion: ' + ionName(a.symbol, a.charge), kind: 'NEW ENERGY' }); }
        return 'charge';
      }
      const isP = p.kind === 'proton', K = isP ? P : N;
      V.addTo(a.vel, V.norm({ x: p.vx, y: p.vy, z: p.vz }), K.push);
      a.energy = Math.min(2.4, a.energy + K.energy);
      a.flash = { color: K.color, t: 0.25 };
      if (isP) {
        this.stats.protonHits++;
        if (this.time - (a._pWin == null ? -99 : a._pWin) > P.burstWindow) { a._pWin = this.time; a._pCount = 0; }
        a._pCount++; a._lastP = this.time;
        if (a._pCount >= P.burstHits || Math.random() < P.blastChance) { a._pCount = 0; return this.protonBlast(a); }
        return 'push';
      }
      this.stats.neutronHits++;
      if (this.time - (a._nWin == null ? -99 : a._nWin) > N.burstWindow) { a._nWin = this.time; a._nCount = 0; }
      a._nCount++;
      if (a._lastP != null && this.time - a._lastP < N.comboWindow && Math.random() < N.comboChance) { a._lastP = null; return this.formNucleus(a); }
      if (a._nCount >= N.burstHits || Math.random() < N.captureChance) { a._nCount = 0; return this.capture(a); }
      return 'push';
    },

    protonBlast(a) {
      const W = G.World;
      this.stats.blasts++;
      let what;
      if (a.bonds.length) {
        const n = a.bonds.length;
        [...a.bonds].forEach(b => W.breakBond(b));
        V.addTo(a.vel, V.randUnit(), 8);
        what = a.symbol + ' knocked out of its molecule (' + n + ' bond' + (n > 1 ? 's' : '') + ' broken)';
      } else {
        const from = a.symbol;
        what = this.transmute(a, a.Z + 1, (a.A || massNumber(a.Z)) + 1) ? from + ' + p⁺ → ' + a.symbol : from + ' shaken (no heavier element)';
      }
      a.flash = { color: '#ffffff', t: 0.8 };
      this._log('proton blast', what);
      W.emit('discover', { key: 'blast:proton', name: 'Proton blast: ' + what, kind: 'NEW ENERGY' });
      return 'blast';
    },

    capture(a) {
      const W = G.World;
      const A = (a.A || massNumber(a.Z)) + 1, before = isoName(a.symbol, A - 1);
      a.A = A;
      this.stats.captures++;
      let what = before + ' + n → ' + isoName(a.symbol, A);
      if (A - a.Z > Math.ceil(a.Z * 1.5) + 1) {                // too neutron-rich: beta decay (n → p⁺ + e⁻)
        const from = isoName(a.symbol, A);
        if (this.transmute(a, a.Z + 1, A)) { this.stats.decays++; what += ', β⁻ decay ' + from + ' → ' + isoName(a.symbol, A); }
      }
      a.flash = { color: '#9fd0ff', t: 0.8 };
      this._log('neutron capture', what);
      W.emit('discover', { key: 'nucleus:neutron', name: 'Neutron nucleus: ' + what, kind: 'NEW NUCLEUS' });
      return 'capture';
    },

    formNucleus(a) {
      const W = G.World;
      const from = a.symbol, A = (a.A || massNumber(a.Z)) + 2;
      if (!this.transmute(a, a.Z + 1, A)) return this.capture(a);
      this.stats.nuclei++;
      const what = from + ' + p⁺ + n → ' + isoName(a.symbol, A);
      a.flash = { color: '#ffffff', t: 1 };
      this._log('nucleus formed', what);
      W.emit('discover', { key: 'nucleus:neutron', name: 'Neutron nucleus: ' + what, kind: 'NEW NUCLEUS' });
      return 'nucleus';
    },

    // one element up (keeps it simple: the atom leaves any molecule first, so valences stay valid)
    transmute(a, Z, A) {
      const W = G.World, El = G.Elements;
      const sym = El.symbol(Z);
      if (!sym || Z > 92) return false;
      [...a.bonds].forEach(b => W.breakBond(b));
      const info = El.info(sym);
      a.symbol = sym; a.Z = Z; a.A = A || massNumber(Z);
      a.color = info.color; a.valence = info.valence; a.r = El.displayRadius(sym); a.mass = 1 + 0.06 * Z;
      if (a.mesh) { a.mesh.material.color.set(info.color); a.mesh.scale.setScalar(a.r); }
      W.emit('atomChanged', a);
      return true;
    },

    // ---------- Electrogun ----------
    // amps = number of simultaneous bolts; volts = reach and jumps; joules per strike = effect tier; coulombs = charge size
    electro(game) {
      const W = G.World, e = this.elec();
      game.fireCooldown = E.cooldown;
      this.stats.strikes++;
      if (e.V <= 0) { game._status('🔋 0 V: no current flows (wheel or + to add volts)'); this.lastBolt = Object.assign({ bolts: 0, perBolt: [], struck: [], jumps: 0, points: 0 }, e); return this.lastBolt; }
      const nose = game._nose(), d0 = game._aimDir(), dir = { x: d0.x, y: d0.y, z: d0.z };
      const cone = E.cone + 0.05 * (e.A - 1), cosMax = Math.cos(cone);
      const cands = [];
      for (const a of W.atoms) {
        const to = V.sub(a.pos, nose), d = V.len(to);
        if (d > e.reach || d < 0.5) continue;
        const c = dot(to, dir) / d;
        if (c < cosMax) continue;
        cands.push({ a, score: d * (1 + Math.acos(Math.min(1, c)) * 4) });
      }
      cands.sort((x, y) => x.score - y.score);
      const up = Math.abs(dir.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      const u = V.norm(cross(dir, up)), v = cross(u, dir), tc = Math.tan(cone);
      const seen = new Set(), per = [], all = [];
      const firsts = cands.slice(0, e.A).map(c => c.a);          // every bolt gets its own first atom before any bolt chains
      firsts.forEach(a => seen.add(a));
      let points = 0;
      for (let b = 0; b < e.A; b++) {
        const path = [{ x: nose.x, y: nose.y, z: nose.z }], struck = [];
        const first = firsts[b];
        if (first) {
          struck.push(first);
          let cur = first;
          for (let j = 0; j < e.jumps; j++) {
            let nb = null, bd = E.jumpRadius;
            for (const a of W.atoms) { if (seen.has(a)) continue; const d = V.dist(a.pos, cur.pos); if (d < bd) { bd = d; nb = a; } }
            if (!nb) break;
            seen.add(nb); struck.push(nb); cur = nb;
          }
          struck.forEach(a => path.push({ x: a.pos.x, y: a.pos.y, z: a.pos.z }));
        } else {                                                  // nothing to hit: the bolt forks into empty space
          const k1 = (Math.random() * 2 - 1) * tc, k2 = (Math.random() * 2 - 1) * tc;
          const dd = V.norm({ x: dir.x + u.x * k1 + v.x * k2, y: dir.y + u.y * k1 + v.y * k2, z: dir.z + u.z * k1 + v.z * k2 });
          path.push(V.add(nose, V.scale(dd, e.reach)));
        }
        const effects = struck.map((a, i) => this.ionize(a, path[i], path[i + 1], e));
        this._bolt(path, e);
        points += path.length;
        const info = struck.map((a, i) => ({ id: a.id, symbol: a.symbol, charge: a.charge || 0, effect: effects[i], bonds: a.bonds.length }));
        per.push({ struck: info, jumps: Math.max(0, struck.length - 1) });
        all.push(...info);
      }
      if (game.started && G.Audio) { G.Audio.blip(70 + 20 * Math.log10(e.W + 1), 0.18, 'sawtooth', 0.08); G.Audio.blip(2400, 0.05, 'square', 0.03); }
      this.lastBolt = Object.assign({ bolts: per.length, perBolt: per, struck: all, jumps: Math.max(0, ...per.map(x => x.jumps)), points }, e);
      return this.lastBolt;
    },

    ionize(a, from, to, e) {
      e = e || this.elec();
      const W = G.World, en = EN[a.symbol] || 0, before = a.charge || 0, push = V.norm(V.sub(to, from));
      if (e.tier === 'spark') {                                 // too little energy: a spark, no ion
        a.energy = Math.min(2.4, a.energy + 0.2); a.flash = { color: '#ffb070', t: 0.3 }; V.addTo(a.vel, push, 0.5);
        this.stats.sparks++; return 'spark';
      }
      a.energy = Math.min(2.4, a.energy + 0.6);
      if (e.tier === 'break' || e.tier === 'strip') {           // enough energy to break the atom's bonds
        const n = a.bonds.length; [...a.bonds].forEach(b => W.breakBond(b)); this.stats.bondsBroken += n;
      }
      if (e.tier === 'strip') {                                 // every electron stripped: a bare nucleus, charge +Z
        a.charge = a.Z || 1; this.stats.stripped++;
        W.emit('discover', { key: 'ion:stripped', name: 'Bare nucleus: ' + ionName(a.symbol, a.charge) + ' (all electrons stripped)', kind: 'NEW ENERGY' });
      } else if (en) {                                          // noble gases: no ion
        const sign = en >= E.enThreshold ? -1 : +1;
        a.charge = Math.max(-3, Math.min(3, before + sign * e.dq));
      }
      const q = a.charge || 0;
      a.flash = { color: q > 0 ? '#ff7a7a' : q < 0 ? '#7ab0ff' : '#ffffff', t: 0.6 };
      V.addTo(a.vel, push, e.tier === 'ion' ? 1.5 : 3);
      if (before === 0 && q !== 0) {
        this.stats.ions++;
        W.emit('discover', { key: 'ion:first', name: 'Ion: ' + ionName(a.symbol, q), kind: 'NEW ENERGY' });
      }
      return e.tier;
    },

    _coulomb(W, sim) {
      const ions = W.atoms.filter(a => a.charge);
      for (let i = 0; i < ions.length; i++) for (let j = i + 1; j < ions.length; j++) {
        const a = ions[i], b = ions[j], d = V.dist(a.pos, b.pos);
        if (d > E.coulombRange || d < 0.3) continue;
        const f = Math.max(-4, Math.min(4, E.coulomb * a.charge * b.charge / (d * d))) * sim;   // + : repel, − : attract
        const n = V.norm(V.sub(a.pos, b.pos));
        V.addTo(a.vel, n, f / a.mass); V.addTo(b.vel, n, -f / b.mass);
      }
    },

    _bolt(path, e) {
      const T = G.THREE;
      const W = e ? e.W : 1e8, t = Math.max(0, Math.min(1, Math.log10(W + 1) / 13));   // 1 W → 0 · 10 TW → 1
      const core = rampColor(t), glow = rampColor(Math.min(1, t + 0.2)), outer = [0.55 + 0.3 * t, 0.45, 1];
      const k = 0.45 + 0.55 * t;                                                      // brighter as watts climb
      const ops = [1 * k, 0.75 * k, 0.45 * k, 0.35 * k, 0.3 * k].slice(0, 3 + Math.round(t * 2));
      const cols = [core, glow, outer, glow, outer];
      const mk = (c, opacity) => {
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(new Float32Array((path.length - 1) * 8 * 3 + 3), 3));
        const line = new T.Line(geo, new T.LineBasicMaterial({ color: new T.Color(c[0], c[1], c[2]), transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false }));
        line.frustumCulled = false; this.game.scene.add(line); return line;
      };
      const bolt = { path, t: 0, ops, heat: t, lines: ops.map((o, i) => mk(cols[i], o)) };
      this._jag(bolt);
      this.bolts.push(bolt);
    },
    _jag(bolt) {     // jagged lightning: each segment split in 8 with random sideways kinks (re-rolled every frame = flicker)
      bolt.lines.forEach((line, li) => {
        const arr = line.geometry.attributes.position.array; let o = 0;
        for (let s = 0; s < bolt.path.length - 1; s++) {
          const a = bolt.path[s], b = bolt.path[s + 1], L = V.dist(a, b), amp = Math.min(1.1, L * 0.07) * (1 + li * 0.4);
          for (let k = 0; k < 8; k++) {
            const t = k / 8, j = k === 0 ? 0 : amp;
            arr[o++] = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j;
            arr[o++] = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j;
            arr[o++] = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j;
          }
        }
        const e = bolt.path[bolt.path.length - 1]; arr[o++] = e.x; arr[o++] = e.y; arr[o++] = e.z;
        line.geometry.attributes.position.needsUpdate = true;
      });
    },
    _bolts(dt) {
      for (const b of [...this.bolts]) {
        b.t += dt;
        const f = Math.max(0, 1 - b.t / E.boltLife);
        b.lines.forEach((l, i) => { l.material.opacity = f * b.ops[i]; });
        if (b.t >= E.boltLife) { b.lines.forEach(l => { this.game.scene.remove(l); l.geometry.dispose(); l.material.dispose(); }); this.bolts.splice(this.bolts.indexOf(b), 1); }
        else this._jag(b);
      }
    },

    _log(what, text) { this.log.push({ what, text, t: Math.round(this.time * 100) / 100 }); if (this.log.length > 100) this.log.shift(); if (this.game) this.game._status('💥 ' + text); },

    // ---------- test hooks ----------
    debug: {
      state() {
        const ps = PNE.pellets;
        return { pellets: ps.length, protons: ps.filter(p => p.kind === 'proton').length, neutrons: ps.filter(p => p.kind === 'neutron').length,
          modes: MODES.slice(), modeIdx: { ...PNE.modeIdx }, powerIdx: { ...PNE.powerIdx }, ranges: { proton: PNE.range('proton'), neutron: PNE.range('neutron') },
          labels: { proton: PNE.label('proton'), neutron: PNE.label('neutron'), shotgun5: PNE.label('shotgun5') }, halfShipWidth: PNE.halfShipWidth, shipWidth: PNE.shipWidth,
          ampsIdx: PNE.ampsIdx, voltsIdx: PNE.voltsIdx, elec: PNE.elec(), wattText: PNE.wattEl && !PNE.wattEl.hidden ? PNE.wattEl.textContent : null,
          boltHeat: PNE.bolts.map(b => b.heat), boltColors: PNE.bolts.map(b => b.lines[0].material.color.getHexString()), boltOpacity: PNE.bolts.map(b => b.ops[0]),
          drawn: { strings: PNE.meshS.count, chargePlus: PNE.meshCp.count, chargeMinus: PNE.meshCm.count, light: PNE.meshL.count, rings: PNE.meshR.count, protons: PNE.meshP.count, neutrons: PNE.meshN.count },
          arenaRadius: C.ARENA_RADIUS, stats: JSON.parse(JSON.stringify(PNE.stats)), lastShot: PNE.lastShot, lastBolt: PNE.lastBolt, bolts: PNE.bolts.length,
          pelletBtn: PNE.pelletBtn && !PNE.pelletBtn.hidden ? PNE.pelletBtn.textContent : null, powerBtn: PNE.powerBtn && !PNE.powerBtn.hidden ? PNE.powerBtn.textContent : null };
      },
      shoot(kind) { PNE.game.fireCooldown = 0; return PNE.shoot(PNE.game, kind); },
      // live geometry of one shot: pellet count, max sideways distance between any two pellets, gravity drop
      measure(id) {
        const s = PNE.lastShot && PNE.lastShot.id === id ? PNE.lastShot : null;
        const ps = PNE.pellets.filter(p => p.shot === id);
        if (!ps.length) return { alive: 0 };
        const d = s ? s.dir : { x: 0, y: 0, z: -1 };
        const perp = ps.map(p => { const k = dot(p, d); return { x: p.x - d.x * k, y: p.y - d.y * k, z: p.z - d.z * k }; });
        let maxPair = 0;
        for (let i = 0; i < perp.length; i++) for (let j = i + 1; j < perp.length; j++) maxPair = Math.max(maxPair, V.dist(perp[i], perp[j]));
        return { alive: ps.length, maxPair, age: ps[0].age, traveled: Math.max(...ps.map(p => p.traveled)), vy: ps[0].vy, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
      },
      applyHit(kind, atom, sign) { return PNE._applyHit({ kind, vx: 0, vy: 0, vz: -1, sign: sign || 1 }, atom); },
      kinds(id) { return PNE.pellets.filter(p => p.shot === id).map(p => p.kind); },
      electro() { PNE.game.fireCooldown = 0; return PNE.electro(PNE.game); }
    }
  };

  G.PNE = PNE;
})();
