/**
 * SLAY — the Knight's own looks (class id `warden`).
 *
 * The Knight's skills are steel, blood, dust and broken floor, never a
 * glowing sigil (the owner's call for weapon skills). Most of what they draw
 * goes through the shared particle field and floor decals, which already
 * follow the quality ladder. Two things are built here because nothing else
 * draws them:
 *
 *  - `SteelArcs`: the pale smear a wide blade leaves across the floor (Cleave)
 *    and the ring of steel round a spinning Knight (Whirlwind). A small pool
 *    of flat ring sectors, each its own geometry so each can show its own
 *    arc; nothing is allocated after it is built.
 *  - `Standard`: the banner Banner of the Gate plants: pole, crossbar,
 *    finial and a cloth in the class gold, with a scorched line on the
 *    floor where its ring ends.
 *
 * `knightStandIns` gives the scene's warmup one of each, so their shaders are
 * linked behind the loading curtain and not on the first cast.
 */
import * as THREE from 'three';

/** The Knight's gold, and the pale steel of a blade's edge. */
export const KNIGHT_GOLD = 0xd8a640;
export const STEEL = 0xdfe6ee;

const SEGMENTS = 48;

const glowMat = (color: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });

interface Arc {
  edge: THREE.Mesh;
  band: THREE.Mesh;
  edgeMat: THREE.MeshBasicMaterial;
  bandMat: THREE.MeshBasicMaterial;
  group: THREE.Group;
  /** Seconds lived and the whole life; 0 life is a free slot. */
  t: number;
  life: number;
  /** Segments in the full arc. */
  segs: number;
  radius: number;
  /** Follows this body (a spin), or stays where it was cut. */
  follow: THREE.Object3D | null;
  y: number;
  /** Draws out over the first part of its life, the way a blade travels. */
  sweep: number;
  /** Radians a second the ring turns while it lives (the spin). */
  turn: number;
  bright: number;
}

/** A small pool of steel smears. */
export class SteelArcs {
  private readonly arcs: Arc[] = [];
  private readonly root = new THREE.Group();

  constructor(scene: THREE.Object3D, size = 6) {
    this.root.name = 'knight-steel';
    for (let i = 0; i < size; i++) this.arcs.push(this.slot());
    scene.add(this.root);
  }

  private slot(): Arc {
    const edgeGeo = new THREE.RingGeometry(0.93, 1, SEGMENTS, 1);
    edgeGeo.rotateX(-Math.PI / 2);
    const bandGeo = new THREE.RingGeometry(0.55, 0.93, SEGMENTS, 1);
    bandGeo.rotateX(-Math.PI / 2);
    const edgeMat = glowMat(STEEL);
    const bandMat = glowMat(STEEL);
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    const band = new THREE.Mesh(bandGeo, bandMat);
    edge.renderOrder = 4;
    band.renderOrder = 3;
    edge.frustumCulled = false;
    band.frustumCulled = false;
    const group = new THREE.Group();
    group.add(edge, band);
    group.visible = false;
    this.root.add(group);
    return { edge, band, edgeMat, bandMat, group, t: 0, life: 0, segs: SEGMENTS, radius: 1, follow: null, y: 0, sweep: 0, turn: 0, bright: 1 };
  }

