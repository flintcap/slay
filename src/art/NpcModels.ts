/**
 * SLAY — the people of Stairhead, each built for who they are.
 *
 * Every resident is their own person on the hero rig (`src/art/hero/*`), so
 * the hero animator drives them like anyone else, dressed for the work they
 * do and holding the tools of it, so a player can tell the smith from the
 * gravekeeper before either says a word:
 *
 *   Hesk     small and exact, slate coat, ledger under her arm
 *   Kale     enormous, leather apron, a hammer
 *   Vell     grey habit and white hood, a satchel of bottles
 *   Corvane  tall, thin, black coat, a ring of keys and a lantern
 *   Marrow   old, hooded, weathered, a spade over his shoulder
 *   Renn     the captain: mail, a spear
 *   Listener pale robes, long white hair, a blindfold, a staff
 *   Gilder   faded finery, ruddy, a tankard always in hand
 *   Wenna    long leather coat, wide hat, a surveyor's rod and a map
 *
 * Clothes are grown on the body like a hero's armour (`Armour.ts`), so they
 * fit; held tools hang in the hand sockets. The npcs stream remakes all of
 * this; it is the bridge that keeps the camp peopled on the new rig.
 */

import * as THREE from 'three';
import type { EquipSlot, ItemRarity, ItemVisual, Rng } from '../types';
import { buildItemModel } from './ItemModels';
import { compactModel } from './ModelBudget';
import { surface } from './Materials';
import { beveledBox, limb, ring, taperedBox, lathe } from './Meshes';
import { Random } from '../core/RNG';
import { buildHero, setHeroHidden, type HeroModel } from './hero/Hero';
import type { HeroLook } from './hero/Looks';
import { wearArmour } from './hero/Armour';
import { holdItem, weaponGrip } from './hero/Hold';
import { garment, trousersSpec } from './hero/Garment';
import { fabricMaterial } from './hero/HeroMaterials';
import { mergeSkinned } from './hero/Skinning';

/** Every resident, in the order the camp lists them. */
export const NPC_LOOK_IDS = ['hesk', 'kale', 'vell', 'corvane', 'marrow', 'renn', 'listener', 'gilder', 'wenna'] as const;
export type NpcLookId = (typeof NPC_LOOK_IDS)[number];

interface Wear {
  slot: EquipSlot;
  visual: ItemVisual;
  rarity?: ItemRarity;
  /** A real base id, so the base tier (and its shape ladder) applies. */
  baseId?: string;
}

interface Tool {
  /** A weapon-shaped tool from the item models, held with a real grip. */
  item?: { visual: ItemVisual; category: string; twoHanded?: boolean; slot: 'mainHand' | 'offHand' };
  /** A prop built here, carried in a hand. */
  prop?: 'ledger' | 'tankard' | 'lantern' | 'keys' | 'map' | 'satchel' | 'chisel';
  hand?: 'L' | 'R';
}

