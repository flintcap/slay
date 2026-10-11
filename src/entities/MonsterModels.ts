/**
 * SLAY — monster bodies.
 *
 * Every monster, mini-boss and boss is a creature from `src/art/creatures/`:
 * a look (rig, sculpted body, materials, motion style) per monster id, baked
 * once into skinned meshes and instanced per spawn. This module is the door
 * the game uses: it picks the look for a monster's visual, builds a spawn of
 * it at the right size and rank, and frees it again.
 *
 * Seeded runs depend on how many draws a build makes from the caller's
 * stream, so `buildMonsterModel` makes exactly the draws the first model
 * builder made (see `virtualVariants`).
 */
import * as THREE from 'three';
import type { MonsterVisual, Rng } from '../types';
import { lookFor } from '../art/creatures/Looks';
import { disposeCreatures, instanceCreature, releaseCreature } from '../art/creatures/Creature';

// ---------------------------------------------------------------------------
// Archetypes
// ---------------------------------------------------------------------------

export type Archetype =
  | 'humanoid'
  | 'quadruped'
  | 'serpent'
  | 'arachnid'
  | 'insectoid'
  | 'floating'
  | 'ooze'
  | 'winged'
  | 'colossal'
  | 'swarm';

const ARCHETYPE_ALIASES: Record<string, Archetype> = {
  humanoid: 'humanoid',
  skeleton: 'humanoid',
  zombie: 'humanoid',
  armored: 'humanoid',
  brute: 'humanoid',
  golem: 'colossal',
  colossus: 'colossal',
  colossal: 'colossal',
  giant: 'colossal',
  quadruped: 'quadruped',
  beast: 'quadruped',
  hound: 'quadruped',
  serpent: 'serpent',
  worm: 'serpent',
  snake: 'serpent',
  arachnid: 'arachnid',
  spider: 'arachnid',
  insectoid: 'insectoid',
  insect: 'insectoid',
  beetle: 'insectoid',
  floating: 'floating',
  orb: 'floating',
  eye: 'floating',
  wisp: 'floating',
  ooze: 'ooze',
  slime: 'ooze',
  amorphous: 'ooze',
  winged: 'winged',
  bat: 'winged',
  wraith: 'winged',
  swarm: 'swarm',
  cluster: 'swarm',
};

/** The broad body class a visual's `body` names (callers use it for motion hints). */
export function monsterArchetype(body: string): Archetype {
  return ARCHETYPE_ALIASES[body] ?? 'humanoid';
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

export interface MonsterModel {
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  skeleton: THREE.Skeleton | null;
}

/** What a monster is, beyond its visual: its family, and how important it is. */
export interface MonsterLookOpts {
  family?: string;
  /** 'normal' | 'champion' | 'elite' | 'rare' | 'boss'. */
  rank?: string;
}

/** The first builder kept up to this many variants per key; its draws still count. */
const VARIANTS_PER_KEY = 3;

function cacheKey(v: MonsterVisual, opts: MonsterLookOpts): string {
  return [
    v.body,
    v.palette,
    v.glow ?? -1,
    (v.ornate ?? 0.3).toFixed(2),
    v.limbs ?? -1,
    v.tail ? 1 : 0,
    v.wings ? 1 : 0,
    v.eyes ?? -1,
    v.weapon ?? '-',
    opts.family ?? '-',
    opts.rank ?? 'normal',
  ].join('/');
}

/**
 * How many variants each key would have built under the first builder. A
 * creature has one prototype per look, but a build makes the same draws the
 * old variant pool made (one pick, one fork per new variant, one pick, two
 * jitters), so packs, affixes and AI rolls after a spawn land where they
 * were tuned.
 */
const virtualVariants = new Map<string, number>();

/**
 * Builds one spawn of a monster. The body is the monster's own look (shared
 * geometry and materials, its own skeleton), sized by `scale` and dressed for
 * its rank (a rim light in its nameplate colour and a hotter glow).
 */
export function buildMonsterModel(visual: MonsterVisual, rng: Rng, scale: number, opts: MonsterLookOpts = {}): MonsterModel {
  const key = cacheKey(visual, opts);
  let have = virtualVariants.get(key) ?? 0;
  const wanted = Math.min(VARIANTS_PER_KEY, 1 + Math.floor(rng.next() * VARIANTS_PER_KEY));
  while (have < wanted) {
    rng.fork(`proto:${key}:${have}`);
    have++;
  }
  virtualVariants.set(key, have);
  rng.next();
  const look = lookFor(visual, opts.family, opts.rank);
  const m = instanceCreature(look, scale, { rank: opts.rank });
  // A touch of per-instance asymmetry so a pack does not look stamped.
  m.root.scale.x *= rng.range(0.96, 1.04);
  m.root.scale.z *= rng.range(0.96, 1.04);
  m.root.updateMatrixWorld(true);
  return { root: m.root, bones: m.bones, skeleton: m.skeleton };
}

/** Frees what one spawn owns: its skeleton and any private materials. Geometry is shared. */
export function releaseMonsterModel(root: THREE.Object3D): void {
  releaseCreature(root);
}

/** Releases every prototype, bake, material and corpse. Call between floors. */
export function disposeMonsterModels(): void {
  disposeCreatures();
  virtualVariants.clear();
}

// ---------------------------------------------------------------------------
// Rig animation
// ---------------------------------------------------------------------------

// Monster motion lives with the creatures, in `src/art/creatures/Animator.ts`.
export { RigAnimator } from '../art/creatures/Animator';
export type { RigAction, RigDriveOpts } from '../art/creatures/Animator';
