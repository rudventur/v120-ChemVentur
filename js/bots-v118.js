/* ============================================
   CHEMVENTUR v118 - FUN BOTS! 🤖
   Reporter, Religious, Homeless, Lover bots!
   All run fully autonomously — zero human input!
   Built with love for Pumpkin 🎃💚
   ============================================ */

(function() {

  CHEMVENTUR.Bots = {
    bots: [],
    enabled: false,
    lastUpdate: 0,
    updateInterval: 100, // 100ms tick
    messageQueue: [],     // on-screen bot messages
    MESSAGE_DURATION: 4000,
    flashEffects: [],     // camera flash effects

    // ===== HEADLINES for Reporter =====
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

    // ===== QUOTES for Religious bot — many traditions! =====
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
    ],

    // ===== INIT =====
    init() {
      console.log('🤖 Initializing Fun Bots...');
      this.bots = [];
      this.messageQueue = [];
      this.flashEffects = [];
      this.enabled = true;
      console.log('✅ Fun Bots system ready!');
    },

    // ===== SPAWN INDIVIDUAL BOTS =====
    spawnReporter() {
      const game = CHEMVENTUR.Game;
      const now = Date.now();
      const bot = {
        id: 'reporter_' + now,
        type: 'reporter',
        emoji: '📰',
        name: 'Reporter Bot',
        color: '#ffaa00',
        x: Math.random() * (game.width - 100) + 50,
        y: Math.random() * (game.height - 200) + 50,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        size: 14,
        spawnTime: now,
        firstScreenshotDone: false,
        lastHeadline: now, // will fire first headline after interval
        headlineInterval: 60000, // 1 minute
        headlineIndex: 0,
        lastScreenshot: 0
      };
      this.bots.push(bot);
      CHEMVENTUR.UI?.showStatus('📰 Reporter Bot deployed!');
      return bot;
    },

    spawnReligious() {
      const game = CHEMVENTUR.Game;
      const bot = {
        id: 'religious_' + Date.now(),
        type: 'religious',
        emoji: '⛪',
        name: 'Peace Bot',
        color: '#ffccff',
        x: Math.random() * (game.width - 100) + 50,
        y: Math.random() * (game.height - 200) + 50,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: 14,
        lastQuote: 0,
        quoteInterval: 15000, // every 15 seconds
        quoteIndex: Math.floor(Math.random() * 60), // start at random quote
        phase: Math.random() * Math.PI * 2,
        glowPhase: 0
      };
      this.bots.push(bot);
      CHEMVENTUR.UI?.showStatus('⛪ Peace Bot deployed!');
      return bot;
    },

    spawnHomeless() {
      const game = CHEMVENTUR.Game;
      const bot = {
        id: 'homeless_' + Date.now(),
        type: 'homeless',
        emoji: '🏠',
        name: 'Homeless Bot',
        color: '#886644',
        x: Math.random() * (game.width - 100) + 50,
        y: Math.random() * (game.height - 200) + 50,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: 14,
        collectedElectrons: 0,
        lastCollect: 0,
        collectRange: 80,
        driftPhase: Math.random() * Math.PI * 2
      };
      this.bots.push(bot);
      CHEMVENTUR.UI?.showStatus('🏠 Homeless Bot deployed!');
      return bot;
    },

    spawnLover() {
      const game = CHEMVENTUR.Game;
      const bot = {
        id: 'lover_' + Date.now(),
        type: 'lover',
        emoji: '💕',
        name: 'Lover Bot',
        color: '#ff66aa',
        x: game.ship.x + 100,
        y: game.ship.y - 80,
        vx: 0,
        vy: 0,
        size: 14,
        orbitAngle: 0,
        orbitRadius: 120,
        orbitSpeed: 0.008,
        heartPhase: 0
      };
      this.bots.push(bot);
      CHEMVENTUR.UI?.showStatus('💕 Lover Bot deployed!');
      return bot;
    },

    spawnAll() {
      if (!this.enabled) this.init();
      this.spawnReporter();
      this.spawnReligious();
      this.spawnHomeless();
      this.spawnLover();
      CHEMVENTUR.UI?.showStatus('🤖 All 4 Fun Bots deployed!');
    },

    removeAll() {
      this.bots = [];
      this.messageQueue = [];
      this.flashEffects = [];
      CHEMVENTUR.UI?.showStatus('🤖 All bots removed');
    },

    removeByType(type) {
      this.bots = this.bots.filter(b => b.type !== type);
    },

    // ===== MAIN UPDATE =====
    update(gameState) {
      if (!this.enabled || this.bots.length === 0) return;

      const now = Date.now();
      if (now - this.lastUpdate < this.updateInterval) return;
      this.lastUpdate = now;

      const { atoms, ship, width, height } = gameState;

      for (const bot of this.bots) {
        switch (bot.type) {
          case 'reporter':  this.updateReporter(bot, width, height, now); break;
          case 'religious': this.updateReligious(bot, width, height, now); break;
          case 'homeless':  this.updateHomeless(bot, atoms, width, height, now); break;
          case 'lover':     this.updateLover(bot, ship, width, height, now); break;
        }

        // Apply velocity + boundary bounce
        bot.x += bot.vx;
        bot.y += bot.vy;

        if (bot.x < 20) { bot.x = 20; bot.vx = Math.abs(bot.vx) * 0.8; }
        if (bot.x > width - 20) { bot.x = width - 20; bot.vx = -Math.abs(bot.vx) * 0.8; }
        if (bot.y < 20) { bot.y = 20; bot.vy = Math.abs(bot.vy) * 0.8; }
        if (bot.y > height - 20) { bot.y = height - 20; bot.vy = -Math.abs(bot.vy) * 0.8; }
      }

      // Expire old messages and flash effects
      this.messageQueue = this.messageQueue.filter(m => now - m.time < this.MESSAGE_DURATION);
      this.flashEffects = this.flashEffects.filter(f => now - f.time < 600);
    },

    // ===== REPORTER BEHAVIOR =====
    updateReporter(bot, W, H, now) {
      // Fly around randomly, change direction occasionally
      if (Math.random() < 0.02) {
        bot.vx += (Math.random() - 0.5) * 2;
        bot.vy += (Math.random() - 0.5) * 2;
      }
      // Cap speed
      const speed = Math.hypot(bot.vx, bot.vy);
      if (speed > 4) { bot.vx *= 4 / speed; bot.vy *= 4 / speed; }
      // Damping
      bot.vx *= 0.99;
      bot.vy *= 0.99;

      // First screenshot 5 seconds after spawning
      if (!bot.firstScreenshotDone && now - bot.spawnTime >= 5000) {
        bot.firstScreenshotDone = true;
        this.addMessage(bot, '📸 First snapshot of the universe!');
        this.doFlashAndScreenshot(bot);
      }

      // Pop headline every minute
      if (now - bot.lastHeadline > bot.headlineInterval) {
        bot.lastHeadline = now;
        const headline = this.HEADLINES[bot.headlineIndex % this.HEADLINES.length];
        bot.headlineIndex++;
        this.addMessage(bot, '📰 ' + headline);

        // Take screenshot with flash
        this.doFlashAndScreenshot(bot);
      }
    },

    doFlashAndScreenshot(bot) {
      // Add flash effect at bot position
      this.flashEffects.push({
        x: bot.x,
        y: bot.y,
        time: Date.now()
      });
      this.addMessage(bot, '📸 *click* Screenshot saved!');
      this.takeScreenshot(bot);
    },

    takeScreenshot(bot) {
      try {
        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;
        // Shrink to save space
        const thumb = document.createElement('canvas');
        thumb.width = 320;
        thumb.height = 180;
        const tCtx = thumb.getContext('2d');
        tCtx.drawImage(canvas, 0, 0, 320, 180);
        const dataUrl = thumb.toDataURL('image/jpeg', 0.6);

        const key = 'reporter_screenshot_' + Date.now();
        // Keep only last 5 screenshots
        const keys = Object.keys(localStorage).filter(k => k.startsWith('reporter_screenshot_')).sort();
        while (keys.length >= 5) {
          localStorage.removeItem(keys.shift());
        }
        localStorage.setItem(key, dataUrl);
        console.log('📰📸 Reporter screenshot saved:', key);
      } catch (e) {
        console.warn('📰 Screenshot failed:', e.message);
      }
    },

    // ===== RELIGIOUS BEHAVIOR =====
    updateReligious(bot, W, H, now) {
      // Float peacefully with gentle sine wave motion
      bot.phase += 0.015;
      bot.glowPhase += 0.03;
      bot.vx = Math.sin(bot.phase) * 0.6;
      bot.vy = Math.cos(bot.phase * 0.7) * 0.4;

      // Show quote periodically
      if (now - bot.lastQuote > bot.quoteInterval) {
        bot.lastQuote = now;
        const q = this.QUOTES[bot.quoteIndex % this.QUOTES.length];
        bot.quoteIndex++;
        this.addMessage(bot, '🙏 "' + q.text + '" — ' + q.source);
      }
    },

    // ===== HOMELESS BEHAVIOR =====
    updateHomeless(bot, atoms, W, H, now) {
      // Drift slowly, change direction rarely
      bot.driftPhase += 0.005;
      bot.vx += Math.sin(bot.driftPhase) * 0.05;
      bot.vy += Math.cos(bot.driftPhase * 0.6) * 0.04;
      // Very slow
      const speed = Math.hypot(bot.vx, bot.vy);
      if (speed > 1.5) { bot.vx *= 1.5 / speed; bot.vy *= 1.5 / speed; }
      bot.vx *= 0.995;
      bot.vy *= 0.995;

      // Find and collect stray electrons
      let nearest = null;
      let nearDist = bot.collectRange;
      for (let i = atoms.length - 1; i >= 0; i--) {
        const a = atoms[i];
        if (!a || a.p !== 0 || a.n !== 0 || a.e !== 1) continue; // only free electrons
        const d = Math.hypot(bot.x - a.x, bot.y - a.y);
        if (d < nearDist) {
          nearest = { index: i, atom: a, dist: d };
          nearDist = d;
        }
      }

      if (nearest) {
        // Move toward the electron
        const dx = nearest.atom.x - bot.x;
        const dy = nearest.atom.y - bot.y;
        const d = nearest.dist || 1;
        bot.vx += (dx / d) * 0.15;
        bot.vy += (dy / d) * 0.15;

        // Collect if close enough
        if (nearest.dist < 25) {
          atoms.splice(nearest.index, 1);
          bot.collectedElectrons++;
          if (bot.collectedElectrons % 5 === 0) {
            this.addMessage(bot, '🏠 Collected ' + bot.collectedElectrons + ' electrons so far!');
          }
        }
      }
    },

    // ===== LOVER BEHAVIOR =====
    updateLover(bot, ship, W, H, now) {
      // Orbit the player ship
      bot.orbitAngle += bot.orbitSpeed;
      bot.heartPhase += 0.05;

      const targetX = ship.x + Math.cos(bot.orbitAngle) * bot.orbitRadius;
      const targetY = ship.y + Math.sin(bot.orbitAngle) * bot.orbitRadius;

      // Smooth follow
      bot.vx = (targetX - bot.x) * 0.06;
      bot.vy = (targetY - bot.y) * 0.06;
    },

    // ===== MESSAGE SYSTEM =====
    addMessage(bot, text) {
      this.messageQueue.push({
        text,
        botId: bot.id,
        color: bot.color,
        x: bot.x,
        y: bot.y - 30,
        time: Date.now()
      });
      // Also log to chat if available
      if (CHEMVENTUR.Chat?.addMessage) {
        CHEMVENTUR.Chat.addMessage(bot.emoji + ' ' + bot.name, text);
      }
    },

    // ===== RENDER =====
    draw(ctx) {
      if (!this.enabled || this.bots.length === 0) return;
      const now = Date.now();

      for (const bot of this.bots) {
        ctx.save();

        // Bot-specific effects
        if (bot.type === 'religious') {
          const glow = 8 + Math.sin(bot.glowPhase) * 4;
          ctx.shadowBlur = glow;
          ctx.shadowColor = '#ffccff';
        } else if (bot.type === 'lover') {
          ctx.shadowBlur = 10 + Math.sin(bot.heartPhase) * 5;
          ctx.shadowColor = '#ff66aa';
        } else if (bot.type === 'reporter') {
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#ffaa00';
        } else if (bot.type === 'homeless') {
          ctx.shadowBlur = 5;
          ctx.shadowColor = '#886644';
        }

        // Draw bot body (circle)
        ctx.fillStyle = bot.color;
        ctx.beginPath();
        ctx.arc(bot.x, bot.y, bot.size, 0, Math.PI * 2);
        ctx.fill();

        // Draw emoji on top
        ctx.shadowBlur = 0;
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bot.emoji, bot.x, bot.y);

        // Name label
        ctx.font = '9px Courier New';
        ctx.fillStyle = bot.color;
        ctx.fillText(bot.name, bot.x, bot.y + bot.size + 10);

        // Homeless: show electron count
        if (bot.type === 'homeless' && bot.collectedElectrons > 0) {
          ctx.font = '8px Courier New';
          ctx.fillStyle = '#00ffff';
          ctx.fillText('e\u207B: ' + bot.collectedElectrons, bot.x, bot.y + bot.size + 20);
        }

        // Lover: draw little hearts around orbit
        if (bot.type === 'lover') {
          const heartAlpha = 0.4 + Math.sin(bot.heartPhase) * 0.3;
          ctx.globalAlpha = heartAlpha;
          ctx.font = '10px sans-serif';
          for (let i = 0; i < 3; i++) {
            const a = bot.orbitAngle + i * (Math.PI * 2 / 3);
            const hx = bot.x + Math.cos(a) * 22;
            const hy = bot.y + Math.sin(a) * 22;
            ctx.fillText('\u{1F495}', hx - 5, hy);
          }
          ctx.globalAlpha = 1;
        }

        ctx.restore();
      }

      // Draw camera flash effects
      for (const flash of this.flashEffects) {
        const age = now - flash.time;
        const alpha = Math.max(0, 1 - age / 600);
        const radius = 40 + age * 0.3;

        ctx.save();
        ctx.globalAlpha = alpha * 0.7;
        const grad = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, '#ffffaa');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Draw messages
      for (const msg of this.messageQueue) {
        const age = now - msg.time;
        const alpha = Math.max(0, 1 - age / this.MESSAGE_DURATION);
        const yOffset = -(age / this.MESSAGE_DURATION) * 40;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '11px Courier New';
        ctx.textAlign = 'center';

        // Background
        const metrics = ctx.measureText(msg.text);
        const tw = Math.min(metrics.width + 16, 400);
        const tx = msg.x - tw / 2;
        const ty = msg.y + yOffset - 8;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(tx, ty, tw, 18);
        ctx.strokeStyle = msg.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, tw, 18);

        // Text (truncate if too long)
        ctx.fillStyle = msg.color;
        let displayText = msg.text;
        if (displayText.length > 55) displayText = displayText.substring(0, 52) + '...';
        ctx.fillText(displayText, msg.x, msg.y + yOffset + 4);

        ctx.restore();
      }
    }
  };

  console.log('🤖 Fun Bots module loaded!');
})();
