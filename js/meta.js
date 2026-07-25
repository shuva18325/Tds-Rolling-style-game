/* =========================================================================
 * REALM SIEGE — js/meta.js
 * The persistent player profile + gacha engine. Everything that survives a
 * match lives here: roster, tokens, roll tickets, shards, pity counters,
 * unlocks, completions, account level, objectives, settings. Saved to
 * localStorage via RS.Save. Rolling (§4.1/§4.2) and the Forge (§4.4) too.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const { clamp, frand } = RS.util;

  function defaultProfile() {
    const p = {
      version: 1,
      tokens: { copper: 500, silver: 20, gold: 5, relic: 0 },
      rolls: { Basic: 0, Lucky: 0, Super: 0, Divine: 0 }, // roll tickets
      roster: { peasant: 1, archer: 1, torch: 1, scout: 1 }, // starter towers
      shards: { Common: 0, Uncommon: 0, Rare: 0, Epic: 0, Legendary: 0, Ancient: 0, Mythic: 0, 'Mythic+': 0 },
      pity: { epic: 0, legend: 0, mythic: 0, plus: 0 },
      legendPityArmed: false,
      rollCount: 0,
      completions: {}, // mapId -> { Easy:{stars}, ... }
      unlocked: {},    // mapId -> highest unlocked difficulty order (Easy=0 always)
      account: { level: 1, xp: 0 },
      objectives: {},  // id -> progress
      settings: { sfx: true, showRange: false, particles: true, quickRoll: false, quickRollUnlocked: false },
      loadouts: [],    // saved presets [{name, ids:[...]}]
      activeLoadout: null,
      codex: { towers: [], enemies: [] },
      stats: { rolls: 0, kills: 0, mapsCleared: 0, mythicPlus: 0 },
      rollHistory: [],
      profile: { name: '', avatar: '⚔️', createdAt: 0 },
      // Champions' Ladder personal-best records (all derived at match end).
      records: { highestWave: 0, kills: 0, fastestVictory: 0, goldBanked: 0, topTowerDamage: 0, totalRolls: 0 },
      badges: {},        // badge id -> true
      defeated: {},      // rival id -> true
      bestRank: 10,      // lower is better; 10 = unranked
    };
    RS.MAPS.forEach((m) => { p.unlocked[m.id] = 0; });
    RS.OBJECTIVES.forEach((o) => { p.objectives[o.id] = 0; });
    return p;
  }

  const RECORD_META = {
    highestWave:    { label: 'Highest Wave Reached', icon: '🏆', fmt: (v) => v, better: 'higher' },
    kills:          { label: 'Total Enemies Slain',  icon: '⚔️', fmt: (v) => v.toLocaleString(), better: 'higher' },
    fastestVictory: { label: 'Fastest Victory',       icon: '⏱️', fmt: (v) => v ? Math.floor(v / 60) + 'm ' + Math.round(v % 60) + 's' : '—', better: 'lower' },
    goldBanked:     { label: 'Most Gold at Victory',  icon: '💰', fmt: (v) => v.toLocaleString(), better: 'higher' },
    topTowerDamage: { label: 'Highest Tower Damage',  icon: '💥', fmt: (v) => v.toLocaleString(), better: 'higher' },
    totalRolls:     { label: 'Total Rolls Made',      icon: '🎲', fmt: (v) => v.toLocaleString(), better: 'higher' },
  };

  const Meta = {
    p: null,
    load() {
      const saved = RS.Save.read();
      this.p = saved ? this._migrate(saved) : defaultProfile();
      this._recomputeBonuses();
      return this.p;
    },
    save() { RS.Save.write(this.p); },
    reset() { this.p = defaultProfile(); this.save(); this._recomputeBonuses(); },
    _migrate(s) {
      const base = defaultProfile();
      // shallow merge so new fields appear on old saves
      const out = Object.assign({}, base, s);
      out.tokens = Object.assign({}, base.tokens, s.tokens);
      out.rolls = Object.assign({}, base.rolls, s.rolls);
      out.pity = Object.assign({}, base.pity, s.pity);
      out.shards = Object.assign({}, base.shards, s.shards);
      out.account = Object.assign({}, base.account, s.account);
      out.settings = Object.assign({}, base.settings, s.settings);
      out.stats = Object.assign({}, base.stats, s.stats);
      out.roster = s.roster || base.roster;
      out.unlocked = Object.assign({}, base.unlocked, s.unlocked || {});
      out.completions = s.completions || {};
      out.objectives = Object.assign({}, base.objectives, s.objectives || {});
      out.codex = s.codex || base.codex;
      out.loadouts = s.loadouts || [];
      out.rollHistory = s.rollHistory || [];
      out.profile = Object.assign({}, base.profile, s.profile);
      out.records = Object.assign({}, base.records, s.records);
      out.badges = Object.assign({}, base.badges, s.badges);
      out.defeated = Object.assign({}, base.defeated, s.defeated);
      out.bestRank = s.bestRank != null ? s.bestRank : base.bestRank;
      return out;
    },
    exportSave() { return RS.Save.export(this.p); },
    importSave(str) {
      const obj = RS.Save.import(str);
      if (!obj || !obj.tokens) return false;
      this.p = this._migrate(obj); this.save(); this._recomputeBonuses(); return true;
    },

    /* -------------------------- account/bonuses ----------------------- */
    _recomputeBonuses() {
      const lvl = this.p.account.level;
      this.bonusStartGold = lvl >= 8 ? 200 : 0;
      this.rollLuck = 1 + (lvl >= 4 ? 0.05 : 0);
      this.loadoutSlots = RS.ACCOUNT.loadoutSlots(lvl);
      this.forgeUnlocked = lvl >= 2;
    },
    addXp(amount) {
      const a = this.p.account;
      a.xp += amount;
      let leveled = false;
      while (a.xp >= RS.ACCOUNT.xpCurve(a.level)) {
        a.xp -= RS.ACCOUNT.xpCurve(a.level);
        a.level++; leveled = true;
      }
      if (leveled) { this._recomputeBonuses(); RS.bus.emit('level-up', a.level); }
      return leveled;
    },

    /* ------------------------------ tokens ---------------------------- */
    grant(kind, n) { if (this.p.tokens[kind] != null) this.p.tokens[kind] += n; },
    canAfford(kind, n) { return this.p.tokens[kind] >= n; },
    spend(kind, n) { if (this.p.tokens[kind] < n) return false; this.p.tokens[kind] -= n; return true; },

    /* ---------------------------- collection -------------------------- */
    ownedCount(id) { return this.p.roster[id] || 0; },
    addTower(id) {
      this.p.roster[id] = (this.p.roster[id] || 0) + 1;
      if (!this.p.codex.towers.includes(id)) this.p.codex.towers.push(id);
    },
    consumeDuplicate(id) { if ((this.p.roster[id] || 0) > 1) this.p.roster[id]--; },
    ownedTowerDefs() { return RS.TOWERS.filter((t) => (this.p.roster[t.id] || 0) > 0); },

    /* ============================= ROLLING ============================= */
    // Determine rarity for a given roll tier, honouring floor, soft & hard pity.
    _rollRarity(tier) {
      const cfg = RS.ROLLS[tier];
      const pity = this.p.pity;
      // Divine uses a fixed table.
      let weights;
      if (cfg.fixed) {
        weights = Object.assign({}, cfg.fixed);
      } else {
        weights = Object.assign({}, RS.ROLL_BASE_WEIGHTS);
        if (tier === 'Lucky') {
          weights.Common = 0;
          for (const k of ['Uncommon', 'Rare', 'Epic', 'Legendary', 'Ancient', 'Mythic', 'Mythic+']) weights[k] *= 3;
        } else if (tier === 'Super') {
          weights.Common = 0; weights.Uncommon = 0;
          for (const k of ['Epic', 'Legendary', 'Ancient', 'Mythic', 'Mythic+']) weights[k] *= 6;
          weights.Rare *= 1;
        }
      }
      // soft pity ramps (§4.2)
      if (pity.epic + 1 >= RS.PITY.epic.softStart) weights.Epic += (pity.epic + 1 - RS.PITY.epic.softStart) * RS.PITY.epic.softStep * 100;
      if (pity.legend + 1 >= RS.PITY.legend.softStart) weights.Legendary += (pity.legend + 1 - RS.PITY.legend.softStart) * RS.PITY.legend.softStep * 100;
      // roll luck (account bonus) nudges rare+ up slightly
      const luck = this.rollLuck || 1;
      for (const k of ['Epic', 'Legendary', 'Ancient', 'Mythic', 'Mythic+']) weights[k] *= luck;

      // hard pity overrides — force a floor rarity.
      let forcedFloor = null;
      if (pity.plus + 1 >= RS.PITY.plus.hard) forcedFloor = 'Mythic+';
      else if (pity.mythic + 1 >= RS.PITY.mythic.hard) forcedFloor = 'Mythic';
      else if (pity.legend + 1 >= RS.PITY.legend.hard) forcedFloor = 'Legendary';
      else if (pity.epic + 1 >= RS.PITY.epic.hard) forcedFloor = 'Epic';

      // choose
      let rarity;
      if (forcedFloor === 'Mythic+') rarity = 'Mythic+';
      else {
        // apply floor: zero out below-floor rarities
        const floorRank = Math.max(RS.rarityRank(cfg.floor), forcedFloor ? RS.rarityRank(forcedFloor) : 0);
        const entries = [];
        for (const r of RS.RARITY) {
          if (r.rank < floorRank) continue;
          const w = weights[r.id] || 0;
          if (w > 0) entries.push({ id: r.id, w });
        }
        if (entries.length === 0) entries.push({ id: cfg.floor, w: 1 });
        // weighted pick with true RNG
        let total = 0; for (const e of entries) total += e.w;
        let roll = frand() * total; rarity = entries[entries.length - 1].id;
        for (const e of entries) { roll -= e.w; if (roll <= 0) { rarity = e.id; break; } }
      }
      return rarity;
    },

    _pickTowerOfRarity(rarity) {
      const pool = RS.TOWERS.filter((t) => t.rarity === rarity);
      return pool[Math.floor(frand() * pool.length)];
    },

    // Perform a single roll. Consumes a ticket if available, else tokens.
    // Returns { tower, rarity, converted, pityHit }.
    roll(tier) {
      const cfg = RS.ROLLS[tier];
      // pay
      if (this.p.rolls[tier] > 0) this.p.rolls[tier]--;
      else if (!this.spend(cfg.costToken, cfg.cost)) return { error: 'Cannot afford' };

      const pity = this.p.pity;
      this.p.rollCount++; this.p.stats.rolls++;
      this.updateObjective('roll', 1);

      let rarity = this._rollRarity(tier);
      const rank = RS.rarityRank(rarity);

      // pity increments then conditional resets
      pity.epic++; pity.legend++; pity.mythic++; pity.plus++;
      const pityHit = {};
      if (rank >= RS.rarityRank('Epic')) { if (pity.epic >= RS.PITY.epic.hard) pityHit.epic = true; pity.epic = 0; }
      if (rank >= RS.rarityRank('Legendary')) { if (pity.legend >= RS.PITY.legend.hard) { pityHit.legend = true; this.p.legendPityArmed = true; } pity.legend = 0; }
      if (rank >= RS.rarityRank('Mythic')) { if (pity.mythic >= RS.PITY.mythic.hard) pityHit.mythic = true; pity.mythic = 0; }
      if (rank >= RS.rarityRank('Mythic+')) { pity.plus = 0; this.p.stats.mythicPlus++; }

      // 50/50 legendary escape valve: if all 4 legendaries owned, convert to relics
      let converted = null, tower = null;
      if (rarity === 'Legendary') {
        const legs = RS.TOWERS.filter((t) => t.rarity === 'Legendary');
        const ownAll = legs.every((t) => (this.p.roster[t.id] || 0) > 0);
        if (ownAll && this.p.legendPityArmed) {
          this.grant('relic', 3); converted = { relic: 3 };
          this.p.legendPityArmed = false;
        }
      }
      if (!converted) {
        tower = this._pickTowerOfRarity(rarity);
        this.addTower(tower.id);
      }

      const entry = { tier, rarity, towerId: tower ? tower.id : null, converted, t: Date.now() };
      this.p.rollHistory.unshift(entry);
      if (this.p.rollHistory.length > 60) this.p.rollHistory.pop();
      RS.bus.emit('roll-result', { tower, rarity, converted, pityHit });
      this.save();
      return { tower, rarity, converted, pityHit };
    },

    // Effective per-rarity odds for a roll tier, as displayed in the odds
    // panel. Mirrors _rollRarity's weight construction (tier multipliers +
    // rarity floor), excluding pity/luck so the board shows the base table.
    rollOdds(tier) {
      const cfg = RS.ROLLS[tier];
      let weights;
      if (cfg.fixed) weights = Object.assign({}, cfg.fixed);
      else {
        weights = Object.assign({}, RS.ROLL_BASE_WEIGHTS);
        if (tier === 'Lucky') {
          weights.Common = 0;
          for (const k of ['Uncommon', 'Rare', 'Epic', 'Legendary', 'Ancient', 'Mythic', 'Mythic+']) weights[k] *= 3;
        } else if (tier === 'Super') {
          weights.Common = 0; weights.Uncommon = 0;
          for (const k of ['Epic', 'Legendary', 'Ancient', 'Mythic', 'Mythic+']) weights[k] *= 6;
        }
      }
      const floorRank = RS.rarityRank(cfg.floor);
      const out = []; let total = 0;
      for (const r of RS.RARITY) {
        const w = (r.rank < floorRank) ? 0 : (weights[r.id] || 0);
        if (w > 0) { out.push({ id: r.id, w }); total += w; }
      }
      return out.map((e) => ({ id: e.id, pct: (e.w / total) * 100 }));
    },

    canRoll(tier) {
      const cfg = RS.ROLLS[tier];
      return this.p.rolls[tier] > 0 || this.p.tokens[cfg.costToken] >= cfg.cost;
    },

    /* ============================== FORGE ============================= */
    convertRolls(from) {
      const rule = RS.FORGE.rollConvert.find((r) => r.from === from);
      if (!rule || this.p.rolls[from] < rule.n) return false;
      this.p.rolls[from] -= rule.n; this.p.rolls[rule.to] += 1; this.save(); return true;
    },
    convertTokens(from) {
      const rule = RS.FORGE.tokenConvert.find((r) => r.from === from);
      if (!rule || this.p.tokens[from] < rule.n) return false;
      this.p.tokens[from] -= rule.n; this.p.tokens[rule.to] += 1; this.save(); return true;
    },
    dismantle(id) {
      const def = RS.TOWER_BY_ID[id];
      if (!def || (this.p.roster[id] || 0) < 2) return false; // keep at least one
      this.p.roster[id]--; this.p.shards[def.rarity] += RS.FORGE.shards[def.rarity].dismantle; this.save(); return true;
    },
    upcastShards(rarity) {
      const idx = RS.RARITY.findIndex((r) => r.id === rarity);
      if (idx < 0 || idx >= RS.RARITY.length - 1) return false;
      if (this.p.shards[rarity] < RS.FORGE.upcast) return false;
      this.p.shards[rarity] -= RS.FORGE.upcast;
      this.p.shards[RS.RARITY[idx + 1].id] += 1; this.save(); return true;
    },
    craftTower(id) {
      const def = RS.TOWER_BY_ID[id];
      if (!def) return false;
      const cost = RS.FORGE.shards[def.rarity].craft;
      if (this.p.shards[def.rarity] < cost) return false;
      this.p.shards[def.rarity] -= cost; this.addTower(id); this.save(); return true;
    },

    /* ---------------------------- progression ------------------------- */
    recordClear(mapId, diffId, stars, isBoss) {
      const c = this.p.completions[mapId] = this.p.completions[mapId] || {};
      const prev = c[diffId] ? c[diffId].stars : 0;
      c[diffId] = { stars: Math.max(prev, stars) };
      // unlock next difficulty
      const order = RS.DIFF_BY_ID[diffId].order;
      this.p.unlocked[mapId] = Math.max(this.p.unlocked[mapId] || 0, order + 1);
      this.p.stats.mapsCleared++;
      this.updateObjective('clearAny', 1);
      if (diffId === 'Hard') this.updateObjective('clearHard', 1);
      this.save();
    },
    diffUnlocked(mapId, diffId) {
      const order = RS.DIFF_BY_ID[diffId].order;
      return order <= (this.p.unlocked[mapId] || 0);
    },
    allHardcoreCleared() {
      return RS.MAPS.every((m) => this.p.completions[m.id] && this.p.completions[m.id].Hardcore);
    },
    codexPct() {
      const total = RS.TOWERS.length + RS.ENEMIES.filter((e) => !e.hidden).length;
      const seen = this.p.codex.towers.length + this.p.codex.enemies.length;
      return clamp(seen / total, 0, 1);
    },
    seeEnemy(id) { if (!this.p.codex.enemies.includes(id)) { this.p.codex.enemies.push(id); if (this.codexPct() >= 1 && !this.p._codexReward) { this.p._codexReward = true; this.grant('relic', 10); } } },

    /* ---------------------------- objectives -------------------------- */
    updateObjective(kind, n, family) {
      for (const o of RS.OBJECTIVES) {
        if (o.kind !== kind) continue;
        if (o.family && o.family !== family) continue;
        if ((this.p.objectives[o.id] || 0) >= o.goal) continue;
        this.p.objectives[o.id] = Math.min(o.goal, (this.p.objectives[o.id] || 0) + n);
        if (this.p.objectives[o.id] >= o.goal && !this.p['_obj_' + o.id]) {
          this.p['_obj_' + o.id] = true;
          for (const k in o.reward) this.grant(k, o.reward[k]);
          RS.bus.emit('objective-done', o);
        }
      }
    },

    /* ----------------------- profile & leaderboard --------------------- */
    hasProfile() { return !!this.p.profile.name; },
    setProfile(name, avatar) {
      name = ('' + name).trim().slice(0, 18) || 'Champion';
      this.p.profile = { name, avatar: avatar || '⚔️', createdAt: this.p.profile.createdAt || Date.now() };
      this.save();
    },
    // Ladder power score — the single number the Champions' Ladder ranks on.
    // Identical formula for the player and every rival, so the table is fair.
    powerScore(rec) {
      const W = RS.SCORE_WEIGHTS;
      let s = 0;
      s += (rec.highestWave || 0) * W.wave;
      s += (rec.kills || 0) * W.kill;
      s += (rec.topTowerDamage || 0) * W.towerDmg;
      s += (rec.totalRolls || 0) * W.roll;
      s += (rec.goldBanked || 0) * W.gold;
      if (rec.fastestVictory) s += Math.max(0, W.speedBase - rec.fastestVictory);
      return Math.round(s);
    },
    myScore() { return this.powerScore(this.p.records); },
    // Current ladder rank: 1 is the top seat. You hold a rank once your score
    // exceeds the rival occupying it.
    myRank() {
      const score = this.myScore();
      let rank = RS.RIVALS.length + 1;
      for (const rv of RS.RIVALS) if (score > rv.score) rank = Math.min(rank, rv.rank);
      return rank;
    },
    rankTitle(rank) {
      if (rank <= 1) return 'Champion of the Realm';
      if (rank === 2) return 'Challenger';
      if (rank <= 5) return 'Contender';
      if (rank <= 8) return 'Rising Blade';
      return 'Unranked Squire';
    },
    // The next rival standing directly above the player (null once #1).
    nextRival() {
      const score = this.myScore();
      let best = null;
      for (const rv of RS.RIVALS) if (rv.score >= score && (!best || rv.score < best.score)) best = rv;
      return best;
    },
    awardBadge(id) { if (!this.p.badges[id]) { this.p.badges[id] = true; return true; } return false; },
    earnedBadges() { return Object.keys(this.p.badges).filter((k) => RS.BADGES[k]).map((k) => Object.assign({ id: k }, RS.BADGES[k])); },

    // Called once at match end (win or lose) with the finished Match. Reads
    // final state only — never mutates the sim. Returns what changed so the
    // summary screen can celebrate it.
    updateRecords(m) {
      const r = this.p.records; const beat = [];
      const rankBefore = this.myRank();
      const maybe = (key, val, better) => {
        if (val == null) return;
        const cur = r[key];
        const isBetter = better === 'lower' ? (cur === 0 || val < cur) : val > cur;
        if (isBetter) { r[key] = val; beat.push(key); }
      };
      maybe('highestWave', m.waveIndex, 'higher');
      r.kills = this.p.stats.kills; // lifetime counter, always synced
      r.totalRolls = this.p.stats.rolls;
      if (m.state === 'won') {
        maybe('fastestVictory', Math.round(m.time), 'lower');
        maybe('goldBanked', Math.round(m.gold), 'higher');
      }
      let topDmg = 0; for (const uid in m.dmgByTower) topDmg = Math.max(topDmg, m.dmgByTower[uid]);
      maybe('topTowerDamage', Math.round(topDmg), 'higher');

      // ---- ladder progression ----
      const score = this.myScore();
      const newlyDefeated = [];
      for (const rv of RS.RIVALS) {
        if (!this.p.defeated[rv.id] && score > rv.score) { this.p.defeated[rv.id] = true; newlyDefeated.push(rv); }
      }
      const rankAfter = this.myRank();
      if (rankAfter < this.p.bestRank) this.p.bestRank = rankAfter;
      const newBadges = [];
      if (newlyDefeated.length && this.awardBadge('firstblood')) newBadges.push('firstblood');
      if (rankAfter <= 5 && this.awardBadge('ladder5')) newBadges.push('ladder5');
      if (rankAfter <= 2 && this.awardBadge('ladder2')) newBadges.push('ladder2');
      if (this.p.defeated.claude && this.awardBadge('sigil')) newBadges.push('sigil');

      this.save();
      return { beat, newlyDefeated, rankBefore, rankAfter, newBadges };
    },
  };
  Meta.RECORD_META = RECORD_META;

  RS.Meta = Meta;
})();
