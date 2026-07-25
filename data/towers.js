/* =========================================================================
 * REALM SIEGE — data/towers.js
 * The 26-tower roster. Pure declarative data: the engine's generic systems
 * (blocker / splash / chain / pierce / dot / slow / aura / summon / cycle)
 * read the `traits` block and behave accordingly — no per-tower logic.
 *
 * Schema per tower:
 *   id, name, rarity, cost, damage, fireRate(shots/s), rangeT(tiles),
 *   targeting(default), damageType, splashT(tiles|0), status[],
 *   placement, traits{...behaviour flags}, upgrades{branch:[A,B]},
 *   ascend{desc}, lore
 * Displayed DPS is derived (damage * fireRate * hitCount). TUNING lives here.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});

  // Convenience so numbers stay readable; range expressed in tiles.
  const T = (o) => o;

  RS.TOWERS = [
    /* ------------------------------ COMMON ----------------------------- */
    T({ id: 'peasant', name: 'Peasant Militia', rarity: 'Common', cost: 50,
      damage: 6, fireRate: 0.9, rangeT: 0.9, targeting: 'First', damageType: 'Melee',
      splashT: 0, status: [], placement: 'Path-adjacent-only',
      traits: { blocker: { capacity: 1, respawn: 6 }, melee: true, meleeSlash: { radiusT: 1.7, arc: 2.4 } },
      upgrades: { branch: [
        { name: 'Pitchfork Drill', desc: '+capacity, +dmg', mods: { blockCap: 1, damage: 0.4 } },
        { name: 'Conscript Line', desc: 'faster respawn, +hp', mods: { respawn: -3, hp: 0.6 } } ] },
      ascend: { desc: 'Militia never falls: infinite respawn & +50% dmg.' },
      lore: 'Farmhands handed spears an hour ago. They will die well.' }),

    T({ id: 'archer', name: 'Village Archer', rarity: 'Common', cost: 75,
      damage: 12, fireRate: 1.1, rangeT: 3.2, targeting: 'First', damageType: 'Piercing',
      splashT: 0, status: [], placement: 'Ground',
      traits: { yardstick: true },
      upgrades: { branch: [
        { name: 'Longshot', desc: '+range +dmg', mods: { rangeT: 1.2, damage: 0.3 } },
        { name: 'Quickdraw', desc: '+fire rate', mods: { fireRate: 0.6 } } ] },
      ascend: { desc: 'Every 4th arrow pierces the whole line.' },
      lore: 'The yardstick of the realm. All towers are measured against them.' }),

    T({ id: 'torch', name: 'Torchbearer', rarity: 'Common', cost: 90,
      damage: 7, fireRate: 1.0, rangeT: 2.2, targeting: 'First', damageType: 'Fire',
      splashT: 0.6, status: ['Burn'], placement: 'Ground',
      traits: { burn: { dps: 6, dur: 3 }, reveal: 2.2, light: 2.4 },
      upgrades: { branch: [
        { name: 'Pyre', desc: 'stronger burn', mods: { burnDps: 6, damage: 0.2 } },
        { name: 'Beacon', desc: 'bigger reveal & light', mods: { reveal: 2, light: 2 } } ] },
      ascend: { desc: 'Burn spreads to adjacent enemies on death.' },
      lore: 'Fire remembers what steel forgets.' }),

    T({ id: 'slinger', name: 'Stone Slinger', rarity: 'Common', cost: 100,
      damage: 16, fireRate: 0.65, rangeT: 2.8, targeting: 'Strongest', damageType: 'Siege',
      splashT: 1.0, status: [], placement: 'Ground',
      traits: { splash: true, bonusVs: { trait: 'Armored', mult: 1.6 } },
      upgrades: { branch: [
        { name: 'Boulder', desc: 'bigger splash', mods: { splashT: 0.6, damage: 0.25 } },
        { name: 'Sharpstone', desc: 'more anti-armor', mods: { bonusVsMult: 0.5 } } ] },
      ascend: { desc: 'Splash strips 20 armour from all it hits.' },
      lore: 'A good sling outranges a bad conscience.' }),

    T({ id: 'scout', name: 'Watchtower Scout', rarity: 'Common', cost: 60,
      damage: 3, fireRate: 0.8, rangeT: 3.0, targeting: 'First', damageType: 'Piercing',
      splashT: 0, status: ['Mark'], placement: 'High-ground-only',
      traits: { support: { rangeAura: 0.15, radiusT: 3 }, mark: 0.10, reveal: 3.2 },
      upgrades: { branch: [
        { name: 'Spyglass', desc: 'bigger aura radius', mods: { auraRadiusT: 2 } },
        { name: 'Signal Fire', desc: 'stronger mark', mods: { mark: 0.10 } } ] },
      ascend: { desc: 'Aura also grants +10% fire rate.' },
      lore: 'Sees the arrow before it is loosed.' }),

    /* ----------------------------- UNCOMMON ---------------------------- */
    T({ id: 'crossbow', name: 'Crossbowman', rarity: 'Uncommon', cost: 180,
      damage: 34, fireRate: 0.55, rangeT: 3.4, targeting: 'Strongest', damageType: 'Piercing',
      splashT: 0, status: [], placement: 'Ground',
      traits: { armorPen: 0.30 },
      upgrades: { branch: [
        { name: 'Windlass', desc: 'more armor pen', mods: { armorPen: 0.25 } },
        { name: 'Repeater', desc: 'faster reload', mods: { fireRate: 0.4 } } ] },
      ascend: { desc: 'Ignores 65% armour and crits armoured foes.' },
      lore: 'Punches through plate like parchment.' }),

    T({ id: 'menatarms', name: 'Man-at-Arms', rarity: 'Uncommon', cost: 200,
      damage: 14, fireRate: 1.0, rangeT: 0.9, targeting: 'First', damageType: 'Melee',
      splashT: 0, status: [], placement: 'Path-adjacent-only',
      traits: { blocker: { capacity: 3, respawn: 8 }, melee: true, meleeSlash: { radiusT: 1.9, arc: 2.8 } },
      upgrades: { branch: [
        { name: 'Shieldwall', desc: '+hp, hold 4', mods: { blockCap: 1, hp: 0.8 } },
        { name: 'Halberd', desc: '+dmg cleave', mods: { damage: 0.6, splashT: 0.8 } } ] },
      ascend: { desc: 'Respawns instantly and holds 5 foes.' },
      lore: 'Professional. Paid. Unmoving.' }),

    T({ id: 'hedge', name: 'Hedge Wizard', rarity: 'Uncommon', cost: 250,
      damage: 26, fireRate: 0.8, rangeT: 3.0, targeting: 'Most-Clustered', damageType: 'Magic',
      splashT: 0, status: [], placement: 'Ground',
      traits: { chain: { count: 3, falloff: 0.8 } },
      upgrades: { branch: [
        { name: 'Forked', desc: 'chains to 5', mods: { chainCount: 2 } },
        { name: 'Overload', desc: 'no falloff, +dmg', mods: { chainFalloff: 0.2, damage: 0.3 } } ] },
      ascend: { desc: 'Chains to 8 and stuns each briefly.' },
      lore: 'Village hedge-magic, older than the crown.' }),

    T({ id: 'ballista', name: 'Ballista Crew', rarity: 'Uncommon', cost: 275,
      damage: 40, fireRate: 0.5, rangeT: 4.2, targeting: 'First', damageType: 'Piercing',
      splashT: 0, status: [], placement: 'Ground',
      traits: { pierceLine: { width: 0.6 } },
      upgrades: { branch: [
        { name: 'Heavy Bolt', desc: '+dmg', mods: { damage: 0.5 } },
        { name: 'Scorpion', desc: 'faster, wider line', mods: { fireRate: 0.4, lineWidth: 0.4 } } ] },
      ascend: { desc: 'Bolts pin: struck enemies are staggered.' },
      lore: 'One bolt, one row of the horde.' }),

    /* ------------------------------- RARE ------------------------------ */
    T({ id: 'longbow', name: 'Longbowman', rarity: 'Rare', cost: 450,
      damage: 58, fireRate: 0.9, rangeT: 5.5, targeting: 'Strongest', damageType: 'Piercing',
      splashT: 0, status: [], placement: 'Ground',
      traits: { bonusVs: { trait: 'Flying', mult: 1.5 } },
      upgrades: { branch: [
        { name: 'Volley', desc: 'fires 3 arrows', mods: { multishot: 3, damage: -0.2 } },
        { name: 'Deadeye', desc: 'huge crit', mods: { critChance: 0.25, critMult: 1.5 } } ] },
      ascend: { desc: 'Arrows arc over blockers and never miss flyers.' },
      lore: 'A yard of ash, a yew of war.' }),

    T({ id: 'knight', name: 'Knight Errant', rarity: 'Rare', cost: 500,
      damage: 44, fireRate: 1.2, rangeT: 1.2, targeting: 'Last', damageType: 'Melee',
      splashT: 0.6, status: [], placement: 'Ground',
      traits: { mobile: { speed: 90, interceptR: 999 }, blocker: { capacity: 2, respawn: 5 }, melee: true, meleeSlash: { radiusT: 2.0, arc: 3.0 } },
      upgrades: { branch: [
        { name: 'Charger', desc: 'faster, more dmg', mods: { moveSpeed: 40, damage: 0.4 } },
        { name: 'Bulwark', desc: 'holds 4, +hp', mods: { blockCap: 2, hp: 1.0 } } ] },
      ascend: { desc: 'Two knights ride from one banner.' },
      lore: 'Sworn to no wall — only to the weak point.' }),

    T({ id: 'cleric', name: 'Cleric', rarity: 'Rare', cost: 425,
      damage: 10, fireRate: 0.8, rangeT: 3.2, targeting: 'First', damageType: 'Holy',
      splashT: 0, status: [], placement: 'Ground',
      traits: { support: { attackSpeedAura: 0.20, radiusT: 3, healBlockers: 20 }, purge: true, light: 2, reveal: 2.8 },
      upgrades: { branch: [
        { name: 'Zealotry', desc: 'stronger haste', mods: { atkSpeedAura: 0.15 } },
        { name: 'Sanctuary', desc: 'stronger heals', mods: { heal: 25, auraRadiusT: 1 } } ] },
      ascend: { desc: 'Aura also grants +15% damage and shields blockers.' },
      lore: 'Faith is the only wall that mends itself.' }),

    T({ id: 'trebuchet', name: 'Trebuchet', rarity: 'Rare', cost: 600,
      damage: 150, fireRate: 0.2, rangeT: 7.0, targeting: 'Most-Clustered', damageType: 'Siege',
      splashT: 1.8, status: [], placement: 'Ground',
      traits: { splash: true, minRangeT: 4 },
      upgrades: { branch: [
        { name: 'Firepot', desc: 'adds burn splash', mods: { addBurn: 12, splashT: 0.4 } },
        { name: 'Counterweight', desc: '+dmg +splash', mods: { damage: 0.5, splashT: 0.6 } } ] },
      ascend: { desc: 'Every 4th shot is a triple-payload barrage.' },
      lore: 'The argument that ends all sieges.' }),

    /* ------------------------------- EPIC ------------------------------ */
    T({ id: 'templar', name: 'Templar Knight', rarity: 'Epic', cost: 1100,
      damage: 78, fireRate: 1.0, rangeT: 2.4, targeting: 'Strongest', damageType: 'Holy',
      splashT: 0.5, status: [], placement: 'Ground',
      traits: { blocker: { capacity: 2, respawn: 4 }, resurrect: { perWave: 1 },
        bonusVs: { traitAny: ['Undead', 'Demon'], mult: 2.0 } },
      upgrades: { branch: [
        { name: 'Crusader', desc: '+holy dmg', mods: { damage: 0.6 } },
        { name: 'Martyr', desc: 'resurrect twice', mods: { resurrect: 1 } } ] },
      ascend: { desc: 'Resurrects endlessly and smites on revive.' },
      lore: 'Where the Templar falls, light stands back up.' }),

    T({ id: 'frostmagus', name: 'Frost Magus', rarity: 'Epic', cost: 1250,
      damage: 40, fireRate: 0.9, rangeT: 3.4, targeting: 'Most-Clustered', damageType: 'Frost',
      splashT: 1.2, status: ['Slow'], placement: 'Ground',
      traits: { slowField: { radiusT: 2.6, slow: 0.40, vuln: 0.25 } },
      upgrades: { branch: [
        { name: 'Deep Freeze', desc: 'stronger slow', mods: { slow: 0.15, vuln: 0.10 } },
        { name: 'Frostbite', desc: '+dmg +splash', mods: { damage: 0.5, splashT: 0.6 } } ] },
      ascend: { desc: 'Field occasionally freezes foes solid.' },
      lore: 'Winter obeys the Magus, and the horde obeys winter.' }),

    T({ id: 'bombard', name: 'Bombard Cannon', rarity: 'Epic', cost: 1400,
      damage: 220, fireRate: 0.45, rangeT: 4.0, targeting: 'Most-Clustered', damageType: 'Fire',
      splashT: 1.6, status: ['Stagger'], placement: 'Ground',
      traits: { splash: true, breakShield: true, stagger: 0.8 },
      upgrades: { branch: [
        { name: 'Grapeshot', desc: 'wider splash', mods: { splashT: 0.8 } },
        { name: 'Siegebreaker', desc: '+dmg vs armored', mods: { damage: 0.4, bonusVsMult: 0.6 } } ] },
      ascend: { desc: 'Shots detonate twice; shields shatter map-wide near it.' },
      lore: 'Powder was a mistake. This is its apology.' }),

    T({ id: 'falconer', name: 'Royal Falconer', rarity: 'Epic', cost: 1000,
      damage: 36, fireRate: 1.4, rangeT: 3.0, targeting: 'First', damageType: 'Piercing',
      splashT: 0, status: [], placement: 'Ground',
      traits: { summon: { kind: 'falcon', count: 3, seek: 'Flying', dps: 30, speed: 160 } },
      upgrades: { branch: [
        { name: 'Gyrfalcon', desc: '+falcon dmg', mods: { summonDps: 20 } },
        { name: 'Skymaster', desc: '4 falcons', mods: { summonCount: 1 } } ] },
      ascend: { desc: 'Falcons strike ground foes too and never tire.' },
      lore: 'The sky is a wall too, if you have the birds for it.' }),

    /* ----------------------------- LEGENDARY --------------------------- */
    T({ id: 'paladin', name: 'Paladin Champion', rarity: 'Legendary', cost: 3000,
      damage: 130, fireRate: 1.1, rangeT: 2.6, targeting: 'Strongest', damageType: 'Holy',
      splashT: 0.8, status: [], placement: 'Ground',
      traits: { blocker: { capacity: 3, respawn: 3 },
        aura: { radiusT: 5, dmg: 0.25, immune: ['Fear', 'Curse'] } },
      upgrades: { branch: [
        { name: 'Warlord', desc: 'stronger aura', mods: { auraDmg: 0.15 } },
        { name: 'Guardian', desc: 'bigger aura', mods: { auraRadiusT: 2 } } ] },
      ascend: { desc: 'Aura grants +40% dmg and a shared shield.' },
      lore: 'Around the Champion, no ally learns fear.' }),

    T({ id: 'archmage', name: 'Archmage of the Spire', rarity: 'Legendary', cost: 3500,
      damage: 180, fireRate: 0.7, rangeT: 4.4, targeting: 'Most-Clustered', damageType: 'Magic',
      splashT: 1.4, status: [], placement: 'Ground',
      traits: { spellCycle: [
        { name: 'Meteor', type: 'Fire', splashT: 1.8, mult: 1.4 },
        { name: 'Blizzard', type: 'Frost', splashT: 2.0, mult: 1.0, slow: 0.4 },
        { name: 'Arcane Lance', type: 'True', splashT: 0, mult: 2.2 } ] },
      upgrades: { branch: [
        { name: 'Evoker', desc: '+spell dmg', mods: { damage: 0.5 } },
        { name: 'Chronomancer', desc: 'faster cycle', mods: { fireRate: 0.5 } } ] },
      ascend: { desc: 'Casts all three spells at once every 6th shot.' },
      lore: 'Three schools, one temper, no survivors.' }),

    T({ id: 'engineer', name: 'Siege Engineer Corps', rarity: 'Legendary', cost: 3200,
      damage: 90, fireRate: 0.8, rangeT: 3.2, targeting: 'First', damageType: 'Siege',
      splashT: 0.6, status: [], placement: 'Ground',
      traits: { builder: { every: 30, max: 4, turretDps: 45, turretRangeT: 3 } },
      upgrades: { branch: [
        { name: 'Foundry', desc: 'builds faster', mods: { buildEvery: -10 } },
        { name: 'Artillery Park', desc: 'stronger turrets', mods: { turretDps: 30 } } ] },
      ascend: { desc: 'Turrets gain splash and never cap.' },
      lore: 'Give them a tile and a winch; they give you a war machine.' }),

    T({ id: 'wyvernrider', name: 'Wyvern Rider', rarity: 'Legendary', cost: 3800,
      damage: 150, fireRate: 1.6, rangeT: 4.0, targeting: 'First', damageType: 'Fire',
      splashT: 1.2, status: ['Burn'], placement: 'Global',
      traits: { strafe: { speed: 130 }, flying: true, burn: { dps: 20, dur: 3 } },
      upgrades: { branch: [
        { name: 'Firestorm', desc: 'bigger splash', mods: { splashT: 0.8 } },
        { name: 'Ace', desc: 'faster strafe', mods: { moveSpeed: 60, fireRate: 0.5 } } ] },
      ascend: { desc: 'Leaves a trail of fire along the whole path.' },
      lore: 'It answers to no terrain and no crown.' }),

    T({ id: 'basilisk', name: 'The Sultan\'s Basilisk', rarity: 'Legendary', cost: 3600,
      damage: 480, fireRate: 0.12, rangeT: 5.5, targeting: 'Most-Clustered', damageType: 'Siege',
      splashT: 2.2, status: ['Stagger'], placement: 'Ground',
      // footprint 2 = a genuine 2x2 giant; heavyReload flags the long charge-up
      // animation + the deep "great cannon" boom (both purely presentational).
      traits: { footprint: 2, splash: true, heavyReload: true, stagger: 0.6,
        bonusVs: { trait: 'Armored', mult: 1.8 } },
      upgrades: { branch: [
        { name: 'Chain Shot', desc: 'wider splash, hits packed lines', mods: { splashT: 1.0 } },
        { name: 'Siege Round', desc: 'devastating single-target strike', mods: { damage: 0.7, bonusVsMult: 0.6 } } ] },
      ascend: { desc: 'Reload halved; the barrel glows white-hot between shots.' },
      lore: 'Cast in a single mould over forty days, drawn by sixty oxen. It does not besiege a wall — it ends the argument.' }),

    /* ------------------------------ MYTHIC ----------------------------- */
    T({ id: 'marshal', name: 'Grand Marshal of the Realm', rarity: 'Mythic', cost: 8000,
      damage: 20, fireRate: 1.0, rangeT: 2.0, targeting: 'First', damageType: 'Holy',
      splashT: 0, status: [], placement: 'Global',
      traits: { globalAura: { dmg: 0.40, range: 0.25, gold: 0.20, reviveAll: 1 } },
      upgrades: { branch: [
        { name: 'High Command', desc: '+aura dmg', mods: { globalDmg: 0.15 } },
        { name: 'Quartermaster', desc: '+aura gold', mods: { globalGold: 0.15 } } ] },
      ascend: { desc: 'Grants every tower two revives and +60% damage.' },
      lore: 'When the Marshal speaks, the whole line stands taller.' }),

    T({ id: 'wyrm', name: 'Ancient Wyrm', rarity: 'Mythic', cost: 9500,
      damage: 260, fireRate: 0.9, rangeT: 4.2, targeting: 'Most-Clustered', damageType: 'Fire',
      splashT: 0, status: ['Burn'], placement: 'Ground',
      traits: { footprint: 2, cone: { angle: 0.9, lengthT: 4.5 },
        flameSweep: { every: 45, mult: 3 }, burn: { dps: 40, dur: 3 } },
      upgrades: { branch: [
        { name: 'Inferno', desc: '+cone dmg', mods: { damage: 0.5 } },
        { name: 'Elder', desc: 'faster sweep', mods: { sweepEvery: -15 } } ] },
      ascend: { desc: 'Cone widens to a half-circle; sweep hits twice.' },
      lore: 'It was old when the mountains were young.' }),

    T({ id: 'lich', name: 'Lichbound Necromancer', rarity: 'Mythic', cost: 9000,
      damage: 120, fireRate: 1.0, rangeT: 3.6, targeting: 'Weakest', damageType: 'Necrotic',
      splashT: 0.6, status: [], placement: 'Ground',
      traits: { ignoreResist: true, raise: { max: 12, wraithDps: 50, radiusT: 3.6 } },
      upgrades: { branch: [
        { name: 'Plague Lord', desc: '+wraith dmg', mods: { wraithDps: 30 } },
        { name: 'Bone Sovereign', desc: 'raise 18', mods: { raiseMax: 6 } } ] },
      ascend: { desc: 'Wraiths are unkillable and rise from any kill on the map.' },
      lore: 'Death, for the Lich, is merely conscription.' }),

    /* ------------------------------ MYTHIC+ ---------------------------- */
    T({ id: 'grail', name: 'Avatar of the Eternal Grail', rarity: 'Mythic+', cost: 25000,
      damage: 300, fireRate: 1.2, rangeT: 4.0, targeting: 'Strongest', damageType: 'Holy',
      splashT: 1.0, status: [], placement: 'Global',
      traits: { globalAura: { invuln: true, dmg: 0.20 },
        active: { name: 'Judgment', cd: 90, kind: 'judgment', bossPct: 0.25 } },
      upgrades: { branch: [
        { name: 'Radiance', desc: 'shorter CD', mods: { activeCd: -20 } },
        { name: 'Ascendant', desc: 'stronger judgment', mods: { bossPct: 0.15 } } ] },
      ascend: { desc: 'Judgment also heals lives and shortens its cooldown.' },
      lore: 'It does not defend the realm. It is the realm, made will.' }),

    T({ id: 'sovereign', name: 'Sovereign of the Worldforge', rarity: 'Mythic+', cost: 25000,
      damage: 280, fireRate: 1.0, rangeT: 4.2, targeting: 'Most-Clustered', damageType: 'True',
      splashT: 1.4, status: [], placement: 'Global',
      traits: { globalAura: { dmgToGold: 0.10 },
        active: { name: 'Reforge the Field', cd: 120, kind: 'reforge', shorten: 0.15, platforms: 2 } },
      upgrades: { branch: [
        { name: 'Mint', desc: '+gold conversion', mods: { dmgToGold: 0.06 } },
        { name: 'Architect', desc: 'shorter CD', mods: { activeCd: -30 } } ] },
      ascend: { desc: 'Reforge also spawns two free turrets on new platforms.' },
      lore: 'It does not hold the line. It rewrites where the line is.' }),
  ];

  // Fast lookup + a couple of derived helpers used by UI/engine.
  RS.TOWER_BY_ID = {};
  RS.TOWERS.forEach((t) => { RS.TOWER_BY_ID[t.id] = t; });

  // Derived display DPS accounting for splash/chain/multishot rough factors.
  RS.towerDps = (t) => {
    let hits = 1;
    if (t.traits.chain) hits = 1 + (t.traits.chain.count || 0) * 0.7;
    if (t.traits.pierceLine) hits = 3;
    if (t.traits.splash) hits = 2.2;
    if (t.traits.summon) hits += 1.5;
    return Math.round(t.damage * t.fireRate * hits);
  };

  /* ---------------------- NAMED UPGRADES (flavour) ----------------------
   * Unique names + plain-language descriptions for the L2 & L3 stat upgrades
   * and the L5 Ascension. Purely presentational — no stat values live here
   * (L1-3 apply the same +22% dmg / +12% range / +8% rate defined in config).
   * L4 branch names/descs already live on each tower's upgrades.branch.       */
  const std = (n, d) => ({ n, d });
  RS.TOWER_UPGRADES = {
    peasant:   { l2: std('Whetted Pitchforks', 'Sharper tools bite deeper. +22% dmg, +12% range, +8% attack speed.'), l3: std('Village Muster', 'More hands to the wall. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Endless Levy' },
    archer:    { l2: std('Keen Fletching', 'Truer arrows. +22% dmg, +12% range, +8% attack speed.'), l3: std('Master Bowyer', 'A finer bow. +22% dmg, +12% range, +8% attack speed.'), ascend: "Yeoman's Eye" },
    torch:     { l2: std('Pitch & Tar', 'A hotter, longer burn. +22% dmg, +12% range, +8% attack speed.'), l3: std('Watchfire', 'Farther reach, brighter reveal. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Wildfire Spread' },
    slinger:   { l2: std('River Stones', 'Denser shot. +22% dmg, +12% range, +8% attack speed.'), l3: std('Practiced Arc', 'Better lob. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Shatterstone' },
    scout:     { l2: std('Far Sight', 'Sees further. +22% dmg, +12% range, +8% attack speed.'), l3: std('Signal Discipline', 'Sharper marks. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Eagle Watch' },
    crossbow:  { l2: std('Steel Windlass', 'Faster spanning. +22% dmg, +12% range, +8% attack speed.'), l3: std('Armor-Piercer', 'Punches plate. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Executioner Bolt' },
    menatarms: { l2: std("Sergeant's Drill", 'Steadier line. +22% dmg, +12% range, +8% attack speed.'), l3: std('Tempered Steel', 'Tougher, sharper. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Unbreakable Wall' },
    hedge:     { l2: std('Static Charge', 'Bigger jolt. +22% dmg, +12% range, +8% attack speed.'), l3: std('Storm Weaving', 'Longer arcs. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Chain Cataclysm' },
    ballista:  { l2: std('Iron Bolts', 'Heavier shot. +22% dmg, +12% range, +8% attack speed.'), l3: std('Torsion Tuning', 'Faster loose. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Line Splitter' },
    longbow:   { l2: std('Yew Heartwood', 'Deeper draw. +22% dmg, +12% range, +8% attack speed.'), l3: std('Cloth-Yard Shaft', 'Longer range. +22% dmg, +12% range, +8% attack speed.'), ascend: "Sky-Piercer's Oath" },
    knight:    { l2: std("Knight's Oath", 'Bolder charge. +22% dmg, +12% range, +8% attack speed.'), l3: std('Destrier', 'A stronger steed. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Twin Lances' },
    cleric:    { l2: std('Blessed Rites', 'Stronger blessings. +22% dmg, +12% range, +8% attack speed.'), l3: std('Consecration', 'Wider grace. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Divine Aegis' },
    trebuchet: { l2: std('Heavier Counterweight', 'Bigger payload. +22% dmg, +12% range, +8% attack speed.'), l3: std('Master Ranging', 'Truer arc. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Triple Barrage' },
    templar:   { l2: std('Blessed Bolts', 'Radiant strikes. +22% dmg, +12% range, +8% attack speed.'), l3: std('Oath of Light', 'Farther faith. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Everliving Martyr' },
    frostmagus:{ l2: std('Frostheart Surge', 'Colder core. +22% dmg, +12% range, +8% attack speed.'), l3: std('Deepwinter', 'Wider chill. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Absolute Zero' },
    bombard:   { l2: std('Corned Powder', 'Bigger blast. +22% dmg, +12% range, +8% attack speed.'), l3: std('Rifled Bore', 'Longer reach. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Doomsday Charge' },
    falconer:  { l2: std('Prized Hunters', 'Keener birds. +22% dmg, +12% range, +8% attack speed.'), l3: std('Wide Cast', 'Longer flights. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Sky Sovereigns' },
    paladin:   { l2: std("Champion's Resolve", 'Greater might. +22% dmg, +12% range, +8% attack speed.'), l3: std('Rallying Banner', 'Wider aura. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Aegis of Kings' },
    archmage:  { l2: std('Arcane Mastery', 'Mightier spells. +22% dmg, +12% range, +8% attack speed.'), l3: std('Ley-Line Tap', 'Longer reach. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Trinity Cast' },
    engineer:  { l2: std('Reinforced Turrets', 'Sturdier builds. +22% dmg, +12% range, +8% attack speed.'), l3: std('Assembly Line', 'Faster works. +22% dmg, +12% range, +8% attack speed.'), ascend: 'War Foundry' },
    wyvernrider:{ l2: std('Firebreath Tonic', 'Hotter breath. +22% dmg, +12% range, +8% attack speed.'), l3: std('Ace Flight', 'Swifter strafe. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Trail of Cinders' },
    basilisk:  { l2: std('Reinforced Bands', 'Thicker iron rings. +22% dmg, +12% range, +8% attack speed.'), l3: std('Master Founders', 'A truer bore. +22% dmg, +12% range, +8% attack speed.'), ascend: 'The Conqueror\'s Voice' },
    marshal:   { l2: std('War Council', 'Stronger command. +22% dmg, +12% range, +8% attack speed.'), l3: std('Grand Strategy', 'Wider reach. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Banner of the Realm' },
    wyrm:      { l2: std('Molten Gullet', 'Fiercer breath. +22% dmg, +12% range, +8% attack speed.'), l3: std('Ancient Fury', 'Wider cone. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Elder Cataclysm' },
    lich:      { l2: std('Grave Bind', 'Stronger raise. +22% dmg, +12% range, +8% attack speed.'), l3: std('Death Dominion', 'Wider grasp. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Undying Legion' },
    grail:     { l2: std('Radiant Ascension', 'Holier light. +22% dmg, +12% range, +8% attack speed.'), l3: std('Eternal Grace', 'Farther reach. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Judgment Eternal' },
    sovereign: { l2: std('Reality Weave', 'Warped might. +22% dmg, +12% range, +8% attack speed.'), l3: std('Worldforge Core', 'Wider warp. +22% dmg, +12% range, +8% attack speed.'), ascend: 'Reforge the World' },
  };
})();
