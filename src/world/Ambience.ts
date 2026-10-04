/**
 * SLAY — level ambience owned by the world: water dripping from the ceiling
 * into the pools below, and the ring each drop leaves.
 *
 * Particles in the air (dust, spores, embers) belong to the FX system. Drips
 * are different: they belong to the *architecture* — they fall from where the
 * ceiling is, land where the floor is, and ring outward on the water that is
 * actually there — so they live with the builder that knows those things.
 *
 * Cost shape: two instanced meshes, a fixed pool of drops recycled around the
 * player, one matrix write per live drop per frame. No lights, no shadows.
 */

import * as THREE from 'three';

export interface DripSite {
  x: number;
  z: number;
  /** Floor (or water surface) height the drop lands on. */
  floor: number;
  /** Where it falls from. */
  top: number;
}

interface Drop {
  site: number;
  /** Seconds into this drop's cycle; negative = waiting to fall. */
  t: number;
  fall: number;
  period: number;
}

const POOL = 28;
const RING_LIFE = 0.9;

/** Deterministic 0..1 sequence; ambience must not touch gameplay RNG. */
function seq(i: number, salt: number): number {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

export class Drips {
  readonly root = new THREE.Group();
  private readonly sites: DripSite[];
  private readonly drops: Drop[] = [];
  private readonly dropMesh: THREE.InstancedMesh;
  private readonly ringMesh: THREE.InstancedMesh;
  private readonly geo: THREE.BufferGeometry[] = [];
  private readonly mat: THREE.Material[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly near: number[] = [];
  private nearTimer = 0;
  private salt = 0;

  constructor(sites: DripSite[], colour: number) {
    this.sites = sites;
    this.root.name = 'drips';

    const dg = new THREE.SphereGeometry(0.035, 6, 4);
    dg.scale(1, 3.2, 1);
    const dm = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colour).lerp(new THREE.Color(0xffffff), 0.6),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const rg = new THREE.RingGeometry(0.82, 1, 24);
    rg.rotateX(-Math.PI / 2);
    const rm = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colour).lerp(new THREE.Color(0xffffff), 0.5),
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.geo.push(dg, rg);
    this.mat.push(dm, rm);
    this.dropMesh = new THREE.InstancedMesh(dg, dm, POOL);
    this.ringMesh = new THREE.InstancedMesh(rg, rm, POOL);
    for (const m of [this.dropMesh, this.ringMesh]) {
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 3;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(m);
    }
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < POOL; i++) {
      this.dropMesh.setMatrixAt(i, zero);
      this.ringMesh.setMatrixAt(i, zero);
      this.drops.push({ site: -1, t: -seq(i, 3) * 3, fall: 1, period: 3 });
    }
  }

  get count(): number {
    return this.sites.length;
  }

  update(dt: number, focus: THREE.Vector3): void {
    if (this.sites.length === 0) return;
    // Refresh the candidate sites near the player a few times a second.
    this.nearTimer -= dt;
    if (this.nearTimer <= 0) {
      this.nearTimer = 0.5;
      this.near.length = 0;
      for (let i = 0; i < this.sites.length; i++) {
        const st = this.sites[i]!;
        const dx = st.x - focus.x;
        const dz = st.z - focus.z;
        if (dx * dx + dz * dz < 26 * 26) this.near.push(i);
      }
    }

    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i]!;
      d.t += dt;
      if (d.site < 0 || d.t > d.fall + RING_LIFE) {
        if (this.near.length === 0) {
          this.hide(i);
          continue;
        }
        // New drop: a nearby site, a pause, then the fall.
        this.salt++;
        d.site = this.near[Math.floor(seq(i, this.salt) * this.near.length)]!;
        const st = this.sites[d.site]!;
        // Free fall from the ceiling: t = sqrt(2h/g).
        d.fall = Math.sqrt((2 * Math.max(0.5, st.top - st.floor)) / 9.8);
        d.t = -seq(i, this.salt + 7) * 2.4;
      }
      const st = this.sites[d.site]!;
      if (d.t < 0) {
        this.hide(i);
        continue;
      }
      if (d.t < d.fall) {
        const y = st.top - 0.5 * 9.8 * d.t * d.t;
        this.q.identity();
        this.p.set(st.x, y, st.z);
        this.s.set(1, 1, 1);
        this.m4.compose(this.p, this.q, this.s);
        this.dropMesh.setMatrixAt(i, this.m4);
        this.ringMesh.setMatrixAt(i, ZERO);
      } else {
        const k = (d.t - d.fall) / RING_LIFE;
        const r = 0.08 + k * 0.55;
        this.q.identity();
        this.p.set(st.x, st.floor + 0.03, st.z);
        // Fade by shrinking the band to nothing rather than per-instance alpha.
        this.s.set(r, 1, r);
        this.m4.compose(this.p, this.q, this.s);
        this.ringMesh.setMatrixAt(i, k < 1 ? this.m4 : ZERO);
        this.dropMesh.setMatrixAt(i, ZERO);
      }
    }
    this.dropMesh.instanceMatrix.needsUpdate = true;
    this.ringMesh.instanceMatrix.needsUpdate = true;
  }

  private hide(i: number): void {
    this.dropMesh.setMatrixAt(i, ZERO);
    this.ringMesh.setMatrixAt(i, ZERO);
  }

  dispose(): void {
    this.dropMesh.dispose();
    this.ringMesh.dispose();
    for (const g of this.geo) g.dispose();
    for (const m of this.mat) m.dispose();
    this.root.clear();
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
