/* CHEMVENTUR Stage 3 Game: "FIRST DISCOVERY" cinematic.
   The first time a new kind of matter or energy shows up (a new element you fire, a new bond order,
   a newly identified molecule, a c2c note effect, a blaster rip, a target, a c2c series), the camera
   eases into a close-up, game time slows to 0.2x, and a neon banner appears. After ~2.5 s real time
   everything eases back. Overlapping discoveries queue up and play one at a time.
   Discoveries persist in localStorage. K = cinematics on/off, Shift+K = reset discoveries.
   Hooks: Game.boot -> attach(game); Game._frame -> update(realDt) + timeScale; Game emits
   'identified' / 'targetDone' / 'c2cFired' through World.emit. */
(function () {
  'use strict';
  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});

  const STORE = 'cv.s3g.discoveries.v1';
  const STORE_ON = 'cv.s3g.cinematics.v1';
  const DURATION = 2.5, EASE_IN = 0.55, EASE_OUT = 0.6, SLOW = 0.2, MAX_QUEUE = 6;
  const NAMES = { H: 'Hydrogen', He: 'Helium', Li: 'Lithium', B: 'Boron', C: 'Carbon', N: 'Nitrogen', O: 'Oxygen', F: 'Fluorine',
    Na: 'Sodium', Mg: 'Magnesium', Si: 'Silicon', P: 'Phosphorus', S: 'Sulfur', Cl: 'Chlorine', K: 'Potassium', Ca: 'Calcium',
    Fe: 'Iron', Cu: 'Copper', Zn: 'Zinc', Br: 'Bromine', I: 'Iodine' };
  const BONDS = { 1: 'Single bond', 2: 'Double bond', 3: 'Triple bond' };
  const EFFECTS = { bond: 'c2c ROOT note: BOND (C4)', resonance: 'c2c OCTAVE: RESONANCE (C5)', dissonance: 'c2c DISSONANCE (sharp)', harmony: 'c2c HARMONY (white key)' };

  const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const centroid = (atoms) => {
    const live = atoms.filter(a => G.World.atoms.indexOf(a) !== -1);
    if (!live.length) return null;
    const c = { x: 0, y: 0, z: 0 };
    live.forEach(a => { c.x += a.pos.x; c.y += a.pos.y; c.z += a.pos.z; });
    c.x /= live.length; c.y /= live.length; c.z /= live.length;
    return c;
  };

  const Cin = {
    enabled: true, discovered: {}, queue: [], active: null, timeScale: 1,
    log: [], game: null, banner: null, attached: false,

    load() {
      try { this.discovered = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { this.discovered = {}; }
      try { this.enabled = localStorage.getItem(STORE_ON) !== 'off'; } catch (e) { /* default on */ }
    },
    save() {
      try { localStorage.setItem(STORE, JSON.stringify(this.discovered)); localStorage.setItem(STORE_ON, this.enabled ? 'on' : 'off'); } catch (e) { /* quota / private mode */ }
    },

    attach(game) {
      this.game = game;
      this.load();
      if (!this.banner && game.hud) {
        const b = document.createElement('div');
        b.className = 's3g-discovery'; b.hidden = true;
        b.appendChild(Object.assign(document.createElement('div'), { className: 's3g-discovery-kind' }));
        b.appendChild(Object.assign(document.createElement('div'), { className: 's3g-discovery-name' }));
        game.hud.root.appendChild(b);
        this.banner = b;
      }
      if (this.attached) return;
      this.attached = true;
      G.World.on((type, d) => this._onWorld(type, d));
    },

    // ---- what counts as a discovery ----
    _onWorld(type, d) {
      if (type === 'atomAdded' && d.origin === 'player') {
        this.discover('element:' + d.symbol, NAMES[d.symbol] || ('Element ' + d.symbol), 'NEW ELEMENT', () => d.pos, 6);
      } else if ((type === 'bondAdded' && d.byPlayer) || (type === 'bondChanged' && d.order > 1)) {
        this.discover('bond:' + d.order, BONDS[d.order] || ('Bond order ' + d.order), 'NEW BOND TYPE', () => centroid([d.a, d.b]), 6);
      } else if (type === 'hit' && d.dot && d.dot.shot && (d.result !== 'energized' || d.dot.shot.effect === 'harmony')) {
        const e = d.dot.shot.effect;   // only when the effect really did something (bonded / order+1 / broke-bond)
        this.discover('effect:' + e, EFFECTS[e] || e, 'NEW c2c ENERGY', () => d.atom.pos, 7);
      } else if (type === 'hit' && d.result === 'ripped') {
        this.discover('energy:blaster-rip', 'Blaster: atom ripped free', 'NEW ENERGY', () => d.atom.pos, 7);
      } else if (type === 'collect') {
        this.discover('energy:collect', 'Atom scooped into your tray', 'NEW ENERGY', null, 7);
      } else if (type === 'c2cFired') {
        this.discover('c2c:' + d.mode, d.label + ' tone series', 'NEW ENERGY', null, 9);
      } else if (type === 'targetDone') {
        this.discover('target:' + d.formula, 'Target built: ' + d.name + ' ' + d.formula, 'TARGET', () => centroid(d.atoms), 8);
      } else if (type === 'identified' && !d.error && (d.cid || d.canonical)) {
        const atoms = (d.comp && d.comp.atoms) || [];
        const size = Math.min(14, 2 + atoms.length * 0.7);
        this.discover('mol:' + (d.cid ? 'cid' + d.cid : d.canonical), d.title || d.canonical, 'NEW MOLECULE' + (d.formula ? ' · ' + d.formula : ''), () => centroid(atoms), 5 + size);
      }
    },

    // Returns true if this was a first discovery
    discover(key, name, kind, getPos, dist) {
      if (this.discovered[key]) return false;
      this.discovered[key] = { name, at: Date.now() };
      this.save();
      const g = this.game;
      if (!this.enabled || !g || !g.started) { if (g && g.started) g._status('✨ First discovery: ' + name, 'ok'); return true; }
      if (this.queue.length >= MAX_QUEUE) { g._status('✨ First discovery: ' + name, 'ok'); return true; }
      const ship = g._nose();
      const fallback = { x: ship.x, y: ship.y, z: ship.z };
      this.queue.push({ key, name, kind, getPos: getPos || (() => { const n = g._nose(); return { x: n.x, y: n.y, z: n.z }; }), dist: dist || 7, last: fallback });
      return true;
    },

    toggle(on) {
      this.enabled = on == null ? !this.enabled : !!on;
      if (!this.enabled) { this.queue.length = 0; if (this.active) this.active.t = Math.max(this.active.t, DURATION - EASE_OUT); }
      this.save();
      if (this.game) this.game._status('🎬 First-discovery cinematics ' + (this.enabled ? 'ON' : 'OFF') + ' (K)');
      return this.enabled;
    },

    reset() {
      this.discovered = {}; this.queue.length = 0;
      this.save();
      if (this.game) this.game._status('🎬 Discoveries reset: everything is new again (Shift+K)');
    },

    _begin(c) {
      c.t = 0; c.startedAt = performance.now();
      this.active = c;
      const b = this.banner;
      if (b) {
        b.firstChild.textContent = '✨ FIRST DISCOVERY · ' + c.kind;
        b.lastChild.textContent = 'FIRST DISCOVERY: ' + c.name;
        b.hidden = false; b.style.opacity = '0';
      }
      const A = G.Audio;
      if (A && A.blip) { A.blip(110, 0.9, 'sine', 0.22); setTimeout(() => A.blip(164.81, 0.8, 'sine', 0.14), 140); }
    },

    _end() {
      const c = this.active;
      c.endedAt = performance.now();
      this.log.push({ key: c.key, name: c.name, kind: c.kind, ms: Math.round(c.endedAt - c.startedAt) });
      this.active = null; this.timeScale = 1;
      if (this.banner) this.banner.hidden = true;
    },

    // Called every unpaused frame with REAL dt, after the chase camera was placed at game.camBase / camLook
    update(dt) {
      const g = this.game;
      if (!g) return;
      if (!this.active) {
        if (this.queue.length && this.enabled) this._begin(this.queue.shift());
        else { this.timeScale = 1; return; }
      }
      const c = this.active;
      c.t += dt;
      const w = c.t < EASE_IN ? ease(c.t / EASE_IN) : c.t > DURATION - EASE_OUT ? ease((DURATION - c.t) / EASE_OUT) : 1;
      this.timeScale = 1 + (SLOW - 1) * w;
      c.w = w;
      const p = (c.getPos && c.getPos()) || c.last;
      c.last = { x: p.x, y: p.y, z: p.z };

      const cam = g.camera, base = g.camBase, look = g.camLook;
      const target = base.clone().set(p.x, p.y, p.z);
      if (!c.dir) {                         // view from the side the player is already looking from
        c.dir = base.clone().sub(target);
        if (c.dir.lengthSq() < 1e-4) c.dir.set(0, 0.3, 1);
        c.dir.normalize();
      }
      const ang = c.t * 0.35, cs = Math.cos(ang), sn = Math.sin(ang);
      const d = c.dir;
      const orbit = base.clone().set(d.x * cs + d.z * sn, d.y + 0.18, -d.x * sn + d.z * cs).normalize();
      const close = target.clone().addScaledVector(orbit, c.dist);
      cam.position.copy(base).lerp(close, w);
      cam.lookAt(look.clone().lerp(target, w));
      if (this.banner) this.banner.style.opacity = String(Math.min(1, w * 1.6));
      if (c.t >= DURATION) this._end();
    },

    debugState() {
      const g = this.game, c = this.active;
      return {
        enabled: this.enabled, timeScale: Math.round(this.timeScale * 1000) / 1000,
        active: c ? { key: c.key, name: c.name, t: Math.round(c.t * 1000) / 1000, w: c.w, pos: c.last } : null,
        queue: this.queue.map(q => q.name), discovered: Object.keys(this.discovered), log: this.log.slice(),
        bannerVisible: !!(this.banner && !this.banner.hidden), bannerText: this.banner ? this.banner.lastChild.textContent : '',
        camera: g && g.camera ? { x: g.camera.position.x, y: g.camera.position.y, z: g.camera.position.z } : null,
        camBase: g && g.camBase ? { x: g.camBase.x, y: g.camBase.y, z: g.camBase.z } : null
      };
    }
  };

  G.Cinematic = Cin;
  G.CINEMATIC = { DURATION, EASE_IN, EASE_OUT, SLOW };
})();
