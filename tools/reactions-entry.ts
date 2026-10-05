/**
 * Entry point for `tools/check-reactions.mjs`.
 *
 * Hits, stuns, knockdowns and deaths on a real model with the real animator,
 * driven the way `Player` drives them. Per scenario it reads back every joint
 * each frame and reports the biggest one-frame jump (a pop), planted-foot
 * slide, and what the scenario is about (a swing still landing on time, the
 * body lying on the floor, a frozen body holding still).
 *
 * No renderer and no browser.
 */
import * as THREE from 'three';
import { buildPlayerModel, attachToSocket, weaponGrip, carryGrip } from '../src/art/CharacterModels';
import { buildItemModel } from '../src/art/ItemModels';
import { Animator, type BodyCondition } from '../src/art/Animation';
import { ITEM_BASES } from '../src/data/itemBases';
import { Random } from '../src/core/RNG';

const DT = 1 / 60;

interface Rig {
  anim: Animator;
  mover: THREE.Group;
  scene: THREE.Scene;
  bones: Record<string, THREE.Bone>;
  restY: number;
}

function rig(weapon = 'sword.short'): Rig {
  const rng = new Random(0x4ea7);
  const built = buildPlayerModel('warden', rng, ['mainHand']);
  const mover = new THREE.Group();
  mover.add(built.root);
  const scene = new THREE.Scene();
  scene.add(mover);
  const base = ITEM_BASES.find((b) => b.id === weapon)!;
  const two = base.slot === 'twoHand';
  const grip = weaponGrip(base.category, two);
  attachToSocket(built.root, built.bones, 'mainHand', buildItemModel(base.visual ?? { shape: 'auto', palette: 'metal.steel' }, rng, 'rare'), undefined, grip);
  const anim = new Animator(built.bones);
  anim.follow(mover);
  anim.setGrip(carryGrip(base.category, two));
  anim.setWeapon(grip, base.category);
  anim.play('idle', { fade: 0 });
  scene.updateMatrixWorld(true);
  const restY = built.bones.footL.getWorldPosition(new THREE.Vector3()).y;
  for (let i = 0; i < 60; i++) anim.update(DT);
  return { anim, mover, scene, bones: built.bones, restY };
}

/** Per-frame bookkeeping: pops, slide, lowest joint and hips height. */
class Meter {
  pop = 0;
  popAt = '';
  slideSum = 0;
  planted = 0;
  slideMax = 0;
  lowest = Infinity;
  lowestAt = '';
  hipsY = 0;
  private prev = new Map<string, THREE.Vector3>();
  private prevStep = new Map<string, THREE.Vector3>();
  private prevFoot: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  private prevPlanted = [false, false];
  constructor(private r: Rig, private arms = false) {}
  sample(t: number): void {
    const { bones, scene, restY, mover } = this.r;
    scene.updateMatrixWorld(true);
    for (const [name, b] of Object.entries(bones)) {
      // Relative to the body's own root: a shove moves the root, not the pose.
      const p = b.getWorldPosition(new THREE.Vector3());
      this.lowest = Math.min(this.lowest, p.y);
      if (this.lowest === p.y) this.lowestAt = name;
      p.sub(mover.position);
      const prev = this.prev.get(name);
      if (prev) {
        const step = p.clone().sub(prev);
        const before = this.prevStep.get(name);
        if (before && (this.arms || !/shoulder|elbow|hand/.test(name))) {
          const jump = step.distanceTo(before);
          if (jump > this.pop) {
            this.pop = jump;
            this.popAt = `${name}@${t.toFixed(2)}`;
          }
        }
        this.prevStep.set(name, step);
      }
      this.prev.set(name, p);
    }
    this.hipsY = bones.hips.getWorldPosition(new THREE.Vector3()).y;
    ['footL', 'footR'].forEach((n, i) => {
      const p = bones[n].getWorldPosition(new THREE.Vector3());
      const planted = p.y < restY + 0.012;
      if (planted && this.prevPlanted[i]) {
        const s = Math.hypot(p.x - this.prevFoot[i].x, p.z - this.prevFoot[i].z) / DT;
        this.slideSum += s;
        this.planted++;
        this.slideMax = Math.max(this.slideMax, s);
      }
      this.prevPlanted[i] = planted;
      this.prevFoot[i].copy(p);
    });
  }
  /** Forget the last step, so a teleport of the root is not counted as a pop. */
  skip(): void {
    this.prevStep.clear();
    this.prev.clear();
  }
  get slide(): number {
    return this.planted ? this.slideSum / this.planted : 0;
  }
}

