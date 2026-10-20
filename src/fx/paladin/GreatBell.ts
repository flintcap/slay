/**
 * SLAY — The Last Hour's great bell: a tower bell of dark bronze, waist,
 * shoulder, lip and crown, called down on one enemy.
 *
 * It drops out of the dark above its mark (a ring on the floor shows where),
 * gathers speed, and lands mouth down with a crack of dust and a ring of
 * sound thrown across the floor. It stands a moment, then sinks into the
 * stone it broke. Two can be in the air at once; a third call takes the
 * oldest. Built once per scene; nothing is allocated after.
 */
import * as THREE from 'three';
import type { EffectSystem } from '../Effects';
import type { BurstOpts } from '../Particles';
import { floorAt } from '../kit/Floor';

const BELL_BRONZE = 0x7a5a2c;
const DUST = 0x6e604e;
/** Metres above its mark it starts its fall. */
const DROP = 9;
/** Seconds it stands after landing, and sinking after that. */
const STAND = 0.55;
const SINK = 0.6;
/** Its height, mouth to crown, in metres. */
const HEIGHT = 2.1;

/** The bell's profile, mouth (y 0) to shoulder, turned on a lathe. */
function bellGeometry(): THREE.LatheGeometry {
  const pts = [
    [1.0, 0.0], [1.02, 0.06], [0.96, 0.14], [0.86, 0.3], [0.74, 0.62], [0.66, 1.0],
    [0.62, 1.38], [0.6, 1.62], [0.52, 1.8], [0.34, 1.9], [0.0, 1.93],
  ].map(([r, y]) => new THREE.Vector2(r! * 0.95, y!));
  return new THREE.LatheGeometry(pts, 20);
}

