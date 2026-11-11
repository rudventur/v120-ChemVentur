/* CHEMVENTUR Stage 3: KEYBOARD LAYER (F2 = keyboard options window, 🔤 button).
   One bindings table for every action. Keys are matched by event.code (the physical position of the key), so the
   game works on any keyboard layout: Polish, German, French, Russian, Greek, Dvorak and so on.
   Labels show the character printed on the player's OWN key: navigator.keyboard.getLayoutMap() where it exists
   (Chromium), otherwise the character learned from key presses, otherwise a name derived from the code.
   Rebinding window: click a key slot, press the new key (Escape cancels, Backspace clears), conflict detection with
   a "take it" choice, reset, presets. Saved in localStorage cv.s3g.keys.v1.
   Input hygiene (Keys.ignoreReason): hotkeys are ignored while Ctrl, Meta, AltGr or Alt are held, during IME
   composition, and when the focus is in an input, textarea, select or editable element. Held keys are cleared when
   the window loses focus or the tab is hidden.
   The keyboard button and the start-screen link only show once a physical keyboard is detected (a fine pointer with
   hover, or the first real key press). There is never an on-screen keyboard. */
(function () {
  'use strict';
  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});
  const STORE = 'cv.s3g.keys.v1';

  // id, group, label, default codes (up to two), hold (held keys: flying and fire) — hotkeys fire once per press
  const TABLE = [
    ['moveForward', 'fly', 'Fly forward', ['KeyW'], 1], ['moveBack', 'fly', 'Fly back', ['KeyS'], 1],
    ['moveLeft', 'fly', 'Strafe left', ['KeyA'], 1], ['moveRight', 'fly', 'Strafe right', ['KeyD'], 1],
    ['moveUp', 'fly', 'Up', ['KeyR'], 1], ['moveDown', 'fly', 'Down', ['KeyF'], 1],
    ['turnLeft', 'fly', 'Turn left', ['ArrowLeft'], 1], ['turnRight', 'fly', 'Turn right', ['ArrowRight'], 1],
    ['pitchUp', 'fly', 'Nose up', ['ArrowUp'], 1], ['pitchDown', 'fly', 'Nose down', ['ArrowDown'], 1],
    ['rudderLeft', 'fly', 'Rudder left (Cessna)', ['KeyQ'], 1], ['rudderRight', 'fly', 'Rudder right (Cessna)', ['KeyE'], 1],
    ['fire', 'fly', 'Fire', ['Space'], 1],
    ['gunProton', 'guns', 'Proton shotgun', ['Digit1']], ['gunNeutron', 'guns', 'Neutron shotgun', ['Digit2']],
    ['gunElectron', 'guns', 'Electrogun', ['Digit3']], ['gunC2c', 'guns', 'c2c tone gun', ['Digit4']],
    ['gunChaos', 'guns', 'Chaos shotgun', ['Digit5']], ['gunMix', 'guns', 'Mix shotgun', ['Backquote']], ['gunAtom', 'guns', 'Atom gun', ['Digit6']],
    ['gunShotgun', 'guns', 'Atom shotgun', ['Digit7']], ['gunAnti', 'guns', 'Anti gun', ['Digit8']],
    ['gunGrav', 'guns', 'Gravity gun', ['Digit9']], ['gunTime', 'guns', 'Time gun', ['Digit0']], ['gunNet', 'guns', 'Scrap net gun', ['KeyN']], ['repair', 'game', 'Repair ship with metal', ['KeyU']],
    ['powerUp', 'guns', 'More power or volts', ['Equal', 'NumpadAdd']], ['powerDown', 'guns', 'Less power or volts', ['Minus', 'NumpadSubtract']],
    ['elementPrev', 'guns', 'Previous element', ['KeyZ']], ['elementNext', 'guns', 'Next element', ['KeyX']],
    ['c2cMode', 'guns', 'c2c chromatic or major', ['KeyC']],
    ['rain', 'game', 'Molecule rain', ['KeyM']], ['grid', 'game', 'Grid panel', ['KeyG']], ['help', 'game', 'Help', ['KeyH']],
    ['bots', 'game', 'Bots', ['KeyJ']], ['discovery', 'game', 'Discovery banners (Shift: reset)', ['KeyK']],
    ['identify', 'game', 'What did I build?', ['KeyB']], ['swap', 'game', 'Swap in PubChem 3D conformer', ['KeyT']],
    ['pause', 'game', 'Pause', ['KeyP']], ['options', 'game', 'Steering options', ['KeyO']],
    ['keysWindow', 'game', 'Keyboard options', ['F2']]
  ];
  const GROUPS = { fly: 'Flying and firing', guns: 'Guns and elements', game: 'Game' };
  const ACTIONS = TABLE.map(r => ({ id: r[0], group: r[1], label: r[2], codes: r[3].slice(), hold: !!r[4] }));
  const BY_ID = {}; ACTIONS.forEach(a => { BY_ID[a.id] = a; });
  const defaultsOf = () => { const o = {}; ACTIONS.forEach(a => { o[a.id] = [a.codes[0] || null, a.codes[1] || null]; }); return o; };

  // presets: overrides on top of the defaults (a preset is always complete and conflict-free: the tests check it)
  const PRESETS = {
    wasd: { label: 'W A S D', info: 'The default: W A S D fly, arrows turn.', set: {} },
    arrows: { label: 'Arrow keys', info: 'Arrow keys fly, W A S D turn.', set: {
      moveForward: ['ArrowUp'], moveBack: ['ArrowDown'], moveLeft: ['ArrowLeft'], moveRight: ['ArrowRight'],
      pitchUp: ['KeyW'], pitchDown: ['KeyS'], turnLeft: ['KeyA'], turnRight: ['KeyD'] } },
    esdf: { label: 'E S D F', info: 'E S D F fly (more room for the little finger), arrows turn, V is down, W is rudder right.', set: {
      moveForward: ['KeyE'], moveLeft: ['KeyS'], moveBack: ['KeyD'], moveRight: ['KeyF'], moveUp: ['KeyR'], moveDown: ['KeyV'],
      rudderLeft: ['KeyQ'], rudderRight: ['KeyW'] } },
    ijkl: { label: 'I J K L', info: 'I J K L fly with the right hand, W A S D turn with the left. Bots move to V, discovery banners to Y, the scrap net gun to the full stop key, repair to the semicolon key.', set: {
      moveForward: ['KeyI'], moveLeft: ['KeyJ'], moveBack: ['KeyK'], moveRight: ['KeyL'], moveUp: ['KeyU'], moveDown: ['KeyN'],
      pitchUp: ['KeyW'], pitchDown: ['KeyS'], turnLeft: ['KeyA'], turnRight: ['KeyD'], bots: ['KeyV'], discovery: ['KeyY'], gunNet: ['Period'], repair: ['Semicolon'] } },
    numpad: { label: 'Left-handed numpad', info: 'Mouse in your left hand: the number pad flies (8 4 5 6, 9 up, 7 down, 1 and 3 rudder), 0 fires, arrows turn.', set: {
      moveForward: ['Numpad8'], moveLeft: ['Numpad4'], moveBack: ['Numpad5', 'Numpad2'], moveRight: ['Numpad6'], moveUp: ['Numpad9'], moveDown: ['Numpad7'],
      rudderLeft: ['Numpad1'], rudderRight: ['Numpad3'], fire: ['Space', 'Numpad0'] } }
  };
  const PRESET_ORDER = ['wasd', 'arrows', 'esdf', 'ijkl', 'numpad'];

  // codes that can never be bound: they are fixed (Escape, Tab), or the guards ignore them (Ctrl, Alt, Meta)
  const FORBIDDEN = /^(Escape|Tab|Enter|Backspace|Delete|Control(Left|Right)|Alt(Left|Right)|Meta(Left|Right)|OS(Left|Right)|ContextMenu|Unidentified|Dead)$/;

  const NAMES = { Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Minus: '-', Equal: '=', NumpadAdd: 'Num +', NumpadSubtract: 'Num -',
    NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .', NumpadEnter: 'Num Enter', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
    Comma: ',', Period: '.', Slash: '/', Backquote: '`', IntlBackslash: '<', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', CapsLock: 'Caps Lock', Insert: 'Insert',
    Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down' };
  function derive(code) {
    if (!code) return '—';
    if (NAMES[code]) return NAMES[code];
    let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
    m = /^Digit(\d)$/.exec(code); if (m) return m[1];
    m = /^Numpad(\d)$/.exec(code); if (m) return 'Num ' + m[1];
    return code.replace(/([a-z])([A-Z0-9])/g, '$1 $2');
  }

  function el(tag, props, kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === 'text') e.textContent = v; else if (k === 'className') e.className = v; else e.setAttribute(k, v); });
    (kids || []).forEach(k => e.appendChild(k));
    return e;
  }

  const Keys = {
    ACTIONS, GROUPS, PRESETS, PRESET_ORDER, FORBIDDEN, STORE,
    bind: defaultsOf(), preset: 'wasd', game: null,
    detected: false, detectedBy: null, layoutSource: 'derived',
    _map: null, _learned: {}, _by: {}, _subs: {}, _links: [], capturing: null, panel: null, btn: null,

    // ---------- events ----------
    on(ev, fn) { (this._subs[ev] = this._subs[ev] || []).push(fn); },
    emit(ev, d) { (this._subs[ev] || []).forEach(fn => { try { fn(d); } catch (e) { console.error(e); } }); },

    // ---------- lookups ----------
    info(id) { return BY_ID[id]; },
    codes(id) { return (this.bind[id] || []).filter(Boolean); },
    matches(id, code) { return this.codes(id).indexOf(code) !== -1; },
    held(set, id) { const c = this.codes(id); for (let i = 0; i < c.length; i++) if (set.has(c[i])) return true; return false; },
    actionFor(code) { return this._by[code] || null; },
    owners(code, exceptId) { return ACTIONS.filter(a => a.id !== exceptId && this.matches(a.id, code)).map(a => a.id); },
    _index() { this._by = {}; ACTIONS.forEach(a => { this.codes(a.id).forEach(c => { if (!this._by[c]) this._by[c] = a.id; }); }); },

    // ---------- labels ----------
    label(code) {
      if (!code) return '—';
      let ch = null;
      try { if (this._map) ch = this._map.get(code); } catch (e) { ch = null; }
      if (!ch) ch = this._learned[code];
      if (ch && ch.length <= 2 && ch.trim()) return ch.toLocaleUpperCase();
      return derive(code);
    },
    labelFor(id, sep) { const c = this.codes(id); return c.length ? c.map(x => this.label(x)).join(sep || ' / ') : 'no key'; },
    tag(id) { return ' (' + this.labelFor(id, ' or ') + ')'; },
    describeLayout() {
      return this.layoutSource === 'map' ? 'Key names come from your own keyboard layout.'
        : this.layoutSource === 'learned' ? 'Key names are learned as you press keys (your browser does not share the layout).'
          : 'Key names are standard ones until you press keys (your browser does not share the layout).';
    },
    _loadLayout() {
      try {
        const kb = navigator.keyboard;
        if (!kb || !kb.getLayoutMap) return;
        const read = () => kb.getLayoutMap().then(m => { this._map = m; this.layoutSource = 'map'; this.emit('change', { why: 'layout' }); }).catch(() => { /* blocked: stay with learned names */ });
        read();
        if (kb.addEventListener) kb.addEventListener('layoutchange', read);
      } catch (e) { /* ignore */ }
    },
    _learn(e) {
      if (this.layoutSource === 'map') return;
      if (e.ctrlKey || e.metaKey || e.altKey || !e.code || !e.key || e.key.length !== 1 || e.key === ' ') return;
      if (/^(Numpad|Arrow)/.test(e.code)) return;
      const k = e.key.toLocaleUpperCase();
      if (this._learned[e.code] === k) return;
      this._learned[e.code] = k; this.layoutSource = 'learned';
      this.emit('change', { why: 'learned' });
    },

    // ---------- bindings ----------
    set(id, slot, code, opt) {
      opt = opt || {};
      if (!BY_ID[id] || slot < 0 || slot > 1) return { ok: false, reason: 'unknown' };
      if (code == null || code === '') { this.bind[id][slot] = null; return this._changed(); }
      if (FORBIDDEN.test(code)) return { ok: false, reason: 'forbidden', code };
      const others = this.owners(code, id);
      if (others.length && !opt.steal) return { ok: false, reason: 'conflict', code, conflicts: others };
      others.forEach(o => { this.bind[o] = this.bind[o].map(c => (c === code ? null : c)); });
      const other = this.bind[id][1 - slot]; if (other === code) this.bind[id][1 - slot] = null;
      this.bind[id][slot] = code;
      return this._changed();
    },
    _changed() { this.preset = this._matchPreset(); this._index(); this.save(); this.emit('change', { why: 'bind' }); return { ok: true }; },
    _presetBind(name) {
      const b = defaultsOf(), s = (PRESETS[name] || PRESETS.wasd).set;
      Object.keys(s).forEach(id => { b[id] = [s[id][0] || null, s[id][1] || null]; });
      return b;
    },
    _matchPreset() {
      const mine = JSON.stringify(this.bind);
      for (const n of PRESET_ORDER) if (JSON.stringify(this._presetBind(n)) === mine) return n;
      return 'custom';
    },
    applyPreset(name) { if (!PRESETS[name]) return false; this.bind = this._presetBind(name); this._changed(); return true; },
    reset() { this.applyPreset('wasd'); },
    resetOne(id) { if (!BY_ID[id]) return; const d = defaultsOf()[id]; d.forEach(c => { if (c) this.owners(c, id).forEach(o => { this.bind[o] = this.bind[o].map(x => (x === c ? null : x)); }); }); this.bind[id] = d; this._changed(); },
    conflicts() { const seen = {}, out = []; ACTIONS.forEach(a => this.codes(a.id).forEach(c => { if (seen[c] && seen[c] !== a.id) out.push([c, seen[c], a.id]); else seen[c] = a.id; })); return out; },
    save() { try { localStorage.setItem(STORE, JSON.stringify({ v: 1, preset: this.preset, bind: this.bind })); } catch (e) { /* ignore */ } },
    load() {
      this.bind = defaultsOf();
      try {
        const s = JSON.parse(localStorage.getItem(STORE) || 'null');
        if (s && s.v === 1 && s.bind && typeof s.bind === 'object') {
          Object.keys(s.bind).forEach(id => {
            if (!BY_ID[id] || !Array.isArray(s.bind[id])) return;
            const v = s.bind[id].slice(0, 2).map(c => (typeof c === 'string' && c.length < 24 && !FORBIDDEN.test(c) ? c : null));
            this.bind[id] = [v[0] || null, v[1] || null];
          });
          if (this.conflicts().length) this.bind = defaultsOf();   // a damaged save never leaves two actions on one key
        }
      } catch (e) { this.bind = defaultsOf(); }
      this.preset = this._matchPreset(); this._index();
    },

    // ---------- guards ----------
    ignoreReason(e) {
      if (e.isComposing || e.keyCode === 229) return 'composition';
      if (e.ctrlKey || e.metaKey) return 'modifier';
      if (e.getModifierState && e.getModifierState('AltGraph')) return 'altgr';
      if (e.altKey) return 'alt';
      const t = e.target;
      if (t && t.nodeType === 1 && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return 'input';
      return null;
    },

    // ---------- keyboard detection ----------
    detect(by) {
      if (this.detected) return;
      this.detected = true; this.detectedBy = by;
      this._syncVisibility(); this.emit('detect', { by });
    },
    _initDetect() {
      let fine = false;
      try { fine = !!(window.matchMedia && window.matchMedia('(any-pointer: fine) and (any-hover: hover)').matches); } catch (e) { fine = false; }
      if (fine) this.detect('pointer');
      try { const mq = window.matchMedia('(any-pointer: fine) and (any-hover: hover)'); if (mq.addEventListener) mq.addEventListener('change', (ev) => { if (ev.matches) this.detect('pointer'); }); } catch (e) { /* ignore */ }
    },
    _syncVisibility() {
      if (this.btn) this.btn.hidden = !this.detected;
      this._links.forEach(l => { l.hidden = !this.detected; });
    },
    // a button that opens the window; it stays hidden until a keyboard is detected (used on the start screen and in Options)
    makeLink(text) {
      const b = el('button', { type: 'button', className: 's3g-btn s3g-keys-link', text: text || '🔤 Keyboard options', title: 'Keyboard options' + this.tag('keysWindow') });
      b.addEventListener('click', () => this.toggle(true));
      b.hidden = !this.detected; this._links.push(b); return b;
    },

    // ---------- the window ----------
    attach(game) {
      this.game = game;
      this.load();
      this._build(game.hud);
      // links to the window: start screen (under the steering picker) and the steering options window
      const so = game.hud.startOverlay, sp = so && so.querySelector('.s3g-steerpick');
      if (so) { const row = el('div', { className: 's3g-start-keys' }, [this.makeLink('🔤 Keyboard options')]); so.insertBefore(row, sp ? sp.nextSibling : so.firstChild.nextSibling); this.startRow = row; row.hidden = !this.detected; this.on('detect', () => { row.hidden = false; }); }
      const op = game.hud.root.querySelector('.s3g-optpanel');
      if (op) { const last = op.lastElementChild; op.insertBefore(el('div', { className: 's3g-optkeys' }, [this.makeLink('🔤 Keyboard options')]), last); }
      this._initDetect();
      this._loadLayout();
      this._syncVisibility();
      this.on('change', () => { this._refreshWindow(); });
      // capture phase: runs before the game's own handler (detection, learning labels, click-to-rebind)
      window.addEventListener('keydown', (e) => this._onKey(e), true);
      const drop = () => { game.keys.clear(); game.mouse.fireHeld = false; if (game.touch) game.touch.fire = false; if (G.Steering) G.Steering.fireHeld = false; };
      window.addEventListener('blur', drop);
      document.addEventListener('visibilitychange', () => { if (document.hidden) drop(); });
      this.emit('change', { why: 'attach' });
    },
    _onKey(e) {
      if (e.key && e.key !== 'Unidentified' && e.code) this.detect('key');
      if (this.capturing) { this._capture(e); return; }
      this._learn(e);
    },
    _capture(e) {
      e.preventDefault(); e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return;
      if (/^(Shift|Control|Alt|Meta|AltGraph)$/.test(e.key) && !/^Shift/.test(e.code)) return;   // bare Ctrl / Alt / Meta: wait for a real key
      const cap = this.capturing; const code = e.code;
      if (code === 'Escape') { this._stopCapture(); this._msg('Cancelled.'); return; }
      if (code === 'Backspace' || code === 'Delete') { this._stopCapture(); this.set(cap.id, cap.slot, null); this._msg(BY_ID[cap.id].label + ': key removed.'); return; }
      this._learn(e);
      const r = this.set(cap.id, cap.slot, code);
      if (r.ok) { this._stopCapture(); this._msg(BY_ID[cap.id].label + ' is now ' + this.label(code) + '.'); return; }
      if (r.reason === 'forbidden') { this._msg(this.label(code) + ' cannot be used (it is reserved). Press another key, or Escape to cancel.', 'warn'); return; }
      if (r.reason === 'conflict') {
        const names = r.conflicts.map(i => BY_ID[i].label).join(', ');
        this._stopCapture();
        this.pending = { id: cap.id, slot: cap.slot, code };
        this._msg(this.label(code) + ' is already used by ' + names + '. ', 'warn', true);
      }
    },
    startCapture(id, slot) {
      this.pending = null; this.capturing = { id, slot };
      this._msg('Press the new key for “' + BY_ID[id].label + '” (Escape cancels, Backspace clears).');
      this._refreshWindow();
    },
    _stopCapture() { this.capturing = null; this._refreshWindow(); },
    takePending() {
      const p = this.pending; if (!p) return false; this.pending = null;
      const r = this.set(p.id, p.slot, p.code, { steal: true });
      this._msg(BY_ID[p.id].label + ' is now ' + this.label(p.code) + '. The other action lost that key.');
      return r.ok;
    },

    _build(h) {
      this.slotBtns = {}; this.presetBtns = {};
      const presetRow = el('div', { className: 's3g-steerbtns s3g-keys-presets' });
      PRESET_ORDER.forEach(n => {
        const b = el('button', { type: 'button', className: 's3g-btn s3g-steerbtn', text: PRESETS[n].label, title: PRESETS[n].info, 'data-preset': n });
        b.addEventListener('click', () => { this.pending = null; this.capturing = null; this.applyPreset(n); this._msg(PRESETS[n].info); });
        this.presetBtns[n] = b; presetRow.appendChild(b);
      });
      this.msgEl = el('div', { className: 's3g-small s3g-keys-msg', role: 'status', 'aria-live': 'polite' });
      this.takeBtn = el('button', { type: 'button', className: 's3g-btn s3g-keys-take', text: 'Take it', title: 'Give the key to the new action; the old action loses it' });
      this.takeBtn.hidden = true; this.takeBtn.addEventListener('click', () => this.takePending());
      this.layoutEl = el('div', { className: 's3g-small s3g-keys-layout' });
      const list = el('div', { className: 's3g-keys-list' });
      Object.keys(GROUPS).forEach(gk => {
        list.appendChild(el('div', { className: 's3g-keys-group', text: GROUPS[gk] }));
        ACTIONS.filter(a => a.group === gk).forEach(a => {
          const slots = [0, 1].map(i => {
            const b = el('button', { type: 'button', className: 's3g-btn s3g-keys-slot', 'data-action': a.id, 'data-slot': String(i) });
            b.addEventListener('click', () => this.startCapture(a.id, i));
            return b;
          });
          this.slotBtns[a.id] = slots;
          list.appendChild(el('div', { className: 's3g-keys-row', 'data-action': a.id }, [el('span', { className: 's3g-keys-name', text: a.label }), slots[0], slots[1]]));
        });
      });
      const reset = el('button', { type: 'button', className: 's3g-btn', text: '↺ Reset all keys' });
      reset.addEventListener('click', () => { this.pending = null; this.capturing = null; this.reset(); this._msg('All keys are back to the defaults.'); });
      const close = el('button', { type: 'button', className: 's3g-btn', text: '✕ Close' });
      close.addEventListener('click', () => this.toggle(false));
      const panel = el('div', { className: 's3g-panel s3g-keywin', hidden: '', role: 'dialog', 'aria-label': 'Keyboard options' }, [
        el('div', { className: 's3g-panel-title', text: '🔤 KEYBOARD OPTIONS' }),
        el('div', { className: 's3g-small', text: 'Keys are matched by their place on the keyboard, so every layout works. Click a key box, then press the new key. Two keys per action.' }),
        this.layoutEl,
        el('div', { className: 's3g-keys-sub', text: 'Presets' }), presetRow,
        el('div', { className: 's3g-keys-msgbox' }, [this.msgEl, this.takeBtn]),
        list,
        el('div', { className: 's3g-row' }, [reset, close])
      ]);
      panel.hidden = true; h.root.appendChild(panel); this.panel = panel;
      // the separate keyboard-options button: top-left cluster, after the steering gear; hidden until a keyboard shows up
      const btn = el('button', { type: 'button', className: 's3g-ptog s3g-ptog-keys', text: '🔤', title: 'Keyboard options' });
      btn.addEventListener('click', () => this.toggle());
      btn.hidden = true;
      const tl = h.root.querySelector('.s3g-tl'), gear = h.root.querySelector('.s3g-ptog-gear');
      if (tl) tl.insertBefore(btn, gear ? gear.nextSibling : (tl.children[1] || null)); else h.root.appendChild(btn);
      this.btn = btn;
      this._refreshWindow();
    },
    _msg(text, kind, withTake) {
      if (!this.msgEl) return;
      this.msgEl.textContent = text; this.msgEl.classList.toggle('warn', kind === 'warn');
      this.takeBtn.hidden = !withTake;
    },
    _refreshWindow() {
      if (!this.panel) return;
      ACTIONS.forEach(a => {
        [0, 1].forEach(i => {
          const b = this.slotBtns[a.id][i], c = this.bind[a.id][i];
          const cap = this.capturing && this.capturing.id === a.id && this.capturing.slot === i;
          b.textContent = cap ? 'Press a key…' : (c ? this.label(c) : '—');
          b.classList.toggle('capturing', !!cap); b.classList.toggle('empty', !c);
          b.title = c ? derive(c) + ' (' + c + ')' : 'empty';
        });
      });
      PRESET_ORDER.forEach(n => this.presetBtns[n].classList.toggle('active', n === this.preset));
      this.layoutEl.textContent = this.describeLayout() + (this.preset === 'custom' ? ' Preset: your own.' : '');
      this._syncVisibility();
      if (this.btn) this.btn.title = 'Keyboard options' + this.tag('keysWindow');
    },
    toggle(show) {
      const p = this.panel; if (!p) return false;
      const want = show == null ? p.hidden : !!show;
      if (want && G.Steering && G.Steering.togglePanel) G.Steering.togglePanel(false);
      if (!want) { this.capturing = null; this.pending = null; }
      p.hidden = !want;
      if (want) { this._msg(''); this._refreshWindow(); }
      return want;
    },

    debugState() {
      return { bind: JSON.parse(JSON.stringify(this.bind)), preset: this.preset, detected: this.detected, detectedBy: this.detectedBy, layoutSource: this.layoutSource,
        windowOpen: !!(this.panel && !this.panel.hidden), buttonVisible: !!(this.btn && !this.btn.hidden), conflicts: this.conflicts(), stored: (() => { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; } })() };
    }
  };
  Keys.load();

  G.Keys = Keys;
})();
