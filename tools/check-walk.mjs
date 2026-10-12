/**
 * Click-to-move reaches where you click. Enters a few levels, then from
 * random standing spots orders the hero to random reachable spots 4 to 14 m
 * away (round props, wall corners and all in between) and steps the hero's
 * own movement at 60 Hz, no rendering, until it arrives or runs out of time for the walk.
 * Prints how many arrived; PASS at 95% or better.
 *
 *   SLAY_PORT=4343 timeout 1500 node tools/check-walk.mjs [--levels=3] [--tries=40]
 */
import { bootGame } from './lib/game.mjs';

const arg = (k, d) => process.argv.find((s) => s.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const LEVELS = Number(arg('levels', 3));
const TRIES = Number(arg('tries', 40));
const { page, close, pageErrors } = await bootGame({ fallbackPort: 4343, preview: false });
let ok = 0;
let all = 0;
for (let L = 0; L < LEVELS; L++) {
  const r = await page.evaluate(
    async ([depth, tries]) => {
      window.SLAY.debug.makeCharacter('warden', 20);
      await window.SLAY.engine.goTo('dungeon', { depth });
      const sc = window.SLAY.engine.active;
      const gen = await import('/src/world/DungeonGen.ts');
      const p = sc.player;
      const nav = sc.nav;
      const mesh = sc.mesh;
      const level = sc.level;
      // A seeded walk through the level's own tiles: no Math.random.
      let s = 12345 + depth * 777;
      const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
      const open = [];
      for (let y = 0; y < level.height; y++)
        for (let x = 0; x < level.width; x++) if (gen.isWalkable(level, x, y)) open.push([x, y]);
      const ctx = {
        colliders: mesh.colliders,
        walkableAt: (x, z) => {
          const t = mesh.worldToTile(x, z);
          return gen.isWalkable(level, t.x, t.y);
        },
        path: (fx, fz, tx, tz) => nav.path({ x: fx, y: fz }, { x: tx, y: tz }),
      };
      const fails = [];
      let arrived = 0;
      let n = 0;
      for (let k = 0; k < tries * 30 && n < tries; k++) {
        const a = open[Math.floor(rnd() * open.length)];
        // The destination: a walkable tile near the start, as a click is.
        const bx = a[0] + Math.round((rnd() - 0.5) * 14);
        const by = a[1] + Math.round((rnd() - 0.5) * 14);
        if (!gen.isWalkable(level, bx, by)) continue;
        const b = [bx, by];
        const A = nav.tileToWorld(a[0], a[1]);
        const B = nav.tileToWorld(b[0], b[1]);
        const d = Math.hypot(A.x - B.x, A.y - B.y);
        if (d < 4 || d > 14) continue;
        const route = nav.path(A, B);
        if (!route.length) continue;
        // Spots that a prop stands on are not spots anyone can click to stand.
        p.root.position.set(A.x, 0, A.y);
        p.stop();
        if (!p.canStand(A.x, A.y, ctx) || !p.canStand(B.x, B.y, ctx)) continue;
        n++;
        p.moveTo(B.x, B.y);
        // Time for the walk the level asks for (a short hop across a wall can
        // be a long way round), at a slow 3 m/s, plus two seconds.
        let len = 0;
        let q = A;
        for (const w of route) {
          len += Math.hypot(w.x - q.x, w.y - q.y);
          q = w;
        }
        const limit = 2 + len / 3;
        let t = 0;
        for (; t < limit; t += 1 / 60) {
          p.updateMovement(1 / 60, ctx, null);
          if (Math.hypot(p.root.position.x - B.x, p.root.position.z - B.y) < 0.4) break;
        }
        if (t < limit) arrived++;
        else fails.push(`${a}->${b} ended ${Math.hypot(p.root.position.x - B.x, p.root.position.z - B.y).toFixed(1)} m short`);
      }
      return { depth, n, arrived, fails: fails.slice(0, 5) };
    },
    [1 + L * 3, TRIES],
  );
  console.log(`tier ${r.depth}: ${r.arrived}/${r.n} arrived`, r.fails.length ? r.fails : '');
  ok += r.arrived;
  all += r.n;
}
if (pageErrors.length) console.log('page errors:', pageErrors.slice(0, 3));
const pass = all > 0 && ok / all >= 0.95;
console.log(`${ok}/${all} arrived. check-walk: ${pass ? 'PASS' : 'FAIL'}`);
await close();
process.exit(pass ? 0 : 1);
