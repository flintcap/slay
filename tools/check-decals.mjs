/**
 * Dumps the generated decal atlas to a contact sheet.
 *
 * Blood, gore and scorch are procedural masks; the only way to know whether
 * splatter reads as splatter rather than as a red circle is to look at the
 * texture the game actually bakes.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4217;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const png = await page.evaluate(async () => {
  const D = await import('/src/fx/Decals.ts');
  const tex = D.decalAtlasTexture ? D.decalAtlasTexture() : null;
  if (!tex) return null;
  const img = tex.image;
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const g = cv.getContext('2d');
  // Dark backdrop, so an alpha-masked stain is visible at all.
  g.fillStyle = '#2a2a2e';
  g.fillRect(0, 0, cv.width, cv.height);
  if (img instanceof HTMLCanvasElement || img instanceof ImageBitmap) {
    g.drawImage(img, 0, 0);
  } else {
    const tmp = document.createElement('canvas');
    tmp.width = img.width;
    tmp.height = img.height;
    const tg = tmp.getContext('2d');
    const id = tg.createImageData(img.width, img.height);
    id.data.set(img.data);
    tg.putImageData(id, 0, 0);
    g.drawImage(tmp, 0, 0);
  }
  return cv.toDataURL('image/png');
});

if (!png) {
  console.error('no atlas exported — add decalAtlasTexture() to Decals.ts');
  process.exit(1);
}
mkdirSync('shots', { recursive: true });
writeFileSync('shots/decals.png', Buffer.from(png.split(',')[1], 'base64'));
console.log('wrote shots/decals.png');
await browser.close();
server.kill('SIGTERM');
process.exit(0);
