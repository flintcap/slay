/**
 * SLAY — small life in the camp: fireflies drifting at the tree line, moths
 * circling the lanterns.
 *
 * A still camp at night reads as a diorama. A few dozen points of light that
 * wander on their own clocks is what makes it read as a place that is alive
 * when you are not looking at it. One instanced mesh, additive, unlit, no
 * shadows; positions are a closed-form function of time, so there is no state
 * to step and nothing to allocate per frame.
 */

import * as THREE from 'three';

interface Mote {
  /** Home position. */
  x: number;
  y: number;
  z: number;
  /** Wander radius and rates. */
  r: number;
  a: number;
  b: number;
  phase: number;
  /** 0 = firefly (slow wander, blinking), 1 = moth (tight orbit, steady). */
  kind: number;
}

function seq(i: number, salt: number): number {
  const v = Math.sin(i * 91.7 + salt * 47.3) * 43758.5453;
  return v - Math.floor(v);
}

export class CampLife {
  readonly root = new THREE.Group();
  private readonly motes: Mote[] = [];
  private readonly mesh: THREE.InstancedMesh;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  /**
   * `lanterns` are light positions moths gather around; fireflies are spread
   * through a ring between `inner` and `outer` metres from the camp centre.
   */
  constructor(lanterns: THREE.Vector3[], inner: number, outer: number, fireflies = 46) {
    this.root.name = 'campLife';
    for (let i = 0; i < fireflies; i++) {
      const ang = seq(i, 1) * Math.PI * 2;
      const d = inner + seq(i, 2) * (outer - inner);
      this.motes.push({
        x: Math.cos(ang) * d,
        y: 0.5 + seq(i, 3) * 1.6,
        z: Math.sin(ang) * d,
        r: 0.8 + seq(i, 4) * 1.6,
        a: 0.15 + seq(i, 5) * 0.25,
        b: 0.11 + seq(i, 6) * 0.2,
        phase: seq(i, 7) * 100,
        kind: 0,
      });
    }
    lanterns.forEach((l, li) => {
      for (let k = 0; k < 3; k++) {
        const i = 1000 + li * 3 + k;
        this.motes.push({
          x: l.x,
          y: l.y,
          z: l.z,
          r: 0.18 + seq(i, 4) * 0.22,
          a: 2.2 + seq(i, 5) * 1.6,
          b: 1.4 + seq(i, 6) * 1.2,
          phase: seq(i, 7) * 100,
          kind: 1,
        });
      }
    });

    this.geo = new THREE.SphereGeometry(0.035, 6, 4);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.motes.length);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i]!;
      // Fireflies are a cool yellow-green and bright enough to bloom; moths
      // are dim and take the lantern's warmth.
      this.c.set(m.kind === 0 ? 0xc8ff6a : 0xffd8a0).multiplyScalar(m.kind === 0 ? 3.2 : 1.1);
      this.mesh.setColorAt(i, this.c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.root.add(this.mesh);
  }

  update(elapsed: number): void {
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i]!;
      const t = elapsed + m.phase;
      let x: number;
      let y: number;
      let z: number;
      let size: number;
      if (m.kind === 0) {
        // Lissajous wander; a slow blink that spends most of its time dark.
        x = m.x + Math.sin(t * m.a) * m.r + Math.sin(t * m.b * 2.3) * 0.3;
        z = m.z + Math.cos(t * m.b) * m.r;
        y = m.y + Math.sin(t * 0.7) * 0.35;
        const blink = Math.max(0, Math.sin(t * 0.9 + m.phase) * 1.6 - 0.6);
        size = blink;
      } else {
        x = m.x + Math.cos(t * m.a) * m.r;
        z = m.z + Math.sin(t * m.a * 1.1) * m.r;
        y = m.y + Math.sin(t * m.b) * 0.12;
        size = 0.8;
      }
      this.p.set(x, y, z);
      this.s.setScalar(size);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
    this.root.clear();
  }
}