  /**
   * Cuts a smear `arc` radians wide, centred on `facing` (radians, the body's
   * yaw), `radius` metres out, at height `y`. A full turn with `follow` is a
   * ring that rides with the body.
   */
  cut(x: number, z: number, facing: number, arc: number, radius: number, opts: { y?: number; life?: number; follow?: THREE.Object3D | null; turn?: number; bright?: number; sweep?: number } = {}): void {
    // A free slot, or else the one nearest its end makes way.
    let a = this.arcs[0]!;
    for (const s of this.arcs) {
      if (s.life <= 0) {
        a = s;
        break;
      }
      if (a.life > 0 && s.t / s.life > a.t / a.life) a = s;
    }
    const full = arc >= Math.PI * 1.99;
    a.segs = Math.max(2, Math.min(SEGMENTS, Math.round((Math.min(arc, Math.PI * 2) / (Math.PI * 2)) * SEGMENTS)));
    a.t = 0;
    a.life = opts.life ?? 0.32;
    a.radius = radius;
    a.follow = opts.follow ?? null;
    a.y = opts.y ?? 0.06;
    a.sweep = opts.sweep ?? (full ? 0 : 0.35);
    a.turn = opts.turn ?? 0;
    a.bright = opts.bright ?? 1;
    a.group.position.set(x, a.y, z);
    // Ring segments start at +x and run counter-clockwise seen from above;
    // turn the start so the arc is centred on the facing.
    const span = (a.segs / SEGMENTS) * Math.PI * 2;
    a.group.rotation.set(0, facing - Math.PI / 2 - span / 2, 0);
    a.group.scale.setScalar(radius);
    a.group.visible = true;
    this.draw(a, 0);
  }

  private draw(a: Arc, k: number): void {
    const shown = a.sweep > 0 ? Math.min(1, k / a.sweep) : 1;
    const count = Math.max(1, Math.round(a.segs * shown)) * 6;
    a.edge.geometry.setDrawRange(0, count);
    a.band.geometry.setDrawRange(0, count);
    // Bright as it lands, gone fast after.
    const fade = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.15) / 0.85) ** 1.6;
    a.edgeMat.opacity = 0.85 * fade * a.bright;
    a.bandMat.opacity = 0.22 * fade * a.bright;
    a.group.scale.setScalar(a.radius * (0.94 + 0.08 * k));
  }

  update(dt: number): void {
    for (const a of this.arcs) {
      if (a.life <= 0) continue;
      a.t += dt;
      if (a.follow) a.group.position.set(a.follow.position.x, a.y, a.follow.position.z);
      if (a.turn) a.group.rotation.y += a.turn * dt;
      const k = a.t / a.life;
      if (k >= 1) {
        a.life = 0;
        a.group.visible = false;
        continue;
      }
      this.draw(a, k);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const a of this.arcs) {
      a.edge.geometry.dispose();
      a.band.geometry.dispose();
      a.edgeMat.dispose();
      a.bandMat.dispose();
    }
    this.arcs.length = 0;
  }
}

// ---------------------------------------------------------------------------
// The standard
// ---------------------------------------------------------------------------

let parts: {
  pole: THREE.CylinderGeometry;
  bar: THREE.CylinderGeometry;
  finial: THREE.ConeGeometry;
  cloth: THREE.PlaneGeometry;
  line: THREE.RingGeometry;
  base: THREE.CylinderGeometry;
} | null = null;

function standardParts(): NonNullable<typeof parts> {
  if (parts) return parts;
  const pole = new THREE.CylinderGeometry(0.035, 0.045, 2.7, 8, 1);
  pole.translate(0, 1.35, 0);
  const bar = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6, 1);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, 2.42, 0);
  const finial = new THREE.ConeGeometry(0.06, 0.24, 6, 1);
  finial.translate(0, 2.82, 0);
  // The cloth hangs from the bar: its top edge at the bar.
  const cloth = new THREE.PlaneGeometry(0.86, 1.3, 4, 6);
  cloth.translate(0, -0.65, 0);
  // Cut a swallowtail out of the bottom edge.
  const pos = cloth.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -1.25) pos.setY(i, y + 0.28 * (1 - Math.abs(pos.getX(i)) / 0.43));
  }
  cloth.computeVertexNormals();
  const line = new THREE.RingGeometry(0.975, 1, 96, 1);
  line.rotateX(-Math.PI / 2);
  const base = new THREE.CylinderGeometry(0.22, 0.3, 0.12, 8, 1);
  base.translate(0, 0.06, 0);
  parts = { pole, bar, finial, cloth, line, base };
  return parts;
}

