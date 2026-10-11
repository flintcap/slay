/**
 * Worn gear in the live game: each class in town at each gear level (bare,
 * starter, mid, elite), seen from the game's own camera, close in, and in the
 * middle of an attack. One PNG sheet per class: a row per gear level.
 *
 *   npm run build
 *   SLAY_PORT=4332 timeout 2700 node tools/shoot-gear.mjs --out=shots/gear --classes=warden,ranger
 *   ... --kits=bare,mid   only some gear levels
 */
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { bootGame, frames } from './lib/game.mjs';

const arg = (k, d) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const OUT = path.resolve(arg('out', 'shots/gear'));
const CLASSES = String(arg('classes', 'warden,ranger')).split(',').filter(Boolean);
const KITS = String(arg('kits', 'bare,starter,mid,elite')).split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const ARMOUR = {
  bare: [],
  starter: ['helm.cap', 'chest.quilted', 'gloves.leather', 'boots.boots', 'belt.sash'],
  mid: ['helm.full', 'chest.chainmail', 'gloves.war', 'boots.war', 'belt.war'],
  elite: ['helm.spired', 'chest.archon', 'gloves.ogre', 'boots.myrmidon', 'belt.colossus'],
};
const RARITY = { bare: 'normal', starter: 'normal', mid: 'magic', elite: 'rare' };
// What each class holds, main hand first (the same as the hero sheets).
const HELD = {
  warden: ['sword.broad', 'shield.heater'],
  pyromancer: ['wand.wand'],
  shadowblade: ['dagger.kris', 'dagger.dirk'],
  stormcaller: ['staff.long'],
  revenant: ['sword.great'],
  ranger: ['bow.long'],
};

const t0 = Date.now();
const log = (m) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
const VW = 960;
const VH = 540;
const { page, close, pageErrors } = await bootGame({ fallbackPort: 4332, preview: true, viewport: { width: VW, height: VH } });
log('booted');
await page.addStyleTag({ content: '.story-card, *:has(> .ob-head), .hud, #hud { display: none !important; }' });

const heroBox = () =>
  page.evaluate(() => {
    const sc = window.SLAY.engine.currentScene;
    const cam = sc.camera;
    const a = sc.player.position.clone();
    a.y += 0.02;
    const b = sc.player.position.clone();
    b.y += 1.95;
    a.project(cam);
    b.project(cam);
    const W = window.innerWidth;
    const H = window.innerHeight;
    return { x: ((a.x + b.x) / 2 + 1) * 0.5 * W, y: (1 - (a.y + b.y) / 2) * 0.5 * H, h: Math.abs(a.y - b.y) * 0.5 * H };
  });
const hold = (v) => page.evaluate((p) => (window.SLAY.engine.paused = p), v);
const view = (v) =>
  page.evaluate((k) => {
    const rig = window.SLAY.engine.currentScene.rig;
    if (rig.__pitch0 === undefined) rig.__pitch0 = rig.opts.pitch;
    rig.opts.lookAhead = 0;
    rig.zoomBias = k === 'close' ? -6 : -2;
    rig.distanceMul = k === 'close' ? 0.5 : 0.85;
    rig.opts.pitch = k === 'close' ? 0.32 : rig.__pitch0;
  }, v);
const shot = async (file, mul) => {
  await hold(true);
  const b = await heroBox();
  const size = Math.round(Math.min(VH, Math.max(120, b.h * mul)));
  const x = Math.round(Math.min(VW - size, Math.max(0, b.x - size / 2)));
  const y = Math.round(Math.min(VH - size, Math.max(0, b.y - size / 2)));
  await page.screenshot({ path: file, clip: { x, y, width: size, height: size }, timeout: 600000 });
  await hold(false);
};

let ok = true;
try {
  for (const cls of CLASSES) {
    await page.evaluate((c) => window.SLAY.debug.makeCharacter(c, 40, 7), cls);
    await page.evaluate(() => window.SLAY.engine.goTo('town'));
    await frames(page, 30);
    const tmp = path.join(OUT, `tmp-${cls}`);
    mkdirSync(tmp, { recursive: true });
    const tiles = [];
    for (const kit of KITS) {
      await page.evaluate(
        ([k, armour, held, rarity]) => {
          const S = window.SLAY;
          const c = S.save.account.current;
          for (const s of Object.keys(c.equipment)) c.equipment[s] = null;
          if (k !== 'bare') for (const id of [...held, ...armour]) S.debug.equip(id, 40, rarity);
          const sc = S.engine.currentScene;
          sc.player.refreshStats();
          // Open ground (the gait strips' lane), facing the camera a little.
          sc.player.position.set(-9.9, 0, -1.9);
        },
        [kit, ARMOUR[kit], HELD[cls], RARITY[kit]],
      );
      await frames(page, 12);
      await view('camera');
      await frames(page, 4);
      const a = path.join(tmp, `${kit}-a.png`);
      await shot(a, 1.6);
      await view('close');
      await frames(page, 4);
      const b = path.join(tmp, `${kit}-b.png`);
      await shot(b, 1.25);
      // Mid swing: the attack, toward screen right.
      await page.evaluate(() => window.SLAY.debug.attack(1, 0.3));
      await frames(page, 5);
      const c = path.join(tmp, `${kit}-c.png`);
      await shot(c, 1.25);
      await page.evaluate(() => window.SLAY.debug.stopAttack());
      await frames(page, 12);
      tiles.push(a, b, c);
      log(`ok    ${cls} ${kit}`);
    }
    const out = path.join(OUT, `gear-${cls}.png`);
    execFileSync('montage', [...tiles, '-tile', '3x', '-geometry', '300x300+2+2', '-background', '#101014', out]);
    rmSync(tmp, { recursive: true, force: true });
    log(`wrote ${path.basename(out)}`);
  }
} catch (e) {
  ok = false;
  log(`failed: ${String(e.message).slice(0, 300)}`);
} finally {
  if (pageErrors.length) console.log('page errors:\n  ' + pageErrors.slice(0, 10).join('\n  '));
  await close();
}
process.exit(ok ? 0 : 1);
