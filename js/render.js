/* =========================================================================
 * REALM SIEGE — js/render.js  (VISUAL ASCENSION rewrite)
 * Layered, animated, procedurally-shaded Canvas 2D pipeline. Reads Match state
 * READ-ONLY; drives all new animation/VFX by OBSERVING sim state changes
 * (new towers → placement anim, level jumps → upgrade flash, vanished enemies
 * → death VFX, boss spawns → banner). The simulation is never mutated here.
 *
 * Layer order: terrain(cached) → animated tiles → tile-fx → tower shadows →
 * towers → summons → enemy shadows → enemies → corpses/particles → projectiles
 * → impact VFX(RS.VFX) → auras → weather → night/weather grade → post → boss UI.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const A = RS.art, TAU = Math.PI * 2, TILE = RS.TILE;
  const S = RS.Sprites, VFX = RS.VFX;
  const dist = RS.util.dist, dist2 = RS.util.dist2;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas || document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.hover = null; this.ghost = null; this.selected = null; this.showRange = false;
      this.clock = 0;
      this._enemyPrev = new Map();
      this._towerSeen = new Set();
      this._projSeen = new Set();
      this._visId = 0;
      this.weatherParts = [];
      this.lightning = 0;
      this.bossBanner = null;
      this._terrain = null; this._terrainSig = '';
      this.debug = false;
      this._fps = 60; this._fpsT = 0; this._fpsN = 0;
      this._aimClock = 0;
    }

    /* =========================== VISUALS UPDATE ===================== */
    // Called from the render tick (never the sim step). dt is real seconds.
    updateVisuals(m, dt) {
      if (!m) return;
      this.clock += dt;
      VFX.enabled = RS.Meta && RS.Meta.p ? RS.Meta.p.settings.particles !== false : true;
      this._aimClock -= dt;
      const doAim = this._aimClock <= 0; if (doAim) this._aimClock = 0.1;

      // ---- towers: init vis, placement, upgrade flash, attack, aim ----
      for (const t of m.towers) {
        if (!t.vis) { t.vis = { phase: Math.random() * TAU, atkT: 0, atkDur: 0.34, aim: -0.3, placeT: 0, lastLevel: t.level, lastMuzzle: 0, ascFx: t.ascended }; VFX.dust(t.x, t.y + 10, 10); VFX.ring(t.x, t.y + 8, RS.rarityPal(t.def.rarity).glow, 4, 26, 0.4, 2); }
        const v = t.vis;
        if (v.placeT < 1) v.placeT = Math.min(1, v.placeT + dt / RS.ANIM.placeDrop);
        // upgrade detection
        if (t.level > v.lastLevel) {
          v.lastLevel = t.level;
          const pal = RS.rarityPal(t.def.rarity);
          VFX.rarityBurst(t.def.rarity, t.x, t.y - 4, t.level >= 5);
          VFX.ring(t.x, t.y, pal.glow, 4, 40, 0.5, 3);
          if (t.level >= 5) VFX.column(t.x, t.y + 6, pal.glow);
          v.atkT = 0.1;
        }
        if (t.ascended && !v.ascFx) { v.ascFx = true; VFX.column(t.x, t.y + 6, RS.rarityPal(t.def.rarity).glow); }
        // attack trigger via muzzle rising edge
        if (t.muzzle > v.lastMuzzle + 0.001) v.atkT = v.atkDur;
        v.lastMuzzle = t.muzzle;
        if (v.atkT > 0) v.atkT = Math.max(0, v.atkT - dt);
        // aim toward nearest enemy in range (visual only)
        if (doAim && !t.def.traits.globalAura) {
          const rng = m._effectiveRange(t); let bd = rng * rng, tgt = null;
          for (const e of m.enemies) { if (!e.alive) continue; const d = dist2(t.x, t.y, e.x, e.y); if (d < bd) { bd = d; tgt = e; } }
          if (tgt) v.aim = Math.atan2(tgt.y - t.y, tgt.x - t.x);
        }
      }

      // ---- enemies: assign vis ids, advance gait, facing ----
      const curIds = new Set();
      for (const e of m.enemies) {
        if (!e.alive) continue;
        if (!e.vis) e.vis = { id: ++this._visId, gait: Math.random() * TAU, faceLeft: false, px: e.x, py: e.y, revealFlash: 0, wasRevealed: false, crackDone: false };
        const v = e.vis; curIds.add(v.id);
        const moved = dist(e.x, e.y, v.px, v.py);
        // gait advances with actual movement so slow/frozen enemies slow/stop
        v.gait += (moved / TILE) * RS.ANIM.gaitHzBase * TAU;
        if (Math.abs(e.x - v.px) > 0.2) v.faceLeft = e.x < v.px;
        v.px = e.x; v.py = e.y;
        if (v.revealFlash > 0) v.revealFlash = Math.max(0, v.revealFlash - dt);
        // cold shroud: ambient frost + one-shot shatter when it breaks
        if (e.coldHp > 0 && Math.random() < 0.04) VFX.frost(e.x + (Math.random() - 0.5) * 12, e.y - 6, 1);
        if (e._coldBroke > 0 && !v.crackDone) { v.crackDone = true; VFX.frost(e.x, e.y - 6, 10); VFX.ring(e.x, e.y - 6, '#bfeaf5', 4, 26, 0.4, 2); }
        // boss entrance detection
        if (e.isBoss && !v.entered) { v.entered = true; this._bossEntrance(m, e); }
        this._enemyPrev.set(v.id, { x: e.x, y: e.y, motif: e.def.motif, family: e.def.family, isBoss: e.isBoss });
      }
      // ---- death detection: prev ids gone this frame ----
      for (const [id, info] of this._enemyPrev) {
        if (curIds.has(id)) continue;
        this._enemyPrev.delete(id);
        if (dist(info.x, info.y, m.goalPx.x, m.goalPx.y) < 1.3 * TILE) continue; // leaked, no corpse
        this._enemyDeath(info);
      }

      // ---- projectile trails + impact-on-despawn ----
      const curProj = new Set();
      m.projPool.forEachActive((p) => {
        curProj.add(p);
        const vt = RS.DMG_VFX[p.type];
        if (vt && vt !== 'debris') VFX.trail(vt, p.x, p.y);
        p._lx = p.x; p._ly = p.y; p._lt = p.type;
      });
      for (const p of this._projSeen) { if (!curProj.has(p) && p._lt) VFX.impact(p._lt, p._lx, p._ly, p.splash > 0 ? 1.4 : 1); }
      this._projSeen = curProj;

      // ---- boss banner timer ----
      if (this.bossBanner) { this.bossBanner.t += dt; if (this.bossBanner.t > 3.2) this.bossBanner = null; }

      // ---- weather ----
      this._updateWeather(m, dt);
      if (this.lightning > 0) this.lightning = Math.max(0, this.lightning - dt);

      VFX.update(dt);

      // fps meter
      this._fpsT += dt; this._fpsN++;
      if (this._fpsT >= 0.5) { this._fps = Math.round(this._fpsN / this._fpsT); this._fpsT = 0; this._fpsN = 0; }
    }

    _bossEntrance(m, e) { this.bossBanner = { name: e.def.name, t: 0 }; VFX.ring(e.x, e.y, '#ff5a2a', 8, 90, 0.6, 5); VFX.embers(e.x, e.y, 20, '#ff8a3a'); }

    _enemyDeath(info) {
      const x = info.x, y = info.y;
      switch (info.family) {
        case 'Undead': VFX.shards(x, y, 8, '#d8d2bc'); VFX.dust(x, y, 4); break;
        case 'Demon': VFX.embers(x, y, 10); VFX.smoke(x, y, 4); VFX.ring(x, y, '#ff6a3a', 3, 22, 0.35, 2); break;
        case 'Arcane': VFX.shards(x, y, 10, '#9fd0ff'); break;
        case 'Aerial': VFX.feathers(x, y, 8); break;
        default: VFX.blood(x, y, 6); VFX.dust(x, y, 4);
      }
      if (info.isBoss) { VFX.embers(x, y, 40); VFX.ring(x, y, '#ffcb5a', 8, 140, 0.7, 6); VFX.shards(x, y, 24, '#ffd98a'); }
    }

    /* ============================== DRAW =========================== */
    draw(m) {
      const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
      ctx.save();
      // directional screen shake with decay feel
      if (m.shake > 0) { const s = m.shake; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.7); }
      ctx.imageSmoothingEnabled = true;

      this._terrainLayer(ctx, m);            // cached low-poly terrain + path
      this._animatedTiles(ctx, m);           // grass sway, water, lava, hazard, holy
      this._rangeAndGhost(ctx, m);           // range glow + placement ghost
      // shadows already baked per-entity; draw towers behind enemies, Y-sorted
      this._towers(ctx, m);
      this._summons(ctx, m);
      this._enemies(ctx, m);
      this._matchParticles(ctx, m);          // sim debris
      this._projectiles(ctx, m);
      VFX.draw(ctx);                          // rich impact/death/trail particles
      this._fx(ctx, m);                       // arcs/beams/cones
      this._auras(ctx, m);
      this._weatherDraw(ctx, m);
      this._night(ctx, m, W, H);
      this._floaters(ctx, m);
      this._post(ctx, W, H, m);
      ctx.restore();
      this._bossBannerDraw(ctx, W, H);
      if (this.debug) this._debug(ctx, m);
    }

    /* --------------------------- terrain cache ---------------------- */
    _terrainSignature(m) {
      let h = 2166136261;
      for (let i = 0; i < m.tiles.length; i++) { h ^= m.tiles[i].kind.charCodeAt(0); h = Math.imul(h, 16777619); }
      return (h >>> 0) + '|' + (m.pathShorten | 0) + '|' + m.map.id;
    }
    // Smooth, grid-free terrain: one continuous grass field, soft rounded
    // patches for special terrain, and a flowing rounded path spline. No tile
    // outlines — the board reads as a landscape, not a checkerboard.
    _buildTerrain(m) {
      const cv = document.createElement('canvas'); cv.width = m.cols * TILE; cv.height = m.rows * TILE;
      const c = cv.getContext('2d'); const W = cv.width, H = cv.height;
      const winter = !!m.map.winter;
      // 1) continuous ground field — snow on the Winter map, grass elsewhere
      const gg = c.createLinearGradient(0, 0, 0, H);
      if (winter) { gg.addColorStop(0, '#e9f1f7'); gg.addColorStop(0.55, '#cdd9e6'); gg.addColorStop(1, '#aab8ca'); }
      else { gg.addColorStop(0, RS.RAMP.grass.light); gg.addColorStop(0.55, RS.RAMP.grass.mid); gg.addColorStop(1, RS.RAMP.grass.shadow); }
      c.fillStyle = gg; c.fillRect(0, 0, W, H);
      // scattered deterministic detail across the whole field (no per-tile grid)
      for (let gy = 8; gy < H; gy += 11) for (let gx = 6; gx < W; gx += 13) {
        const s = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
        const jx = gx + (s & 7) - 3, jy = gy + ((s >> 3) & 7) - 3;
        if (winter) { c.fillStyle = (s & 1) ? A.alpha('#ffffff', 0.6) : A.alpha('#9fb0c4', 0.5); c.beginPath(); c.arc(jx, jy, 1 + (s & 1), 0, TAU); c.fill(); }
        else { c.fillStyle = (s & 1) ? RS.RAMP.grass.shadow : A.alpha(RS.RAMP.grass.light, 0.5); c.fillRect(jx, jy, 1, 2 + (s & 1)); }
      }
      // 2) special terrain as soft, slightly-overlapping rounded blobs (merge)
      // Two-pass patch so neighbouring tiles of a kind merge into one smooth
      // blob: first a big overlapping base (mid), then a soft inner highlight.
      const patch = (k, ramp, raised) => {
        const cells = [];
        for (let r = 0; r < m.rows; r++) for (let col = 0; col < m.cols; col++) if (m.tileKind(col, r) === k) cells.push([col * TILE, r * TILE]);
        if (!cells.length) return;
        if (raised) { c.fillStyle = 'rgba(0,0,0,0.30)'; for (const [x, y] of cells) { this._roundRect(c, x - 6, y + 2, TILE + 12, TILE + 10, 16); c.fill(); } }
        c.fillStyle = ramp.mid; for (const [x, y] of cells) { this._roundRect(c, x - 7, y - 7, TILE + 14, TILE + 14, 16); c.fill(); }
        c.fillStyle = raised ? ramp.light : A.alpha(ramp.light, 0.55); for (const [x, y] of cells) { this._roundRect(c, x - 1, y - 1, TILE + 2, TILE - (raised ? 6 : 2), 12); c.fill(); }
      };
      patch('water', RS.RAMP.water); patch('unbuildable', RS.RAMP.stoneDark);
      patch('highground', RS.RAMP.stone, true); patch('holy', RS.RAMP.holy);
      patch('cursed', RS.RAMP.void); patch('hazard', RS.RAMP.lava);
      // 3) flowing path splines
      for (const p of m.paths) this._smoothPath(c, p.pts);
      // 4) ruined houses (Winter map) — the only buildable tiles; static shell
      for (let r = 0; r < m.rows; r++) for (let col = 0; col < m.cols; col++) if (m.tileKind(col, r) === 'house') this._drawHouseShell(c, col * TILE, r * TILE, col, r);
      this._terrain = cv;
    }
    // Static ruined-house shell baked into the terrain cache (fire drawn live).
    _drawHouseShell(c, x, y, col, r) {
      const s = ((col * 73856093) ^ (r * 19349663)) >>> 0;
      // snow-cleared warm dirt floor
      c.fillStyle = '#3a2c22'; this._roundRect(c, x + 3, y + 6, TILE - 6, TILE - 9, 6); c.fill();
      c.fillStyle = '#2a1f18'; this._roundRect(c, x + 7, y + 10, TILE - 14, TILE - 15, 4); c.fill();
      // broken timber walls (a few planks, snow-capped)
      c.strokeStyle = RS.RAMP.timber.shadow; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x + 5, y + TILE - 5); c.lineTo(x + 5, y + 8); c.lineTo(x + 16, y + 3); c.stroke();
      c.beginPath(); c.moveTo(x + TILE - 5, y + TILE - 5); c.lineTo(x + TILE - 5, y + 10); c.stroke();
      c.strokeStyle = RS.RAMP.timber.mid; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + 5, y + 12 + (s & 3)); c.lineTo(x + TILE - 8, y + 9); c.stroke();
      // snow caps on the beams
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + 5, y + 7); c.lineTo(x + 16, y + 2); c.stroke();
    }
    _roundRect(c, x, y, w, h, r) {
      if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
      r = Math.min(r, w / 2, h / 2); c.beginPath();
      c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }
    _smoothPath(c, pts) {
      if (pts.length < 2) return;
      // Trace the EXACT waypoint centreline (the line enemies actually walk).
      // Round joins/caps round the corners visually without moving the centre,
      // so the road always sits under the enemies. (Fixes corner desync.)
      const trace = () => { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); };
      c.lineJoin = 'round'; c.lineCap = 'round';
      // soft cast shadow
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = TILE * 0.92; trace(); c.stroke();
      // road edge (dark rim)
      c.strokeStyle = RS.RAMP.road.shadow; c.lineWidth = TILE * 0.86; trace(); c.stroke();
      // road surface
      c.strokeStyle = RS.RAMP.road.mid; c.lineWidth = TILE * 0.64; trace(); c.stroke();
      // subtle worn center highlight
      c.strokeStyle = A.alpha(RS.RAMP.road.light, 0.35); c.lineWidth = TILE * 0.22; trace(); c.stroke();
    }
    _terrainLayer(ctx, m) {
      const sig = this._terrainSignature(m);
      if (sig !== this._terrainSig) { this._buildTerrain(m); this._terrainSig = sig; }
      ctx.drawImage(this._terrain, 0, 0);
      // spawn/goal markers (animated, so not cached)
      for (const p of m.paths) { ctx.fillStyle = A.alpha('#a02c2c', 0.9); this._diamond(ctx, p.spawn.x, p.spawn.y, 7); }
      const gp = 0.5 + Math.sin(this.clock * 3) * 0.2;
      ctx.fillStyle = A.alpha('#d9a441', gp + 0.4); this._diamond(ctx, m.goalPx.x, m.goalPx.y, 10);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; this._diamond(ctx, m.goalPx.x, m.goalPx.y, 10, true);
    }
    _diamond(ctx, x, y, s, stroke) { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); stroke ? ctx.stroke() : ctx.fill(); }

    /* -------------------------- animated tiles ---------------------- */
    _animatedTiles(ctx, m) {
      const t = this.clock;
      const wind = m.weather === 'Storm' ? 3 : 1;
      for (let r = 0; r < m.rows; r++) for (let col = 0; col < m.cols; col++) {
        const k = m.tileKind(col, r); if (k === 'buildable' || k === 'path' || k === 'unbuildable') continue;
        const x = col * TILE, y = r * TILE, cx = x + TILE / 2, cy = y + TILE / 2;
        if (k === 'water') {
          ctx.strokeStyle = A.alpha('#bfe6f5', 0.35 + Math.sin(t * 2 + col) * 0.15); ctx.lineWidth = 1;
          for (let i = 0; i < 2; i++) { const yy = y + 12 + i * 16 + Math.sin(t * 2 + col + i) * 2; ctx.beginPath(); ctx.moveTo(x + 4, yy); ctx.lineTo(x + TILE - 4, yy); ctx.stroke(); }
        } else if (k === 'hazard') {
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 20); const p = 0.4 + Math.sin(t * 4 + col) * 0.2; g.addColorStop(0, A.alpha('#ff6a2a', p)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, TILE, TILE);
          if (Math.random() < 0.2) VFX.embers(cx + (Math.random() - 0.5) * 20, cy, 1);
        } else if (k === 'holy') {
          const g = ctx.createRadialGradient(cx, cy - 4, 1, cx, cy, 18); g.addColorStop(0, A.alpha('#fff2b0', 0.3 + Math.sin(t * 2 + r) * 0.12)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, TILE, TILE);
        } else if (k === 'cursed') {
          ctx.fillStyle = A.alpha('#7b4fb5', 0.12 + Math.sin(t * 1.5 + col) * 0.06); ctx.fillRect(x, y, TILE, TILE);
          if (Math.random() < 0.1) VFX.smoke(cx, cy, 1, '#7b4fb5');
        } else if (k === 'highground') {
          ctx.fillStyle = A.alpha('#fff', 0.05); ctx.fillRect(x + 4, y + 4, TILE - 8, 3);
        } else if (k === 'house') {
          // warm campfire light pooling out of the ruined house
          const fl = 0.7 + Math.sin(t * 7 + col) * 0.25;
          const g = ctx.createRadialGradient(cx, cy + 4, 1, cx, cy + 4, 26); g.addColorStop(0, A.alpha('#ffb457', 0.5 * fl)); g.addColorStop(0.6, A.alpha('#ff7a2a', 0.2 * fl)); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - 8, y - 8, TILE + 16, TILE + 16); ctx.restore();
          // the fire itself (logs + flame) — only when no tower occupies the tile
          const occupied = m._tile(col, r) && m._tile(col, r).occupied;
          if (!occupied) {
            ctx.fillStyle = '#3a2018'; ctx.fillRect(cx - 6, cy + 6, 12, 3);
            const fh = 7 + Math.sin(t * 12 + col) * 2.5;
            ctx.fillStyle = '#e8722c'; ctx.beginPath(); ctx.moveTo(cx - 5, cy + 6); ctx.quadraticCurveTo(cx, cy + 6 - fh - 4, cx + 5, cy + 6); ctx.fill();
            ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.moveTo(cx - 2.5, cy + 6); ctx.quadraticCurveTo(cx, cy + 6 - fh, cx + 2.5, cy + 6); ctx.fill();
            if (Math.random() < 0.3) VFX.embers(cx + (Math.random() - 0.5) * 8, cy + 2, 1, '#ffb457');
          }
        }
      }
    }

    /* ------------------------- range + ghost ------------------------ */
    _rangeAndGhost(ctx, m) {
      const sel = this.selected;
      if (sel && !sel.def.traits.globalAura) this._rangeRing(ctx, sel.x, sel.y, m._effectiveRange(sel), RS.rarityPal(sel.def.rarity).glow, 0.5);
      // reveal-radius overlay for a selected Reveal tower (Torch / Scout / Cleric)
      if (sel && sel.def.traits.reveal) this._revealRing(ctx, sel.x, sel.y, sel.def.traits.reveal * TILE);
      if (this.showRange && !sel) for (const t of m.towers) if (!t.def.traits.globalAura) this._rangeRing(ctx, t.x, t.y, m._effectiveRange(t), '#ffffff', 0.12);
      if (this.ghost && this.hover) {
        const def = this.ghost, { c, r } = this.hover, chk = m.canPlace(def, c, r);
        const fp = def.traits.footprint || 1;
        // Winter: warm "safe from cold" aura when the ghost sits on a house
        if (chk.ok && m.map.houseOnly) { const cx0 = c * TILE + fp * TILE / 2, cy0 = r * TILE + fp * TILE / 2; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx0, cy0, 2, cx0, cy0, 30); g.addColorStop(0, 'rgba(255,170,80,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx0, cy0, 30, 0, TAU); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = chk.ok ? 'rgba(95,168,85,0.28)' : 'rgba(224,75,43,0.28)'; ctx.fillRect(c * TILE, r * TILE, TILE * fp, TILE * fp);
        const cx = c * TILE + fp * TILE / 2, cy = r * TILE + fp * TILE / 2;
        if (!def.traits.globalAura) this._rangeRing(ctx, cx, cy, def.rangeT * TILE, chk.ok ? '#5fa855' : '#e04b4b', 0.4);
        if (def.traits.reveal) this._revealRing(ctx, cx, cy, def.traits.reveal * TILE);
        ctx.save(); ctx.globalAlpha = 0.7; S.drawTower(ctx, def, cx, cy, { t: this.clock, aim: -0.3 }); ctx.restore();
        if (!chk.ok) { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(chk.reason, cx, cy - fp * TILE / 2 - 6); ctx.textAlign = 'left'; }
      }
    }
    _revealRing(ctx, x, y, r) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,200,255,0.10)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.setLineDash([2, 6]); ctx.lineDashOffset = this.clock * 16; ctx.strokeStyle = 'rgba(150,210,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(150,210,255,0.7)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('👁 reveal', x, y - r - 3); ctx.textAlign = 'left';
      ctx.restore();
    }
    _rangeRing(ctx, x, y, r, color, str) {
      ctx.save();
      const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, A.alpha(color, str * 0.4)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.setLineDash([6, 6]); ctx.lineDashOffset = -this.clock * 20 * RS.ANIM.runeRotate * 4; ctx.strokeStyle = A.alpha(color, str + 0.25); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    /* ------------------------------ towers -------------------------- */
    _towers(ctx, m) {
      const list = m.towers.slice().sort((a, b) => a.y - b.y);
      for (const t of list) {
        const v = t.vis || { phase: 0, atkT: 0, atkDur: 0.34, aim: -0.3, placeT: 1 };
        const atk = v.atkDur > 0 ? (v.atkT > 0 ? 1 - v.atkT / v.atkDur : 0) : 0;
        const dim = (t.charmT > 0 || t.disabledT > 0 || t.overheatT > 0);
        ctx.save(); if (dim) ctx.globalAlpha = 0.6;
        S.drawTower(ctx, t.def, t.x, t.y, { t: this.clock + v.phase, atk, aim: v.aim, ascended: t.ascended, place: v.placeT });
        ctx.restore();
        // status rings
        if (t.charmT > 0) { ctx.strokeStyle = '#e04bcf'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(t.x, t.y, 16, 0, TAU); ctx.stroke(); }
        if (t.disabledT > 0 || t.overheatT > 0) { ctx.strokeStyle = A.alpha('#e04b4b', 0.7 + Math.sin(this.clock * 8) * 0.3); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(t.x, t.y, 16, 0, TAU); ctx.stroke(); }
        // blocker hp bar
        if (t.blocker) { const b = t.blocker, w = 24; ctx.fillStyle = '#000'; ctx.fillRect(t.x - w / 2, t.y - 20, w, 3); ctx.fillStyle = b.respawnT > 0 ? '#555' : RS.PALETTE.good; ctx.fillRect(t.x - w / 2, t.y - 20, w * (b.respawnT > 0 ? 0 : b.hp / b.maxHp), 3); }
        // level pips
        for (let i = 0; i < t.level; i++) { ctx.fillStyle = RS.rarityPal(t.def.rarity).base; ctx.fillRect(t.x - 11 + i * 5, t.y + 15, 3, 3); }
      }
    }

    _summons(ctx, m) {
      for (const s of m.summons) {
        if (s.kind === 'falcon') { ctx.save(); ctx.translate(s.x, s.y); const f = Math.sin(this.clock * 18) * 3; S.facet(ctx, [[-7, 0], [0, 3], [7, 0], [0, -3 - f]], '#d9cba0', '#fff'); ctx.restore(); }
        else if (s.kind === 'wraith') { ctx.globalAlpha = 0.8; S.circ(ctx, s.x, s.y, 6, A.alpha('#7d5fa0', 0.9), '#9fe0b8'); S.circ(ctx, s.x - 1.5, s.y - 1, 1, '#7bff9f'); S.circ(ctx, s.x + 1.5, s.y - 1, 1, '#7bff9f'); ctx.globalAlpha = 1; }
        else if (s.kind === 'turret') { S.facet(ctx, [[s.x - 6, s.y + 6], [s.x - 6, s.y - 4], [s.x + 6, s.y - 4], [s.x + 6, s.y + 6]], RS.RAMP.iron.mid, RS.RAMP.iron.rim); ctx.save(); ctx.translate(s.x, s.y - 3); ctx.rotate(this.clock); ctx.fillStyle = RS.RAMP.iron.light; ctx.fillRect(-2, -8, 4, 8); ctx.restore(); }
      }
    }

    /* ------------------------------ enemies ------------------------- */
    _enemies(ctx, m) {
      const arr = m.enemies.slice().sort((a, b) => a.y - b.y);
      for (const e of arr) {
        if (!e.alive) continue;
        // Stealth foes ride a faint ghost path until a Reveal tower exposes them.
        const stealth = e.def.traits.includes('Stealth');
        let alpha = 1;
        if (stealth) {
          const revealed = this._enemyRevealed(m, e);
          if (e.vis) { if (revealed && !e.vis.wasRevealed) { e.vis.revealFlash = 0.4; VFX.ring(e.x, e.y, '#9fd0ff', 4, 30, 0.4, 2); } e.vis.wasRevealed = revealed; }
          alpha = revealed ? 1 : 0.28 + Math.sin(this.clock * 5 + (e.vis ? e.vis.id : 0)) * 0.06;
          if (!revealed) { // shimmer distortion trail
            ctx.save(); ctx.globalAlpha = 0.15; ctx.strokeStyle = '#9fd0ff'; ctx.setLineDash([3, 5]); ctx.beginPath(); const p = m.paths[e.lane]; ctx.moveTo(e.x, e.y); ctx.lineTo(p.goal.x, p.goal.y); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
        }
        ctx.save(); ctx.globalAlpha = alpha;
        if (e.isBoss) this._drawBoss(ctx, e); else S.drawEnemy(ctx, e, this.clock);
        if (e.vis && e.vis.revealFlash > 0) { ctx.globalAlpha = e.vis.revealFlash; VFX.enabled && S.circ(ctx, e.x, e.y - 8, 10, A.alpha('#dff0ff', 0.6)); }
        ctx.restore();
        this._bars(ctx, e, m);
      }
    }
    _enemyRevealed(m, e) {
      for (const t of m.towers) { const rv = t.def.traits.reveal; if (rv && dist2(t.x, t.y, e.x, e.y) < (rv * TILE) ** 2) return true; }
      return false;
    }
    // Stacked bars above an enemy: Cold (Winter only) → Metal (Shielded) → HP.
    _bars(ctx, e, m) {
      const w = e.isBoss ? 46 : 16, h = e.isBoss ? 4 : 3;
      let by = e.y - (e.isBoss ? 34 : (RS.Sprites.getSheet(e.def.motif).size * 0.5 + 4));
      const bar = (frac, col, extra) => {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, by, w, h);
        ctx.fillStyle = col; ctx.fillRect(e.x - w / 2, by, w * Math.max(0, Math.min(1, frac)), h);
        if (extra) extra(by);
        by -= h + 1.5;
      };
      // HP (drawn first = bottom)
      const hp = Math.max(0, e.hp / e.maxHp);
      bar(hp, hp > 0.5 ? RS.PALETTE.good : hp > 0.25 ? RS.PALETTE.warn : RS.PALETTE.bad);
      // Metal armour bar (Shielded foes — blocks physical until broken)
      if (e.shieldHits > 0 && e.def.abilities.shieldHits) {
        bar(e.shieldHits / e.def.abilities.shieldHits, '#c6ccd4', (y) => {
          // moving metallic shine
          const sx = e.x - w / 2 + ((this.clock * 30) % w);
          ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(sx, y, 2, h);
        });
      }
      // Cold shroud bar (Winter map only — melt with Fire/Holy)
      if (e.coldMax > 0 && e.coldHp > 0) {
        bar(e.coldHp / e.coldMax, '#8fd4e8', (y) => { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(e.x - w / 2 + 0.5, y + 0.5, w - 1, h - 1); });
      }
    }
    _drawBoss(ctx, e) {
      // bosses drawn live at big scale with ambient embers
      const t = this.clock; const scale = 2.3;
      if (Math.random() < 0.25) VFX.embers(e.x + (Math.random() - 0.5) * 30, e.y, 1, '#ff8a3a');
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 12, 26, 9, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(e.x, e.y + Math.sin(t * 1.2) * 2); ctx.scale(scale, scale);
      const flash = e.flashT > 0;
      S.drawBody(ctx, 'demon', t % TAU, false);
      // crown of horns + glow eyes extra
      S.facet(ctx, [[-6, -14], [-2, -20], [0, -14]], RS.RAMP.void.shadow); S.facet(ctx, [[6, -14], [2, -20], [0, -14]], RS.RAMP.void.shadow);
      if (flash) { ctx.globalAlpha = 0.8; S.drawBody(ctx, 'demon', t % TAU, true); ctx.globalAlpha = 1; }
      ctx.restore();
    }

    /* ---------------------- sim particles / proj -------------------- */
    _matchParticles(ctx, m) {
      m.particlePool.forEachActive((p) => { ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.8; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.r, p.r); });
      ctx.globalAlpha = 1;
    }
    _projectiles(ctx, m) {
      m.projPool.forEachActive((p) => {
        const col = RS.DMG_COLOR[p.type] || p.color || '#fff';
        // trail streak toward previous direction
        if (p.target) { const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy) || 1; ctx.strokeStyle = A.alpha(col, 0.6); ctx.lineWidth = p.splash > 0 ? 3 : 1.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - dx / d * 10, p.y - dy / d * 10); ctx.stroke(); }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; S.circ(ctx, p.x, p.y, p.splash > 0 ? 4 : 2.5, col); ctx.restore();
      });
    }
    _fx(ctx, m) {
      if (!m._fx) return; ctx.save();
      for (const f of m._fx) {
        const a = Math.max(0, f.t / 0.16); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = f.color; ctx.lineWidth = f.kind === 'beam' ? 3 : 2;
        if (f.kind === 'arc') { ctx.beginPath(); ctx.moveTo(f.x1, f.y1); const mx = (f.x1 + f.x2) / 2 + (Math.random() - 0.5) * 14, my = (f.y1 + f.y2) / 2 + (Math.random() - 0.5) * 14; ctx.lineTo(mx, my); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
        else if (f.kind === 'beam') { ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
        else if (f.kind === 'cone') { ctx.fillStyle = A.alpha(f.color, 0.4); ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.reach, f.ang - f.half, f.ang + f.half); ctx.closePath(); ctx.fill(); }
      }
      ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    /* ------------------------------ auras --------------------------- */
    _auras(ctx, m) {
      const t = this.clock;
      for (const src of m.towers) {
        const tr = src.def.traits; let radius = 0, color = null;
        if (tr.support) { radius = (tr.support.radiusT + ((src._mods && src._mods.auraRadiusT) || 0)) * TILE; color = tr.support.attackSpeedAura ? '#8fd4e8' : (tr.support.healBlockers ? '#7bd070' : '#8fd4e8'); }
        else if (tr.aura) { radius = (tr.aura.radiusT + ((src._mods && src._mods.auraRadiusT) || 0)) * TILE; color = '#ffcb5a'; }
        else if (tr.slowField) { radius = tr.slowField.radiusT * TILE; color = '#8fd4e8'; }
        if (!radius) continue;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.06 + Math.sin(t * 2 + src.x) * 0.03;
        const g = ctx.createRadialGradient(src.x, src.y, radius * 0.3, src.x, src.y, radius); g.addColorStop(0, A.alpha(color, pulse)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(src.x, src.y, radius, 0, TAU); ctx.fill();
        // rotating rune ring
        ctx.strokeStyle = A.alpha(color, 0.25); ctx.lineWidth = 1; ctx.setLineDash([4, 8]); ctx.lineDashOffset = t * 12; ctx.beginPath(); ctx.arc(src.x, src.y, radius * 0.9, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
      }
      // global aura towers: full-field tint pulse
      for (const src of m.towers) { const g = src.def.traits.globalAura; if (!g) continue; const col = g.invuln ? '#fff2b0' : (g.dmgToGold ? '#8fd4e8' : '#ffcb5a'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.04 + Math.sin(t * 1.5) * 0.02; ctx.fillStyle = col; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); ctx.restore(); }
    }

    /* ------------------------------ weather ------------------------- */
    _updateWeather(m, dt) {
      const w = m.weather; const cap = 240;
      const spawn = (n, fn) => { for (let i = 0; i < n && this.weatherParts.length < cap; i++) this.weatherParts.push(fn()); };
      const W = this.canvas.width, H = this.canvas.height;
      if (w === 'Rain') spawn(6, () => ({ type: 'rain', x: Math.random() * W, y: -10, vx: -60, vy: 700, life: 1 }));
      else if (w === 'Blizzard') spawn(8, () => ({ type: 'snow', x: Math.random() * W, y: -10, vx: -120 + Math.random() * 40, vy: 200 + Math.random() * 120, life: 3, s: 1 + Math.random() * 2 }));
      else if (w === 'Ashfall') { spawn(3, () => ({ type: 'ash', x: Math.random() * W, y: -10, vx: -10, vy: 60 + Math.random() * 40, life: 4, s: 1 + Math.random() * 2 })); spawn(1, () => ({ type: 'ember', x: Math.random() * W, y: H + 5, vx: 0, vy: -40 - Math.random() * 30, life: 3 })); }
      else if (w === 'Fog') { if (this.weatherParts.length < 40) spawn(1, () => ({ type: 'fog', x: Math.random() * W, y: Math.random() * H, vx: 12, vy: 0, life: 6, s: 40 + Math.random() * 40 })); }
      else if (w === 'Storm') { spawn(5, () => ({ type: 'rain', x: Math.random() * W, y: -10, vx: -140, vy: 800, life: 1 })); if (Math.random() < 0.01) this.lightning = 0.12; }
      for (const p of this.weatherParts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.type === 'snow') p.x += Math.sin(this.clock * 2 + p.y) * 0.5; }
      this.weatherParts = this.weatherParts.filter((p) => p.life > 0 && p.y < H + 20 && p.x > -60);
    }
    _weatherDraw(ctx, m) {
      ctx.save();
      for (const p of this.weatherParts) {
        if (p.type === 'rain') { ctx.strokeStyle = 'rgba(150,180,220,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3, p.y - 12); ctx.stroke(); }
        else if (p.type === 'snow') { ctx.fillStyle = 'rgba(240,250,255,0.8)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); }
        else if (p.type === 'ash') { ctx.fillStyle = 'rgba(120,110,100,0.6)'; ctx.fillRect(p.x, p.y, p.s, p.s); }
        else if (p.type === 'ember') { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = A.alpha('#ff8a3a', Math.min(1, p.life)); ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
        else if (p.type === 'fog') { ctx.fillStyle = A.alpha('#c8c8c8', 0.05 * Math.min(1, p.life)); ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }

    /* --------------------------- night / grade ---------------------- */
    _night(ctx, m, W, H) {
      if (m.isNight) {
        const k = m.dayT > 0.5 ? (m.dayT - 0.5) * 2 : 0; const dark = 0.15 + Math.sin(k * Math.PI) * 0.25;
        ctx.fillStyle = A.alpha('#101838', dark); ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const t of m.towers) { const lt = t.def.traits.light; if (!lt) continue; const R = lt * TILE; const g = ctx.createRadialGradient(t.x, t.y, 3, t.x, t.y, R); g.addColorStop(0, 'rgba(255,220,150,0.35)'); g.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, TAU); ctx.fill(); }
        const gg = ctx.createRadialGradient(m.goalPx.x, m.goalPx.y, 3, m.goalPx.x, m.goalPx.y, 60); gg.addColorStop(0, 'rgba(217,164,65,0.3)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(m.goalPx.x, m.goalPx.y, 60, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // weather grade
      const grade = { Rain: 'rgba(60,90,140,0.10)', Fog: 'rgba(200,200,200,0.12)', Blizzard: 'rgba(180,220,240,0.14)', Ashfall: 'rgba(120,60,30,0.12)', Storm: 'rgba(30,30,60,0.14)' }[m.weather];
      if (grade) { ctx.fillStyle = grade; ctx.fillRect(0, 0, W, H); }
      if (this.lightning > 0) { ctx.fillStyle = A.alpha('#eaf0ff', this.lightning * 3); ctx.fillRect(0, 0, W, H); }
    }
    _post(ctx, W, H, m) {
      // Winter frost overlay: cold blue cast + icy corners
      if (m.map.winter) {
        ctx.fillStyle = 'rgba(120,180,220,0.12)'; ctx.fillRect(0, 0, W, H);
        const fg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(180,215,240,0.18)'); ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
      }
      // vignette
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (m.freeze > 0) { ctx.fillStyle = A.alpha('#ffffff', m.freeze * 0.15); ctx.fillRect(0, 0, W, H); }
    }

    _floaters(ctx, m) {
      ctx.textAlign = 'center';
      for (const f of m.floaters) {
        if (f.kind === 'puddle') { ctx.fillStyle = A.alpha('#7d5fa0', 0.2 + Math.sin(this.clock * 5) * 0.1); ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); continue; }
        if (f.kind !== 'text') continue;
        ctx.globalAlpha = Math.max(0, f.t / 0.9);
        const big = f.big; ctx.font = (big ? 'bold 18px' : 'bold 12px') + ' sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(f.text, f.x + 1, f.y + 1);
        ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }

    _bossBannerDraw(ctx, W, H) {
      if (!this.bossBanner) return; const b = this.bossBanner;
      const drop = RS.EASE.easeOutBack(RS.art.clamp(b.t / RS.ANIM.bannerDrop, 0, 1));
      const out = b.t > 2.4 ? (b.t - 2.4) / 0.8 : 0;
      const y = -50 + drop * 60 - out * 60;
      ctx.save(); ctx.globalAlpha = 1 - out;
      ctx.fillStyle = 'rgba(20,10,10,0.9)'; ctx.fillRect(W / 2 - 200, y, 400, 44);
      ctx.strokeStyle = '#a02c2c'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 200, y, 400, 44);
      ctx.fillStyle = '#d9a441'; ctx.font = 'bold 12px serif'; ctx.textAlign = 'center'; ctx.fillText('⚔ BOSS APPROACHES ⚔', W / 2, y + 16);
      ctx.fillStyle = '#e8dcc0'; ctx.font = 'bold 18px serif'; ctx.fillText(b.name, W / 2, y + 36);
      ctx.textAlign = 'left'; ctx.restore();
    }

    _debug(ctx, m) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(4, 4, 150, 34); ctx.fillStyle = '#5fa855'; ctx.font = '11px monospace'; ctx.fillText('FPS ' + this._fps + '  particles ' + VFX.count(), 10, 18); ctx.fillText('enemies ' + m.enemies.length + '  towers ' + m.towers.length, 10, 30); }

    // Back-compat glyph used by UI cards/collection/tray.
    _towerGlyph(ctx, t, x, y, rc, flash) { S.drawTowerIcon(ctx, t.def, x, y, 34); }
  }

  RS.Renderer = Renderer;
})();
