/* =========================================================================
 * REALM SIEGE — js/sprites.js
 * Procedural low-poly art: shade()/facet() helpers, 26 distinct animated tower
 * silhouettes, and cached enemy walk-cycle sprite sheets (offscreen canvases
 * rendered once per motif, then blitted — the key to 200 enemies at 60 FPS).
 *
 * PURELY PRESENTATIONAL. No sim state is read or written here.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const A = RS.art, TAU = Math.PI * 2;
  const shade = A.shade;

  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
  function facet(ctx, pts, color, rim) {
    poly(ctx, pts); ctx.fillStyle = color; ctx.fill();
    // Heavier contour than a hairline — silhouettes need to hold up against
    // busy terrain at small scale, so every facet carries a real outline.
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.stroke();
    if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke(); }
  }
  // Canvas throws on a negative/NaN radius, which would kill the whole frame.
  // Every computed radius in the render path goes through this guard.
  const R0 = (v) => (isFinite(v) && v > 0 ? v : 0);
  function circ(ctx, x, y, r, color, rim) { ctx.beginPath(); ctx.arc(x, y, R0(r), 0, TAU); ctx.fillStyle = color; ctx.fill(); if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = 1; ctx.stroke(); } }

  /* ============================ TOWERS =============================== */
  const Sil = {};

  // Rarity dais: faceted octagon platform + glow + ring.
  function dais(ctx, x, y, s, def, o) {
    const pal = RS.rarityPal(def.rarity);
    ctx.save();
    // glow
    if (pal.glowStr > 0.1) {
      const gr = ctx.createRadialGradient(x, y, 2, x, y, 22 * s);
      const gc = pal.prismatic ? A.prismatic(o.t, def._ph || 0) : pal.glow;
      gr.addColorStop(0, A.alpha(gc, pal.glowStr)); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 22 * s, 0, TAU); ctx.fill();
    }
    // Carved octagonal plinth: shadowed skirt, lit top face, inlaid rim and a
    // ring of rarity studs. Reads as cut stone rather than a flat hexagon.
    const r = 14 * s;
    const oct = (rr, dy, sq) => {
      const pts = []; const k = 0.62;
      pts.push([x - rr, y + dy], [x - rr * k, y - 5 * s * sq + dy], [x + rr * k, y - 5 * s * sq + dy],
               [x + rr, y + dy], [x + rr * k, y + 4 * s * sq + dy], [x - rr * k, y + 4 * s * sq + dy]);
      return pts;
    };
    // skirt (side face, in shadow)
    facet(ctx, oct(r, 4 * s, 1), A.mul(pal.dais, 0.55));
    // top face, lit
    facet(ctx, oct(r, 0, 1), A.mul(pal.dais, 1.18), A.mul(pal.dais, 1.6));
    // inner inlay
    facet(ctx, oct(r * 0.66, -0.5 * s, 0.9), A.mul(pal.dais, 0.92));
    // rarity ring + studs
    ctx.lineWidth = def._asc ? 2.5 : 1.5;
    const ringCol = pal.prismatic ? A.prismatic(o.t, 1) : pal.base;
    ctx.strokeStyle = ringCol;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.98, 5.2 * s, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = ringCol;
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU + (o.t || 0) * 0.15;
      ctx.beginPath(); ctx.arc(x + Math.cos(ang) * r * 0.98, y + Math.sin(ang) * 5.2 * s, 1.3 * s, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // helper metal/wood ramps
  const woodL = () => RS.RAMP.timber.light, woodM = () => RS.RAMP.timber.mid, woodD = () => RS.RAMP.timber.shadow;

  // --- COMMON ---
  Sil.militia = (ctx, r, a, p) => { // spear + round shield blocker
    facet(ctx, [[-7, 10], [-5, -4], [0, -8], [5, -4], [7, 10]], r.mid, r.rim);
    circ(ctx, -6, 2, 5, RS.RAMP.iron.mid, RS.RAMP.iron.rim); // shield
    ctx.strokeStyle = woodM(); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, 12); ctx.lineTo(9 + p.lunge, -14); ctx.stroke();
    facet(ctx, [[9 + p.lunge, -16], [11 + p.lunge, -12], [7 + p.lunge, -12]], RS.RAMP.iron.light);
    circ(ctx, 0, -9, 3.5, RS.RAMP.flesh.mid); };
  Sil.archer = (ctx, r, a, p) => { // bowman drawing a bow
    facet(ctx, [[-5, 10], [-4, -6], [4, -6], [5, 10]], RS.RAMP.leather.mid, RS.RAMP.leather.rim);
    circ(ctx, 0, -9, 3.5, RS.RAMP.flesh.mid);
    ctx.save(); ctx.rotate(a);
    const draw = p.draw; // 0..1 bow tension
    ctx.strokeStyle = woodL(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(8, 0, 8, -1.4, 1.4); ctx.stroke();
    ctx.strokeStyle = '#d8cba0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8 + Math.cos(-1.4) * 8, Math.sin(-1.4) * 8); ctx.lineTo(2 - draw * 3, 0); ctx.lineTo(8 + Math.cos(1.4) * 8, Math.sin(1.4) * 8); ctx.stroke();
    if (draw > 0.1) { ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(2 - draw * 3, 0); ctx.lineTo(14, 0); ctx.stroke(); }
    ctx.restore(); };
  Sil.brazier = (ctx, r, a, p) => { // fire bowl
    facet(ctx, [[-3, 12], [-4, 2], [4, 2], [3, 12]], RS.RAMP.iron.shadow);
    facet(ctx, [[-6, 2], [6, 2], [4, -2], [-4, -2]], RS.RAMP.iron.mid, RS.RAMP.iron.rim);
    const f = 3 + Math.sin(p.t * 8) * 1.5;
    circ(ctx, 0, -3, 5 + f * 0.3, '#e8722c'); circ(ctx, 0, -5, 3 + f * 0.3, '#f5c542'); };
  Sil.slinger = (ctx, r, a, p) => { // sling + rock
    facet(ctx, [[-8, 11], [-6, 4], [6, 4], [8, 11]], woodM(), woodL());
    ctx.save(); ctx.rotate(-0.5 + p.recoil * 0.5); ctx.strokeStyle = woodL(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(6, -12); ctx.stroke();
    circ(ctx, 6, -12, 4, RS.RAMP.stone.mid, RS.RAMP.stone.rim); ctx.restore(); };
  Sil.watchtower = (ctx, r, a, p) => { // tall spotter tower
    facet(ctx, [[-5, 12], [-4, -12], [4, -12], [5, 12]], woodM(), woodL());
    facet(ctx, [[-6, -12], [6, -12], [3, -18], [-3, -18]], r.mid, r.rim);
    circ(ctx, 0, -14, 2, RS.RAMP.iron.light); };
  // --- UNCOMMON ---
  Sil.crossbow = (ctx, r, a, p) => {
    facet(ctx, [[-5, 10], [-4, -5], [4, -5], [5, 10]], RS.RAMP.leather.mid);
    circ(ctx, 0, -8, 3.2, RS.RAMP.flesh.mid);
    ctx.save(); ctx.rotate(a); facet(ctx, [[-2, -2], [14 - p.recoil * 4, -2], [14 - p.recoil * 4, 2], [-2, 2]], RS.RAMP.iron.mid, RS.RAMP.iron.rim);
    ctx.strokeStyle = woodD(); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(4, 6); ctx.stroke(); ctx.restore(); };
  Sil.menatarms = (ctx, r, a, p) => { // big shield + sword
    facet(ctx, [[-8, 11], [-6, -5], [0, -9], [6, -5], [8, 11]], r.mid, r.rim);
    facet(ctx, [[-9, -3], [-3, -6], [-3, 8], [-9, 5]], RS.RAMP.steel.mid, RS.RAMP.steel.rim); // shield
    ctx.strokeStyle = RS.RAMP.steel.light; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(11 + p.lunge, -12); ctx.stroke();
    circ(ctx, 0, -10, 3.5, RS.RAMP.iron.mid); };
  Sil.hedgewizard = (ctx, r, a, p) => { // robed, staff orb
    facet(ctx, [[0, -14], [8, 12], [-8, 12]], RS.RAMP.cloth.mid, RS.RAMP.cloth.rim);
    facet(ctx, [[0, -14], [-3, -6], [3, -6]], A.mul('#4a2f6a', 1.2));
    ctx.strokeStyle = woodM(); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(7, 12); ctx.lineTo(9, -12); ctx.stroke();
    circ(ctx, 9, -13, 3 + p.charge * 2, '#c79bff', '#e0c0ff'); };
  Sil.ballista = (ctx, r, a, p) => {
    facet(ctx, [[-9, 11], [-7, 3], [7, 3], [9, 11]], woodM(), woodL());
    ctx.save(); ctx.rotate(a); ctx.strokeStyle = woodL(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2, -9); ctx.quadraticCurveTo(6 - p.recoil * 3, -1, -2, 9); ctx.stroke();
    facet(ctx, [[-2 - p.recoil * 5, -1.5], [12 - p.recoil * 5, -1.5], [15 - p.recoil * 5, 0], [12 - p.recoil * 5, 1.5], [-2 - p.recoil * 5, 1.5]], RS.RAMP.iron.mid); ctx.restore(); };
  // --- RARE ---
  Sil.longbow = (ctx, r, a, p) => { // tall archer, long yew bow
    facet(ctx, [[-4, 12], [-4, -10], [4, -10], [4, 12]], RS.RAMP.leather.mid, RS.RAMP.leather.rim);
    circ(ctx, 0, -13, 3.2, RS.RAMP.flesh.mid);
    ctx.save(); ctx.rotate(a); ctx.strokeStyle = woodL(); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(6, 0, 13, -1.2, 1.2); ctx.stroke();
    const d = p.draw; ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(6 + Math.cos(-1.2) * 13, Math.sin(-1.2) * 13); ctx.lineTo(0 - d * 4, 0); ctx.lineTo(6 + Math.cos(1.2) * 13, Math.sin(1.2) * 13); ctx.stroke();
    if (d > 0.1) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0 - d * 4, 0); ctx.lineTo(18, 0); ctx.stroke(); } ctx.restore(); };
  Sil.knight = (ctx, r, a, p) => { // mounted knight
    facet(ctx, [[-10, 10], [-8, 3], [8, 3], [10, 10]], RS.RAMP.steel.shadow); // horse body
    facet(ctx, [[-8, 3], [-6, -8], [-2, -8], [-2, 3]], r.mid, r.rim);
    circ(ctx, -5, -10, 3, RS.RAMP.steel.mid);
    ctx.strokeStyle = RS.RAMP.steel.light; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(12 + p.lunge, -12); ctx.stroke(); };
  Sil.cleric = (ctx, r, a, p) => { // banner + halo
    ctx.strokeStyle = woodM(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -16); ctx.stroke();
    const w = Math.sin(p.t * 3) * 2;
    facet(ctx, [[0, -16], [14, -13 + w], [13, -5 - w], [0, -6]], '#e8dcc0', '#fff');
    facet(ctx, [[3, -13], [8, -11], [3, -9]], '#d9a441');
    ctx.strokeStyle = A.alpha('#f5e6a8', 0.6 + Math.sin(p.t * 2) * 0.2); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -14, 5, 0, TAU); ctx.stroke(); };
  Sil.trebuchet = (ctx, r, a, p) => { // big A-frame
    facet(ctx, [[-11, 12], [-3, -12], [-1, -12], [-7, 12]], woodM(), woodL());
    facet(ctx, [[11, 12], [3, -12], [1, -12], [7, 12]], woodD());
    const arm = -0.7 + p.recoil * 2.2;
    ctx.save(); ctx.translate(0, -11); ctx.rotate(arm); ctx.strokeStyle = woodL(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(12, 0); ctx.stroke();
    facet(ctx, [[-13, -3], [-8, -3], [-8, 4], [-13, 4]], RS.RAMP.stone.shadow); // counterweight
    if (p.recoil < 0.5) circ(ctx, 12, 3, 3.5, RS.RAMP.stone.mid); ctx.restore(); };
  // --- EPIC ---
  Sil.templar = (ctx, r, a, p) => { // holy knight, tower shield + cross
    facet(ctx, [[-7, 11], [-6, -6], [0, -10], [6, -6], [7, 11]], r.mid, r.rim);
    facet(ctx, [[-9, -6], [-2, -8], [-2, 9], [-9, 7]], '#e8dcc0', '#fff');
    ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-5.5, -5); ctx.lineTo(-5.5, 5); ctx.moveTo(-8, 0); ctx.lineTo(-3, 0); ctx.stroke();
    ctx.strokeStyle = '#f5e6a8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(11 + p.lunge, -12); ctx.stroke();
    circ(ctx, 0, -11, 3.4, RS.RAMP.steel.mid); };
  Sil.frostmagus = (ctx, r, a, p) => { // frost-robed with icy orb
    facet(ctx, [[0, -14], [8, 12], [-8, 12]], RS.RAMP.ice.shadow, RS.RAMP.ice.rim);
    facet(ctx, [[0, -14], [-3, -5], [3, -5]], '#bfeaf5');
    circ(ctx, 0, -6, 4 + Math.sin(p.t * 2) * 0.6, '#8fd4e8', '#e0f8ff');
    for (let i = 0; i < 3; i++) { const ang = p.t * 1.2 + i * 2.1; circ(ctx, Math.cos(ang) * 10, -6 + Math.sin(ang) * 4, 1.4, '#e0f8ff'); } };
  Sil.bombard = (ctx, r, a, p) => { // heavy cannon
    facet(ctx, [[-9, 12], [-7, 4], [7, 4], [9, 12]], RS.RAMP.iron.shadow);
    circ(ctx, -7, 10, 3, RS.RAMP.iron.mid); circ(ctx, 7, 10, 3, RS.RAMP.iron.mid);
    ctx.save(); ctx.translate(-p.recoil * 5 * Math.cos(a), -p.recoil * 5 * Math.sin(a)); ctx.rotate(a);
    facet(ctx, [[-4, -5], [12, -6], [14, 0], [12, 6], [-4, 5]], RS.RAMP.steel.mid, RS.RAMP.steel.rim);
    circ(ctx, 14, 0, 3, '#1a1a1a'); ctx.restore(); };
  Sil.falconer = (ctx, r, a, p) => { // falconer with raised gauntlet
    facet(ctx, [[-5, 11], [-4, -6], [4, -6], [5, 11]], RS.RAMP.leather.mid, r.rim);
    circ(ctx, 0, -9, 3.2, RS.RAMP.flesh.mid);
    facet(ctx, [[6, -8], [12, -12], [10, -6]], r.mid); // falcon on arm
    circ(ctx, 11, -11, 2, r.light); };
  // --- LEGENDARY ---
  Sil.paladin = (ctx, r, a, p) => { // champion, glowing sword + aura crest
    facet(ctx, [[-8, 12], [-6, -7], [0, -12], [6, -7], [8, 12]], r.mid, r.rim);
    facet(ctx, [[-10, -5], [-2, -9], [-2, 10], [-10, 8]], '#e8dcc0', '#fff');
    ctx.save(); ctx.rotate(-0.3 - p.lunge * 0.4); ctx.strokeStyle = '#fff2c0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(9, -18); ctx.stroke();
    ctx.strokeStyle = A.alpha('#ffcb5a', 0.7); ctx.lineWidth = 5; ctx.stroke(); ctx.restore();
    circ(ctx, 0, -12, 3.6, RS.RAMP.gold.mid, RS.RAMP.gold.rim); };
  Sil.archmage = (ctx, r, a, p) => { // floating crystalline spire + orbiting runes
    const fl = Math.sin(p.t * 1.5) * 2;
    facet(ctx, [[-6, 12 + fl], [0, -18 + fl], [6, 12 + fl]], A.mul('#6a3fa5', 1.1), '#c79bff');
    facet(ctx, [[0, -18 + fl], [-3, -6 + fl], [3, -6 + fl]], '#c79bff');
    circ(ctx, 0, -8 + fl, 3 + p.charge * 2, '#e0c0ff', '#fff');
    for (let i = 0; i < 4; i++) { const ang = p.t * RS.ANIM.runeRotate * TAU + i * 1.57; circ(ctx, Math.cos(ang) * 12, -8 + Math.sin(ang) * 5 + fl, 1.6, '#c79bff'); } };
  Sil.engineer = (ctx, r, a, p) => { // siege workshop with gear
    facet(ctx, [[-9, 12], [-9, -4], [9, -4], [9, 12]], woodM(), woodL());
    facet(ctx, [[-9, -4], [9, -4], [6, -9], [-6, -9]], RS.RAMP.iron.shadow);
    const g = p.t * 1.5; ctx.save(); ctx.translate(2, 2); ctx.rotate(g); for (let i = 0; i < 6; i++) { const ang = i / 6 * TAU; facet(ctx, [[Math.cos(ang) * 4, Math.sin(ang) * 4], [Math.cos(ang + 0.3) * 7, Math.sin(ang + 0.3) * 7], [Math.cos(ang + 0.6) * 4, Math.sin(ang + 0.6) * 4]], RS.RAMP.iron.mid); } ctx.restore();
    circ(ctx, 2, 2, 3, RS.RAMP.iron.light); };
  Sil.wyvernrider = (ctx, r, a, p) => { // small wyvern mount hovering
    const flap = Math.sin(p.t * 6) * 5;
    facet(ctx, [[-16, -2 - flap], [-2, 3], [0, -4], [-4, -6 - flap]], A.mul(r.mid, 0.9), r.rim);
    facet(ctx, [[16, -2 - flap], [2, 3], [0, -4], [4, -6 - flap]], A.mul(r.mid, 0.9), r.rim);
    facet(ctx, [[-6, 6], [6, 6], [3, -3], [-3, -3]], r.mid, r.rim);
    circ(ctx, 5, -2, 3, r.light); circ(ctx, 6, -3, 1, '#e8722c'); };
  Sil.basilisk = (ctx, r, a, p) => { // The Sultan's Basilisk — a huge Ottoman-
    // style siege bombard: heavy wooden cradle, iron-banded barrel, a visible
    // reload glow that builds toward the long-awaited shot, and a big recoil kick.
    const kick = p.recoil * 9; // deep recoil along the barrel axis
    // wide timber carriage + wheels (grounds the huge silhouette)
    facet(ctx, [[-20, 14], [-20, 6], [20, 6], [20, 14]], woodM(), woodL());
    circ(ctx, -13, 15, 6, RS.RAMP.timber.shadow, RS.RAMP.timber.light);
    circ(ctx, 13, 15, 6, RS.RAMP.timber.shadow, RS.RAMP.timber.light);
    for (let i = 0; i < 6; i++) { const sp = i / 6 * TAU; ctx.strokeStyle = RS.RAMP.iron.mid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-13, 15); ctx.lineTo(-13 + Math.cos(sp) * 6, 15 + Math.sin(sp) * 6); ctx.moveTo(13, 15); ctx.lineTo(13 + Math.cos(sp) * 6, 15 + Math.sin(sp) * 6); ctx.stroke(); }
    // trunnion cradle
    facet(ctx, [[-9, 6], [9, 6], [9, -2], [-9, -2]], RS.RAMP.timber.shadow, RS.RAMP.timber.mid);
    // the great barrel — thick, tapering, riding the recoil
    ctx.save(); ctx.translate(-kick * Math.cos(a), -kick * Math.sin(a)); ctx.rotate(a);
    facet(ctx, [[-6, -8], [26, -6], [30, 0], [26, 6], [-6, 8]], A.mul(r.mid, 0.85), r.rim);
    // iron reinforcing bands (the iconic Dardanelles-gun rings)
    ctx.strokeStyle = RS.RAMP.iron.light; ctx.lineWidth = 2;
    for (const bx of [-2, 6, 14, 22]) { ctx.beginPath(); ctx.moveTo(bx, -7 + (bx > 10 ? -1 : 0)); ctx.lineTo(bx, 7 + (bx > 10 ? 1 : 0)); ctx.stroke(); }
    circ(ctx, 30, 0, 3.2, '#1a1a1a'); // muzzle bore
    // reload glow: an ember building in the breech as it charges toward ready
    if (p.reload > 0.05) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; circ(ctx, -4, 0, 2 + p.reload * 3, A.alpha('#ff6a2a', p.reload)); ctx.restore(); }
    ctx.restore();
    // loading crew — small figures that "work" the gun while it reloads
    const heave = Math.sin(p.t * 3) * (1 - p.reload) * 2;
    facet(ctx, [[-16, 4 - heave], [-14, -3 - heave], [-12, 4 - heave]], RS.RAMP.leather.mid);
    facet(ctx, [[14, 4 + heave], [16, -3 + heave], [18, 4 + heave]], RS.RAMP.leather.mid);
    // loader pips: four glowing dots along the carriage that fill in as reload progresses
    for (let i = 0; i < 4; i++) { const lit = p.reload >= (i + 1) / 4; ctx.fillStyle = lit ? '#ffcb5a' : 'rgba(255,255,255,0.18)'; circ(ctx, -12 + i * 8, 11, 1.6, ctx.fillStyle); }
    // banner of rarity on a short standard
    ctx.strokeStyle = RS.RAMP.timber.shadow; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-19, 6); ctx.lineTo(-19, -6); ctx.stroke();
    facet(ctx, [[-19, -6], [-13, -4], [-19, -2]], r.light); };
  // --- MYTHIC ---
  Sil.marshal = (ctx, r, a, p) => { // grand banner + crown
    ctx.strokeStyle = RS.RAMP.gold.mid; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -18); ctx.stroke();
    const w = Math.sin(p.t * 2.5) * 3;
    facet(ctx, [[0, -18], [16, -14 + w], [15, -3 - w], [0, -5]], '#a02c2c', '#d9a441');
    facet(ctx, [[3, -14], [10, -11], [3, -8]], '#d9a441');
    facet(ctx, [[-4, -18], [4, -18], [3, -23], [1, -20], [0, -24], [-1, -20], [-3, -23]], RS.RAMP.gold.light, RS.RAMP.gold.rim); };
  Sil.wyrm = (ctx, r, a, p) => { // coiled 2x2 dragon
    const br = Math.sin(p.t * 1.5) * 1.5;
    facet(ctx, [[-18, 16], [-6, -18 + br], [10, -10], [18, 16]], A.mul(r.mid, 0.85), r.rim);
    facet(ctx, [[-6, -18 + br], [-14, -8], [-2, -6]], A.mul(r.mid, 0.7)); // wing
    facet(ctx, [[10, -10], [22, -14], [18, -4]], A.mul(r.mid, 0.9)); // head
    circ(ctx, 18, -10, 2.5, '#ffcb5a'); circ(ctx, 20, -12, 3 + Math.sin(p.t * 4) * 1.5, '#e8722c'); };
  Sil.lich = (ctx, r, a, p) => { // necromancer, skull staff
    facet(ctx, [[0, -14], [8, 12], [-8, 12]], RS.RAMP.void.mid, '#7b4fb5');
    facet(ctx, [[0, -14], [-3, -6], [3, -6]], '#3a2a4a');
    circ(ctx, 0, -9, 3, RS.RAMP.bone.light);
    ctx.strokeStyle = RS.RAMP.void.shadow; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, 12); ctx.lineTo(9, -14); ctx.stroke();
    circ(ctx, 9, -15, 3, RS.RAMP.bone.mid); circ(ctx, 8, -15, 0.8, '#7bff9f'); circ(ctx, 10.2, -15, 0.8, '#7bff9f'); };
  // --- MYTHIC+ ---
  Sil.grail = (ctx, r, a, p) => { // radiant chalice
    const pr = A.prismatic(p.t, 0);
    facet(ctx, [[-8, -10], [8, -10], [5, 3], [-5, 3]], '#fff', '#fff');
    facet(ctx, [[-3, 3], [3, 3], [4, 12], [-4, 12]], RS.RAMP.gold.mid);
    const g = ctx.createRadialGradient(0, -6, 1, 0, -6, 16); g.addColorStop(0, A.alpha('#fff8d0', 0.9)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -6, 16, 0, TAU); ctx.fill();
    ctx.strokeStyle = A.alpha('#fff', 0.7 + Math.sin(p.t * 3) * 0.2); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -6, 13, 0, TAU); ctx.stroke(); };
  Sil.sovereign = (ctx, r, a, p) => { // geometric worldforge construct
    ctx.save(); ctx.rotate(Math.sin(p.t * 0.5) * 0.1);
    facet(ctx, [[-10, -8], [10, -8], [12, 8], [-12, 8]], A.mul('#3a3a44', 1.2), '#8fd4e8');
    facet(ctx, [[-10, -8], [10, -8], [7, -12], [-7, -12]], A.mul('#3a3a44', 1.5));
    ctx.restore();
    const ang = p.t * 0.8; for (let i = 0; i < 3; i++) { const aa = ang + i * 2.09; circ(ctx, Math.cos(aa) * 13, Math.sin(aa) * 8, 2, A.prismatic(p.t, i)); }
    circ(ctx, 0, 0, 4 + Math.sin(p.t * 2) * 1, '#8fd4e8', '#e0f8ff'); };

  function drawTower(ctx, def, x, y, o) {
    o = o || {}; const t = o.t || 0;
    const art = RS.TOWER_ART[def.id] || { sil: 'archer', anim: 'archer' };
    const s = (art.scale || 1) * (o.scale || 1);
    def._ph = def._ph || (Math.abs(hashStr(def.id)) % 100) / 100;
    def._asc = o.ascended;
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(x, y + 13 * s, 15 * s, 5.5 * s, 0, 0, TAU); ctx.fill();
    dais(ctx, x, y + 8 * s, s, def, o);
    // animation params
    const bob = Math.sin(t * RS.ANIM.idleBobHz * TAU + def._ph * TAU) * 1.1;
    const p = {
      t, lunge: 0, recoil: o.atk || 0, draw: 0, charge: 0, reload: o.reload != null ? o.reload : 1,
    };
    // per-anim idle/attack shaping
    const atk = o.atk || 0; // 0..1 attack progress
    if (art.anim === 'archer') p.draw = 0.15 + Math.sin(t * 2 + def._ph) * 0.08 + (atk < 0.5 ? atk * 1.6 : (1 - atk) * 0.4);
    if (art.anim === 'mage') p.charge = atk;
    if (art.anim === 'blocker') p.lunge = atk * 3;
    if (art.anim === 'siege') p.recoil = atk;
    const r = RS.rarityRamp(def.rarity);
    ctx.save();
    ctx.translate(x, y - bob);
    if (o.place != null && o.place < 1) { const sc = RS.EASE.easeOutBack(RS.art.clamp(o.place, 0, 1)); ctx.scale(sc, 2 - sc); }
    (Sil[art.sil] || Sil.archer)(ctx, r, o.aim || 0, p);
    ctx.restore();
    // muzzle bloom
    if (atk > 0.55) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (atk - 0.55) * 2; circ(ctx, x + Math.cos(o.aim || 0) * 10, y - 6 + Math.sin(o.aim || 0) * 10, 5, RS.rarityPal(def.rarity).glow); ctx.restore(); }
    // ascension prism overlay
    if (o.ascended) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = A.alpha(RS.rarityPal(def.rarity).prismatic ? A.prismatic(t, 2) : '#fff', 0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 17 * s + Math.sin(t * 3) * 1.5, 0, TAU); ctx.stroke(); ctx.restore(); }
  }

  // Small icon for UI cards/glyphs (static pose, centered).
  function drawTowerIcon(ctx, def, cx, cy, size) {
    ctx.save(); ctx.translate(cx, cy); const sc = size / 44; ctx.scale(sc, sc);
    drawTower(ctx, def, 0, 2, { t: performance.now() / 1000, scale: 1, aim: -0.3, ascended: false });
    ctx.restore();
  }

  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  /* ============================ ENEMIES ============================= */
  // Cached walk-cycle sheets per motif. Built once, blitted thereafter.
  const FRAMES = 6;
  const sheets = {};
  const MOTIF_FAM = { humanoid: 'Bandit', orc: 'Orc', ogre: 'Orc', goblin: 'Orc', skeleton: 'Undead', zombie: 'Undead', wraith: 'Undead', imp: 'Demon', hound: 'Demon', demon: 'Demon', golem: 'Arcane', wisp: 'Arcane', harpy: 'Aerial', griffon: 'Aerial', wyvern: 'Aerial', boss: 'Demon' };
  const MOTIF_SIZE = { humanoid: 42, orc: 46, ogre: 60, goblin: 34, skeleton: 42, zombie: 42, wraith: 42, imp: 32, hound: 46, demon: 48, golem: 46, wisp: 30, harpy: 46, griffon: 54, wyvern: 52 };

  function sheetKey(motif) { return motif; }
  function getSheet(motif) {
    const key = sheetKey(motif);
    if (sheets[key]) return sheets[key];
    const S = MOTIF_SIZE[motif] || 42;
    const frames = [], whites = [];
    for (let f = 0; f < FRAMES; f++) {
      const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
      const c = cv.getContext('2d'); c.save(); c.translate(S / 2, S - 4);
      drawBody(c, motif, f / FRAMES * TAU, false); c.restore();
      frames.push(cv);
      const wv = document.createElement('canvas'); wv.width = S; wv.height = S;
      const wc = wv.getContext('2d'); wc.save(); wc.translate(S / 2, S - 4);
      drawBody(wc, motif, f / FRAMES * TAU, true); wc.restore();
      whites.push(wv);
    }
    return (sheets[key] = { frames, whites, size: S });
  }

  // Draw one enemy body facing right, feet at (0,0). legPhase drives the walk.
  function drawBody(ctx, motif, legPhase, white) {
    const fam = MOTIF_FAM[motif] || 'Bandit';
    const mat = RS.enemyMat(fam);
    const R = mat.ramp; const acc = mat.accent;
    const col = white ? '#ffffff' : null;
    const F = (pts, c, rim) => facet(ctx, pts, col || c, white ? null : rim);
    const C = (x, y, r, c, rim) => circ(ctx, x, y, r, col || c, white ? null : rim);
    const swing = Math.sin(legPhase) * 4, swing2 = Math.sin(legPhase + Math.PI) * 4;

    switch (motif) {
      case 'humanoid': // lean hooded bandit
        F([[-3, 0], [-4, swing], [-2, swing]], R.shadow); F([[3, 0], [4, swing2], [2, swing2]], R.shadow);
        F([[-4, -14], [4, -14], [3, 0], [-3, 0]], mat.cloth.mid, mat.cloth.rim);
        F([[-4, -14], [4, -14], [0, -20]], R.shadow); C(0, -16, 3.4, R.mid, R.rim); break;
      case 'orc': // bulky hunched tusked
        F([[-4, 0], [-5, swing], [-2, swing]], R.shadow); F([[4, 0], [5, swing2], [2, swing2]], R.shadow);
        F([[-7, -13], [7, -13], [5, 0], [-5, 0]], R.mid, R.rim);
        F([[-9, -12], [-5, -14], [-4, -6], [-8, -7]], R.light); F([[9, -12], [5, -14], [4, -6], [8, -7]], R.light); // shoulders
        C(2, -16, 3.6, R.light, R.rim); F([[0, -14], [3, -13], [1, -11]], '#e8e0c0'); break; // tusk
      case 'ogre': // huge
        F([[-6, 0], [-8, swing], [-3, swing]], R.shadow); F([[6, 0], [8, swing2], [3, swing2]], R.shadow);
        F([[-11, -18], [11, -18], [8, 0], [-8, 0]], R.mid, R.rim);
        F([[-14, -16], [-7, -20], [-5, -8], [-12, -9]], R.light); C(3, -22, 5, R.light, R.rim); break;
      case 'goblin': // small scurrying
        F([[-2, 0], [-3, swing], [-1, swing]], R.shadow); F([[2, 0], [3, swing2], [1, swing2]], R.shadow);
        F([[-4, -9], [4, -9], [3, 0], [-3, 0]], R.mid, R.rim); C(0, -11, 3, R.light, R.rim);
        F([[-4, -12], [-2, -9], [-5, -9]], R.mid); F([[4, -12], [2, -9], [5, -9]], R.mid); break; // ears
      case 'skeleton': // angular bone
        ctx.strokeStyle = white ? '#fff' : R.shadow; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-2 + swing * 0.5, -6); ctx.moveTo(2, 0); ctx.lineTo(2 + swing2 * 0.5, -6); ctx.stroke();
        F([[-4, -14], [4, -14], [2, -6], [-2, -6]], R.mid, R.rim);
        ctx.strokeStyle = white ? '#fff' : R.shadow; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-3, -12 + i * 2); ctx.lineTo(3, -12 + i * 2); ctx.stroke(); }
        C(0, -16, 3, R.light, R.rim); break;
      case 'zombie': // shambling
        F([[-3, 0], [-4, swing * 0.5], [-1, swing * 0.5]], R.shadow); F([[3, 0], [4, swing2 * 0.5], [1, swing2 * 0.5]], R.shadow);
        F([[-4, -13], [4, -13], [4, 0], [-4, 0]], mat.cloth.mid, mat.cloth.rim);
        F([[-5, -12], [-7, -6], [-4, -6]], R.mid); C(0.5, -15, 3.2, R.mid, R.rim); break;
      case 'wraith': // floating tattered (no legs)
        ctx.globalAlpha *= white ? 1 : 0.82;
        F([[-7, 6 + swing * 0.5], [-4, -12], [4, -12], [7, 6 + swing2 * 0.5], [0, 2]], mat.cloth.mid, mat.glow || '#9fe0b8');
        C(0, -13, 3, R.light); C(-1.2, -13, 0.8, '#7bff9f'); C(1.2, -13, 0.8, '#7bff9f');
        ctx.globalAlpha = white ? 1 : ctx.globalAlpha / 0.82; break;
      case 'imp': // small flying demon
        C(0, -8, 4, R.mid, R.rim); F([[0, -10], [-2, -14], [1, -12]], R.mid); F([[0, -10], [2, -14], [-1, -12]], R.mid);
        F([[-4, -8], [-9, -12], [-3, -5]], mat.cloth.mid); F([[4, -8], [9, -12], [3, -5]], mat.cloth.mid); break;
      case 'hound': // quadruped
        F([[-8, 0], [-9, swing], [-6, swing]], R.shadow); F([[6, 0], [8, swing2], [5, swing2]], R.shadow);
        F([[-9, -8], [8, -9], [9, -3], [-8, -2]], R.mid, R.rim); F([[8, -9], [14, -12], [12, -4]], R.light);
        C(13, -10, 1.2, '#ff6a2a'); break;
      case 'demon': // horned asymmetric
        F([[-4, 0], [-5, swing], [-2, swing]], R.shadow); F([[4, 0], [5, swing2], [2, swing2]], R.shadow);
        F([[-6, -14], [6, -14], [5, 0], [-5, 0]], R.mid, R.rim);
        F([[-5, -14], [-9, -22], [-3, -15]], R.shadow); F([[5, -14], [9, -20], [3, -15]], R.shadow); // horns
        C(0, -15, 3.4, R.mid, mat.glow); C(-1.3, -15, 0.8, '#ffdd00'); C(1.3, -15, 0.8, '#ffdd00');
        ctx.strokeStyle = white ? '#fff' : mat.glow || '#ff5a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(3, -4); ctx.stroke(); break;
      case 'golem': // blocky construct
        F([[-8, 0], [8, 0], [7, -16], [-7, -16]], R.mid, R.rim);
        F([[-8, 0], [-7, -16], [-9, -14], [-10, 0]], R.shadow);
        C(0, -8, 3, mat.glow || '#7fb0ff'); C(0, -8, 5.5, null, mat.glow); break;
      case 'wisp': // floating orb
        ctx.globalAlpha *= white ? 1 : 0.9; C(0, -8, 5, R.mid, mat.glow); C(0, -8, 2.5, '#ffffff');
        C(0, -8, 8 + Math.sin(legPhase) * 1, null, mat.glow); ctx.globalAlpha = white ? 1 : ctx.globalAlpha / 0.9; break;
      case 'harpy': // winged humanoid
        const wf = Math.sin(legPhase) * 6;
        F([[-4, -12], [-14, -14 - wf], [-3, -6]], R.shadow); F([[4, -12], [14, -14 - wf], [3, -6]], R.shadow);
        F([[-3, -14], [3, -14], [2, -4], [-2, -4]], R.mid, R.rim); C(0, -16, 2.8, R.light, R.rim); break;
      case 'griffon': // winged quadruped
        const gf = Math.sin(legPhase) * 7;
        F([[-9, -6], [9, -7], [10, 0], [-8, -1]], R.mid, R.rim);
        F([[-2, -6], [-16, -12 - gf], [0, 0]], R.shadow); F([[2, -6], [16, -12 - gf], [0, 0]], R.shadow);
        F([[9, -7], [15, -11], [12, -3]], R.light); C(14, -9, 1.2, '#ffcb5a'); break;
      case 'wyvern': // winged serpent
        const yf = Math.sin(legPhase) * 8;
        F([[-14, -6 - yf], [-2, -2], [0, -8], [-3, -10 - yf]], R.shadow);
        F([[14, -6 - yf], [2, -2], [0, -8], [3, -10 - yf]], R.shadow);
        F([[-5, -3], [8, -6], [10, 0], [-4, 2]], R.mid, R.rim); C(9, -5, 2.4, R.light); C(11, -6, 1, '#ff6a2a'); break;
      default: C(0, -8, 5, R.mid, R.rim);
    }
  }

  function drawEnemy(ctx, e, time) {
    const sheet = getSheet(e.def.motif);
    const S = sheet.size;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + (e.isFlying ? 12 : 7), S * 0.22, S * 0.09, 0, 0, TAU); ctx.fill();
    const flying = e.isFlying;
    const hover = flying ? Math.sin(time * RS.ANIM.hoverHz * TAU + (e.vis ? e.vis.id : 0)) * 3 : 0;
    const gait = e.vis ? e.vis.gait : 0;
    let fi = Math.floor((gait / TAU % 1 + 1) % 1 * FRAMES) % FRAMES;
    if (fi < 0) fi = 0;
    const frame = flying ? sheet.frames[Math.floor(time * RS.ANIM.wingHz) % FRAMES] : sheet.frames[fi];
    const dir = e.vis && e.vis.faceLeft ? -1 : 1;
    ctx.save();
    ctx.translate(e.x, e.y + hover);
    ctx.scale(dir, 1);
    ctx.drawImage(frame, -S / 2, -S + 4);
    // hit flash overlay
    if (e.flashT > 0) { ctx.globalAlpha = RS.art.clamp(e.flashT / RS.ANIM.hitFlash, 0, 1) * 0.9; ctx.drawImage((flying ? sheet.whites[Math.floor(time * RS.ANIM.wingHz) % FRAMES] : sheet.whites[fi]), -S / 2, -S + 4); ctx.globalAlpha = 1; }
    ctx.restore();
    drawEnemyStatus(ctx, e, time, S);
  }

  function drawEnemyStatus(ctx, e, time, S) {
    const st = e.status || {};
    // burning flames
    if (st.burn) { for (let i = 0; i < 2; i++) { const fx = e.x + Math.sin(time * 12 + i * 3) * 4; circ(ctx, fx, e.y - 6 - Math.abs(Math.sin(time * 10 + i)) * 6, 3, A.alpha('#ff8a3a', 0.6)); } }
    // frost crystals
    if (st.slow) { ctx.strokeStyle = A.alpha('#bfeaf5', 0.7); ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { const a = i * 2.1 + time; ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * 6, e.y - 6 + Math.sin(a) * 6); ctx.lineTo(e.x + Math.cos(a) * 9, e.y - 6 + Math.sin(a) * 9); ctx.stroke(); } }
    // stun stars
    if (st.stun && st.stun.t > 0) { for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.1; circ(ctx, e.x + Math.cos(a) * 7, e.y - 18 + Math.sin(a) * 2, 1.5, '#f5e6a8'); } }
    // shield shimmer
    if (e.shieldHits > 0) { ctx.strokeStyle = A.alpha('#8fd4e8', 0.5 + Math.sin(time * 4) * 0.2); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y - 8, S * 0.28, 0, TAU); ctx.stroke(); }
  }

  RS.Sprites = { facet, poly, circ, drawTower, drawTowerIcon, drawEnemy, drawBody, getSheet, Sil, R0 };
})();
