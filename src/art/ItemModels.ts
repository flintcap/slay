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
 *  - `buildDropModel`: the item lying on the floor. Its beam and floor glow
 *    are drawn by `fx/LootFX.ts` (vfx owns them).
 *
 * Unknown or free-form shapes ('sword', 'torch', 'greatsword' from monsters
 * and NPCs) resolve to the closest family; a model never fails to build.
 */

import * as THREE from 'three';
import { compactModel } from './ModelBudget';
import { RARITY_COLOR, type Item, type ItemRarity, type ItemVisual, type Rng } from '../types';
import { buildItem, type ItemFamily } from './items/Model';
import { glowShell } from './items/Aura';

/** Who an item is, beyond its base visual: enough to find its set colour or unique design. */
export type ItemIdent = Pick<Item, 'baseId'> & Partial<Pick<Item, 'uniqueId' | 'setId'>>;

/**
 * Builds a 3D model for an item from its base's `visual` block. `rng` is kept
 * for callers; every model is deterministic from its base, unique and set, so
 * the same item always looks the same.
 */
export function buildItemModel(visual: ItemVisual, _rng: Rng, rarity: ItemRarity, ident?: ItemIdent): THREE.Object3D {
  const built = buildItem(visual, rarity, ident ? { baseId: ident.baseId, uniqueId: ident.uniqueId, setId: ident.setId } : undefined);
  const k = HELD_SCALE[built.family];
  if (k) built.group.scale.setScalar(k);
  // Mythic and ancient uniques and the few glowing set pieces (`glowTierOf`, `GLOWING_SETS`)
  // glow round their outline. No floating sparks (the owner's call: fights
  // full of spells ran slow).
  const L = built.look;
  if (L.aura !== 'none' && (L.unique || L.set)) {
    const strength = L.set ? 0.45 : L.rarityTier >= 4 ? 0.9 : 0.65;
    glowShell(built.group, L.glowColor, strength, 0.012, L.glowStyle);
  }
  return built.group;
}

/**
 * The builders work in true sizes; one-handers read small in a hand at ARPG
 * distance, so they are shown a little larger (about the length the hands
 * were tuned for).
 */
const HELD_SCALE: Partial<Record<ItemFamily, number>> = {
  sword: 1.25,
  dagger: 1.45,
  axe: 1.15,
  mace: 1.1,
  wand: 1.5,
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

/**
 * Each look built once per floor, then copied for every drop of it (the
 * copies share its geometry and materials). Every drop used to sculpt its
 * model on the frame its monster died: a pack's worth of drops at once was a
 * stutter. Shared parts are marked so a picked-up drop's `disposeObject`
 * leaves them; `clearDropModels` frees them between floors.
 */
const dropTemplates = new Map<string, THREE.Object3D>();
const templateGeos = new Set<THREE.BufferGeometry>();

function dropTemplate(visual: ItemVisual, rng: Rng, rarity: ItemRarity, item: Item): THREE.Object3D {
  const key = JSON.stringify([visual, rarity, item.baseId, item.uniqueId ?? '', item.setId ?? '']);
  let t = dropTemplates.get(key);
  if (t) return t;
  // Merged to one mesh per material: a drop lying in the world drew one call
  // per part (blade, guard, grip, rivets), ten or more for one sword.
  t = compactModel(buildItemModel(visual, rng, rarity, item));
  t.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const g = mesh.geometry;
    if (g && !g.userData.cached) {
      g.userData.cached = true;
      templateGeos.add(g);
    }
    const mat = mesh.material;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) m.userData.shared = true;
  });
  dropTemplates.set(key, t);
  return t;
}

/** Frees the drop templates' own geometry. Call between floors. */
export function clearDropModels(): void {
  for (const g of templateGeos) g.dispose();
  templateGeos.clear();
  dropTemplates.clear();
}

/** Height the loot code rests a landed drop's root at (`LootFX` and the dungeon scene). */
const REST_Y = 0.28;
/** Small things are shown a little larger on the floor so they can be seen and clicked. */
const MIN_FLOOR_SIZE = 0.3;
const MAX_FLOOR_SIZE = 1.3;

/**
 * The ground drop: the item lying still on the floor. The root rests at
 * `REST_Y`; the item sits that far below it, on the floor itself. The beam
 * and floor glow are LootFX's pooled beacons, not part of the model.
 *
 * Children the loot effects find by name: `spin` (the item, tumbled in flight).
 */
export function buildDropModel(item: Item, rng: Rng): THREE.Object3D {
  const visual = (visualResolver ? visualResolver(item) : undefined) ?? { shape: item.baseId || 'sword', palette: 'metal.steel', ornate: 0.4 };
  const rarity = item.rarity;
  const color = (dropColorHook ? dropColorHook(item) : undefined) ?? RARITY_COLOR[rarity] ?? 0xc8c8c8;

  const root = new THREE.Group();
  root.name = `drop:${item.baseId}`;

  // The item, laid down, centred on its own middle so a tumble turns about it.
  const model = dropTemplate(visual, rng, rarity, item).clone(true);
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


  root.userData.rarity = rarity;
  root.userData.color = color;
  root.userData.uid = item.uid;
  root.userData.shape = shape;
  return root;
}
