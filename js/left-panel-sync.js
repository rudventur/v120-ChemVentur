/* ============================================
   CHEMVENTUR v119 - LEFT PANEL MULTIPLAYER SYNC
   Buttons that turn green when everyone agrees,
   grey when settings differ, red-pattern when
   another player just changed something.
   ============================================ */

(function() {

  CHEMVENTUR.LeftPanelSync = {
    // My local copy of shared settings (source of truth until pushed)
    mySettings: {
      turnSeconds: 30
    },
    // When *I* last changed each setting locally
    lastChanged: {
      turnSeconds: 0
    },

    pollInterval: null,

    init() {
      const slider = document.getElementById('turn-timer-slider');
      if (!slider) return;

      slider.oninput = () => this.setTurnSeconds(parseInt(slider.value, 10));
      slider.onchange = () => this.pushToFirebase();

      const btn = document.getElementById('turn-timer-btn');
      if (btn) {
        this.wireLongPress(btn, () => this.openPresets());
      }

      this.updateLabel();

      // Devices refresh at most once a second, per the stability goal.
      if (this.pollInterval) clearInterval(this.pollInterval);
      this.pollInterval = setInterval(() => this.refreshAgreement(), 1000);
      this.refreshAgreement();
    },

    // Long-press = right-click, on touch devices
    wireLongPress(el, cb) {
      let timer = null;
      const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
      el.addEventListener('touchstart', (e) => {
        timer = setTimeout(() => { cb(); }, 550);
      }, { passive: true });
      el.addEventListener('touchend', cancel);
      el.addEventListener('touchmove', cancel);
      el.addEventListener('touchcancel', cancel);
    },

    setTurnSeconds(value) {
      this.mySettings.turnSeconds = value;
      this.lastChanged.turnSeconds = Date.now();
      this.updateLabel();
      this.refreshAgreement();
    },

    updateLabel() {
      const label = document.getElementById('turn-timer-value');
      if (label) label.textContent = this.formatSeconds(this.mySettings.turnSeconds);
      const slider = document.getElementById('turn-timer-slider');
      if (slider) slider.value = this.mySettings.turnSeconds;
    },

    formatSeconds(v) {
      return v >= 61 ? '∞' : v + 's';
    },

    // Each player writes only their own node (per the room data-shape doc)
    pushToFirebase() {
      const Multi = CHEMVENTUR.Multiplayer;
      if (!Multi?.connected || !Multi.playersRef || !Multi.myPlayerId) return;
      try {
        Multi.playersRef.child(Multi.myPlayerId).child('settings').update({
          turnSeconds: this.mySettings.turnSeconds,
          turnSecondsChangedAt: firebase.database.ServerValue.TIMESTAMP
        });
      } catch (e) {
        console.error('LeftPanelSync push failed:', e);
      }
    },

    openPresets() {
      document.getElementById('turn-timer-presets')?.classList.toggle('visible');
    },

    pickPreset(value) {
      this.setTurnSeconds(value);
      this.pushToFirebase();
      document.getElementById('turn-timer-presets')?.classList.remove('visible');
    },

    // Colour the button: green (everyone agrees), grey (settings differ),
    // red pattern (someone else changed it more recently than I did).
    refreshAgreement() {
      const btn = document.getElementById('turn-timer-btn');
      if (!btn) return;
      btn.classList.remove('lp-agree', 'lp-differ', 'lp-pending');

      const Multi = CHEMVENTUR.Multiplayer;
      if (!Multi?.connected) {
        btn.classList.add('lp-agree');
        return;
      }

      const others = Object.values(Multi.players || {});
      const otherSettings = others
        .map(p => p.settings?.turnSeconds)
        .filter(v => v !== undefined && v !== null);

      if (otherSettings.length === 0) {
        btn.classList.add('lp-agree');
        return;
      }

      const allAgree = otherSettings.every(v => v === this.mySettings.turnSeconds);
      if (allAgree) {
        btn.classList.add('lp-agree');
        return;
      }

      const newestOtherChange = others.reduce((max, p) => {
        const t = p.settings?.turnSecondsChangedAt;
        return (typeof t === 'number' && t > max) ? t : max;
      }, 0);

      if (newestOtherChange > this.lastChanged.turnSeconds) {
        btn.classList.add('lp-pending'); // waiting on me to agree
      } else {
        btn.classList.add('lp-differ'); // just differs, nothing new
      }
    }
  };

  console.log('⏱️ Left Panel sync module loaded!');

})();
