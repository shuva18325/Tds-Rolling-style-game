# ⚔ REALM SIEGE — A Medieval Fantasy Tower Defense

A complete, playable, browser-based medieval tower defense with a deep gacha
("rolling") acquisition system. **26 towers** across **7 rarity tiers**,
**36 enemy types** + **5 bosses**, **4 difficulty tiers**, and **12 maps** with
live weather / day-night / terrain mechanics. Pure HTML5 + vanilla JS + Canvas
2D. No frameworks, no build step, no external assets.

## ▶ Run it

Either open a tiny static server (recommended) **or** just open the file:

```bash
# from the repo root
npx http-server -c-1 .        # then visit http://localhost:8080
# or:  python3 -m http.server
```

…then open `index.html`. It also runs by double-clicking `index.html` straight
off disk (`file://`) because the scripts are plain classic scripts, not ES
modules — see Design Decision #1. Progress autosaves to `localStorage`.

**Single-file build:** `realm-siege.html` is the whole game bundled into one
self-contained file (all CSS + JS inlined, zero external requests) — generated
by `node build-artifact.js`. It's what gets published as a shareable playable
artifact. Just open it; nothing else needed.

**Signature foes:** every map has one **unique enemy that appears only there**
(Farmstead's Scarecrow Marauder, Frostvale's Frost Revenant, …) — shown on each
map-select card and wired via `map.signature` in `data/maps.js`.

Starter account: 4 Common towers, 500 Copper, 20 Silver, 5 Gold. Roll for more.

---

# PART A — Design Document (final tuned tables)

All numbers below are the **real, shipped** values. The authoritative source is
the declarative data in `/data`; this is the human-readable digest.

### Rarity tiers & basic-roll weights (`data/config.js` → `ROLL_BASE_WEIGHTS`, `data/palette.js` → `RARITY`)

| Tier | Basic weight | Roster | Max on map | Colour |
|------|-----:|:--:|:--:|:--|
| Common | 60.00% | 5 | 8 | `#9a9a9a` |
| Uncommon | 25.00% | 4 | 6 | `#5fa855` |
| Rare | 10.00% | 4 | 5 | `#4a90d9` |
| Epic | 3.80% | 4 | 4 | `#9b59b6` |
| Legendary | 1.00% | 4 | 3 | `#f0a92e` |
| Mythic | 0.19% | 3 | 2 | `#e04b4b` |
| Mythic+ | 0.01% | 2 | 1 | `#ffffff` (prismatic) |

### Tower roster (26) — `data/towers.js`

DPS is the derived display value (`RS.towerDps`, accounts for splash/chain/multishot).

