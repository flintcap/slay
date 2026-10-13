/**
 * SLAY — what the Shapeshifter draws: the changes between shapes, and each
 * skill's own look on top of the blow (`SHIFTER_MOTIFS` names them for the
 * uniqueness check, `fx/SkillLooks.ts`).
 *
 * Built from the kit's pieces (particles, ribbons, lights, floor marks) and
 * the Shapeshifter's own emitters (`./emitters.ts`). Claw trails follow the
 * paw's own bones, so a rake is three thin scores that run exactly where the
 * claws went; anything that moves over time runs on a small ticker the
 * hero's frame drives (`tickShifterFX`, from `entities/Shapeshift.ts`).
 */
import * as THREE from 'three';
import type { EffectSystem } from '../Effects';
import type { RibbonHandle } from '../kit/Ribbons';
import type { BeastForm } from '../../art/hero/forms/BeastBody';
import { events } from '../../core/Events';
import './emitters';

// ---------------------------------------------------------------------------
// Ticker
// ---------------------------------------------------------------------------

interface Tick {
  t: number;
  dur: number;
  run: (u: number, dt: number) => void;
  done?: () => void;
}
const ticks: Tick[] = [];

/** Runs `run(u)` every frame for `dur` seconds (u from 0 to 1), then `done`. */
function every(dur: number, run: (u: number, dt: number) => void, done?: () => void): void {
  if (ticks.length > 64) {
    const old = ticks.shift();
    old?.done?.();
  }
  ticks.push({ t: 0, dur: Math.max(0.01, dur), run, done });
}

