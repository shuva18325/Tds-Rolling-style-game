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

    // The secret username can always see the panel (even outside sandbox, to
    // poke around); being IN sandbox unlocks it too, regardless of your real
    // name — sandbox itself is the safety boundary (commands refuse to run
    // outside it below), so gating the panel further on top of that was just
    // friction for the one mode where testing is the entire point.
    isDev() {
      const p = RS.Meta && RS.Meta.p && RS.Meta.p.profile;
      return !!(p && (p.name || '').trim().toUpperCase() === SECRET_NAME);
    },
    canOpenPanel() { return this.active || this.isDev(); },

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
    // One spec table feeds the autocomplete AND /help, so a command can never
    // exist in one and be missing from the other. `args` describes each
    // positional slot; `values` yields live completions for that slot.
    SPEC: [
      { cmd: '/give', usage: '/give [amount]', desc: 'Add gold (or copper outside a match)',
        args: [{ name: 'amount', values: () => ['1000', '10000', '100000', '1000000'] }] },
      { cmd: '/spawn', usage: '/spawn <enemy> [count]', desc: 'Spawn enemies on the path',
        args: [{ name: 'enemy', values: () => RS.ENEMIES.filter((e) => !e.hidden).map((e) => e.id) },
               { name: 'count', values: () => ['1', '5', '10', '25'] }] },
      { cmd: '/spawntower', usage: '/spawntower <tower> [col] [row]', desc: 'Place any tower on the field',
        args: [{ name: 'tower', values: () => RS.TOWERS.map((t) => t.id) },
               { name: 'col', values: () => [] }, { name: 'row', values: () => [] }] },
      { cmd: '/clear', usage: '/clear <what>', desc: 'Remove enemies, towers or both',
        args: [{ name: 'what', values: () => ['enemies', 'towers', 'all'] }] },
      { cmd: '/rankup', usage: '/rankup [level]', desc: 'Upgrade selected tower (or all) for free',
        args: [{ name: 'level', values: () => ['2', '3', '4', '5'] }] },
      { cmd: '/wave', usage: '/wave [n]', desc: 'Jump to a wave number',
        args: [{ name: 'n', values: () => ['5', '10', '20', '30'] }] },
      { cmd: '/help', usage: '/help', desc: 'List every command', args: [] },
    ],

    // Minecraft-style completions for the text currently in the box.
    // Returns { items:[{value,label,hint}], replaceFrom } — replaceFrom is the
    // index in `raw` where the accepted completion should be spliced in.
    complete(raw) {
      const txt = raw || '';
      const endsSpace = /\s$/.test(txt);
      const parts = txt.trim().length ? txt.trim().split(/\s+/) : [];
      // still typing the command word itself
      if (parts.length === 0 || (parts.length === 1 && !endsSpace)) {
        const q = (parts[0] || '').toLowerCase();
        const items = this.SPEC
          .filter((sp) => sp.cmd.startsWith(q) || !q)
          .map((sp) => ({ value: sp.cmd, label: sp.cmd, hint: sp.desc }));
        return { items, replaceFrom: 0 };
      }
      const sp = this.SPEC.find((x) => x.cmd === parts[0].toLowerCase());
      if (!sp) return { items: [], replaceFrom: 0 };
      // which positional slot are we on?
      const idx = endsSpace ? parts.length - 1 : parts.length - 2;
      const slot = sp.args[idx];
      if (!slot) return { items: [], replaceFrom: 0 };
      const q = endsSpace ? '' : (parts[parts.length - 1] || '').toLowerCase();
      const vals = (slot.values() || []).filter((v) => v.toLowerCase().indexOf(q) === 0);
      const items = vals.slice(0, 40).map((v) => ({ value: v, label: v, hint: slot.name }));
      const replaceFrom = endsSpace ? txt.length : txt.lastIndexOf(parts[parts.length - 1]);
      return { items, replaceFrom };
    },

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
        case '/spawntower': {
          if (!m) return { ok: false, msg: '/spawntower needs an active match' };
          const def = RS.TOWER_BY_ID[arg];
          if (!def) return { ok: false, msg: `Unknown tower "${arg || ''}". Try /help` };
          m.gold = Math.max(m.gold, def.cost);   // sandbox: never blocked on gold — bump
          let c = parseInt(arg2, 10), rr = parseInt(parts[3], 10);         // BEFORE searching, or the
          if (isNaN(c) || isNaN(rr)) {                                    // gold check inside canPlace()
            const spot = this._findBuildSpot(m, def);                     // fails every candidate tile
            if (!spot) return { ok: false, msg: `No open tile fits ${def.name} (${def.placement})` };
            c = spot.c; rr = spot.r;
          }
          const res = m.place(def, c, rr);
          return res.ok ? { ok: true, msg: `Placed ${def.name} at (${c},${rr})` } : { ok: false, msg: res.reason };
        }
        case '/clear': {
          if (!m) return { ok: false, msg: '/clear needs an active match' };
          const what = (arg || 'all').toLowerCase();
          let n = 0;
          if (what === 'enemies' || what === 'all') {
            n += m.enemies.length; m.enemies.length = 0; m.spawnQueue.length = 0;
          }
          if (what === 'towers' || what === 'all') {
            const list = m.towers.slice(); list.forEach((t) => m._removeTower(t)); n += list.length;
          }
          if (!['enemies', 'towers', 'all'].includes(what)) return { ok: false, msg: 'Usage: /clear enemies|towers|all' };
          return { ok: true, msg: `Cleared ${what} (${n} removed)` };
        }
        case '/help':
          return { ok: true, msg: this.SPEC.map((sp) => sp.usage + '  — ' + sp.desc).join('\n') };
        default:
          return { ok: false, msg: `Unknown command "${cmd}". Try /help` };
      }
    },

    // First open tile a tower's placement rule allows, preferring path-
    // adjacent tiles for anything that needs them so the search doesn't have
    // to scan the whole board for the common case.
    _findBuildSpot(m, def) {
      const wantsPath = def.placement === 'Path-adjacent-only';
      const wantsHigh = def.placement === 'High-ground-only';
      for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
        if (wantsPath && !m.pathAdjacent.has(c + ',' + r)) continue;
        if (wantsHigh && m.tileKind(c, r) !== 'highground') continue;
        if (m.canPlace(def, c, r).ok) return { c, r };
      }
      return null;
    },

    // Reusable "decrypting" text reveal: target characters lock in left to
    // right while the rest flicker between 0/1, used for the sandbox identity
    // display. Pure DOM/text — no game state touched.
    binaryDecode(el, target, ms) {
      if (!el || el._decoding) return;
      el._decoding = true;
      const dur = ms || 750;
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const revealed = Math.floor(t * target.length);
        let out = '';
        for (let i = 0; i < target.length; i++) out += i < revealed ? target[i] : (Math.random() < 0.5 ? '0' : '1');
        el.textContent = out;
        if (t < 1) requestAnimationFrame(step);
        else { el.textContent = target; el._decoding = false; }
      };
      requestAnimationFrame(step);
    },

    /* ------------------------------ panel ----------------------------- */
    togglePanel() { this._panel ? this.hidePanel() : this.showPanel(); },

    showPanel() {
      if (this._panel || !this.canOpenPanel()) return;
      const el = document.createElement('div');
      el.className = 'cmdpanel';
      el.innerHTML = `
        <canvas class="cmd-rain" id="cmdRain"></canvas>
        <div class="cmd-head">
          <b>⌘ ADMIN CONSOLE</b>
          <span class="cmd-mode ${this.active ? 'on' : ''}">${this.active ? '● SANDBOX' : '○ NORMAL — commands disabled'}</span>
          <button class="cmd-x" id="cmdClose">✕</button>
        </div>
        <div class="cmd-log" id="cmdLog"><div class="cmd-line dim">root@sandbox:~$ type / to see every command</div></div>
        <div class="cmd-ac" id="cmdAc" hidden></div>
        <div class="cmd-inrow"><span class="cmd-prompt">&gt;</span><input class="cmd-in" id="cmdIn" placeholder="type / for commands" spellcheck="false" autocomplete="off"></div>`;
      document.body.appendChild(el);
      this._panel = el;
      const log = el.querySelector('#cmdLog');
      const input = el.querySelector('#cmdIn');
      el.querySelector('#cmdClose').onclick = () => this.hidePanel();
      this._startRain(el.querySelector('#cmdRain'));
      const push = (txt, cls) => {
        const d = document.createElement('div');
        d.className = 'cmd-line ' + (cls || '');
        d.textContent = txt;
        log.appendChild(d); log.scrollTop = log.scrollHeight;
      };
      const ac = el.querySelector('#cmdAc');
      // ---- Minecraft-style completion list -------------------------------
      let acItems = [], acSel = 0, acFrom = 0;
      const renderAc = () => {
        const r = this.complete(input.value);
        acItems = r.items; acFrom = r.replaceFrom;
        // only offer suggestions once a slash is in play, like the game does
        if (!input.value.startsWith('/') || !acItems.length) { ac.hidden = true; ac.innerHTML = ''; return; }
        if (acSel >= acItems.length) acSel = acItems.length - 1;
        if (acSel < 0) acSel = 0;
        ac.hidden = false;
        ac.innerHTML = acItems.map((it, i) =>
          `<div class="cmd-ac-row ${i === acSel ? 'sel' : ''}" data-i="${i}">
             <span class="cmd-ac-v">${it.label}</span><span class="cmd-ac-h">${it.hint || ''}</span>
           </div>`).join('');
        const selEl = ac.querySelector('.cmd-ac-row.sel');
        if (selEl) selEl.scrollIntoView({ block: 'nearest' });
        ac.querySelectorAll('.cmd-ac-row').forEach((row) => {
          row.onmousedown = (ev) => { ev.preventDefault(); acSel = +row.dataset.i; accept(); };
        });
      };
      const accept = () => {
        const it = acItems[acSel]; if (!it) return;
        input.value = input.value.slice(0, acFrom) + it.value + ' ';
        acSel = 0; renderAc(); input.focus();
      };
      const hideAc = () => { ac.hidden = true; ac.innerHTML = ''; acItems = []; };
      input.oninput = () => { acSel = 0; renderAc(); };
      input.onblur = () => setTimeout(hideAc, 120);

      let hi = this._history.length;
      input.onkeydown = (e) => {
        e.stopPropagation();                    // don't leak into the match hotkeys
        // Swallow the toggle key so it never types itself into the box.
        if (e.key === '`' || e.key === '~') { e.preventDefault(); this.hidePanel(); return; }
        if (e.key === 'Escape') {
          e.preventDefault();
          if (!ac.hidden) { hideAc(); return; }    // first Esc closes the list
          this.hidePanel(); return;
        }
        // While the completion list is open it owns the arrows and Tab.
        if (!ac.hidden && acItems.length) {
          if (e.key === 'ArrowDown') { e.preventDefault(); acSel = (acSel + 1) % acItems.length; renderAc(); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); acSel = (acSel - 1 + acItems.length) % acItems.length; renderAc(); return; }
          if (e.key === 'Tab') { e.preventDefault(); accept(); return; }
          if (e.key === 'Enter' && acItems.length && input.value.trim() !== acItems[acSel].value) {
            // Enter completes first; a second Enter submits the finished line.
            const exact = this.SPEC.some((sp) => sp.cmd === input.value.trim().toLowerCase());
            if (!exact) { e.preventDefault(); accept(); return; }
          }
        }
        if (e.key === 'Tab') { e.preventDefault(); return; }
        if (e.key === 'Enter') {
          const v = input.value; input.value = '';
          if (!v.trim()) return;
          hideAc();
          push('> ' + v, 'you');
          const r = this.run(v);
          if (r.msg) String(r.msg).split('\n').forEach((ln) => push(ln, r.ok ? 'ok' : 'err'));
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

    hidePanel() { this._stopRain(); if (this._panel) { this._panel.remove(); this._panel = null; } },

    // Cheap falling-binary backdrop behind the log — a fixed low-res canvas
    // redrawn on a plain interval (not rAF: this is a UI overlay, not part of
    // the game's render loop, and a match may already be rendering at 60fps
    // underneath it).
    _startRain(cv) {
      if (!cv) return;
      const ctx = cv.getContext('2d');
      const resize = () => { cv.width = cv.clientWidth; cv.height = cv.clientHeight; };
      resize();
      const fontSize = 12, cols = Math.max(1, Math.floor(cv.width / fontSize));
      const drops = new Array(cols).fill(0).map(() => Math.random() * -20);
      this._rainTimer = setInterval(() => {
        if (cv.clientWidth !== cv.width || cv.clientHeight !== cv.height) resize();
        ctx.fillStyle = 'rgba(6,10,7,0.28)'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.font = fontSize + 'px monospace';
        for (let i = 0; i < cols; i++) {
          ctx.fillStyle = Math.random() < 0.06 ? '#bdf5c0' : 'rgba(90,200,110,0.55)';
          ctx.fillText(Math.random() < 0.5 ? '0' : '1', i * fontSize, drops[i] * fontSize);
          drops[i] = drops[i] * fontSize > cv.height && Math.random() > 0.975 ? 0 : drops[i] + 1;
        }
      }, 90);
    },
    _stopRain() { if (this._rainTimer) { clearInterval(this._rainTimer); this._rainTimer = null; } },
  };

  RS.Sandbox = Sandbox;
})();
