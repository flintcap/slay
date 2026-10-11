/**
 * SLAY — the people of Stairhead, each built for who they are.
 *
 * Every resident is their own person on the hero rig (`src/art/hero/*`), so
 * the hero animator drives them like anyone else. Gear makes the look: each
 * is dressed for the work they do and holds the tools of it, so a player can
 * tell the smith from the gravekeeper before either says a word.
 *
 *   Hesk     small and exact: slate coat to the knee, plum shawl, ledger and quill
 *   Kale     enormous: bare burned forearms, leather apron, hammer and tongs
 *   Vell     grey habit, white coif under a dark veil, mortar and pestle
 *   Corvane  tall and thin: long black coat, silk gloves, coins, keys and a lantern at the belt
 *   Marrow   old and bent: hooded, a quilted coat, a besom, a spade across his back
 *   Renn     the captain: mail and the watch's tabard, a casque, a spear
 *   Listener pale gown and cowl, long white hair, a blindfold, a staff on her back
 *   Gilder   faded finery: a quilted doublet, a feathered cap, a cape, a tankard
 *   Wenna    long oiled-leather coat, a wide hat, a kerchief, a surveyor's rod and a map
 *
 * Clothes are grown on the body like a hero's armour (`hero/Armour.ts`, and
 * the trade pieces in `Clothes.ts`), so they fit and move with it. Props are
 * baked into the body (`HandProps.ts`) and every part that shares a material
 * is merged, so a resident costs a handful of draws.
 *
 * Their loops (work, rest, talk) are in `Jobs.ts`; how they live in the town
 * (when they work, wander, turn to the player and talk) is `Residents.ts`.
 */
import * as THREE from 'three';
import { buildHero, setHeroHidden, type HeroModel } from '../hero/Hero';
import { QUALITY_RESIDENT } from '../hero/Body';
import type { HeroLook } from '../hero/Looks';
import { garment, trousersSpec } from '../hero/Garment';
import { fabricMaterial } from '../hero/HeroMaterials';
import { mergeSkinned } from '../hero/Skinning';
import type { CarryGrip } from '../hero/Animator';
import { wearPiece, type Wear } from './Clothes';
import { bakeProps, type HeldProp } from './HandProps';
import { registerJob, type JobKind, type Posture, type TalkStyle } from './Jobs';

/** Every resident, in the order the camp lists them. */
export const NPC_LOOK_IDS = ['hesk', 'kale', 'vell', 'corvane', 'marrow', 'renn', 'listener', 'gilder', 'wenna'] as const;
export type NpcLookId = (typeof NPC_LOOK_IDS)[number];

interface FolkSpec {
  look: HeroLook;
  wear: Wear[];
  /** Trouser colour, for anyone whose legs show. */
  legs?: number;
  held: HeldProp[];
  /** The stance a long tool asks for: a staff or spear held upright. */
  grip: CarryGrip;
  job: JobKind;
  posture: Posture;
  talk: TalkStyle;
}

/** A resident's look: the parts every one of them shares filled in. */
function person(o: Partial<HeroLook> & Pick<HeroLook, 'shape' | 'skin' | 'hair' | 'accent'>): HeroLook {
  return {
    face: { rugged: 0.3 },
    eyes: { iris: 0x4a3a2a },
    linen: 0x8a7e6a,
    leather: 0x4a3424,
    cloth: 0x5a5248,
    stoop: 0.05,
    ...o,
  };
}