/** Advances everything the Shapeshifter is drawing over time. */
export function tickShifterFX(dt: number): void {
  for (let i = ticks.length - 1; i >= 0; i--) {
    const k = ticks[i]!;
    k.t += dt;
    const u = Math.min(1, k.t / k.dur);
    try {
      k.run(u, dt);
    } catch {
      k.t = k.dur;
    }
    if (u >= 1) {
      ticks.splice(i, 1);
      k.done?.();
    }
  }
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

type Bones = Record<string, THREE.Bone>;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _x = new THREE.Vector3();

/**
 * Claw scores that follow a paw for `dur` seconds: `n` thin trails, spread
 * across the paw, a claw's length past the finger tips.
 */
function clawTrails(fx: EffectSystem, bones: Bones, side: 'L' | 'R', o: { n: number; dur: number; color: number; width?: number; spread?: number; len?: number; life?: number; emit?: number }): void {
  const hand = bones[`hand${side}`];
  const tip = bones[`fingerTips${side}`] ?? bones[`fingers${side}`];
  if (!hand || !tip) return;
  const rib: RibbonHandle[] = [];
  for (let i = 0; i < o.n; i++) rib.push(fx.ribbons.start('trail', { life: o.life ?? 0.2, width: o.width ?? 0.022, color: o.color, emit: o.emit ?? 0.9 }));
  const spread = o.spread ?? 0.045;
  const len = o.len ?? 0.09;
  every(
    o.dur,
    () => {
      hand.getWorldPosition(_a);
      tip.getWorldPosition(_b);
      const dir = _b.clone().sub(_a).normalize();
      hand.getWorldQuaternion(_q);
      _x.set(1, 0, 0).applyQuaternion(_q);
      for (let i = 0; i < o.n; i++) {
        const off = (i - (o.n - 1) / 2) * spread;
        fx.ribbons.pushPoint(rib[i]!, _b.x + dir.x * len + _x.x * off, _b.y + dir.y * len + _x.y * off, _b.z + dir.z * len + _x.z * off);
      }
    },
    () => rib.forEach((h) => fx.ribbons.retire(h)),
  );
}

/** A trail that follows a bone (the pelvis through a leap). */
function boneTrail(fx: EffectSystem, bone: THREE.Bone | undefined, dur: number, o: { color: number; width: number; life: number; emit?: number; puff?: string; every?: number }): void {
  if (!bone) return;
  const h = fx.ribbons.start('trail', { life: o.life, width: o.width, color: o.color, emit: o.emit ?? 0.5 });
  let acc = 0;
  every(
    dur,
    (_u, dt) => {
      bone.getWorldPosition(_a);
      fx.ribbons.pushPoint(h, _a.x, _a.y, _a.z);
      acc += dt;
      if (o.puff && acc >= (o.every ?? 0.04)) {
        acc = 0;
        fx.fx.burst(o.puff, _a.x, _a.y, _a.z, {});
      }
    },
    () => fx.ribbons.retire(h),
  );
}

function shake(amount: number, duration = 0.25): void {
  events.emit('shake', { amount, duration });
}

/** A ring of light that runs out across the floor. */
function floorRing(fx: EffectSystem, x: number, z: number, size: number, color: number, life = 0.5, emit = 1.2): void {
  fx.decals.glow('shockRing', x, z, size, life, color, emit);
}

const at = (p: { x: number; z: number }, y: number) => new THREE.Vector3(p.x, y, p.z);

// ---------------------------------------------------------------------------
// The changes
// ---------------------------------------------------------------------------

/** Light colour of each form's change. */
const CHANGE_LIGHT: Readonly<Record<BeastForm | 'man', number>> = { cat: 0x7a5ad8, wolf: 0xe0b060, bear: 0xd08040, man: 0xffd8b0 };
/** How high the head is in each shape, metres (eyes and breath). */
const HEAD_Y: Readonly<Record<BeastForm | 'man', number>> = { cat: 1.75, wolf: 1.9, bear: 2.15, man: 1.7 };

/**
 * One change of shape at `at`, facing `dir`: the old pelt shed, the new one
 * bursting, breath out of the new muzzle and the eyes lighting.
 */
export function formChange(fx: EffectSystem, at: THREE.Vector3, dir: THREE.Vector3, from: BeastForm | null, to: BeastForm | null): void {
  const x = at.x;
  const z = at.z;
  const y = at.y;
  if (from) fx.fx.burst(`ss.shed.${from}`, x, y + 1.1, z, {});
  const key = to ?? 'man';
  fx.fx.burst(`ss.change.${key}`, x, y + (to === 'bear' ? 0.15 : 1.0), z, {});
  fx.flash(x, y + 1.2, z, CHANGE_LIGHT[key], to === 'bear' ? 9 : 6, 6, to === 'cat' ? 0.1 : 0.2);
  const hy = HEAD_Y[key];
  const mouth = new THREE.Vector3(x + dir.x * 0.35, y + hy - 0.12, z + dir.z * 0.35);
  if (to) {
    // The breath comes a beat after the change, out of the new mouth.
    fx.delay(0.18, () => fx.fx.burst('ss.breath', mouth.x, mouth.y, mouth.z, { dir: dir.clone().setY(-0.15).normalize() }));
    fx.delay(0.1, () => fx.fx.burst(`ss.eyes.${to}`, x + dir.x * 0.22, y + hy, z + dir.z * 0.22, {}));
  }
  if (to === 'bear') {
    fx.decals.add('dust', x, z, 1.4);
    shake(0.22, 0.3);
  } else if (to === 'wolf') {
    fx.decals.add('dust', x, z, 0.9);
    shake(0.08, 0.2);
  }
}

// ---------------------------------------------------------------------------
// Feral
// ---------------------------------------------------------------------------

const CAT_CLAW = 0xd8d0ff;
const CAT_SHADOW = 0x3a2a6a;

export const FeralFX = {
  /** One rake stroke: three violet-white scores off the paw, blood thrown sideways at the hit. */
  rakeStroke(fx: EffectSystem, bones: Bones, side: 'L' | 'R', dur: number): void {
    clawTrails(fx, bones, side, { n: 3, dur, color: CAT_CLAW, width: 0.02, spread: 0.05, life: 0.16 });
  },
  rakeHit(fx: EffectSystem, p: { x: number; z: number }, dir: THREE.Vector3, side: 'L' | 'R'): void {
    const s = side === 'R' ? 1 : -1;
    const across = new THREE.Vector3(-dir.z * s, 0.1, dir.x * s).normalize();
    fx.fx.burst('ss.rake.hit', p.x, 1.15, p.z, { dir: across });
    fx.decals.add('blood', p.x + across.x * 0.5, p.z + across.z * 0.5, 0.35, Math.atan2(across.x, across.z));
  },
  /** Pounce: a streak of shadow along the arc, and a flattening landing. */
  pounceLeap(fx: EffectSystem, bones: Bones, time: number): void {
    boneTrail(fx, bones.pelvis, time, { color: CAT_SHADOW, width: 0.5, life: 0.28, emit: 0.35, puff: 'ss.pounce.streak', every: 0.03 });
    clawTrails(fx, bones, 'R', { n: 3, dur: time, color: CAT_CLAW, life: 0.12 });
    clawTrails(fx, bones, 'L', { n: 3, dur: time, color: CAT_CLAW, life: 0.12 });
  },
  pounceLand(fx: EffectSystem, p: { x: number; z: number }, dir: THREE.Vector3): void {
    fx.fx.burst('ss.pounce.land', p.x, 0.2, p.z, { dir });
    fx.decals.add('dust', p.x, p.z, 1.1);
    fx.decals.add('blood', p.x + dir.x * 0.6, p.z + dir.z * 0.6, 0.5);
    fx.flash(p.x, 0.8, p.z, 0x8a6ad8, 5, 5, 0.12);
    shake(0.14, 0.2);
  },
  /** Slink: the dark pools at the feet and keeps drifting off the body while it lasts. */
  slink(fx: EffectSystem, follow: THREE.Object3D, bones: Bones, dur: number): void {
    const p = follow.position;
    fx.fx.burst('ss.slink.pool', p.x, 0.05, p.z, {});
    fx.fx.burst('ss.eyes.cat', p.x, 1.55, p.z, {});
    let acc = 0;
    every(dur, (_u, dt) => {
      acc += dt;
      if (acc < 0.12) return;
      acc = 0;
      const pel = bones.pelvis;
      if (pel) pel.getWorldPosition(_a);
      else _a.copy(follow.position);
      fx.fx.burst('ss.slink.wisp', _a.x, 0.35, _a.z, {});
    });
  },
  /** Hamstring: one long low score at knee height and a spray along the floor. */
  hamstringStroke(fx: EffectSystem, bones: Bones, dur: number): void {
    clawTrails(fx, bones, 'R', { n: 3, dur, color: 0xe0c8ff, width: 0.024, spread: 0.055, life: 0.24 });
  },
  hamstringHit(fx: EffectSystem, p: { x: number; z: number }, dir: THREE.Vector3): void {
    fx.fx.burst('ss.hamstring.hit', p.x, 0.45, p.z, { dir: new THREE.Vector3(dir.z, 0, -dir.x) });
    fx.decals.add('blood', p.x, p.z, 0.55, Math.atan2(dir.z, -dir.x));
  },
  /** Throat Tear: the jaws close (two white arcs meeting), blood gushes up; harder on an execute. */
  throatTear(fx: EffectSystem, p: { x: number; z: number }, dir: THREE.Vector3, execute: boolean): void {
    const y = 1.45;
    const c = at(p, y);
    jaws(fx, c, dir, execute ? 0.55 : 0.4, 0.16);
    fx.fx.burst('ss.throat.gush', c.x, c.y, c.z, { count: execute ? 24 : 12, dir: dir.clone().setY(0.6).normalize() });
    fx.decals.add(execute ? 'gore' : 'blood', p.x, p.z, execute ? 0.9 : 0.55);
    if (execute) {
      fx.flash(c.x, c.y, c.z, 0xc01010, 7, 5, 0.18);
      shake(0.2, 0.25);
    }
  },
  /** Killing Dance: a shadow left at each point on the circle the cat struck from. */
  dancePoint(fx: EffectSystem, p: THREE.Vector3): void {
    fx.fx.burst('ss.dance.after', p.x, 1.0, p.z, {});
  },
  danceStroke(fx: EffectSystem, bones: Bones, side: 'L' | 'R', dur: number): void {
    clawTrails(fx, bones, side, { n: 3, dur, color: 0xc8b8ff, width: 0.018, life: 0.14 });
  },
  /** Night Hunt: the dark rises off the body, then trails it for as long as it lasts. */
  nightHunt(fx: EffectSystem, follow: THREE.Object3D, dur: number): void {
    const p = follow.position;
    fx.fx.burst('ss.night.rise', p.x, 0.4, p.z, {});
    fx.fx.burst('ss.eyes.cat', p.x, 1.6, p.z, {});
    floorRing(fx, p.x, p.z, 2.6, CAT_SHADOW, 0.7, 0.6);
    let acc = 0;
    every(dur, (_u, dt) => {
      acc += dt;
      if (acc < 0.09) return;
      acc = 0;
      fx.fx.burst('ss.night.trail', follow.position.x, 0.9, follow.position.z, {});
    });
  },
};

/** Two arcs of teeth, upper and lower, closing on a point. */
function jaws(fx: EffectSystem, c: THREE.Vector3, dir: THREE.Vector3, size: number, dur: number): void {
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const up = fx.ribbons.start('trail', { life: 0.18, width: 0.03, color: 0xfff6e8, emit: 1.1 });
  const lo = fx.ribbons.start('trail', { life: 0.18, width: 0.03, color: 0xfff6e8, emit: 1.1 });
  every(
    dur,
    (u) => {
      // Each arc sweeps across the bite, the gap between them closing.
      const gap = size * 0.5 * (1 - u);
      const a = (u - 0.5) * 2;
      const x = side.x * a * size;
      const z = side.z * a * size;
      const bow = (1 - a * a) * size * 0.25;
      fx.ribbons.pushPoint(up, c.x + x + dir.x * bow, c.y + gap, c.z + z + dir.z * bow);
      fx.ribbons.pushPoint(lo, c.x + x + dir.x * bow, c.y - gap, c.z + z + dir.z * bow);
    },
    () => {
      fx.ribbons.retire(up);
      fx.ribbons.retire(lo);
    },
  );
}

// ---------------------------------------------------------------------------
// Teeth
// ---------------------------------------------------------------------------

const WOLF_GOLD = 0xe8a428;

export const TeethFX = {
  /** Snap: a small fast jaw, a glint where the teeth meet. */
  snap(fx: EffectSystem, p: { x: number; z: number }, dir: THREE.Vector3): void {
    const c = at(p, 1.3);
    jaws(fx, c, dir, 0.24, 0.09);
    fx.fx.burst('ss.snap.glint', c.x, c.y, c.z, { dir });
  },
  /** Hunting Howl: breath thrown up, rings of gold run out across the floor, motes rise round the pack. */
  howl(fx: EffectSystem, p: THREE.Vector3, radius: number): void {
    fx.fx.burst('ss.howl.breath', p.x, 2.0, p.z, { dir: new THREE.Vector3(0, 1, 0) });
    for (let i = 0; i < 3; i++) fx.delay(i * 0.22, () => floorRing(fx, p.x, p.z, radius * (0.5 + i * 0.25), WOLF_GOLD, 0.6, 1.0));
    fx.fx.burst('ss.howl.motes', p.x, 0.2, p.z, { ring: 1.4 });
    fx.flash(p.x, 2.0, p.z, WOLF_GOLD, 5, 8, 0.3);
  },
  /** Lunge: a straight low streak of dust behind the rush. */
  lungeRun(fx: EffectSystem, bones: Bones, time: number): void {
    boneTrail(fx, bones.pelvis, time, { color: 0x8a7a60, width: 0.35, life: 0.25, emit: 0.2, puff: 'ss.lunge.dust', every: 0.035 });
  },
  lungeBite(fx: EffectSystem, p: { x: number; z: number }, dir: THREE.Vector3): void {
    jaws(fx, at(p, 1.1), dir, 0.36, 0.12);
    fx.fx.burst('ss.snap.glint', p.x, 1.1, p.z, { dir, count: 18 });
    fx.decals.add('dust', p.x, p.z, 0.8);
  },
  /** Worry: one shake, blood flicked off to the side it went. */
  worryShake(fx: EffectSystem, p: { x: number; z: number }, dir: THREE.Vector3, side: 1 | -1): void {
    const flick = new THREE.Vector3(-dir.z * side, 0.25, dir.x * side).normalize();
    fx.fx.burst('ss.worry.flick', p.x, 1.2, p.z, { dir: flick });
    fx.decals.add('blood', p.x + flick.x * 0.7, p.z + flick.z * 0.7, 0.3);
  },
  /** Call the Pack: fog lies down round the hero and eyes open in it. */
  callFog(fx: EffectSystem, p: { x: number; z: number }): void {
    fx.fx.burst('ss.pack.fog', p.x, 0.05, p.z, {});
    fx.delay(0.25, () => fx.fx.burst('ss.eyes.wolf', p.x, 0.65, p.z, {}));
  },
  /** Blood Howl: red mist drawn in from the air, and a red ring at the feet. */
  bloodHowl(fx: EffectSystem, p: THREE.Vector3): void {
    fx.fx.burst('ss.bloodhowl.mist', p.x, 1.4, p.z, {});
    fx.fx.burst('ss.breath', p.x, 1.85, p.z, { dir: new THREE.Vector3(0, 0.6, 0.4).normalize() });
    floorRing(fx, p.x, p.z, 3.0, 0xa01818, 0.8, 1.1);
    fx.flash(p.x, 1.4, p.z, 0xc02020, 5, 6, 0.3);
  },
  /** Go for the Throat: the spring up, a fountain of blood at the top of it. */
  throatSpring(fx: EffectSystem, bones: Bones, time: number): void {
    boneTrail(fx, bones.head, time, { color: 0xb0a090, width: 0.25, life: 0.22, emit: 0.3 });
  },
  throatHit(fx: EffectSystem, p: { x: number; z: number }, dir: THREE.Vector3): void {
    const c = at(p, 1.6);
    jaws(fx, c, dir, 0.5, 0.14);
    fx.fx.burst('ss.throat.fountain', c.x, c.y, c.z, {});
    fx.decals.add('gore', p.x, p.z, 0.8);
    shake(0.16, 0.2);
  },
  /** Bloodmoon: a red moon over the head, red light falling from it while it lasts. */
  bloodmoon(fx: EffectSystem, follow: THREE.Object3D, dur: number): void {
    const p = follow.position;
    fx.fx.burst('ss.eyes.wolf', p.x, 1.9, p.z, {});
    fx.flash(p.x, 3.2, p.z, 0xc01818, 8, 9, 0.5);
    floorRing(fx, p.x, p.z, 3.4, 0xc01818, 1.0, 1.2);
    let acc = 1;
    every(dur, (_u, dt) => {
      acc += dt;
      if (acc < 1.2) return;
      acc = 0;
      const q = follow.position;
      fx.fx.burst('ss.moon.disc', q.x, 3.3, q.z, {});
      fx.fx.burst('ss.moon.rain', q.x, 2.8, q.z, {});
    });
  },
};

// ---------------------------------------------------------------------------
// Claw
// ---------------------------------------------------------------------------

const BEAR_CLAW = 0xf0e0c0;

export const ClawFX = {
  /** Maul: four wide scores and grit thrown off the swing. */
  maulStroke(fx: EffectSystem, bones: Bones, side: 'L' | 'R', dur: number): void {
    clawTrails(fx, bones, side, { n: 4, dur, color: BEAR_CLAW, width: 0.03, spread: 0.07, len: 0.12, life: 0.22, emit: 0.7 });
  },
  maulGrit(fx: EffectSystem, p: THREE.Vector3, dir: THREE.Vector3): void {
    fx.fx.burst('ss.maul.grit', p.x + dir.x * 1.4, 0.4, p.z + dir.z * 1.4, { dir });
  },
  /** Rattling Roar: breath and spit blasted out in front, dust shoved out round the feet. */
  roar(fx: EffectSystem, p: THREE.Vector3, dir: THREE.Vector3, radius: number): void {
    fx.fx.burst('ss.roar.blast', p.x + dir.x * 0.5, 2.0, p.z + dir.z * 0.5, { dir: dir.clone().setY(-0.1).normalize() });
    fx.fx.burst('ss.roar.dust', p.x, 0.15, p.z, {});
    floorRing(fx, p.x, p.z, radius, 0xc09060, 0.55, 1.0);
    shake(0.3, 0.45);
  },
  /** Hammerfall: two craters side by side, cracks and stone thrown up. */
  hammerfall(fx: EffectSystem, p: { x: number; z: number }, dir: THREE.Vector3, radius: number): void {
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (const s of [-1, 1]) {
      const x = p.x + side.x * 0.45 * s;
      const z = p.z + side.z * 0.45 * s;
      fx.decals.add('crater', x, z, 0.75);
    }
    fx.decals.add('crack', p.x, p.z, radius * 0.9, Math.atan2(dir.x, dir.z));
    fx.fx.burst('ss.hammer.chunks', p.x, 0.2, p.z, {});
    floorRing(fx, p.x, p.z, radius, 0xa07848, 0.45, 0.9);
    fx.flash(p.x, 0.6, p.z, 0xd09050, 7, 6, 0.16);
    shake(0.45, 0.4);
  },
  /** Bristle: spines out of the pelt, again every second it lasts. */
  bristle(fx: EffectSystem, follow: THREE.Object3D, dur: number): void {
    const p = follow.position;
    fx.fx.burst('ss.bristle.spines', p.x, 1.4, p.z, {});
    let acc = 0;
    every(dur, (_u, dt) => {
      acc += dt;
      if (acc < 1) return;
      acc = 0;
      fx.fx.burst('ss.bristle.spines', follow.position.x, 1.4, follow.position.z, { count: 5 });
    });
  },
  /** Overrun: the dust wake and a furrow down the floor. */
  overrunRun(fx: EffectSystem, bones: Bones, time: number): void {
    boneTrail(fx, bones.pelvis, time, { color: 0x6a5a44, width: 0.8, life: 0.4, emit: 0.15, puff: 'ss.overrun.wake', every: 0.05 });
  },
  overrunFurrow(fx: EffectSystem, from: THREE.Vector3, to: THREE.Vector3): void {
    const d = to.clone().sub(from);
    const n = Math.max(1, Math.floor(d.length() / 1.2));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      fx.decals.add('dust', from.x + d.x * u, from.z + d.z * u, 0.8, Math.atan2(d.x, d.z));
    }
  },
  overrunToss(fx: EffectSystem, p: { x: number; z: number }): void {
    fx.fx.burst('ss.maul.grit', p.x, 0.6, p.z, { count: 8 });
  },
  /** Reaping Swipe: a full ring scored round the bear, dust thrown off it all the way round. */
  reap(fx: EffectSystem, p: THREE.Vector3, radius: number, dur: number, start: number): void {
    const h = fx.ribbons.start('trail', { life: 0.3, width: 0.09, color: BEAR_CLAW, emit: 0.7 });
    let last = 0;
    every(
      dur,
      (u) => {
        const a = start + u * Math.PI * 2;
        const x = p.x + Math.sin(a) * radius * 0.75;
        const z = p.z + Math.cos(a) * radius * 0.75;
        fx.ribbons.pushPoint(h, x, 1.0, z);
        if (u - last > 0.12) {
          last = u;
          fx.fx.burst('ss.reap.ring', x, 0.3, z, { dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)) });
        }
      },
      () => fx.ribbons.retire(h),
    );
    fx.delay(dur, () => floorRing(fx, p.x, p.z, radius, 0xb08858, 0.45, 0.8));
  },
  /** Bear Hug: grit squeezed in, bone cracking out, one squeeze. */
  hug(fx: EffectSystem, p: { x: number; z: number }): void {
    fx.fx.burst('ss.hug.crush', p.x, 1.2, p.z, {});
    shake(0.1, 0.15);
  },
  /** Ursa Major: the seven stars of the great bear over the head, stone rising round the feet. */
  ursa(fx: EffectSystem, p: THREE.Vector3, dir: THREE.Vector3): void {
    fx.fx.burst('ss.ursa.rise', p.x, 0.1, p.z, {});
    fx.decals.add('crack', p.x, p.z, 2.4);
    shake(0.35, 0.5);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    // The plough: four stars of the bowl and three of the handle.
    const stars: Array<[number, number]> = [[-0.9, 0.0], [-0.4, 0.15], [-0.45, 0.65], [-0.95, 0.55], [0.1, 0.0], [0.55, -0.1], [1.0, -0.35]];
    stars.forEach(([s, h], i) => {
      fx.delay(0.08 * i, () => {
        const x = p.x + side.x * s * 1.1;
        const z = p.z + side.z * s * 1.1;
        fx.fx.burst('ss.ursa.star', x, 3.4 + h, z, {});
      });
    });
    fx.flash(p.x, 3.5, p.z, 0xfff0c0, 7, 9, 0.6);
  },
};
