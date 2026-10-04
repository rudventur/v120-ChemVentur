/* ============================================
   ⚛️ CHEMVENTUR STAGE 3 GAME - WORLD (pure simulation)
   ============================================
   Atoms, bonds, projectiles, 3D bonding physics and the c2c note effects.
   No three.js / DOM: the renderer listens to events (World.on) and syncs meshes.
   ============================================ */

(function () {
  'use strict';
  const root = (typeof window !== 'undefined') ? window : globalThis;
  const CV = (root.CHEMVENTUR = root.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});
  const V = G.V, C = G.Config, El = G.Elements;

  let nextId = 1;

  const World = {
    atoms: [],
    bonds: [],
    projectiles: [],
    time: 0,
    listeners: [],
    stats: { bondsFormed: 0, bondsBroken: 0, collected: 0, hits: 0 },
    inventory: {},

    on(fn) { this.listeners.push(fn); },
    emit(type, data) { for (const fn of this.listeners) { try { fn(type, data); } catch (e) { console.error(e); } } },

    reset() {
      [...this.projectiles].forEach(p => this.removeProjectile(p));
      [...this.atoms].forEach(a => this.removeAtom(a));
      this.time = 0;
      this.stats = { bondsFormed: 0, bondsBroken: 0, collected: 0, hits: 0 };
      this.inventory = {};
    },

    // ===== ATOMS =====
    spawnAtom(symbol, pos, vel, origin, energy) {
      if (this.atoms.length >= C.MAX_ATOMS) return null;
      const info = El.info(symbol);
      const Z = El.Z(symbol) || 0;
      const atom = {
        id: nextId++, kind: 'atom', symbol, Z,
        color: info.color, valence: info.valence,
        r: El.displayRadius(symbol),
        mass: 1 + 0.06 * Z,
        pos: V.v(pos.x, pos.y, pos.z), vel: vel ? V.v(vel.x, vel.y, vel.z) : V.v(),
        energy: energy || 0, flash: null, bonds: [], origin: origin || 'world',
        noBondUntil: 0, mesh: null
      };
      this.atoms.push(atom);
      this.emit('atomAdded', atom);
      return atom;
    },

    removeAtom(atom) {
      [...atom.bonds].forEach(b => this.breakBond(b, true));
      const i = this.atoms.indexOf(atom);
      if (i >= 0) this.atoms.splice(i, 1);
      this.emit('atomRemoved', atom);
    },

    freeValence(a) {
      let used = 0;
      for (const b of a.bonds) used += b.order;
      return a.valence - used;
    },

    bondBetween(a, b) { return a.bonds.find(x => x.a === b || x.b === b) || null; },

    // ===== BONDS =====
    bond(a, b, order, byPlayer) {
      if (!a || !b || a === b || this.bondBetween(a, b)) return null;
      order = order || 1;
      const bond = { id: nextId++, a, b, order, rest: El.bondLength(a.symbol, b.symbol, order), byPlayer: !!byPlayer, mesh: null };
      a.bonds.push(bond);
      b.bonds.push(bond);
      this.bonds.push(bond);
      this.stats.bondsFormed++;
      this.emit('bondAdded', bond);
      return bond;
    },

    setBondOrder(bond, order) {
      bond.order = Math.max(1, Math.min(3, order));
      bond.rest = El.bondLength(bond.a.symbol, bond.b.symbol, bond.order);
      this.emit('bondChanged', bond);
    },

    breakBond(bond, silent) {
      const i = this.bonds.indexOf(bond);
      if (i < 0) return;
      this.bonds.splice(i, 1);
      bond.a.bonds.splice(bond.a.bonds.indexOf(bond), 1);
      bond.b.bonds.splice(bond.b.bonds.indexOf(bond), 1);
      bond.a.noBondUntil = bond.b.noBondUntil = this.time + 0.6;
      if (!silent) this.stats.bondsBroken++;
      this.emit('bondRemoved', bond);
    },

    // Spawn a parsed molblock/SDF {atoms:[{symbol,x,y,z}], bonds:[{a,b,order}]} centred on `center`
    spawnMolecule(parsed, center, origin, vel, byPlayer) {
      if (!parsed || !parsed.atoms.length) return null;
      if (this.atoms.length + parsed.atoms.length > C.MAX_ATOMS) return null;
      const s = C.WORLD_PER_ANGSTROM;
      let cx = 0, cy = 0, cz = 0;
      parsed.atoms.forEach(a => { cx += a.x; cy += a.y; cz += a.z; });
      cx /= parsed.atoms.length; cy /= parsed.atoms.length; cz /= parsed.atoms.length;
      const made = parsed.atoms.map(a => this.spawnAtom(a.symbol,
        V.v(center.x + (a.x - cx) * s, center.y + (a.y - cy) * s, center.z + (a.z - cz) * s), vel, origin, 0));
      const bonds = [];
      parsed.bonds.forEach(b => {
        const bb = this.bond(made[b.a], made[b.b], b.order, byPlayer);
        if (bb) bonds.push(bb);
      });
      // Use the real geometry as rest lengths, so conformers keep their shape
      bonds.forEach(b => { b.rest = Math.max(0.6, V.dist(b.a.pos, b.b.pos)); b.fixedRest = true; });
      return { atoms: made, bonds };
    },

    components() {
      const seen = new Set();
      const out = [];
      for (const start of this.atoms) {
        if (seen.has(start)) continue;
        const atoms = [];
        const stack = [start];
        seen.add(start);
        while (stack.length) {
          const a = stack.pop();
          atoms.push(a);
          for (const b of a.bonds) {
            const o = b.a === a ? b.b : b.a;
            if (!seen.has(o)) { seen.add(o); stack.push(o); }
          }
        }
        const set = new Set(atoms);
        const bonds = this.bonds.filter(b => set.has(b.a));
        out.push({ atoms, bonds, byPlayer: bonds.some(b => b.byPlayer) });
      }
      return out;
    },

    formulaOf(comp) { return G.hillFormula(comp.atoms.map(a => a.symbol)); },

    toMolblock(comp) {
      const idx = new Map();
      const s = C.WORLD_PER_ANGSTROM;
      const atoms = comp.atoms.map((a, i) => { idx.set(a, i); return { symbol: a.symbol, x: a.pos.x / s, y: a.pos.y / s, z: a.pos.z / s }; });
      const bonds = comp.bonds.map(b => ({ a: idx.get(b.a), b: idx.get(b.b), order: b.order }));
      return CV.Stage3Chem.writeMolblock(atoms, bonds, 'ChemVentur Stage3 build');
    },

    // ===== PROJECTILES =====
    addProjectile(p) {
      p.id = nextId++;
      this.projectiles.push(p);
      this.emit('projAdded', p);
      return p;
    },

    removeProjectile(p) {
      const i = this.projectiles.indexOf(p);
      if (i >= 0) this.projectiles.splice(i, 1);
      this.emit('projRemoved', p);
    },

    // ===== c2c NOTE EFFECTS =====
    applyDot(dot, atom) {
      const shot = dot.shot;
      atom.energy = Math.min(2.2, atom.energy + 0.4 + shot.semitone / 24);
      V.addTo(atom.vel, V.norm(dot.vel), 1.5);
      atom.flash = { color: shot.color, t: 0.6 };
      this.stats.hits++;
      let result = 'energized';
      if (shot.effect === 'bond') {
        // ROOT (C): grab the nearest free atom and bond it
        let best = null, bestD = Infinity;
        if (this.freeValence(atom) > 0) {
          for (const o of this.atoms) {
            if (o === atom || this.bondBetween(atom, o) || this.freeValence(o) <= 0) continue;
            const d = V.dist(o.pos, atom.pos);
            if (d < bestD && d < El.bondLength(atom.symbol, o.symbol, 1) * 3) { best = o; bestD = d; }
          }
        }
        if (best && this.bond(atom, best, 1, true)) { V.addTo(best.vel, V.norm(V.sub(atom.pos, best.pos)), 3); result = 'bonded'; }
      } else if (shot.effect === 'resonance') {
        // TOP C: raise one bond order (single -> double -> triple) if valences allow
        const b = atom.bonds.slice().sort((x, y) => x.order - y.order)
          .find(x => x.order < 3 && this.freeValence(x.a) > 0 && this.freeValence(x.b) > 0);
        if (b) { this.setBondOrder(b, b.order + 1); result = 'order+1'; }
      } else if (shot.effect === 'dissonance') {
        // SHARPS: break one bond and kick
        if (atom.bonds.length) {
          this.breakBond(atom.bonds[atom.bonds.length - 1]);
          V.addTo(atom.vel, V.randUnit(), 4);
          result = 'broke-bond';
        }
      }
      this.emit('hit', { atom, dot, result });
      return result;
    },

    applyBlaster(p, atom) {
      this.stats.hits++;
      if (atom.bonds.length) {
        [...atom.bonds].forEach(b => this.breakBond(b));
        V.addTo(atom.vel, V.norm(p.vel), 6);
        atom.flash = { color: '#ff3355', t: 0.4 };
        this.emit('hit', { atom, dot: p, result: 'ripped' });
      } else {
        this.collect(atom);
      }
    },

    collect(atom) {
      this.inventory[atom.symbol] = (this.inventory[atom.symbol] || 0) + 1;
      this.stats.collected++;
      this.emit('collect', atom);
      this.removeAtom(atom);
    },

    // ===== STEP =====
    step(dt, ctx) {
      dt = Math.min(dt, 0.05);
      this.time += dt;
      const atoms = this.atoms;
      const R = C.ARENA_RADIUS;
      const damp = Math.exp(-0.35 * dt);
      const eDecay = Math.exp(-0.6 * dt);

      // integrate
      for (const a of atoms) {
        a.vel.x *= damp; a.vel.y *= damp; a.vel.z *= damp;
        a.pos.x += a.vel.x * dt; a.pos.y += a.vel.y * dt; a.pos.z += a.vel.z * dt;
        a.energy *= eDecay;
        if (a.flash) { a.flash.t -= dt; if (a.flash.t <= 0) a.flash = null; }
        const d = V.len(a.pos);
        if (d > R) {
          const n = V.scale(a.pos, 1 / d);
          const vn = V.dot(a.vel, n);
          if (vn > 0) V.addTo(a.vel, n, -1.8 * vn);
          V.addTo(a.pos, n, R - d);
        }
      }

      // bond springs
      for (let i = this.bonds.length - 1; i >= 0; i--) {
        const b = this.bonds[i];
        const d = V.sub(b.b.pos, b.a.pos);
        const L = V.len(d) || 0.0001;
        const n = V.scale(d, 1 / L);
        const ext = L - b.rest;
        if (ext > b.rest * 1.8) { this.breakBond(b); continue; }
        const relV = V.dot(V.sub(b.b.vel, b.a.vel), n);
        const f = (C.BOND_K * ext + 3.0 * relV) * dt;
        V.addTo(b.a.vel, n, f / b.a.mass * b.b.mass / (b.a.mass + b.b.mass) * 2);
        V.addTo(b.b.vel, n, -f / b.b.mass * b.a.mass / (b.a.mass + b.b.mass) * 2);
      }

      // 1-3 repulsion: spreads neighbours apart (VSEPR-ish 3D shapes)
      for (const a of atoms) {
        if (a.bonds.length < 2) continue;
        const nb = a.bonds.map(b => (b.a === a ? b.b : b.a));
        for (let i = 0; i < nb.length; i++) for (let j = i + 1; j < nb.length; j++) {
          const p = nb[i], q = nb[j];
          const target = 0.82 * (V.dist(p.pos, a.pos) + V.dist(q.pos, a.pos));
          const d = V.sub(q.pos, p.pos);
          const L = V.len(d) || 0.0001;
          if (L < target) {
            const push = (target - L) * 4 * dt;
            const n = V.scale(d, 1 / L);
            V.addTo(p.vel, n, -push); V.addTo(q.vel, n, push);
          }
        }
      }

      // pair loop: collisions + new bonds
      for (let i = 0; i < atoms.length; i++) {
        const a = atoms[i];
        for (let j = i + 1; j < atoms.length; j++) {
          const b = atoms[j];
          const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
          const reach = (a.r + b.r) * 2.2;
          if (Math.abs(dx) > reach || Math.abs(dy) > reach || Math.abs(dz) > reach) continue;
          const L = Math.hypot(dx, dy, dz) || 0.0001;
          const bonded = this.bondBetween(a, b);
          if (!bonded) {
            const minD = (a.r + b.r) * 0.95;
            if (L < minD) {
              const n = { x: dx / L, y: dy / L, z: dz / L };
              const push = (minD - L) * 0.5;
              V.addTo(a.pos, n, -push); V.addTo(b.pos, n, push);
              const rv = V.dot(V.sub(b.vel, a.vel), n);
              if (rv < 0) { V.addTo(a.vel, n, rv * 0.5); V.addTo(b.vel, n, -rv * 0.5); }
            }
            const rest = El.bondLength(a.symbol, b.symbol, 1);
            if (L < rest * 1.3 && a.energy + b.energy > 0.35 &&
                this.time > a.noBondUntil && this.time > b.noBondUntil &&
                this.freeValence(a) > 0 && this.freeValence(b) > 0) {
              this.bond(a, b, 1, a.origin === 'player' || b.origin === 'player' || a.energy > 0.35 || b.energy > 0.35);
            }
          }
        }
      }

      // projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.life -= dt;
        V.addTo(p.pos, p.vel, dt);
        if (p.life <= 0 || V.len(p.pos) > R * 1.2) { this.removeProjectile(p); continue; }
        for (const a of atoms) {
          const hitR = a.r + p.r + 0.3;
          if (Math.abs(a.pos.x - p.pos.x) > hitR || Math.abs(a.pos.y - p.pos.y) > hitR || Math.abs(a.pos.z - p.pos.z) > hitR) continue;
          if (V.dist(a.pos, p.pos) < hitR) {
            if (p.kind === 'dot') this.applyDot(p, a);
            else if (p.kind === 'blaster') this.applyBlaster(p, a);
            else if (G.GunRack) G.GunRack.apply(this, p, a);
            else this.applyBlaster(p, a);
            this.removeProjectile(p);
            break;
          }
        }
      }

      // ship scoops up free atoms
      if (ctx && ctx.shipPos) {
        for (let i = atoms.length - 1; i >= 0; i--) {
          const a = atoms[i];
          if (a.bonds.length || a.origin === 'player' && a.energy > 0.5) continue;
          if (V.dist(a.pos, ctx.shipPos) < (ctx.shipRadius || 2.2) + a.r) this.collect(a);
        }
      }
    }
  };

  G.World = World;
})();