const SPECS: Record<NpcLookId, FolkSpec> = {
  hesk: {
    look: person({
      shape: { sex: 'female', height: 1.58, build: 0.2, shoulders: 0.94 },
      face: { rugged: 0.15 },
      skin: 0xe6c4b0,
      hair: { cut: 'knot', color: 0x8a8480 },
      eyes: { iris: 0x5a6a7a },
      accent: 0xd8b45a,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'npc.coat', palette: 'cloth.undyed|0x52647c' } },
      { trade: 'shawl', palette: 'cloth.undyed|0x5a3048' },
      { slot: 'belt', visual: { shape: 'belt.belt', palette: 'leather.worn|0x3a2a20' }, baseId: 'belt.belt' },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.fine|0x3a2a22' }, baseId: 'boots.light' },
    ],
    legs: 0x3a3630,
    held: [{ kind: 'ledger', hand: 'L' }, { kind: 'quill', hand: 'R' }],
    grip: 'none',
    job: 'ledger',
    posture: { stoop: 0, chin: -0.04 },
    talk: { free: 'R', size: 0.55 },
  },
  kale: {
    look: person({
      shape: { sex: 'male', height: 1.98, build: 1, shoulders: 1.12 },
      face: { rugged: 1 },
      skin: 0xb07a58,
      hair: { cut: 'shaved', color: 0x2a2018, beard: 2 },
      accent: 0xff9a40,
    }),
    wear: [
      { trade: 'apron', palette: 'leather.worn|0x7a5a3e', second: 'leather.worn|0x3a2a1e' },
      { trade: 'scars', palette: 'leather.worn' },
      { slot: 'belt', visual: { shape: 'belt.belt', palette: 'leather.worn|0x3a2a1e' }, baseId: 'belt.belt' },
      { slot: 'boots', visual: { shape: 'boots.heavy', palette: 'leather.studded' }, baseId: 'boots.heavy' },
    ],
    legs: 0x4a3a2e,
    held: [{ kind: 'hammer', hand: 'R' }, { kind: 'tongs', hand: 'L' }],
    grip: 'none',
    job: 'forge',
    posture: { stoop: 0.1 },
    talk: { free: 'R', size: 0.8 },
  },
  vell: {
    look: person({
      shape: { sex: 'female', height: 1.7, build: 0.3 },
      face: { rugged: 0.15 },
      skin: 0xe0b8a0,
      hair: { cut: 'knot', color: 0x2a2018 },
      eyes: { iris: 0x6a7a5a },
      accent: 0x9ad8a0,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'npc.habit', palette: 'cloth.undyed|0x6e7078' } },
      { trade: 'wimple', palette: 'cloth.undyed|0x23232a', cloth: 'cloth.linen|0xf0ece4' },
      { slot: 'belt', visual: { shape: 'belt.sash', palette: 'cloth.linen|0xe8e2d8' }, baseId: 'belt.sash' },
      { slot: 'boots', visual: { shape: 'boots.silk', palette: 'leather.fine|0x2a2420' }, baseId: 'boots.silk' },
    ],
    held: [{ kind: 'mortar', hand: 'L' }, { kind: 'pestle', hand: 'R' }],
    grip: 'none',
    job: 'mortar',
    posture: { stoop: 0.08 },
    talk: { free: 'R', size: 0.45 },
  },
  corvane: {
    look: person({
      shape: { sex: 'male', height: 1.92, build: 0.1, shoulders: 0.94 },
      face: { rugged: 0.45 },
      skin: 0xe0c4b4,
      hair: { cut: 'crop', color: 0x1e1814 },
      eyes: { iris: 0x3a3a3a },
      accent: 0xc8a050,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'npc.blackcoat', palette: 'cloth.undyed|0x26222c' } },
      { slot: 'belt', visual: { shape: 'belt.chain', palette: 'metal.dark' }, baseId: 'belt.girdle' },
      { slot: 'gloves', visual: { shape: 'gloves.silk', palette: 'leather.fine|0x1a1a1e' }, baseId: 'gloves.silk' },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.fine|0x1a1a1e' }, baseId: 'boots.light' },
    ],
    legs: 0x24202a,
    held: [
      { kind: 'coins', hand: 'L' },
      { kind: 'keys', hand: 'beltR', at: [-0.03, -0.03, 0.02], turn: [0, 0, -Math.PI / 2] },
      { kind: 'lantern', hand: 'beltL', at: [0.03, -0.02, -0.02], turn: [0, 0, -Math.PI / 2] },
    ],
    grip: 'none',
    job: 'coins',
    posture: { stoop: 0.04, chin: -0.06 },
    talk: { free: 'R', size: 0.45 },
  },
  marrow: {
    look: person({
      shape: { sex: 'male', height: 1.74, build: 0.4 },
      face: { rugged: 0.9 },
      skin: 0xb08a70,
      hair: { cut: 'crop', color: 0xd8d8d0, beard: 1, brows: 0xd8d8d0 },
      accent: 0x9ab0c0,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'npc.gravecoat', palette: 'cloth.undyed|0x6a604c' } },
      { trade: 'hood', palette: 'cloth.tattered|0x5a5242' },
      { slot: 'boots', visual: { shape: 'boots.heavy', palette: 'leather.worn' }, baseId: 'boots.heavy' },
    ],
    legs: 0x4a4236,
    held: [
      { kind: 'broom', hand: 'R' },
      { kind: 'spade', hand: 'back', at: [0, 0.02, -0.06], turn: [0, 0, Math.PI - 0.45] },
    ],
    grip: 'staff',
    job: 'sweep',
    posture: { stoop: 0.5, chin: -0.1 },
    talk: { free: 'L', size: 0.5 },
  },
  renn: {
    look: person({
      shape: { sex: 'female', height: 1.8, build: 0.6 },
      face: { rugged: 0.45 },
      skin: 0xc09070,
      hair: { cut: 'ponytail', color: 0x5a3a24 },
      eyes: { iris: 0x4a5a3a },
      accent: 0xc84a3a,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'npc.watch', palette: 'metal.iron', glow: 0xa83a30 }, rarity: 'rare' },
      { slot: 'helm', visual: { shape: 'helm.casque', palette: 'metal.iron' }, baseId: 'helm.casque' },
      { slot: 'gloves', visual: { shape: 'gloves.leather', palette: 'leather.worn' }, baseId: 'gloves.leather' },
      { slot: 'belt', visual: { shape: 'belt.belt', palette: 'leather.worn|0x3a2a1e' }, baseId: 'belt.belt' },
      { slot: 'boots', visual: { shape: 'boots.heavy', palette: 'leather.worn' }, baseId: 'boots.heavy' },
    ],
    legs: 0x4a3e34,
    held: [{ kind: 'spear', hand: 'R' }],
    grip: 'staff',
    job: 'watch',
    posture: { stoop: 0, chin: -0.08 },
    talk: { free: 'L', size: 0.7 },
  },
  listener: {
    look: person({
      shape: { sex: 'female', height: 1.68, build: 0.1, shoulders: 0.94 },
      face: { rugged: 0 },
      skin: 0xeedcd8,
      hair: { cut: 'long', color: 0xe8e4e0, brows: 0xd8d4d0 },
      eyes: { iris: 0x9a9aa8 },
      accent: 0xb090e0,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'npc.oracle', palette: 'cloth.linen|0xcfc8d8' } },
      { trade: 'blindfold', palette: 'cloth.silk|0x3a2450' },
      { slot: 'boots', visual: { shape: 'boots.slippers', palette: 'cloth.silk|0xb8b0c4' }, baseId: 'boots.slippers' },
    ],
    held: [{ kind: 'staff', hand: 'back', at: [0, 0.05, -0.05], turn: [0, 0, -0.55] }],
    grip: 'none',
    job: 'listen',
    posture: { stoop: 0.05 },
    talk: { free: 'L', size: 0.5 },
  },
  gilder: {
    look: person({
      shape: { sex: 'male', height: 1.82, build: 0.6 },
      face: { rugged: 0.55 },
      skin: 0xd89a84,
      hair: { cut: 'crop', color: 0xc08848, beard: 1 },
      eyes: { iris: 0x5a7a9a },
      accent: 0xf5d76e,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'npc.doublet', palette: 'cloth.silk|0x7a2a3a' }, rarity: 'magic' },
      { trade: 'cap', palette: 'cloth.silk|0x3a2a4a', second: 'cloth.banner|0xc8a040' },
      { slot: 'belt', visual: { shape: 'belt.sash', palette: 'cloth.banner|0xc8a040' }, baseId: 'belt.sash' },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.fine|0x5a3a22' }, baseId: 'boots.sharkskin' },
      { cape: 'cloth.silk|0x3a2a4a', length: 3.4 },
    ],
    legs: 0x6a3a44,
    held: [{ kind: 'tankard', hand: 'R' }],
    grip: 'none',
    job: 'drink',
    posture: { stoop: 0.06, sway: 0.07 },
    talk: { free: 'L', size: 1 },
  },
  wenna: {
    look: person({
      shape: { sex: 'female', height: 1.72, build: 0.4 },
      face: { rugged: 0.3 },
      skin: 0x6a4430,
      hair: { cut: 'braids', color: 0x1a1410 },
      eyes: { iris: 0x3a2a1a },
      accent: 0x7fc4c0,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'npc.duster', palette: 'leather.worn|0x6a4a32' } },
      { trade: 'brimhat', palette: 'leather.worn|0x5a4030' },
      { trade: 'kerchief', palette: 'cloth.silk|0x2a8a88' },
      { slot: 'belt', visual: { shape: 'belt.belt', palette: 'leather.studded' }, baseId: 'belt.belt' },
      { slot: 'boots', visual: { shape: 'boots.heavy', palette: 'leather.studded' }, baseId: 'boots.heavy' },
    ],
    legs: 0x5a5a4a,
    held: [{ kind: 'rod', hand: 'R' }, { kind: 'map', hand: 'L' }],
    grip: 'staff',
    job: 'survey',
    posture: { stoop: 0.02 },
    talk: { free: 'L', size: 0.7 },
  },
};

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

