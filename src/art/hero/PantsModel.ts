/**
 * SLAY — pants as the pack shows them.
 *
 * Pants are cut on a body (`ArmourLimbs.ts`), so their icon is cut the same
 * way, on a stand-in hero's body with nothing else meshed: the same shell,
 * the same fittings, the same unique and set features, in the same materials.
 * What the pack shows is what the hero wears, by construction.
 */
import * as THREE from 'three';
import type { ItemLook } from '../ItemLook';
import { bodyField } from './Anatomy';
import type { BodyMesh } from './Body';
import { HERO_LOOKS } from './Looks';
import { heroJoints } from './Rig';
import { Kit } from './ArmourKit';
import { pants } from './ArmourLimbs';
import { dress } from './ArmourFeatures';
import { meshPiece } from './ArmourMesh';

let stand: BodyMesh | null = null;

/** A hero's body field and joints, with no skin meshed: only the pants are. */
function standIn(): BodyMesh {
  if (!stand) {
    const look = HERO_LOOKS.ranger;
    const joints = heroJoints(look.shape);
    const anatomy = bodyField(look.shape, joints, look.face);
    stand = { skin: new THREE.BufferGeometry(), anatomy, joints, hash: anatomy.field.hash(), ms: 0, garmentScale: 1 };
  }
  return stand;
}

/**
 * The pants for `look`, standing, centred on the origin. Fresh geometry (the
 * icon and drop code free what they are given); shared materials.
 */
export function buildPantsGroup(look: ItemLook): THREE.Group {
  const body = standIn();
  const k = new Kit(body, look, 'legs');
  dress(k, pants(k));
  const group = new THREE.Group();
  for (const e of meshPiece(body, 'legs', look.cut, k.finish())) {
    const geo = e.geo.clone();
    geo.deleteAttribute('skinIndex');
    geo.deleteAttribute('skinWeight');
    const mesh = new THREE.Mesh(geo, e.mat);
    mesh.name = `legs:${e.names[0]}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3());
  for (const m of group.children) m.position.sub(c);
  return group;
}
