/**
 * Folds the single-chunk build into one self-contained HTML document suitable
 * for publishing as an artifact.
 *
 * The artifact host wraps the file in its own <!doctype>/<html>/<head>/<body>,
 * so this emits page content only — a <title>, the inlined stylesheet, the
 * game's markup, and the inlined module script.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync('dist-single/bundle.css', 'utf8');
let js = readFileSync('dist-single/bundle.js', 'utf8');

// A literal </script> anywhere in the bundle's string data would close the tag
// early. Neutralise it without changing what the JS evaluates to.
js = js.replace(/<\/script/gi, '<\\/script');

const html = `<title>SLAY — Descend. Die. Descend Again.</title>

<style>
${css}
</style>

<canvas id="view"></canvas>

<!-- UI root: every panel mounts here, above the canvas. -->
<div id="ui"></div>

<!-- Scene transition curtain, driven by Engine.fadeTo(). -->
<div id="fade"></div>

<!-- Boot screen. Removed by main.ts once the first scene is live. -->
<div id="boot">
  <div class="boot-inner">
    <h1 class="boot-title">SLAY</h1>
    <p class="boot-sub">Descend. Die. Descend again.</p>
    <div class="boot-bar"><div class="boot-bar-fill" id="boot-fill"></div></div>
    <p class="boot-status" id="boot-status">Forging the world…</p>
  </div>
  <div class="boot-vignette"></div>
</div>

<noscript>
  <div style="color:#e8ddc8;font:16px system-ui;padding:40px">SLAY requires JavaScript and WebGL 2.</div>
</noscript>

<script type="module">
${js}
</script>
`;

writeFileSync('dist-single/slay.html', html);
const mb = (html.length / 1024 / 1024).toFixed(2);
console.log(`wrote dist-single/slay.html (${mb} MB)`);