/** Parts smaller than this (bounding box diagonal, metres) cast no shadow. */
const SHADOW_MIN = 0.36;

/**
 * Folds a resident's skinned parts into one mesh per material. A resident
 * never changes clothes, so the parts that share a material (the same linen,
 * the same leather, a prop's iron) are one draw instead of several, in the
 * colour pass and in every shadow pass. Hidden parts are dropped. Cached part
 * meshes are shared with other heroes, so they are left as they are.
 */
function mergeParts(hero: HeroModel): void {
  const root = hero.root;
  const skeleton = hero.rig.skeleton;
  const identity = new THREE.Matrix4();
  const hidden: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !o.visible) hidden.push(o);
  });
  for (const o of hidden) o.removeFromParent();
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || m.skeleton !== skeleton || Array.isArray(m.material)) return;
    if (!m.bindMatrix.equals(identity)) return;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
    const key = `${m.material.uuid}|${m.renderOrder}`;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const first = list[0]!;
    const geo = mergeSkinned(list.map((m) => m.geometry));
    const mesh = new THREE.SkinnedMesh(geo, first.material);
    mesh.name = first.name;
    mesh.renderOrder = first.renderOrder;
    mesh.castShadow = list.some((m) => m.castShadow);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    for (const m of list) m.removeFromParent();
    root.add(mesh);
    mesh.bind(skeleton, identity);
  }
  // Empty groups left behind by trade pieces.
  const empty: THREE.Object3D[] = [];
  for (const c of root.children) if (!(c as THREE.Mesh).isMesh && !(c as THREE.Bone).isBone && c.children.length === 0) empty.push(c);
  for (const c of empty) c.removeFromParent();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A resident's loop names, registered with the hero animator. */
