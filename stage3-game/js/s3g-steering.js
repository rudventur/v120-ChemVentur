/* CHEMVENTUR Stage 3: STEERING MODES (O = options window, ⚙ button, start-screen picker).
   One normalized command object feeds Game._updateShip, whatever the input device:
     cmd = { attitude: 'euler' | 'quat', move: {x, y, z}, yawRate, pitchRate, rollRate, yawDelta, pitchDelta, throttle }
     move: body-frame −1..1 (x right, y up, z back, like W A S D R F today)
     yawRate  +1 = turn right · pitchRate +1 = nose up · rollRate +1 = roll right (wing down) · deltas are radians (drag steering)
   Modes (registry, Steering.register):
     classic  today's behaviour, the default (keys, move pad + steer pad, drag joystick). Yaw/pitch angles, no roll.
     cessna   an approximation of Cessna-style controls: aileron (roll), elevator (pitch), rudder (yaw), throttle.
              Keys A/D · W/S · Q/E · R/F (throttle is held). Touch: right stick = aileron + elevator, left stick =
              rudder + throttle (the lever holds). Quaternion attitude, assist Off / Stability / Arcade, camera "up"
              blends towards the ship's up, soft turn-back near the arena edge. Gamepad axes work here too.
     gamepad  Classic sources + a controller (Gamepad API, standard mapping) with deadzone and expo.
   Device detection (Steering.detect): touch-primary vs mouse / keyboard, screen size class (phone / tablet / desktop),
   orientation. It sets the layout (touch sticks only on touch, sizes from the viewport) but never the mode: the saved
   choice wins, otherwise Classic. A controller that is used switches to Gamepad once if "auto-switch" is on.
   Settings: localStorage cv.s3g.steering.v1. Query ?steer=classic|cessna|gamepad picks a mode for this visit only.
   Hooks: Game.boot -> attach(game); Game._updateShip -> command(game, dt) (+ fly(game, cmd, dt) for 'quat');
   Game._frame fire condition -> Steering.fireHeld; Game._onKeyDown -> togglePanel (O). */
