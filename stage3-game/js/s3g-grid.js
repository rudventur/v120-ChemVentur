/* CHEMVENTUR Stage 3: "Grid" options panel (G or the ▦ Grid button). Four toggles, saved in localStorage:
   • Charge display (on by default): every atom with a charge gets a small "+" (red) or "−" (blue) marker on its
     surface and a very subtle red / blue glow. Charge = ion charge (from the Electrogun) + a partial charge from
     bond polarity: for each bond, q += 0.12 × (electronegativity of the partner − own electronegativity) × bond order
     (water: O ≈ −0.30, each H ≈ +0.15). The marker sits on the side facing away from the atom's bond partners,
     so a molecule shows its "+" and "−" ends. (RDKit's in-browser build has no Gasteiger charge function, so the
     electronegativity rule is used everywhere.)
   • Gravity (off): atoms and proton pellets fall slightly (1.2 units/s²). Neutron pellets always feel their own
     slight gravity.
   • Temperature (off): three flat, translucent horizontal layers (at heights −45, 0, +45; base 260 K, 295 K, 330 K)
     with live labels in kelvin. Each layer bends up and turns red where nearby matter is hot (fast, energetic,
     unbonded atoms = gas) and dips and turns blue where it is cold (bonded molecules = liquid / solid).
     The local temperature makes atoms jiggle: hotter = faster random motion.
   • Pressure (off): two horizontal plates. Pressure (kilopascals) rises with the number of atoms and their energy;
     the higher it is, the closer the plates come together. Each plate dents locally above / below crowded spots.
     Pressure nudges all atoms towards the centre (closer together) and squeezes atoms back between the plates.
   Hooks: Game.boot -> attach(game); Game._frame -> tick(game, dt) before the physics step, render(game) after
   the meshes are synced. */
