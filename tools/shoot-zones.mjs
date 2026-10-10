/**
 * One render per biome, taken inside a real map (docs/remake/maps.md).
 *
 *   npm run build
 *   SLAY_PORT=4321 timeout 2700 node tools/shoot-zones.mjs --out=shots/maps
 *
 * Opens maps at a spread of tiers and, for each zone in a biome not yet
 * shot, loads its area, stands the hero in the middle of the zone and takes
 * a frame. Stops when every biome is shot or the tiers run out.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { bootGame, frames } from './lib/game.mjs';

const arg = (k, d) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const OUT = path.resolve(arg('out', 'shots/maps'));
mkdirSync(OUT, { recursive: true });
const TIERS = [3, 8, 14, 20, 26, 34, 45, 60];

const { page, close, pageErrors } = await bootGame({ fallbackPort: 4321, preview: true });
const shot = new Set();
try {
  await page.evaluate(() => {
    localStorage.clear();
    window.SLAY.save.hardReset();
    window.SLAY.debug.makeCharacter('warden', 30);
  });
  for (const tier of TIERS) {
    await page.evaluate(async (t) => window.SLAY.engine.goTo('dungeon', { depth: t }), tier);
    await page.waitForFunction(() => window.SLAY.engine.currentSceneId === 'dungeon' && window.SLAY.engine.currentScene.level, null, {
      timeout: 600000,
      polling: 500,
    });
    await page.evaluate(() => window.SLAY.debug.godMode(true));
    const plan = await page.evaluate(() =>
      window.SLAY.engine.currentScene.run.levels.map((l) => (l.zones ?? []).map((z) => ({ id: z.id, biome: z.biome, name: z.name }))),
    );
    for (let li = 0; li < plan.length; li++) {
      const todo = plan[li].filter((z) => !shot.has(z.biome));
      if (!todo.length) continue;
      for (const z of todo) {
        const where = await page.evaluate(
          async ({ li, zid }) => {
            const s = window.SLAY.engine.currentScene;
            if (s.levelIndex !== li) s.loadLevel(li);
            for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
            const lvl = s.level;
            const zone = lvl.zones.find((q) => q.id === zid);
            const cx = zone.bounds.x + zone.bounds.w / 2;
            const cy = zone.bounds.y + zone.bounds.h / 2;
            let best = null;
            let bd = Infinity;
            for (let y = zone.bounds.y; y < zone.bounds.y + zone.bounds.h; y++) {
              for (let x = zone.bounds.x; x < zone.bounds.x + zone.bounds.w; x++) {
                const i = y * lvl.width + x;
                if (lvl.zoneOf[i] !== zid || lvl.tiles[i] !== 1) continue;
                const d = Math.hypot(x - cx, y - cy);
                if (d < bd) {
                  bd = d;
                  best = { x, y };
                }
              }
            }
            if (!best) return null;
            const w = s.mesh.tileToWorld(best.x, best.y);
            s.player.root.position.set(w.x, w.y, w.z);
            s.player.stop();
            s.rig.follow(s.player.root);
            s.rig.snap();
            for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
            return { tier: s.run.depth, map: s.run.map?.name };
          },
          { li, zid: z.id },
        );
        if (!where) continue;
        await frames(page, 10);
        const file = path.join(OUT, `${z.biome}.png`);
        await page.screenshot({ path: file });
        shot.add(z.biome);
        console.log(`shot  ${z.biome.padEnd(13)} ${z.name}  (${where.map}, tier ${where.tier})`);
      }
    }
  }
} finally {
  console.log(`${shot.size} biomes shot: ${[...shot].join(', ')}`);
  if (pageErrors.length) console.log(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
  await close();
}
