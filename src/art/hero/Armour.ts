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
 * fittings, so it fits a broad warden and a slight pyromancer alike and bends
 * where they bend. Parts that share a material are merged into one mesh.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EquipSlot, Item, ItemVisual } from '../../types';
import { itemLook } from '../ItemLook';
import { garment } from './Garment';
import type { HeroModel } from './Hero';
import { buildCape } from './Cape';
import { Kit, type Anchor } from './ArmourKit';
import { chest } from './ArmourChest';
import { helm } from './ArmourHead';
import { belt, boots, gloves } from './ArmourLimbs';
import { dress } from './ArmourFeatures';
import { glowingTwin } from './HeroMaterials';

/**
 * Every part's triangle target is scaled by this: a fully dressed hero must
 * stay inside the 60k budget the hero checks hold it to.
 */
const TRI_SCALE = 0.8;

/** Bump when a cut's functions change (thickness and cut functions are not in the mesh cache key). */
const ARMOUR_REV = 5;

/** What wearing a piece does. */
export interface WornArmour {
  /** Holds the piece's skinned meshes; already parented under the hero. */
  object: THREE.Group;
  /** Hero parts it hides: 'hair', 'beard', 'brows', 'hood', 'mask', 'belt', 'shorts', 'wrap'. */
  hides: string[];
}

/** Slots this module dresses. Weapons and shields stay socketed models. */
export function wearsOnBody(slot: EquipSlot): boolean {
  return slot === 'chest' || slot === 'helm' || slot === 'gloves' || slot === 'boots' || slot === 'belt';
}

const merged = new Map<string, THREE.BufferGeometry>();

/** One geometry for several parts of one material; cached by the parts it joins. */
function mergeParts(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 1) return geos[0]!;
  const key = geos.map((g) => g.uuid).join('|');
  const hit = merged.get(key);
  if (hit) return hit;
  const g = mergeGeometries(geos, false);
  if (!g) return geos[0]!;
  g.computeBoundingSphere();
  if (merged.size > 400) merged.clear();
  merged.set(key, g);
  return g;
}

/**
 * Grows the piece for `item` on `hero` and parents it under the rig. Returns
 * null for slots worn as models (weapons, shields, jewellery).
 */
export function wearArmour(hero: HeroModel, slot: EquipSlot, item: Pick<Item, 'baseId' | 'rarity' | 'uniqueId' | 'setId'>, visual: ItemVisual): WornArmour | null {
  if (!wearsOnBody(slot)) return null;
  const look = itemLook(item, visual);
  const k = new Kit(hero.body, look, slot);
  let anchors: Anchor[];
  if (slot === 'chest') anchors = chest(k);
  else if (slot === 'helm') anchors = helm(k);
  else if (slot === 'gloves') anchors = gloves(k);
  else if (slot === 'boots') anchors = boots(k);
  else anchors = belt(k);
  dress(k, anchors);
  const parts = k.finish();

  const group = new THREE.Group();
  group.name = `worn:${slot}`;
  hero.rig.root.add(group);
  // Fittings differ between uniques and sets of one base: their prims are in the cache key.
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; names: string[] }>();
  for (const p of parts) {
    p.spec.tris = Math.round((p.spec.tris ?? 1800) * TRI_SCALE);
    const geo = garment(hero.body, `a${ARMOUR_REV}:${slot}:${look.cut}:${p.name}`, p.spec);
    if (!geo.getIndex() || geo.getIndex()!.count === 0) continue;
    let e = byMat.get(p.mat);
    if (!e) byMat.set(p.mat, (e = { geos: [], names: [] }));
    e.geos.push(geo);
    e.names.push(p.name);
  }
  for (const [mat, e] of byMat) {
    const mesh = new THREE.SkinnedMesh(mergeParts(e.geos), mat);
    mesh.name = `${slot}:${e.names[0]}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.sharedGeometry = true;
    // Which of the piece's materials this is, so a set's glow can light its trims later.
    mesh.userData.armourMat = k.keyOf(mat);
    mesh.userData.baseMaterial = mat;
    group.add(mesh);
    mesh.bind(hero.rig.skeleton, new THREE.Matrix4());
  }
  if (slot === 'chest' && k.cape > 0) {
    const cape = buildCape(hero, k.mat('banner'), group, k.cape);
    group.userData.capeBones = cape.bones;
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
    const base = mesh.userData.baseMaterial as THREE.Material | undefined;
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
  const bones = worn.object.userData.capeBones as THREE.Bone[] | undefined;
  if (bones?.[0]) bones[0].removeFromParent();
  worn.object.removeFromParent();
}
