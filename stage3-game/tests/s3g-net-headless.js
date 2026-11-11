/* Headless-Chrome test for the multiplayer preview adapter (js/s3g-net.js) and the capital R glue (dev only).
   The useRbox script from RudVentur.com is replaced by a small MOCK (request interception), so no Firebase is touched.
   npm i puppeteer-core ; serve the repo (python3 -m http.server 8790)
   CHROME=/usr/bin/google-chrome node tests/s3g-net-headless.js http://localhost:8790/stage3-game/ [outDir] [screenshotDir]
   With REAL_RBOX=1 it also loads the real live useRbox for desktop and phone screenshots (needs the internet). */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const url = process.argv[2] || 'http://localhost:8790/stage3-game/';
const shotDir = process.argv[4] || process.argv[3] || path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + m + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MOCK = `(function () {
  if (window.rvUserbox) return;
  const calls = window.__rbCalls = { publish: 0, listen: 0, leave: 0 };
  const css = document.createElement('style');
  css.textContent = '#topRightUser{position:fixed;top:14px;right:14px;z-index:999999}#Rcircle{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font-size:28px;color:#0f4;border:3px solid #0f4;background:#000}#Ricons{position:absolute;top:8px;right:68px;display:flex;gap:12px}#Ricons>div{width:44px;height:44px}#useRbox{position:fixed;top:90px;right:14px;width:300px;height:300px;background:#020}#useRbox.hidden{display:none}';
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'topRightUser';
  root.innerHTML = '<div id="Rcircle">R</div><div id="Ricons"><div id="iconUser">👤</div></div><div id="useRbox" class="hidden"><input type="text" id="username"><input type="checkbox" id="rbRoomVisible"></div>';
  document.body.appendChild(root);
  root.querySelector('#Rcircle').onclick = () => root.classList.toggle('open');
  root.querySelector('#iconUser').onclick = () => root.querySelector('#useRbox').classList.toggle('hidden');
  const box = root.querySelector('#useRbox');
  const ap = document.createElement('button'); ap.id = 'rbApprove'; ap.textContent = 'approve'; box.appendChild(ap);
  ap.onclick = () => { try { localStorage.removeItem('rvProfileDraft'); } catch (e) {} };
  window.rvUserbox = { get() { try { return JSON.parse(localStorage.getItem('mock.profile') || '{}'); } catch (e) { return {}; } }, save() {}, setChannelPeople(list) { window.__rbPeople = list; },
    showProfile(p) { window.__rbShown = JSON.parse(JSON.stringify(p)); }, open(section) { window.__rbOpen = section; box.classList.remove('hidden'); },
    presence: { publish() { calls.publish++; return Promise.resolve(); }, listen() { calls.listen++; return Promise.resolve(); }, leave() { calls.leave++; return Promise.resolve(); } } };
})();`;

