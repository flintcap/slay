/**
 * SLAY — a bowstring the hand can draw.
 *
 * A bow is built with its string straight from tip to tip. Held by a hero,
 * the string is taken by the string hand when its curled fingers close on it
 * by the bow, and from then on runs from each tip to those fingers, with an
 * arrow laid from them across the bow. When the fingers open (the loose) the
 * arrow is gone and the string snaps back straight, shivering a moment.
 *
 * Bow space is the bow model's own (`Ranged.ts`): limbs along Y, the string
 * behind the grip on -Z, the arrow flying +Z.
 */
import * as THREE from 'three';
import { stringMat } from './Mats';

/** Finger curl (0 open .. 1 a fist) that takes the string, and that lets it go. */
const HOOK = 0.55;
const LET_GO = 0.45;
/** How near the string the fingers must close to take it, metres. */
const CATCH = 0.09;
/** Past this from the string's rest the fingers lose it, metres. */
const REACH = 1.0;
/** A nocked arrow, nock to point, metres. */
const ARROW = 0.8;
/** Where the arrow crosses the bow: on the fist, over the grip. */
const ARROW_REST = new THREE.Vector3(0, 0.045, 0);
/** How long the string shivers after the loose, seconds. */
const SHIVER = 0.22;

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

let legGeo: THREE.CylinderGeometry | null = null;
let arrowParts: Array<[THREE.BufferGeometry, THREE.Material]> | null = null;

/** One unit-long string length along +Y, shared by every bow. */
function leg(): THREE.CylinderGeometry {
  if (!legGeo) {
    legGeo = new THREE.CylinderGeometry(0.0017, 0.0017, 1, 4, 1, true);
    legGeo.translate(0, 0.5, 0);
  }
  return legGeo;
}

/** A plain hunting arrow along +Z, nock at the origin: shaft, head and three vanes. */
function arrowMeshes(): THREE.Mesh[] {
  if (!arrowParts) {
    const shaft = new THREE.CylinderGeometry(0.0035, 0.0035, ARROW - 0.05, 5, 1);
    shaft.rotateX(Math.PI / 2);
    shaft.translate(0, 0, (ARROW - 0.05) / 2);
    const head = new THREE.ConeGeometry(0.009, 0.05, 5);
    head.rotateX(Math.PI / 2);
    head.translate(0, 0, ARROW - 0.025);
    const vanes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const v = new THREE.BoxGeometry(0.0012, 0.012, 0.09);
      v.translate(0, 0.008, 0.07);
      v.rotateZ((i / 3) * Math.PI * 2);
      vanes.push(v);
    }
    arrowParts = [
      [shaft, stringMat(0x7a5634)],
      [head, stringMat(0x8e949b)],
      ...vanes.map((v) => [v, stringMat(0xe2d9c4)] as [THREE.BufferGeometry, THREE.Material]),
    ];
  }
  return arrowParts.map(([g, m]) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = false;
    return mesh;
  });
}

export class BowString {
  private readonly top = new THREE.Vector3();
  private readonly bot = new THREE.Vector3();
  /** The string's middle at rest. */
  private readonly rest = new THREE.Vector3();
  private readonly legs: [THREE.Mesh, THREE.Mesh];
  private readonly arrow = new THREE.Group();
  private readonly nock = new THREE.Vector3();
  /** The nock's offset from rest when the fingers let go. */
  private readonly from = new THREE.Vector3();
  private hooked = false;
  /** Seconds since the loose while the string still shivers; -1 once it is still. */
  private shiver = -1;