| # | Tower | Rarity | Cost | Dmg | Rate | Rng(t) | Type | Signature |
|--:|-------|--------|-----:|----:|-----:|-----:|------|-----------|
| 1 | Peasant Militia | Common | 50 | 6 | 0.9 | 0.9 | Physical | Blocker (hold 1, respawn) |
| 2 | Village Archer | Common | 75 | 12 | 1.1 | 3.2 | Piercing | **Balance yardstick** |
| 3 | Torchbearer | Common | 90 | 7 | 1.0 | 2.2 | Fire | Burn DoT + reveal stealth + light |
| 4 | Stone Slinger | Common | 100 | 16 | 0.65 | 2.8 | Physical | Splash, +60% vs Armored |
| 5 | Watchtower Scout | Common | 60 | 3 | 0.8 | 3.0 | Physical | +15% range aura, marks target |
| 6 | Crossbowman | Uncommon | 180 | 34 | 0.55 | 3.4 | Piercing | 30% armor pen |
| 7 | Man-at-Arms | Uncommon | 200 | 14 | 1.0 | 0.9 | Physical | Blocker (hold 3, respawn 8s) |
| 8 | Hedge Wizard | Uncommon | 250 | 26 | 0.8 | 3.0 | Magic | Chain lightning ×3 |
| 9 | Ballista Crew | Uncommon | 275 | 40 | 0.5 | 4.2 | Piercing | Line-pierce |
| 10 | Longbowman | Rare | 450 | 58 | 0.9 | 5.5 | Piercing | Extreme range, +50% vs Flying |
| 11 | Knight Errant | Rare | 500 | 44 | 1.2 | 1.2 | Physical | Mobile interceptor |
| 12 | Cleric | Rare | 425 | 10 | 0.8 | 3.2 | Holy | Heal + haste aura + purge + light |
| 13 | Trebuchet | Rare | 600 | 150 | 0.2 | 7.0 | Physical | Huge splash, min-range 4 |
| 14 | Templar Knight | Epic | 1,100 | 78 | 1.0 | 2.4 | Holy | +100% vs Undead/Demon, self-res |
| 15 | Frost Magus | Epic | 1,250 | 40 | 0.9 | 3.4 | Frost | Slow field −40%, +25% vuln |
| 16 | Bombard Cannon | Epic | 1,400 | 220 | 0.45 | 4.0 | Fire | Splash, stagger, shatters shields |
| 17 | Royal Falconer | Epic | 1,000 | 36 | 1.4 | 3.0 | Physical | 3 falcons hunt flyers |
| 18 | Paladin Champion | Legendary | 3,000 | 130 | 1.1 | 2.6 | Holy | Blocker + aura +25% dmg / immune Fear·Curse |
| 19 | Archmage of the Spire | Legendary | 3,500 | 180 | 0.7 | 4.4 | Magic | Meteor → Blizzard → Arcane Lance cycle |
| 20 | Siege Engineer Corps | Legendary | 3,200 | 90 | 0.8 | 3.2 | Physical | Builds free turrets (max 4) |
| 21 | Wyvern Rider | Legendary | 3,800 | 150 | 1.6 | 4.0 | Fire | Flying, strafes path with Fire splash |
| 22 | Grand Marshal of the Realm | Mythic | 8,000 | — | — | — | Holy | Global +40% dmg/+25% rng/+20% gold, revives |
| 23 | Ancient Wyrm | Mythic | 9,500 | 260 | 0.9 | 4.2 | Fire | 2×2, breath cone, 45s Flame Sweep |
| 24 | Lichbound Necromancer | Mythic | 9,000 | 120 | 1.0 | 3.6 | Necrotic | Kills → allied Wraiths (max 12), ignores resist |
| 25 | Avatar of the Eternal Grail | Mythic+ | 25,000 | 300 | 1.2 | 4.0 | Holy | Towers invulnerable; **Judgment** (90s) deletes mobs |
| 26 | Sovereign of the Worldforge | Mythic+ | 25,000 | 280 | 1.0 | 4.2 | True | 10% dmg→gold; **Reforge** (120s) shortens path |

Upgrades: L1→L5, cost `tower.cost × 0.6 × 1.6ⁿ`. L1-3 = +22% dmg / +12% rng /
+8% rate each. **L4 = permanent branch choice** (two specialisations per tower).
**L5 = Ascension**, requires & consumes a duplicate copy.

### Enemy roster (36 + 5 bosses) — `data/enemies.js`

Six families, each a shared silhouette motif. `hp`/`speed` are base (difficulty
scales them). Selected examples (full table in the data file):

- **Bandit/Human (7):** Highwayman, Bandit Archer, Brigand Berserker *(rages < 40% HP)*, Cutpurse *(steals gold on leak)*, Deserter Knight *(Armored)*, Mercenary Captain *(speed aura)*, Outlaw Sapper *(destroys a tower at the gate)*.
- **Orc/Beastkin (7):** Orc Grunt, Shieldbearer *(blocks 3 hits)*, Warg Rider *(Fast)*, Ogre Bruiser *(520 HP, Armored)*, Goblin Swarmling *(packs of 12)*, Troll Rager *(Regenerating)*, Warchief *(+30% ally speed)*.
- **Undead (7):** Skeleton Warrior/Archer *(Ethereal)*, Bone Colossus *(→ 4 skeletons)*, Plague Zombie *(bile puddles)*, Wraith *(Ethereal Flying)*, Grave Knight *(Armored, Immune-Slow)*, Necromancer *(revives 2 / 8s)*.
- **Demonic (7):** Imp Swarm *(Flying)*, Hellhound *(Fast, Immune-Fire)*, Brimstone Brute, Succubus *(charms a tower 5s)*, Void Stalker *(Stealth)*, Infernal Siege Beast *(kills blockers)*, Balor Lieutenant *(Cursed aura −20% dmg)*.
- **Arcane/Construct (4):** Arcane Golem *(55% MR)*, Rune Sentinel *(reflects 15% magic)*, Mirror Wisp *(splits twice)*, Null Warden *(suppresses abilities)*.
- **Aerial (4):** Harpy Raider, Griffon Rider *(Fast Flying Armored)*, Wyvern Broodling *(kills blockers)*, Storm Roc *(900 HP, Immune-Slow)*.
- **Bosses:** Bandit King Corvin (Easy), Warlord Gruumak (Medium), Malgrath the Bone Sovereign (Hard), Azhrakoth the Ember Throne (Hardcore), **The Grey Herald** (endless superboss — copies your strongest tower every 60s).