interface NpcSpec {
  look: HeroLook;
  wear: Wear[];
  tools: Tool[];
  /** Trouser colour, for anyone not in a robe. */
  legs?: number;
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

const SPECS: Record<NpcLookId, NpcSpec> = {
  hesk: {
    look: person({
      shape: { sex: 'female', height: 1.62, build: 0.2, shoulders: 0.95 },
      face: { rugged: 0.1 },
      skin: 0xe6c4b0,
      hair: { cut: 'knot', color: 0x8a8480 },
      accent: 0xd8b45a,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'chest.coat', palette: 'cloth.undyed|0x4c5c6c' } },
      { slot: 'belt', visual: { shape: 'belt.plate', palette: 'leather.worn' }, rarity: 'magic' },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.fine' } },
    ],
    legs: 0x5a5248,
    tools: [{ prop: 'ledger', hand: 'L' }, { prop: 'keys', hand: 'R' }],
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
      { slot: 'chest', visual: { shape: 'chest.apron', palette: 'leather.worn' } },
      { slot: 'gloves', visual: { shape: 'gloves.light', palette: 'leather.studded' } },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.studded' }, baseId: 'boots.heavy' },
    ],
    legs: 0x5a4a3a,
    tools: [{ item: { visual: { shape: 'hammer', palette: 'metal.dark' }, category: 'mace', slot: 'mainHand' } }],
  },
  vell: {
    look: person({
      shape: { sex: 'female', height: 1.7, build: 0.3 },
      face: { rugged: 0.15 },
      skin: 0xe0b8a0,
      hair: { cut: 'knot', color: 0x2a2018 },
      accent: 0x9ad8a0,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'chest.robe', palette: 'cloth.undyed|0x4a4e58' }, baseId: 'chest.ghost' },
      { slot: 'helm', visual: { shape: 'helm.hood', palette: 'cloth.linen|0xe8e2d8' } },
      { slot: 'belt', visual: { shape: 'belt.sash', palette: 'cloth.linen|0xe8e2d8' } },
      { slot: 'boots', visual: { shape: 'boots.silk', palette: 'leather.fine' } },
    ],
    tools: [{ prop: 'satchel', hand: 'L' }],
  },
  corvane: {
    look: person({
      shape: { sex: 'male', height: 1.88, build: 0.15, shoulders: 0.95 },
      face: { rugged: 0.4 },
      skin: 0xe0c4b4,
      hair: { cut: 'crop', color: 0x1e1814 },
      accent: 0xc8a050,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'chest.coat', palette: 'cloth.silk|0x2c2632' } },
      { slot: 'belt', visual: { shape: 'belt.chain', palette: 'metal.dark' }, baseId: 'belt.girdle' },
      { slot: 'gloves', visual: { shape: 'gloves.silk', palette: 'leather.fine' } },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.fine' } },
    ],
    legs: 0x2a2630,
    tools: [{ prop: 'lantern', hand: 'L' }, { prop: 'keys', hand: 'R' }],
  },
  marrow: {
    look: person({
      shape: { sex: 'male', height: 1.72, build: 0.4 },
      face: { rugged: 0.85 },
      skin: 0xb08a70,
      hair: { cut: 'crop', color: 0xd8d8d0, beard: 1 },
      accent: 0x9ab0c0,
      stoop: 0.45,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'chest.leather', palette: 'leather.worn' } },
      { slot: 'helm', visual: { shape: 'helm.hood', palette: 'cloth.tattered|0x5a5246' } },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.worn' } },
    ],
    legs: 0x6a6050,
    tools: [
      { item: { visual: { shape: 'spear', palette: 'wood.oak' }, category: 'spear', twoHanded: true, slot: 'mainHand' } },
      { prop: 'chisel', hand: 'L' },
    ],
  },
  renn: {
    look: person({
      shape: { sex: 'female', height: 1.8, build: 0.6 },
      face: { rugged: 0.4 },
      skin: 0xc09070,
      hair: { cut: 'ponytail', color: 0x5a3a24 },
      accent: 0xc84a3a,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'chest.mail', palette: 'metal.iron', glow: 0xa83a30 }, rarity: 'magic', baseId: 'chest.chainmail' },
      { slot: 'gloves', visual: { shape: 'gloves.plate', palette: 'metal.iron' } },
      { slot: 'boots', visual: { shape: 'boots.plate', palette: 'metal.iron' } },
      { slot: 'belt', visual: { shape: 'belt.plate', palette: 'leather.worn' }, rarity: 'magic' },
    ],
    legs: 0x6a5a4a,
    tools: [{ item: { visual: { shape: 'spear', palette: 'metal.steel' }, category: 'spear', twoHanded: true, slot: 'mainHand' } }],
  },
  listener: {
    look: person({
      shape: { sex: 'female', height: 1.68, build: 0.1, shoulders: 0.94 },
      face: { rugged: 0 },
      skin: 0xeedcd8,
      hair: { cut: 'long', color: 0xe8e4e0 },
      eyes: { iris: 0x9a9aa8 },
      accent: 0xb090e0,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'chest.robe', palette: 'cloth.linen|0xd8d2e2' }, baseId: 'chest.dusk' },
      { slot: 'helm', visual: { shape: 'helm.blindfold', palette: 'cloth.silk|0x5a3a7a' } },
      { slot: 'boots', visual: { shape: 'boots.silk', palette: 'cloth.silk' } },
    ],
    tools: [{ item: { visual: { shape: 'staff', palette: 'wood.oak' }, category: 'staff', twoHanded: true, slot: 'mainHand' } }],
  },
  gilder: {
    look: person({
      shape: { sex: 'male', height: 1.82, build: 0.55 },
      face: { rugged: 0.5 },
      skin: 0xd89a84,
      hair: { cut: 'crop', color: 0xc08848, beard: 1 },
      accent: 0xf5d76e,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'chest.leather', palette: 'leather.fine', ornate: 0.3 }, rarity: 'rare', baseId: 'chest.studded' },
      { slot: 'belt', visual: { shape: 'belt.sash', palette: 'cloth.banner' }, rarity: 'magic' },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.fine' }, baseId: 'boots.sharkskin' },
    ],
    legs: 0x7a3a4a,
    tools: [{ prop: 'tankard', hand: 'R' }],
  },
  wenna: {
    look: person({
      shape: { sex: 'female', height: 1.7, build: 0.4 },
      face: { rugged: 0.3 },
      skin: 0x6a4430,
      hair: { cut: 'braids', color: 0x1a1410 },
      accent: 0x7fc4c0,
    }),
    wear: [
      { slot: 'chest', visual: { shape: 'chest.coat', palette: 'leather.worn' } },
      { slot: 'helm', visual: { shape: 'helm.hat', palette: 'leather.worn' } },
      { slot: 'belt', visual: { shape: 'belt.plate', palette: 'leather.studded' } },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.studded' }, baseId: 'boots.heavy' },
    ],
    legs: 0x6a6a5a,
    tools: [
      { item: { visual: { shape: 'staff', palette: 'wood.oak' }, category: 'staff', twoHanded: true, slot: 'mainHand' } },
      { prop: 'map', hand: 'L' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

function mat(key: string, tint?: number): THREE.Material {
  return surface(key, { repeat: 3, seed: 0, tint });
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const out = new THREE.Mesh(geo, m);
  out.castShadow = true;
  return out;
}

/**
 * A small prop, built around its own origin at the point the hand grips it.
 * Hands hang at the sides with the palm in, so +Y is up the forearm and the
 * prop dangles in -Y.
 */
function buildProp(kind: NonNullable<Tool['prop']>): THREE.Object3D {
  const g = new THREE.Group();
  switch (kind) {
    case 'ledger': {
      // A thick bound book, held against the hip.
      g.add(mesh(beveledBox(0.05, 0.24, 0.18, 0.008), mat('leather.fine', 0x7a3a2a)));
      const pages = mesh(beveledBox(0.042, 0.226, 0.17, 0.002), mat('cloth.linen', 0xf0e8d0));
      pages.position.x = 0.002;
      g.add(pages);
      g.position.set(0, -0.09, 0.02);
      break;
    }
    case 'tankard': {
      const body = mesh(lathe([[0.001, 0], [0.045, 0], [0.05, 0.01], [0.048, 0.13], [0.052, 0.14], [0.001, 0.14]], 14), mat('metal.copper'));
      g.add(body);
      const handle = mesh(ring(0.035, 0.008, 10, 4), mat('metal.copper'));
      handle.rotation.y = Math.PI * 0.5;
      handle.position.set(0, 0.07, -0.05);
      g.add(handle);
      g.position.set(0, -0.11, 0.06);
      g.rotation.x = -0.25;
      break;
    }
    case 'lantern': {
      const frame = mesh(lathe([[0.001, 0], [0.06, 0], [0.06, 0.02], [0.05, 0.16], [0.03, 0.2], [0.001, 0.22]], 6), mat('metal.dark'));
      g.add(frame);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
      flame.position.y = 0.09;
      g.add(flame);
      const bail = mesh(ring(0.05, 0.005, 10, 4), mat('metal.dark'));
      bail.position.y = 0.24;
      g.add(bail);
      g.position.set(0, -0.36, 0.02);
      break;
    }
    case 'keys': {
      const hoop = mesh(ring(0.05, 0.006, 14, 4), mat('metal.bronze'));
      hoop.rotation.y = Math.PI * 0.5;
      g.add(hoop);
      for (let i = 0; i < 5; i++) {
        const k = mesh(taperedBox(0.012, 0.004, 0.008, 0.004, 0.09, 0.002), mat('metal.bronze'));
        k.position.set(0, -0.06, Math.sin(i * 1.2) * 0.03);
        k.rotation.x = (i - 2) * 0.25;
        g.add(k);
      }
      g.position.set(0, -0.08, 0);
      break;
    }
    case 'map': {
      const roll = mesh(limb(0.36, 0.024, 0.024, 10), mat('cloth.linen', 0xe8dcc0));
      roll.rotation.x = Math.PI * 0.5;
      roll.position.set(0, -0.03, -0.18);
      g.add(roll);
      g.position.set(0, -0.04, 0);
      break;
    }
    case 'satchel': {
      g.add(mesh(beveledBox(0.08, 0.2, 0.24, 0.02), mat('leather.worn', 0x8a6a4a)));
      const flap = mesh(beveledBox(0.084, 0.1, 0.25, 0.01), mat('leather.worn', 0x6a4a32));
      flap.position.y = 0.05;
      g.add(flap);
      for (let i = 0; i < 2; i++) {
        const b = mesh(lathe([[0.001, 0], [0.02, 0], [0.022, 0.05], [0.01, 0.07], [0.008, 0.09], [0.001, 0.09]], 8), mat('crystal.arcane', i ? 0x80d0a0 : 0xd080a0));
        b.position.set(0.02, 0.1, (i - 0.5) * 0.08);
        g.add(b);
      }
      g.position.set(0.05, -0.06, 0);
      break;
    }
    case 'chisel': {
      const c = mesh(taperedBox(0.016, 0.01, 0.006, 0.004, 0.16, 0.002), mat('metal.iron'));
      c.position.y = -0.1;
      g.add(c);
      g.position.set(0, -0.04, 0.02);
      break;
    }
  }
  return g;
}

/** Parts smaller than this (bounding box diagonal, metres) cast no shadow. */
const NPC_SHADOW_MIN = 0.36;

/**
 * Folds a resident's skinned parts into one mesh per material. A resident
 * never changes clothes, so the parts that share a material (the same linen,
 * the same leather) can be one draw instead of several, in the colour pass
 * and in every shadow pass. Hidden parts are dropped. Cached part meshes are
 * shared with other heroes, so they are left as they are, never disposed.
 */
function mergeResidentSkins(hero: HeroModel): void {
  const root = hero.root;
  const skeleton = hero.rig.skeleton;
  const identity = new THREE.Matrix4();
  // Hidden parts (hair under a hood) are never drawn: drop them first.
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
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A resident: the root to place, and the rig bones for the hero animator. */
export interface NpcModel {
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  hero: HeroModel;
}

/**
 * Builds one camp resident: body, clothes and tools. Unknown ids fall back to
 * the quartermaster rather than failing, so a renamed NPC still stands there.
 */
export function buildNpcModel(id: string, rng: Rng = new Random(1)): NpcModel {
  const spec = SPECS[id as NpcLookId] ?? SPECS.hesk;
  const hero = buildHero(spec.look, `npc-${id}`);
  const rig = hero.rig;
  const hides = new Set<string>();
  for (const w of spec.wear) {
    try {
      const item = { baseId: w.baseId ?? `npc:${id}:${w.slot}`, rarity: w.rarity ?? 'normal' };
      const worn = wearArmour(hero, w.slot, item, w.visual);
      worn?.hides.forEach((k) => hides.add(k));
    } catch {
      // A missing garment is better than a missing resident.
    }
  }
  setHeroHidden(hero, hides);
  if (spec.legs !== undefined) {
    try {
      const legs = new THREE.SkinnedMesh(garment(hero.body, 'npc-trousers', trousersSpec(hero.body)), fabricMaterial('wool', spec.legs));
      legs.name = `npc-${id}:trousers`;
      legs.frustumCulled = false;
      rig.root.add(legs);
      legs.bind(rig.skeleton, new THREE.Matrix4());
    } catch {
      /* bare legs beat no resident */
    }
  }
  for (const t of spec.tools) {
    try {
      if (t.item) {
        const model = compactModel(buildItemModel(t.item.visual, rng, 'normal'));
        holdItem(rig, t.item.slot, model, weaponGrip(t.item.category, !!t.item.twoHanded));
      } else if (t.prop) {
        // Props hang from the fist: their +Y runs up the forearm, which is
        // the socket's -X (wrist to knuckles is +X).
        const node = new THREE.Object3D();
        node.rotation.z = Math.PI / 2;
        node.add(compactModel(buildProp(t.prop)));
        rig.sockets[t.hand === 'L' ? 'offHand' : 'mainHand'].add(node);
      }
    } catch {
      /* a resident without a prop still works */
    }
  }
  hero.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  mergeResidentSkins(hero);
  // Small parts (eyes, buttons, a lantern flame, a bottle) cast shadows a few
  // texels across in the moon's map, and each one is another draw in every
  // shadow pass. Only parts big enough to throw a visible shadow cast one.
  const size = new THREE.Vector3();
  hero.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const box = m.geometry.boundingBox;
    const lit = !(m.material as THREE.Material & { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial;
    if (!box || box.getSize(size).length() < NPC_SHADOW_MIN || !lit) m.castShadow = false;
  });
  hero.root.userData.npcId = id;
  return { root: hero.root, bones: rig.bones as unknown as Record<string, THREE.Bone>, hero };
}

/** The grip a resident's tool asks for, so the animator can hold it properly. */
export function npcCarryGrip(id: string): 'none' | 'twoHand' | 'staff' | 'bow' {
  const spec = SPECS[id as NpcLookId];
  const tool = spec?.tools.find((t) => t.item?.twoHanded);
  if (!tool?.item) return 'none';
  const g = weaponGrip(tool.item.category, true);
  return g === 'staff' || g === 'twoHand' || g === 'bow' ? g : 'none';
}
