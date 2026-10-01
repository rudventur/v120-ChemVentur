/* CHEMVENTUR Stage 3 Game: "FIRST DISCOVERY" banners.
   The first time a new kind of matter or energy shows up (a new element you fire, a new bond order,
   a newly identified molecule, a c2c note effect, a blaster rip, a scooped atom, a c2c series, a target)
   a neon banner "FIRST DISCOVERY: <name>" shows for ~2.5 s with a low tone. No camera move, no slow motion.
   Overlapping discoveries queue and show one at a time. Discovered set persists in localStorage.
   K = banners on/off, Shift+K = reset discoveries.
   Hooks: Game.boot -> attach(game); Game._frame -> update(dt); Game emits 'identified' / 'targetDone' /
   'c2cFired' through World.emit. */
(function () {
  'use strict';
  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});

  const STORE = 'cv.s3g.discoveries.v1';
  const STORE_ON = 'cv.s3g.discoverybanners.v1';
  const DURATION = 2.5, FADE = 0.3, MAX_QUEUE = 6;
  const NAMES = { H: 'Hydrogen', He: 'Helium', Li: 'Lithium', B: 'Boron', C: 'Carbon', N: 'Nitrogen', O: 'Oxygen', F: 'Fluorine',
    Na: 'Sodium', Mg: 'Magnesium', Si: 'Silicon', P: 'Phosphorus', S: 'Sulfur', Cl: 'Chlorine', K: 'Potassium', Ca: 'Calcium',
    Fe: 'Iron', Cu: 'Copper', Zn: 'Zinc', Br: 'Bromine', I: 'Iodine' };
  const BONDS = { 1: 'Single bond', 2: 'Double bond', 3: 'Triple bond' };
  const EFFECTS = { bond: 'c2c ROOT note: BOND (C4)', resonance: 'c2c OCTAVE: RESONANCE (C5)', dissonance: 'c2c DISSONANCE (sharp)', harmony: 'c2c HARMONY (white key)' };

  const Disc = {
    enabled: true, discovered: {}, queue: [], active: null, log: [], game: null, banner: null, attached: false,

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
        b.setAttribute('role', 'status');
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
        this.discover('element:' + d.symbol, NAMES[d.symbol] || ('Element ' + d.symbol), 'NEW ELEMENT');
      } else if ((type === 'bondAdded' && d.byPlayer) || (type === 'bondChanged' && d.order > 1)) {
        this.discover('bond:' + d.order, BONDS[d.order] || ('Bond order ' + d.order), 'NEW BOND TYPE');
      } else if (type === 'hit' && d.dot && d.dot.owner === 'bot') {
        // bots' own shots are not the player's discoveries
      } else if (type === 'hit' && d.dot && d.dot.shot && (d.result !== 'energized' || d.dot.shot.effect === 'harmony')) {
        const e = d.dot.shot.effect;   // only when the effect really did something (bonded / order+1 / broke-bond)
        this.discover('effect:' + e, EFFECTS[e] || e, 'NEW c2c ENERGY');
      } else if (type === 'hit' && d.result === 'ripped') {
        this.discover('energy:blaster-rip', 'Blaster: atom ripped free', 'NEW ENERGY');
      } else if (type === 'collect') {
        this.discover('energy:collect', 'Atom scooped into your tray', 'NEW ENERGY');
      } else if (type === 'c2cFired') {
        this.discover('c2c:' + d.mode, d.label + ' tone series', 'NEW ENERGY');
      } else if (type === 'targetDone') {
        this.discover('target:' + d.formula, 'Target built: ' + d.name + ' ' + d.formula, 'TARGET');
      } else if (type === 'identified' && !d.error && (d.cid || d.canonical)) {
        this.discover('mol:' + (d.cid ? 'cid' + d.cid : d.canonical), d.title || d.canonical, 'NEW MOLECULE' + (d.formula ? ' · ' + d.formula : ''));
      } else if (type === 'botEvent' && d && d.key) {
        this.discover(d.key, d.name, d.kind || 'BOT');
      }
    },

    // Returns true if this was a first discovery
    discover(key, name, kind) {
      if (this.discovered[key]) return false;
      this.discovered[key] = { name, at: Date.now() };
      this.save();
      const g = this.game;
      if (!g || !g.started) return true;                         // before START: record silently
      if (!this.enabled || this.queue.length >= MAX_QUEUE) { g._status('✨ First discovery: ' + name, 'ok'); return true; }
      this.queue.push({ key, name, kind });
      return true;
    },

    toggle(on) {
      this.enabled = on == null ? !this.enabled : !!on;
      if (!this.enabled) { this.queue.length = 0; if (this.active) this.active.t = Math.max(this.active.t, DURATION - FADE); }
      this.save();
      if (this.game) this.game._status('✨ FIRST DISCOVERY banners ' + (this.enabled ? 'ON' : 'OFF') + ' (K)');
      return this.enabled;
    },

    reset() {
      this.discovered = {}; this.queue.length = 0;
      this.save();
      if (this.game) this.game._status('✨ Discoveries reset: everything is new again (Shift+K)');
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
      this.log.push({ key: c.key, name: c.name, kind: c.kind, ms: Math.round(performance.now() - c.startedAt) });
      this.active = null;
      if (this.banner) this.banner.hidden = true;
    },

    // Called every frame with real dt
    update(dt) {
      if (!this.active) {
        if (this.queue.length && this.enabled) this._begin(this.queue.shift());
        else return;
      }
      const c = this.active;
      c.t += dt;
      const a = Math.min(1, c.t / FADE, (DURATION - c.t) / FADE);
      if (this.banner) this.banner.style.opacity = String(Math.max(0, a));
      if (c.t >= DURATION) this._end();
    },

    debugState() {
      const c = this.active;
      return {
        enabled: this.enabled,
        active: c ? { key: c.key, name: c.name, t: Math.round(c.t * 1000) / 1000 } : null,
        queue: this.queue.map(q => q.name), discovered: Object.keys(this.discovered), log: this.log.slice(),
        bannerVisible: !!(this.banner && !this.banner.hidden), bannerText: this.banner ? this.banner.lastChild.textContent : ''
      };
    }
  };

  G.Discovery = Disc;
})();
