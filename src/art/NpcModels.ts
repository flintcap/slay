/**
 * SLAY — the people of Stairhead, each built for who they are.
 *
 * The camp used to be furnished with spare player classes: the smith was a
 * warden, the quartermaster a pyromancer, the oracle a stormcaller, and a
 * shadowblade minded the vault. Now every resident is their own person on the
 * shared rig (so the animator drives them like anyone else), dressed for the
 * work they do and holding the tools of it, so a player can tell the smith from
 * the gravekeeper before either says a word:
 *
 *   Hesk     small and exact, slate coat, ledger under her arm
 *   Kale     enormous, leather apron, forearms burned white, hammer
 *   Vell     grey habit and white hood, a satchel of bottles
 *   Corvane  tall, thin, black coat, a ring of keys and a lantern
 *   Marrow   old, hooded, weathered, a spade over his shoulder
 *   Renn     the captain: mail, a crimson surcoat, a spear
 *   Listener pale robes, long white hair, a blindfold, a staff
 *   Gilder   faded finery, ruddy, a tankard always in hand
 *   Wenna    long leather coat, wide hat, a surveyor's rod and a map
 *
 * Worn clothes go through `WornGear` exactly like a player's armour, so they
 * fit the body; held tools are rigid meshes on the hand bones.
 */

import * as THREE from 'three';
import type { EquipSlot, ItemRarity, ItemVisual, Rng } from '../types';
import { buildPerson, wearItem, attachToSocket, weaponGrip, type PersonLook, type PlayerModel } from './CharacterModels';
import { buildItemModel } from './ItemModels';
import { compactModel } from './ModelBudget';
import { buildFitted } from './WornGear';
import { armNodes, legNodes, ringStack, sweep, torsoRings, type BodyFit } from './BodyKit';
import { surface } from './Materials';
import { beveledBox, limb, ring, taperedBox, lathe } from './Meshes';
import { Random } from '../core/RNG';

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
  /** A prop built here, carried in a hand or worn at the hip. */
  prop?: 'ledger' | 'tankard' | 'lantern' | 'keys' | 'map' | 'satchel' | 'chisel';
  hand?: 'L' | 'R';
}

interface NpcSpec {
  look: PersonLook;
  wear: Wear[];
  tools: Tool[];
  /** Pale burn scars up the forearms. */
  burns?: boolean;
  /** Trousers, as `pal:<palette>[:<tint>]`, for anyone not in a robe. */
  legs?: string;
}

