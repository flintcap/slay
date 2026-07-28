/**
 * Screenshots the inventory panel with a geared character, so the live
 * character view can actually be looked at. Element-scoped, so it finishes even
 * though a full-scene render on this container does not.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4215;
const server = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200));
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const classes = process.argv.slice(2);
const list = classes.length ? classes : ['warden', 'shadowblade', 'stormcaller', 'oathkeeper', 'necromancer'];
mkdirSync('shots', { recursive: true });

for (const cls of list) {
  const strip = cls.endsWith(':bare');
  const made = await page.evaluate(async ([c, bare]) => {
    try {
      window.SLAY.debug.makeCharacter(c, bare ? 1 : 30);
      if (bare) {
        const ch = window.SLAY.save.account.current;
        for (const k of Object.keys(ch.equipment)) ch.equipment[k] = null;
      }
      window.SLAY.debug.fillInventory();
      window.SLAY.events.emit('ui:refresh', {});
      window.SLAY.events.emit('ui:open', { panel: 'inventory' });
      const ch = window.SLAY.save.account.current;
      return Object.entries(ch.equipment)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v.baseId}`)
        .join(' ');
    } catch (e) {
      return 'ERROR ' + String(e).slice(0, 120);
    }
  }, [cls.replace(':bare', ''), strip]);
  console.log(cls, '->', made);
  await page.waitForSelector('[data-panel="inventory"].is-open', { timeout: 120000 });
  await page.waitForTimeout(4000);
  const panel = await page.$('[data-panel="inventory"] .panel');
  const name = cls.replace(':', '-');
  await panel.screenshot({ path: `shots/paperdoll-${name}.png` });
  console.log(`wrote shots/paperdoll-${name}.png`);
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);
