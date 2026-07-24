/* =========================================================================
 * REALM SIEGE — data/artstyle.js  (ART BIBLE)
 * The single source of visual truth: colour math, the fixed light model,
 * easing, animation timing, material ramps, per-rarity palettes, enemy-family
 * materials, and declarative tower/enemy rig descriptors.
 *
 * PURELY PRESENTATIONAL. Nothing here is read by the simulation (match/meta/
 * combat). Draw code pulls colours from RS.RAMP / RS.RARITY_PALETTE — never a
 * hardcoded hex in a draw call.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});

  /* ------------------------------ colour math --------------------------- */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgbToStr = (r, g, b, a) => (a == null ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`);
  function mul(hex, f) { const c = hexToRgb(hex); return rgbToStr(clamp(c.r * f, 0, 255), clamp(c.g * f, 0, 255), clamp(c.b * f, 0, 255)); }
  function mix(a, b, t) { const x = hexToRgb(a), y = hexToRgb(b); return rgbToStr(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t); }
  function toward(hex, targetHex, t) { return mix(hex, targetHex, t); }
  function alpha(hex, a) { const c = hexToRgb(hex); return rgbToStr(c.r, c.g, c.b, a); }
  // hue-cycling prismatic colour for Mythic+ (time in seconds, phase offset)
  function prismatic(t, off) { const hue = ((t * 60 + (off || 0) * 137) % 360); return `hsl(${hue},85%,62%)`; }

  /* ------------------------------ light model --------------------------- */
  // One fixed sun, upper-left. Faces carry a baked "facing" in [-1,1]
  // (1 = fully lit, -1 = fully shadowed). shade() maps that onto a ramp.
  const LIGHT = { x: -0.6, y: -0.8 };

  // Build a 4-stop ramp {shadow,mid,light,rim} from a single base hex.
  function makeRamp(base, opts) {
    opts = opts || {};
    return {
      shadow: mul(base, opts.shadow || 0.55),
      mid: base,
      light: mul(base, opts.light || 1.22),
      rim: toward(base, '#fff8e6', opts.rim || 0.5),
    };
  }
  // Pick a band from a ramp given a facing value.
  function shade(ramp, facing) {
    if (facing >= 0.85) return ramp.rim;
    if (facing >= 0.35) return ramp.light;
    if (facing >= -0.25) return ramp.mid;
    return ramp.shadow;
  }

  /* -------------------------------- easing ------------------------------ */
  const EASE = {
    linear: (t) => t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    easeOutBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    smoothstep: (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); },
  };

  /* --------------------------- animation timing ------------------------- */
  const ANIM = {
    idleBobHz: 0.5, gaitHzBase: 2.2, wingHz: 6, hoverHz: 1.1,
    attackAnticipation: 0.08, attackRecoil: 0.12, attackRecover: 0.2,
    hitFlash: 0.09, deathDuration: 0.42, placeDrop: 0.35, bannerDrop: 0.6,
    auraRotate: 0.35, upgradeFlash: 0.5, runeRotate: 0.25,
  };

  /* ------------------------------ materials ----------------------------- */
  const RAMP = {
    stone: makeRamp('#7c7a72'), stoneDark: makeRamp('#565550'),
    timber: makeRamp('#7a5230'), timberLight: makeRamp('#a8703f'),
    grass: makeRamp('#5c8a3a', { light: 1.18 }), grassDark: makeRamp('#456b2c'),
    dirt: makeRamp('#6a5238'), road: makeRamp('#5a4a38'),
    iron: makeRamp('#8b9099', { light: 1.3, rim: 0.6 }), steel: makeRamp('#aeb6bf', { light: 1.28 }),
    gold: makeRamp('#d9a441', { light: 1.28, rim: 0.7 }),
    bone: makeRamp('#d8d2bc', { shadow: 0.62 }), flesh: makeRamp('#9a6b4a'),
    cloth: makeRamp('#7a2f2f'), leather: makeRamp('#5f4326'),
    water: makeRamp('#356b8a', { light: 1.35 }), ice: makeRamp('#9fd8ea', { light: 1.15 }),
    lava: makeRamp('#c9401f', { light: 1.4, rim: 0.8 }),
    arcane: makeRamp('#7b4fb5', { light: 1.35 }), holy: makeRamp('#f0e2a4'), void: makeRamp('#3a2a4a'),
  };

  /* ------------------------- per-rarity palettes ------------------------ */
  // Each: ramp (structure metal), accent (trim), glow, particle, dais.
  const RARITY_PALETTE = {
    Common:    { base: '#9a9a9a', accent: '#8b7355', glow: '#b8b0a0', particle: '#cfc8b8', dais: '#6b6a66', glowStr: 0.10 },
    Uncommon:  { base: '#5fa855', accent: '#8a6b2f', glow: '#7bd070', particle: '#a8e8a0', dais: '#4a6b3a', glowStr: 0.16 },
    Rare:      { base: '#4a90d9', accent: '#c9d4e0', glow: '#6fb0f5', particle: '#a8d0ff', dais: '#3a5a7a', glowStr: 0.22 },
    Epic:      { base: '#9b59b6', accent: '#d9a441', glow: '#c07fe0', particle: '#e0b0ff', dais: '#4a3a5a', glowStr: 0.30 },
    Legendary: { base: '#f0a92e', accent: '#fff2c0', glow: '#ffcb5a', particle: '#ffe08a', dais: '#6a4a1a', glowStr: 0.42, shimmer: true },
    Mythic:    { base: '#e04b4b', accent: '#ffb060', glow: '#ff6a4a', particle: '#ff9a5a', dais: '#5a2020', glowStr: 0.55, ember: true },
    'Mythic+': { base: '#ffffff', accent: '#ffffff', glow: '#ffffff', particle: '#ffffff', dais: '#3a3a44', glowStr: 0.7, prismatic: true },
  };
  RS.rarityRamp = (id) => makeRamp((RARITY_PALETTE[id] || RARITY_PALETTE.Common).base, { light: 1.25, rim: 0.6 });

  /* ------------------------ enemy-family materials ---------------------- */
  const ENEMY_MAT = {
    Bandit: { ramp: makeRamp('#8a6b3a'), cloth: makeRamp('#6a3a2a'), accent: '#c9a25a' },
    Orc:    { ramp: makeRamp('#5c7a3a'), cloth: makeRamp('#3a4a20'), accent: '#8ab04a' },
    Undead: { ramp: makeRamp('#cdc9b6', { shadow: 0.5 }), cloth: makeRamp('#4a4a44'), accent: '#8fd4a8', glow: '#9fe0b8' },
    Demon:  { ramp: makeRamp('#8a2c2c'), cloth: makeRamp('#3a1414'), accent: '#ff7a3a', glow: '#ff5a2a' },
    Arcane: { ramp: makeRamp('#5f7bb5'), cloth: makeRamp('#3a4a6a'), accent: '#9fd0ff', glow: '#7fb0ff' },
    Aerial: { ramp: makeRamp('#8a94a4'), cloth: makeRamp('#5a6472'), accent: '#c9d4e0' },
  };

  /* ------------------------- tower rig descriptors ---------------------- */
  // Which silhouette routine each tower uses, its scale, and animation class.
  // Actual drawing lives in js/sprites.js; this keeps assignment declarative.
  // anim: 'archer' | 'mage' | 'siege' | 'blocker' | 'banner' | 'flyer' | 'static'
  const TOWER_ART = {
    peasant:    { sil: 'militia',    anim: 'blocker' },
    archer:     { sil: 'archer',     anim: 'archer' },
    torch:      { sil: 'brazier',    anim: 'static' },
    slinger:    { sil: 'slinger',    anim: 'siege' },
    scout:      { sil: 'watchtower', anim: 'static' },
    crossbow:   { sil: 'crossbow',   anim: 'archer' },
    menatarms:  { sil: 'menatarms',  anim: 'blocker' },
    hedge:      { sil: 'hedgewizard',anim: 'mage' },
    ballista:   { sil: 'ballista',   anim: 'siege' },
    longbow:    { sil: 'longbow',    anim: 'archer' },
    knight:     { sil: 'knight',     anim: 'blocker' },
    cleric:     { sil: 'cleric',     anim: 'banner' },
    trebuchet:  { sil: 'trebuchet',  anim: 'siege', scale: 1.1 },
    templar:    { sil: 'templar',    anim: 'blocker' },
    frostmagus: { sil: 'frostmagus', anim: 'mage' },
    bombard:    { sil: 'bombard',    anim: 'siege' },
    falconer:   { sil: 'falconer',   anim: 'archer' },
    paladin:    { sil: 'paladin',    anim: 'blocker', scale: 1.05 },
    archmage:   { sil: 'archmage',   anim: 'mage', scale: 1.05 },
    engineer:   { sil: 'engineer',   anim: 'siege' },
    wyvernrider:{ sil: 'wyvernrider',anim: 'flyer', scale: 1.05 },
    basilisk:   { sil: 'basilisk',   anim: 'siege', scale: 1.55 },
    marshal:    { sil: 'marshal',    anim: 'banner' },
    wyrm:       { sil: 'wyrm',       anim: 'static', scale: 1.25 },
    lich:       { sil: 'lich',       anim: 'mage' },
    grail:      { sil: 'grail',      anim: 'static', scale: 1.1 },
    sovereign:  { sil: 'sovereign',  anim: 'static', scale: 1.1 },
  };

  /* -------------------------- damage-type VFX ids ----------------------- */
  const DMG_VFX = {
    Physical: 'debris', Piercing: 'debris', Magic: 'arcane', Fire: 'fire',
    Frost: 'frost', Holy: 'holy', Necrotic: 'necrotic', True: 'prism',
  };

  // Damage-type + armour-type glyphs for the UI (emoji, no external assets).
  const DMG_ICON = {
    Physical: '⚔️', Piercing: '🏹', Magic: '🔮', Fire: '🔥',
    Frost: '❄️', Holy: '✨', Necrotic: '💀', True: '⭐',
  };
  // Armour categories derived from an enemy's traits/family (visual only).
  const ARMOR_ICON = { Metal: '🛡️', Bone: '🦴', Demonhide: '😈', Frost: '🧊' };
  RS.dmgIcon = (t) => DMG_ICON[t] || '⚔️';
  RS.armorClass = (e) => {
    if (!e) return null;
    const d = e.def || e;
    if (d.family === 'Undead') return 'Bone';
    if (d.family === 'Demon') return 'Demonhide';
    if (d.traits && (d.traits.includes('Armored') || d.traits.includes('Shielded'))) return 'Metal';
    if (d.armor >= 16) return 'Metal';
    return null;
  };
  RS.armorIcon = (cls) => ARMOR_ICON[cls] || '';

  RS.art = { hexToRgb, rgbToStr, mul, mix, toward, alpha, prismatic, makeRamp, shade, clamp };
  RS.LIGHT = LIGHT;
  RS.EASE = EASE;
  RS.ANIM = ANIM;
  RS.RAMP = RAMP;
  RS.RARITY_PALETTE = RARITY_PALETTE;
  RS.rarityPal = (id) => RARITY_PALETTE[id] || RARITY_PALETTE.Common;
  RS.ENEMY_MAT = ENEMY_MAT;
  RS.enemyMat = (fam) => ENEMY_MAT[fam] || ENEMY_MAT.Bandit;
  RS.TOWER_ART = TOWER_ART;
  RS.DMG_VFX = DMG_VFX;
})();