export interface FolkLoops {
  work: string;
  work2?: string;
  rest: string;
  talk: string;
}

/** A resident: the root to place, the rig bones for the animator, and how to drive them. */
export interface FolkModel {
  id: NpcLookId;
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  hero: HeroModel;
  /** The carry grip to give the animator (`setGrip`). */
  grip: CarryGrip;
  loops: FolkLoops;
}

/** True if `id` names a resident. */
export function isFolk(id: string): id is NpcLookId {
  return (NPC_LOOK_IDS as readonly string[]).includes(id);
}

/**
 * Builds one resident: body, clothes, tools, and their loops registered.
 * Unknown ids fall back to the quartermaster rather than failing, so a
 * renamed NPC still stands there.
 */
export function buildFolk(id: string): FolkModel {
  const who: NpcLookId = isFolk(id) ? id : 'hesk';
  const spec = SPECS[who];
  const hero = buildHero(spec.look, `npc-${who}`, QUALITY_RESIDENT);
  const rig = hero.rig;
  const hides = new Set<string>();
  for (const w of spec.wear) for (const k of wearPiece(hero, w, who)) hides.add(k);
  // Trousers replace the plain linens; both drawn, they fight through each other.
  if (spec.legs !== undefined) hides.add('shorts');
  setHeroHidden(hero, hides);
  if (spec.legs !== undefined) {
    try {
      const legs = new THREE.SkinnedMesh(garment(hero.body, 'npc-trousers', trousersSpec(hero.body)), fabricMaterial('wool', spec.legs));
      legs.name = `npc-${who}:trousers`;
      legs.frustumCulled = false;
      legs.userData.sharedGeometry = true;
      rig.root.add(legs);
      legs.bind(rig.skeleton, new THREE.Matrix4());
    } catch {
      /* bare legs beat no resident */
    }
  }
  try {
    bakeProps(rig, spec.held, `npc-${who}`);
  } catch {
    /* a resident without a prop still works */
  }
  hero.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  mergeParts(hero);
  // Small parts (eyes, a quill, a lantern's light) cast shadows a few texels
  // across in the moon's map, and each is another draw in every shadow pass.
  const size = new THREE.Vector3();
  hero.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const box = m.geometry.boundingBox;
    const mat = m.material as THREE.Material & { isMeshBasicMaterial?: boolean; userData: { glow?: boolean } };
    if (!box || box.getSize(size).length() < SHADOW_MIN || mat.isMeshBasicMaterial) m.castShadow = false;
  });
  hero.root.userData.npcId = who;
  const loops = registerJob(who, spec.job, spec.posture, spec.talk);
  return { id: who, root: hero.root, bones: rig.bones as unknown as Record<string, THREE.Bone>, hero, grip: spec.grip, loops };
}

/** The job a resident does, for tools. */
export function folkJob(id: NpcLookId): JobKind {
  return SPECS[id].job;
}
