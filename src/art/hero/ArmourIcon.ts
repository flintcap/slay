/**
 * SLAY — set and unique armour worn the way its icon shows it.
 *
 * The icon is built by the item builders (`items/Wear.ts` plus
 * `items/Features.ts`); worn armour is grown on the body by the hero code.
 * Two builders drifted into two looks: the Kindled Cowl was a winged cap in
 * the pack and a black hood with a little flame crown on the head.
 *
 * So the signature pieces wear the icon's own geometry:
 *
 *  - Helms are rigid, and so is a head: the whole icon model is worn.
 *  - Body armour, belts, gloves and boots keep the shell grown on the body so
 *    they bend with it, and wear the icon's features on top: the halo, the
 *    wings, the chains, the horns, the emblem.
 *
 * Each piece is laid from the item's space into the body's rest pose by the
 * conventions the item builders work to (a helm's brim at y = 0 with a 0.11 m
 * dome, a torso from y = -0.18 to 0.18, a palm centred on the origin, a boot
 * standing on y = 0 with its toe along +Z), then skinned wholly to one bone,
 * so it rides the rig like every other worn mesh and is freed with it.
 */
import * as THREE from 'three';
import type { EquipSlot, Item, ItemVisual } from '../../types';
import { buildItem, buildItemFeatures } from '../items/Model';
import type { HeroModel } from './Hero';
import { hipHalf, type HeroBone } from './Rig';

type Ident = Pick<Item, 'baseId' | 'rarity' | 'uniqueId' | 'setId'>;

/** Where one copy of the icon's geometry goes: the bone it rides and item space to rest pose. */
interface Placement {
  bone: HeroBone;
  m: THREE.Matrix4;
}

/** True for the pieces that wear their icon: sets, uniques and better. */
export function wearsIcon(item: Ident): boolean {
  return !!item.uniqueId || !!item.setId;
}

/** Item space to the body's rest pose, once per copy (gloves and boots come in pairs). */
function placements(hero: HeroModel, slot: EquipSlot): Placement[] {
  const h = hero.body.anatomy.h;
  const j = hero.rig.joints;
  const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
  const S = (s: number) => new THREE.Matrix4().makeScale(s, s, s);
  switch (slot) {
    case 'helm':
      // The icon's 0.11 m dome over the cranium, hair room included. A head is
      // deeper than the dome is: it is drawn out front to back so a visor
      // covers the face and the crown the back of the skull.
      return [{ bone: 'head', m: T(0, 7.1 * h, 0.05 * h).multiply(new THREE.Matrix4().makeScale(4.6 * h, 4.6 * h, 5.7 * h)) }];
    case 'chest':
      // The icon's torso runs from its hem at -0.18 to its collar at 0.18.
      return [{ bone: 'chest', m: T(0, 5.22 * h, -0.04 * h).multiply(S(5.4 * h)) }];
    case 'belt': {
      // A 0.15 m band round the hips.
      const waist = hipHalf(hero.rig.shape) * 1.25;
      return [{ bone: 'pelvis', m: T(0, 4.15 * h, 0).multiply(S((waist / 0.15) * 1.06)) }];
    }
    case 'gloves':
      return ([1, -1] as const).map((side) => {
        const L = side > 0;
        const wrist = j[L ? 'handL' : 'handR'];
        const knuckle = j[L ? 'fingersL' : 'fingersR'];
        const along = knuckle.clone().sub(wrist);
        const len = along.length();
        along.normalize();
        // Palms down at rest: the back of the hand faces up, turned with the arm.
        const back = new THREE.Vector3(0, 1, 0).addScaledVector(along, -along.y).normalize();
        const x = new THREE.Vector3().crossVectors(along, back).multiplyScalar(side);
        const basis = new THREE.Matrix4().makeBasis(x, along, back);
        const mid = wrist.clone().lerp(knuckle, 0.5);
        // The icon's palm is 0.1 m from wrist to knuckles.
        return { bone: L ? 'handL' : 'handR', m: T(mid.x, mid.y, mid.z).multiply(basis).multiply(S((len / 0.1) * 1.08)) };
      });
    case 'boots':
      return ([1, -1] as const).map((side) => {
        const L = side > 0;
        const ankle = j[L ? 'footL' : 'footR'];
        const toe = j[L ? 'toeL' : 'toeR'];
        const fwd = toe.clone().sub(ankle).setY(0);
        const reach = fwd.length();
        fwd.normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const x = new THREE.Vector3().crossVectors(up, fwd).multiplyScalar(side);
        const basis = new THREE.Matrix4().makeBasis(x, up, fwd);
        // The icon's foot reaches 0.195 m ahead of its shaft and 0.075 m behind;
        // its shaft is cut a little shorter than a worn boot's, so it stands a little taller.
        const s = (reach + 0.4 * h) / 0.27;
        return { bone: L ? 'footL' : 'footR', m: T(ankle.x, 0, ankle.z).multiply(basis).multiply(new THREE.Matrix4().makeScale(s, s * 1.2, s)) };
      });
    default:
      return [];
  }
}

