/**
 * Renders a contact sheet of real skill icons.
 *
 * The previous check hashed the PNG bytes and called them unique. Two icons
 * that differ only by a hue shift hash differently and look identical, so that
 * proved nothing. This one produces a picture to actually look at.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4223;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
  await sleep(500);
}
const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 240)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const tree = process.argv[2] ?? 'marksman';
const png = await page.evaluate(async (treeId) => {
  const IC = await import('/src/art/Icons.ts');
  const SK = await import('/src/data/skills.ts');
  const list = SK.SKILLS.filter((s) => s.treeId === treeId).slice(0, 24);

  const CELL = 88;
  const COLS = 6;
  const rows = Math.ceil(list.length / COLS);
  const cv = document.createElement('canvas');
  cv.width = COLS * CELL;
  cv.height = rows * (CELL + 16);
  const g = cv.getContext('2d');
  g.fillStyle = '#0f1116';
  g.fillRect(0, 0, cv.width, cv.height);
  g.font = '10px monospace';
  g.textAlign = 'center';

  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const uri = IC.skillIconUri(s.id, s.effect, s.damageType, s.targeting === 'passive', s.icon);
    const img = new Image();
    img.src = uri;
    await img.decode();
    const cx = (i % COLS) * CELL;
    const cy = Math.floor(i / COLS) * (CELL + 16);
    g.drawImage(img, cx + 6, cy + 4, CELL - 12, CELL - 12);
    g.fillStyle = '#aeb6c4';
    g.fillText(s.icon.slice(0, 13), cx + CELL / 2, cy + CELL + 6);
  }
  return cv.toDataURL('image/png');
}, tree);

mkdirSync('shots', { recursive: true });
writeFileSync(`shots/skillicons-${tree}.png`, Buffer.from(png.split(',')[1], 'base64'));
console.log(`wrote shots/skillicons-${tree}.png`);
await browser.close();
server.kill('SIGTERM');
process.exit(0);
