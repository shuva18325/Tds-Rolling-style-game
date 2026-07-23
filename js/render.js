/* =========================================================================
 * REALM SIEGE — js/render.js
 * Canvas 2D renderer. Draws the match in strict layer order
 * (terrain → path → decor → towers → enemies → summons → projectiles → VFX)
 * with procedural, flat-shaded geometry — no image assets. Silhouettes are
 * grouped so every tower/enemy family reads at a glance. Screen shake,
 * damage numbers, hit flashes and freeze-frames provide the juice (§2).
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const P = RS.PALETTE;
  const TILE = RS.TILE;
  const TAU = RS.util.TAU;

  // Silhouette archetype per tower id (readable at a glance).
  const TOWER_SHAPE = {
    peasant: 'blocker', archer: 'archer', torch: 'brazier', slinger: 'catapult', scout: 'watch',
    crossbow: 'archer', menatarms: 'blocker', hedge: 'mage', ballista: 'ballista',
    longbow: 'archer', knight: 'rider', cleric: 'banner', trebuchet: 'catapult',
    templar: 'blocker', frostmagus: 'mage', bombard: 'cannon', falconer: 'falcon',
    paladin: 'blocker', archmage: 'spire', engineer: 'cannon', wyvernrider: 'flyer',
    marshal: 'banner', wyrm: 'dragon', lich: 'mage', grail: 'grail', sovereign: 'forge',
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.hover = null;   // {c,r}
      this.ghost = null;   // tower def being placed
      this.selected = null; // selected tower
      this.showRange = false;
    }

    draw(m) {
      const ctx = this.ctx;
      ctx.save();
      // screen shake
      if (m.shake > 0) ctx.translate((Math.random() - 0.5) * m.shake, (Math.random() - 0.5) * m.shake);
      // background
      ctx.fillStyle = P.ink;
      ctx.fillRect(-40, -40, this.canvas.width + 80, this.canvas.height + 80);

      this._terrain(ctx, m);
      this._path(ctx, m);
      this._decor(ctx, m);
      this._rangeAndGhost(ctx, m);
      this._floatersDecal(ctx, m);
      // sort enemies by y for depth
      this._towers(ctx, m);
      this._summons(ctx, m);
      this._enemies(ctx, m);
      this._projectiles(ctx, m);
      this._particles(ctx, m);
      this._fx(ctx, m);
      this._floaters(ctx, m);
      this._night(ctx, m);
      ctx.restore();
    }

    _terrain(ctx, m) {
      for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
        const k = m.tileKind(c, r);
        const x = c * TILE, y = r * TILE;
        let col = P.grassDark, top = P.grass;
        if (k === 'buildable') { col = P.grassDark; top = P.grass; }
        else if (k === 'water') { col = '#274f66'; top = P.water; }
        else if (k === 'unbuildable') { col = '#2a2a26'; top = '#343430'; }
        else if (k === 'highground') { col = '#5a5850'; top = P.highground; }
        else if (k === 'hazard') { col = '#5a1f16'; top = P.hazard; }
        else if (k === 'holy') { col = '#8a7c48'; top = P.holy; }
        else if (k === 'cursed') { col = '#241833'; top = P.cursed; }
        else if (k === 'path') continue;
        ctx.fillStyle = col; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = top; ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 4); // bevel top face
        // faint grid
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.strokeRect(x + 0.5, y + 0.5, TILE, TILE);
      }
    }

    _path(ctx, m) {
      // path tiles
      for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
        if (m.tileKind(c, r) !== 'path') continue;
        const x = c * TILE, y = r * TILE;
        ctx.fillStyle = P.pathEdge; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = P.path; ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 6);
      }
      // spawn/goal markers
      for (const path of m.paths) {
        ctx.fillStyle = P.blood; this._diamond(ctx, path.spawn.x, path.spawn.y, 8);
      }
      ctx.fillStyle = P.gold; this._diamond(ctx, m.goalPx.x, m.goalPx.y, 10);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }

    _decor(ctx, m) {
      // hazard glow / holy glow pulse
      const t = m.time;
      for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
        const k = m.tileKind(c, r);
        const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
        if (k === 'hazard') { ctx.fillStyle = `rgba(224,75,43,${0.25 + 0.15 * Math.sin(t * 4 + c)})`; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill(); }
        if (k === 'holy') { ctx.fillStyle = `rgba(245,230,168,${0.18 + 0.1 * Math.sin(t * 2 + r)})`; ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fill(); }
        if (k === 'highground') { ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.strokeRect(x - TILE / 2 + 3, y - TILE / 2 + 3, TILE - 6, TILE - 6); }
      }
    }

    _rangeAndGhost(ctx, m) {
      const sel = this.selected;
      if (sel && (this.showRange || true)) {
        const range = m._effectiveRange(sel);
        if (!sel.def.traits.globalAura) {
          ctx.fillStyle = 'rgba(217,164,65,0.08)'; ctx.strokeStyle = 'rgba(217,164,65,0.5)';
          ctx.beginPath(); ctx.arc(sel.x, sel.y, range, 0, TAU); ctx.fill(); ctx.stroke();
        }
      }
      if (this.showRange && !sel) {
        for (const t of m.towers) if (!t.def.traits.globalAura) {
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath(); ctx.arc(t.x, t.y, m._effectiveRange(t), 0, TAU); ctx.stroke();
        }
      }
      if (this.ghost && this.hover) {
        const def = this.ghost, { c, r } = this.hover;
        const chk = m.canPlace(def, c, r);
        const fp = def.traits.footprint || 1;
        ctx.fillStyle = chk.ok ? 'rgba(95,168,85,0.35)' : 'rgba(224,75,43,0.35)';
        ctx.fillRect(c * TILE, r * TILE, TILE * fp, TILE * fp);
        const cx = c * TILE + fp * TILE / 2, cy = r * TILE + fp * TILE / 2;
        if (!def.traits.globalAura) {
          ctx.strokeStyle = chk.ok ? 'rgba(95,168,85,0.6)' : 'rgba(224,75,43,0.6)';
          ctx.beginPath(); ctx.arc(cx, cy, def.rangeT * TILE, 0, TAU); ctx.stroke();
        }
        this._drawTower(ctx, { def, x: cx, y: cy, level: 1, ascended: false, muzzle: 0, flashT: 0, blocker: null }, 0.6);
        if (!chk.ok) { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(chk.reason, cx, cy - fp * TILE / 2 - 6); }
      }
    }

    _floatersDecal(ctx, m) {
      for (const f of m.floaters) if (f.kind === 'puddle') {
        ctx.fillStyle = `rgba(125,95,160,${0.2 + 0.15 * Math.sin(m.time * 5)})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      }
    }

    _diamond(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill(); }

    /* ------------------------------ towers ---------------------------- */
    _towers(ctx, m) {
      for (const t of m.towers) this._drawTower(ctx, t, 1);
    }

    _drawTower(ctx, t, alpha) {
      const ctxa = ctx; ctxa.save(); ctxa.globalAlpha = alpha;
      const x = t.x, y = t.y, rc = RS.rarityColor(t.def.rarity);
      // base shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 12, 16, 6, 0, 0, TAU); ctx.fill();
      // rarity platform ring
      ctx.strokeStyle = rc; ctx.lineWidth = t.ascended ? 3 : 2;
      ctx.beginPath(); ctx.arc(x, y + 8, 15, 0, TAU); ctx.stroke();
      if (t.ascended) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x, y + 8, 18 + Math.sin(Date.now() / 200) * 1.5, 0, TAU); ctx.stroke(); }
      // flash
      const flash = t.flashT > 0;
      this._towerGlyph(ctx, t, x, y, rc, flash);
      // level pips
      for (let i = 0; i < (t.level || 1); i++) { ctx.fillStyle = rc; ctx.fillRect(x - 12 + i * 5, y + 14, 3, 3); }
      // status ring for disabled/charmed/overheat
      if (t.charmT > 0) { ctx.strokeStyle = '#e04bcf'; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.stroke(); }
      if (t.disabledT > 0 || (t.overheatT > 0)) { ctx.strokeStyle = '#e04b4b'; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.stroke(); }
      // blocker hp
      if (t.blocker) {
        const b = t.blocker; const w = 24;
        if (b.respawnT > 0) { ctx.fillStyle = '#555'; ctx.fillRect(x - w / 2, y - 20, w, 3); }
        else { ctx.fillStyle = '#333'; ctx.fillRect(x - w / 2, y - 20, w, 3); ctx.fillStyle = P.good; ctx.fillRect(x - w / 2, y - 20, w * (b.hp / b.maxHp), 3); }
      }
      ctxa.restore();
    }

    _towerGlyph(ctx, t, x, y, rc, flash) {
      const shape = TOWER_SHAPE[t.def.id] || 'archer';
      ctx.save();
      const body = flash ? '#fff' : this._shade(rc, 0.55);
      const trim = flash ? '#fff' : rc;
      ctx.lineWidth = 2; ctx.strokeStyle = '#0008';
      switch (shape) {
        case 'blocker': // shield + helm
          ctx.fillStyle = P.stone; poly(ctx, [[x - 8, y - 2], [x + 8, y - 2], [x + 6, y + 10], [x, y + 14], [x - 6, y + 10]]); ctx.fill(); ctx.stroke();
          ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x, y - 8, 5, 0, TAU); ctx.fill();
          break;
        case 'archer': // tower + arrow
          ctx.fillStyle = body; poly(ctx, [[x - 7, y + 12], [x - 5, y - 10], [x + 5, y - 10], [x + 7, y + 12]]); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = trim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 8, y - 6); ctx.lineTo(x + 8, y - 10); ctx.stroke();
          break;
        case 'mage': // robe + orb
          ctx.fillStyle = body; poly(ctx, [[x, y - 14], [x + 8, y + 12], [x - 8, y + 12]]); ctx.fill(); ctx.stroke();
          ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x, y - 6, 4 + (t.muzzle > 0 ? 2 : 0), 0, TAU); ctx.fill();
          break;
        case 'catapult': // arm + weight
          ctx.fillStyle = P.timber; ctx.fillRect(x - 9, y + 4, 18, 8); ctx.strokeRect(x - 9, y + 4, 18, 8);
          ctx.strokeStyle = P.timberLight; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 6, y + 6); ctx.lineTo(x + 8, y - 10); ctx.stroke();
          ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x + 8, y - 10, 4, 0, TAU); ctx.fill();
          break;
        case 'cannon': // barrel
          ctx.fillStyle = P.stoneDark; ctx.fillRect(x - 8, y + 2, 16, 10); ctx.strokeRect(x - 8, y + 2, 16, 10);
          ctx.fillStyle = body; ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5); ctx.fillRect(-3, -14, 6, 16); ctx.restore();
          ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x + 6, y - 10, 3, 0, TAU); ctx.fill();
          break;
        case 'ballista':
          ctx.fillStyle = P.timber; ctx.fillRect(x - 9, y, 18, 6); ctx.strokeRect(x - 9, y, 18, 6);
          ctx.strokeStyle = trim; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 9, y - 8); ctx.quadraticCurveTo(x, y - 2, x + 9, y - 8); ctx.stroke();
          break;
        case 'watch': // tall thin tower
          ctx.fillStyle = body; ctx.fillRect(x - 5, y - 14, 10, 26); ctx.strokeRect(x - 5, y - 14, 10, 26);
          ctx.fillStyle = trim; poly(ctx, [[x - 6, y - 14], [x + 6, y - 14], [x, y - 20]]); ctx.fill();
          break;
        case 'brazier': // fire bowl
          ctx.fillStyle = P.stoneDark; ctx.fillRect(x - 3, y, 6, 12);
          ctx.fillStyle = '#e8722c'; ctx.beginPath(); ctx.arc(x, y - 2, 6, 0, TAU); ctx.fill();
          ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(x, y - 4, 3 + Math.sin(Date.now() / 120) * 1.5, 0, TAU); ctx.fill();
          break;
        case 'rider': // mounted
          ctx.fillStyle = body; ctx.fillRect(x - 9, y + 2, 18, 8); ctx.strokeRect(x - 9, y + 2, 18, 8);
          ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x, y - 6, 5, 0, TAU); ctx.fill();
          ctx.strokeStyle = trim; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 12, y - 14); ctx.stroke();
          break;
        case 'banner': // pole + flag
          ctx.strokeStyle = P.timber; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x, y - 16); ctx.stroke();
          ctx.fillStyle = trim; poly(ctx, [[x, y - 16], [x + 14, y - 12], [x, y - 4]]); ctx.fill();
          break;
        case 'falcon':
          ctx.fillStyle = body; ctx.fillRect(x - 6, y - 2, 12, 12); ctx.strokeRect(x - 6, y - 2, 12, 12);
          ctx.fillStyle = trim; poly(ctx, [[x, y - 12], [x + 6, y - 4], [x - 6, y - 4]]); ctx.fill();
          break;
        case 'spire': // tall arcane
          ctx.fillStyle = body; poly(ctx, [[x - 6, y + 12], [x, y - 20], [x + 6, y + 12]]); ctx.fill(); ctx.stroke();
          ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x, y - 8, 3, 0, TAU); ctx.fill();
          ctx.strokeStyle = trim; ctx.beginPath(); ctx.arc(x, y - 4, 9, 0, TAU); ctx.stroke();
          break;
        case 'flyer': // wyvern
          ctx.fillStyle = trim; poly(ctx, [[x - 14, y - 4], [x, y + 4], [x + 14, y - 4], [x, y]]); ctx.fill(); ctx.stroke();
          ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
          break;
        case 'dragon': // big
          ctx.fillStyle = this._shade(rc, 0.5); poly(ctx, [[x - 16, y + 14], [x - 6, y - 16], [x + 10, y - 10], [x + 16, y + 14]]); ctx.fill(); ctx.stroke();
          ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x + 6, y - 6, 6, 0, TAU); ctx.fill();
          ctx.fillStyle = '#e8722c'; ctx.beginPath(); ctx.arc(x + 12, y - 4, 3, 0, TAU); ctx.fill();
          break;
        case 'grail': // radiant chalice
          ctx.fillStyle = '#fff'; poly(ctx, [[x - 7, y - 10], [x + 7, y - 10], [x + 4, y + 2], [x - 4, y + 2]]); ctx.fill(); ctx.stroke();
          ctx.fillStyle = P.gold; ctx.fillRect(x - 2, y + 2, 4, 10);
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(x, y - 4, 12 + Math.sin(Date.now() / 150) * 2, 0, TAU); ctx.stroke();
          break;
        case 'forge': // world construct
          ctx.fillStyle = this._shade(rc, 0.5); ctx.fillRect(x - 10, y - 8, 20, 20); ctx.strokeRect(x - 10, y - 8, 20, 20);
          ctx.fillStyle = P.frost; ctx.beginPath(); ctx.arc(x, y + 2, 5, 0, TAU); ctx.fill();
          ctx.strokeStyle = P.frost; ctx.beginPath(); ctx.arc(x, y + 2, 12, 0, TAU); ctx.stroke();
          break;
        default:
          ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill(); ctx.stroke();
      }
      // muzzle flash
      if (t.muzzle > 0) { ctx.fillStyle = 'rgba(255,240,180,0.8)'; ctx.beginPath(); ctx.arc(x, y - 8, 4 + t.muzzle * 40, 0, TAU); ctx.fill(); }
      ctx.restore();
    }

    /* ------------------------------ enemies --------------------------- */
    _enemies(ctx, m) {
      const arr = m.enemies.slice().sort((a, b) => a.y - b.y);
      for (const e of arr) if (e.alive) this._drawEnemy(ctx, e);
    }

    _drawEnemy(ctx, e) {
      const x = e.x, y = e.y;
      const fam = e.def.family;
      const famCol = { Bandit: '#8a6b3a', Orc: '#5c7a3a', Undead: '#c8c8b8', Demon: '#8a2c2c', Arcane: '#5f7bb5', Aerial: '#7a8a9a' }[fam] || '#999';
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 8, e.isBoss ? 20 : 8, e.isBoss ? 8 : 4, 0, 0, TAU); ctx.fill();
      const flash = e.flashT > 0;
      const body = flash ? '#fff' : famCol;
      const scale = e.isBoss ? 2.2 : 1;
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#0008';
      this._enemyMotif(ctx, e.def.motif, body, flash);
      ctx.restore();
      // flying altitude line
      if (e.isFlying && !e.isBoss) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 14); ctx.stroke(); }
      // hp bar
      const w = e.isBoss ? 44 : 16, hp = Math.max(0, e.hp / e.maxHp);
      const by = y - (e.isBoss ? 28 : 12);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2, by, w, 3);
      ctx.fillStyle = hp > 0.5 ? P.good : hp > 0.25 ? P.warn : P.bad; ctx.fillRect(x - w / 2, by, w * hp, 3);
      // status pips
      let sx = x - w / 2;
      const s = e.status;
      if (s.burn) { ctx.fillStyle = '#e8722c'; ctx.fillRect(sx, by - 4, 3, 3); sx += 4; }
      if (s.slow) { ctx.fillStyle = P.frost; ctx.fillRect(sx, by - 4, 3, 3); sx += 4; }
      if (s.stun && s.stun.t > 0) { ctx.fillStyle = '#f5e6a8'; ctx.fillRect(sx, by - 4, 3, 3); sx += 4; }
      if (e.shieldHits > 0) { ctx.strokeStyle = P.frost; ctx.beginPath(); ctx.arc(x, y, 12, -0.6, 0.6); ctx.stroke(); }
    }

    _enemyMotif(ctx, motif, body, flash) {
      ctx.fillStyle = body;
      switch (motif) {
        case 'humanoid': poly(ctx, [[-4, 6], [-4, -4], [0, -8], [4, -4], [4, 6]]); ctx.fill(); ctx.stroke(); break;
        case 'orc': poly(ctx, [[-6, 6], [-5, -4], [0, -9], [5, -4], [6, 6]]); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#3a4a20'; ctx.fillRect(-2, -6, 4, 3); break;
        case 'ogre': poly(ctx, [[-8, 8], [-7, -6], [0, -11], [7, -6], [8, 8]]); ctx.fill(); ctx.stroke(); break;
        case 'goblin': ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); ctx.stroke(); break;
        case 'skeleton': poly(ctx, [[-3, 6], [-4, -4], [0, -8], [4, -4], [3, 6]]); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#555'; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke(); break;
        case 'zombie': poly(ctx, [[-4, 6], [-5, -3], [0, -7], [5, -3], [4, 6]]); ctx.fill(); ctx.stroke(); break;
        case 'wraith': ctx.globalAlpha *= 0.7; poly(ctx, [[-6, 8], [-3, -8], [3, -8], [6, 8], [0, 4]]); ctx.fill(); ctx.globalAlpha /= 0.7; break;
        case 'imp': poly(ctx, [[-4, 4], [0, -6], [4, 4]]); ctx.fill(); ctx.stroke(); ctx.strokeStyle = body; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-2, -2); ctx.moveTo(6, 0); ctx.lineTo(2, -2); ctx.stroke(); break;
        case 'hound': poly(ctx, [[-8, 4], [-6, -2], [-2, -3], [6, -2], [8, 4]]); ctx.fill(); ctx.stroke(); break;
        case 'demon': poly(ctx, [[-6, 8], [-6, -4], [-3, -10], [0, -6], [3, -10], [6, -4], [6, 8]]); ctx.fill(); ctx.stroke(); break;
        case 'golem': ctx.fillRect(-6, -6, 12, 14); ctx.strokeRect(-6, -6, 12, 14); break;
        case 'wisp': ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill(); break;
        case 'harpy': poly(ctx, [[-10, -2], [0, 2], [10, -2], [0, 6]]); ctx.fill(); ctx.stroke(); break;
        case 'griffon': poly(ctx, [[-12, -2], [-2, 2], [0, -6], [2, 2], [12, -2], [0, 8]]); ctx.fill(); ctx.stroke(); break;
        case 'wyvern': poly(ctx, [[-12, 0], [0, 4], [12, 0], [4, -6], [-4, -6]]); ctx.fill(); ctx.stroke(); break;
        case 'boss': // large jagged crown silhouette
          poly(ctx, [[-10, 10], [-10, -4], [-6, -10], [-2, -4], [0, -12], [2, -4], [6, -10], [10, -4], [10, 10]]); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#e04b4b'; ctx.beginPath(); ctx.arc(-3, -2, 2, 0, TAU); ctx.arc(3, -2, 2, 0, TAU); ctx.fill();
          break;
        default: ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); ctx.stroke();
      }
    }

    _summons(ctx, m) {
      for (const s of m.summons) {
        if (s.kind === 'falcon') { ctx.fillStyle = '#d9cba0'; poly(ctx, [[s.x - 7, s.y], [s.x, s.y + 3], [s.x + 7, s.y], [s.x, s.y - 3]]); ctx.fill(); }
        else if (s.kind === 'wraith') { ctx.fillStyle = 'rgba(125,95,160,0.8)'; ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, TAU); ctx.fill(); }
        else if (s.kind === 'turret') { ctx.fillStyle = P.stoneDark; ctx.fillRect(s.x - 6, s.y - 6, 12, 12); ctx.strokeStyle = '#000'; ctx.strokeRect(s.x - 6, s.y - 6, 12, 12); ctx.fillStyle = '#888'; ctx.fillRect(s.x - 2, s.y - 10, 4, 8); }
      }
    }

    _projectiles(ctx, m) {
      m.projPool.forEachActive((p) => {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.splash > 0 ? 4 : 2.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = p.color + '88'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y);
        if (p.target) { const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy) || 1; ctx.lineTo(p.x - dx / d * 8, p.y - dy / d * 8); ctx.stroke(); }
      });
    }

    _particles(ctx, m) {
      m.particlePool.forEachActive((p) => {
        ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.r, p.r);
      });
      ctx.globalAlpha = 1;
    }

    _fx(ctx, m) {
      if (!m._fx) return;
      for (const f of m._fx) {
        const a = Math.max(0, f.t / 0.16);
        ctx.globalAlpha = a; ctx.strokeStyle = f.color; ctx.lineWidth = f.kind === 'beam' ? 3 : 2;
        if (f.kind === 'arc' || f.kind === 'beam') { ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
        if (f.kind === 'cone') { ctx.fillStyle = f.color + '55'; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.reach, f.ang - f.half, f.ang + f.half); ctx.closePath(); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }

    _floaters(ctx, m) {
      ctx.textAlign = 'center';
      for (const f of m.floaters) {
        if (f.kind !== 'text') continue;
        ctx.globalAlpha = Math.max(0, f.t / 0.9);
        ctx.font = (f.big ? 'bold 18px' : 'bold 12px') + ' sans-serif';
        ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x + 1, f.y + 1);
        ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }

    _night(ctx, m) {
      if (m.isNight) {
        ctx.fillStyle = 'rgba(20,20,60,0.35)'; ctx.fillRect(-40, -40, this.canvas.width + 80, this.canvas.height + 80);
        // lit radii around light towers
        for (const t of m.towers) { const lt = t.def.traits.light; if (lt) { const g = ctx.createRadialGradient(t.x, t.y, 4, t.x, t.y, lt * TILE); g.addColorStop(0, 'rgba(255,220,150,0.25)'); g.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(t.x, t.y, lt * TILE, 0, TAU); ctx.fill(); } }
      }
      // weather overlay tint
      const wm = { Rain: 'rgba(60,90,140,0.10)', Fog: 'rgba(200,200,200,0.14)', Blizzard: 'rgba(180,220,240,0.16)', Ashfall: 'rgba(120,60,30,0.12)', Storm: 'rgba(40,40,70,0.14)' }[m.weather];
      if (wm) { ctx.fillStyle = wm; ctx.fillRect(-40, -40, this.canvas.width + 80, this.canvas.height + 80); }
    }

    _shade(hex, f) {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
      return `rgb(${r},${g},${b})`;
    }
  }

  RS.Renderer = Renderer;
})();
