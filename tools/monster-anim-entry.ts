/**
 * Entry point for `tools/check-monster-anim.mjs`.
 *
 * One real monster per archetype, built by `buildMonsterModel` and driven by
 * the real `RigAnimator` exactly as `Enemy` drives it: spawn, stand, walk and
 * run with the model really moving, a telegraphed attack and its strike, a
 * cast, a hit while walking, and a death. Every frame each bone's position in
 * the model's own space is read back. Reports, per archetype: any NaN, the
 * biggest one-frame jump of any bone (a second difference, in hip heights, so
 * a goblin and a colossus are judged alike), where the hips end after death,
 * and how far the legs actually swing when walking (they must move).
 *
 * No renderer and no browser.
 */
import * as THREE from 'three';
import { buildMonsterModel, monsterArchetype, RigAnimator, type RigAction } from '../src/entities/MonsterModels';
import { MONSTERS } from '../src/data/monsters';
import { Random } from '../src/core/RNG';

const DT = 1 / 60;

interface Step {
  label: string;
  seconds: number;
  speed: number;
  action?: RigAction;
  /** Seconds the action lasts (Enemy's actionLen). */
  len?: number;
  death?: boolean;
  spawn?: boolean;
}

const SCRIPT: Step[] = [
  { label: 'spawn', seconds: 0.7, speed: 0, spawn: true },
  { label: 'stand', seconds: 3.0, speed: 0 },
  { label: 'walk', seconds: 1.5, speed: 1.2 },
  { label: 'run', seconds: 1.5, speed: 3.6 },
  { label: 'stop', seconds: 0.6, speed: 0 },
  { label: 'windup', seconds: 0.6, speed: 0, action: 'attack', len: 0.7 },
  { label: 'strike', seconds: 0.5, speed: 0, action: 'attack', len: 0.4 },
  { label: 'cast', seconds: 1.0, speed: 0, action: 'cast', len: 1.0 },
  { label: 'hit walking', seconds: 0.6, speed: 1.2, action: 'hit', len: 0.28 },
  { label: 'death', seconds: 1.2, speed: 0, death: true },
];

interface Row {
  archetype: string;
  monster: string;
  nan: boolean;
  /** Biggest bone jump, hip heights per frame squared, and where. */
  pop: number;
  popAt: string;
  /** Hips height after death, hip heights. */
  deadHips: number;
  /** Angle the first leg bone sweeps through while running, radians. */
  legSwing: number;
}

function run(id: string): Row {
  const def = MONSTERS.find((m) => m.id === id)!;
  const rng = new Random(0x3a11);
  const model = buildMonsterModel(def.visual, rng, def.scale ?? 1, { family: def.family });
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  holder.add(model.root);
  scene.add(holder);
  const arche = monsterArchetype(def.visual.body);
  const anim = new RigAnimator(model.root, model.bones, arche, rng);
  const hips = model.bones.hips;
  const hipY = hips.position.y || 1;
  const names = Object.keys(model.bones);
  const prev = new Map<string, THREE.Vector3>();
  const prevStep = new Map<string, THREE.Vector3>();
  const inv = new THREE.Matrix4();
  let pop = 0;
  let popAt = '';
  let nan = false;
  let time = 0;
  let legMin = Infinity;
  let legMax = -Infinity;
  const legBone = model.bones.hipL ?? model.bones.legHip0L ?? model.bones.shoulderL ?? null;
  let deadHips = 0;

  for (const st of SCRIPT) {
    const frames = Math.round(st.seconds / DT);
    let actionT = 0;
    let deathT = 0;
    let spawnT = st.spawn ? 1 : 0;
    for (let f = 0; f < frames; f++) {
      time += DT;
      holder.position.z += st.speed * DT;
      if (st.len) actionT = Math.min(1, actionT + DT / st.len);
      if (st.death) deathT += DT * 1.25;
      if (spawnT > 0) spawnT = Math.max(0, spawnT - DT * 1.6);
      const action: RigAction = spawnT > 0 ? 'spawn' : st.action && actionT < 1 ? st.action : 'idle';
      anim.update(DT, {
        locomotion: Math.min(1, st.speed / 3.2),
        action,
        actionT: spawnT > 0 ? 1 - spawnT : actionT,
        time,
        deathT: st.death ? Math.min(1, deathT) : 0,
      });
      scene.updateMatrixWorld(true);
      inv.copy(model.root.matrixWorld).invert();
      for (const n of names) {
        const p = model.bones[n].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
        if (!Number.isFinite(p.x + p.y + p.z)) nan = true;
        const pv = prev.get(n);
        if (pv) {
          const step = p.clone().sub(pv);
          const before = prevStep.get(n);
          // The ends of limbs are meant to whip in a strike or a spawn.
          const whip = (st.label === 'strike' || st.label === 'spawn') && /elbow|Knee|hand|foot|Foot|tip|Tip|mote|jaw/.test(n);
          if (before && !whip) {
            const jump = step.distanceTo(before) / hipY;
            if (jump > pop) {
              pop = jump;
              popAt = `${st.label}:${n}`;
            }
          }
          prevStep.set(n, step);
        }
        prev.set(n, p);
      }
      if (st.label === 'run' && legBone && f > 20) {
        const a = legBone.rotation.x + legBone.rotation.y;
        legMin = Math.min(legMin, a);
        legMax = Math.max(legMax, a);
      }
      if (st.death) deadHips = hips.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y / hipY;
    }
  }
  return {
    archetype: arche,
    monster: id,
    nan,
    pop: +pop.toFixed(3),
    popAt,
    deadHips: +deadHips.toFixed(2),
    legSwing: +(legMax - legMin).toFixed(2),
  };
}

// One monster per archetype, the first the bestiary lists.
const picked = new Map<string, string>();
for (const m of MONSTERS) {
  const a = monsterArchetype(m.visual.body);
  if (!picked.has(a)) picked.set(a, m.id);
}
console.log(JSON.stringify([...picked.values()].map(run)));
