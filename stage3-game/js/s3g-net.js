/* CHEMVENTUR Stage 3 — multiplayer PREVIEW layer and the capital R (useRbox) glue.
   No multiplayer gameplay yet. This file only prepares the wiring:

   CHEMVENTUR.net  (the adapter; safe to call even when nothing is connected)
     .join(room)        show me in a room of the useRbox presence (default room "chemventur")
     .leave()           take me out again and give the useRbox back its previous room
     .onPeers(cb)       cb(list of { id, name }) whenever the people in the room change; returns an "off" function
     .sendState(ship)   share my ship ({ x, y, z, yaw, pitch, roll, gun }); 5 times a second at most.
                        Returns false while no ship-state transport exists (see stage3-game/net/README-NET.md)
     .onState(cb)       cb(id, state) when another player's ship state arrives; returns an "off" function
     .enabled / .setEnabled(on)   the "Show me to others (multiplayer preview)" option, OFF by default
     .status()          { available, enabled, joined, room, peers, transport }

   Transport: window.rvUserbox.presence from RudVentur.com's embed/useRbox.js (publish, listen, leave) and its
   rvUserbox.setChannelPeople hook. Ship states need a transport with sendState / onState; that needs a database
   rules addition first (net/presence-ship.rules.addition.json), so until then sendState() is a no-op that returns
   false. Tests or a future file can plug one in with CHEMVENTUR.net.useTransport({ sendState(room, s), onState(cb) }).

   The useRbox glue: while the big useRbox panel is open the game pauses (and resumes when it closes, if it was the
   one that paused it), held keys are cleared, and the HUD keeps clear of the capital R in the top-right corner.
   Hooks: Game.boot -> Net.attach(game); Game._frame -> Net.tick(dt). */
