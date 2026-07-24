/* =========================================================================
 * REALM SIEGE — js/ui.js
 * All screens (menu, map select, loadout, roll, forge, collection, codex,
 * settings, summary) + the in-match HUD and input. DOM overlay over a single
 * canvas. The Match/Renderer own the sim; this file is presentation + intent.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const { fmt } = RS.util;
  const Meta = RS.Meta;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const star = (n) => '★★★☆☆☆'.slice(0, 0) + '★'.repeat(n) + '☆'.repeat(3 - n);

  const UI = {
    screen: 'menu',
    match: null,
    renderer: null,
    selectedMap: null,
    selectedDiff: null,
    workingLoadout: [],
    placing: null,     // tower def selected for placement
    selectedTower: null,

    init() {
      this.root = $('#app');
      // #game is created later in _buildHud; start the renderer on an offscreen
      // canvas so glyph drawing on menus works before any match exists.
      this.canvas = $('#game') || document.createElement('canvas');
      this.renderer = new RS.Renderer(this.canvas);
      this._bindGlobalKeys();
      this._bindCanvas();
      this._bindBus();
      this.show('menu');
    },

    toast(msg, color) {
      const t = h(`<div class="toast" style="border-color:${color || RS.PALETTE.gold}">${msg}</div>`);
      $('#toasts').appendChild(t);
      setTimeout(() => t.classList.add('show'), 10);
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
    },

    /* ------------------------------ routing --------------------------- */
    show(screen, arg) {
      this.screen = screen;
      this.placing = null; this.selectedTower = null;
      const inMatch = screen === 'match';
      $('#matchWrap').style.display = inMatch ? 'flex' : 'none';
      this.root.style.display = inMatch ? 'none' : 'block';
      if (inMatch) { this._buildHud(); return; }
      const map = {
        menu: () => this.renderMenu(), mapselect: () => this.renderMapSelect(),
        loadout: () => this.renderLoadout(arg), roll: () => this.renderRoll(),
        forge: () => this.renderForge(), collection: () => this.renderCollection(),
        codex: () => this.renderCodex(), settings: () => this.renderSettings(),
        summary: () => this.renderSummary(arg),
      };
      (map[screen] || map.menu)();
    },

    _topbar() {
      const t = Meta.p.tokens, a = Meta.p.account;
      const need = RS.ACCOUNT.xpCurve(a.level);
      return `<div class="topbar">
        <div class="brand">⚔ REALM SIEGE</div>
        <div class="tokens">
          <span class="tk copper" title="Copper">🟤 ${fmt(t.copper)}</span>
          <span class="tk silver" title="Silver">⚪ ${fmt(t.silver)}</span>
          <span class="tk gold" title="Gold">🟡 ${fmt(t.gold)}</span>
          <span class="tk relic" title="Mythic Relics">🔮 ${fmt(t.relic)}</span>
          <span class="tk lvl" title="Account level">Lv ${a.level} <span class="xpbar"><i style="width:${Math.min(100, a.xp / need * 100)}%"></i></span></span>
        </div>
      </div>`;
    },

    /* ------------------------------- menu ----------------------------- */
    renderMenu() {
      this.root.innerHTML = this._topbar() + `
        <div class="menu">
          <div class="menu-hero">
            <h1>REALM SIEGE</h1>
            <p class="sub">A Medieval Tower Defense · Roll the realm's champions</p>
          </div>
          <div class="menu-grid">
            <button class="mbtn play" data-go="mapselect"><b>⚔ Play</b><span>12 maps · 4 difficulties</span></button>
            <button class="mbtn" data-go="roll"><b>🎲 Roll</b><span>Summon towers</span></button>
            <button class="mbtn" data-go="collection"><b>🏰 Collection</b><span>${Meta.ownedTowerDefs().length}/26 towers</span></button>
            <button class="mbtn" data-go="forge"><b>🔨 Forge</b><span>${Meta.forgeUnlocked ? 'Convert & craft' : 'Unlocks Lv 2'}</span></button>
            <button class="mbtn" data-go="codex"><b>📖 Codex</b><span>${Math.round(Meta.codexPct() * 100)}% complete</span></button>
            <button class="mbtn" data-go="settings"><b>⚙ Settings</b><span>Save & options</span></button>
          </div>
          <div class="objectives">
            <h3>Objectives</h3>
            ${RS.OBJECTIVES.map((o) => { const pr = Meta.p.objectives[o.id] || 0; const done = pr >= o.goal; return `<div class="obj ${done ? 'done' : ''}"><span>${o.desc}</span><b>${Math.min(pr, o.goal)}/${o.goal}</b><em>${done ? '✓' : this._rewardStr(o.reward)}</em></div>`; }).join('')}
          </div>
        </div>`;
      this._wireGo();
    },
    _rewardStr(r) { return Object.entries(r).map(([k, v]) => `+${v} ${k}`).join(', '); },
    _wireGo() { $$('[data-go]', this.root).forEach((b) => b.onclick = () => this.show(b.dataset.go)); },

    /* ---------------------------- map select -------------------------- */
    // Difficulty is now picked GLOBALLY here; each map carries its OWN inherent
    // difficulty rating (harder map = more loot), independent of that choice.
    renderMapSelect() {
      const clearedAt = (did) => RS.MAPS.some((mm) => Meta.p.completions[mm.id] && Meta.p.completions[mm.id][did]);
      const tiers = RS.DIFFICULTY.filter((d) => !d.purple); // Easy..Hardcore in the selector
      const diffUnlocked = (d) => d.order === 0 || clearedAt(RS.DIFFICULTY[d.order - 1].id);
      if (!this.globalDiff || !RS.DIFF_BY_ID[this.globalDiff] || RS.DIFF_BY_ID[this.globalDiff].purple) this.globalDiff = 'Easy';
      if (!diffUnlocked(RS.DIFF_BY_ID[this.globalDiff])) this.globalDiff = 'Easy';
      const gd = RS.DIFF_BY_ID[this.globalDiff];
      const hardcoreDone = clearedAt('Hardcore');
      const skulls = (n) => '💀'.repeat(n) + '<span class="sk-off">💀</span>'.repeat(6 - n);
      const maps = RS.MAPS.filter((m) => !m.winter);
      this.root.innerHTML = this._topbar() + `
        <div class="page">
          <div class="page-head"><button class="back" data-go="menu">← Menu</button><h2>Choose Your Battlefield</h2></div>
          <div class="diffbar">
            <span class="diffbar-lbl">Game Difficulty:</span>
            ${tiers.map((d) => { const u = diffUnlocked(d); return `<button class="diffchip d-${d.id.toLowerCase()} ${this.globalDiff === d.id ? 'on' : ''} ${u ? '' : 'locked'}" data-gdiff="${d.id}" ${u ? '' : 'disabled'}>${d.id}${u ? '' : ' 🔒'}</button>`; }).join('')}
            <span class="diffbar-info">×${gd.hpMult} HP · ${gd.lives} lives · ${gd.tokenMult}× tokens</span>
          </div>
          <div class="mapgrid">
          ${maps.map((m) => {
            const comp = Meta.p.completions[m.id] || {};
            const s = comp[this.globalDiff] ? comp[this.globalDiff].stars : 0;
            return `<div class="mapcard mapcard-lg" data-play="${m.id}">
              <div class="map-rate" title="Map difficulty ${m.rating}/6">${skulls(m.rating)}</div>
              <h3>${m.name}</h3>
              <div class="map-loot">+${Math.round((m.rewardMult - 1) * 100)}% loot${s ? ` · <span class="cleared">${star(s)}</span>` : ''}</div>
              <p>${m.desc}</p>
              ${m.signature && RS.ENEMY_BY_ID[m.signature] ? `<div class="sigfoe">☠ Signature foe: <b>${RS.ENEMY_BY_ID[m.signature].name}</b></div>` : ''}
              <button class="playbtn d-${this.globalDiff.toLowerCase()}" data-play="${m.id}">▶ Play · ${this.globalDiff}</button>
            </div>`;
          }).join('')}
          </div>
          <h3 class="special-h">Special Challenges</h3>
          <div class="mapgrid">
            <div class="mapcard purple ${hardcoreDone ? '' : 'locked-card'}" data-winter="${hardcoreDone ? 1 : ''}">
              <div class="frostaura"></div>
              <div class="map-rate">💜💜💜💜💜💜</div>
              <h3>💜 Winterhold Ruins</h3>
              <div class="map-loot purple-loot">PURPLE NIGHTMARE · 12× tokens · Frostcrown cosmetic</div>
              <p>Build ONLY inside campfire-lit ruined houses. Every foe wears a Cold shroud only Fire or Holy can melt. ${hardcoreDone ? '' : '<b>Unlocks after any Hardcore clear.</b>'}</p>
              ${hardcoreDone ? `<button class="playbtn d-purple" data-winter="1">💜 Enter the Nightmare</button>` : '<button class="playbtn locked" disabled>🔒 Locked</button>'}
            </div>
            ${hardcoreDone ? `<div class="mapcard endless" data-endless="1"><div class="map-rate">✦✦✦✦✦✦</div><h3>The Grey Herald</h3><div class="map-loot">Endless · scaling loot</div><p>Endless superboss on The Ember Throne. It copies your strongest tower every 60s.</p><button class="playbtn d-hardcore" data-endless="1">Enter the Endless</button></div>` : ''}
          </div>
        </div>`;
      this._wireGo();
      $$('[data-gdiff]', this.root).forEach((b) => b.onclick = () => { if (!b.disabled) { this.globalDiff = b.dataset.gdiff; this.renderMapSelect(); } });
      $$('[data-play]', this.root).forEach((b) => b.onclick = (e) => {
        e.stopPropagation();
        this.selectedMap = RS.MAP_BY_ID[b.dataset.play];
        this.selectedDiff = RS.DIFF_BY_ID[this.globalDiff];
        this.endless = false;
        this.show('loadout');
      });
      const win = $('[data-winter="1"].playbtn', this.root) || $('.mapcard.purple[data-winter="1"] .playbtn', this.root);
      $$('[data-winter="1"]', this.root).forEach((el) => el.onclick = (e) => {
        e.stopPropagation();
        if (!hardcoreDone) return;
        this.selectedMap = RS.MAP_BY_ID.winterhold; this.selectedDiff = RS.DIFF_BY_ID['Purple Nightmare']; this.endless = false; this.show('loadout');
      });
      $$('[data-endless="1"]', this.root).forEach((el) => el.onclick = (e) => {
        e.stopPropagation();
        this.selectedMap = RS.MAP_BY_ID.emberthrone; this.selectedDiff = RS.DIFF_BY_ID.Hardcore; this.endless = true; this.show('loadout');
      });
    },

    /* --------------------------- loadout ------------------------------ */
    renderLoadout() {
      const slots = Meta.loadoutSlots;
      if (this.workingLoadout.length === 0) {
        const owned = Meta.ownedTowerDefs().sort((a, b) => RS.rarityRank(b.rarity) - RS.rarityRank(a.rarity));
        this.workingLoadout = owned.slice(0, slots).map((t) => t.id);
      }
      this.workingLoadout = this.workingLoadout.slice(0, slots);
      const owned = Meta.ownedTowerDefs();
      const warn = this._coverageWarnings(this.workingLoadout);
      this.root.innerHTML = this._topbar() + `
        <div class="page">
          <div class="page-head"><button class="back" data-go="mapselect">← Maps</button>
            <h2>Loadout · ${this.selectedMap.name} <span class="pill d-${this.selectedDiff.id.toLowerCase()}">${this.selectedDiff.id}</span></h2></div>
          <div class="loadout-slots">
            ${Array.from({ length: slots }).map((_, i) => { const id = this.workingLoadout[i]; const t = id && RS.TOWER_BY_ID[id]; return `<div class="slot ${t ? '' : 'empty'}" data-slot="${i}">${t ? this._towerChip(t, true) : '<span>empty</span>'}</div>`; }).join('')}
          </div>
          ${warn.length ? `<div class="warnbar">⚠ ${warn.join(' · ')}</div>` : '<div class="okbar">✓ Balanced loadout</div>'}
          <h3>Your Collection <small>(click to add/remove — need ${slots} slots)</small></h3>
          <div class="collgrid small">
            ${owned.map((t) => `<div class="cchip ${this.workingLoadout.includes(t.id) ? 'in' : ''}" data-add="${t.id}">${this._towerChip(t)}</div>`).join('')}
          </div>
          <div class="loadout-actions">
            <button class="bigbtn ${this.workingLoadout.length ? '' : 'disabled'}" id="startMatch">Deploy → Start ${this.selectedDiff.id}</button>
          </div>
        </div>`;
      this._wireGo();
      $$('[data-add]', this.root).forEach((c) => c.onclick = () => {
        const id = c.dataset.add;
        const idx = this.workingLoadout.indexOf(id);
        if (idx >= 0) this.workingLoadout.splice(idx, 1);
        else if (this.workingLoadout.length < slots) this.workingLoadout.push(id);
        else this.toast('Loadout full', RS.PALETTE.warn);
        this.renderLoadout();
      });
      $$('.slot', this.root).forEach((s) => s.onclick = () => { const i = +s.dataset.slot; if (this.workingLoadout[i]) { this.workingLoadout.splice(i, 1); this.renderLoadout(); } });
      $('#startMatch').onclick = () => this.startMatch();
      this._drawGlyphs(this.root); // FIX: draw the tower silhouettes (were invisible)
    },

    _coverageWarnings(ids) {
      const defs = ids.map((id) => RS.TOWER_BY_ID[id]);
      const w = [];
      const hasAir = defs.some((t) => t.traits.bonusVs && (t.traits.bonusVs.trait === 'Flying') || t.traits.summon || t.traits.flying || t.def === undefined && false || ['longbow', 'falconer', 'archmage', 'wyvernrider', 'ballista', 'archer', 'crossbow', 'longbowman'].includes(t.id) || t.rangeT >= 3.4);
      const antiArmor = defs.some((t) => (t.traits.bonusVs && t.traits.bonusVs.trait === 'Armored') || t.traits.armorPen || t.damageType === 'True' || t.damageType === 'Magic' || t.traits.breakShield);
      const antiMagic = defs.some((t) => ['Physical', 'Piercing', 'True', 'Holy'].includes(t.damageType));
      if (!hasAir) w.push('No reliable anti-air');
      if (!antiArmor) w.push('Weak vs Armored');
      if (defs.length < Meta.loadoutSlots) w.push(`${Meta.loadoutSlots - defs.length} empty slot(s)`);
      return w;
    },

    _towerChip(t, big) {
      const c = RS.rarityColor(t.rarity);
      const owned = Meta.ownedCount(t.id);
      const rk = RS.rarityRank(t.rarity);
      const anim = rk >= 6 ? 'rc-prism' : rk >= 5 ? 'rc-ember' : rk >= 4 ? 'rc-shimmer' : '';
      return `<div class="tchip ${anim}" style="--rc:${c}">
        <div class="tchip-icon"><canvas class="glyph" data-glyph="${t.id}" width="44" height="44"></canvas>
          <span class="dmgicon di-${t.damageType.toLowerCase()}" title="${t.damageType}">${RS.dmgIcon(t.damageType)}</span></div>
        <div class="tchip-info"><b>${t.name}</b><span>${t.rarity} · ${t.cost}g</span>
        ${big ? `<em>DPS ${fmt(RS.towerDps(t))} · ${t.damageType}</em>` : ''}</div>
        ${owned > 1 ? `<span class="dup">×${owned}</span>` : ''}
      </div>`;
    },

    _drawGlyphs(root) {
      $$('canvas.glyph', root || document).forEach((cv) => {
        const id = cv.dataset.glyph; const t = RS.TOWER_BY_ID[id]; if (!t) return;
        const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
        RS.Sprites.drawTowerIcon(ctx, t, cv.width / 2, cv.height / 2 + 3, Math.min(cv.width, cv.height) * 0.86);
      });
    },

    /* ------------------------------ roll ------------------------------ */
    renderRoll() {
      const pity = Meta.p.pity;
      const bar = (label, cur, max, color) => `<div class="pitybar"><span>${label}</span><div class="pb"><i style="width:${Math.min(100, cur / max * 100)}%;background:${color}"></i></div><em>${cur}/${max}</em></div>`;
      this.root.innerHTML = this._topbar() + `
        <div class="page rollpage">
          <div class="page-head"><button class="back" data-go="menu">← Menu</button><h2>The Rolling Banner</h2></div>
          <div class="rollstage" id="rollStage"><div class="banner-idle">Roll to summon a champion</div></div>
          <div class="rollbtns">
            ${Object.values(RS.ROLLS).map((r) => `<button class="rollbtn ${Meta.canRoll(r.id) ? '' : 'disabled'}" data-roll="${r.id}">
              <b>${r.id} Roll</b><span>${r.label}</span><em>floor: ${r.floor}</em>
              ${Meta.p.rolls[r.id] > 0 ? `<span class="tickets">🎟 ${Meta.p.rolls[r.id]}</span>` : ''}</button>`).join('')}
          </div>
          <div class="multirow"><button class="multibtn" data-multi="Basic">Basic ×10</button><button class="multibtn" data-multi="Lucky">Lucky ×10</button><button class="multibtn" data-multi="Super">Super ×10</button></div>
          <div class="quickroll">
            ${Meta.p.settings.quickRollUnlocked
              ? `<label class="toggle"><input type="checkbox" id="quickRollToggle" ${Meta.p.settings.quickRoll ? 'checked' : ''}> ⚡ Quick Roll <small>— skip the suspense animation</small></label>`
              : `<button class="qrbuy ${Meta.p.tokens.gold >= 15 ? '' : 'disabled'}" id="buyQuickRoll">⚡ Unlock Quick Roll — 15 🟡 Gold <small>skip the roll animation forever</small></button>`}
          </div>
          <div class="pity">
            <h3>Pity Counters</h3>
            ${bar('Epic guarantee', pity.epic, RS.PITY.epic.hard, '#9b59b6')}
            ${bar('Legendary', pity.legend, RS.PITY.legend.hard, '#f0a92e')}
            ${bar('Mythic', pity.mythic, RS.PITY.mythic.hard, '#e04b4b')}
            ${bar('Mythic+ (cumulative)', pity.plus, RS.PITY.plus.hard, '#fff')}
          </div>
          <div class="history"><h3>Recent Rolls</h3><div class="histlist">${this._rollHistoryHtml()}</div></div>
        </div>`;
      this._wireGo();
      $$('[data-roll]', this.root).forEach((b) => b.onclick = () => this.doRoll(b.dataset.roll, 1));
      $$('[data-multi]', this.root).forEach((b) => b.onclick = () => this.doRoll(b.dataset.multi, 10));
      const qrb = $('#buyQuickRoll'); if (qrb) qrb.onclick = () => { if (Meta.spend('gold', 15)) { Meta.p.settings.quickRollUnlocked = true; Meta.p.settings.quickRoll = true; Meta.save(); this.toast('Quick Roll unlocked!', RS.PALETTE.good); this.renderRoll(); } };
      const qrt = $('#quickRollToggle'); if (qrt) qrt.onchange = (e) => { Meta.p.settings.quickRoll = e.target.checked; Meta.save(); };
    },
    _rollHistoryHtml() {
      return Meta.p.rollHistory.slice(0, 18).map((e) => {
        if (e.converted) return `<span class="hchip" style="--rc:${RS.rarityColor('Mythic')}">Legendary→ ${e.converted.relic}🔮</span>`;
        const t = RS.TOWER_BY_ID[e.towerId];
        return `<span class="hchip" style="--rc:${RS.rarityColor(e.rarity)}">${t ? t.name : e.rarity}</span>`;
      }).join('') || '<em>No rolls yet.</em>';
    },

    doRoll(tier, times) {
      if (!Meta.canRoll(tier)) { this.toast('Not enough resources', RS.PALETTE.bad); return; }
      const results = [];
      let best = 0;
      for (let i = 0; i < times; i++) {
        if (!Meta.canRoll(tier)) break;
        const r = Meta.roll(tier);
        if (r.error) break;
        results.push(r);
        best = Math.max(best, RS.rarityRank(r.rarity));
      }
      this._playRollAnim(results, best);
    },

    _playRollAnim(results, bestRank) {
      const stage = $('#rollStage');
      const bestColor = RS.RARITY[bestRank].color;
      // Quick Roll: skip the suspense animation entirely (purchased QoL toggle).
      const quick = Meta.p.settings.quickRoll;
      const dur = quick ? 0 : 700 + bestRank * 300;
      if (!quick) {
        stage.innerHTML = `<div class="banner-spin" style="--flare:${bestColor}"></div>`;
        const spin = stage.firstElementChild;
        spin.animate([{ filter: 'brightness(1)' }, { filter: `brightness(${1.5 + bestRank * 0.4})` }, { filter: 'brightness(1)' }], { duration: dur, iterations: 1 });
        if (bestRank >= 6) { document.body.classList.add('shatter'); setTimeout(() => document.body.classList.remove('shatter'), 900); }
        if (bestRank >= 5) this.match && (this.match.freeze = 0.4);
      }
      setTimeout(() => {
        stage.innerHTML = `<div class="results">${results.map((r) => {
          if (r.converted) return `<div class="rescard" style="--rc:${RS.rarityColor('Mythic')}"><div class="resrar">50/50 → Relics</div><b>+${r.converted.relic} 🔮</b></div>`;
          const t = r.tower; const dup = Meta.ownedCount(t.id) > 1;
          return `<div class="rescard ${RS.rarityRank(r.rarity) >= 5 ? 'shine' : ''}" style="--rc:${RS.rarityColor(r.rarity)}">
            <div class="resrar">${r.rarity}</div>
            <canvas class="glyph rg" data-glyph="${t.id}" width="48" height="48"></canvas>
            <b>${t.name}</b>${dup ? '<span class="dupflag">DUPLICATE</span>' : '<span class="newflag">NEW</span>'}
          </div>`;
        }).join('')}</div>`;
        this._drawGlyphs(stage);
        RS.Audio && RS.Audio.reveal(bestRank);
        // full-screen rarity reveal spectacle — skipped in Quick Roll mode
        if (!quick) { const rect = stage.getBoundingClientRect(); RS.VFX.overlay.reveal(RS.RARITY[bestRank].id, rect.left + rect.width / 2, rect.top + rect.height / 2); }
        // refresh tokens/pity display without losing stage
        this._refreshTopbar();
        this._refreshPity();
      }, dur);
    },
    _refreshTopbar() { const tb = $('.topbar', this.root); if (tb) tb.outerHTML = this._topbar(); },
    _refreshPity() { /* re-render pity + history areas if present */ const p = $('.pity', this.root); if (p) { this.renderRollPartial(); } },
    renderRollPartial() {
      const pity = Meta.p.pity;
      const bar = (label, cur, max, color) => `<div class="pitybar"><span>${label}</span><div class="pb"><i style="width:${Math.min(100, cur / max * 100)}%;background:${color}"></i></div><em>${cur}/${max}</em></div>`;
      const pd = $('.pity', this.root); if (pd) pd.innerHTML = `<h3>Pity Counters</h3>${bar('Epic guarantee', pity.epic, RS.PITY.epic.hard, '#9b59b6')}${bar('Legendary', pity.legend, RS.PITY.legend.hard, '#f0a92e')}${bar('Mythic', pity.mythic, RS.PITY.mythic.hard, '#e04b4b')}${bar('Mythic+ (cumulative)', pity.plus, RS.PITY.plus.hard, '#fff')}`;
      const hl = $('.histlist', this.root); if (hl) hl.innerHTML = this._rollHistoryHtml();
      $$('[data-roll]', this.root).forEach((b) => b.classList.toggle('disabled', !Meta.canRoll(b.dataset.roll)));
    },

    /* ------------------------------ forge ----------------------------- */
    renderForge() {
      if (!Meta.forgeUnlocked) { this.root.innerHTML = this._topbar() + `<div class="page"><div class="page-head"><button class="back" data-go="menu">← Menu</button><h2>Forge</h2></div><p class="locked-note">The Forge unlocks at Account Level 2. Clear a few waves!</p></div>`; this._wireGo(); return; }
      const t = Meta.p.tokens, rolls = Meta.p.rolls, sh = Meta.p.shards;
      this.root.innerHTML = this._topbar() + `
        <div class="page">
          <div class="page-head"><button class="back" data-go="menu">← Menu</button><h2>The Forge <small>lossy conversion · the escape from RNG</small></h2></div>
          <div class="forge-cols">
            <div class="forge-col"><h3>Token Conversion</h3>
              ${RS.FORGE.tokenConvert.map((r) => `<div class="conv"><span>${r.n} ${r.from} → 1 ${r.to}</span><button data-ctok="${r.from}" class="${t[r.from] >= r.n ? '' : 'disabled'}">Convert</button></div>`).join('')}
            </div>
            <div class="forge-col"><h3>Roll Ticket Conversion</h3>
              ${RS.FORGE.rollConvert.map((r) => `<div class="conv"><span>${r.n} ${r.from} → 1 ${r.to}</span><button data-croll="${r.from}" class="${rolls[r.from] >= r.n ? '' : 'disabled'}">Convert (${rolls[r.from]})</button></div>`).join('')}
            </div>
          </div>
          <h3>Shards <small>dismantle duplicates · upcast · craft a specific tower</small></h3>
          <div class="shardrow">${RS.RARITY.map((r) => `<div class="shard" style="--rc:${r.color}"><b>${r.id}</b><span>${sh[r.id]}</span><button data-upcast="${r.id}" class="${sh[r.id] >= RS.FORGE.upcast ? '' : 'disabled'}">↑5→1</button></div>`).join('')}</div>
          <h3>Craft / Dismantle</h3>
          <div class="craftgrid">
            ${RS.TOWERS.map((tw) => { const owned = Meta.ownedCount(tw.id); const craftCost = RS.FORGE.shards[tw.rarity].craft; const canCraft = sh[tw.rarity] >= craftCost; return `<div class="craftcard" style="--rc:${RS.rarityColor(tw.rarity)}">
              <canvas class="glyph" data-glyph="${tw.id}" width="36" height="36"></canvas>
              <div><b>${tw.name}</b><span>${tw.rarity} · owned ${owned}</span></div>
              <div class="craftbtns">
                <button data-craft="${tw.id}" class="${canCraft ? '' : 'disabled'}" title="Craft for ${craftCost} ${tw.rarity} shards">Craft (${craftCost})</button>
                <button data-dismantle="${tw.id}" class="${owned > 1 ? '' : 'disabled'}" title="Dismantle a duplicate for ${RS.FORGE.shards[tw.rarity].dismantle} shards">Dismantle</button>
              </div></div>`; }).join('')}
          </div>
        </div>`;
      this._wireGo(); this._drawGlyphs(this.root);
      const refresh = () => { this.renderForge(); };
      const strike = (el, color) => { const r = el.getBoundingClientRect(); RS.VFX.overlay.forgeStrike(r.left + r.width / 2, r.top + r.height / 2, color); RS.Audio && RS.Audio.forge(); };
      $$('[data-ctok]', this.root).forEach((b) => b.onclick = () => { if (Meta.convertTokens(b.dataset.ctok)) { strike(b, '#ffd98a'); refresh(); } });
      $$('[data-croll]', this.root).forEach((b) => b.onclick = () => { if (Meta.convertRolls(b.dataset.croll)) { strike(b, '#ffd98a'); refresh(); } });
      $$('[data-upcast]', this.root).forEach((b) => b.onclick = () => { if (Meta.upcastShards(b.dataset.upcast)) { strike(b, '#c79bff'); refresh(); } });
      $$('[data-craft]', this.root).forEach((b) => b.onclick = () => { const def = RS.TOWER_BY_ID[b.dataset.craft]; if (Meta.craftTower(b.dataset.craft)) { strike(b, RS.rarityColor(def.rarity)); this.toast('Crafted ' + def.name, RS.PALETTE.good); setTimeout(refresh, 120); } });
      $$('[data-dismantle]', this.root).forEach((b) => b.onclick = () => { if (Meta.dismantle(b.dataset.dismantle)) { const r = b.getBoundingClientRect(); RS.VFX.overlay.stream(r.left + r.width / 2, r.top, r.left, 120, RS.rarityColor(RS.TOWER_BY_ID[b.dataset.dismantle].rarity)); refresh(); } });
    },

    /* --------------------------- collection --------------------------- */
    renderCollection() {
      this.root.innerHTML = this._topbar() + `
        <div class="page">
          <div class="page-head"><button class="back" data-go="menu">← Menu</button><h2>Collection <small>${Meta.ownedTowerDefs().length}/26</small></h2></div>
          <div class="collgrid">
          ${RS.TOWERS.map((t) => {
            const owned = Meta.ownedCount(t.id);
            return `<div class="collcard ${owned ? '' : 'locked'}" style="--rc:${RS.rarityColor(t.rarity)}" data-info="${t.id}">
              ${owned ? `<canvas class="glyph" data-glyph="${t.id}" width="48" height="48"></canvas>` : '<div class="silhouette">?</div>'}
              <b>${owned ? t.name : '???'}</b>
              <span class="rar">${t.rarity}</span>
              ${owned ? `<em>DPS ${fmt(RS.towerDps(t))}</em>` : '<em>Locked</em>'}
              ${owned > 1 ? `<span class="dup">×${owned}</span>` : ''}
            </div>`;
          }).join('')}
          </div>
        </div>`;
      this._wireGo(); this._drawGlyphs(this.root);
      $$('[data-info]', this.root).forEach((c) => c.onclick = () => { if (Meta.ownedCount(c.dataset.info)) this.showTowerModal(c.dataset.info); });
    },

    showTowerModal(id) {
      const t = RS.TOWER_BY_ID[id];
      const modal = h(`<div class="modal-bg"><div class="modal" style="--rc:${RS.rarityColor(t.rarity)}">
        <button class="modal-x">✕</button>
        <div class="modal-head"><canvas class="glyph" data-glyph="${t.id}" width="56" height="56"></canvas><div><h3>${t.name}</h3><span>${t.rarity} · ${t.placement} · ${t.damageType}</span></div></div>
        <div class="statgrid">
          <div><b>${fmt(RS.towerDps(t))}</b><span>DPS</span></div>
          <div><b>${t.damage}</b><span>Damage</span></div>
          <div><b>${t.fireRate.toFixed(2)}/s</b><span>Fire rate</span></div>
          <div><b>${t.rangeT.toFixed(1)}t</b><span>Range</span></div>
          <div><b>${t.cost}g</b><span>Cost</span></div>
          <div><b>${t.splashT || '—'}</b><span>Splash</span></div>
        </div>
        <div class="branches"><h4>Level 4 Specialisations</h4>
          ${t.upgrades.branch.map((b) => `<div class="branch"><b>${b.name}</b><span>${b.desc}</span></div>`).join('')}
          <h4>Ascension (Lv 5)</h4><p>${t.ascend.desc}</p></div>
        <p class="lore">"${t.lore}"</p>
      </div></div>`);
      document.body.appendChild(modal);
      this._drawGlyphs(modal);
      modal.onclick = (e) => { if (e.target === modal || e.target.classList.contains('modal-x')) modal.remove(); };
    },

    /* ------------------------------ codex ----------------------------- */
    renderCodex() {
      this.root.innerHTML = this._topbar() + `
        <div class="page">
          <div class="page-head"><button class="back" data-go="menu">← Menu</button><h2>Codex <small>${Math.round(Meta.codexPct() * 100)}% · 100% awards Relics</small></h2></div>
          <h3>Enemies</h3>
          <div class="codexgrid">
          ${RS.ENEMIES.filter((e) => !e.hidden && !e.traits.includes('Boss')).map((e) => { const seen = Meta.p.codex.enemies.includes(e.id); return `<div class="codexcard ${seen ? '' : 'locked'}"><b>${seen ? e.name : '???'}</b><span>${e.family}</span>${seen ? `<em>HP ${e.hp} · SPD ${e.speed} · AR ${e.armor}</em><div class="traits">${e.traits.map((t) => `<i>${t}</i>`).join('')}</div>` : '<em>Not yet encountered</em>'}</div>`; }).join('')}
          </div>
          <h3>Bosses</h3>
          <div class="codexgrid">
          ${RS.ENEMIES.filter((e) => e.traits.includes('Boss')).map((e) => { const seen = Meta.p.codex.enemies.includes(e.id); return `<div class="codexcard boss ${seen ? '' : 'locked'}"><b>${seen ? e.name : '??? Boss'}</b><span>${e.family}</span>${seen ? `<em>HP ${fmt(e.hp)}</em>` : '<em>Undiscovered</em>'}</div>`; }).join('')}
          </div>
        </div>`;
      this._wireGo();
    },

    /* ---------------------------- settings ---------------------------- */
    renderSettings() {
      const s = Meta.p.settings;
      this.root.innerHTML = this._topbar() + `
        <div class="page">
          <div class="page-head"><button class="back" data-go="menu">← Menu</button><h2>Settings & Save</h2></div>
          <div class="settings">
            <label class="toggle"><input type="checkbox" id="setRange" ${s.showRange ? 'checked' : ''}> Show range overlays by default</label>
            <label class="toggle"><input type="checkbox" id="setPart" ${s.particles ? 'checked' : ''}> Particles</label>
            <label class="toggle"><input type="checkbox" id="setSfx" ${s.sfx ? 'checked' : ''}> Sound cues</label>
          </div>
          <h3>Save Management</h3>
          <div class="savebox">
            <button class="bigbtn" id="expBtn">Export Save</button>
            <button class="bigbtn" id="impBtn">Import Save</button>
            <button class="bigbtn danger" id="resetBtn">Reset Everything</button>
          </div>
          <textarea id="saveText" placeholder="Exported save appears here / paste a save to import" spellcheck="false"></textarea>
        </div>`;
      this._wireGo();
      $('#setRange').onchange = (e) => { s.showRange = e.target.checked; Meta.save(); };
      $('#setPart').onchange = (e) => { s.particles = e.target.checked; Meta.save(); };
      $('#setSfx').onchange = (e) => { s.sfx = e.target.checked; Meta.save(); };
      $('#expBtn').onclick = () => { $('#saveText').value = Meta.exportSave(); this.toast('Save exported below', RS.PALETTE.good); };
      $('#impBtn').onclick = () => { if (Meta.importSave($('#saveText').value)) { this.toast('Save imported!', RS.PALETTE.good); this.renderSettings(); } else this.toast('Invalid save string', RS.PALETTE.bad); };
      $('#resetBtn').onclick = () => { if (confirm('Wipe all progress?')) { Meta.reset(); this.toast('Progress reset', RS.PALETTE.warn); this.show('menu'); } };
    },

    /* ============================ MATCH HUD =========================== */
    startMatch() {
      const meta = { roster: Meta.p.roster, bonusStartGold: Meta.bonusStartGold, freeAscend: false };
      const diff = this.endless ? Object.assign({}, this.selectedDiff, { waves: 999, boss: 'boss_herald', endless: true }) : this.selectedDiff;
      this.match = new RS.Match(this.selectedMap, diff, this.workingLoadout, meta);
      this.renderer.showRange = Meta.p.settings.showRange;
      this.renderer.selected = null; this.renderer.ghost = null;
      this.show('match');
    },

    _buildHud() {
      $('#matchWrap').innerHTML = `
        <canvas id="game" width="${RS.WORLD.w}" height="${RS.WORLD.h}"></canvas>
        <div id="hud">
          <div class="hud-top">
            <div class="hstat lives">❤ <b id="hLives">0</b></div>
            <div class="hstat gold">🟡 <b id="hGold">0</b></div>
            <div class="hstat wave">Wave <b id="hWave">0</b>/<span id="hMax">0</span></div>
            <div class="hstat weather" id="hWeather"></div>
            <div class="hud-speed">
              <button id="btnPause" title="Space">⏸</button>
              <button id="btnSpeed" title="F">1×</button>
              <button id="btnMenu">☰</button>
            </div>
          </div>
          <div class="hud-preview" id="hPreview"></div>
          <div class="hud-tray" id="hTray"></div>
          <div class="hud-selected" id="hSelected"></div>
          <button class="callwave" id="btnWave">▶ Start Wave <small>R</small></button>
        </div>`;
      this.canvas = $('#game'); this.renderer.canvas = this.canvas; this.renderer.ctx = this.canvas.getContext('2d');
      this._bindCanvas();
      this._buildTray();
      $('#btnWave').onclick = () => this.onWaveButton();
      $('#btnPause').onclick = () => this.togglePause();
      $('#btnSpeed').onclick = () => this.cycleSpeed();
      $('#btnMenu').onclick = () => { if (confirm('Abandon this battle?')) { this.match = null; this.show('mapselect'); } };
      $('#hMax').textContent = this.match.maxWaves > 900 ? '∞' : this.match.maxWaves;
      this.refreshHud();
    },

    _buildTray() {
      const m = this.match;
      const tray = $('#hTray');
      tray.innerHTML = this.workingLoadout.map((id, i) => {
        const t = RS.TOWER_BY_ID[id];
        return `<button class="trayitem" data-place="${id}" data-key="${i + 1}" style="--rc:${RS.rarityColor(t.rarity)}">
          <span class="hot">${i + 1}</span>
          <canvas class="glyph" data-glyph="${id}" width="36" height="36"></canvas>
          <b>${t.cost}g</b></button>`;
      }).join('');
      this._drawGlyphs(tray);
      $$('[data-place]', tray).forEach((b) => b.onclick = () => this.selectPlacement(b.dataset.place));
    },

    selectPlacement(id) {
      // Clicking the tray icon that's already active cancels placement mode
      // instead of re-arming it — lets you back out without Esc or a stray click.
      if (this.placing && this.placing.id === id) {
        this.placing = null; this.renderer.ghost = null;
        $$('.trayitem', document).forEach((b) => b.classList.remove('active'));
        this.refreshSelected();
        return;
      }
      const t = RS.TOWER_BY_ID[id];
      if (Meta.ownedCount(id) <= 0) { this.toast('You do not own this tower', RS.PALETTE.bad); return; }
      this.placing = t; this.renderer.ghost = t; this.selectedTower = null; this.renderer.selected = null;
      $$('.trayitem', document).forEach((b) => b.classList.toggle('active', b.dataset.place === id));
      this.refreshSelected();
    },

    onWaveButton() {
      const m = this.match; if (!m) return;
      if (m.waveActive) m.callEarly();
      else m.startWave();
      this.refreshHud();
    },
    togglePause() { if (!this.match) return; this.match.paused = !this.match.paused; $('#btnPause').textContent = this.match.paused ? '▶' : '⏸'; },
    cycleSpeed() { const m = this.match; if (!m) return; m.speed = m.speed === 1 ? 2 : m.speed === 2 ? 4 : 1; $('#btnSpeed').textContent = m.speed + '×'; },

    /* ------------------------ match render tick ----------------------- */
    matchTick(dt) {
      const m = this.match; if (!m) return;
      const eff = m.freeze > 0 ? dt * 0.15 : dt;
      m.frame(eff);
      m.updateParticles(eff * m.speed);
      this.renderer.showRange = Meta.p.settings.showRange || this._tabRange;
      this.renderer.updateVisuals(m, eff * m.speed); // presentational animation/VFX only
      this.renderer.draw(m);
      this.refreshHud(true);
      if (m.state === 'won' || m.state === 'lost') this.endMatch();
    },

    refreshHud(light) {
      const m = this.match; if (!m) return;
      $('#hLives').textContent = m.lives;
      $('#hGold').textContent = fmt(Math.floor(m.gold));
      $('#hWave').textContent = m.waveIndex;
      const w = RS.WEATHER[m.weather];
      $('#hWeather').innerHTML = `${m.isNight ? '🌙 ' : '☀ '}${m.weather}${m.nextWeather ? ` → <em>${m.nextWeather}</em>` : ''}`;
      const wb = $('#btnWave');
      if (m.state === 'won' || m.state === 'lost') { wb.style.display = 'none'; }
      else if (m.waveActive) { wb.innerHTML = `⏩ Call Early <small>+${Math.round(m.waveTimeLeft * RS.WAVE.callEarlyBonusPerSec)}g</small>`; }
      else { wb.innerHTML = `▶ Start Wave ${m.waveIndex + 1} <small>R</small>`; }
      if (!light) this._refreshPreview();
      else if ((this._pvWave !== m.waveIndex) ) { this._refreshPreview(); this._pvWave = m.waveIndex; }
      // trays enable/disable by affordability
      $$('.trayitem', document).forEach((b) => { const t = RS.TOWER_BY_ID[b.dataset.place]; b.classList.toggle('poor', m.gold < t.cost); });
      // keep the selected-tower panel live WITHOUT tearing it down every frame —
      // full innerHTML rebuilds here used to replace #upBtn/#sellBtn ~60x/sec,
      // so a click's mousedown/mouseup could land on two different DOM nodes and
      // the browser silently dropped it (the "upgrade/sell don't work" bug).
      this._syncSelected();
    },

    // Rebuilds the panel only when its structural shape actually changed
    // (selection swapped, placement toggled, tower leveled up); otherwise just
    // patches live numbers on the EXISTING nodes so buttons stay clickable.
    _selSignature(sel) {
      if (this.placing) return 'placing:' + this.placing.id;
      if (!sel) return 'none';
      return ['sel', sel.uid, sel.level, sel.ascended ? 1 : 0, sel.def.traits.active ? 1 : 0].join(':');
    },
    _syncSelected() {
      const sig = this._selSignature(this.selectedTower);
      if (sig !== this._selRenderedSig) { this.refreshSelected(); return; }
      this._liveUpdateSelected();
    },
    _liveUpdateSelected() {
      const sel = this.selectedTower; const m = this.match;
      if (!sel || this.placing || !m) return;
      const box = $('#hSelected'); if (!box) return;
      const statsEl = box.querySelector('.sel-stats');
      if (statsEl) statsEl.textContent = `DPS ${fmt(sel.damage * sel.fireRate * sel.buff.dmg)} · rng ${Math.round(m._effectiveRange(sel))} · ${sel.def.damageType}`;
      const upBtn = $('#upBtn', box);
      if (upBtn) {
        const upCost = m.upgradeCost(sel);
        const needBranch = sel.level === 3;
        const needDup = sel.level === 4 && Meta.ownedCount(sel.def.id) < 2;
        const canUp = sel.level < 5 && m.gold >= upCost && !needDup;
        upBtn.classList.toggle('disabled', !canUp);
        upBtn.textContent = `${needBranch ? 'Choose Path' : 'Upgrade'} (${upCost}g)`;
      }
      const sellBtn = $('#sellBtn', box);
      if (sellBtn) sellBtn.textContent = `Sell (+${Math.round(sel.invested * 0.7)}g)`;
      const actBtn = $('#actBtn', box);
      if (actBtn && sel.def.traits.active) {
        actBtn.classList.toggle('active-ready', sel.activeReady);
        actBtn.classList.toggle('disabled', !sel.activeReady);
        actBtn.textContent = `${sel.def.traits.active.name}${sel.activeReady ? '' : ' (' + Math.ceil(sel.activeCd) + 's)'}`;
      }
    },

    _refreshPreview() {
      const m = this.match; const pv = m.pendingWavePreview; if (!pv) return;
      const comp = Object.entries(pv.comp).map(([n, c]) => `<span>${c}× ${n}</span>`).join('');
      $('#hPreview').innerHTML = `<div class="pv-head">Next: Wave ${pv.n} <em>${pv.arch}</em></div>
        <div class="pv-tags">${pv.tags.map((t) => `<i class="tag t-${t.toLowerCase()}">${t}</i>`).join('')}</div>
        <div class="pv-comp">${comp}</div>`;
    },

    refreshSelected() {
      const sel = this.selectedTower;
      const box = $('#hSelected'); if (!box) return;
      this._selRenderedSig = this._selSignature(sel); // full rebuild below matches this shape now
      if (this.placing) {
        const t = this.placing;
        box.innerHTML = `<div class="sel-head"><b>Placing: ${t.name}</b><button class="cancel" id="cancelPlace">✕</button></div>
          <div class="sel-stats">${t.rarity} · ${t.cost}g · ${t.damageType} · range ${t.rangeT}t</div>
          <div class="sel-hint">Click a valid tile to place · click the tray icon again to cancel · Esc also cancels.</div>`;
        $('#cancelPlace').onclick = () => { this.placing = null; this.renderer.ghost = null; $$('.trayitem').forEach((b) => b.classList.remove('active')); this.refreshSelected(); };
        return;
      }
      if (!sel) { box.innerHTML = ''; return; }
      const m = this.match;
      const upCost = m.upgradeCost(sel);
      const canUp = sel.level < 5 && m.gold >= upCost;
      const needBranch = sel.level === 3;
      const needDup = sel.level === 4 && Meta.ownedCount(sel.def.id) < 2;
      const UP = RS.TOWER_UPGRADES[sel.def.id] || {};
      const rc = RS.rarityColor(sel.def.rarity);
      let upName = 'Upgrade', upDesc = '';
      if (sel.level === 1 && UP.l2) { upName = UP.l2.n; upDesc = UP.l2.d; }
      else if (sel.level === 2 && UP.l3) { upName = UP.l3.n; upDesc = UP.l3.d; }
      else if (sel.level === 3) { upName = 'Choose Path'; upDesc = 'Pick a permanent specialisation below.'; }
      else if (sel.level === 4) { upName = UP.ascend || 'Ascension'; upDesc = sel.def.ascend.desc; }
      box.innerHTML = `<div class="sel-head" style="--rc:${rc}"><b>${sel.def.name}</b> <span class="dmgicon di-${sel.def.damageType.toLowerCase()}" title="${sel.def.damageType}">${RS.dmgIcon(sel.def.damageType)}</span> <span class="lvl">L${sel.level}${sel.ascended ? ' ✦' : ''}</span><button class="cancel" id="deselBtn">✕</button></div>
        <div class="sel-stats">DPS ${fmt(sel.damage * sel.fireRate * sel.buff.dmg)} · rng ${Math.round(m._effectiveRange(sel))} · ${sel.def.damageType}</div>
        <div class="sel-targets">Target: ${['First', 'Last', 'Strongest', 'Weakest', 'Closest', 'Most-Clustered'].map((mo) => `<button class="tbtn ${sel.targeting === mo ? 'on' : ''}" data-target="${mo}">${mo}</button>`).join('')}</div>
        ${sel.level < 5 ? `<div class="sel-upname r-${sel.def.rarity.toLowerCase().replace('+', 'plus')}" style="--rc:${rc}"><b>➜ ${upName}</b><span>${upDesc}</span></div>` : ''}
        <div class="sel-actions">
          ${sel.level < 5 ? `<button id="upBtn" class="${canUp && !needDup ? '' : 'disabled'}">${needBranch ? 'Choose Path' : 'Upgrade'} (${upCost}g)</button>` : '<span class="maxed">MAX ✦</span>'}
          ${needDup ? '<span class="hint">Need duplicate to Ascend</span>' : ''}
          ${sel.def.traits.active ? `<button id="actBtn" class="${sel.activeReady ? 'active-ready' : 'disabled'}">${sel.def.traits.active.name}${sel.activeReady ? '' : ' (' + Math.ceil(sel.activeCd) + 's)'}</button>` : ''}
          ${m.diff.noSell ? '' : `<button id="sellBtn" class="sell">Sell (+${Math.round(sel.invested * 0.7)}g)</button>`}
        </div>
        ${needBranch ? `<div class="branchpick">${sel.def.upgrades.branch.map((b, i) => `<button data-branch="${i}"><b>${b.name}</b><span>${b.desc}</span></button>`).join('')}</div>` : ''}`;
      $('#deselBtn').onclick = () => { this.selectedTower = null; this.renderer.selected = null; this.refreshSelected(); };
      $$('[data-target]', box).forEach((b) => b.onclick = () => { sel.targeting = b.dataset.target; this.refreshSelected(); });
      const up = $('#upBtn'); if (up && !needBranch) up.onclick = () => { if (m.upgrade(sel)) this.refreshSelected(); };
      $$('[data-branch]', box).forEach((b) => b.onclick = () => { if (m.upgrade(sel, +b.dataset.branch)) this.refreshSelected(); });
      const act = $('#actBtn'); if (act) act.onclick = () => { m.activateTower(sel); };
      const sell = $('#sellBtn'); if (sell) sell.onclick = () => { m.sell(sel); this.selectedTower = null; this.renderer.selected = null; this.refreshSelected(); };
    },

    /* --------------------------- match input -------------------------- */
    _bindCanvas() {
      const cv = this.canvas; if (!cv) return;
      const toTile = (ev) => { const r = cv.getBoundingClientRect(); const sx = cv.width / r.width, sy = cv.height / r.height; const x = (ev.clientX - r.left) * sx, y = (ev.clientY - r.top) * sy; return { x, y, c: (x / RS.TILE) | 0, r: (y / RS.TILE) | 0 }; };
      cv.onmousemove = (ev) => { const t = toTile(ev); this.renderer.hover = { c: t.c, r: t.r }; this._mouse = t; };
      cv.onmouseleave = () => { this.renderer.hover = null; };
      cv.onclick = (ev) => {
        const m = this.match; if (!m) return; const t = toTile(ev);
        if (this.placing) {
          const res = m.place(this.placing, t.c, t.r);
          if (res.ok) { if (!(ev.shiftKey)) { this.placing = null; this.renderer.ghost = null; $$('.trayitem').forEach((b) => b.classList.remove('active')); } this.refreshSelected(); }
          else this.toast(res.reason, RS.PALETTE.bad);
          return;
        }
        // select a tower
        let hit = null, bd = 1e9;
        for (const tw of m.towers) { const d = (tw.x - t.x) ** 2 + (tw.y - t.y) ** 2; if (d < 22 * 22 && d < bd) { bd = d; hit = tw; } }
        this.selectedTower = hit; this.renderer.selected = hit; this.refreshSelected();
      };
    },

    _bindGlobalKeys() {
      window.addEventListener('keydown', (e) => {
        if (this.screen !== 'match' || !this.match) {
          if (this.screen === 'roll' && (e.key === 'r' || e.key === 'R')) this.doRoll('Basic', 1);
          return;
        }
        const m = this.match;
        if (e.key >= '1' && e.key <= '9') { const idx = +e.key - 1; if (this.workingLoadout[idx]) this.selectPlacement(this.workingLoadout[idx]); }
        else if (e.code === 'Space') { e.preventDefault(); this.togglePause(); }
        else if (e.key === 'f' || e.key === 'F') this.cycleSpeed();
        else if (e.key === 'r' || e.key === 'R') this.onWaveButton();
        else if (e.key === 'Escape') { if (this.placing) { this.placing = null; this.renderer.ghost = null; $$('.trayitem').forEach((b) => b.classList.remove('active')); } else { this.selectedTower = null; this.renderer.selected = null; } this.refreshSelected(); }
        else if (e.key === 'Tab') { e.preventDefault(); this._tabRange = !this._tabRange; }
      });
    },

    /* -------------------------- match resolve ------------------------- */
    endMatch() {
      const m = this.match; if (this._ended) return; this._ended = true;
      const won = m.state === 'won';
      // record codex from encountered
      m.encountered.forEach((k) => { if (k.startsWith('enemy:')) Meta.seeEnemy(k.slice(6)); });
      // rewards
      const rewards = { copper: 0, silver: 0, gold: 0, relic: 0, xp: 0 };
      const loot = m.map.rewardMult || 1; // harder maps pay more (§ map ratings)
      rewards.copper = Math.round(m.copperEarned * loot);
      rewards.xp = m.waveIndex * RS.ACCOUNT.xpPerWave;
      if (won) {
        rewards.xp += RS.ACCOUNT.xpPerMapClear;
        rewards.silver = Math.round(RS.ECON.silverPerMap * m.diff.tokenMult * loot);
        if (m.diff.order >= 2) rewards.gold = Math.round(3 * m.diff.tokenMult * loot);
        if (m.diff.order >= 3) rewards.relic = m.diff.purple ? 6 : 2;
        if (m.goldFromBoss) { rewards.gold += m.goldFromBoss * RS.ECON.goldPerBossKill; rewards.xp += RS.ACCOUNT.xpPerBoss; }
        // Hard clear grants a Super roll ticket
        if (m.diff.id === 'Hard') Meta.p.rolls.Super += 1;
        // Purple Nightmare grants a Divine ticket + the Frostcrown cosmetic
        if (m.diff.purple) { Meta.p.rolls.Divine = (Meta.p.rolls.Divine || 0) + 1; Meta.p.cosmetics = Meta.p.cosmetics || {}; if (!Meta.p.cosmetics[m.diff.cosmetic]) { Meta.p.cosmetics[m.diff.cosmetic] = true; this._newCosmetic = m.diff.cosmetic; } }
        Meta.recordClear(m.map.id, m.diff.id, m.stars, true);
      }
      Meta.grant('copper', rewards.copper); Meta.grant('silver', rewards.silver);
      Meta.grant('gold', rewards.gold); Meta.grant('relic', rewards.relic);
      const leveled = Meta.addXp(rewards.xp);
      // objective: kills by family
      for (const fam in m.killsByFamily) Meta.updateObjective('killFamily', m.killsByFamily[fam], fam);
      Meta.updateObjective('kill', m.totalKills);
      Meta.p.stats.kills += m.totalKills;
      Meta.save();
      this._lastRewards = rewards; this._lastLeveled = leveled;
      setTimeout(() => { this._ended = false; this.show('summary'); }, 400);
    },

    renderSummary() {
      const m = this.match; const won = m.state === 'won'; const r = this._lastRewards;
      // damage by tower chart
      const rows = Object.entries(m.dmgByTower).map(([uid, dmg]) => { const tw = m.towers.find((t) => t.uid === +uid) || { def: { name: 'Sold/Lost tower' } }; return { name: tw.def.name, dmg }; }).sort((a, b) => b.dmg - a.dmg).slice(0, 8);
      const maxDmg = rows.length ? rows[0].dmg : 1;
      const total = Object.values(m.dmgByTower).reduce((a, b) => a + b, 0) || 1;
      this.root.innerHTML = this._topbar() + `
        <div class="page summary">
          <div class="summary-banner ${won ? 'win' : 'lose'}">${won ? '🏆 VICTORY' : '💀 DEFEAT'}</div>
          <h2>${m.map.name} · ${m.diff.id}</h2>
          ${won ? `<div class="stars-big">${star(m.stars)}</div><div class="starnote">1★ clear · 2★ no leaks · 3★ no leaks + ≤${RS.STAR3_TOWER_CAP} towers</div>` : `<div class="starnote">Reached wave ${m.waveIndex} of ${m.maxWaves > 900 ? '∞' : m.maxWaves}</div>`}
          <div class="rewards">
            <div class="rw"><b>${fmt(r.copper)}</b><span>Copper</span></div>
            <div class="rw"><b>${fmt(r.silver)}</b><span>Silver</span></div>
            <div class="rw"><b>${fmt(r.gold)}</b><span>Gold</span></div>
            <div class="rw"><b>${fmt(r.relic)}</b><span>Relics</span></div>
            <div class="rw"><b>${fmt(r.xp)}</b><span>XP</span></div>
          </div>
          ${this._lastLeveled ? `<div class="levelup">⬆ Account Level ${Meta.p.account.level}! ${RS.ACCOUNT.unlocks[Meta.p.account.level] || ''}</div>` : ''}
          ${this._newCosmetic ? `<div class="levelup" style="border-color:#9b59b6;color:#c79bff">👑 Cosmetic unlocked: ${this._newCosmetic}!</div>` : ''}
          <h3>Damage by Tower</h3>
          <div class="dmgchart">
            ${rows.length ? rows.map((row) => `<div class="dmgrow"><span>${row.name}</span><div class="bar"><i style="width:${row.dmg / maxDmg * 100}%"></i></div><em>${fmt(row.dmg)} · ${Math.round(row.dmg / total * 100)}%</em></div>`).join('') : '<em>No damage recorded.</em>'}
          </div>
          <div class="summary-actions">
            <button class="bigbtn" data-go="mapselect">Map Select</button>
            ${won && !m.diff.purple && !m.map.winter && m.diff.order < 3 ? `<button class="bigbtn hl" id="nextTier">Next Tier ▶</button>` : ''}
            <button class="bigbtn" id="replayBtn">Replay</button>
            <button class="bigbtn" data-go="roll">Go Roll 🎲</button>
          </div>
        </div>`;
      this._wireGo();
      const nb = $('#nextTier'); if (nb) nb.onclick = () => { this.selectedDiff = RS.DIFF_BY_ID[this._nextDiffId(m.diff)]; this.workingLoadout = this.workingLoadout.slice(); this.show('loadout'); };
      $('#replayBtn').onclick = () => { this.show('loadout'); };
      this._newCosmetic = null;
      this.match = null;
    },
    _nextDiffId(diff) { const order = Math.min(3, diff.order + 1); return RS.DIFFICULTY[order].id; },

    _bindBus() {
      RS.bus.on('boss-spawn', (def) => { if (this.screen === 'match') this.toast('⚠ BOSS: ' + def.name, RS.PALETTE.blood); Meta.seeEnemy(def.id); });
      RS.bus.on('weather-telegraph', (w) => { if (this.screen === 'match') this.toast('Incoming weather: ' + w, RS.PALETTE.frost); });
      RS.bus.on('consume-dup', (id) => Meta.consumeDuplicate(id));
      RS.bus.on('level-up', (lvl) => { if (this.screen === 'match') this.toast('Account Level ' + lvl + '!', RS.PALETTE.gold); });
      RS.bus.on('objective-done', (o) => this.toast('Objective complete: ' + o.desc, RS.PALETTE.good));
      RS.bus.on('wave-clear', () => RS.Audio && RS.Audio.coin());
      RS.bus.on('match-won', () => RS.Audio && RS.Audio.win());
      RS.bus.on('match-lost', () => RS.Audio && RS.Audio.lose());
    },
  };

  RS.UI = UI;
})();
