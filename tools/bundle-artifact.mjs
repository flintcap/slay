/**
 * Folds the single-chunk build into one self-contained HTML document suitable
 * for publishing as an artifact.
 *
 * The artifact host wraps the file in its own <!doctype>/<html>/<head>/<body>,
 * so this emits page content only — a <title>, the inlined stylesheet, the
 * game's markup, and the inlined module script.
 *
 * Downloaded art and sound (`public/assets/`) is not inlined: it is far too big
 * for one page. It is published beside the page with the artifact's `files`
 * option instead. This script writes that mapping to `dist-single/files.json`
 * as `{ "assets/textures/x.webp": "public/assets/textures/x.webp", ... }`
 * (published path, relative to the page -> source path, relative to the repo
 * root), the shape the `files` option takes. The game fetches each one by the
 * same relative path (`core/Assets.ts` `assetUrl`), and falls back when one is
 * missing, so a page published without them still runs.
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Run the single-file build here rather than trusting whatever is on disk.
//
// This script reads dist-single/bundle.*, which come from vite.config.single.ts
// — a different config from the plain `npm run build` that produces dist/. That
// difference silently shipped a days-old build to the artifact: everything
// typechecked, everything built, the bundle was written, and none of the new
// work was in it. Building here makes that impossible.
console.log('building single-file bundle...');
execFileSync('npx', ['vite', 'build', '--config', 'vite.config.single.ts'], {
  stdio: ['ignore', 'ignore', 'inherit'],
});

const css = readFileSync('dist-single/bundle.css', 'utf8');
let js = readFileSync('dist-single/bundle.js', 'utf8');

// Belt and braces: refuse to publish a bundle older than the newest source
// file, whatever the reason.
function newestSource(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestSource(full) : statSync(full).mtimeMs);
  }
  return newest;
}
const builtAt = statSync('dist-single/bundle.js').mtimeMs;
const srcAt = newestSource('src');
if (builtAt < srcAt) {
  console.error('bundle.js is older than src/ — refusing to publish a stale artifact.');
  process.exit(1);
}

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

// The asset files to publish beside the page. Run the asset checker first so
// an unlisted or over-budget file never ships.
try {
  execFileSync('node', ['tools/check-assets.mjs'], { stdio: 'inherit' });
} catch {
  console.error('check-assets failed — fix ASSETS.md or the files before publishing.');
  process.exit(1);
}
function assetFiles(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) assetFiles(full, out);
    else if (entry.name !== '.keep') out.push(full);
  }
  return out;
}
const files = {};
let assetBytes = 0;
for (const full of assetFiles('public/assets').sort()) {
  const src = full.split(path.sep).join('/');
  files[src.replace(/^public\//, '')] = src;
  assetBytes += statSync(full).size;
}
writeFileSync('dist-single/files.json', JSON.stringify(files, null, 2) + '\n');
const count = Object.keys(files).length;
console.log(
  `wrote dist-single/files.json (${count} asset files, ${(assetBytes / 1024 / 1024).toFixed(1)} MB)` +
    (count > 255 ? ' — more than 255 files: publish in several calls to the same url' : ''),
);
