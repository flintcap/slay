/**
 * SLAY — the ring a Paladin's vigil draws at his feet.
 *
 * A thin scorched line on the floor with a faint band of light inside it,
 * and a circle of tallow candles standing on the line, their flames
 * flickering. Each vigil tints it and sets its own number of candles, so two
 * burning at once (Twin Wick) read apart. Quiet on purpose: it is on screen
 * for the whole run, so it never pulses, sparks or throws particles.
 *
 * Built from code: two flat rings and two instanced meshes, a handful of
 * draw calls. The flicker is a sum of sines on time and candle index, so it
 * needs no random stream.
 */
import * as THREE from 'three';

/** How one vigil's ring looks. */
export interface RingLook {
  /** The ring's light, and its flames. */
  tint: number;
  /** Candles standing on the line. */
  candles: number;
  /** Flame height, 1 = a plain tallow flame. */
  flame: number;
  /** How bright the inner band is, 0..1. */
  band: number;
  /** How fast the candles walk round, radians a second (signed). */
  spin: number;
}

let shared: {
  line: THREE.RingGeometry;
  band: THREE.RingGeometry;
  candle: THREE.CylinderGeometry;
  flame: THREE.ConeGeometry;
  wax: THREE.MeshStandardMaterial;
} | null = null;

function geometry(): NonNullable<typeof shared> {
  if (shared) return shared;
  const line = new THREE.RingGeometry(0.965, 1, 96, 1);
  line.rotateX(-Math.PI / 2);
  const band = new THREE.RingGeometry(0.55, 0.965, 96, 1);
  band.rotateX(-Math.PI / 2);
  const candle = new THREE.CylinderGeometry(0.045, 0.06, 0.24, 7, 1);
  candle.translate(0, 0.12, 0);
  const flame = new THREE.ConeGeometry(0.032, 0.13, 6, 1);
  flame.translate(0, 0.065, 0);
  const wax = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.9, metalness: 0, emissive: 0x2a1c08, emissiveIntensity: 0.6 });
  shared = { line, band, candle, flame, wax };
  return shared;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * One ring, never shown, for the scene's warmup: its shaders (lit instanced
 * candles, additive two-sided glows) linked behind the loading curtain, not
 * on the first Vigil cast. Never disposed: a program lives only while some
 * material still holds it, and every real ring frees its own when it goes out.
 */
export function vigilStandIn(): THREE.Object3D {
  const holder = new THREE.Group();
  new VigilRing(holder, { tint: 0xffffff, candles: 3, flame: 1, band: 1, spin: 0 });
  return holder;
}

export class VigilRing {
  readonly group = new THREE.Group();
  /** The scene it was put in; a ring outlives its scene only as garbage. */
  readonly scene: unknown;
  private readonly lineMat: THREE.MeshBasicMaterial;
  private readonly bandMat: THREE.MeshBasicMaterial;
  private readonly flameMat: THREE.MeshBasicMaterial;
  private readonly line: THREE.Mesh;
  private readonly band: THREE.Mesh;
  private readonly candles: THREE.InstancedMesh;
  private readonly flames: THREE.InstancedMesh;
  private t: number;
  /** Fades in when lit, out when put out. */
  private fade = 0;
  private out = false;

  constructor(scene: THREE.Object3D, readonly look: RingLook, phase = 0) {
    const g = geometry();
    this.scene = scene;
    this.t = phase;
    const glow = (opacity: number, color: number): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    this.lineMat = glow(0, look.tint);
    this.bandMat = glow(0, look.tint);
    this.flameMat = glow(0, new THREE.Color(look.tint).lerp(new THREE.Color(0xfff0c0), 0.55).getHex());
    this.line = new THREE.Mesh(g.line, this.lineMat);
    this.band = new THREE.Mesh(g.band, this.bandMat);
    this.line.renderOrder = 3;
    this.band.renderOrder = 2;
    const n = Math.max(3, Math.round(look.candles));
    this.candles = new THREE.InstancedMesh(g.candle, g.wax, n);
    this.flames = new THREE.InstancedMesh(g.flame, this.flameMat, n);
    this.flames.renderOrder = 4;
    for (const m of [this.line, this.band, this.candles, this.flames]) {
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.group.name = 'vigil-ring';
    scene.add(this.group);
  }

  /** Lets it fade out; `update` reports false once it is gone. */
  putOut(): void {
    this.out = true;
  }

  /** Moves it to the hero's feet at `radius`. False once it has faded out. */
  update(dt: number, x: number, y: number, z: number, radius: number): boolean {
    this.t += dt;
    this.fade = this.out ? Math.max(0, this.fade - dt * 2.5) : Math.min(1, this.fade + dt * 2);
    const f = this.fade;
    this.group.position.set(x, y + 0.03, z);
    this.line.scale.set(radius, 1, radius);
    this.band.scale.set(radius, 1, radius);
    // A slow breath, never a pulse: the ring is on screen all run.
    const breath = 0.9 + 0.1 * Math.sin(this.t * 0.9);
    this.lineMat.opacity = 0.55 * f * breath;
    this.bandMat.opacity = 0.09 * this.look.band * f * breath;
    this.flameMat.opacity = 0.9 * f;
    const n = this.candles.count;
    const turn = this.t * this.look.spin;
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2;
      const cx = Math.cos(a) * radius;
      const cz = Math.sin(a) * radius;
      // Burnt down unevenly: each candle its own height.
      const h = 0.75 + 0.35 * Math.abs(Math.sin(i * 2.71 + 0.4));
      _q.identity();
      _s.set(1, h * f, 1);
      _p.set(cx, 0, cz);
      _m.compose(_p, _q, _s);
      this.candles.setMatrixAt(i, _m);
      const flick = 0.82 + 0.14 * Math.sin(this.t * 11 + i * 2.3) + 0.07 * Math.sin(this.t * 23.7 + i * 5.1);
      const lean = 0.12 * Math.sin(this.t * 3.1 + i);
      _q.setFromAxisAngle(_p.set(Math.cos(a + 1.57), 0, Math.sin(a + 1.57)), lean);
      _s.set(f, this.look.flame * flick * f, f);
      _p.set(cx, 0.24 * h * f, cz);
      _m.compose(_p, _q, _s);
      this.flames.setMatrixAt(i, _m);
    }
    this.candles.instanceMatrix.needsUpdate = true;
    this.flames.instanceMatrix.needsUpdate = true;
    if (this.out && f <= 0) {
      this.dispose();
      return false;
    }
    return true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.lineMat.dispose();
    this.bandMat.dispose();
    this.flameMat.dispose();
    this.candles.dispose();
    this.flames.dispose();
  }
}
