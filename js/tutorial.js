/* =========================================================================
 * REALM SIEGE — js/tutorial.js
 * A one-time guided walkthrough on the player's first battle, plus contextual
 * "field tips" that fire the first time a confusing mechanic appears.
 *
 * Design rules:
 *   - Every guided step advances on the player DOING the thing, never a timer.
 *     Reading a wall of text teaches nothing; placing the tower does.
 *   - The board is never blocked. The spotlight dims the rest of the screen
 *     with a cut-out, so the player can always see what they're being told about.
 *   - Field tips are separate from the guided flow and fire whenever the
 *     mechanic first shows up — Flying, Armoured, Stealth and Mark are the four
 *     that actually confuse people ("why won't my swordsman hit that griffon?").
 *   - Everything is skippable, and every flag lives on the profile so nothing
 *     is ever shown twice.
 *
 * PURELY PRESENTATIONAL. Reads match state, never mutates it.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});

  const $ = (s, r) => (r || document).querySelector(s);

  /* --------------------------- guided steps --------------------------- */
  // advance: the event id that completes the step; null = manual "Got it".
  const STEPS = [
    { id: 'welcome', title: 'Hold the road', target: null, advance: null,
      body: 'The horde walks the road to your keep. Every one that reaches the end costs you a life. Build along the road and stop them.' },
    { id: 'pick', title: 'Pick a defender', target: '#hTray', place: 'above', advance: 'select',
      body: 'This is your warband. Click one to pick it up — the number under it is what it costs in gold.' },
    { id: 'place', title: 'Set it down', target: '#game', place: 'center', advance: 'place', dim: 0.35,
      body: 'Click any open tile beside the road. Towers can only hit what comes near them, so hug the path — corners are best, enemies linger there.' },
    { id: 'range', title: 'That circle is its reach', target: 'tower', place: 'right', advance: null,
      body: 'A tower only attacks inside its ring. Anything outside walks past untouched. Spread your towers so their rings overlap the road, not each other.' },
    { id: 'wave', title: 'Call them in', target: '#btnWave', place: 'left', advance: 'waveStart',
      body: 'Send the wave when you are ready. Calling it early pays bonus gold, so there is a reward for being confident.' },
    { id: 'upgrade', title: 'Grow what you have', target: '#game', place: 'center', advance: 'towerSelect', dim: 0.3,
      body: 'Click one of your towers. You can upgrade it or change its targeting — an upgraded tower beats two weak ones almost every time.' },
    { id: 'done', title: 'You have the idea', target: null, advance: null,
      body: 'Gold comes from kills and from clearing waves. Keep spending it: a defence that stops growing gets overrun around wave ten. Good luck.' },
  ];

  /* ---------------------------- field tips ---------------------------- */
  // Fire once ever, the first time the mechanic actually appears on screen.
  const TIPS = {
    flying: { icon: '🦅', title: 'Flyers ignore your front line',
      body: 'Flying enemies leave the ground — melee towers and blockers <b>cannot reach them at all</b>. Keep an archer, mage or other ranged tower in every loadout.' },
    armored: { icon: '🛡', title: 'Armour blunts blades and arrows',
      body: 'Armoured foes shrug off most physical hits. <b>Magic, Siege and True</b> damage cut straight through — check the icon on each tower card.' },
    stealth: { icon: '👁', title: 'Something is hiding',
      body: 'Stealthed enemies cannot be targeted until they are revealed. A <b>Torchbearer</b> or <b>Watchtower Scout</b> exposes everything near it.' },
    mark: { icon: '🎯', title: 'Marked',
      body: 'A marked enemy takes <b>extra damage from every source</b>, not just the tower that marked it. Mark the big one, then focus it down.' },
    boss: { icon: '💀', title: 'This map has its own boss',
      body: 'Every map ends with a different boss, each with its own tricks. Leaking a boss costs <b>5 lives</b>, so do not let it walk.' },
  };

  const T = {
    active: false, i: 0, el: null, _tipEl: null, _tipT: 0, _seenTip: {},

    _flags() {
      const p = RS.Meta && RS.Meta.p; if (!p) return null;
      if (!p.tutorial) p.tutorial = { done: false, tips: {} };
      if (!p.tutorial.tips) p.tutorial.tips = {};
      return p.tutorial;
    },

    // Called when a match starts. Runs only on a player's very first battle.
    maybeStart() {
      const f = this._flags(); if (!f || f.done) return;
      this.active = true; this.i = 0;
      this._build();
      this._render();
    },

    skip() { const f = this._flags(); if (f) { f.done = true; RS.Meta.save(); } this._teardown(); },
    finish() { this.skip(); },

    /* --------------------------- step driving ------------------------- */
    event(name) {
      if (!this.active) return;
      const step = STEPS[this.i];
      if (!step || step.advance !== name) return;
      this.next();
    },
    next() {
      if (!this.active) return;
      this.i++;
      if (this.i >= STEPS.length) { this.finish(); return; }
      this._render();
    },

    /* ------------------------------ tips ------------------------------ */
    // Scan live match state for the first appearance of a teachable mechanic.
    scan(m) {
      if (!m || !RS.Meta || !RS.Meta.p) return;
      // Don't stack a tip on top of the guided flow — it would fight for focus.
      if (this.active) return;
      for (const e of m.enemies) {
        if (!e.alive) continue;
        if (e.isBoss) { this.tip('boss'); continue; }
        if (e.isFlying) this.tip('flying');
        else if (e.def.traits.includes('Stealth')) this.tip('stealth');
        if (e.armor >= 18) this.tip('armored');
        if (e.status && e.status.mark) this.tip('mark');
      }
    },

    tip(id) {
      const f = this._flags(); if (!f || f.tips[id] || this._tipEl) return;
      const t = TIPS[id]; if (!t) return;
      f.tips[id] = true; RS.Meta.save();
      const el = document.createElement('div');
      el.className = 'tut-tip';
      el.innerHTML = `<div class="tut-tip-icon">${t.icon}</div>
        <div class="tut-tip-txt"><b>${t.title}</b><p>${t.body}</p></div>
        <button class="tut-tip-x" aria-label="Dismiss">✕</button>`;
      (document.getElementById('hud') || document.body).appendChild(el);
      requestAnimationFrame(() => el.classList.add('in'));
      const kill = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 260); this._tipEl = null; clearTimeout(this._tipT); };
      el.querySelector('.tut-tip-x').onclick = kill;
      this._tipEl = el;
      this._tipT = setTimeout(kill, 9000);
    },

    /* ------------------------------ chrome ---------------------------- */
    _build() {
      this._teardown(true);
      const el = document.createElement('div');
      el.className = 'tut';
      el.innerHTML = `<div class="tut-hole" id="tutHole"></div>
        <div class="tut-card" id="tutCard">
          <div class="tut-step" id="tutStep"></div>
          <h4 id="tutTitle"></h4>
          <p id="tutBody"></p>
          <div class="tut-actions">
            <button class="tut-skip" id="tutSkip">Skip tutorial</button>
            <button class="tut-next" id="tutNext">Got it</button>
          </div>
          <div class="tut-wait" id="tutWait"></div>
        </div>`;
      (document.getElementById('hud') || document.body).appendChild(el);
      $('#tutSkip', el).onclick = () => this.skip();
      $('#tutNext', el).onclick = () => this.next();
      this.el = el;
    },

    _teardown(keepFlag) {
      if (this.el) { this.el.remove(); this.el = null; }
      if (!keepFlag) this.active = false;
    },

    _render() {
      if (!this.el) return;
      const s = STEPS[this.i]; if (!s) return;
      $('#tutStep', this.el).textContent = `Step ${this.i + 1} of ${STEPS.length}`;
      $('#tutTitle', this.el).textContent = s.title;
      $('#tutBody', this.el).innerHTML = s.body;
      const manual = !s.advance;
      $('#tutNext', this.el).style.display = manual ? '' : 'none';
      $('#tutNext', this.el).textContent = this.i === STEPS.length - 1 ? 'Begin' : 'Got it';
      const wait = $('#tutWait', this.el);
      wait.style.display = manual ? 'none' : '';
      wait.textContent = { select: 'Waiting — pick a tower from the tray…', place: 'Waiting — click a tile beside the road…',
        waveStart: 'Waiting — press Start Wave…', towerSelect: 'Waiting — click one of your towers…' }[s.advance] || '';
      this._position();
    },

    // Move the spotlight hole + card to the current step's target.
    _position() {
      if (!this.el) return;
      const s = STEPS[this.i]; if (!s) return;
      const hole = $('#tutHole', this.el), card = $('#tutCard', this.el);
      const host = (document.getElementById('hud') || document.body).getBoundingClientRect();
      let r = null;
      if (s.target === 'tower') {
        const m = RS.UI && RS.UI.match, cv = RS.UI && RS.UI.canvas;
        const tw = m && m.towers[m.towers.length - 1];
        if (tw && cv) {
          const cr = cv.getBoundingClientRect();
          const sx = cr.width / cv.width, sy = cr.height / cv.height;
          const rad = (m._effectiveRange ? m._effectiveRange(tw) : 60) * sx + 14;
          r = { left: cr.left + tw.x * sx - rad, top: cr.top + tw.y * sy - rad, width: rad * 2, height: rad * 2, round: true };
        }
      } else if (s.target) {
        const t = document.querySelector(s.target);
        if (t) { const b = t.getBoundingClientRect(); r = { left: b.left - 8, top: b.top - 8, width: b.width + 16, height: b.height + 16 }; }
      }
      const dim = s.dim != null ? s.dim : 0.55;
      if (r) {
        hole.style.display = '';
        hole.style.left = (r.left - host.left) + 'px';
        hole.style.top = (r.top - host.top) + 'px';
        hole.style.width = r.width + 'px';
        hole.style.height = r.height + 'px';
        hole.style.borderRadius = r.round ? '50%' : '12px';
        hole.style.boxShadow = `0 0 0 9999px rgba(8,6,5,${dim})`;
      } else {
        hole.style.display = 'none';
        this.el.style.background = `rgba(8,6,5,${dim})`;
      }
      if (!r) { this.el.style.background = `rgba(8,6,5,${dim})`; } else { this.el.style.background = 'transparent'; }
      // Place the card clear of the highlighted element.
      card.classList.remove('at-center', 'at-above', 'at-below', 'at-left', 'at-right');
      if (!r || s.place === 'center') { card.classList.add('at-center'); card.style.left = ''; card.style.top = ''; return; }
      const cw = 330, gap = 16;
      let left, top;
      if (s.place === 'above') { left = r.left - host.left + r.width / 2 - cw / 2; top = r.top - host.top - gap - 190; }
      else if (s.place === 'left') { left = r.left - host.left - cw - gap; top = r.top - host.top - 60; }
      else { left = r.left - host.left + r.width + gap; top = r.top - host.top; }
      left = Math.max(12, Math.min(left, host.width - cw - 12));
      top = Math.max(12, Math.min(top, host.height - 210));
      card.style.left = left + 'px'; card.style.top = top + 'px';
    },

    // Keep the spotlight glued to its target while the board resizes/animates.
    reposition() { if (this.active && this.el) this._position(); },
  };

  RS.Tutorial = T;
})();
