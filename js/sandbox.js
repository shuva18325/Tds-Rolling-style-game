/* =========================================================================
 * REALM SIEGE — js/sandbox.js
 * Sandbox Mode + the secret developer Command Panel.
 *
 * Sandbox is a THROWAWAY profile. On entry the real profile is snapshotted and
 * swapped out for a fully-stocked copy; on exit the snapshot is restored and
 * written back to disk. Nothing that happens in sandbox can touch the real
 * account, the Champions' Ladder or map completions — the snapshot is the only
 * thing that is ever saved afterwards.
 *
 * The Command Panel unlocks ONLY for the username ILOVECODING, and its commands
 * refuse to run outside sandbox, so a tester account can never bleed into a
 * scored run.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});

  const SECRET_NAME = 'ILOVECODING';

  const Sandbox = {
    active: false,
    _snapshot: null,
    _panel: null,
    _history: [],

    // Only the secret username sees the command panel at all.
    isDev() {
      const p = RS.Meta && RS.Meta.p && RS.Meta.p.profile;
      return !!(p && (p.name || '').trim().toUpperCase() === SECRET_NAME);
    },

    /* ------------------------------ entry ----------------------------- */
    enter() {
      if (this.active) return;
      // Deep-copy the live profile so nothing in sandbox can reach it.
      this._snapshot = JSON.parse(JSON.stringify(RS.Meta.p));
      this.active = true;
      // A stocked playground profile: every tower, every currency, everything
      // unlocked. This copy is discarded wholesale on exit.
      const p = RS.Meta.p;
      p.tokens = { copper: 999999, silver: 99999, gold: 99999, relic: 9999 };
      p.rolls = { Basic: 999, Lucky: 999, Super: 999, Divine: 999 };
      RS.TOWERS.forEach((t) => { p.roster[t.id] = Math.max(p.roster[t.id] || 0, 2); });
      p.account = { level: 50, xp: 0 };
      RS.MAPS.forEach((m) => { p.unlocked[m.id] = 4; });
      p.settings.quickRollUnlocked = true;
      RS.bus.emit('sandbox-changed', true);
    },

    // Restore the real profile and persist it. Sandbox progress evaporates.
    exit() {
      if (!this.active) return;
      RS.Meta.p = this._snapshot;
      this._snapshot = null;
      this.active = false;
      RS.Meta._recomputeBonuses();
      RS.Meta.save();
      this.hidePanel();
      RS.bus.emit('sandbox-changed', false);
    },

    /* ------------------------------ commands -------------------------- */
    // Every command is sandbox-only. Returns { ok, msg }.
    run(line) {
      const raw = (line || '').trim();
      if (!raw) return { ok: false, msg: '' };
      this._history.push(raw);
      if (!this.active) return { ok: false, msg: 'Commands only work in Sandbox Mode.' };
      const parts = raw.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const arg = parts[1], arg2 = parts[2];
      const m = RS.UI && RS.UI.match;

      switch (cmd) {
        case '/give': {
          const n = Math.max(1, parseInt(arg, 10) || 10000);
          if (m) { m.gold += n; return { ok: true, msg: `+${n.toLocaleString()} match gold` }; }
          RS.Meta.p.tokens.copper += n;
          return { ok: true, msg: `+${n.toLocaleString()} copper (not in a match)` };
        }
        case '/spawn': {
          if (!m) return { ok: false, msg: '/spawn needs an active match' };
          const id = arg || 'orcgrunt';
          if (!RS.ENEMY_BY_ID[id]) return { ok: false, msg: `Unknown enemy "${id}"` };
          const n = Math.max(1, Math.min(60, parseInt(arg2, 10) || 1));
          for (let i = 0; i < n; i++) m._spawnEnemy(id, 0, Math.max(0, 60 - i * 12));
          return { ok: true, msg: `Spawned ${n}x ${RS.ENEMY_BY_ID[id].name}` };
        }
        case '/rankup': {
          if (!m) return { ok: false, msg: '/rankup needs an active match' };
          const sel = RS.UI.selectedTower;
          const targets = sel ? [sel] : m.towers;
          if (!targets.length) return { ok: false, msg: 'No towers on the field' };
          let n = 0;
          for (const t of targets) {
            const want = Math.max(1, Math.min(RS.UPGRADE.maxLevel, parseInt(arg, 10) || RS.UPGRADE.maxLevel));
            let guard = 0;
            while (t.level < want && guard++ < 10) {
              m.gold += m.upgradeCost(t);           // sandbox: upgrades are free
              if (!m.upgrade(t, 0)) break;
              n++;
            }
          }
          return { ok: true, msg: `Ranked up ${sel ? 'selected tower' : m.towers.length + ' towers'} (${n} levels)` };
        }
        case '/wave': {
          if (!m) return { ok: false, msg: '/wave needs an active match' };
          const to = parseInt(arg, 10);
          if (isNaN(to)) {
            m.waveIndex = Math.min(m.maxWaves - 1, m.waveIndex + 1);
            return { ok: true, msg: `Jumped to wave ${m.waveIndex + 1}` };
          }
          m.waveIndex = Math.max(0, Math.min(m.maxWaves, to - 1));
          return { ok: true, msg: `Jumped to wave ${m.waveIndex + 1}` };
        }
        case '/help':
          return { ok: true, msg: '/give [n] · /spawn [enemyId] [n] · /rankup [level] · /wave [n]' };
        default:
          return { ok: false, msg: `Unknown command "${cmd}". Try /help` };
      }
    },

    /* ------------------------------ panel ----------------------------- */
    togglePanel() { this._panel ? this.hidePanel() : this.showPanel(); },

    showPanel() {
      if (this._panel || !this.isDev()) return;
      const el = document.createElement('div');
      el.className = 'cmdpanel';
      el.innerHTML = `
        <div class="cmd-head">
          <b>⌘ Command Panel</b>
          <span class="cmd-mode ${this.active ? 'on' : ''}">${this.active ? 'SANDBOX' : 'NORMAL — commands disabled'}</span>
          <button class="cmd-x" id="cmdClose">✕</button>
        </div>
        <div class="cmd-log" id="cmdLog"><div class="cmd-line dim">Type /help for the command list.</div></div>
        <input class="cmd-in" id="cmdIn" placeholder="/give 50000" spellcheck="false" autocomplete="off">`;
      document.body.appendChild(el);
      this._panel = el;
      const log = el.querySelector('#cmdLog');
      const input = el.querySelector('#cmdIn');
      el.querySelector('#cmdClose').onclick = () => this.hidePanel();
      const push = (txt, cls) => {
        const d = document.createElement('div');
        d.className = 'cmd-line ' + (cls || '');
        d.textContent = txt;
        log.appendChild(d); log.scrollTop = log.scrollHeight;
      };
      let hi = this._history.length;
      input.onkeydown = (e) => {
        e.stopPropagation();                    // don't leak into the match hotkeys
        // Swallow the toggle key so it never types itself into the box.
        if (e.key === '`' || e.key === '~') { e.preventDefault(); this.hidePanel(); return; }
        if (e.key === 'Escape') { e.preventDefault(); this.hidePanel(); return; }
        if (e.key === 'Enter') {
          const v = input.value; input.value = '';
          if (!v.trim()) return;
          push('> ' + v, 'you');
          const r = this.run(v);
          if (r.msg) push(r.msg, r.ok ? 'ok' : 'err');
          hi = this._history.length;
          if (RS.UI && RS.UI.match) RS.UI.refreshHud();
        } else if (e.key === 'ArrowUp') {
          if (hi > 0) { hi--; input.value = this._history[hi] || ''; }
          e.preventDefault();
        } else if (e.key === 'ArrowDown') {
          if (hi < this._history.length - 1) { hi++; input.value = this._history[hi] || ''; }
          else { hi = this._history.length; input.value = ''; }
          e.preventDefault();
        }
      };
      input.focus();
    },

    hidePanel() { if (this._panel) { this._panel.remove(); this._panel = null; } },
  };

  RS.Sandbox = Sandbox;
})();
