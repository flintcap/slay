/**
 * Veil's first cast must not link new shaders: the see-through hero is
 * compiled behind the loading curtain. Enters a level as a Shadowblade,
 * counts the GPU programs, veils the hero, draws a second of frames and
 * counts again. Also reports the slowest frame after the veil.
 *
 *   npm run build && SLAY_PORT=4340 timeout 1500 node tools/check-veil-warm.mjs
 */
import { bootGame } from './lib/game.mjs';

const { page, close, pageErrors } = await bootGame({ fallbackPort: 4340, preview: true });
const r = await page.evaluate(async () => {
  const raf = () => new Promise((res) => requestAnimationFrame(res));
  window.SLAY.debug.makeCharacter('shadowblade', 20);
  window.SLAY.debug.equip('dagger.dirk', 20);
  await window.SLAY.engine.goTo('dungeon', { depth: 1 });
  for (let i = 0; i < 30; i++) await raf();
  const eng = window.SLAY.engine;
  const sc = eng.active;
  const progs = () => eng.renderer.gl.info.programs.length;
  const before = progs();
  sc.player.applyStatus('veiled', 10);
  let worst = 0;
  let t = performance.now();
  for (let i = 0; i < 30; i++) {
    await raf();
    const n = performance.now();
    worst = Math.max(worst, n - t);
    t = n;
  }
  return { before, after: progs(), worst: Math.round(worst), veiled: sc.player.status.has('veiled') };
});
console.log(r);
if (pageErrors.length) console.log('page errors:', pageErrors.slice(0, 5));
const ok = r.veiled && r.after === r.before;
console.log(ok ? 'check-veil-warm: PASS' : 'check-veil-warm: FAIL');
await close();
process.exit(ok ? 0 : 1);
