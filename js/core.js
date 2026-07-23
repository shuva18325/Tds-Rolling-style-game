/* =========================================================================
 * REALM SIEGE — core.js
 * Namespace bootstrap, math, deterministic RNG, object pool, uniform grid,
 * save/load. Loaded first; everything hangs off the global RS namespace.
 * Written as a classic script (no ESM import/export) so the game runs from a
 * plain file:// open with zero build step and zero server. See DESIGN_DECISIONS.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});

  /* ----------------------------- math helpers --------------------------- */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
  const now = () => performance.now();
  const TAU = Math.PI * 2;

  /* -------------------------- deterministic RNG ------------------------- */
  // mulberry32 — small, fast, seedable. Used for waves so previews match spawns.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  class RNG {
    constructor(seed) { this.seed = seed >>> 0; this.r = mulberry32(this.seed); }
    next() { return this.r(); }
    range(lo, hi) { return lo + this.r() * (hi - lo); }
    int(lo, hi) { return Math.floor(this.range(lo, hi + 1)); }
    pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
    // Weighted pick: entries = [{w, ...}] returns the chosen entry.
    weighted(entries, weightKey = 'w') {
      let total = 0;
      for (const e of entries) total += e[weightKey];
      let roll = this.r() * total;
      for (const e of entries) { roll -= e[weightKey]; if (roll <= 0) return e; }
      return entries[entries.length - 1];
    }
  }
  // Non-deterministic global roll RNG (gacha uses Math.random for true surprise).
  const frand = () => Math.random();

  /* ------------------------------ object pool --------------------------- */
  // Reuses instances to avoid GC churn on projectiles/particles. Objects expose
  // an `active` flag; alloc() revives a dead one or grows the pool.
  class Pool {
    constructor(factory, reset, initial = 64) {
      this.factory = factory;
      this.reset = reset;
      this.items = [];
      this.free = [];
      for (let i = 0; i < initial; i++) {
        const o = factory();
        o.active = false;
        this.items.push(o);
        this.free.push(o);
      }
    }
    alloc() {
      let o = this.free.pop();
      if (!o) { o = this.factory(); this.items.push(o); }
      o.active = true;
      return o;
    }
    release(o) {
      if (!o.active) return;
      o.active = false;
      this.reset(o);
      this.free.push(o);
    }
    forEachActive(fn) {
      const it = this.items;
      for (let i = 0; i < it.length; i++) if (it[i].active) fn(it[i], i);
    }
    releaseAll() {
      const it = this.items;
      for (let i = 0; i < it.length; i++) if (it[i].active) this.release(it[i]);
    }
    countActive() {
      let c = 0; const it = this.items;
      for (let i = 0; i < it.length; i++) if (it[i].active) c++;
      return c;
    }
  }

  /* --------------------- uniform spatial grid (targeting) --------------- */
  // Bucketed grid over world space for O(1)-ish range queries instead of O(n)
  // per tower. Rebuilt each logic tick from the live enemy list.
  class SpatialGrid {
    constructor(width, height, cell = 96) {
      this.cell = cell;
      this.cols = Math.max(1, Math.ceil(width / cell));
      this.rows = Math.max(1, Math.ceil(height / cell));
      this.buckets = new Array(this.cols * this.rows);
      for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
    }
    clear() { for (let i = 0; i < this.buckets.length; i++) this.buckets[i].length = 0; }
    _idx(cx, cy) { return cy * this.cols + cx; }
    insert(obj) {
      const cx = clamp((obj.x / this.cell) | 0, 0, this.cols - 1);
      const cy = clamp((obj.y / this.cell) | 0, 0, this.rows - 1);
      this.buckets[this._idx(cx, cy)].push(obj);
    }
    // Collect candidates within `radius` of (x,y); may include a few extras
    // outside radius (caller does the precise distance test).
    query(x, y, radius, out) {
      out.length = 0;
      const r = radius + this.cell;
      const minx = clamp(((x - r) / this.cell) | 0, 0, this.cols - 1);
      const maxx = clamp(((x + r) / this.cell) | 0, 0, this.cols - 1);
      const miny = clamp(((y - r) / this.cell) | 0, 0, this.rows - 1);
      const maxy = clamp(((y + r) / this.cell) | 0, 0, this.rows - 1);
      for (let cy = miny; cy <= maxy; cy++)
        for (let cx = minx; cx <= maxx; cx++) {
          const b = this.buckets[this._idx(cx, cy)];
          for (let i = 0; i < b.length; i++) out.push(b[i]);
        }
      return out;
    }
  }

  /* ------------------------------ save/load ----------------------------- */
  const SAVE_KEY = 'realm_siege_save_v1';
  const Save = {
    write(state) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
      catch (e) { console.warn('save failed', e); return false; }
    },
    read() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { console.warn('load failed', e); return null; }
    },
    clear() { localStorage.removeItem(SAVE_KEY); },
    export(state) { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); },
    import(str) {
      try { return JSON.parse(decodeURIComponent(escape(atob(str.trim())))); }
      catch (e) {
        try { return JSON.parse(str); } catch (e2) { return null; }
      }
    },
  };

  /* -------------------------------- events ------------------------------ */
  // Minimal pub/sub for decoupling systems (economy -> hud, roll -> collection).
  class Emitter {
    constructor() { this.map = {}; }
    on(ev, fn) { (this.map[ev] = this.map[ev] || []).push(fn); return this; }
    off(ev, fn) { if (this.map[ev]) this.map[ev] = this.map[ev].filter((f) => f !== fn); }
    emit(ev, data) { if (this.map[ev]) for (const f of this.map[ev]) f(data); }
  }

  /* --------------------------- number formatting ------------------------ */
  function fmt(n) {
    n = Math.round(n);
    if (n < 1000) return '' + n;
    if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'K';
    if (n < 1e9) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  }

  RS.util = { clamp, lerp, dist, dist2, now, TAU, frand, fmt };
  RS.RNG = RNG;
  RS.Pool = Pool;
  RS.SpatialGrid = SpatialGrid;
  RS.Save = Save;
  RS.Emitter = Emitter;
  RS.bus = new Emitter();
})();
