/* CHEMVENTUR Stage 3 — gun 5: CHAOS shotgun.
   Fires a spread of random parts from every stage: sub-atomic dust, single atoms, tiny molecules.
   Most parts do nothing much. A few are rare "heavy" parts that open a BLACK HOLE (pulls and eats atoms)
   or a QUANTUM TUNNEL (two portals: atoms and your ship that enter one come out of the other).
   Any pellet can turn heavy while it flies: through a gravity orb (gun 9) it can become a black hole,
   inside a time bubble (gun 0) or while time runs backwards it can become a quantum tunnel.
   Hooks: Game._trigger -> fire(game); Game._frame -> tick(game, dt, sim). */
(function () {
  'use strict';
  const CV = window.CHEMVENTUR = window.CHEMVENTUR || {};
  const G = CV.Stage3Game = CV.Stage3Game || {};

  const TUNE = {
    pellets: 6, spread: 0.5, speed: 26, life: 2.2, cooldown: 0.34,
    odds: { dust: 0.70, atom: 0.14, molecule: 0.10, hole: 0.03, tunnel: 0.03 },   // the rest of 1.0 is more dust
    orbRadius: 8, bubbleRadius: 7, orbRate: 0.9, bubbleRate: 0.9, reverseRate: 0.5,   // per second chance to turn heavy
    holeLife: 9, holeRadius: 16, holeStrength: 70, eatRadius: 1.8,
    tunnelLife: 12, tunnelGap: 38, portalRadius: 2.6
  };
  const ATOMS = ['H', 'He', 'Li', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Fe', 'Cu', 'Zn', 'Br', 'I', 'U'];
  const DUST = ['#ff6677', '#66aaff', '#ffee66', '#ffffff', '#c58bff', '#66ffcc'];
  // tiny molecules: [centre, [outer atoms], bond order]
  const MOLS = [['O', ['H', 'H'], 1], ['C', ['O', 'O'], 2], ['N', ['H', 'H', 'H'], 1], ['C', ['H', 'H', 'H', 'H'], 1], ['H', ['H'], 1], ['O', ['O'], 2]];

  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const Chaos = {
    TUNE, pellets: [], holes: [], tunnels: [], game: null, tT: 0, shipCool: 0,

    _pick() {
      const o = TUNE.odds, r = Math.random();
      if (r < o.hole) return 'hole';
      if (r < o.hole + o.tunnel) return 'tunnel';
      if (r < o.hole + o.tunnel + o.molecule) return 'molecule';
      if (r < o.hole + o.tunnel + o.molecule + o.atom) return 'atom';
      return 'dust';
    },

    _mesh(game, color, r, halo) {
      const T = G.THREE; if (!T || !game.scene) return null;
      const m = new T.Mesh(game.geo.lowSphere, new T.MeshBasicMaterial({ color }));
      m.scale.setScalar(r);
      if (halo) {
        const h = new T.Mesh(game.geo.lowSphere, new T.MeshBasicMaterial({ color: halo, transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false }));
        h.scale.setScalar(2.2); m.add(h);
      }
      game.scene.add(m);
      return m;
    },

    _look(p) {
      const T = G.THREE; if (!p.mesh) return;
      let col = '#ffffff', r = 0.15, halo = null;
      if (p.part === 'dust') { col = p.color; r = 0.13; }
      else if (p.part === 'atom') { col = G.Elements.info(p.sym).color; r = 0.26; halo = col; }
      else if (p.part === 'molecule') { col = '#9be8ff'; r = 0.3; halo = '#9be8ff'; }
      else if (p.part === 'hole') { col = '#000000'; r = 0.5; halo = '#aa44ff'; }
      else if (p.part === 'tunnel') { col = '#00ffff'; r = 0.45; halo = '#ff44ff'; }
      p.r = r;
      p.mesh.material.color.set(col); p.mesh.scale.setScalar(r);
      while (p.mesh.children.length) { const c = p.mesh.children[0]; p.mesh.remove(c); c.material.dispose(); }
      if (halo) {
        const h = new T.Mesh(this.game.geo.lowSphere, new T.MeshBasicMaterial({ color: halo, transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false }));
        h.scale.setScalar(2.2); p.mesh.add(h);
      }
    },

    fire(game) {
      if (game.gun !== 'chaos') return false;
      this.game = game;
      if (game.fireCooldown > 0) return true;
      const W = G.World, V = G.V;
      const nose = game._nose(), dir = game._aimDir();
      for (let i = 0; i < TUNE.pellets; i++) {
        const j = V.norm(V.add(dir, V.scale(V.randUnit(), TUNE.spread * Math.random())));
        const vel = V.add(V.scale(j, TUNE.speed * (0.7 + 0.6 * Math.random())), game.shipVel);
        const p = { part: this._pick(), sym: rnd(ATOMS), color: rnd(DUST), mol: rnd(MOLS), life: TUNE.life * (0.7 + 0.6 * Math.random()), r: 0.2,
          pos: { x: nose.x + dir.x * 1.5, y: nose.y + dir.y * 1.5, z: nose.z + dir.z * 1.5 }, vel };
        p.mesh = this._mesh(game, '#fff', 0.2, null);
        this._look(p);
        this.pellets.push(p);
      }
      game.fireCooldown = TUNE.cooldown;
      if (game.started && G.Audio) G.Audio.blip(180 + Math.random() * 500, 0.06, 'sawtooth', 0.05);
      return true;
    },

    _spawnAt(p) {
      const W = G.World, V = G.V;
      if (p.part === 'atom') {
        const a = W.spawnAtom(p.sym, p.pos, V.scale(p.vel, 0.15), 'world', 0.6);
        if (a) a.flash = { color: '#ffffff', t: 0.5 };
      } else if (p.part === 'molecule') {
        const [c, outer, order] = p.mol;
        const ca = W.spawnAtom(c, p.pos, V.scale(p.vel, 0.1), 'world', 0.6);
        if (!ca) return;
        outer.forEach(s => {
          const q = W.spawnAtom(s, V.add(p.pos, V.scale(V.randUnit(), 1.6)), V.scale(p.vel, 0.1), 'world', 0.6);
          if (q) W.bond(ca, q, order, false);
        });
      } else if (p.part === 'hole') this._openHole(p.pos);
      else if (p.part === 'tunnel') this._openTunnel(p.pos);
    },

    _openHole(pos) {
      const game = this.game, T = G.THREE; if (!T) return;
      const core = new T.Mesh(game.geo.lowSphere, new T.MeshBasicMaterial({ color: 0x000000 }));
      const ring = new T.Mesh(new T.TorusGeometry(1.7, 0.18, 8, 36), new T.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = Math.PI / 2.4; core.add(ring);
      core.position.set(pos.x, pos.y, pos.z); core.scale.setScalar(1.2);
      game.scene.add(core);
      this.holes.push({ pos: { x: pos.x, y: pos.y, z: pos.z }, life: TUNE.holeLife, age: 0, mesh: core, ring, eaten: 0 });
      game._status('⚫ BLACK HOLE! It eats atoms for ' + TUNE.holeLife + ' seconds');
      if (game.started && G.Audio) G.Audio.blip(60, 0.5, 'sine', 0.12);
    },

    _portal(color, pos) {
      const game = this.game, T = G.THREE;
      const m = new T.Mesh(new T.TorusGeometry(TUNE.portalRadius, 0.22, 8, 40), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
      const disc = new T.Mesh(new T.CircleGeometry(TUNE.portalRadius, 32), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      m.add(disc);
      m.position.set(pos.x, pos.y, pos.z);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      game.scene.add(m);
      return m;
    },

    _openTunnel(pos) {
      const V = G.V, game = this.game, R = G.Config.ARENA_RADIUS * 0.8;
      let b = V.add(pos, V.scale(V.randUnit(), TUNE.tunnelGap));
      const L = V.len(b); if (L > R) b = V.scale(b, R / L);
      this.tunnels.push({ a: { x: pos.x, y: pos.y, z: pos.z }, b, life: TUNE.tunnelLife, ma: this._portal(0x00ffff, pos), mb: this._portal(0xff44ff, b) });
      game._status('🌀 QUANTUM TUNNEL! Fly or shoot through one ring and come out of the other');
      if (game.started && G.Audio) G.Audio.blip(900, 0.3, 'triangle', 0.1);
    },

    _kill(m) {
      if (!m) return;
      m.parent && m.parent.remove(m);
      m.traverse(o => { if (o.material) o.material.dispose(); if (o.geometry && o.geometry.type !== 'SphereGeometry') o.geometry.dispose(); });
    },

    tick(game, dt, sim) {
      this.game = game;
      const W = G.World, V = G.V;
      if (!W) return;
      this.tT += dt; this.shipCool = Math.max(0, this.shipCool - dt);

      // pellets
      for (let i = this.pellets.length - 1; i >= 0; i--) {
        const p = this.pellets[i];
        p.life -= sim;
        V.addTo(p.pos, p.vel, sim);
        // a pellet can turn heavy while it flies through a gravity orb, a time bubble, or backwards time
        if (p.part !== 'hole' && p.part !== 'tunnel') {
          let becomes = null;
          for (const q of W.projectiles) {
            if (q.kind === 'grav' && V.dist(q.pos, p.pos) < TUNE.orbRadius && Math.random() < TUNE.orbRate * dt) becomes = 'hole';
            else if (q.kind === 'time' && V.dist(q.pos, p.pos) < TUNE.bubbleRadius && Math.random() < TUNE.bubbleRate * dt) becomes = 'tunnel';
          }
          if (game.timeRev && Math.random() < TUNE.reverseRate * dt) becomes = 'tunnel';
          if (becomes) { p.part = becomes; this._look(p); }
        }
        let done = p.life <= 0 || V.len(p.pos) > G.Config.ARENA_RADIUS;
        if (!done) {
          for (const a of W.atoms) {
            const hr = a.r + p.r + 0.2;
            if (Math.abs(a.pos.x - p.pos.x) > hr || Math.abs(a.pos.y - p.pos.y) > hr || Math.abs(a.pos.z - p.pos.z) > hr) continue;
            if (V.dist(a.pos, p.pos) < hr) {
              a.energy = Math.min(2.4, a.energy + 0.3);
              a.flash = { color: p.part === 'dust' ? p.color : '#ffffff', t: 0.35 };
              V.addTo(a.vel, V.norm(p.vel), 1.0);
              done = true; break;
            }
          }
        }
        if (p.mesh) p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
        if (done) { this._spawnAt(p); this._kill(p.mesh); this.pellets.splice(i, 1); }
      }

      // black holes
      for (let i = this.holes.length - 1; i >= 0; i--) {
        const h = this.holes[i];
        h.life -= sim; h.age += sim;
        const fade = Math.min(1, h.life / 1.2);
        h.mesh.scale.setScalar((1.2 + Math.sin(h.age * 6) * 0.1) * Math.max(0.05, fade));
        h.ring.rotation.z += dt * 3;
        if (h.life <= 0) { this._kill(h.mesh); this.holes.splice(i, 1); continue; }
        for (let k = W.atoms.length - 1; k >= 0; k--) {
          const a = W.atoms[k];
          const d = V.dist(a.pos, h.pos);
          if (d > TUNE.holeRadius) continue;
          if (d < TUNE.eatRadius) { W.removeAtom(a); h.eaten++; game.score += 1; if (game.started && G.Audio) G.Audio.blip(90, 0.08, 'sine', 0.06); continue; }
          V.addTo(a.vel, V.norm(V.sub(h.pos, a.pos)), TUNE.holeStrength * sim / Math.max(2, d) * (1 + (TUNE.holeRadius - d) / TUNE.holeRadius));
        }
        for (const q of this.pellets) {
          const d = V.dist(q.pos, h.pos);
          if (d < TUNE.holeRadius) V.addTo(q.vel, V.norm(V.sub(h.pos, q.pos)), TUNE.holeStrength * sim / Math.max(2, d));
        }
        const sd = V.dist(game.ship.position, h.pos);
        if (sd < TUNE.holeRadius && sd > 0.1) {
          const pull = V.norm(V.sub(h.pos, game.ship.position));
          V.addTo(game.shipVel, pull, TUNE.holeStrength * 0.35 * dt / Math.max(3, sd));
        }
      }

      // quantum tunnels: through one ring, out of the other
      for (let i = this.tunnels.length - 1; i >= 0; i--) {
        const t = this.tunnels[i];
        t.life -= sim;
        t.ma.rotation.z += dt; t.mb.rotation.z -= dt;
        const fade = Math.max(0.05, Math.min(1, t.life / 1.2));
        t.ma.scale.setScalar(fade); t.mb.scale.setScalar(fade);
        if (t.life <= 0) { this._kill(t.ma); this._kill(t.mb); this.tunnels.splice(i, 1); continue; }
        const hop = (obj, vel, T, from, to) => { // move obj from one portal to the other, keeping its speed
          const off = V.sub(obj, from), n = V.norm(off);
          const out = V.len(vel) > 0.1 ? V.norm(vel) : n;
          obj.x = to.x + out.x * (TUNE.portalRadius + 1.2); obj.y = to.y + out.y * (TUNE.portalRadius + 1.2); obj.z = to.z + out.z * (TUNE.portalRadius + 1.2);
        };
        for (const a of W.atoms) {
          if ((a._tunT || 0) > this.tT) continue;
          const da = V.dist(a.pos, t.a), db = V.dist(a.pos, t.b);
          if (da < TUNE.portalRadius) { hop(a.pos, a.vel, t, t.a, t.b); a._tunT = this.tT + 1; a.flash = { color: '#00ffff', t: 0.6 }; }
          else if (db < TUNE.portalRadius) { hop(a.pos, a.vel, t, t.b, t.a); a._tunT = this.tT + 1; a.flash = { color: '#ff44ff', t: 0.6 }; }
        }
        if (this.shipCool <= 0) {
          const sp = game.ship.position, da = V.dist(sp, t.a), db = V.dist(sp, t.b);
          const go = da < TUNE.portalRadius + 1 ? [t.a, t.b] : db < TUNE.portalRadius + 1 ? [t.b, t.a] : null;
          if (go) {
            const tmp = { x: sp.x, y: sp.y, z: sp.z };
            hop(tmp, game.shipVel, t, go[0], go[1]);
            sp.set(tmp.x, tmp.y, tmp.z);
            this.shipCool = 1.5;
            game._status('🌀 Whoosh! Through the quantum tunnel');
            if (game.started && G.Audio) G.Audio.blip(1200, 0.2, 'triangle', 0.08);
          }
        }
      }
    },

    reset() {
      this.pellets.forEach(p => this._kill(p.mesh)); this.holes.forEach(h => this._kill(h.mesh));
      this.tunnels.forEach(t => { this._kill(t.ma); this._kill(t.mb); });
      this.pellets = []; this.holes = []; this.tunnels = [];
    }
  };
  G.Chaos = Chaos;
})();
