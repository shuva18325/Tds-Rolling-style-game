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
  // --- ANCIENT ---
  Sil.spartan = (ctx, r, a, p) => { // hoplite: crested helm, round aspis, long dory
    const bronze = RS.RAMP.gold, patina = r; // r == Ancient verdigris ramp
    // round bronze shield presented forward (the silhouette's dominant mass)
    circ(ctx, -5, 2, 9.5, A.mul(bronze.mid, 0.9), bronze.rim);
    circ(ctx, -5, 2, 6, A.mul(patina.mid, 1.05));
    circ(ctx, -5, 2, 2.2, bronze.light);
    // body behind the shield
    facet(ctx, [[0, 12], [-2, -6], [6, -6], [6, 12]], A.mul(patina.mid, 0.8), patina.rim);
    // crested Corinthian helm — the instant read
    circ(ctx, 2, -10, 4.2, bronze.mid, bronze.rim);
    facet(ctx, [[-1, -14], [2, -19], [6, -19], [4, -13]], '#a02c2c'); // transverse crest
    // long dory spear, thrusting on the lunge
    ctx.strokeStyle = woodM(); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(6, 10); ctx.lineTo(13 + p.lunge * 2, -13); ctx.stroke();
    facet(ctx, [[13 + p.lunge * 2, -16], [15.5 + p.lunge * 2, -11], [10.5 + p.lunge * 2, -11]], bronze.light); };

  Sil.greekfire = (ctx, r, a, p) => { // bronze siphon on a swivel + pressure cauldron
    // cauldron base
    facet(ctx, [[-9, 12], [-7, 2], [7, 2], [9, 12]], RS.RAMP.iron.shadow);
    facet(ctx, [[-7, 2], [7, 2], [5, -3], [-5, -3]], A.mul(r.mid, 0.85), r.rim);
    // pressure gauge glow that pulses as it charges
    circ(ctx, 0, 5, 2.6 + (p.recoil || 0) * 1.6, A.alpha('#ff8a3a', 0.85));
    ctx.save(); ctx.rotate(a * 0.35);
    // bronze siphon barrel
    facet(ctx, [[-2, -6], [13, -8], [16, -4], [13, 0], [-2, -2]], RS.RAMP.gold.mid, RS.RAMP.gold.rim);
    // nozzle flare + jet while firing
    const jet = (p.recoil || 0);
    if (jet > 0.15) {
      ctx.globalCompositeOperation = 'lighter';
      facet(ctx, [[16, -6], [16 + 14 * jet, -9 * jet - 2], [16 + 18 * jet, -4], [16 + 14 * jet, 5 * jet - 2], [16, -2]], A.alpha('#ff7a2a', 0.75));
      facet(ctx, [[16, -5], [16 + 9 * jet, -4], [16, -3]], A.alpha('#ffd45a', 0.9));
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore(); };

  Sil.pharaoh = (ctx, r, a, p) => { // elite honor guard: gold armor, nemes headdress, glowing was-scepter
    facet(ctx, [[0, -11], [7, 12], [-7, 12]], '#e8dcc0', '#fff8e0'); // white linen robe
    facet(ctx, [[-6, -7], [6, -7], [5, -2], [-5, -2]], RS.RAMP.gold.mid, RS.RAMP.gold.rim); // gold usekh collar
    ctx.strokeStyle = A.mul(r.mid, 1.2); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(5, -5); ctx.stroke(); // faience inlay band
    facet(ctx, [[-6, -14], [-6, -3], [-3, -4], [-3.5, -13]], r.mid, r.rim); // nemes lappet, left
    facet(ctx, [[6, -14], [6, -3], [3, -4], [3.5, -13]], r.mid, r.rim); // nemes lappet, right
    facet(ctx, [[-3.2, -16], [3.2, -16], [3.2, -13], [-3.2, -13]], RS.RAMP.gold.mid, RS.RAMP.gold.rim); // gold circlet
    circ(ctx, 0, -10, 2.8, RS.RAMP.flesh.mid); // face
    facet(ctx, [[0, -19], [-1.3, -16], [1.3, -16]], '#3fa06a'); // uraeus cobra
    ctx.strokeStyle = RS.RAMP.gold.mid; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(8, 13); ctx.lineTo(10, -14); ctx.stroke(); // was-scepter shaft
    facet(ctx, [[8, -15], [13, -14], [12.5, -10], [8, -10]], RS.RAMP.gold.light, RS.RAMP.gold.rim); // forked was-head
    circ(ctx, 10.5, -17, 2.6 + p.charge * 2.4, A.alpha('#3fe0cc', 0.85), '#eafff9'); }; // glowing eye of Horus

  Sil.general = (ctx, r, a, p) => { // The General — tricorn, sash, flintlock, raised sabre
    const G = RS.RAMP.gold, sh = p.charge || 0;
    limb(ctx, -3.5, 2, -5, 12, 2.6, 2, '#2a3346'); limb(ctx, 3.5, 2, 5, 12, 2.6, 2, '#2a3346'); // boots
    facet(ctx, [[-7, -9], [7, -9], [5.5, 3], [-5.5, 3]], '#3a4a6a', '#7089b0');                  // blue coat
    facet(ctx, [[-5.5, -8], [-1, -5], [-2.5, 3], [-5, 3]], '#e8dcc0');                           // white lapel
    facet(ctx, [[-6, -2], [6, -2], [5, 2], [-5, 2]], '#8a2f2f', '#c05a4a');                      // red sash
    limb(ctx, -7, -7, -12, 0, 2.4, 1.8, '#2f3c58');                                              // pistol arm
    limb(ctx, 7, -7, 11, -12, 2.4, 1.8, '#2f3c58');                                              // sabre arm
    facet(ctx, [[-8, -8], [-4, -11], [-3, -5], [-7, -4]], G.mid, G.rim);                          // epaulettes
    facet(ctx, [[8, -8], [4, -11], [3, -5], [7, -4]], G.mid, G.rim);
    circ(ctx, 0, -13, 3.4, RS.RAMP.flesh.mid);
    // tricorn: a real brim with three upturned corners, not a black blob
    facet(ctx, [[-10, -15], [10, -15], [7, -18], [-7, -18]], '#252b38', '#5a6580');
    facet(ctx, [[-7, -18], [0, -23], [7, -18]], '#1c212b', '#4a5468');
    facet(ctx, [[-2, -22], [2, -22], [0, -27]], '#e8dcc0');                                       // plume
    ctx.strokeStyle = RS.RAMP.steel.light; ctx.lineWidth = 2; ctx.lineCap = 'round';               // sabre
    ctx.beginPath(); ctx.moveTo(11, -12); ctx.quadraticCurveTo(17, -18, 16, -28 - sh * 4); ctx.stroke();
    facet(ctx, [[9, -10], [14, -13], [13, -8]], G.mid, G.rim);                                     // hilt
    facet(ctx, [[-12, 1], [-18, -2], [-17, 2], [-12, 4]], RS.RAMP.iron.mid, RS.RAMP.iron.rim);      // flintlock
    if (sh > 0.2) { ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = A.alpha('#ffd98a', sh * 0.65); ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, -6, 14 + sh * 9, 0, TAU); ctx.stroke(); ctx.restore(); } };

  Sil.captain = (ctx, r, a, p) => { // The Captain — bicorn, naval coat, cutlass, spyglass
    const G = RS.RAMP.gold, sh = p.charge || 0;
    limb(ctx, -3.5, 2, -5, 12, 2.6, 2, '#14202c'); limb(ctx, 3.5, 2, 5, 12, 2.6, 2, '#14202c');
    facet(ctx, [[-7.5, -9], [7.5, -9], [6, 3], [-6, 3]], '#1d3b52', '#5688a8');                    // navy coat
    facet(ctx, [[-6, -9], [0, -4], [6, -9], [5, 3], [-5, 3]], '#e8dcc0');                          // white waistcoat
    ctx.strokeStyle = G.mid; ctx.lineWidth = 1;                                                     // brass buttons
    for (let i = 0; i < 3; i++) circ(ctx, 0, -6 + i * 3, 0.9, G.light);
    limb(ctx, -7.5, -7, -13, -1, 2.4, 1.8, '#16303f');
    limb(ctx, 7.5, -7, 12, -11, 2.4, 1.8, '#16303f');
    facet(ctx, [[-9, -8], [-4, -12], [-3, -5], [-8, -4]], G.mid, G.rim);
    facet(ctx, [[9, -8], [4, -12], [3, -5], [8, -4]], G.mid, G.rim);
    circ(ctx, 0, -14, 3.4, RS.RAMP.flesh.mid);
    // bicorn: two swept peaks, worn athwart
    facet(ctx, [[-12, -17], [-4, -24], [4, -24], [12, -17], [6, -15], [-6, -15]], '#14202c', '#46647c');
    facet(ctx, [[-4, -24], [0, -20], [4, -24], [0, -22]], '#0d1720');
    facet(ctx, [[-1, -23], [1, -23], [0, -28]], G.light);                                            // cockade
    ctx.strokeStyle = RS.RAMP.steel.light; ctx.lineWidth = 2.4; ctx.lineCap = 'round';                // cutlass
    ctx.beginPath(); ctx.moveTo(12, -11); ctx.quadraticCurveTo(19, -17, 18, -27 - sh * 4); ctx.stroke();
    facet(ctx, [[10, -9], [15, -12], [14, -7]], G.mid, G.rim);
    facet(ctx, [[-13, -2], [-20, -4], [-19, 0], [-13, 1]], G.mid, G.rim);                             // spyglass
    if (sh > 0.2) { ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = A.alpha('#9fe0ff', sh * 0.7); ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(0, -6, 15 + sh * 11, 0, TAU); ctx.stroke(); ctx.restore(); } };

  Sil.emperor = (ctx, r, a, p) => { // The Roman Emperor — laurel, lorica, gold gladius
    const G = RS.RAMP.gold, patina = r;
    facet(ctx, [[-11, -12], [11, -12], [9, 12], [-9, 12]], '#8a2f3a', '#c25a5a');                      // imperial cloak
    limb(ctx, -3.5, 4, -5, 12, 2.6, 2.1, '#7a4438'); limb(ctx, 3.5, 4, 5, 12, 2.6, 2.1, '#7a4438');
    facet(ctx, [[-7.5, -10], [7.5, -10], [6, 5], [-6, 5]], G.mid, G.rim);                              // lorica musculata
    ctx.strokeStyle = A.mul(G.shadow, 1.15); ctx.lineWidth = 1;                                        // muscled relief
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 3); ctx.moveTo(-4.5, -4); ctx.quadraticCurveTo(0, -1.5, 4.5, -4); ctx.stroke();
    facet(ctx, [[-7, 4], [7, 4], [6, 10], [-6, 10]], '#b03a2e', '#d9705a');                            // pteruges
    limb(ctx, -7.5, -8, -12, -2, 2.5, 1.9, RS.RAMP.flesh.shadow);
    limb(ctx, 7.5, -8, 12, -5, 2.5, 1.9, RS.RAMP.flesh.shadow);
    pauldron(ctx, -7.5, -9, -1, 5.5, A.mul(patina.mid, 1.05), patina.rim);
    pauldron(ctx, 7.5, -9, 1, 5.5, A.mul(patina.mid, 1.05), patina.rim);
    circ(ctx, 0, -14, 3.6, RS.RAMP.flesh.mid);
    // laurel wreath: paired leaves around a band, not a spiked crown
    ctx.strokeStyle = '#4f7a35'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, -15, 5.2, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const ang = Math.PI * 1.1 + i * 0.28;
      const lx = Math.cos(ang) * 5.2, ly = -15 + Math.sin(ang) * 5.2;
      facet(ctx, [[lx, ly], [lx + Math.cos(ang - 0.5) * 3.4, ly + Math.sin(ang - 0.5) * 3.4],
                  [lx + Math.cos(ang + 0.35) * 2.2, ly + Math.sin(ang + 0.35) * 2.2]], '#6aa84f');
    }
    // gold gladius held in the sword hand
    const gx = 12 + p.lunge * 2, gy = -5;
    // gladius: short, leaf-bladed, wider at the belly then tapering to a point
    facet(ctx, [[gx - 1.5, gy - 2], [gx + 1.5, gy - 2], [gx + 3.4, gy - 11], [gx + 1, gy - 19], [gx - 1.4, gy - 11]],
      G.light, G.rim);
    facet(ctx, [[gx - 0.6, gy - 3], [gx + 1.4, gy - 3], [gx + 1, gy - 17]], A.mul(G.rim, 1.05));         // fuller
    facet(ctx, [[gx - 4, gy], [gx + 4.5, gy - 1], [gx + 4, gy + 2.6], [gx - 3.6, gy + 3.4]],
      A.mul(G.shadow, 1.25), G.mid);                                                                     // crossguard
    circ(ctx, gx + 0.4, gy + 5, 1.8, A.mul(G.mid, 1.1), G.rim); };                                       // pommel

  Sil.warlord = (ctx, r, a, p) => { // The Warlord — berserker, fur mantle, Leviathan axe
    const I = RS.RAMP.iron, rage = p.charge || 0;
    limb(ctx, -4, 3, -6, 12, 3, 2.3, '#4a3527'); limb(ctx, 4, 3, 6, 12, 3, 2.3, '#4a3527');
    facet(ctx, [[-9, -9], [9, -9], [7, 5], [-7, 5]], '#6b4632', '#9a7048');                             // bare torso
    facet(ctx, [[-11, -12], [-4, -15], [4, -15], [11, -12], [8, -5], [-8, -5]], '#4a3527', '#7d5a3c');   // fur mantle
    facet(ctx, [[-7, 3], [7, 3], [6, 9], [-6, 9]], I.shadow, I.mid);                                     // iron belt
    limb(ctx, -9, -9, -14, -3, 3, 2.2, '#7a5540');                                                       // arms
    limb(ctx, 9, -9, 14, -8, 3.2, 2.4, '#7a5540');
    circ(ctx, 0, -15, 3.8, RS.RAMP.flesh.mid);
    facet(ctx, [[-5, -17], [5, -17], [4, -13], [-4, -13]], '#2a2018');                                    // warpaint band
    circ(ctx, -1.8, -15.5, 1.2, rage > 0.35 ? '#ff5a3a' : '#3a2a20');
    circ(ctx, 1.8, -15.5, 1.2, rage > 0.35 ? '#ff5a3a' : '#3a2a20');
    // Leviathan-type axe: long haft, heavy double-bearded head, bound socket
    const hx = 13 + p.lunge;
    limb(ctx, hx - 2, 9, hx + 2, -19, 2.4, 2, '#463320', '#755c3e');
    // head kept compact — at tower scale a boss-sized bit reads as a billboard
    facet(ctx, [[hx + 1, -16], [hx + 4, -26], [hx + 12, -22], [hx + 12, -11], [hx + 6, -8], [hx + 1, -11]],
      A.mul(I.mid, 0.82), I.mid);
    facet(ctx, [[hx + 3, -16], [hx + 5, -23], [hx + 9, -20], [hx + 6, -11]], A.mul(I.light, 0.86));
    facet(ctx, [[hx + 12, -22], [hx + 12, -11], [hx + 8, -16]], A.mul(I.shadow, 0.9));
    socket(ctx, hx + 1.5, -13, -1.3, 3.6, 1.9, '#241b14', A.mul(I.mid, 0.9));
    if (rage > 0.3) { ctx.save(); ctx.globalCompositeOperation = 'lighter';
      circ(ctx, hx + 6, -17, 8 * rage, A.alpha('#c0392b', 0.30 * rage)); ctx.restore(); } };

  Sil.fallen = (ctx, r, a, p) => { // The Fallen Knight — adamantine plate, black sword, kite shield
    const AD = RS.RAMP.steel, wrath = p.charge || 0;
    facet(ctx, [[-12, -12], [12, -12], [10, 13], [-10, 13]], '#171a20', '#3f4650');                        // dark surcoat
    limb(ctx, -4, 4, -6, 12, 3, 2.4, '#22262e'); limb(ctx, 4, 4, 6, 12, 3, 2.4, '#22262e');
    facet(ctx, [[-8, -11], [8, -11], [6.5, 5], [-6.5, 5]], A.mul(AD.mid, 0.9), AD.rim);                    // cuirass
    facet(ctx, [[-3, -10], [3, -10], [2.5, 3], [-2.5, 3]], A.mul(AD.light, 1.04));                         // lit ridge
    limb(ctx, -8, -9, -14, -4, 3, 2.2, A.mul(AD.shadow, 1.1));                                             // shield arm
    limb(ctx, 8, -9, 13, -7, 3, 2.2, A.mul(AD.shadow, 1.1));                                               // sword arm
    pauldron(ctx, -8, -10, -1, 6, AD.mid, AD.rim);
    pauldron(ctx, 8, -10, 1, 6, AD.mid, AD.rim);
    facet(ctx, [[-5.5, -13], [5.5, -14], [5, -22], [-5, -21]], AD.light, AD.rim);                          // great helm
    ctx.fillStyle = '#08090c'; ctx.fillRect(-4.5, -19, 9, 2.4);                                            // visor slit
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = A.alpha(wrath > 0.15 ? '#ff3a2a' : '#7fb0ff', 0.6 + wrath * 0.4);
    ctx.fillRect(-4, -18.6, 8, 1.6); ctx.restore();
    facet(ctx, [[-5, -22], [-3, -29], [-1, -22]], A.mul(AD.shadow, 0.9));                                  // broken crest
    facet(ctx, [[5, -22], [3, -29], [1, -22]], A.mul(AD.shadow, 0.9));
    // kite shield, darker than the plate so it doesn't read as a white slab
    facet(ctx, [[-19, -13], [-11, -17], [-11, 6], [-15, 11], [-19, 5]], A.mul(AD.mid, 0.62), A.mul(AD.rim, 0.8));
    facet(ctx, [[-17.5, -12], [-12.5, -14.5], [-12.5, 4], [-15, 8], [-17.5, 3.5]], A.mul(AD.mid, 0.78));
    ctx.strokeStyle = '#0c0e12'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(-15, 8); ctx.moveTo(-18.5, -5); ctx.lineTo(-11.5, -5); ctx.stroke();
    // the black sword: rough, pitted, notched — matches the blade reference
    const bx = 13, by = -7, tipY = -34 - p.lunge * 2;
    limb(ctx, bx, by + 2, bx + 2, tipY, 2.6, 2, '#15161a', '#434852');
    ctx.strokeStyle = '#0a0b0e'; ctx.lineWidth = 1;                                                        // edge notches
    for (let i = 0; i < 4; i++) { const y = by - 5 - i * 6.5;
      ctx.beginPath(); ctx.moveTo(bx + 3.4, y); ctx.lineTo(bx + 1.6, y - 2.2); ctx.stroke(); }
    facet(ctx, [[bx - 5, by + 3], [bx + 8, by + 1], [bx + 7, by + 5], [bx - 4, by + 6]], '#23252b', '#4f5460'); // crossguard
    if (wrath > 0.15) { ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = A.alpha('#ff2a1a', 0.35 + wrath * 0.5); ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx + 1, by); ctx.lineTo(bx + 2, tipY + 2); ctx.stroke(); ctx.restore(); } };

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
    // Live gameplay state can override `charge`: the shout window, Rage stacks
    // and Fallen Wrath all need to show on the sprite, not just attack timing.
    if (o.power != null) p.charge = o.power;
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
      case 'humanoid': // lean hooded bandit — narrow, leaning into a fast stride
        F([[-3, 0], [-4, swing], [-2, swing]], R.shadow); F([[3, 0], [4, swing2], [2, swing2]], R.shadow);
        // slim torso, tapered to the waist, tilted forward at the shoulders
        F([[-3, -14], [4, -15], [3, 0], [-2, 0]], mat.cloth.mid, mat.cloth.rim);
        // pointed hood with a shadowed void where the face should be
        F([[-4, -13], [4, -14], [2, -22], [-1, -21]], mat.cloth.shadow);
        C(1, -15, 2.6, '#1a1512');
        // trailing cloak hem streaming behind the run
        F([[-2, -12], [-7, -1 + swing * 0.4], [-3, -2]], mat.cloth.shadow); break;
      case 'orc': // bulky, hunched forward, heavy tusked jaw
        F([[-4, 0], [-5, swing], [-2, swing]], R.shadow); F([[4, 0], [5, swing2], [2, swing2]], R.shadow);
        // torso leans forward (top edge shifted +x) and is wider than tall — bulk over height
        F([[-8, -12], [9, -14], [6, 1], [-6, 1]], R.mid, R.rim);
        F([[-11, -11], [-6, -15], [-4, -5], [-9, -6]], R.light); F([[10, -13], [5, -16], [3, -5], [8, -6]], R.light); // broad shoulders
        C(4, -17, 4, R.light, R.rim); // head pushed forward of the spine — the hunch
        F([[1, -15], [5, -14], [2, -11]], '#e8e0c0'); F([[6, -14], [9, -13], [5, -11]], '#e8e0c0'); break; // two visible tusks
      case 'ogre': // immense and sloped — head sunk between mountainous shoulders
        F([[-6, 0], [-9, swing], [-3, swing]], R.shadow); F([[6, 0], [9, swing2], [3, swing2]], R.shadow);
        // gut-heavy torso, widest at the belly
        F([[-10, -16], [11, -18], [9, 1], [-8, 1]], R.mid, R.rim);
        // one shoulder hunched far higher than the other
        F([[-15, -15], [-8, -21], [-5, -8], [-13, -8]], R.light);
        F([[14, -13], [8, -18], [6, -7], [12, -7]], A.mul(R.mid, 1.1));
        C(2, -19, 4.2, R.light, R.rim); // small head, low and forward
        F([[-1, -18], [4, -17], [1, -14]], '#e8e0c0'); break;
      case 'goblin': // tiny and crouched — head and ears dominate the silhouette
        F([[-2, 0], [-3, swing], [-1, swing]], R.shadow); F([[2, 0], [3, swing2], [1, swing2]], R.shadow);
        F([[-3, -8], [4, -8], [3, 0], [-2, 0]], R.mid, R.rim);
        C(0.5, -11, 3.4, R.light, R.rim); // oversized head on a small body
        F([[-3, -15], [-1, -10], [-6, -11]], R.mid); F([[4, -15], [2, -10], [7, -11]], R.mid); // long ears
        ctx.strokeStyle = white ? '#fff' : '#9aa0a6'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(8, -9); ctx.stroke(); break; // crude knife
      case 'skeleton': // thin, angular, all hard edges — the opposite of an orc's bulk
        ctx.strokeStyle = white ? '#fff' : R.shadow; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-1.5, 0); ctx.lineTo(-2 + swing * 0.6, -7); ctx.moveTo(1.5, 0); ctx.lineTo(2 + swing2 * 0.6, -7); ctx.stroke();
        // narrow angular ribcage tapering hard to a point — no soft curves anywhere
        F([[-3, -15], [3, -15], [3.5, -9], [1, -6], [-1, -6], [-3.5, -9]], R.mid, R.rim);
        // jutting angular shoulder blades and forearm bones
        ctx.strokeStyle = white ? '#fff' : R.shadow; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-3, -14); ctx.lineTo(-6, -10); ctx.lineTo(-5, -6); ctx.moveTo(3, -14); ctx.lineTo(6, -10); ctx.lineTo(5, -6); ctx.stroke();
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-2.5, -13 + i * 2); ctx.lineTo(2.5, -13 + i * 2); ctx.stroke(); }
        C(0, -18, 2.6, R.light, R.rim); break; // small skull, narrow relative to the shoulders
      case 'zombie': // lopsided lurch — head lolled, one arm reaching out ahead
        F([[-3, 0], [-4, swing * 0.5], [-1, swing * 0.5]], R.shadow); F([[3, 0], [4, swing2 * 0.5], [1, swing2 * 0.5]], R.shadow);
        // torso visibly tilted, ribs exposed through rotted cloth
        F([[-5, -12], [3, -14], [4, 0], [-4, 0]], mat.cloth.mid, mat.cloth.rim);
        ctx.strokeStyle = white ? '#fff' : R.shadow; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-3, -9); ctx.lineTo(1, -10); ctx.moveTo(-3, -6); ctx.lineTo(1, -7); ctx.stroke();
        // dragging outstretched arm — reads instantly as undead
        F([[2, -11], [11, -8 + swing * 0.3], [10, -5], [2, -8]], R.mid);
        C(-2, -15, 3.2, R.mid, R.rim); break; // head lolled off-axis
      case 'wraith': // legless shroud dissolving into ragged tails
        ctx.globalAlpha *= white ? 1 : 0.8;
        // three tattered tails instead of a solid hem — no ground contact
        F([[-7, 4 + swing * 0.6], [-5, -11], [-1, -11], [-2, 7 + swing * 0.5]], mat.cloth.mid, mat.glow || '#9fe0b8');
        F([[-2, 8 + swing2 * 0.4], [-1, -12], [2, -12], [1, 9 + swing2 * 0.4]], mat.cloth.shadow);
        F([[2, 7 + swing * 0.5], [1, -11], [5, -11], [7, 5 + swing2 * 0.6]], mat.cloth.mid);
        // hollow cowl: dark void with two cold points of light
        F([[-5, -11], [5, -11], [3, -18], [-3, -18]], '#14181a');
        C(-1.6, -14, 1, '#7bff9f'); C(1.6, -14, 1, '#7bff9f');
        ctx.globalAlpha = white ? 1 : ctx.globalAlpha / 0.8; break;
      case 'imp': // scrappy batwing flyer — wings and horns on a tiny body
        const iw = Math.sin(legPhase) * 4;
        F([[-3, -9], [-12, -14 - iw], [-9, -6], [-2, -5]], mat.cloth.mid, mat.cloth.rim);
        F([[3, -9], [12, -14 - iw], [9, -6], [2, -5]], mat.cloth.mid, mat.cloth.rim);
        C(0, -9, 3.6, R.mid, R.rim);
        F([[-2, -12], [-4, -17], [0, -13]], R.shadow); F([[2, -12], [4, -17], [0, -13]], R.shadow); // horns
        C(-1.2, -9, 0.7, '#ffdd00'); C(1.2, -9, 0.7, '#ffdd00');
        ctx.strokeStyle = white ? '#fff' : R.shadow; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(3, 0, -1 + iw * 0.5, 4); ctx.stroke(); break; // tail
      case 'hound': // low, lunging quadruped — long snout, hackles, whipping tail
        F([[-8, 0], [-10, swing], [-6, swing]], R.shadow); F([[6, 0], [9, swing2], [5, swing2]], R.shadow);
        F([[-7, 0], [-8, swing2 * 0.8], [-5, swing2 * 0.8]], A.mul(R.shadow, 0.9)); // 3rd leg for depth
        F([[-9, -7], [8, -9], [9, -2], [-8, -1]], R.mid, R.rim);
        // raised hackles along the spine
        F([[-5, -8], [-3, -12], [-1, -8]], R.shadow); F([[0, -9], [2, -13], [4, -9]], R.shadow);
        F([[8, -9], [16, -11], [15, -5], [8, -3]], R.light); // long muzzle
        C(13, -9, 1.3, '#ff6a2a');
        ctx.strokeStyle = white ? '#fff' : R.shadow; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-9, -6); ctx.quadraticCurveTo(-15, -10, -13, -3 + swing * 0.4); ctx.stroke(); break;
      case 'demon': // horned, deliberately lopsided — nothing mirrors on this body
        F([[-4, 0], [-5, swing], [-2, swing]], R.shadow); F([[4, 0], [5, swing2], [2, swing2]], R.shadow);
        // torso itself is skewed, not just the horns — one shoulder higher, one hip wider
        F([[-7, -13], [6, -15], [6, -1], [-4, 1]], R.mid, R.rim);
        // one long curved horn, one short jagged stub — genuinely mismatched, not mirrored
        F([[-4, -14], [-11, -25], [-8, -17], [-2, -15]], R.shadow);
        F([[4, -15], [7, -19], [5, -16]], R.shadow);
        C(-1, -16, 3.4, R.mid, mat.glow); C(-2.2, -16, 0.8, '#ffdd00'); C(0.2, -16, 0.8, '#ffdd00');
        ctx.strokeStyle = white ? '#fff' : mat.glow || '#ff5a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, -9); ctx.lineTo(2, -3); ctx.stroke(); break;
      case 'golem': // rigid stacked slabs with a floating core — perfectly geometric
        F([[-7, 0], [7, 0], [7, -6], [-7, -6]], A.mul(R.mid, 0.9), R.rim);   // base slab
        F([[-8, -6], [8, -6], [8, -14], [-8, -14]], R.mid, R.rim);            // torso slab
        F([[-5, -14], [5, -14], [4, -19], [-4, -19]], A.mul(R.mid, 1.1), R.rim); // head slab
        // detached floating shoulder blocks — construct, not creature
        F([[-12, -13], [-9, -13], [-9, -6], [-12, -6]], R.shadow);
        F([[9, -13], [12, -13], [12, -6], [9, -6]], R.shadow);
        ctx.strokeStyle = white ? '#fff' : A.alpha(mat.glow || '#7fb0ff', 0.7); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(8, -10); ctx.stroke(); // glowing seam
        C(0, -10, 2.6, mat.glow || '#7fb0ff'); C(0, -10, 5, null, mat.glow); break;
      case 'wisp': // a bright core ringed by orbiting shards, not a plain ball
        ctx.globalAlpha *= white ? 1 : 0.92;
        C(0, -8, 4.2, R.mid, mat.glow);
        C(0, -8, 2, '#ffffff');
        for (let k = 0; k < 3; k++) {
          const oa = legPhase * 1.4 + k * 2.09;
          F([[Math.cos(oa) * 8, -8 + Math.sin(oa) * 8 - 1.8],
             [Math.cos(oa) * 8 + 1.6, -8 + Math.sin(oa) * 8 + 1.4],
             [Math.cos(oa) * 8 - 1.6, -8 + Math.sin(oa) * 8 + 1.4]], mat.glow || '#7fb0ff');
        }
        ctx.globalAlpha = white ? 1 : ctx.globalAlpha / 0.92; break;
      case 'harpy': // winged humanoid — wings read wider than the whole body is tall
        const wf = Math.sin(legPhase) * 7;
        F([[-4, -12], [-19, -15 - wf], [-3, -6]], R.shadow); F([[4, -12], [19, -15 - wf], [3, -6]], R.shadow);
        F([[-3, -14], [3, -14], [2, -4], [-2, -4]], R.mid, R.rim); C(0, -16, 2.8, R.light, R.rim); break;
      case 'griffon': // winged quadruped — a full wingspan easily double the body length
        const gf = Math.sin(legPhase) * 8;
        F([[-9, -6], [9, -7], [10, 0], [-8, -1]], R.mid, R.rim);
        F([[-2, -6], [-22, -14 - gf], [0, 0]], R.shadow); F([[2, -6], [22, -14 - gf], [0, 0]], R.shadow);
        F([[9, -7], [15, -11], [12, -3]], R.light); C(14, -9, 1.2, '#ffcb5a'); break;
      case 'wyvern': // winged serpent — broad membrane wings dwarf the slender body
        const yf = Math.sin(legPhase) * 9;
        F([[-19, -7 - yf], [-2, -2], [0, -8], [-4, -11 - yf]], R.shadow);
        F([[19, -7 - yf], [2, -2], [0, -8], [4, -11 - yf]], R.shadow);
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

  /* ============================== BOSSES =============================
   * One silhouette per boss. Every boss used to render as the same horned
   * demon body, so Bandit King Corvin and Azhrakoth were visually identical.
   * Each routine draws feet-at-origin facing right at roughly 1x scale (the
   * renderer scales up), and takes `p` = { t, breathe, hurt } for idle motion.
   *
   * House style, kept deliberately tight so 13 bosses read as one set:
   *   - one silhouette-defining mass + one signature weapon/feature
   *   - a shoulder/head accent to break the outline
   *   - one emissive colour per boss, used sparingly (eyes + weapon only)
   * ================================================================== */
  const BossSil = {};

  /* Shared boss anatomy. The first pass drew weapons and pauldrons as loose
   * quads with nothing joining them to the body, so every boss read as a box
   * with floating paper shapes around it. Everything is now hung off real
   * limbs: legs plant the figure, arms reach to whatever it is holding. */
  function limb(ctx, x1, y1, x2, y2, w1, w2, col, rim) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    facet(ctx, [[x1 + nx * w1, y1 + ny * w1], [x2 + nx * w2, y2 + ny * w2],
                [x2 - nx * w2, y2 - ny * w2], [x1 - nx * w1, y1 - ny * w1]], col, rim);
  }
  // Two planted legs + a shadowed gap, so a boss stands instead of hovering.
  function stance(ctx, hipY, footY, spread, w, col) {
    limb(ctx, -spread * 0.45, hipY, -spread, footY, w, w * 0.8, col);
    limb(ctx, spread * 0.45, hipY, spread, footY, w, w * 0.8, col);
  }
  // A binding band where a weapon head meets its haft. Without it the big
  // cleavers/axes/hammers read as loose slabs parked next to the figure.
  function socket(ctx, x, y, ang, len, w, col, rim) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    facet(ctx, [[-len, -w], [len, -w], [len, w], [-len, w]], col, rim);
    ctx.restore();
  }
  const eyes = (ctx, x, y, col, r) => { circ(ctx, x - 2.4, y, r || 1.6, col); circ(ctx, x + 2.4, y, r || 1.6, col); };
  // Pauldron that sits ON the shoulder line rather than beside it. Five-sided
  // and swept downward-outward so it reads as a bevelled plate catching the
  // key light, not an axis-aligned rectangle stuck to the arm.
  function pauldron(ctx, sx, sy, dir, size, col, rim) {
    const d = dir, z = size;
    facet(ctx, [[sx - d * z * 0.25, sy - z * 0.62], [sx + d * z * 0.55, sy - z * 0.78],
                [sx + d * z * 1.05, sy - z * 0.12], [sx + d * z * 0.82, sy + z * 0.58],
                [sx - d * z * 0.18, sy + z * 0.42]], col, rim);
    // lit top bevel
    facet(ctx, [[sx - d * z * 0.22, sy - z * 0.58], [sx + d * z * 0.52, sy - z * 0.74],
                [sx + d * z * 0.72, sy - z * 0.34], [sx - d * z * 0.1, sy - z * 0.22]], A.mul(col, 1.28));
  }
  // Torso tapered from a wide shoulder line down to a narrower waist. Drawing
  // it as a plain quad (and often WIDER at the hip) is what made the first
  // pass read as a stack of boxes rather than a figure.
  function torso(ctx, shY, hipY, shW, hipW, col, rim) {
    facet(ctx, [[-shW, shY], [shW, shY], [hipW, hipY], [-hipW, hipY]], col, rim);
    facet(ctx, [[-shW * 0.55, shY + 1], [shW * 0.2, shY + 1.5], [hipW * 0.2, hipY], [-hipW * 0.6, hipY]], A.mul(col, 1.18));
  }

  BossSil.corvin = (ctx, p) => { // Bandit King — plumed sallet, sabre, torn cloak
    const L = RS.RAMP.leather, I = RS.RAMP.iron, b = p.breathe;
    facet(ctx, [[-14, -34 - b], [14, -34 - b], [11, 12], [-11, 12]], '#4a1f1f', '#7a3535'); // cloak behind
    stance(ctx, -8, 12, 7, 3.4, L.shadow);
    torso(ctx, -31 - b, -10, 10, 7.5, L.mid, L.rim);                                        // cuirass
    facet(ctx, [[-8, -22], [8, -23], [7, -12], [-7, -12]], A.mul(L.mid, 0.72));             // belt/skirt
    limb(ctx, -9, -27 - b, -14, -12, 3, 2.2, L.shadow);                                     // left arm
    limb(ctx, 9, -27 - b, 15, -16, 3, 2.2, L.shadow);                                       // sword arm
    pauldron(ctx, -9, -28 - b, -1, 7, I.mid, I.rim);
    pauldron(ctx, 9, -29 - b, 1, 7, I.mid, I.rim);
    facet(ctx, [[-6, -31 - b], [6, -32 - b], [5, -41 - b], [-5, -40 - b]], I.light, I.rim); // sallet
    ctx.fillStyle = '#120e0c'; ctx.fillRect(-4.5, -38 - b, 9, 2.4);                          // visor slit
    eyes(ctx, 0, -37 - b, '#ffcf5a', 1.2);
    facet(ctx, [[-5, -41 - b], [-1, -50 - b], [7, -53 - b], [10, -48 - b], [2, -44 - b]], '#8f2420', '#c9483c'); // swept crest
    facet(ctx, [[-4, -42 - b], [-1, -48 - b], [5, -50 - b], [1, -45 - b]], '#d9564a');
    ctx.strokeStyle = RS.RAMP.steel.light; ctx.lineWidth = 2.8; ctx.lineCap = 'round';        // sabre
    ctx.beginPath(); ctx.moveTo(15, -16); ctx.quadraticCurveTo(27, -26, 29, -42); ctx.stroke();
    facet(ctx, [[13, -14], [19, -19], [18, -12]], RS.RAMP.gold.mid, RS.RAMP.gold.rim); };     // guard

  BossSil.thane = (ctx, p) => { // Drowned Thane — waterlogged plate, kelp, trident
    const P = A.mul('#41586a', 1), b = p.breathe, w = Math.sin(p.t * 1.4) * 2;
    stance(ctx, -8, 12, 8, 4, '#28323c');
    torso(ctx, -31 - b, -10, 12, 8.5, P, '#7fa8bd');                                          // barnacled plate
    facet(ctx, [[-9, -21], [9, -22], [8, -11], [-8, -11]], A.mul('#41586a', 0.72));           // fauld
    limb(ctx, -11, -27 - b, -16, -11, 3.2, 2.4, '#33424f');
    limb(ctx, 11, -27 - b, 15, -14, 3.2, 2.4, '#33424f');
    pauldron(ctx, -11, -29 - b, -1, 8, '#33424f', '#6d94a8');
    pauldron(ctx, 11, -30 - b, 1, 8, '#33424f', '#6d94a8');
    facet(ctx, [[-6, -31 - b], [6, -32 - b], [5, -42 - b], [-5, -41 - b]], A.mul('#41586a', 1.3)); // great helm
    ctx.fillStyle = '#0a1418'; ctx.fillRect(-4.5, -39 - b, 9, 2.6);
    eyes(ctx, 0, -38 - b, '#6ff0d0', 1.3);
    ctx.strokeStyle = 'rgba(64,112,74,0.9)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';        // kelp streamers
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 4.4, -12); ctx.quadraticCurveTo(i * 5 - 3 + w, 1, i * 6 - 5 + w, 13); ctx.stroke(); }
    limb(ctx, 15, -14, 19, -44, 2.2, 1.8, '#5d7f92', '#9fc4d4');                                // trident haft
    for (const dx of [-5, 0, 5]) { ctx.strokeStyle = '#a8cfe0'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(19 + dx * 0.55, -44); ctx.lineTo(19 + dx, -54); ctx.stroke(); } };

  BossSil.hollow = (ctx, p) => { // Hollow Mother — antlered bark-witch on root legs
    const b = p.breathe, sway = Math.sin(p.t * 0.9) * 1.8;
    ctx.strokeStyle = '#3b2d1e'; ctx.lineWidth = 3; ctx.lineCap = 'round';                      // root legs
    for (const dx of [-8, -3, 3, 8]) { ctx.beginPath(); ctx.moveTo(dx * 0.55, -10); ctx.quadraticCurveTo(dx * 1.2, 2, dx * 1.7, 13); ctx.stroke(); }
    torso(ctx, -33 - b, -10, 11.5, 8, '#4a3a26', '#7a6240');                                    // bark torso
    facet(ctx, [[-4, -25], [4, -25], [3, -11], [-3, -11]], '#0f0b06');                          // the hollow
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    circ(ctx, 0, -18, 6, A.alpha('#9fe0a0', 0.30)); ctx.restore();
    circ(ctx, 0, -18, 2.4, '#cdf5b8');                                                          // wisp inside
    limb(ctx, -11, -29 - b, -19, -14, 2.6, 1.8, '#4a3a26', '#6d5636');                          // branch arms
    limb(ctx, 11, -29 - b, 19, -14, 2.6, 1.8, '#4a3a26', '#6d5636');
    ctx.strokeStyle = '#3b2d1e'; ctx.lineWidth = 1.6;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 19, -14); ctx.lineTo(s * 23, -6); ctx.moveTo(s * 19, -14); ctx.lineTo(s * 24, -17); ctx.stroke(); }
    facet(ctx, [[-5, -33 - b], [5, -34 - b], [4, -43 - b], [-4, -42 - b]], '#5c4a30', '#8a7048'); // skull face
    eyes(ctx, 0, -39 - b, '#c9f57a', 1.5);
    ctx.strokeStyle = '#6d5636'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';                     // antler crown
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 3, -43 - b); ctx.quadraticCurveTo(s * 9 + sway, -50 - b, s * 8 + sway, -58 - b); ctx.stroke();
      ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(s * 6 + sway * 0.4, -48 - b); ctx.lineTo(s * 15 + sway, -51 - b); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 7.5 + sway * 0.7, -53 - b); ctx.lineTo(s * 13 + sway, -60 - b); ctx.stroke();
    } };

  BossSil.gruumak = (ctx, p) => { // Iron Tusk — armoured orc warlord with a cleaver
    const I = RS.RAMP.iron, b = p.breathe;
    stance(ctx, -8, 12, 9, 4.4, '#3d4a26');
    torso(ctx, -30 - b, -10, 14, 10, '#5c7a3a', '#8ab04a');                                      // green bulk
    facet(ctx, [[-11, -20], [11, -21], [9, -11], [-9, -11]], I.shadow);                          // iron belt
    limb(ctx, -13, -26 - b, -19, -10, 3.6, 2.6, '#4a6330');
    limb(ctx, 13, -26 - b, 19, -14, 3.6, 2.6, '#4a6330');
    pauldron(ctx, -13, -28 - b, -1, 9, I.shadow, I.mid);
    pauldron(ctx, 13, -29 - b, 1, 9, I.shadow, I.mid);
    facet(ctx, [[-7, -30 - b], [7, -31 - b], [6, -40 - b], [-6, -39 - b]], '#6b8f45', '#9ec46a'); // head
    eyes(ctx, 0, -36 - b, '#ff6a2a', 1.4);
    facet(ctx, [[-6, -33 - b], [-1.5, -32 - b], [-5, -27 - b]], '#efe6c6');                       // tusks
    facet(ctx, [[6, -33 - b], [1.5, -32 - b], [5, -27 - b]], '#efe6c6');
    facet(ctx, [[-8, -40 - b], [8, -41 - b], [6, -46 - b], [-6, -45 - b]], I.shadow, I.mid);      // browplate
    limb(ctx, 19, -14, 27, -38, 3, 2.4, RS.RAMP.timber.mid, RS.RAMP.timber.light);                // haft
    // broad orc cleaver: swept edge, concave back, chipped tip, bound socket
    facet(ctx, [[25, -34], [33, -50], [45, -44], [46, -28], [34, -22], [27, -26]],
      RS.RAMP.steel.mid, RS.RAMP.steel.rim);
    facet(ctx, [[27, -33], [33, -46], [40, -42], [36, -27], [28, -26]], RS.RAMP.steel.light);      // bevel
    facet(ctx, [[45, -44], [46, -28], [41, -33]], A.mul(RS.RAMP.steel.shadow, 1.1));               // thick spine
    socket(ctx, 26, -30, -1.25, 5.5, 2.6, RS.RAMP.iron.shadow, RS.RAMP.iron.mid); };

  BossSil.frostjarl = (ctx, p) => { // Frost Jarl — ice giant, frozen beard, greataxe
    const I = RS.RAMP.ice, b = p.breathe;
    stance(ctx, -9, 13, 10, 4.8, '#3f5666');
    torso(ctx, -32 - b, -11, 15, 11, '#6d8ba0', '#a8cfe0');
    facet(ctx, [[-12, -21], [12, -22], [10, -12], [-10, -12]], '#4f6b7d');                        // hide belt
    limb(ctx, -14, -28 - b, -21, -11, 4, 2.8, '#5b7688');
    limb(ctx, 14, -28 - b, 21, -15, 4, 2.8, '#5b7688');
    pauldron(ctx, -14, -30 - b, -1, 10, '#5e7d90', '#a8cfe0');                                    // rime pauldrons
    pauldron(ctx, 14, -31 - b, 1, 10, '#5e7d90', '#a8cfe0');
    facet(ctx, [[-14, -34 - b], [-11, -44 - b], [-8, -32 - b]], I.light, I.rim);                  // shoulder shards
    facet(ctx, [[14, -35 - b], [11, -45 - b], [8, -33 - b]], I.light, I.rim);
    facet(ctx, [[-7, -32 - b], [7, -33 - b], [6, -43 - b], [-6, -42 - b]], '#7d9bb0', '#b4d6e6');
    eyes(ctx, 0, -39 - b, '#dff8ff', 1.7);
    facet(ctx, [[-6, -35 - b], [6, -35 - b], [3.5, -21 - b], [-3.5, -21 - b]], '#d6ecf5', '#ffffff'); // frozen beard
    facet(ctx, [[-6, -43 - b], [0, -54 - b], [6, -43 - b]], I.mid, I.rim);                        // crown spike
    limb(ctx, 21, -15, 29, -40, 3.2, 2.6, RS.RAMP.timber.shadow, RS.RAMP.timber.mid);            // haft
    // crescent ice bit: bearded edge sweeping away from the socket
    facet(ctx, [[27, -37], [36, -52], [47, -42], [48, -26], [37, -20], [29, -27]], I.mid, I.rim);
    facet(ctx, [[29, -36], [36, -48], [43, -41], [38, -26], [30, -28]], I.light);
    facet(ctx, [[36, -52], [47, -42], [41, -44]], A.mul(I.light, 1.2));                            // lit crest
    socket(ctx, 28, -32, -1.28, 6, 2.8, '#4f6b7d', '#a8cfe0'); };

  BossSil.bogfather = (ctx, p) => { // Bogfather — bloated mire horror with a lantern lure
    const b = p.breathe, bob = Math.sin(p.t * 1.6) * 2.2;
    facet(ctx, [[-9, 4], [-13, 13], [-4, 13]], '#2f3a22'); facet(ctx, [[9, 4], [13, 13], [4, 13]], '#2f3a22'); // splayed feet
    facet(ctx, [[-13, -25 - b], [13, -26 - b], [18, -6], [11, 5], [-11, 5], [-18, -6]], '#4a5236', '#75824e'); // bloated mass
    facet(ctx, [[-14, -6], [14, -6], [11, 8], [-11, 8]], '#3a4028', '#525c34');                    // sagging gut
    for (let i = 0; i < 5; i++) circ(ctx, -10 + i * 5, -1 + (i % 2) * 4, 2.4, 'rgba(126,158,92,0.45)');
    limb(ctx, -16, -20 - b, -23, -4, 3.6, 2.6, '#414a2e');
    limb(ctx, 16, -20 - b, 23, -6, 3.6, 2.6, '#414a2e');
    facet(ctx, [[-7, -25 - b], [7, -26 - b], [6, -34 - b], [-6, -33 - b]], '#5c6640', '#87945a');  // squat head
    eyes(ctx, 0, -31 - b, '#b8f05a', 1.7);
    facet(ctx, [[-5, -28 - b], [5, -28 - b], [3, -25 - b], [-3, -25 - b]], '#1c2114');             // maw
    ctx.strokeStyle = '#3a4028'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';                        // lure stalk
    ctx.beginPath(); ctx.moveTo(3, -34 - b); ctx.quadraticCurveTo(17, -48, 24 + bob, -53); ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    circ(ctx, 24 + bob, -54, 8, A.alpha('#c8ff8a', 0.28)); ctx.restore();
    circ(ctx, 24 + bob, -54, 2.8, '#eaffb8', '#ffffff');
    ctx.strokeStyle = 'rgba(96,116,72,0.85)'; ctx.lineWidth = 1.8;                                  // reeds at the base
    for (const dx of [-15, -8, 9, 16]) { ctx.beginPath(); ctx.moveTo(dx, 8); ctx.lineTo(dx + (dx > 0 ? 4 : -4), -8); ctx.stroke(); } };

  BossSil.cinderlord = (ctx, p) => { // Cinderlord — burnt knight lit from within
    const b = p.breathe, f = 0.55 + Math.abs(Math.sin(p.t * 3)) * 0.45;
    facet(ctx, [[-13, -32 - b], [13, -32 - b], [10, 13], [-10, 13]], '#311914', '#5e3020');        // scorched cloak
    stance(ctx, -8, 12, 7, 3.6, '#1d1614');
    torso(ctx, -30 - b, -10, 11, 8, '#3a2c28', '#6a5048');                                         // charred plate
    facet(ctx, [[-9, -20], [9, -21], [8, -11], [-8, -11]], '#221a17');
    limb(ctx, -10, -26 - b, -16, -11, 3.2, 2.4, '#241b18');
    limb(ctx, 10, -26 - b, 16, -15, 3.2, 2.4, '#241b18');
    pauldron(ctx, -10, -28 - b, -1, 8, '#2e231e', '#6a4c40');
    pauldron(ctx, 10, -29 - b, 1, 8, '#2e231e', '#6a4c40');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';                                           // molten cracks
    ctx.strokeStyle = A.alpha('#ff6a1e', f); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-5, -27 - b); ctx.lineTo(-1, -19); ctx.lineTo(-5, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -28 - b); ctx.lineTo(2, -21); ctx.lineTo(6, -14); ctx.stroke();
    ctx.restore();
    facet(ctx, [[-6, -30 - b], [6, -31 - b], [5, -41 - b], [-5, -40 - b]], '#42322c', '#7a5c50');   // helm
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = A.alpha('#ffb04a', f); ctx.fillRect(-4.5, -38 - b, 9, 2.6); ctx.restore();      // burning visor
    facet(ctx, [[-5, -41 - b], [-8, -51 - b], [-1, -42 - b]], '#241b18', '#4a3028');                // broken horns
    facet(ctx, [[5, -41 - b], [8, -51 - b], [1, -42 - b]], '#241b18', '#4a3028');
    limb(ctx, 16, -15, 22, -30, 2.6, 2, '#241b18');                                                 // grip
    ctx.save(); ctx.globalCompositeOperation = 'lighter';                                           // ember greatsword
    ctx.strokeStyle = A.alpha('#ff7a2a', 0.85); ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(22, -30); ctx.lineTo(33, -52); ctx.stroke();
    ctx.strokeStyle = A.alpha('#ffe08a', f); ctx.lineWidth = 1.8; ctx.stroke(); ctx.restore();
    facet(ctx, [[19, -28], [26, -32], [24, -25]], '#3a2c26', '#6a5048'); };                          // crossguard

  BossSil.warden = (ctx, p) => { // Last Warden — arcane construct, tower shield
    const S2 = RS.RAMP.stone, b = p.breathe, spin = p.t * 0.7;
    stance(ctx, -9, 12, 8, 4.2, S2.shadow);
    torso(ctx, -31 - b, -11, 12, 8.5, S2.mid, S2.rim);
    facet(ctx, [[-9, -21], [9, -22], [8, -12], [-8, -12]], A.mul(S2.mid, 0.72));
    limb(ctx, -11, -27 - b, -17, -14, 3.2, 2.4, S2.shadow);                                          // shield arm
    limb(ctx, 11, -27 - b, 17, -12, 3.2, 2.4, S2.shadow);
    pauldron(ctx, -11, -29 - b, -1, 8, A.mul(S2.mid, 1.15), S2.rim);
    pauldron(ctx, 11, -30 - b, 1, 8, A.mul(S2.mid, 1.15), S2.rim);
    facet(ctx, [[-6, -31 - b], [6, -32 - b], [5, -41 - b], [-5, -40 - b]], S2.light, S2.rim);
    circ(ctx, 0, -36 - b, 2.6, '#9fd0ff', '#dff0ff');                                                // single core eye
    ctx.save(); ctx.globalCompositeOperation = 'lighter';                                            // rune ring
    for (let i = 0; i < 4; i++) { const a = spin + i * (TAU / 4);
      circ(ctx, Math.cos(a) * 15, -22 - b + Math.sin(a) * 5, 2, A.alpha('#7fb0ff', 0.9)); }
    ctx.restore();
    facet(ctx, [[-27, -33], [-14, -37], [-14, 6], [-27, 1]], A.mul(S2.mid, 1.1), S2.rim);            // tower shield
    facet(ctx, [[-25, -31], [-16, -34], [-16, 2], [-25, -2]], A.mul(S2.mid, 0.86));
    ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-20.5, -31); ctx.lineTo(-20.5, 1); ctx.moveTo(-26, -16); ctx.lineTo(-15, -16); ctx.stroke(); };

  BossSil.stormwyrm = (ctx, p) => { // Storm Wyrm — winged serpent, hovers
    const flap = Math.sin(p.t * 3.4) * 9, R = RS.RAMP.arcane, hov = Math.sin(p.t * 1.3) * 2.5;
    ctx.save(); ctx.translate(0, -16 + hov);
    // far wing first (darker) then the near wing, so the pair reads as depth
    for (const s of [-1, 1]) {
      const far = s < 0, lift = flap * (far ? 0.6 : 1);
      const wc = far ? A.mul(R.shadow, 0.9) : A.mul(R.mid, 0.92);
      facet(ctx, [[s * 5, -14], [s * 20, -30 - lift], [s * 36, -26 - lift], [s * 33, -10 - lift * 0.4], [s * 18, 1], [s * 5, -3]], wc, R.rim);
      ctx.strokeStyle = A.mul(R.shadow, 0.75); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s * 5, -13); ctx.lineTo(s * 19, -28 - lift); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 5, -12); ctx.lineTo(s * 31, -22 - lift * 0.8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 5, -10); ctx.lineTo(s * 24, -6 - lift * 0.3); ctx.stroke();
    }
    // serpentine tail: a tapering chain of segments, not one flat stroke
    for (let i = 0; i < 7; i++) {
      const f = i / 6, tx = -4 - f * 30, ty = 2 + Math.sin(p.t * 2 + f * 3.4) * 5 * f + f * 6;
      circ(ctx, tx, ty, 4.6 * (1 - f * 0.78), i % 2 ? R.mid : R.shadow, R.rim);
    }
    facet(ctx, [[-8, 3], [-5, -13], [8, -14], [10, 3]], R.shadow, R.rim);                   // chest
    facet(ctx, [[-4, -1], [6, -2], [5, 4], [-3, 4]], A.mul(R.mid, 1.15));                   // belly plate
    limb(ctx, 5, -11, 17, -24, 4.4, 3.2, R.mid, R.rim);                                     // neck
    facet(ctx, [[12, -29], [28, -32], [32, -22], [15, -19]], R.mid, R.rim);                 // head
    facet(ctx, [[25, -28], [32, -24], [24, -22]], '#e8dcc0');                               // jaw
    circ(ctx, 20, -27, 2, '#dff0ff', '#ffffff');                                            // eye
    facet(ctx, [[13, -31], [15, -43], [21, -30]], R.light, R.rim);                          // crest
    facet(ctx, [[16, -30], [18, -38], [22, -29]], A.mul(R.light, 1.15));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';                                   // storm arcs
    ctx.strokeStyle = A.alpha('#bfe0ff', 0.4 + Math.sin(p.t * 9) * 0.4); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-24, -22); ctx.lineTo(-14, -13); ctx.lineTo(-19, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, -16); ctx.lineTo(18, -9); ctx.lineTo(24, -3); ctx.stroke();
    ctx.restore(); ctx.restore(); };

  BossSil.malgrath = (ctx, p) => { // Bone Sovereign — crowned skeletal king, floats
    const B = RS.RAMP.bone, b = p.breathe, float = Math.sin(p.t * 1.1) * 2.5;
    ctx.save(); ctx.translate(0, float);
    facet(ctx, [[-16, -34 - b], [16, -34 - b], [12, 13], [-12, 13]], '#2c1f38', '#5f4478');            // regal shroud
    facet(ctx, [[-8, -12], [-7, -30 - b], [7, -31 - b], [8, -12]], B.shadow);                          // ribcage
    ctx.strokeStyle = B.light; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const y = -27 + i * 4.6 - b; ctx.beginPath(); ctx.moveTo(-5.5, y); ctx.quadraticCurveTo(0, y + 3, 5.5, y); ctx.stroke(); }
    limb(ctx, -10, -28 - b, -17, -14, 2.4, 1.8, B.mid, B.rim);                                         // bone arms
    limb(ctx, 10, -28 - b, 16, -16, 2.4, 1.8, B.mid, B.rim);
    pauldron(ctx, -10, -30 - b, -1, 7.5, B.mid, B.rim);
    pauldron(ctx, 10, -31 - b, 1, 7.5, B.mid, B.rim);
    circ(ctx, 0, -37 - b, 5.2, B.light, B.rim);                                                        // skull
    circ(ctx, -2, -37.5 - b, 1.6, '#8fd4a8'); circ(ctx, 2, -37.5 - b, 1.6, '#8fd4a8');
    ctx.strokeStyle = B.shadow; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2.6, -33.5 - b); ctx.lineTo(2.6, -33.5 - b); ctx.stroke();
    facet(ctx, [[-8, -42 - b], [-6, -52 - b], [-2.5, -43 - b], [0, -54 - b], [2.5, -43 - b], [6, -52 - b], [8, -42 - b]],
      RS.RAMP.gold.mid, RS.RAMP.gold.rim);                                                             // crown
    limb(ctx, 16, -16, 20, -44, 2.2, 1.8, B.mid, B.rim);                                               // bone staff
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    circ(ctx, 20, -48, 7, A.alpha('#8fd4a8', 0.3)); ctx.restore();
    circ(ctx, 20, -48, 3.2, '#a8e8c0', '#dff8e8');
    ctx.restore(); };

  BossSil.forgemaster = (ctx, p) => { // Obsidian Forgemaster — molten smith + hammer
    const b = p.breathe, heat = 0.5 + Math.abs(Math.sin(p.t * 2.4)) * 0.5;
    stance(ctx, -9, 13, 10, 5, '#151114');
    torso(ctx, -30 - b, -11, 16, 11.5, '#231c22', '#5a4a56');                                          // obsidian bulk
    facet(ctx, [[-13, -20], [13, -21], [11, -12], [-11, -12]], '#100c10');
    limb(ctx, -15, -26 - b, -22, -11, 4, 2.8, '#221a20');
    limb(ctx, 15, -26 - b, 22, -15, 4, 2.8, '#221a20');
    pauldron(ctx, -15, -28 - b, -1, 10, '#2a2028', '#6a5a66');
    pauldron(ctx, 15, -29 - b, 1, 10, '#2a2028', '#6a5a66');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';                                              // forge-fire chest
    const gr = ctx.createRadialGradient(0, -21 - b, 1, 0, -21 - b, 15);
    gr.addColorStop(0, A.alpha('#ff8a2a', heat)); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, -21 - b, 15, 0, TAU); ctx.fill(); ctx.restore();
    facet(ctx, [[-5, -16 - b], [5, -16 - b], [3.5, -27 - b], [-3.5, -27 - b]], A.alpha('#ff7a1e', heat)); // furnace mouth
    facet(ctx, [[-7, -30 - b], [7, -31 - b], [6, -40 - b], [-6, -39 - b]], '#241c22', '#584a54');       // anvil head
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = A.alpha('#ffc24a', heat); ctx.fillRect(-4.5, -37 - b, 9, 2.4); ctx.restore();
    facet(ctx, [[-10, -40 - b], [10, -41 - b], [8, -46 - b], [-8, -45 - b]], '#332a30', '#6a5a66');     // brow
    limb(ctx, 22, -15, 29, -38, 3.4, 2.6, '#2a2228', '#544850');                                        // haft
    // blacksmith's maul: square striking face, tapered poll, bound socket
    facet(ctx, [[26, -49], [46, -44], [46, -24], [26, -19]], '#3a3038', '#8a7a86');                      // head block
    facet(ctx, [[28, -46], [42, -42], [42, -27], [28, -23]], '#4a3f48');                                 // face bevel
    facet(ctx, [[46, -44], [51, -39], [51, -29], [46, -24]], '#2b232a', '#6a5a66');                      // striking face
    ctx.save(); ctx.globalCompositeOperation = 'lighter';                                                // heat still in the steel
    facet(ctx, [[29, -44], [41, -40], [41, -29], [29, -25]], A.alpha('#ff6a1e', heat * 0.55)); ctx.restore();
    socket(ctx, 27, -34, -1.32, 7, 3, '#1d171c', '#6a5a66'); };

  BossSil.azhrakoth = (ctx, p) => { // Ember Throne — the great horned demon lord
    const b = p.breathe, f = 0.55 + Math.abs(Math.sin(p.t * 2.2)) * 0.45, wing = Math.sin(p.t * 1.5) * 5;
    for (const s of [-1, 1]) {                                                                          // tattered wings
      facet(ctx, [[s * 9, -30], [s * 34, -46 - wing], [s * 40, -22 - wing], [s * 26, -6], [s * 8, -14]], '#2a0f10', '#7a2418');
      ctx.strokeStyle = '#5a1a14'; ctx.lineWidth = 1.6;
      for (const q of [0.5, 0.78, 1]) { ctx.beginPath(); ctx.moveTo(s * 9, -29); ctx.lineTo(s * (9 + 27 * q), -44 * q - wing * q + 2); ctx.stroke(); }
    }
    stance(ctx, -9, 13, 10, 5, '#4a1414');
    torso(ctx, -32 - b, -11, 15, 11, '#7a2222', '#c25438');                                              // body
    facet(ctx, [[-12, -21], [12, -22], [10, -12], [-10, -12]], '#521616');
    limb(ctx, -14, -28 - b, -21, -12, 4, 2.8, '#5e1a1a');
    limb(ctx, 14, -28 - b, 21, -12, 4, 2.8, '#5e1a1a');
    pauldron(ctx, -14, -30 - b, -1, 10, '#4a1414', '#8a3020');
    pauldron(ctx, 14, -31 - b, 1, 10, '#4a1414', '#8a3020');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';                                                // core furnace
    const gr = ctx.createRadialGradient(0, -22 - b, 1, 0, -22 - b, 16);
    gr.addColorStop(0, A.alpha('#ff5a2a', f)); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, -22 - b, 16, 0, TAU); ctx.fill(); ctx.restore();
    facet(ctx, [[-7, -32 - b], [7, -33 - b], [6, -43 - b], [-6, -42 - b]], '#8a2626', '#cc6244');        // head
    eyes(ctx, 0, -38 - b, '#ffd45a', 1.9);
    facet(ctx, [[-5, -35 - b], [5, -35 - b], [3, -32 - b], [-3, -32 - b]], '#1c0a0a');                   // maw
    ctx.strokeStyle = '#1e0d0c'; ctx.lineWidth = 3.6; ctx.lineCap = 'round';                             // horn crown
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 5, -43 - b); ctx.quadraticCurveTo(s * 17, -56 - b, s * 10, -66 - b); ctx.stroke();
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(s * 7, -39 - b); ctx.quadraticCurveTo(s * 20, -43 - b, s * 23, -53 - b); ctx.stroke();
      ctx.lineWidth = 3.6;
    } };

  BossSil.herald = (ctx, p) => { // Grey Herald — faceless envoy, orbiting mirror shards
    const b = p.breathe, float = Math.sin(p.t * 1.0) * 3.2, spin = p.t * 0.5;
    ctx.save(); ctx.translate(0, float);
    facet(ctx, [[0, -48 - b], [18, 13], [-18, 13]], '#5a5f6b', '#a8b2c0');                              // robed cone
    facet(ctx, [[0, -48 - b], [9, -14], [-9, -14]], A.mul('#5a5f6b', 0.78));                             // inner fold
    facet(ctx, [[0, -48 - b], [-8, -28], [8, -28]], '#383c45');                                          // deep cowl
    circ(ctx, 0, -36 - b, 3.8, 'rgba(0,0,0,0.88)');
    circ(ctx, 0, -36 - b, 1.7, A.alpha('#dfe8ff', 0.55 + Math.sin(p.t * 3) * 0.35));                     // one pale light
    limb(ctx, -9, -30 - b, -16, -16, 2.4, 1.8, '#4c5058', '#8a939f');                                    // sleeves
    limb(ctx, 9, -30 - b, 16, -16, 2.4, 1.8, '#4c5058', '#8a939f');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';                                                // mirror shards
    for (let i = 0; i < 5; i++) {
      const a = spin + i * (TAU / 5), rx = Math.cos(a) * 23, ry = -26 + Math.sin(a) * 9;
      facet(ctx, [[rx, ry - 4.4], [rx + 3.2, ry], [rx, ry + 4.4], [rx - 3.2, ry]], A.alpha('#cbd6ea', 0.8));
    }
    ctx.restore(); ctx.restore(); };



  // Dispatch: draw one boss body, feet at origin, facing right.
  function drawBossBody(ctx, bossKey, t, hurt) {
    const fn = BossSil[bossKey] || BossSil.corvin;
    fn(ctx, { t, breathe: Math.sin(t * 1.3) * 1.2, hurt: !!hurt });
  }

  RS.Sprites = { facet, poly, circ, drawTower, drawTowerIcon, drawEnemy, drawBody, getSheet, Sil, R0, BossSil, drawBossBody };
})();
