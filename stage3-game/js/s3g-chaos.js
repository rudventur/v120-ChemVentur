/* CHEMVENTUR Stage 3 — gun 5: CHAOS shotgun.
   Fires a spread of random parts from every stage:
     stage 3: single atoms and tiny molecules;
     stage 1: protons, neutrons and electrons (each trails a random handful of little strings);
     stage 0: strings, knot strings (turn into another part mid-flight), anti-strings (dead strings: they land as
              a little rubber ball, half black hole, half white hole), gravity orbs, and single random notes
              from the c2c tone gun (never a whole scale).
   Landing parts of stages 0 and 1 sometimes cause a "reality glitch": an atom changes element, gravity flips,
   time hiccups, an atom is cloned, or a nearby cloud is scattered.
   SUPERCOINCIDENCE: any gun can sometimes fire one of every part type at once (see coincidence()).
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
    // chance of each part, in this order; whatever is left over is more stage 1 particles
    odds: { hole: 0.02, tunnel: 0.02, string: 0.14, anti: 0.06, knot: 0.03, note: 0.08, orb: 0.04, atom: 0.10, molecule: 0.06 },
    glitch: 0.07,                       // chance a landing stage 0 / stage 1 part causes a reality glitch
    coincidence: { chaos: 0.12, other: 0.04, cooldown: 3 },   // supercoincidence chance per shot
    orbRadius: 8, bubbleRadius: 7, orbRate: 0.9, bubbleRate: 0.9, reverseRate: 0.5,   // per second chance to turn heavy
    holeLife: 9, holeRadius: 16, holeStrength: 70, eatRadius: 1.8,
    tunnelLife: 12, tunnelGap: 38, portalRadius: 2.6
  };
  const ATOMS = ['H', 'He', 'Li', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Fe', 'Cu', 'Zn', 'Br', 'I', 'U'];
  const SUB = [['proton', '#ff3344'], ['neutron', '#d8d8d8'], ['electron', '#44aaff']];       // stage 1
  const STRINGS = ['#ff3333', '#cccccc', '#00ffff', '#ffff00', '#ff8800', '#00ffaa'];         // stage 0 string colours
  // tiny molecules: [centre, [outer atoms], bond order]
  const MOLS = [['O', ['H', 'H'], 1], ['C', ['O', 'O'], 2], ['N', ['H', 'H', 'H'], 1], ['C', ['H', 'H', 'H', 'H'], 1], ['H', ['H'], 1], ['O', ['O'], 2]];

  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const Chaos = {
    TUNE, pellets: [], holes: [], tunnels: [], game: null, tT: 0, shipCool: 0, coinCool: 0,

    _pick() {
      const o = TUNE.odds; let r = Math.random();
      for (const k of ['hole', 'tunnel', 'string', 'anti', 'knot', 'note', 'orb', 'atom', 'molecule']) { if (r < o[k]) return k; r -= o[k]; }
      return 'sub';
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

    _stringLine(color) {
      const T = G.THREE, n = 14;
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
      return new T.Line(geo, new T.LineBasicMaterial({ color }));
    },
    _wiggle(line, t, amp, len) {
      const pos = line.geometry.attributes.position, n = pos.count;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        pos.setXYZ(i, Math.sin(u * 9 + t * 14) * amp, Math.cos(u * 7 + t * 11) * amp * 0.7, -u * len);
      }
      pos.needsUpdate = true;
    },

    _look(p) {
      const T = G.THREE; if (!T || !this.game || !this.game.scene) return;
      const scene = this.game.scene;
      if (p.mesh) { scene.remove(p.mesh); this._kill(p.mesh); p.mesh = null; }
      const isLine = p.part === 'string' || p.part === 'anti' || p.part === 'knot';
      if (isLine) {
        const col = p.part === 'anti' ? '#555566' : p.part === 'knot' ? '#ff00ff' : p.color;
        p.mesh = this._stringLine(col); p.r = 0.3; p.len = p.part === 'anti' ? 3.5 : 2.6;
        scene.add(p.mesh); return;
      }
      let col = '#ffffff', r = 0.15, halo = null;
      if (p.part === 'sub') { col = p.subColor; r = 0.14; }
      else if (p.part === 'atom') { col = G.Elements.info(p.sym).color; r = 0.26; halo = col; }
      else if (p.part === 'molecule') { col = '#9be8ff'; r = 0.3; halo = '#9be8ff'; }
      else if (p.part === 'orb') { col = '#aa66ff'; r = 0.4; halo = '#aa66ff'; }
      else if (p.part === 'hole') { col = '#000000'; r = 0.5; halo = '#aa44ff'; }
      else if (p.part === 'tunnel') { col = '#00ffff'; r = 0.45; halo = '#ff44ff'; }
      p.r = r;
      p.mesh = this._mesh(this.game, col, r, halo);
      if (p.part === 'sub') {   // stage 1 particles trail a random handful of little strings
        for (let i = 0; i < p.strands; i++) {
          const l = this._stringLine(p.subColor); l.userData.ph = Math.random() * 6; l.rotation.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0);
          l.scale.setScalar(0.5 / r); p.mesh.add(l);
        }
      }
    },

    _make(game, part, nose, dir, spreadAmt, speedMul) {
      const V = G.V;
      const j = V.norm(V.add(dir, V.scale(V.randUnit(), spreadAmt * Math.random())));
      const vel = V.add(V.scale(j, TUNE.speed * (speedMul || (0.7 + 0.6 * Math.random()))), game.shipVel);
      const sub = rnd(SUB);
      const p = { part, age: 0, sym: rnd(ATOMS), color: rnd(STRINGS), subKind: sub[0], subColor: sub[1], strands: 1 + Math.floor(Math.random() * 5),
        mol: rnd(MOLS), life: TUNE.life * (0.7 + 0.6 * Math.random()), r: 0.2,
        pos: { x: nose.x + dir.x * 1.5, y: nose.y + dir.y * 1.5, z: nose.z + dir.z * 1.5 }, vel };
      this._look(p);
      this.pellets.push(p);
      return p;
    },

    // a single random note from the c2c tone gun (never a whole scale)
    _note(game, nose, dir, spreadAmt) {
      const W = G.World, V = G.V;
      const series = G.C2C.series(Math.random() < 0.5 ? 'chromatic' : 'major');
      const shot = rnd(series);
      const j = V.norm(V.add(dir, V.scale(V.randUnit(), spreadAmt * Math.random())));
      const vel = V.add(V.scale(j, G.Config.DOT_SPEED), game.shipVel);
      W.addProjectile({ kind: 'dot', pos: { x: nose.x, y: nose.y, z: nose.z }, vel, life: G.Config.DOT_LIFE, r: shot.radius, color: shot.color, shot, seq: 0 });
      if (G.Audio) G.Audio.playNote(shot, 0);
      return shot.note;
    },

    fire(game) {
      if (game.gun !== 'chaos') return false;
      this.game = game;
      if (game.fireCooldown > 0) return true;
      const nose = game._nose(), dir = game._aimDir();
      const notes = [];
      for (let i = 0; i < TUNE.pellets; i++) {
        const part = this._pick();
        if (part === 'note') notes.push(this._note(game, nose, dir, TUNE.spread));
        else this._make(game, part, nose, dir, TUNE.spread);
      }
      if (notes.length) game._status('🎵 chaos note' + (notes.length > 1 ? 's' : '') + ' ' + notes.join(' '));
      game.fireCooldown = TUNE.cooldown;
      if (game.started && G.Audio) G.Audio.blip(180 + Math.random() * 500, 0.06, 'sawtooth', 0.05);
      return true;
    },

    // SUPERCOINCIDENCE: sometimes ANY gun's shot is also one of every part type, fired together
    coincidence(game) {
      this.game = game;
      if (this.coinCool > 0) return;
      const T = TUNE.coincidence;
      if (Math.random() >= (game.gun === 'chaos' ? T.chaos : T.other)) return;
      this.coinCool = T.cooldown;
      const nose = game._nose(), dir = game._aimDir();
      ['sub', 'sub', 'sub', 'string', 'anti', 'knot', 'orb', 'atom', 'molecule'].forEach(part => this._make(game, part, nose, dir, 0.25, 1));
      const note = this._note(game, nose, dir, 0.1);
      game._status('✨ SUPERCOINCIDENCE! Every kind of part at once, plus the note ' + note);
      if (game.started && G.Audio) { G.Audio.blip(1568, 0.25, 'triangle', 0.1); }
    },

    // landing stage 0 / stage 1 parts sometimes change something in reality
    _glitch(pos) {
      const W = G.World, V = G.V, game = this.game;
      const near = (rad) => { let b = null, bd = rad; for (const a of W.atoms) { const d = V.dist(a.pos, pos); if (d < bd) { b = a; bd = d; } } return b; };
      const kind = Math.floor(Math.random() * 5);
      if (kind === 0) {
        const a = near(14);
        if (a) {
          const sym = rnd(ATOMS), info = G.Elements.info(sym), was = a.symbol;
          a.symbol = sym; a.Z = G.Elements.Z(sym) || 0; a.color = info.color; a.valence = info.valence;
          a.r = G.Elements.displayRadius(sym); a.mass = 1 + 0.06 * a.Z;
          if (a.mesh) { a.mesh.material.color.set(info.color); a.mesh.scale.setScalar(a.r); }
          a.flash = { color: '#ffffff', t: 1 };
          game._status('✨ Reality glitch: ' + was + ' turned into ' + sym);
          return;
        }
      }
      if (kind === 1) {
        for (const a of W.atoms) if (V.dist(a.pos, pos) < 22) { a.vel.x *= -1; a.vel.y *= -1; a.vel.z *= -1; a.flash = { color: '#aa66ff', t: 0.6 }; }
        game._status('✨ Reality glitch: gravity flipped around here');
      } else if (kind === 2) {
        game.slow = 1.8; game._status('✨ Reality glitch: time hiccup');
      } else if (kind === 3) {
        const a = near(14);
        if (a) { const c = W.spawnAtom(a.symbol, V.add(a.pos, V.scale(V.randUnit(), a.r * 2.4)), a.vel, 'world', 0.5); if (c) c.flash = { color: '#ffffff', t: 0.8 }; game._status('✨ Reality glitch: an atom was cloned'); }
      } else {
        for (const a of W.atoms) { const d = V.dist(a.pos, pos); if (d < 15) V.addTo(a.vel, V.randUnit(), 6 * (1 - d / 15)); }
        game._status('✨ Reality glitch: everything nearby got scattered');
      }
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
      } else if (p.part === 'orb') {
        W.addProjectile({ kind: 'grav', pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, vel: V.scale(p.vel, 0.25), life: 6, r: 0.45, color: '#aa66ff' });
        this.game._status('🌍 gravity orb (same as gun 9)');
      } else if (p.part === 'anti') this._openRubber(p.pos);
      else if (p.part === 'sub' || p.part === 'string' || p.part === 'knot') { if (Math.random() < TUNE.glitch) this._glitch(p.pos); }
      else if (p.part === 'hole') this._openHole(p.pos);
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

    // anti-string (dead string) lands as a little rubber ball: half black hole, half white hole
    _openRubber(pos) {
      const game = this.game, T = G.THREE; if (!T) return;
      const core = new T.Mesh(game.geo.lowSphere, new T.MeshBasicMaterial({ color: 0x222233 }));
      const halo = new T.Mesh(game.geo.lowSphere, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, blending: T.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(1.8); core.add(halo);
      core.position.set(pos.x, pos.y, pos.z); core.scale.setScalar(0.9);
      game.scene.add(core);
      this.holes.push({ pos: { x: pos.x, y: pos.y, z: pos.z }, life: 6, age: 0, mesh: core, ring: halo, eaten: 0, rubber: true });
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
      this.tT += dt; this.shipCool = Math.max(0, this.shipCool - dt); this.coinCool = Math.max(0, this.coinCool - dt);

      // pellets
      for (let i = this.pellets.length - 1; i >= 0; i--) {
        const p = this.pellets[i];
        p.life -= sim; p.age += sim;
        V.addTo(p.pos, p.vel, sim);
        if (p.part === 'knot' && p.age > 1) {   // a knot string turns into some other part mid-flight
          let np = this._pick(); if (np === 'knot' || np === 'note') np = 'sub';
          p.part = np; this._look(p);
        }
        // a pellet can turn heavy while it flies through a gravity orb, a time bubble, or backwards time
        if (p.part !== 'hole' && p.part !== 'tunnel' && p.part !== 'anti') {
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
              a.flash = { color: p.part === 'sub' ? p.subColor : '#ffffff', t: 0.35 };
              V.addTo(a.vel, V.norm(p.vel), 1.0);
              done = true; break;
            }
          }
        }
        if (p.mesh) {
          p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
          if (p.part === 'string' || p.part === 'anti' || p.part === 'knot') {
            p.mesh.lookAt(p.pos.x - p.vel.x, p.pos.y - p.vel.y, p.pos.z - p.vel.z);
            this._wiggle(p.mesh, this.tT + p.age, p.part === 'anti' ? 0.12 : 0.35, p.len);
          } else if (p.part === 'sub') {
            for (const l of p.mesh.children) if (l.userData && l.userData.ph !== undefined) this._wiggle(l, this.tT + l.userData.ph, 1.2, 5);
          }
        }
        if (done) { this._spawnAt(p); this._kill(p.mesh); this.pellets.splice(i, 1); }
      }

      // black holes
      for (let i = this.holes.length - 1; i >= 0; i--) {
        const h = this.holes[i];
        h.life -= sim; h.age += sim;
        const fade = Math.min(1, h.life / 1.2);
        const sgn = h.rubber ? Math.sign(Math.sin(h.age * 2.2)) || 1 : 1;     // rubber ball: pulls, then pushes
        if (h.rubber) h.mesh.material.color.set(sgn > 0 ? 0x222233 : 0xffffff);
        h.mesh.scale.setScalar(((h.rubber ? 0.9 : 1.2) + Math.sin(h.age * 6) * 0.1) * Math.max(0.05, fade));
        h.ring.rotation.z += dt * 3;
        if (h.life <= 0) { this._kill(h.mesh); this.holes.splice(i, 1); continue; }
        for (let k = W.atoms.length - 1; k >= 0; k--) {
          const a = W.atoms[k];
          const d = V.dist(a.pos, h.pos);
          if (d > TUNE.holeRadius) continue;
          if (!h.rubber && d < TUNE.eatRadius) { W.removeAtom(a); h.eaten++; game.score += 1; if (game.started && G.Audio) G.Audio.blip(90, 0.08, 'sine', 0.06); continue; }
          V.addTo(a.vel, V.norm(V.sub(h.pos, a.pos)), sgn * (h.rubber ? 0.4 : 1) * TUNE.holeStrength * sim / Math.max(2, d) * (1 + (TUNE.holeRadius - d) / TUNE.holeRadius));
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
