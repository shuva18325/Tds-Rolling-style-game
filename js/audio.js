/* =========================================================================
 * REALM SIEGE — js/audio.js
 * Tiny procedural sound engine (WebAudio, no external assets). Every effect is
 * synthesised from oscillators + noise bursts. Gated by settings.sfx; the
 * AudioContext is created lazily on the first user gesture (browser policy).
 * Callers are rate-limited so 40 towers firing don't turn into noise.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});

  const Audio = {
    ctx: null, master: null, _last: {},
    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.32; this.master.connect(this.ctx.destination);
      } catch (e) { /* audio unavailable — silently ignore */ }
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    _ok() { return this.ctx && (RS.Meta && RS.Meta.p ? RS.Meta.p.settings.sfx !== false : true); },
    _throttle(k, ms) { const t = performance.now(); if (this._last[k] && t - this._last[k] < ms) return false; this._last[k] = t; return true; },

    // one oscillator blip with an amplitude/pitch envelope
    tone(o) {
      if (!this._ok()) return;
      const c = this.ctx, t = c.currentTime + (o.delay || 0);
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + o.dur);
      const v = o.vol == null ? 0.3 : o.vol;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      osc.connect(g); g.connect(this.master); osc.start(t); osc.stop(t + o.dur + 0.03);
    },
    // filtered white-noise burst (impacts / clang body)
    noise(o) {
      if (!this._ok()) return;
      const c = this.ctx, t = c.currentTime + (o.delay || 0), dur = o.dur || 0.2;
      const n = Math.floor(dur * c.sampleRate);
      const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = c.createBufferSource(); src.buffer = buf;
      const filt = c.createBiquadFilter(); filt.type = o.filter || 'bandpass'; filt.frequency.value = o.freq || 1200; filt.Q.value = o.q || 1;
      const g = c.createGain(); const v = o.vol == null ? 0.3 : o.vol;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt); filt.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.02);
    },

    /* ------------------------------ effects --------------------------- */
    shoot(type) {
      if (!this._throttle('shoot', 55)) return;
      const map = { Fire: 340, Frost: 520, Magic: 660, Holy: 720, Necrotic: 300, Physical: 260, Piercing: 480, True: 800 };
      this.tone({ freq: map[type] || 320, freqEnd: (map[type] || 320) * 0.5, type: 'triangle', dur: 0.08, vol: 0.12 });
    },
    clang() { // metallic shield block — the requested "clang"
      if (!this._throttle('clang', 45)) return;
      this.tone({ freq: 2100, type: 'square', dur: 0.11, vol: 0.10 });
      this.tone({ freq: 3200, type: 'square', dur: 0.09, vol: 0.07 });
      this.tone({ freq: 4700, type: 'square', dur: 0.06, vol: 0.05 });
      this.noise({ freq: 3000, q: 2, dur: 0.09, vol: 0.10, filter: 'highpass' });
    },
    boom() { // cannon / splash blast
      if (!this._throttle('boom', 70)) return;
      this.tone({ freq: 150, freqEnd: 42, type: 'sine', dur: 0.35, vol: 0.32 });
      this.noise({ freq: 400, q: 0.6, dur: 0.3, vol: 0.28, filter: 'lowpass' });
    },
    greatCannon() { // the Basilic — deep, huge
      this.tone({ freq: 90, freqEnd: 30, type: 'sine', dur: 0.7, vol: 0.42 });
      this.tone({ freq: 200, freqEnd: 50, type: 'sawtooth', dur: 0.5, vol: 0.2 });
      this.noise({ freq: 300, q: 0.5, dur: 0.6, vol: 0.34, filter: 'lowpass' });
    },
    place() { this.tone({ freq: 180, freqEnd: 320, type: 'square', dur: 0.12, vol: 0.14 }); this.noise({ freq: 800, dur: 0.14, vol: 0.12, filter: 'lowpass' }); },
    upgrade() { [523, 659, 784].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.14, delay: i * 0.05 })); },
    ascend() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.15, delay: i * 0.06 })); },
    crack() { this.tone({ freq: 900, freqEnd: 200, type: 'sawtooth', dur: 0.18, vol: 0.16 }); this.noise({ freq: 2500, q: 1.5, dur: 0.16, vol: 0.16, filter: 'highpass' }); },
    boss() { this.tone({ freq: 70, freqEnd: 45, type: 'sawtooth', dur: 0.8, vol: 0.34 }); this.tone({ freq: 140, type: 'square', dur: 0.5, vol: 0.14 }); },
    coin() { this.tone({ freq: 880, type: 'square', dur: 0.06, vol: 0.1 }); this.tone({ freq: 1320, type: 'square', dur: 0.08, vol: 0.08, delay: 0.05 }); },
    forge() { this.tone({ freq: 260, freqEnd: 120, type: 'square', dur: 0.12, vol: 0.2 }); this.noise({ freq: 3500, q: 2, dur: 0.12, vol: 0.16, filter: 'highpass' }); },
    reveal(rank) { // roll result — escalates with rarity rank (0..6)
      const base = [392, 440, 523, 587, 659, 784, 880][Math.min(rank, 6)];
      const steps = 3 + rank;
      for (let i = 0; i < steps; i++) this.tone({ freq: base * Math.pow(1.12, i), type: 'triangle', dur: 0.16, vol: 0.14, delay: i * 0.05 });
      if (rank >= 5) this.tone({ freq: base * 2, type: 'sine', dur: 0.5, vol: 0.2, delay: steps * 0.05 });
    },
    win() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.18, delay: i * 0.12 })); },
    lose() { [440, 349, 262].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.4, vol: 0.18, delay: i * 0.16 })); },
  };

  // Lazy-init on the first gesture so autoplay policy is satisfied.
  const kick = () => { Audio.init(); Audio.resume(); };
  window.addEventListener('pointerdown', kick, { once: false });
  window.addEventListener('keydown', kick, { once: false });

  RS.Audio = Audio;
})();