const SPECS: Record<NpcLookId, NpcSpec> = {
  hesk: {
    look: {
      profile: { height: 1.62, shoulder: 0.1, hip: 0.053, thick: 0.82, depth: 0.88, head: 1.04, lean: 0.04 },
      skin: { key: 'skin.fair', tint: 0xf4e4dc },
      hair: { key: 'hair.dark', tint: 0xb0aaa4 },
      linen: { key: 'cloth.undyed' },
      leather: { key: 'leather.worn' },
      cloth: { key: 'cloth.undyed' },
      hairStyle: 'bun',
      hairline: 0.42,
      sleeves: true,
      accent: 0xd8b45a,
    },
    wear: [
      { slot: 'chest', visual: { shape: 'chest.coat', palette: 'cloth.undyed|0x4c5c6c' } },
      { slot: 'belt', visual: { shape: 'belt.plate', palette: 'leather.worn' }, rarity: 'magic' },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.fine' } },
    ],
    legs: 'pal:cloth.undyed:5a5248:8',
    tools: [{ prop: 'ledger', hand: 'L' }, { prop: 'keys', hand: 'R' }],
  },
  kale: {
    look: {
      profile: { height: 1.98, shoulder: 0.142, hip: 0.064, thick: 1.45, depth: 1.3, head: 0.97, lean: 0.02 },
      skin: { key: 'skin.tan', tint: 0xf0d8c8 },
      hair: { key: 'hair.dark' },
      linen: { key: 'cloth.undyed' },
      leather: { key: 'leather.worn' },
      cloth: { key: 'cloth.undyed' },
      hairStyle: 'shaved',
      hairline: 0.56,
      beard: 2,
      accent: 0xff9a40,
    },
    wear: [
      { slot: 'chest', visual: { shape: 'chest.apron', palette: 'leather.worn' } },
      { slot: 'gloves', visual: { shape: 'gloves.light', palette: 'leather.studded' } },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.studded' }, baseId: 'boots.heavy' },
    ],
    legs: 'pal:leather.worn:5a4a3a:6',
    tools: [{ item: { visual: { shape: 'hammer', palette: 'metal.dark' }, category: 'mace', slot: 'mainHand' } }],
    burns: true,
  },
  vell: {
    look: {
      profile: { height: 1.7, shoulder: 0.1, hip: 0.052, thick: 0.86, depth: 0.9, head: 1.0, lean: 0.03 },
      skin: { key: 'skin.fair' },
      hair: { key: 'hair.dark' },
      linen: { key: 'cloth.undyed' },
      leather: { key: 'leather.worn' },
      cloth: { key: 'cloth.undyed' },
      hairStyle: 'bun',
      accent: 0x9ad8a0,
    },
    wear: [
      { slot: 'chest', visual: { shape: 'chest.robe', palette: 'cloth.undyed|0x4a4e58' }, baseId: 'chest.ghost' },
      { slot: 'helm', visual: { shape: 'helm.hood', palette: 'cloth.linen|0xe8e2d8' } },
      { slot: 'belt', visual: { shape: 'belt.sash', palette: 'cloth.linen|0xe8e2d8' } },
      { slot: 'boots', visual: { shape: 'boots.silk', palette: 'leather.fine' } },
    ],
    tools: [{ prop: 'satchel', hand: 'L' }],
  },
  corvane: {
    look: {
      profile: { height: 1.88, shoulder: 0.108, hip: 0.05, thick: 0.8, depth: 0.84, head: 1.0, lean: 0.03 },
      skin: { key: 'skin.fair', tint: 0xf0e2dc },
      hair: { key: 'hair.dark' },
      linen: { key: 'cloth.undyed' },
      leather: { key: 'leather.fine' },
      cloth: { key: 'cloth.undyed' },
      hairStyle: 'crop',
      hairline: 0.62,
      accent: 0xc8a050,
    },
    wear: [
      { slot: 'chest', visual: { shape: 'chest.coat', palette: 'cloth.silk|0x2c2632' } },
      { slot: 'belt', visual: { shape: 'belt.chain', palette: 'metal.dark' }, baseId: 'belt.girdle' },
      { slot: 'gloves', visual: { shape: 'gloves.silk', palette: 'leather.fine' } },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.fine' } },
    ],
    legs: 'pal:cloth.silk:2a2630:8',
    tools: [{ prop: 'lantern', hand: 'L' }, { prop: 'keys', hand: 'R' }],
  },
  marrow: {
    look: {
      profile: { height: 1.72, shoulder: 0.108, hip: 0.053, thick: 0.9, depth: 0.96, head: 1.02, lean: 0.2 },
      skin: { key: 'skin.tan', tint: 0xdccabc },
      hair: { key: 'hair.fair', tint: 0xe0e0e0 },
      linen: { key: 'cloth.tattered' },
      leather: { key: 'leather.worn' },
      cloth: { key: 'cloth.tattered' },
      hairStyle: 'crop',
      hairline: 0.6,
      beard: 1,
      accent: 0x9ab0c0,
    },
    wear: [
      { slot: 'chest', visual: { shape: 'chest.leather', palette: 'leather.worn' } },
      { slot: 'helm', visual: { shape: 'helm.hood', palette: 'cloth.tattered|0x5a5246' } },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.worn' } },
    ],
    legs: 'pal:cloth.tattered:6a6050:8',
    tools: [
      { item: { visual: { shape: 'spear', palette: 'wood.oak' }, category: 'spear', twoHanded: true, slot: 'mainHand' } },
      { prop: 'chisel', hand: 'L' },
    ],
  },
  renn: {
    look: {
      profile: { height: 1.8, shoulder: 0.118, hip: 0.055, thick: 1.0, depth: 1.0, head: 0.98, lean: 0.04 },
      skin: { key: 'skin.tan' },
      hair: { key: 'hair.dark', tint: 0xc09070 },
      linen: { key: 'cloth.undyed' },
      leather: { key: 'leather.worn' },
      cloth: { key: 'cloth.undyed' },
      hairStyle: 'ponytail',
      hairline: 0.38,
      accent: 0xc84a3a,
    },
    wear: [
      { slot: 'chest', visual: { shape: 'chest.mail', palette: 'metal.iron', glow: 0xa83a30 }, rarity: 'magic', baseId: 'chest.chainmail' },
      { slot: 'gloves', visual: { shape: 'gloves.plate', palette: 'metal.iron' } },
      { slot: 'boots', visual: { shape: 'boots.plate', palette: 'metal.iron' } },
      { slot: 'belt', visual: { shape: 'belt.plate', palette: 'leather.worn' }, rarity: 'magic' },
    ],
    legs: 'pal:leather.worn:6a5a4a:6',
    tools: [{ item: { visual: { shape: 'spear', palette: 'metal.steel' }, category: 'spear', twoHanded: true, slot: 'mainHand' } }],
  },
  listener: {
    look: {
      profile: { height: 1.68, shoulder: 0.098, hip: 0.05, thick: 0.8, depth: 0.86, head: 1.0, lean: 0.05 },
      skin: { key: 'skin.fair', tint: 0xf0e6ee },
      hair: { key: 'cloth.linen', tint: 0xf4f2f0 },
      linen: { key: 'cloth.linen' },
      leather: { key: 'leather.fine' },
      cloth: { key: 'cloth.linen' },
      hairStyle: 'long',
      hairline: 0.3,
      accent: 0xb090e0,
    },
    wear: [
      { slot: 'chest', visual: { shape: 'chest.robe', palette: 'cloth.linen|0xd8d2e2' }, baseId: 'chest.dusk' },
      { slot: 'helm', visual: { shape: 'helm.blindfold', palette: 'cloth.silk|0x5a3a7a' } },
      { slot: 'boots', visual: { shape: 'boots.silk', palette: 'cloth.silk' } },
    ],
    tools: [{ item: { visual: { shape: 'staff', palette: 'wood.oak' }, category: 'staff', twoHanded: true, slot: 'mainHand' } }],
  },
  gilder: {
    look: {
      profile: { height: 1.82, shoulder: 0.115, hip: 0.056, thick: 0.98, depth: 1.12, head: 1.0, lean: 0.06 },
      skin: { key: 'skin.tan', tint: 0xffd4c4 },
      hair: { key: 'hair.fair', tint: 0xe8b070 },
      linen: { key: 'cloth.linen' },
      leather: { key: 'leather.fine' },
      cloth: { key: 'cloth.banner' },
      hairStyle: 'crop',
      hairline: 0.3,
      beard: 1,
      sleeves: true,
      accent: 0xf5d76e,
    },
    wear: [
      { slot: 'chest', visual: { shape: 'chest.leather', palette: 'leather.fine', ornate: 0.3 }, rarity: 'rare', baseId: 'chest.studded' },
      { slot: 'belt', visual: { shape: 'belt.sash', palette: 'cloth.banner' }, rarity: 'magic' },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.fine' }, baseId: 'boots.sharkskin' },
    ],
    legs: 'pal:cloth.silk:7a3a4a:8',
    tools: [{ prop: 'tankard', hand: 'R' }],
  },
  wenna: {
    look: {
      profile: { height: 1.7, shoulder: 0.1, hip: 0.052, thick: 0.88, depth: 0.9, head: 1.0, lean: 0.04 },
      skin: { key: 'skin.deep' },
      hair: { key: 'hair.dark' },
      linen: { key: 'cloth.undyed' },
      leather: { key: 'leather.worn' },
      cloth: { key: 'cloth.undyed' },
      hairStyle: 'braids',
      hairline: 0.36,
      accent: 0x7fc4c0,
    },
    wear: [
      { slot: 'chest', visual: { shape: 'chest.coat', palette: 'leather.worn' } },
      { slot: 'helm', visual: { shape: 'helm.hat', palette: 'leather.worn' } },
      { slot: 'belt', visual: { shape: 'belt.plate', palette: 'leather.studded' } },
      { slot: 'boots', visual: { shape: 'boots.light', palette: 'leather.studded' }, baseId: 'boots.heavy' },
    ],
    legs: 'pal:cloth.undyed:6a6a5a:8',
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

/** Pale scar tissue up a forearm, from wrist to elbow. */
function burns(fit: BodyFit): THREE.Object3D {
  const parts = ([1, -1] as const).map((s) => ({
    geo: sweep(armNodes(fit, s, fit.H * 0.0015, 0.5, 0.9), 12, false),
    mat: 'pal:skin.fair:fff4f0:1.4',
    bind: s > 0 ? ['elbowL', 'handL'] : ['elbowR', 'handR'],
  }));
  return buildFitted(fit, 'npc:burns', parts);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds one camp resident: body, clothes and tools. Unknown ids fall back to
 * the quartermaster rather than failing, so a renamed NPC still stands there.
 */
export function buildNpcModel(id: string, rng: Rng = new Random(1)): PlayerModel {
  const spec = SPECS[id as NpcLookId] ?? SPECS.hesk;
  const built = buildPerson(spec.look, rng, `npc:${id}`);
  const { root, bones } = built;
  const worn = new Set<EquipSlot>();
  for (const w of spec.wear) {
    try {
      const item = { baseId: w.baseId ?? `npc:${id}:${w.slot}`, rarity: w.rarity ?? 'normal' };
      if (wearItem(root, bones, w.slot, item, w.visual)) worn.add(w.slot);
    } catch {
      // A missing garment is better than a missing resident.
    }
  }
  const fit = root.userData.bodyFit as BodyFit | undefined;
  if (spec.legs && fit) {
    const H = fit.H;
    const parts = [
      { geo: ringStack(torsoRings(fit, H * 0.008, 0.44, 0.6), 18), mat: spec.legs, bind: ['hips', 'spine'] },
      ...([1, -1] as const).map((sd) => ({
        geo: sweep(legNodes(fit, sd, H * 0.009, 0.03, 0.8), 12),
        mat: spec.legs!,
        bind: sd > 0 ? ['hips', 'hipL', 'kneeL', 'footL'] : ['hips', 'hipR', 'kneeR', 'footR'],
      })),
    ];
    bones.hips?.add(buildFitted(fit, 'npc:legs', parts));
  }
  if (spec.burns && fit) {
    const scars = burns(fit);
    bones.hips?.add(scars);
  }
  for (const t of spec.tools) {
    try {
      if (t.item) {
        const model = compactModel(buildItemModel(t.item.visual, rng, 'normal'));
        attachToSocket(root, bones, t.item.slot, model, undefined, weaponGrip(t.item.category, !!t.item.twoHanded));
      } else if (t.prop) {
        const bone = bones[t.hand === 'L' ? 'handL' : 'handR'];
        bone?.add(buildProp(t.prop));
      }
    } catch {
      /* a resident without a prop still works */
    }
  }
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  root.userData.npcId = id;
  return built;
}

/** The grip a resident's tool asks for, so the animator can hold it properly. */
export function npcCarryGrip(id: string): 'none' | 'twoHand' | 'staff' | 'bow' {
  const spec = SPECS[id as NpcLookId];
  const tool = spec?.tools.find((t) => t.item?.twoHanded);
  if (!tool?.item) return 'none';
  const g = weaponGrip(tool.item.category, true);
  return g === 'staff' || g === 'twoHand' || g === 'bow' ? g : 'none';
}
