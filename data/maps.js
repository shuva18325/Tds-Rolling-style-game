/* =========================================================================
 * REALM SIEGE — data/maps.js
 * 12 maps. Paths are orthogonal waypoint lists in TILE coords [col,row];
 * the engine rasterises them into path tiles and pixel splines. Non-path,
 * non-water, non-unbuildable tiles are buildable by default. Special tiles
 * (water/highground/hazard/holy/cursed/unbuildable) are listed explicitly.
 *
 * env: { weather:[...cycle], dayNight:bool, gimmick:'id' }
 * families: relative spawn weights per enemy family for wave generation.
 * boss: the map's OWN final boss (enemies.js). Difficulty no longer picks the
 *   boss — it only scales it — so all 13 maps end on a different fight.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const M = (o) => o;

  // Expand a rectangle helper -> list of [c,r] (inclusive).
  const rect = (c0, r0, c1, r1) => {
    const out = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push([c, r]);
    return out;
  };

  RS.MAPS = [
    M({ id: 'farmstead', boss: 'boss_corvin', name: 'Farmstead Road', order: 1, signature: 'sig_scarecrow',
      paths: [[[0, 7], [6, 7], [6, 3], [12, 3], [12, 9], [19, 9]]],
      water: [], highground: [], hazard: [], holy: [], cursed: [], unbuildable: [],
      env: { weather: ['Clear'], dayNight: false, gimmick: 'none' },
      families: { Bandit: 5, Orc: 2, Undead: 1, Demon: 0, Arcane: 0, Aerial: 1 },
      desc: 'A gentle road through wheat. The realm’s training ground.' }),

    M({ id: 'riverford', boss: 'boss_thane', name: 'Riverford Crossing', order: 2, signature: 'sig_drowned',
      paths: [[[0, 3], [8, 3], [8, 7], [19, 7]], [[0, 11], [8, 11], [8, 7], [19, 7]]],
      water: [...rect(2, 5, 4, 9), ...rect(11, 8, 13, 11)], highground: [], hazard: [], holy: [], cursed: [], unbuildable: [],
      env: { weather: ['Clear', 'Rain'], dayNight: false, gimmick: 'rain' },
      families: { Bandit: 3, Orc: 3, Undead: 2, Demon: 1, Arcane: 1, Aerial: 2 },
      desc: 'Two roads meet at the bridge. Only water-capable towers hold the fords.' }),

    M({ id: 'blackforest', boss: 'boss_hollow', name: 'The Black Forest', order: 3, signature: 'sig_lurker',
      paths: [[[0, 1], [4, 1], [4, 6], [9, 6], [9, 2], [14, 2], [14, 11], [19, 11]]],
      water: [], highground: [], hazard: [], holy: [], cursed: [],
      unbuildable: [...rect(0, 8, 6, 13), ...rect(15, 0, 19, 5)],
      env: { weather: ['Clear', 'Fog'], dayNight: false, gimmick: 'canopy' },
      families: { Bandit: 2, Orc: 3, Undead: 2, Demon: 2, Arcane: 1, Aerial: 1 },
      desc: 'The canopy hides the horde. A Watchtower Scout is worth its weight in gold.' }),

    M({ id: 'highkeep', boss: 'boss_gruumak', name: 'Highkeep Battlements', order: 4, signature: 'sig_wallbreaker',
      paths: [[[3, 0], [3, 5], [9, 5], [9, 10], [16, 10], [16, 4], [19, 4]]],
      water: [], highground: [...rect(0, 6, 2, 8), ...rect(11, 1, 14, 3), ...rect(6, 11, 9, 13)],
      hazard: [], holy: [], cursed: [], unbuildable: [],
      env: { weather: ['Clear', 'Storm'], dayNight: false, gimmick: 'wallmount' },
      families: { Bandit: 1, Orc: 3, Undead: 2, Demon: 2, Arcane: 2, Aerial: 3 },
      desc: 'Fight from the walls. High ground grants +25% range.' }),

    M({ id: 'frostvale', boss: 'boss_frostjarl', name: 'Frostvale Pass', order: 5, signature: 'sig_frostrevenant',
      paths: [[[0, 6], [5, 6], [5, 2], [11, 2], [11, 10], [16, 10], [16, 6], [19, 6]]],
      water: [], highground: [...rect(7, 7, 9, 9)], hazard: [], holy: [], cursed: [], unbuildable: [],
      env: { weather: ['Clear', 'Blizzard'], dayNight: false, gimmick: 'ice' },
      families: { Bandit: 1, Orc: 3, Undead: 3, Demon: 2, Arcane: 2, Aerial: 2 },
      desc: 'Enemies slide faster on ice, but Frost damage is doubled here.' }),

    M({ id: 'sunkenbog', boss: 'boss_bogfather', name: 'The Sunken Bog', order: 6, signature: 'sig_boghorror',
      paths: [[[0, 4], [6, 4], [6, 9], [12, 9], [12, 3], [19, 3]]],
      water: [...rect(2, 6, 5, 8), ...rect(13, 5, 16, 8)], highground: [], hazard: [], holy: [], cursed: [],
      unbuildable: [...rect(0, 10, 8, 13), ...rect(14, 9, 19, 13), ...rect(0, 0, 4, 2)],
      env: { weather: ['Clear', 'Fog'], dayNight: false, gimmick: 'bog' },
      families: { Bandit: 2, Orc: 2, Undead: 4, Demon: 2, Arcane: 1, Aerial: 1 },
      desc: 'The mire slows the enemy — but half the ground won’t bear a tower.' }),

    M({ id: 'ashen', boss: 'boss_cinderlord', name: 'Ashen Battlefield', order: 7, signature: 'sig_cinderfiend',
      paths: [[[0, 7], [4, 7], [4, 2], [10, 2], [10, 11], [15, 11], [15, 7], [19, 7]]],
      water: [], highground: [], holy: [], cursed: [],
      hazard: [[6, 6], [12, 5], [8, 9], [3, 10], [16, 3], [13, 9]],
      unbuildable: [],
      env: { weather: ['Clear', 'Ashfall'], dayNight: true, gimmick: 'craters' },
      families: { Bandit: 2, Orc: 3, Undead: 2, Demon: 3, Arcane: 1, Aerial: 2 },
      desc: 'Burning craters scar the field. Night falls; brazier-lit towers keep their range.' }),

    M({ id: 'aldermere', boss: 'boss_warden', name: 'Ruins of Old Aldermere', order: 8, signature: 'sig_rubblewight',
      paths: [ [[10, 0], [10, 7]], [[10, 13], [10, 7]], [[0, 7], [10, 7]], [[19, 7], [10, 7]] ],
      goalOverride: [10, 7],
      water: [], highground: [...rect(8, 5, 9, 6), ...rect(11, 8, 12, 9)], hazard: [], holy: [], cursed: [],
      unbuildable: [],
      env: { weather: ['Clear', 'Fog'], dayNight: false, gimmick: 'rubble' },
      families: { Bandit: 2, Orc: 2, Undead: 3, Demon: 2, Arcane: 2, Aerial: 2 },
      desc: 'Four roads, one keep. Collapsing rubble forces the horde to re-path.' }),

    M({ id: 'dragonspine', boss: 'boss_stormwyrm', name: "The Dragon's Spine", order: 9, signature: 'sig_cliffharrier',
      paths: [[[0, 2], [6, 2], [6, 11], [13, 11], [13, 4], [19, 4]]],
      water: [], highground: [...rect(0, 4, 3, 6), ...rect(15, 6, 18, 8)], hazard: [], holy: [], cursed: [],
      unbuildable: [...rect(8, 0, 11, 1), ...rect(8, 12, 11, 13)],
      env: { weather: ['Clear', 'Storm'], dayNight: false, gimmick: 'wind' },
      families: { Bandit: 1, Orc: 2, Undead: 2, Demon: 3, Arcane: 2, Aerial: 4 },
      desc: 'The wind on the ridge pushes arrows off-course. Aim for clusters.' }),

    M({ id: 'cathedral', boss: 'boss_malgrath', name: 'Cathedral of Chains', order: 10, signature: 'sig_penitent',
      paths: [[[0, 3], [5, 3], [5, 10], [14, 10], [14, 4], [19, 4]]],
      water: [], highground: [], cursed: [],
      holy: [...rect(2, 5, 3, 8), ...rect(8, 2, 11, 3), ...rect(16, 6, 18, 9)],
      hazard: [], unbuildable: [],
      env: { weather: ['Clear'], dayNight: true, gimmick: 'holyground' },
      families: { Bandit: 0, Orc: 0, Undead: 5, Demon: 4, Arcane: 1, Aerial: 1 },
      desc: 'Consecrated tiles boost Holy +50% and burn the undead. The dead come regardless.' }),

    M({ id: 'obsidian', boss: 'boss_forgemaster', name: 'The Obsidian Gate', order: 11, signature: 'sig_magmabrute',
      paths: [[[0, 10], [5, 10], [5, 4], [11, 4], [11, 11], [16, 11], [16, 5], [19, 5]]],
      water: [], highground: [], holy: [],
      hazard: [[8, 7], [13, 8]], cursed: [...rect(0, 0, 3, 2)],
      unbuildable: [],
      env: { weather: ['Clear', 'Ashfall'], dayNight: true, gimmick: 'lava' },
      families: { Bandit: 1, Orc: 2, Undead: 2, Demon: 4, Arcane: 2, Aerial: 2 },
      desc: 'Lava shifts the path every ten waves. Towers overheat after ten rapid shots.' }),

    M({ id: 'emberthrone', boss: 'boss_azhrakoth', name: 'The Ember Throne', order: 12, signature: 'sig_thronesentinel',
      paths: [[[0, 7], [4, 7], [4, 2], [9, 2], [9, 12], [14, 12], [14, 4], [19, 4]]],
      water: [], highground: [...rect(6, 6, 7, 7), ...rect(16, 9, 17, 10)],
      hazard: [[11, 6], [7, 10]], holy: [], cursed: [...rect(0, 11, 2, 13)],
      unbuildable: [],
      env: { weather: ['Clear', 'Ashfall', 'Storm', 'Blizzard'], dayNight: true, gimmick: 'finale' },
      families: { Bandit: 1, Orc: 2, Undead: 3, Demon: 4, Arcane: 3, Aerial: 3 },
      desc: 'Every system at once. The Ember Throne, where Azhrakoth waits.' }),

    // 💜 WINTER MAP — plays ONLY on the Purple Nightmare tier. Build inside the
    // campfire-lit ruined houses; the Coldness map modifier shrouds every foe.
    M({ id: 'winterhold', boss: 'boss_herald', name: 'Winterhold Ruins', order: 13, signature: 'sig_wendigo',
      paths: [[[0, 7], [5, 7], [5, 3], [11, 3], [11, 11], [16, 11], [16, 6], [19, 6]]],
      water: [], highground: [], hazard: [], holy: [], cursed: [], unbuildable: [],
      houses: [[3, 8], [4, 8], [3, 9], [8, 5], [9, 5], [8, 6], [13, 9], [14, 9], [13, 8], [7, 10], [8, 10], [17, 8], [17, 9], [2, 5], [13, 2], [14, 2]],
      env: { weather: ['Blizzard'], dayNight: true, gimmick: 'winter' },
      coldness: true, houseOnly: true, winter: true, fixedDiff: 'Purple Nightmare',
      families: { Bandit: 0, Orc: 2, Undead: 4, Demon: 2, Arcane: 2, Aerial: 2 },
      desc: 'A frozen ruin under endless blizzard. Towers can be built ONLY inside the campfire-lit houses — everywhere else, the cold kills. Every foe wears a Cold shroud that only Fire or Holy damage can melt.' }),

    // 🧪 SANDBOX RANGE — sandboxOnly hides it from the normal map grid; Sandbox
    // routes into it automatically. Wide open ground on both sides of a short
    // path so every tower's footprint and range fits somewhere, no water/
    // hazard/holy/cursed/highground tiles to complicate placement testing.
    M({ id: 'sandbox_range', name: 'Sandbox Range', order: 99, sandboxOnly: true,
      paths: [[[0, 7], [9, 7], [9, 6], [19, 6]]],
      water: [], highground: [], hazard: [], holy: [], cursed: [], unbuildable: [],
      env: { weather: ['Clear'], dayNight: false, gimmick: 'none' },
      families: { Bandit: 1, Orc: 1, Undead: 1, Demon: 1, Arcane: 1, Aerial: 1 },
      desc: 'A blank drill yard. Sandbox only — build and break anything.' }),
  ];

  RS.MAP_BY_ID = {};
  RS.MAPS.forEach((m) => { RS.MAP_BY_ID[m.id] = m; });

  // Each map carries its OWN difficulty rating (1-6, harder = more reward),
  // independent of the chosen game difficulty. (Presentational + reward mult.)
  const RATING = { farmstead: 1, riverford: 2, blackforest: 2, highkeep: 3, frostvale: 3, sunkenbog: 3, ashen: 4, aldermere: 4, dragonspine: 4, cathedral: 5, obsidian: 5, emberthrone: 6, winterhold: 6, sandbox_range: 1 };
  RS.MAPS.forEach((m) => { m.rating = RATING[m.id] || Math.max(1, Math.ceil(m.order / 2)); m.rewardMult = +(1 + (m.rating - 1) * 0.14).toFixed(2); });
})();
