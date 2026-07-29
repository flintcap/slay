/** Confirms the account can hold several living characters and switch between them. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4219;
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
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 240)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const out = await page.evaluate(async () => {
  const CH = await import('/src/sim/Character.ts');
  const RNG = await import('/src/core/RNG.ts');
  const save = window.SLAY.save;
  const made = [];
  for (const [name, cls] of [['Aldra', 'warden'], ['Ves', 'ranger'], ['Nim', 'pyromancer']]) {
    const c = CH.createCharacter(name, cls, new RNG.Random(RNG.randomSeed()), 'seeker');
    save.setCharacter(c);
    made.push(`${c.name}/${c.classId}`);
  }
  const roster = save.roster.map((c) => `${c.name}/${c.classId}/lv${c.level}`);
  const backToFirst = save.selectCharacter(save.roster[save.roster.length - 1].id);
  const afterSwitch = save.account.current?.name;
  const gear = Object.entries(save.account.current?.equipment ?? {})
    .filter(([, v]) => v).map(([k, v]) => `${k}=${v.baseId}`);
  const potions = (save.account.current?.inventory ?? [])
    .filter((s) => s && s.baseId.startsWith('potion')).map((s) => s.baseId);
  save.deleteCharacter(save.roster[0].id);
  return {
    made, roster, switchedTo: afterSwitch, switchOk: !!backToFirst,
    gear, potions, afterDelete: save.roster.map((c) => c.name),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.kill('SIGTERM');
process.exit(0);
