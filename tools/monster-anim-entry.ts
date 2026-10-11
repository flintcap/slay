/**
 * Entry point for `tools/check-monster-anim.mjs`.
 *
 * Real monsters, built by `buildMonsterModel` and driven by the real
 * `RigAnimator` exactly as `Enemy` drives it: spawn, stand, walk and run with
 * the model really moving, a telegraphed attack and its strike, a cast, a hit
 * while walking, and a death. Every frame each bone's position in the model's
 * own space is read back. Reports, per monster: any NaN, the biggest one-frame
 * jump of any bone (a second difference, in hip heights, so a goblin and a
 * colossus are judged alike), where the hips end after death, how far the
 * feet travel when running (they must step), and whether the body is still
 * lying there at the end of its death.
 *
 * Remade creatures are checked one per rig kind and style (every look that
 * moves differently); `--all` checks every remade monster. Bodies not yet
 * remade are checked one per old archetype. Bosses are checked the same way,
 * built at boss rank.
 *
 * No renderer and no browser.
 */
import * as THREE from 'three';
import { buildMonsterModel, monsterArchetype, RigAnimator, type RigAction } from '../src/entities/MonsterModels';
import { MONSTERS } from '../src/data/monsters';
import { BOSSES } from '../src/data/bosses';
import { Random } from '../src/core/RNG';
import { hasLook, lookFor } from '../src/art/creatures/Looks';
import type { CreatureInfo } from '../src/art/creatures/Animator';

const DT = 1 / 60;

/** Every body to check: the monsters, then the bosses (built at boss rank). */
const ENTRIES = [
  ...MONSTERS.map((m) => ({ id: m.id, visual: m.visual, family: m.family, scale: m.scale, boss: false })),
  ...BOSSES.map((b) => ({ id: b.id, visual: b.visual, family: b.family, scale: b.scale, boss: true })),
];
const ALL = ((globalThis as { process?: { argv: string[] } }).process?.argv ?? []).includes('--all');

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
  kind: string;
  monster: string;
  /** Whether the body is a remade creature. */
  remade: boolean;
  /** Whether it walks on legs (feet must step). */
  legged: boolean;
  /** Whether it may vanish or scatter at death (specters, swarms, oozes). */
  fades: boolean;
  nan: boolean;
  /** Biggest bone jump, hip heights per frame squared, and where. */
  pop: number;
  popAt: string;
  /** Hips height after death, hip heights. */
  deadHips: number;
  /** Remade legged bodies: how far a foot travels fore and aft while running, hip heights. Old bodies: leg bone sweep, radians. */
  legSwing: number;
}

/** Limb ends that are meant to whip in a strike, a spawn or a hit. */
const WHIP = /elbow|Knee|knee|fore|hand|foot|Foot|toe|Toe|tip|Tip|mote|jaw|shin|Shin|hock|Hock|snout|mand|sting|tail|wing|ten|orb|pod|robe/;

function run(id: string): Row {
  const def = ENTRIES.find((m) => m.id === id)!;
  const rng = new Random(0x3a11);
  const model = buildMonsterModel(def.visual, rng, def.scale ?? 1, { family: def.family, rank: def.boss ? 'boss' : undefined });
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  holder.add(model.root);
  scene.add(holder);
  const arche = monsterArchetype(def.visual.body);
  const anim = new RigAnimator(model.root, model.bones, arche, rng);
  const info = model.root.userData.creature as CreatureInfo | undefined;
  const remade = !!info;
  const hips = model.bones.hips ?? model.bones.body ?? model.bones.core ?? Object.values(model.bones)[1]!;
  const hipY = (remade ? info!.hipY : hips.position.y) || 1;
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
  const legs = info?.legs ?? [];
  const flying = info ? info.style.gait === 'glide' || info.style.gait === 'slither' || info.style.gait === 'roll' : false;
  const legged = remade ? legs.length > 0 && !flying : ['humanoid', 'quadruped', 'colossal', 'insectoid', 'arachnid'].includes(arche);
  const foot = remade && legs.length ? model.bones[legs[0]!.end]! : null;
  const legBone = !remade ? (model.bones.hipL ?? model.bones.legHip0L ?? model.bones.shoulderL ?? null) : null;
  const fades = remade ? ['fade', 'scatter', 'splat', 'melt', 'shatter'].includes(String(info!.style.death)) || info!.kind === 'swarm' : arche === 'swarm';
  let deadHips = 0;
  const hipsName = names.includes('hips') ? 'hips' : hips.name;

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
      const action: RigAction = spawnT > 0 ? 'spawn' : st.action && actionT < 1 ? st.action : st.death ? 'death' : 'idle';
      anim.update(DT, {
        locomotion: Math.min(1, st.speed / 3.2),
        action,
        actionT: spawnT > 0 ? 1 - spawnT : st.death ? Math.min(1, deathT) : actionT,
        time,
        deathT: st.death ? Math.min(1, deathT) : 0,
      });
      scene.updateMatrixWorld(true);
      inv.copy(model.root.matrixWorld).invert();
      for (const n of names) {
        const p = model.bones[n]!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
        if (!Number.isFinite(p.x + p.y + p.z)) nan = true;
        const pv = prev.get(n);
        if (pv) {
          const step = p.clone().sub(pv);
          const before = prevStep.get(n);
          const whip = (st.label === 'strike' || st.label === 'spawn' || st.label === 'hit walking') && (WHIP.test(n) || (info?.kind === 'serpent' && n === 'head'));
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
      if (st.label === 'run' && f > 20) {
        if (foot) {
          const z = foot.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).z / hipY;
          legMin = Math.min(legMin, z);
          legMax = Math.max(legMax, z);
        } else if (legBone) {
          const a = legBone.rotation.x + legBone.rotation.y;
          legMin = Math.min(legMin, a);
          legMax = Math.max(legMax, a);
        }
      }
      if (st.death) deadHips = model.bones[hipsName]!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y / hipY;
    }
  }
  return {
    kind: info ? info.kind : arche,
    monster: id,
    remade,
    legged,
    fades,
    nan,
    pop: +pop.toFixed(3),
    popAt,
    deadHips: +deadHips.toFixed(2),
    legSwing: Number.isFinite(legMax - legMin) ? +(legMax - legMin).toFixed(2) : 0,
  };
}

const picked = new Map<string, string>();
for (const m of ENTRIES) {
  // A monster without a look of its own wears the generic one: always check it.
  const look = lookFor(m.visual, m.family);
  const st = look.style;
  const sig = ALL || !hasLook(m.id) ? m.id : `${m.boss ? 'boss|' : ''}${look.rig().kind}|${st.gait}|${st.spawn}|${st.death}|${st.armed}|${(st.attacks ?? []).join(',')}`;
  if (!picked.has(sig)) picked.set(sig, m.id);
}
console.log(JSON.stringify([...picked.values()].map(run)));
