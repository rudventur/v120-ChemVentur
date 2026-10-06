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
   3 Electrogun: a lightning bolt to the atom nearest the crosshair (up to 45 units), then it jumps to the
     nearest not-yet-struck atom within 10 units, up to 6 jumps. Every struck atom becomes an ION: atoms with
     electronegativity ≥ 2.6 (N, O, F, Cl, Br, I) catch an electron (−1), the others lose one (+1), charge
     limited to ±2. Ions attract / repel each other (simple Coulomb push). Charges show in the Grid charge display.
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
  const E = { range: 45, cone: 0.16, jumps: 6, jumpRadius: 10, cooldown: 0.35, boltLife: 0.3, enThreshold: 2.6, coulomb: 6, coulombRange: 14 };
  const CAP = 2000;                                      // pellets alive at once (per kind)
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
    MODES, POWER, P, N, E, EN, massNumber, isoName,
    game: null, pellets: [], shotId: 0, time: 0, halfShipWidth: 2.1,
    modeIdx: { proton: 2, neutron: 2 }, powerIdx: { proton: 2, neutron: 2 },
    bolts: [], lastShot: null, lastBolt: null, log: [],
    stats: { protonShots: 0, neutronShots: 0, protonHits: 0, neutronHits: 0, blasts: 0, captures: 0, nuclei: 0, decays: 0, ions: 0, strikes: 0, maxTraveled: { proton: 0, neutron: 0 }, maxRadius: 0 },

    usesPellets(gun) { return gun === 'proton' || gun === 'neutron'; },
    range(kind) { return Math.min(POWER[this.powerIdx[kind]], C.ARENA_RADIUS); },
    count(kind) { return MODES[this.modeIdx[kind]]; },
    label(kind) { return (kind === 'proton' ? 'shotgun1proton' : 'SHOTGUN2neutron') + ' x' + this.count(kind); },

    attach(game) {
      this.game = game;
      const T = G.THREE;
      try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s) { Object.assign(this.modeIdx, s.modeIdx); Object.assign(this.powerIdx, s.powerIdx); } } catch (e) { /* ignore */ }
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

      // HUD: pellets-per-shot and power buttons (phone-friendly alternatives to right-click / wheel)
      const h = game.hud;
      const btn = (cls, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 's3g-btn ' + cls; b.title = title; b.addEventListener('click', fn); h.guns.appendChild(b); return b; };
      this.pelletBtn = btn('s3g-pellets', 'Right-click on the game (or tap here): pellets per shot', () => this.cycleMode(game.gun));
      this.powerBtn = btn('s3g-power', 'Mouse wheel or + / − (or tap here): shot power (range)', () => this.adjustPower(game.gun, +1, true));
      h.root.addEventListener('contextmenu', e => e.preventDefault());
      this._hud(true);
    },

    save() { try { localStorage.setItem(STORE, JSON.stringify({ modeIdx: this.modeIdx, powerIdx: this.powerIdx })); } catch (e) { /* ignore */ } },

    cycleMode(gun) {
      if (!this.usesPellets(gun)) return false;
      this.modeIdx[gun] = (this.modeIdx[gun] + 1) % MODES.length;
      this.save(); this._hud(true);
      this.game._status('🔫 ' + this.label(gun) + ' · beam ' + (this.halfShipWidth * WIDTH_FRAC[this.modeIdx[gun]]).toFixed(2) + ' u wide (max ' + this.halfShipWidth.toFixed(2) + ')');
      return true;
    },

    adjustPower(gun, d, wrap) {
      if (!this.usesPellets(gun)) return false;
      let i = this.powerIdx[gun] + d;
      if (wrap) i = (i + POWER.length) % POWER.length; else i = Math.max(0, Math.min(POWER.length - 1, i));
      this.powerIdx[gun] = i;
      this.save(); this._hud(true);
      this.game._status('💪 ' + (gun === 'proton' ? 'shotgun1proton' : 'SHOTGUN2neutron') + ' power ' + (i + 1) + '/' + POWER.length + ' · range ' + this.range(gun) + ' u (arena radius ' + C.ARENA_RADIUS + ')');
      return true;
    },

    _hud(force) {
      const g = this.game; if (!g || !this.pelletBtn) return;
      const on = this.usesPellets(g.gun);
      const pt = on ? this.label(g.gun) : '', wt = on ? '💪 ' + (this.powerIdx[g.gun] + 1) + '/' + POWER.length + ' · ' + this.range(g.gun) + 'u' : '';
      if (force || this.pelletBtn.textContent !== pt) { this.pelletBtn.textContent = pt; this.pelletBtn.hidden = !on; }
      if (force || this.powerBtn.textContent !== wt) { this.powerBtn.textContent = wt; this.powerBtn.hidden = !on; }
    },

    // ---------- firing ----------
    fire(game) {
      const id = game.gun;
      if (!this.usesPellets(id) && id !== 'electron') return false;
      if (game.fireCooldown > 0) return true;
      if (id === 'electron') this.electro(game); else this.shoot(game, id);
      return true;
    },

    shoot(game, kind) {
      const mi = this.modeIdx[kind], n = MODES[mi];
      if (this.pellets.filter(p => p.kind === kind).length + n > CAP) return null;
      const width = this.halfShipWidth * WIDTH_FRAC[mi];       // full beam width, never more than half the ship's width
      const R = width / 2;
      const d0 = game._aimDir(), dir = { x: d0.x, y: d0.y, z: d0.z }, nose = game._nose();
      const up = Math.abs(dir.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      const u = V.norm(cross(dir, up)), v = cross(u, dir);
      const range = this.range(kind), sv = game.shipVel;
      const speed = kind === 'proton' ? P.speed : Math.max(N.minSpeed, 0.85 * range / N.life);   // neutrons: slow, so the 3 s lifetime usually ends them
      const vel = V.add(V.scale(dir, speed), { x: sv.x, y: sv.y, z: sv.z });
      const vlen = V.len(vel) || 1;
      const life = kind === 'proton' ? range / vlen + 0.05 : N.life;
      const id = ++this.shotId, rot = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        let r = 0, th = 0;
        if (n > 1) { r = R * Math.sqrt((i + 0.5) / n); th = i * 2.399963 + rot; }       // sunflower disc
        const jr = Math.max(0, Math.min(R, r + (Math.random() - 0.5) * R * 0.15));      // jitter, but stay inside the beam
        const ox = Math.cos(th) * jr, oy = Math.sin(th) * jr, st = Math.random() * 0.8;  // st: stagger along the beam (mist)
        this.pellets.push({ kind, shot: id, x: nose.x + u.x * ox + v.x * oy + dir.x * st, y: nose.y + u.y * ox + v.y * oy + dir.y * st, z: nose.z + u.z * ox + v.z * oy + dir.z * st,
          vx: vel.x, vy: vel.y, vz: vel.z, life, age: 0, traveled: 0, range });
      }
      game.fireCooldown = kind === 'proton' ? P.cooldown : N.cooldown;
      this.stats[kind + 'Shots']++;
      if (game.started && G.Audio) G.Audio.blip(kind === 'proton' ? 1400 : 320, 0.04, kind === 'proton' ? 'square' : 'sine', 0.03);
      this.lastShot = { id, kind, n, width, range, life: Math.round(life * 1000) / 1000, speed: Math.round(vlen * 100) / 100, dir };
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
        p.vy -= (p.kind === 'neutron' ? N.gravity : (gOn ? gW : 0)) * sim;
        let sx = p.vx * sim, sy = p.vy * sim, sz = p.vz * sim;
        const step = Math.hypot(sx, sy, sz), rem = p.range - p.traveled;
        let dead = false;
        if (step >= rem) { const k = rem / (step || 1); sx *= k; sy *= k; sz *= k; dead = true; }   // never travel past the range
        const nx = p.x + sx, ny = p.y + sy, nz = p.z + sz;
        if (nx * nx + ny * ny + nz * nz > AR2) dead = true;                                          // never leave the arena
        else {
          const a = this._hit(p.x, p.y, p.z, nx, ny, nz, p.kind === 'proton' ? P.radius : N.radius);
          p.x = nx; p.y = ny; p.z = nz; p.traveled += Math.min(step, rem); p.age += sim;
          if (a) { this._applyHit(p, a); dead = true; }
          if (p.age >= p.life) dead = true;
          const mt = this.stats.maxTraveled; if (p.traveled > mt[p.kind]) mt[p.kind] = p.traveled;
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
      let np = 0, nn = 0;
      const mp = this.meshP.instanceMatrix.array, hp = this.haloP.instanceMatrix.array, mn = this.meshN.instanceMatrix.array, hn = this.haloN.instanceMatrix.array;
      const put = (arr, i, s, p) => { const o = i * 16; arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0; arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
        arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0; arr[o + 12] = p.x; arr[o + 13] = p.y; arr[o + 14] = p.z; arr[o + 15] = 1; };
      for (const p of this.pellets) {
        if (p.kind === 'proton') { put(mp, np, P.vis, p); put(hp, np, P.vis * 2.6, p); np++; }
        else { put(mn, nn, N.vis, p); put(hn, nn, N.vis * 2.4, p); nn++; }
      }
      this.meshP.count = this.haloP.count = np; this.meshN.count = this.haloN.count = nn;
      [this.meshP, this.haloP, this.meshN, this.haloN].forEach(m => { m.instanceMatrix.needsUpdate = true; });
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
      const W = G.World, isP = p.kind === 'proton', K = isP ? P : N;
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
    electro(game) {
      const W = G.World;
      const nose = game._nose(), d0 = game._aimDir(), dir = { x: d0.x, y: d0.y, z: d0.z };
      const cosMax = Math.cos(E.cone);
      let first = null, best = Infinity;
      for (const a of W.atoms) {
        const to = V.sub(a.pos, nose), d = V.len(to);
        if (d > E.range || d < 0.5) continue;
        const c = dot(to, dir) / d;
        if (c < cosMax) continue;
        const score = d * (1 + Math.acos(Math.min(1, c)) * 4);
        if (score < best) { best = score; first = a; }
      }
      const path = [{ x: nose.x, y: nose.y, z: nose.z }], struck = [];
      if (first) {
        const seen = new Set([first]); struck.push(first);
        let cur = first;
        for (let j = 0; j < E.jumps; j++) {
          let nb = null, bd = E.jumpRadius;
          for (const a of W.atoms) { if (seen.has(a)) continue; const d = V.dist(a.pos, cur.pos); if (d < bd) { bd = d; nb = a; } }
          if (!nb) break;
          seen.add(nb); struck.push(nb); cur = nb;
        }
        struck.forEach(a => path.push({ x: a.pos.x, y: a.pos.y, z: a.pos.z }));
      } else path.push(V.add(nose, V.scale(dir, E.range)));
      struck.forEach((a, i) => this.ionize(a, path[i], path[i + 1]));
      this._bolt(path);
      game.fireCooldown = E.cooldown;
      this.stats.strikes++;
      if (game.started && G.Audio) { G.Audio.blip(90, 0.18, 'sawtooth', 0.08); G.Audio.blip(2400, 0.05, 'square', 0.03); }
      this.lastBolt = { struck: struck.map(a => ({ id: a.id, symbol: a.symbol, charge: a.charge })), jumps: Math.max(0, struck.length - 1), points: path.length };
      return this.lastBolt;
    },

    ionize(a, from, to) {
      const en = EN[a.symbol] || 0;
      if (!en) return;                                           // noble gases: no ion
      const dq = en >= E.enThreshold ? -1 : +1, before = a.charge || 0;
      a.charge = Math.max(-2, Math.min(2, before + dq));
      a.energy = Math.min(2.4, a.energy + 0.6);
      a.flash = { color: dq > 0 ? '#ff7a7a' : '#7ab0ff', t: 0.6 };
      V.addTo(a.vel, V.norm(V.sub(to, from)), 1.5);
      if (before === 0 && a.charge !== 0) {
        this.stats.ions++;
        G.World.emit('discover', { key: 'ion:first', name: 'Ion: ' + ionName(a.symbol, a.charge), kind: 'NEW ENERGY' });
      }
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

    _bolt(path) {
      const T = G.THREE;
      const mk = (color, opacity) => {
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(new Float32Array((path.length - 1) * 8 * 3 + 3), 3));
        const line = new T.Line(geo, new T.LineBasicMaterial({ color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false }));
        line.frustumCulled = false; this.game.scene.add(line); return line;
      };
      const bolt = { path, t: 0, lines: [mk('#ffffff', 1), mk('#6ab8ff', 0.75), mk('#b48cff', 0.45)] };
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
        b.lines.forEach((l, i) => { l.material.opacity = f * [1, 0.75, 0.45][i]; });
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
          labels: { proton: PNE.label('proton'), neutron: PNE.label('neutron') }, halfShipWidth: PNE.halfShipWidth, shipWidth: PNE.shipWidth,
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
      applyHit(kind, atom) { return PNE._applyHit({ kind, vx: 0, vy: 0, vz: -1 }, atom); },
      electro() { PNE.game.fireCooldown = 0; return PNE.electro(PNE.game); }
    }
  };

  G.PNE = PNE;
})();
