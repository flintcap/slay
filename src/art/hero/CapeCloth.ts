/**
 * SLAY — the playing hero's cape as cloth (`art/Cloth.ts`).
 *
 * A worn cape (`Cape.ts`) is a sheet on four bones the animator swings
 * (`Secondary.ts`). For the hero in play the same sheet is drawn as cloth
 * instead: its top row held at the shoulders, the rest hanging, trailing a
 * run and folding over the back and legs. The boned cape stays, hidden, for
 * whatever copies the hero (a Shadow Clone draws it as before).
 */
import * as THREE from 'three/webgpu';
import { CAPE_COLS, CAPE_ROWS } from './Cape';
import type { HeroModel } from './Hero';
import type { HeroBone } from './Rig';
import { Cloth, CLOTH_FEEL, MAX_BODIES, type ClothSheet } from '../Cloth';

/** A point the cape falls against: on a bone, where it sits in the bind pose. */
interface BodyEnd {
  bone: THREE.Bone;
  /** Offset from the bone's joint, bind space (metres). */
  off: THREE.Vector3;
}
interface Body {
  a: BodyEnd;
  b: BodyEnd;
  /** Radius, metres at the hero's own size. */
  r: number;
}

/** How far the hem may swing from where the cape hangs at rest, a share of its length. */
const HEM_REACH = 0.72;

const _t = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class CapeCloth {
  readonly cloth: Cloth;
  private cape: THREE.SkinnedMesh | null = null;
  private readonly bodies: Body[];

  constructor(private readonly hero: HeroModel) {
    const rig = hero.rig;
    const J = rig.joints;
    const h = hero.body.anatomy.h;
    // A bind-pose point (head units) carried by a bone.
    const at = (bone: HeroBone, x: number, y: number, z: number): BodyEnd => ({
      bone: rig.bones[bone],
      off: new THREE.Vector3(x * h, y * h, z * h).sub(J[bone]),
    });
    // A joint as carried by a bone (a knee by the thigh).
    const joint = (bone: HeroBone, of: HeroBone = bone): BodyEnd => ({ bone: rig.bones[bone], off: J[of].clone().sub(J[bone]) });
    const hip = Math.abs(J.thighL.x) / h;
    // The back and the armour on it, the shoulders, the seat, then the limbs
    // that swing into a cape: thighs and shins on a stride, arms on a swing.
    this.bodies = [
      { a: at('spine', 0, 4.35, -0.06), b: at('chest', 0, 5.7, -0.08), r: 0.44 * h },
      { a: joint('clavL', 'upperArmL'), b: joint('clavR', 'upperArmR'), r: 0.3 * h },
      { a: at('pelvis', hip * 0.8, 3.9, -0.04), b: at('pelvis', -hip * 0.8, 3.9, -0.04), r: 0.36 * h },
      ...(['L', 'R'] as const).flatMap((s): Body[] => [
        { a: joint(`thigh${s}`), b: joint(`thigh${s}`, `shin${s}`), r: 0.3 * h },
        { a: joint(`shin${s}`), b: joint(`shin${s}`, `foot${s}`), r: 0.22 * h },
        { a: joint(`upperArm${s}`), b: joint(`upperArm${s}`, `foreArm${s}`), r: 0.2 * h },
      ]),
    ].slice(0, MAX_BODIES);
    // Made on the first cape worn; a later cape is copied into the same cloth.
    this.cloth = new Cloth(blankSheet(), new THREE.MeshStandardNodeMaterial(), CLOTH_FEEL.cape);
    this.cloth.mesh.receiveShadow = true;
    this.cloth.place = (c) => this.placeCloth(c);
  }

  /** Draws `cape` (the hero's boned cape, or null for none) as the cloth. */
  wear(cape: THREE.SkinnedMesh | null): void {
    if (cape === this.cape) return;
    if (this.cape) {
      this.cape.visible = true;
      delete this.cape.userData.clothed;
    }
    this.cape = cape;
    const mesh = this.cloth.mesh;
    if (!cape) {
      mesh.removeFromParent();
      return;
    }
    this.cloth.reshape(capeSheet(cape.geometry));
    this.cloth.dress(cape.material as THREE.Material);
    // A child of the hero, not of the armour: the armour is freed when it
    // comes off, and the cloth outlives it.
    this.hero.root.add(mesh);
    cape.visible = false;
    cape.userData.clothed = true;
  }

  /** Once a frame, after the hero moved. */
  tick(dt: number): void {
    const cape = this.cape;
    if (!cape) return;
    // Shown when the boned cape would be (the armour on, the hero not a beast).
    let shown = true;
    for (let p = cape.parent; p && p !== this.hero.root; p = p.parent) shown &&= p.visible;
    this.cloth.mesh.visible = shown;
    if (shown) this.cloth.tick(dt);
  }

  /** Where the cape hangs this frame and what it falls against (`Cloth.place`). */
  private placeCloth(c: Cloth): boolean {
    const cape = this.cape;
    const top = cape?.skeleton.bones[0];
    const chest = top?.parent;
    if (!cape || !top || !chest) return false;
    // The cape's top bone without the swing the animator gives it: the
    // shoulders as the chest carries them.
    _t.makeTranslation(top.position.x, top.position.y, top.position.z);
    c.frame.multiplyMatrices(chest.matrixWorld, _t).multiply(cape.skeleton.boneInverses[0]!);
    const root = this.hero.root.matrixWorld;
    const scale = Math.cbrt(Math.abs(root.determinant())) || 1;
    let n = 0;
    for (const b of this.bodies) {
      const A = c.bodies[n * 2]!;
      const B = c.bodies[n * 2 + 1]!;
      _v.copy(b.a.off).applyMatrix4(b.a.bone.matrixWorld);
      A.set(_v.x, _v.y, _v.z, b.r * scale);
      _v.copy(b.b.off).applyMatrix4(b.b.bone.matrixWorld);
      B.set(_v.x, _v.y, _v.z, 0);
      n++;
    }
    c.bodyCount = n;
    c.floor = root.elements[13]! + 0.02 * scale;
    return true;
  }

  dispose(): void {
    this.wear(null);
    this.cloth.dispose();
  }
}

/** A flat sheet of the cape's grid, for the cloth's first build (a cape is copied in when worn). */
function blankSheet(): ClothSheet {
  const g = new THREE.PlaneGeometry(1, 1, CAPE_COLS - 1, CAPE_ROWS - 1);
  const n = CAPE_COLS * CAPE_ROWS;
  return { cols: CAPE_COLS, rows: CAPE_ROWS, geometry: g, pin: new Float32Array(n), reach: new Float32Array(n) };
}

/** A worn cape's sheet: its shape, its top row held, its hem free. */
function capeSheet(geo: THREE.BufferGeometry): ClothSheet {
  const n = CAPE_COLS * CAPE_ROWS;
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const length = Math.max(1e-3, p.getY(0) - p.getY(n - 1));
  const pin = new Float32Array(n);
  const reach = new Float32Array(n);
  for (let r = 0; r < CAPE_ROWS; r++) {
    const t = r / (CAPE_ROWS - 1);
    for (let c = 0; c < CAPE_COLS; c++) {
      const s = (c / (CAPE_COLS - 1)) * 2 - 1;
      const i = r * CAPE_COLS + c;
      pin[i] = r === 0 ? 1 : 0;
      // The edges flap a little further than the middle.
      reach[i] = length * HEM_REACH * t ** 1.4 * (1 + 0.15 * Math.abs(s));
    }
  }
  return { cols: CAPE_COLS, rows: CAPE_ROWS, geometry: geo, pin, reach };
}
