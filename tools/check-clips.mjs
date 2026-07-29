/** Verifies every skill resolves to a real animation clip, and reports spread. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4221;
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
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 240)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 420000, polling: 500 });

const out = await page.evaluate(async () => {
  const SR = await import('/src/scenes/SkillRunner.ts');
  const SK = await import('/src/data/skills.ts');
  const IC = await import('/src/art/Icons.ts');

  const byClip = {};
  const perClass = {};
  for (const s of SK.SKILLS) {
    if (s.targeting === 'passive') continue;
    for (const hold of ['melee', 'ranged', 'caster']) {
      const c = SR.clipFor(s.effect, hold);
      byClip[c] = (byClip[c] ?? 0) + 1;
      (perClass[hold] ??= new Set()).add(c);
    }
  }

  // Icon uniqueness: hash each generated data URI.
  const seen = new Map();
  let dupes = 0;
  for (const s of SK.SKILLS) {
    const uri = IC.skillIconUri(s.id, s.effect, s.damageType, s.targeting === 'passive', s.icon);
    let h = 0;
    for (let i = 0; i < uri.length; i += 97) h = (h * 31 + uri.charCodeAt(i)) >>> 0;
    const k = `${h}:${uri.length}`;
    if (seen.has(k)) dupes++;
    else seen.set(k, s.id);
  }
  return {
    clips: byClip,
    clipsPerHold: Object.fromEntries(Object.entries(perClass).map(([k, v]) => [k, [...v].sort()])),
    totalSkills: SK.SKILLS.length,
    iconDuplicates: dupes,
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.kill('SIGTERM');
process.exit(0);
