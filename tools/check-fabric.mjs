/**
 * Bakes cloth/leather albedo + normal maps straight to a PNG contact sheet.
 *
 * No 3D render, so it finishes in seconds on a GPU-less container, and the
 * question being asked here — does the weave read as woven, or as static — is
 * answered by the texture itself.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4214;
const server = spawn(
  'npx',
  ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
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
const page = await browser.newPage({ viewport: { width: 1120, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 240)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const keys = process.argv.slice(2);
const png = await page.evaluate(async (list) => {
  const T = await import('/src/art/Textures.ts');
  const keysToDraw = list.length ? list : ['cloth.linen', 'cloth.silk', 'cloth.tattered', 'leather.worn', 'leather.studded', 'leather.fine'];

  const CELL = 256;
  const cv = document.createElement('canvas');
  cv.width = CELL * 2 + 24;
  cv.height = keysToDraw.length * (CELL + 22) + 8;
  const g = cv.getContext('2d');
  g.fillStyle = '#101216';
  g.fillRect(0, 0, cv.width, cv.height);
  g.font = '13px monospace';

  for (let i = 0; i < keysToDraw.length; i++) {
    const key = keysToDraw[i];
    const set = T.generateRawMaps(key, 1, CELL);
    const y = i * (CELL + 22) + 20;
    g.fillStyle = '#cfd6e2';
    g.fillText(key, 8, y - 6);
    const draw = (buf, x) => {
      const tmp = document.createElement('canvas');
      tmp.width = CELL;
      tmp.height = CELL;
      const tg = tmp.getContext('2d');
      const id = tg.createImageData(CELL, CELL);
      id.data.set(buf);
      tg.putImageData(id, 0, 0);
      g.drawImage(tmp, x, y, CELL, CELL);
    };
    draw(set.albedo, 8);
    draw(set.normal, CELL + 16);
  }
  return cv.toDataURL('image/png');
}, keys);

mkdirSync('shots', { recursive: true });
writeFileSync('shots/fabric.png', Buffer.from(png.split(',')[1], 'base64'));
console.log('wrote shots/fabric.png');
await browser.close();
server.kill('SIGTERM');
process.exit(0);
