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
  css.textContent = '#topRightUser{position:fixed;top:14px;right:14px;z-index:999999}#Rcircle{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font-size:28px;color:#0f4;border:3px solid #0f4;background:#000}#useRbox{position:fixed;top:90px;right:14px;width:300px;height:300px;background:#020}#useRbox.hidden{display:none}';
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'topRightUser';
  root.innerHTML = '<div id="Rcircle">R</div><div id="Ricons"><div id="iconUser">👤</div></div><div id="useRbox" class="hidden"><input type="text" id="username"><input type="checkbox" id="rbRoomVisible"></div>';
  document.body.appendChild(root);
  root.querySelector('#Rcircle').onclick = () => root.classList.toggle('open');
  root.querySelector('#iconUser').onclick = () => root.querySelector('#useRbox').classList.toggle('hidden');
  window.rvUserbox = { get() { return {}; }, save() {}, setChannelPeople(list) { window.__rbPeople = list; },
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
    if (!opts.real) {
      await page.setRequestInterception(true);
      page.on('request', r => {
        if (/useRbox\.js/.test(r.url())) r.respond({ status: 200, contentType: 'application/javascript', body: MOCK });
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

  // turn the preview on from the options window
  await ev(() => { const i = document.querySelector('.s3g-netrow input'); i.checked = true; i.dispatchEvent(new Event('change')); }); await sleep(300);
  s = await ev(() => ({ st: CHEMVENTUR.net.status(), ch: localStorage.getItem('rudventur_channel'), vis: document.getElementById('rbRoomVisible').checked, calls: window.__rbCalls, saved: localStorage.getItem('cv.s3g.net.v1') }));
  ok(s.st.enabled && s.st.joined && s.st.room === 'chemventur' && s.ch === 'chemventur' && s.vis && s.calls.publish === 1 && s.calls.listen === 1 && s.saved === '1',
    'ticking it joins the useRbox room "chemventur" (publish + listen, the useRbox room-list switch on) and remembers the choice', JSON.stringify(s));
  ok(await ev(() => CHEMVENTUR.net.sendState({ x: 1, y: 2, z: 3 }) === false), 'without a ship-state transport (rules not added yet) sendState returns false');

  // peers -> ghost ships
  s = await ev(() => { const got = []; const off = CHEMVENTUR.net.onPeers(l => got.push(l.length));
    window.rvUserbox.setChannelPeople([{ id: 'u1', username: 'Ann' }, { id: 'u2', username: 'Bob' }, { username: 'no id' }, null]);
    off(); const ghosts = CHEMVENTUR.Stage3Game.Game.scene.children.filter(o => /^ghost:/.test(o.name)).map(o => o.name);
    return { got, ghosts, people: (window.__rbPeople || []).length }; });
  ok(s.got[0] === 2 && s.ghosts.length === 2 && s.people === 4, 'people in the room reach onPeers (bad entries dropped) and show as 2 ghost ships; the useRbox still gets its list', JSON.stringify(s));

  // a mock transport: states go out 5 times a second, incoming states move ghosts
  s = await ev(async () => { const sent = []; let push;
    CHEMVENTUR.net.useTransport({ sendState: (room, st) => sent.push([room, st]), onState: (cb) => { push = cb; } });
    await new Promise(r => setTimeout(r, 1100));
    push('u1', { x: 10, y: -5, z: 20, yaw: 1, pitch: 0, roll: 0, gun: 'proton', evil: '<script>' });
    const g = CHEMVENTUR.Stage3Game.Game.scene.children.find(o => o.name === 'ghost:Ann');
    return { n: sent.length, room: sent[0] && sent[0][0], keys: sent[0] && Object.keys(sent[0][1]).sort().join(','), pos: [g.position.x, g.position.y, g.position.z] }; });
  ok(s.n >= 3 && s.n <= 7 && s.room === 'chemventur' && s.keys === 'gun,pitch,roll,x,y,yaw,z', 'with a transport the ship state is sent about 5 times a second, only clean fields', JSON.stringify(s));
  ok(s.pos.join() === '10,-5,20', 'an incoming ship state moves that player\'s ghost ship', s.pos.join());

  // turning it off
  await ev(() => { const i = document.querySelector('.s3g-netrow input'); i.checked = false; i.dispatchEvent(new Event('change')); }); await sleep(300);
  s = await ev(() => ({ st: CHEMVENTUR.net.status(), ch: localStorage.getItem('rudventur_channel'), leave: window.__rbCalls.leave, ghosts: CHEMVENTUR.Stage3Game.Game.scene.children.filter(o => /^ghost:/.test(o.name)).length, send: CHEMVENTUR.net.sendState({ x: 0 }) }));
  ok(!s.st.joined && s.ch === 'kitchen' && s.leave === 1 && s.ghosts === 0 && s.send === false, 'unticking leaves the room, gives back the previous room "kitchen", removes the ghosts and stops sending', JSON.stringify(s));
  ok(errors.length === 0, 'no page errors (desktop)', errors.join(' | '));
  await ctx.close();

  // ===== phone, mocked =====
  ({ page, ctx, errors, ev } = await open({ width: 844, height: 390, isMobile: true, hasTouch: true }, {}));
  L = await layout(page);
  ok(L.hits.length === 0 && L.rOnTop && L.R[2] <= 44, 'phone start screen: a smaller R, nothing overlapping', JSON.stringify(L));
  await ev(() => CHEMVENTUR.Stage3Game.Game.start()); await sleep(400);
  L = await layout(page);
  ok(L.hits.length === 0 && L.rOnTop, 'phone in game: touch pads, toggles and HUD stay clear of the R', JSON.stringify(L.hits));
  await ev(() => { CHEMVENTUR.Stage3Game.Steering.setMode && CHEMVENTUR.Stage3Game.Steering.setMode('cessna'); }); await sleep(300);
  L = await layout(page);
  ok(L.hits.length === 0 && L.rOnTop, 'phone, Cessna sticks and instruments: still clear of the R', JSON.stringify(L.hits));
  ok(errors.length === 0, 'no page errors (phone)', errors.join(' | '));
  await ctx.close();

  // ===== the real live useRbox: screenshots =====
  if (process.env.REAL_RBOX) {
    for (const [vp, name] of [[{ width: 1280, height: 760 }, 'v120-rbox-desktop.png'], [{ width: 844, height: 390, isMobile: true, hasTouch: true }, 'v120-rbox-phone.png']]) {
      ({ page, ctx, errors, ev } = await open(vp, { real: true }));
      await ev(() => CHEMVENTUR.Stage3Game.Game.start()); await sleep(500);
      L = await layout(page);
      ok(L.hits.length === 0 && L.rOnTop, 'REAL useRbox (' + vp.width + '×' + vp.height + '): nothing overlaps the R', JSON.stringify(L));
      await page.click('#Rcircle'); await sleep(600);
      await page.screenshot({ path: path.join(shotDir, name) });
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
