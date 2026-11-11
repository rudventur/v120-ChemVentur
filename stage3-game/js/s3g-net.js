/* CHEMVENTUR Stage 3 — multiplayer layer, the useRbox profile on your ship, and the capital R (useRbox) glue.

   CHEMVENTUR.net  (the adapter; safe to call even when nothing is connected)
     .join(room)        join a room. With no room it follows the room picked in the useRbox (localStorage
                        rudventur_channel); if none was ever picked it uses "chemventur" and gives it back on leave()
     .leave()           leave the room (removes the ghosts and my ship record)
     .onPeers(cb)       cb(list of { id, name, robot }) whenever the people in the room change; returns an "off" function
     .sendState(ship)   share my ship ({ x, y, z, yaw, pitch, roll, gun }) plus my shared profile; 5 times a second at most.
                        Sends nothing while the option is off, while I am not in a room, or while room sharing is off
     .onState(cb)       cb(id, state) when another player's ship arrives (state.p is their shared profile); returns "off"
     .sharedProfile()   exactly what my ship carries right now, or null (see "What my ship carries" below)
     .showPeer(id)      open that player's profile in the middle column of the useRbox (rvUserbox.showProfile)
     .showNearest()     the same for the nearest other ship (key I by default, the "peerProfile" action)
     .enabled / .setEnabled(on)   the "Show me to others" option, OFF by default
     .status()          { available, enabled, joined, room, peers, transport, sharing, profile }

   What my ship carries (only while the option is on, I am in a room, and "Show me in the room list" is on in
   the useRbox and the useRbox is not in private mode):
     p.name      the APPROVED display name (never the builder's unapproved draft)
     p.avatar    the approved avatar emoji
     p.robot     true when the useR answered "I am a robot"
     p.now.*     only the "right now" lines whose 👁 share box is ticked: mood, status, doing, energy, chat, game, looking
   A profile that was never approved (only a draft) sends no profile at all: the ghost is just "useR".
   Nothing else from the useRbox (location, notes, signature, languages, restaurant) ever goes onto the ship.

   Transport: the ship records live at games/chemventur/rooms/<room>/<uid> in the same Firebase project and with
   the same anonymous sign-in as the useRbox presence (firebase app "rvpresence"). The database rules for that node
   are in net/presence-ship.rules.addition.json and must be published by hand. Tests plug in a fake with
   CHEMVENTUR.net.useTransport({ sendState(room, rec), onState(cb), watch(room), leave(room) }).

   The useRbox glue: while the big useRbox panel is open the game pauses (and resumes when it closes, if it was the
   one that paused it), held keys are cleared, and the HUD keeps clear of the capital R in the top-right corner.
   Hooks: Game.boot -> Net.attach(game); Game._frame -> Net.tick(dt); hotkey "peerProfile" -> Net.showNearest(). */