/** A planted standard and the line of its ring. */
export class Standard {
  readonly group = new THREE.Group();
  private readonly flag = new THREE.Group();
  private readonly iron: THREE.MeshStandardMaterial;
  private readonly clothMat: THREE.MeshStandardMaterial;
  private readonly gold: THREE.MeshStandardMaterial;
  private readonly lineMat: THREE.MeshBasicMaterial;
  private readonly line: THREE.Mesh;
  private t = 0;
  private rise = 0;
  private out = false;
  private fade = 1;

  constructor(scene: THREE.Object3D, x: number, z: number, facing: number, private radius: number) {
    const g = standardParts();
    this.iron = new THREE.MeshStandardMaterial({ color: 0x2b2722, roughness: 0.7, metalness: 0.6, transparent: true });
    this.gold = new THREE.MeshStandardMaterial({ color: KNIGHT_GOLD, roughness: 0.35, metalness: 0.9, emissive: 0x3a2408, emissiveIntensity: 0.6, transparent: true });
    this.clothMat = new THREE.MeshStandardMaterial({
      color: 0xa8741e, roughness: 0.85, metalness: 0, emissive: 0x2a1604, emissiveIntensity: 0.5, side: THREE.DoubleSide, transparent: true,
    });
    this.lineMat = glowMat(KNIGHT_GOLD);
    const pole = new THREE.Mesh(g.pole, this.iron);
    const base = new THREE.Mesh(g.base, this.iron);
    const bar = new THREE.Mesh(g.bar, this.gold);
    const finial = new THREE.Mesh(g.finial, this.gold);
    const cloth = new THREE.Mesh(g.cloth, this.clothMat);
    cloth.position.set(0, 2.42, 0.02);
    this.flag.add(cloth);
    this.line = new THREE.Mesh(g.line, this.lineMat);
    this.line.position.y = 0.03;
    this.line.renderOrder = 3;
    for (const m of [pole, base, bar, finial, cloth]) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
    this.line.frustumCulled = false;
    const stand = new THREE.Group();
    stand.add(pole, base, bar, finial, this.flag);
    stand.rotation.y = facing;
    this.group.add(stand, this.line);
    this.group.position.set(x, 0, z);
    this.group.name = 'knight-standard';
    scene.add(this.group);
    this.update(0);
  }

  /** Lets it sink and fade; `update` reports false once it is gone. */
  lower(): void {
    this.out = true;
  }

  /** False once it has gone. */
  update(dt: number): boolean {
    this.t += dt;
    this.rise = Math.min(1, this.rise + dt / 0.22);
    if (this.out) this.fade = Math.max(0, this.fade - dt * 2.2);
    const up = 1 - (1 - this.rise) ** 3;
    // Driven in from above: it lands, it does not grow.
    const stand = this.group.children[0]!;
    stand.position.y = (1 - up) * 1.2 - (1 - this.fade) * 0.6;
    // A slow wind in the cloth: a sum of sines, no random stream.
    this.flag.rotation.y = 0.12 * Math.sin(this.t * 1.3) + 0.05 * Math.sin(this.t * 3.1);
    this.flag.rotation.x = 0.04 * Math.sin(this.t * 2.2 + 1);
    this.line.scale.set(this.radius * (0.6 + 0.4 * up), 1, this.radius * (0.6 + 0.4 * up));
    this.lineMat.opacity = 0.42 * up * this.fade * (0.9 + 0.1 * Math.sin(this.t * 0.9));
    this.iron.opacity = this.fade;
    this.gold.opacity = this.fade;
    this.clothMat.opacity = this.fade;
    if (this.out && this.fade <= 0) {
      this.dispose();
      return false;
    }
    return true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.iron.dispose();
    this.gold.dispose();
    this.clothMat.dispose();
    this.lineMat.dispose();
  }
}

/**
 * One of each, never shown, for the scene's warmup. Never disposed: a
 * program lives only while some material holds it.
 */
export function knightStandIns(): THREE.Object3D[] {
  const holder = new THREE.Group();
  const arcs = new SteelArcs(holder, 1);
  arcs.cut(0, 0, 0, Math.PI, 1);
  new Standard(holder, 0, 0, 0, 1);
  return [holder];
}
