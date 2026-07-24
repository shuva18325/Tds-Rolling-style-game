/* =========================================================================
 * REALM SIEGE — js/vfx.js
 * Pooled, typed particle engine (RS.VFX) + shared impact/reveal/aura helpers
 * + a full-screen overlay for roll/forge/Mythic+ spectacles.
 *
 * PURELY PRESENTATIONAL. Driven by the render layer (which observes sim state)
 * and by the UI (rolls/forge). Never read by match/meta/combat. Hard-capped
 * and degrades gracefully to protect the 60 FPS / 200-enemy budget.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const A = RS.art, TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);

  const MAX = 1400;
  const pool = [];
  const free = [];
  function makeP() { return { active: false }; }
  for (let i = 0; i < 300; i++) { const p = makeP(); pool.push(p); free.push(p); }

  function alloc(priority) {
    let p = free.pop();
    if (!p) {
      if (pool.length < MAX) { p = makeP(); pool.push(p); }
      else return null; // at cap: drop (low-priority callers pass true to skip)
    }
    p.active = true; return p;
  }

  const VFX = {
    enabled: true,
    _p(x, y, o) {
      if (!this.enabled) return null;
      const p = alloc(o.lowPri);
      if (!p) return null;
      p.x = x; p.y = y;
      p.vx = o.vx || 0; p.vy = o.vy || 0;
      p.g = o.g || 0; p.drag = o.drag || 0;
      p.life = p.max = o.life || 0.5;
      p.s0 = o.s0 != null ? o.s0 : 3; p.s1 = o.s1 != null ? o.s1 : 0;
      p.color = o.color || '#fff'; p.color2 = o.color2 || null;
      p.a0 = o.a0 != null ? o.a0 : 1; p.a1 = o.a1 != null ? o.a1 : 0;
      p.blend = o.blend || 'normal'; p.shape = o.shape || 'dot';
      p.rot = o.rot || 0; p.spin = o.spin || 0; p.grow = o.grow || 0;
      return p;
    },

    /* ------------------------------ emitters -------------------------- */
    dust(x, y, n, color) {
      color = color || '#b8a888';
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), sp = rnd(20, 70);
        this._p(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(4, 20), g: 40, drag: 2.5, life: rnd(0.3, 0.6), s0: rnd(2, 4), s1: 0, color, a0: 0.7, shape: 'dot' });
      }
    },
    sparks(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), sp = rnd(60, 200);
        this._p(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 120, drag: 1.5, life: rnd(0.2, 0.45), s0: rnd(2, 3.5), s1: 0, color: color || '#ffd98a', a0: 1, blend: 'add', shape: 'spark', rot: a });
      }
    },
    embers(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        this._p(x, y, { vx: rnd(-20, 20), vy: rnd(-60, -20), g: -6, drag: 0.6, life: rnd(0.5, 1.1), s0: rnd(1.5, 3), s1: 0, color: color || '#ff8a3a', a0: 1, blend: 'add', shape: 'dot' });
      }
    },
    smoke(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        this._p(x, y, { vx: rnd(-12, 12), vy: rnd(-30, -10), g: -4, drag: 0.9, life: rnd(0.6, 1.2), s0: rnd(3, 6), s1: rnd(8, 14), grow: 1, color: color || '#6a5a70', a0: 0.35, shape: 'dot', lowPri: true });
      }
    },
    frost(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), sp = rnd(30, 120);
        this._p(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 30, drag: 2, life: rnd(0.3, 0.6), s0: rnd(2, 4), s1: 0, color: '#bfeaf5', a0: 1, blend: 'add', shape: 'shard', rot: a, spin: rnd(-6, 6) });
      }
    },
    magic(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), sp = rnd(20, 90);
        this._p(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, g: -8, drag: 1.2, life: rnd(0.4, 0.8), s0: rnd(1.5, 3), s1: 0, color: color || '#c79bff', a0: 1, blend: 'add', shape: 'dot' });
      }
    },
    shards(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), sp = rnd(50, 160);
        this._p(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, g: 220, drag: 0.8, life: rnd(0.4, 0.7), s0: rnd(3, 5), s1: rnd(1, 2), color: color || '#9fd0ff', a0: 1, blend: 'add', shape: 'shard', rot: a, spin: rnd(-10, 10) });
      }
    },
    feathers(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        this._p(x, y, { vx: rnd(-40, 40), vy: rnd(-10, 30), g: 30, drag: 1.8, life: rnd(0.6, 1.1), s0: rnd(3, 5), s1: rnd(2, 3), color: color || '#c9d4e0', a0: 0.9, shape: 'shard', rot: rnd(0, TAU), spin: rnd(-4, 4) });
      }
    },
    blood(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), sp = rnd(30, 100);
        this._p(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 160, drag: 1, life: rnd(0.25, 0.5), s0: rnd(2, 3.5), s1: 0, color: color || '#7a1f1f', a0: 0.9, shape: 'dot' });
      }
    },
    flame(x, y, n) {
      for (let i = 0; i < n; i++) {
        this._p(x, y, { vx: rnd(-18, 18), vy: rnd(-50, -20), g: -20, drag: 1, life: rnd(0.25, 0.5), s0: rnd(4, 7), s1: 0, color: '#ffb04a', color2: '#e0401f', a0: 0.9, blend: 'add', shape: 'flame' });
      }
    },
    ring(x, y, color, r0, r1, life, width) {
      const p = this._p(x, y, { life: life || 0.35, s0: r0 || 4, s1: r1 || 40, color: color || '#fff', a0: 0.6, blend: 'add', shape: 'ring' });
      if (p) p.width = width || 3;
    },
    column(x, y, color) {
      const p = this._p(x, y, { life: 0.7, s0: 10, s1: 10, color: color || '#ffd98a', a0: 0.8, blend: 'add', shape: 'column' });
      if (p) p.h = 90;
    },
    trail(type, x, y) {
      const c = { fire: '#ff8a3a', frost: '#bfeaf5', arcane: '#c79bff', holy: '#fff2b0', necrotic: '#8a6aa0', prism: '#ffffff' }[type];
      if (!c) return;
      this._p(x, y, { vx: rnd(-6, 6), vy: rnd(-6, 6), g: type === 'fire' ? -20 : 0, life: 0.3, s0: 2.5, s1: 0, color: c, a0: 0.8, blend: 'add', shape: 'dot', lowPri: true });
    },

    /* --------------------- damage-type impact bursts ------------------ */
    impact(type, x, y, scale) {
      scale = scale || 1;
      switch (RS.DMG_VFX[type]) {
        case 'fire': this.flame(x, y, 4 * scale | 0); this.embers(x, y, 5 * scale | 0); this.ring(x, y, '#ff8a3a', 3, 22 * scale, 0.3, 3); break;
        case 'frost': this.frost(x, y, 6 * scale | 0); this.ring(x, y, '#bfeaf5', 3, 20 * scale, 0.3, 2); break;
        case 'holy': this.sparks(x, y, 5 * scale | 0, '#fff2b0'); this.ring(x, y, '#fff2b0', 3, 24 * scale, 0.3, 2); this.magic(x, y, 3, '#fff6c8'); break;
        case 'necrotic': this.smoke(x, y, 4, '#7d5fa0'); this.ring(x, y, '#8a6aa0', 3, 18 * scale, 0.35, 2); break;
        case 'arcane': this.magic(x, y, 6 * scale | 0); this.ring(x, y, '#c79bff', 3, 20 * scale, 0.3, 2); break;
        case 'prism': for (let i = 0; i < 6; i++) this.sparks(x, y, 1, A.prismatic(performance.now() / 1000, i)); this.ring(x, y, '#fff', 3, 26 * scale, 0.3, 2); break;
        default: this.dust(x, y, 4 * scale | 0); this.sparks(x, y, 3 * scale | 0, '#e8dcc0');
      }
    },

    /* ------------------------- rarity reveal burst -------------------- */
    rarityBurst(rarity, x, y, big) {
      const pal = RS.rarityPal(rarity);
      const n = big ? 40 : 18;
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), sp = rnd(60, big ? 260 : 160);
        this._p(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 40, drag: 1.2, life: rnd(0.4, 0.9), s0: rnd(2, 4), s1: 0, color: pal.particle, a0: 1, blend: 'add', shape: 'spark', rot: a });
      }
      this.ring(x, y, pal.glow, 6, big ? 120 : 60, 0.5, 3);
    },

    /* ------------------------------ core ------------------------------ */
    update(dt) {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i]; if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; free.push(p); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += p.g * dt;
        if (p.drag) { const f = 1 - p.drag * dt; p.vx *= f; p.vy *= f; }
        if (p.spin) p.rot += p.spin * dt;
      }
    },

    draw(ctx) {
      // normal blend pass
      ctx.save();
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
        for (let i = 0; i < pool.length; i++) {
          const p = pool[i]; if (!p.active) continue;
          const add = p.blend === 'add';
          if ((pass === 0) === add) continue;
          const t = 1 - p.life / p.max;
          const a = p.a0 + (p.a1 - p.a0) * t;
          if (a <= 0.01) continue;
          const s = p.s0 + (p.s1 - p.s0) * t;
          ctx.globalAlpha = A.clamp(a, 0, 1);
          let col = p.color;
          if (p.color2) col = A.mix(p.color, p.color2, t);
          ctx.fillStyle = col; ctx.strokeStyle = col;
          switch (p.shape) {
            case 'dot': ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill(); break;
            case 'square': ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); break;
            case 'flame': { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill(); break; }
            case 'spark': { const vx = Math.cos(p.rot), vy = Math.sin(p.rot); ctx.lineWidth = s * 0.6; ctx.beginPath(); ctx.moveTo(p.x - vx * s, p.y - vy * s); ctx.lineTo(p.x + vx * s, p.y + vy * s); ctx.stroke(); break; }
            case 'shard': { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, s); ctx.lineTo(-s * 0.6, s); ctx.closePath(); ctx.fill(); ctx.restore(); break; }
            case 'ring': ctx.lineWidth = p.width || 3; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.stroke(); break;
            case 'column': { const g = ctx.createLinearGradient(p.x, p.y - p.h, p.x, p.y + 10); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(p.x - s, p.y - p.h, s * 2, p.h + 10); break; }
          }
        }
      }
      ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },
    count() { let c = 0; for (let i = 0; i < pool.length; i++) if (pool[i].active) c++; return c; },
    clear() { for (let i = 0; i < pool.length; i++) if (pool[i].active) { pool[i].active = false; free.push(pool[i]); } },
  };

  /* =========================== OVERLAY (UI) =========================== */
  // A fixed full-viewport canvas for roll/forge/Mythic+ spectacles. Self-driven
  // by RAF only while effects are live; sleeps otherwise.
  const Overlay = {
    cv: null, ctx: null, running: false, fx: [], parts: [], last: 0,
    ensure() {
      if (this.cv) return;
      const cv = document.createElement('canvas');
      cv.id = 'vfxOverlay';
      cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:200;';
      document.body.appendChild(cv);
      this.cv = cv; this.ctx = cv.getContext('2d');
      this._resize(); window.addEventListener('resize', () => this._resize());
    },
    _resize() { if (!this.cv) return; this.cv.width = window.innerWidth; this.cv.height = window.innerHeight; },
    _p(o) { this.parts.push(o); },
    kick() { this.ensure(); if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame((t) => this._loop(t)); } },
    _loop(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
      const ctx = this.ctx; ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      // effects
      this.fx = this.fx.filter((f) => { f.t += dt; f.draw(ctx, f, this); return f.t < f.dur; });
      // particles
      ctx.save();
      for (const p of this.parts) {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; if (p.spin) p.rot += p.spin * dt;
      }
      this.parts = this.parts.filter((p) => p.life > 0);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.parts) {
        ctx.globalAlpha = A.clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        if (p.shape === 'shard') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0); ctx.beginPath(); ctx.moveTo(0, -p.s); ctx.lineTo(p.s * 0.6, p.s); ctx.lineTo(-p.s * 0.6, p.s); ctx.closePath(); ctx.fill(); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); }
      }
      ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (this.fx.length || this.parts.length) requestAnimationFrame((tt) => this._loop(tt));
      else { this.running = false; ctx.clearRect(0, 0, this.cv.width, this.cv.height); }
    },

    // rarity reveal glow bloom centered on a screen rect
    reveal(rarity, cx, cy) {
      this.ensure();
      const pal = RS.rarityPal(rarity); const rank = RS.rarityRank(rarity);
      this.fx.push({ t: 0, dur: 0.7 + rank * 0.12, draw: (ctx, f) => {
        const k = f.t / f.dur; const R = 40 + k * (120 + rank * 60);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, A.alpha(pal.glow, 0.5 * (1 - k)));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      } });
      const n = 20 + rank * 14;
      for (let i = 0; i < n; i++) { const a = rnd(0, TAU), sp = rnd(120, 320 + rank * 60); this._p({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 120, life: rnd(0.5, 1), max: 1, s: rnd(2, 4), color: pal.particle, rot: a, shape: i % 3 ? 'dot' : 'shard', spin: rnd(-8, 8) });
      }
      if (rank >= 4) this.column(cx, cy, pal.glow);
      if (rank >= 5) this.shockwave(cx, cy, pal.glow);
      if (rank >= 6) this.prismShatter();
      this.kick();
    },
    column(cx, cy, color) {
      this.fx.push({ t: 0, dur: 0.9, draw: (ctx, f) => {
        const k = f.t / f.dur; const w = 30 * (1 - k) + 8; const a = 0.6 * Math.sin(Math.PI * k);
        const g = ctx.createLinearGradient(cx, cy - 320, cx, cy + 40);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, A.alpha(color, a)); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - w, cy - 320, w * 2, 360);
      } });
    },
    shockwave(cx, cy, color) {
      this.fx.push({ t: 0, dur: 0.5, draw: (ctx, f) => {
        const k = f.t / f.dur; ctx.globalAlpha = 1 - k; ctx.strokeStyle = color; ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(cx, cy, k * 400, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      } });
    },
    prismShatter() {
      this.ensure();
      const W = this.cv.width, H = this.cv.height, cx = W / 2, cy = H / 2;
      // chromatic full-screen flash + rotating glass cracks
      this.fx.push({ t: 0, dur: 0.9, draw: (ctx, f) => {
        const k = f.t / f.dur;
        ctx.globalAlpha = (1 - k) * 0.4; ctx.fillStyle = A.prismatic(f.t, 0); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(cx, cy); ctx.lineWidth = 2 * (1 - k) + 0.5;
        for (let i = 0; i < 18; i++) {
          ctx.strokeStyle = A.alpha(A.prismatic(f.t, i), 1 - k);
          const a = (i / 18) * TAU + k * 0.3, r = k * Math.hypot(W, H);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
        }
        ctx.restore();
      } });
      for (let i = 0; i < 60; i++) { const a = rnd(0, TAU), sp = rnd(200, 700); this._p({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 200, life: rnd(0.6, 1.1), max: 1.1, s: rnd(3, 7), color: A.prismatic(Math.random() * 5, i), rot: a, shape: 'shard', spin: rnd(-12, 12) }); }
      this.kick();
    },
    // forge anvil spark shower at screen coords
    forgeStrike(cx, cy, color) {
      this.ensure();
      this.fx.push({ t: 0, dur: 0.35, draw: (ctx, f) => { const k = f.t / f.dur; ctx.globalAlpha = (1 - k) * 0.8; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 30 * (1 - k) + 5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; } });
      for (let i = 0; i < 36; i++) { const a = -Math.PI / 2 + rnd(-1.1, 1.1), sp = rnd(150, 420); this._p({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 700, life: rnd(0.3, 0.6), max: 0.6, s: rnd(1.5, 3), color: i % 4 ? '#ffd98a' : (color || '#fff'), shape: 'dot' }); }
      this.shockwave(cx, cy, color || '#ffd98a');
      this.kick();
    },
    // motes flying from a source screen point to a target (dismantle)
    stream(x0, y0, x1, y1, color) {
      this.ensure();
      for (let i = 0; i < 14; i++) { const t = i / 14; this._p({ x: x0, y: y0, vx: (x1 - x0) * 1.4 + rnd(-40, 40), vy: (y1 - y0) * 1.4 + rnd(-40, 40), g: 0, life: 0.5 + t * 0.2, max: 0.7, s: rnd(2, 4), color: color || '#d9a441', shape: 'dot' }); }
      this.kick();
    },
  };

  VFX.overlay = Overlay;
  RS.VFX = VFX;
})();
