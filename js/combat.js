/* =========================================================================
 * REALM SIEGE — js/combat.js
 * Pure combat math: the damage formula (§8.5), armour/resist model,
 * type-effectiveness, status stacking rules, and target selection (§3.2).
 * No rendering, no state mutation beyond the enemy passed in.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const { clamp } = RS.util;

  // Armour-facing damage family. "Physical" is retired as a player-visible
  // label — Melee (blades) and Siege (stone/powder) replace it — but all three
  // resolve against armour identically, and legacy saves may still carry it.
  const PHYSICAL = { Physical: 1, Piercing: 1, Melee: 1, Siege: 1 };
  const MAGICAL = { Magic: 1, Fire: 1, Frost: 1, Holy: 1, Necrotic: 1 };

  // armorReduction = armor/(armor+100); diminishing, never 100%.
  function armorReduction(armor) {
    if (armor <= 0) return 0;
    return armor / (armor + 100);
  }

  /* Compute the type-effectiveness multiplier from enemy traits/family,
   * tower bonuses, weather and map tiles. Returns a scalar. */
  function typeMultiplier(type, enemy, ctx) {
    let m = 1;
    // Ethereal halves physical damage.
    if (enemy.def.traits.includes('Ethereal') && PHYSICAL[type]) m *= 0.5;
    // Immune-Fire: fire does almost nothing.
    if (enemy.def.traits.includes('Immune-Fire') && type === 'Fire') m *= 0.15;
    // Holy is strong vs Undead/Demon families (baseline flavour on top of tower bonuses).
    if (type === 'Holy' && (enemy.def.family === 'Undead' || enemy.def.family === 'Demon')) m *= 1.25;
    // Necrotic weak vs Arcane constructs.
    if (type === 'Necrotic' && enemy.def.family === 'Arcane') m *= 0.7;
    // Map tile effects passed via ctx.
    if (ctx) {
      if (ctx.frostDouble && type === 'Frost') m *= 2;            // Frostvale
      if (ctx.holyTileBoost && type === 'Holy') m *= 1.5;         // Cathedral holy tile under tower
      if (ctx.holyTileEnemy && MAGICAL[type] && (enemy.def.family === 'Undead')) m *= 2; // undead on holy tile
      if (ctx.weatherMods && ctx.weatherMods[type]) m *= 1 + ctx.weatherMods[type];
    }
    return m;
  }

  /* The core resolution. Returns the final damage number (pre-clamp).
   * opts: { armorPen, ignoreResist, critical, typeMult, buffMult } */
  function resolveDamage(amount, type, enemy, opts, ctx) {
    opts = opts || {};
    if (type === 'True' || opts.ignoreResist) {
      let d = amount;
      if (opts.buffMult) d *= opts.buffMult;
      if (opts.typeMult) d *= opts.typeMult;
      if (opts.critical) d *= RS.STATUS.critMult * (opts.critMultBonus || 1);
      return d;
    }
    let reduction = 0;
    if (PHYSICAL[type]) {
      let armor = enemy.armor;
      let pen = opts.armorPen || 0;
      if (type === 'Piercing') pen += 0.25; // Piercing inherently ignores some armour
      armor = armor * (1 - clamp(pen, 0, 1));
      reduction = armorReduction(armor);
    } else if (MAGICAL[type]) {
      reduction = clamp(enemy.magicResist, 0, 0.85);
    }
    let d = amount * (1 - reduction);
    const tm = (opts.typeMult != null ? opts.typeMult : 1) * typeMultiplier(type, enemy, ctx);
    d *= tm;
    if (opts.buffMult) d *= opts.buffMult;
    if (opts.critical) d *= RS.STATUS.critMult * (opts.critMultBonus || 1);
    // Frozen / marked vulnerability handled by caller via buffMult; keep here minimal.
    return Math.max(0, d);
  }

  /* ---------------------------- status effects ------------------------- */
  // Applied to enemy.status object. Slow keeps strongest, Burn stacks to 5,
  // Stun diminishes then grants immunity.
  const Status = {
    burn(enemy, dps, dur) {
      const s = enemy.status;
      s.burn = s.burn || { stacks: 0, dps: 0, t: 0 };
      s.burn.stacks = Math.min(RS.STATUS.burnMaxStacks, s.burn.stacks + 1);
      s.burn.dps = Math.max(s.burn.dps, dps);
      s.burn.t = Math.max(s.burn.t, dur);
    },
    slow(enemy, factor, dur) {
      if (enemy.def.traits.includes('Immune-Slow')) return;
      const s = enemy.status;
      // keep strongest slow only
      if (!s.slow || factor > s.slow.factor) s.slow = { factor, t: dur };
      else if (s.slow) s.slow.t = Math.max(s.slow.t, dur);
    },
    stun(enemy, dur) {
      const s = enemy.status;
      if (s.stunImmuneT > 0) return; // immune window
      s.stunCount = (s.stunCount || 0);
      const dim = RS.STATUS.stunDiminish[Math.min(s.stunCount, RS.STATUS.stunDiminish.length - 1)];
      s.stunCount++;
      if (dim <= 0) { s.stunImmuneT = RS.STATUS.stunImmuneDur; return; }
      s.stun = { t: Math.max(s.stun ? s.stun.t : 0, dur * dim) };
    },
    vuln(enemy, amount, dur) {
      const s = enemy.status;
      if (!s.vuln || amount > s.vuln.amount) s.vuln = { amount, t: dur };
    },
    mark(enemy, amount) {
      enemy.status.mark = Math.max(enemy.status.mark || 0, amount);
    },
    stagger(enemy, factor, dur) {
      const s = enemy.status;
      if (!s.stagger || factor > s.stagger.factor) s.stagger = { factor, t: dur };
    },
    // Advance timers each tick; returns burn damage to apply this tick.
    tick(enemy, dt) {
      const s = enemy.status;
      let burnDmg = 0;
      if (s.burn) {
        burnDmg = s.burn.dps * s.burn.stacks * dt;
        s.burn.t -= dt;
        if (s.burn.t <= 0) s.burn = null;
      }
      if (s.slow) { s.slow.t -= dt; if (s.slow.t <= 0) s.slow = null; }
      if (s.stun) { s.stun.t -= dt; if (s.stun.t <= 0) s.stun = null; }
      if (s.vuln) { s.vuln.t -= dt; if (s.vuln.t <= 0) s.vuln = null; }
      if (s.stagger) { s.stagger.t -= dt; if (s.stagger.t <= 0) s.stagger = null; }
      if (s.stunImmuneT > 0) { s.stunImmuneT -= dt; }
      if (s.mark && !s._marked) { /* mark persists until death */ }
      return burnDmg;
    },
    // Effective speed factor from slow/stun/stagger.
    speedFactor(enemy) {
      const s = enemy.status;
      if (s.stun && s.stun.t > 0) return 0;
      let f = 1;
      if (s.slow) f *= 1 - s.slow.factor;
      if (s.stagger) f *= 1 - s.stagger.factor;
      return f;
    },
    // Incoming-damage multiplier from vuln (frozen +25%) and mark (+10%).
    vulnMult(enemy) {
      let m = 1;
      const s = enemy.status;
      if (s.vuln) m *= 1 + s.vuln.amount;
      if (s.mark) m *= 1 + s.mark;
      return m;
    },
  };

  /* --------------------------- target selection ------------------------ */
  // candidates: array of live enemies already filtered by range + eligibility.
  function selectTarget(mode, candidates, tower) {
    if (candidates.length === 0) return null;
    let best = candidates[0];
    switch (mode) {
      case 'First':   for (const e of candidates) if (e.progress > best.progress) best = e; break;
      case 'Last':    for (const e of candidates) if (e.progress < best.progress) best = e; break;
      case 'Strongest': for (const e of candidates) if (e.hp > best.hp) best = e; break;
      case 'Weakest':   for (const e of candidates) if (e.hp < best.hp) best = e; break;
      case 'Closest': {
        let bd = RS.util.dist2(tower.x, tower.y, best.x, best.y);
        for (const e of candidates) {
          const d = RS.util.dist2(tower.x, tower.y, e.x, e.y);
          if (d < bd) { bd = d; best = e; }
        }
        break;
      }
      case 'Most-Clustered': {
        let bc = -1;
        const R2 = 72 * 72;
        for (const e of candidates) {
          let c = 0;
          for (const o of candidates) if (RS.util.dist2(e.x, e.y, o.x, o.y) < R2) c++;
          if (c > bc) { bc = c; best = e; }
        }
        break;
      }
      default: break;
    }
    return best;
  }

  RS.combat = { resolveDamage, typeMultiplier, armorReduction, Status, selectTarget };
})();