(function () {
  'use strict';
  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});
  const C = G.Config;

  const STORE = 'cv.s3g.steering.v1';
  const DEFAULTS = { mode: 'classic', modeChosen: false, sens: 1, invertPitch: false, assist: 'arcade', leftHanded: false, deadzone: 0.08, expo: 0.35, autoPad: true };
  const ASSIST = {   // follow: seconds to reach the commanded turn rate · damp: seconds to stop turning when the stick is centred
    off: { label: 'Off', follow: 0.25, damp: 3.0, level: false, limit: false, info: 'raw: the ship keeps rolling and pitching after you let go' },
    stability: { label: 'Stability', follow: 0.12, damp: 0.15, level: false, limit: true, info: 'turning stops when the stick is centred' },
    arcade: { label: 'Arcade', follow: 0.12, damp: 0.15, level: true, limit: true, info: 'also levels the wings and nose, and turns when banked' }
  };
  const FLIGHT = { maxRoll: 2.4, maxPitch: 1.3, maxYaw: 0.7, minSpeed: 3, maxSpeed: 26, throttleRate: 0.55, stickThrottleRate: 0.8, pitchLimit: 1.3 };
  const R_HARD = C.ARENA_RADIUS * 0.97, R_SOFT = C.ARENA_RADIUS * 0.72;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const num = (b) => (b ? 1 : 0);

  // deadzone, then expo: out = e·t³ + (1 − e)·t on the rescaled 0..1 magnitude
  function shape(v, dz, expo) {
    const a = Math.abs(v);
    if (a <= dz) return 0;
    const t = Math.min(1, (a - dz) / (1 - dz));
    return Math.sign(v) * (expo * t * t * t + (1 - expo) * t);
  }

  function el(tag, props, kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === 'text') e.textContent = v; else if (k === 'className') e.className = v; else e.setAttribute(k, v); });
    (kids || []).forEach(k => e.appendChild(k));
    return e;
  }

  const Steering = {
    DEFAULTS, ASSIST, FLIGHT, R_SOFT, R_HARD, shape,
    MODES: {}, order: [], opts: Object.assign({}, DEFAULTS), mode: 'classic',
    game: null, device: null, fireHeld: false, pad: null, padPrev: null, padSwitched: false, padLoop: null,
    stick: { L: { x: 0, y: 0, tx: 0, ty: 0, id: null }, R: { x: 0, y: 0, tx: 0, ty: 0, id: null } },
    flight: { throttle: 0.35, speed: 0, w: { roll: 0, pitch: 0, yaw: 0 }, kb: { roll: 0, pitch: 0, yaw: 0 }, bank: 0, pitchAng: 0, edge: false, hardClamps: 0, softTurns: 0, maxDist: 0 },
    last: null,

    register(id, def) { def.id = id; this.MODES[id] = def; if (this.order.indexOf(id) < 0) this.order.push(id); },

    // ---------- device detection ----------
    detect() {
      const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
      const touchPoints = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
      const coarse = mm('(pointer: coarse)'), fine = mm('(pointer: fine)'), hover = mm('(hover: hover)');
      const touchPrimary = coarse || (touchPoints && !fine && !hover);
      const w = window.innerWidth, h = window.innerHeight;
      const minSide = Math.min((window.screen && window.screen.width) || w, (window.screen && window.screen.height) || h, Math.max(w, h));
      const cls = !touchPrimary ? 'desktop' : (minSide < 600 ? 'phone' : 'tablet');
      return { cls, touchPrimary, touchCapable: touchPoints, fineMouse: fine, w, h, orient: w >= h ? 'landscape' : 'portrait', pad: !!this.pad };
    },

    load() {
      try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s) Object.keys(DEFAULTS).forEach(k => { if (k in s && typeof s[k] === typeof DEFAULTS[k]) this.opts[k] = s[k]; }); } catch (e) { /* ignore */ }
      if (!ASSIST[this.opts.assist]) this.opts.assist = 'arcade';
      this.mode = this.MODES[this.opts.mode] ? this.opts.mode : 'classic';
      const q = new URLSearchParams(location.search).get('steer');          // this visit only
      if (q && this.MODES[q]) this.mode = q;
    },
    save() { try { localStorage.setItem(STORE, JSON.stringify(Object.assign({}, this.opts, { mode: this.opts.modeChosen ? this.mode : this.opts.mode }))); } catch (e) { /* ignore */ } },

    // ---------- attach: UI, listeners ----------
    attach(game) {
      this.game = game;
      this.T = G.THREE;
      this.tmp = { q: new this.T.Quaternion(), q2: new this.T.Quaternion(), v: new this.T.Vector3(), f: new this.T.Vector3(), r: new this.T.Vector3(), u: new this.T.Vector3(), e: new this.T.Euler(), c: new this.T.Vector3(), up: new this.T.Vector3() };
      this.AX = { x: new this.T.Vector3(1, 0, 0), y: new this.T.Vector3(0, 1, 0), z: new this.T.Vector3(0, 0, 1) };
      this.load();
      this.device = this.detect();
      this._buildSticks(game.hud);
      this._buildInstruments(game.hud);
      this._buildPanel(game.hud);
      this._buildPicker(game.hud);
      window.addEventListener('resize', () => this.layout());
      window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 150));
      window.addEventListener('gamepadconnected', (e) => this._padConnected(e));
      window.addEventListener('gamepaddisconnected', (e) => this._padDisconnected(e));
      game.hud.root.addEventListener('gesturestart', (e) => e.preventDefault());     // iOS pinch
      game.hud.root.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.s3g-stick')) e.preventDefault(); });
      try { if (navigator.getGamepads && Array.prototype.some.call(navigator.getGamepads() || [], p => p && p.connected)) this._startPadLoop(); } catch (e) { /* ignore */ }
      this.setMode(this.mode, { quiet: true });
      this.layout();
    },

    layout() {
      const g = this.game; if (!g || !g.hud) return;
      this.device = this.detect();
      const r = g.hud.root, d = this.device;
      r.dataset.device = d.cls; r.dataset.orient = d.orient;
      r.classList.toggle('s3g-lefty', !!this.opts.leftHanded);
      if (this.devLine) this.devLine.textContent = this.deviceText();
      if (this.padLine) this.padLine.textContent = this.padText();
    },
    deviceText() {
      const d = this.device;
      return 'Your device: ' + d.cls + ' · ' + (d.touchPrimary ? 'touch' : d.touchCapable ? 'mouse + keyboard (touch screen too)' : 'mouse + keyboard') + ' · ' + d.orient + ' ' + d.w + '×' + d.h;
    },
    padText() { return this.pad ? '🎮 controller: ' + this.pad.id.slice(0, 40) : '🎮 no controller yet (press any button on it)'; },

    // ---------- modes ----------
    current() { return this.MODES[this.mode]; },
    setMode(id, o) {
      o = o || {};
      if (!this.MODES[id]) return false;
      const g = this.game, was = this.MODES[this.mode], flightWas = !!(was && was.flight);
      this.mode = id;
      if (o.user) { this.opts.modeChosen = true; this.opts.mode = id; this.padSwitched = true; this.save(); }
      const m = this.MODES[id], f = this.flight;
      if (g && g.camera && flightWas && !m.flight) { g.camera.up.set(0, 1, 0); f.w.roll = f.w.pitch = f.w.yaw = 0; }
      if (g && m.flight && !flightWas) { f.speed = g.shipVel ? g.shipVel.length() : 0; f.w.roll = f.w.pitch = f.w.yaw = 0; f.edge = false; }
      if (g && g.hud) {
        const r = g.hud.root;
        this.order.forEach(k => r.classList.toggle('s3g-steer-' + k, k === id));
        if (this.modeBtns) Object.keys(this.modeBtns).forEach(k => { this.modeBtns[k].classList.toggle('active', k === id); this.optModeBtns[k].classList.toggle('active', k === id); });
        if (this.hintEl) this.hintEl.textContent = m.hint;
        if (this.optHint) this.optHint.textContent = m.hint;
        if (this.instr) this.instr.hidden = !m.flight;
        if (!o.quiet) g._status(m.icon + ' Steering: ' + m.label + ' — ' + m.hint, 'ok');
      }
      return true;
    },

    // ---------- the command ----------
    command(game, dt) {
      const m = this.current() || this.MODES.classic;
      const cmd = m.read(game, dt, this.opts);
      this.last = cmd;
      return cmd;
    },

    // ---------- Cessna flight ----------
    fly(game, cmd, dt) {
      const T = this.T, t = this.tmp, f = this.flight, o = this.opts, A = ASSIST[o.assist], ship = game.ship, q = ship.quaternion, AX = this.AX;
      const fwd = t.f.set(0, 0, -1).applyQuaternion(q), rgt = t.r.set(1, 0, 0).applyQuaternion(q), up = t.u.set(0, 1, 0).applyQuaternion(q);
      const bank = Math.atan2(-rgt.y, up.y), pitchAng = Math.asin(clamp(fwd.y, -1, 1));
      f.bank = bank; f.pitchAng = pitchAng;
      let roll = cmd.rollRate, pitch = cmd.pitchRate, yaw = cmd.yawRate;
      if (A.limit) { if (pitchAng > FLIGHT.pitchLimit && pitch > 0) pitch = 0; if (pitchAng < -FLIGHT.pitchLimit && pitch < 0) pitch = 0; }
      if (A.level) {
        roll += clamp(-bank * 1.3, -1, 1) * (1 - Math.min(1, Math.abs(cmd.rollRate) * 3));                    // wings level when the stick is centred
        pitch += clamp(-pitchAng * 0.9, -1, 1) * (1 - Math.min(1, Math.abs(cmd.pitchRate) * 3));              // nose to the horizon
        yaw += Math.sin(bank) * Math.cos(pitchAng) * 0.9;                                                      // banked turn
      }
      const s = o.sens, w = f.w, step = (key, c, max) => {
        if (Math.abs(c) > 0.02) w[key] += (clamp(c, -1.2, 1.2) * max * s - w[key]) * (1 - Math.exp(-dt / A.follow));
        else w[key] *= Math.exp(-dt / A.damp);
      };
      step('roll', roll, FLIGHT.maxRoll); step('pitch', pitch, FLIGHT.maxPitch); step('yaw', yaw, FLIGHT.maxYaw);
      q.multiply(t.q.setFromAxisAngle(AX.z, -w.roll * dt));          // roll right = wing down
      q.multiply(t.q.setFromAxisAngle(AX.x, w.pitch * dt));          // nose up
      q.multiply(t.q.setFromAxisAngle(AX.y, -w.yaw * dt));           // turn right
      // soft turn-back: near the arena edge, heading outwards, the nose is eased round towards the centre
      const pos = ship.position, d = pos.length();
      f.edge = false; f.slow = 1;
      if (d > R_SOFT) {
        f.slow = 1 - 0.7 * clamp((d - R_SOFT) / (R_HARD - R_SOFT), 0, 1);      // ease off the speed as the wall nears
        t.c.copy(pos).multiplyScalar(-1 / d);                          // towards the centre
        fwd.set(0, 0, -1).applyQuaternion(q);
        const out = fwd.dot(t.c) < 0.15;                               // not already heading back in
        if (out) {
          const k = clamp((d - R_SOFT) / (R_HARD - R_SOFT), 0, 1), ang = Math.acos(clamp(fwd.dot(t.c), -1, 1));
          t.v.copy(fwd).cross(t.c);
          if (t.v.lengthSq() < 1e-8) t.v.set(0, 1, 0);
          t.v.normalize();
          q.premultiply(t.q2.setFromAxisAngle(t.v, Math.min(ang, (1.0 + 3.2 * k) * dt)));
          f.edge = true; f.softTurns++;
        }
      }
      q.normalize();
      // throttle → speed; velocity follows the nose with a little slide in turns
      fwd.set(0, 0, -1).applyQuaternion(q);
      const target = Math.max(FLIGHT.minSpeed, (FLIGHT.minSpeed + (FLIGHT.maxSpeed - FLIGHT.minSpeed) * cmd.throttle) * f.slow);
      f.speed += (target - f.speed) * (1 - Math.exp(-dt * (f.slow < 1 ? 3 : 1.2)));
      game.shipVel.lerp(t.v.copy(fwd).multiplyScalar(f.speed), 1 - Math.exp(-dt * 3.5));
      if (game.shipVel.length() > FLIGHT.maxSpeed) game.shipVel.setLength(FLIGHT.maxSpeed);
      pos.addScaledVector(game.shipVel, dt);
      const dn = pos.length();
      if (dn > R_HARD) {                                               // last resort: slide along the wall, no bounce
        pos.setLength(R_HARD);
        t.c.copy(pos).normalize();
        const vo = game.shipVel.dot(t.c); if (vo > 0) game.shipVel.addScaledVector(t.c, -vo);
        f.hardClamps++;
      }
      f.maxDist = Math.max(f.maxDist, pos.length());
      // keep Game.yaw / Game.pitch in step (switching back to Classic continues from here, level)
      t.e.setFromQuaternion(q, 'YXZ'); game.yaw = t.e.y; game.pitch = clamp(t.e.x, -1.35, 1.35);
      game.engine.scale.setScalar(0.32 + 0.3 * cmd.throttle + (cmd.throttle > 0.05 ? Math.random() * 0.12 : 0));
      game.shipLight.position.copy(pos);
      // chase camera: same offset as Classic, "up" blends halfway towards the ship's up
      const off = t.v.set(0, 2.8, 9.5).applyQuaternion(q);
      t.c.copy(pos).add(off);
      game.camera.position.lerp(t.c, 1 - Math.exp(-dt * 7));
      up.set(0, 1, 0).applyQuaternion(q);
      t.up.copy(game.camera.up).lerp(t.c.set(0, 1, 0).lerp(up, 0.55), 1 - Math.exp(-dt * 5)).normalize();
      game.camera.up.copy(t.up);
      fwd.set(0, 0, -1).applyQuaternion(q);
      game.camera.lookAt(t.v.copy(pos).addScaledVector(fwd, 10));
      this._drawInstruments(game);
    },

    // ---------- instruments ----------
    _buildInstruments(h) {
      const cv = el('canvas', { className: 's3g-att', width: 112, height: 112 });
      this.attCanvas = cv;
      this.spdEl = el('div', { className: 's3g-instr-spd', text: 'SPD 0' });
      this.thrFill = el('div', { className: 's3g-thr-fill' });
      this.thrTxt = el('div', { className: 's3g-instr-thr', text: 'THR 35%' });
      this.edgeEl = el('div', { className: 's3g-instr-edge', text: '⚠ ARENA EDGE · TURNING BACK' }); this.edgeEl.hidden = true;
      this.instr = el('div', { className: 's3g-instr', hidden: '' }, [
        el('div', { className: 's3g-instr-row' }, [cv, el('div', { className: 's3g-thr' }, [this.thrFill])]),
        this.spdEl, this.thrTxt, this.edgeEl]);
      this.instr.hidden = true;
      h.root.appendChild(this.instr);
    },
    _drawInstruments(game) {
      const f = this.flight, cv = this.attCanvas, ctx = cv.getContext('2d');
      const css = cv.clientWidth || 96, px = Math.round(css * Math.min(window.devicePixelRatio || 1, 2));
      if (cv.width !== px) { cv.width = px; cv.height = px; }
      const S = cv.width, c = S / 2, k = S / 2 / 0.9;
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.clip();
      ctx.translate(c, c); ctx.rotate(-f.bank);
      const py = f.pitchAng * (S * 0.5 / 0.7);                                   // 0.7 rad (40°) = half the dial
      ctx.fillStyle = '#0b5a8a'; ctx.fillRect(-S, -S * 2 + py, S * 2, S * 2);       // sky
      ctx.fillStyle = '#6a4a1a'; ctx.fillRect(-S, py, S * 2, S * 2);                // ground
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, S / 56);
      ctx.beginPath(); ctx.moveTo(-S, py); ctx.lineTo(S, py); ctx.stroke();
      for (let a = -30; a <= 30; a += 10) {                                          // pitch ladder
        if (!a) continue;
        const y = py - (a * Math.PI / 180) * (S * 0.5 / 0.7), wd = a % 20 ? S * 0.09 : S * 0.16;
        ctx.beginPath(); ctx.moveTo(-wd, y); ctx.lineTo(wd, y); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#00ff41'; ctx.lineWidth = Math.max(2, S / 40);              // fixed aircraft symbol + ring
      ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffe066';
      ctx.beginPath(); ctx.moveTo(c - S * 0.3, c); ctx.lineTo(c - S * 0.1, c); ctx.lineTo(c, c + S * 0.07); ctx.lineTo(c + S * 0.1, c); ctx.lineTo(c + S * 0.3, c); ctx.stroke();
      this.spdEl.textContent = 'SPD ' + Math.round(game.shipVel.length());
      const thr = Math.round(this.flight.throttle * 100);
      this.thrFill.style.height = thr + '%'; this.thrTxt.textContent = 'THR ' + thr + '%';
      this.edgeEl.hidden = !f.edge;
      if (this.sticks) this.sticks.L.el.style.setProperty('--thr', thr + '%');
    },

    // ---------- touch sticks (Cessna) ----------
    _buildSticks(h) {
      const mk = (side, label) => {
        const knob = el('div', { className: 's3g-stick-knob' });
        const lab = el('div', { className: 's3g-stick-label', text: label });
        const e = el('div', { className: 's3g-stick s3g-stick-' + (side === 'L' ? 'left' : 'right') }, [lab, knob]);
        const st = this.stick[side];
        const set = (ev) => {
          const r = e.getBoundingClientRect(), R = r.width / 2;
          let x = (ev.clientX - (r.left + R)) / R, y = (ev.clientY - (r.top + R)) / R;
          const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
          st.tx = x; st.ty = y; st.x = x; st.y = y;
        };
        e.addEventListener('pointerdown', (ev) => {
          if (st.id !== null) return;
          ev.preventDefault(); ev.stopPropagation();
          st.id = ev.pointerId;
          try { e.setPointerCapture(ev.pointerId); } catch (x) { /* ignore */ }
          const g = this.game; g.touchMode = true; h.root.classList.add('s3g-touch'); if (!g.started) g.start();
          set(ev);
        });
        e.addEventListener('pointermove', (ev) => { if (ev.pointerId === st.id) { ev.preventDefault(); set(ev); } });
        const end = (ev) => { if (ev.pointerId !== st.id) return; st.id = null; st.tx = 0; st.ty = 0; };
        e.addEventListener('pointerup', end); e.addEventListener('pointercancel', end); e.addEventListener('lostpointercapture', end);
        e.addEventListener('contextmenu', (ev) => ev.preventDefault());
        h.root.appendChild(e);
        return { el: e, knob };
      };
      this.sticks = { L: mk('L', 'RUDDER ◀ ▶\nTHROTTLE ▲ ▼'), R: mk('R', 'AILERON ◀ ▶\nELEVATOR ▲ ▼') };
    },
    // spring to centre with easing while released; knob follows the finger
    _easeSticks(dt) {
      ['L', 'R'].forEach(k => {
        const st = this.stick[k], s = this.sticks[k], a = 1 - Math.exp(-dt * 16);
        if (st.id === null) { st.x += (0 - st.x) * a; st.y += (0 - st.y) * a; if (Math.abs(st.x) < 0.004) st.x = 0; if (Math.abs(st.y) < 0.004) st.y = 0; }
        const R = (s.el.offsetWidth || 100) / 2;
        s.knob.style.transform = 'translate(' + (st.x * R * 0.55) + 'px,' + (st.y * R * 0.55) + 'px)';
      });
    },

    // ---------- controller ----------
    _padConnected(e) {
      this._startPadLoop();
      if (this.game) this.game._status('🎮 Controller connected: ' + ((e.gamepad && e.gamepad.id) || 'gamepad') + (this.mode === 'gamepad' ? '' : ' — press a button to use it (or choose Gamepad in Options)'), 'ok');
      this.layout();
    },
    _padDisconnected(e) {
      if (this.game) this.game._status('🎮 Controller disconnected: ' + ((e.gamepad && e.gamepad.id) || 'gamepad'), 'warn');
      const left = this._pads().length;
      if (!left) { this.pad = null; this.padPrev = null; this.fireHeld = false; }
      this.layout();
    },
    _pads() { try { return Array.prototype.filter.call((navigator.getGamepads && navigator.getGamepads()) || [], p => p && p.connected); } catch (e) { return []; } },
    _startPadLoop() {
      if (this.padLoop) return;
      const loop = () => { this.padLoop = requestAnimationFrame(loop); this._pollPad(); };
      this.padLoop = requestAnimationFrame(loop);
    },
    _pollPad() {
      const g = this.game, pads = this._pads();
      if (!pads.length) { if (this.pad) { this.pad = null; this.layout(); } return; }
      const p = pads[0];
      const snap = { id: p.id, mapping: p.mapping, axes: Array.prototype.slice.call(p.axes), v: Array.prototype.map.call(p.buttons, b => (typeof b === 'object' ? b.value : +b)), p: Array.prototype.map.call(p.buttons, b => (typeof b === 'object' ? !!b.pressed : !!b)) };
      const prev = this.pad; this.pad = snap;
      if (!prev) this.layout();
      const edge = (i) => snap.p[i] && !(prev && prev.p[i]);
      const anyPress = snap.p.some((x, i) => x && !(prev && prev.p[i]));
      const anyAxis = snap.axes.some(a => Math.abs(a) > 0.6);
      if ((anyPress || anyAxis) && !g.started) { g.start(); }
      if ((anyPress || anyAxis) && this.opts.autoPad && !this.padSwitched && this.mode !== 'gamepad') {
        this.padSwitched = true; this.setMode('gamepad'); g._status('🎮 Controller in use: switched to Gamepad steering (Options: ⚙ or O to change)', 'ok');
      }
      this.fireHeld = !!(snap.p[0] || snap.p[5]) && g.gun !== 'c2c';
      if (this.mode === 'classic') return;                              // buttons only act in Gamepad / Cessna
      if (edge(0) && g.gun === 'c2c') g.fireC2C();
      if (edge(14) || edge(15)) this._cycleGun(edge(15) ? 1 : -1);
      if (edge(12)) g.cycleElement(1);
      if (edge(13)) g.cycleElement(-1);
      if (edge(3)) g.identify();
      if (edge(1)) g.toggleC2CMode();
      if (edge(9)) { g.paused ? g.resume() : g.pause(); g._status(g.paused ? '⏸ Paused' : '▶ Resumed'); }
      if (edge(8)) this.togglePanel();
    },
    _cycleGun(d) {
      const g = this.game, ids = Object.keys(g.hud.gunBtns), i = ids.indexOf(g.gun);
      g.selectGun(ids[(i + d + ids.length) % ids.length]);
    },

    // ---------- options window ----------
    _buildPanel(h) {
      const o = this.opts;
      const row = (label, ctl, info) => el('div', { className: 's3g-optrow' }, [el('span', { className: 's3g-optname', text: label }), ctl, info ? el('span', { className: 's3g-gridinfo', text: info }) : el('span')]);
      this.optModeBtns = {};
      const modeRow = el('div', { className: 's3g-steerbtns' });
      this.order.forEach(id => { const b = this._modeBtn(id); this.optModeBtns[id] = b; modeRow.appendChild(b); });
      this.optHint = el('div', { className: 's3g-small s3g-opthint' });
      const slider = (key, min, max, step, fmt) => {
        const out = el('span', { className: 's3g-optval' });
        const inp = el('input', { type: 'range', min, max, step, 'data-opt': key }); inp.value = o[key];
        const upd = () => { out.textContent = fmt(o[key]); };
        inp.addEventListener('input', () => { o[key] = +inp.value; upd(); this.save(); });
        inp.addEventListener('change', () => inp.blur());
        upd();
        const w = el('span', { className: 's3g-optctl' }, [inp, out]); w.input = inp; w.sync = () => { inp.value = o[key]; upd(); }; return w;
      };
      const check = (key, after) => {
        const inp = el('input', { type: 'checkbox', 'data-opt': key }); inp.checked = !!o[key];
        inp.addEventListener('change', () => { o[key] = inp.checked; this.save(); if (after) after(); inp.blur(); });
        const w = el('span', { className: 's3g-optctl' }, [inp]); w.input = inp; return w;
      };
      this.ctl = {
        sens: slider('sens', 0.5, 2, 0.05, v => '×' + v.toFixed(2)),
        deadzone: slider('deadzone', 0, 0.25, 0.01, v => Math.round(v * 100) + '%'),
        expo: slider('expo', 0, 0.6, 0.05, v => Math.round(v * 100) + '%'),
        invertPitch: check('invertPitch'), leftHanded: check('leftHanded', () => this.layout()), autoPad: check('autoPad')
      };
      this.assistBtns = {};
      const asRow = el('div', { className: 's3g-steerbtns' });
      Object.keys(ASSIST).forEach(k => {
        const b = el('button', { type: 'button', className: 's3g-btn s3g-assistbtn', text: ASSIST[k].label, title: ASSIST[k].info, 'data-assist': k });
        b.addEventListener('click', () => { o.assist = k; this.save(); this._syncPanel(); });
        this.assistBtns[k] = b; asRow.appendChild(b);
      });
      this.assistInfo = el('span', { className: 's3g-gridinfo' });
      this.devLine = el('div', { className: 's3g-small' }); this.padLine = el('div', { className: 's3g-small' });
      const reset = el('button', { type: 'button', className: 's3g-btn', text: '↺ Defaults' });
      reset.addEventListener('click', () => { Object.assign(o, DEFAULTS); this.save(); this.setMode('classic', { quiet: true }); this._syncPanel(); this.layout(); });
      const close = el('button', { type: 'button', className: 's3g-btn', text: '✕ Close' });
      close.addEventListener('click', () => this.togglePanel(false));
      const panel = el('div', { className: 's3g-panel s3g-optpanel', hidden: '' }, [
        el('div', { className: 's3g-panel-title', text: '⚙ STEERING OPTIONS' }),
        row('Steering mode', modeRow), this.optHint,
        row('Sensitivity', this.ctl.sens, 'turn speed (Classic: only if not ×1.00)'),
        row('Invert pitch', this.ctl.invertPitch, 'flips up and down on keys, sticks and pads'),
        row('Assist level', asRow, ''), el('div', { className: 's3g-small' }, [this.assistInfo]),
        row('Left-handed', this.ctl.leftHanded, 'swap the two touch sticks and the button bar'),
        row('Deadzone', this.ctl.deadzone, 'Cessna sticks and gamepads'),
        row('Expo curve', this.ctl.expo, 'softer around the centre'),
        row('Auto-switch to pad', this.ctl.autoPad, 'use a controller as soon as you press it'),
        row('Tilt steering', el('span', { className: 's3g-optctl', text: 'later' }), 'phone tilt control is a follow-up'),
        this.devLine, this.padLine,
        el('div', { className: 's3g-row' }, [reset, close])
      ]);
      panel.hidden = true;
      h.root.appendChild(panel);
      this.panel = panel;
      // gear button in the top-left cluster, below the ℹ️ toggle, so it stays visible on a clean screen
      const gear = el('button', { type: 'button', className: 's3g-ptog s3g-ptog-gear', text: '⚙', title: 'Steering options (O)' });
      gear.addEventListener('click', () => this.togglePanel());
      const tl = h.root.querySelector('.s3g-tl');
      if (tl) tl.insertBefore(gear, tl.children[1] || null); else h.root.appendChild(gear);
      this.gear = gear;
      this._syncPanel();
    },
    _syncPanel() {
      const o = this.opts;
      Object.keys(this.ctl).forEach(k => { const w = this.ctl[k]; if (w.input.type === 'checkbox') w.input.checked = !!o[k]; else w.sync(); });
      Object.keys(this.assistBtns).forEach(k => this.assistBtns[k].classList.toggle('active', k === o.assist));
      this.assistInfo.textContent = ASSIST[o.assist].info;
      this.layout();
    },
    togglePanel(show) {
      const p = this.panel; if (!p) return false;
      p.hidden = show == null ? !p.hidden : !show;
      if (!p.hidden) { if (G.Keys && G.Keys.panel && !G.Keys.panel.hidden) G.Keys.toggle(false); this._syncPanel(); }
      return !p.hidden;
    },

    // ---------- start screen picker ----------
    _modeBtn(id) {
      const m = this.MODES[id];
      const b = el('button', { type: 'button', className: 's3g-btn s3g-steerbtn', text: m.icon + ' ' + m.label, title: m.hint, 'data-mode': id });
      b.addEventListener('click', () => this.setMode(id, { user: true }));
      return b;
    },
    _buildPicker(h) {
      this.modeBtns = {};
      const row = el('div', { className: 's3g-steerbtns' });
      this.order.forEach(id => { const b = this._modeBtn(id); this.modeBtns[id] = b; row.appendChild(b); });
      this.hintEl = el('div', { className: 's3g-small s3g-steerhint' });
      const opt = el('button', { type: 'button', className: 's3g-btn', text: '⚙ Options' }); opt.addEventListener('click', () => this.togglePanel(true));
      const box = el('div', { className: 's3g-steerpick' }, [el('b', { text: 'Steering' }), row, this.hintEl, opt]);
      const so = h.startOverlay, startBtn = so.querySelector('.s3g-start-btn');
      so.insertBefore(box, startBtn ? startBtn.nextSibling : so.firstChild.nextSibling);
    },

    debugState() {
      const f = this.flight, g = this.game;
      return { mode: this.mode, opts: Object.assign({}, this.opts), device: this.detect(), stored: (() => { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; } })(),
        flight: { throttle: f.throttle, speed: f.speed, bank: f.bank, pitchAng: f.pitchAng, edge: f.edge, hardClamps: f.hardClamps, softTurns: f.softTurns, maxDist: f.maxDist, w: Object.assign({}, f.w) },
        sticks: { L: { x: this.stick.L.x, y: this.stick.L.y, active: this.stick.L.id !== null }, R: { x: this.stick.R.x, y: this.stick.R.y, active: this.stick.R.id !== null } },
        pad: this.pad ? { id: this.pad.id } : null, fireHeld: this.fireHeld, last: this.last, panelOpen: !!(this.panel && !this.panel.hidden), instrVisible: !!(this.instr && !this.instr.hidden),
        camUp: g && g.camera ? { x: g.camera.up.x, y: g.camera.up.y, z: g.camera.up.z } : null };
    }
  };

  // ================= MODE: classic (exactly today's behaviour) =================
  function padAxes(S, o, cmd) {                       // controller sticks in classic style (Gamepad mode)
    const p = S.pad; if (!p) return;
    const ax = (i) => shape(p.axes[i] || 0, o.deadzone, o.expo);
    cmd.move.x += ax(0); cmd.move.z += ax(1);
    cmd.move.y += (p.v[7] || 0) - (p.v[6] || 0);
    cmd.yawRate += ax(2); cmd.pitchRate += -ax(3);
  }
  Steering.register('classic', {
    label: 'Classic', icon: '🕹️', hint: 'W A S D + R F fly, arrows or right-drag turn; touch: move pad + steer pad.',
    read(game, dt, o) {
      const h = (id) => game.held(id), t = game.touch, inv = o.invertPitch ? -1 : 1, s = o.sens;   // key names come from the bindings table (js/s3g-keys.js)
      const cmd = { attitude: 'euler', move: { x: num(h('moveRight')) - num(h('moveLeft')), y: num(h('moveUp')) - num(h('moveDown')), z: num(h('moveBack')) - num(h('moveForward')) },
        yawRate: num(h('turnRight')) - num(h('turnLeft')), pitchRate: num(h('pitchUp')) - num(h('pitchDown')), rollRate: 0, yawDelta: 0, pitchDelta: 0, throttle: null };
      if (t.pad) { cmd.yawRate += t.pad.x; cmd.pitchRate -= t.pad.y; }
      if (t.steer) { cmd.yawDelta = t.steer.dx * 0.004; cmd.pitchDelta = -t.steer.dy * 0.004; t.steer.dx = t.steer.dy = 0; }
      if (t.joy) { cmd.move.x += t.joy.x; cmd.move.z += t.joy.y; }
      if (t.move) { cmd.move.x += t.move.x; cmd.move.z += t.move.y; }
      if (Steering.current().id === 'gamepad') padAxes(Steering, o, cmd);
      cmd.yawRate *= s; cmd.yawDelta *= s; cmd.pitchRate *= s * inv; cmd.pitchDelta *= s * inv;
      return cmd;
    }
  });
  Steering.register('cessna', {
    label: 'Cessna', icon: '✈️', flight: true,
    hint: 'A/D aileron (roll) · W/S elevator (pitch, S = pull up) · Q/E rudder · R/F throttle (held). Touch: right stick aileron + elevator, left stick rudder + throttle.',
    read(game, dt, o) {
      const S = Steering, f = S.flight, h = (id) => game.held(id), kb = f.kb, inv = o.invertPitch ? -1 : 1;
      const tgt = { roll: num(h('moveRight') || h('turnRight')) - num(h('moveLeft') || h('turnLeft')),
        pitch: num(h('moveBack') || h('pitchDown')) - num(h('moveForward') || h('pitchUp')),
        yaw: num(h('rudderRight')) - num(h('rudderLeft')) };
      Object.keys(tgt).forEach(a => { const r = (tgt[a] === 0 ? 10 : 5) * dt; kb[a] += clamp(tgt[a] - kb[a], -r, r); });   // keys ramp in and out
      S._easeSticks(dt);
      const L = S.stick.L, R = S.stick.R, dz = o.deadzone, ex = o.expo;
      let roll = kb.roll + shape(R.x, dz, ex), pitch = kb.pitch + shape(R.y, dz, ex), yaw = kb.yaw + shape(L.x, dz, ex);
      let thr = num(h('moveUp')) - num(h('moveDown'));
      thr = thr * FLIGHT.throttleRate - shape(L.y, dz, ex) * FLIGHT.stickThrottleRate;
      const p = S.pad;
      if (p) {
        const ax = (i) => shape(p.axes[i] || 0, dz, ex);
        roll += ax(2); pitch += ax(3); yaw += ax(0);
        thr += ((p.v[7] || 0) - (p.v[6] || 0)) * FLIGHT.throttleRate - ax(1) * FLIGHT.stickThrottleRate;
      }
      f.throttle = clamp(f.throttle + thr * dt, 0, 1);
      return { attitude: 'quat', move: { x: 0, y: 0, z: 0 }, rollRate: clamp(roll, -1, 1), pitchRate: clamp(pitch, -1, 1) * inv, yawRate: clamp(yaw, -1, 1), yawDelta: 0, pitchDelta: 0, throttle: f.throttle };
    }
  });
  Steering.register('gamepad', {
    label: 'Gamepad', icon: '🎮', hint: 'Press any button on your controller. Left stick move, right stick turn, L2 / R2 down / up, A or R1 fire, D-pad gun / element, Y identify, Start pause, Select options.',
    read(game, dt, o) { return Steering.MODES.classic.read(game, dt, o); }
  });

  G.Steering = Steering;
})();