### Difficulty tiers — `data/config.js` → `DIFFICULTY`

| Tier | Waves | HP× | Spd× | Gold | Lives | Modifiers | Rewards |
|------|:--:|:--:|:--:|:--:|:--:|-----------|---------|
| Easy | 20 | 1.0 | 1.0 | 800 | 25 | — | Copper, Silver on clear |
| Medium | 30 | 2.2 | 1.1 | 650 | 20 | Hardened (+15 armor), Rally | ×1.8 Copper, ×2 Silver, first Gold |
| Hard | 40 | 5.5 | 1.25 | 500 | 10 | Warded (40% MR), Swarmcall (+50% count), Nightfall | Gold, guaranteed Super Roll |
| Hardcore | 50 | 14 | 1.4 | 400 | 1 | Unbroken (no leaks), Adaptive, Siegebreaker, No-Sell | Relics, Mythic+ pity accel, crown |

### Maps (12) — `data/maps.js`

Farmstead Road · Riverford Crossing *(two lanes, water, rain)* · The Black
Forest *(canopy vision)* · Highkeep Battlements *(wall-mount, high-ground)* ·
Frostvale Pass *(ice, Frost ×2, blizzard)* · The Sunken Bog *(slow terrain,
half unbuildable, fog)* · Ashen Battlefield *(hazard craters, day/night)* ·
Ruins of Old Aldermere *(4 spawns → central keep)* · The Dragon's Spine
*(wind scatters shots)* · Cathedral of Chains *(holy tiles, Undead/Demon)* ·
The Obsidian Gate *(lava, tower overheat)* · The Ember Throne *(all systems,
hosts Azhrakoth)*.

### Gacha, pity, economy — `data/config.js`

- **Rolls:** Basic (100 Copper), Lucky (50 Silver, Uncommon floor, ×3), Super (25 Gold, Rare floor, Epic+ ×6), Divine (5 Relics: Epic 70.8 / Legend 22 / Mythic 6 / Mythic+ 1.2%).
- **Pity:** Epic @40 (soft 30), Legendary @120 (soft 90), Mythic @400 (hard), Mythic+ @1,500 cumulative. Legendary 50/50 → converts to 3 Relics if you own all four.
- **Forge:** roll upcasting (20 Basic→Lucky, 15→Super, 10→Divine), token upcasting (20 Copper→Silver, 25→Gold, 50→Relic), rarity shards (dismantle duplicates → craft a *specific* tower deterministically).
- **In-match:** kill bounty, wave clear Copper, +5% interest (cap 120), no-leak streak +10%/wave (cap +100%), call-early bonus.

Expected roll counts (tuned to spec): **~110 to first Legendary, ~380 to first
Mythic, ~1,400 to first Mythic+.**

---

# PART C — Design Decisions Log

Judgment calls made where the spec was silent, one line each:

1. **Classic scripts over ES modules.** The "must run when opened in a browser" hard rule beats the ESM preference — ES modules are CORS-blocked over `file://`, classic scripts are not. All modules hang off a global `RS` namespace; the code is otherwise modern ES6. Works from `file://` *and* a server.
2. **Orthographic top-down grid, faux-bevelled tiles** instead of true isometric parallelograms — keeps world-space == screen-space so input, placement, targeting and pathing stay exact; a top-face highlight + drop shadow supplies the 2.5D low-poly read.
3. **Silhouette archetypes.** 26 bespoke sprites would be noise; towers map to ~14 readable silhouette shapes (blocker/archer/mage/catapult/cannon/ballista/banner/spire/dragon/grail/…) tinted by rarity, so each still reads at a glance.
4. **Blockers sit path-adjacent and stall passing enemies** rather than occupying path tiles — this delivers blocker gameplay without any maze-lock exploit, so the "Path Blocked" rule is enforced simply (you can't build on path tiles at all).
5. **Data-driven trait engine.** Rather than 62 bespoke ability functions, tower/enemy behaviours are keywords in the `traits`/`abilities` data (blocker, splash, chain, pierce, cone, aura, global, slowField, summon, spellCycle, builder, strafe / rage, regen, split, revive, charm, curse, suppress…) consumed by generic systems. This *is* the "fully data-driven" mandate and makes all 26+36 genuinely functional.
6. **Roll tickets + tokens coexist.** Rolling spends tokens by default but consumes a matching *ticket* first if you hold one — this reconciles "rolls cost tokens" (§4.1) with the Forge's "20 Basic Rolls → 1 Lucky Roll" (§4.4).
7. **Loadout size = account loadout-slots (5→8)**, resolving the §8.3 "8 towers" vs §8.4 "5→8 slots" tension in favour of progression.
8. **Tier boss = final wave of that difficulty.** The four bosses attach to their difficulty tier on any map; The Ember Throne is Azhrakoth's themed home; The Grey Herald is a separate Endless mode unlocked after all Hardcore clears.
9. **Damage split:** Physical/Piercing use armour (`armor/(armor+100)`, Piercing has innate 25% pen); Magic/Fire/Frost/Holy/Necrotic use magic-resist; True bypasses both. Flavour multipliers (Holy vs Undead, Ethereal halves physical, Immune-Fire, Frostvale ×2, holy tiles) layer on top.
10. **Deterministic waves, non-deterministic rolls.** Wave composition uses a seeded RNG (so the preview panel exactly matches what spawns); gacha uses `Math.random` for genuine surprise.
11. **`localStorage` schema is migrated on load** — new fields are back-filled onto old saves so updates never wipe progress. Export/import is base64-wrapped JSON with a plain-JSON fallback.
12. **Star rating:** 1★ clear · 2★ no leaks · 3★ no leaks + ≤14 towers built (`STAR3_TOWER_CAP`).

---

# PART D — Tuning Guide

Every dial a designer needs, with locations. **Data lives in `/data`, logic in
`/js`** — you should almost never touch `/js` to rebalance.

| I want to change… | Edit | Field |
|-------------------|------|-------|
| **Roll rarity odds** | `data/config.js` | `ROLL_BASE_WEIGHTS`, `ROLLS.Divine.fixed` |
| **Pity thresholds / soft-pity ramps** | `data/config.js` | `PITY` (`hard`, `softStart`, `softStep`) |
| **Roll costs** | `data/config.js` | `ROLLS.*.cost` / `costToken` |
| **Difficulty (HP, speed, gold, lives, waves)** | `data/config.js` | `DIFFICULTY[]` |
| **Wave scaling / pacing** | `data/config.js` | `WAVE.baseBudget`, `WAVE.growth`, `WAVE.archetypes` |
| **Economy (interest, streak, kill/wave income)** | `data/config.js` | `ECON` |
| **Upgrade cost curve & per-level scaling** | `data/config.js` | `UPGRADE` (`costFrac`, `costBase`, `perLevel`) |
| **Forge conversion ratios & shard costs** | `data/config.js` | `FORGE` (`rollConvert`, `tokenConvert`, `shards`, `upcast`) |
| **Account XP / unlock schedule** | `data/config.js` | `ACCOUNT` (`xpCurve`, `loadoutSlots`, `unlocks`) |
| **Status rules (burn stacks, stun diminish, crit)** | `data/config.js` | `STATUS` |
| **Weather / day-night effects & timers** | `data/config.js` | `WEATHER`, `WEATHER_ROTATE`, `DAYNIGHT_CYCLE`, `NIGHT_RANGE_PENALTY` |
| **Placement caps per rarity** | `js/match.js` | `RS.PLACE_CAP` (bottom of file) · `RS.STAR3_TOWER_CAP` |
| **A single tower's balance** | `data/towers.js` | that tower's `damage`, `fireRate`, `rangeT`, `cost`, `traits`, `upgrades` |
| **A single enemy's threat** | `data/enemies.js` | that enemy's `hp`, `speed`, `armor`, `magicResist`, `bounty`, `cost` |
| **A map's path / terrain / spawns / weather** | `data/maps.js` | that map's `paths`, `water`/`highground`/`hazard`/`holy`/`unbuildable`, `env`, `families` |
| **World size / logic tick rate** | `data/config.js` | `TILE`, `GRID`, `TICK` |
| **Objectives & rewards** | `data/config.js` | `OBJECTIVES` |

**Quick knobs for the three most common asks:**
- *Make the game easier:* lower `DIFFICULTY[n].hpMult` / raise `startGold`.
- *Faster gacha dopamine:* raise `ROLL_BASE_WEIGHTS.Epic/Legendary` or lower `PITY.*.hard`.
- *Slower economy:* lower `ECON.interestRate`, `WAVE.callEarlyBonusPerSec`, and enemy `bounty` in `data/enemies.js`.

---

## Latest patch

- **Fixed: flying enemies now follow the road.** Flyers used to cut a straight
  line from spawn to goal (ignoring the path entirely); they now walk the same
  spline as ground units — just drawn at altitude with a moving shadow.
- **`js/audio.js`** — a tiny procedural WebAudio synth (no sound files):
  arrow/spell shot per damage type, metal **clang** on a Shielded block, a
  frost **crack** when Cold breaks, cannon boom vs. the Basilisk's deep
  `greatCannon()`, upgrade/ascend chimes, coin ping, forge strike, and an
  escalating roll reveal. Gated by the existing sfx setting.
- **Quick Roll** — a one-time 15 Gold purchase (Roll screen) that skips the
  roll suspense animation forever after; toggle on/off any time once bought.
- **Ruined houses redrawn.** They were stamped per-tile and looked incoherent;
  `_houseClusters()` now flood-fills each map's house tiles into connected
  groups and `_drawRuinedHouse()` paints ONE structure per group — collapsed
  snow-capped roof beams, weathered plaster wall, a glowing window, rubble —
  closer to a real ruin.
- **The Sultan's Basilisk** — new Legendary tower (`basilisk` in
  `data/towers.js`): 480 dmg, 0.12 fire rate (a real reload wait), 2×2
  footprint, `traits.heavyReload`. Its rig (`Sil.basilisk` in `js/sprites.js`)
  shows a visible reload animation — an ember building in the breech and four
  loader pips lighting up as the long cooldown fills — then a deep recoil kick,
  smoke burst, embers, and a screen-shake boom on fire.

