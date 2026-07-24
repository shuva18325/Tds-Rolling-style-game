/* Bundles the modular REALM SIEGE into ONE self-contained HTML fragment for a
 * Claude Artifact (strict CSP, no external requests). Inlines all CSS + JS in
 * dependency order. The artifact host wraps this in <!doctype>/<head>/<body>,
 * so we emit only <style>, the mount divs, and one <script>. Run: node build-artifact.js */
const fs = require('fs');
const path = require('path');
const base = __dirname;
const read = (f) => fs.readFileSync(path.join(base, f), 'utf8');

const cssFiles = ['css/style.css', 'css/art.css'];
const jsFiles = [
  'js/core.js', 'data/palette.js', 'data/config.js', 'data/artstyle.js',
  'data/towers.js', 'data/enemies.js', 'data/maps.js',
  'js/combat.js', 'js/match.js', 'js/meta.js',
  'js/vfx.js', 'js/sprites.js', 'js/render.js', 'js/ui.js', 'js/main.js',
];

const css = cssFiles.map((f) => `/* ===== ${f} ===== */\n` + read(f)).join('\n\n');
// Guard against any stray "</script>" inside string literals breaking the tag.
const js = jsFiles.map((f) => `/* ===== ${f} ===== */\n` + read(f)).join('\n;\n')
  .replace(/<\/script>/g, '<\\/script>');

const out = `<style>
${css}
</style>

<!-- REALM SIEGE — single-file build. Play: rolls, 12 maps, 4 difficulties. -->
<div id="app"></div>
<div id="matchWrap" style="display:none"></div>
<div id="toasts"></div>

<script>
${js}
</script>
`;

fs.writeFileSync(path.join(base, 'realm-siege.html'), out);
console.log('Wrote realm-siege.html (%d KB)', Math.round(out.length / 1024));
