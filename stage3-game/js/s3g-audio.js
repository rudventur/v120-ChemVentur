/* ============================================
   🎵 CHEMVENTUR STAGE 3 GAME - TONE ENGINE (Web Audio)
   ============================================
   Plays the c2c tone gun notes (equal temperament, C4 ≈ 261.63 Hz .. C5 ≈ 523.25 Hz)
   and a few soft SFX. Every c2c tone is logged in toneLog (tests read it).
   ============================================ */

(function () {
  'use strict';
  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});

  const Audio = {
    ctx: null,
    master: null,
    muted: false,
    volume: 0.22,
    toneLog: [],          // { freq, note, seq, when, ctxState } for every c2c tone created

    // Must be called from a user gesture in real browsers (START button / first click)
    unlock() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = this.muted ? 0 : this.volume;
          this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
      } catch (e) {
        console.warn('🎵 Web Audio unavailable:', e.message);
        return false;
      }
    },

    setMuted(m) {
      this.muted = !!m;
      if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    },

    // One c2c note. Returns the logged entry (frequency is read back from the oscillator).
    playNote(shot, seqId) {
      const entry = { freq: shot.freq, note: shot.note, seq: seqId, when: null, ctxState: 'none', oscFreq: null };
      if (this.unlock()) {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = shot.freq;
        osc.frequency.setValueAtTime(shot.freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.9, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(t);
        osc.stop(t + 0.25);
        entry.when = t;
        entry.ctxState = this.ctx.state;
        entry.oscFreq = osc.frequency.value;
      }
      this.toneLog.push(entry);
      if (this.toneLog.length > 500) this.toneLog.splice(0, this.toneLog.length - 500);
      return entry;
    },

    // Short soft blip (bond formed, collect, etc.)
    blip(freq, dur, type, vol) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol || 0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.08));
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + (dur || 0.08) + 0.02);
    }
  };

  G.Audio = Audio;
})();
