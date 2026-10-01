/* ============================================
   CHEMVENTUR v118 - AI PLAYERS! 🤖💚
   Smart AI bots that play alongside humans!
   Built with 💚 by Opus for Pumpkin 🎃
   ============================================ */

(function() {
  
  CHEMVENTUR.AIPlayers = {
    // State
    bots: [],
    isHost: false,
    enabled: false,
    
    // Bot personalities
    PERSONALITIES: {
      COLLECTOR: {
        name: 'Collector Bot',
        emoji: '📦',
        color: '#00ffff',
        behavior: 'Flies around collecting atoms, cautious and methodical'
      },
      SCIENTIST: {
        name: 'Scientist Bot',
        emoji: '🔬',
        color: '#ff00ff',
        behavior: 'Experiments with fusion, builds complex atoms'
      },
      CHAOS: {
        name: 'Chaos Bot',
        emoji: '💥',
        color: '#ff0000',
        behavior: 'Shoots randomly, creates chaos, unpredictable'
      },
      HELPER: {
        name: 'Helper Bot',
        emoji: '💚',
        color: '#00ff88',
        behavior: 'Follows players, shares resources, friendly'
      }
    },
    
    // Update timing
    lastUpdate: 0,
    updateInterval: 500, // AI thinks every 500ms
    
    // ===== INIT =====
    async init() {
      console.log('🤖 Initializing AI Players...');
      
      // Check if we're connected to multiplayer
      if (!CHEMVENTUR.Multiplayer || !CHEMVENTUR.Multiplayer.connected) {
        console.log('⚠️ AI requires multiplayer connection');
        return false;
      }
      
      // Determine if we're the host (first player)
      this.checkIfHost();
      
      if (this.isHost) {
        console.log('👑 We are the AI host! Spawning bots...');
        await this.spawnBots();
      } else {
        console.log('👥 Another player is hosting AI');
      }
      
      this.enabled = true;
      return true;
    },
    
    // ===== CHECK IF HOST =====
    checkIfHost() {
      // Simple check: if we're the only player, we're the host
      const playerCount = CHEMVENTUR.Multiplayer.getPlayerCount();
      this.isHost = (playerCount === 1);
      
      // Could also check timestamps, but for now keep it simple
      console.log('Player count:', playerCount, 'isHost:', this.isHost);
    },
    
    // ===== SPAWN BOTS =====
    async spawnBots() {
      console.log('🤖 Spawning AI bots...');
      
      // Create 3 different bots
      await this.createBot('Collector', 'COLLECTOR');
      await this.createBot('Scientist', 'SCIENTIST');
      await this.createBot('Chaos', 'CHAOS');
      
      console.log('✅ Spawned', this.bots.length, 'AI bots!');
    },
    
    // ===== CREATE BOT =====
    async createBot(name, personalityKey) {
      const personality = this.PERSONALITIES[personalityKey];
      
      const bot = {
        id: 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        name: personality.emoji + ' ' + name,
        personality: personalityKey,
        color: personality.color,
        
        // Position (random start)
        x: Math.random() * 800 - 400,
        y: Math.random() * 600 - 300,
        vx: 0,
        vy: 0,
        
        // State
        hp: 100,
        gun: this.getStartingGun(personalityKey),
        online: true,
        isAI: true,
        
        // AI state
        target: null,
        lastAction: 0,
        actionCooldown: 1000, // 1 second between actions
        
        // Firebase reference
        ref: null
      };
      
      // Add to Firebase as a player (scoped to the current room)
      try {
        const playersRef = CHEMVENTUR.Multiplayer.playersRef;
        if (!playersRef) {
          console.error('No room players ref available — cannot spawn bot');
          return;
        }
        bot.ref = playersRef.child(bot.id);
        
        await bot.ref.set({
          id: bot.id,
          name: bot.name,
          color: bot.color,
          x: bot.x,
          y: bot.y,
          vx: bot.vx,
          vy: bot.vy,
          hp: bot.hp,
          gun: bot.gun,
          online: true,
          isAI: true,
          lastUpdate: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Auto-cleanup on disconnect
        bot.ref.onDisconnect().remove();
        
        this.bots.push(bot);
        console.log('✅ Created bot:', bot.name);
        
      } catch (e) {
        console.error('Error creating bot:', e);
      }
    },
    
    // ===== GET STARTING GUN =====
    getStartingGun(personality) {
      switch (personality) {
        case 'COLLECTOR': return 1; // Proton gun
        case 'SCIENTIST': return 5; // Gluon gun
        case 'CHAOS': return 8; // Anti-gun
        case 'HELPER': return 3; // Electron gun
        default: return 5;
      }
    },
    
    // ===== UPDATE (called from main game loop) =====
    update(gameState) {
      if (!this.enabled || !this.isHost || this.bots.length === 0) return;
      
      const now = Date.now();
      if (now - this.lastUpdate < this.updateInterval) return;
      
      this.lastUpdate = now;
      
      // Update each bot
      for (const bot of this.bots) {
        this.updateBot(bot, gameState);
      }
    },
    
    // ===== UPDATE SINGLE BOT =====
    updateBot(bot, gameState) {
      const now = Date.now();
      
      // Choose action based on personality
      switch (bot.personality) {
        case 'COLLECTOR':
          this.collectorBehavior(bot, gameState);
          break;
        case 'SCIENTIST':
          this.scientistBehavior(bot, gameState);
          break;
        case 'CHAOS':
          this.chaosBehavior(bot, gameState);
          break;
        case 'HELPER':
          this.helperBehavior(bot, gameState);
          break;
      }
      
      // Apply physics
      this.applyPhysics(bot);
      
      // Sync to Firebase
      this.syncBot(bot);
    },
    
    // ===== COLLECTOR BEHAVIOR =====
    collectorBehavior(bot, gameState) {
      // Find nearest atom
      const atoms = gameState.atoms || [];
      let nearest = null;
      let minDist = Infinity;
      
      for (const atom of atoms) {
        const dx = atom.x - bot.x;
        const dy = atom.y - bot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDist) {
          minDist = dist;
          nearest = atom;
        }
      }
      
      if (nearest && minDist > 50) {
        // Move toward atom
        const dx = nearest.x - bot.x;
        const dy = nearest.y - bot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        bot.vx += (dx / dist) * 0.15;
        bot.vy += (dy / dist) * 0.15;
      } else {
        // Random wander
        bot.vx += (Math.random() - 0.5) * 0.1;
        bot.vy += (Math.random() - 0.5) * 0.1;
      }
    },
    
    // ===== SCIENTIST BEHAVIOR =====
    scientistBehavior(bot, gameState) {
      // Look for fusion opportunities
      const atoms = gameState.atoms || [];
      
      // Find pairs of atoms close together
      for (let i = 0; i < atoms.length - 1; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
          const a1 = atoms[i];
          const a2 = atoms[j];
          
          const dx = a2.x - a1.x;
          const dy = a2.y - a1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 150) {
            // Move between them
            const midX = (a1.x + a2.x) / 2;
            const midY = (a1.y + a2.y) / 2;
            
            const tdx = midX - bot.x;
            const tdy = midY - bot.y;
            const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
            
            if (tdist > 20) {
              bot.vx += (tdx / tdist) * 0.2;
              bot.vy += (tdy / tdist) * 0.2;
            }
            
            return;
          }
        }
      }
      
      // Otherwise, create new atoms
      const now = Date.now();
      if (now - bot.lastAction > bot.actionCooldown) {
        // Switch gun occasionally
        if (Math.random() < 0.3) {
          bot.gun = [1, 2, 5][Math.floor(Math.random() * 3)];
        }
        bot.lastAction = now;
      }
      
      // Gentle movement
      bot.vx += (Math.random() - 0.5) * 0.05;
      bot.vy += (Math.random() - 0.5) * 0.05;
    },
    
    // ===== CHAOS BEHAVIOR =====
    chaosBehavior(bot, gameState) {
      // Random movement and shooting
      bot.vx += (Math.random() - 0.5) * 0.3;
      bot.vy += (Math.random() - 0.5) * 0.3;
      
      const now = Date.now();
      if (now - bot.lastAction > bot.actionCooldown * 0.5) {
        // Switch to random gun
        bot.gun = Math.floor(Math.random() * 10) + 1;
        bot.lastAction = now;
      }
      
      // Create chaos near atoms
      const atoms = gameState.atoms || [];
      if (atoms.length > 0 && Math.random() < 0.3) {
        const randomAtom = atoms[Math.floor(Math.random() * atoms.length)];
        const dx = randomAtom.x - bot.x;
        const dy = randomAtom.y - bot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 300) {
          bot.vx += (dx / dist) * 0.4;
          bot.vy += (dy / dist) * 0.4;
        }
      }
    },
    
    // ===== HELPER BEHAVIOR =====
    helperBehavior(bot, gameState) {
      // Find nearest human player
      const players = CHEMVENTUR.Multiplayer.getOtherPlayers();
      let nearest = null;
      let minDist = Infinity;
      
      for (const [id, player] of Object.entries(players)) {
        if (player.isAI) continue; // Skip other bots
        
        const dx = player.x - bot.x;
        const dy = player.y - bot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDist) {
          minDist = dist;
          nearest = player;
        }
      }
      
      // Also check our own player
      if (gameState.ship) {
        const dx = gameState.ship.x - bot.x;
        const dy = gameState.ship.y - bot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDist) {
          minDist = dist;
          nearest = gameState.ship;
        }
      }
      
      if (nearest) {
        // Follow at a distance (stay 100-200 units away)
        if (minDist > 200) {
          const dx = nearest.x - bot.x;
          const dy = nearest.y - bot.y;
          bot.vx += (dx / minDist) * 0.15;
          bot.vy += (dy / minDist) * 0.15;
        } else if (minDist < 100) {
          const dx = nearest.x - bot.x;
          const dy = nearest.y - bot.y;
          bot.vx -= (dx / minDist) * 0.1;
          bot.vy -= (dy / minDist) * 0.1;
        }
        
        // Copy their gun choice
        if (nearest.gun) {
          bot.gun = nearest.gun;
        }
      } else {
        // No players, just wander
        bot.vx += (Math.random() - 0.5) * 0.05;
        bot.vy += (Math.random() - 0.5) * 0.05;
      }
    },
    
    // ===== APPLY PHYSICS =====
    applyPhysics(bot) {
      // Update position
      bot.x += bot.vx;
      bot.y += bot.vy;
      
      // Apply damping
      bot.vx *= 0.98;
      bot.vy *= 0.98;
      
      // Keep in bounds (loose boundaries)
      if (bot.x < -1000) { bot.x = -1000; bot.vx = Math.abs(bot.vx); }
      if (bot.x > 1000) { bot.x = 1000; bot.vx = -Math.abs(bot.vx); }
      if (bot.y < -800) { bot.y = -800; bot.vy = Math.abs(bot.vy); }
      if (bot.y > 800) { bot.y = 800; bot.vy = -Math.abs(bot.vy); }
      
      // Cap speed
      const speed = Math.sqrt(bot.vx * bot.vx + bot.vy * bot.vy);
      if (speed > 5) {
        bot.vx = (bot.vx / speed) * 5;
        bot.vy = (bot.vy / speed) * 5;
      }
    },
    
    // ===== SYNC BOT TO FIREBASE =====
    syncBot(bot) {
      if (!bot.ref) return;
      
      try {
        bot.ref.update({
          x: Math.round(bot.x),
          y: Math.round(bot.y),
          vx: bot.vx,
          vy: bot.vy,
          hp: bot.hp,
          gun: bot.gun,
          lastUpdate: firebase.database.ServerValue.TIMESTAMP
        });
      } catch (e) {
        console.error('Error syncing bot:', e);
      }
    },
    
    // ===== CLEANUP =====
    cleanup() {
      console.log('🧹 Cleaning up AI bots...');
      
      for (const bot of this.bots) {
        if (bot.ref) {
          bot.ref.remove();
        }
      }
      
      this.bots = [];
      this.enabled = false;
      this.isHost = false;
    }
  };
  
  console.log('🤖 AI Players module loaded!');
  
})();
