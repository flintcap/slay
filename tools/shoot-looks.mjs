/**
 * Look survey renders (qa-looks): per biome, the hero in a middle room with
 * the monsters left in, so it shows how they read against that ground. One
 * boot; render two or three biomes per run (a new biome loads slowly under
 * software rendering).
 *
 *   npm run build
 *   SLAY_PORT=4332 timeout 2700 node tools/shoot-looks.mjs --out=shots/qa-looks --biomes=crypt,hell
 *   ... --class=ranger   the hero (default warden)
 *   ... --wait=90        frames to let the monsters come on before the shot
 */
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { bootGame, frames } from './lib/game.mjs';

const arg = (k, d) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const OUT = path.resolve(arg('out', 'shots/qa-looks'));
const BIOMES = String(arg('biomes', 'crypt')).split(',').filter(Boolean);
const CLS = arg('class', 'warden');
const WAIT = Number(arg('wait', 90));
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const log = (m) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const { page, close, pageErrors } = await bootGame({ fallbackPort: 4332, preview: true, viewport: { width: 1024, height: 576 } });
log('booted');
await page.addStyleTag({ content: '.story-card { display: none !important; }' });
let ok = true;
const shoot = async (name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, timeout: 600000 });
  const kb = Math.round(statSync(file).size / 1024);
  log(`${kb < 20 ? 'BLANK' : 'ok   '} ${name} ${kb} KB`);
  if (kb < 20) ok = false;
};
try {
  await page.evaluate((c) => window.SLAY.debug.makeCharacter(c, 20, 7), CLS);
  for (const b of BIOMES) {
    try {
      const info = await page.evaluate(async (biome) => {
        const s = window.SLAY;
        await s.debug.previewBiome(biome, 8, false);
        const sc = s.engine.currentScene;
        const i = sc.run.levels.findIndex((l) => l.biome === biome || (l.zones ?? []).some((z) => z.biome === biome));
        if (i >= 0 && i !== sc.levelIndex) await sc.loadLevel(i);
        s.debug.godMode(true);
        const rooms = sc.level.rooms.filter((r) => r.kind !== 'entry' && r.kind !== 'exit');
        // The room with the most monsters in it, so they are in the frame.
        const near = (r) => {
          const w = sc.mesh.tileToWorld(r.center.x, r.center.y);
          return (sc.enemies ?? []).filter((e) => Math.hypot(e.root.position.x - w.x, e.root.position.z - w.z) < 14).length;
        };
        const r = [...rooms].sort((a, b) => near(b) - near(a))[0] ?? sc.level.rooms[0];
        s.debug.warpTo({ x: Math.round(r.center.x), y: Math.round(r.center.y) });
        return { enemies: (sc.enemies ?? []).length, kinds: [...new Set((sc.enemies ?? []).map((e) => e.def?.id))].slice(0, 12) };
      }, b);
      log(`${b}: ${JSON.stringify(info)}`);
      await frames(page, 20);
      await shoot(`l-${b}-a`);
      await frames(page, WAIT);
      await shoot(`l-${b}-b`);
    } catch (e) {
      ok = false;
      log(`failed ${b}: ${String(e.message).slice(0, 200)}`);
    }
  }
} finally {
  if (pageErrors.length) console.log('page errors:\n  ' + pageErrors.slice(0, 10).join('\n  '));
  await close();
}
process.exit(ok ? 0 : 1);