(function () {
  'use strict';
  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});
  const V = G.V, C = G.Config;

  const STORE = 'cv.s3g.grid.v1';
  const LAYER_Y = [-45, 0, 45], BASE_T = [260, 295, 330];
  const SIZE = 150, SEG_T = 30, SEG_P = 20, P0 = 101.3;
  const OPTIONS = [
    { id: 'charge', name: 'Charge display', info: '+ / − markers and a faint red / blue glow on charged atoms' },
    { id: 'gravity', name: 'Gravity', info: 'atoms and proton pellets fall slightly' },
    { id: 'temperature', name: 'Temperature (K)', info: 'three heat layers; hot spots make atoms jiggle faster' },
    { id: 'pressure', name: 'Pressure (kPa)', info: 'two plates close in as pressure rises and push atoms together' }
  ];

  function colorForT(T, out) {          // 200 K blue → 300 K green → 400 K red
    const t = Math.max(0, Math.min(1, (T - 200) / 200));
    if (t < 0.5) { const k = t / 0.5; out[0] = 0; out[1] = 0.4 + 0.6 * k; out[2] = 1 - 0.6 * k; }
    else { const k = (t - 0.5) / 0.5; out[0] = k; out[1] = 1 - 0.8 * k; out[2] = 0.4 - 0.3 * k; }
    return out;
  }

  const Grid = {
    GRAVITY: 1.2, OPTIONS,
    state: { charge: true, gravity: false, temperature: false, pressure: false },
    game: null, layers: [], plates: [], pressure: P0, gap: 150, tTimer: 0, pTimer: 0, qTimer: 0, avgT: BASE_T.slice(),

    attach(game) {
      this.game = game;
      try { Object.assign(this.state, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* ignore */ }
      const h = game.hud, T = G.THREE;
      // button in the top-right action row
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 's3g-btn s3g-gridbtn'; btn.textContent = '▦ Grid (G)';
      btn.addEventListener('click', () => this.togglePanel());
      h.actions.insertBefore(btn, h.actions.lastChild);
      // panel
      const panel = document.createElement('div');
      panel.className = 's3g-panel s3g-gridpanel'; panel.hidden = true;
      const title = document.createElement('div'); title.className = 's3g-panel-title'; title.textContent = '▦ GRID';
      panel.appendChild(title);
      this.boxes = {};
      OPTIONS.forEach(o => {
        const row = document.createElement('label'); row.className = 's3g-gridopt';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!this.state[o.id]; cb.dataset.opt = o.id;
        cb.addEventListener('change', () => { this.toggle(o.id, cb.checked); cb.blur(); });   // blur: keep the game keys working
        const name = document.createElement('span'); name.className = 's3g-gridname'; name.textContent = o.name;
        const info = document.createElement('span'); info.className = 's3g-gridinfo'; info.textContent = o.info;
        row.append(cb, name, info); panel.appendChild(row);
        this.boxes[o.id] = cb;
      });
      this.readout = document.createElement('div'); this.readout.className = 's3g-small s3g-gridread';
      panel.appendChild(this.readout);
      const close = document.createElement('button'); close.type = 'button'; close.className = 's3g-btn'; close.textContent = '✕ Close';
      close.addEventListener('click', () => { panel.hidden = true; });
      const row = document.createElement('div'); row.className = 's3g-row'; row.appendChild(close); panel.appendChild(row);
      h.root.appendChild(panel);
      this.panel = panel; this.btn = btn;

      // charge markers: two point clouds (+ and −), 2 draw calls for any number of atoms
      const tex = (sym, color) => {
        const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
        x.shadowColor = color; x.shadowBlur = 10; x.strokeStyle = color; x.lineWidth = 9; x.lineCap = 'round';
        x.beginPath(); x.moveTo(16, 32); x.lineTo(48, 32); if (sym === '+') { x.moveTo(32, 16); x.lineTo(32, 48); } x.stroke();
        return new T.CanvasTexture(c);
      };
      const cloud = (sym, color) => {
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(C.MAX_ATOMS * 3 + 30), 3)); g.setDrawRange(0, 0);
        const p = new T.Points(g, new T.PointsMaterial({ size: 1.0, map: tex(sym, color), transparent: true, depthWrite: false, alphaTest: 0.05, sizeAttenuation: true }));
        p.frustumCulled = false; game.scene.add(p); return p;
      };
      this.plus = cloud('+', '#ff5a5a'); this.minus = cloud('−', '#5aa8ff');
      this._red = new T.Color('#ff2020'); this._blue = new T.Color('#2060ff');
      this._sync();
    },

    togglePanel(show) { this.panel.hidden = show == null ? !this.panel.hidden : !show; return !this.panel.hidden; },

    toggle(id, on) {
      if (!(id in this.state)) return null;
      this.state[id] = on == null ? !this.state[id] : !!on;
      try { localStorage.setItem(STORE, JSON.stringify(this.state)); } catch (e) { /* ignore */ }
      this._sync();
      const o = OPTIONS.find(x => x.id === id);
      if (this.game) this.game._status('▦ ' + o.name + ' ' + (this.state[id] ? 'ON' : 'OFF'));
      return this.state[id];
    },

    _sync() {
      Object.keys(this.boxes || {}).forEach(k => { this.boxes[k].checked = !!this.state[k]; });
      if (this.state.temperature && !this.layers.length) this._buildLayers();
      if (this.state.pressure && !this.plates.length) this._buildPlates();
      this.layers.forEach(l => { l.mesh.visible = l.label.visible = this.state.temperature; });
      this.plates.forEach(p => { p.mesh.visible = this.state.pressure; });
      if (this.pLabel) this.pLabel.visible = this.state.pressure;
      if (this.plus) this.plus.visible = this.minus.visible = this.state.charge;
    },

    _label(text, color) {
      const T = G.THREE, c = document.createElement('canvas'); c.width = 512; c.height = 96;
      const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
      s.scale.set(16, 3, 1); s.userData.canvas = c; s.userData.color = color; s.userData.text = '';
      this._setLabel(s, text); this.game.scene.add(s); return s;
    },
    _setLabel(s, text) {
      if (s.userData.text === text) return;
      const c = s.userData.canvas, x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);
      x.font = 'bold 44px Courier New, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = s.userData.color; x.shadowBlur = 14; x.fillStyle = s.userData.color; x.fillText(text, 256, 48);
      s.material.map.needsUpdate = true; s.userData.text = text;
    },
    _plane(seg, color, opacity) {
      const T = G.THREE;
      const geo = new T.PlaneGeometry(SIZE, SIZE, seg, seg); geo.rotateX(-Math.PI / 2);
      const n = geo.attributes.position.count;
      geo.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const mat = new T.MeshBasicMaterial({ color: color || 0xffffff, vertexColors: !color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false });
      const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; this.game.scene.add(mesh);
      const wire = new T.LineSegments(new T.WireframeGeometry(new T.PlaneGeometry(SIZE, SIZE, 10, 10).rotateX(-Math.PI / 2)), new T.LineBasicMaterial({ color: color || 0x66ffaa, transparent: true, opacity: opacity * 0.9, depthWrite: false }));
      mesh.add(wire);
      return mesh;
    },
    _buildLayers() {
      LAYER_Y.forEach((y, i) => {
        const mesh = this._plane(SEG_T, null, 0.17); mesh.position.y = y;
        const n = (SEG_T + 1) * (SEG_T + 1);
        this.layers.push({ y, base: BASE_T[i], mesh, cur: new Float32Array(n), tgt: new Float32Array(n), label: this._label(BASE_T[i] + ' K', '#7dffb0') });
      });
    },
    _buildPlates() {
      [1, -1].forEach(side => {
        const mesh = this._plane(SEG_P, 0xc070ff, 0.13);
        this.plates.push({ side, mesh, cur: new Float32Array((SEG_P + 1) * (SEG_P + 1)) });
      });
      this.pLabel = this._label(P0.toFixed(0) + ' kPa', '#e0a8ff');
    },

    // grid index of a point on a layer / plate
    _idx(x, z, seg) {
      const i = Math.round((x / SIZE + 0.5) * seg), k = Math.round((z / SIZE + 0.5) * seg);
      return i < 0 || k < 0 || i > seg || k > seg ? -1 : k * (seg + 1) + i;
    },
    localT(a) {
      if (!this.layers.length) return 295;
      let best = this.layers[0];
      for (const l of this.layers) if (Math.abs(l.y - a.pos.y) < Math.abs(best.y - a.pos.y)) best = l;
      const idx = this._idx(a.pos.x, a.pos.z, SEG_T);
      // base temperature blends between layers by height; local change comes from the nearest layer
      const yy = Math.max(LAYER_Y[0], Math.min(LAYER_Y[2], a.pos.y));
      const base = yy < 0 ? BASE_T[0] + (BASE_T[1] - BASE_T[0]) * (yy - LAYER_Y[0]) / 45 : BASE_T[1] + (BASE_T[2] - BASE_T[1]) * yy / 45;
      return base + (idx >= 0 ? best.cur[idx] : 0);
    },

    // ---------- forces (before the physics step) ----------
    tick(game, dt) {
      const W = G.World, sim = game.slow > 0 ? dt * 0.22 : dt;
      if (this.state.gravity) for (const a of W.atoms) a.vel.y -= this.GRAVITY * sim;
      if (this.state.temperature) {
        this.tTimer -= dt;
        if (this.tTimer <= 0) { this.tTimer = 0.2; this._heatField(W); }
        for (const l of this.layers) for (let i = 0; i < l.cur.length; i++) l.cur[i] += (l.tgt[i] - l.cur[i]) * (1 - Math.exp(-dt * 2));
        for (const a of W.atoms) {                                // thermal jiggle
          const k = (this.localT(a) / 300) * 4 * sim;
          const u = V.randUnit(); a.vel.x += u.x * k; a.vel.y += u.y * k; a.vel.z += u.z * k;
        }
      }
      if (this.state.pressure) {
        this.pTimer -= dt;
        if (this.pTimer <= 0) { this.pTimer = 0.2; this._pressureField(W); }
        const want = Math.max(30, Math.min(150, 150 * P0 / this.pressure));
        this.gap += (want - this.gap) * (1 - Math.exp(-dt * 1.5));
        const k = 0.5 * (this.pressure / P0) * sim, half = this.gap / 2;
        for (const a of W.atoms) {
          const L = Math.hypot(a.pos.x, a.pos.y, a.pos.z) || 1;
          a.vel.x -= a.pos.x / L * k; a.vel.y -= a.pos.y / L * k; a.vel.z -= a.pos.z / L * k;   // nudged closer together
          if (Math.abs(a.pos.y) > half) a.vel.y -= Math.sign(a.pos.y) * 3 * sim;               // squeezed between the plates
        }
      }
    },

    _heatField(W) {
      for (const l of this.layers) {
        l.tgt.fill(0);
        for (const a of W.atoms) {
          const dy = Math.abs(a.pos.y - l.y); if (dy > 22) continue;
          const w = 1 - dy / 22, sp2 = a.vel.x * a.vel.x + a.vel.y * a.vel.y + a.vel.z * a.vel.z;
          const heat = a.bonds.length ? -(4 + 2 * a.bonds.length) : 6 + 8 * Math.min(2, a.energy) + 0.08 * sp2;   // gas warms, bonded matter cools
          const ci = Math.round((a.pos.x / SIZE + 0.5) * SEG_T), ck = Math.round((a.pos.z / SIZE + 0.5) * SEG_T);
          for (let di = -2; di <= 2; di++) for (let dk = -2; dk <= 2; dk++) {
            const i = ci + di, k = ck + dk; if (i < 0 || k < 0 || i > SEG_T || k > SEG_T) continue;
            l.tgt[k * (SEG_T + 1) + i] += heat * w / (1 + di * di + dk * dk);
          }
        }
        for (let i = 0; i < l.tgt.length; i++) l.tgt[i] = Math.max(-80, Math.min(80, l.tgt[i]));
      }
    },

    _pressureField(W) {
      let e = 0; for (const a of W.atoms) e += a.energy;
      const n = W.atoms.length || 1;
      this.pressure = P0 * (n / C.START_ATOMS) * (1 + 0.3 * e / n);
      for (const pl of this.plates) {
        const dens = new Float32Array(pl.cur.length);
        for (const a of W.atoms) { const i = this._idx(a.pos.x, a.pos.z, SEG_P); if (i >= 0) dens[i] += 1; }
        for (let i = 0; i < dens.length; i++) pl.cur[i] += (Math.min(10, dens[i] * 1.5) - pl.cur[i]) * 0.5;
      }
    },

    // ---------- visuals (after the meshes are synced) ----------
    render(game) {
      const W = G.World;
      if (this.state.charge) this._charges(game, W);
      const ship = game.ship.position;
      if (this.state.temperature && this.layers.length) {
        const col = [0, 0, 0];
        for (const l of this.layers) {
          const pos = l.mesh.geometry.attributes.position, colA = l.mesh.geometry.attributes.color;
          let sum = 0;
          for (let i = 0; i < l.cur.length; i++) {
            const T = l.base + l.cur[i]; sum += T;
            pos.array[i * 3 + 1] = Math.max(-5, Math.min(5, l.cur[i] * 0.06));
            colorForT(T, col); colA.array[i * 3] = col[0]; colA.array[i * 3 + 1] = col[1]; colA.array[i * 3 + 2] = col[2];
          }
          pos.needsUpdate = true; colA.needsUpdate = true;
          const avg = sum / l.cur.length; this.avgT[this.layers.indexOf(l)] = avg;
          const li = this._idx(ship.x, ship.z, SEG_T), here = li >= 0 ? l.base + l.cur[li] : avg;
          this._setLabel(l.label, '≈ ' + Math.round(here) + ' K  (layer ' + (l.y > 0 ? '+' : '') + l.y + ')');
          l.label.position.set(ship.x + 16, l.y + 2.5, ship.z - 26);    // label follows the ship so it stays readable
        }
      }
      if (this.state.pressure && this.plates.length) {
        for (const pl of this.plates) {
          pl.mesh.position.y = pl.side * this.gap / 2;
          const pos = pl.mesh.geometry.attributes.position;
          for (let i = 0; i < pl.cur.length; i++) pos.array[i * 3 + 1] = -pl.side * pl.cur[i];   // dent towards the middle
          pos.needsUpdate = true;
        }
        this._setLabel(this.pLabel, 'P ≈ ' + Math.round(this.pressure) + ' kPa · gap ' + Math.round(this.gap));
        this.pLabel.position.set(ship.x - 16, this.gap / 2 - 3, ship.z - 26);
      }
      if (this.panel && !this.panel.hidden) {
        this.readout.textContent = 'atoms ' + W.atoms.length + ' · ions ' + W.atoms.filter(a => a.charge).length +
          (this.state.temperature ? ' · T ' + this.avgT.map(t => Math.round(t)).join(' / ') + ' K' : '') +
          (this.state.pressure ? ' · P ' + Math.round(this.pressure) + ' kPa' : '') + (this.state.gravity ? ' · g ' + this.GRAVITY : '');
      }
    },

    chargeOf(a) {
      const EN = G.PNE ? G.PNE.EN : {};
      let q = a.charge || 0;
      const ea = EN[a.symbol] || 0;
      if (ea) for (const b of a.bonds) { const o = b.a === a ? b.b : b.a, eo = EN[o.symbol] || 0; if (eo) q += 0.12 * (eo - ea) * b.order; }
      return q;
    },

    _charges(game, W) {
      this.qTimer -= 1;
      if (this.qTimer <= 0) { this.qTimer = 10; for (const a of W.atoms) a._q = this.chargeOf(a); }    // every 10 frames
      const pp = this.plus.geometry.attributes.position.array, mp = this.minus.geometry.attributes.position.array;
      let np = 0, nm = 0;
      const cam = game.camera.position;
      for (const a of W.atoms) {
        const q = a._q || 0, m = a.mesh;
        if (Math.abs(q) < 0.06 || !m) continue;
        // marker on the surface, on the side facing away from the bond partners (or towards the camera if alone)
        let dx = 0, dy = 0, dz = 0;
        for (const b of a.bonds) { const o = b.a === a ? b.b : b.a; dx += a.pos.x - o.pos.x; dy += a.pos.y - o.pos.y; dz += a.pos.z - o.pos.z; }
        if (!a.bonds.length || dx * dx + dy * dy + dz * dz < 1e-6) { dx = cam.x - a.pos.x; dy = cam.y - a.pos.y; dz = cam.z - a.pos.z; }
        const L = Math.hypot(dx, dy, dz) || 1, r = a.r * 1.02 + 0.35;
        const arr = q > 0 ? pp : mp, o = (q > 0 ? np++ : nm++) * 3;
        arr[o] = a.pos.x + dx / L * r; arr[o + 1] = a.pos.y + dy / L * r; arr[o + 2] = a.pos.z + dz / L * r;
        m.material.emissive.lerp(q > 0 ? this._red : this._blue, Math.min(0.45, Math.abs(q) * 0.9));   // very subtle tint
        m.material.emissiveIntensity += Math.min(0.35, Math.abs(q) * 0.5);
      }
      this.plus.geometry.setDrawRange(0, np); this.minus.geometry.setDrawRange(0, nm);
      this.plus.geometry.attributes.position.needsUpdate = true; this.minus.geometry.attributes.position.needsUpdate = true;
      this.markerCount = { plus: np, minus: nm };
    },

    debugState() {
      return { state: { ...this.state }, panelOpen: !!(this.panel && !this.panel.hidden),
        layers: this.layers.map(l => ({ y: l.y, visible: l.mesh.visible, label: l.label.userData.text })),
        plates: this.plates.map(p => ({ visible: p.mesh.visible, y: p.mesh.position.y })), pressure: Math.round(this.pressure * 10) / 10, gap: Math.round(this.gap * 10) / 10,
        pLabel: this.pLabel ? this.pLabel.userData.text : null, markers: this.markerCount || { plus: 0, minus: 0 }, markersVisible: !!(this.plus && this.plus.visible),
        avgT: this.avgT.map(t => Math.round(t)) };
    }
  };

  G.Grid = Grid;
})();
