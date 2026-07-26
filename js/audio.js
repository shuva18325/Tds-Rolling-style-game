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
      const map = { Fire: 340, Frost: 520, Magic: 660, Holy: 720, Necrotic: 300, Physical: 260, Melee: 220, Siege: 190, Piercing: 480, True: 800 };
      this.tone({ freq: map[type] || 320, freqEnd: (map[type] || 320) * 0.5, type: 'triangle', dur: 0.08, vol: 0.12 });
    },
    slash() { // blade sweep — airy whoosh with a steel edge
      if (!this._throttle('slash', 50)) return;
      this.noise({ freq: 2600, q: 0.9, dur: 0.13, vol: 0.14, filter: 'bandpass' });
      this.tone({ freq: 900, freqEnd: 260, type: 'triangle', dur: 0.11, vol: 0.09 });
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
      const base = [392, 440, 523, 587, 659, 740, 784, 880][Math.min(rank, 7)];
      const steps = 3 + rank;
      for (let i = 0; i < steps; i++) this.tone({ freq: base * Math.pow(1.12, i), type: 'triangle', dur: 0.16, vol: 0.14, delay: i * 0.05 });
      if (rank >= RS.rarityRank('Mythic')) this.tone({ freq: base * 2, type: 'sine', dur: 0.5, vol: 0.2, delay: steps * 0.05 });
    },
    win() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.18, delay: i * 0.12 })); },
    lose() { [440, 349, 262].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.4, vol: 0.18, delay: i * 0.16 })); },

    /* ========================= AMBIENT MUSIC =========================
     * Generative, per-map. No samples: a slow drone pair, a sparse arpeggio
     * picked from the map's scale, and an occasional swell. Each map supplies
     * a root note, a scale and a timbre, so Farmstead sounds like open country
     * and the Obsidian Gate sounds like a forge. Gated by settings.music.
     * ================================================================= */
    _music: null,
    MAP_THEME: {
      farmstead:   { root: 196.00, scale: [0, 2, 4, 7, 9],      wave: 'triangle', drone: 'sine',     tempo: 2.9, air: 0.30 },
      riverford:   { root: 174.61, scale: [0, 2, 3, 5, 7, 10],  wave: 'sine',     drone: 'sine',     tempo: 3.2, air: 0.42 },
      blackforest: { root: 146.83, scale: [0, 2, 3, 7, 8],      wave: 'triangle', drone: 'sawtooth', tempo: 3.6, air: 0.26 },
      highkeep:    { root: 220.00, scale: [0, 2, 4, 5, 7, 11],  wave: 'square',   drone: 'sine',     tempo: 2.6, air: 0.34 },
      frostvale:   { root: 261.63, scale: [0, 2, 3, 5, 7, 10],  wave: 'sine',     drone: 'sine',     tempo: 3.8, air: 0.55 },
      sunkenbog:   { root: 130.81, scale: [0, 1, 3, 5, 6, 8],   wave: 'sine',     drone: 'sawtooth', tempo: 4.2, air: 0.48 },
      ashen:       { root: 155.56, scale: [0, 1, 4, 5, 7, 8],   wave: 'triangle', drone: 'sawtooth', tempo: 3.0, air: 0.22 },
      aldermere:   { root: 164.81, scale: [0, 2, 3, 5, 7, 8],   wave: 'triangle', drone: 'sine',     tempo: 3.4, air: 0.38 },
      dragonspine: { root: 185.00, scale: [0, 2, 5, 7, 9],      wave: 'square',   drone: 'sine',     tempo: 2.8, air: 0.45 },
      cathedral:   { root: 207.65, scale: [0, 4, 5, 7, 11],     wave: 'sine',     drone: 'sine',     tempo: 4.4, air: 0.62 },
      obsidian:    { root: 138.59, scale: [0, 1, 3, 6, 7, 10],  wave: 'sawtooth', drone: 'sawtooth', tempo: 2.7, air: 0.18 },
      emberthrone: { root: 123.47, scale: [0, 1, 4, 6, 7, 10],  wave: 'sawtooth', drone: 'sawtooth', tempo: 2.4, air: 0.20 },
      winterhold:  { root: 116.54, scale: [0, 2, 3, 5, 8, 10],  wave: 'sine',     drone: 'sine',     tempo: 4.6, air: 0.68 },
    },
    _musicOn() { return this.ctx && (RS.Meta && RS.Meta.p ? RS.Meta.p.settings.music !== false : true); },

    // Start (or switch to) a map's ambient bed. Safe to call repeatedly.
    startMusic(mapId) {
      this.init(); this.resume();
      if (!this.ctx) return;
      if (this._music && this._music.mapId === mapId) return;
      this.stopMusic();
      if (!this._musicOn()) return;
      const th = this.MAP_THEME[mapId] || this.MAP_THEME.farmstead;
      const c = this.ctx;
      const bus = c.createGain(); bus.gain.value = 0; bus.connect(this.master);
      bus.gain.linearRampToValueAtTime(0.5, c.currentTime + 3);   // fade in
      // gentle low-pass so nothing ever gets shrill under the SFX
      const filt = c.createBiquadFilter(); filt.type = 'lowpass';
      filt.frequency.value = 900 + th.air * 1400; filt.Q.value = 0.6;
      filt.connect(bus);
      // two detuned drones a fifth apart = the harmonic bed
      const drones = [];
      for (const [mult, det, vol] of [[1, -4, 0.10], [1.5, 5, 0.055], [0.5, 0, 0.075]]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = th.drone; o.frequency.value = th.root * mult; o.detune.value = det;
        g.gain.value = vol; o.connect(g); g.connect(filt); o.start();
        drones.push({ o, g });
      }
      // a slow LFO opening and closing the filter — the "breathing" of the bed
      const lfo = c.createOscillator(), lfoG = c.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 0.05 + th.air * 0.04;
      lfoG.gain.value = 260; lfo.connect(lfoG); lfoG.connect(filt.frequency); lfo.start();
      this._music = { mapId, bus, filt, drones, lfo, lfoG, th, timer: null, step: 0 };
      // sparse arpeggio picked from the map's scale
      const tick = () => {
        if (!this._music || this._music.mapId !== mapId) return;
        if (this._musicOn()) {
          const M = this._music, s2 = M.th.scale;
          M.step++;
          if (M.step % 3 !== 0) {   // leave gaps; a note every bar or two
            const semi = s2[Math.floor(Math.random() * s2.length)] + (Math.random() < 0.3 ? 12 : 0);
            const f = M.th.root * 2 * Math.pow(2, semi / 12);
            const o = c.createOscillator(), g = c.createGain();
            const t0 = c.currentTime;
            o.type = M.th.wave; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.075, t0 + 0.25);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
            o.connect(g); g.connect(M.filt); o.start(t0); o.stop(t0 + 2.8);
          }
        }
        this._music.timer = setTimeout(tick, (th.tempo + Math.random() * 1.4) * 1000);
      };
      this._music.timer = setTimeout(tick, 1200);
    },

    stopMusic() {
      const M = this._music; if (!M) return;
      this._music = null;
      clearTimeout(M.timer);
      const c = this.ctx, t = c.currentTime;
      try {
        M.bus.gain.cancelScheduledValues(t);
        M.bus.gain.setValueAtTime(M.bus.gain.value, t);
        M.bus.gain.linearRampToValueAtTime(0.0001, t + 1.2);   // fade out
        M.drones.forEach((d) => d.o.stop(t + 1.4));
        M.lfo.stop(t + 1.4);
      } catch (e) { /* context already torn down */ }
    },

    // Duck the bed briefly (boss entrance, judgment) so the hit reads.
    duckMusic(dur) {
      const M = this._music; if (!M || !this.ctx) return;
      const t = this.ctx.currentTime;
      M.bus.gain.cancelScheduledValues(t);
      M.bus.gain.setValueAtTime(M.bus.gain.value, t);
      M.bus.gain.linearRampToValueAtTime(0.12, t + 0.12);
      M.bus.gain.linearRampToValueAtTime(0.5, t + (dur || 1.6));
    },
  };

  // Lazy-init on the first gesture so autoplay policy is satisfied.
  const kick = () => { Audio.init(); Audio.resume(); };
  window.addEventListener('pointerdown', kick, { once: false });
  window.addEventListener('keydown', kick, { once: false });

  RS.Audio = Audio;
})();
