/* CHEMVENTUR Stage 3 — gun rack brought over from the 2D guns.
   Tune the numbers in TUNE. Keys: 1 p+ 2 n 3 e- 4 rain 5 atom 6 shot 7 c2c 8 anti 9 grav 0 time.
   c2c stays the musical scale gun. Atom gun stays key 5 (Z/X or wheel picks the element). */
(function () {
  const CV = window.CHEMVENTUR = window.CHEMVENTUR || {};
  const G = CV.Stage3Game = CV.Stage3Game || {};

  const TUNE = {
    proton:  { speed: 18, life: 1.4, cooldown: 0.16, energy: 0.55, color: '#ff3344' },
    neutron: { speed: 16, life: 1.6, cooldown: 0.16, energy: 0.35, color: '#d8d8d8' },
    electron:{ speed: 22, life: 1.2, cooldown: 0.1,  energy: 0.7,  color: '#44aaff', spiral: 0.8 },
    rain:    { interval: 0.45, symbols: ['H', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Na'] },
    shotgun: { pellets: 6, spread: 0.35, speed: 16, cooldown: 0.28, symbols: ['H', 'C', 'N', 'O'] },
    anti:    { speed: 20, life: 1.3, cooldown: 0.2, mode: 'antimatter', color: '#ff44ff' },
    grav:    { speed: 10, life: 6, radius: 8, strength: 18, cooldown: 0.4, repel: false, color: '#aa66ff' },
    time:    { speed: 12, life: 7, radius: 7, scale: 0.25, cooldown: 0.5, color: '#44ffcc' }
  };

  function noseDir(game) {
    const nose = game._nose();
    const dir = game._aimDir();
    const sv = game.shipVel || { x: 0, y: 0, z: 0 };
    return { nose, dir, sv };
  }
  function shot(game, kind, extra) {
    const W = G.World, V = G.V, t = TUNE[kind] || {};
    const { nose, dir, sv } = noseDir(game);
    const speed = extra && extra.speed || t.speed || 16;
    const vel = V.add(V.scale(dir, speed), sv);
    return W.addProjectile(Object.assign({
      kind, pos: { x: nose.x, y: nose.y, z: nose.z }, vel, life: t.life || 1.4, r: 0.2, color: t.color || '#fff'
    }, extra || {}));
  }

  const Rack = {
    TUNE,
    fire(game) {
      const id = game.gun;
      if (id === 'proton' || id === 'neutron' || id === 'electron' || id === 'anti') {
        if (game.fireCooldown > 0) return true;
        shot(game, id);
        game.fireCooldown = TUNE[id].cooldown;
        return true;
      }
      if (id === 'shotgun') {
        if (game.fireCooldown > 0) return true;
        const V = G.V;
        const { dir } = noseDir(game);
        for (let i = 0; i < TUNE.shotgun.pellets; i++) {
          const j = V.add(dir, { x: (Math.random() - 0.5) * TUNE.shotgun.spread, y: (Math.random() - 0.5) * TUNE.shotgun.spread, z: (Math.random() - 0.5) * TUNE.shotgun.spread });
          const sym = TUNE.shotgun.symbols[i % TUNE.shotgun.symbols.length];
          shot(game, 'pellet', { speed: TUNE.shotgun.speed, symbol: sym, color: '#ffe16a', vel: null });
          const p = G.World.projectiles[G.World.projectiles.length - 1];
          if (p) p.vel = V.add(V.scale(V.norm(j), TUNE.shotgun.speed), game.shipVel);
        }
        game.fireCooldown = TUNE.shotgun.cooldown;
        return true;
      }
      if (id === 'grav') {
        if (game.fireCooldown > 0) return true;
        shot(game, 'grav', { r: 0.45, life: TUNE.grav.life });
        game.fireCooldown = TUNE.grav.cooldown;
        game._status(TUNE.grav.repel ? '🔮 gravity orb: push' : '🔮 gravity orb: pull');
        return true;
      }
      if (id === 'time') {
        if (game.fireCooldown > 0) return true;
        shot(game, 'time', { r: 0.4, life: TUNE.time.life });
        game.fireCooldown = TUNE.time.cooldown;
        game._status('⏰ time bubble ×' + TUNE.time.scale);
        return true;
      }
      if (id === 'rain') {
        game.rainOn = !game.rainOn;
        game._status(game.rainOn ? '🌧️ molecule rain ON' : '🌧️ molecule rain OFF');
        return true;
      }
      return false;
    },
    apply(world, p, atom) {
      const V = G.V;
      if (p.kind === 'proton' || p.kind === 'neutron' || p.kind === 'electron' || p.kind === 'pellet') {
        atom.energy = Math.min(2.4, atom.energy + (TUNE[p.kind] && TUNE[p.kind].energy || 0.4));
        atom.flash = { color: p.color, t: 0.45 };
        V.addTo(atom.vel, V.norm(p.vel), p.kind === 'electron' ? 2.4 : 1.2);
        if (p.kind === 'proton' && atom.symbol === 'H') atom.energy += 0.2;
        return;
      }
      if (p.kind === 'anti') {
        if (TUNE.anti.mode === 'antimatter' && atom.bonds.length) world.breakBond(atom.bonds[atom.bonds.length - 1]);
        atom.energy = Math.min(2.4, atom.energy + 0.8);
        atom.flash = { color: '#ff44ff', t: 0.7 };
        V.addTo(atom.vel, V.randUnit(), 5);
        return;
      }
    },
    tick(game, dt) {
      const W = G.World, V = G.V;
      if (!W) return;
      for (const p of W.projectiles) {
        if (p.kind === 'electron') {
          p.spin = (p.spin || 0) + dt * 9;
          const side = { x: -p.vel.z, y: 0, z: p.vel.x };
          V.addTo(p.pos, V.norm(side), Math.sin(p.spin) * TUNE.electron.spiral * dt);
        }
        if (p.kind === 'grav' || p.kind === 'time') {
          const rad = p.kind === 'grav' ? TUNE.grav.radius : TUNE.time.radius;
          const pull = p.kind === 'grav' ? (TUNE.grav.repel ? -TUNE.grav.strength : TUNE.grav.strength) : 0;
          for (const a of W.atoms) {
            const d = V.dist(a.pos, p.pos);
            if (d > rad || d < 0.05) continue;
            if (p.kind === 'grav') V.addTo(a.vel, V.norm(V.sub(p.pos, a.pos)), pull * dt / d);
            else a.vel = V.scale(a.vel, Math.pow(TUNE.time.scale, dt));
          }
        }
      }
    }
  };
  G.GunRack = Rack;
})();
