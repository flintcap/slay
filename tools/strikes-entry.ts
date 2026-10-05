/**
 * Entry point for `tools/check-strikes.mjs`.
 *
 * Does every strike land when the game says it lands, with the weapon on
 * target, the feet on the floor and nothing popping? A real model, a real
 * weapon through the real socket code and the real animator play each action
 * exactly the way `Player.beginAction` asks for it (rate from the action's
 * length, contact from `contactDelay`), while the body runs in, brakes and
 * turns to face its target the way `Player` moves it. Every frame the weapon
 * tip, both feet and every joint are read back.
 *
 * No renderer and no browser.
 */
import * as THREE from 'three';
import { buildPlayerModel, attachToSocket, weaponGrip, carryGrip } from '../src/art/CharacterModels';
import { buildItemModel } from '../src/art/ItemModels';
import { Animator } from '../src/art/Animation';
import { ITEM_BASES } from '../src/data/itemBases';
import { contactDelay } from '../src/entities/Player';
import { Random } from '../src/core/RNG';

const DT = 1 / 60;

interface Case {
  clip: string;
  base: string;
  /** Action length handed to beginAction, seconds. */
  duration: number;
  /** Seconds to the contact frame; computed like Player when undefined. */
  contact?: number;
  /** Run in at this speed before the action, m/s. */
  runIn: number;
  /** Turn to face a target this far off the run heading, radians. */
  turn: number;
}

const ATTACK = 0.42;
/** Set STRIKE_DEBUG=<case index> to print that case's feet frame by frame. */
const DEBUG_INDEX = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.STRIKE_DEBUG ?? -1);
let DEBUG: Case | null = null;
const CAST = 0.5;
const CASES: Case[] = [
  { clip: 'attack1', base: 'sword.short', duration: ATTACK, runIn: 0, turn: 0 },
  { clip: 'attack2', base: 'sword.short', duration: ATTACK, runIn: 0, turn: 0 },
  { clip: 'attack1', base: 'sword.short', duration: ATTACK, runIn: 4.6, turn: 0.9 },
  { clip: 'attack1', base: 'dagger.dirk', duration: ATTACK * 0.7, runIn: 0, turn: 0 },
  { clip: 'attack2', base: 'axe.hand', duration: ATTACK, runIn: 0, turn: 0 },
  { clip: 'attack1', base: 'sword.great', duration: ATTACK, runIn: 0, turn: 0 },
  { clip: 'attack2', base: 'sword.great', duration: ATTACK, runIn: 4.6, turn: -0.8 },
  { clip: 'slam', base: 'axe.battle', duration: ATTACK, runIn: 0, turn: 0 },
  { clip: 'thrust', base: 'spear.spear', duration: ATTACK, runIn: 0, turn: 0 },
  { clip: 'lunge', base: 'sword.short', duration: ATTACK, runIn: 0, turn: 0 },
  { clip: 'stomp', base: 'mace.mace', duration: ATTACK, runIn: 0, turn: 0 },
  { clip: 'cast', base: 'staff.short', duration: CAST, runIn: 0, turn: 0 },
  { clip: 'shoot', base: 'bow.short', duration: 0.46, runIn: 0, turn: 0 },
  { clip: 'attack1', base: 'sword.short', duration: ATTACK * 0.5, runIn: 0, turn: 0 },
];

interface Row {
  clip: string;
  base: string;
  /** Seconds between the clip's contact key and the game's contact frame. */
  keyErr: number;
  /** Seconds between the fastest tip speed and the contact frame. */
  peakErr: number;
  /** Tip direction at contact (character space): forward and up components. */
  fwd: number;
  up: number;
  /** Tip position at contact, metres ahead of the body. */
  reach: number;
  /** Mean and worst planted-foot speed over the floor, m/s. */
  slide: number;
  slideMax: number;
  /** Biggest one-frame joint second difference outside the arms, metres. */
  pop: number;
  popAt: string;
  /** Worst gap between the off hand and the haft, metres (two-handed only). */
  gap: number;
}

