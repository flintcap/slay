/**
 * SLAY — the Paladin's weapon skills, seen: what each blow leaves on the
 * enemy and on the floor.
 *
 * Steel, bronze, dust, broken flagstones and blood; never a glowing sigil on
 * a weapon blow (the owner's call for weapon skills). Nearly all of it goes
 * through the shared particle field, floor decals and shock rings, which
 * follow the quality ladder and are warmed for every class. `PaladinFX`
 * holds the little only the Paladin draws: a pool of steel smears (the
 * Knight's `SteelArcs`, in the cold steel of a blade's edge), the censer on
 * its chain (`Censer.ts`) and the great bell (`GreatBell.ts`). One per scene;
 * nothing here allocates per frame.
 *
 * `riteLook` is called by `scenes/paladin/Rites.ts` on the frame a blow
 * lands, with where the hero stands and where the blow fell.
 */
import * as THREE from 'three';
import type { EffectSystem } from '../Effects';
import type { BurstOpts } from '../Particles';
import { SteelArcs } from '../knight/KnightFX';
import { Censer } from './Censer';
import { GreatBell } from './GreatBell';

/** Bell bronze, the shield's iron, flagstone grey, old blood and the gold of a reliquary. */
export const BRONZE = 0xc8963c;
const IRON = 0xc8c2b4;
const STONE = 0x8a8478;
const DUST = 0x6e604e;
const RELIC = 0xf0d890;
const BLOOD = 0x7a0a0a;

/** The Paladin's own drawings for one scene. */
export class PaladinFX {
  readonly arcs: SteelArcs;
  readonly censer: Censer;
  readonly bell: GreatBell;

  constructor(readonly scene: THREE.Object3D) {
    this.arcs = new SteelArcs(scene, 8);
    this.censer = new Censer(scene);
    this.bell = new GreatBell(scene);
  }

  update(dt: number): void {
    this.arcs.update(dt);
    this.censer.update(dt);
    this.bell.update(dt);
  }

  dispose(): void {
    this.arcs.dispose();
    this.censer.dispose();
    this.bell.dispose();
  }
}

let live: PaladinFX | null = null;

/** The Paladin's drawings in the scene `fx` draws into, made the first time they are needed there. */
export function paladinFX(fx: EffectSystem): PaladinFX {
  if (live && live.scene !== fx.scene) {
    live.dispose();
    live = null;
  }
  return (live ??= new PaladinFX(fx.scene));
}

/** Once a frame, from the Paladin's tick: plays what is drawn, and lets go of a scene left behind. */
export function tickPaladinFX(fx: EffectSystem, dt: number): void {
  if (!live) return;
  if (live.scene !== fx.scene) {
    live.dispose();
    live = null;
    return;
  }
  live.update(dt);
}

/** One of each, never shown, for the scene's warmup (never disposed: a program lives while a material holds it). */
export function paladinStandIns(): THREE.Object3D[] {
  const holder = new THREE.Group();
  const arcs = new SteelArcs(holder, 1);
  arcs.cut(0, 0, 0, Math.PI, 1);
  holder.add(Censer.standIn(), GreatBell.standIn());
  return [holder];
}

// ---------------------------------------------------------------------------
// One blow, seen
// ---------------------------------------------------------------------------

/** What a blow leaves. */
export type RiteMark =
  | 'toll' | 'crack' | 'anvil' | 'door' | 'knell' | 'echo' | 'maul' | 'relic' | 'verdict' | 'lastBell'
  | 'cut' | 'thrust' | 'parry' | 'confess' | 'sweep' | 'cross' | 'mercy' | 'rites' | 'heels';

const O: BurstOpts = {};
const dir = new THREE.Vector3();

/** The one shared options object, reset for this burst. */
function opts(count: number, scale = 1, color?: number, d?: THREE.Vector3, ring?: number, speed?: number): BurstOpts {
  O.count = count;
  O.scale = scale;
  O.color = color;
  O.dir = d;
  O.ring = ring;
  O.speed = speed;
  O.scatter = undefined;
  O.life = undefined;
  O.school = undefined;
  return O;
}

/**
 * Draws what a blow leaves. `hx, hz` is where the hero stands, `tx, tz` where
 * the blow fell; `k` is the mark's own number (the cut's side, the dents
 * beaten flat, the cuts confessed, the shock's reach).
 */