(function () {
  'use strict';
  const CV = window.CHEMVENTUR = window.CHEMVENTUR || {};
  const G = CV.Stage3Game = CV.Stage3Game || {};
  const STORE = 'cv.s3g.net.v1', CHANNEL = 'rudventur_channel', ROOM = 'chemventur', RATE = 0.2;

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0);
  const cleanRoom = (r) => (String(r || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || ROOM);

  const net = {
    ROOM, enabled: lsGet(STORE) === '1', joined: false, room: null, peers: [],
    _peerCbs: new Set(), _stateCbs: new Set(), _transport: null, _hooked: false, _prevRoom: null, _sendT: 0, _last: null,

    available() { return !!(window.rvUserbox && window.rvUserbox.presence); },
    status() { return { available: this.available(), enabled: this.enabled, joined: this.joined, room: this.room, peers: this.peers.length, transport: !!this._transport }; },

    setEnabled(on) {
      this.enabled = !!on; lsSet(STORE, on ? '1' : '0');
      return on ? this.join(ROOM) : this.leave();
    },

    // listen to the useRbox people list (wraps its hook once; the useRbox still renders its own list)
    _hook() {
      const ub = window.rvUserbox;
      if (this._hooked || !ub || typeof ub.setChannelPeople !== 'function') return;
      const orig = ub.setChannelPeople;
      ub.setChannelPeople = (list) => { orig.call(ub, list); this._setPeers(list); };
      this._hooked = true;
    },
    _setPeers(list) {
      if (!this.joined) return;
      this.peers = (Array.isArray(list) ? list : []).filter(p => p && typeof p === 'object' && p.id)
        .map(p => ({ id: String(p.id).slice(0, 64), name: String(p.username || p.name || 'useR').slice(0, 32) }));
      this._peerCbs.forEach(cb => { try { cb(this.peers.slice()); } catch (e) { console.warn('net peers', e); } });
    },

    join(room) {
      if (!this.available()) return Promise.resolve(false);
      const ub = window.rvUserbox, r = cleanRoom(room || ROOM);
      this._hook();
      if (!this.joined) this._prevRoom = lsGet(CHANNEL);
      this.joined = true; this.room = r;
      lsSet(CHANNEL, r);
      const vis = document.getElementById('rbRoomVisible');      // the useRbox's own "Show me in the room list"
      if (vis && !vis.checked) vis.checked = true;
      lsSet('rvRoomVisible', '1');
      document.dispatchEvent(new CustomEvent('rv:channel', { detail: { channel: r, from: 'chemventur' } }));
      return Promise.resolve(ub.presence.publish && ub.presence.publish()).then(() => ub.presence.listen && ub.presence.listen()).then(() => true, () => false);
    },

    leave() {
      if (!this.joined) return Promise.resolve(false);
      const ub = window.rvUserbox;
      this.joined = false; this.room = null; this._setPeersOff();
      lsSet(CHANNEL, this._prevRoom); this._prevRoom = null;
      const p = ub && ub.presence && ub.presence.leave ? ub.presence.leave() : null;
      document.dispatchEvent(new CustomEvent('rv:channel', { detail: { channel: lsGet(CHANNEL) || 'main', from: 'chemventur' } }));
      return Promise.resolve(p).then(() => true, () => true);
    },
    _setPeersOff() { this.peers = []; this._peerCbs.forEach(cb => { try { cb([]); } catch (e) { /* ignore */ } }); },

    onPeers(cb) { this._peerCbs.add(cb); return () => this._peerCbs.delete(cb); },
    onState(cb) { this._stateCbs.add(cb); return () => this._stateCbs.delete(cb); },

    useTransport(t) {
      this._transport = t && typeof t.sendState === 'function' ? t : null;
      if (this._transport && typeof t.onState === 'function') t.onState((id, s) => this._gotState(id, s));
    },
    _gotState(id, s) {
      if (!this.joined || !s || typeof s !== 'object') return;
      const st = this._clean(s);
      this._stateCbs.forEach(cb => { try { cb(String(id), st); } catch (e) { console.warn('net state', e); } });
    },
    _clean(s) { return { x: num(s.x), y: num(s.y), z: num(s.z), yaw: num(s.yaw), pitch: num(s.pitch), roll: num(s.roll), gun: String(s.gun || '').slice(0, 16) }; },

    sendState(ship) {
      if (!this.enabled || !this.joined || !ship) return false;
      this._last = this._clean(ship);
      if (!this._transport) return false;
      try { this._transport.sendState(this.room, this._last); return true; } catch (e) { return false; }
    },

    // ================= game side =================
    attach(game) {
      this.game = game; this.ghosts = new Map();
      this.onPeers((list) => this._syncGhosts(list));
      this.onState((id, s) => { const gh = this.ghosts.get(id); if (gh) { gh.mesh.position.set(s.x, s.y, s.z); gh.mesh.rotation.set(s.pitch, s.yaw, s.roll, 'YXZ'); gh.live = true; } });
      this._addOption();
      this._addRboxButton();
      this._watchRbox();
      if (this.enabled) this._whenAvailable(() => this.join(ROOM));
    },
    _whenAvailable(fn, tries) {
      if (this.available()) { fn(); return; }
      if ((tries || 0) < 40) setTimeout(() => this._whenAvailable(fn, (tries || 0) + 1), 250);
    },
    _addOption() {
      const S = G.Steering; if (!S || !S.panel) return;
      const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = this.enabled; inp.dataset.opt = 'netPreview';
      const info = document.createElement('span'); info.className = 's3g-gridinfo';
      const say = () => { const s = this.status(); info.textContent = !s.available ? 'needs the capital R (useRbox) to load; off by default' : s.joined ? 'shown in room "' + s.room + '" · ' + s.peers + ' other player' + (s.peers === 1 ? '' : 's') + ' (ghost ships)' : 'off: nobody sees you'; };
      inp.addEventListener('change', () => { Promise.resolve(this.setEnabled(inp.checked)).then(say); say(); });
      this.onPeers(say); setInterval(say, 3000); say();
      const name = document.createElement('span'); name.className = 's3g-optname'; name.textContent = 'Show me to others';
      const ctl = document.createElement('span'); ctl.className = 's3g-optctl'; ctl.append(inp, document.createTextNode(' multiplayer preview'));
      const row = document.createElement('div'); row.className = 's3g-optrow s3g-netrow'; row.append(name, ctl, info);
      S.panel.insertBefore(row, S.panel.lastChild);
      this.optInput = inp;
    },

    // a 👤 useRbox entry in the top-right button row (the ☰ roll-out): opens the RudVentur.com useRbox
    openRbox() {
      const box = document.getElementById('useRbox');
      if (!box) return false;
      box.classList.remove('hidden', 'collapsed');
      return true;
    },
    _addRboxButton() {
      const h = this.game && this.game.hud; if (!h || !h.actions) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 's3g-btn s3g-rboxbtn'; b.textContent = '👤 useRbox';
      b.title = 'Open the useRbox: profile, rooms, restaurants (RudVentur.com)'; b.hidden = true;
      b.addEventListener('click', () => this.openRbox());
      const help = h.actionBtns && h.actionBtns.help;
      h.actions.insertBefore(b, help && help.parentNode === h.actions ? help : null);
      this.rboxBtn = b;
      const show = () => { b.hidden = !document.getElementById('useRbox'); if (b.hidden) setTimeout(show, 500); };
      show();
    },

    // simple ghost ships: translucent cones; parked in a ring until real ship states arrive
    _syncGhosts(list) {
      const g = this.game, T = G.THREE; if (!g || !g.scene || !T) return;
      const ids = new Set(list.map(p => p.id));
      for (const [id, gh] of this.ghosts) if (!ids.has(id)) { g.scene.remove(gh.mesh); gh.mesh.geometry.dispose(); gh.mesh.material.dispose(); this.ghosts.delete(id); }
      list.forEach((p, i) => {
        if (this.ghosts.has(p.id)) return;
        const mesh = new T.Mesh(new T.ConeGeometry(0.95, 3.4, 4), new T.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.35, wireframe: true }));
        mesh.rotation.x = -Math.PI / 2; mesh.name = 'ghost:' + p.name;
        const a = (i / Math.max(1, list.length)) * Math.PI * 2;
        mesh.position.set(Math.cos(a) * 14, 4, 45 + Math.sin(a) * 14);
        g.scene.add(mesh); this.ghosts.set(p.id, { mesh, name: p.name, live: false });
      });
    },
    tick(dt) {
      if (!this.enabled || !this.joined || !this.game || !this.game.ship) return;
      this._sendT += dt; if (this._sendT < RATE) return; this._sendT = 0;
      const s = this.game.ship;
      this.sendState({ x: s.position.x, y: s.position.y, z: s.position.z, yaw: s.rotation.y, pitch: s.rotation.x, roll: s.rotation.z, gun: this.game.gun });
    },

    // the capital R: keep the HUD clear of it, pause while the big useRbox panel is open
    _watchRbox() {
      const g = this.game;
      const check = () => {
        const root = document.getElementById('topRightUser');
        document.documentElement.classList.toggle('s3g-has-rbox', !!root);
        if (!root) return;
        const box = document.getElementById('useRbox');
        const open = !!(box && !box.classList.contains('hidden') && !box.classList.contains('collapsed'));
        if (open && !this._rboxOpen) {
          this._rboxOpen = true; g.keys && g.keys.clear(); if (g.mouse) g.mouse.fireHeld = false;
          if (g.started && !g.paused) { g.pause(); this._pausedByRbox = true; if (g._status) g._status('⏸ Paused while the useRbox is open'); }
        } else if (!open && this._rboxOpen) {
          this._rboxOpen = false;
          if (this._pausedByRbox) { this._pausedByRbox = false; if (g.paused) { g.resume(); if (g._status) g._status('▶ Resumed'); } }
        }
      };
      this._rboxTimer = setInterval(check, 300); check();
    }
  };

  CV.net = net;
  G.Net = net;
})();