interface Row {
  name: string;
  pop: number;
  popAt: string;
  slide: number;
  slideMax: number;
  lowest: number;
  hipsY: number;
  /** Scenario-specific number and whether it is right. */
  note: string;
  ok: boolean;
}

function row(name: string, m: Meter, note: string, ok: boolean): Row {
  return {
    name,
    pop: +m.pop.toFixed(3),
    popAt: m.popAt,
    slide: +m.slide.toFixed(3),
    slideMax: +m.slideMax.toFixed(2),
    lowest: +m.lowest.toFixed(3),
    hipsY: +m.hipsY.toFixed(3),
    note,
    ok,
  };
}

function run(r: Rig, m: Meter, seconds: number, each?: (f: number) => void): void {
  const n = Math.round(seconds / DT);
  for (let f = 0; f < n; f++) {
    each?.(f);
    r.anim.update(DT);
    m.sample(f * DT);
  }
}

const rows: Row[] = [];

// A hit mid-swing must not cut the swing: the contact pose still lands on time.
{
  const r = rig();
  const m = new Meter(r);
  const contact = 0.147;
  r.anim.play('attack1', { fade: 0.08, speed: 0.45 / 0.42, restart: true, contact });
  let keyAt = -1;
  run(r, m, 0.6, (f) => {
    if (f === 3) r.anim.play("hurt", { fade: 0.04, once: true });
    const st = r.anim.actionState;
    if (keyAt < 0 && st && st.clip === 'attack1' && st.contact !== null && st.t >= st.contact - 1e-4) keyAt = f * DT;
  });
  rows.push(row('hit mid-swing', m, `contact key at ${keyAt.toFixed(3)}s (want ${contact})`, Math.abs(keyAt - contact) <= DT + 1e-3));
}

// A hit while running must not stop the legs.
{
  const r = rig();
  const m = new Meter(r);
  let clipAfter = '';
  run(r, m, 1.4, (f) => {
    r.mover.position.z += 4.6 * DT;
    r.anim.play('run', { fade: 0.14, speed: 1 });
    if (f === 50) r.anim.play('hurt', { fade: 0.04, once: true });
    if (f === 56) clipAfter = r.anim.clip;
  });
  rows.push(row('hit while running', m, `clip after the hit: ${clipAfter}`, clipAfter === 'run'));
}

// Stunned and back: no pops going in or out, feet stay planted.
{
  const r = rig();
  const m = new Meter(r);
  run(r, m, 2.2, (f) => {
    const c: BodyCondition = f >= 20 && f < 100 ? 'stunned' : 'none';
    r.anim.setCondition(c);
  });
  rows.push(row('stunned, then free', m, 'stun loop in and out', true));
}

// Frozen: the body holds exactly still, then thaws without a jump.
{
  const r = rig();
  const m = new Meter(r, true);
  r.anim.play('walk', { fade: 0.1 });
  let moved = 0;
  let hand = new THREE.Vector3();
  run(r, m, 1.6, (f) => {
    // A frozen hero is held in place by the game, so the body only walks either side of it.
    if (f < 30 || f >= 70) r.mover.position.z += 1.4 * DT;
    r.anim.play('walk', { fade: 0.14, speed: 0.3 });
    r.anim.setCondition(f >= 30 && f < 70 ? 'frozen' : 'none');
    if (f === 31) hand = r.bones.handR.getWorldPosition(new THREE.Vector3()).sub(r.mover.position);
    if (f === 69) moved = r.bones.handR.getWorldPosition(new THREE.Vector3()).sub(r.mover.position).distanceTo(hand);
  });
  rows.push(row('frozen, then thawed', m, `hand moved ${moved.toFixed(4)} m while frozen`, moved < 1e-4));
}

// Knocked down: sits low, holds, gets up without a jump.
{
  const r = rig();
  const m = new Meter(r);
  let low = Infinity;
  run(r, m, 2.6, (f) => {
    r.anim.setCondition(f >= 10 && f < 100 ? 'down' : 'none');
    if (f > 60 && f < 100) low = Math.min(low, r.bones.hips.getWorldPosition(new THREE.Vector3()).y);
  });
  rows.push(row('knocked down, then up', m, `hips ${low.toFixed(2)} m while down`, low < 0.45));
}

