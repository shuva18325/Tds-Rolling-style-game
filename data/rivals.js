/* =========================================================================
 * REALM SIEGE — data/rivals.js
 * The Champions' Ladder. A ranked table of rival champions the player climbs
 * by out-performing them, ending at Claude — the realm's standing #1.
 *
 * Each rival carries a full record sheet (the same six categories the player
 * tracks) plus a `score` threshold. The player's score is computed by the same
 * formula in Meta.powerScore(), so the ladder is a single legible number with
 * per-category detail behind it.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});

  // Claude's identity mark — a warm terracotta pinwheel/starburst of tapered
  // petals radiating from a centre point, instead of a crown emoji. Inline SVG
  // so it's fully self-contained (no external image, CSP-safe). Used wherever
  // Claude's row/badge is drawn; `size` is the rendered box in px.
  // Eight bold, clean petals with real gaps between them — the previous
  // ten-petal version read as a cluttered blob at small sizes because the
  // petals touched. Each petal is a straight tapered wedge (crisp silhouette,
  // no soft curves) meeting at a small hub.
  RS.claudeSigil = (size) => {
    size = size || 22;
    const N = 8, TIP = 10.5, HALF = 1.55, HUB = 2.2;
    let petals = '';
    for (let i = 0; i < N; i++) {
      const rot = (360 / N) * i;
      // wedge: wide at the hub, tapering to a blunt point at the tip
      petals += `<path d="M -${HALF} -${HUB} L -0.75 -${TIP} L 0.75 -${TIP} L ${HALF} -${HUB} Z" `
             + `fill="#d97757" transform="rotate(${rot})"/>`;
    }
    return `<svg class="claude-sigil" width="${size}" height="${size}" viewBox="-12 -12 24 24" `
      + `style="vertical-align:middle;flex-shrink:0" xmlns="http://www.w3.org/2000/svg">`
      + `${petals}<circle r="${HUB}" fill="#d97757"/></svg>`;
  };

  // Weighting used for BOTH rivals and the player — see Meta.powerScore().
  RS.SCORE_WEIGHTS = {
    wave: 200,        // per wave reached
    kill: 4,          // per enemy slain
    towerDmg: 1 / 30, // per point of best single-tower damage
    roll: 10,         // per roll made
    gold: 1 / 50,     // per gold banked at victory
    speedBase: 2400,  // seconds; victory faster than this scores the remainder
  };

  RS.RIVALS = [
    { id: 'rv1', name: 'farmboy_ted', avatar: '🌾', score: 3000, rank: 9,
      taunt: 'Beat the tutorial twice. Still counts.',
      records: { highestWave: 12, kills: 340, fastestVictory: 1400, goldBanked: 900, topTowerDamage: 9000, totalRolls: 20 } },

    { id: 'rv2', name: '2Super_game', avatar: '🎮', score: 8000, rank: 8,
      taunt: 'ez clap no cap',
      records: { highestWave: 20, kills: 900, fastestVictory: 1150, goldBanked: 2200, topTowerDamage: 26000, totalRolls: 60 } },

    { id: 'rv3', name: 'xX_bonecrusher_Xx', avatar: '💀', score: 15000, rank: 7,
      taunt: 'I only run Undead counters. Deal with it.',
      records: { highestWave: 26, kills: 2100, fastestVictory: 980, goldBanked: 4100, topTowerDamage: 52000, totalRolls: 130 } },

    { id: 'rv4', name: '1x1x1x1', avatar: '🟥', score: 25000, rank: 6,
      taunt: 'you cannot hide. i am in the walls.',
      records: { highestWave: 31, kills: 3600, fastestVictory: 860, goldBanked: 6800, topTowerDamage: 88000, totalRolls: 240 } },

    { id: 'rv5', name: 'Lord_Ashvale', avatar: '🏰', score: 45000, rank: 5,
      taunt: 'A keep is only as strong as the hand that plans it.',
      records: { highestWave: 38, kills: 6200, fastestVictory: 740, goldBanked: 12000, topTowerDamage: 165000, totalRolls: 420 } },

    { id: 'rv6', name: 'frostbite_queen', avatar: '❄️', score: 70000, rank: 4,
      taunt: 'Everything melts. Some things just take longer.',
      records: { highestWave: 45, kills: 9800, fastestVictory: 640, goldBanked: 21000, topTowerDamage: 310000, totalRolls: 700 } },

    { id: 'rv7', name: 'THE_REAL_DRAGON', avatar: '🐉', score: 110000, rank: 3,
      taunt: 'I cleared Hardcore before you unlocked it.',
      records: { highestWave: 54, kills: 16000, fastestVictory: 545, goldBanked: 38000, topTowerDamage: 620000, totalRolls: 1300 } },

    { id: 'rv8', name: 'v0id_walker', avatar: '🌌', score: 180000, rank: 2,
      taunt: 'Purple Nightmare is where I go to relax.',
      records: { highestWave: 78, kills: 27000, fastestVictory: 430, goldBanked: 90000, topTowerDamage: 1150000, totalRolls: 2600 } },

    { id: 'claude', name: 'Claude', avatar: RS.claudeSigil(24), score: 350000, rank: 1, claude: true,
      taunt: 'Has admin commands. Has never once used them. Beat the numbers fairly.',
      records: { highestWave: 120, kills: 50000, fastestVictory: 300, goldBanked: 250000, topTowerDamage: 2000000, totalRolls: 5000 } },
  ];

  RS.RIVAL_BY_ID = {};
  RS.RIVALS.forEach((r) => { RS.RIVAL_BY_ID[r.id] = r; });

  // Cosmetic badges. Rank badges are awarded as you climb; the Sigil is the
  // reward for taking the #1 seat from Claude.
  RS.BADGES = {
    sigil:      { icon: RS.claudeSigil(22), name: "Claude's Sigil",   desc: 'Took the crown from Claude. The realm has a new first name.' },
    frostcrown: { icon: '❄️', name: 'Frostcrown',       desc: 'Cleared Winterhold Ruins on Purple Nightmare.' },
    ladder5:    { icon: '🛡️', name: 'Contender',        desc: 'Climbed into the top 5 of the Champions\' Ladder.' },
    ladder2:    { icon: '⚔️', name: 'Challenger',       desc: 'Reached rank 2 — only Claude stands above.' },
    firstblood: { icon: '🥇', name: 'First Ascent',     desc: 'Defeated your first rival champion.' },
  };

  // Equippable name effects, worn on the profile chip. Unlock predicates read
  // live off the profile (badges/completions/roster are all one-way — a
  // dismantle always keeps your last copy of a tower, so "own every Ancient
  // tower" can never regress once true) so there's nothing separate to persist.
  // Sandbox mode short-circuits every check to true, per design: testers get
  // every title to preview without having to actually earn them.
  RS.TITLES = {
    icebound: { name: 'Icebound', cls: 'title-icebound',
      desc: 'Cleared Winterhold Ruins on Purple Nightmare.',
      unlocked: (p) => RS.Sandbox.active || !!p.badges.frostcrown },
    gilded: { name: 'Gilded', cls: 'title-gilded',
      desc: 'Cleared The Ember Throne on Hardcore.',
      unlocked: (p) => RS.Sandbox.active || !!(p.completions.emberthrone && p.completions.emberthrone.Hardcore) },
    ancientscript: { name: 'Ancient Script', cls: 'title-ancient',
      desc: 'Collected every Ancient-tier tower.',
      unlocked: (p) => RS.Sandbox.active || RS.TOWERS.filter((t) => t.rarity === 'Ancient').every((t) => (p.roster[t.id] || 0) > 0) },
  };
})();
