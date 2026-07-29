/** Reports how many distinct particle signatures the skill list produces. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4222;
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
  const P = await import('/src/fx/Particles.ts');
  const valid = new Set(P.emitterIds ? P.emitterIds() : []);

  const combos = new Set();
  const missing = new Set();
  let n = 0;
  for (const s of SK.SKILLS) {
    if (s.targeting === 'passive') continue;
    n++;
    const sig = SR.particleFor(s.id, s.damageType ?? 'physical');
    combos.add(`${sig.emitter}|${sig.trail}|${sig.density.toFixed(2)}|${sig.size.toFixed(2)}`);
    if (valid.size) {
      if (!valid.has(sig.emitter)) missing.add(sig.emitter);
      if (!valid.has(sig.trail)) missing.add(sig.trail);
    }
  }
  return { activeSkills: n, distinctSignatures: combos.size, unknownEmitters: [...missing] };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.kill('SIGTERM');
process.exit(0);