// Knocked back from a stand.
{
  const r = rig();
  const m = new Meter(r);
  run(r, m, 1.2, (f) => {
    if (f === 5) {
      // The game moves the root back in one go; that jump is the game's.
      r.mover.position.z -= 0.3;
      r.anim.play('stagger', { fade: 0.05 });
      m.skip();
    }
  });
  rows.push(row('staggered', m, 'shoved 0.3 m', true));
}

// Deaths: fall and lie on the floor, nothing through it.
for (const [name, prep] of [
  ['death, thrown back', (a: Animator) => a.play('stagger', { fade: 0.05 })],
  ['death, crumpling', (a: Animator) => a.flinch(1)],
] as Array<[string, (a: Animator) => void]>) {
  const r = rig();
  const m = new Meter(r, true);
  prep(r.anim);
  r.anim.play('death', { fade: 0.1, once: true, hold: true });
  const clip = r.anim.clip;
  run(r, m, 2.0);
  rows.push(row(name, m, `${clip}; hips ${m.hipsY.toFixed(2)} m, lowest joint ${m.lowestAt} ${m.lowest.toFixed(2)} m`, m.hipsY < 0.3 && m.lowest > -0.04));
}

// Long hair: swings back on a run, forward on a hard stop, then settles.
{
  const rng = new Random(0x4a1);
  const built = buildPlayerModel('ranger', rng);
  const mover = new THREE.Group();
  mover.add(built.root);
  const scene = new THREE.Scene();
  scene.add(mover);
  const anim = new Animator(built.bones);
  anim.follow(mover);
  anim.play('idle', { fade: 0 });
  const r: Rig = { anim, mover, scene, bones: built.bones, restY: 0 };
  const m = new Meter(r);
  const sway = built.root.getObjectByName('hairSway') as THREE.Bone | undefined;
  let back = 0;
  let fwd = 0;
  let end = 0;
  let bad = false;
  run(r, m, 4, (f) => {
    const v = f < 90 ? 4.6 : 0;
    mover.position.z += v * DT * (f < 90 ? 1 : Math.max(0, 1 - (f - 90) / 6));
    anim.play(v > 0 ? 'run' : 'idle', { fade: 0.15, speed: 1 });
    const ax = sway ? sway.rotation.x : 0;
    if (!Number.isFinite(ax)) bad = true;
    if (f > 40 && f < 90) back = Math.max(back, ax);
    if (f >= 90 && f < 130) fwd = Math.min(fwd, ax);
    end = Math.abs(ax) + Math.abs(sway ? sway.rotation.z : 0);
  });
  rows.push(
    row(
      'long hair, run and stop',
      m,
      `hair bone ${sway ? 'rigged' : 'missing'}; back ${back.toFixed(2)}, forward ${fwd.toFixed(2)}, at rest ${end.toFixed(3)}`,
      !!sway && !bad && back > 0.05 && fwd < -0.02 && end < 0.06,
    ),
  );
}

// A quiver on the back swings from its strap on a stop, then settles.
{
  const rng = new Random(0x9a1);
  const built = buildPlayerModel('ranger', rng, ['offHand']);
  const mover = new THREE.Group();
  mover.add(built.root);
  const scene = new THREE.Scene();
  scene.add(mover);
  const quiver = buildItemModel({ shape: 'quiver', palette: 'leather.brown' }, rng, 'normal');
  attachToSocket(built.root, built.bones, 'offHand', quiver, 'quiver');
  const anim = new Animator(built.bones);
  anim.follow(mover);
  anim.play('idle', { fade: 0 });
  const r: Rig = { anim, mover, scene, bones: built.bones, restY: 0 };
  const m = new Meter(r);
  const rest = quiver.quaternion.clone();
  let swing = 0;
  let end = 0;
  run(r, m, 3.5, (f) => {
    const v = f < 70 ? 4.6 : 0;
    mover.position.z += v * DT;
    anim.play(v > 0 ? 'run' : 'idle', { fade: 0.15, speed: 1 });
    const a = quiver.quaternion.angleTo(rest);
    if (f >= 70 && f < 110) swing = Math.max(swing, a);
    end = a;
  });
  rows.push(row('quiver, run and stop', m, `swing ${swing.toFixed(2)} rad, at rest ${end.toFixed(3)}`, swing > 0.02 && swing <= 0.36 && end < 0.03));
}

console.log(JSON.stringify(rows));
