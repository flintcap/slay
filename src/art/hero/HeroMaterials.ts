/**
 * SLAY — materials for heroes: skin, hair, cloth, leather, metal.
 */
import * as THREE from 'three';
import type { HeroLook } from './Looks';

const cache = new Map<string, THREE.Material>();

function shared<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = make();
  m.userData.shared = true;
  cache.set(key, m);
  return m;
}

export function skinMaterial(look: HeroLook): THREE.MeshStandardMaterial {
  return shared(`skin|${look.skin}|${look.dead ? 1 : 0}`, () => new THREE.MeshStandardMaterial({ color: look.skin, roughness: look.dead ? 0.8 : 0.55, metalness: 0 }));
}
