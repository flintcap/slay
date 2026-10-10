/**
 * SLAY — a whole hero: rig, skin, eyes, hair and undergarments.
 */
import * as THREE from 'three';
import { buildRig, type HeroRig } from './Rig';
import { meshBody, type BodyMesh } from './Body';
import { eyeGeometry, eyeMaterial } from './Eyes';
import type { HeroLook } from './Looks';
import { skinMaterial } from './HeroMaterials';

export interface HeroModel {
  rig: HeroRig;
  /** Place, turn and add this to the scene. */
  root: THREE.Group;
  body: BodyMesh;
  look: HeroLook;
}

function skinned(geo: THREE.BufferGeometry, mat: THREE.Material, rig: HeroRig, name: string): THREE.SkinnedMesh {
  const m = new THREE.SkinnedMesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  // Bind-pose bounds go stale as soon as a limb moves.
  m.frustumCulled = false;
  rig.root.add(m);
  m.bind(rig.skeleton, new THREE.Matrix4());
  return m;
}

export function buildHero(look: HeroLook, name = 'hero'): HeroModel {
  const body = meshBody(look.shape, look.face);
  const rig = buildRig(look.shape, name);
  skinned(body.skin, skinMaterial(look), rig, `${name}:skin`);
  const e = body.anatomy.eyes;
  const eyes = skinned(eyeGeometry(e.L, e.R, e.r), eyeMaterial(look.eyes.iris, look.eyes.glow), rig, `${name}:eyes`);
  eyes.castShadow = false;
  rig.root.userData.heroLook = look;
  return { rig, root: rig.root, body, look };
}
