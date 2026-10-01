/* ============================================
   CHEMVENTUR v116 - ENHANCEMENTS
   
   🎯 Right-click context menus for all buttons
   🚀 Ship movement controls (A/D/S)
   ✨ Gun 8 antimatter scrapping system
   ⬆️ 12-level upgrade system
   🛡️ Balanced ship damage
   🎮 Multiplayer foundation
   ============================================ */

(function() {
  
  // ===== 🚀 SHIP MOVEMENT SYSTEM =====
  CHEMVENTUR.ShipMovement = {
    // Movement state
    strafingLeft: false,
    strafingRight: false,
    gravityEnabled: true,
    strafeSpeed: 5,
    maxStrafeSpeed: 12,
    
    // Keybindings
    keys: {
      strafeLeft: 'KeyA',
      strafeRight: 'KeyD',
      stopGravity: 'KeyS'
    },
    
    init() {
      // Keyboard controls
      document.addEventListener('keydown', (e) => this.onKeyDown(e));
      document.addEventListener('keyup', (e) => this.onKeyUp(e));
      
      console.log('🚀 Ship Movement initialized! A=Left, D=Right, S=Toggle Gravity');
    },
    
    onKeyDown(e) {
      // Don't capture if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      const Game = CHEMVENTUR.Game;
      if (!Game) return;
      
      switch(e.code) {
        case this.keys.strafeLeft:
          this.strafingLeft = true;
          e.preventDefault();
          break;
        case this.keys.strafeRight:
          this.strafingRight = true;
          e.preventDefault();
          break;
        case this.keys.stopGravity:
          this.gravityEnabled = !this.gravityEnabled;
          CHEMVENTUR.UI?.showStatus(this.gravityEnabled ? '⬇️ Gravity ON' : '🛑 Gravity OFF');
          e.preventDefault();
          break;
      }
    },
    
    onKeyUp(e) {
      switch(e.code) {
        case this.keys.strafeLeft:
          this.strafingLeft = false;
          break;
        case this.keys.strafeRight:
          this.strafingRight = false;
          break;
      }
    },
    
    // Called every frame
    update(ship, width) {
      // Apply strafe movement
      if (this.strafingLeft) {
        ship.vx = Math.max(-this.maxStrafeSpeed, ship.vx - this.strafeSpeed * 0.3);
      }
      if (this.strafingRight) {
        ship.vx = Math.min(this.maxStrafeSpeed, ship.vx + this.strafeSpeed * 0.3);
      }
      
      // Apply friction when not strafing
      if (!this.strafingLeft && !this.strafingRight) {
        ship.vx *= 0.92;
      }
      
      // Apply velocity
      ship.x += ship.vx;
      
      // Keep in bounds
      ship.x = Math.max(20, Math.min(width - 20, ship.x));
      
      // Return gravity state for physics
      return this.gravityEnabled;
    },
    
    // Open movement options panel
    openMovementOptions() {
      const panel = document.getElementById('movement-options-panel');
      if (panel) {
        panel.classList.add('visible');
        this.updateMovementUI();
      }
    },
    
    closeMovementOptions() {
      const panel = document.getElementById('movement-options-panel');
      if (panel) panel.classList.remove('visible');
    },
    
    updateMovementUI() {
      const speedVal = document.getElementById('strafe-speed-val');
      if (speedVal) speedVal.textContent = this.strafeSpeed;
      
      const gravBtn = document.getElementById('gravity-toggle-btn');
      if (gravBtn) {
        gravBtn.textContent = this.gravityEnabled ? '⬇️ Gravity ON' : '🛑 Gravity OFF';
        gravBtn.style.background = this.gravityEnabled ? '#004400' : '#440000';
      }
    },
    
    setSpeed(val) {
      this.strafeSpeed = val;
      this.updateMovementUI();
    },
    
    toggleGravity() {
      this.gravityEnabled = !this.gravityEnabled;
      this.updateMovementUI();
      CHEMVENTUR.UI?.showStatus(this.gravityEnabled ? '⬇️ Gravity ON' : '🛑 Gravity OFF');
    }
  };
  
  // ===== ✨ ANTIMATTER SCRAPPING SYSTEM =====
  CHEMVENTUR.AntimatterSystem = {
    // Energy colors for antimatter projectiles
    ENERGY_COLORS: [
      { name: 'Violet', color: '#8800ff', glow: '#aa00ff' },
      { name: 'Magenta', color: '#ff00ff', glow: '#ff44ff' },
      { name: 'Cyan', color: '#00ffff', glow: '#44ffff' },
      { name: 'Gold', color: '#ffdd00', glow: '#ffff44' },
      { name: 'Crimson', color: '#ff0044', glow: '#ff4466' },
      { name: 'Emerald', color: '#00ff88', glow: '#44ffaa' }
    ],
    
    currentColorIndex: 0,
    
    // Get next color (cycles through)
    getNextColor() {
      const color = this.ENERGY_COLORS[this.currentColorIndex];
      this.currentColorIndex = (this.currentColorIndex + 1) % this.ENERGY_COLORS.length;
      return color;
    },
    
    // Create antimatter projectile with color
    createAntimatterProjectile(x, y, vx, vy, mode) {
      const colorData = this.getNextColor();
      
      return {
        x, y, vx, vy,
        mode: mode || 'antimatter',
        color: colorData.color,
        glow: colorData.glow,
        colorName: colorData.name,
        size: mode === 'antimatter' ? 8 : 5,
        trail: [],
        trailLength: 20,
        createTime: Date.now(),
        // Antimatter annihilates atoms and converts to scrap
        isAntimatter: mode === 'antimatter',
        scrapValue: mode === 'antimatter' ? 3 : 1 // Antimatter gives more scrap
      };
    },
    
    // Check collision with atoms and scrap them
    checkAtomCollisions(projectile, atoms) {
      const scrapped = [];
      
      for (let i = atoms.length - 1; i >= 0; i--) {
        const atom = atoms[i];
        if (!atom) continue;
        
        const dx = projectile.x - atom.x;
        const dy = projectile.y - atom.y;
        const dist = Math.hypot(dx, dy);
        const hitRadius = (projectile.size || 8) + (atom.radius || 15);
        
        if (dist < hitRadius) {
          // Calculate scrap based on atom size
          let scrapGained = projectile.scrapValue;
          
          // Bigger atoms = more scrap
          if (atom.p) scrapGained += Math.floor(atom.p / 5);
          if (atom.n) scrapGained += Math.floor(atom.n / 5);
          
          // Add to resources
          if (CHEMVENTUR.ShipRepair) {
            CHEMVENTUR.ShipRepair.resources.scrapMetal += scrapGained;
          }
          
          // Track what was scrapped
          scrapped.push({
            atom: atom,
            scrap: scrapGained,
            x: atom.x,
            y: atom.y
          });
          
          // Remove atom
          atoms.splice(i, 1);
          
          // Destroy projectile too (unless it's a photon)
          if (projectile.mode === 'antimatter') {
            return { destroyed: true, scrapped };
          }
        }
      }
      
      return { destroyed: false, scrapped };
    },
    
    // Update antimatter projectiles
    update(projectiles, atoms, width, height, timeScale) {
      if (!projectiles.antigun) return;
      
      const now = Date.now();
      
      for (let i = projectiles.antigun.length - 1; i >= 0; i--) {
        const p = projectiles.antigun[i];
        
        // Update trail
        p.trail.unshift({ x: p.x, y: p.y, color: p.color });
        if (p.trail.length > p.trailLength) p.trail.pop();
        
        // Move
        p.x += p.vx * timeScale;
        p.y += p.vy * timeScale;
        
        // Check atom collisions (antimatter mode only)
        if (p.isAntimatter || p.mode === 'antimatter') {
          const result = this.checkAtomCollisions(p, atoms);
          
          if (result.scrapped.length > 0) {
            // Show scrap effect
            result.scrapped.forEach(s => {
              this.showScrapEffect(s.x, s.y, s.scrap);
            });
            
            // Destroy projectile if antimatter
            if (result.destroyed) {
              projectiles.antigun.splice(i, 1);
              continue;
            }
          }
        }
        
        // Bounce or remove at edges
        if (p.x < 0 || p.x > width) {
          if (p.mode === 'photon' && p.bounces > 0) {
            p.vx *= -1;
            p.bounces--;
          } else {
            projectiles.antigun.splice(i, 1);
            continue;
          }
        }
        if (p.y < 0 || p.y > height) {
          if (p.mode === 'photon' && p.bounces > 0) {
            p.vy *= -1;
            p.bounces--;
          } else {
            projectiles.antigun.splice(i, 1);
            continue;
          }
        }
        
        // Lifetime check
        if (now - p.createTime > 10000) {
          projectiles.antigun.splice(i, 1);
        }
      }
    },
    
    // Visual effect when scrapping
    showScrapEffect(x, y, amount) {
      CHEMVENTUR.UI?.showStatus(`+${amount} 🔩 Scrap!`);
      
      // Could add particle effect here
      if (CHEMVENTUR.Audio?.playNote) {
        CHEMVENTUR.Audio.playNote(440 + amount * 50, 0.1);
      }
    },
    
    // Draw antimatter projectiles
    draw(ctx, projectiles) {
      if (!projectiles.antigun || !ctx) return;
      
      projectiles.antigun.forEach(p => {
        ctx.save();
        
        // Draw trail
        p.trail.forEach((t, i) => {
          const alpha = 1 - (i / p.trail.length);
          ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
          ctx.beginPath();
          ctx.arc(t.x, t.y, (p.size || 5) * alpha * 0.7, 0, Math.PI * 2);
          ctx.fill();
        });
        
        // Draw main projectile with glow
        ctx.shadowColor = p.glow || p.color;
        ctx.shadowBlur = 15;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size || 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner bright core
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.size || 5) * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      });
    }
  };
  
  // ===== ⬆️ 12-LEVEL UPGRADE SYSTEM =====
  CHEMVENTUR.UpgradeSystem = {
    // All upgradeable stats
    UPGRADES: {
      hull: {
        name: '🛡️ Hull Strength',
        description: 'Increase max HP',
        levels: [100, 120, 145, 175, 210, 250, 300, 360, 430, 510, 600, 700],
        costs: [0, 25, 50, 100, 150, 225, 325, 450, 600, 800, 1000, 1500],
        current: 0
      },
      armor: {
        name: '🔰 Armor',
        description: 'Reduce incoming damage %',
        levels: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60],
        costs: [0, 30, 60, 100, 150, 220, 310, 420, 550, 700, 900, 1200],
        current: 0
      },
      speed: {
        name: '💨 Ship Speed',
        description: 'Strafe movement speed',
        levels: [5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20],
        costs: [0, 20, 40, 70, 100, 140, 190, 250, 320, 400, 500, 650],
        current: 0
      },
      fireRate: {
        name: '🔥 Fire Rate',
        description: 'Shots per second multiplier',
        levels: [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0, 2.2, 2.5, 3.0],
        costs: [0, 25, 50, 85, 130, 185, 250, 330, 420, 530, 660, 800],
        current: 0
      },
      scrapBonus: {
        name: '🔩 Scrap Bonus',
        description: 'Extra scrap from scrapping',
        levels: [0, 10, 20, 30, 40, 50, 65, 80, 100, 120, 150, 200],
        costs: [0, 35, 70, 115, 170, 240, 320, 420, 540, 680, 850, 1050],
        current: 0
      },
      damageResist: {
        name: '💪 Damage Resistance',
        description: 'Reduce damage from collisions',
        levels: [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 75],
        costs: [0, 40, 80, 130, 190, 260, 350, 460, 590, 740, 920, 1150],
        current: 0
      },
      shieldMax: {
        name: '🛡️ Shield Capacity',
        description: 'Regenerating shield points',
        levels: [0, 10, 20, 35, 50, 70, 95, 125, 160, 200, 250, 300],
        costs: [0, 50, 100, 160, 230, 320, 430, 560, 710, 880, 1080, 1300],
        current: 0
      },
      shieldRegen: {
        name: '⚡ Shield Regen',
        description: 'Shield points per second',
        levels: [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10],
        costs: [0, 40, 80, 130, 190, 260, 350, 460, 590, 740, 920, 1150],
        current: 0
      }
    },
    
    init() {
      this.createUpgradeUI();
    },
    
    getCurrentValue(upgradeName) {
      const upgrade = this.UPGRADES[upgradeName];
      if (!upgrade) return 0;
      return upgrade.levels[upgrade.current];
    },
    
    getNextCost(upgradeName) {
      const upgrade = this.UPGRADES[upgradeName];
      if (!upgrade || upgrade.current >= 11) return Infinity;
      return upgrade.costs[upgrade.current + 1];
    },
    
    canAfford(upgradeName) {
      const cost = this.getNextCost(upgradeName);
      const scrap = CHEMVENTUR.ShipRepair?.resources?.scrapMetal || 0;
      return scrap >= cost;
    },
    
    purchase(upgradeName) {
      const upgrade = this.UPGRADES[upgradeName];
      if (!upgrade || upgrade.current >= 11) {
        CHEMVENTUR.UI?.showStatus('❌ Already at max level!');
        return false;
      }
      
      const cost = this.getNextCost(upgradeName);
      const ShipRepair = CHEMVENTUR.ShipRepair;
      
      if (!ShipRepair || ShipRepair.resources.scrapMetal < cost) {
        CHEMVENTUR.UI?.showStatus(`❌ Need ${cost} 🔩 scrap!`);
        return false;
      }
      
      // Pay
      ShipRepair.resources.scrapMetal -= cost;
      
      // Upgrade
      upgrade.current++;
      
      // Apply effects
      this.applyUpgrades();
      
      CHEMVENTUR.UI?.showStatus(`⬆️ ${upgrade.name} upgraded to Level ${upgrade.current + 1}!`);
      this.updateUpgradeUI();
      
      return true;
    },
    
    applyUpgrades() {
      const ShipRepair = CHEMVENTUR.ShipRepair;
      const Movement = CHEMVENTUR.ShipMovement;
      
      if (ShipRepair) {
        ShipRepair.ship.maxHP = this.getCurrentValue('hull');
        ShipRepair.ship.armor = this.getCurrentValue('armor');
        ShipRepair.ship.shieldMax = this.getCurrentValue('shieldMax');
        ShipRepair.ship.shieldRegenRate = this.getCurrentValue('shieldRegen');
      }
      
      if (Movement) {
        Movement.strafeSpeed = this.getCurrentValue('speed');
      }
    },
    
    createUpgradeUI() {
      // Will be created when upgrade tab is opened
    },
    
    updateUpgradeUI() {
      const grid = document.getElementById('upgrade-grid');
      if (!grid) return;
      
      grid.innerHTML = '';
      
      Object.entries(this.UPGRADES).forEach(([key, upgrade]) => {
        const level = upgrade.current;
        const maxed = level >= 11;
        const cost = maxed ? '---' : upgrade.costs[level + 1];
        const canAfford = this.canAfford(key);
        const currentVal = upgrade.levels[level];
        const nextVal = maxed ? currentVal : upgrade.levels[level + 1];
        
        const card = document.createElement('div');
        card.className = 'upgrade-card' + (maxed ? ' maxed' : '') + (!canAfford && !maxed ? ' locked' : '');
        card.innerHTML = `
          <div class="upgrade-name">${upgrade.name}</div>
          <div class="upgrade-level">Level ${level + 1}/12</div>
          <div class="upgrade-bar">
            <div class="upgrade-fill" style="width:${((level + 1) / 12) * 100}%"></div>
          </div>
          <div class="upgrade-value">${currentVal}${maxed ? '' : ' → ' + nextVal}</div>
          <div class="upgrade-desc">${upgrade.description}</div>
          <button class="upgrade-btn" ${maxed || !canAfford ? 'disabled' : ''} onclick="CHEMVENTUR.UpgradeSystem.purchase('${key}')">
            ${maxed ? '✓ MAXED' : `🔩 ${cost}`}
          </button>
        `;
        grid.appendChild(card);
      });
    }
  };
  
  // ===== 🖱️ RIGHT-CLICK CONTEXT MENUS =====
  CHEMVENTUR.ContextMenus = {
    currentMenu: null,
    
    init() {
      // Close menu on click outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) {
          this.closeAll();
        }
      });
      
      // Bind right-click to buttons
      this.bindButton('btn-garage', this.garageMenu.bind(this));
      this.bindButton('btn-rain', this.rainMenu.bind(this));
      this.bindButton('btn-collider', this.colliderMenu.bind(this));
      this.bindButton('btn-gravity', this.gravityMenu.bind(this));
      this.bindButton('btn-boundary', this.boundaryMenu.bind(this));
      this.bindButton('btn-grid', this.gridMenu.bind(this));
      this.bindButton('btn-clear', this.clearMenu.bind(this));
      this.bindButton('btn-target', this.targetMenu.bind(this));
      this.bindButton('btn-save', this.saveMenu.bind(this));
      this.bindButton('btn-load', this.loadMenu.bind(this));
      this.bindButton('btn-screenshot', this.screenshotMenu.bind(this));
      this.bindButton('btn-electron-mode', this.electronModeMenu.bind(this));
      this.bindButton('btn-periodic-table', this.periodicTableMenu.bind(this));
      this.bindButton('btn-pubchem', this.pubchemMenu.bind(this));
      this.bindButton('btn-music-player', this.musicMenu.bind(this));
      this.bindButton('btn-audio-toggle', this.soundMenu.bind(this));
      this.bindButton('btn-microphone', this.micMenu.bind(this));
      this.bindButton('btn-multiplayer', this.multiplayerMenu.bind(this));
      this.bindButton('env-btn', this.envMenu.bind(this));
      this.bindButton('btn-stage-0', this.stageMenu.bind(this));
      this.bindButton('btn-stage-1', this.stageMenu.bind(this));
      this.bindButton('btn-stage-2', this.stageMenu.bind(this));
      this.bindButton('btn-bot-reporter', this.botReporterMenu.bind(this));
      this.bindButton('btn-bot-religious', this.botReligiousMenu.bind(this));
      this.bindButton('btn-bot-homeless', this.botHomelessMenu.bind(this));
      this.bindButton('btn-bot-lover', this.botLoverMenu.bind(this));
      this.bindButton('btn-bots-all', this.botsAllMenu.bind(this));
      this.bindButton('btn-bots-clear', this.botsAllMenu.bind(this));

      console.log('🖱️ Context Menus initialized!');
    },
    
    bindButton(buttonId, menuFunc) {
      const btn = document.getElementById(buttonId);
      if (btn) {
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.closeAll();
          menuFunc(e);
        });
      }
    },
    
    showMenu(x, y, items) {
      this.closeAll();
      
      const menu = document.createElement('div');
      menu.className = 'context-menu';
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      
      items.forEach(item => {
        if (item.separator) {
          const sep = document.createElement('div');
          sep.className = 'context-separator';
          menu.appendChild(sep);
        } else {
          const btn = document.createElement('button');
          btn.className = 'context-item' + (item.active ? ' active' : '');
          btn.innerHTML = item.icon ? `<span class="context-icon">${item.icon}</span>${item.label}` : item.label;
          btn.onclick = () => {
            item.action?.();
            this.closeAll();
          };
          menu.appendChild(btn);
        }
      });
      
      document.body.appendChild(menu);
      this.currentMenu = menu;
      
      // Keep in viewport
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
      }
    },
    
    closeAll() {
      if (this.currentMenu) {
        this.currentMenu.remove();
        this.currentMenu = null;
      }
    },
    
    // ===== SPECIFIC MENUS =====
    
    garageMenu(e) {
      const Movement = CHEMVENTUR.ShipMovement;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🚀', label: 'Ship Movement Options', action: () => Movement.openMovementOptions() },
        { separator: true },
        { icon: 'A', label: 'Strafe Left (hold)', action: null },
        { icon: 'D', label: 'Strafe Right (hold)', action: null },
        { icon: 'S', label: `Gravity: ${Movement.gravityEnabled ? 'ON' : 'OFF'}`, action: () => Movement.toggleGravity() },
        { separator: true },
        { icon: '⬆️', label: 'Open Upgrades', action: () => CHEMVENTUR.UI?.showUpgradePanel?.() },
        { icon: '🛠️', label: 'Open Full Garage', action: () => CHEMVENTUR.ShipRepair?.openGarage() }
      ]);
    },
    
    rainMenu(e) {
      const Game = CHEMVENTUR.Game;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🌧️', label: 'Toggle Rain', action: () => Game.toggleRain?.(), active: Game.rainActive },
        { separator: true },
        { icon: '💧', label: 'Light Rain', action: () => { Game.rainIntensity = 0.2; } },
        { icon: '🌧️', label: 'Normal Rain', action: () => { Game.rainIntensity = 0.5; } },
        { icon: '⛈️', label: 'Heavy Rain', action: () => { Game.rainIntensity = 1.0; } },
        { separator: true },
        { icon: '⚛️', label: 'Rain Atoms', action: () => { Game.rainType = 'atoms'; } },
        { icon: '🧬', label: 'Rain Molecules', action: () => { Game.rainType = 'molecules'; } }
      ]);
    },
    
    colliderMenu(e) {
      const Game = CHEMVENTUR.Game;
      const modes = Game.COLLIDER_MODES;
      const items = Object.entries(modes).map(([key, mode]) => ({
        icon: key === 'FUSION' ? '☢️' : key === 'COLLIDE' ? '💥' : key === 'SLINGSHOT' ? '🪃' : key === 'BOND' ? '🔗' : '⭕',
        label: mode.name,
        action: () => { Game.colliderMode = key; CHEMVENTUR.UI?.updateButtons?.(); },
        active: Game.colliderMode === key
      }));
      this.showMenu(e.clientX, e.clientY, items);
    },
    
    gravityMenu(e) {
      const Game = CHEMVENTUR.Game;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '⬇️', label: 'Down', action: () => { Game.gravityMode = 1; }, active: Game.gravityMode === 1 },
        { icon: '⬆️', label: 'Up', action: () => { Game.gravityMode = 2; }, active: Game.gravityMode === 2 },
        { icon: '⭕', label: 'None', action: () => { Game.gravityMode = 0; }, active: Game.gravityMode === 0 },
        { icon: '🌀', label: 'Center', action: () => { Game.gravityMode = 3; }, active: Game.gravityMode === 3 },
        { icon: '↔️', label: 'Horizontal', action: () => { Game.gravityMode = 4; }, active: Game.gravityMode === 4 }
      ]);
    },
    
    boundaryMenu(e) {
      const Game = CHEMVENTUR.Game;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🚪', label: 'Open (pass through)', action: () => { Game.boundaryMode = 0; }, active: Game.boundaryMode === 0 },
        { icon: '🧱', label: 'Solid (bounce)', action: () => { Game.boundaryMode = 1; }, active: Game.boundaryMode === 1 },
        { icon: '🔄', label: 'Wrap (teleport)', action: () => { Game.boundaryMode = 2; }, active: Game.boundaryMode === 2 },
        { icon: '💀', label: 'Deadly (destroy)', action: () => { Game.boundaryMode = 3; }, active: Game.boundaryMode === 3 }
      ]);
    },
    
    gridMenu(e) {
      this.showMenu(e.clientX, e.clientY, [
        { icon: '⬜', label: 'Grid OFF', action: () => CHEMVENTUR.Grid?.setMode?.(0) },
        { icon: '🔲', label: 'Basic Grid', action: () => CHEMVENTUR.Grid?.setMode?.(1) },
        { icon: '🎯', label: 'Coordinates', action: () => CHEMVENTUR.Grid?.setMode?.(2) },
        { icon: '🌡️', label: 'Heat Map', action: () => CHEMVENTUR.Grid?.setMode?.(3) },
        { icon: '💨', label: 'Pressure Map', action: () => CHEMVENTUR.Grid?.setMode?.(4) }
      ]);
    },
    
    clearMenu(e) {
      const Game = CHEMVENTUR.Game;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🗑️', label: 'Clear All Particles', action: () => { Game.atoms = []; } },
        { icon: '⚫', label: 'Clear Black Holes', action: () => { Game.blackHoles = []; } },
        { icon: '⚪', label: 'Clear White Holes', action: () => { Game.whiteHoles = []; } },
        { icon: '🎻', label: 'Clear Strings (Stage 0)', action: () => { CHEMVENTUR.StringSystem?.clear?.(); } },
        { separator: true },
        { icon: '💥', label: 'CLEAR EVERYTHING', action: () => { 
          Game.atoms = []; 
          Game.blackHoles = []; 
          Game.whiteHoles = [];
          CHEMVENTUR.StringSystem?.clear?.();
        }}
      ]);
    },
    
    targetMenu(e) {
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🎯', label: 'Free Play', action: () => { CHEMVENTUR.Game.targetZ = null; } },
        { icon: '💧', label: 'Target: Water (H₂O)', action: () => { CHEMVENTUR.Game.targetZ = 'H2O'; } },
        { icon: '☢️', label: 'Target: Uranium', action: () => { CHEMVENTUR.Game.targetZ = 'U'; } },
        { icon: '⚛️', label: 'Target: Helium', action: () => { CHEMVENTUR.Game.targetZ = 2; } },
        { icon: '💎', label: 'Target: Carbon', action: () => { CHEMVENTUR.Game.targetZ = 6; } }
      ]);
    },
    
    saveMenu(e) {
      this.showMenu(e.clientX, e.clientY, [
        { icon: '💾', label: 'Quick Save', action: () => CHEMVENTUR.Game.save?.() },
        { icon: '📁', label: 'Save As...', action: () => CHEMVENTUR.Game.saveAs?.() },
        { icon: '☁️', label: 'Save to Cloud (coming)', action: null }
      ]);
    },
    
    loadMenu(e) {
      this.showMenu(e.clientX, e.clientY, [
        { icon: '📂', label: 'Quick Load', action: () => CHEMVENTUR.Game.load?.() },
        { icon: '📁', label: 'Load From File...', action: () => CHEMVENTUR.Game.loadFrom?.() },
        { icon: '☁️', label: 'Load from Cloud (coming)', action: null }
      ]);
    },

    screenshotMenu(e) {
      this.showMenu(e.clientX, e.clientY, [
        { icon: '📸', label: 'Screenshot (PNG)', action: () => CHEMVENTUR.Game.screenshot?.() },
        { icon: '🖼️', label: 'Copy to Clipboard', action: () => {
          const c = document.getElementById('game-canvas');
          if (c) c.toBlob(b => navigator.clipboard?.write?.([new ClipboardItem({'image/png': b})]));
        }},
        { icon: '🎥', label: 'Record GIF (coming)', action: null }
      ]);
    },

    electronModeMenu(e) {
      const MolSys = CHEMVENTUR.MolecularSystem;
      if (!MolSys) return;
      const modes = MolSys.ELECTRON_MODES || {};
      const items = Object.entries(modes).map(([key, mode]) => ({
        icon: mode.icon || '⚡',
        label: mode.name || key,
        action: () => { MolSys.electronMode = key; CHEMVENTUR.UI?.updateButtons?.(); },
        active: MolSys.electronMode === key
      }));
      if (items.length === 0) {
        items.push({ icon: '⚡', label: 'Cycle Mode', action: () => MolSys.cycleElectronMode?.() });
      }
      this.showMenu(e.clientX, e.clientY, items);
    },

    periodicTableMenu(e) {
      this.showMenu(e.clientX, e.clientY, [
        { icon: '⚛️', label: 'Open Full Table', action: () => CHEMVENTUR.UI?.openPeriodicTableFull?.() },
        { icon: '🔍', label: 'Search Element', action: () => CHEMVENTUR.UI?.openPeriodicTableFull?.() },
        { icon: '📊', label: 'Show Inventory Only', action: () => CHEMVENTUR.UI?.updateInventory?.() }
      ]);
    },

    pubchemMenu(e) {
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🔬', label: 'Search PubChem', action: () => CHEMVENTUR.UI?.openPubChemSearch?.() },
        { icon: '💧', label: 'Spawn Water', action: () => CHEMVENTUR.MoleculeStructures?.spawn?.('water', CHEMVENTUR.Game.ship.x, CHEMVENTUR.Game.ship.y - 50) },
        { icon: '🧪', label: 'Spawn Ethanol', action: () => CHEMVENTUR.MoleculeStructures?.spawn?.('ethanol', CHEMVENTUR.Game.ship.x, CHEMVENTUR.Game.ship.y - 50) }
      ]);
    },

    musicMenu(e) {
      const MP = CHEMVENTUR.MusicPlayer;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🎵', label: 'Open Music Player', action: () => { if (MP) { if (!MP.enabled) MP.init(); MP.toggleUI(); } } },
        { icon: '📁', label: 'Load Audio File', action: () => document.getElementById('music-upload')?.click() },
        { icon: '⏸', label: MP?.isPlaying ? 'Pause' : 'Resume', action: () => CHEMVENTUR.AudioSystem?.toggle?.() }
      ]);
    },

    soundMenu(e) {
      const Audio = CHEMVENTUR.Audio;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🔊', label: Audio?.enabled ? 'Sound: ON' : 'Sound: OFF', action: () => { if (Audio) Audio.enabled = !Audio.enabled; CHEMVENTUR.UI?.updateAudioDisplay?.(); }, active: Audio?.enabled },
        { separator: true },
        { icon: '🔈', label: 'Volume Low', action: () => { if (CHEMVENTUR.Config?.AUDIO) CHEMVENTUR.Config.AUDIO.MASTER_VOLUME = 0.03; } },
        { icon: '🔉', label: 'Volume Medium', action: () => { if (CHEMVENTUR.Config?.AUDIO) CHEMVENTUR.Config.AUDIO.MASTER_VOLUME = 0.08; } },
        { icon: '🔊', label: 'Volume High', action: () => { if (CHEMVENTUR.Config?.AUDIO) CHEMVENTUR.Config.AUDIO.MASTER_VOLUME = 0.15; } }
      ]);
    },

    micMenu(e) {
      const Mic = CHEMVENTUR.MicrophonePressure;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🎤', label: Mic?.active ? 'Mic: ON' : 'Mic: OFF', action: () => document.getElementById('btn-microphone')?.click(), active: Mic?.active },
        { icon: '📊', label: 'Toggle Grid Waves', action: () => { CHEMVENTUR.PressureGrid?.toggle?.(); CHEMVENTUR.UI?.updateButtons?.(); } },
        { icon: '💡', label: 'Sensitivity Info', action: () => CHEMVENTUR.UI?.showStatus?.('🎤 Louder voice = bigger waves!') }
      ]);
    },

    multiplayerMenu(e) {
      const MP = CHEMVENTUR.Multiplayer;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🌐', label: MP?.connected ? 'Disconnect' : 'Connect', action: () => document.getElementById('btn-multiplayer')?.click() },
        { icon: '📝', label: 'Change Name', action: () => document.getElementById('player-name-input')?.focus() },
        { icon: '👥', label: 'Player List', action: () => CHEMVENTUR.UI?.showStatus?.('Check player list in left panel') }
      ]);
    },

    envMenu(e) {
      this.showMenu(e.clientX, e.clientY, [
        { icon: '😈', label: 'Open Environment Panel', action: () => CHEMVENTUR.UI?.toggleEnvWindow?.() },
        { icon: '🌡️', label: 'Temperature Calc', action: () => { CHEMVENTUR.UI?.toggleEnvWindow?.(); CHEMVENTUR.EnvCalc?.openCalc?.('temperature'); } },
        { icon: '⚡', label: 'Energy Calc', action: () => { CHEMVENTUR.UI?.toggleEnvWindow?.(); CHEMVENTUR.EnvCalc?.openCalc?.('energy'); } },
        { icon: '💨', label: 'Pressure Calc', action: () => { CHEMVENTUR.UI?.toggleEnvWindow?.(); CHEMVENTUR.EnvCalc?.openCalc?.('pressure'); } }
      ]);
    },

    stageMenu(e) {
      const Game = CHEMVENTUR.Game;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🎻', label: 'Stage 0: Strings', action: () => { Game.changeStage(-Game.stage); CHEMVENTUR.UI?.updateStageButtons?.(); }, active: Game.stage === 0 },
        { icon: '⚛️', label: 'Stage 1: Atoms', action: () => { Game.changeStage(1 - Game.stage); CHEMVENTUR.UI?.updateStageButtons?.(); }, active: Game.stage === 1 },
        { icon: '🧬', label: 'Stage 2: Molecules', action: () => { Game.changeStage(2 - Game.stage); CHEMVENTUR.UI?.updateStageButtons?.(); }, active: Game.stage === 2 }
      ]);
    },

    botReporterMenu(e) {
      const Bots = CHEMVENTUR.Bots;
      const count = Bots?.bots.filter(b => b.type === 'reporter').length || 0;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '📰', label: 'Spawn Reporter (' + count + ' active)', action: () => { if (!Bots.enabled) Bots.init(); Bots.spawnReporter(); } },
        { icon: '🗑️', label: 'Remove All Reporters', action: () => Bots?.removeByType('reporter') },
        { icon: '📸', label: 'View Saved Screenshots', action: () => {
          const keys = Object.keys(localStorage).filter(k => k.startsWith('reporter_screenshot_'));
          CHEMVENTUR.UI?.showStatus('📸 ' + keys.length + ' screenshots in localStorage');
        }}
      ]);
    },

    botReligiousMenu(e) {
      const Bots = CHEMVENTUR.Bots;
      const count = Bots?.bots.filter(b => b.type === 'religious').length || 0;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '⛪', label: 'Spawn Peace Bot (' + count + ' active)', action: () => { if (!Bots.enabled) Bots.init(); Bots.spawnReligious(); } },
        { icon: '🗑️', label: 'Remove All Peace Bots', action: () => Bots?.removeByType('religious') }
      ]);
    },

    botHomelessMenu(e) {
      const Bots = CHEMVENTUR.Bots;
      const bot = Bots?.bots.find(b => b.type === 'homeless');
      const count = bot ? bot.collectedElectrons : 0;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🏠', label: 'Spawn Homeless Bot', action: () => { if (!Bots.enabled) Bots.init(); Bots.spawnHomeless(); } },
        { icon: '⚡', label: 'Electrons collected: ' + count, action: null },
        { icon: '🗑️', label: 'Remove All Homeless Bots', action: () => Bots?.removeByType('homeless') }
      ]);
    },

    botLoverMenu(e) {
      const Bots = CHEMVENTUR.Bots;
      const count = Bots?.bots.filter(b => b.type === 'lover').length || 0;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '💕', label: 'Spawn Lover Bot (' + count + ' active)', action: () => { if (!Bots.enabled) Bots.init(); Bots.spawnLover(); } },
        { icon: '🗑️', label: 'Remove All Lover Bots', action: () => Bots?.removeByType('lover') }
      ]);
    },

    botsAllMenu(e) {
      const Bots = CHEMVENTUR.Bots;
      this.showMenu(e.clientX, e.clientY, [
        { icon: '🤖', label: 'Spawn All 4 Bots', action: () => Bots?.spawnAll() },
        { icon: '🗑️', label: 'Remove All Bots', action: () => Bots?.removeAll() },
        { icon: '📊', label: Bots?.bots.length + ' bot(s) active', action: null }
      ]);
    }
  };
  
  // ===== 🛡️ DAMAGE BALANCING =====
  CHEMVENTUR.DamageBalance = {
    // Base damage multiplier (lower = less damage)
    damageMultiplier: 0.3, // Was effectively 1.0, now 30%
    
    // Minimum time between damage instances (ms)
    damageCooldown: 500,
    lastDamageTime: 0,
    
    // Calculate actual damage with all modifiers
    calculateDamage(baseDamage, source) {
      const now = Date.now();
      
      // Cooldown check
      if (now - this.lastDamageTime < this.damageCooldown) {
        return 0;
      }
      
      // Apply base multiplier
      let damage = baseDamage * this.damageMultiplier;
      
      // Apply armor reduction
      const armor = CHEMVENTUR.UpgradeSystem?.getCurrentValue('armor') || 0;
      damage *= (1 - armor / 100);
      
      // Apply damage resistance
      const resist = CHEMVENTUR.UpgradeSystem?.getCurrentValue('damageResist') || 0;
      damage *= (1 - resist / 100);
      
      // Minimum damage
      damage = Math.max(0.5, damage);
      
      this.lastDamageTime = now;
      
      return damage;
    }
  };
  
  // ===== ADD STYLES =====
  function addEnhancementStyles() {
    if (document.getElementById('enhancement-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'enhancement-styles';
    style.textContent = `
      /* Context Menu */
      .context-menu {
        position: fixed;
        background: linear-gradient(135deg, #0a1a0a, #001100);
        border: 2px solid #00ff41;
        border-radius: 8px;
        padding: 5px 0;
        min-width: 180px;
        z-index: 20000;
        box-shadow: 0 0 20px rgba(0, 255, 65, 0.3);
        animation: contextFadeIn 0.15s ease;
      }
      
      @keyframes contextFadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
      
      .context-item {
        display: flex;
        align-items: center;
        width: 100%;
        padding: 8px 15px;
        background: transparent;
        border: none;
        color: #00ff41;
        font-family: monospace;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s;
        text-align: left;
      }
      
      .context-item:hover {
        background: rgba(0, 255, 65, 0.2);
      }
      
      .context-item.active {
        background: rgba(0, 255, 65, 0.3);
        font-weight: bold;
      }
      
      .context-icon {
        margin-right: 10px;
        font-size: 14px;
      }
      
      .context-separator {
        height: 1px;
        background: #00ff4140;
        margin: 5px 10px;
      }
      
      /* Movement Options Panel */
      #movement-options-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        background: linear-gradient(135deg, #0a1a0a, #001100);
        border: 2px solid #00ffff;
        border-radius: 10px;
        padding: 20px;
        z-index: 15000;
        min-width: 280px;
        opacity: 0;
        pointer-events: none;
        transition: all 0.2s;
      }
      
      #movement-options-panel.visible {
        opacity: 1;
        pointer-events: auto;
        transform: translate(-50%, -50%) scale(1);
      }
      
      .movement-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #00ffff;
      }
      
      .movement-header h3 {
        color: #00ffff;
        margin: 0;
      }
      
      .movement-control {
        margin: 10px 0;
        padding: 10px;
        background: rgba(0, 255, 255, 0.1);
        border-radius: 5px;
      }
      
      .movement-control label {
        color: #888;
        font-size: 11px;
        display: block;
        margin-bottom: 5px;
      }
      
      .movement-keys {
        display: flex;
        gap: 10px;
        justify-content: center;
        margin: 15px 0;
      }
      
      .key-display {
        width: 50px;
        height: 50px;
        background: #222;
        border: 2px solid #00ffff;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        font-weight: bold;
        color: #00ffff;
      }
      
      /* Upgrade Grid */
      #upgrade-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        max-height: 400px;
        overflow-y: auto;
        padding: 10px;
      }
      
      .upgrade-card {
        background: rgba(0, 255, 65, 0.1);
        border: 2px solid #333;
        border-radius: 8px;
        padding: 12px;
        transition: all 0.2s;
      }
      
      .upgrade-card:hover {
        border-color: #00ff41;
        box-shadow: 0 0 15px rgba(0, 255, 65, 0.2);
      }
      
      .upgrade-card.maxed {
        border-color: #ffd700;
        background: rgba(255, 215, 0, 0.1);
      }
      
      .upgrade-card.locked {
        opacity: 0.6;
      }
      
      .upgrade-name {
        color: #00ff41;
        font-weight: bold;
        font-size: 12px;
        margin-bottom: 5px;
      }
      
      .upgrade-level {
        color: #00ffff;
        font-size: 10px;
        margin-bottom: 5px;
      }
      
      .upgrade-bar {
        height: 6px;
        background: #222;
        border-radius: 3px;
        margin-bottom: 5px;
        overflow: hidden;
      }
      
      .upgrade-fill {
        height: 100%;
        background: linear-gradient(90deg, #00ff41, #00ffff);
        transition: width 0.3s;
      }
      
      .upgrade-value {
        color: #fff;
        font-size: 11px;
        font-family: monospace;
        margin-bottom: 3px;
      }
      
      .upgrade-desc {
        color: #666;
        font-size: 9px;
        margin-bottom: 8px;
      }
      
      .upgrade-btn {
        width: 100%;
        padding: 6px;
        background: #004400;
        border: 1px solid #00ff41;
        border-radius: 4px;
        color: #00ff41;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s;
      }
      
      .upgrade-btn:hover:not(:disabled) {
        background: #006600;
      }
      
      .upgrade-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }
  
  // ===== CREATE MOVEMENT OPTIONS PANEL HTML =====
  function createMovementPanel() {
    if (document.getElementById('movement-options-panel')) return;
    
    const panel = document.createElement('div');
    panel.id = 'movement-options-panel';
    panel.innerHTML = `
      <div class="movement-header">
        <h3>🚀 Ship Movement</h3>
        <button class="garage-close" onclick="CHEMVENTUR.ShipMovement.closeMovementOptions()">✕</button>
      </div>
      
      <div class="movement-keys">
        <div class="key-display">A</div>
        <div class="key-display">S</div>
        <div class="key-display">D</div>
      </div>
      
      <div style="text-align:center;color:#888;font-size:11px;margin-bottom:15px;">
        A = Left | D = Right | S = Toggle Gravity
      </div>
      
      <div class="movement-control">
        <label>Strafe Speed</label>
        <input type="range" min="3" max="15" value="5" style="width:100%"
               onchange="CHEMVENTUR.ShipMovement.setSpeed(+this.value)">
        <div style="text-align:center;color:#00ffff;" id="strafe-speed-val">5</div>
      </div>
      
      <div class="movement-control">
        <button class="btn full-width" id="gravity-toggle-btn" 
                onclick="CHEMVENTUR.ShipMovement.toggleGravity()"
                style="background:#004400;border-color:#00ff41;">
          ⬇️ Gravity ON
        </button>
      </div>
    `;
    document.body.appendChild(panel);
  }
  
  // ===== INITIALIZE ALL ENHANCEMENTS =====
  CHEMVENTUR.Enhancements = {
    init() {
      addEnhancementStyles();
      createMovementPanel();
      
      CHEMVENTUR.ShipMovement.init();
      CHEMVENTUR.ContextMenus.init();
      CHEMVENTUR.UpgradeSystem.init();
      
      console.log('🚀 CHEMVENTUR Enhancements v116 loaded!');
      console.log('   🖱️ Right-click buttons for options');
      console.log('   ⌨️ A/D = Strafe, S = Toggle Gravity');
      console.log('   ✨ Gun 8 now scraps atoms for resources!');
    }
  };
  
})();
