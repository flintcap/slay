/**
 * Do shrines, chests, breakables, bookcases and the vault lever actually work?
 *
 * Every one of these was authored in the prop tables with an `interact` payload,
 * placed by the generator and drawn by the builder. Nothing read the payload, so
 * the whole layer was scenery. This drives each family for real: teleport the
 * player onto the prop, press E, and check what changed.
 *
 *   npm run build && node tools/check-interact.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4241;

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
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('[scan]')) console.log(t);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SLAY?.debug, null, { timeout: 900000, polling: 500 });

const r = await page.evaluate(async () => {
  const frames = (n) => new Promise((res) => {
    let i = 0;
    const step = () => (++i >= n ? res() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

  window.SLAY.debug.makeCharacter('warden', 30);
  const out = { levelsScanned: 0, found: {}, results: [], errors: [] };

  // Walk floors until every family has been seen at least once.
  const want = ['shrine', 'chest', 'barrel', 'crate', 'urn', 'bookcase', 'lever', 'quest'];
  for (let depth = 1; depth <= 12 && want.some((f) => !out.found[f]); depth++) {
    await window.SLAY.engine.goTo('dungeon', { depth });
    await frames(30);
    const scene = window.SLAY.engine.currentScene;
    if (!scene || scene.id !== 'dungeon') continue;

    for (let li = 0; li < scene.run.levels.length && want.some((f) => !out.found[f]); li++) {
      if (li > 0) {
        scene.loadLevel(li);
        await frames(20);
      }
      out.levelsScanned++;
      const list = scene.mesh.interactables;
      console.log(`[scan] depth ${depth} level ${li} ${scene.level.layout} interactables=${list.length} still-missing=${want.filter((f) => !out.found[f]).join(',')}`);
      for (const family of want) {
        if (out.found[family]) continue;
        const it = list.find((x) => !x.used && x.kind.split('.')[0] === family);
        if (!it) continue;
        out.found[family] = true;

        const c = window.SLAY.save.account.current;
        const before = {
          ground: scene.loot.length,
          gold: c.gold,
          statuses: scene.player.statuses ? scene.player.statuses.length : -1,
        };

        // Stand on it, then press E exactly as the player would.
        scene.player.root.position.set(it.x, scene.player.root.position.y, it.z);
        if (scene.player.position !== scene.player.root.position) {
          scene.player.position.set(it.x, scene.player.position.y, it.z);
        }
        await frames(3);
        const prompt = scene.nearProp ? scene.nearProp.kind : null;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
        await frames(3);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
        await frames(8);

        const after = {
          ground: scene.loot.length,
          gold: c.gold,
          statuses: scene.player.statuses ? scene.player.statuses.length : -1,
        };
        out.results.push({
          family,
          payload: it.kind,
          prop: it.propKind,
          prompted: prompt,
          consumed: it.used === true,
          newGround: after.ground - before.ground,
          newStatuses: after.statuses - before.statuses,
          vaultOpen: scene.vaultOpen === true,
        });
      }
    }
  }
  return out;
});

await browser.close();
server.kill('SIGTERM');

console.log(`levels scanned: ${r.levelsScanned}\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('family', 10)} ${pad('payload', 14)} ${pad('prompted', 9)} ${pad('used', 5)} ${pad('drops', 6)} status`);
for (const x of r.results) {
  console.log(
    `${pad(x.family, 10)} ${pad(x.payload, 14)} ${pad(x.prompted ? 'yes' : 'NO', 9)} ${pad(x.consumed ? 'yes' : 'NO', 5)} ${pad(x.newGround, 6)} ${x.newStatuses > 0 ? `+${x.newStatuses}` : ''}`,
  );
}

const missing = ['shrine', 'chest', 'barrel', 'crate', 'urn', 'bookcase', 'lever', 'quest'].filter((f) => !r.found[f]);
if (missing.length) console.log(`\nnever found on any scanned floor: ${missing.join(', ')}`);

const broken = r.results.filter((x) => !x.prompted || !x.consumed);
if (broken.length) {
  console.log('\nBROKEN:');
  for (const x of broken) console.log(`  ${x.family} (${x.payload}) prompted=${!!x.prompted} used=${x.consumed}`);
}
const ok = broken.length === 0 && r.results.length > 0;
console.log(ok ? '\nOK — every interactable found responds to E.' : '\nFAILED');
process.exit(ok ? 0 : 1);
