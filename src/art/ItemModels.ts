/**
 * SLAY — item models: the public facade.
 *
 * Every item model in the game comes through here. The builders live in
 * `src/art/items/` (one module per family, one authored cut per base, the
 * unique's and set's features on top); this file turns them into the two
 * things the rest of the game asks for:
 *
 *  - `buildItemModel`: the item itself, for a hand, a rack or a showcase.
 *    Grip (or wear point) at the origin, business end along +Y, wide on X,
 *    thin on Z. Bows lie in the YZ plane. `hero/Hold.ts` puts it in a fist.
 *  - `buildDropModel`: the item lying on the floor, with the rarity beam,
 *    pool and sigil the loot effects drive (their look belongs to vfx).
 *
 * Unknown or free-form shapes ('sword', 'torch', 'greatsword' from monsters
 * and NPCs) resolve to the closest family; a model never fails to build.
 */

import * as THREE from 'three';
import { RARITY_COLOR, type Item, type ItemRarity, type ItemVisual, type Rng } from '../types';
import { additiveMaterial, beamMaterial } from './Materials';
import { radialGlowTexture, runeRingTexture } from '../fx/UtilityTextures';
import { buildItem, type ItemFamily } from './items/Model';

/** A model family. Same names as the builder families in `items/Model.ts`. */
export type ItemShape = ItemFamily;

/** Who an item is, beyond its base visual: enough to find its set colour or unique design. */
export type ItemIdent = Pick<Item, 'baseId'> & Partial<Pick<Item, 'uniqueId' | 'setId'>>;

const RARITY_TIER: Record<ItemRarity, number> = {
  normal: 0,
  magic: 1,
  rare: 2,
  set: 3,
  unique: 3,
  mythic: 4,
  ancient: 4,
};

/**
 * Builds a 3D model for an item from its base's `visual` block. `rng` is kept
 * for callers; every model is deterministic from its base, unique and set, so
 * the same item always looks the same.
 */
export function buildItemModel(visual: ItemVisual, _rng: Rng, rarity: ItemRarity, ident?: ItemIdent): THREE.Object3D {
  const built = buildItem(visual, rarity, ident ? { baseId: ident.baseId, uniqueId: ident.uniqueId, setId: ident.setId } : undefined);
  const k = HELD_SCALE[built.family];
  if (k) built.group.scale.setScalar(k);
  return built.group;
}

/**
 * The builders work in true sizes; one-handers read small in a hand at ARPG
 * distance, so they are shown a little larger (about the length the hands
 * were tuned for).
 */
const HELD_SCALE: Partial<Record<ItemFamily, number>> = {
  sword: 1.25,
  dagger: 1.3,
  axe: 1.15,
  mace: 1.1,
  wand: 1.35,
  scepter: 1.35,
  staff: 1.12,
  spear: 1.1,
};

// ---------------------------------------------------------------------------
// Ground drops
// ---------------------------------------------------------------------------

/** Families that stand on the floor as they are built (bottom down, front +Z). */
const STANDING = new Set<string>(['helm', 'boots', 'potion', 'material', 'orb', 'belt']);
/** Families built in the YZ plane, thin on X: they roll onto their side. */
const SIDEWAYS = new Set<string>(['bow', 'quiver']);

/**
 * How an item lies on the floor. Weapons, shields, body armour, gloves,
 * jewellery, gems and runes lie face up; helms, boots, potions, orbs and
 * materials stand; bows and quivers lie on their side. Sets rotation only.
 */
export function poseForDrop(model: THREE.Object3D): void {
  const shape = String(model.userData.shape ?? '');
  if (STANDING.has(shape)) model.rotation.set(0, 0, 0);
  else if (SIDEWAYS.has(shape)) model.rotation.set(0, 0, Math.PI / 2);
  else model.rotation.set(-Math.PI / 2, 0, 0);
}

/**
 * What colour a dropped item's beam burns. Injected rather than imported so
 * the art layer knows nothing about the loot tables. `main.ts` wires it to
 * `itemLabelColor`.
 */
let dropColorHook: ((item: Item) => number | undefined) | null = null;

export function setDropColorResolver(fn: (item: Item) => number | undefined): void {
  dropColorHook = fn;
}

let visualResolver: ((item: Item) => ItemVisual | undefined) | null = null;

/**
 * Lets the integration layer wire real `ItemBase.visual` data in without this
 * module depending on the loot tables. Until it is set, drops build from the
 * base id alone, which the look system resolves on its own.
 */
