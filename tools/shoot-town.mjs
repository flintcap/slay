/**
 * Town look renders: one boot, the hero stood at a few spots round the town,
 * one frame each. For judging the buildings and dressing.
 *
 *   npm run build
 *   SLAY_PORT=4327 timeout 1500 node tools/shoot-town.mjs --out=shots/props --spots=fire,forge,shop,gate
 */
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { bootGame, frames } from './lib/game.mjs';

const arg = (k, d) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const OUT = path.resolve(arg('out', 'shots/props'));
const W = Number(arg('width', 1280));
const H = Number(arg('height', 720));
const SPOTS = {
  fire: [0, 4],
  forge: [-10, 8],
  shop: [10, 8],
  stash: [-9.5, -6],
  alchemy: [-4, -10.5],
  cairn: [9.5, -6.5],
  gate: [0, -15],
  south: [0, 14],
};
const want = String(arg('spots', 'fire,forge,shop,gate')).split(',').filter((s) => s in SPOTS);
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const log = (m) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const { page, close, pageErrors } = await bootGame({ fallbackPort: 4327, preview: true, viewport: { width: W, height: H } });
log('booted');
await page.addStyleTag({ content: '.story-card { display: none !important; }' });
let ok = true;
try {
  await page.evaluate(() => window.SLAY.debug.makeCharacter('warden', 20, 7));
  await page.evaluate(() => window.SLAY.engine.goTo('town'));
  await frames(page, 20);
  for (const name of want) {
    const [x, z] = SPOTS[name];
    await page.evaluate(([px, pz]) => {
      const sc = window.SLAY.engine.currentScene;
      sc.player.position.set(px, 0, pz);
    }, [x, z]);
    await frames(page, 40);
    const file = path.join(OUT, `town-${name}.png`);
    await page.screenshot({ path: file, timeout: 600000 });
    const kb = Math.round(statSync(file).size / 1024);
    log(`${kb < 20 ? 'BLANK' : 'ok   '} ${name} ${file} ${kb} KB`);
    if (kb < 20) ok = false;
  }
} catch (e) {
  ok = false;
  log(`failed: ${String(e.message).slice(0, 300)}`);
} finally {
  if (pageErrors.length) console.log('page errors:\n  ' + pageErrors.slice(0, 10).join('\n  '));
  await close();
}
process.exit(ok ? 0 : 1);
