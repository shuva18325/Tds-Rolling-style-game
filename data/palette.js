/* =========================================================================
 * REALM SIEGE — data/palette.js
 * Central colour language. Every drawing routine pulls from here so the whole
 * game can be reskinned by editing this one file. (TUNING: colours only.)
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});

  RS.PALETTE = {
    // Environment
    stoneDark: '#4a4945', stone: '#6b6a66', stoneLight: '#8d8b85',
    timber: '#7a5230', timberLight: '#a8703f',
    grass: '#5c8a3a', grassDark: '#456b2c',
    // Thematic
    blood: '#a02c2c', gold: '#d9a441', arcane: '#7b4fb5',
    frost: '#8fd4e8', void: '#2e1f3d',
    // UI shell
    ink: '#12100e', panel: '#20201d', panelLight: '#2c2b27',
    parchment: '#e8dcc0', text: '#e8dcc0', textDim: '#a49b86',
    line: '#3a382f', good: '#5fa855', bad: '#e04b4b', warn: '#f0a92e',
    // Path / build
    path: '#5a4a38', pathEdge: '#3e3225', buildable: '#3c5a2c',
    water: '#356b8a', hazard: '#8a3a2c', holy: '#c9b978', cursed: '#3a2a4a',
    highground: '#7d7a6e',
  };

  // Rarity identity: order matters (index === tier rank).
  RS.RARITY = [
    { id: 'Common',   color: '#9a9a9a', rank: 0 },
    { id: 'Uncommon', color: '#5fa855', rank: 1 },
    { id: 'Rare',     color: '#4a90d9', rank: 2 },
    { id: 'Epic',     color: '#9b59b6', rank: 3 },
    { id: 'Legendary',color: '#f0a92e', rank: 4 },
    { id: 'Ancient',  color: '#17b8a6', rank: 5 },
    { id: 'Mythic',   color: '#e04b4b', rank: 6 },
    { id: 'Mythic+',  color: '#ffffff', rank: 7, prismatic: true },
  ];
  RS.rarityColor = (id) => (RS.RARITY.find((r) => r.id === id) || RS.RARITY[0]).color;
  RS.rarityRank = (id) => (RS.RARITY.find((r) => r.id === id) || RS.RARITY[0]).rank;

  // Damage-type tint for projectiles / numbers.
  RS.DMG_COLOR = {
    Physical: '#d8d2c4', Melee: '#e24b4b', Siege: '#c99a5a', Piercing: '#cfd8e0', Magic: '#9b6fd0', Fire: '#e8722c',
    Frost: '#8fd4e8', Holy: '#f5e6a8', Necrotic: '#7d5fa0', True: '#ffffff',
  };
})();
