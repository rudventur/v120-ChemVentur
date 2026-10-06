/* ============================================
   🚀 CHEMVENTUR STAGE 3 GAME - 3D GAME (three.js renderer, ship, guns, HUD)
   ============================================
   Public:  CHEMVENTUR.Stage3Game.boot(container) -> Promise
            .pause() / .resume() / .destroy()
            .identify()            "What did I build?"
            .fireC2C()             c2c tone gun series
            .debug                 test hooks (see README-STAGE3-GAME.md)
   three.js is loaded with dynamic import() from a pinned CDN URL.
   ============================================ */

(function () {
  'use strict';
  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});
  const V = G.V, C = G.Config, W = G.World, A = G.Audio, El = G.Elements;

  let THREE = null;

  async function loadThree() {
    if (THREE) return THREE;
    let lastErr = null;
    for (const url of C.THREE_URLS) {
      try { THREE = await import(url); G.threeUrl = url; G.THREE = THREE; return THREE; } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('three.js failed to load');
  }

  // ---------- small DOM helper (textContent only) ----------
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'className') n.className = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    (kids || []).forEach(c => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }

  const GUNS = [
    // key 5 is kept free for the planned "shotgun5"; the rain "gun" only toggles rain, so it lives on M
    { id: 'proton', key: '1', label: 'p⁺ SHOT' },     // shotgun1proton (s3g-pne.js)
    { id: 'neutron', key: '2', label: 'n SHOT' },     // SHOTGUN2neutron (s3g-pne.js)
    { id: 'electron', key: '3', label: '⚡ ELECTRO' },  // Electrogun (s3g-pne.js)
    { id: 'c2c', key: '4', label: 'c2c' },
    { id: 'atom', key: '6', label: 'ATOM' },
    { id: 'shotgun', key: '7', label: 'SHOT' },
    { id: 'rain', key: 'M', label: 'RAIN' },
    { id: 'anti', key: '8', label: 'ANTI' },
    { id: 'grav', key: '9', label: 'GRAV' },
    { id: 'time', key: '0', label: 'TIME' }
  ];

  const TARGETS = [
    { name: 'Hydrogen', formula: 'H2' },
    { name: 'Water', formula: 'H2O' },
    { name: 'Methane', formula: 'CH4' },
    { name: 'Ammonia', formula: 'H3N' },
    { name: 'Hydrogen chloride', formula: 'ClH' },
    { name: 'Carbon dioxide', formula: 'CO2' },
    { name: 'Hydrogen peroxide', formula: 'H2O2' },
    { name: 'Ethanol', formula: 'C2H6O' }
  ];

  const RAIN = ['water', 'methane', 'ammonia', 'carbon dioxide', 'methanol', 'ethanol', 'formaldehyde', 'acetylene', 'hydrogen cyanide', 'benzene'];

  const Game = {
    booted: false, paused: false, started: false,
    container: null, renderer: null, scene: null, camera: null,
    ship: null, shipVel: null, yaw: 0, pitch: 0,
    keys: new Set(),
    mouse: { x: 0, y: 0, ndcX: 0, ndcY: 0, has: false, fireHeld: false, steer: false, lastX: 0, lastY: 0 },
    touch: { joy: null, steer: null, fire: false },
    gun: 'atom', elementIdx: 1, c2cMode: 'chromatic', slow: 0,
    seq: null, seqId: 0, seqWaiters: [], sequences: [],
    fireCooldown: 0, score: 0, targetIdx: 0, targetTimer: 0,
    rainOn: true, rainTimer: 2, rainBusy: false,
    last: 0, fps: 0, fpsAcc: 0, fpsFrames: 0, hudTimer: 0,
    meshes: new Map(),
    lastIdentify: null,
    _raf: 0,

    // ================= BOOT =================
    async boot(container, opts) {
      if (this.booted) return this;
      opts = opts || {};
      this.container = container || document.body;
      this.container.classList.add('s3g-root');
      this._buildHud();
      this._status('Loading three.js…');
      try {
        await loadThree();
      } catch (e) {
        this._status('❌ three.js could not load (offline / CDN blocked): ' + e.message, 'error');
        throw e;
      }
      this._initScene();
      this._bindWorld();
      if (G.Discovery) G.Discovery.attach(this);
      if (G.Bots) G.Bots.attach(this);
      if (G.PNE) G.PNE.attach(this);
      if (G.Grid) G.Grid.attach(this);
      this._bindInput();
      this._spawnStartAtoms();
      this.booted = true;
      this.last = performance.now();
      const loop = (t) => { this._raf = requestAnimationFrame(loop); this._frame(t); };
      this._raf = requestAnimationFrame(loop);
      this._status('Ready. Press ▶ START (or click) to unlock sound.');
      if (opts.autostart) this.start();
      return this;
    },

    start() {
      this.started = true;
      A.unlock();
      if (this.hud) this.hud.startOverlay.hidden = true;
      this._status('🚀 Go! 1 p⁺ shotgun 2 n shotgun 3 ⚡ electro 4 c2c 6 ATOM 7 SHOT 8 ANTI 9 GRAV 0 TIME · B = identify · G = grid');
    },

    pause() { this.paused = true; },
    resume() { this.paused = false; this.last = performance.now(); },

    destroy() {
      cancelAnimationFrame(this._raf);
      if (G.Bots) G.Bots.removeAll();
      W.reset();
      if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
      if (this.hud) this.hud.root.remove();
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('resize', this._onResize);
      this.booted = false;
    },

    // ================= SCENE =================
    _initScene() {
      const T = THREE;
      const r = new T.WebGLRenderer({ antialias: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setClearColor(0x000a03, 1);
      this.renderer = r;
      r.domElement.className = 's3g-canvas';
      this.container.insertBefore(r.domElement, this.container.firstChild);

      const scene = new T.Scene();
      scene.fog = new T.FogExp2(0x000a03, 0.0065);
      this.scene = scene;
      this.camera = new T.PerspectiveCamera(70, 1, 0.1, 1200);

      scene.add(new T.AmbientLight(0x88ffaa, 0.55));
      const sun = new T.DirectionalLight(0xffffff, 1.2);
      sun.position.set(40, 80, 30);
      scene.add(sun);
      this.shipLight = new T.PointLight(0x00ff41, 30, 40, 1.6);
      scene.add(this.shipLight);

      // stars
      const n = 1600, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = V.randUnit(), d = 260 + Math.random() * 200;
        pos[i * 3] = u.x * d; pos[i * 3 + 1] = u.y * d; pos[i * 3 + 2] = u.z * d;
      }
      const sg = new T.BufferGeometry();
      sg.setAttribute('position', new T.BufferAttribute(pos, 3));
      scene.add(new T.Points(sg, new T.PointsMaterial({ color: 0x9bffb5, size: 1.4, sizeAttenuation: true, fog: false })));

      // arena boundary + neon grid
      const R = C.ARENA_RADIUS;
      const wire = new T.LineSegments(new T.WireframeGeometry(new T.IcosahedronGeometry(R, 2)),
        new T.LineBasicMaterial({ color: 0x00ff41, transparent: true, opacity: 0.12 }));
      scene.add(wire);
      const grid = new T.GridHelper(R * 2, 36, 0x00ff41, 0x004d14);
      grid.position.y = -R * 0.75;
      grid.material.transparent = true; grid.material.opacity = 0.35;
      scene.add(grid);

      // shared geometries
      this.geo = {
        sphere: new T.SphereGeometry(1, 22, 16),
        lowSphere: new T.SphereGeometry(1, 12, 8),
        cyl: new T.CylinderGeometry(1, 1, 1, 10, 1)
      };
      this.bondMats = {
        1: new T.MeshStandardMaterial({ color: 0x00ff41, emissive: 0x00ff41, emissiveIntensity: 0.5, roughness: 0.4 }),
        2: new T.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.5, roughness: 0.4 }),
        3: new T.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.5, roughness: 0.4 })
      };

      // ship
      const ship = new T.Group();
      const hullMat = new T.MeshStandardMaterial({ color: 0x0a3d1a, emissive: 0x00ff41, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.35 });
      const hullGeo = new T.ConeGeometry(0.95, 3.4, 4);
      hullGeo.rotateX(-Math.PI / 2);         // tip points to -Z (forward)
      const hull = new T.Mesh(hullGeo, hullMat);
      ship.add(hull);
      ship.add(new T.LineSegments(new T.EdgesGeometry(hullGeo), new T.LineBasicMaterial({ color: 0x00ff41 })));
      const wingGeo = new T.BoxGeometry(4.2, 0.12, 1.1);
      const wing = new T.Mesh(wingGeo, hullMat);
      wing.position.set(0, -0.15, 0.7);
      ship.add(wing);
      const wingEdges = new T.LineSegments(new T.EdgesGeometry(wingGeo), new T.LineBasicMaterial({ color: 0x00ffff }));
      wingEdges.position.copy(wing.position);
      ship.add(wingEdges);
      const engine = new T.Mesh(this.geo.lowSphere, new T.MeshBasicMaterial({ color: 0x00ffff }));
      engine.scale.setScalar(0.38);
      engine.position.set(0, 0, 1.75);
      ship.add(engine);
      this.engine = engine;
      ship.position.set(0, 0, 45);
      scene.add(ship);
      this.ship = ship;
      this.shipVel = new T.Vector3();
      this.raycaster = new T.Raycaster();

      this.camera.position.set(0, 3, 56);
      this._onResize = () => this._resize();
      window.addEventListener('resize', this._onResize);
      this._resize();
    },

    _resize() {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.renderer.domElement.style.width = w + 'px';
      this.renderer.domElement.style.height = h + 'px';
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    },

    // ================= WORLD <-> MESHES =================
    _bindWorld() {
      const T = THREE;
      W.on((type, d) => {
        if (type === 'atomAdded') {
          const m = new T.Mesh(this.geo.sphere, new T.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.12, roughness: 0.35, metalness: 0.05 }));
          m.scale.setScalar(d.r);
          d.mesh = m;
          this.scene.add(m);
        } else if (type === 'atomRemoved') {
          if (d.mesh) { this.scene.remove(d.mesh); d.mesh.material.dispose(); d.mesh = null; }
        } else if (type === 'bondAdded' || type === 'bondChanged') {
          if (!d.mesh) { d.mesh = new T.Mesh(this.geo.cyl, this.bondMats[d.order]); this.scene.add(d.mesh); }
          d.mesh.material = this.bondMats[d.order];
          if (type === 'bondAdded' && this.started) A.blip(660 + 110 * d.order, 0.06, 'sine', 0.12);
        } else if (type === 'bondRemoved') {
          if (d.mesh) { this.scene.remove(d.mesh); d.mesh = null; }
        } else if (type === 'projAdded') {
          const color = new T.Color(d.color);
          const m = new T.Mesh(this.geo.lowSphere, new T.MeshBasicMaterial({ color }));
          m.scale.setScalar(d.r);
          if (d.kind === 'dot') {
            const halo = new T.Mesh(this.geo.lowSphere, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: T.AdditiveBlending, depthWrite: false }));
            halo.scale.setScalar(2.1);
            m.add(halo);
          } else {
            m.scale.set(d.r, d.r, d.r * 3.5);
          }
          m.position.set(d.pos.x, d.pos.y, d.pos.z);
          if (d.kind !== 'dot') m.lookAt(d.pos.x + d.vel.x, d.pos.y + d.vel.y, d.pos.z + d.vel.z);
          d.mesh = m;
          this.scene.add(m);
        } else if (type === 'projRemoved') {
          if (d.mesh) { this.scene.remove(d.mesh); d.mesh.traverse(o => o.material && o.material.dispose()); d.mesh = null; }
        } else if (type === 'collect') {
          if (this.started) A.blip(1320, 0.05, 'square', 0.06);
          this.score += 1;
        }
      });
    },

    _syncMeshes() {
      const T = THREE;
      const up = this._up || (this._up = new T.Vector3(0, 1, 0));
      const dir = this._dir || (this._dir = new T.Vector3());
      const tmpC = this._tmpC || (this._tmpC = new T.Color());
      for (const a of W.atoms) {
        const m = a.mesh; if (!m) continue;
        m.position.set(a.pos.x, a.pos.y, a.pos.z);
        if (a.flash) { m.material.emissive.set(a.flash.color); m.material.emissiveIntensity = 0.5 + a.flash.t; }
        else { m.material.emissive.copy(tmpC.set(a.color)); m.material.emissiveIntensity = 0.12 + Math.min(1, a.energy) * 0.6; }
      }
      for (const b of W.bonds) {
        const m = b.mesh; if (!m) continue;
        dir.set(b.b.pos.x - b.a.pos.x, b.b.pos.y - b.a.pos.y, b.b.pos.z - b.a.pos.z);
        const L = dir.length() || 0.001;
        m.position.set((b.a.pos.x + b.b.pos.x) / 2, (b.a.pos.y + b.b.pos.y) / 2, (b.a.pos.z + b.b.pos.z) / 2);
        m.quaternion.setFromUnitVectors(up, dir.multiplyScalar(1 / L));
        const rad = 0.16 + 0.08 * (b.order - 1);
        m.scale.set(rad, L, rad);
      }
      for (const p of W.projectiles) if (p.mesh) p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
    },

    _spawnStartAtoms() {
      const pick = () => {
        const r = Math.random();
        return r < 0.45 ? 'H' : r < 0.65 ? 'C' : r < 0.8 ? 'O' : r < 0.9 ? 'N' : ['Cl', 'S', 'P', 'F'][Math.floor(Math.random() * 4)];
      };
      for (let i = 0; i < C.START_ATOMS; i++) {
        const p = V.scale(V.randUnit(), 15 + Math.random() * (C.ARENA_RADIUS * 0.75));
        W.spawnAtom(pick(), p, V.scale(V.randUnit(), Math.random() * 2), 'world');
      }
    },

    // ================= SHIP / AIM =================
    _forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.ship.quaternion); },
    _nose() { return this.ship.position.clone().add(this._forward().multiplyScalar(2.2)); },

    _aimDir() {
      const nose = this._nose();
      if (this.mouse.has && !this.touchMode) {
        this.raycaster.setFromCamera({ x: this.mouse.ndcX, y: this.mouse.ndcY }, this.camera);
        const target = this.raycaster.ray.origin.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(70));
        const d = target.sub(nose).normalize();
        if (d.dot(this._forward()) > 0.2) return d;    // never shoot backwards into the camera
      }
      return this._forward();
    },

    _updateShip(dt) {
      const k = this.keys;
      const turn = C.SHIP_TURN * dt;
      if (k.has('ArrowLeft')) this.yaw += turn;
      if (k.has('ArrowRight')) this.yaw -= turn;
      if (k.has('ArrowUp')) this.pitch += turn;
      if (k.has('ArrowDown')) this.pitch -= turn;
      if (this.touch.steer) { this.yaw -= this.touch.steer.dx * 0.004; this.pitch -= this.touch.steer.dy * 0.004; this.touch.steer.dx = this.touch.steer.dy = 0; }
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
      this.ship.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

      const local = new THREE.Vector3(
        (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
        (k.has('KeyR') ? 1 : 0) - (k.has('KeyF') ? 1 : 0),
        (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0)
      );
      if (this.touch.joy) { local.x += this.touch.joy.x; local.z += this.touch.joy.y; }
      if (local.lengthSq() > 1) local.normalize();
      this.shipVel.add(local.applyQuaternion(this.ship.quaternion).multiplyScalar(C.SHIP_ACCEL * dt));
      this.shipVel.multiplyScalar(Math.exp(-1.1 * dt));
      if (this.shipVel.length() > C.SHIP_MAX_SPEED) this.shipVel.setLength(C.SHIP_MAX_SPEED);
      this.ship.position.addScaledVector(this.shipVel, dt);
      const R = C.ARENA_RADIUS * 0.97;
      if (this.ship.position.length() > R) { this.ship.position.setLength(R); this.shipVel.multiplyScalar(-0.3); }

      const thrusting = local.lengthSq() > 0.01;
      this.engine.scale.setScalar(thrusting ? 0.5 + Math.random() * 0.15 : 0.32);
      this.shipLight.position.copy(this.ship.position);

      // chase camera
      const off = new THREE.Vector3(0, 2.8, 9.5).applyQuaternion(this.ship.quaternion);
      const want = this.ship.position.clone().add(off);
      this.camera.position.lerp(want, 1 - Math.exp(-dt * 7));
      this.camera.lookAt(this.ship.position.clone().add(this._forward().multiplyScalar(10)));
    },

    // ================= GUNS =================
    selectGun(id) {
      if (!GUNS.find(g => g.id === id)) return;
      this.gun = id;
      this._hudNow();
    },

    toggleC2CMode() {
      this.c2cMode = this.c2cMode === 'chromatic' ? 'major' : 'chromatic';
      this._status('🎵 ' + G.C2C.MODES[this.c2cMode].label + (this.c2cMode === 'chromatic' ? ': 13 shots C→C (chromatic)' : ': 8 shots C→C (major)'));
      this._hudNow();
    },

    cycleElement(d) {
      const n = C.PALETTE.length;
      this.elementIdx = (this.elementIdx + d + n) % n;
      this._hudNow();
    },

    _trigger() {
      if (this.gun === 'c2c') { this.fireC2C(); return; }
      if (G.PNE && G.PNE.fire(this)) return;
      if (G.GunRack && G.GunRack.fire(this)) return;
      if (this.fireCooldown > 0) return;
      const nose = this._nose(), dir = this._aimDir();
      const sv = { x: this.shipVel.x, y: this.shipVel.y, z: this.shipVel.z };
      if (this.gun === 'atom') {
        const sym = C.PALETTE[this.elementIdx];
        const vel = V.add(V.scale(dir, C.ATOM_SPEED), sv);
        const a = W.spawnAtom(sym, nose.clone().addScaledVector(dir, 1.2), vel, 'player', 1);
        if (!a) this._status('⚠️ Atom limit reached (' + C.MAX_ATOMS + '). Blast or collect some!', 'warn');
        else if (this.started) A.blip(320, 0.07, 'sawtooth', 0.08);
        this.fireCooldown = 0.18;
      }
    },

    // c2c TONE GUN: a SERIES of dots, each its own note/colour/size, in sequence like an ascending scale.
    // Resolves (after the last dot) with the full sequence record.
    fireC2C(mode) {
      if (mode && G.C2C.MODES[mode]) this.c2cMode = mode;
      if (this.seq) return null; // one series at a time
      const shots = G.C2C.series(this.c2cMode);
      const seq = { id: ++this.seqId, mode: this.c2cMode, label: G.C2C.MODES[this.c2cMode].label, shots, next: 0, t: 0, fired: [], done: false };
      this.seq = seq;
      this._status('🎵 ' + seq.label + ' firing…');
      W.emit('c2cFired', seq);
      return new Promise(resolve => { seq.resolve = resolve; });
    },

    _updateSeq(dt) {
      const seq = this.seq;
      if (!seq) return;
      seq.t += dt;
      while (seq.next < seq.shots.length && seq.t >= seq.next * C.C2C_INTERVAL) {
        const shot = seq.shots[seq.next];
        const nose = this._nose(), dir = this._aimDir();
        const vel = V.add(V.scale(dir, C.DOT_SPEED), { x: this.shipVel.x, y: this.shipVel.y, z: this.shipVel.z });
        const p = W.addProjectile({ kind: 'dot', pos: { x: nose.x, y: nose.y, z: nose.z }, vel, life: C.DOT_LIFE, r: shot.radius, color: shot.color, shot, seq: seq.id });
        const tone = A.playNote(shot, seq.id);
        seq.fired.push({ index: shot.index, note: shot.note, freq: shot.freq, oscFreq: tone.oscFreq, audioState: tone.ctxState,
          color: shot.color, radius: shot.radius, effect: shot.effect, projId: p.id, t: Math.round(seq.t * 1000) });
        seq.next++;
      }
      if (seq.next >= seq.shots.length) {
        seq.done = true;
        this.seq = null;
        this.sequences.push(seq);
        if (this.sequences.length > 20) this.sequences.shift();
        this._status('🎵 ' + seq.label + ': ' + seq.fired.map(f => f.note).join(' '));
        if (seq.resolve) seq.resolve(seq);
      }
    },

    // ================= WHAT DID I BUILD? =================
    _pickComponent() {
      const comps = W.components().filter(c => c.atoms.length >= 2);
      if (!comps.length) return null;
      const nose = this._nose(), dir = this._aimDir();
      let best = null, bestAng = 0.35;
      for (const c of comps) {
        for (const a of c.atoms) {
          const to = new THREE.Vector3(a.pos.x - nose.x, a.pos.y - nose.y, a.pos.z - nose.z);
          const d = to.length();
          if (d > 70) continue;
          const ang = to.angleTo(dir);
          if (ang < bestAng) { bestAng = ang; best = c; }
        }
      }
      if (best) return best;
      const mine = comps.filter(c => c.byPlayer).sort((x, y) => y.atoms.length - x.atoms.length);
      return mine[0] || comps.sort((x, y) => y.atoms.length - x.atoms.length)[0];
    },

    async identify(comp) {
      const S = CV.Stage3Chem;
      comp = comp || this._pickComponent();
      if (!comp) { this._status('🧪 Nothing bonded yet. Shoot atoms (gun 1) at each other to bond them!', 'warn'); return null; }
      comp.atoms.forEach(a => { a.flash = { color: '#ffffff', t: 0.8 }; });
      const explicit = W.formulaOf(comp);
      this._status('🧪 Identifying ' + explicit + ' (' + comp.atoms.length + ' atoms)…');
      const molblock = W.toMolblock(comp);
      const out = { atoms: comp.atoms.length, bonds: comp.bonds.length, explicitFormula: explicit, canonical: '', cid: null, title: '', formula: '', is3D: false, notes: [] };
      try {
        const rd = await S.RDKit.analyze(molblock);
        let cid = null;
        if (rd) {
          out.canonical = rd.canonical;
          out.rdkitFormula = rd.formula;
          const hExplicit = comp.atoms.filter(a => a.symbol === 'H').length;
          const m = /H(\d*)/.exec(rd.formula.replace(/^C\d*/, ''));
          const hTotal = rd.formula.indexOf('H') === -1 ? 0 : (m && m[1] ? parseInt(m[1], 10) : 1);
          if (hTotal > hExplicit) out.notes.push('RDKit filled in ' + (hTotal - hExplicit) + ' implicit H');
          cid = await S.PubChem.cidFromSmiles(rd.canonical);
        } else {
          out.notes.push('RDKit could not read it (odd valence?) or is unavailable: asked PubChem directly');
          cid = await S.PubChem.cidFromMolblock(molblock);
        }
        if (cid) {
          const rec = await S.lookup(String(cid), 'cid');
          out.cid = cid; out.title = rec.props.title; out.formula = rec.props.formula; out.is3D = rec.is3D;
          out.props = rec.props; out.sdf = rec.is3D ? rec.sdf : null;
          this.score += 5;
        } else {
          out.title = 'Unknown: not in PubChem';
          out.formula = rd ? rd.formula : explicit;
        }
      } catch (e) {
        out.error = e.message || String(e);
      }
      out.comp = comp;
      this.lastIdentify = out;
      this._showIdentify(out);
      this._status(out.error ? '❌ ' + out.error : '🧪 You built ' + out.title + (out.formula ? ' (' + out.formula + ')' : '') + '!', out.error ? 'error' : 'ok');
      W.emit('identified', out);
      return out;
    },

    // Replace the player's build with PubChem's real 3D conformer
    swapInConformer(rec) {
      rec = rec || this.lastIdentify;
      if (!rec || !rec.sdf || !rec.comp) return null;
      const parsed = G.parseMolblock(rec.sdf);
      if (!parsed) return null;
      const c = { x: 0, y: 0, z: 0 }, v = { x: 0, y: 0, z: 0 };
      rec.comp.atoms.forEach(a => { V.addTo(c, a.pos); V.addTo(v, a.vel); });
      const n = rec.comp.atoms.length;
      [...rec.comp.atoms].forEach(a => { if (W.atoms.indexOf(a) !== -1) W.removeAtom(a); });
      const mol = W.spawnMolecule(parsed, V.scale(c, 1 / n), 'pubchem', V.scale(v, 1 / n), true);
      if (mol) {
        mol.atoms.forEach(a => { a.flash = { color: '#00ffff', t: 1 }; });
        this._status('🔁 Swapped in the real PubChem 3D conformer of ' + rec.title + ' (' + mol.atoms.length + ' atoms)', 'ok');
        rec.comp = { atoms: mol.atoms, bonds: mol.bonds };
        rec.swapped = true;
        if (this.hud) this.hud.swapBtn.disabled = true;
      }
      return mol;
    },

    // ================= TARGETS / RAIN =================
    _checkTargets() {
      const t = TARGETS[this.targetIdx % TARGETS.length];
      const comp = W.components().find(c => c.byPlayer && c.atoms.length >= 2 && W.formulaOf(c) === t.formula);
      if (comp) {
        this.score += 10;
        comp.atoms.forEach(a => { a.flash = { color: '#00ff41', t: 1.2 }; });
        this._status('🎯 TARGET COMPLETE: ' + t.name + ' ' + t.formula + '! +10', 'ok');
        W.emit('targetDone', { name: t.name, formula: t.formula, atoms: comp.atoms });
        if (this.started) [523.25, 659.25, 783.99].forEach((f, i) => setTimeout(() => A.blip(f, 0.12, 'triangle', 0.15), i * 90));
        this.targetIdx++;
      }
    },

    async _rainOne() {
      if (this.rainBusy || W.atoms.length > C.MAX_ATOMS - 30) return;
      this.rainBusy = true;
      const R = C.ARENA_RADIUS;
      const at = { x: (Math.random() - 0.5) * R, y: R * 0.65, z: (Math.random() - 0.5) * R };
      const vel = { x: (Math.random() - 0.5) * 2, y: -3 - Math.random() * 2, z: (Math.random() - 0.5) * 2 };
      try {
        const name = RAIN[Math.floor(Math.random() * RAIN.length)];
        const rec = await CV.Stage3Chem.lookup(name, 'name');
        const parsed = rec && rec.is3D ? G.parseMolblock(rec.sdf) : null;
        if (parsed) W.spawnMolecule(parsed, at, 'rain', vel, false);
        else throw new Error('no 3D');
      } catch (e) {
        ['H', 'H', 'O'].forEach(s => W.spawnAtom(s, V.add(at, V.scale(V.randUnit(), 3)), vel, 'rain'));
      }
      this.rainBusy = false;
    },

    // ================= LOOP =================
    _frame(now) {
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0)) dt = 0.016;
      dt = Math.min(dt, 0.05);
      this.fpsAcc += dt; this.fpsFrames++;
      if (this.fpsAcc >= 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }

      if (!this.paused) {
        this._updateShip(dt);
        this.fireCooldown = Math.max(0, this.fireCooldown - dt);
        if ((this.mouse.fireHeld || this.keys.has('Space') || this.touch.fire) && this.gun !== 'c2c') this._trigger();
        this._updateSeq(dt);
        const sim = this.slow > 0 ? dt * 0.22 : dt;
        if (this.slow > 0) this.slow -= dt;
        if (G.GunRack) G.GunRack.tick(this, dt);
        if (G.PNE) G.PNE.tick(this, dt);
        if (G.Grid) G.Grid.tick(this, dt);
        W.step(sim, { shipPos: this.ship.position, shipRadius: 2.2 });
        if (G.Bots) G.Bots.update(dt);
        this.targetTimer -= dt;
        if (this.targetTimer <= 0) { this.targetTimer = 0.5; this._checkTargets(); }
        if (this.rainOn) { this.rainTimer -= dt; if (this.rainTimer <= 0) { this.rainTimer = C.RAIN_INTERVAL; this._rainOne(); } }
      }
      if (G.Discovery) G.Discovery.update(dt);   // FIRST DISCOVERY banner timing (real time)
      this._syncMeshes();
      if (G.Grid) G.Grid.render(this);           // charge markers / glow, temperature + pressure layers
      this.renderer.render(this.scene, this.camera);
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) { this.hudTimer = 0.1; this._hudNow(); }
    },

    // ================= INPUT =================
    _bindInput() {
      const cvs = this.renderer.domElement;
      this._onKeyDown = (e) => {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        const c = e.code;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
        if (!this.started && (c === 'Space' || c === 'Enter')) this.start();
        if (!this.keys.has(c)) {
          if (c === 'Digit1') this.selectGun('proton');
          else if (c === 'Digit2') this.selectGun('neutron');
          else if (c === 'Digit3') this.selectGun('electron');
          else if (c === 'Digit4') this.selectGun('c2c');
          // Digit5: reserved for the planned shotgun5
          else if (c === 'Digit6') this.selectGun('atom');
          else if (c === 'Digit7') this.selectGun('shotgun');
          else if (c === 'Digit8') this.selectGun('anti');
          else if (c === 'Digit9') this.selectGun('grav');
          else if (c === 'Digit0') this.selectGun('time');
          else if (c === 'KeyC') this.toggleC2CMode();
          else if (c === 'KeyZ') this.cycleElement(-1);
          else if (c === 'KeyX') this.cycleElement(1);
          else if (c === 'KeyB') this.identify();
          else if (c === 'KeyT') this.swapInConformer();
          else if (c === 'KeyM') { this.rainOn = !this.rainOn; this._status('🌧️ Molecule rain ' + (this.rainOn ? 'ON' : 'OFF')); }
          else if (c === 'KeyP') { this.paused ? this.resume() : this.pause(); this._status(this.paused ? '⏸ Paused' : '▶ Resumed'); }
          else if (c === 'KeyH') this.hud.help.hidden = !this.hud.help.hidden;
          else if (c === 'KeyJ' && G.Bots) G.Bots.toggleAll();
          else if (c === 'KeyG' && G.Grid) G.Grid.togglePanel();
          else if ((c === 'Equal' || c === 'NumpadAdd') && G.PNE) G.PNE.adjustPower(this.gun, +1);
          else if ((c === 'Minus' || c === 'NumpadSubtract') && G.PNE) G.PNE.adjustPower(this.gun, -1);
          else if (c === 'KeyK' && G.Discovery) { if (e.shiftKey) G.Discovery.reset(); else G.Discovery.toggle(); }
          else if (c === 'Space' && this.gun === 'c2c') this.fireC2C();
          else if (c === 'Escape') { this.hud.idPanel.hidden = true; this.hud.help.hidden = true; }
        }
        this.keys.add(c);
      };
      this._onKeyUp = (e) => { this.keys.delete(e.code); };
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      window.addEventListener('blur', () => this.keys.clear());

      const setMouse = (e) => {
        const r = cvs.getBoundingClientRect();
        this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
        this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
        this.mouse.ndcY = -(this.mouse.y / r.height) * 2 + 1;
        this.mouse.has = true;
        this.hud.cross.style.left = this.mouse.x + 'px';
        this.hud.cross.style.top = this.mouse.y + 'px';
      };
      cvs.addEventListener('contextmenu', e => e.preventDefault());
      cvs.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') { this._touchDown(e); return; }
        if (!this.started) this.start();
        setMouse(e);
        if (e.button === 0) { this.mouse.fireHeld = true; if (this.gun === 'c2c') this.fireC2C(); else this._trigger(); }
        if (e.button === 2) { this.mouse.steer = true; this.mouse.lastX = e.clientX; this.mouse.lastY = e.clientY; this.mouse.rDown = { t: performance.now(), moved: 0 }; }
        cvs.setPointerCapture(e.pointerId);
      });
      cvs.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') { this._touchMove(e); return; }
        setMouse(e);
        if (this.mouse.steer) {
          if (this.mouse.rDown) this.mouse.rDown.moved += Math.abs(e.clientX - this.mouse.lastX) + Math.abs(e.clientY - this.mouse.lastY);
          this.yaw -= (e.clientX - this.mouse.lastX) * 0.004;
          this.pitch -= (e.clientY - this.mouse.lastY) * 0.004;
          this.mouse.lastX = e.clientX; this.mouse.lastY = e.clientY;
        }
      });
      const up = (e) => {
        if (e.pointerType === 'touch') { this._touchUp(e); return; }
        if (e.button === 0) this.mouse.fireHeld = false;
        if (e.button === 2) {
          this.mouse.steer = false;
          // a short right-CLICK (not a right-drag steer) cycles the pellets per shot of guns 1 and 2
          const r = this.mouse.rDown; this.mouse.rDown = null;
          if (r && r.moved < 6 && performance.now() - r.t < 400 && G.PNE) G.PNE.cycleMode(this.gun);
        }
      };
      cvs.addEventListener('pointerup', up);
      cvs.addEventListener('pointercancel', up);
      cvs.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (G.PNE && G.PNE.usesPellets(this.gun)) G.PNE.adjustPower(this.gun, e.deltaY < 0 ? +1 : -1);   // guns 1 and 2: wheel = power
        else this.cycleElement(e.deltaY > 0 ? 1 : -1);
      }, { passive: false });
    },

    // touch: left half = move joystick, right half = steer drag
    _touchDown(e) {
      this.touchMode = true;
      this.hud.root.classList.add('s3g-touch');
      if (!this.started) this.start();
      const r = this.renderer.domElement.getBoundingClientRect();
      if (e.clientX - r.left < r.width * 0.45) this.touch.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      else this.touch.steer = { id: e.pointerId, lx: e.clientX, ly: e.clientY, dx: 0, dy: 0 };
    },
    _touchMove(e) {
      const j = this.touch.joy, s = this.touch.steer;
      if (j && j.id === e.pointerId) { j.x = Math.max(-1, Math.min(1, (e.clientX - j.ox) / 60)); j.y = Math.max(-1, Math.min(1, (e.clientY - j.oy) / 60)); }
      if (s && s.id === e.pointerId) { s.dx += e.clientX - s.lx; s.dy += e.clientY - s.ly; s.lx = e.clientX; s.ly = e.clientY; }
    },
    _touchUp(e) {
      if (this.touch.joy && this.touch.joy.id === e.pointerId) this.touch.joy = null;
      if (this.touch.steer && this.touch.steer.id === e.pointerId) this.touch.steer = null;
    },

    // ================= HUD =================
    _buildHud() {
      const h = {};
      h.title = el('div', { className: 's3g-title', text: '🚀 CHEMVENTUR · STAGE 3 · 3D' });
      h.stats = el('div', { className: 's3g-stats' });
      h.target = el('div', { className: 's3g-target' });
      h.guns = el('div', { className: 's3g-guns' });
      h.gunBtns = {};
      GUNS.forEach(g => {
        const b = el('button', { type: 'button', className: 's3g-btn s3g-gun', text: g.key + ' ' + g.label });
        b.addEventListener('click', () => this.selectGun(g.id));
        h.gunBtns[g.id] = b;
        h.guns.appendChild(b);
      });
      h.modeBtn = el('button', { type: 'button', className: 's3g-btn s3g-mode', title: 'C: toggle c2c 13 / c2c 8' });
      h.modeBtn.addEventListener('click', () => this.toggleC2CMode());
      h.guns.appendChild(h.modeBtn);
      h.palette = el('div', { className: 's3g-palette' });
      h.chips = C.PALETTE.map((sym, i) => {
        const b = el('button', { type: 'button', className: 's3g-chip', text: sym });
        b.style.setProperty('--chip', El.info(sym).color);
        b.addEventListener('click', () => { this.elementIdx = i; this._hudNow(); });
        h.palette.appendChild(b);
        return b;
      });
      h.inv = el('div', { className: 's3g-inv' });
      h.status = el('div', { className: 's3g-status', role: 'status', 'aria-live': 'polite' });
      h.cross = el('div', { className: 's3g-cross' });

      const mkBtn = (text, fn, title) => { const b = el('button', { type: 'button', className: 's3g-btn', text, title }); b.addEventListener('click', fn); return b; };
      h.actions = el('div', { className: 's3g-actions' }, [
        mkBtn('🧪 What did I build? (B)', () => this.identify()),
        mkBtn('🌧️ Rain (M)', () => { this.rainOn = !this.rainOn; this._status('🌧️ Molecule rain ' + (this.rainOn ? 'ON' : 'OFF')); }),
        mkBtn('🤖 Bots (J)', () => { if (G.Bots) G.Bots.toggleAll(); }),
        mkBtn('🔊 Sound', (e) => { A.setMuted(!A.muted); e.target.textContent = A.muted ? '🔇 Sound' : '🔊 Sound'; }),
        mkBtn('❔ Help (H)', () => { h.help.hidden = !h.help.hidden; })
      ]);

      // identify panel
      h.idRows = {};
      const dl = el('dl', { className: 's3g-info' });
      [['title', 'Name'], ['formula', 'Formula'], ['built', 'You built'], ['smiles', 'SMILES'], ['mw', 'Mol. weight'], ['xlogp', 'XLogP'], ['tpsa', 'TPSA'], ['inchikey', 'InChIKey'], ['cid', 'PubChem']].forEach(([k, label]) => {
        const dd = el('dd', { text: '—' });
        h.idRows[k] = dd;
        dl.appendChild(el('dt', { text: label }));
        dl.appendChild(dd);
      });
      h.idNotes = el('ul', { className: 's3g-notes' });
      h.swapBtn = mkBtn('🔁 Swap in PubChem 3D (T)', () => this.swapInConformer());
      h.idPanel = el('div', { className: 's3g-panel s3g-id', hidden: true }, [
        el('div', { className: 's3g-panel-title', text: '🧪 WHAT DID I BUILD?' }), dl, h.idNotes,
        el('div', { className: 's3g-row' }, [h.swapBtn, mkBtn('✕ Close', () => { h.idPanel.hidden = true; })])
      ]);

      // help + start overlays
      const controls = [
        ['W A S D', 'fly forward / strafe / back'], ['R / F', 'up / down'], ['Arrows · right-drag', 'turn (yaw / pitch)'],
        ['Mouse', 'aim (crosshair)'], ['Left click · Space', 'fire'],
        ['1 · 2 · 3', 'shotgun1proton (red p⁺ mist) · SHOTGUN2neutron (blue n, falls slightly) · Electrogun (chain lightning, makes ions)'],
        ['4 · 6 · 7', 'c2c tone gun · ATOM gun · atom SHOTgun (5 is kept free for shotgun5)'], ['8 · 9 · 0', 'ANTI · GRAV orb · TIME bubble'],
        ['Right-click', 'guns 1 & 2: pellets per shot 1 · 3 · 7 · 15 · 31 (also the "x7" button)'],
        ['Wheel · + / −', 'guns 1 & 2: power = range 15–90 (also the 💪 button); other guns: wheel = atom element'],
        ['C', 'c2c 13 (chromatic) ⇄ c2c 8 (major)'], ['Z / X', 'atom element'], ['B', 'What did I build?'], ['G', 'Grid panel: charges · gravity · temperature · pressure'],
        ['T', 'swap in PubChem 3D conformer'], ['M', 'molecule rain on/off'], ['P', 'pause'], ['H', 'help'],
        ['K · Shift+K', 'FIRST DISCOVERY banners on/off · reset discoveries'],
        ['J', 'bots: spawn all 10 / remove all'],
        ['Touch', 'left: move · right: steer · buttons']
      ];
      const helpList = el('dl', { className: 's3g-help-list' });
      controls.forEach(([k, v]) => { helpList.appendChild(el('dt', { text: k })); helpList.appendChild(el('dd', { text: v })); });
      const c2cInfo = el('p', { className: 's3g-small', text: 'c2c tone dots: C (root) = BOND to nearest atom · white keys = HARMONY (energize) · sharps = DISSONANCE (break a bond) · top C = RESONANCE (bond order +1). Energized atoms bond when they touch. Fly through loose atoms to collect them.' });
      h.help = el('div', { className: 's3g-panel s3g-help', hidden: true }, [el('div', { className: 's3g-panel-title', text: '❔ CONTROLS' }), helpList, c2cInfo,
        el('div', { className: 's3g-row' }, [mkBtn('✕ Close', () => { h.help.hidden = true; })])]);
      const startBtn = mkBtn('▶ START', () => this.start());
      startBtn.classList.add('s3g-start-btn');
      h.startOverlay = el('div', { className: 's3g-start' }, [
        el('div', { className: 's3g-start-title', text: '🚀 CHEMVENTUR · STAGE 3' }),
        el('div', { className: 's3g-start-sub', text: 'Fly. Shoot atoms. Bond them in 3D. Play the c2c tone gun. Ask PubChem what you built.' }),
        startBtn, el('div', { className: 's3g-small', text: 'H = controls · sound starts after START' })
      ]);

      // touch buttons
      const tb = (text, down, upFn) => {
        const b = el('button', { type: 'button', className: 's3g-tbtn', text });
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!this.started) this.start(); down(); });
        if (upFn) { b.addEventListener('pointerup', upFn); b.addEventListener('pointercancel', upFn); b.addEventListener('pointerleave', upFn); }
        return b;
      };
      h.touchBar = el('div', { className: 's3g-touchbar' }, [
        tb('🔫 FIRE', () => { this.touch.fire = true; if (this.gun === 'c2c') this.fireC2C(); else this._trigger(); }, () => { this.touch.fire = false; }),
        tb('GUN', () => { const i = GUNS.findIndex(g => g.id === this.gun); this.selectGun(GUNS[(i + 1) % GUNS.length].id); }),
        tb('c2c ⇄', () => this.toggleC2CMode()),
        tb('ATOM ⇄', () => this.cycleElement(1)),
        tb('🧪', () => this.identify())
      ]);

      h.root = el('div', { className: 's3g-hud' }, [
        el('div', { className: 's3g-tl' }, [h.title, h.stats, h.target]),
        el('div', { className: 's3g-bl' }, [h.guns, h.palette, h.inv]),
        h.actions, h.status, h.cross, h.idPanel, h.help, h.touchBar, h.startOverlay
      ]);
      this.container.appendChild(h.root);
      this.hud = h;
      this._hudNow();
    },

    _hudNow() {
      const h = this.hud;
      if (!h) return;
      const t = TARGETS[this.targetIdx % TARGETS.length];
      h.stats.textContent = 'SCORE ' + this.score + ' · ATOMS ' + W.atoms.length + ' · BONDS ' + W.bonds.length + ' · ' + this.fps + ' FPS';
      h.target.textContent = '🎯 BUILD: ' + t.name + ' ' + t.formula;
      Object.keys(h.gunBtns).forEach(id => h.gunBtns[id].classList.toggle('active', id === this.gun));
      if (h.gunBtns.atom) h.gunBtns.atom.textContent = '6 ATOM: ' + C.PALETTE[this.elementIdx];
      h.modeBtn.textContent = G.C2C.MODES[this.c2cMode].label;
      h.modeBtn.classList.toggle('active', this.gun === 'c2c');
      h.chips.forEach((b, i) => b.classList.toggle('active', i === this.elementIdx));
      const inv = Object.keys(W.inventory).map(k => k + '×' + W.inventory[k]).join(' ');
      h.inv.textContent = '🧺 Collected: ' + (inv || 'none yet (fly through loose atoms / blast them)');
    },

    _showIdentify(o) {
      const h = this.hud, R = h.idRows, p = o.props || {};
      R.title.textContent = o.title || '—';
      R.formula.textContent = o.formula || '—';
      R.built.textContent = o.explicitFormula + ' (' + o.atoms + ' atoms, ' + o.bonds + ' bonds)';
      R.smiles.textContent = o.canonical || p.smiles || '—';
      R.mw.textContent = p.mw != null ? p.mw.toFixed(2) + ' g/mol' : '—';
      R.xlogp.textContent = p.xlogp != null ? String(p.xlogp) : '—';
      R.tpsa.textContent = p.tpsa != null ? p.tpsa + ' Å²' : '—';
      R.inchikey.textContent = p.inchikey || '—';
      R.cid.textContent = '';
      if (o.cid) R.cid.appendChild(el('a', { href: CV.Stage3Chem.PubChem.compoundUrl(o.cid), target: '_blank', rel: 'noopener noreferrer', text: 'CID ' + o.cid + ' ↗' }));
      else R.cid.textContent = 'not in PubChem';
      h.idNotes.textContent = '';
      (o.notes || []).concat(o.error ? ['Error: ' + o.error] : []).forEach(n => h.idNotes.appendChild(el('li', { text: n })));
      h.swapBtn.disabled = !o.sdf;
      h.idPanel.hidden = false;
    },

    _status(msg, kind) {
      if (!this.hud) return;
      this.hud.status.textContent = msg;
      this.hud.status.className = 's3g-status s3g-' + (kind || 'info');
    }
  };

  // ================= PUBLIC API + DEBUG HOOKS =================
  G.Game = Game;
  G.boot = (container, opts) => Game.boot(container, opts);
  G.start = () => Game.start();
  G.pause = () => Game.pause();
  G.resume = () => Game.resume();
  G.destroy = () => Game.destroy();
  G.identify = () => Game.identify();
  G.fireC2C = (mode) => Game.fireC2C(mode);

  G.debug = {
    state() {
      const info = Game.renderer ? Game.renderer.info.render : {};
      return {
        booted: Game.booted, started: Game.started, gun: Game.gun, c2cMode: Game.c2cMode, c2cLabel: G.C2C.MODES[Game.c2cMode].label,
        atoms: W.atoms.length, bonds: W.bonds.length, projectiles: W.projectiles.length,
        dots: W.projectiles.filter(p => p.kind === 'dot').length, fps: Game.fps, score: Game.score,
        drawCalls: info.calls, triangles: info.triangles, three: THREE && THREE.REVISION, threeUrl: G.threeUrl,
        audio: A.ctx ? A.ctx.state : 'none'
      };
    },
    // Fire a full c2c series and resolve with what was fired (waits for any running series first)
    async fireC2C(mode) {
      while (Game.seq) await new Promise(r => setTimeout(r, 30));
      const before = A.toneLog.length;
      const seq = await Game.fireC2C(mode);
      const tones = A.toneLog.slice(before).filter(t => t.seq === seq.id);
      const dots = W.projectiles.filter(p => p.kind === 'dot' && p.seq === seq.id).length;
      return {
        mode: seq.mode, label: seq.label, shots: seq.fired, count: seq.fired.length,
        distinctColors: new Set(seq.fired.map(f => f.color)).size,
        distinctRadii: new Set(seq.fired.map(f => f.radius)).size,
        tones: tones.map(t => ({ note: t.note, freq: t.freq, oscFreq: t.oscFreq, state: t.ctxState })),
        liveDotsAtEnd: dots
      };
    },
    // Build a bare C–C–O right in front of the ship (no H: RDKit adds implicit H)
    buildEthanolSkeleton() {
      const nose = Game._nose(), f = Game._forward();
      const c = { x: nose.x + f.x * 12, y: nose.y + f.y * 12, z: nose.z + f.z * 12 };
      const C1 = W.spawnAtom('C', V.add(c, { x: -1.5, y: 0, z: 0 }), null, 'player');
      const C2 = W.spawnAtom('C', V.add(c, { x: 1.5, y: 0, z: 0 }), null, 'player');
      const O = W.spawnAtom('O', V.add(c, { x: 2.6, y: 2.2, z: 0 }), null, 'player');
      W.bond(C1, C2, 1, true); W.bond(C2, O, 1, true);
      return { atoms: [C1, C2, O] };
    },
    async identifyEthanolSkeleton() {
      const s = G.debug.buildEthanolSkeleton();
      const comp = W.components().find(c => c.atoms.indexOf(s.atoms[0]) !== -1);
      const out = await Game.identify(comp);
      return out && { title: out.title, cid: out.cid, formula: out.formula, explicitFormula: out.explicitFormula, canonical: out.canonical, is3D: out.is3D, notes: out.notes, error: out.error };
    },
    swap() { const m = Game.swapInConformer(); return m ? { atoms: m.atoms.length, bonds: m.bonds.length } : null; },
    // Share of canvas pixels that are not the clear colour (rendered just now)
    sampleCanvas() {
      Game.renderer.render(Game.scene, Game.camera);
      const gl = Game.renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 12 || px[i + 1] > 24 || px[i + 2] > 12) lit++;
      return { width: w, height: h, litFraction: Math.round(lit / (w * h) * 1000) / 1000 };
    },
    world: W, game: Game
  };

  console.log('🚀 CHEMVENTUR Stage 3 Game module loaded');
})();
