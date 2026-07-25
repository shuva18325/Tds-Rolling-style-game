/* =========================================================================
 * REALM SIEGE — data/config.js
 * All tunable constants that aren't tower/enemy/map specific: world grid,
 * difficulty tiers, wave archetypes + budget, gacha roll tables, pity,
 * forge conversions, shards, and the economy. THIS is the designer's dial
 * board — see the Tuning Guide (README) for what to touch.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});

  // ---- World ----
  RS.TILE = 48;
  RS.GRID = { cols: 20, rows: 14 };
  RS.WORLD = { w: RS.GRID.cols * RS.TILE, h: RS.GRID.rows * RS.TILE };
  RS.TICK = 1 / 60; // fixed logic timestep (seconds)

  // ---- Difficulty tiers (§6) ----
  RS.DIFFICULTY = [
    { id: 'Easy', order: 0, waves: 20, hpMult: 1.0, speedMult: 1.0, startGold: 800, lives: 25,
      boss: 'boss_corvin', copperMult: 1.0, tokenMult: 1.0, modifiers: [],
      addArmor: 0, magicResist: 0, countMult: 1.0, night: false, noSell: false, noLeak: false, siegebreaker: false, adaptive: false },
    { id: 'Medium', order: 1, waves: 30, hpMult: 2.2, speedMult: 1.1, startGold: 650, lives: 20,
      boss: 'boss_gruumak', copperMult: 1.8, tokenMult: 2.0, modifiers: ['Hardened', 'Rally'],
      addArmor: 15, magicResist: 0, countMult: 1.0, rally: 5, night: false, noSell: false, noLeak: false, siegebreaker: false, adaptive: false },
    { id: 'Hard', order: 2, waves: 40, hpMult: 5.5, speedMult: 1.25, startGold: 500, lives: 10,
      boss: 'boss_malgrath', copperMult: 3.0, tokenMult: 3.5, modifiers: ['Warded', 'Swarmcall', 'Nightfall'],
      addArmor: 0, magicResist: 0.40, countMult: 1.5, night: true, nightFromWave: 25, noSell: false, noLeak: false, siegebreaker: false, adaptive: false },
    { id: 'Hardcore', order: 3, waves: 50, hpMult: 14, speedMult: 1.4, startGold: 400, lives: 1,
      boss: 'boss_azhrakoth', copperMult: 5.0, tokenMult: 6.0, modifiers: ['Unbroken', 'Adaptive', 'Siegebreaker', 'No-Sell'],
      addArmor: 20, magicResist: 0.25, countMult: 1.6, night: false, noSell: true, noLeak: true, siegebreaker: true, adaptive: true },
    // 💜 Purple Nightmare — a tier ABOVE Hardcore, exclusive to the Winter Map.
    // Applies the Coldness map modifier and rewards a cosmetic crown.
    { id: 'Purple Nightmare', order: 4, waves: 45, hpMult: 20, speedMult: 1.5, startGold: 650, lives: 3,
      boss: 'boss_herald', copperMult: 8.0, tokenMult: 12.0, modifiers: ['Coldness', 'Frostbound', 'No-Sell'],
      addArmor: 25, magicResist: 0.30, countMult: 1.7, night: true, noSell: true, noLeak: false, siegebreaker: false, adaptive: true,
      purple: true, cosmetic: 'Frostcrown' },
  ];
  RS.DIFF_BY_ID = {};
  RS.DIFFICULTY.forEach((d) => { RS.DIFF_BY_ID[d.id] = d; });

  // ---- Waves (§8.2) ----
  RS.WAVE = {
    baseBudget: 100,
    growth: 1.18,
    // Archetype weighting by wave position (early/mid/late) — chosen by generator.
    archetypes: {
      Standard:  { familyBias: null,        sizeBias: 1.0,  spacing: 0.9 },
      Swarm:     { familyBias: 'cheap',     sizeBias: 0.45, spacing: 0.45 },
      Elite:     { familyBias: 'expensive', sizeBias: 2.2,  spacing: 1.6 },
      Aerial:    { familyBias: 'Aerial',    sizeBias: 1.0,  spacing: 0.8 },
      Stealth:   { familyBias: 'stealth',   sizeBias: 1.2,  spacing: 1.0 },
      Split:     { familyBias: null,        sizeBias: 1.0,  spacing: 0.7, multiLane: true },
      Endurance: { familyBias: null,        sizeBias: 0.7,  spacing: 0.35 },
      Boss:      { familyBias: null,        sizeBias: 1.0,  spacing: 1.0, boss: true },
    },
    noAirBeforeWave: 3,     // waves 1-3 stay ground-only (see _archetypeFor)
    miniBossEvery: 10,       // every 10th wave = mini-boss (elite-heavy)
    callEarlyBonusPerSec: 2, // in-match gold per remaining second when calling early
  };

  // ---- Gacha roll tables (§4.1) ----
  // Basic weights are the §3.1 table. Other tiers transform them.
  RS.ROLL_BASE_WEIGHTS = {
    Common: 60.0, Uncommon: 25.0, Rare: 10.0, Epic: 3.8, Legendary: 0.75, Ancient: 0.25, Mythic: 0.19, 'Mythic+': 0.01,
  };
  RS.ROLLS = {
    Basic:  { id: 'Basic',  costToken: 'copper',  cost: 100, floor: 'Common',   label: '100 Copper' },
    Lucky:  { id: 'Lucky',  costToken: 'silver',  cost: 50,  floor: 'Uncommon', label: '50 Silver'  },
    Super:  { id: 'Super',  costToken: 'gold',    cost: 25,  floor: 'Rare',     label: '25 Gold'    },
    Divine: { id: 'Divine', costToken: 'relic',   cost: 5,   floor: 'Epic',     label: '5 Relics',
      fixed: { Epic: 64.8, Legendary: 22, Ancient: 6, Mythic: 6, 'Mythic+': 1.2 } },
  };

  // ---- Pity (§4.2) ----
  RS.PITY = {
    epic:    { hard: 40,  softStart: 30, softStep: 0.04,  key: 'Epic' },
    legend:  { hard: 120, softStart: 90, softStep: 0.015, key: 'Legendary' },
    mythic:  { hard: 400, softStart: 400, softStep: 0,    key: 'Mythic' },
    plus:    { hard: 1500, softStart: 1500, softStep: 0,  key: 'Mythic+' },
  };

  // ---- Forge (§4.4) ----
  RS.FORGE = {
    rollConvert: [
      { from: 'Basic', to: 'Lucky', n: 20 },
      { from: 'Lucky', to: 'Super', n: 15 },
      { from: 'Super', to: 'Divine', n: 10 },
    ],
    tokenConvert: [
      { from: 'copper', to: 'silver', n: 20 },
      { from: 'silver', to: 'gold', n: 25 },
      { from: 'gold', to: 'relic', n: 50 },
    ],
    shards: {
      Common:    { dismantle: 1,    craft: 10 },
      Uncommon:  { dismantle: 3,    craft: 30 },
      Rare:      { dismantle: 8,    craft: 80 },
      Epic:      { dismantle: 25,   craft: 250 },
      Legendary: { dismantle: 80,   craft: 800 },
      Ancient:   { dismantle: 150,  craft: 1500 },
      Mythic:    { dismantle: 300,  craft: 3000 },
      'Mythic+': { dismantle: 1200, craft: 12000 },
    },
    upcast: 5, // 5 shards of a rarity -> 1 shard of the next rarity up
  };

  // ---- Upgrades (§3.4) ----
  RS.UPGRADE = {
    costBase: 1.6,          // upgradeCost(n) = baseCost * (costBase ^ n)
    costFrac: 0.6,          // upgrade cost = tower.cost * costFrac * costBase^n
    perLevel: { damage: 0.22, range: 0.12, fireRate: 0.08 }, // L1-3 scaling
    maxLevel: 5,
  };

  // ---- Economy (§4.3) ----
  RS.ECON = {
    copperPerWaveMin: 10, copperPerWaveMax: 40,
    copperPerKill: 0.4,
    silverPerMap: 8, goldPerBossKill: 6,
    interestRate: 0.05, interestCap: 120,
    noLeakStreakBonus: 0.10, noLeakStreakCap: 1.0, // +10% gold per perfect wave, cap +100%
    silverFromCopper: 20, // conversion ratio shown in forge
    callEarly: true,
  };

  // ---- Account progression (§8.4) ----
  RS.ACCOUNT = {
    xpPerWave: 12, xpPerMapClear: 120, xpPerBoss: 60,
    xpCurve: (lvl) => Math.round(100 * Math.pow(1.25, lvl - 1)),
    loadoutSlots: (lvl) => Math.min(8, 5 + Math.floor(lvl / 6)), // 5 -> 8
    unlocks: {
      2: 'Forge unlocked',
      4: 'Lucky roll discount',
      6: '+1 loadout slot',
      8: '+start gold',
      12: '+1 loadout slot',
      18: '+1 loadout slot',
    },
  };

  // ---- Daily / weekly objectives (§8.4) ----
  RS.OBJECTIVES = [
    { id: 'clear3hard', desc: 'Clear 3 Hard maps', goal: 3, reward: { gold: 20 }, kind: 'clearHard' },
    { id: 'kill500undead', desc: 'Kill 500 Undead', goal: 500, reward: { relic: 2 }, kind: 'killFamily', family: 'Undead' },
    { id: 'roll50', desc: 'Roll 50 times', goal: 50, reward: { gold: 15 }, kind: 'roll' },
    { id: 'clear5maps', desc: 'Clear any 5 maps', goal: 5, reward: { silver: 40 }, kind: 'clearAny' },
    { id: 'kill1000', desc: 'Slay 1000 enemies', goal: 1000, reward: { copper: 300 }, kind: 'kill' },
  ];

  // ---- Status effect rules (§8.5) ----
  RS.STATUS = {
    burnMaxStacks: 5,
    stunDiminish: [1.0, 0.5, 0.25, 0], // 4th application -> immune
    stunImmuneDur: 6,
    critBase: 0.05, critMult: 2.0,
  };

  // ---- Environment modifiers (§7.1) ----
  RS.WEATHER = {
    Clear:    { desc: 'Clear skies.', mods: {} },
    Rain:     { desc: 'Rain: Fire −20%, chain +1 target.', mods: { Fire: -0.20, chainBonus: 1 } },
    Fog:      { desc: 'Fog: vision/range −20%.', mods: { rangeAll: -0.20 } },
    Blizzard: { desc: 'Blizzard: range −30%, Frost +25%.', mods: { rangeAll: -0.30, Frost: 0.25 } },
    Ashfall:  { desc: 'Ashfall: Fire +15%, Holy −15%.', mods: { Fire: 0.15, Holy: -0.15 } },
    Storm:    { desc: 'Storm: projectiles scatter, Magic +15%.', mods: { Magic: 0.15, scatter: 1 } },
  };
  RS.WEATHER_ROTATE = 45;   // seconds between weather changes
  RS.WEATHER_TELEGRAPH = 10; // seconds of advance warning
  RS.DAYNIGHT_CYCLE = 90;    // seconds per full day/night
  RS.NIGHT_RANGE_PENALTY = 0.25;
})();
