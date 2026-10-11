/**
 * Live-game gait strips: the hero walking and running in town, framed close,
 * one frame per game frame (1/20 s under software rendering). Two views: the
 * side (camera dropped low, hero crossing the screen) and the game's own
 * camera, close in. One PNG strip per class, view and speed.
 *
 *   npm run build
 *   SLAY_PORT=4332 timeout 1800 node tools/shoot-gait.mjs --out=shots/gait --classes=warden,ranger
 *   ... --speeds=walk,run   walk is the hero slowed to about 1.8 m/s
 *   ... --n=12              frames per strip
 */
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { bootGame, frames } from './lib/game.mjs';

const arg = (k, d) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const OUT = path.resolve(arg('out', 'shots/gait'));
const CLASSES = String(arg('classes', 'warden,ranger')).split(',').filter(Boolean);
const SPEEDS = String(arg('speeds', 'walk,run')).split(',').filter(Boolean);
const N = Number(arg('n', 10));
const VIEWS = String(arg('views', 'side,camera')).split(',').filter(Boolean);
const TAG = arg('tag', '');
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const log = (m) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
// Small frames: every shot renders a frame, and they are slow in software.
const VW = 640;
const VH = 360;
const { page, close, pageErrors } = await bootGame({ fallbackPort: 4332, preview: true, viewport: { width: VW, height: VH } });
log('booted');
await page.addStyleTag({ content: '.story-card, *:has(> .ob-head), .hud, #hud { display: none !important; }' });

// Where the hero's middle is on screen, and how tall it is in pixels.
const heroBox = () =>
  page.evaluate(() => {
    const sc = window.SLAY.engine.currentScene;
    const cam = sc.camera;
    const p = sc.player.position;
    const a = p.clone();
    a.y += 0.05;
    const b = p.clone();
    b.y += 1.85;
    a.project(cam);
    b.project(cam);
    const W = window.innerWidth;
    const H = window.innerHeight;
    return { x: ((a.x + b.x) / 2 + 1) * 0.5 * W, y: (1 - (a.y + b.y) / 2) * 0.5 * H, h: Math.abs(a.y - b.y) * 0.5 * H };
  });

let ok = true;
try {
  for (const cls of CLASSES) {
    await page.evaluate((c) => window.SLAY.debug.makeCharacter(c, 20, 7), cls);
    await page.evaluate(() => window.SLAY.engine.goTo('town'));
    await frames(page, 30);
    for (const speed of SPEEDS) {
      for (const view of VIEWS) {
        const key = 'd';
        await page.evaluate(
          ([v, sp]) => {
            const sc = window.SLAY.engine.currentScene;
            const rig = sc.rig;
            rig.zoomBias = -6;
            rig.distanceMul = 0.5;
            rig.opts.lookAhead = 0;
            if (rig.opts.lookAheadMax !== undefined) rig.opts.lookAheadMax = 0;
            if (rig.__pitch0 === undefined) rig.__pitch0 = rig.opts.pitch;
            rig.opts.pitch = v === 'side' ? 0.12 : rig.__pitch0;
            // Open ground in the south of the town, room to run east. Both
            // views run the same way: across the screen, as the player sees
            // most strides.
            sc.player.position.set(-8, 0, 12);
            sc.player.stats.moveSpeed = sp === 'walk' ? -60 : 0;
          },
          [view, speed],
        );
        await frames(page, 6);
        await page.keyboard.down(key);
        // Up to speed and into a steady stride.
        await frames(page, 14);
        const box = await heroBox();
        // From above the body hides the legs: frame wider so the feet show.
        const size = Math.round(Math.min(VH, Math.max(90, box.h * (view === 'side' ? 1.35 : 2.6))));
        const cx = Math.round(Math.min(VW - size / 2, Math.max(size / 2, box.x)));
        const cy = Math.round(Math.min(VH - size / 2, Math.max(size / 2, box.y)));
        const tiles = [];
        const tmp = path.join(OUT, `tmp-${cls}-${speed}-${view}${TAG ? '-' + TAG : ''}`);
        mkdirSync(tmp, { recursive: true });
        // Freeze the game for each shot: a software frame takes seconds, and
        // the hero must not run out of the crop while it is taken.
        const hold = (v) => page.evaluate((p) => (window.SLAY.engine.paused = p), v);
        for (let k = 0; k < N; k++) {
          await hold(true);
          const b = await heroBox();
          const x = Math.round(Math.min(VW - size, Math.max(0, b.x - size / 2)));
          const y = Math.round(Math.min(VH - size, Math.max(0, b.y - size / 2)));
          const f = path.join(tmp, `${String(k).padStart(2, '0')}.png`);
          await page.screenshot({ path: f, clip: { x, y, width: size, height: size }, timeout: 600000 });
          tiles.push(f);
          await hold(false);
          await frames(page, 1);
        }
        await page.keyboard.up(key);
        const info = await page.evaluate(() => {
          const a = window.SLAY.engine.currentScene.player.animator;
          const g = a.gaitInfo;
          return `speed ${g.speed.toFixed(2)} m/s, ${g.freq.toFixed(2)} Hz, run ${g.runW.toFixed(2)}`;
        });
        const out = path.join(OUT, `gait-${cls}-${speed}-${view}${TAG ? '-' + TAG : ''}.png`);
        execFileSync('montage', [...tiles, '-tile', `${N}x1`, '-geometry', '+0+0', '-resize', '180x180', out]);
        rmSync(tmp, { recursive: true, force: true });
        log(`ok    ${path.basename(out)}  ${info}  (centre ${cx},${cy})`);
        await frames(page, 10);
      }
    }
  }
} catch (e) {
  ok = false;
  log(`failed: ${String(e.message).slice(0, 300)}`);
} finally {
  if (pageErrors.length) console.log('page errors:\n  ' + pageErrors.slice(0, 10).join('\n  '));
  await close();
}
process.exit(ok ? 0 : 1);