function parts(): { group: THREE.Group; mat: THREE.MeshStandardMaterial; geos: THREE.BufferGeometry[] } {
  const mat = new THREE.MeshStandardMaterial({ color: BELL_BRONZE, metalness: 0.9, roughness: 0.42, side: THREE.DoubleSide });
  const bellGeo = bellGeometry();
  const crownGeo = new THREE.TorusGeometry(0.22, 0.07, 6, 12);
  const lipGeo = new THREE.TorusGeometry(0.97, 0.04, 6, 24);
  const bell = new THREE.Mesh(bellGeo, mat);
  const crown = new THREE.Mesh(crownGeo, mat);
  crown.position.y = 2.0;
  const lip = new THREE.Mesh(lipGeo, mat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.05;
  const group = new THREE.Group();
  group.add(bell, crown, lip);
  return { group, mat, geos: [bellGeo, crownGeo, lipGeo] };
}

interface Drop {
  group: THREE.Group;
  /** Seconds since called; the fall's length; 0 fall is a free slot. */
  t: number;
  fall: number;
  x: number;
  z: number;
  floor: number;
  scale: number;
  landed: boolean;
  onLand: (() => void) | null;
  cancelAim: (() => void) | null;
  /** What it hangs over while it falls: it lands on the one it names, wherever that walks. */
  follow: THREE.Object3D | null;
}

const DUST_RING: BurstOpts = { count: 22, scale: 1.4, color: DUST, ring: 1.2 };
const CHIPS: BurstOpts = { count: 18, scale: 1.1, color: 0x8a8478 };

export class GreatBell {
  private readonly root = new THREE.Group();
  private readonly drops: Drop[] = [];
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly geos: THREE.BufferGeometry[];
  private fx: EffectSystem | null = null;

  constructor(scene: THREE.Object3D) {
    const first = parts();
    this.mat = first.mat;
    this.geos = first.geos;
    const a = first.group;
    // A second bell shares the first one's geometry and bronze.
    const b = a.clone();
    for (const g of [a, b]) {
      g.visible = false;
      this.root.add(g);
      this.drops.push({ group: g, t: 0, fall: 0, x: 0, z: 0, floor: 0, scale: 1, landed: false, onLand: null, cancelAim: null, follow: null });
    }
    this.root.name = 'paladin-great-bell';
    scene.add(this.root);
  }

  /**
   * Calls the bell down on (x, z): it lands after `fall` seconds, `size`
   * times its own scale, and runs `onLand` (the blow) on that frame. With
   * `follow` it hangs over that body as it falls (no ring on the floor then:
   * the bell itself is the warning).
   */
  call(fx: EffectSystem, x: number, z: number, fall: number, size = 1, onLand: (() => void) | null = null, follow: THREE.Object3D | null = null): void {
    this.fx = fx;
    let d = this.drops[0]!;
    for (const s of this.drops) {
      if (s.fall <= 0) {
        d = s;
        break;
      }
      if (s.t > d.t) d = s;
    }
    d.cancelAim?.();
    d.t = 0;
    d.fall = Math.max(0.15, fall);
    d.x = x;
    d.z = z;
    d.floor = floorAt(x, z);
    d.scale = size;
    d.landed = false;
    d.onLand = onLand;
    d.follow = follow;
    d.cancelAim = null;
    if (!follow) {
      // Where it will fall, on the floor, for as long as it falls.
      const tell = fx.decals.aim(x, z, 1.1 * size, d.fall, BELL_BRONZE);
      d.cancelAim = () => tell.cancel();
    }
    d.group.visible = true;
    d.group.scale.setScalar(size);
    this.place(d);
  }

  private place(d: Drop): void {
    const u = Math.min(1, d.t / d.fall);
    // Falling: slow at first, then all at once.
    let y = d.floor + DROP * (1 - u * u);
    if (d.landed) {
      const after = d.t - d.fall;
      y = d.floor - (after > STAND ? ((after - STAND) / SINK) * HEIGHT * d.scale : 0);
    }
    d.group.position.set(d.x, y, d.z);
    // A slight swing as it drops; still once it lands.
    d.group.rotation.set(d.landed ? 0 : Math.sin(d.t * 5) * 0.06 * (1 - u), d.t * 0.4, 0);
  }

  update(dt: number): void {
    for (const d of this.drops) {
      if (d.fall <= 0) continue;
      d.t += dt;
      if (!d.landed && d.follow) {
        d.x = d.follow.position.x;
        d.z = d.follow.position.z;
      }
      if (!d.landed && d.t >= d.fall) {
        d.landed = true;
        d.cancelAim = null;
        d.follow = null;
        d.floor = floorAt(d.x, d.z);
        this.land(d);
        const fn = d.onLand;
        d.onLand = null;
        fn?.();
      }
      if (d.landed && d.t >= d.fall + STAND + SINK) {
        d.fall = 0;
        d.group.visible = false;
        continue;
      }
      this.place(d);
    }
  }

  /** The bell meets the floor. */
  private land(d: Drop): void {
    const fx = this.fx;
    if (!fx) return;
    const r = 1.1 * d.scale;
    fx.fx.burst('puff.dust', d.x, d.floor + 0.15, d.z, DUST_RING);
    fx.fx.burst('chips.stone', d.x, d.floor + 0.2, d.z, CHIPS);
    fx.decals.add('crater', d.x, d.z, r * 1.1);
    fx.decals.add('crack', d.x, d.z, r * 1.5, d.t);
    fx.nova(d.x, d.z, r * 3.2, { color: 0xc8963c, duration: 0.6, thickness: 0.08, particles: false });
    fx.nova(d.x, d.z, r * 1.8, { color: DUST, duration: 0.4, thickness: 0.14, particles: false });
    fx.flash(d.x, d.floor + 1.2, d.z, 0xe8c080, 14, 10, 0.22);
  }

  dispose(): void {
    for (const d of this.drops) d.cancelAim?.();
    this.root.removeFromParent();
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
  }

  /** One bell, never shown, for the warmup. */
  static standIn(): THREE.Object3D {
    return parts().group;
  }
}