function run(c: Case): Row {
  const base = ITEM_BASES.find((b) => b.id === c.base);
  if (!base) throw new Error(`no base ${c.base}`);
  const rng = new Random(0x5717);
  const built = buildPlayerModel('warden', rng, ['mainHand']);
  const mover = new THREE.Group();
  mover.add(built.root);
  const scene = new THREE.Scene();
  scene.add(mover);
  const two = base.slot === 'twoHand';
  const grip = weaponGrip(base.category, two);
  const mesh = buildItemModel(base.visual ?? { shape: 'auto', palette: 'metal.steel' }, rng, 'rare');
  attachToSocket(built.root, built.bones, 'mainHand', mesh, undefined, grip);
  const anim = new Animator(built.bones);
  anim.follow(mover);
  anim.setGrip(carryGrip(base.category, two));
  anim.setWeapon(grip);
  anim.play('idle', { fade: 0 });
  // The ankle's height standing at rest: below this (plus a hair) a foot is on the floor.
  scene.updateMatrixWorld(true);
  const restY = built.bones.footL.getWorldPosition(new THREE.Vector3()).y;

  const vel = new THREE.Vector2();
  let facing = 0;
  let target = 0;
  const step = (want: number): void => {
    const wx = Math.sin(facing) * want;
    const wz = Math.cos(facing) * want;
    if (want > 0) {
      vel.x += (wx - vel.x) * Math.min(1, DT * 14);
      vel.y += (wz - vel.y) * Math.min(1, DT * 14);
    } else {
      vel.multiplyScalar(Math.max(0, 1 - DT * 12));
    }
    mover.position.x += vel.x * DT;
    mover.position.z += vel.y * DT;
    let d = target - facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    facing += d * Math.min(1, DT * 16);
    mover.rotation.y = facing;
  };

  // Settle, then run in (or stand).
  for (let i = 0; i < 90; i++) {
    step(0);
    anim.update(DT);
  }
  if (c.runIn > 0) {
    for (let i = 0; i < 60; i++) {
      step(c.runIn);
      const v = vel.length();
      anim.play(v > 3 ? 'run' : 'walk', { fade: 0.14, speed: v / 4.6 });
      anim.update(DT);
    }
  }

  // The action, as Player.beginAction plays it.
  const contact = c.contact ?? (contactDelay(c.clip, c.duration) || Math.min(0.1, c.duration * 0.3));
  target = facing + c.turn;
  anim.play(c.clip, { fade: 0.08, speed: Math.max(0.5, 0.45 / Math.max(c.duration, 0.15)), restart: true, contact });

  const tip = new THREE.Vector3();
  const lastTip = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const footNames = ['footL', 'footR'];
  const prevFoot = footNames.map(() => new THREE.Vector3());
  const prevPlanted = footNames.map(() => false);
  const jointNames = Object.keys(built.bones);
  const prevJoint = new Map<string, THREE.Vector3>();
  const prevStep = new Map<string, THREE.Vector3>();
  const ARM = /shoulder|elbow|hand/;

  let keyAt = -1;
  let peak = 0;
  let peakAt = 0;
  let fwd = 0;
  let up = 0;
  let reach = 0;
  let slideSum = 0;
  let planted = 0;
  let slideMax = 0;
  let pop = 0;
  let popAt = '';
  let gap = 0;
  const haft = grip === 'twoHand' ? new THREE.Vector3(0, 0.19, -0.03) : grip === 'staff' ? new THREE.Vector3(0, 0.32, -0.03) : null;
  const frames = Math.round((c.duration * 1.6) / DT);
  for (let f = 0; f < frames; f++) {
    const t = (f + 1) * DT;
    step(0);
    anim.update(DT);
    scene.updateMatrixWorld(true);
    const st = anim.actionState;
    if (keyAt < 0 && st && st.contact !== null && st.t >= st.contact - 1e-4) keyAt = t;

    // The business end: 0.8 m up the weapon from the grip.
    mesh.getWorldQuaternion(q);
    tip.set(0, 0.8, 0).applyQuaternion(q).add(mesh.getWorldPosition(tmp));
    if (f > 0 && t < contact + 0.25) {
      const sp = tip.distanceTo(lastTip) / DT;
      if (sp > peak) {
        peak = sp;
        peakAt = t;
      }
    }
    lastTip.copy(tip);
    if (Math.abs(t - contact) < DT * 0.5 + 1e-6) {
      const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      // Into character space (undo the mover's yaw).
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -facing);
      fwd = dir.z;
      up = dir.y;
      const local = tip.clone().sub(mover.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -facing);
      reach = local.z;
    }

    footNames.forEach((name, i) => {
      const p = built.bones[name].getWorldPosition(new THREE.Vector3());
      const isPlanted = p.y < restY + 0.012;
      if (DEBUG === c) {
        const l = p.clone().sub(mover.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -facing);
        console.error(
          `${t.toFixed(3)} ${name} y=${(p.y - restY).toFixed(3)} local=(${l.x.toFixed(2)},${l.z.toFixed(2)}) world=(${p.x.toFixed(3)},${p.z.toFixed(3)}) v=${vel.length().toFixed(2)}`,
        );
      }
      if (isPlanted && prevPlanted[i]) {
        const s = Math.hypot(p.x - prevFoot[i].x, p.z - prevFoot[i].z) / DT;
        slideSum += s;
        planted++;
        slideMax = Math.max(slideMax, s);
      }
      prevPlanted[i] = isPlanted;
      prevFoot[i].copy(p);
    });

    for (const name of jointNames) {
      const p = built.bones[name].getWorldPosition(new THREE.Vector3());
      const prev = prevJoint.get(name);
      if (prev) {
        const stepV = p.clone().sub(prev);
        const before = prevStep.get(name);
        if (before && !ARM.test(name)) {
          const jump = stepV.distanceTo(before);
          if (jump > pop) {
            pop = jump;
            popAt = `${name}@${t.toFixed(2)}`;
          }
        }
        prevStep.set(name, stepV);
      }
      prevJoint.set(name, p);
    }

    if (haft && st) {
      const h = haft.clone().applyMatrix4(mesh.matrixWorld);
      gap = Math.max(gap, h.distanceTo(built.bones.handL.getWorldPosition(new THREE.Vector3())));
    }
  }

  return {
    clip: c.clip,
    base: c.base + (c.runIn ? ' run-in' : '') + (c.duration < ATTACK * 0.6 ? ' fast' : ''),
    keyErr: +(keyAt < 0 ? 9 : keyAt - contact).toFixed(3),
    peakErr: +(peakAt - contact).toFixed(3),
    fwd: +fwd.toFixed(2),
    up: +up.toFixed(2),
    reach: +reach.toFixed(2),
    slide: +(planted ? slideSum / planted : 0).toFixed(3),
    slideMax: +slideMax.toFixed(2),
    pop: +pop.toFixed(3),
    popAt,
    gap: +gap.toFixed(3),
  };
}

DEBUG = CASES[DEBUG_INDEX] ?? null;

console.log(JSON.stringify(CASES.map(run)));