  /** The drawable string on a held bow, or null when the model has no string. */
  static on(bow: THREE.Object3D): BowString | null {
    const strings: THREE.Mesh[] = [];
    bow.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material) && m.material?.name === 'item:string') strings.push(m);
    });
    return strings.length ? new BowString(bow, strings) : null;
  }

  private constructor(
    /** The bow model the string is on. */
    readonly bow: THREE.Object3D,
    private readonly straight: THREE.Mesh[],
  ) {
    bow.updateMatrixWorld(true);
    const inv = bow.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    for (const m of straight) {
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
    }
    // The front string: a double bow's second one hangs behind it.
    const z = box.max.z - 0.0016;
    const x = (box.min.x + box.max.x) / 2;
    this.top.set(x, box.max.y, z);
    this.bot.set(x, box.min.y, z);
    this.rest.addVectors(this.top, this.bot).multiplyScalar(0.5);
    const mat = straight[0]!.material as THREE.Material;
    this.legs = [new THREE.Mesh(leg(), mat), new THREE.Mesh(leg(), mat)];
    for (const l of this.legs) {
      l.castShadow = false;
      l.visible = false;
      l.name = 'bowstring';
      bow.add(l);
    }
    for (const m of arrowMeshes()) this.arrow.add(m);
    this.arrow.visible = false;
    this.arrow.name = 'nocked-arrow';
    bow.add(this.arrow);
  }

  /**
   * Moves the string on. `hand` is the string hand's grip in world space,
   * `curl` how shut its fingers are (0..1), `acting` whether an action has
   * the body (a stance never draws).
   */
  update(dt: number, hand: THREE.Vector3, curl: number, acting: boolean): void {
    this.bow.updateWorldMatrix(true, false);
    const p = this.bow.worldToLocal(_p.copy(hand));
    if (this.hooked) {
      if (!acting || curl < LET_GO || p.distanceTo(this.rest) > REACH) this.letGo();
    } else if (acting && curl >= HOOK && (nearString(p, this.top, this.bot) < CATCH || this.inDraw(p))) {
      this.hooked = true;
      this.shiver = -1;
    }
    if (this.hooked) {
      this.nock.copy(p);
      // The string bends back, never forward through the bow.
      this.nock.z = Math.min(this.nock.z, this.rest.z);
      this.draw(this.nock, true);
      return;
    }
    if (this.shiver < 0) return;
    this.shiver += dt;
    if (this.shiver >= SHIVER) {
      this.shiver = -1;
      this.straighten();
      return;
    }
    const k = Math.exp(-this.shiver * 24) * Math.cos(this.shiver * 110);
    this.draw(this.nock.copy(this.rest).addScaledVector(this.from, k), false);
  }

  /**
   * Fingers already back where a drawn string would be: behind the string,
   * in the bow's plane and level with the nock. A draw keyed from part way
   * (the hand never stopping at the bow) still takes the string.
   */
  private inDraw(p: THREE.Vector3): boolean {
    const back = this.rest.z - p.z;
    return back > 0 && back < REACH && Math.abs(p.x - this.rest.x) < 0.1 && Math.abs(p.y - this.rest.y) < 0.2;
  }

  /** True while the fingers hold the string. */
  get drawn(): boolean {
    return this.hooked;
  }

  private letGo(): void {
    this.hooked = false;
    this.from.subVectors(this.nock, this.rest).multiplyScalar(-0.06);
    this.shiver = 0;
    this.arrow.visible = false;
  }

  /** The string bent to `at`, the arrow laid on it when `arrow`. */
  private draw(at: THREE.Vector3, arrow: boolean): void {
    for (const m of this.straight) m.visible = false;
    this.place(this.legs[0], at, this.top);
    this.place(this.legs[1], at, this.bot);
    this.arrow.visible = arrow;
    if (arrow) {
      this.arrow.position.copy(at);
      const dir = _q.subVectors(ARROW_REST, at);
      if (dir.lengthSq() > 1e-6) this.arrow.quaternion.setFromUnitVectors(FWD, dir.normalize());
    }
  }

  private place(leg: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    const d = _q.subVectors(b, a);
    const len = d.length();
    leg.visible = len > 1e-4;
    if (!leg.visible) return;
    leg.position.copy(a);
    leg.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
    leg.scale.set(1, len, 1);
  }

  private straighten(): void {
    for (const m of this.straight) m.visible = true;
    for (const l of this.legs) l.visible = false;
    this.arrow.visible = false;
  }

  /** Takes the drawn string and arrow off the bow (the shared geometry stays). */
  dispose(): void {
    for (const l of this.legs) l.removeFromParent();
    this.arrow.removeFromParent();
    this.straighten();
  }
}

/** Distance from `p` to the segment a..b. */
function nearString(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = _q.subVectors(b, a);
  const t = Math.min(1, Math.max(0, ab.dot(new THREE.Vector3().subVectors(p, a)) / ab.lengthSq()));
  return new THREE.Vector3().copy(a).addScaledVector(ab, t).distanceTo(p);
}