(function () {
  'use strict';
  const CV = window.CHEMVENTUR = window.CHEMVENTUR || {};
  const G = CV.Stage3Game = CV.Stage3Game || {};
  const STORE = 'cv.s3g.net.v1', CHANNEL = 'rudventur_channel', ROOM = 'chemventur', RATE = 0.2, PROFILE_EVERY = 1;
  const SHIP_PATH = 'games/chemventur/rooms/';
  const NOW_LIM = { mood: 24, doing: 60, energy: 12, game: 40, looking: 60 };
  const STATUSES = ['available', 'busy', 'away', 'playing'];
  const NOW_ORDER = ['mood', 'status', 'doing', 'energy', 'chat', 'game', 'looking'];

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const str = (v) => (v === null || v === undefined ? '' : String(v));
  const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0);
  const clamp = (v, a) => Math.max(-a, Math.min(a, num(v)));
  const angle = (v) => { let a = typeof v === 'number' && isFinite(v) ? v : 0; a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return num(a); };
  const cleanRoom = (r) => (String(r || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || ROOM);
  const emoji = (v) => { const a = Array.from(str(v).trim()).slice(0, 4).join(''); return a.length <= 8 ? a : ''; };
  const hue = (id) => { let h = 0; for (const c of str(id)) h = (h * 31 + c.codePointAt(0)) >>> 0; return (h % 360) / 360; };

  // the public, shareable "right now" lines; the same limits as the useRbox presence and the database rules
  function cleanNow(n, onlyShared) {
    if (!n || typeof n !== 'object') return null;
    const sh = (n.share && typeof n.share === 'object') ? n.share : {}, out = {};
    const ok = (f) => !onlyShared || sh[f] === true;
    Object.keys(NOW_LIM).forEach(f => { const v = str(n[f]).trim().slice(0, NOW_LIM[f]); if (v && ok(f)) out[f] = v; });
    if (ok('status') && STATUSES.indexOf(n.status) >= 0) out.status = n.status;
    if (ok('chat')) { if (n.chat === 'yes' || n.chat === true) out.chat = true; else if (n.chat === 'no' || n.chat === false) out.chat = false; }
    return Object.keys(out).length ? out : null;
  }
  // a profile that came in from another ship: keep only the allowed public fields
  function cleanProfile(p) {
    if (!p || typeof p !== 'object') return null;
    const out = { name: str(p.name).trim().slice(0, 32) || 'useR' };
    const av = emoji(p.avatar); if (av) out.avatar = av;
    if (p.robot === true) out.robot = true;
    const now = cleanNow(p.now, false); if (now) out.now = now;
    return out;
  }

  // the built-in transport: the useRbox's own Firebase app ("rvpresence"), so the uid matches the presence record
  function firebaseTransport() {
    const t = {
      kind: 'firebase', cb: null, room: null, ref: null, mine: null, note: '', _retry: 0, _quietUntil: 0,
      app() { const fb = window.firebase; if (!fb || !fb.apps) return null; return fb.apps.filter(a => a.name === 'rvpresence')[0] || null; },
      uid() { const a = this.app(); const u = a && a.auth && a.auth().currentUser; return u ? u.uid : null; },
      onState(cb) { this.cb = cb; },
      watch(room) { this.room = room; this._sub(); },
      _sub() {
        clearTimeout(this._retry);
        if (!this.room) return;
        const a = this.app(), uid = this.uid();
        if (!a || !uid) { this._retry = setTimeout(() => this._sub(), 1000); return; }
        if (this.ref) this.ref.off();
        const ref = this.ref = a.database().ref(SHIP_PATH + this.room);
        const got = (snap) => { if (snap.key !== uid && this.cb) this.cb(snap.key, snap.val()); };
        const err = (e) => { this.note = 'ship list unavailable: ' + (e && e.code || e && e.message || e); };
        ref.on('child_added', got, err); ref.on('child_changed', got, err);
        ref.on('child_removed', (snap) => { if (snap.key !== uid && this.cb) this.cb(snap.key, null); }, err);
      },
      sendState(room, rec) {
        const a = this.app(), uid = this.uid();
        if (!a || !uid || Date.now() < this._quietUntil) return false;
        const ref = a.database().ref(SHIP_PATH + room + '/' + uid);
        if (!this.mine || this.mine.toString() !== ref.toString()) {
          if (this.mine) this._drop(this.mine);
          this.mine = ref; ref.onDisconnect().remove();
        }
        const v = Object.assign({}, rec, { t: window.firebase.database.ServerValue.TIMESTAMP });
        ref.set(v).then(() => { this.note = ''; }, (e) => {
          this.note = /permission/i.test(e && (e.code || e.message) || '') ? 'the ship database rules are not published yet (or you are not shown in the room list)' : 'ship not sent: ' + (e && e.message || e);
          this._quietUntil = Date.now() + 5000;   // back off instead of retrying 5 times a second
        });
        return true;
      },
      _drop(ref) { try { ref.onDisconnect().cancel(); } catch (e) { /* ignore */ } return ref.remove().catch(() => {}); },
      leave() {
        clearTimeout(this._retry);
        if (this.ref) { this.ref.off(); this.ref = null; }
        this.room = null;
        if (this.mine) { const m = this.mine; this.mine = null; return this._drop(m); }
        return Promise.resolve();
      }
    };
    return t;
  }

  const net = {
    ROOM, SHIP_PATH, enabled: lsGet(STORE) === '1', joined: false, room: null, peers: [],
    _peerCbs: new Set(), _stateCbs: new Set(), _profileCbs: new Set(), _transport: null, _hooked: false, _prevRoom: undefined,
    _sendT: 0, _profT: 0, _last: null, _profile: null, _profileSig: 'null', _presence: [], _origSet: null,
    cleanProfile, cleanNow,

    available() { return !!(window.rvUserbox && window.rvUserbox.presence); },
    status() {
      return { available: this.available(), enabled: this.enabled, joined: this.joined, room: this.room, peers: this.peers.length,
        transport: !!this._transport, sharing: this.roomSharing(), profile: this._profile ? JSON.parse(JSON.stringify(this._profile)) : null };
    },

    setEnabled(on) {
      this.enabled = !!on; lsSet(STORE, on ? '1' : '0');
      return on ? this.join() : this.leave();
    },

    // ---------- what I share ----------
    // "Show me in the room list" in the useRbox (and not its private mode): without it nothing leaves the browser
    roomSharing() {
      const vis = document.getElementById('rbRoomVisible');
      const on = vis ? !!vis.checked : lsGet('rvRoomVisible') === '1';
      return on && lsGet('rvPrivacy') !== 'private';
    },
    // the APPROVED profile only: the useRbox keeps the builder's unapproved draft under its own key (rvProfileDraft)
    approvedProfile() {
      const ub = window.rvUserbox; if (!ub) return null;
      let saved = {}; try { saved = (typeof ub.get === 'function' && ub.get()) || {}; } catch (e) { saved = {}; }
      const name = str(saved.username).trim().slice(0, 32), avatar = emoji(saved.avatar);
      if (!name && !avatar) return null;            // never approved: only a draft, or nothing at all
      const out = { name: name || 'useR' };
      if (avatar) out.avatar = avatar;
      if (lsGet('rvRobot') === '1') out.robot = true;
      let nowState = null; try { nowState = JSON.parse(lsGet('rvNowState') || 'null'); } catch (e) { nowState = null; }
      const now = cleanNow(nowState, true);           // only the lines with their 👁 share box ticked
      if (now) out.now = now;
      return out;
    },
    sharedProfile() {
      if (!this.enabled || !this.joined || !this.roomSharing()) return null;
      return this.approvedProfile();
    },
    onProfile(cb) { this._profileCbs.add(cb); return () => this._profileCbs.delete(cb); },
    // re-read the profile; when it changed (an approval, a share box, room sharing) the next ship update goes out at once
    refreshProfile() {
      const p = this.sharedProfile(), sig = JSON.stringify(p);
      if (sig === this._profileSig) return false;
      this._profile = p; this._profileSig = sig; this._sendT = RATE;
      this._profileCbs.forEach(cb => { try { cb(p); } catch (e) { console.warn('net profile', e); } });
      return true;
    },

    // ---------- the useRbox people list ----------
    // wraps rvUserbox.setChannelPeople once: the game sees the room's people, the useRbox list also shows who is flying
    _hook() {
      const ub = window.rvUserbox;
      if (this._hooked || !ub || typeof ub.setChannelPeople !== 'function') return;
      const orig = ub.setChannelPeople;
      this._origSet = (list) => orig.call(ub, list);
      ub.setChannelPeople = (list) => {
        this._presence = Array.isArray(list) ? list.slice() : [];
        this._origSet(this.joined ? this._merged() : list);
        this._setPeers(this._presence);
      };
      this._hooked = true;
    },
    // the presence people, with "🚀" on everyone whose ship is in the game room, plus ships the presence has not listed yet
    _merged() {
      const out = [], seen = new Set();
      this._presence.forEach(p => {
        if (!p || typeof p !== 'object') { out.push(p); return; }
        const gh = p.id && this.ghosts && this.ghosts.get(String(p.id));
        if (gh && gh.live) { seen.add(gh.id); out.push(Object.assign({}, p, { username: gh.name + ' 🚀', inGame: true, avatar: gh.avatar || p.avatar, robot: !!(gh.robot || p.robot) })); }
        else out.push(p);
      });
      if (this.ghosts) this.ghosts.forEach(gh => {
        if (!gh.live || seen.has(gh.id)) return;
        out.push({ id: gh.id, username: gh.name + ' 🚀', inGame: true, avatar: gh.avatar, robot: !!gh.robot, now: gh.now || null, channel: lsGet(CHANNEL) || this.room });
      });
      return out;
    },
    _pushPeople() { if (this._origSet && this.joined) this._origSet(this._merged()); },
    _setPeers(list) {
      if (!this.joined) return;
      this.peers = (Array.isArray(list) ? list : []).filter(p => p && typeof p === 'object' && p.id)
        .map(p => ({ id: String(p.id).slice(0, 64), name: str(p.username || p.name || 'useR').slice(0, 32), robot: !!p.robot, person: p }));
      this._peerCbs.forEach(cb => { try { cb(this.peers.slice()); } catch (e) { console.warn('net peers', e); } });
    },

    // ---------- rooms ----------
    gameRoom() { const ch = lsGet(CHANNEL); return ch ? cleanRoom(ch) : null; },
    join(room) {
      if (!this.available()) return Promise.resolve(false);
      const ub = window.rvUserbox, picked = this.gameRoom(), r = room ? cleanRoom(room) : (picked || ROOM);
      this._hook();
      if (!this.joined) this._prevRoom = picked === r ? undefined : lsGet(CHANNEL);   // only give back a room I changed
      const moved = this.joined && this.room !== r;
      if (moved) this._leaveTransport();
      this.joined = true; this.room = r;
      if (lsGet(CHANNEL) !== r) {
        lsSet(CHANNEL, r);
        document.dispatchEvent(new CustomEvent('rv:channel', { detail: { channel: r, from: 'chemventur' } }));
      }
      if (this._transport && this._transport.watch) this._transport.watch(r);
      this.refreshProfile();
      return Promise.resolve(ub.presence.publish && ub.presence.publish()).then(() => ub.presence.listen && ub.presence.listen()).then(() => true, () => false);
    },
    // a room or channel picked in the useRbox while I am in the game: follow it
    _followChannel(e) {
      const d = (e && e.detail) || {};
      if (!this.joined || d.from === 'chemventur') return;
      const r = cleanRoom(d.channel || lsGet(CHANNEL) || 'main');
      if (r === this.room) return;
      this._prevRoom = undefined;                    // the player chose it: leaving the game keeps it
      this._leaveTransport(); this._clearGhosts();
      this.room = r; this.peers = []; this._presence = [];
      this._peerCbs.forEach(cb => { try { cb([]); } catch (err) { /* ignore */ } });
      if (this._transport && this._transport.watch) this._transport.watch(r);
      this.refreshProfile();
      if (this.game && this.game._status) this.game._status('📡 Multiplayer room: ' + r);
    },
    _leaveTransport() { const t = this._transport; if (t && t.leave) { try { t.leave(this.room); } catch (e) { /* ignore */ } } },

    leave() {
      if (!this.joined) return Promise.resolve(false);
      const ub = window.rvUserbox;
      this._leaveTransport();
      this.joined = false; this.room = null; this._setPeersOff(); this._clearGhosts(); this.refreshProfile();
      if (this._prevRoom !== undefined) {
        lsSet(CHANNEL, this._prevRoom);
        document.dispatchEvent(new CustomEvent('rv:channel', { detail: { channel: lsGet(CHANNEL) || 'main', from: 'chemventur' } }));
      }
      this._prevRoom = undefined;
      if (this._origSet) this._origSet(this._presence);
      const p = ub && ub.presence && ub.presence.leave ? ub.presence.leave() : null;
      return Promise.resolve(p).then(() => true, () => true);
    },
    _setPeersOff() { this.peers = []; this._peerCbs.forEach(cb => { try { cb([]); } catch (e) { /* ignore */ } }); },

    onPeers(cb) { this._peerCbs.add(cb); return () => this._peerCbs.delete(cb); },
    onState(cb) { this._stateCbs.add(cb); return () => this._stateCbs.delete(cb); },

    useTransport(t) {
      if (this._transport && this.joined) this._leaveTransport();
      this._transport = t && typeof t.sendState === 'function' ? t : null;
      if (this._transport && typeof t.onState === 'function') t.onState((id, s) => this._gotState(id, s));
      if (this._transport && this.joined && t.watch) t.watch(this.room);
    },
    _gotState(id, s) {
      if (!this.joined) return;
      id = String(id).slice(0, 64);
      if (s === null || s === undefined) { this._stateCbs.forEach(cb => { try { cb(id, null); } catch (e) { /* ignore */ } }); return; }
      if (typeof s !== 'object') return;
      const st = this._clean(s), p = cleanProfile(s.p);
      if (p) st.p = p;
      this._stateCbs.forEach(cb => { try { cb(id, st); } catch (e) { console.warn('net state', e); } });
    },
    // positions are clamped to what the database rules allow, angles wrapped to -π..π
    _clean(s) { return { x: clamp(s.x, 200), y: clamp(s.y, 200), z: clamp(s.z, 200), yaw: angle(s.yaw), pitch: angle(s.pitch), roll: angle(s.roll), gun: str(s.gun).slice(0, 16) }; },

    sendState(ship) {
      if (!this.enabled || !this.joined || !ship || !this.roomSharing()) return false;
      this._last = this._clean(ship);
      if (!this._transport) return false;
      const rec = Object.assign({}, this._last);
      if (this._profile) rec.p = JSON.parse(JSON.stringify(this._profile));
      try { return this._transport.sendState(this.room, rec) !== false; } catch (e) { return false; }
    },

    // ================= game side =================
    attach(game) {
      this.game = game; this.ghosts = new Map();
      if (!this._transport) this.useTransport(firebaseTransport());
      this.onPeers((list) => this._syncGhosts(list));
      this.onState((id, s) => this._shipState(id, s));
      document.addEventListener('rv:channel', (e) => this._followChannel(e));
      // an approval in the useRbox builder, a share box, room sharing: update what my ship carries right away
      const soon = () => setTimeout(() => this.refreshProfile(), 0);
      document.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('#rbApprove, #rvRobotBtn, #rvHuman, #saveUser, #togglePrivacy')) soon(); }, true);
      document.addEventListener('change', (e) => { if (e.target && e.target.id === 'rbRoomVisible') soon(); }, true);
      this._addOption();
      this._addRboxButton();
      this._watchRbox();
      this._tagLoop();
      if (this.enabled) this._whenAvailable(() => this.join());
    },
    _whenAvailable(fn, tries) {
      if (this.available()) { fn(); return; }
      if ((tries || 0) < 40) setTimeout(() => this._whenAvailable(fn, (tries || 0) + 1), 250);
    },
    _addOption() {
      const S = G.Steering; if (!S || !S.panel) return;
      const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = this.enabled; inp.dataset.opt = 'netPreview';
      const info = document.createElement('span'); info.className = 's3g-gridinfo s3g-netinfo';
      const vis = document.createElement('button'); vis.type = 'button'; vis.className = 's3g-btn s3g-netvis'; vis.textContent = '👁 Show me in the room list'; vis.hidden = true;
      vis.title = 'Ticks "Show me in the room list" in the useRbox: other players then see your ship and your shared profile';
      vis.addEventListener('click', () => {
        const box = document.getElementById('rbRoomVisible');
        if (box) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); } else lsSet('rvRoomVisible', '1');
        this.refreshProfile(); say();
      });
      const who = (p) => (p.avatar ? p.avatar + ' ' : '') + p.name + (p.robot ? ' 🤖' : '');
      const say = () => {
        const s = this.status(), others = s.peers + ' other player' + (s.peers === 1 ? '' : 's') + ' (ghost ships)';
        vis.hidden = !(s.joined && !s.sharing);
        const t = this._transport && this._transport.note ? ' · ' + this._transport.note : '';
        info.textContent = !s.available ? 'needs the capital R (useRbox) to load; off by default'
          : !s.joined ? 'off: nobody sees you, nothing is shared'
          : !s.sharing ? 'room "' + s.room + '" · hidden: "Show me in the room list" is off in the useRbox, so nothing is sent · ' + others
          : s.profile ? 'room "' + s.room + '" · others see ' + who(s.profile) + (s.profile.now ? ' and ' + Object.keys(s.profile.now).length + ' "right now" line(s)' : '') + ' · ' + others + t
          : 'room "' + s.room + '" · others see "useR": approve your profile in the useRbox to show your name · ' + others + t;
      };
      inp.addEventListener('change', () => { Promise.resolve(this.setEnabled(inp.checked)).then(say); say(); });
      this.onPeers(say); this.onProfile(say); setInterval(say, 3000); say();
      const name = document.createElement('span'); name.className = 's3g-optname'; name.textContent = 'Show me to others';
      const ctl = document.createElement('span'); ctl.className = 's3g-optctl'; ctl.append(inp, document.createTextNode(' multiplayer, with my approved useRbox profile'));
      const row = document.createElement('div'); row.className = 's3g-optrow s3g-netrow'; row.append(name, ctl, info, vis);
      S.panel.insertBefore(row, S.panel.lastChild);
      this.optInput = inp; this._say = say;
    },

    // a 👤 useRbox entry in the top-right button row (the ☰ roll-out): opens the RudVentur.com useRbox
    openRbox(section) {
      const ub = window.rvUserbox;
      if (ub && typeof ub.open === 'function' && document.getElementById('useRbox')) { ub.open(section || undefined); return true; }
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

    // ---------- ghost ships with name tags ----------
    _tagLayer() {
      if (this._tags && this._tags.isConnected) return this._tags;
      const h = this.game && this.game.hud, root = h && h.root ? h.root : document.body;
      const d = document.createElement('div'); d.className = 's3g-ghosttags';
      root.insertBefore(d, root.firstChild);
      this._tags = d; return d;
    },
    _ghost(id, i, n) {
      let gh = this.ghosts.get(id);
      if (gh) return gh;
      const g = this.game, T = G.THREE; if (!g || !g.scene || !T) return null;
      const color = new T.Color().setHSL(hue(id), 0.85, 0.62);
      const mesh = new T.Mesh(new T.ConeGeometry(0.95, 3.4, 4), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, wireframe: true }));
      mesh.rotation.x = -Math.PI / 2; mesh.name = 'ghost:' + id;
      const a = ((i || 0) / Math.max(1, n || 1)) * Math.PI * 2;
      mesh.position.set(Math.cos(a) * 14, 4, 45 + Math.sin(a) * 14);
      g.scene.add(mesh);
      const tag = document.createElement('button'); tag.type = 'button'; tag.className = 's3g-ghosttag';
      tag.style.setProperty('--gc', '#' + color.getHexString());
      tag.addEventListener('click', (e) => { e.stopPropagation(); this.showPeer(id); });
      this._tagLayer().appendChild(tag);
      gh = { id, mesh, tag, name: 'useR', avatar: '', robot: false, now: null, person: null, live: false, inPresence: false };
      this.ghosts.set(id, gh);
      return gh;
    },
    _label(gh) {
      const txt = (gh.avatar || '👤') + ' ' + gh.name + (gh.robot ? ' 🤖' : '');
      if (gh.tag.textContent !== txt) gh.tag.textContent = txt;
      gh.mesh.name = 'ghost:' + gh.name;
      const key = G.Keys && G.Keys.labelFor ? G.Keys.labelFor('peerProfile') : 'I';
      gh.tag.title = 'Open ' + gh.name + '\'s profile in the useRbox (or the nearest ship: ' + key + ')';
      gh.tag.dataset.id = gh.id; gh.tag.dataset.robot = gh.robot ? '1' : '0';
    },
    _dropGhost(id) {
      const gh = this.ghosts.get(id); if (!gh) return;
      if (this.game && this.game.scene) this.game.scene.remove(gh.mesh);
      gh.mesh.geometry.dispose(); gh.mesh.material.dispose(); gh.tag.remove();
      this.ghosts.delete(id);
    },
    _clearGhosts() { if (this.ghosts) Array.from(this.ghosts.keys()).forEach(id => this._dropGhost(id)); },
    // people in the room (the useRbox presence): a ghost each, parked in a ring until their ship arrives
    _syncGhosts(list) {
      if (!this.ghosts) return;
      const ids = new Set(list.map(p => p.id));
      for (const [id, gh] of Array.from(this.ghosts)) { gh.inPresence = ids.has(id); if (!gh.inPresence && !gh.live) this._dropGhost(id); }
      list.forEach((p, i) => {
        const gh = this._ghost(p.id, i, list.length); if (!gh) return;
        gh.inPresence = true; gh.person = p.person || null;
        if (!gh.live) { gh.name = p.name; gh.robot = p.robot; gh.now = p.person && p.person.now ? cleanNow(p.person.now, false) : null; }
        this._label(gh);
      });
    },
    // a ship record from the game room: move it, and its shared profile sets the tag
    _shipState(id, s) {
      if (!s) {
        const gh = this.ghosts.get(id); if (!gh) return;
        gh.live = false; if (!gh.inPresence) this._dropGhost(id);
        this._pushPeople(); return;
      }
      const gh = this._ghost(id, this.ghosts.size, this.ghosts.size + 1); if (!gh) return;
      const was = gh.live && JSON.stringify([gh.name, gh.avatar, gh.robot, gh.now]);
      gh.mesh.position.set(s.x, s.y, s.z); gh.mesh.rotation.set(s.pitch, s.yaw, s.roll, 'YXZ'); gh.live = true;
      const p = s.p;
      gh.name = p ? p.name : (gh.person && gh.person.username) || 'useR';
      gh.avatar = p && p.avatar || ''; gh.robot = !!(p && p.robot); gh.now = p && p.now || null;
      this._label(gh);
      if (was !== JSON.stringify([gh.name, gh.avatar, gh.robot, gh.now])) this._pushPeople();
    },
    // what the useRbox middle column shows: the presence's public fields with the ship's profile on top
    _person(gh) {
      const base = gh.person ? Object.assign({}, gh.person) : {};
      return Object.assign(base, { id: gh.id, username: gh.name, robot: gh.robot, avatar: gh.avatar || base.avatar, now: gh.now || base.now || null });
    },
    showPeer(id) {
      const gh = this.ghosts && this.ghosts.get(String(id)), ub = window.rvUserbox;
      if (!gh || !ub || typeof ub.showProfile !== 'function') return false;
      this.openRbox('mid');
      try { ub.showProfile(this._person(gh)); } catch (e) { console.warn('net showProfile', e); return false; }
      // the profile card sits low in the middle column: bring it to the top of the column so it is seen at once
      setTimeout(() => { const v = document.getElementById('rbViewed'); if (v && v.scrollIntoView) v.scrollIntoView({ block: 'start' }); }, 400);
      return true;
    },
    showNearest() {
      const g = this.game; if (!g || !this.ghosts || !this.ghosts.size) { if (g && g._status) g._status('👥 No other players here yet'); return false; }
      let best = null, bd = Infinity;
      this.ghosts.forEach(gh => { const d = g.ship ? gh.mesh.position.distanceTo(g.ship.position) : 0; if (d < bd) { bd = d; best = gh; } });
      return best ? this.showPeer(best.id) : false;
    },
    // the tags follow their ships on screen (hidden behind the camera, off screen, or before START)
    _placeTags() {
      const g = this.game, T = G.THREE; if (!g || !g.camera || !T || !this.ghosts || !this.ghosts.size) return;
      const w = g.container && g.container.clientWidth || innerWidth, h = g.container && g.container.clientHeight || innerHeight;
      const v = this._v || (this._v = new T.Vector3());
      this.ghosts.forEach(gh => {
        v.copy(gh.mesh.position); v.y += 2.6; v.project(g.camera);
        const on = g.started && v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
        gh.tag.hidden = !on;
        if (on) { gh.tag.style.left = Math.round((v.x + 1) / 2 * w) + 'px'; gh.tag.style.top = Math.round((1 - v.y) / 2 * h) + 'px'; }
      });
    },
    _tagLoop() { const step = () => { try { this._placeTags(); } catch (e) { /* never break the frame */ } requestAnimationFrame(step); }; requestAnimationFrame(step); },

    tick(dt) {
      if (!this.enabled || !this.joined || !this.game || !this.game.ship) return;
      this._profT += dt; if (this._profT >= PROFILE_EVERY) { this._profT = 0; this.refreshProfile(); }
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
