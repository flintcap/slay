/**
 * SLAY — Hurl the Censer's censer: a pierced brass bowl with a domed lid and
 * a ring at its crown, coals glowing through it, swung out on its chain.
 *
 * Thrown from the hand on the throw frame, it flies an arc to the enemy with
 * smoke and sparks shed behind it and the chain paid out after it, bursts
 * ash and coals where it lands, and is reeled back to the hand. One censer:
 * a second throw takes it back. Built once per scene; nothing is allocated
 * after.
 */
import * as THREE from 'three';
import type { BurstOpts, FXSystem } from '../Particles';

/** Links drawn along the chain. */
const LINKS = 14;
/** Seconds the chain takes to reel the censer back. */
const REEL = 0.22;
/** Seconds between puffs of smoke in flight. */
const SHED = 0.045;

const BRASS = 0xb08a3c;
const COAL = 0xff8a30;
const CHAIN = 0x2c2620;

/** The body: a squat pierced bowl, a domed lid, a crown ring, the coal light inside. */
function body(): { group: THREE.Group; parts: THREE.Mesh[]; mats: THREE.Material[]; geos: THREE.BufferGeometry[] } {
  const brass = new THREE.MeshStandardMaterial({ color: BRASS, metalness: 0.85, roughness: 0.38 });
  const coal = new THREE.MeshBasicMaterial({ color: COAL, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const bowlGeo = new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55);
  const lidGeo = new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const ringGeo = new THREE.TorusGeometry(0.05, 0.012, 6, 12);
  const glowGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const footGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.05, 10);
  const bowl = new THREE.Mesh(bowlGeo, brass);
  const lid = new THREE.Mesh(lidGeo, brass);
  lid.position.y = 0.03;
  const ring = new THREE.Mesh(ringGeo, brass);
  ring.position.y = 0.21;
  const foot = new THREE.Mesh(footGeo, brass);
  foot.position.y = -0.17;
  const glow = new THREE.Mesh(glowGeo, coal);
  glow.position.y = -0.01;
  const group = new THREE.Group();
  group.add(bowl, lid, ring, foot, glow);
  return { group, parts: [bowl, lid, ring, foot, glow], mats: [brass, coal], geos: [bowlGeo, lidGeo, ringGeo, glowGeo, footGeo] };
}

function chainLine(): { line: THREE.Line; pos: THREE.BufferAttribute; mat: THREE.LineBasicMaterial } {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(LINKS * 3), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  const mat = new THREE.LineBasicMaterial({ color: CHAIN });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return { line, pos, mat };
}

const SMOKE: BurstOpts = { count: 3, scale: 0.7, color: 0x5a5048 };
const SPARK: BurstOpts = { count: 2, scale: 0.6, color: COAL };

export class Censer {
  private readonly root = new THREE.Group();
  private readonly censer: THREE.Group;
  private readonly chain: THREE.Line;
  private readonly links: THREE.BufferAttribute;
  private readonly mats: THREE.Material[];
  private readonly geos: THREE.BufferGeometry[];
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private hand: THREE.Object3D | null = null;
  private fx: FXSystem | null = null;
  /** Seconds since the throw; the flight and the whole show. 0 flight is idle. */
  private t = 0;
  private flight = 0;
  private arc = 1.2;
  private shed = 0;

  constructor(scene: THREE.Object3D) {
    const b = body();
    this.censer = b.group;
    const c = chainLine();
    this.chain = c.line;
    this.links = c.pos;
    this.mats = [...b.mats, c.mat];
    this.geos = [...b.geos, c.line.geometry];
    this.root.name = 'paladin-censer';
    this.root.add(this.censer, this.chain);
    this.root.visible = false;
    scene.add(this.root);
  }

  /**
   * Throws the censer from `from` to `to` over `flight` seconds, arcing
   * `arc` metres above the line. The chain runs back to `hand` (the hero's
   * body) the whole time; `fx` sheds its smoke.
   */
  hurl(from: THREE.Vector3, to: THREE.Vector3, flight: number, hand: THREE.Object3D, fx: FXSystem, arc = 1.2): void {
    this.from.copy(from);
    this.to.copy(to);
    this.flight = Math.max(0.08, flight);
    this.arc = arc;
    this.hand = hand;
    this.fx = fx;
    this.t = 0;
    this.shed = 0;
    this.root.visible = true;
    this.place(0);
  }

  /** Where the censer is `u` of the way along its arc (0..1). */
  private along(u: number, out: THREE.Vector3): THREE.Vector3 {
    out.lerpVectors(this.from, this.to, u);
    out.y += Math.sin(Math.PI * u) * this.arc;
    return out;
  }

  private place(u: number): void {
    const c = this.along(u, this.at);
    this.censer.position.copy(c);
    this.censer.rotation.set(Math.sin(this.t * 14) * 0.35, this.t * 9, Math.cos(this.t * 11) * 0.3);
    // The chain sags from the hand to the crown ring.
    const h = this.hand;
    const hx = h ? h.position.x : this.from.x;
    const hy = h ? h.position.y + 1.3 : this.from.y;
    const hz = h ? h.position.z : this.from.z;
    const ex = c.x;
    const ey = c.y + 0.21;
    const ez = c.z;
    const sag = Math.min(0.6, Math.hypot(ex - hx, ez - hz) * 0.06);
    const a = this.links.array as Float32Array;
    for (let i = 0; i < LINKS; i++) {
      const k = i / (LINKS - 1);
      a[i * 3] = hx + (ex - hx) * k;
      a[i * 3 + 1] = hy + (ey - hy) * k - Math.sin(Math.PI * k) * sag;
      a[i * 3 + 2] = hz + (ez - hz) * k;
    }
    this.links.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.flight <= 0) return;
    this.t += dt;
    const out = this.t <= this.flight;
    // Out along the arc, then reeled back along it to the hand.
    const u = out ? this.t / this.flight : Math.max(0, 1 - (this.t - this.flight) / REEL);
    if (this.hand && !out) this.from.set(this.hand.position.x, this.hand.position.y + 1.3, this.hand.position.z);
    this.place(u);
    if (out && this.fx) {
      this.shed -= dt;
      if (this.shed <= 0) {
        this.shed = SHED;
        this.fx.burst('smoke', this.at.x, this.at.y, this.at.z, SMOKE);
        this.fx.burst('embers', this.at.x, this.at.y, this.at.z, SPARK);
      }
    }
    if (this.t >= this.flight + REEL) {
      this.flight = 0;
      this.root.visible = false;
      this.hand = null;
      this.fx = null;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }

  /** The censer and its chain, never shown, for the warmup. */
  static standIn(): THREE.Object3D {
    const b = body();
    const c = chainLine();
    const g = new THREE.Group();
    g.add(b.group, c.line);
    return g;
  }
}