export function riteLook(fx: EffectSystem, mark: RiteMark, hx: number, hz: number, tx: number, tz: number, k = 0): void {
  let dx = tx - hx;
  let dz = tz - hz;
  const len = Math.hypot(dx, dz);
  if (len > 1e-4) {
    dx /= len;
    dz /= len;
  } else {
    dx = 0;
    dz = 1;
  }
  const yaw = Math.atan2(dx, dz);
  const p = fx.fx;
  // Where the blow met the body: the near side of it, at chest height.
  const fx0 = tx - dx * 0.35;
  const fz0 = tz - dz * 0.35;
  switch (mark) {
    case 'toll': {
      // A bell-ringer's blow: bronze sparks off the crown and a ring on the stone.
      p.burst('sparks', fx0, 1.6, fz0, opts(10, 1, BRONZE, dir.set(-dx, 0.8, -dz)));
      fx.nova(tx, tz, 1.3, { color: BRONZE, duration: 0.35, thickness: 0.1, particles: false });
      fx.flash(fx0, 1.6, fz0, BRONZE, 5, 4, 0.12);
      break;
    }
    case 'crack': {
      // The rim edge-on into a jaw: iron sparks thrown up and back.
      p.burst('shieldHit', fx0, 1.3, fz0, opts(10));
      p.burst('sparks', fx0, 1.35, fz0, opts(12, 1, IRON, dir.set(-dx * 0.6, 1, -dz * 0.6), undefined, 5));
      break;
    }
    case 'anvil': {
      // Straight down: a dent of light, the floor cracked under it.
      p.burst('sparks', fx0, 1.0, fz0, opts(14, 1, 0xffd8a0, dir.set(0, 1, 0), undefined, 6));
      p.burst('chips.stone', tx, 0.15, tz, opts(14, 1, STONE));
      fx.decals.add('crack', tx, tz, 1.1, yaw);
      fx.flash(fx0, 1.0, fz0, 0xffd8a0, 6, 5, 0.12);
      break;
    }
    case 'door': {
      // Shield first on arrival: iron on bone and a wall of dust.
      p.burst('shieldHit', fx0, 1.1, fz0, opts(12));
      p.burst('puff.dust', tx, 0.15, tz, opts(16, 1.2, DUST, undefined, 0.8));
      fx.decals.add('dust', tx, tz, 1.3, yaw);
      break;
    }
    case 'heels': {
      // The run's wake: dust kicked from his heels.
      p.burst('puff.dust', hx - dx * 0.5, 0.12, hz - dz * 0.5, opts(5, 0.9, DUST));
      break;
    }
    case 'knell': {
      p.burst('sparks', fx0, 1.5, fz0, opts(8, 1, BRONZE, dir.set(dz, 0.5, -dx)));
      break;
    }
    case 'echo': {
      // The helm rings again: a thin ring of sound off the stone.
      fx.nova(tx, tz, 1.8, { color: BRONZE, duration: 0.5, thickness: 0.06, particles: false });
      fx.flash(tx, 1.6, tz, BRONZE, 3, 3, 0.18);
      break;
    }
    case 'maul': {
      // The long blow lands: flagstones broken in a ring as far as the shock goes.
      const r = Math.max(1.2, k);
      p.burst('chips.stone', tx, 0.2, tz, opts(18, 1.1, STONE, undefined, r * 0.45));
      p.burst('puff.dust', tx, 0.15, tz, opts(18, 1.3, DUST, undefined, r * 0.8));
      fx.decals.add('crater', tx, tz, 1.0, yaw);
      for (let i = 0; i < 5; i++) {
        const a = yaw + (i / 5) * Math.PI * 2;
        fx.decals.add('crack', tx + Math.sin(a) * r * 0.55, tz + Math.cos(a) * r * 0.55, r * 0.35, a);
      }
      fx.nova(tx, tz, r, { color: STONE, duration: 0.45, thickness: 0.12, particles: false });
      break;
    }
    case 'relic': {
      // The reliquary in the boss: a gold glint, and a breath of motes for each dent read.
      p.burst('shieldHit', fx0, 1.2, fz0, opts(10));
      p.burst('puff.motes', fx0, 1.3, fz0, opts(6 + 3 * k, 0.9, RELIC));
      fx.flash(fx0, 1.3, fz0, RELIC, 6 + 2 * k, 5, 0.16);
      break;
    }
    case 'verdict': {
      // Judgement: a crater and a star of cracks round it.
      p.burst('chips.stone', tx, 0.2, tz, opts(22, 1.2, STONE));
      p.burst('sparks', fx0, 1.0, fz0, opts(16, 1.1, 0xffd8a0, dir.set(0, 1, 0), undefined, 7));
      p.burst('puff.dust', tx, 0.15, tz, opts(20, 1.4, DUST, undefined, 1.4));
      fx.decals.add('crater', tx, tz, 1.3, yaw);
      for (let i = 0; i < 6; i++) {
        const a = yaw + (i / 6) * Math.PI * 2;
        fx.decals.add('crack', tx + Math.sin(a) * 0.9, tz + Math.cos(a) * 0.9, 0.85, a);
      }
      fx.flash(fx0, 1.0, fz0, 0xffd8a0, 12, 8, 0.18);
      break;
    }
    case 'lastBell': {
      // The Toll: a bronze ring thrown wide, seen as well as heard.
      fx.nova(tx, tz, 2.4, { color: BRONZE, duration: 0.6, thickness: 0.08, particles: false });
      p.burst('sparks', fx0, 1.5, fz0, opts(12, 1.1, BRONZE, dir.set(0, 1, 0)));
      fx.flash(fx0, 1.5, fz0, BRONZE, 10, 7, 0.2);
      break;
    }
    case 'cut': {
      // A short cut, forehand or backhand (k: 0 or 1), and the wound it opens.
      const side = k % 2 ? -1 : 1;
      paladinFX(fx).arcs.cut(hx, hz, yaw + side * 0.3, Math.PI * 0.55, Math.min(2.6, len) * 0.9, {
        y: side > 0 ? 1.05 : 1.3, life: 0.2, sweep: 0.5, bright: 0.8,
      });
      p.burst('blood', fx0, 1.15, fz0, opts(6, 0.9, BLOOD, dir.set(dz * side, 0.3, -dx * side)));
      break;
    }
    case 'thrust': {
      // The point in and out: a narrow streak of steel, a spurt behind it.
      paladinFX(fx).arcs.cut(hx, hz, yaw, 0.22, Math.min(2.6, len) * 0.95, { y: 1.2, life: 0.14, sweep: 0.2, bright: 0.9 });
      p.burst('blood', tx + dx * 0.2, 1.15, tz + dz * 0.2, opts(5 + k, 0.8, BLOOD, dir.set(dx, 0.2, dz)));
      break;
    }
    case 'parry': {
      // Steel on steel at his guard.
      const gx = hx + dx * 0.6;
      const gz = hz + dz * 0.6;
      p.burst('block', gx, 1.45, gz, opts(10));
      p.burst('sparks', gx, 1.5, gz, opts(14, 1, IRON, dir.set(dx, 0.6, dz), undefined, 6));
      fx.flash(gx, 1.5, gz, 0xfff4e0, 6, 4, 0.1);
      break;
    }
    case 'confess': {
      // Every open wound gives at once: more blood the more it had.
      p.burst('puff.blood', fx0, 1.15, fz0, opts(6 + 4 * k, 1 + 0.08 * k, BLOOD));
      p.burst('blood', tx + dx * 0.3, 1.1, tz + dz * 0.3, opts(8 + 3 * k, 1, BLOOD, dir.set(dx, 0.3, dz), undefined, 5));
      if (k > 0) fx.decals.add('bloodSplatter', tx + dx * 0.6, tz + dz * 0.6, 0.6 + 0.12 * k, yaw);
      break;
    }
    case 'sweep': {
      // The first cut of the cross: a wide flat sweep (k: its arc, in radians).
      paladinFX(fx).arcs.cut(hx, hz, yaw, k > 0 ? k : Math.PI * 0.8, 2.9, { y: 1.0, life: 0.26, sweep: 0.45, bright: 0.85 });
      break;
    }
    case 'cross': {
      // The second cut comes down across the first: a cross scored in the stone.
      paladinFX(fx).arcs.cut(hx, hz, yaw, 0.3, Math.min(2.6, len) * 0.95, { y: 1.4, life: 0.18, sweep: 0.25, bright: 1 });
      fx.decals.add('crack', tx, tz, 0.9, yaw + 0.75);
      fx.decals.add('crack', tx, tz, 0.9, yaw - 0.75);
      p.burst('blood', fx0, 1.2, fz0, opts(8, 1, BLOOD, dir.set(0, -0.4, 0)));
      break;
    }
    case 'mercy': {
      // Point down into it; the kind cut (k 1) all but empties it.
      paladinFX(fx).arcs.cut(hx, hz, yaw, 0.22, Math.min(2.6, len) * 0.95, { y: 1.5, life: 0.16, sweep: 0.2, bright: 1 });
      if (k > 0) {
        p.burst('puff.blood', fx0, 1.1, fz0, opts(20, 1.3, BLOOD));
        p.burst('blood', tx, 1.0, tz, opts(16, 1.2, BLOOD, dir.set(0, 1, 0), undefined, 5));
        fx.decals.add('bloodSplatter', tx, tz, 1.1, yaw);
        fx.flash(fx0, 1.1, fz0, 0x8a1010, 5, 4, 0.18);
      } else {
        p.burst('blood', fx0, 1.1, fz0, opts(6, 0.9, BLOOD, dir.set(0, -0.6, 0)));
      }
      break;
    }
    case 'rites': {
      // The blade through it from behind: the blood goes out of the front.
      p.burst('blood', tx + dx * 0.35, 1.15, tz + dz * 0.35, opts(16, 1.1, BLOOD, dir.set(dx, 0.25, dz), undefined, 6));
      p.burst('puff.blood', tx + dx * 0.3, 1.15, tz + dz * 0.3, opts(10, 1.1, BLOOD));
      fx.decals.add('bloodSplatter', tx + dx * 1.0, tz + dz * 1.0, 0.9, yaw);
      paladinFX(fx).arcs.cut(hx, hz, yaw, 0.2, Math.min(2.6, len) * 1.05, { y: 1.15, life: 0.18, sweep: 0.2, bright: 0.9 });
      break;
    }
  }
}
