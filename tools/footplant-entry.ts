/**
 * Entry point for `tools/check-footplant.mjs`.
 *
 * Do the feet stay where they are put? A real warden model and the real
 * animator walk a scripted route (start, walk, run, sprint, hard turns, stop,
 * an attack mid-run and back to running), exactly as `Player` drives them, and
 * every frame the world position of each foot is read back.
 *
 * A foot that is on the ground and moving across it is skating. That is the
 * number this reports: how fast planted feet travel over the floor, against
 * how fast the body travels. It also reports the biggest single-frame jump of
 * any joint, which is what a pop between two states looks like in numbers.
 *
 * No renderer and no browser.
 */
import * as THREE from 'three';
import { buildPlayerModel } from '../src/art/CharacterModels';
import { Animator } from '../src/art/Animation';
import { Random } from '../src/core/RNG';

const DT = 1 / 60;

interface Seg {
  /** Seconds this leg of the route lasts. */
  t: number;
  /** Target ground speed, m/s. */
  speed: number;
  /** Turn rate of the wanted heading, rad/s. */
  turn?: number;
  /** One-shot to fire at the start of the segment. */
  action?: string;
  label: string;
}

const ROUTE: Seg[] = [
  { t: 1.0, speed: 0, label: 'stand' },
  { t: 1.2, speed: 1.4, label: 'walk' },
  { t: 1.5, speed: 4.6, label: 'run' },
  { t: 1.0, speed: 4.6, turn: 2.6, label: 'run curve' },
  { t: 0.6, speed: 4.6, turn: -5.2, label: 'run hard turn' },
  { t: 1.2, speed: 7.0, label: 'sprint' },
  { t: 1.2, speed: 0, label: 'stop' },
  { t: 0.7, speed: 0, turn: 4.5, label: 'turn in place' },
  { t: 0.8, speed: 0, label: 'settle' },
  { t: 0.9, speed: 4.6, label: 'run again' },
  { t: 0.7, speed: 0, action: 'attack1', label: 'attack' },
  { t: 1.2, speed: 4.6, label: 'run after attack' },
  { t: 1.2, speed: 0, label: 'final stop' },
];

interface SegStats {
  label: string;
  bodySpeed: number;
  plantedFrames: number;
  /** Mean speed of planted feet over the ground, m/s. */
  slide: number;
  /** Worst single planted frame, m/s. */
  slideMax: number;
  /** Segments where an action owns the body; its own clip authors the feet. */
  action: boolean;
}

