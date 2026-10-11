/**
 * Ground look renders: one frame per biome in the first area of a map, the
 * hero at the way in (or near the way on). Lean on purpose (one boot, no boss
 * warp, small frames) so it fits the 45 minute limit while other agents
 * render too.
 *
 *   npm run build
 *   SLAY_PORT=4322 timeout 2700 node tools/shoot-ground.mjs --out=shots/ground --biomes=crypt,darkForest
 *   ... --at=exit   stand near the way on instead of the way in
 *   ... --town      also the town
 */
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { bootGame, frames } from './lib/game.mjs';

const arg = (k, d) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const OUT = path.resolve(arg('out', 'shots/ground'));
const BIOMES = String(arg('biomes', 'crypt,darkForest')).split(',').filter(Boolean);
const AT = arg('at', 'entry');
const W = Number(arg('width', 1024));
const H = Number(arg('height', 576));
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const log = (m) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const { page, close, pageErrors } = await bootGame({ fallbackPort: 4322, preview: true, viewport: { width: W, height: H } });
log('booted');
let ok = true;
const shoot = async (name) => {
  await frames(page, 30);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, timeout: 600000 });
  const kb = Math.round(statSync(file).size / 1024);
  log(`${kb < 20 ? 'BLANK' : 'ok   '} ${name} ${file} ${kb} KB`);
  if (kb < 20) ok = false;
};
try {
  await page.evaluate(() => window.SLAY.debug.makeCharacter('warden', 20, 7));
  if (process.argv.includes('--town')) {
    await page.evaluate(() => window.SLAY.engine.goTo('town'));
    await shoot('g-town');
  }
  for (const b of BIOMES) {
    try {
      await page.evaluate(
        async ([biome, at]) => {
          const s = window.SLAY;
          await s.debug.previewBiome(biome, 8, false);
          s.debug.godMode(true);
          s.debug.warpTo(at);
        },
        [b, AT],
      );
      await shoot(`g-${b}${AT === 'entry' ? '' : '-' + AT}`);
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
