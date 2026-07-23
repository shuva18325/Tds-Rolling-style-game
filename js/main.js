/* =========================================================================
 * REALM SIEGE — js/main.js
 * Bootstrap: load the persistent profile, init the UI, and run the single
 * requestAnimationFrame loop. Render is decoupled from the fixed-timestep
 * logic (which lives inside Match.frame). Autosaves periodically.
 * ========================================================================= */
(function () {
  'use strict';
  const RS = window.RS;

  function boot() {
    if (!RS || !RS.Meta) { console.error('REALM SIEGE failed to load modules'); return; }
    RS.Meta.load();
    RS.UI.init();

    let last = performance.now();
    let autosave = 0;

    function loop(t) {
      let dt = (t - last) / 1000;
      last = t;
      if (dt > 0.1) dt = 0.1; // clamp after tab-out
      if (RS.UI.screen === 'match' && RS.UI.match) {
        RS.UI.matchTick(dt);
      }
      autosave += dt;
      if (autosave > 20) { autosave = 0; RS.Meta.save(); }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // Save on exit.
    window.addEventListener('beforeunload', () => RS.Meta.save());
    console.log('REALM SIEGE v1.0 ready — %d towers, %d enemies, %d maps',
      RS.TOWERS.length, RS.ENEMIES.filter((e) => !e.hidden).length, RS.MAPS.length);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