const overlap = (a, b) => a && b && a.width > 0 && b.width > 0 && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  });
  const open = async (vp, opts = {}) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport(vp);
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    if (!opts.real || opts.block) {
      await page.setRequestInterception(true);
      page.on('request', r => {
        if (opts.block && opts.block.test(r.url())) r.abort();
        else if (!opts.real && /useRbox\.js/.test(r.url())) r.respond({ status: 200, contentType: 'application/javascript', body: MOCK });
        else r.continue();
      });
    }
    if (opts.before) await page.evaluateOnNewDocument(opts.before);
    await page.goto(url + (opts.query || ''), { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => CHEMVENTUR.Stage3Game.ready);
    await page.waitForFunction(() => document.getElementById('topRightUser'), { timeout: 20000 });
    await sleep(700);
    return { page, ctx, errors, ev: (fn, ...a) => page.evaluate(fn, ...a) };
  };
  console.log('# ' + url);

  // ===== desktop, mocked useRbox =====
  let { page, ctx, errors, ev } = await open({ width: 1280, height: 760 }, { before: () => { try { localStorage.setItem('rudventur_channel', 'kitchen'); } catch (e) {} } });
  let s = await ev(() => CHEMVENTUR.net.status());
  ok(!!s && s.available && !s.enabled && !s.joined, 'CHEMVENTUR.net exists, sees the useRbox, and is OFF by default', JSON.stringify(s));
  const row = await ev(() => { const r = document.querySelector('.s3g-optpanel .s3g-netrow'); return r ? { text: r.textContent, checked: r.querySelector('input').checked } : null; });
  ok(row && /Show me to others/.test(row.text) && row.checked === false, 'the options window has "Show me to others (multiplayer preview)", unticked', row && row.text);
  ok(await ev(() => CHEMVENTUR.net.sendState({ x: 1, y: 2, z: 3 }) === false && window.__rbCalls.publish === 0), 'while off, sendState does nothing and nothing is published');

  const layout = async (p) => p.evaluate(() => {
    const R = document.getElementById('Rcircle').getBoundingClientRect();
    const sel = '.s3g-actions > *, .s3g-ptog, .s3g-pad, .s3g-stick, .s3g-touchbar, .s3g-tl, .s3g-guns, .s3g-timebtn, .s3g-instr';
    const hits = [];
    document.querySelectorAll(sel).forEach(e => {
      const r = e.getBoundingClientRect(); if (!r.width || getComputedStyle(e).visibility === 'hidden') return;
      if (!(r.right <= R.left || R.right <= r.left || r.bottom <= R.top || R.bottom <= r.top)) hits.push(e.className + ' ' + (e.title || e.textContent).slice(0, 20));
    });
    const top = document.elementFromPoint(R.left + R.width / 2, R.top + R.height / 2);
    return { R: [Math.round(R.left), Math.round(R.top), Math.round(R.width)], hits, rOnTop: !!(top && top.closest('#topRightUser')), vw: innerWidth };
  });
  let L = await layout(page);
  ok(L.hits.length === 0 && L.rOnTop && L.R[0] + L.R[2] > L.vw - 80, 'desktop start screen: the R is top-right, on top, and nothing of the game overlaps it', JSON.stringify(L));
  await ev(() => CHEMVENTUR.Stage3Game.Game.start()); await sleep(400);
  L = await layout(page);
  ok(L.hits.length === 0 && L.rOnTop, 'desktop in game: corner toggles, gear, keyboard button, HUD and pads stay clear of the R', JSON.stringify(L.hits));

  // opening the useRbox pauses; typing there does not reach the game
  await page.click('#Rcircle'); await page.click('#iconUser'); await sleep(500);
  s = await ev(() => ({ paused: CHEMVENTUR.Stage3Game.Game.paused, keys: CHEMVENTUR.Stage3Game.Game.keys.size }));
  ok(s.paused && s.keys === 0, 'opening the useRbox panel pauses the game and clears held keys', JSON.stringify(s));
  const gun0 = await ev(() => CHEMVENTUR.Stage3Game.Game.gun);
  await page.click('#username'); await page.keyboard.type('1 2 wasd p'); await sleep(100);
  s = await ev(() => ({ gun: CHEMVENTUR.Stage3Game.Game.gun, paused: CHEMVENTUR.Stage3Game.Game.paused, val: document.getElementById('username').value }));
  ok(s.gun === gun0 && s.paused && s.val === '1 2 wasd p', 'typing in the useRbox never triggers game keys (guns, pause, flying)', JSON.stringify(s));
  await page.click('#iconUser'); await sleep(500);
  ok(await ev(() => !CHEMVENTUR.Stage3Game.Game.paused), 'closing the useRbox panel resumes the game');
  await ev(() => CHEMVENTUR.Stage3Game.Game.pause()); await page.click('#iconUser'); await sleep(400); await page.click('#iconUser'); await sleep(400);
  ok(await ev(() => CHEMVENTUR.Stage3Game.Game.paused), 'a game the player paused stays paused after the useRbox closes');
  await ev(() => CHEMVENTUR.Stage3Game.Game.resume());

  // the ☰ row has a 👤 useRbox entry; the R's rolling icons never cover the ☰ row
  const iconsClear = (p) => p.evaluate(() => {
    const I = document.getElementById('Ricons').getBoundingClientRect(), R = document.getElementById('Rcircle').getBoundingClientRect();
    const hits = [];
    document.querySelectorAll('.s3g-actions > *').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width) return;
      for (const B of [I, R]) if (!(r.right <= B.left || B.right <= r.left || r.bottom <= B.top || B.bottom <= r.top)) hits.push((e.title || e.textContent).slice(0, 16)); });
    return hits; });
  await ev(() => { const r = document.getElementById('topRightUser'); if (!r.classList.contains('open')) r.classList.add('open'); }); await sleep(450);
  let hits = await iconsClear(page);
  ok(hits.length === 0, 'desktop: with the R rolled out, its icons cover nothing of the ☰ row', hits.join(','));
  s = await ev(() => { const b = document.querySelector('.s3g-actions .s3g-rboxbtn'); if (!b || b.hidden) return null; b.click(); return true; }); await sleep(450);
  const st2 = await ev(() => ({ open: !document.getElementById('useRbox').classList.contains('hidden'), paused: CHEMVENTUR.Stage3Game.Game.paused }));
  ok(s && st2.open && st2.paused, 'the 👤 useRbox button in the ☰ row opens the useRbox (and the game pauses)', JSON.stringify(st2));
  await ev(() => document.getElementById('useRbox').classList.add('hidden')); await sleep(450);
  await ev(() => document.getElementById('topRightUser').classList.remove('open'));

  // turn multiplayer on from the options window: it follows the room picked in the useRbox ("kitchen") and does NOT switch room sharing on
  await ev(() => { const i = document.querySelector('.s3g-netrow input'); i.checked = true; i.dispatchEvent(new Event('change')); }); await sleep(300);
  s = await ev(() => ({ st: CHEMVENTUR.net.status(), ch: localStorage.getItem('rudventur_channel'), vis: document.getElementById('rbRoomVisible').checked, calls: window.__rbCalls, saved: localStorage.getItem('cv.s3g.net.v1') }));
  ok(s.st.enabled && s.st.joined && s.st.room === 'kitchen' && s.ch === 'kitchen' && s.calls.publish === 1 && s.calls.listen === 1 && s.saved === '1',
    'ticking it joins the room picked in the useRbox ("kitchen": publish + listen) and remembers the choice', JSON.stringify(s));
  ok(!s.vis && s.st.sharing === false, 'turning multiplayer on never switches the useRbox room sharing on by itself', JSON.stringify({ vis: s.vis, sharing: s.st.sharing }));
  ok(await ev(() => CHEMVENTUR.net.sendState({ x: 1, y: 2, z: 3 }) === false), 'without a ship-state transport (no Firebase here) sendState returns false');

  // peers -> ghost ships
  s = await ev(() => { const got = []; const off = CHEMVENTUR.net.onPeers(l => got.push(l.length));
    window.rvUserbox.setChannelPeople([{ id: 'u1', username: 'Ann' }, { id: 'u2', username: 'Bob' }, { username: 'no id' }, null]);
    off(); const ghosts = CHEMVENTUR.Stage3Game.Game.scene.children.filter(o => /^ghost:/.test(o.name)).map(o => o.name);
    return { got, ghosts, people: (window.__rbPeople || []).length }; });
  ok(s.got[0] === 2 && s.ghosts.length === 2 && s.people === 4, 'people in the room reach onPeers (bad entries dropped) and show as 2 ghost ships; the useRbox still gets its list', JSON.stringify(s));

  // a fake transport (no database): nothing leaves while room sharing is off
  await ev(() => { window.__sent = []; window.__tr = { watch: [], leave: [] };
    CHEMVENTUR.net.useTransport({ sendState: (room, st) => { window.__sent.push([room, st]); }, onState: (cb) => { window.__push = cb; },
      watch: (r) => window.__tr.watch.push(r), leave: (r) => window.__tr.leave.push(r) }); });
  await sleep(1100);
  s = await ev(() => ({ n: window.__sent.length, watch: window.__tr.watch, p: CHEMVENTUR.net.sharedProfile(), btn: !document.querySelector('.s3g-netvis').hidden, info: document.querySelector('.s3g-netinfo').textContent }));
  ok(s.n === 0 && s.p === null && s.watch[0] === 'kitchen', 'room sharing off in the useRbox: no ship and no profile is sent, but the game room is watched', JSON.stringify(s));
  ok(s.btn && /hidden/.test(s.info), 'the option says you are hidden and offers "👁 Show me in the room list"', s.info);
  await ev(() => { localStorage.setItem('rvProfileDraft', JSON.stringify({ username: 'Draft Only', avatar: '🐙' })); document.querySelector('.s3g-netvis').click(); }); await sleep(1100);
  s = await ev(() => ({ vis: document.getElementById('rbRoomVisible').checked, n: window.__sent.length, keys: window.__sent[0] && Object.keys(window.__sent[0][1]).sort().join(','), room: window.__sent[0] && window.__sent[0][0], p: CHEMVENTUR.net.sharedProfile(), info: document.querySelector('.s3g-netinfo').textContent }));
  ok(s.vis && s.n >= 3 && s.n <= 7 && s.room === 'kitchen' && s.keys === 'gun,pitch,roll,x,y,yaw,z', 'the 👁 button ticks room sharing; ship states then go out about 5 times a second, only clean fields', JSON.stringify(s));
  ok(s.p === null && /approve your profile/.test(s.info), 'a profile that is only a draft (never approved) is not shared at all: no name, no avatar', JSON.stringify(s.p) + ' · ' + s.info);

  // approve a profile in the useRbox: the ship carries only the approved, public, shared fields, at once
  s = await ev(async () => {
    localStorage.setItem('mock.profile', JSON.stringify({ username: 'Mateusz', avatar: '🦊', psignature: 'Bonds in 3D', currentLoc: '1 Secret Street, London', languages: 'en,pl' }));
    localStorage.setItem('rvRobot', '1');
    localStorage.setItem('rvNowState', JSON.stringify({ mood: '😀 Happy', status: 'playing', doing: '🛠 private plans', energy: '🔋 4', chat: 'yes', game: '🧪 ChemVentur', looking: '🤝 New friends',
      share: { mood: true, status: true, chat: true, game: true } }));
    localStorage.setItem('rvProfileDraft', JSON.stringify({ username: 'Unapproved Name', avatar: '🐙' }));
    const before = window.__sent.length;
    document.getElementById('rbApprove').click();
    await new Promise(r => setTimeout(r, 120));
    const last = window.__sent[window.__sent.length - 1][1];
    return { fast: window.__sent.length > before, p: last.p, keys: Object.keys(last).sort().join(',') };
  });
  ok(s.fast && s.p && s.p.name === 'Mateusz' && s.p.avatar === '🦊' && s.p.robot === true, 'approving the profile updates the ship at once: approved name, avatar and the 🤖 robot badge', JSON.stringify(s));
  ok(s.p && JSON.stringify(s.p.now) === JSON.stringify({ mood: '😀 Happy', game: '🧪 ChemVentur', status: 'playing', chat: true }), 'only the "right now" lines with their 👁 share box ticked go out (doing, energy and looking stay private)', JSON.stringify(s.p && s.p.now));
  ok(s.p && Object.keys(s.p).sort().join(',') === 'avatar,name,now,robot' && !/Secret|Bonds|Unapproved|🐙/.test(JSON.stringify(s.p)), 'nothing else leaves: no location, signature, languages, and never the unapproved draft', JSON.stringify(s.p));

  // private mode or room sharing off again: sending stops
  s = await ev(async () => {
    localStorage.setItem('rvPrivacy', 'private'); await new Promise(r => setTimeout(r, 1200)); const a = window.__sent.length;
    await new Promise(r => setTimeout(r, 600)); const b = window.__sent.length; localStorage.removeItem('rvPrivacy');
    const box = document.getElementById('rbRoomVisible'); box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300)); const c = window.__sent.length; await new Promise(r => setTimeout(r, 700)); const d = window.__sent.length;
    box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
    return { a, b, c, d, p: CHEMVENTUR.net.sharedProfile() && CHEMVENTUR.net.sharedProfile().name };
  });
  ok(s.a === s.b && s.c === s.d && s.p === 'Mateusz', 'the useRbox private mode or room sharing switched off stops every ship update; switching back resumes it', JSON.stringify(s));

  // incoming ships with profiles: name tags, robot badge, clean fields only
  s = await ev(async () => {
    const seen = []; const off = CHEMVENTUR.net.onState((id, st) => seen.push([id, st]));
    window.__push('u1', { x: 6, y: 1, z: 30, yaw: 0, pitch: 0, roll: 0, gun: 'proton', p: { name: 'Ann', avatar: '🦄', robot: true, loc: 'Paris', note: 'secret', now: { mood: '🤩 Excited', status: 'playing', chat: true, evil: '<script>' } } });
    window.__push('u2', { x: -6, y: 1, z: 30, yaw: 0, pitch: 0, roll: 0, gun: 'c2c', p: { name: 'Bob', avatar: '🐸' } });
    off(); await new Promise(r => setTimeout(r, 100));
    const tags = Array.from(document.querySelectorAll('.s3g-ghosttag')).map(t => ({ id: t.dataset.id, text: t.textContent, robot: t.dataset.robot }));
    return { tags, p1: seen[0] && seen[0][1].p };
  });
  const tA = s.tags.find(t => t.id === 'u1'), tB = s.tags.find(t => t.id === 'u2');
  ok(s.tags.length === 2 && tA && tA.text === '🦄 Ann 🤖' && tA.robot === '1' && tB && tB.text === '🐸 Bob', 'other players\' ghost ships get name tags with their avatar, and 🤖 for robots', JSON.stringify(s.tags));
  ok(s.p1 && !('loc' in s.p1) && !('note' in s.p1) && !('evil' in (s.p1.now || {})), 'incoming profiles are cleaned: only name, avatar, robot and the known "right now" lines', JSON.stringify(s.p1));
  s = await ev(() => (window.__rbPeople || []).filter(p => p && p.inGame).map(p => p.username).sort());
  ok(s.join() === 'Ann 🚀,Bob 🚀', 'the useRbox people list shows who is flying in the game room (🚀)', JSON.stringify(s));

  // the tags follow their ships on screen; a click or tap opens that profile in the useRbox middle column
  await ev(() => { const g = CHEMVENTUR.Stage3Game.Game; g.ship.position.set(0, 0, 50); g.ship.quaternion.identity(); g.yaw = 0; g.pitch = 0; }); await sleep(400);
  s = await ev(() => { const t = document.querySelector('.s3g-ghosttag[data-id="u1"]'), r = t.getBoundingClientRect(); return { hidden: t.hidden, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; });
  ok(!s.hidden && s.w > 20 && s.x > 0 && s.x < 1280 && s.y > 0 && s.y < 760, 'a ship in front of you shows its tag on screen', JSON.stringify(s));
  await page.click('.s3g-ghosttag[data-id="u1"]'); await sleep(450);
  s = await ev(() => ({ shown: window.__rbShown, open: window.__rbOpen, paused: CHEMVENTUR.Stage3Game.Game.paused, boxOpen: !document.getElementById('useRbox').classList.contains('hidden') }));
  ok(s.shown && s.shown.id === 'u1' && s.shown.username === 'Ann' && s.shown.robot === true && s.shown.now && s.shown.now.mood === '🤩 Excited' && s.open === 'mid' && s.boxOpen && s.paused,
    'clicking a name tag opens that player\'s profile in the useRbox middle column (rvUserbox.showProfile) and pauses the game', JSON.stringify(s));
  await ev(() => document.getElementById('useRbox').classList.add('hidden')); await sleep(450);
  await ev(() => { window.__rbShown = null; const g = CHEMVENTUR.Stage3Game.Game; g.ship.position.set(-5, 1, 31); }); await page.keyboard.press('KeyI'); await sleep(450);
  s = await ev(() => window.__rbShown && window.__rbShown.username);
  ok(s === 'Bob', 'the key I (rebindable "peerProfile") opens the nearest player\'s profile', String(s));
  await ev(() => document.getElementById('useRbox').classList.add('hidden')); await sleep(450);

  // live profile edits from another player: the tag and the people list change at once
  s = await ev(async () => { window.__push('u1', { x: 6, y: 1, z: 30, yaw: 0, pitch: 0, roll: 0, gun: 'proton', p: { name: 'Ann B', avatar: '🚀' } }); await new Promise(r => setTimeout(r, 50));
    return { tag: document.querySelector('.s3g-ghosttag[data-id="u1"]').textContent, people: (window.__rbPeople || []).filter(p => p && p.id === 'u1').map(p => p.username) }; });
  ok(s.tag === '🚀 Ann B' && s.people[0] === 'Ann B 🚀', 'an approved edit from another player updates their tag (robot badge gone too) and the useRbox list live', JSON.stringify(s));
  s = await ev(async () => { window.__push('u2', null); await new Promise(r => setTimeout(r, 50)); return { tags: document.querySelectorAll('.s3g-ghosttag').length, ghosts: CHEMVENTUR.Stage3Game.Game.scene.children.filter(o => /^ghost:/.test(o.name)).length }; });
  ok(s.tags === 2 && s.ghosts === 2, 'a player who left the game but is still in the room keeps a parked ghost', JSON.stringify(s));

  // my own approved edit while playing: the next ship update carries it
  s = await ev(async () => { const p = JSON.parse(localStorage.getItem('mock.profile')); p.avatar = '🧪'; localStorage.setItem('mock.profile', JSON.stringify(p));
    document.getElementById('rbApprove').click(); await new Promise(r => setTimeout(r, 150)); return window.__sent[window.__sent.length - 1][1].p; });
  ok(s && s.avatar === '🧪' && s.name === 'Mateusz', 'my own profile edit approved while playing reaches my ship at once', JSON.stringify(s));

  // a room or channel picked in the useRbox moves the game there
  s = await ev(async () => { localStorage.setItem('rudventur_channel', 'night-owls');
    document.dispatchEvent(new CustomEvent('rv:channel', { detail: { channel: 'night-owls', from: 'useRbox' } }));
    window.__sent.length = 0; await new Promise(r => setTimeout(r, 700));
    return { room: CHEMVENTUR.net.status().room, leave: window.__tr.leave.slice(), watch: window.__tr.watch.slice(), sentRoom: window.__sent[0] && window.__sent[0][0],
      ghosts: CHEMVENTUR.Stage3Game.Game.scene.children.filter(o => /^ghost:/.test(o.name)).length, tags: document.querySelectorAll('.s3g-ghosttag').length }; });
  ok(s.room === 'night-owls' && s.leave.includes('kitchen') && s.watch[s.watch.length - 1] === 'night-owls' && s.sentRoom === 'night-owls' && s.ghosts === 0 && s.tags === 0,
    'joining a channel in the useRbox moves the game room: the old ship record and ghosts go, ships go to the new room', JSON.stringify(s));

  // turning it off
  await ev(() => { const i = document.querySelector('.s3g-netrow input'); i.checked = false; i.dispatchEvent(new Event('change')); }); await sleep(300);
  s = await ev(async () => { const n = window.__sent.length; await new Promise(r => setTimeout(r, 700));
    return { st: CHEMVENTUR.net.status(), ch: localStorage.getItem('rudventur_channel'), leave: window.__rbCalls.leave, trLeave: window.__tr.leave.length, ghosts: CHEMVENTUR.Stage3Game.Game.scene.children.filter(o => /^ghost:/.test(o.name)).length,
      send: CHEMVENTUR.net.sendState({ x: 0 }), more: window.__sent.length - n, p: CHEMVENTUR.net.sharedProfile() }; });
  ok(!s.st.joined && s.ch === 'night-owls' && s.leave === 1 && s.trLeave >= 2 && s.ghosts === 0 && s.send === false && s.more === 0 && s.p === null,
    'unticking leaves the room (keeps the channel the player picked), removes the ship record and the ghosts, and shares nothing more', JSON.stringify(s));
  ok(errors.length === 0, 'no page errors (desktop)', errors.join(' | '));
  await ctx.close();

  // ===== phone, mocked =====
  ({ page, ctx, errors, ev } = await open({ width: 844, height: 390, isMobile: true, hasTouch: true }, {}));
  L = await layout(page);
  ok(L.hits.length === 0 && L.rOnTop && L.R[2] <= 44, 'phone start screen: a smaller R, nothing overlapping', JSON.stringify(L));
  await ev(() => CHEMVENTUR.Stage3Game.Game.start()); await sleep(400);
  L = await layout(page);
  ok(L.hits.length === 0 && L.rOnTop, 'phone in game: touch pads, toggles and HUD stay clear of the R', JSON.stringify(L.hits));
  await ev(() => document.getElementById('topRightUser').classList.add('open')); await sleep(450);
  { const hp = await page.evaluate(() => {
      const I = document.getElementById('Ricons').getBoundingClientRect(), hits = [];
      document.querySelectorAll('.s3g-actions > *, .s3g-touchbar > *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && !(r.right <= I.left || I.right <= r.left || r.bottom <= I.top || I.bottom <= r.top)) hits.push(e.title || e.textContent); });
      return hits; });
    ok(hp.length === 0, 'phone: with the R rolled out, its icons cover nothing of the ☰ row or the touch buttons', hp.join(',')); }
  await ev(() => document.getElementById('topRightUser').classList.remove('open'));
  await ev(() => { CHEMVENTUR.Stage3Game.Steering.setMode && CHEMVENTUR.Stage3Game.Steering.setMode('cessna'); }); await sleep(300);
  L = await layout(page);
  ok(L.hits.length === 0 && L.rOnTop, 'phone, Cessna sticks and instruments: still clear of the R', JSON.stringify(L.hits));
  // no room picked in the useRbox yet: the game uses "chemventur" and gives the empty choice back on leave
  s = await ev(async () => { const i = document.querySelector('.s3g-netrow input'); i.checked = true; i.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 200));
    const a = { room: CHEMVENTUR.net.status().room, ch: localStorage.getItem('rudventur_channel') };
    window.__push = null; CHEMVENTUR.net.useTransport({ sendState() {}, onState(cb) { window.__push = cb; } });
    window.__push('p1', { x: 0, y: 0, z: 0, p: { name: 'Zed', avatar: '🐝' } }); await new Promise(r => setTimeout(r, 50));
    const t = document.querySelector('.s3g-ghosttag'); t.hidden = false; const r = t.getBoundingClientRect(); a.tagH = Math.round(r.height);
    i.checked = false; i.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 200));
    a.after = localStorage.getItem('rudventur_channel'); return a; });
  ok(s.room === 'chemventur' && s.ch === 'chemventur' && s.after === null, 'with no room picked in the useRbox the game uses "chemventur", and leaving gives the empty choice back', JSON.stringify(s));
  ok(s.tagH >= 28, 'phone: name tags are big enough to tap', 'height ' + s.tagH);
  ok(errors.length === 0, 'no page errors (phone)', errors.join(' | '));
  await ctx.close();

  // ===== screenshots: two ghost ships with name tags, and a profile opened from a ghost =====
  // REAL_RBOX=1 uses the real live useRbox for the look, with every Firebase and config request blocked, so nothing
  // reaches the live database; without it the mock stands in. Saved as v120-net-ghost-tags.png and v120-net-ghost-profile.png.
  {
    const real = !!process.env.REAL_RBOX;
    ({ page, ctx, errors, ev } = await open({ width: 1280, height: 760 }, { real, block: /firebase|gstatic\.com|googleapis|firebaseio|popcoin\/config\.js/,
      before: () => { try { localStorage.setItem('rudventur_channel', 'chemventur'); localStorage.setItem('cv.s3g.net.v1', '1'); } catch (e) {} } }));
    await ev(() => CHEMVENTUR.Stage3Game.Game.start()); await sleep(600);
    await ev(async () => {
      const N = CHEMVENTUR.net, g = CHEMVENTUR.Stage3Game.Game;
      if (!N.joined) await N.join();
      N.useTransport({ sendState() {}, onState(cb) { window.__push = cb; } });
      g.ship.position.set(0, 0, 50); g.ship.quaternion.identity(); g.yaw = 0; g.pitch = 0;
      window.rvUserbox.setChannelPeople([
        { id: 'ann', username: 'Ann', psignature: 'Bonds in 3D', publicNote: 'Ask me about chemistry 🧪', robot: true, channel: 'chemventur', now: { mood: '🤩 Excited', status: 'playing', doing: '🎮 Gaming', chat: true, game: '🧪 ChemVentur' } },
        { id: 'bob', username: 'Bob', publicNote: 'Looking for a gaming buddy 🎮', channel: 'chemventur', now: { mood: '😌 Calm', status: 'available', chat: false } }]);
      window.__push('ann', { x: 7, y: 1.5, z: 30, yaw: 0.4, pitch: 0, roll: 0.2, gun: 'proton', p: { name: 'Ann', avatar: '🦄', robot: true, now: { mood: '🤩 Excited', status: 'playing', doing: '🎮 Gaming', chat: true, game: '🧪 ChemVentur' } } });
      window.__push('bob', { x: -8, y: -1, z: 26, yaw: -0.3, pitch: 0.1, roll: 0, gun: 'c2c', p: { name: 'Bob', avatar: '🐸', now: { mood: '😌 Calm', status: 'available', chat: false } } });
      CHEMVENTUR.net.ghosts.forEach(gh => gh.mesh.scale.setScalar(1.6));
    });
    await sleep(700);
    const vis = await ev(() => Array.from(document.querySelectorAll('.s3g-ghosttag')).filter(t => !t.hidden).map(t => t.textContent));
    ok(vis.length === 2, (real ? 'REAL useRbox: ' : '') + 'screenshot: two ghost ships with their name tags on screen', JSON.stringify(vis));
    await page.screenshot({ path: path.join(shotDir, 'v120-net-ghost-tags.png') });
    await page.click('.s3g-ghosttag[data-id="ann"]'); await sleep(900);
    const shown = await ev(() => { const v = document.getElementById('rbViewed'); return v ? { open: !v.classList.contains('hidden'), title: (document.getElementById('rbViewedTitle') || {}).textContent, body: v.textContent.slice(0, 300) } : { mock: window.__rbShown && window.__rbShown.username }; });
    ok(real ? shown.open && /Ann/.test(shown.title) && /Robot/.test(shown.body) && /Excited/.test(shown.body) : shown.mock === 'Ann', (real ? 'REAL useRbox: ' : '') + 'screenshot: Ann\'s profile opened from her ghost ship (robot badge and "right now" lines)', JSON.stringify(shown));
    await page.screenshot({ path: path.join(shotDir, 'v120-net-ghost-profile.png') });
    ok(errors.length === 0, 'no page errors (screenshots)', errors.join(' | '));
    await ctx.close();
  }

  // ===== the real live useRbox: screenshots =====
  if (process.env.REAL_RBOX) {
    for (const [vp, name] of [[{ width: 1280, height: 760 }, 'v120-rbox-desktop.png'], [{ width: 844, height: 390, isMobile: true, hasTouch: true }, 'v120-rbox-phone.png']]) {
      ({ page, ctx, errors, ev } = await open(vp, { real: true }));
      await ev(() => CHEMVENTUR.Stage3Game.Game.start()); await sleep(500);
      L = await layout(page);
      ok(L.hits.length === 0 && L.rOnTop, 'REAL useRbox (' + vp.width + '×' + vp.height + '): nothing overlaps the R', JSON.stringify(L));
      await page.click('#Rcircle'); await sleep(600);
      { const hr = await page.evaluate(() => { const I = document.getElementById('Ricons').getBoundingClientRect(), hits = [];
          document.querySelectorAll('.s3g-actions > *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && !(r.right <= I.left || I.right <= r.left || r.bottom <= I.top || I.bottom <= r.top)) hits.push(e.title || e.textContent); });
          return hits; });
        ok(hr.length === 0, 'REAL useRbox (' + vp.width + '): the rolled-out R icons cover nothing of the ☰ row', hr.join(',')); }
      await page.screenshot({ path: path.join(shotDir, name) });
      if (vp.width === 1280) await page.evaluate(() => { if (document.querySelector('.s3g-hide-actions')) document.querySelector('.s3g-actions .s3g-ptog').click(); });
      if (vp.width === 1280) await sleep(300);
      if (vp.width === 1280) await page.screenshot({ path: path.join(shotDir, 'v120-corner-rbox.png'), clip: { x: 560, y: 0, width: 720, height: 200 } });
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