/** Every mesh under `src`, laid into rest pose by `m` and skinned wholly to `bone`. */
function skinRigid(hero: HeroModel, src: THREE.Object3D, p: Placement, name: string): THREE.SkinnedMesh[] {
  const index = hero.rig.skeleton.bones.indexOf(hero.rig.bones[p.bone]);
  if (index < 0) return [];
  const out: THREE.SkinnedMesh[] = [];
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry.clone();
    const m = p.m.clone().multiply(mesh.matrixWorld);
    geo.applyMatrix4(m);
    // A mirrored copy (the left glove, the left boot) turns its faces inside out.
    if (m.determinant() < 0) flipWinding(geo);
    const n = geo.getAttribute('position').count;
    const idx = new Uint16Array(n * 4);
    const wts = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      idx[i * 4] = index;
      wts[i * 4] = 1;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
    geo.computeBoundingSphere();
    const skinned = new THREE.SkinnedMesh(geo, mesh.material);
    skinned.name = `${name}:${mesh.name}`;
    skinned.castShadow = mesh.castShadow;
    skinned.receiveShadow = mesh.receiveShadow;
    skinned.renderOrder = mesh.renderOrder;
    skinned.frustumCulled = false;
    skinned.userData.iconPart = true;
    skinned.bind(hero.rig.skeleton, new THREE.Matrix4());
    out.push(skinned);
  });
  return out;
}

function flipWinding(geo: THREE.BufferGeometry): void {
  const index = geo.getIndex();
  if (index) {
    const a = index.array;
    for (let i = 0; i + 2 < a.length; i += 3) {
      const t = a[i + 1]!;
      a[i + 1] = a[i + 2]!;
      a[i + 2] = t;
    }
    index.needsUpdate = true;
    return;
  }
  for (const key of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(key) as THREE.BufferAttribute;
    const k = attr.itemSize;
    const a = attr.array;
    for (let v = 0; v + 2 < attr.count; v += 3) {
      for (let c = 0; c < k; c++) {
        const t = a[(v + 1) * k + c]!;
        a[(v + 1) * k + c] = a[(v + 2) * k + c]!;
        a[(v + 2) * k + c] = t;
      }
    }
    attr.needsUpdate = true;
  }
}

/** The whole icon helm, worn on the head. */
export function iconHelm(hero: HeroModel, item: Ident, visual: ItemVisual): THREE.SkinnedMesh[] {
  const built = buildItem(visual, item.rarity, { baseId: item.baseId, uniqueId: item.uniqueId, setId: item.setId });
  const out: THREE.SkinnedMesh[] = [];
  for (const p of placements(hero, 'helm')) out.push(...skinRigid(hero, built.group, p, 'helm:icon'));
  disposeBuilt(built.group);
  return out;
}

/** The icon's features for a body piece, on each place the piece is worn. */
export function iconFeatures(hero: HeroModel, slot: EquipSlot, item: Ident, visual: ItemVisual): THREE.SkinnedMesh[] {
  const group = buildItemFeatures(visual, item.rarity, { baseId: item.baseId, uniqueId: item.uniqueId, setId: item.setId });
  if (!group) return [];
  const out: THREE.SkinnedMesh[] = [];
  for (const p of placements(hero, slot)) out.push(...skinRigid(hero, group, p, `${slot}:feature`));
  disposeBuilt(group);
  return out;
}

/** The source geometry was only copied from; free it. Materials are shared. */
function disposeBuilt(root: THREE.Object3D): void {
  root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}
