/**
 * SLAY — a spawn's capes and banners as cloth (`art/Cloth.ts`).
 *
 * The sculpt lays each sheet out in the bind pose (`ClothSheets.ts`). A
 * spawn wears it as cloth: its held points ride their bone as the baked body
 * does, the rest hang from them and fall against the capsules the sheet
 * names (the back, the legs, a pole), each end a bind point its bone
 * carries. The animator moves them on once a frame (`tickCloths`). A fallen
 * body keeps its cloth lying where it fell (`Creature.leaveCorpse`).
 */
import * as THREE from 'three/webgpu';
import { Cloth, CLOTH_FEEL, MAX_BODIES } from '../Cloth';
import type { CMat, ClothSpec } from './Sculpt';

/** A point a bone carries: its bind place in the bone's own space. */
interface End {
  bone: THREE.Bone;
  off: THREE.Vector3;
}

/** Banners fly in a stiffer breeze than a cape hangs in. */
const BANNER_WIND = new THREE.Vector4(0.7, 0, 0.35, 0.9);
/** A dying body's cloth may swing this many times further: as good as free. */
const LIMP_REACH = 50;
/** Paint and glow ride along from the bake. */
const KEEP = ['color'] as const;

const _v = new THREE.Vector3();

/** Cloth for each of `specs`, drawn in the spawn's own `look` of the sheet's material, under `root`. */
export function wearCloths(root: THREE.Object3D, skel: THREE.Skeleton, specs: readonly ClothSpec[], look: (mat: CMat) => THREE.Material): Cloth[] {
  const index = new Map(skel.bones.map((b, i) => [b.name, i]));
  const end = (name: string, p: THREE.Vector3): End | null => {
    const i = index.get(name);
    if (i === undefined) return null;
    return { bone: skel.bones[i]!, off: p.clone().applyMatrix4(skel.boneInverses[i]!) };
  };
  const out: Cloth[] = [];
  for (const spec of specs) {
    const held = index.get(spec.bone);
    if (held === undefined) continue;
    const bone = skel.bones[held]!;
    const unbind = skel.boneInverses[held]!;
    const bodies = spec.bodies
      .map((b) => {
        const a = end(b.a, b.at);
        const e = end(b.b, b.bt);
        return a && e ? { a, b: e, r: b.r } : null;
      })
      .filter((b): b is { a: End; b: End; r: number } => !!b)
      .slice(0, MAX_BODIES);
    const cloth = new Cloth({ cols: spec.cols, rows: spec.rows, geometry: spec.geo, pin: spec.pin, reach: spec.reach, keep: KEEP }, look(spec.mat), CLOTH_FEEL[spec.feel]);
    if (spec.feel === 'banner') cloth.wind.copy(BANNER_WIND);
    cloth.mesh.receiveShadow = true;
    cloth.place = (c) => {
      c.frame.multiplyMatrices(bone.matrixWorld, unbind);
      const scale = Math.cbrt(Math.abs(root.matrixWorld.determinant())) || 1;
      let n = 0;
      // A falling body lets its cloth go: it drops through to the floor
      // rather than being squeezed up between the body and the ground, or
      // held up by a chest that ends the fall upside down.
      const limp = !!root.userData.clothLimp;
      c.reachScale = limp ? LIMP_REACH : 1;
      if (!limp) for (const b of bodies) {
        _v.copy(b.a.off).applyMatrix4(b.a.bone.matrixWorld);
        c.bodies[n * 2]!.set(_v.x, _v.y, _v.z, b.r * scale);
        _v.copy(b.b.off).applyMatrix4(b.b.bone.matrixWorld);
        c.bodies[n * 2 + 1]!.set(_v.x, _v.y, _v.z, 0);
        n++;
      }
      c.bodyCount = n;
      c.floor = root.matrixWorld.elements[13]! + 0.01 * scale;
      return true;
    };
    root.add(cloth.mesh);
    out.push(cloth);
  }
  return out;
}

/** The cloth a spawn (or the body it left) wears. */
export function clothsOf(o: THREE.Object3D): Cloth[] | undefined {
  return o.userData.cloths as Cloth[] | undefined;
}

/** Moves a spawn's cloth on: once a frame, after it was posed. `limp` while it dies. */
export function tickCloths(root: THREE.Object3D, dt: number, limp: boolean): void {
  const list = clothsOf(root);
  if (!list) return;
  root.userData.clothLimp = limp;
  for (const c of list) c.tick(dt);
}

/** Frees the cloth `o` holds. */
export function freeCloths(o: THREE.Object3D): void {
  const list = clothsOf(o);
  if (!list) return;
  for (const c of list) c.dispose();
  o.userData.cloths = undefined;
}

/** How long a fallen body's cloth goes on falling before it lies still. */
const SETTLE = 3;

/**
 * Hands a spawn's cloth to the body it left (`to`): it finishes its fall
 * from where the body lies, then lies still, and is freed with it. The
 * copies `to` was cloned with are dropped.
 */
export function handClothsOn(from: THREE.Object3D, to: THREE.Object3D): void {
  const list = clothsOf(from);
  const copies: THREE.Object3D[] = [];
  to.traverse((o) => {
    if (o.userData.cloth) copies.push(o);
  });
  for (const o of copies) o.removeFromParent();
  if (!list) return;
  for (const c of list) {
    // Where it last stood, with nothing to fall against but the floor.
    c.place = () => true;
    c.bodyCount = 0;
    c.reachScale = LIMP_REACH;
    c.settle(SETTLE);
    to.add(c.mesh);
  }
  to.userData.cloths = list;
  from.userData.cloths = undefined;
}
