/* =========================================================================
 * REALM SIEGE — js/match.js
 * The in-match simulation: grid + path build, fixed-timestep logic loop
 * decoupled from render, procedural wave generation, tower/enemy/projectile
 * update, blockers, auras, status, economy, win/lose. Rendering lives in
 * render.js and only reads Match state.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const { clamp, dist, dist2, fmt } = RS.util;
  const C = RS.combat;
  const TILE = RS.TILE;

  let UID = 1;
  const uid = () => UID++;

  /* ------------------------------ Match --------------------------------- */
  class Match {
    constructor(mapDef, diffDef, loadoutIds, meta) {
      this.map = mapDef;
      this.diff = diffDef;
      this.coldness = !!mapDef.coldness; // Winter map only — Cold shroud on foes
      this.loadout = loadoutIds.slice();
      this.meta = meta; // player meta profile (roster, tokens...) read-only here
      this.rng = new RS.RNG((this._hashSeed(mapDef.id) ^ (diffDef.order * 2654435761)) >>> 0);

      this.gold = diffDef.startGold + (meta.bonusStartGold || 0);
      this.lives = diffDef.lives;
      this.waveIndex = 0;
      this.maxWaves = diffDef.waves;
      this.state = 'building';   // building | wave | won | lost
      this.speed = 1;            // 1x/2x/4x
      this.paused = false;
      this.time = 0;
      this.acc = 0;

      this.towers = [];
      this.enemies = [];
      this.summons = [];         // wraiths, falcons, turrets (allied units)
      this.floaters = [];        // damage numbers
      this.shake = 0;
      this.freeze = 0;           // slow-mo frames (mythic roll style)

      this.projPool = new RS.Pool(
        () => ({ active: false }),
        (p) => { p.target = null; },
        256
      );
      this.particlePool = new RS.Pool(
        () => ({ active: false }),
        (p) => {},
        512
      );
      this.grid = new RS.SpatialGrid(RS.WORLD.w, RS.WORLD.h, 96);

      // economy tracking
      this.streak = 0;          // consecutive perfect waves
      this.perfectWave = true;
      this.bankedInterestBase = 0;
      this.copperEarned = 0;
      this.totalKills = 0;
      this.killsByFamily = {};
      this.dmgByTower = {};      // uid -> total damage (for post-match chart)
      this.leaksThisWave = 0;
      this.stars = 0;
      this.towerCap = 0;         // count towers built for star3 evaluation
      this.encountered = new Set();

      // environment
      this.weather = this.map.env.weather[0] || 'Clear';
      this.weatherIdx = 0;
      this.weatherT = RS.WEATHER_ROTATE;
      this.nextWeather = null;
      this.dayT = 0;             // 0..1 within day/night cycle
      this.isNight = false;

      // wave runtime
      this.spawnQueue = [];      // pending spawns {t, enemyId, lane}
      this.spawnTimer = 0;
      this.waveActive = false;
      this.waveTimeLeft = 0;
      this.pendingWavePreview = null;

      // adaptive difficulty tracking (Hardcore)
      this.dmgTypeKills = {};

      this._buildGridAndPaths();
      this._auraTick = 0;
      this.pathShorten = 0;      // Sovereign reforge
      this.extraPlatforms = [];

      this.log = [];
      this.buildPreview(1);
    }

    _hashSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

    /* ------------------------- grid & path build ---------------------- */
    _buildGridAndPaths() {
      const cols = RS.GRID.cols, rows = RS.GRID.rows;
      this.cols = cols; this.rows = rows;
      // tile attribute map: 0=buildable default; store flags
      this.tiles = new Array(cols * rows);
      for (let i = 0; i < this.tiles.length; i++) this.tiles[i] = { kind: 'buildable', occupied: 0 };

      const setTiles = (list, kind) => { for (const [c, r] of (list || [])) { const t = this._tile(c, r); if (t) t.kind = kind; } };

      // Build path tiles first from waypoints (rasterise orthogonal segments).
      this.paths = [];
      const goalTile = this.map.goalOverride || null;
      for (const wp of this.map.paths) {
        const pts = wp.map(([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 }));
        // segment lengths
        let len = 0; const segs = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const d = dist(a.x, a.y, b.x, b.y);
          segs.push({ a, b, d, start: len }); len += d;
          // rasterise tiles along this segment
          this._rasterPath(wp[i], wp[i + 1]);
        }
        const spawn = pts[0], goal = pts[pts.length - 1];
        this.paths.push({ pts, segs, len, spawn, goal, straightLen: dist(spawn.x, spawn.y, goal.x, goal.y) });
      }
      this.goalPx = goalTile
        ? { x: goalTile[0] * TILE + TILE / 2, y: goalTile[1] * TILE + TILE / 2 }
        : this.paths[0].goal;

      // Apply special tiles (may overwrite buildable, never path).
      const applySpecial = (list, kind) => { for (const [c, r] of (list || [])) { const t = this._tile(c, r); if (t && t.kind !== 'path') t.kind = kind; } };
      applySpecial(this.map.unbuildable, 'unbuildable');
      applySpecial(this.map.water, 'water');
      applySpecial(this.map.highground, 'highground');
      applySpecial(this.map.hazard, 'hazard');
      applySpecial(this.map.holy, 'holy');
      applySpecial(this.map.cursed, 'cursed');
      applySpecial(this.map.houses, 'house'); // Winter map: the only buildable tiles

      // Precompute path-adjacency (for blocker placement & siegebreaker).
      this.pathAdjacent = new Set();
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (this._tile(c, r).kind !== 'path') continue;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const t = this._tile(c + dc, r + dr);
          if (t && t.kind !== 'path') this.pathAdjacent.add((c + dc) + ',' + (r + dr));
        }
      }
    }

    _rasterPath(a, b) {
      let [c0, r0] = a, [c1, r1] = b;
      const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
      let c = c0, r = r0;
      const guard = 200; let g = 0;
      while (g++ < guard) {
        const t = this._tile(c, r); if (t) t.kind = 'path';
        if (c === c1 && r === r1) break;
        if (c !== c1) c += dc; else if (r !== r1) r += dr;
      }
    }

    _tile(c, r) { if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null; return this.tiles[r * this.cols + c]; }
    tileKind(c, r) { const t = this._tile(c, r); return t ? t.kind : 'unbuildable'; }

    /* ---------------------------- wave gen ---------------------------- */
    // Candidate enemy pool for this map (family-weighted, no hidden/bosses).
    // Signature enemies (sig_*) are excluded from the generic pool and only the
    // map's OWN signature is injected — so each map has a unique menace.
    _candidatePool() {
      if (this._pool) return this._pool;
      const fam = this.map.families;
      this._pool = RS.ENEMIES.filter((e) => !e.hidden && !e.traits.includes('Boss') && e.id.indexOf('sig_') !== 0 && (fam[e.family] || 0) > 0)
        .map((e) => ({ def: e, w: fam[e.family] }));
      const sig = this.map.signature && RS.ENEMY_BY_ID[this.map.signature];
      if (sig) this._pool.push({ def: sig, w: 3.5 });
      return this._pool;
    }

    // The MAP owns its boss; difficulty only scales it. `diff.boss` remains the
    // fallback for Endless, which overrides it with the Grey Herald.
    bossId() {
      if (this.diff.endless) return this.diff.boss;
      return this.map.boss || this.diff.boss;
    }
    // Bosses get a SOFTENED difficulty curve. Boss base HP now encodes the
    // map's rating, so applying the full hpMult on top (up to 20x) double-
    // scaled it — a rating-6 boss on Hardcore came out over a million HP.
    _bossHpMult() { return 1 + (this.diff.hpMult - 1) * 0.45; }

    _archetypeFor(n) {
      if (n >= this.maxWaves) return 'Boss';
      if (n % RS.WAVE.miniBossEvery === 0) return 'Elite';
      const seed = new RS.RNG((this._hashSeed(this.map.id) + n * 97 + this.diff.order * 13) >>> 0);
      const options = ['Standard', 'Standard', 'Swarm', 'Aerial', 'Stealth', 'Split', 'Endurance', 'Elite'];
      // No pure-Aerial or Stealth waves in the opening stretch. Both are
      // untouchable by the cheap ground/melee towers a new player can afford,
      // and Farmstead Easy was rolling Aerial for waves 1 AND 2 — so the very
      // first thing a player ever saw was their starter tower unable to act,
      // which reads as "melee is broken" rather than "bring anti-air".
      if (n <= RS.WAVE.noAirBeforeWave) return seed.pick(['Standard', 'Standard', 'Swarm', 'Endurance']);
      // Elite is a 2.64x budget spike; before the player has a real defence it
      // is a wall, not a challenge. Held back until the first mini-boss wave.
      if (n < RS.WAVE.noEliteBeforeWave) return seed.pick(options.filter((o) => o !== 'Elite'));
      return seed.pick(options);
    }

    // Wave SIZE onboarding curve: waves 1..earlyEaseWaves scale from
    // earlyEaseFloor up to full. Multiplies the normal budget, so nothing from
    // wave `earlyEaseWaves` onward changes.
    _earlyEase(n) {
      const R = RS.WAVE;
      if (!n || n >= R.earlyEaseWaves) return 1;
      return R.earlyEaseFloor + (1 - R.earlyEaseFloor) * ((n - 1) / (R.earlyEaseWaves - 1));
    }

    generateWave(n) {
      const arch = this._archetypeFor(n);
      const info = RS.WAVE.archetypes[arch];
      const seed = new RS.RNG((this._hashSeed(this.map.id) + n * 131 + this.diff.order * 977) >>> 0);
      const lanes = this.paths.length;

      if (arch === 'Boss') {
        return { arch, groups: [{ enemyId: this.bossId(), count: 1, spacing: 1, lane: 0, delay: 1 }],
          budget: 0, name: 'Boss' };
      }

      let budget = RS.WAVE.baseBudget * Math.pow(RS.WAVE.growth, n - 1) * this.diff.countMult * this._earlyEase(n);
      budget *= info.sizeBias;
      if (arch === 'Elite') budget *= 1.2;

      // Build biased candidate list.
      let pool = this._candidatePool().slice();
      if (info.familyBias === 'Aerial') pool = pool.filter((p) => p.def.traits.includes('Flying'));
      else if (info.familyBias === 'cheap') pool = pool.filter((p) => p.def.cost <= 12);
      else if (info.familyBias === 'expensive') pool = pool.filter((p) => p.def.cost >= 30);
      else if (info.familyBias === 'stealth') {
        const stealth = pool.filter((p) => p.def.traits.includes('Stealth'));
        pool = stealth.length ? stealth : pool.filter((p) => p.def.cost >= 20);
      }
      if (pool.length === 0) pool = this._candidatePool().slice();

      const groups = [];
      let spent = 0, guard = 0;
      while (spent < budget && guard++ < 400) {
        const pick = seed.weighted(pool);
        const packDef = pick.def;
        const pack = packDef.abilities.packSize || 1;
        const cost = packDef.cost * pack;
        if (spent + cost > budget * 1.1 && groups.length > 0) break;
        spent += cost;
        const lane = info.multiLane ? seed.int(0, lanes - 1) : (lanes > 1 ? seed.int(0, lanes - 1) : 0);
        groups.push({ enemyId: packDef.id, count: pack, spacing: info.spacing, lane });
      }
      // Every wave should have at least one group.
      if (groups.length === 0) {
        const pick = seed.weighted(this._candidatePool());
        groups.push({ enemyId: pick.def.id, count: 1, spacing: 1, lane: 0 });
      }
      // Guarantee a ground escort. A wave with zero walkers leaves every melee
      // and blocker tower on the field with nothing it is allowed to attack —
      // the tower looks broken through no fault of the player's build. Aerial
      // waves stay air-HEAVY (that's their identity); they just aren't air-ONLY.
      if (groups.every((g) => RS.ENEMY_BY_ID[g.enemyId].traits.includes('Flying'))) {
        const ground = this._candidatePool().filter((p) => !p.def.traits.includes('Flying'));
        if (ground.length) {
          const esc = seed.weighted(ground).def;
          const n2 = Math.max(2, Math.round(budget * 0.22 / Math.max(1, esc.cost)));
          groups.push({ enemyId: esc.id, count: n2 * (esc.abilities.packSize || 1), spacing: info.spacing, lane: 0 });
        }
      }
      return { arch, groups, budget: Math.round(budget), name: arch };
    }

    buildPreview(n) {
      const w = this.generateWave(n);
      const agg = {};
      const tags = new Set();
      for (const g of w.groups) {
        const def = RS.ENEMY_BY_ID[g.enemyId];
        agg[def.name] = (agg[def.name] || 0) + g.count;
        def.traits.forEach((t) => tags.add(t));
        if (def.family === 'Aerial' || def.traits.includes('Flying')) tags.add('Air');
        if (def.armor >= 16) tags.add('Armored');
        if (def.magicResist >= 0.3) tags.add('Magic-Resist');
      }
      this.pendingWavePreview = { arch: w.arch, comp: agg, tags: Array.from(tags), n };
      return this.pendingWavePreview;
    }

    /* --------------------------- wave control ------------------------- */
    startWave() {
      if (this.state === 'building') this.state = 'wave';
      if (this.waveActive) return;
      this.waveIndex++;
      if (this.waveIndex > this.maxWaves) { this._checkWin(); return; }
      const w = this.generateWave(this.waveIndex);
      this.currentWave = w;
      this.perfectWave = true;
      this.leaksThisWave = 0;
      this.spawnQueue = [];
      let t = 0.4;
      for (const g of w.groups) {
        for (let i = 0; i < g.count; i++) {
          this.spawnQueue.push({ t, enemyId: g.enemyId, lane: g.lane });
          t += clamp(g.spacing, 0.2, 2.5);
        }
        t += 0.3;
      }
      this.spawnTimer = 0;
      this.waveActive = true;
      this.waveTimeLeft = t + 6;
      this.log.unshift(`Wave ${this.waveIndex} — ${w.name}`);
      RS.bus.emit('wave-start', { n: this.waveIndex, wave: w });
      if (this.waveIndex < this.maxWaves) this.buildPreview(this.waveIndex + 1);
      if (w.arch === 'Boss' || w.arch === 'Elite') this.shake = Math.max(this.shake, 14);
    }

    callEarly() {
      if (!this.waveActive || this.spawnQueue.length === 0) return;
      const bonus = Math.round(this.waveTimeLeft * RS.WAVE.callEarlyBonusPerSec);
      this.gold += bonus;
      this.addFloater(this.goalPx.x, 40, '+' + bonus + 'g early', RS.PALETTE.gold);
      // fast-forward remaining spawns
      let t = 0.2;
      for (const s of this.spawnQueue) { s.t = t; t += 0.25; }
    }

    /* ------------------------- placement / build ---------------------- */
    canPlace(towerDef, c, r) {
      const fp = towerDef.traits.footprint || 1;
      for (let dr = 0; dr < fp; dr++) for (let dc = 0; dc < fp; dc++) {
        const t = this._tile(c + dc, r + dr);
        if (!t) return { ok: false, reason: 'Off map' };
        if (t.occupied) return { ok: false, reason: 'Occupied' };
        const k = t.kind;
        if (k === 'path') return { ok: false, reason: 'Path Blocked' };
        // Winter map: build ONLY inside the campfire-lit houses (overrides other rules).
        if (this.map.houseOnly) { if (k !== 'house') return { ok: false, reason: '🔥 Build inside a house' }; continue; }
        if (k === 'unbuildable') return { ok: false, reason: 'Unbuildable' };
        if (k === 'water' && towerDef.placement !== 'Water-capable') return { ok: false, reason: 'Water: needs water tower' };
        if (towerDef.placement === 'High-ground-only' && k !== 'highground') return { ok: false, reason: 'High ground only' };
        if (towerDef.placement === 'Path-adjacent-only') {
          if (!this.pathAdjacent.has((c + dc) + ',' + (r + dr))) return { ok: false, reason: 'Must border the path' };
        }
      }
      // rarity placement cap
      const cap = RS.PLACE_CAP[towerDef.rarity];
      const cnt = this.towers.filter((t) => t.def.rarity === towerDef.rarity).length;
      if (cnt >= cap) return { ok: false, reason: `${towerDef.rarity} cap (${cap}) reached` };
      // cost
      if (this.gold < towerDef.cost) return { ok: false, reason: 'Not enough gold' };
      return { ok: true };
    }

    place(towerDef, c, r) {
      const chk = this.canPlace(towerDef, c, r);
      if (!chk.ok) return chk;
      const fp = towerDef.traits.footprint || 1;
      for (let dr = 0; dr < fp; dr++) for (let dc = 0; dc < fp; dc++) this._tile(c + dc, r + dr).occupied = 1;
      const t = this._makeTower(towerDef, c, r);
      this.towers.push(t);
      this.gold -= towerDef.cost;
      this.towerCap++;
      this.encountered.add('tower:' + towerDef.id);
      RS.bus.emit('gold', this.gold);
      this.addFloater(t.x, t.y - 20, towerDef.name, RS.rarityColor(towerDef.rarity));
      return { ok: true, tower: t };
    }

    _makeTower(def, c, r) {
      const fp = def.traits.footprint || 1;
      const x = c * TILE + (fp * TILE) / 2, y = r * TILE + (fp * TILE) / 2;
      const t = {
        uid: uid(), def, c, r, x, y, level: 1, branch: null, footprint: fp,
        targeting: def.targeting, cooldown: 0, invested: def.cost,
        range: def.rangeT * TILE, damage: def.damage, fireRate: def.fireRate, splash: def.splashT * TILE,
        buff: { dmg: 1, range: 1, fireRate: 1, gold: 1 }, ascended: false,
        overheatShots: 0, overheatT: 0, disabledT: 0, charmT: 0,
        abilityT: 0, cycleIdx: 0, summonList: [], builderT: def.traits.builder ? def.traits.builder.every : 0,
        activeCd: def.traits.active ? def.traits.active.cd : 0, activeReady: false,
        onHighground: this.tileKind(c, r) === 'highground',
        onHoly: this.tileKind(c, r) === 'holy',
        blocker: null, muzzle: 0, flashT: 0,
      };
      if (def.traits.blocker) {
        const b = def.traits.blocker;
        t.blocker = { capacity: b.capacity, respawn: b.respawn, hp: 60 + def.cost * 0.4, maxHp: 60 + def.cost * 0.4, respawnT: 0, engaged: [] };
      }
      // ascension: if player owns a duplicate of this tower, allow ascend flag available later.
      return t;
    }

    sell(t) {
      if (this.diff.noSell) return false;
      const refund = Math.round(t.invested * 0.7);
      this.gold += refund;
      this._removeTower(t);
      this.addFloater(t.x, t.y, '+' + refund + 'g', RS.PALETTE.gold);
      return true;
    }

    _removeTower(t) {
      const fp = t.footprint;
      for (let dr = 0; dr < fp; dr++) for (let dc = 0; dc < fp; dc++) { const tt = this._tile(t.c + dc, t.r + dr); if (tt) tt.occupied = 0; }
      this.towers = this.towers.filter((x) => x !== t);
      this.summons = this.summons.filter((s) => s.ownerUid !== t.uid);
    }

    upgradeCost(t) {
      return Math.round(t.def.cost * RS.UPGRADE.costFrac * Math.pow(RS.UPGRADE.costBase, t.level));
    }

    upgrade(t, branchChoice) {
      if (t.level >= RS.UPGRADE.maxLevel) return false;
      // Level 5 requires a duplicate in collection.
      if (t.level === 4) {
        const owned = this.meta.roster[t.def.id] || 0;
        if (owned < 2 && !this.meta.freeAscend) { this.addFloater(t.x, t.y, 'Need duplicate!', RS.PALETTE.bad); return false; }
      }
      const cost = this.upgradeCost(t);
      if (this.gold < cost) return false;
      this.gold -= cost; t.invested += cost; t.level++;
      const p = RS.UPGRADE.perLevel;
      if (t.level <= 4) {
        t.damage *= 1 + p.damage; t.range *= 1 + p.range; t.fireRate *= 1 + p.fireRate;
      }
      if (t.level === 4 && branchChoice != null) {
        t.branch = branchChoice;
        const mods = t.def.upgrades.branch[branchChoice].mods || {};
        this._applyMods(t, mods);
      }
      if (t.level === 5) {
        t.ascended = true;
        t.damage *= 1.5; t.range *= 1.1;
        // consume duplicate
        if (this.meta.roster[t.def.id] > 1) { RS.bus.emit('consume-dup', t.def.id); }
        this.addFloater(t.x, t.y - 24, 'ASCENDED', RS.rarityColor(t.def.rarity));
        this.shake = Math.max(this.shake, 8);
      }
      this.addFloater(t.x, t.y, 'L' + t.level, RS.PALETTE.gold);
      return true;
    }

    _applyMods(t, mods) {
      if (mods.damage) t.damage *= 1 + mods.damage;
      if (mods.fireRate) t.fireRate *= 1 + mods.fireRate;
      if (mods.rangeT) t.range += mods.rangeT * TILE;
      if (mods.splashT) t.splash += mods.splashT * TILE;
      if (mods.blockCap && t.blocker) t.blocker.capacity += mods.blockCap;
      if (mods.hp && t.blocker) { t.blocker.maxHp *= 1 + mods.hp; t.blocker.hp = t.blocker.maxHp; }
      if (mods.respawn && t.blocker) t.blocker.respawn = Math.max(1, t.blocker.respawn + mods.respawn);
      t._mods = Object.assign(t._mods || {}, mods);
    }

    /* ============================ MAIN LOOP =========================== */
    // Called from RAF with real dt; runs fixed logic steps + accumulates render.
    frame(realDt) {
      if (this.paused) return;
      const steps = this.speed;
      let dt = RS.TICK;
      // run `speed` logic steps per frame for fast-forward, using accumulator on realDt
      this.acc += realDt;
      let iter = 0;
      const maxIter = 8 * this.speed;
      while (this.acc >= RS.TICK && iter < maxIter) {
        for (let s = 0; s < steps; s++) this.step(dt);
        this.acc -= RS.TICK;
        iter++;
      }
      if (this.shake > 0) this.shake = Math.max(0, this.shake - realDt * 30);
      if (this.freeze > 0) this.freeze = Math.max(0, this.freeze - realDt);
    }

    step(dt) {
      if (this.state === 'won' || this.state === 'lost') return;
      this.time += dt;
      this._updateEnvironment(dt);
      // rebuild spatial grid
      this.grid.clear();
      for (const e of this.enemies) if (e.alive) this.grid.insert(e);

      this._spawnStep(dt);
      // aura recompute a few times/sec
      this._auraTick -= dt;
      if (this._auraTick <= 0) { this._recomputeAuras(); this._auraTick = 0.2; }

      this._updateEnemies(dt);
      this._updateTowers(dt);
      this._updateSummons(dt);
      this._updateProjectiles(dt);
      this._updateFloaters(dt);

      // wave completion check
      if (this.waveActive) {
        this.waveTimeLeft -= dt;
        const noPending = this.spawnQueue.length === 0;
        const noEnemies = this.enemies.length === 0;
        if (noPending && noEnemies) this._completeWave();
      }
    }

    /* --------------------------- environment -------------------------- */
    _updateEnvironment(dt) {
      // Day/night
      if (this.map.env.dayNight) {
        this.dayT += dt / RS.DAYNIGHT_CYCLE;
        if (this.dayT >= 1) this.dayT -= 1;
        this.isNight = this.dayT > 0.5;
      }
      // Weather rotation
      if (this.map.env.weather.length > 1) {
        this.weatherT -= dt;
        if (this.weatherT <= RS.WEATHER_TELEGRAPH && !this.nextWeather) {
          this.weatherIdx = (this.weatherIdx + 1) % this.map.env.weather.length;
          this.nextWeather = this.map.env.weather[this.weatherIdx];
          RS.bus.emit('weather-telegraph', this.nextWeather);
        }
        if (this.weatherT <= 0) {
          this.weather = this.nextWeather || this.weather;
          this.nextWeather = null;
          this.weatherT = RS.WEATHER_ROTATE;
          RS.bus.emit('weather', this.weather);
        }
      }
    }

    // Range multiplier from environment for a tower.
    _envRangeMult(t) {
      let m = 1;
      const wm = RS.WEATHER[this.weather].mods;
      if (wm.rangeAll) m *= 1 + wm.rangeAll;
      if (this.isNight && !this._litAt(t.x, t.y)) m *= 1 - RS.NIGHT_RANGE_PENALTY;
      if (t.onHighground) m *= 1.25;
      return m;
    }

    _litAt(x, y) {
      // lit by a light-source tower nearby (torch/cleric) negates night penalty
      for (const t of this.towers) {
        const lt = t.def.traits.light;
        if (lt && dist2(x, y, t.x, t.y) < (lt * TILE) * (lt * TILE)) return true;
      }
      return false;
    }

    _weatherDmgMult(type) {
      const wm = RS.WEATHER[this.weather].mods;
      let m = 1;
      if (wm[type]) m *= 1 + wm[type];
      return m;
    }

    /* ----------------------------- spawning --------------------------- */
    _spawnStep(dt) {
      if (this.spawnQueue.length === 0) return;
      this.spawnTimer += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.spawnTimer) {
        const s = this.spawnQueue.shift();
        this._spawnEnemy(s.enemyId, s.lane);
      }
    }

    // Waves 1..earlyRampWaves scale enemy HP up from earlyRampFloor to 1.0,
    // so a brand-new player's first few waves are noticeably softer than the
    // rest of the run instead of hitting full strength immediately.
    _earlyHpRamp(n) {
      const R = RS.WAVE;
      if (!n || n >= R.earlyRampWaves) return 1;
      return R.earlyRampFloor + (1 - R.earlyRampFloor) * ((n - 1) / (R.earlyRampWaves - 1));
    }

    _spawnEnemy(enemyId, lane, atProgress) {
      const def = RS.ENEMY_BY_ID[enemyId];
      if (!def) return null;
      lane = lane % this.paths.length;
      const path = this.paths[lane];
      const isFlying = def.traits.includes('Flying');
      const isBossDef = def.traits.includes('Boss');
      const hpMult = isBossDef ? this._bossHpMult() : this.diff.hpMult * this._earlyHpRamp(this.waveIndex);
      const e = {
        active: true, alive: true, def, lane,
        progress: atProgress || 0,
        isFlying,
        hp: def.hp * hpMult, maxHp: def.hp * hpMult,
        armor: def.armor + this.diff.addArmor,
        magicResist: clamp(def.magicResist + this.diff.magicResist + (this.diff.modifiers.includes('Warded') ? 0 : 0), 0, 0.85),
        speed: def.speed * this.diff.speedMult,
        status: { stunImmuneT: 0 },
        x: path.spawn.x, y: path.spawn.y,
        flashT: 0, engagedByUid: 0,
        splitsLeft: def.abilities.splitsLeft || 0,
        abilT: {}, buffSpeed: 1, revived: false, isBoss: def.traits.includes('Boss'),
        bossPhase: 1, adaptResist: 0, killerType: null,
        coldHp: 0, coldMax: 0, _coldBroke: 0,
      };
      // Coldness (Winter map): a Cold shroud equal to 50% max HP that must be
      // melted with Fire/Holy before HP can be reduced.
      if (this.coldness) { e.coldMax = e.maxHp * 0.5; e.coldHp = e.coldMax; }
      // adaptive resist (Hardcore)
      if (this.diff.adaptive && this._adaptType && def.family) {
        // enemies gain resist to whichever type killed most last wave
      }
      this._placeEnemy(e);
      this.enemies.push(e);
      this.encountered.add('enemy:' + (def.hidden ? def.id : def.id));
      if (e.isBoss) { this.shake = Math.max(this.shake, 18); RS.bus.emit('boss-spawn', def); }
      return e;
    }

    _placeEnemy(e) {
      // ALL enemies — including flyers — now follow the path spline. Flyers are
      // still "Flying" (anti-air targeting + drawn at altitude), they just no
      // longer cut a straight line across the map. (Fixes "birds ignore the path".)
      const path = this.paths[e.lane];
      const total = path.len * (1 - this.pathShorten);
      if (e.progress >= total) { e.x = this.goalPx.x; e.y = this.goalPx.y; return; }
      let p = e.progress; let seg = path.segs[0];
      for (const s of path.segs) { if (p <= s.d) { seg = s; break; } p -= s.d; }
      const t = seg.d > 0 ? p / seg.d : 0;
      e.x = seg.a.x + (seg.b.x - seg.a.x) * t;
      e.y = seg.a.y + (seg.b.y - seg.a.y) * t;
    }

    /* ---------------------------- enemies ----------------------------- */
    _updateEnemies(dt) {
      const live = [];
      for (const e of this.enemies) {
        if (!e.alive) continue;
        // status
        const burnDmg = C.Status.tick(e, dt);
        if (burnDmg > 0) this._damageEnemy(e, burnDmg, 'Fire', { fromDot: true });
        if (!e.alive) continue;
        // regen
        if (e.def.traits.includes('Regenerating') && e.def.abilities.regen) {
          e.hp = Math.min(e.maxHp, e.hp + e.def.abilities.regen * this.diff.hpMult * 0.2 * dt);
        }
        // abilities
        this._enemyAbilities(e, dt);
        // movement — blocked enemies stop
        let sf = C.Status.speedFactor(e) * e.buffSpeed;
        if (e.engagedByUid) sf = 0;
        // rage
        if (e.def.abilities.rageAtLowHp && e.hp / e.maxHp <= e.def.abilities.rageAtLowHp.hpPct) sf *= e.def.abilities.rageAtLowHp.speed;
        // bog slow / ice fast (terrain under enemy)
        const tk = this.tileKind((e.x / TILE) | 0, (e.y / TILE) | 0);
        if (this.map.env.gimmick === 'bog') sf *= 0.75;
        if (this.map.env.gimmick === 'ice' && !e.def.traits.includes('Immune-Slow')) sf *= 1.15;
        e.progress += e.speed * sf * dt;
        this._placeEnemy(e);
        // hazard tile damage
        if (tk === 'hazard') this._damageEnemy(e, 40 * this.diff.hpMult * 0.02, 'Fire', { fromDot: true });
        if (tk === 'holy' && e.def.family === 'Undead') this._damageEnemy(e, e.maxHp * 0.01 * dt, 'Holy', { fromDot: true });
        if (e.flashT > 0) e.flashT -= dt;
        // leak
        const path = this.paths[e.lane];
        const total = path.len * (1 - this.pathShorten);
        if (e.progress >= total) { this._leak(e); continue; }
        if (e.alive) live.push(e);
      }
      this.enemies = live;
    }

    _enemyAbilities(e, dt) {
      const ab = e.def.abilities;
      // buff aura -> apply to allies (speed) each frame
      if (ab.buffAura) {
        // handled passively: mark nearby enemies buffSpeed (reset each frame below)
      }
      // Necromancer revive
      if (ab.reviveNearby) {
        e.abilT.rev = (e.abilT.rev || 0) + dt;
        if (e.abilT.rev >= ab.reviveNearby.every) {
          e.abilT.rev = 0;
          for (let i = 0; i < ab.reviveNearby.count; i++) this._spawnEnemy('skelwarrior', e.lane, Math.max(0, e.progress - 20));
        }
      }
      // Plague bile puddle
      if (ab.bilePuddle) {
        e.abilT.bile = (e.abilT.bile || 0) + dt;
        if (e.abilT.bile >= 1.2) { e.abilT.bile = 0; this._spawnHazardPuddle(e.x, e.y, ab.bilePuddle); }
      }
      // Succubus charm
      if (ab.charmTower) {
        e.abilT.charm = (e.abilT.charm || 0) + dt;
        if (e.abilT.charm >= ab.charmTower.every) {
          e.abilT.charm = 0;
          const near = this.towers.filter((t) => dist2(t.x, t.y, e.x, e.y) < (4 * TILE) ** 2);
          if (near.length) { const t = near[Math.floor(Math.random() * near.length)]; t.charmT = ab.charmTower.dur; }
        }
      }
      // Boss behaviours
      if (ab.boss) this._bossAbilities(e, dt);
      // reset per-frame buffSpeed then apply auras below in aura pass; simple: recompute here
    }

    _spawnHazardPuddle(x, y, cfg) {
      // ephemeral hazard: model as a short-lived summon-like object drawn as decal
      this.floaters.push({ x, y, kind: 'puddle', t: cfg.dur, dps: cfg.dps, r: 22, life: cfg.dur });
    }

    _bossAbilities(e, dt) {
      const ab = e.def.abilities;
      const pct = e.hp / e.maxHp;
      if (ab.summon && !e._summoned && pct <= (ab.summon.atHpPct || 0.5)) {
        e._summoned = true;
        for (let i = 0; i < ab.summon.count; i++) this._spawnEnemy(ab.summon.id, e.lane, Math.max(0, e.progress - 30 - i * 6));
        this.shake = Math.max(this.shake, 10);
      }
      if (ab.shatterBlocker) {
        e.abilT.sh = (e.abilT.sh || 0) + dt;
        if (e.abilT.sh >= ab.shatterBlocker) {
          e.abilT.sh = 0;
          const blk = this.towers.filter((t) => t.blocker);
          if (blk.length) { const t = blk[Math.floor(Math.random() * blk.length)]; if (t.blocker) { t.blocker.hp = 0; t.blocker.respawnT = t.blocker.respawn; } }
        }
      }
      if (ab.copyStrongest) {
        e.abilT.copy = (e.abilT.copy || 0) + dt;
        if (e.abilT.copy >= ab.copyStrongest.every) {
          e.abilT.copy = 0;
          let strong = null; for (const t of this.towers) if (!strong || RS.towerDps(t.def) > RS.towerDps(strong.def)) strong = t;
          if (strong) { e.maxHp += RS.towerDps(strong.def) * 40; e.hp += RS.towerDps(strong.def) * 40; }
        }
      }
      // ---- Ground Stomp: slams the ground, stuns nearby towers for 2s ----
      if (ab.groundStomp) {
        e.abilT.gs = (e.abilT.gs || 0) + dt;
        if (e.abilT.gs >= ab.groundStomp.every) {
          e.abilT.gs = 0;
          const rad = ab.groundStomp.radius;
          let hit = 0;
          for (const t of this.towers) {
            if (dist2(e.x, e.y, t.x, t.y) > rad * rad) continue;
            if (this.stunTower(t, 2)) hit++;
          }
          this.shake = Math.max(this.shake, 20);
          (this._fx = this._fx || []).push({ kind: 'stomp', x: e.x, y: e.y, r: rad, t: 0.55, max: 0.55 });
          RS.bus.emit('boss-stomp', { enemy: e, hit });
        }
      }
      // ---- Tower Slice: swings at one tower, sparks, 1.5s stun ----
      if (ab.towerSlice) {
        e.abilT.ts = (e.abilT.ts || 0) + dt;
        if (e.abilT.ts >= ab.towerSlice.every) {
          e.abilT.ts = 0;
          const rad = ab.towerSlice.radius;
          let best = null, bd = rad * rad;
          for (const t of this.towers) {
            const d = dist2(e.x, e.y, t.x, t.y);
            if (d < bd) { bd = d; best = t; }
          }
          if (best) {
            const stunned = this.stunTower(best, 1.5);
            (this._fx = this._fx || []).push({ kind: 'slice', x: e.x, y: e.y, tx: best.x, ty: best.y, t: 0.3, max: 0.3, blocked: !stunned });
            this.shake = Math.max(this.shake, 10);
            RS.bus.emit('boss-slice', { enemy: e, tower: best, stunned });
          }
        }
      }
      if (ab.summonBalor && pct <= 0.4 && !e._balor) {
        e._balor = true;
        for (let i = 0; i < ab.summonBalor; i++) this._spawnEnemy('balor', e.lane, Math.max(0, e.progress - 40 - i * 10));
      }
    }

    _leak(e) {
      e.alive = false;
      const loss = e.isBoss ? 5 : (e.def.traits.includes('Swarm') ? 1 : 1);
      this.lives -= loss;
      this.leaksThisWave++;
      this.perfectWave = false;
      this.streak = 0;
      if (e.def.abilities.stealGoldOnLeak) this.gold = Math.max(0, this.gold - e.def.abilities.stealGoldOnLeak);
      if (e.def.abilities.destroyTowerOnGoal && this.towers.length) {
        const t = this.towers[Math.floor(Math.random() * this.towers.length)];
        if (!this._isInvuln(t)) this._removeTower(t);
      }
      this.shake = Math.max(this.shake, 6);
      RS.bus.emit('leak', { lives: this.lives });
      if (this.lives <= 0) this._lose();
      if (this.diff.noLeak) this._lose();
    }

    _isInvuln(t) {
      // Grail passive: all towers invulnerable if a Grail is on field
      return this.towers.some((x) => x.def.traits.globalAura && x.def.traits.globalAura.invuln);
    }

    _damageEnemy(e, amount, type, opts) {
      if (!e.alive) return;
      opts = opts || {};
      // Coldness (Winter map only): the Cold shroud absorbs all damage until
      // melted. Fire/Holy melt it at full rate; other damage chips it slowly.
      if (this.coldness && e.coldHp > 0) {
        const warm = (type === 'Fire' || type === 'Holy');
        e.coldHp -= amount * (warm ? 1 : 0.35);
        if (e.coldHp <= 0) { e.coldHp = 0; e._coldBroke = 0.35; if (!opts.silent) this.addFloater(e.x, e.y - 14, 'CRACK!', '#bfeaf5'); }
        else if (!opts.fromDot && !opts.silent && warm) this.addFloater(e.x, e.y - 10, '❄' + Math.round(amount), '#bfeaf5');
        return; // no HP damage while the shroud holds
      }
      const vuln = C.Status.vulnMult(e);
      let dmg = amount * vuln;
      e.hp -= dmg;
      e.flashT = 0.08;
      if (opts.ownerUid != null) this.dmgByTower[opts.ownerUid] = (this.dmgByTower[opts.ownerUid] || 0) + dmg;
      // Sovereign: convert dmg to gold
      const conv = this._globalDmgToGold;
      if (conv) { this.gold += dmg * conv; }
      if (!opts.fromDot && !opts.silent) this.addFloater(e.x, e.y - 10, Math.round(dmg), RS.DMG_COLOR[type] || '#fff', opts.critical);
      if (e.hp <= 0) this._killEnemy(e, type, opts);
    }

    _killEnemy(e, type, opts) {
      if (!e.alive) return;
      e.alive = false;
      // bounty
      const goldGain = e.def.bounty * (this._globalGoldMult || 1) * (this.diff.goldMult || 1);
      this.gold += goldGain;
      this.totalKills++;
      this.killsByFamily[e.def.family] = (this.killsByFamily[e.def.family] || 0) + 1;
      this.copperEarned += e.def.bounty * RS.ECON.copperPerKill;
      if (type) this.dmgTypeKills[type] = (this.dmgTypeKills[type] || 0) + 1;
      RS.bus.emit('kill', { family: e.def.family, boss: e.isBoss });
      // splitter
      if (e.def.traits.includes('Splitter') && e.def.abilities.splitInto) {
        const si = e.def.abilities.splitInto;
        if (e.def.id !== 'mirrorwisp' || e.splitsLeft > 0) {
          for (let i = 0; i < si.count; i++) {
            const c = this._spawnEnemy(si.id, e.lane, Math.max(0, e.progress - 6 + i * 4));
            if (c && si.id === 'mirrorwisp') c.splitsLeft = e.splitsLeft - 1;
          }
        }
      }
      // Lich raise -> allied wraith
      for (const t of this.towers) {
        if (t.def.traits.raise) {
          const rz = t.def.traits.raise;
          if (dist2(t.x, t.y, e.x, e.y) < (t.range) ** 2 || (t.ascended)) {
            const cur = this.summons.filter((s) => s.kind === 'wraith' && s.ownerUid === t.uid).length;
            if (cur < rz.max) { this._spawnSummon('wraith', t, e.x, e.y, rz.wraithDps); break; }
          }
        }
      }
      if (e.isBoss) { this.shake = Math.max(this.shake, 20); this.freeze = 0.25; this.goldFromBoss = (this.goldFromBoss || 0) + 1; }
      this._burst(e.x, e.y, RS.rarityColor('Common'), 6);
    }

    /* ---------------------------- towers ------------------------------ */
    _updateTowers(dt) {
      this._tmp = this._tmp || [];
      for (const t of this.towers) {
        if (t.charmT > 0) { t.charmT -= dt; continue; }
        if (t.disabledT > 0) { t.disabledT -= dt; continue; }
        // Boss Ground Stomp / Tower Slice. Adamantine armour never gets here.
        if (t.stunT > 0) { t.stunT -= dt; continue; }
        const TR = t.def.traits;
        if (TR.shout) this._shoutUpdate(t, dt);
        if (TR.rage) this._rageUpdate(t, dt);
        if (TR.bloodrush) this._bloodrushUpdate(t, dt);
        if (TR.fallenWrath) this._fallenWrathUpdate(t, dt);
        if (t.flashT > 0) t.flashT -= dt;
        // overheat gimmick
        if (this.map.env.gimmick === 'lava') {
          if (t.overheatT > 0) { t.overheatT -= dt; continue; }
        }
        // blocker upkeep
        if (t.blocker) this._blockerUpdate(t, dt);
        // builder
        if (t.def.traits.builder) this._builderUpdate(t, dt);
        // active abilities
        if (t.def.traits.active) {
          t.activeCd -= dt; if (t.activeCd <= 0) t.activeReady = true;
        }
        // strafe (wyvern rider): move along path
        if (t.def.traits.strafe) this._strafeUpdate(t, dt);
        // flame sweep
        if (t.def.traits.flameSweep) {
          t.abilityT += dt;
          const every = (t.def.traits.flameSweep.every) + (t._mods && t._mods.sweepEvery || 0);
          if (t.abilityT >= every) { t.abilityT = 0; this._flameSweep(t); }
        }
        // firing
        let rateMult = t.buff.fireRate;
        if (t.rage) rateMult *= 1 + t.rage;                                  // Rage: attack speed
        if (t.fwT > 0) rateMult *= 1 + t.def.traits.fallenWrath.fireRate;    // Fallen Wrath
        if (t.brT > 0) rateMult *= 1.35;                                     // Bloodrush
        t.cooldown -= dt * rateMult;
        if (t.muzzle > 0) t.muzzle -= dt;
        if (t.cooldown > 0) continue;
        const fired = this._towerFire(t);
        if (fired) {
          t.cooldown = 1 / (t.fireRate * rateMult);
          t.muzzle = 0.08; t.flashT = 0.08;
          if (this.map.env.gimmick === 'lava') {
            t.overheatShots++;
            if (t.overheatShots >= 10) { t.overheatShots = 0; t.overheatT = 3; }
          }
        }
      }
    }

    _effectiveRange(t) { return t.range * t.buff.range * this._envRangeMult(t); }

    _towerFire(t) {
      // Melee gladiators sweep a blade arc over the road instead of shooting.
      // Imperial Slash, Cleave and Black Sword Slash are the same mechanic with
      // different reach/arc — Black Sword Slash alone also reaches flyers.
      const tr = t.def.traits;
      if (tr.meleeSlash) return this._sweepAttack(t, tr.meleeSlash, false);
      if (tr.imperialSlash) return this._sweepAttack(t, tr.imperialSlash, false);
      if (tr.cleave) return this._sweepAttack(t, tr.cleave, false, 'cleaveRadiusT');
      if (tr.blackSlash) return this._sweepAttack(t, tr.blackSlash, true, 'blackRadiusT');
      // support/aura-only towers don't fire projectiles unless they have damage role
      const range = this._effectiveRange(t);
      // gather candidates in range
      this.grid.query(t.x, t.y, range, this._tmp);
      const cands = [];
      for (const e of this._tmp) {
        if (!e.alive) continue;
        if (dist2(t.x, t.y, e.x, e.y) > range * range) continue;
        // stealth: only targetable if revealed by a torch/reveal tower nearby OR tower has reveal
        if (e.def.traits.includes('Stealth') && !this._revealed(e)) continue;
        // canopy: black forest deep woods need scout
        cands.push(e);
      }
      if (cands.length === 0) return false;
      const target = C.selectTarget(t.targeting, cands, t);
      if (!target) return false;

      // spellCycle (archmage)
      if (t.def.traits.spellCycle) return this._castSpell(t, target, cands);
      // cone (wyrm)
      if (t.def.traits.cone) return this._coneAttack(t, target, cands);
      // chain (hedge wizard)
      if (t.def.traits.chain) return this._chainAttack(t, target, cands);
      // pierce line (ballista)
      if (t.def.traits.pierceLine) return this._pierceAttack(t, target);
      // summon-based (falconer) still fires normal shot + falcons handled in summon update
      // multishot branch
      const shots = (t._mods && t._mods.multishot) || 1;
      for (let s = 0; s < shots; s++) {
        const tgt = shots > 1 ? cands[Math.min(s, cands.length - 1)] : target;
        this._fireProjectile(t, tgt);
      }
      return true;
    }

    /* Gladiator slash: sweep a blade arc across the road, striking every
     * ground enemy inside it. The arc is aimed at whoever is nearest (so it
     * naturally tracks the path passing the tower) and is wide enough to catch
     * a cluster — this is the melee answer to a projectile volley. */
    _sweepAttack(t, ms, allowAir, radiusMod) {
      const bonus = (radiusMod && t._mods && t._mods[radiusMod]) || 0;
      const reach = allowAir
        ? Math.max(t.range, (ms.radiusT + bonus) * TILE) * t.buff.range
        : this._meleeReach(t) + bonus * TILE; // ground sweeps share the engage reach
      this.grid.query(t.x, t.y, reach, this._tmp);
      let best = null, bd = reach * reach;
      const inReach = [];
      for (const e of this._tmp) {
        if (!e.alive || (e.isFlying && !allowAir)) continue; // blades don't reach flyers unless the sweep is anti-air
        if (e.def.traits.includes('Stealth') && !this._revealed(e)) continue;
        const d = dist2(t.x, t.y, e.x, e.y);
        if (d > reach * reach) continue;
        inReach.push(e);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return false;
      const ang = Math.atan2(best.y - t.y, best.x - t.x);
      const half = ms.arc / 2;
      const dInfo = this._computeShotDamage(t, best);
      let hits = 0;
      const passes = ms.hits || 1;   // Black Sword Slash is a multi-hit arc
      for (const e of inReach) {
        let da = Math.abs(Math.atan2(e.y - t.y, e.x - t.x) - ang);
        if (da > Math.PI) da = Math.abs(da - RS.util.TAU);
        if (da > half) continue;
        for (let k = 0; k < passes; k++) this._applyHit(t, e, dInfo);
        hits++;
      }
      if (!hits) return false;
      if (t.def.traits.rage) this._addRage(t, hits);
      // visual: crescent sweep consumed by the renderer's _fx layer
      (this._fx = this._fx || []).push({ kind: 'slash', x: t.x, y: t.y, ang, half, reach,
        color: t.def.traits.blackSlash ? '#14121a' : RS.DMG_COLOR[t.def.damageType] || RS.DMG_COLOR.Melee, t: 0.18 });
      return true;
    }

    /* ------------------- Rage / Bloodrush (The Warlord) ---------------- */
    // Rage builds with every connected swing and decays when he stops hitting.
    _addRage(t, hits) {
      const r = t.def.traits.rage;
      const per = r.perHit + ((t._mods && t._mods.ragePerHit) || 0);
      const max = r.max + ((t._mods && t._mods.rageMax) || 0);
      t.rage = Math.min(max, (t.rage || 0) + per * hits);
      t.rageT = 0;
    }
    _rageUpdate(t, dt) {
      const r = t.def.traits.rage;
      t.rageT = (t.rageT || 0) + dt;
      if (t.ascended) return;                 // ascended: rage never decays
      if (t.rageT > r.decay) t.rage = Math.max(0, (t.rage || 0) - dt * 0.35);
    }
    // Bloodrush: a burst window that opens when wounded enemies crowd him.
    _bloodrushUpdate(t, dt) {
      const b = t.def.traits.bloodrush;
      t.brT = Math.max(0, (t.brT || 0) - dt);
      t.brCd = Math.max(0, (t.brCd || 0) - dt);
      if (t.brT > 0 || (t.brCd > 0 && !t.ascended)) return;
      const rad = this._meleeReach(t) + TILE;
      let low = 0;
      for (const e of this.enemies) {
        if (!e.alive || e.hp / e.maxHp > b.hpPct) continue;
        if (dist2(t.x, t.y, e.x, e.y) < rad * rad) low++;
      }
      if (low >= b.near) {
        t.brT = b.dur; t.brCd = b.cd;
        this.addFloater(t.x, t.y - 26, 'BLOODRUSH', RS.rarityColor('Mythic'));
        this.shake = Math.max(this.shake, 8);
        RS.bus.emit('tower-burst', { tower: t, kind: 'bloodrush' });
      }
    }

    /* ------------------ Fallen Wrath (The Fallen Knight) --------------- */
    // Auto-triggers the moment a boss walks into range. No input required.
    _fallenWrathUpdate(t, dt) {
      const w = t.def.traits.fallenWrath;
      t.fwT = Math.max(0, (t.fwT || 0) - dt);
      if (t.ascended) { t.fwT = Math.max(t.fwT, 1); return; }  // ascended: never ends
      if (t.fwT > 0) return;
      const range = this._effectiveRange(t);
      for (const e of this.enemies) {
        if (!e.alive || !e.isBoss) continue;
        if (dist2(t.x, t.y, e.x, e.y) > range * range) continue;
        t.fwT = w.dur;
        this.addFloater(t.x, t.y - 30, 'FALLEN WRATH', RS.rarityColor('Mythic+'));
        this.shake = Math.max(this.shake, 12);
        RS.bus.emit('tower-burst', { tower: t, kind: 'wrath' });
        break;
      }
    }

    /* ------------------- shout (The General / The Captain) ------------- */
    // A cooldown-gated burst window rather than a permanent aura: the value is
    // in lining fast-attack towers up inside the radius before it fires.
    _shoutUpdate(t, dt) {
      const sh = t.def.traits.shout;
      t.shoutT = Math.max(0, (t.shoutT || 0) - dt);
      if (t.ascended) { t.shoutT = Math.max(t.shoutT, 1); return; }  // ascended: permanent
      t.shoutCd = (t.shoutCd == null ? sh.every : t.shoutCd) - dt;
      if (t.shoutCd > 0) return;
      t.shoutCd = sh.every + ((t._mods && t._mods.shoutEvery) || 0);
      t.shoutT = sh.dur + ((t._mods && t._mods.shoutDur) || 0);
      this.addFloater(t.x, t.y - 26, t.def.id === 'captain' ? 'ALL HANDS!' : 'FORWARD!', RS.PALETTE.gold);
      RS.bus.emit('tower-shout', { tower: t });
    }

    // Damage dealt to a TOWER by a boss ability. Adamantine plate soaks 20%.
    bossAbilityDamageMult(t) {
      const ad = t.def.traits.adamantine;
      return ad ? 1 - (ad.bossDR || 0) : 1;
    }

    // Stun a tower for `dur` seconds. Adamantine armour ignores it entirely.
    stunTower(t, dur) {
      if (t.def.traits.adamantine) {
        this.addFloater(t.x, t.y - 24, 'IMMUNE', RS.PALETTE.frost);
        return false;
      }
      t.stunT = Math.max(t.stunT || 0, dur);
      RS.bus.emit('tower-stunned', { tower: t, dur });
      return true;
    }

    _revealed(e) {
      for (const t of this.towers) if (t.def.traits.reveal && dist2(t.x, t.y, e.x, e.y) < (t.def.traits.reveal * TILE) ** 2) return true;
      return false;
    }

    _computeShotDamage(t, target) {
      let dmg = t.damage * t.buff.dmg;
      if (t.rage) dmg *= 1 + t.rage * 0.35;          // Rage: heavier swings
      if (t.brT > 0) dmg *= 1 + t.def.traits.bloodrush.dmg;   // Bloodrush burst
      if (t.fwT > 0) dmg *= 1 + t.def.traits.fallenWrath.dmg; // Fallen Wrath
      const def = t.def;
      // bonus vs traits/family
      const bv = def.traits.bonusVs;
      if (bv) {
        let mult = bv.mult + ((t._mods && t._mods.bonusVsMult) || 0);
        if (bv.trait && target.def.traits.includes(bv.trait)) dmg *= mult;
        if (bv.traitAny && bv.traitAny.some((x) => target.def.family === x || target.def.traits.includes(x))) dmg *= mult;
      }
      // crit
      let crit = false;
      const critChance = RS.STATUS.critBase + ((t._mods && t._mods.critChance) || 0);
      if (Math.random() < critChance) crit = true;
      const critMultBonus = 1 + ((t._mods && t._mods.critMult) || 0);
      return { dmg, crit, critMultBonus };
    }

    _dmgContext(t) {
      return {
        frostDouble: this.map.env.gimmick === 'ice',
        holyTileBoost: t.onHoly,
        weatherMods: { [t.def.damageType]: (RS.WEATHER[this.weather].mods[t.def.damageType] || 0) },
      };
    }

    _applyHit(t, e, dmgInfo, typeOverride, extra) {
      const type = typeOverride || t.def.damageType;
      const ctx = this._dmgContext(t);
      const opts = {
        armorPen: (t.def.traits.armorPen || 0) + ((t._mods && t._mods.armorPen) || 0),
        ignoreResist: t.def.traits.ignoreResist,
        critical: dmgInfo.crit, critMultBonus: dmgInfo.critMultBonus,
        buffMult: this._weatherDmgMult(type),
        ownerUid: t.uid,
      };
      let final = C.resolveDamage(dmgInfo.dmg, type, e, opts, ctx);
      // shield: shielded blocks first N hits
      if (e.def.traits.includes('Shielded') && (e.shieldHits == null ? (e.shieldHits = e.def.abilities.shieldHits) : e.shieldHits) > 0) {
        if (t.def.traits.breakShield) { e.shieldHits = 0; }
        else { e.shieldHits--; this.addFloater(e.x, e.y - 10, 'block', RS.PALETTE.frost); return; }
      }
      this._damageEnemy(e, final, type, { ownerUid: t.uid, critical: dmgInfo.crit });
      // status application
      this._applyStatuses(t, e, extra);
    }

    // Every debuff duration a tower inflicts is scaled by the Ancient set bonus.
    _curseDur(d) { return d * ((this._setBonus && this._setBonus.curseDur) || 1); }

    _applyStatuses(t, e, extra) {
      const tr = t.def.traits;
      if (tr.burn) C.Status.burn(e, (tr.burn.dps) + ((t._mods && t._mods.burnDps) || 0), this._curseDur(tr.burn.dur));
      if ((t._mods && t._mods.addBurn)) C.Status.burn(e, t._mods.addBurn, this._curseDur(3));
      if (tr.stagger) C.Status.stagger(e, tr.stagger, this._curseDur(1.2));
      if (t.def.status && t.def.status.includes('Mark')) C.Status.mark(e, (tr.mark || 0.1) + ((t._mods && t._mods.mark) || 0));
      if (extra && extra.slow) C.Status.slow(e, extra.slow, this._curseDur(1.5));
      if (extra && extra.stun) C.Status.stun(e, this._curseDur(extra.stun));
    }

    _fireProjectile(t, target) {
      const dInfo = this._computeShotDamage(t, target);
      const p = this.projPool.alloc();
      p.x = t.x; p.y = t.y - 8; p.target = target; p.homing = true;
      p.speed = 340 + t.range * 0.2; p.type = t.def.damageType;
      p.dmg = dInfo; p.owner = t; p.splash = t.splash;
      p.color = RS.DMG_COLOR[t.def.damageType] || '#fff';
      p.life = 3; p.trail = t.def.rarity;
      // storm/wind scatter
      p.scatter = (this.map.env.gimmick === 'wind' || RS.WEATHER[this.weather].mods.scatter) ? (Math.random() - 0.5) * TILE : 0;
      return true;
    }

    _chainAttack(t, first, cands) {
      const ch = t.def.traits.chain;
      const count = ch.count + ((t._mods && t._mods.chainCount) || 0) + (RS.WEATHER[this.weather].mods.chainBonus || 0);
      const falloff = (t._mods && t._mods.chainFalloff != null) ? t._mods.chainFalloff : ch.falloff;
      let cur = first; const hit = new Set(); let mult = 1;
      const dInfo = this._computeShotDamage(t, first);
      for (let i = 0; i <= count; i++) {
        if (!cur || !cur.alive) break;
        hit.add(cur);
        this._applyHit(t, cur, { dmg: dInfo.dmg * mult, crit: dInfo.crit, critMultBonus: dInfo.critMultBonus });
        this._arc(t.x, t.y, cur.x, cur.y, '#9b6fd0');
        // next nearest not yet hit
        let next = null, bd = (2.5 * TILE) ** 2;
        for (const e of cands) if (e.alive && !hit.has(e)) { const d = dist2(cur.x, cur.y, e.x, e.y); if (d < bd) { bd = d; next = e; } }
        cur = next; mult *= falloff;
      }
      return true;
    }

    _pierceAttack(t, target) {
      const dInfo = this._computeShotDamage(t, target);
      // hit all enemies roughly along the line from tower to target
      const dx = target.x - t.x, dy = target.y - t.y; const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len, ny = dy / len;
      const width = (t.def.traits.pierceLine.width + ((t._mods && t._mods.lineWidth) || 0)) * TILE;
      const range = this._effectiveRange(t);
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const ex = e.x - t.x, ey = e.y - t.y;
        const proj = ex * nx + ey * ny;
        if (proj < 0 || proj > range + TILE) continue;
        const perp = Math.abs(ex * ny - ey * nx);
        if (perp <= width) this._applyHit(t, e, dInfo);
      }
      this._beam(t.x, t.y, t.x + nx * (range + TILE), t.y + ny * (range + TILE), '#cfd8e0');
      return true;
    }

    _coneAttack(t, target, cands) {
      const dInfo = this._computeShotDamage(t, target);
      const dx = target.x - t.x, dy = target.y - t.y; const ang = Math.atan2(dy, dx);
      const cone = t.def.traits.cone;
      // branch upgrades may widen/lengthen the cone (e.g. Greek Fire "Siphon Array")
      const half = (cone.angle + ((t._mods && t._mods.coneAngle) || 0)) / 2;
      const reach = (cone.lengthT + ((t._mods && t._mods.coneLength) || 0)) * TILE * t.buff.range;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = dist(t.x, t.y, e.x, e.y); if (d > reach) continue;
        const a = Math.atan2(e.y - t.y, e.x - t.x);
        let da = Math.abs(a - ang); if (da > Math.PI) da = Math.abs(da - RS.util.TAU);
        if (da <= half) this._applyHit(t, e, dInfo);
      }
      this._cone(t.x, t.y, ang, half, reach, '#e8722c');
      return true;
    }

    _castSpell(t, target, cands) {
      const cycle = t.def.traits.spellCycle;
      const idx = t.cycleIdx % cycle.length; t.cycleIdx++;
      const spell = cycle[idx];
      const dInfo = this._computeShotDamage(t, target);
      dInfo.dmg *= spell.mult;
      const splash = spell.splashT * TILE;
      if (splash > 0) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (dist2(target.x, target.y, e.x, e.y) <= splash * splash) {
            this._applyHit(t, e, { dmg: dInfo.dmg, crit: dInfo.crit, critMultBonus: dInfo.critMultBonus }, spell.type, spell.slow ? { slow: spell.slow } : null);
          }
        }
        this._burst(target.x, target.y, RS.DMG_COLOR[spell.type], 14);
      } else {
        this._applyHit(t, target, dInfo, spell.type);
        this._beam(t.x, t.y, target.x, target.y, RS.DMG_COLOR[spell.type]);
      }
      this.addFloater(t.x, t.y - 30, spell.name, RS.rarityColor('Legendary'));
      return true;
    }

    _flameSweep(t) {
      const mult = t.def.traits.flameSweep.mult;
      for (const e of this.enemies) if (e.alive) this._applyHit(t, e, { dmg: t.damage * t.buff.dmg * mult, crit: false, critMultBonus: 1 }, 'Fire');
      this.shake = Math.max(this.shake, 12);
      this._burst(t.x, t.y, '#e8722c', 30);
      this.addFloater(t.x, t.y - 30, 'FLAME SWEEP', RS.PALETTE.blood);
    }

    // The ONE reach value shared by both the engage/freeze logic below and the
    // slash attack in _meleeSlash. They used to be computed separately (a
    // 1.8-tile floor here vs. each tower's own radiusT there) and could drift
    // apart — Peasant Militia's slash radius (1.7 tiles) was slightly SMALLER
    // than this engage floor, so it could freeze an enemy 5px outside its own
    // attack range. With capacity 1, that one bad engagement permanently
    // jammed the tower for the rest of the match (it can't re-engage anyone
    // else while stuck holding an unreachable target) — the tower would look
    // completely broken from then on. Routing both through this one function
    // makes that divergence structurally impossible.
    _meleeReach(t) {
      const slashT = t.def.traits.meleeSlash ? t.def.traits.meleeSlash.radiusT : 0;
      return Math.max(t.range, slashT * TILE, 1.8 * TILE) * t.buff.range;
    }

    _blockerUpdate(t, dt) {
      const b = t.blocker;
      if (b.respawnT > 0) { b.respawnT -= dt; if (b.respawnT <= 0) b.hp = b.maxHp; return; }
      // release dead engagements
      b.engaged = b.engaged.filter((uid) => { const e = this.enemies.find((x) => x.uid === uid && x.alive); if (!e) return false; return e.engagedByUid === t.uid; });
      const reach = this._meleeReach(t);
      if (b.engaged.length < b.capacity) {
        this.grid.query(t.x, t.y, reach, this._tmp);
        for (const e of this._tmp) {
          if (b.engaged.length >= b.capacity) break;
          if (!e.alive || e.engagedByUid || e.isFlying) continue;
          if (dist2(t.x, t.y, e.x, e.y) > reach * reach) continue;
          if (e.def.abilities.destroyBlockers || e.def.abilities.destroyTowerOnGoal && false) { }
          e.engagedByUid = t.uid; if (!e.uid) e.uid = uid(); b.engaged.push(e.uid);
        }
      }
      // Take contact damage from whoever we're holding. Towers with a
      // meleeSlash trait deal their damage as discrete gladiator slashes in
      // _meleeSlash (driven by fireRate) rather than as a per-tick trickle,
      // so the damage is visible, sweeps an arc, and can catch several foes.
      const slashes = !!t.def.traits.meleeSlash;
      const dInfo = { dmg: t.damage * t.buff.dmg * dt * t.fireRate, crit: false, critMultBonus: 1 };
      for (const eu of b.engaged) {
        const e = this.enemies.find((x) => x.uid === eu && x.alive);
        if (!e) continue;
        if (!slashes) this._applyHit(t, e, dInfo);
        // contact damage to blocker
        let contact = 4 + e.def.bounty * 0.15;
        if (e.def.abilities.destroyBlockers) contact = b.maxHp; // siege beast / broodling
        if (!this._isInvuln(t)) b.hp -= contact * dt;
      }
      if (b.hp <= 0 && b.respawnT <= 0) {
        b.respawnT = t.ascended ? 0.5 : b.respawn;
        for (const eu of b.engaged) { const e = this.enemies.find((x) => x.uid === eu); if (e) e.engagedByUid = 0; }
        b.engaged = [];
        // resurrect trait
        if (t.def.traits.resurrect) { b.hp = b.maxHp * 0.5; b.respawnT = 0; }
      }
    }

    _builderUpdate(t, dt) {
      const cfg = t.def.traits.builder;
      const every = cfg.every + ((t._mods && t._mods.buildEvery) || 0);
      t.builderT -= dt;
      const cur = this.summons.filter((s) => s.kind === 'turret' && s.ownerUid === t.uid).length;
      const max = t.ascended ? 99 : cfg.max;
      if (t.builderT <= 0 && cur < max) {
        t.builderT = every;
        // find adjacent empty tile
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
          const tt = this._tile(t.c + dc, t.r + dr);
          if (tt && tt.kind !== 'path' && tt.kind !== 'unbuildable' && tt.kind !== 'water' && !tt.occupied) {
            const x = (t.c + dc) * TILE + TILE / 2, y = (t.r + dr) * TILE + TILE / 2;
            this._spawnSummon('turret', t, x, y, cfg.turretDps + ((t._mods && t._mods.turretDps) || 0), cfg.turretRangeT * TILE);
            break;
          }
        }
      }
    }

    _strafeUpdate(t, dt) {
      // move the wyvern along path 0
      const path = this.paths[0];
      t._sp = (t._sp || 0) + (t.def.traits.strafe.speed + ((t._mods && t._mods.moveSpeed) || 0)) * dt;
      if (t._sp > path.len) t._sp = 0;
      let p = t._sp, seg = path.segs[0];
      for (const s of path.segs) { if (p <= s.d) { seg = s; break; } p -= s.d; }
      const tt = seg.d > 0 ? p / seg.d : 0;
      t.x = seg.a.x + (seg.b.x - seg.a.x) * tt; t.y = seg.a.y + (seg.b.y - seg.a.y) * tt - 6;
    }

    /* ------------------ Legionary Muster (The Roman Emperor) ----------
     * Pressed, not automatic. Soldiers appear ON the road a short way ahead of
     * the Emperor and march INTO the horde. Their quality is the tower's
     * level: at L1 they are Peasant Levies with no armour at all; each upgrade
     * buys damage, health and a few points of armour. On top of that every
     * soldier hardens as it survives (armourRamp), so a fresh muster dies to
     * anything and a held line becomes genuinely hard to shift.
     * Reworked from a free auto-summon that made the Emperor far too strong. */
    legionStats(t) {
      const cfg = t.def.traits.legion;
      const lv = Math.max(0, t.level - 1);           // L1 = levy tier (lv 0)
      const mods = t._mods || {};
      return {
        levy: lv === 0,
        name: lv === 0 ? cfg.levy.name : 'Legionary',
        dps: cfg.levy.dps + cfg.perLevel.dps * lv + (mods.legionDps || 0),
        hp: cfg.levy.hp + cfg.perLevel.hp * lv,
        armor: cfg.levy.armor + cfg.perLevel.armor * lv + (mods.legionArmor || 0),
        max: cfg.max + (mods.legionMax || 0),
      };
    }

    musterLegion(t) {
      const cfg = t.def.traits.legion;
      const st = this.legionStats(t);
      const cur = this.summons.filter((s) => s.kind === 'legionary' && s.ownerUid === t.uid).length;
      let made = 0;
      for (let i = 0; i < cfg.perMuster && cur + made < st.max; i++) {
        // spawn ON the path, a little ahead of the Emperor, staggered
        const lane = 0, path = this.paths[lane];
        const base = this._nearestPathProgress(path, t.x, t.y);
        const prog = Math.max(0, Math.min(path.len - 1, base - 26 - i * 22));
        const pt = this._pathPoint(path, prog);
        const s = this._spawnSummon('legionary', t, pt.x, pt.y, st.dps, 1.6 * TILE);
        if (!s) break;
        s.hp = s.maxHp = st.hp;
        s.type = 'Melee';
        s.speed = cfg.speed;
        s.life = Infinity;
        s.lane = lane;
        s.prog = prog;                 // marches backward along the path
        s.armor = st.armor;            // base armour from tower level
        s.baseArmor = st.armor;
        s.levy = st.levy;
        s.age = 0;
        made++;
      }
      if (made) {
        this.addFloater(t.x, t.y - 28, st.levy ? 'LEVY MUSTERED' : 'LEGION MUSTERED', RS.rarityColor('Ancient'));
        RS.bus.emit('legion-muster', { tower: t, count: made, levy: st.levy });
      }
      return made;
    }

    // Progress (in path units) of the point on `path` closest to (x,y).
    _nearestPathProgress(path, x, y) {
      let acc = 0, best = 0, bd = Infinity;
      for (const sg of path.segs) {
        const dx = sg.b.x - sg.a.x, dy = sg.b.y - sg.a.y, L2 = dx * dx + dy * dy;
        let u = L2 ? ((x - sg.a.x) * dx + (y - sg.a.y) * dy) / L2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const px = sg.a.x + dx * u, py = sg.a.y + dy * u;
        const d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < bd) { bd = d; best = acc + sg.d * u; }
        acc += sg.d;
      }
      return best;
    }
    // World point at a given progress along a path.
    _pathPoint(path, prog) {
      let p = prog, seg = path.segs[0];
      for (const sg of path.segs) { if (p <= sg.d) { seg = sg; break; } p -= sg.d; }
      const u = seg.d > 0 ? p / seg.d : 0;
      return { x: seg.a.x + (seg.b.x - seg.a.x) * u, y: seg.a.y + (seg.b.y - seg.a.y) * u };
    }

    /* --------------------------- summons ------------------------------ */
    _spawnSummon(kind, owner, x, y, dps, range) {
      const made = {
        kind, ownerUid: owner.uid, x, y, hx: x, hy: y, dps: dps || 30,
        range: range || 3 * TILE, cooldown: 0, target: null, life: kind === 'wraith' ? 30 : Infinity,
        seek: owner.def.traits.summon ? owner.def.traits.summon.seek : null,
        speed: kind === 'falcon' ? 160 : (kind === 'wraith' ? 70 : 0), type: kind === 'wraith' ? 'Necrotic' : 'Siege',
        owner,
      };
      this.summons.push(made);
      return made;
    }

    _updateSummons(dt) {
      const live = [];
      for (const s of this.summons) {
        s.life -= dt; if (s.life <= 0) continue;
        s.cooldown -= dt;
        // acquire target
        if (!s.target || !s.target.alive) {
          let best = null, bd = s.range * s.range;
          for (const e of this.enemies) {
            if (!e.alive) continue;
            if (s.seek === 'Flying' && !e.isFlying) continue;
            const d = dist2(s.x, s.y, e.x, e.y);
            const rr = (s.kind === 'falcon' || s.kind === 'wraith') ? (18 * TILE) ** 2 : bd;
            if (d < rr && (!best || d < bd)) { bd = d; best = e; }
          }
          s.target = best;
        }
        // Legionaries march ALONG the road toward the horde, and only stop
        // when something is in front of them. Everything else homes directly.
        if (s.kind === 'legionary') {
          const path = this.paths[s.lane || 0];
          const contact = s.target && dist(s.x, s.y, s.target.x, s.target.y) < 26;
          if (!contact) {
            s.prog = Math.max(0, s.prog - s.speed * dt);   // walk back up the road
            const pt = this._pathPoint(path, s.prog);
            s.x = pt.x; s.y = pt.y;
          }
          // armour thickens the longer a soldier survives the line
          const ramp = s.owner && s.owner.def.traits.legion.armorRamp;
          if (ramp) { s.age += dt; s.armor = s.baseArmor + Math.min(ramp.cap, s.age * ramp.per); }
        }
        else if (s.speed > 0 && s.target) {
          const dx = s.target.x - s.x, dy = s.target.y - s.y, d = Math.hypot(dx, dy) || 1;
          if (d > 18) { s.x += (dx / d) * s.speed * dt; s.y += (dy / d) * s.speed * dt; }
        } else if (s.kind === 'turret') { s.x = s.hx; s.y = s.hy; }
        // Imperial Command: legionaries fighting near the Emperor hit harder.
        let cmd = 1;
        if (s.kind === 'legionary' && s.owner) {
          const ic = s.owner.def.traits.imperialCommand;
          if (ic) {
            const rad = (ic.radiusT + ((s.owner._mods && s.owner._mods.commandRadiusT) || 0)) * TILE;
            if (dist2(s.x, s.y, s.owner.x, s.owner.y) < rad * rad) cmd = 1 + ic.dmg + ((s.owner._mods && s.owner._mods.commandDmg) || 0);
          }
          // a legionary in contact with the horde takes losses and eventually
          // falls — armour (level + ramp) is what keeps a veteran standing
          if (s.target && dist(s.x, s.y, s.target.x, s.target.y) < 26) {
            const raw = s.target.def.bounty * 1.6 * dt;
            s.hp -= raw * (1 - C.armorReduction(s.armor || 0));
            if (s.hp <= 0) { this._burst(s.x, s.y, '#c9a25a', 5); continue; }
          }
        }
        // attack
        if (s.target && s.cooldown <= 0 && dist(s.x, s.y, s.target.x, s.target.y) < (s.speed > 0 ? 24 : s.range)) {
          s.cooldown = s.kind === 'turret' ? 0.6 : 0.4;
          const dmg = s.dps * (s.kind === 'turret' ? 0.6 : 0.4) * cmd;
          const ctx = {}; const opts = { ownerUid: s.ownerUid };
          const final = C.resolveDamage(dmg, s.type, s.target, opts, ctx);
          this._damageEnemy(s.target, final, s.type, { ownerUid: s.ownerUid });
        }
        live.push(s);
      }
      this.summons = live;
    }

    /* -------------------------- projectiles --------------------------- */
    _updateProjectiles(dt) {
      this.projPool.forEachActive((p) => {
        p.life -= dt; if (p.life <= 0) { this.projPool.release(p); return; }
        if (p.homing && p.target && p.target.alive) {
          const dx = p.target.x - p.x, dy = p.target.y - p.y + p.scatter, d = Math.hypot(dx, dy) || 1;
          p.x += (dx / d) * p.speed * dt; p.y += (dy / d) * p.speed * dt;
          if (d < 14) { this._projHit(p); this.projPool.release(p); }
        } else if (p.target && !p.target.alive) {
          // target died mid-flight: fizzle
          this.projPool.release(p);
        } else { this.projPool.release(p); }
      });
    }

    _projHit(p) {
      const t = p.owner;
      const target = p.target;
      if (p.splash > 0) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (dist2(target.x, target.y, e.x, e.y) <= p.splash * p.splash) this._applyHit(t, e, p.dmg);
        }
        this._burst(target.x, target.y, p.color, 8);
      } else {
        this._applyHit(t, target, p.dmg);
      }
    }

    /* ---------------------------- auras ------------------------------- */
    _recomputeAuras() {
      // reset
      for (const t of this.towers) { t.buff.dmg = 1; t.buff.range = 1; t.buff.fireRate = 1; t.buff.gold = 1; }
      this._globalGoldMult = 1; this._globalDmgToGold = 0;
      // enemy speed auras reset
      for (const e of this.enemies) e.buffSpeed = 1;

      // ---- SET BONUS: 2+ Ancient towers extend every debuff they inflict ----
      // Scales with rarity: each qualifying tower contributes in proportion to
      // its rarity rank, so the bonus grows with the tier of the set, not just
      // the head-count. Consumed by _curseDur() when statuses are applied.
      this._setBonus = { curseDur: 1, ancient: 0 };
      {
        const SB = RS.SET_BONUS && RS.SET_BONUS.Ancient;
        if (SB) {
          const anc = this.towers.filter((t) => t.def.rarity === 'Ancient');
          this._setBonus.ancient = anc.length;
          if (anc.length >= SB.min) {
            const base = RS.rarityRank('Ancient') || 1;
            let add = 0;
            for (let i = 1; i < anc.length; i++) add += SB.curseDur * ((RS.rarityRank(anc[i].def.rarity) || base) / base);
            this._setBonus.curseDur = 1 + add;
          }
        }
      }

      for (const src of this.towers) {
        const tr = src.def.traits;
        // shout: a live burst window buffing everything inside the radius
        if (tr.shout && src.shoutT > 0) {
          const radius = (tr.shout.radiusT + ((src._mods && src._mods.shoutRadiusT) || 0)) * TILE;
          const amt = tr.shout.fireRate + ((src._mods && src._mods.shoutFireRate) || 0);
          const all = src.ascended;   // ascended: the order reaches the whole field
          for (const t of this.towers) {
            if (t === src) continue;
            if (!all && dist2(src.x, src.y, t.x, t.y) >= radius * radius) continue;
            t.buff.fireRate *= 1 + amt;
            if (all && src.def.id === 'captain') t.buff.dmg *= 1.25;
          }
        }
        // support: range/attackspeed aura
        if (tr.support) {
          const radius = (tr.support.radiusT + ((src._mods && src._mods.auraRadiusT) || 0)) * TILE;
          for (const t of this.towers) if (t !== src && dist2(src.x, src.y, t.x, t.y) < radius * radius) {
            if (tr.support.rangeAura) t.buff.range *= 1 + tr.support.rangeAura + ((src._mods && src._mods.rangeAura) || 0);
            if (tr.support.attackSpeedAura) t.buff.fireRate *= 1 + tr.support.attackSpeedAura + ((src._mods && src._mods.atkSpeedAura) || 0);
          }
        }
        // paladin-style aura
        if (tr.aura) {
          const radius = (tr.aura.radiusT + ((src._mods && src._mods.auraRadiusT) || 0)) * TILE;
          for (const t of this.towers) if (dist2(src.x, src.y, t.x, t.y) < radius * radius) {
            t.buff.dmg *= 1 + tr.aura.dmg + ((src._mods && src._mods.auraDmg) || 0);
          }
        }
        // global auras
        if (tr.globalAura) {
          const g = tr.globalAura;
          for (const t of this.towers) {
            if (g.dmg) t.buff.dmg *= 1 + g.dmg + ((src._mods && src._mods.globalDmg) || 0);
            if (g.range) t.buff.range *= 1 + g.range;
          }
          if (g.gold) this._globalGoldMult *= 1 + g.gold;
          if (g.dmgToGold) this._globalDmgToGold += g.dmgToGold + ((src._mods && src._mods.dmgToGold) || 0);
        }
        if (tr.globalAura && tr.globalAura.gold == null && tr.globalAura.dmg) { /* covered above */ }
        // grand marshal specific gold
        if (tr.globalAura && tr.globalAura.gold) this._globalGoldMult *= 1; // already applied
        // frost slow field
        if (tr.slowField) {
          const radius = (tr.slowField.radiusT) * TILE;
          for (const e of this.enemies) if (e.alive && dist2(src.x, src.y, e.x, e.y) < radius * radius) {
            C.Status.slow(e, tr.slowField.slow + ((src._mods && src._mods.slow) || 0), 0.4);
            C.Status.vuln(e, tr.slowField.vuln + ((src._mods && src._mods.vuln) || 0), 0.4);
          }
        }
      }
      // Grand Marshal gold aura explicit
      for (const src of this.towers) {
        if (src.def.traits.globalAura && src.def.traits.globalAura.gold) {
          this._globalGoldMult *= 1 + src.def.traits.globalAura.gold + ((src._mods && src._mods.globalGold) || 0);
        }
      }
      // enemy buff auras (mercenary/warchief)
      for (const src of this.enemies) {
        if (!src.alive) continue;
        const ab = src.def.abilities;
        if (ab.buffAura) {
          const r2 = ab.buffAura.radius * ab.buffAura.radius;
          for (const e of this.enemies) if (e.alive && dist2(src.x, src.y, e.x, e.y) < r2) e.buffSpeed = Math.max(e.buffSpeed, 1 + ab.buffAura.speed);
        }
        if (ab.curseAura) {
          const r2 = ab.curseAura.radius * ab.curseAura.radius;
          for (const t of this.towers) if (dist2(src.x, src.y, t.x, t.y) < r2) t.buff.dmg *= 1 - ab.curseAura.dmg;
        }
        if (ab.suppressAbilities) {
          const r2 = ab.suppressAbilities.radius * ab.suppressAbilities.radius;
          for (const t of this.towers) if (dist2(src.x, src.y, t.x, t.y) < r2) t._suppressed = true; else t._suppressed = false;
        }
      }
    }

    /* ------------------------- active abilities ----------------------- */
    activateTower(t) {
      if (!t.def.traits.active || !t.activeReady) return false;
      const a = t.def.traits.active;
      t.activeReady = false;
      t.activeCd = a.cd + ((t._mods && t._mods.activeCd) || 0);
      if (a.kind === 'judgment') {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (e.isBoss) this._damageEnemy(e, e.maxHp * (a.bossPct + ((t._mods && t._mods.bossPct) || 0)), 'True', { ownerUid: t.uid });
          else this._damageEnemy(e, e.hp + 1, 'True', { ownerUid: t.uid });
        }
        this.freeze = 0.4; this.shake = Math.max(this.shake, 24);
        this.addFloater(this.goalPx.x, 60, 'JUDGMENT', RS.rarityColor('Mythic+'));
      } else if (a.kind === 'legion') {
        const n = this.musterLegion(t);
        if (t.ascended) { t.activeCd = 0; t.activeReady = true; }   // ascended: no cooldown
        if (!n) { t.activeReady = true; t.activeCd = 2; }           // nothing spawned: short retry
      } else if (a.kind === 'shieldSmash') {
        // Shockwave: slows ground AND air inside the radius.
        const rad = a.radiusT * TILE;
        for (const e of this.enemies) {
          if (!e.alive || dist2(t.x, t.y, e.x, e.y) > rad * rad) continue;
          C.Status.slow(e, a.slow, this._curseDur(a.dur));
          if (t.ascended) C.Status.stun(e, 1);
        }
        this.shake = Math.max(this.shake, 18);
        (this._fx = this._fx || []).push({ kind: 'shock', x: t.x, y: t.y, r: rad, t: 0.45, max: 0.45 });
        this.addFloater(t.x, t.y - 30, 'SHIELD SMASH', RS.rarityColor('Mythic+'));
        RS.bus.emit('shield-smash', { tower: t });
      } else if (a.kind === 'reforge') {
        this.pathShorten = Math.min(0.6, this.pathShorten + a.shorten);
        // add high-ground platforms near path
        let added = 0;
        for (let r = 0; r < this.rows && added < a.platforms; r++) for (let c = 0; c < this.cols && added < a.platforms; c++) {
          const tt = this._tile(c, r);
          if (tt.kind === 'buildable' && this.pathAdjacent.has(c + ',' + r)) { tt.kind = 'highground'; added++; }
        }
        this.shake = Math.max(this.shake, 16);
        this.addFloater(this.goalPx.x, 60, 'REFORGE THE FIELD', RS.rarityColor('Mythic+'));
      }
      return true;
    }

    /* ---------------------------- economy ----------------------------- */
    _completeWave() {
      this.waveActive = false;
      // interest
      const interest = Math.round(Math.min(RS.ECON.interestCap, Math.floor(this.gold * RS.ECON.interestRate)) * (this.diff.goldMult || 1));
      this.gold += interest;
      // wave clear copper
      const copper = Math.round((RS.ECON.copperPerWaveMin + Math.random() * (RS.ECON.copperPerWaveMax - RS.ECON.copperPerWaveMin)) * this.diff.copperMult);
      this.copperEarned += copper;
      // streak / no-leak bonus
      if (this.perfectWave) {
        this.streak = Math.min(this.streak + 1, 10);
        const bonus = Math.min(RS.ECON.noLeakStreakCap, this.streak * RS.ECON.noLeakStreakBonus);
        const g = Math.round(this.currentWave.budget * 0.05 * bonus);
        if (g > 0) { this.gold += g; this.addFloater(this.goalPx.x, 30, `Perfect! +${g}g`, RS.PALETTE.good); }
      }
      // adaptive: raise resist to top-killing type next wave (Hardcore)
      RS.bus.emit('wave-clear', { n: this.waveIndex, interest, copper });
      this.addFloater(this.goalPx.x, 44, `Wave ${this.waveIndex} cleared  +${interest}g`, RS.PALETTE.gold);
      this.shake = Math.max(this.shake, 4);
      if (this.waveIndex >= this.maxWaves) this._checkWin();
      else this.state = 'building';
    }

    _checkWin() {
      if (this.enemies.length === 0 && this.lives > 0 && this.waveIndex >= this.maxWaves) this._win();
    }

    _win() {
      if (this.state === 'won') return;
      this.state = 'won';
      // stars
      let stars = 1;
      const totalLeaks = this.diff.lives - this.lives;
      if (totalLeaks <= 0) stars = 2;
      if (totalLeaks <= 0 && this.towerCap <= RS.STAR3_TOWER_CAP) stars = 3;
      this.stars = stars;
      RS.bus.emit('match-won', this);
    }
    _lose() {
      if (this.state === 'lost' || this.state === 'won') return;
      this.state = 'lost';
      RS.bus.emit('match-lost', this);
    }

    /* ---------------------------- VFX --------------------------------- */
    addFloater(x, y, text, color, big) { this.floaters.push({ x, y, text: '' + text, color, t: 0.9, vy: -28, big: !!big, kind: 'text' }); }
    _updateFloaters(dt) {
      const live = [];
      for (const f of this.floaters) {
        f.t -= dt;
        if (f.kind === 'text') { f.y += f.vy * dt; f.vy *= 0.92; }
        if (f.kind === 'puddle') { for (const e of this.enemies) if (e.alive && dist2(e.x, e.y, f.x, f.y) < f.r * f.r) this._damageEnemy(e, f.dps * dt, 'Necrotic', { fromDot: true }); }
        if (f.t > 0) live.push(f);
      }
      this.floaters = live;
      // arcs/beams decay in their own pool-less lists
      if (this._fx) { for (const fx of this._fx) fx.t -= dt; this._fx = this._fx.filter((f) => f.t > 0); }
    }
    _burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const p = this.particlePool.alloc();
        const a = Math.random() * RS.util.TAU, sp = 40 + Math.random() * 120;
        p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.life = 0.4 + Math.random() * 0.3; p.max = p.life; p.color = color; p.r = 1 + Math.random() * 2;
      }
    }
    _arc(x1, y1, x2, y2, color) { (this._fx = this._fx || []).push({ kind: 'arc', x1, y1, x2, y2, color, t: 0.15 }); }
    _beam(x1, y1, x2, y2, color) { (this._fx = this._fx || []).push({ kind: 'beam', x1, y1, x2, y2, color, t: 0.12 }); }
    _cone(x, y, ang, half, reach, color) { (this._fx = this._fx || []).push({ kind: 'cone', x, y, ang, half, reach, color, t: 0.16 }); }

    updateParticles(dt) {
      this.particlePool.forEachActive((p) => { p.life -= dt; if (p.life <= 0) { this.particlePool.release(p); return; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.vx *= 0.94; });
    }
  }

  // Placement caps & star cap (referenced by match).
  // Ancient is 3, not 2, so the Ancient Pact set bonus ("2+ Ancient towers")
  // can actually scale past its own minimum — at a cap of 2 the bonus was a
  // binary on/off switch rather than a set you build toward.
  RS.PLACE_CAP = { Common: 8, Uncommon: 6, Rare: 5, Epic: 4, Legendary: 3, Ancient: 3, Mythic: 2, 'Mythic+': 1 };
  RS.STAR3_TOWER_CAP = 14;
  RS.Match = Match;
})();