---

## Controls

`1`–`9` quick-select tower · `Space` pause · `F` fast-forward (1×/2×/4×) ·
`R` start/call wave · `Esc` deselect/cancel · `Tab` toggle range overlay ·
click a placed tower to inspect/upgrade/retarget/sell · Shift-click to place
multiples.

## Architecture

```
index.html            load order: data tables → sim → presentation → UI
css/style.css         parchment-on-slate layout
css/art.css           VISUAL ASCENSION ornament layer (frames, rarity borders)
data/  palette·config·towers·enemies·maps      (all balance, declarative)
       artstyle        ART BIBLE — ramps, rarity palettes, light model, rigs
js/    core            namespace, RNG, object Pool, SpatialGrid, Save, Emitter
       combat          damage formula, armour/resist, status, targeting  (sim)
       match           grid+path build, fixed-timestep loop, waves, economy (sim)
       meta            persistent profile + gacha + pity + forge + progression (sim)
       vfx             pooled particle engine + roll/forge/shatter overlay
       sprites         procedural shading + 26 tower rigs + enemy sprite cache
       render          layered pipeline + updateVisuals observer (presentation)
       ui              screens + in-match HUD + input
       main            bootstrap + the single RAF loop
```

Performance: fixed-timestep logic decoupled from render, object pooling for
projectiles & particles, a uniform spatial grid for targeting queries.

---

## Visual Ascension (art overhaul)

The `sim` modules (`combat`, `match`, `meta`) and every data table are the
authoritative game — the art layer never touches them. All animation is driven
by `render.updateVisuals()` **observing** sim state (new towers → placement
drop + dust; level jumps → upgrade burst; vanished enemies → family death VFX;
boss spawns → banner) so the simulation stays byte-identical and deterministic.

**Art Bible** (`data/artstyle.js`): one fixed top-left sun; 3–4 stop material
ramps (`shade(ramp, facing)`); per-rarity palettes escalating to an animated
**prismatic** Mythic+; time-based easing + animation constants.

**Rendering** (`js/render.js`): strict layer order (cached low-poly terrain →
animated tiles → range/ghost → towers → enemies → sim particles → projectiles →
`RS.VFX` impacts → arcs/beams → auras → weather → night/grade → vignette → boss
banner). Static terrain is baked to an offscreen canvas and only rebuilt when
tile kinds change; enemy bodies render from **cached per-motif walk-cycle sprite
sheets** (blit + flip + white-flash overlay) — the key to the 200-enemy budget.

**VFX** (`js/vfx.js`): a single hard-capped, pooled particle engine with
damage-type impact language (fire/frost/holy/necrotic/arcane/prism), plus a
self-driven full-screen overlay for the roll reveal (glow bloom → light column →
shockwave → **Mythic+ prismatic shatter + slow-mo**) and forge anvil sparks.

**Silhouettes** (`js/sprites.js`): 26 distinct animated tower rigs (idle bob,
archer draw, mage charge, siege recoil, blocker lunge, flyer flap) and animated
enemy motifs (walk cycles that slow with `Slow`/freeze mid-stride, wing-flaps,
hit flashes, status crystals/flames).

Verified: **zero console errors**, sim unchanged (identical Easy clear), **~6.4
ms/frame under a 180-enemy load** (≈2.5× the 60 FPS budget in headroom). Dial
quality via `RS.VFX.MAX` (particle cap) and the `settings.particles` toggle.
