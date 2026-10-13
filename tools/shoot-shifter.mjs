/**
 * Shapeshifter renders: the man and his three forms close up, then a few of
 * his skills a moment after they go off. One boot, one dungeon floor (slow
 * under software rendering, so this is one run per milestone).
 *
 *   npm run build
 *   SLAY_PORT=4343 flock /tmp/slay-browser.lock timeout 1500 node tools/shoot-shifter.mjs --out=shots/shifter
 *   ... --skills=pounce,maul   which skills to shoot after the forms (default a few)
 *   ... --forms=0              skip the form shots
 */
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { bootGame, frames } from './lib/game.mjs';

const arg = (k, d) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const OUT = path.resolve(arg('out', 'shots/shifter'));
const SKILLS = String(arg('skills', 'rake,pounce,huntingHowl,worry,maul,hammerfall,ursaMajor')).split(',').filter(Boolean);
const FORMS = arg('forms', '1') !== '0';
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const log = (m) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const { page, close, pageErrors } = await bootGame({ fallbackPort: 4343, preview: true, viewport: { width: 960, height: 540 } });
log('booted');
await page.addStyleTag({ content: '.story-card, *:has(> .ob-head) { display: none !important; }' });

let ok = true;
const shoot = async (name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, timeout: 600000 });
  const kb = Math.round(statSync(file).size / 1024);
  log(`${kb < 20 ? 'BLANK' : 'ok   '} ${name} ${kb} KB`);
  if (kb < 20) ok = false;
};
/** Close in on the hero, a little from the side. */
const closeUp = (near) =>
  page.evaluate((n) => {
    const rig = window.SLAY.engine.currentScene.rig;
    rig.zoomBias = n ? -6 : -2;
    rig.distanceMul = n ? 0.5 : 0.8;
    rig.opts.lookAhead = 0;
    if (rig.opts.lookAheadMax !== undefined) rig.opts.lookAheadMax = 0;
  }, near);

try {
  await page.evaluate(() => window.SLAY.debug.makeCharacter('shapeshifter', 20, 7));
  await page.evaluate(() => window.SLAY.debug.previewBiome('crypt', 3, false));
  log('floor loaded');
  await page.evaluate(() => {
    const s = window.SLAY;
    s.debug.godMode(true);
    const sc = s.engine.currentScene;
    // A room with monsters in it, so the skills have something to hit.
    const rooms = sc.level.rooms.filter((r) => r.kind !== 'entry' && r.kind !== 'exit');
    const near = (r) => {
      const w = sc.mesh.tileToWorld(r.center.x, r.center.y);
      return (sc.enemies ?? []).filter((e) => Math.hypot(e.root.position.x - w.x, e.root.position.z - w.z) < 12).length;
    };
    const r = [...rooms].sort((a, b) => near(b) - near(a))[0] ?? sc.level.rooms[0];
    s.debug.warpTo({ x: Math.round(r.center.x), y: Math.round(r.center.y) });
  });
  if (FORMS) {
    await closeUp(true);
    for (const f of [null, 'cat', 'wolf', 'bear']) {
      const got = await page.evaluate((form) => window.SLAY.debug.shiftTo(form), f);
      await frames(page, 40);
      await shoot(`form-${f ?? 'man'}`);
      log(`form ${f ?? 'man'} -> ${got}`);
    }
  }
  await closeUp(false);
  for (const id of SKILLS) {
    try {
      const fired = await page.evaluate((s) => window.SLAY.debug.shiftCast(s, 3), id);
      await frames(page, 7);
      await shoot(`skill-${id}-a`);
      await frames(page, 10);
      await shoot(`skill-${id}-b`);
      log(`${id}: fired ${fired}`);
      if (!fired) ok = false;
      await frames(page, 40);
    } catch (e) {
      ok = false;
      log(`failed ${id}: ${String(e.message).slice(0, 200)}`);
    }
  }
} finally {
  if (pageErrors.length) {
    ok = false;
    console.log('page errors:\n  ' + pageErrors.slice(0, 10).join('\n  '));
  }
  await close();
}
console.log(ok ? 'PASS shoot-shifter' : 'FAIL shoot-shifter');
process.exit(ok ? 0 : 1);
