/**
 * Fires every active skill of a class under controlled conditions and prints
 * what each one actually did.
 *
 * Identical setup per skill: the player stood at the level entrance, full mana,
 * no cooldown, no action lock, and a live monster pinned three metres in front
 * so its own movement cannot decide the result. Nothing is inferred — a skill
 * that reports no damage and no effects did nothing.
 *
 *   npm run build && node tools/check-skills.mjs --classes=warden,shadowblade,ranger
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const CLASSES = String(args.classes ?? 'warden,shadowblade,ranger').split(',');
const PORT = Number(args.port ?? 4247);

/** The weapon each class is meant to fight with, so no test is weapon-starved. */
const WEAPON = {
  warden: 'sword.short',
  shadowblade: 'dagger.dirk',
  ranger: 'bow.short',
  pyromancer: 'wand.wand',
  stormcaller: 'wand.wand',
  revenant: 'wand.bone',
};

if (!existsSync('dist/index.html')) {
  console.error('No dist/ build. Run `npm run build` first.');
  process.exit(1);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await sleep(500);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 900000, polling: 500 });

const all = {};
for (const cls of CLASSES) {
  const rows = await page.evaluate(
    async ([c, weapon]) => {
      window.SLAY.debug.makeCharacter(c, 60);
      window.SLAY.debug.equip(weapon, 40);
      await window.SLAY.engine.goTo('dungeon', { depth: 3 });
      for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
      window.SLAY.debug.godMode(true);
      return window.SLAY.debug.skillAudit(c);
    },
    [cls, WEAPON[cls] ?? 'sword.short']
  );
  all[cls] = rows;

  console.log(`\n${'='.repeat(96)}\n${cls.toUpperCase()}  (${rows.length} active skills)\n${'='.repeat(96)}`);
  console.log(
    'skill'.padEnd(19) + 'effect'.padEnd(20) + 'fire'.padEnd(6) + 'clip'.padEnd(9) +
      'fx'.padEnd(4) + 'burst'.padEnd(6) + 'sfx'.padEnd(5) + 'buff'.padEnd(5) + 'hits'.padEnd(5) + 'dmg'
  );
  console.log('-'.repeat(96));
  for (const r of rows) {
    if (r.error) {
      console.log(`${String(r.id).padEnd(20)}THREW: ${r.error}`);
      continue;
    }
    console.log(
      String(r.id).padEnd(19) +
        String(r.effect ?? '-').padEnd(20) +
        String(r.fired).padEnd(6) +
        String(r.clip ?? '-').padEnd(9) +
        String(r.effects).padEnd(4) +
        String(r.bursts).padEnd(6) +
        String(r.sfx).padEnd(5) +
        String(r.buffs).padEnd(5) +
        String(r.hits).padEnd(5) +
        String(r.damage)
    );
  }

  // "Did nothing" means nothing at all: no damage, no tracked effect, no
  // particles, no sound, no buff. Any one of those is a skill doing something.
  const dead = rows.filter(
    (r) => !r.error && r.fired && !r.effects && !r.bursts && !r.sfx && !r.buffs && !r.hits
  );
  const silent = rows.filter(
    (r) => !r.error && r.fired && !r.hits && (r.effects || r.bursts || r.sfx || r.buffs)
  );
  const refused = rows.filter((r) => !r.error && !r.fired);
  const threw = rows.filter((r) => r.error);
  console.log(
    `\n  refused to cast: ${refused.length}` +
      `   cast but did nothing: ${dead.length}` +
      `   threw: ${threw.length}` +
      `   working: ${rows.length - refused.length - dead.length - threw.length}`
  );
  if (refused.length) console.log('  refused: ' + refused.map((r) => r.id).join(', '));
  if (dead.length) console.log('  did nothing: ' + dead.map((r) => r.id).join(', '));
  if (silent.length) console.log('  visual only, no damage: ' + silent.map((r) => r.id).join(', '));
  if (threw.length) console.log('  threw: ' + threw.map((r) => `${r.id} (${r.error})`).join('; '));
}

writeFileSync('shots/skill-audit.json', JSON.stringify(all, null, 1));
console.log('\nwrote shots/skill-audit.json');
if (pageErrors.length) {
  console.log(`\n${pageErrors.length} page errors:`);
  for (const e of [...new Set(pageErrors)].slice(0, 20)) console.log('  ' + e);
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);
