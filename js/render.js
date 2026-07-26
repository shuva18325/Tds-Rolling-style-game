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
        if (!t.vis) { t.vis = { phase: Math.random() * TAU, atkT: 0, atkDur: 0.34, aim: -0.3, placeT: 0, lastLevel: t.level, lastMuzzle: 0, ascFx: t.ascended }; VFX.dust(t.x, t.y + 10, 10); VFX.ring(t.x, t.y + 8, RS.rarityPal(t.def.rarity).glow, 4, 26, 0.4, 2); RS.Audio && RS.Audio.place(); }
        const v = t.vis;
        if (v.placeT < 1) v.placeT = Math.min(1, v.placeT + dt / RS.ANIM.placeDrop);
        // upgrade detection
        if (t.level > v.lastLevel) {
          v.lastLevel = t.level;
          const pal = RS.rarityPal(t.def.rarity);
          VFX.rarityBurst(t.def.rarity, t.x, t.y - 4, t.level >= 5);
          VFX.ring(t.x, t.y, pal.glow, 4, 40, 0.5, 3);
          if (t.level >= 5) { VFX.column(t.x, t.y + 6, pal.glow); RS.Audio && RS.Audio.ascend(); } else RS.Audio && RS.Audio.upgrade();
          v.atkT = 0.1;
        }
        if (t.ascended && !v.ascFx) { v.ascFx = true; VFX.column(t.x, t.y + 6, RS.rarityPal(t.def.rarity).glow); }
        // attack trigger via muzzle rising edge (+ sound: heavy cannons boom)
        if (t.muzzle > v.lastMuzzle + 0.001) {
          v.atkT = v.atkDur;
          if (RS.Audio) { if (t.def.traits.meleeSlash) RS.Audio.slash(); else if (t.def.traits.heavyReload) RS.Audio.greatCannon(); else if (t.splash > TILE) RS.Audio.boom(); else RS.Audio.shoot(t.def.damageType); }
          if (t.def.traits.heavyReload) { m.shake = Math.max(m.shake, 10); VFX.smoke(t.x, t.y - 4, 12, '#8a8578'); VFX.embers(t.x + Math.cos(v.aim) * 20, t.y - 6 + Math.sin(v.aim) * 20, 8, '#ffb457'); }
        }
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
        // metal shield block → clang + sparks
        if (v.lastShield == null) v.lastShield = e.shieldHits || 0;
        if ((e.shieldHits || 0) < v.lastShield) { RS.Audio && RS.Audio.clang(); VFX.sparks(e.x, e.y - 6, 5, '#dfe6ee'); }
        v.lastShield = e.shieldHits || 0;
        // cold shroud: ambient frost + one-shot shatter when it breaks
        if (e.coldHp > 0 && Math.random() < 0.04) VFX.frost(e.x + (Math.random() - 0.5) * 12, e.y - 6, 1);
        if (e._coldBroke > 0 && !v.crackDone) { v.crackDone = true; VFX.frost(e.x, e.y - 6, 10); VFX.ring(e.x, e.y - 6, '#bfeaf5', 4, 26, 0.4, 2); RS.Audio && RS.Audio.crack(); }
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

    _bossEntrance(m, e) {
      const A2 = Renderer.BOSS_AURA[e.def.boss] || Renderer.BOSS_AURA.corvin;
      this.bossBanner = { name: e.def.name, title: e.def.title || '', glow: A2.glow, t: 0 };
      VFX.ring(e.x, e.y, A2.glow, 8, 90, 0.6, 5);
      if (A2.fx === 'shard') VFX.shards(e.x, e.y, 20, A2.glow); else VFX.embers(e.x, e.y, 20, A2.glow);
      RS.Audio && RS.Audio.boss();
      RS.Audio && RS.Audio.duckMusic(2.2);   // let the horn cut through the bed
    }

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
      // Broad tonal patches first — breaks the flat single-colour field into
      // meadow/shade variation before any detail goes on top.
      for (let i = 0; i < 26; i++) {
        const s = ((i * 2654435761) ^ 0x5bf03635) >>> 0;
        // NOTE: unsigned shifts (>>>) are required here. A signed >> on a hash
        // above 2^31 yields a negative value, and `% 78` then produces a
        // negative radius, which makes createRadialGradient throw and kills
        // the whole frame.
        const px = (s % W), py = ((s >>> 9) % H), pr = 46 + ((s >>> 17) % 78);
        const g2 = c.createRadialGradient(px, py, 0, px, py, S.R0(pr) || 1);
        const tone = winter
          ? ((s & 1) ? 'rgba(255,255,255,0.10)' : 'rgba(120,145,175,0.10)')
          : ((s & 1) ? 'rgba(126,168,74,0.16)' : 'rgba(48,74,34,0.16)');
        g2.addColorStop(0, tone); g2.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g2; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
      }
      // scattered deterministic detail across the whole field (no per-tile grid)
      for (let gy = 7; gy < H; gy += 13) for (let gx = 6; gx < W; gx += 15) {
        const s = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
        const jx = gx + (s & 7) - 3, jy = gy + ((s >> 3) & 7) - 3;
        if (winter) {
          c.fillStyle = (s & 1) ? A.alpha('#ffffff', 0.65) : A.alpha('#9fb0c4', 0.45);
          c.beginPath(); c.arc(jx, jy, 0.8 + (s & 1) * 0.7, 0, TAU); c.fill();
        } else {
          // three-blade clumps of varying height, leaning with the prevailing wind
          const blades = 2 + (s & 1), lean = ((s >> 5) & 1) ? 1 : -1;
          for (let b = 0; b < blades; b++) {
            const bx = jx + b * 2 - 1, h = 2 + ((s >> (b * 2 + 6)) & 3);
            c.strokeStyle = ((s >> b) & 1) ? A.alpha(RS.RAMP.grass.shadow, 0.55) : A.alpha(RS.RAMP.grass.light, 0.35);
            c.lineWidth = 1;
            c.beginPath(); c.moveTo(bx, jy + 1); c.lineTo(bx + lean * 0.8, jy + 1 - h); c.stroke();
          }
        }
      }
      // 2) special terrain — ONE merged organic silhouette per kind (_tileMask),
      // painted through a mask instead of stamped per tile. This is what kills
      // the visible checkerboard: no pass here ever knows where a tile edge is.
      this._maskCache = null; // masks belong to this terrain build
      for (const k of ['unbuildable', 'water', 'holy', 'cursed', 'hazard', 'highground']) this._paintRegion(c, m, k);
      // 3) flowing path splines
      for (const p of m.paths) this._smoothPath(c, p.pts);
      // 4) ruined houses (Winter map) — grouped into connected clusters so each
      // house reads as ONE coherent ruin (collapsed roof, plaster walls, glowing
      // window) instead of a repeated per-tile stamp. Campfires drawn live.
      if (m.map.houses) this._houseClusters(m).forEach((cluster) => this._drawRuinedHouse(c, cluster));
      this._terrain = cv;
    }
    // Flood-fill 'house' tiles into 4-connected clusters -> [{col,row,x,y},...]
    _houseClusters(m) {
      if (this._houseCache && this._houseCacheSig === m.map.id) return this._houseCache;
      const seen = new Set(), out = [];
      for (let r = 0; r < m.rows; r++) for (let col = 0; col < m.cols; col++) {
        if (m.tileKind(col, r) !== 'house' || seen.has(col + ',' + r)) continue;
        const stack = [[col, r]], cluster = [];
        while (stack.length) {
          const [cc, rr] = stack.pop(); const key = cc + ',' + rr;
          if (seen.has(key) || m.tileKind(cc, rr) !== 'house') continue;
          seen.add(key); cluster.push({ col: cc, row: rr, x: cc * TILE, y: rr * TILE });
          stack.push([cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]);
        }
        out.push(cluster);
      }
      this._houseCache = out; this._houseCacheSig = m.map.id;
      return out;
    }
    // Paints one ruined house across its whole tile cluster: snow-capped broken
    // roof caving inward, weathered plaster walls, a glowing window, rubble.
    _drawRuinedHouse(c, cluster) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const t of cluster) { minX = Math.min(minX, t.x); minY = Math.min(minY, t.y); maxX = Math.max(maxX, t.x + TILE); maxY = Math.max(maxY, t.y + TILE); }
      const w = maxX - minX, h = maxY - minY, cx = minX + w / 2, cy = minY + h / 2;
      const seed = ((cluster[0].col * 73856093) ^ (cluster[0].row * 19349663)) >>> 0;
      const rnd = (i) => (((seed >> (i * 3)) & 15) / 15);
      const pad = 5;
      // A drift of snow banked around the ruin, with a wandering edge. Without
      // this the house was a hard rectangle pasted onto flat snow — the tile it
      // sits on was plainly visible. The drift beds it into the field instead.
      c.save();
      c.filter = 'blur(4px)';
      c.fillStyle = 'rgba(0,0,0,0.22)';
      this._blob(c, minX - 3, minY - 1, w + 6, h + 8, seed ^ 0x51ed, 0.30); c.fill();
      c.fillStyle = '#eef4fa';
      this._blob(c, minX - 7, minY - 6, w + 14, h + 14, seed, 0.44); c.fill();
      c.fillStyle = '#d3dfec';
      this._blob(c, minX - 2, minY + 2, w + 4, h + 4, seed ^ 0x2f11, 0.38); c.fill();
      c.restore();
      // ground: snow trampled to bare, frozen mud — only the sheltered strip in
      // front of the wall, warm brown rather than a black hole
      const fy = minY + h * 0.34, fh = h - (fy - minY) - pad;
      c.fillStyle = '#5a4634'; this._blob(c, minX + pad + 2, fy, w - pad * 2 - 4, fh, seed ^ 0x77aa, 0.20); c.fill();
      c.fillStyle = '#463628'; this._blob(c, minX + pad + 7, fy + 5, w - pad * 2 - 14, fh - 9, seed ^ 0x1234, 0.24); c.fill();
      // scattered rubble/snow patches on the dirt floor
      for (let i = 0; i < 5; i++) { const rx = minX + pad + 6 + rnd(i) * (w - pad * 2 - 12), ry = fy + 4 + rnd(i + 4) * Math.max(4, fh - 10); c.fillStyle = i % 2 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.30)'; c.beginPath(); c.arc(rx, ry, 2.5 + rnd(i + 1) * 2, 0, TAU); c.fill(); }
      // weathered plaster back wall, its top edge broken rather than ruler-straight
      const wallH = h * 0.4, wx0 = minX + pad, wx1 = maxX - pad;
      c.beginPath(); c.moveTo(wx0, minY + pad + wallH);
      const notches = 7;
      for (let i = 0; i <= notches; i++) {
        const px = wx0 + (wx1 - wx0) * (i / notches);
        c.lineTo(px, minY + pad + (i % 2 ? 2.5 : 0) + (rnd(i) - 0.5) * 5);
      }
      c.lineTo(wx1, minY + pad + wallH); c.closePath();
      c.fillStyle = '#8a7c68'; c.fill();
      // stone courses showing through the failed plaster
      c.save(); c.clip();
      c.fillStyle = 'rgba(96,86,72,0.85)';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
        if (((i * 5 + j + (seed >>> 2)) & 3) !== 0) continue;
        c.fillRect(wx0 + 3 + j * ((wx1 - wx0) / 5) + (i % 2) * 5, minY + pad + 3 + i * (wallH / 4), (wx1 - wx0) / 5 - 5, wallH / 4 - 3);
      }
      c.restore();
      c.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 3; i++) c.fillRect(minX + pad + 4 + i * (w / 4), minY + pad + 3, 1.5, wallH * 0.85); // crack lines
      // snow capping the broken wall top
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath();
      for (let i = 0; i <= notches; i++) {
        const px = wx0 + (wx1 - wx0) * (i / notches), py = minY + pad + (i % 2 ? 2.5 : 0) + (rnd(i) - 0.5) * 5;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.stroke();
      // a glowing window in the wall
      const wx = cx - 4, wy = minY + pad + h * 0.14;
      c.fillStyle = '#2a1f18'; c.fillRect(wx, wy, 9, 9);
      c.fillStyle = '#ffb457'; c.fillRect(wx + 1.5, wy + 1.5, 6, 6);
      c.strokeStyle = '#3a2c22'; c.lineWidth = 1; c.beginPath(); c.moveTo(wx + 4.5, wy); c.lineTo(wx + 4.5, wy + 9); c.moveTo(wx, wy + 4.5); c.lineTo(wx + 9, wy + 4.5); c.stroke();
      // side wall stubs (broken, angled tops)
      c.fillStyle = '#7a6d5a';
      this._roundRect(c, minX + pad, minY + pad, 6, h * 0.7, 2); c.fill();
      this._roundRect(c, maxX - pad - 6, minY + pad, 6, h * 0.55, 2); c.fill();
      // collapsed roof: rafters fallen roughly parallel across the ruin, resting
      // on the wall top and sinking to the floor, each carrying a snow load
      c.lineCap = 'round';
      const nb = Math.max(3, Math.round(w / 30));
      const lo = (v, a, b) => (v < a ? a : v > b ? b : v);
      for (let i = 0; i < nb; i++) {
        // NOTE: a fresh hash per beam. Reusing rnd(i+k) here made every rafter
        // land at the same angle (the shift wraps past 32 bits and repeats),
        // so the collapse read as a row of fence posts.
        const hb = this._hash('beam' + seed + '_' + i);
        const r0 = (hb & 255) / 255, r1 = ((hb >>> 8) & 255) / 255, r2 = ((hb >>> 16) & 255) / 255, r3 = ((hb >>> 24) & 255) / 255;
        const f = (i + 0.5) / nb;
        const ax = lo(minX + pad + 2 + f * (w - pad * 2 - 4) + (r0 - 0.5) * 12, minX + 2, maxX - 2);
        const ay = minY + pad + 3 + r1 * 7;
        const spread = (r2 - 0.35) * w * 0.7;                 // some lean left, some right
        const bx = lo(ax + spread, minX + 3, maxX - 3);
        const by = maxY - pad - 3 - r3 * (h * 0.28);
        c.strokeStyle = RS.RAMP.timber.shadow; c.lineWidth = 4.5; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        c.strokeStyle = RS.RAMP.timber.mid; c.lineWidth = 2.6; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        // a thin snow ridge riding the lit top edge of the beam
        c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(ax + 1.4, ay - 1.6); c.lineTo(bx + 1.4, by - 1.6); c.stroke();
      }
      // drifted snow piled against the ruin's base
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath(); c.ellipse(minX + pad - 1, maxY - pad - 2, 7, 3.5, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(maxX - pad + 1, maxY - pad - 3, 6, 3, 0, 0, TAU); c.fill();
    }
    // An irregular closed blob inscribed in a box — used wherever a hard
    // rectangle would betray the tile underneath (snow drifts, mud floors).
    _blob(c, x, y, w, h, seed, wob) {
      const n = this._noise(seed >>> 0);
      const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, N = 24;
      c.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU;
        const k = 1 + (n(Math.cos(a) * 2.3 + 5, Math.sin(a) * 2.3 + 5) - 0.5) * wob;
        const px = cx + Math.cos(a) * rx * k, py = cy + Math.sin(a) * ry * k;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
    }
    _roundRect(c, x, y, w, h, r) {
      if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
      r = Math.min(r, w / 2, h / 2); c.beginPath();
      c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }

    /* ==================== ORGANIC TERRAIN REGIONS ====================
     * Special terrain used to be stamped as one rounded rect PER TILE, so
     * water, lava, holy ground and bog all read as a checkerboard of squares.
     * Now every terrain kind is merged into a SINGLE organic silhouette: its
     * tiles are drawn as overlapping blobs, blurred, then alpha-thresholded
     * against a wandering noise cut-off (the metaball trick). Ground texture,
     * shoreline and animation are all painted THROUGH that mask, so no pass
     * downstream knows where a tile boundary was — squares can't reappear.  */
    _hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    // Smooth deterministic value noise on a 64×64 lattice -> 0..1.
    _noise(seed) {
      const G = 64, tab = new Float32Array(G * G);
      let s = seed >>> 0;
      for (let i = 0; i < G * G; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; tab[i] = s / 4294967296; }
      const at = (a, b) => tab[(((a % G) + G) % G) * G + (((b % G) + G) % G)];
      return (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const a = at(xi, yi), b = at(xi + 1, yi), u = at(xi, yi + 1), v = at(xi + 1, yi + 1);
        const p = a + (b - a) * sx, q = u + (v - u) * sx;
        return p + (q - p) * sy;
      };
    }
    // Merged silhouettes for one terrain kind — ONE PER CONNECTED CLUSTER, so
    // three separate ponds are three tight masks rather than one map-sized
    // sheet that is mostly empty (cheaper to blit, and per-cluster detail like
    // the holy sunburst lands on the actual ground instead of in the gap).
    _tileMasks(m, kind) {
      this._maskCache = this._maskCache || {};
      if (kind in this._maskCache) return this._maskCache[kind];
      const own = new Set();
      for (let r = 0; r < m.rows; r++) for (let col = 0; col < m.cols; col++)
        if (m.tileKind(col, r) === kind) own.add(col + ',' + r);
      if (!own.size) return (this._maskCache[kind] = []);
      // 8-connected: diagonal neighbours blur into one another anyway
      const seen = new Set(), groups = [];
      for (const key of own) {
        if (seen.has(key)) continue;
        const stack = [key], g = [];
        while (stack.length) {
          const k = stack.pop();
          if (seen.has(k) || !own.has(k)) continue;
          seen.add(k);
          const [cc, rr] = k.split(',').map(Number);
          g.push([cc * TILE, rr * TILE]);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) stack.push((cc + dx) + ',' + (rr + dy));
        }
        groups.push(g);
      }
      return (this._maskCache[kind] = groups.map((cells, gi) => this._buildMask(m, kind, cells, gi)));
    }
    _buildMask(m, kind, cells, gi) {
      const PAD = 20;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of cells) {
        if (x < x0) x0 = x; if (y < y0) y0 = y;
        if (x + TILE > x1) x1 = x + TILE; if (y + TILE > y1) y1 = y + TILE;
      }
      x0 -= PAD; y0 -= PAD; x1 += PAD; y1 += PAD;
      const w = Math.ceil(x1 - x0), h = Math.ceil(y1 - y0);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const c = cv.getContext('2d');
      c.save(); c.translate(-x0, -y0); c.filter = 'blur(14px)'; c.fillStyle = '#fff';
      for (const [x, y] of cells) { this._roundRect(c, x - 7, y - 7, TILE + 14, TILE + 14, 14); c.fill(); }
      c.restore(); c.filter = 'none';
      // Threshold at a noise-modulated cut-off. A flat threshold would just hand
      // back a rounded rectangle; two octaves — coarse lobes plus a fine crinkle
      // — push the boundary around inside the blur band into a real coastline.
      const hs = this._hash(m.map.id + kind + '#' + gi);
      const n1 = this._noise(hs), n2 = this._noise((hs ^ 0x9e3779b9) >>> 0);
      const img = c.getImageData(0, 0, w, h), d = img.data;
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const i = (py * w + px) * 4;
        const thr = 58 + n1(px / 52, py / 52) * 125 + (n2(px / 17, py / 17) - 0.5) * 46;
        const on = d[i + 3] >= thr;
        d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = on ? 255 : 0;
      }
      c.putImageData(img, 0, 0);
      return { canvas: cv, x: x0, y: y0, w, h, cells, kind, gi };
    }
    // A mask shrunk `px` inward — depth bands, lava crust, plateau tops.
    _erodeMask(mask, px) {
      mask._er = mask._er || {};
      if (mask._er[px]) return mask._er[px];
      const cv = document.createElement('canvas'); cv.width = mask.w; cv.height = mask.h;
      const c = cv.getContext('2d');
      c.filter = 'blur(' + px + 'px)'; c.drawImage(mask.canvas, 0, 0); c.filter = 'none';
      const img = c.getImageData(0, 0, mask.w, mask.h), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const on = d[i + 3] > 200; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = on ? 255 : 0; }
      c.putImageData(img, 0, 0);
      return (mask._er[px] = { canvas: cv, x: mask.x, y: mask.y, w: mask.w, h: mask.h });
    }
    // Just the outer band of a mask — shorelines, cliff lips, glowing edges.
    _rimMask(mask, px) {
      mask._rim = mask._rim || {};
      if (mask._rim[px]) return mask._rim[px];
      const er = this._erodeMask(mask, px);
      const cv = document.createElement('canvas'); cv.width = mask.w; cv.height = mask.h;
      const c = cv.getContext('2d');
      c.drawImage(mask.canvas, 0, 0);
      c.globalCompositeOperation = 'destination-out'; c.drawImage(er.canvas, 0, 0);
      return (mask._rim[px] = { canvas: cv, x: mask.x, y: mask.y, w: mask.w, h: mask.h });
    }
    // Draw `paint` (in WORLD coords) clipped to a mask. Returns its scratch
    // canvas, which lives on the mask so repeat frames never reallocate.
    _maskPaint(mask, slot, paint) {
      const k = '_s' + slot;
      let s = mask[k];
      if (!s) { s = mask[k] = document.createElement('canvas'); s.width = mask.w; s.height = mask.h; }
      const c = s.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, mask.w, mask.h);
      c.save(); c.translate(-mask.x, -mask.y); paint(c); c.restore();
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(mask.canvas, 0, 0);
      c.globalCompositeOperation = 'source-over';
      return s;
    }
    // Region animation is soft, low-frequency ambience — swells, glows, motes.
    // Painting it at HALF resolution and refreshing at 30Hz is visually
    // indistinguishable and about 8x cheaper than a full-res repaint every
    // frame, which is what a naive masked overlay costs (~7ms on Riverford).
    _animLayer(mask, key, t, paint) {
      const st = (mask._al = mask._al || {});
      let L = st[key];
      if (!L) {
        const w = Math.max(1, Math.ceil(mask.w / 2)), h = Math.max(1, Math.ceil(mask.h / 2));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const mk = document.createElement('canvas'); mk.width = w; mk.height = h;
        mk.getContext('2d').drawImage(mask.canvas, 0, 0, w, h);
        L = st[key] = { cv, mk, w, h, last: -1e9 };
      }
      if (t - L.last >= 1 / 30) {
        L.last = t;
        const c = L.cv.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, L.w, L.h);
        c.save(); c.scale(0.5, 0.5); c.translate(-mask.x, -mask.y); paint(c); c.restore();
        c.globalCompositeOperation = 'destination-in';
        c.drawImage(L.mk, 0, 0);
        c.globalCompositeOperation = 'source-over';
      }
      return L;
    }
    _blitLayer(ctx, mask, L, additive) {
      ctx.save();
      if (additive) ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(L.cv, 0, 0, L.w, L.h, mask.x, mask.y, mask.w, mask.h);
      ctx.restore();
    }
    // A flat-coloured copy of a mask, cached. Effects that only pulse in
    // opacity blit this with globalAlpha instead of repainting every frame.
    _tintedMask(mask, key, color) {
      const st = (mask._tm = mask._tm || {});
      if (st[key]) return st[key];
      const cv = document.createElement('canvas'); cv.width = mask.w; cv.height = mask.h;
      const c = cv.getContext('2d');
      c.fillStyle = color; c.fillRect(0, 0, mask.w, mask.h);
      c.globalCompositeOperation = 'destination-in'; c.drawImage(mask.canvas, 0, 0);
      return (st[key] = cv);
    }
    // Wandering fissures that ignore the tile grid — lava veins, void seams.
    _cracks(mask, key) {
      if (mask._cr) return mask._cr;
      const n = this._noise(this._hash(key));
      const out = [], count = Math.max(4, Math.round(mask.cells.length * 1.7));
      for (let i = 0; i < count; i++) {
        const s = this._hash(key + ':' + i), cell = mask.cells[i % mask.cells.length];
        let x = cell[0] + (s % TILE), y = cell[1] + ((s >>> 8) % TILE);
        let ang = n(x / 70, y / 70) * TAU;
        const pts = [[x, y]], segs = 4 + ((s >>> 17) % 5);
        for (let k = 0; k < segs; k++) {
          ang += (n(x / 34, y / 34) - 0.5) * 1.6;
          x += Math.cos(ang) * 9; y += Math.sin(ang) * 9;
          pts.push([x, y]);
        }
        out.push({ pts, ph: (s >>> 5 & 63) / 63 * TAU });
      }
      return (mask._cr = out);
    }
    _stroke(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }

    // Bake one terrain kind into the cached terrain canvas.
    _paintRegion(c, m, kind) {
      for (const mask of this._tileMasks(m, kind)) this._paintMask(c, m, kind, mask);
    }
    _paintMask(c, m, kind, mask) {
      const raised = kind === 'highground';
      // contact shadow so the region beds INTO the ground instead of onto it
      // Offset down-right to match the art bible's upper-left key light; an
      // evenly-spread shadow made raised ground read as an outlined sticker.
      const sh = this._maskPaint(mask, 'sh', (g) => { g.fillStyle = raised ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.26)'; g.fillRect(mask.x, mask.y, mask.w, mask.h); });
      c.save(); c.filter = 'blur(6px)'; c.drawImage(sh, mask.x + (raised ? 5 : 2), mask.y + (raised ? 9 : 4)); c.restore();
      // body: painted unmasked into a scratch, masked once, blitted once
      const body = this._maskPaint(mask, 'bd', (g) => this._regionArt(g, m, kind, mask));
      c.drawImage(body, mask.x, mask.y);
      // decorations are drawn UNMASKED so trees and boulders overhang the edge
      this._regionProps(c, m, kind, mask);
    }

    _regionArt(g, m, kind, mask) {
      const X = mask.x, Y = mask.y, W = mask.w, H = mask.h;
      const R = RS.RAMP;
      const flat = (style) => { g.fillStyle = style; g.fillRect(X, Y, W, H); };
      // fill the region shrunk `px` inward — depth bands without any tile edge
      const inner = (px, style) => {
        const er = this._erodeMask(mask, px);
        g.drawImage(this._maskPaint(er, 'in', (h) => { h.fillStyle = style; h.fillRect(X, Y, W, H); }), er.x, er.y);
      };
      const speck = (count, colA, colB, rmin, rmax) => {
        for (let i = 0; i < count; i++) {
          const s = this._hash(kind + m.map.id + 'sp' + i);
          const px = X + (s % W), py = Y + ((s >>> 11) % H);
          g.fillStyle = (s & 1) ? colA : colB;
          g.beginPath(); g.arc(px, py, rmin + ((s >>> 21) % 100) / 100 * (rmax - rmin), 0, TAU); g.fill();
        }
      };
      switch (kind) {
        case 'water': {
          flat(m.map.winter ? '#6d7c86' : '#6b5f42');       // wet silt margin
          inner(3, R.water.light);                          // bright shallows
          inner(10, R.water.mid);                           // open water
          inner(21, A.mul(R.water.mid, 0.62));              // depth
          inner(34, A.mul(R.water.mid, 0.44));              // deepest channel
          speck(26, 'rgba(220,240,255,0.10)', 'rgba(0,0,0,0.14)', 2, 7); // silt + stones
          // baked caustics: continuous squiggles across the whole body
          const n = this._noise(this._hash(m.map.id + 'caus'));
          g.lineCap = 'round';
          for (let i = 0; i < 30; i++) {
            g.strokeStyle = 'rgba(190,232,250,0.09)'; g.lineWidth = 1.4;
            const yy = Y + (i / 30) * H;
            g.beginPath();
            for (let x = X; x <= X + W; x += 9) g.lineTo(x, yy + Math.sin(x * 0.06 + i) * 4 + n(x / 50, yy / 50) * 6);
            g.stroke();
          }
          break;
        }
        case 'hazard': {
          // A crater of cooling lava: hot scorched lip, cracked basalt crust,
          // and a molten pool showing through the fissures.
          flat('#7a3216');                                  // glowing scorched lip
          inner(3, '#41231a');                              // cooling scree
          inner(7, '#1d1512');                              // basalt crust
          speck(30, 'rgba(255,150,60,0.10)', 'rgba(0,0,0,0.35)', 1.5, 5);
          // molten veins: dark channel, hot fill, bright core
          const cr = this._cracks(mask, m.map.id + 'lava');
          g.lineCap = 'round';
          for (const k of cr) {
            g.strokeStyle = '#0b0806'; g.lineWidth = 6; this._stroke(g, k.pts);
            g.strokeStyle = '#a83512'; g.lineWidth = 3.8; this._stroke(g, k.pts);
            g.strokeStyle = '#f0721e'; g.lineWidth = 2.1; this._stroke(g, k.pts);
            g.strokeStyle = '#ffcc55'; g.lineWidth = 0.9; this._stroke(g, k.pts);
          }
          break;
        }
        case 'cursed': {
          flat('#2b2040');
          inner(5, R.void.mid);
          inner(13, A.mul(R.void.shadow, 0.8));
          speck(26, 'rgba(160,110,230,0.16)', 'rgba(0,0,0,0.30)', 2, 6);
          const cr = this._cracks(mask, m.map.id + 'void');
          for (const k of cr) { g.strokeStyle = 'rgba(140,90,210,0.35)'; g.lineWidth = 2; g.lineCap = 'round'; this._stroke(g, k.pts); }
          break;
        }
        case 'holy': {
          flat('#a89772');                                  // worn kerb
          inner(3, R.holy.mid);
          inner(9, R.holy.light);
          // marble veining — organic, so it never suggests a tile grid
          for (const k of this._cracks(mask, m.map.id + 'marble')) {
            g.lineCap = 'round';
            g.strokeStyle = 'rgba(176,154,98,0.40)'; g.lineWidth = 1.7; this._stroke(g, k.pts);
            g.strokeStyle = 'rgba(255,252,232,0.55)'; g.lineWidth = 0.7; this._stroke(g, k.pts);
          }
          speck(24, 'rgba(186,164,104,0.30)', 'rgba(255,255,255,0.55)', 2, 6);
          // an inlaid gilt sunburst at the centre of the consecrated ground
          const cx = X + W / 2, cy = Y + H / 2, rr = Math.min(W, H) * 0.3;
          g.strokeStyle = 'rgba(168,120,34,0.9)'; g.lineWidth = 2.8;
          g.beginPath(); g.arc(cx, cy, S.R0(rr) || 1, 0, TAU); g.stroke();
          g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, S.R0(rr * 0.62) || 1, 0, TAU); g.stroke();
          g.strokeStyle = 'rgba(168,120,34,0.75)'; g.lineWidth = 2.1;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * rr * 0.62, cy + Math.sin(a) * rr * 0.62);
            g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            g.stroke();
          }
          break;
        }
        case 'highground': {
          flat(A.mul(R.stone.shadow, 0.58));                // deep cliff face
          inner(4, A.mul(R.stone.shadow, 0.92));            // sunlit face
          inner(9, R.stone.mid);                            // plateau shoulder
          inner(13, R.stone.light);                         // lit top
          // strata running along the rock face
          for (const k of this._cracks(mask, m.map.id + 'strata')) {
            g.lineCap = 'round';
            g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2; this._stroke(g, k.pts);
            g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 0.9; this._stroke(g, k.pts);
          }
          speck(30, 'rgba(255,255,255,0.16)', 'rgba(0,0,0,0.22)', 2, 7);
          break;
        }
        case 'unbuildable': {
          const gim = m.map.env.gimmick;
          if (gim === 'canopy') { flat('#2b3a1c'); inner(5, '#223016'); speck(34, 'rgba(120,160,70,0.14)', 'rgba(0,0,0,0.30)', 2, 8); }
          else if (gim === 'bog') {
            flat('#4a4130'); inner(4, '#372f22'); inner(12, '#2a241a');
            speck(26, 'rgba(90,120,80,0.20)', 'rgba(0,0,0,0.28)', 3, 9);
            // standing water sheen in the mire
            for (let i = 0; i < 10; i++) {
              const s = this._hash(m.map.id + 'pool' + i);
              const px = X + (s % W), py = Y + ((s >>> 11) % H);
              g.fillStyle = 'rgba(70,110,110,0.30)';
              g.beginPath(); g.ellipse(px, py, 9 + (s >>> 3 & 7), 5 + (s >>> 6 & 3), (s >>> 9 & 7) * 0.4, 0, TAU); g.fill();
            }
          } else { flat(A.mul(R.stoneDark.mid, 1.05)); inner(5, R.stoneDark.mid); inner(12, R.stoneDark.shadow); speck(30, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.28)', 2, 8); }
          break;
        }
      }
    }

    // Unmasked props sitting ON a region: trees, boulders, reeds, ice shelves.
    // Drawn per CELL (always inside the silhouette) but jittered off-grid, and
    // deliberately allowed to overhang the edge so the boundary reads natural.
    _regionProps(c, m, kind, mask) {
      const gim = m.map.env.gimmick;
      const tree = (x, y, s) => {
        c.fillStyle = 'rgba(0,0,0,0.30)'; c.beginPath(); c.ellipse(x + 2, y + 7 * s, 11 * s, 5 * s, 0, 0, TAU); c.fill();
        c.fillStyle = '#4a3520'; c.fillRect(x - 1.6 * s, y - 2 * s, 3.2 * s, 9 * s);
        const lobes = [[0, -12], [-8, -5], [8, -5], [-4, -15], [5, -14]];
        c.fillStyle = '#2f4a1e';
        for (const [dx, dy] of lobes) { c.beginPath(); c.arc(x + dx * s, y + dy * s, 7.5 * s, 0, TAU); c.fill(); }
        c.fillStyle = '#41682a';
        for (const [dx, dy] of lobes.slice(0, 3)) { c.beginPath(); c.arc(x + dx * s - 1.5 * s, y + dy * s - 2 * s, 5 * s, 0, TAU); c.fill(); }
        c.fillStyle = 'rgba(140,190,90,0.35)'; c.beginPath(); c.arc(x - 3 * s, y - 15 * s, 3.4 * s, 0, TAU); c.fill();
      };
      const boulder = (x, y, s) => {
        c.fillStyle = 'rgba(0,0,0,0.32)'; c.beginPath(); c.ellipse(x + 2, y + 4 * s, 10 * s, 4.5 * s, 0, 0, TAU); c.fill();
        c.fillStyle = RS.RAMP.stone.shadow; c.beginPath(); c.moveTo(x - 9 * s, y + 3 * s); c.lineTo(x - 5 * s, y - 7 * s); c.lineTo(x + 4 * s, y - 8 * s); c.lineTo(x + 9 * s, y + 2 * s); c.closePath(); c.fill();
        c.fillStyle = RS.RAMP.stone.mid; c.beginPath(); c.moveTo(x - 5 * s, y - 7 * s); c.lineTo(x + 4 * s, y - 8 * s); c.lineTo(x + 6 * s, y - 2 * s); c.lineTo(x - 3 * s, y - 1 * s); c.closePath(); c.fill();
        c.fillStyle = RS.RAMP.stone.light; c.beginPath(); c.moveTo(x - 4 * s, y - 6.5 * s); c.lineTo(x + 1 * s, y - 7.5 * s); c.lineTo(x - 1 * s, y - 3.5 * s); c.closePath(); c.fill();
      };
      const reed = (x, y, s) => {
        c.strokeStyle = '#5d6a34'; c.lineWidth = 1.3 * s; c.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const lean = (i - 1.5) * 2.2;
          c.beginPath(); c.moveTo(x + i * 2.4 * s - 3 * s, y); c.quadraticCurveTo(x + i * 2.4 * s - 3 * s + lean, y - 8 * s, x + i * 2.4 * s - 3 * s + lean * 1.6, y - 14 * s); c.stroke();
        }
        c.fillStyle = '#6b5230'; c.beginPath(); c.ellipse(x + 1.4 * s, y - 14 * s, 1.4 * s, 3 * s, 0.2, 0, TAU); c.fill();
      };
      if (kind === 'unbuildable') {
        const per = gim === 'canopy' ? 2 : 1;
        // Jitter is deliberately WIDER than a tile so props straddle tile
        // boundaries. Confining each to its own cell left a visible lattice of
        // evenly-spaced trees even though the ground beneath was seamless.
        const spread = TILE * 1.15;
        const items = [];
        mask.cells.forEach(([x, y], i) => {
          for (let k = 0; k < per; k++) {
            const s = this._hash(m.map.id + 'prop' + i + '_' + k);
            const px = x + TILE / 2 + ((s % 1000) / 1000 - 0.5) * spread;
            const py = y + TILE / 2 + (((s >>> 10) % 1000) / 1000 - 0.5) * spread;
            items.push({ px, py, sc: 0.7 + ((s >>> 21) % 100) / 100 * 0.6, s });
          }
        });
        items.sort((a, b) => a.py - b.py);   // painter's order: far trees behind near ones
        for (const it of items) {
          if (gim === 'canopy') tree(it.px, it.py, it.sc);
          else if (gim === 'bog') { (it.s & 1) ? reed(it.px, it.py, it.sc) : boulder(it.px, it.py, it.sc * 0.8); }
          else boulder(it.px, it.py, it.sc);
        }
      } else if (kind === 'highground') {
        // a few rocks along the plateau so the lit top isn't a bare slab
        mask.cells.forEach(([x, y], i) => {
          if (i % 2) return;
          const s = this._hash(m.map.id + 'hg' + i);
          boulder(x + 12 + (s % (TILE - 24)), y + 16 + ((s >>> 9) % (TILE - 26)), 0.8);
        });
      }
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
      // twin rutted wheel tracks + a worn crown, so the road looks used
      c.strokeStyle = A.alpha(RS.RAMP.road.light, 0.30); c.lineWidth = TILE * 0.20; trace(); c.stroke();
      c.strokeStyle = A.alpha(RS.RAMP.road.shadow, 0.55); c.lineWidth = TILE * 0.045;
      c.save(); c.translate(0, -TILE * 0.15); trace(); c.stroke(); c.restore();
      c.save(); c.translate(0, TILE * 0.15); trace(); c.stroke(); c.restore();
      // cobble grit scattered along the surface
      c.save(); c.lineWidth = TILE * 0.62; trace();
      c.strokeStyle = 'rgba(0,0,0,0)'; c.stroke();
      c.clip();
      for (const pt of pts) {
        for (let g = 0; g < 22; g++) {
          const sd = ((pt.x * 73856093) ^ (pt.y * 19349663) ^ (g * 83492791)) >>> 0;
          const gx = pt.x + ((sd % 120) - 60), gy = pt.y + (((sd >>> 9) % 120) - 60);
          c.fillStyle = (sd & 1) ? 'rgba(255,240,210,0.055)' : 'rgba(0,0,0,0.10)';
          c.fillRect(gx, gy, 2, 1.6);
        }
      }
      c.restore();
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

    /* -------------------------- animated tiles ----------------------
     * Every field effect below animates across the WHOLE merged region and is
     * masked through its silhouette. The old version ran a radial gradient or
     * a ripple pair per tile, which is what drew the grid of squares onto the
     * water, lava and holy ground even after the terrain itself was smooth. */
    _animatedTiles(ctx, m) {
      const t = this.clock;
      this._animWater(ctx, m, t);
      this._animHazard(ctx, m, t);
      this._animHoly(ctx, m, t);
      this._animCursed(ctx, m, t);
      this._animHighground(ctx, m, t);
      // Campfires stay per-tile — each marks a free build slot, so they carry
      // real information. They're jittered off-centre and size-varied, though;
      // dead-centre fires made a multi-tile ruin read as a row of squares.
      for (let r = 0; r < m.rows; r++) for (let col = 0; col < m.cols; col++) {
        if (m.tileKind(col, r) !== 'house') continue;
        const x = col * TILE, y = r * TILE;
        const hs = this._hash('fire' + col + '_' + r);
        const cx = x + TILE / 2 + ((hs & 15) - 7.5) * 0.8, cy = y + TILE / 2 + (((hs >>> 5) & 15) - 7.5) * 0.6;
        const sc = 0.82 + ((hs >>> 11) & 7) / 7 * 0.4, ph = (hs >>> 15 & 63) * 0.1;
        // warm campfire light pooling out of the ruined house
        const fl = 0.7 + Math.sin(t * 7 + ph) * 0.25;
        const g = ctx.createRadialGradient(cx, cy + 4, 1, cx, cy + 4, 26 * sc); g.addColorStop(0, A.alpha('#ffb457', 0.5 * fl)); g.addColorStop(0.6, A.alpha('#ff7a2a', 0.2 * fl)); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - 10, y - 10, TILE + 20, TILE + 20); ctx.restore();
        // the fire itself (logs + flame) — only when no tower occupies the tile
        const occupied = m._tile(col, r) && m._tile(col, r).occupied;
        if (!occupied) {
          ctx.fillStyle = '#3a2018'; ctx.fillRect(cx - 6 * sc, cy + 6, 12 * sc, 3);
          const fh = (7 + Math.sin(t * 12 + ph) * 2.5) * sc;
          ctx.fillStyle = '#e8722c'; ctx.beginPath(); ctx.moveTo(cx - 5 * sc, cy + 6); ctx.quadraticCurveTo(cx, cy + 6 - fh - 4, cx + 5 * sc, cy + 6); ctx.fill();
          ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.moveTo(cx - 2.5 * sc, cy + 6); ctx.quadraticCurveTo(cx, cy + 6 - fh, cx + 2.5 * sc, cy + 6); ctx.fill();
          if (Math.random() < 0.3) VFX.embers(cx + (Math.random() - 0.5) * 8, cy + 2, 1, '#ffb457');
        }
      }
    }

    // Swells drifting across the whole body + a breathing shoreline.
    _animWater(ctx, m, t) {
      for (const mk of this._tileMasks(m, 'water')) {
      const X = mk.x, Y = mk.y, W = mk.w, H = mk.h;
      this._blitLayer(ctx, mk, this._animLayer(mk, 'wave', t, (g) => {
        g.lineCap = 'round';
        for (let i = 0; i < 13; i++) {
          const yy = Y - 24 + ((i * 19 + t * 7) % (H + 48));
          g.strokeStyle = A.alpha('#cdefff', 0.05 + 0.045 * (1 + Math.sin(t * 1.3 + i)));
          g.lineWidth = 4.4;
          g.beginPath();
          for (let x = X; x <= X + W; x += 10) g.lineTo(x, yy + Math.sin(x * 0.045 + t * 1.5 + i) * 3.2);
          g.stroke();
        }
        // sun glints winking on the surface
        g.fillStyle = 'rgba(232,250,255,0.85)';
        for (let i = 0; i < 20; i++) {
          const hs = this._hash('glint' + m.map.id + i);
          const a = Math.sin(t * 2.1 + ((hs >>> 3) & 63) * 0.1);
          if (a <= 0.76) continue;
          g.globalAlpha = (a - 0.76) * 4;
          g.beginPath(); g.ellipse(X + (hs % W), Y + ((hs >>> 11) % H), 5, 1.8, 0, 0, TAU); g.fill();
        }
        g.globalAlpha = 1;
      }), true);
      // shoreline foam: pure opacity pulse, so a cached tint costs one blit
      const rim = this._rimMask(mk, 5);
      ctx.save(); ctx.globalAlpha = 0.16 + Math.sin(t * 1.1) * 0.07;
      ctx.drawImage(this._tintedMask(rim, 'foam', '#dff4ff'), rim.x, rim.y); ctx.restore();
      }
    }
    // Molten veins breathing along the SAME fissures the crust was baked with.
    _animHazard(ctx, m, t) {
      for (const mk of this._tileMasks(m, 'hazard')) {
      const X = mk.x, Y = mk.y, W = mk.w, H = mk.h;
      const cr = this._cracks(mk, m.map.id + 'lava');
      this._blitLayer(ctx, mk, this._animLayer(mk, 'vein', t, (g) => {
        g.lineCap = 'round';
        for (const k of cr) {
          const p = 0.5 + 0.5 * Math.sin(t * 1.8 + k.ph);
          g.strokeStyle = A.alpha('#ff7a2a', 0.20 + p * 0.34); g.lineWidth = 10; this._stroke(g, k.pts);
          g.strokeStyle = A.alpha('#ffd45a', 0.25 + p * 0.5); g.lineWidth = 3; this._stroke(g, k.pts);
        }
        // heat haze rolling over the flow
        for (let i = 0; i < 5; i++) {
          const yy = Y + ((i * 37 + t * 13) % (H + 30)) - 15;
          g.fillStyle = A.alpha('#ff8a3a', 0.05); g.fillRect(X, yy, W, 18);
        }
      }), true);
      if (Math.random() < Math.min(0.35, mk.cells.length * 0.06)) {
        const cell = mk.cells[(Math.random() * mk.cells.length) | 0];
        VFX.embers(cell[0] + Math.random() * TILE, cell[1] + Math.random() * TILE, 1);
      }
      }
    }
    // A slow radiant sweep over consecrated ground.
    _animHoly(ctx, m, t) {
      for (const mk of this._tileMasks(m, 'holy')) {
      const X = mk.x, Y = mk.y, W = mk.w, H = mk.h;
      this._blitLayer(ctx, mk, this._animLayer(mk, 'grace', t, (g) => {
        const sweep = ((t * 26) % (W + H + 160)) - 80;
        const gr = g.createLinearGradient(X + sweep - 70, Y, X + sweep + 70, Y + H);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(0.5, A.alpha('#fff2b0', 0.22));
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(X, Y, W, H);
        g.fillStyle = A.alpha('#fff6cc', 0.10 + Math.sin(t * 1.6) * 0.05); g.fillRect(X, Y, W, H);
        // motes rising off the stone
        g.fillStyle = 'rgba(255,244,190,0.55)';
        for (let i = 0; i < 14; i++) {
          const hs = this._hash('mote' + m.map.id + i);
          const mx = X + (hs % W), my = Y + (((hs >>> 11) % H) + H - ((t * 11 + (hs & 63)) % H)) % H;
          g.beginPath(); g.arc(mx, my, 2.6, 0, TAU); g.fill();
        }
      }), true);
      }
    }
    // Void seams pulsing, with smoke drifting off the cursed ground.
    _animCursed(ctx, m, t) {
      for (const mk of this._tileMasks(m, 'cursed')) {
      const X = mk.x, Y = mk.y, W = mk.w, H = mk.h;
      const cr = this._cracks(mk, m.map.id + 'void');
      this._blitLayer(ctx, mk, this._animLayer(mk, 'void', t, (g) => {
        g.fillStyle = A.alpha('#7b4fb5', 0.10 + Math.sin(t * 1.5) * 0.05); g.fillRect(X, Y, W, H);
        g.lineCap = 'round';
        for (const k of cr) {
          const p = 0.5 + 0.5 * Math.sin(t * 1.3 + k.ph);
          g.strokeStyle = A.alpha('#c79bff', 0.10 + p * 0.28); g.lineWidth = 4.4; this._stroke(g, k.pts);
        }
        g.fillStyle = 'rgba(199,155,255,0.5)';
        for (let i = 0; i < 12; i++) {
          const hs = this._hash('vm' + m.map.id + i);
          const mx = X + (hs % W), my = Y + (((hs >>> 11) % H) + H - ((t * 8 + (hs & 63)) % H)) % H;
          g.beginPath(); g.arc(mx, my, 3, 0, TAU); g.fill();
        }
      }), true);
      if (Math.random() < 0.08) {
        const cell = mk.cells[(Math.random() * mk.cells.length) | 0];
        VFX.smoke(cell[0] + TILE / 2, cell[1] + TILE / 2, 1, '#7b4fb5');
      }
      }
    }
    // A faint lit lip along the plateau edge, so high ground reads as raised.
    _animHighground(ctx, m, t) {
      for (const mk of this._tileMasks(m, 'highground')) {
        const rim = this._rimMask(mk, 4);
        ctx.save(); ctx.globalAlpha = 0.07 + Math.sin(t * 0.9) * 0.02;
        ctx.drawImage(this._tintedMask(rim, 'lip', '#ffffff'), rim.x, rim.y); ctx.restore();
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
      r = S.R0(r); if (!r) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,200,255,0.10)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.setLineDash([2, 6]); ctx.lineDashOffset = this.clock * 16; ctx.strokeStyle = 'rgba(150,210,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(150,210,255,0.7)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('👁 reveal', x, y - r - 3); ctx.textAlign = 'left';
      ctx.restore();
    }
    _rangeRing(ctx, x, y, r, color, str) {
      r = S.R0(r); if (!r) return;
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
        // Reload charge fraction (0=just fired, 1=ready) — drives the heavy
        // siege guns' visible reload animation (crew loading, breech glowing).
        const cycle = t.fireRate * t.buff.fireRate; const reload = cycle > 0 ? A.clamp(1 - t.cooldown / (1 / cycle), 0, 1) : 1;
        ctx.save(); if (dim) ctx.globalAlpha = 0.6;
        // Surface live ability state on the sprite: the shout burst window,
        // the Warlord's Rage meter, and the Fallen Knight's Wrath.
        let power = null;
        const TT = t.def.traits;
        if (TT.shout) power = t.shoutT > 0 ? Math.min(1, t.shoutT / 1.2) : 0;
        else if (TT.rage) power = Math.min(1, (t.rage || 0) / ((TT.rage.max || 1)));
        else if (TT.fallenWrath) power = t.fwT > 0 ? 1 : 0;
        S.drawTower(ctx, t.def, t.x, t.y, { t: this.clock + v.phase, atk, aim: v.aim, ascended: t.ascended, place: v.placeT, reload, power });
        if (t.stunT > 0) this._stunSpark(ctx, t);
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
        else if (s.kind === 'legionary') {
          // Roman legionary: scutum + gladius, marching down the road
          const bob = Math.sin(this.clock * 8 + s.x * 0.1) * 1.2;
          ctx.save(); ctx.translate(s.x, s.y + bob);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 7, 6, 2.4, 0, 0, TAU); ctx.fill();
          S.facet(ctx, [[-3, 6], [-3, -5], [3, -5], [3, 6]], '#a8483a', '#d07a5a');       // tunic
          S.facet(ctx, [[-5, -4], [-5, 5], [-1, 5], [-1, -4]], RS.RAMP.gold.mid, RS.RAMP.gold.rim); // scutum
          S.circ(ctx, 0, -7, 2.6, RS.RAMP.gold.light, RS.RAMP.gold.rim);                   // helm
          S.facet(ctx, [[-1, -10], [1, -10], [0, -13]], '#c0392b');                        // crest
          ctx.strokeStyle = RS.RAMP.steel.light; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(3, 1); ctx.lineTo(7, -5); ctx.stroke();              // gladius
          // health pip so losses read
          if (s.maxHp) { const f = Math.max(0, s.hp / s.maxHp);
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-5, -15, 10, 2);
            ctx.fillStyle = f > 0.4 ? RS.PALETTE.good : RS.PALETTE.bad; ctx.fillRect(-5, -15, 10 * f, 2); }
          ctx.restore();
        }
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
    // Per-boss ambience: aura colour + which particle a boss trails. Keyed by
    // the boss's own `boss` id so each fight has its own read at a glance.
    _drawBoss(ctx, e) {
      const t = this.clock, scale = 2.3;
      const key = e.def.boss || 'corvin';
      const A2 = Renderer.BOSS_AURA[key] || Renderer.BOSS_AURA.corvin;
      // ambient particles in the boss's own colour
      if (VFX.enabled && Math.random() < 0.22) {
        const px = e.x + (Math.random() - 0.5) * 34, py = e.y - Math.random() * 10;
        if (A2.fx === 'smoke') VFX.smoke(px, py, 1, A2.glow);
        else if (A2.fx === 'shard') VFX.shards(px, py, 1, A2.glow);
        else VFX.embers(px, py, 1, A2.glow);
      }
      // ground shadow + a slow pulsing aura pool so the boss owns its footprint
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rr = 40 + Math.sin(t * 1.4) * 4;
      const g = ctx.createRadialGradient(e.x, e.y + 6, 2, e.x, e.y + 6, S.R0(rr) || 1);
      g.addColorStop(0, A.alpha(A2.glow, 0.24)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y + 6, rr, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 12, 28, 9, 0, 0, TAU); ctx.fill();
      ctx.save();
      ctx.translate(e.x, e.y + 10 + Math.sin(t * 1.2) * 2);
      ctx.scale(scale, scale);
      S.drawBossBody(ctx, key, t, e.flashT > 0);
      if (e.flashT > 0) {   // hit flash: re-stamp the silhouette in white
        ctx.save(); ctx.globalAlpha = 0.55; ctx.globalCompositeOperation = 'lighter';
        ctx.filter = 'brightness(0) invert(1)';
        S.drawBossBody(ctx, key, t, true);
        ctx.filter = 'none'; ctx.restore();
      }
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
        const a = Math.max(0, Math.min(1, f.t / (f.kind === 'slash' ? 0.18 : 0.16))); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = f.color; ctx.lineWidth = f.kind === 'beam' ? 3 : 2;
        if (f.kind === 'arc') { ctx.beginPath(); ctx.moveTo(f.x1, f.y1); const mx = (f.x1 + f.x2) / 2 + (Math.random() - 0.5) * 14, my = (f.y1 + f.y2) / 2 + (Math.random() - 0.5) * 14; ctx.lineTo(mx, my); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
        else if (f.kind === 'beam') { ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
        else if (f.kind === 'cone') { ctx.fillStyle = A.alpha(f.color, 0.4); ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.reach, f.ang - f.half, f.ang + f.half); ctx.closePath(); ctx.fill(); }
        else if (f.kind === 'slash') {
          // crescent blade sweep that travels through the arc as it fades
          const k = 1 - (f.t / 0.18); // 0 -> 1 across the swing
          const sweep = f.ang - f.half + f.half * 2 * k;
          const r0 = f.reach * 0.32, r1 = f.reach;
          ctx.lineCap = 'round';
          for (let i = 0; i < 3; i++) {
            const trail = sweep - i * 0.22 * (f.half / 1.2);
            ctx.globalAlpha = a * (1 - i * 0.3);
            ctx.strokeStyle = i === 0 ? '#ffffff' : f.color;
            ctx.lineWidth = (3 - i) * 1.6;
            ctx.beginPath();
            ctx.arc(f.x, f.y, (r0 + r1) / 2, trail - 0.34, trail + 0.34);
            ctx.stroke();
          }
          ctx.globalAlpha = a * 0.5;
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(f.x + Math.cos(sweep) * r0, f.y + Math.sin(sweep) * r0);
          ctx.lineTo(f.x + Math.cos(sweep) * r1, f.y + Math.sin(sweep) * r1); ctx.stroke();
        }
        // Shield Smash shockwave — an expanding ring of slowing force
        else if (f.kind === 'shock') {
          const k = 1 - (f.t / f.max);
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 5 * (1 - k) + 1;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k, 0, TAU); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k * 0.82, 0, TAU); ctx.stroke();
        }
        // Boss Ground Stomp — dust ring + radial cracks
        else if (f.kind === 'stomp') {
          const k = 1 - (f.t / f.max);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = (1 - k) * 0.85;
          ctx.strokeStyle = '#c9a878'; ctx.lineWidth = 7 * (1 - k) + 1.5;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k, 0, TAU); ctx.stroke();
          ctx.strokeStyle = 'rgba(40,28,20,0.8)'; ctx.lineWidth = 2.4;
          for (let i = 0; i < 8; i++) {
            const ang = i * (TAU / 8) + f.x * 0.01;
            ctx.beginPath(); ctx.moveTo(f.x + Math.cos(ang) * 8, f.y + Math.sin(ang) * 8);
            ctx.lineTo(f.x + Math.cos(ang) * f.r * k, f.y + Math.sin(ang) * f.r * k); ctx.stroke();
          }
        }
        // Boss Tower Slice — the swing arc, red on a hit, white when it glances
        else if (f.kind === 'slice') {
          const k = 1 - (f.t / f.max);
          ctx.globalAlpha = (1 - k);
          ctx.strokeStyle = f.blocked ? '#9fd0ff' : '#ff5a3a';
          ctx.lineWidth = 3.5; ctx.lineCap = 'round';
          const dx = f.tx - f.x, dy = f.ty - f.y;
          ctx.beginPath();
          ctx.moveTo(f.x + dx * k * 0.2, f.y + dy * k * 0.2);
          ctx.lineTo(f.x + dx * Math.min(1, k * 1.4), f.y + dy * Math.min(1, k * 1.4));
          ctx.stroke();
          if (k > 0.6) {
            ctx.fillStyle = f.blocked ? '#dff0ff' : '#ffd45a';
            for (let i = 0; i < 5; i++) {
              const a2 = Math.random() * TAU, d2 = Math.random() * 12;
              ctx.beginPath(); ctx.arc(f.tx + Math.cos(a2) * d2, f.ty + Math.sin(a2) * d2, 1.4, 0, TAU); ctx.fill();
            }
          }
        }
      }
      ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // A stunned tower sparks and greys out until it recovers.
    _stunSpark(ctx, t) {
      const k = this.clock;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const a = k * 7 + i * 2.1;
        ctx.fillStyle = A.alpha('#ffe08a', 0.55 + Math.sin(k * 20 + i) * 0.35);
        ctx.beginPath(); ctx.arc(t.x + Math.cos(a) * 11, t.y - 14 + Math.sin(a) * 4, 1.7, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.save(); ctx.strokeStyle = 'rgba(255,224,138,0.8)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      const j = () => (Math.random() - 0.5) * 9;
      ctx.beginPath(); ctx.moveTo(t.x + j(), t.y - 18 + j()); ctx.lineTo(t.x + j(), t.y - 10 + j()); ctx.stroke();
      ctx.restore();
    }

    /* ------------------------------ auras --------------------------- */
    _auras(ctx, m) {
      const t = this.clock;
      for (const src of m.towers) {
        const tr = src.def.traits; let radius = 0, color = null;
        if (tr.support) { radius = (tr.support.radiusT + ((src._mods && src._mods.auraRadiusT) || 0)) * TILE; color = tr.support.attackSpeedAura ? '#8fd4e8' : (tr.support.healBlockers ? '#7bd070' : '#8fd4e8'); }
        else if (tr.aura) { radius = (tr.aura.radiusT + ((src._mods && src._mods.auraRadiusT) || 0)) * TILE; color = '#ffcb5a'; }
        else if (tr.slowField) { radius = tr.slowField.radiusT * TILE; color = '#8fd4e8'; }
        radius = S.R0(radius); if (!radius) continue;
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
        for (const t of m.towers) { const lt = t.def.traits.light; if (!lt) continue; const R = S.R0(lt * TILE); if (!R) continue; const g = ctx.createRadialGradient(t.x, t.y, 3, t.x, t.y, R); g.addColorStop(0, 'rgba(255,220,150,0.35)'); g.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, TAU); ctx.fill(); }
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
      const out = b.t > 2.8 ? (b.t - 2.8) / 0.8 : 0;
      const y = -60 + drop * 70 - out * 70, x = W / 2, hw = 210, hh = b.title ? 58 : 44;
      const col = b.glow || '#ff5a2a';
      ctx.save(); ctx.globalAlpha = 1 - out;
      // plate with a bevel and the boss's own accent, not a flat red box
      const gg = ctx.createLinearGradient(0, y, 0, y + hh);
      gg.addColorStop(0, 'rgba(28,20,18,0.96)'); gg.addColorStop(1, 'rgba(12,9,8,0.96)');
      ctx.fillStyle = gg; ctx.fillRect(x - hw, y, hw * 2, hh);
      ctx.strokeStyle = A.alpha(col, 0.85); ctx.lineWidth = 2; ctx.strokeRect(x - hw, y, hw * 2, hh);
      ctx.strokeStyle = A.alpha(col, 0.25); ctx.lineWidth = 1; ctx.strokeRect(x - hw + 3, y + 3, hw * 2 - 6, hh - 6);
      // accent rules flanking the eyebrow text
      ctx.strokeStyle = A.alpha(col, 0.6);
      ctx.beginPath(); ctx.moveTo(x - 150, y + 14); ctx.lineTo(x - 74, y + 14);
      ctx.moveTo(x + 74, y + 14); ctx.lineTo(x + 150, y + 14); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = A.alpha(col, 0.95); ctx.font = 'bold 10px sans-serif';
      ctx.fillText('B O S S   A P P R O A C H E S', x, y + 17);
      ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 19px Georgia, serif'; ctx.fillText(b.name, x, y + 38);
      if (b.title) { ctx.fillStyle = 'rgba(200,188,160,0.75)'; ctx.font = 'italic 12px Georgia, serif'; ctx.fillText(b.title, x, y + 52); }
      ctx.textAlign = 'left'; ctx.restore();
    }

    _debug(ctx, m) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(4, 4, 150, 34); ctx.fillStyle = '#5fa855'; ctx.font = '11px monospace'; ctx.fillText('FPS ' + this._fps + '  particles ' + VFX.count(), 10, 18); ctx.fillText('enemies ' + m.enemies.length + '  towers ' + m.towers.length, 10, 30); }

    // Back-compat glyph used by UI cards/collection/tray.
    _towerGlyph(ctx, t, x, y, rc, flash) { S.drawTowerIcon(ctx, t.def, x, y, 34); }
  }

  // Per-boss aura colour + trail particle (see _drawBoss / _bossEntrance).
  Renderer.BOSS_AURA = {
    corvin:      { glow: '#ffcf5a', fx: 'ember' },
    thane:       { glow: '#6ff0d0', fx: 'shard' },
    hollow:      { glow: '#c9f57a', fx: 'smoke' },
    gruumak:     { glow: '#ff6a2a', fx: 'ember' },
    frostjarl:   { glow: '#dff8ff', fx: 'shard' },
    bogfather:   { glow: '#b8f05a', fx: 'smoke' },
    cinderlord:  { glow: '#ff7a2a', fx: 'ember' },
    warden:      { glow: '#7fb0ff', fx: 'shard' },
    stormwyrm:   { glow: '#bfe0ff', fx: 'shard' },
    malgrath:    { glow: '#8fd4a8', fx: 'smoke' },
    forgemaster: { glow: '#ff8a2a', fx: 'ember' },
    azhrakoth:   { glow: '#ff5a2a', fx: 'ember' },
    herald:      { glow: '#c9d4e8', fx: 'shard' },
  };

  RS.Renderer = Renderer;
})();
