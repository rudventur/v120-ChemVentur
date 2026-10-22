/* ============================================
   CHEMVENTUR v120 ADDITIONS 🚀🕸️🔧
   1. ROCKET DEPLOY POINTS: every shot leaves from a launch point on the ship
      (nose tube or alternating wing hardpoints), starts slow, burns its engine
      to full speed and leaves an exhaust trail.
   2. GUN 6 = SCRAP NET GUN: big nets fired at half the speed of light
      (game scaled) that catch anything coming. When a net stops it anchors as a
      Stage 0 gluon net (a real StringSystem gluon web, linked to other gluon webs).
      Caught things go to the scrap hold; metal atoms are counted on their own.
   3. METAL ONLY REPAIR: ship damage is shown on screen, and only scrapped METAL
      atoms (metals of the periodic table) can repair the ship.
   Only additions: loaded after main.js, wraps existing functions.
   ============================================ */
(function () {
  const CV = window.CHEMVENTUR;
  if (!CV || !CV.GunSystem) return;
  const GunSystem = CV.GunSystem;
  const Table = CV.PeriodicTableFull;

  // ---------- tuning ----------
  const LIGHT_SPEED = 80;               // game scale: light = 80 pixels per frame
  const NET = { speedOfLight: 0.5, size: 70, range: 520, anchorTime: 300, catchSlow: 0.9 };
  const ROCKET = { startSpeed: 0.3, burnFrames: 18, exhaust: 26 };
  const REPAIR_PER_METAL = 4;           // hull points fixed by one metal atom
  const HIT = { speed: 6, radius: 16, damage: 2, cooldownMs: 400 };

  // ---------- metal or not, straight from the periodic table ----------
  const NON_METAL = new Set(['nonmetal', 'noble-gas', 'halogen', 'metalloid', 'diatomic-nonmetal', 'polyatomic-nonmetal']);
  function elementInfo(Z) {
    const fromTable = Table?.ELEMENTS?.[Z] || Table?.getElement?.(Z) || Table?.elements?.[Z];
    return fromTable || CV.Elements?.get?.(Z) || null;
  }
  function isMetal(Z) {
    if (!Z || Z < 1) return false;
    const info = elementInfo(Z);
    const cat = (info && info.category || '').toLowerCase();
    if (cat) return !NON_METAL.has(cat) && !cat.includes('nonmetal') && !cat.includes('noble') && !cat.includes('halogen') && !cat.includes('metalloid');
    // fallback list of non metals and metalloids
    return ![1,2,5,6,7,8,9,10,14,15,16,17,18,32,33,34,35,36,51,52,53,54,85,86,117,118].includes(Z);
  }
  function symbolOf(Z) {
    const info = elementInfo(Z);
    return (info && info.symbol) || CV.Elements?.getSymbol?.(Z) || ('Z' + Z);
  }

  // ---------- the scrap hold ----------
  const Scrap = {
    metal: {},         // symbol -> count (only these repair the ship)
    metalTotal: 0,
    nonMetal: {},      // symbol -> count
    nonMetalTotal: 0,
    other: 0,          // strings, quarks, loose protons, neutrons, electrons, energies
    add(item) {
      const Z = item && !item.special && !item.type ? item.p : 0;
      if (Z >= 1 && isMetal(Z)) {
        const s = symbolOf(Z); this.metal[s] = (this.metal[s] || 0) + 1; this.metalTotal++; return 'metal';
      }
      if (Z >= 1) {
        const s = symbolOf(Z); this.nonMetal[s] = (this.nonMetal[s] || 0) + 1; this.nonMetalTotal++; return 'nonmetal';
      }
      this.other++; return 'other';
    },
    useMetal(n) {
      let left = n;
      for (const s of Object.keys(this.metal)) {
        const take = Math.min(left, this.metal[s]);
        this.metal[s] -= take; left -= take;
        if (this.metal[s] <= 0) delete this.metal[s];
        if (!left) break;
      }
      const used = n - left; this.metalTotal -= used; return used;
    }
  };

  // ---------- hull ----------
  const Hull = {
    lastHit: 0,
    damage() { return CV.StringSystem?.shipDamage || 0; },
    max() { return CV.StringSystem?.shipMaxDamage || 100; },
    hit(amount, reason) {
      if (CV.StringSystem?.damageShip) CV.StringSystem.damageShip(amount, reason);
      if (CV.ShipRepair?.ship) CV.ShipRepair.ship.currentHP = Math.max(0, CV.ShipRepair.ship.maxHP - this.damage());
    },
    // repair using ONLY metal atoms from the scrap hold
    repairWithMetal(maxAtoms) {
      const dmg = this.damage();
      if (dmg <= 0) { CV.UI?.showStatus('✅ Hull is already perfect'); return 0; }
      if (Scrap.metalTotal <= 0) { CV.UI?.showStatus('❌ No metal atoms! Net some metals with Gun 6 (iron, copper, sodium…). Non-metals cannot fix a ship.'); return 0; }
      const need = Math.ceil(dmg / REPAIR_PER_METAL);
      const used = Scrap.useMetal(Math.min(need, maxAtoms || need));
      const fix = Math.min(dmg, used * REPAIR_PER_METAL);
      CV.StringSystem.shipDamage = Math.max(0, dmg - fix);
      if (CV.StringSystem.achievements && CV.StringSystem.shipDamage < CV.StringSystem.shipMaxDamage) CV.StringSystem.achievements.shipDestroyed = false;
      if (CV.ShipRepair?.ship) CV.ShipRepair.ship.currentHP = Math.min(CV.ShipRepair.ship.maxHP, CV.ShipRepair.ship.maxHP - CV.StringSystem.shipDamage);
      CV.UI?.showStatus(`🔧 Welded with ${used} metal atom${used === 1 ? '' : 's'}: hull ${100 - CV.StringSystem.shipDamage}%`);
      Panel.update();
      return used;
    }
  };

  // The garage repairs now also only take metal atoms (cost in metal atoms = old cost ÷ 5)
  if (CV.ShipRepair) {
    const SR = CV.ShipRepair;
    SR.startRepair = function (repairType) {
      const option = this.REPAIR_OPTIONS[repairType];
      if (!option) return false;
      const metalCost = Math.max(1, Math.ceil(option.cost / 5));
      if (Scrap.metalTotal < metalCost) {
        CV.UI?.showStatus(`❌ Need ${metalCost} metal atoms! (Have: ${Scrap.metalTotal}). Only metal fixes the ship.`);
        return false;
      }
      this.ship.currentHP = this.ship.maxHP - Hull.damage();
      if (this.ship.currentHP >= this.ship.maxHP && !option.bonus) { CV.UI?.showStatus('✅ Ship already at full health!'); return false; }
      Scrap.useMetal(metalCost);
      this.isRepairing = true; this.currentRepairType = repairType; this.repairProgress = 0;
      CV.UI?.showStatus(`${option.icon} ${option.name} with ${metalCost} metal atoms...`);
      this.animateRepair(option);
      Panel.update();
      return true;
    };
  }

  // ---------- rocket deploy points ----------
  const Rockets = {
    side: 0,
    puffs: [],
    // nose tube for single shots, alternating wing hardpoints otherwise
    point(x, y, angle, gunId) {
      const nose = [0, 3, 6, 9].includes(gunId);
      if (nose) return { x: x + Math.cos(angle) * 22, y: y + Math.sin(angle) * 22, where: 'nose' };
      const s = (this.side++ % 2) ? 1 : -1;
      const px = -Math.sin(angle) * 13 * s, py = Math.cos(angle) * 13 * s;   // wing tip, sideways
      return { x: x + px + Math.cos(angle) * 6, y: y + py + Math.sin(angle) * 6, where: s < 0 ? 'left wing' : 'right wing' };
    },
    arm(obj) {
      if (!obj || obj._rocket || typeof obj.vx !== 'number') return;
      obj._rocket = { vx: obj.vx, vy: obj.vy, f: 0 };
      obj.vx *= ROCKET.startSpeed; obj.vy *= ROCKET.startSpeed;
    },
    tick(list) {
      for (const o of list) {
        const r = o && o._rocket; if (!r || r.f >= ROCKET.burnFrames) continue;
        r.f++;
        const k = ROCKET.startSpeed + (1 - ROCKET.startSpeed) * (r.f / ROCKET.burnFrames);
        o.vx = r.vx * k; o.vy = r.vy * k;
        if (this.puffs.length < 600) this.puffs.push({ x: o.x - r.vx * 0.4, y: o.y - r.vy * 0.4, life: ROCKET.exhaust, vx: -r.vx * 0.05 + (Math.random() - 0.5), vy: -r.vy * 0.05 + (Math.random() - 0.5) });
      }
    },
    draw(ctx) {
      for (let i = this.puffs.length - 1; i >= 0; i--) {
        const p = this.puffs[i];
        p.life--; p.x += p.vx; p.y += p.vy;
        if (p.life <= 0) { this.puffs.splice(i, 1); continue; }
        const t = p.life / ROCKET.exhaust;
        ctx.fillStyle = `rgba(255, ${Math.floor(120 + 120 * t)}, 40, ${0.6 * t})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2 + (1 - t) * 6, 0, Math.PI * 2); ctx.fill();
      }
    },
    flash(pt) {
      for (let i = 0; i < 6; i++) this.puffs.push({ x: pt.x, y: pt.y, life: 14, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3 });
    },
    lastPoint: null,
    launched: 0
  };

  // ---------- Gun 6: scrap net gun ----------
  const NetGun = {
    nets: [],
    caught: 0,
    fire(x, y, angle) {
      const speed = LIGHT_SPEED * NET.speedOfLight * ((CV.Guns[6]?.options?.speedShare?.value ?? 50) / 50);
      const size = CV.Guns[6]?.options?.netSize?.value || NET.size;
      const pt = Rockets.point(x, y, angle, 6);
      Rockets.flash(pt);
      this.nets.push({ x: pt.x, y: pt.y, sx: pt.x, sy: pt.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        angle, r: 8, size, state: 'flying', age: 0, caught: [], web: null, trail: [] });
      return { type: 'scrapnet' };
    },
    // anything near the net gets caught: atoms, loose particles, Stage 0 strings and quarks
    sweep(net, game) {
      const r2 = net.r * net.r;
      const grab = (list, kind) => {
        if (!list) return;
        for (let i = list.length - 1; i >= 0; i--) {
          const o = list[i];
          if (!o || o._fromNetShip) continue;
          const dx = o.x - net.x, dy = o.y - net.y;
          if (dx * dx + dy * dy > r2) continue;
          if (o._rocket && o._rocket.f < ROCKET.burnFrames) continue;   // our own rockets just launched
          list.splice(i, 1);
          const where = kind === 'atom' ? Scrap.add(o) : (Scrap.other++, 'other');
          net.caught.push({ where, sym: where === 'other' ? (kind === 'string' ? '〰' : '•') : symbolOf(o.p), ang: Math.random() * Math.PI * 2, d: Math.random() });
          if (net.web) net.web.capturedParticles.push(o.id || Math.random().toString(36).slice(2));
          this.caught++;
        }
      };
      if (game.stage === 0 && CV.StringSystem) {
        grab(CV.StringSystem.strings, 'string');
        grab(CV.StringSystem.quarks, 'quark');
        grab(CV.StringSystem.subatomicParticles, 'particle');
      } else {
        grab(game.atoms, 'atom');
      }
    },
    anchor(net, game) {
      net.state = 'anchored'; net.vx = net.vy = 0;
      const SS = CV.StringSystem;
      const web = { id: 'net-' + Math.random().toString(36).slice(2, 9), x: net.x, y: net.y, size: net.size, strength: 0.9, sticky: true,
        strings: [], age: 0, color: '#ffff00', capturedParticles: [], connected: [], fromNetGun: true };
      net.web = web;
      if (SS) {
        // link to the nearest existing Stage 0 gluon web, however far, so the nets become one gluon network
        let best = null, bd = Infinity;
        for (const w of SS.gluonWebs) { const d = Math.hypot(w.x - web.x, w.y - web.y); if (d < bd) { bd = d; best = w; } }
        if (best) { web.connected.push(best.id); best.connected = best.connected || []; best.connected.push(web.id); net.linkedTo = best; }
        SS.gluonWebs.push(web);
      }
      CV.UI?.showStatus(`🕸️ Net anchored as a gluon net${net.linkedTo ? ' and linked to the gluon network' : ''}: caught ${net.caught.length}`);
      Panel.update();
    },
    update(game) {
      for (let i = this.nets.length - 1; i >= 0; i--) {
        const n = this.nets[i];
        n.age++;
        if (n.state === 'flying') {
          // fly in small steps so a half light speed net never skips over anything
          const steps = 6;
          for (let s = 0; s < steps; s++) {
            n.x += n.vx / steps; n.y += n.vy / steps;
            n.r = Math.min(n.size, n.r + n.size / 20);
            this.sweep(n, game);
          }
          n.trail.push({ x: n.x, y: n.y }); if (n.trail.length > 8) n.trail.shift();
          const out = n.x < 0 || n.y < 0 || n.x > game.width || n.y > game.height;
          if (out) { n.x = Math.max(n.size, Math.min(game.width - n.size, n.x)); n.y = Math.max(n.size, Math.min(game.height - n.size, n.y)); }
          if (out || Math.hypot(n.x - n.sx, n.y - n.sy) > NET.range) this.anchor(n, game);
        } else {
          n.trail.length = 0;
          this.sweep(n, game);          // anchored nets keep catching anything coming in
          if (n.web) { n.web.x = n.x; n.web.y = n.y; }
          if (n.age > NET.anchorTime + 60) {
            const SS = CV.StringSystem;
            if (SS && n.web) { const k = SS.gluonWebs.indexOf(n.web); if (k >= 0) SS.gluonWebs.splice(k, 1); }
            this.nets.splice(i, 1);
          }
        }
      }
    },
    draw(ctx, game) {
      const SS = CV.StringSystem;
      for (const n of this.nets) {
        ctx.save();
        // light speed streak
        if (n.trail.length > 1) {
          ctx.strokeStyle = 'rgba(255,255,120,0.5)'; ctx.lineWidth = n.r * 0.6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(n.trail[0].x, n.trail[0].y); n.trail.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
        }
        // gluon tether from the net to the gluon web it is linked to
        if (n.linkedTo && SS && SS.gluonWebs.includes(n.linkedTo)) {
          ctx.strokeStyle = 'rgba(255,255,0,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
          const wob = Math.sin(Date.now() * 0.01) * 12;
          ctx.beginPath(); ctx.moveTo(n.x, n.y);
          ctx.quadraticCurveTo((n.x + n.linkedTo.x) / 2 + wob, (n.y + n.linkedTo.y) / 2 - wob, n.linkedTo.x, n.linkedTo.y); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
        // the net itself uses the Stage 0 gluon web drawing (in Stage 0 the string system draws anchored ones already)
        const asWeb = n.web || { x: n.x, y: n.y, size: n.r, color: '#ffff00', capturedParticles: n.caught };
        if (!(game.stage === 0 && n.web) && SS?.drawGluonWeb) { asWeb.size = n.web ? n.size : n.r; SS.drawGluonWeb(ctx, asWeb); }
        // caught things tangled in the net
        ctx.save(); ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        n.caught.slice(-24).forEach(c => {
          const rr = (n.web ? n.size : n.r) * 0.75 * c.d;
          ctx.fillStyle = c.where === 'metal' ? '#c0c8d8' : c.where === 'nonmetal' ? '#66ff99' : '#ffcc66';
          ctx.fillText(c.sym, n.x + Math.cos(c.ang) * rr, n.y + Math.sin(c.ang) * rr);
        });
        ctx.restore();
      }
    }
  };

  // ---------- Gun 6 config (the old Gun 6 shotgun lives on as Gun 5) ----------
  CV.Guns[6] = {
    id: 6, name: '🕸️ Scrap Net', description: 'Big gluon nets at half the speed of light: catch anything coming, scrap it!',
    special: 'scrapnet', color: '#ffff00',
    options: {
      netSize: { value: NET.size, min: 30, max: 140, label: '🕸️ Net Size' },
      speedShare: { value: 50, min: 10, max: 99, label: '💡 Speed (% of light)' }
    }
  };
  document.querySelectorAll('.gun-btn[data-gun="6"]').forEach(b => { b.textContent = '6:🕸️Net'; b.title = 'Scrap Net gun: half light speed gluon nets'; });

  // ---------- wrap the guns ----------
  const origFire = GunSystem.fire.bind(GunSystem);
  GunSystem.fire = function (shipX, shipY, atoms, projectiles) {
    if (this.currentGun === 6) return NetGun.fire(shipX, shipY, this.aimAngle);
    const pt = Rockets.point(shipX, shipY, this.aimAngle, this.currentGun);
    Rockets.lastPoint = pt;
    const before = atoms.length;
    const projBefore = {}; Object.keys(projectiles || {}).forEach(k => projBefore[k] = (projectiles[k] || []).length);
    const res = origFire(pt.x, pt.y, atoms, projectiles);
    for (let i = before; i < atoms.length; i++) { Rockets.arm(atoms[i]); Rockets.launched++; }
    Object.keys(projectiles || {}).forEach(k => { const L = projectiles[k] || []; for (let i = projBefore[k] || 0; i < L.length; i++) { Rockets.arm(L[i]); Rockets.launched++; } });
    Rockets.flash(pt);
    return res;
  };

  const SS = CV.StringSystem;
  if (SS) {
    const origString = SS.fireString.bind(SS);
    SS.fireString = function (shipX, shipY, gunId, aimAngle, isHeld) {
      if (gunId === 6) {
        if (isHeld) { if (NetGun._lastHeld && Date.now() - NetGun._lastHeld < 350) return null; NetGun._lastHeld = Date.now(); }
        return NetGun.fire(shipX, shipY, aimAngle);
      }
      const pt = Rockets.point(shipX, shipY, aimAngle, gunId);
      Rockets.lastPoint = pt;
      const before = this.strings.length;
      const res = origString(pt.x, pt.y, gunId, aimAngle, isHeld);
      for (let i = before; i < this.strings.length; i++) Rockets.arm(this.strings[i]);
      if (this.strings.length > before) { Rockets.flash(pt); Rockets.launched++; }
      return res;
    };
  }

  // ---------- hook the game loop ----------
  function hookGame() {
    const Game = CV.Game;
    if (!Game || !Game.update) return setTimeout(hookGame, 100);
    const origUpdate = Game.update.bind(Game);
    Game.update = function () {
      try { origUpdate(); } finally { v120Tick.call(this); }
    };
    function v120Tick() {
      Rockets.tick(this.atoms || []);
      Object.values(this.projectiles || {}).forEach(L => Array.isArray(L) && Rockets.tick(L));
      if (CV.StringSystem) Rockets.tick(CV.StringSystem.strings);
      if (this.timeScale !== 0) NetGun.update(this);
      // Stage 1 and 2: fast loose atoms hitting the hull do damage
      if (this.stage !== 0 && this.ship && Date.now() - Hull.lastHit > HIT.cooldownMs) {
        for (const a of this.atoms || []) {
          if (a._rocket) continue;     // our own shots never hurt us
          const d = Math.hypot(a.x - this.ship.x, a.y - this.ship.y);
          if (d < HIT.radius && Math.hypot(a.vx, a.vy) > HIT.speed) {
            Hull.hit(HIT.damage, 'fast ' + (a.special || symbolOf(a.p)) + ' hit the hull');
            a.vx = (a.x - this.ship.x) / (d || 1) * 4; a.vy = (a.y - this.ship.y) / (d || 1) * 4;
            Hull.lastHit = Date.now();
            break;
          }
        }
      }
      this._v120PanelTick = (this._v120PanelTick || 0) + 1;
      if (this._v120PanelTick % 15 === 0) Panel.update();
    }
    const origRender = Game.render.bind(Game);
    Game.render = function () {
      origRender();
      const ctx = CV.Renderer?.ctx; if (!ctx) return;
      Rockets.draw(ctx);
      NetGun.draw(ctx, this);
      drawShipDamage(ctx, this);
    };
  }

  // cracks and smoke on a damaged ship
  function drawShipDamage(ctx, game) {
    const dmg = Hull.damage(); if (!game.ship || dmg <= 0) return;
    const { x, y } = game.ship;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 80, 40, ${0.3 + dmg / 150})`; ctx.lineWidth = 1.5;
    const cracks = Math.ceil(dmg / 20);
    for (let i = 0; i < cracks; i++) {
      const a = i * 2.1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); ctx.lineTo(x + Math.cos(a + 0.5) * 14, y + Math.sin(a + 0.5) * 14); ctx.stroke();
    }
    if (dmg > 40 && Math.random() < dmg / 200) Rockets.puffs.push({ x: x + (Math.random() - 0.5) * 10, y, life: 30, vx: (Math.random() - 0.5) * 0.6, vy: -0.8 });
    // hull bar above the ship
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 20, y - 30, 40, 5);
    ctx.fillStyle = dmg > 70 ? '#ff3333' : dmg > 35 ? '#ffaa00' : '#00ff41'; ctx.fillRect(x - 20, y - 30, 40 * (1 - dmg / Hull.max()), 5);
    ctx.restore();
  }

  // ---------- hull and scrap panel ----------
  const Panel = {
    el: null,
    build() {
      const el = document.createElement('div');
      el.id = 'v120-hull-panel';
      el.style.cssText = 'position:fixed;right:10px;bottom:70px;z-index:900;background:rgba(0,12,4,0.88);border:1px solid #00ff41;border-radius:8px;padding:8px 10px;font:11px monospace;color:#cfe;min-width:190px;max-width:240px';
      el.innerHTML = `<div style="color:#00ff41;font-weight:bold">🛠️ HULL &amp; SCRAP HOLD</div>
        <div style="margin:4px 0;background:#222;height:8px;border-radius:4px;overflow:hidden"><div id="v120-hull-bar" style="height:100%;width:100%;background:#00ff41"></div></div>
        <div id="v120-hull-text">Hull 100%</div>
        <div id="v120-metal" style="color:#c0c8d8;margin-top:3px">🔩 Metal atoms: 0</div>
        <div id="v120-nonmetal" style="color:#66ff99">🧪 Non-metal scrap: 0 (cannot repair)</div>
        <div id="v120-other" style="color:#ffcc66">〰 Other scrap: 0</div>
        <button id="v120-repair-btn" style="margin-top:6px;width:100%;background:#0a3d1a;color:#00ff41;border:1px solid #00ff41;border-radius:5px;padding:4px;cursor:pointer;font:bold 11px monospace">🔧 Repair with metal</button>
        <div style="color:#888;margin-top:4px">Gun 6 🕸️ nets catch scrap. Only metal atoms fix the ship.</div>`;
      document.body.appendChild(el);
      el.querySelector('#v120-repair-btn').onclick = () => Hull.repairWithMetal();
      this.el = el;
    },
    update() {
      if (!this.el) { if (document.body) this.build(); else return; }
      const dmg = Hull.damage(), hull = Math.max(0, 100 - dmg);
      const bar = this.el.querySelector('#v120-hull-bar');
      bar.style.width = hull + '%'; bar.style.background = dmg > 70 ? '#ff3333' : dmg > 35 ? '#ffaa00' : '#00ff41';
      this.el.querySelector('#v120-hull-text').textContent = `Hull ${hull}%` + (dmg ? `, damage ${dmg}%` : '');
      const list = o => Object.entries(o).map(([s, c]) => s + '×' + c).join(' ');
      this.el.querySelector('#v120-metal').textContent = `🔩 Metal atoms: ${Scrap.metalTotal}` + (Scrap.metalTotal ? ' (' + list(Scrap.metal) + ')' : '');
      this.el.querySelector('#v120-nonmetal').textContent = `🧪 Non-metal scrap: ${Scrap.nonMetalTotal} (cannot repair)`;
      this.el.querySelector('#v120-other').textContent = `〰 Other scrap: ${Scrap.other}`;
      const btn = this.el.querySelector('#v120-repair-btn');
      btn.disabled = !(dmg > 0 && Scrap.metalTotal > 0); btn.style.opacity = btn.disabled ? 0.5 : 1;
    }
  };

  CV.V120Additions = { Scrap, Hull, NetGun, Rockets, Panel, isMetal, LIGHT_SPEED, NET };
  hookGame();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Panel.update()); else Panel.update();
})();
