/**
 * The same frame, with one layer removed at a time.
 *
 *   node tools/shot-layers.mjs
 *
 * Reported three times now: big dark shapes on the floor, and lights that look
 * broken. Every attempt to name the culprit by reading code has been wrong, so
 * this stops arguing and renders the evidence: one frame as shipped, then the
 * same frame with the rock lid gone, then with the torch floor decals gone,
 * then with both. Whichever image loses the dark shapes names the layer.
 *
 * Writes to shots/layers-*.png.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4194;
const CHROME = '/opt/pw-browsers/chromium';
mkdirSync('shots', { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {
    /* wait */
  }
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
// Software rendering takes well over Playwright's 30s default to produce a
// frame, and a timed-out screenshot loses the whole run.
page.setDefaultTimeout(300000);
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.SLAY?.engine, null, { timeout: 240000 });

await page.evaluate(async () => {
  localStorage.clear();
  window.SLAY.save.hardReset();
  window.SLAY.debug.makeCharacter('warden', 5);
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
  for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
});

/** Turns named layers on or off and lets the frame settle. */
async function shot(name, hide) {
  const info = await page.evaluate(async (hideList) => {
    const mesh = window.SLAY.engine.currentScene?.mesh;
    if (!mesh) return { error: 'no dungeon' };
    const counts = {};
    mesh.root.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const n = o.name || '';
      const match =
        (hideList.includes('roof') && n === 'roof') ||
        (hideList.includes('tops') && n === 'wallTops') ||
        (hideList.includes('pools') && n === 'lightPools') ||
        (hideList.includes('shafts') && n === 'lightShafts') ||
        (hideList.includes('ceiling') && n === 'ceiling');
      if (hideList.length === 0) {
        o.visible = true;
      } else if (match) {
        o.visible = false;
        counts[n] = (counts[n] ?? 0) + 1;
      }
    });
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    return { counts, at: window.SLAY.engine.currentScene.player?.position?.toArray?.().map((v) => +v.toFixed(1)) };
  }, hide);
  const file = `shots/layers-${name}.png`;
  await page.screenshot({ path: file });
  // "Too dark" is an opinion until it is a number. Mean luminance over the play
  // area, with the HUD bands at the top and bottom cut out.
  const lum = await page.evaluate(async () => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const off = document.createElement('canvas');
    off.width = 160;
    off.height = 90;
    const g = off.getContext('2d');
    g.drawImage(c, 0, 0, 160, 90);
    const d = g.getImageData(0, 12, 160, 62).data;
    let sum = 0;
    let dark = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      sum += l;
      if (l < 0.06) dark++;
    }
    return { mean: +(sum / n).toFixed(3), nearBlack: +((dark / n) * 100).toFixed(1) };
  });
  console.log(
    `${name.padEnd(18)} hid ${JSON.stringify(info.counts ?? {}).padEnd(30)} lum ${lum?.mean ?? '?'}  near-black ${
      lum?.nearBlack ?? '?'
    }%`,
  );
}

// Reset visibility between shots by showing everything first.
await shot('1-as-shipped', []);
await shot('2-no-roof', ['roof']);
await shot('3-no-roof-pools', ['roof', 'pools']);
await shot('4-no-roof-shafts', ['roof', 'pools', 'shafts', 'ceiling']);
// Wall tops stopped dissolving when the see-through walls were fixed. In a
// cave or hive layout the wall mass is most of the map, so this is the shot
// that says whether the cure covers the screen.
await shot('5-no-wall-tops', ['tops']);
await shot('6-no-tops-no-roof', ['tops', 'roof', 'ceiling']);

await browser.close();
server.kill('SIGTERM');
process.exit(0);
