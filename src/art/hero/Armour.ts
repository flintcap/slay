/**
 * SLAY — armour grown on the hero who wears it.
 *
 * Gear makes the look: a bare hero wears plain linens, and every piece put on
 * changes them. Each base has its own cut (`ArmourChest.ts`,
 * `ArmourHead.ts`, `ArmourLimbs.ts`), read from the item's `ItemLook.cut`
 * (the base id), so a quilted coat, a chain hauberk and archon plate are
 * different shapes, not one suit in three colours. Higher bases are cut
 * grander. Rarity adds trim, then a stone, then glowing runes. Uniques and
 * sets wear their own materials and colours, carry their features
 * (`ArmourFeatures.ts`) and, on the chest, a cape in their colour.
 *
 * Every piece is a shell of the hero's own body field (see `Garment.ts`) plus
 * fittings, so it fits a broad knight and a slight mage alike and bends
 * where they bend. Parts that share a material are merged into one mesh.
 */
import * as THREE from 'three';
import type { EquipSlot, Item, ItemVisual } from '../../types';
import { itemLook } from '../ItemLook';
import type { HeroModel } from './Hero';
import { buildCape } from './Cape';
import { Kit, type Anchor } from './ArmourKit';
import { chest } from './ArmourChest';
import { helm } from './ArmourHead';
import { belt, boots, gloves, pants } from './ArmourLimbs';
import { meshPiece } from './ArmourMesh';

// A worn mesh's own material and a piece's cape bones are kept here, not in
// `userData`: copying an object (a Shadow Clone's double) copies its userData
// through JSON, which wrote each material's textures out as a PNG, a stall
// of up to a second on every cast.
const BASE_MATERIAL = new WeakMap<THREE.Object3D, THREE.Material>();
const CAPE_BONES = new WeakMap<THREE.Object3D, THREE.Bone[]>();
import { dress } from './ArmourFeatures';
import { glowingTwin } from './HeroMaterials';
import { iconFeatures, iconHelm, wearsIcon } from './ArmourIcon';

/** What wearing a piece does. */
export interface WornArmour {
  /** Holds the piece's skinned meshes; already parented under the hero. */
  object: THREE.Group;
  /** Hero parts it hides: 'hair', 'beard', 'brows', 'hood', 'mask', 'belt', 'shorts', 'wrap'. */
  hides: string[];
}

/** Slots this module dresses. Weapons and shields stay socketed models. */
export function wearsOnBody(slot: EquipSlot): boolean {
  return slot === 'chest' || slot === 'helm' || slot === 'gloves' || slot === 'legs' || slot === 'boots' || slot === 'belt';
}

/** Cuts a piece on a body: its parts, and the anchors its features sit on. */
export function cutPiece(k: Kit, slot: EquipSlot): Anchor[] {
  if (slot === 'chest') return chest(k);
  if (slot === 'helm') return helm(k);
  if (slot === 'gloves') return gloves(k);
  if (slot === 'legs') return pants(k);
  if (slot === 'boots') return boots(k);
  return belt(k);
}

/**
 * Grows the piece for `item` on `hero` and parents it under the rig. Returns
 * null for slots worn as models (weapons, shields, jewellery).
 */
export function wearArmour(hero: HeroModel, slot: EquipSlot, item: Pick<Item, 'baseId' | 'rarity' | 'uniqueId' | 'setId'>, visual: ItemVisual): WornArmour | null {
  if (!wearsOnBody(slot)) return null;
  const look = itemLook(item, visual);
  const k = new Kit(hero.body, look, slot);
  const anchors = cutPiece(k, slot);
  // Sets and uniques wear their icon's features (a helm, its whole icon) in place of the body's own.
  // Pants are the exception: their icon is cut on a body too, so it already wears these.
  const icon = wearsIcon(item) && slot !== 'legs';
  if (!icon) dress(k, anchors);
  const parts = icon && slot === 'helm' ? [] : k.finish();

  const group = new THREE.Group();
  group.name = `worn:${slot}`;
  hero.rig.root.add(group);
  for (const e of meshPiece(hero.body, slot, look.cut, parts)) {
    const mesh = new THREE.SkinnedMesh(e.geo, e.mat);
    mesh.name = `${slot}:${e.names[0]}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.sharedGeometry = true;
    // Which of the piece's materials this is, so a set's glow can light its trims later.
    mesh.userData.armourMat = k.keyOf(e.mat);
    BASE_MATERIAL.set(mesh, e.mat);
    group.add(mesh);
    mesh.bind(hero.rig.skeleton, new THREE.Matrix4());
  }
  if (icon) {
    for (const mesh of slot === 'helm' ? iconHelm(hero, item, visual) : iconFeatures(hero, slot, item, visual)) {
      // A set's glow lifts the icon's parts a little, as it lifts a piece's cloth;
      // parts with a light of their own keep it.
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!(mat.emissiveIntensity > 0 && mat.emissive?.getHex())) {
        mesh.userData.armourMat = 'main';
        BASE_MATERIAL.set(mesh, mat);
      }
      group.add(mesh);
    }
  }
  if (slot === 'chest' && k.cape > 0) {
    const cape = buildCape(hero, k.mat('banner'), group, k.cape);
    CAPE_BONES.set(group, cape.bones);
  }
  if (look.glow > 0 && look.hasRunes) group.userData.glow = look.glowColor;
  return { object: group, hides: k.hides };
}

/**
 * Lights a worn set piece for how much of its set is worn: stage 0 as
 * built, 1 its trims glow in the set's colour (two pieces or more), 2 the
 * whole piece shines and the trims burn brighter (the full set).
 */
export function lightArmour(worn: WornArmour, stage: number, color: number): void {
  for (const o of worn.object.children) {
    const mesh = o as THREE.SkinnedMesh;
    const base = BASE_MATERIAL.get(mesh);
    if (!base) continue;
    const key = mesh.userData.armourMat as string | undefined;
    let lit = 0;
    if (key === 'trim' || key === 'gold' || key === 'chain') lit = stage >= 2 ? 0.42 : stage >= 1 ? 0.24 : 0;
    else if (key === 'main' || key === 'strap' || key === 'bone') lit = stage >= 2 ? 0.035 : 0;
    mesh.material = lit > 0 ? glowingTwin(base, color, lit) : base;
  }
}

/** Takes a worn piece off: its meshes, and any bones it hung on the rig. */
export function removeArmour(worn: WornArmour): void {
  const bones = CAPE_BONES.get(worn.object);
  if (bones?.[0]) bones[0].removeFromParent();
  worn.object.removeFromParent();
}