function run(): { segs: SegStats[]; slide: number; slideMax: number; pop: number; popAt: string; actionPop: number; actionPopAt: string } {
  const rng = new Random(0xf007);
  const built = buildPlayerModel('warden', rng);
  const mover = new THREE.Group();
  mover.add(built.root);
  const scene = new THREE.Scene();
  scene.add(mover);
  const anim = new Animator(built.bones);
  // Newer animators read the body's motion directly; older ones ignore this.
  (anim as unknown as { follow?: (o: THREE.Object3D) => void }).follow?.(mover);
  anim.play('idle', { fade: 0 });

  const footNames = ['footL', 'footR'];
  const prevFoot = footNames.map(() => new THREE.Vector3());
  const prevPlanted = footNames.map(() => false);
  const restY = (() => {
    built.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    built.bones.footL.getWorldPosition(v);
    return v.y;
  })();
  const PLANT_EPS = 0.012;

  const jointNames = Object.keys(built.bones);
  const prevJoint = new Map<string, THREE.Vector3>();
  const prevStep = new Map<string, THREE.Vector3>();
  const ARM = /shoulder|elbow|hand/;

  let heading = 0;
  let facing = 0;
  const vel = new THREE.Vector2();
  let busy = 0;

  const segs: SegStats[] = [];
  let totalSlide = 0;
  let totalPlanted = 0;
  let worstSlide = 0;
  let pop = 0;
  let popAt = '';
  let actionPop = 0;
  let actionPopAt = '';

  for (const seg of ROUTE) {
    const frames = Math.round(seg.t / DT);
    let slideSum = 0;
    let planted = 0;
    let slideMax = 0;
    let travelled = 0;
    if (seg.action) {
      busy = 0.62;
      anim.play(seg.action, { fade: 0.08, speed: 1 });
    }
    for (let f = 0; f < frames; f++) {
      heading += (seg.turn ?? 0) * DT;
      busy = Math.max(0, busy - DT);
      const want = busy > 0 ? 0 : seg.speed;
      // Same acceleration model as Player.updateMovement.
      const wx = Math.sin(heading) * want;
      const wz = Math.cos(heading) * want;
      if (want > 0) {
        vel.x += (wx - vel.x) * Math.min(1, DT * 14);
        vel.y += (wz - vel.y) * Math.min(1, DT * 14);
      } else {
        vel.multiplyScalar(Math.max(0, 1 - DT * (busy > 0 ? 12 : 18)));
      }
      mover.position.x += vel.x * DT;
      mover.position.z += vel.y * DT;
      travelled += vel.length() * DT;
      const speed = vel.length();
      // Facing chases the heading the way Player does, so turns are real.
      const target = want > 0 || seg.turn ? heading : facing;
      let d = target - facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      facing += d * Math.min(1, DT * 16);
      mover.rotation.y = facing;

      if (busy <= 0) {
        if (speed > 0.4) anim.play(speed > 4.6 * 0.65 ? 'run' : 'walk', { fade: 0.14, speed: speed / 4.6 });
        else anim.play('idle', { fade: 0.2 });
      }
      anim.update(DT);
      scene.updateMatrixWorld(true);

      footNames.forEach((name, i) => {
        const p = built.bones[name].getWorldPosition(new THREE.Vector3());
        const isPlanted = p.y < restY + PLANT_EPS;
        if (isPlanted && prevPlanted[i]) {
          const s = Math.hypot(p.x - prevFoot[i].x, p.z - prevFoot[i].z) / DT;
          slideSum += s;
          planted++;
          slideMax = Math.max(slideMax, s);
        }
        prevPlanted[i] = isPlanted;
        prevFoot[i].copy(p);
      });

      // Pops: a joint whose motion changes more in one frame than any
      // authored curve could make it (a second difference, so steady fast
      // motion is not a pop but a discontinuity is). Arms are left out while
      // an action swings them, since a strike is meant to be violent.
      for (const name of jointNames) {
        const p = built.bones[name].getWorldPosition(new THREE.Vector3());
        const prev = prevJoint.get(name);
        if (prev) {
          const stepV = p.clone().sub(prev);
          const before = prevStep.get(name);
          if (before && !(seg.action && ARM.test(name))) {
            const jump = stepV.distanceTo(before);
            if (seg.action) {
              if (jump > actionPop) {
                actionPop = jump;
                actionPopAt = `${seg.label}:${name}`;
              }
            } else if (jump > pop) {
              pop = jump;
              popAt = `${seg.label}:${name}`;
            }
          }
          prevStep.set(name, stepV);
        }
        prevJoint.set(name, p);
      }
    }
    const st: SegStats = {
      label: seg.label,
      bodySpeed: +(travelled / seg.t).toFixed(2),
      plantedFrames: planted,
      slide: +(planted ? slideSum / planted : 0).toFixed(3),
      slideMax: +slideMax.toFixed(2),
      action: !!seg.action,
    };
    segs.push(st);
    if (!seg.action) {
      totalSlide += slideSum;
      totalPlanted += planted;
      worstSlide = Math.max(worstSlide, slideMax);
    }
  }
  return {
    segs,
    slide: +(totalPlanted ? totalSlide / totalPlanted : 0).toFixed(3),
    slideMax: +worstSlide.toFixed(2),
    pop: +pop.toFixed(3),
    popAt,
    actionPop: +actionPop.toFixed(3),
    actionPopAt,
  };
}

console.log(JSON.stringify(run()));
