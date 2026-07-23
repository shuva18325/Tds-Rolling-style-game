/* =========================================================================
 * REALM SIEGE — data/enemies.js
 * 36 enemy types across 6 families + 5 bosses. Declarative; the engine's
 * trait system drives behaviour. hp/speed are BASE values (difficulty scales
 * them). speed is px/second along the path. magicResist is 0..1.
 *
 * Schema: { id, name, family, hp, speed, armor, magicResist, bounty,
 *           traits[], abilities{...}, motif, cost(for wave budget) }
 * `cost` is the wave-budget price; roughly proportional to threat.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const E = (o) => o;

  RS.ENEMIES = [
    /* --------------------------- BANDIT / HUMAN ------------------------ */
    E({ id: 'highwayman', name: 'Highwayman', family: 'Bandit', hp: 60, speed: 62, armor: 0, magicResist: 0, bounty: 6, traits: ['Fast'], abilities: {}, motif: 'humanoid', cost: 8 }),
    E({ id: 'banditarcher', name: 'Bandit Archer', family: 'Bandit', hp: 48, speed: 54, armor: 0, magicResist: 0, bounty: 7, traits: [], abilities: {}, motif: 'humanoid', cost: 9 }),
    E({ id: 'berserker', name: 'Brigand Berserker', family: 'Bandit', hp: 90, speed: 50, armor: 2, magicResist: 0, bounty: 10, traits: [], abilities: { rageAtLowHp: { hpPct: 0.4, speed: 1.8 } }, motif: 'humanoid', cost: 13 }),
    E({ id: 'cutpurse', name: 'Cutpurse', family: 'Bandit', hp: 40, speed: 70, armor: 0, magicResist: 0, bounty: 5, traits: ['Fast'], abilities: { stealGoldOnLeak: 40 }, motif: 'humanoid', cost: 9 }),
    E({ id: 'deserter', name: 'Deserter Knight', family: 'Bandit', hp: 140, speed: 44, armor: 18, magicResist: 0.05, bounty: 14, traits: ['Armored'], abilities: {}, motif: 'humanoid', cost: 18 }),
    E({ id: 'merccaptain', name: 'Mercenary Captain', family: 'Bandit', hp: 120, speed: 48, armor: 8, magicResist: 0.05, bounty: 18, traits: [], abilities: { buffAura: { radius: 120, speed: 0.20 } }, motif: 'humanoid', cost: 20 }),
    E({ id: 'sapper', name: 'Outlaw Sapper', family: 'Bandit', hp: 80, speed: 52, armor: 4, magicResist: 0, bounty: 16, traits: [], abilities: { destroyTowerOnGoal: true }, motif: 'humanoid', cost: 16 }),

    /* --------------------------- ORC / BEASTKIN ------------------------ */
    E({ id: 'orcgrunt', name: 'Orc Grunt', family: 'Orc', hp: 180, speed: 46, armor: 10, magicResist: 0.05, bounty: 12, traits: [], abilities: {}, motif: 'orc', cost: 16 }),
    E({ id: 'shieldbearer', name: 'Orc Shieldbearer', family: 'Orc', hp: 200, speed: 40, armor: 14, magicResist: 0.05, bounty: 16, traits: ['Shielded'], abilities: { shieldHits: 3 }, motif: 'orc', cost: 22 }),
    E({ id: 'wargrider', name: 'Warg Rider', family: 'Orc', hp: 150, speed: 78, armor: 6, magicResist: 0, bounty: 14, traits: ['Fast'], abilities: {}, motif: 'orc', cost: 18 }),
    E({ id: 'ogre', name: 'Ogre Bruiser', family: 'Orc', hp: 520, speed: 36, armor: 22, magicResist: 0.05, bounty: 30, traits: ['Armored'], abilities: {}, motif: 'ogre', cost: 40 }),
    E({ id: 'swarmling', name: 'Goblin Swarmling', family: 'Orc', hp: 26, speed: 66, armor: 0, magicResist: 0, bounty: 3, traits: ['Swarm'], abilities: { packSize: 12 }, motif: 'goblin', cost: 3 }),
    E({ id: 'troll', name: 'Troll Rager', family: 'Orc', hp: 420, speed: 40, armor: 8, magicResist: 0.10, bounty: 28, traits: ['Regenerating'], abilities: { regen: 22 }, motif: 'ogre', cost: 38 }),
    E({ id: 'warchief', name: 'Orc Warchief', family: 'Orc', hp: 340, speed: 44, armor: 16, magicResist: 0.10, bounty: 34, traits: [], abilities: { buffAura: { radius: 140, speed: 0.30 } }, motif: 'orc', cost: 44 }),

    /* ------------------------------- UNDEAD ---------------------------- */
    E({ id: 'skelwarrior', name: 'Skeleton Warrior', family: 'Undead', hp: 130, speed: 44, armor: 8, magicResist: 0, bounty: 10, traits: ['Ethereal'], abilities: {}, motif: 'skeleton', cost: 14 }),
    E({ id: 'skelarcher', name: 'Skeleton Archer', family: 'Undead', hp: 100, speed: 46, armor: 4, magicResist: 0, bounty: 11, traits: ['Ethereal'], abilities: {}, motif: 'skeleton', cost: 14 }),
    E({ id: 'colossus', name: 'Bone Colossus', family: 'Undead', hp: 460, speed: 34, armor: 14, magicResist: 0.05, bounty: 30, traits: ['Splitter'], abilities: { splitInto: { id: 'skelwarrior', count: 4 } }, motif: 'skeleton', cost: 42 }),
    E({ id: 'plaguezombie', name: 'Plague Zombie', family: 'Undead', hp: 200, speed: 32, armor: 2, magicResist: 0, bounty: 14, traits: [], abilities: { bilePuddle: { dps: 14, dur: 4 } }, motif: 'zombie', cost: 20 }),
    E({ id: 'wraith', name: 'Wraith', family: 'Undead', hp: 120, speed: 58, armor: 0, magicResist: 0.20, bounty: 16, traits: ['Ethereal', 'Flying'], abilities: {}, motif: 'wraith', cost: 22 }),
    E({ id: 'graveknight', name: 'Grave Knight', family: 'Undead', hp: 300, speed: 40, armor: 26, magicResist: 0.10, bounty: 24, traits: ['Armored', 'Immune-Slow'], abilities: {}, motif: 'skeleton', cost: 34 }),
    E({ id: 'necromancer', name: 'Necromancer', family: 'Undead', hp: 220, speed: 40, armor: 6, magicResist: 0.25, bounty: 30, traits: [], abilities: { reviveNearby: { count: 2, every: 8 } }, motif: 'wraith', cost: 40 }),

    /* ------------------------------ DEMONIC ---------------------------- */
    E({ id: 'imp', name: 'Imp Swarm', family: 'Demon', hp: 34, speed: 64, armor: 0, magicResist: 0.10, bounty: 4, traits: ['Flying', 'Swarm'], abilities: { packSize: 8 }, motif: 'imp', cost: 5 }),
    E({ id: 'hellhound', name: 'Hellhound', family: 'Demon', hp: 180, speed: 82, armor: 6, magicResist: 0.10, bounty: 16, traits: ['Fast', 'Immune-Fire'], abilities: {}, motif: 'hound', cost: 22 }),
    E({ id: 'brimstone', name: 'Brimstone Brute', family: 'Demon', hp: 560, speed: 38, armor: 20, magicResist: 0.15, bounty: 34, traits: ['Immune-Fire'], abilities: {}, motif: 'demon', cost: 46 }),
    E({ id: 'succubus', name: 'Succubus', family: 'Demon', hp: 200, speed: 52, armor: 4, magicResist: 0.25, bounty: 26, traits: ['Flying'], abilities: { charmTower: { dur: 5, every: 7 } }, motif: 'imp', cost: 38 }),
    E({ id: 'voidstalker', name: 'Void Stalker', family: 'Demon', hp: 240, speed: 56, armor: 8, magicResist: 0.20, bounty: 28, traits: ['Stealth'], abilities: {}, motif: 'demon', cost: 36 }),
    E({ id: 'siegebeast', name: 'Infernal Siege Beast', family: 'Demon', hp: 700, speed: 34, armor: 24, magicResist: 0.15, bounty: 44, traits: [], abilities: { destroyBlockers: true }, motif: 'ogre', cost: 58 }),
    E({ id: 'balor', name: 'Balor Lieutenant', family: 'Demon', hp: 900, speed: 40, armor: 22, magicResist: 0.25, bounty: 60, traits: ['Cursed'], abilities: { curseAura: { radius: 160, dmg: 0.20 } }, motif: 'demon', cost: 80 }),

    /* -------------------------- ARCANE / CONSTRUCT --------------------- */
    E({ id: 'arcanegolem', name: 'Arcane Golem', family: 'Arcane', hp: 480, speed: 36, armor: 16, magicResist: 0.55, bounty: 30, traits: [], abilities: {}, motif: 'golem', cost: 44 }),
    E({ id: 'runesentinel', name: 'Rune Sentinel', family: 'Arcane', hp: 360, speed: 38, armor: 12, magicResist: 0.40, bounty: 32, traits: [], abilities: { reflectMagic: { pct: 0.15, disable: 1.2 } }, motif: 'golem', cost: 42 }),
    E({ id: 'mirrorwisp', name: 'Mirror Wisp', family: 'Arcane', hp: 90, speed: 60, armor: 0, magicResist: 0.30, bounty: 12, traits: ['Flying', 'Splitter'], abilities: { splitInto: { id: 'mirrorwisp_s', count: 2 }, splitsLeft: 2 }, motif: 'wisp', cost: 18 }),
    E({ id: 'mirrorwisp_s', name: 'Mirror Shard', family: 'Arcane', hp: 40, speed: 66, armor: 0, magicResist: 0.30, bounty: 5, traits: ['Flying'], abilities: {}, motif: 'wisp', cost: 6, hidden: true }),
    E({ id: 'nullwarden', name: 'Null Warden', family: 'Arcane', hp: 420, speed: 36, armor: 14, magicResist: 0.45, bounty: 36, traits: [], abilities: { suppressAbilities: { radius: 150 } }, motif: 'golem', cost: 48 }),

    /* ------------------------------- AERIAL ---------------------------- */
    E({ id: 'harpy', name: 'Harpy Raider', family: 'Aerial', hp: 120, speed: 62, armor: 2, magicResist: 0.05, bounty: 14, traits: ['Flying'], abilities: {}, motif: 'harpy', cost: 18 }),
    E({ id: 'griffon', name: 'Griffon Rider', family: 'Aerial', hp: 280, speed: 72, armor: 18, magicResist: 0.05, bounty: 26, traits: ['Flying', 'Fast', 'Armored'], abilities: {}, motif: 'griffon', cost: 40 }),
    E({ id: 'broodling', name: 'Wyvern Broodling', family: 'Aerial', hp: 240, speed: 58, armor: 10, magicResist: 0.10, bounty: 24, traits: ['Flying'], abilities: { destroyBlockers: true }, motif: 'wyvern', cost: 34 }),
    E({ id: 'stormroc', name: 'Storm Roc', family: 'Aerial', hp: 900, speed: 44, armor: 12, magicResist: 0.15, bounty: 54, traits: ['Flying', 'Immune-Slow'], abilities: {}, motif: 'griffon', cost: 72 }),

    /* ------------------------------- BOSSES ---------------------------- */
    E({ id: 'boss_corvin', name: 'Bandit King Corvin', family: 'Bandit', hp: 4200, speed: 40, armor: 14, magicResist: 0.10, bounty: 300, traits: ['Boss'],
      abilities: { boss: true, summon: { id: 'highwayman', count: 20, atHpPct: 0.5 } }, motif: 'boss', cost: 400 }),
    E({ id: 'boss_gruumak', name: 'Warlord Gruumak the Iron Tusk', family: 'Orc', hp: 14000, speed: 34, armor: 40, magicResist: 0.15, bounty: 600, traits: ['Boss', 'Armored'],
      abilities: { boss: true, phases: 3, shatterBlocker: 10, immuneSlowBelow: 0.5 }, motif: 'boss', cost: 700 }),
    E({ id: 'boss_malgrath', name: 'Malgrath the Bone Sovereign', family: 'Undead', hp: 30000, speed: 32, armor: 24, magicResist: 0.25, bounty: 1200, traits: ['Boss'],
      abilities: { boss: true, resurrectAll: true, phases: 2, reflectPhase2: 0.25 }, motif: 'boss', cost: 1100 }),
    E({ id: 'boss_azhrakoth', name: 'Azhrakoth, the Ember Throne', family: 'Demon', hp: 90000, speed: 34, armor: 30, magicResist: 0.30, bounty: 3000, traits: ['Boss', 'Immune-Fire'],
      abilities: { boss: true, phases: 4, flightPhase: 1, burnZones: 2, summonBalor: 3, enragePhase: 4 }, motif: 'boss', cost: 2200 }),
    E({ id: 'boss_herald', name: 'The Grey Herald', family: 'Arcane', hp: 60000, speed: 36, armor: 20, magicResist: 0.30, bounty: 5000, traits: ['Boss'],
      abilities: { boss: true, endless: true, copyStrongest: { every: 60 } }, motif: 'boss', cost: 3000 }),
  ];

  RS.ENEMY_BY_ID = {};
  RS.ENEMIES.forEach((e) => { RS.ENEMY_BY_ID[e.id] = e; });

  // Families that maps may draw from, in wave-family weighting.
  RS.FAMILIES = ['Bandit', 'Orc', 'Undead', 'Demon', 'Arcane', 'Aerial'];
})();
