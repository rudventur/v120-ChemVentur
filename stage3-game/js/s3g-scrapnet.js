/* CHEMVENTUR Stage 3 — SCRAP NET GUN, SHIP DAMAGE and METAL ONLY REPAIR (v120 addition)
   🕸️ Scrap Net gun (key N, button 🕸️): fires a big net at half the speed of light (game scale: light = 120 units per second).
      It catches anything it flies through: loose atoms, incoming scrap and chaos parts.
      When it stops it anchors as a yellow gluon web (Stage 0 style: rings and spokes) and keeps catching anything coming for a while.
      Anchored webs are joined to each other by wobbly gluon threads, making one gluon network.
   🛠️ Scrap hold: caught METAL atoms (metals of the periodic table, as classified in js/periodicTableFull.js) are counted on their own.
      Only metal atoms repair the ship. Non-metals, metalloids, noble gases and other scrap are kept but never repair.
   💥 Damage: scrap debris drifts through the arena, some of it heading for the ship. A hit damages the hull.
      Hull bar, cracks (the hull glows red) and smoke show the damage. Key U (changeable in the keyboard options) or the 🔧 button repairs with metal.
   Only additions: wraps GunRack.fire, GunRack.tick and World.collect. */
(function () {
  const CV = window.CHEMVENTUR = window.CHEMVENTUR || {};
  const G = CV.Stage3Game = CV.Stage3Game || {};

  // metals of the periodic table (alkali, alkaline earth, transition, post-transition, lanthanides, actinides), from js/periodicTableFull.js
  const METALS = new Set('Li Be Na Mg Al K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs'.split(' '));
  const isMetal = s => METALS.has(s);

  const LIGHT = 120;                    // game scale speed of light, units per second
  const NET = { share: 0.5, maxRadius: 4.5, range: 55, anchorTime: 7, maxNets: 6 };
  const HULL = { max: 100, hit: 8, perMetal: 4 };
  const DEBRIS = { every: 5, symbols: ['Fe', 'Cu', 'Al', 'Ti', 'Ni', 'Zn', 'Na', 'Mg', 'C', 'O', 'Si', 'S'], aimShare: 0.5, speed: 9 };

  const Scrap = {
    metal: {}, metalTotal: 0, nonMetal: {}, nonMetalTotal: 0, other: 0,
    add(o) {
      const s = o && o.kind === 'atom' ? o.symbol : null;
      if (s && isMetal(s)) { this.metal[s] = (this.metal[s] || 0) + 1; this.metalTotal++; return 'metal'; }
      if (s) { this.nonMetal[s] = (this.nonMetal[s] || 0) + 1; this.nonMetalTotal++; return 'nonmetal'; }
      this.other++; return 'other';
    },
    useMetal(n) {
      let left = n;
      for (const s of Object.keys(this.metal)) { const t = Math.min(left, this.metal[s]); this.metal[s] -= t; left -= t; if (!this.metal[s]) delete this.metal[s]; if (!left) break; }
      this.metalTotal -= n - left; return n - left;
    }
  };

  const Net = {
    isMetal, Scrap, LIGHT, NET, HULL, nets: [], links: [], hull: HULL.max, hits: 0, caught: 0, debrisTimer: 2, panel: null, smoke: [],
    init(game) {
      if (this.ready || !G.World || !game || !game.ship) return;
      this.ready = true; this.game = game;
      const T = G.THREE;
      this.webMat = new T.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 });
      this.linkMat = new T.LineDashedMaterial({ color: 0xffff00, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.5 });
      this.webGeo = this._webGeometry();
      this.smokeMesh = new T.InstancedMesh(new T.SphereGeometry(1, 6, 4), new T.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.45 }), 200);
      this.smokeMesh.count = 0; this.smokeMesh.frustumCulled = false; game.scene.add(this.smokeMesh);
      this.hullMat = game.ship.children[0] && game.ship.children[0].material;
      this.baseEmissive = this.hullMat ? this.hullMat.emissive.getHex() : 0;
      // ship hits: scrap debris that reaches the ship damages the hull instead of being collected
      const W = G.World, orig = W.collect.bind(W);
      W.collect = (atom) => { if (atom && atom.debris) { this.damage(HULL.hit, atom.symbol + ' scrap hit the hull'); W.removeAtom(atom); return; } return orig(atom); };
      this._panel();
    },
    // Stage 0 style gluon web: 4 rings and 8 spokes, radius 1
    _webGeometry() {
      const T = G.THREE, pts = [];
      for (let r = 1; r <= 4; r++) for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, b = (i + 1) / 8 * Math.PI * 2, k = r / 4;
        pts.push(new T.Vector3(Math.cos(a) * k, Math.sin(a) * k, 0), new T.Vector3(Math.cos(b) * k, Math.sin(b) * k, 0));
      }
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; pts.push(new T.Vector3(0, 0, 0), new T.Vector3(Math.cos(a), Math.sin(a), 0)); }
      return new T.BufferGeometry().setFromPoints(pts);
    },
    fire(game) {
      if (game.fireCooldown > 0) return true;
      game.fireCooldown = 0.45;
      const T = G.THREE, dir = game._aimDir().clone().normalize();
      const start = game._nose();
      const mesh = new T.LineSegments(this.webGeo, this.webMat);
      mesh.position.copy(start); mesh.lookAt(start.clone().add(dir)); mesh.scale.setScalar(0.6);
      game.scene.add(mesh);
      const trail = new T.Line(new T.BufferGeometry().setFromPoints([start.clone(), start.clone()]), new T.LineBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.6 }));
      game.scene.add(trail);
      const n = { pos: start.clone(), from: start.clone(), dir, speed: LIGHT * NET.share, r: 0.6, state: 'flying', age: 0, caught: [], mesh, trail };
      this.nets.push(n);
      while (this.nets.length > NET.maxNets) this._drop(this.nets[0]);
      game._status('🕸️ Scrap net away at half the speed of light');
      return true;
    },
    _sweep(n) {
      const W = G.World, r = n.r;
      for (let i = W.atoms.length - 1; i >= 0; i--) {
        const a = W.atoms[i];
        if (a.bonds && a.bonds.length) continue;          // molecules you are building are safe
        if (a.pos.distanceTo ? a.pos.distanceTo(n.pos) > r + a.r : Math.hypot(a.pos.x - n.pos.x, a.pos.y - n.pos.y, a.pos.z - n.pos.z) > r + a.r) continue;
        const where = Scrap.add(a); n.caught.push({ symbol: a.symbol, where }); this.caught++;
        W.removeAtom(a);
      }
      for (let i = W.projectiles.length - 1; i >= 0; i--) {     // incoming parts that are not ours (chaos parts, falling pieces)
        const p = W.projectiles[i];
        if (p.rocket || p.rocketPending || p.kind === 'dot' || p.fromShip) continue;
        if (!p.incoming) continue;
        if (Math.hypot(p.pos.x - n.pos.x, p.pos.y - n.pos.y, p.pos.z - n.pos.z) > r) continue;
        Scrap.other++; n.caught.push({ symbol: p.kind, where: 'other' }); W.removeProjectile(p);
      }
    },
    _anchor(n) {
      n.state = 'anchored'; n.age = 0;
      const T = G.THREE;
      // join this web to the nearest anchored web with a gluon thread
      let best = null, bd = Infinity;
      for (const o of this.nets) if (o !== n && o.state === 'anchored') { const d = o.pos.distanceTo(n.pos); if (d < bd) { bd = d; best = o; } }
      if (best) {
        const line = new T.Line(new T.BufferGeometry().setFromPoints([n.pos.clone(), best.pos.clone()]), this.linkMat);
        line.computeLineDistances(); this.game.scene.add(line);
        this.links.push({ a: n, b: best, line });
      }
      this.game._status('🕸️ Net anchored as a gluon web' + (best ? ', joined to the gluon network' : '') + ': caught ' + n.caught.length);
      this._panelUpdate();
    },
    _drop(n) {
      const sc = this.game.scene;
      sc.remove(n.mesh); sc.remove(n.trail); n.trail.geometry.dispose();
      this.links = this.links.filter(l => { if (l.a === n || l.b === n) { sc.remove(l.line); l.line.geometry.dispose(); return false; } return true; });
      this.nets.splice(this.nets.indexOf(n), 1);
    },
    damage(amount, why) {
      this.hull = Math.max(0, this.hull - amount); this.hits++;
      this.game._status('💥 ' + why + ': hull ' + this.hull + '%' + (this.hull <= 0 ? '. Ship wrecked! Net some metal and repair (U)' : ''));
      this._panelUpdate();
    },
    repair() {
      const missing = HULL.max - this.hull;
      if (missing <= 0) { this.game._status('✅ Hull is already perfect'); return 0; }
      if (Scrap.metalTotal <= 0) { this.game._status('❌ No metal atoms in the scrap hold. Net some metal scrap (iron, copper, aluminium…). Non-metals cannot fix a ship'); return 0; }
      const used = Scrap.useMetal(Math.ceil(missing / HULL.perMetal));
      this.hull = Math.min(HULL.max, this.hull + used * HULL.perMetal);
      this.game._status('🔧 Welded with ' + used + ' metal atom' + (used === 1 ? '' : 's') + ': hull ' + this.hull + '%');
      this._panelUpdate();
      return used;
    },
    _debris(dt) {
      this.debrisTimer -= dt; if (this.debrisTimer > 0) return;
      this.debrisTimer = DEBRIS.every * (0.6 + Math.random() * 0.8);
      const W = G.World, V = G.V, ship = this.game.ship.position, R = (G.C && G.C.ARENA_RADIUS) || 90;
      const sym = DEBRIS.symbols[Math.floor(Math.random() * DEBRIS.symbols.length)];
      const a = Math.random() * Math.PI * 2, from = { x: ship.x + Math.cos(a) * 40, y: ship.y + (Math.random() - 0.5) * 20, z: ship.z - 30 - Math.random() * 20 };
      from.x = Math.max(-R, Math.min(R, from.x)); from.z = Math.max(-R, Math.min(R, from.z));
      const aim = Math.random() < DEBRIS.aimShare;
      const d = aim ? V.norm(V.sub(ship, from)) : V.randUnit();
      const atom = W.spawnAtom(sym, from, V.scale(d, DEBRIS.speed), 'scrap', 0);
      if (atom) { atom.debris = true; atom.noBondUntil = Infinity; }
    },
    tick(dt) {
      if (!this.ready) return;
      this._debris(dt);
      for (const n of [...this.nets]) {
        n.age += dt;
        if (n.state === 'flying') {
          const steps = 8, step = n.speed * dt / steps;
          for (let s = 0; s < steps; s++) { n.pos.addScaledVector(n.dir, step); n.r = Math.min(NET.maxRadius, n.r + NET.maxRadius * dt * 3 / steps); this._sweep(n); }
          n.trail.geometry.setFromPoints([n.pos.clone().addScaledVector(n.dir, -Math.min(14, n.pos.distanceTo(n.from))), n.pos.clone()]);
          if (n.pos.distanceTo(n.from) > NET.range || n.pos.length() > ((G.C && G.C.ARENA_RADIUS) || 90)) this._anchor(n);
        } else {
          n.trail.visible = false;
          this._sweep(n);
          n.mesh.rotation.z += dt * 0.6;
          if (n.age > NET.anchorTime) { this._drop(n); continue; }
        }
        n.mesh.position.copy(n.pos); n.mesh.scale.setScalar(n.r);
      }
      for (const l of this.links) { const w = Math.sin(performance.now() * 0.004) * 0.08; l.line.material.opacity = 0.4 + w; }
      // damage look: red glow and smoke
      const dmg = 1 - this.hull / HULL.max;
      if (this.hullMat) this.hullMat.emissive.setRGB(dmg * 0.9, 0.25 * (1 - dmg) + 0.02, 0.06 * (1 - dmg));
      if (dmg > 0.3 && Math.random() < dmg * 0.5 && this.smoke.length < 200) { const p = this.game.ship.position; this.smoke.push({ x: p.x + (Math.random() - 0.5), y: p.y + 0.3, z: p.z + 1, t: 0 }); }
      const T = G.THREE, m = new T.Matrix4(); let k = 0;
      for (let i = this.smoke.length - 1; i >= 0; i--) { const s = this.smoke[i]; s.t += dt; s.y += dt * 1.2; if (s.t > 1.4) { this.smoke.splice(i, 1); continue; } const z = 0.2 + s.t * 0.5; m.makeScale(z, z, z); m.setPosition(s.x, s.y, s.z); this.smokeMesh.setMatrixAt(k++, m); }
      this.smokeMesh.count = k; this.smokeMesh.instanceMatrix.needsUpdate = true;
      this._pt = (this._pt || 0) + dt; if (this._pt > 0.25) { this._pt = 0; this._panelUpdate(); }
    },
    _panel() {
      const el = document.createElement('div');
      el.id = 's3g-hull-panel';
      el.style.cssText = 'position:fixed;right:10px;top:84px;z-index:30;background:rgba(0,12,4,0.85);border:1px solid #00ff41;border-radius:8px;padding:6px 8px;font:11px monospace;color:#cfe;width:200px;pointer-events:auto';
      el.innerHTML = '<div style="color:#00ff41;font-weight:bold">🛠️ HULL and SCRAP HOLD</div>'
        + '<div style="margin:4px 0;background:#222;height:8px;border-radius:4px;overflow:hidden"><div class="hb" style="height:100%;width:100%;background:#00ff41"></div></div>'
        + '<div class="ht"></div><div class="hm" style="color:#c0c8d8"></div><div class="hn" style="color:#66ff99"></div><div class="ho" style="color:#ffcc66"></div>'
        + '<button class="hr" style="margin-top:5px;width:100%;background:#0a3d1a;color:#00ff41;border:1px solid #00ff41;border-radius:5px;padding:3px;cursor:pointer;font:bold 11px monospace">🔧 Repair with metal (U)</button>'
        + '<div style="color:#888;margin-top:3px">🕸️ Net gun: key N. Only metal atoms fix the ship.</div>';
      el.querySelector('.hr').addEventListener('click', (e) => { e.stopPropagation(); this.repair(); });
      ['pointerdown', 'mousedown'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
      document.body.appendChild(el); this.panel = el; this._panelUpdate();
    },
    _panelUpdate() {
      const el = this.panel; if (!el) return;
      const hb = el.querySelector('.hb'), dmg = HULL.max - this.hull;
      hb.style.width = this.hull + '%'; hb.style.background = this.hull < 30 ? '#ff3333' : this.hull < 65 ? '#ffaa00' : '#00ff41';
      el.querySelector('.ht').textContent = 'Hull ' + this.hull + '%' + (dmg ? ' (damage ' + dmg + '%)' : '');
      const list = o => Object.keys(o).map(s => s + '×' + o[s]).join(' ');
      el.querySelector('.hm').textContent = '🔩 Metal atoms: ' + Scrap.metalTotal + (Scrap.metalTotal ? ' (' + list(Scrap.metal) + ')' : '');
      el.querySelector('.hn').textContent = '🧪 Non-metal scrap: ' + Scrap.nonMetalTotal + ' (cannot repair)';
      el.querySelector('.ho').textContent = '〰 Other scrap: ' + Scrap.other;
      const b = el.querySelector('.hr'); b.disabled = !(dmg > 0 && Scrap.metalTotal > 0); b.style.opacity = b.disabled ? 0.5 : 1;
    }
  };
  G.ScrapNet = Net;

  function hook() {
    if (!G.GunRack || !G.Game || !G.Game.ship || !G.World) return setTimeout(hook, 200);
    Net.init(G.Game);
    const fire = G.GunRack.fire, tick = G.GunRack.tick;
    G.GunRack.fire = function (game) { if (game.gun === 'net') return Net.fire(game); return fire.call(this, game); };
    G.GunRack.tick = function (game, dt) { tick.call(this, game, dt); Net.tick(dt); };
  }
  hook();
})();
