/**
 * SoundManager - lightweight WebAudio SFX + ambient music.
 *
 * All sound is synthesized at runtime with the Web Audio API instead of
 * shipping binary audio assets. That keeps the whole game a handful of
 * KB of text, works instantly offline (important for the future
 * Capacitor/APK wrap), and sidesteps any licensing question entirely.
 * Every call is a no-op if the browser has no AudioContext, or if the
 * relevant mute setting is on.
 *
 * Haptics ride along with the SFX: click/move/error/win/unlock also fire
 * a tiny navigator.vibrate() pulse (feature-detected, and gated by the
 * `haptics` setting, default on), so every game gets them for free.
 */
(function (global) {
  class SoundManager {
    constructor(save) {
      this._save = save;
      this._ctx = null;
      this._musicNodes = null;
      this._musicTimer = null;
      this._lastBuzz = 0;
      this._hiddenPaused = false;
    }

    get hapticsOn() { return this._save.getSetting('haptics') !== false; }

    // pattern: ms number or [on, off, on...] array. minGapMs throttles
    // rapid-fire calls (e.g. a game calling move() every frame).
    _buzz(pattern, minGapMs = 0) {
      if (!this.hapticsOn) return;
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
      const now = Date.now();
      if (minGapMs && now - this._lastBuzz < minGapMs) return;
      this._lastBuzz = now;
      try { navigator.vibrate(pattern); } catch (e) { /* blocked before user gesture - ignore */ }
    }

    vibrate(pattern) { this._buzz(pattern); }

    _ensureCtx() {
      if (this._ctx) return this._ctx;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this._ctx = new Ctx();
      return this._ctx;
    }

    resume() {
      const ctx = this._ensureCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    get sfxMuted() { return !!this._save.getSetting('muteSfx'); }
    get musicMuted() { return !!this._save.getSetting('muteMusic'); }

    _tone(freq, { duration = 0.15, type = 'sine', gain = 0.18, delay = 0, slideTo = null } = {}) {
      if (this.sfxMuted) return;
      const ctx = this._ensureCtx();
      if (!ctx) return;
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    }

    click() { this._tone(520, { duration: 0.08, type: 'triangle', gain: 0.15 }); this._buzz(10); }
    move() { this._tone(340, { duration: 0.07, type: 'square', gain: 0.08 }); this._buzz(6, 90); }
    select() { this._tone(660, { duration: 0.09, type: 'sine', gain: 0.15 }); }

    success() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        this._tone(f, { duration: 0.18, type: 'triangle', gain: 0.16, delay: i * 0.07 })
      );
    }

    match() { this._tone(880, { duration: 0.12, type: 'sine', gain: 0.16, slideTo: 1320 }); }

    error() {
      this._tone(180, { duration: 0.22, type: 'sawtooth', gain: 0.18, slideTo: 90 });
      this._buzz([30, 40, 30]);
    }

    win() {
      const notes = [523.25, 523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => this._tone(f, { duration: 0.22, type: 'triangle', gain: 0.17, delay: i * 0.1 }));
      this._buzz([15, 60, 15, 60, 40]);
    }

    unlock() {
      [440, 554.37, 659.25, 880].forEach((f, i) =>
        this._tone(f, { duration: 0.2, type: 'sine', gain: 0.15, delay: i * 0.06 })
      );
      this._buzz([12, 50, 25]);
    }

    startMusic() {
      if (this.musicMuted) return;
      const ctx = this._ensureCtx();
      if (!ctx || this._musicTimer) return;
      const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3];
      const master = ctx.createGain();
      master.gain.value = 0.05;
      master.connect(ctx.destination);
      this._musicNodes = { master };

      let step = 0;
      const playStep = () => {
        if (this.musicMuted) return;
        const freq = scale[Math.floor(Math.random() * scale.length)] / (step % 8 === 0 ? 1 : 2);
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
        osc.connect(g).connect(master);
        osc.start(t0);
        osc.stop(t0 + 1);
        step++;
      };
      this._musicTimer = setInterval(playStep, 550);
    }

    stopMusic() {
      if (this._musicTimer) {
        clearInterval(this._musicTimer);
        this._musicTimer = null;
      }
      if (this._musicNodes) {
        this._musicNodes.master.disconnect();
        this._musicNodes = null;
      }
    }

    syncMusicWithSetting() {
      if (this.musicMuted) this.stopMusic();
      else this.startMusic();
    }

    // Called when the app is backgrounded / brought back (visibilitychange).
    pauseForHidden() {
      this._hiddenPaused = true;
      this.stopMusic();
      if (this._ctx && this._ctx.state === 'running') this._ctx.suspend().catch(() => {});
    }

    resumeFromHidden() {
      if (!this._hiddenPaused) return;
      this._hiddenPaused = false;
      if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
      this.syncMusicWithSetting();
    }
  }

  global.PC = global.PC || {};
  global.PC.SoundManager = new SoundManager(global.PC.SaveManager);
})(window);
