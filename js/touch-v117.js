/* ============================================
   CHEMVENTUR v117 - MOBILE TOUCH CONTROLS
   📱 TAP & DRAG = SHIP FOLLOWS! 📱
   ============================================ */

(function() {
  
  CHEMVENTUR.TouchControls = {
    enabled: false,
    touching: false,
    touchX: 0,
    touchY: 0,
    touchId: null,
    
    // Settings
    smoothing: 0.15,
    driftFactor: 0.98,
    minDistance: 10,
    
    init(canvas) {
      // Detect if mobile
      const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) || 
                       'ontouchstart' in window;
      
      if (!isMobile) {
        console.log('📱 Not mobile device, touch controls disabled');
        return;
      }
      
      this.canvas = canvas;
      this.enabled = true;

      // Prevent default behaviors
      canvas.style.touchAction = 'none';

      // Touch events
      canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
      canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
      canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
      canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });

      this.initMobileControls();

      console.log('📱 Touch controls enabled!');
    },

    // ===== FIRE BUTTON + SIMPLIFIED GUN PICKER =====
    GUN_ORDER: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    fireHoldInterval: null,

    initMobileControls() {
      const controls = document.getElementById('mobile-controls');
      if (controls) controls.classList.add('mobile-controls-visible');

      this.wireFireButton();
      this.wireGunPicker();
      this.updateGunLabel();
    },

    wireFireButton() {
      const btn = document.getElementById('mobile-fire-btn');
      if (!btn) return;

      const startFiring = (e) => {
        e.preventDefault();
        e.stopPropagation();
        CHEMVENTUR.Game?.fireCurrentGun?.();
        if (navigator.vibrate) navigator.vibrate(15);
        if (this.fireHoldInterval) clearInterval(this.fireHoldInterval);
        this.fireHoldInterval = setInterval(() => {
          CHEMVENTUR.Game?.fireCurrentGun?.();
        }, 220);
      };

      const stopFiring = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.fireHoldInterval) {
          clearInterval(this.fireHoldInterval);
          this.fireHoldInterval = null;
        }
      };

      btn.addEventListener('touchstart', startFiring, { passive: false });
      btn.addEventListener('touchend', stopFiring, { passive: false });
      btn.addEventListener('touchcancel', stopFiring, { passive: false });
    },

    wireGunPicker() {
      const prevBtn = document.getElementById('mobile-gun-prev');
      const nextBtn = document.getElementById('mobile-gun-next');
      const current = document.getElementById('mobile-gun-current');

      const cycle = (dir) => {
        const gunId = CHEMVENTUR.GunSystem.currentGun;
        const idx = this.GUN_ORDER.indexOf(String(gunId));
        const nextIdx = (idx + dir + this.GUN_ORDER.length) % this.GUN_ORDER.length;
        const nextGun = this.GUN_ORDER[nextIdx];
        CHEMVENTUR.UI?.selectGun(nextGun === '0' ? 0 : parseInt(nextGun, 10));
        this.updateGunLabel();
      };

      const tap = (el, cb) => {
        if (!el) return;
        el.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          cb();
        }, { passive: false });
      };

      tap(prevBtn, () => cycle(-1));
      tap(nextBtn, () => cycle(1));

      // Long-press the gun label = right-click equivalent (gun options)
      let pressTimer = null;
      if (current) {
        current.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          pressTimer = setTimeout(() => {
            CHEMVENTUR.UI?.openGunOptions(CHEMVENTUR.GunSystem.currentGun);
          }, 550);
        }, { passive: false });
        const cancelPress = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pressTimer) clearTimeout(pressTimer);
        };
        current.addEventListener('touchend', cancelPress, { passive: false });
        current.addEventListener('touchmove', cancelPress, { passive: false });
      }
    },

    updateGunLabel() {
      const current = document.getElementById('mobile-gun-current');
      if (!current) return;
      const gun = CHEMVENTUR.Guns?.[CHEMVENTUR.GunSystem.currentGun];
      current.textContent = gun ? gun.name : '';
    },
    
    onTouchStart(e) {
      e.preventDefault();
      
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        
        this.touchX = touch.clientX - rect.left;
        this.touchY = touch.clientY - rect.top;
        this.touchId = touch.identifier;
        this.touching = true;
        
        // Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(10);
        }
      }
    },
    
    onTouchMove(e) {
      e.preventDefault();
      
      if (!this.touching) return;
      
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === this.touchId) {
          const rect = this.canvas.getBoundingClientRect();
          this.touchX = touch.clientX - rect.left;
          this.touchY = touch.clientY - rect.top;
          break;
        }
      }
    },
    
    onTouchEnd(e) {
      e.preventDefault();
      
      let touchEnded = true;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === this.touchId) {
          touchEnded = false;
          break;
        }
      }
      
      if (touchEnded) {
        this.touching = false;
        this.touchId = null;
      }
    },
    
    // Update ship based on touch
    updateShip(ship) {
      if (!this.enabled || !this.touching || !ship) return;

      const dx = this.touchX - ship.x;
      const dy = this.touchY - ship.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 📱 Ship turns to face the drag direction (and aims guns there too)
      if (dist > 1) {
        const angle = Math.atan2(dy, dx);
        ship.rotation = angle;
        if (CHEMVENTUR.GunSystem) CHEMVENTUR.GunSystem.aimAngle = angle;
      }

      if (dist > this.minDistance) {
        const dirX = dx / dist;
        const dirY = dy / dist;

        ship.vx += dirX * this.smoothing;
        ship.vy += dirY * this.smoothing;
      }
    },
    
    // Apply drift when not touching
    applyDrift(ship) {
      if (!this.enabled || this.touching || !ship) return;
      
      ship.vx *= this.driftFactor;
      ship.vy *= this.driftFactor;
      
      if (Math.abs(ship.vx) < 0.01) ship.vx = 0;
      if (Math.abs(ship.vy) < 0.01) ship.vy = 0;
    },
    
    // Get touch position for rendering
    getTouchPos() {
      if (!this.touching) return null;
      return { x: this.touchX, y: this.touchY };
    }
  };
  
  console.log('📱 Touch controls module loaded!');
  
})();
