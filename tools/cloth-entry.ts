/**
 * Entry point for `tools/check-cloth.mjs`. Pure data; runs under Node.
 *
 * Every boss and warden look is sculpted as the game sculpts it for a boss
 * (capes and banners as cloth), and each cloth sheet is checked: its grid
 * adds up, something holds it, the rest may swing, the bone that carries it
 * and the bones of what it falls against are in the rig, and its rest shape
 * hangs clear of those bodies (a sheet laid inside one is shoved out the
 * frame it appears).
 */
import * as THREE from 'three';
import { BOSSES } from '../src/data/bosses';
import { WARDENS } from '../src/data/wardens';
import { lookFor } from '../src/art/creatures/Looks';
import { Sculpt } from '../src/art/creatures/Sculpt';
import { MAX_BODIES } from '../src/art/Cloth';

const problems: string[] = [];
let looks = 0;
let sheets = 0;
let points = 0;
const kinds: Record<string, number> = {};
const seen = new Set<string>();
const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();
const _q = new THREE.Vector3();

for (const def of [...BOSSES, ...WARDENS]) {
  const look = lookFor(def.visual, def.family, 'boss');
  if (look.tier !== 'boss' || seen.has(look.key)) continue;
  seen.add(look.key);
  const s = new Sculpt(look.rig());
  s.clothOn = true;
  look.sculpt(s);
  if (!s.cloths.length) continue;
  looks++;
  for (const [k, c] of s.cloths.entries()) {
    const name = `${def.id} cloth ${k} (${c.feel})`;
    sheets++;
    kinds[c.feel] = (kinds[c.feel] ?? 0) + 1;
    const n = c.cols * c.rows;
    points += n;
    const pos = c.geo.getAttribute('position');
    if (pos.count !== n || c.pin.length !== n || c.reach.length !== n) problems.push(`${name}: grid ${c.cols}x${c.rows} but ${pos.count} points, ${c.pin.length} pins, ${c.reach.length} reaches`);
    if (c.cols < 3 || c.rows < 3) problems.push(`${name}: grid ${c.cols}x${c.rows} is too small to fold`);
    if (!s.has(c.bone)) problems.push(`${name}: carried by "${c.bone}", not in the rig`);
    let held = 0;
    let stiff = 0;
    for (let i = 0; i < n; i++) {
      if (c.pin[i]! > 0.5) held++;
      else if (!(c.reach[i]! > 0)) stiff++;
    }
    if (!held) problems.push(`${name}: nothing holds it`);
    if (held === n) problems.push(`${name}: every point is held`);
    if (stiff) problems.push(`${name}: ${stiff} free points may not move`);
    if (c.bodies.length > MAX_BODIES) problems.push(`${name}: ${c.bodies.length} bodies, the cloth takes ${MAX_BODIES}`);
    if (!c.bodies.length) problems.push(`${name}: falls against nothing`);
    let inside = 0;
    for (let i = 0; i < n; i++) {
      if (c.pin[i]! > 0.5) continue;
      const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      for (const b of c.bodies) {
        _ab.copy(b.bt).sub(b.at);
        _ap.copy(p).sub(b.at);
        const u = Math.min(1, Math.max(0, _ap.dot(_ab) / Math.max(1e-9, _ab.lengthSq())));
        _q.copy(b.at).addScaledVector(_ab, u);
        if (p.distanceTo(_q) < b.r * 0.9) {
          inside++;
          break;
        }
      }
    }
    const free = n - held;
    if (inside > free * 0.1) problems.push(`${name}: ${inside} of ${free} free points start inside a body`);
    for (const b of c.bodies) if (!s.has(b.a) || !s.has(b.b)) problems.push(`${name}: a body on "${b.a}"/"${b.b}", not in the rig`);
  }
}

console.log(JSON.stringify({ looks, sheets, points, kinds, problems }));