export function setItemVisualResolver(fn: ((item: Item) => ItemVisual | undefined) | null): void {
  visualResolver = fn;
}

/** Height the loot code rests a landed drop's root at (`LootFX` and the dungeon scene). */
const REST_Y = 0.28;
/** Small things are shown a little larger on the floor so they can be seen and clicked. */
const MIN_FLOOR_SIZE = 0.3;
const MAX_FLOOR_SIZE = 1.3;

/**
 * The ground drop: the item lying still on the floor, with a rarity-tinted
 * light shaft and a glow pooled beneath it. The root rests at `REST_Y`; the
 * item and the floor glow sit that far below it, on the floor itself.
 *
 * Children the loot effects find by name: `spin` (the item, tumbled in
 * flight), `beam`, `pool`, `sigil`, `dropLight`.
 */
export function buildDropModel(item: Item, rng: Rng): THREE.Object3D {
  const visual = (visualResolver ? visualResolver(item) : undefined) ?? { shape: item.baseId || 'sword', palette: 'metal.steel', ornate: 0.4 };
  const rarity = item.rarity;
  const color = (dropColorHook ? dropColorHook(item) : undefined) ?? RARITY_COLOR[rarity] ?? 0xc8c8c8;
  const tier = RARITY_TIER[rarity] ?? 0;

  const root = new THREE.Group();
  root.name = `drop:${item.baseId}`;

  // The item, laid down, centred on its own middle so a tumble turns about it.
  const model = buildItemModel(visual, rng, rarity, item);
  poseForDrop(model);
  const yaw = new THREE.Group();
  yaw.add(model);
  // Weapons lie at an angle so their length reads; everything gets a small turn of its own.
  const shape = String(model.userData.shape ?? '');
  const lying = !STANDING.has(shape);
  yaw.rotation.y = (lying ? Math.PI * 0.25 : 0) + rng.range(-0.5, 0.5);
  yaw.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(yaw);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(1e-3, size.x, size.y, size.z);
  const scale = longest < MIN_FLOOR_SIZE ? Math.min(4, MIN_FLOOR_SIZE / longest) : longest > MAX_FLOOR_SIZE ? MAX_FLOOR_SIZE / longest : 1;
  const centre = box.getCenter(new THREE.Vector3());
  yaw.position.sub(centre);

  const spin = new THREE.Group();
  spin.name = 'spin';
  spin.add(yaw);
  spin.scale.setScalar(scale);
  // Bottom of the item on the floor, a hair above it to stay out of the ground.
  spin.position.y = -REST_Y + (size.y * scale) / 2 + 0.004;
  root.add(spin);

  const floor = new THREE.Group();
  floor.position.y = -REST_Y;
  root.add(floor);

  // Light shaft.
  const beamH = 1.5 + tier * 0.35;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.055 + tier * 0.012, 0.2 + tier * 0.035, beamH, 14, 1, true), beamMaterial(color));
  beam.position.y = beamH * 0.5;
  beam.renderOrder = 3;
  beam.name = 'beam';
  floor.add(beam);

  // Floor pool.
  const poolSize = Math.max(0.85, longest * scale * 1.1) + tier * 0.16;
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(poolSize, poolSize),
    additiveMaterial(color, { map: radialGlowTexture(128, 2.6), opacity: 0.55 + tier * 0.08 }),
  );
  pool.rotation.x = -Math.PI * 0.5;
  pool.position.y = 0.012;
  pool.renderOrder = 2;
  pool.name = 'pool';
  floor.add(pool);

  if (tier >= 2) {
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), additiveMaterial(color, { map: runeRingTexture(256, 17), opacity: 0.5 }));
    sigil.rotation.x = -Math.PI * 0.5;
    sigil.position.y = 0.018;
    sigil.userData.spin = -0.35;
    sigil.name = 'sigil';
    floor.add(sigil);
  }
  if (tier >= 4) {
    // A brighter second pool rather than a real light: a light would change
    // the scene's light count and recompile every shader in the dungeon.
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), additiveMaterial(color, { map: radialGlowTexture(128, 1.7), opacity: 0.4 }));
    halo.rotation.x = -Math.PI * 0.5;
    halo.position.y = 0.008;
    halo.renderOrder = 1;
    halo.name = 'dropLight';
    floor.add(halo);
  }

  root.userData.rarity = rarity;
  root.userData.color = color;
  root.userData.uid = item.uid;
  root.userData.shape = shape;
  return root;
}
