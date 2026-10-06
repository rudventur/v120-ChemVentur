/* CHEMVENTUR Stage 3 Game: BOTS in 3D.
   3D versions of the v118 bots (no multiplayer, no Firebase, all local):
     from ai-players-v118.js: 📦 Collector · 🔬 Scientist · 💥 Chaos · 💚 Helper
     from bots-v118.js:       📰 Reporter · ⛪ Peace · 🏠 Homeless · 💕 Lover
   plus two that are NOT in v118 (new, built from the closest v118/v114 ideas):
     🔩 Scraper Bot: v114 Gun 8 "antimatter scrapping" turned into a bot (annihilates heavy loose atoms into scrap)
     🏭 Produce Bot: produces new matter, a moving molecule-rain source (PubChem 3D molecules)
   J = spawn all / remove all.  API: CHEMVENTUR.Stage3Game.Bots.spawn(type) / spawnAll() / removeAll().
   Hooks: Game.boot -> attach(game); Game._frame -> update(dt) (game time, paused = frozen). */
(function () {
  'use strict';
  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});
  const V = G.V, C = G.Config;

  // v118 HEADLINES (Reporter) and QUOTES (Peace Bot), copied verbatim from bots-v118.js
  const LISTS = {
    HEADLINES: [
      "BREAKING: Scientists discover new element made entirely of vibes",
      "EXCLUSIVE: Local atom refuses to bond, cites 'personal space'",
      "SHOCKING: Electron caught orbiting the wrong nucleus",
      "UPDATE: Proton and neutron confirm they are 'just friends'",
      "ALERT: Black hole spotted eating leftover quarks",
      "LIVE: Hydrogen wins 'Most Basic Element' award again",
      "REPORT: Carbon dating app reaches 1 billion users",
      "NEWS: Helium prices rise, party balloons in crisis",
      "FLASH: Neutron star files noise complaint against pulsar",
      "SCOOP: Gold nucleus admits it peaked in the periodic table",
      "URGENT: Antimatter protest — 'We matter too!'",
      "TRENDING: Oxygen and Hydrogen's water merger approved",
      "DEVELOPING: Uranium enrichment classes now online",
      "SPECIAL: Nobel Prize awarded to electron for outstanding orbit",
      "OPINION: Is fusion the future? Two atoms weigh in",
      "WEATHER: Electron cloud coverage at 100% today",
      "SPORTS: Proton wins heavyweight championship vs Neutron",
      "TECH: New quantum computer runs on pure confusion",
      "POLITICS: Photon party promises transparency",
      "CULTURE: String theory band releases debut vibration album"
    ],
    QUOTES: [
      // Buddhism
      { text: "Peace comes from within. Do not seek it without.", source: "Buddhism — Buddha" },
      { text: "Do not dwell in the past, do not dream of the future, concentrate the mind on the present moment.", source: "Buddhism — Buddha" },
      { text: "Three things cannot be long hidden: the sun, the moon, and the truth.", source: "Buddhism — Buddha" },
      { text: "In the end, only three things matter: how much you loved, how gently you lived, and how gracefully you let go.", source: "Buddhism — Buddha" },
      { text: "Holding onto anger is like drinking poison and expecting the other person to die.", source: "Buddhism — Buddha" },
      { text: "You yourself, as much as anybody in the entire universe, deserve your love and affection.", source: "Buddhism — Buddha" },

      // Christianity
      { text: "Love thy neighbor as thyself.", source: "Christianity — Matthew 22:39" },
      { text: "In the beginning was the Word, and the Word was with God.", source: "Christianity — John 1:1" },
      { text: "God is love, and whoever abides in love abides in God.", source: "Christianity — 1 John 4:16" },
      { text: "For where two or three gather in my name, there am I with them.", source: "Christianity — Matthew 18:20" },
      { text: "Be still, and know that I am God.", source: "Christianity — Psalm 46:10" },
      { text: "Blessed are the peacemakers, for they shall be called children of God.", source: "Christianity — Matthew 5:9" },

      // Hinduism
      { text: "The soul is neither born, nor does it die.", source: "Hinduism — Bhagavad Gita 2:20" },
      { text: "Truth is one; sages call it by various names.", source: "Hinduism — Rig Veda 1.164.46" },
      { text: "When meditation is mastered, the mind is unwavering like the flame of a candle in a windless place.", source: "Hinduism — Bhagavad Gita 6:19" },
      { text: "You have the right to work, but never to the fruit of work.", source: "Hinduism — Bhagavad Gita 2:47" },
      { text: "The Self is everywhere. Bright is the Self, indivisible, untouched by sin.", source: "Hinduism — Isha Upanishad" },
      { text: "From the unreal lead me to the real, from darkness lead me to light.", source: "Hinduism — Brihadaranyaka Upanishad" },

      // Islam
      { text: "Kindness is a mark of faith, and whoever has not kindness has not faith.", source: "Islam — Prophet Muhammad (Hadith)" },
      { text: "The best among you are those who have the best character.", source: "Islam — Prophet Muhammad (Hadith)" },
      { text: "Speak good or remain silent.", source: "Islam — Prophet Muhammad (Hadith)" },
      { text: "Verily, with hardship comes ease.", source: "Islam — Quran 94:6" },
      { text: "Do not lose hope, nor be sad.", source: "Islam — Quran 3:139" },
      { text: "God does not burden a soul beyond that it can bear.", source: "Islam — Quran 2:286" },

      // Judaism
      { text: "What is hateful to you, do not do to others. That is the whole Torah.", source: "Judaism — Rabbi Hillel" },
      { text: "It is not your duty to finish the work, but neither are you free to neglect it.", source: "Judaism — Pirkei Avot 2:16" },
      { text: "Who is wise? One who learns from every person.", source: "Judaism — Pirkei Avot 4:1" },
      { text: "The world stands on three things: Torah, worship, and acts of loving kindness.", source: "Judaism — Pirkei Avot 1:2" },
      { text: "Whoever saves a single life, it is as if they saved the entire world.", source: "Judaism — Talmud, Sanhedrin 37a" },

      // Sikhism
      { text: "Even Kings and emperors with heaps of wealth and vast dominion cannot compare with an ant filled with the love of God.", source: "Sikhism — Guru Nanak" },
      { text: "Before becoming a Muslim, a Sikh, or a Hindu, let us first become human.", source: "Sikhism — Guru Nanak" },
      { text: "There is but One God, whose name is True, the Creator.", source: "Sikhism — Guru Granth Sahib" },
      { text: "Those who have loved are those that have found God.", source: "Sikhism — Guru Nanak" },

      // Taoism
      { text: "The Way that can be told is not the eternal Way.", source: "Taoism — Lao Tzu, Tao Te Ching" },
      { text: "Nature does not hurry, yet everything is accomplished.", source: "Taoism — Lao Tzu" },
      { text: "A journey of a thousand miles begins with a single step.", source: "Taoism — Lao Tzu" },
      { text: "When I let go of what I am, I become what I might be.", source: "Taoism — Lao Tzu" },
      { text: "The soft overcomes the hard; the gentle overcomes the rigid.", source: "Taoism — Lao Tzu" },

      // Sufism
      { text: "The wound is the place where the Light enters you.", source: "Sufism — Rumi" },
      { text: "Before you speak, let your words pass three gates: Is it true? Is it necessary? Is it kind?", source: "Sufism — Rumi" },
      { text: "Let yourself be silently drawn by the strange pull of what you really love.", source: "Sufism — Rumi" },
      { text: "What you seek is seeking you.", source: "Sufism — Rumi" },
      { text: "Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.", source: "Sufism — Rumi" },

      // Zoroastrianism
      { text: "Good thoughts, good words, good deeds.", source: "Zoroastrianism — Avesta" },
      { text: "Happiness belongs to the one who brings happiness to others.", source: "Zoroastrianism — Zarathustra" },

      // Jainism
      { text: "Non-violence is the highest religion.", source: "Jainism — Mahavira" },
      { text: "Do not injure, abuse, oppress, enslave, insult, or torment any creature or living being.", source: "Jainism — Mahavira" },
      { text: "The soul comes alone and goes alone.", source: "Jainism — Mahavira" },

      // Baha'i
      { text: "The earth is but one country, and mankind its citizens.", source: "Baha'i — Baha'u'llah" },
      { text: "So powerful is the light of unity that it can illuminate the whole earth.", source: "Baha'i — Baha'u'llah" },

      // Confucianism
      { text: "It does not matter how slowly you go as long as you do not stop.", source: "Confucianism — Confucius" },
      { text: "What you do not wish for yourself, do not do to others.", source: "Confucianism — Confucius, Analects 15:24" },
      { text: "The man who moves a mountain begins by carrying away small stones.", source: "Confucianism — Confucius" },

      // Shintoism
      { text: "Even the wishes of a small ant reach to heaven.", source: "Shintoism — Japanese Proverb" },
      { text: "Leave the problems of God to God and weather to weather.", source: "Shintoism — Japanese Proverb" },

      // Native American Spirituality
      { text: "We do not inherit the earth from our ancestors; we borrow it from our children.", source: "Native American Proverb" },
      { text: "When you were born, you cried and the world rejoiced. Live your life so when you die, the world cries and you rejoice.", source: "Native American — Cherokee Proverb" },

      // General wisdom
      { text: "An eye for an eye makes the whole world blind.", source: "Mahatma Gandhi" },
      { text: "Happiness is not something readymade. It comes from your own actions.", source: "Dalai Lama" },
      { text: "There is no wealth like knowledge, no poverty like ignorance.", source: "Ali ibn Abi Talib" },
      { text: "Darkness cannot drive out darkness; only light can do that.", source: "Martin Luther King Jr." },
      { text: "In a gentle way, you can shake the world.", source: "Mahatma Gandhi" }
    ]
  };

  const TYPES = {
    collector: { name: 'Collector Bot', emoji: '📦', color: '#00ffff', src: 'v118 AI player', job: 'collects loose atoms, cautious and methodical' },
    scientist: { name: 'Scientist Bot', emoji: '🔬', color: '#ff00ff', src: 'v118 AI player', job: 'experiments with fusion: bonds nearby atoms, makes new ones, asks RDKit + PubChem what it built' },
    chaos:     { name: 'Chaos Bot', emoji: '💥', color: '#ff0000', src: 'v118 AI player', job: 'random moves, switches guns constantly: kicks, c2c dots, bond rips' },
    helper:    { name: 'Helper Bot', emoji: '💚', color: '#00ff88', src: 'v118 AI player', job: 'follows you at a distance, copies your gun, shares atoms' },
    reporter:  { name: 'Reporter Bot', emoji: '📰', color: '#ffaa00', src: 'v118 fun bot', job: 'flies around, flash snapshots + headlines' },
    peace:     { name: 'Peace Bot', emoji: '⛪', color: '#ffccff', src: 'v118 fun bot', job: 'floats peacefully, glows, shares quotes from many traditions' },
    homeless:  { name: 'Homeless Bot', emoji: '🏠', color: '#886644', src: 'v118 fun bot', job: 'drifts slowly, collects stray H atoms (1 e⁻ each)' },
    lover:     { name: 'Lover Bot', emoji: '💕', color: '#ff66aa', src: 'v118 fun bot', job: 'orbits your ship with hearts' },
    scraper:   { name: 'Scraper Bot', emoji: '🔩', color: '#b388ff', src: 'NEW (v114 Gun 8 antimatter scrapping)', job: 'annihilates heavy loose atoms into 🔩 scrap when the arena is crowded' },
    producer:  { name: 'Produce Bot', emoji: '🏭', color: '#aaff00', src: 'NEW (molecule rain as a bot)', job: 'produces new molecules (PubChem 3D) and drops them into the arena' }
  };
  const ORDER = ['collector', 'scientist', 'chaos', 'helper', 'reporter', 'peace', 'homeless', 'lover', 'scraper', 'producer'];
  const PRODUCTS = ['water', 'methane', 'ammonia', 'carbon dioxide', 'ethanol', 'methanol', 'formaldehyde', 'hydrogen peroxide', 'acetic acid', 'benzene'];
  const MIN_ATOMS = 40;            // collectors / scraper leave at least this many atoms around
  const MSG_TIME = 4;              // seconds a speech bubble stays (v118 MESSAGE_DURATION 4000 ms)
  const R = () => C.ARENA_RADIUS;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const toward = (bot, p, accel, dt) => {
    const d = V.sub(p, bot.pos), L = Math.hypot(d.x, d.y, d.z) || 1;
    V.addTo(bot.vel, d, accel * dt / L);
    return L;
  };
  const jitter = (bot, amount, dt) => V.addTo(bot.vel, V.randUnit(), amount * dt);
  const shipPos = (g) => ({ x: g.ship.position.x, y: g.ship.position.y, z: g.ship.position.z });

  const Bots = {
    bots: [], game: null, log: [], snapshots: 0, nextId: 1, flashes: [],

    attach(game) { this.game = game; },

    // ---------- spawn / remove ----------
    spawn(type) {
      const g = this.game, T = G.THREE, def = TYPES[type];
      if (!g || !T || !def) return null;
      const near = type === 'lover' || type === 'helper';
      const pos = near ? V.add(shipPos(g), V.scale(V.randUnit(), 12)) : V.scale(V.randUnit(), rnd(15, R() * 0.6));
      const bot = { id: this.nextId++, type, ...def, pos, vel: V.scale(V.randUnit(), 2), t: 0, think: 0,
        stats: {}, msg: null, msgT: 0, phase: Math.random() * Math.PI * 2, gun: 'atom', mode: 'idle', busy: false };
      if (type === 'peace') { bot.quoteIndex = Math.floor(Math.random() * LISTS.QUOTES.length); bot.nextQuote = 0; }
      if (type === 'reporter') { bot.firstShot = false; bot.nextHeadline = 60; bot.headlineIndex = 0; }
      if (type === 'producer') { bot.nextProduce = 3; bot.pos.y = Math.abs(bot.pos.y) * 0.5 + 20; }
      if (type === 'helper') bot.nextGift = 12;
      if (type === 'scientist') { bot.nextEureka = 10; bot.made = new Set(); }
      if (type === 'lover') { bot.orbit = 0; bot.radius = 8; }
      bot.spawnPos = { ...bot.pos };

      // mesh: glowing core + spinning ring + halo (+ hearts for Lover)
      const col = new T.Color(def.color);
      const grp = new T.Group();
      const core = new T.Mesh(new T.IcosahedronGeometry(1.1, 1), new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.3, flatShading: true }));
      const ring = new T.Mesh(new T.TorusGeometry(1.7, 0.09, 8, 32), new T.MeshBasicMaterial({ color: col }));
      const halo = new T.Mesh(new T.SphereGeometry(2.1, 16, 12), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false }));
      grp.add(core, ring, halo);
      if (type === 'lover') {
        bot.hearts = [0, 1, 2].map(() => { const h = new T.Mesh(new T.SphereGeometry(0.35, 10, 8), new T.MeshBasicMaterial({ color: 0xff3388 })); grp.add(h); return h; });
      }
      if (near) grp.scale.setScalar(0.6);       // Lover / Helper stay close to the ship: smaller, so they don't fill the view
      grp.position.set(pos.x, pos.y, pos.z);
      g.scene.add(grp);
      bot.mesh = grp; bot.ring = ring; bot.halo = halo;

      // DOM label + speech bubble (textContent only)
      const lab = document.createElement('div');
      lab.className = 's3g-botlabel';
      lab.style.setProperty('--bot', def.color);
      const name = document.createElement('div'); name.className = 's3g-botname'; name.textContent = def.emoji + ' ' + def.name;
      const info = document.createElement('div'); info.className = 's3g-botinfo';
      const bub = document.createElement('div'); bub.className = 's3g-botmsg'; bub.hidden = true;
      lab.append(bub, name, info);
      g.hud.root.appendChild(lab);
      bot.label = lab; bot.infoEl = info; bot.bubble = bub;

      this.bots.push(bot);
      g._status(def.emoji + ' ' + def.name + ' deployed!');
      return bot;
    },

    spawnAll() { ORDER.forEach(t => this.spawn(t)); if (this.game) this.game._status('🤖 All ' + ORDER.length + ' bots deployed! (J removes them)'); return this.bots.length; },

    remove(bot) {
      const i = this.bots.indexOf(bot); if (i < 0) return;
      this.bots.splice(i, 1);
      if (bot.mesh && this.game) { this.game.scene.remove(bot.mesh); bot.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
      if (bot.label) bot.label.remove();
    },
    removeAll() { [...this.bots].forEach(b => this.remove(b)); if (this.game) this.game._status('🤖 All bots removed'); },
    toggleAll() { if (this.bots.length) { this.removeAll(); return 0; } return this.spawnAll(); },

    say(bot, text) {
      bot.msg = text; bot.msgT = MSG_TIME;
      bot.bubble.textContent = text; bot.bubble.hidden = false;
      this.log.push({ bot: bot.type, text, t: Math.round(bot.t * 100) / 100 });
      if (this.log.length > 200) this.log.shift();
    },
    stat(bot, k, n) { bot.stats[k] = (bot.stats[k] || 0) + (n == null ? 1 : n); return bot.stats[k]; },

    // ---------- main update (game time) ----------
    update(dt) {
      const g = this.game; if (!g || !this.bots.length) { this._flashes(dt); return; }
      const W = G.World;
      for (const bot of [...this.bots]) {
        bot.t += dt; bot.think -= dt; bot.phase += dt;
        const thinkNow = bot.think <= 0;
        if (thinkNow) bot.think = 0.5;               // v118 AI "thinks" every 500 ms
        this['_' + bot.type](bot, dt, thinkNow, g, W);
        // physics: damping, speed cap, arena bounce
        bot.vel.x *= Math.exp(-0.6 * dt); bot.vel.y *= Math.exp(-0.6 * dt); bot.vel.z *= Math.exp(-0.6 * dt);
        const sp = Math.hypot(bot.vel.x, bot.vel.y, bot.vel.z), cap = bot.cap || 12;
        if (sp > cap) { bot.vel.x *= cap / sp; bot.vel.y *= cap / sp; bot.vel.z *= cap / sp; }
        V.addTo(bot.pos, bot.vel, dt);
        const cp = g.camera.position, dc = Math.hypot(bot.pos.x - cp.x, bot.pos.y - cp.y, bot.pos.z - cp.z);
        if (dc < 6) V.addTo(bot.pos, V.norm(V.sub(bot.pos, { x: cp.x, y: cp.y, z: cp.z })), 6 - dc);   // keep off the lens
        const L = Math.hypot(bot.pos.x, bot.pos.y, bot.pos.z), max = R() * 0.93;
        if (L > max) { bot.pos = V.scale(bot.pos, max / L); bot.vel = V.scale(bot.vel, -0.6); }
        // visuals
        bot.mesh.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
        bot.ring.rotation.x += dt * 1.3; bot.ring.rotation.y += dt * 0.9;
        const glow = bot.type === 'peace' ? 0.16 + Math.sin(bot.phase * 1.8) * 0.1 : 0.16;
        bot.halo.material.opacity = glow;
        if (bot.hearts) bot.hearts.forEach((h, i) => { const a = bot.phase * 2 + i * 2.094; h.position.set(Math.cos(a) * 2.4, Math.sin(bot.phase * 3 + i) * 0.6, Math.sin(a) * 2.4); });
        if (bot.msgT > 0) { bot.msgT -= dt; if (bot.msgT <= 0) bot.bubble.hidden = true; }
      }
      this._flashes(dt);
      this._labels();
    },

    _labels() {
      const g = this.game, T = G.THREE, cam = g.camera;
      const w = g.renderer.domElement.clientWidth, h = g.renderer.domElement.clientHeight;
      const v = this._v || (this._v = new T.Vector3());
      for (const bot of this.bots) {
        v.set(bot.pos.x, bot.pos.y + 2.6, bot.pos.z).project(cam);
        const d = cam.position.distanceTo(bot.mesh.position);
        const vis = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && d < 140;
        bot.label.style.display = vis ? '' : 'none';
        if (!vis) continue;
        bot.label.style.transform = 'translate(' + ((v.x * 0.5 + 0.5) * w).toFixed(0) + 'px,' + ((-v.y * 0.5 + 0.5) * h).toFixed(0) + 'px) translate(-50%,-100%)';
        bot.label.style.opacity = String(Math.max(0.35, Math.min(1, 1.6 - d / 90)));
        bot.infoEl.textContent = this._info(bot);
      }
    },

    _info(bot) {
      const s = bot.stats;
      switch (bot.type) {
        case 'collector': return 'atoms ' + (s.collected || 0);
        case 'scientist': return 'fused ' + (s.bonds || 0) + ' · made ' + (s.atomsMade || 0) + (s.lastFind ? ' · ' + s.lastFind : '');
        case 'chaos': return 'gun ' + bot.gun + ' · chaos ' + (s.actions || 0);
        case 'helper': return 'gun ' + bot.gun + ' · gifts ' + (s.gifts || 0);
        case 'reporter': return '📸 ' + (s.snapshots || 0) + ' · 📰 ' + (s.headlines || 0);
        case 'peace': return '🙏 ' + (s.quotes || 0);
        case 'homeless': return 'e⁻: ' + (s.electrons || 0);
        case 'lover': return '💕';
        case 'scraper': return '🔩 scrap ' + (s.scrap || 0);
        case 'producer': return 'produced ' + (s.produced || 0) + (s.last ? ' · ' + s.last : '');
      }
      return '';
    },

    // ---------- v118 AI players ----------
    _collector(bot, dt, think, g, W) {          // nearest atom -> move toward it methodically, collect it
      if (think) {
        let best = null, bd = Infinity;
        for (const a of W.atoms) { if (a.bonds.length) continue; const d = dist(a.pos, bot.pos); if (d < bd) { bd = d; best = a; } }
        bot.target = best;
      }
      const a = bot.target;
      if (a && W.atoms.indexOf(a) !== -1 && !a.bonds.length) {
        const d = toward(bot, a.pos, 14, dt);
        if (d < 2.4 && W.atoms.length > MIN_ATOMS) {
          W.removeAtom(a); bot.target = null;
          bot.tray = bot.tray || {}; bot.tray[a.symbol] = (bot.tray[a.symbol] || 0) + 1;
          const n = this.stat(bot, 'collected');
          if (n % 5 === 1) this.say(bot, '📦 Collected ' + n + ': ' + Object.keys(bot.tray).map(k => k + '×' + bot.tray[k]).join(' '));
        }
      } else jitter(bot, 4, dt);
    },

    _scientist(bot, dt, think, g, W) {          // look for fusion opportunities: two free atoms close together
      if (think && !(bot.pair && this._pairOk(bot.pair, W))) {
        bot.pair = null;
        const atoms = W.atoms;
        let best = null, bd = 30;
        for (let i = 0; i < atoms.length; i++) {
          const a = atoms[i]; if (W.freeValence(a) <= 0) continue;
          if (dist(a.pos, bot.pos) > 45) continue;
          for (let j = i + 1; j < atoms.length; j++) {
            const b = atoms[j]; if (W.freeValence(b) <= 0 || W.bondBetween(a, b)) continue;
            const d = dist(a.pos, b.pos);
            if (d < 12 && d + dist(a.pos, bot.pos) * 0.2 < bd) { bd = d + dist(a.pos, bot.pos) * 0.2; best = [a, b]; }
          }
        }
        bot.pair = best;
        if (!best) {                               // "otherwise, create new atoms" (switches gun occasionally)
          bot.gun = ['H', 'C', 'O', 'N'][Math.floor(Math.random() * 4)];
          if (W.atoms.length < C.MAX_ATOMS - 40 && Math.random() < 0.5) {
            const a = W.spawnAtom(bot.gun, V.add(bot.pos, V.scale(V.randUnit(), 3)), V.scale(V.randUnit(), 2), 'bot', 0.4);
            if (a) { this.stat(bot, 'atomsMade'); bot.made.add(a); }
          }
        }
      }
      const p = bot.pair;
      if (p && this._pairOk(p, W)) {
        const mid = V.scale(V.add(p[0].pos, p[1].pos), 0.5);
        const d = toward(bot, mid, 16, dt);
        if (d < 4) {                               // in position: pull the pair together and fuse (bond)
          V.addTo(p[0].vel, V.sub(p[1].pos, p[0].pos), dt * 3);
          V.addTo(p[1].vel, V.sub(p[0].pos, p[1].pos), dt * 3);
          if (dist(p[0].pos, p[1].pos) < G.Elements.bondLength(p[0].symbol, p[1].symbol, 1) * 2.2) {
            const b = W.bond(p[0], p[1], 1, false);
            if (b) {
              bot.made.add(p[0]); bot.made.add(p[1]);
              p[0].flash = p[1].flash = { color: '#ff00ff', t: 0.8 };
              const n = this.stat(bot, 'bonds');
              if (n === 1 || n % 6 === 0) this.say(bot, '🔬 Fusion experiment #' + n + ': ' + p[0].symbol + '–' + p[1].symbol + ' bonded!');
            }
            bot.pair = null;
          }
        }
      } else jitter(bot, 1.5, dt);                 // gentle movement
      bot.nextEureka -= dt;
      if (bot.nextEureka <= 0 && !bot.busy) { bot.nextEureka = 15; this._eureka(bot, W); }
    },
    _pairOk(p, W) { return W.atoms.indexOf(p[0]) !== -1 && W.atoms.indexOf(p[1]) !== -1 && !W.bondBetween(p[0], p[1]) && W.freeValence(p[0]) > 0 && W.freeValence(p[1]) > 0; },

    // Scientist asks RDKit + PubChem about its biggest build
    async _eureka(bot, W) {
      const S = CV.Stage3Chem;
      const comps = W.components().filter(c => c.atoms.length >= 2 && c.atoms.some(a => bot.made.has(a)));
      if (!comps.length || !S) return;
      const comp = comps.sort((x, y) => y.atoms.length - x.atoms.length)[0];
      bot.busy = true;
      try {
        const rd = await S.RDKit.analyze(W.toMolblock(comp));
        const cid = rd ? await S.PubChem.cidFromSmiles(rd.canonical) : null;
        if (cid) {
          const rec = await S.lookup(String(cid), 'cid');
          bot.stats.lastFind = rec.props.title;
          this.stat(bot, 'eurekas');
          this.say(bot, '🔬 Eureka! I synthesised ' + rec.props.title + ' (' + rec.props.formula + ', CID ' + cid + ')');
        } else {
          this.say(bot, '🔬 Hmm, ' + (rd ? rd.formula + ' (' + rd.canonical + ')' : W.formulaOf(comp)) + ' is not in PubChem… a new discovery?');
        }
      } catch (e) {
        this.say(bot, '🔬 Lab equipment offline (' + (e.message || e) + ')');
      }
      bot.busy = false;
    },

    _chaos(bot, dt, think, g, W) {              // random movement, random guns, mayhem
      jitter(bot, 30, dt);
      bot.cap = 16;
      if (think) {
        bot.gun = ['kick', 'c2c', 'rip'][Math.floor(Math.random() * 3)];
        const near = W.atoms.filter(a => dist(a.pos, bot.pos) < 14);
        if (bot.gun === 'kick' && near.length) {          // shockwave: push + energise everything nearby
          near.forEach(a => { V.addTo(a.vel, V.norm(V.sub(a.pos, bot.pos)), 6); a.energy = Math.min(2, a.energy + 0.6); });
          this.stat(bot, 'actions');
        } else if (bot.gun === 'c2c') {                   // fires one random c2c note dot
          const series = G.C2C.series(Math.random() < 0.5 ? 'chromatic' : 'major');
          const shot = series[Math.floor(Math.random() * series.length)];
          const tgt = near[0] || W.atoms[Math.floor(Math.random() * W.atoms.length)];
          const dir = tgt ? V.norm(V.sub(tgt.pos, bot.pos)) : V.randUnit();
          W.addProjectile({ kind: 'dot', owner: 'bot', pos: { ...bot.pos }, vel: V.scale(dir, C.DOT_SPEED * 0.6), life: 1.5, r: shot.radius * 0.8, color: shot.color, shot, seq: -1 });
          this.stat(bot, 'actions');
        } else if (bot.gun === 'rip') {                   // anti-gun vibe: rips one bond nearby
          const a = near.find(x => x.bonds.length);
          if (a) { W.breakBond(a.bonds[0]); a.flash = { color: '#ff0000', t: 0.5 }; this.stat(bot, 'actions'); }
        }
        if (Math.random() < 0.3 && W.atoms.length) {      // lunge at a random atom
          const r = W.atoms[Math.floor(Math.random() * W.atoms.length)];
          if (dist(r.pos, bot.pos) < 60) V.addTo(bot.vel, V.norm(V.sub(r.pos, bot.pos)), 8);
        }
        if ((bot.stats.actions || 0) > 0 && !bot.saidHi) { bot.saidHi = true; this.say(bot, '💥 CHAOS! Gun ' + bot.gun + '!'); }
      }
    },

    _helper(bot, dt, think, g, W) {             // follow the player at 10–20 units, copy their gun, share atoms
      const s = shipPos(g), d = dist(s, bot.pos);
      if (d > 20) toward(bot, s, 18, dt);
      else if (d < 10) toward(bot, s, -10, dt);
      else jitter(bot, 1, dt);
      bot.gun = g.gun;
      bot.nextGift -= dt;
      if (bot.nextGift <= 0) {
        bot.nextGift = 12;
        const sym = C.PALETTE[g.elementIdx] || 'H';
        W.inventory[sym] = (W.inventory[sym] || 0) + 1;
        const n = this.stat(bot, 'gifts');
        this.say(bot, '💚 Here, have a ' + sym + '! (gift #' + n + ')');
      }
    },

    // ---------- v118 fun bots ----------
    _reporter(bot, dt, think, g, W) {
      bot.cap = 14;
      if (Math.random() < 0.02) jitter(bot, 400, dt);        // change direction occasionally
      if (!bot.firstShot && bot.t >= 5) { bot.firstShot = true; this.say(bot, '📸 First snapshot of the universe!'); this._snapshot(bot); }
      if (bot.t >= bot.nextHeadline) {
        bot.nextHeadline += 60;
        const h = LISTS.HEADLINES[bot.headlineIndex++ % LISTS.HEADLINES.length];
        this.stat(bot, 'headlines');
        this.say(bot, '📰 ' + h);
        this._snapshot(bot, true);
      }
    },

    // camera flash at the bot + a 320×180 thumbnail kept in localStorage (last 5)
    _snapshot(bot, quiet) {
      const g = this.game, T = G.THREE;
      const fl = new T.Mesh(new T.SphereGeometry(1, 16, 12), new T.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
      fl.position.copy(bot.mesh.position); g.scene.add(fl);
      this.flashes.push({ mesh: fl, t: 0 });
      try {
        g.renderer.render(g.scene, g.camera);               // draw now so the WebGL buffer is readable
        const th = document.createElement('canvas'); th.width = 320; th.height = 180;
        th.getContext('2d').drawImage(g.renderer.domElement, 0, 0, 320, 180);
        const url = th.toDataURL('image/jpeg', 0.6);
        const keys = Object.keys(localStorage).filter(k => k.startsWith('s3g_reporter_screenshot_')).sort();
        while (keys.length >= 5) localStorage.removeItem(keys.shift());
        localStorage.setItem('s3g_reporter_screenshot_' + Date.now() + '_' + this.snapshots, url);
        this.snapshots++;
        this.stat(bot, 'snapshots');
        if (!quiet) setTimeout(() => this.say(bot, '📸 *click* Screenshot saved!'), 1200);
      } catch (e) { console.warn('📰 Snapshot failed:', e.message); }
    },
    _flashes(dt) {
      for (const f of [...this.flashes]) {
        f.t += dt;
        f.mesh.scale.setScalar(2 + f.t * 30);
        f.mesh.material.opacity = Math.max(0, 0.8 * (1 - f.t / 0.6));
        if (f.t >= 0.6) { this.game.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); this.flashes.splice(this.flashes.indexOf(f), 1); }
      }
    },

    _peace(bot, dt) {                            // float peacefully (gentle sine), quote every 15 s
      bot.cap = 4;
      bot.vel.x = Math.sin(bot.phase * 0.9) * 2.4;
      bot.vel.y = Math.cos(bot.phase * 0.63) * 1.2;
      bot.vel.z = Math.sin(bot.phase * 0.5 + 1) * 1.8;
      bot.nextQuote -= dt;
      if (bot.nextQuote <= 0) {
        bot.nextQuote = 15;
        const q = LISTS.QUOTES[bot.quoteIndex++ % LISTS.QUOTES.length];
        this.stat(bot, 'quotes');
        this.say(bot, '🙏 "' + q.text + '" — ' + q.source);
      }
    },

    _homeless(bot, dt, think, g, W) {            // slow drift; collects stray H atoms (each carries 1 electron)
      bot.cap = 5;
      V.addTo(bot.vel, { x: Math.sin(bot.phase * 0.3), y: Math.cos(bot.phase * 0.18) * 0.6, z: Math.cos(bot.phase * 0.25) }, dt * 1.2);
      if (think) {
        let best = null, bd = 16;
        for (const a of W.atoms) { if (a.symbol !== 'H' || a.bonds.length) continue; const d = dist(a.pos, bot.pos); if (d < bd) { bd = d; best = a; } }
        bot.target = best;
      }
      const a = bot.target;
      if (a && W.atoms.indexOf(a) !== -1 && !a.bonds.length) {
        const d = toward(bot, a.pos, 6, dt);
        if (d < 2.4 && W.atoms.length > MIN_ATOMS) {
          W.removeAtom(a); bot.target = null;
          const n = this.stat(bot, 'electrons');
          if (n % 5 === 0) this.say(bot, '🏠 Collected ' + n + ' electrons so far!');
        }
      }
    },

    _lover(bot, dt, think, g) {                  // orbit the player's ship, smooth follow
      bot.orbit += dt * 0.9;
      const s = V.add(shipPos(g), V.scale(g._forward(), 6));   // orbit centre a bit ahead, so it never fills the camera
      bot.center = s;
      const tgt = { x: s.x + Math.cos(bot.orbit) * bot.radius, y: s.y + 1.5 + Math.sin(bot.orbit * 2) * 1.2, z: s.z + Math.sin(bot.orbit) * bot.radius };
      bot.cap = 60;
      bot.vel = V.scale(V.sub(tgt, bot.pos), 4);
    },

    // ---------- NEW (not in v118) ----------
    _scraper(bot, dt, think, g, W) {             // hunts the heaviest loose atom, annihilates it into scrap
      if (think) {
        let best = null, bz = -1;
        if (W.atoms.length > MIN_ATOMS + 10) for (const a of W.atoms) {
          if (a.bonds.length) continue;
          const d = dist(a.pos, bot.pos); if (d > 50) continue;
          const score = a.Z - d * 0.05; if (score > bz) { bz = score; best = a; }
        }
        bot.target = best;
      }
      const a = bot.target;
      if (a && W.atoms.indexOf(a) !== -1 && !a.bonds.length) {
        const d = toward(bot, a.pos, 12, dt);
        if (d < 2.6) {
          const gained = 1 + Math.floor((a.Z || 1) / 5);      // v114: bigger atoms = more scrap
          W.removeAtom(a); bot.target = null;
          const total = this.stat(bot, 'scrap', gained);
          this.stat(bot, 'annihilated');
          if (G.Audio && G.Audio.blip && g.started) G.Audio.blip(90, 0.12, 'sawtooth', 0.05);
          if (bot.stats.annihilated === 1 || bot.stats.annihilated % 5 === 0) this.say(bot, '🔩 Annihilated ' + a.symbol + ': +' + gained + ' scrap (total ' + total + ')');
        }
      } else jitter(bot, 3, dt);
    },

    _producer(bot, dt, think, g, W) {            // hovers high, produces molecules and drops them
      bot.cap = 6;
      jitter(bot, 3, dt);
      if (bot.pos.y < 15) bot.vel.y += dt * 4;
      bot.nextProduce -= dt;
      if (bot.nextProduce <= 0 && !bot.busy) { bot.nextProduce = 8; this._produce(bot, W); }
    },
    async _produce(bot, W) {
      if (W.atoms.length > C.MAX_ATOMS - 40) { this.say(bot, '🏭 Warehouse full, production paused'); return; }
      bot.busy = true;
      const name = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
      const at = V.add(bot.pos, { x: 0, y: -4, z: 0 }), vel = { x: bot.vel.x * 0.3, y: -3, z: bot.vel.z * 0.3 };
      let made = null, label = '';
      try {
        const rec = await CV.Stage3Chem.lookup(name, 'name');
        const parsed = rec && rec.is3D ? G.parseMolblock(rec.sdf) : null;
        if (parsed) { made = W.spawnMolecule(parsed, at, 'bot', vel, false); label = rec.props.title + ' (' + rec.props.formula + ')'; }
      } catch (e) { /* offline: fall back below */ }
      if (!made) {                                  // offline fallback: hand-made water
        const o = W.spawnAtom('O', at, vel, 'bot');
        const h1 = W.spawnAtom('H', V.add(at, { x: 1.6, y: 1.1, z: 0 }), vel, 'bot');
        const h2 = W.spawnAtom('H', V.add(at, { x: -1.6, y: 1.1, z: 0 }), vel, 'bot');
        if (o && h1 && h2) { W.bond(o, h1, 1, false); W.bond(o, h2, 1, false); made = { atoms: [o, h1, h2] }; label = 'Water (H2O, offline recipe)'; }
      }
      if (made) {
        made.atoms.forEach(a => { a.flash = { color: '#aaff00', t: 0.8 }; });
        this.stat(bot, 'produced'); bot.stats.last = label.split(' (')[0];
        this.say(bot, '🏭 Produced ' + label + '!');
      }
      bot.busy = false;
    },

    debugState() {
      return {
        count: this.bots.length, snapshots: this.snapshots,
        bots: this.bots.map(b => ({ type: b.type, name: b.name, pos: b.pos, moved: Math.round(dist(b.pos, b.spawnPos) * 10) / 10, stats: { ...b.stats },
          gun: b.gun, msg: b.msg, labelVisible: b.label.style.display !== 'none', inScene: !!(b.mesh && b.mesh.parent),
          toShip: this.game ? Math.round(dist(b.pos, shipPos(this.game)) * 10) / 10 : null,
          toOrbitCenter: b.center ? Math.round(dist(b.pos, b.center) * 10) / 10 : null })),
        log: this.log.slice(-40)
      };
    }
  };

  Bots.TYPES = TYPES; Bots.ORDER = ORDER; Bots.LISTS = LISTS;
  G.Bots = Bots;
})();
