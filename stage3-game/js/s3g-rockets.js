/* CHEMVENTUR Stage 3 — ROCKET DEPLOY POINTS (v120 addition)
   Every gun shot now leaves from a real launch point on the ship, like a rocket:
   alternating left / right wing hardpoints (the nose tube for musical c2c dots stays as it was).
   A shot starts slow, burns its engine for a moment (accelerates to full speed) and leaves an exhaust trail.
   Only additions: nothing else in the game changes. Tune in ROCKET. */
(function () {
  const CV = window.CHEMVENTUR = window.CHEMVENTUR || {};
  const G = CV.Stage3Game = CV.Stage3Game || {};

  const ROCKET = {
    hardpoints: [ { x: -1.9, y: -0.2, z: 0.4 }, { x: 1.9, y: -0.2, z: 0.4 } ],   // wing tips, ship body frame
    startSpeed: 0.3,      // share of full speed at launch
    burn: 0.28,           // seconds of engine burn until full speed
    exhaustLife: 0.45,    // seconds an exhaust puff lives
    skip: { dot: true }   // c2c musical dots keep the nose tube
  };
  let side = 0;
  const puffs = [];
  let puffMesh = null;

  function hardpoint(game) {
    const T = G.THREE, hp = ROCKET.hardpoints[side++ % ROCKET.hardpoints.length];
    return game.ship.localToWorld(new T.Vector3(hp.x, hp.y, hp.z));
  }

  const Rockets = {
    ROCKET, puffs,
    launched: 0,
    init(game) {
      if (this.ready || !G.World || !game || !game.ship) return;
      this.ready = true; this.game = game;
      const T = G.THREE;
      const CAP = 400;
      puffMesh = new T.InstancedMesh(new T.SphereGeometry(1, 6, 4), new T.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.7 }), CAP);
      puffMesh.count = 0; puffMesh.frustumCulled = false;
      game.scene.add(puffMesh);
      G.World.on((type, p) => { if (type === 'projAdded') this.deploy(p); });
    },
    deploy(p) {
      if (!p || ROCKET.skip[p.kind] || !this.game) return;
      if (!p.rocketPending) {
      const pt = hardpoint(this.game);
      p.pos.x = pt.x; p.pos.y = pt.y; p.pos.z = pt.z;
      if (!p.vel) { p.rocketPending = true; return; }   // shotgun pellets get their velocity a moment later
      }
      const sv = this.game.shipVel || { x: 0, y: 0, z: 0 };
      p.rocket = { full: { x: p.vel.x - sv.x, y: p.vel.y - sv.y, z: p.vel.z - sv.z }, ship: { x: sv.x, y: sv.y, z: sv.z }, t: 0 };
      const k = ROCKET.startSpeed;
      p.vel = { x: p.rocket.ship.x + p.rocket.full.x * k, y: p.rocket.ship.y + p.rocket.full.y * k, z: p.rocket.ship.z + p.rocket.full.z * k };
      this.launched++;
    },
    tick(dt) {
      const W = G.World; if (!W || !puffMesh) return;
      for (const p of W.projectiles) {
        if (p.rocketPending && p.vel) { p.rocketPending = false; this.deploy(p); }
        const r = p.rocket; if (!r || r.t >= ROCKET.burn) continue;
        if (!p.vel) continue;   // another gun may have replaced the velocity object
        r.t += dt;
        const f = Math.min(1, ROCKET.startSpeed + (1 - ROCKET.startSpeed) * (r.t / ROCKET.burn));
        p.vel = { x: r.ship.x + r.full.x * f, y: r.ship.y + r.full.y * f, z: r.ship.z + r.full.z * f };
        if (puffs.length < 400) puffs.push({ x: p.pos.x, y: p.pos.y, z: p.pos.z, t: 0 });
      }
      const T = G.THREE, m = new T.Matrix4();
      let n = 0;
      for (let i = puffs.length - 1; i >= 0; i--) {
        const q = puffs[i]; q.t += dt;
        if (q.t > ROCKET.exhaustLife) { puffs.splice(i, 1); continue; }
        const s = 0.12 + q.t * 0.6;
        m.makeScale(s, s, s); m.setPosition(q.x, q.y, q.z);
        puffMesh.setMatrixAt(n++, m);
      }
      puffMesh.count = n; puffMesh.instanceMatrix.needsUpdate = true;
    }
  };
  G.Rockets = Rockets;

  // hook in once the gun rack and the game exist (wrapping only, no edits to other files)
  function hook() {
    if (!G.GunRack || !G.Game || !G.Game.ship) return setTimeout(hook, 200);
    Rockets.init(G.Game);
    const orig = G.GunRack.tick;
    G.GunRack.tick = function (game, dt) { orig.call(this, game, dt); Rockets.tick(dt); };
  }
  hook();
})();
