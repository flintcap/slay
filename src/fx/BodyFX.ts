/**
 * SLAY — effects that live on bodies.
 *
 * Two jobs, both keyed off the body rather than the clock:
 *
 *  - **Swings.** Every bound hero and creature keeps a short history of where
 *    its weapon's hilt and tip have been. When its animator fires `hit` (the
 *    frame the blow lands), that history becomes a swing ribbon: the smear of
 *    the blade's last tenth of a second, oldest end already fading, kept alive
 *    for a few frames of follow-through. `release` lights a flare at the hand
 *    or mouth that let go. Nothing is drawn on a timer.
 *  - **Status looks.** Tracked bodies are polled a few times a second for what
 *    is running on them and wear it: flames and embers when burning, rime and
 *    a cold sheen when chilled, an ice shell when frozen, crawling arcs when
 *    shocked, green drips when poisoned, blood when bleeding, stars when
 *    stunned, falling dark motes when cursed.
 *
 * Every record is pooled. A frame allocates nothing.
 */

import * as THREE from 'three';
import { Random } from '../core/RNG';
import type { StatusTag } from '../data/statuses';
import { getStatus, STATUSES } from '../data/statuses';
import type { EffectSystem, School } from './Effects';
import { ELEMENTS } from './Effects';
import type { SlotHandle } from './kit/Instanced';
import type { RibbonHandle } from './kit/Ribbons';
import type { LightHandle } from './kit/Lights';
import { CORE_STYLE, SHELL_STYLE } from './kit/Shapes';
import { RAMPS } from './kit/Palette';

// ---------------------------------------------------------------------------
// Status looks
// ---------------------------------------------------------------------------

/** The looks a body can wear, as bits. */
export const LOOK = {
  burning: 1,
  chilled: 2,
  frozen: 4,
  shocked: 8,
  poisoned: 16,
  bleeding: 32,
  stunned: 64,
  cursed: 128,
} as const;
export type StatusLook = keyof typeof LOOK;

const _bitsById = new Map<string, number>();

/** The look bits one status id stands for (cached). */
export function lookBitsOf(id: string): number {
  let b = _bitsById.get(id);
  if (b !== undefined) return b;
  b = 0;
  const def = getStatus(id);
  if (def) {
    const tags = def.tags as readonly StatusTag[];
    const has = (t: StatusTag): boolean => tags.includes(t);
    if (id === 'frozen' || id === 'petrified') b |= LOOK.frozen;
    else if (has('cold')) b |= LOOK.chilled;
    if (id === 'stunned' || id === 'knockedDown' || id === 'confused') b |= LOOK.stunned;
    if (has('fire') && (has('dot') || def.dot?.type === 'fire')) b |= LOOK.burning;
    if (has('lightning')) b |= LOOK.shocked;
    if (has('poison')) b |= LOOK.poisoned;
    if (def.dot?.type === 'physical') b |= LOOK.bleeding;
    if (has('curse') && def.polarity < 0) b |= LOOK.cursed;
  }
  _bitsById.set(id, b);
  return b;
}

/** Something whose running statuses can be listed by id. */
export interface StatusList {
  list(): ReadonlyArray<{ id: string }>;
}

/** Something that answers status questions one id at a time (Enemy). */
export interface StatusQuery {
  hasStatus(id: string): boolean;
  readonly isBleeding: boolean;
}

/** Ids worth asking a `StatusQuery` about: every id that has a look. */
let _lookIds: string[] | null = null;
function lookIds(): string[] {
  if (!_lookIds) _lookIds = STATUSES.map((s) => s.id).filter((id) => lookBitsOf(id) !== 0);
  return _lookIds;
}

/** The look bits of a status list (the hero's container). */
export function looksOfList(src: StatusList): number {
  let b = 0;
  const l = src.list();
  for (let i = 0; i < l.length; i++) b |= lookBitsOf(l[i]!.id);
  return b;
}

/** The look bits of a body that can only be asked one id at a time. */
export function looksOfQuery(src: StatusQuery): number {
  let b = src.isBleeding ? LOOK.bleeding : 0;
  const list = lookIds();
  for (let i = 0; i < list.length; i++) if (src.hasStatus(list[i]!)) b |= lookBitsOf(list[i]!);
  return b;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

const POLL = 0.16;
const N_LOOKS = 8;
/** History samples per actor (a sixth of a second at 60 Hz). */
const H = 10;
/** Seconds of history a swing replays. */
const SWING_BACK = 0.13;
/** Seconds of follow-through a swing keeps drawing after the hit. */
const SWING_AFTER = 0.07;

class Body {
  active = false;
  obj: THREE.Object3D | null = null;
  poll: (() => number) | null = null;
  lab = 0;
  mask = 0;
  height = 1.8;
  radius = 0.45;
  lit = false;
  pollAcc = 0;
  readonly acc = new Float32Array(N_LOOKS);
  shell: SlotHandle | null = null;
  shellStyle = -1;
  light: LightHandle | null = null;
  readonly stars: Array<SlotHandle | null> = [null, null, null];

  reset(): void {
    this.obj = null;
    this.poll = null;
    this.lab = 0;
    this.mask = 0;
    this.height = 1.8;
    this.radius = 0.45;
    this.lit = false;
    this.pollAcc = 0;
    this.acc.fill(0);
    this.shell = null;
    this.shellStyle = -1;
    this.light = null;
    this.stars[0] = this.stars[1] = this.stars[2] = null;
  }
}

/** What an actor's weapon edge comes from. */
const enum Edge {
  /** A held item node: hilt and tip along its +Y. */
  Held,
  /** Two sockets: a hand (hilt) and the weapon tip. */
  Sockets,
  /** No usable edge; events still light releases. */
  None,
}

class Actor {
  active = false;
  gen = 0;
  root: THREE.Object3D | null = null;
  edge = Edge.None;
  /** Held: the `hold:mainHand` node. Sockets: the hand. */
  a: THREE.Object3D | null = null;
  /** Sockets: the weapon tip. */
  b: THREE.Object3D | null = null;
  /** Held: grip-to-tip length along +Y; the hilt edge sits partway up. */
  len = 0.9;
  hilt = 0.3;
  hero = false;
  school: (() => School) | null = null;
  /** Release flares come from here when set (hero cast sockets). */
  castL: THREE.Object3D | null = null;
  castR: THREE.Object3D | null = null;
  castHands: (() => 'left' | 'right' | 'both' | null) | null = null;
  readonly hist = new Float32Array(H * 7);
  head = 0;
  count = 0;
  rib: RibbonHandle | null = null;
  after = 0;
  unsub: Array<() => void> = [];
}

class LabSwing {
  active = false;
  x = 0;
  z = 0;
  yaw = 0;
  t = 0;
  rib: RibbonHandle | null = null;
}

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _box = new THREE.Box3();
const STEEL = 0xc9d2de;
const STAR = 0xffd870;
const CURSE = 0x7a34d8;

/** How a weapon swing of each school is coloured: steel for plain blows. */
function swingColor(s: School): number | undefined {
  return s === 'physical' ? STEEL : s === 'bone' ? 0xe8dcc0 : undefined;
}

export class BodyFX {
  private effects: EffectSystem;
  private rng = new Random(0xb0d1e5);
  private bodies: Body[] = [];
  private freeBodies: Body[] = [];
  private byObj = new Map<THREE.Object3D, Body>();
  private actors: Actor[] = [];
  private freeActors: Actor[] = [];
  private labs: LabSwing[] = [];
  private clock = 0;
  /** The body being worn this call: centre and spread for random points. */
  private cx = 0;
  private cz = 0;
  private cr = 0;
  private ca = 0;
  private cd = 0;

  constructor(effects: EffectSystem) {
    this.effects = effects;
    for (let i = 0; i < 24; i++) this.freeBodies.push(new Body());
    for (let i = 0; i < 16; i++) this.freeActors.push(new Actor());
    for (let i = 0; i < 8; i++) this.labs.push(new LabSwing());
  }

  // -- status looks -----------------------------------------------------------

  /**
   * Starts wearing status looks on `obj` (its origin at the feet). `looks` is
   * polled a few times a second for the bits to show. `lit` bodies may hold a
   * light while burning (the hero, a boss); the light pool is small.
   */
  track(obj: THREE.Object3D, looks: (() => number) | null, opts: { height?: number; radius?: number; lit?: boolean } = {}): void {
    let b = this.byObj.get(obj);
    if (!b) {
      b = this.freeBodies.pop() ?? new Body();
      b.reset();
      b.active = true;
      b.obj = obj;
      this.bodies.push(b);
      this.byObj.set(obj, b);
    }
    b.poll = looks;
    b.height = opts.height ?? 1.8;
    b.radius = opts.radius ?? 0.45;
    b.lit = opts.lit ?? false;
    b.pollAcc = this.rng.next() * POLL;
  }

  /** Tracks an `Enemy`-like body: statuses are asked one id at a time. */
  trackQuery(obj: THREE.Object3D, src: StatusQuery, opts: { height?: number; radius?: number; lit?: boolean } = {}): void {
    this.track(obj, () => looksOfQuery(src), opts);
  }

  /** Tracks a body with a status container (the hero). */
  trackList(obj: THREE.Object3D, src: StatusList, opts: { height?: number; radius?: number; lit?: boolean } = {}): void {
    this.track(obj, () => looksOfList(src), opts);
  }

  untrack(obj: THREE.Object3D): void {
    const b = this.byObj.get(obj);
    if (!b) return;
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.dropBody(i);
  }

  /** Lab: wear a look on a stand-in body without any statuses behind it. */
  labStatus(obj: THREE.Object3D, look: StatusLook): void {
    this.track(obj, null, { height: 1.7, radius: 0.42, lit: true });
    const b = this.byObj.get(obj)!;
    b.lab |= LOOK[look];
    b.mask = b.lab;
  }

  private dropBody(i: number): void {
    const b = this.bodies[i]!;
    this.setShell(b, -1, 0, 0, 0, 0);
    this.setStars(b, false);
    if (b.light) this.effects.lights.release(b.light, 0.2);
    if (b.obj) this.byObj.delete(b.obj);
    b.active = false;
    b.reset();
    const last = this.bodies.pop()!;
    if (last !== b) this.bodies[i] = last;
    this.freeBodies.push(b);
  }

  private setShell(b: Body, style: number, x: number, y: number, z: number, power: number, radius = 0, squash = 1, school: School = 'cold', color?: number): void {
    const shells = this.effects.shells;
    if (style < 0) {
      if (b.shell) shells.free(b.shell);
      b.shell = null;
      b.shellStyle = -1;
      return;
    }
    if (!b.shell || !shells.ok(b.shell)) {
      b.shell = shells.alloc();
      b.shellStyle = -1;
      if (!b.shell) return;
    }
    if (b.shellStyle !== style) {
      const l = this.effects.lookFor(school, color);
      shells.set(b.shell, 2, l.core, l.body, l.tail, l.glow * (style === SHELL_STYLE.ice ? 0.32 : 0.6));
      shells.set(b.shell, 3, style, 0, this.rng.next(), 0);
      b.shellStyle = style;
    }
    shells.set(b.shell, 0, x, y, z, radius);
    shells.set(b.shell, 1, squash, 0, 0, 0);
    shells.put(b.shell, 3, 1, power);
  }

  private setStars(b: Body, on: boolean): void {
    const cores = this.effects.cores;
    for (let i = 0; i < 3; i++) {
      const h = b.stars[i]!;
      if (on && !h) {
        const n = cores.alloc();
        b.stars[i] = n;
        if (n) {
          const l = this.effects.lookFor('lightning', STAR);
          cores.set(n, 2, l.core, l.body, l.tail, l.glow * 0.9);
          cores.set(n, 3, CORE_STYLE.flare, 1, this.rng.next(), 0);
          cores.set(n, 1, 0, 1, 0, 0);
        }
      } else if (!on && h) {
        cores.free(h);
        b.stars[i] = null;
      }
    }
  }

  private wear(b: Body, dt: number): void {
    const obj = b.obj!;
    const fx = this.effects.fx;
    const rng = this.rng;
    const m = b.mask;
    obj.getWorldPosition(_v);
    const x = _v.x;
    const y = _v.y;
    const z = _v.z;
    const h = b.height;
    const r = b.radius;
    const shown = obj.visible;
    const acc = b.acc;
    for (let i = 0; i < N_LOOKS; i++) acc[i]! += dt;

    // Shells: frozen beats chilled beats cursed.
    if (shown && m & LOOK.frozen) {
      const rr = r * 1.15;
      this.setShell(b, SHELL_STYLE.ice, x, y + h * 0.48, z, 0.8, rr, (h * 0.58) / rr, 'cold');
    } else if (shown && m & LOOK.chilled) {
      this.setShell(b, SHELL_STYLE.aura, x, y, z, 0.35, r * 1.2, h / (r * 1.2), 'cold');
    } else if (shown && m & LOOK.cursed) {
      this.setShell(b, SHELL_STYLE.aura, x, y, z, 0.32, r * 1.25, h / (r * 1.25), 'arcane', CURSE);
    } else if (b.shell) {
      this.setShell(b, -1, 0, 0, 0, 0);
    }

    // Stars over a stunned head.
    const stunned = shown && (m & LOOK.stunned) !== 0;
    this.setStars(b, stunned);
    if (stunned) {
      const cores = this.effects.cores;
      for (let i = 0; i < 3; i++) {
        const s = b.stars[i];
        if (!s) continue;
        const a = this.clock * 4.2 + (i * Math.PI * 2) / 3;
        cores.set(s, 0, x + Math.cos(a) * r * 0.75, y + h + 0.18 + Math.sin(a * 2) * 0.04, z + Math.sin(a) * r * 0.75, 0.13);
      }
    }

    // A burning hero or boss lights the room around them.
    const wantLight = shown && b.lit && (m & LOOK.burning) !== 0;
    if (wantLight && !b.light) b.light = this.effects.lights.hold(x, y + h * 0.6, z, RAMPS.fire.light, 3.2, 4.5, 0.45);
    else if (!wantLight && b.light) {
      this.effects.lights.release(b.light, 0.25);
      b.light = null;
    }
    if (b.light) this.effects.lights.move(b.light, x, y + h * 0.6, z);

    if (!shown) return;
    this.cx = x;
    this.cz = z;
    this.cr = r;

    if (m & LOOK.burning && acc[0]! > 0.09) {
      acc[0] = 0;
      fx.burst('status.burn', this.px(), y + rng.range(0.15, h * 0.8), this.pz());
    }
    if (m & (LOOK.chilled | LOOK.frozen) && acc[1]! > (m & LOOK.frozen ? 0.4 : 0.18)) {
      acc[1] = 0;
      fx.burst('status.chill', this.px(), y + rng.range(0.2, h * 0.9), this.pz());
    }
    if (m & LOOK.shocked && acc[3]! > 0) {
      acc[3] = -rng.range(0.1, 0.28);
      this.arc(x, y, z, h, r);
    }
    if (m & LOOK.poisoned && acc[4]! > 0.2) {
      acc[4] = 0;
      fx.burst('status.poison', this.px(), y + rng.range(0.4, h * 0.9), this.pz());
    }
    if (m & LOOK.bleeding) {
      if (acc[5]! > 0.25) {
        acc[5] = 0;
        fx.burst('status.bleed', this.px(), y + rng.range(0.6, h * 0.8), this.pz());
      }
      if (acc[6]! > 0.9) {
        acc[6] = 0;
        this.effects.decals.add('blood', this.px(), this.pz(), rng.range(0.12, 0.2), rng.next() * 6.28);
      }
    }
    if (m & LOOK.cursed && acc[7]! > 0.22) {
      acc[7] = 0;
      fx.burst('status.curse', this.px(), y + h + rng.range(-0.1, 0.25), this.pz());
    }
  }

  /**
   * A point on the body's skin, not inside it (the mesh would hide it): `px`
   * picks a fresh angle and returns x, `pz` returns z for the same angle.
   * Call them in that order, as argument lists do.
   */
  private px(): number {
    this.ca = this.rng.next() * Math.PI * 2;
    this.cd = this.cr * this.rng.range(1.05, 1.35);
    return this.cx + Math.cos(this.ca) * this.cd;
  }

  private pz(): number {
    return this.cz + Math.sin(this.ca) * this.cd;
  }

  /** A short crawling arc between two points on a body. */
  private arc(x: number, y: number, z: number, h: number, r: number): void {
    const rng = this.rng;
    const rb = this.effects.ribbons;
    const rib = rb.start('bolt', { school: 'lightning', life: 0.09, width: 0.07, emit: 1.1 });
    const a0 = rng.next() * Math.PI * 2;
    const a1 = a0 + rng.range(1.2, 2.6);
    const y0 = y + rng.range(0.2, h * 0.9);
    const y1 = y + rng.range(0.2, h * 0.9);
    for (let i = 0; i <= 4; i++) {
      const k = i / 4;
      const a = a0 + (a1 - a0) * k;
      const j = i === 0 || i === 4 ? 0 : 0.12;
      rb.pushPoint(rib, x + Math.cos(a) * r * 1.05 + rng.range(-j, j), y0 + (y1 - y0) * k + rng.range(-j, j), z + Math.sin(a) * r * 1.05 + rng.range(-j, j));
    }
    rb.retire(rib);
    if (rng.next() < 0.6) this.effects.fx.burst('status.shock', x + Math.cos(a1) * r, y1, z + Math.sin(a1) * r);
  }

  // -- swings ------------------------------------------------------------------

  private takeActor(root: THREE.Object3D, school: () => School): Actor {
    const a = this.freeActors.pop() ?? new Actor();
    a.active = true;
    a.gen = (a.gen + 1) | 0;
    a.root = root;
    a.school = school;
    a.edge = Edge.None;
    a.a = a.b = null;
    a.castL = a.castR = null;
    a.castHands = null;
    a.hero = false;
    a.head = a.count = 0;
    a.rib = null;
    a.after = 0;
    a.unsub.length = 0;
    this.actors.push(a);
    return a;
  }

  private dropActor(a: Actor): void {
    for (const u of a.unsub) u();
    a.unsub.length = 0;
    if (a.rib) this.effects.ribbons.retire(a.rib);
    a.rib = null;
    a.active = false;
    a.gen = (a.gen + 1) | 0;
    a.root = a.a = a.b = a.castL = a.castR = null;
    a.school = null;
    a.castHands = null;
    const i = this.actors.indexOf(a);
    if (i >= 0) {
      const last = this.actors.pop()!;
      if (last !== a) this.actors[i] = last;
    }
    this.freeActors.push(a);
  }

  /**
   * Binds the hero: swing ribbons from whatever the main hand holds, on the
   * animator's `hit` frame, and a hand flare on `release`. Returns the unbind.
   */
  bindHero(
    hero: {
      root: THREE.Object3D;
      animator: { on(ev: 'hit' | 'release', fn: (e: { clip: string; side?: 'L' | 'R' }) => void): () => void; readonly castHands: 'left' | 'right' | 'both' | null };
    },
    school: () => School,
  ): () => void {
    const a = this.takeActor(hero.root, school);
    a.hero = true;
    a.edge = Edge.Held;
    a.castL = hero.root.getObjectByName('socket:castL') ?? null;
    a.castR = hero.root.getObjectByName('socket:castR') ?? null;
    const anim = hero.animator;
    a.castHands = () => anim.castHands;
    const gen = a.gen;
    a.unsub.push(anim.on('hit', () => this.onHit(a, gen)));
    a.unsub.push(anim.on('release', () => this.onRelease(a, gen)));
    return () => {
      if (a.gen === gen && a.active) this.dropActor(a);
    };
  }

  /**
   * Binds a creature: a swing ribbon from hand to weapon tip on `hit` when it
   * has both, and a flare at the tip or mouth on `release`. Returns the unbind.
   */
  bindCreature(
    root: THREE.Object3D,
    rig: { on(ev: 'hit' | 'release', fn: (e: { clip?: string; side?: 'L' | 'R' }) => void): () => void } | null | undefined,
    school: () => School,
  ): () => void {
    if (!rig) return () => {};
    const a = this.takeActor(root, school);
    const tip = root.getObjectByName('socket:weapon') ?? null;
    const handR = root.getObjectByName('socket:handR') ?? null;
    const handL = root.getObjectByName('socket:handL') ?? null;
    a.b = tip ?? root.getObjectByName('socket:mouth') ?? null;
    if (tip && (handR || handL)) {
      root.updateWorldMatrix(true, true);
      const scale = root.getWorldScale(_v).y;
      _b.setFromMatrixPosition(tip.matrixWorld);
      const dR = handR ? _a.setFromMatrixPosition(handR.matrixWorld).distanceTo(_b) : Infinity;
      const dL = handL ? _a.setFromMatrixPosition(handL.matrixWorld).distanceTo(_b) : Infinity;
      const hand = dR <= dL ? handR : handL;
      const d = Math.min(dR, dL);
      if (d > 0.22 * scale && d < 2.8 * scale) {
        a.edge = Edge.Sockets;
        a.a = hand;
      }
    }
    const gen = a.gen;
    a.unsub.push(rig.on('hit', () => this.onHit(a, gen)));
    a.unsub.push(rig.on('release', () => this.onRelease(a, gen)));
    return () => {
      if (a.gen === gen && a.active) this.dropActor(a);
    };
  }

  /** Finds the hero's held node again (the hand is re-dressed now and then). */
  private refreshHeld(a: Actor): void {
    const root = a.root!;
    if (a.a && a.a.parent) return;
    a.a = root.getObjectByName('hold:mainHand') ?? null;
    if (!a.a) return;
    // Measure the held thing along the grip once: hilt and tip of its edge.
    let maxY = 0.35;
    let minY = 0;
    const node = a.a;
    node.updateWorldMatrix(true, true);
    _inv.copy(node.matrixWorld).invert();
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      _box.copy(mesh.geometry.boundingBox!).applyMatrix4(_m.multiplyMatrices(_inv, mesh.matrixWorld));
      maxY = Math.max(maxY, _box.max.y);
      minY = Math.min(minY, _box.min.y);
    });
    a.len = Math.min(2.2, maxY);
    a.hilt = Math.max(0.12, Math.min(a.len * 0.35, 0.4));
    void minY;
  }

  /** Writes the actor's current hilt and tip into _a and _b; false if it has none. */
  private edgeOf(a: Actor): boolean {
    if (a.edge === Edge.Held) {
      this.refreshHeld(a);
      const n = a.a;
      if (!n || !n.visible) return false;
      _a.set(0, a.hilt, 0).applyMatrix4(n.matrixWorld);
      _b.set(0, a.len * 1.04, 0).applyMatrix4(n.matrixWorld);
      return true;
    }
    if (a.edge === Edge.Sockets && a.a && a.b) {
      _b.setFromMatrixPosition(a.b.matrixWorld);
      _a.setFromMatrixPosition(a.a.matrixWorld);
      // The hilt edge sits a third of the way out, so the smear is the blade.
      _a.lerp(_b, 0.3);
      return true;
    }
    return false;
  }

  private sample(a: Actor): void {
    if (!this.edgeOf(a)) {
      a.count = 0;
      return;
    }
    const o = a.head * 7;
    const hs = a.hist;
    hs[o] = _a.x; hs[o + 1] = _a.y; hs[o + 2] = _a.z;
    hs[o + 3] = _b.x; hs[o + 4] = _b.y; hs[o + 5] = _b.z;
    hs[o + 6] = this.clock;
    a.head = (a.head + 1) % H;
    if (a.count < H) a.count++;
  }

  private onHit(a: Actor, gen: number): void {
    if (a.gen !== gen || !a.active || a.edge === Edge.None) return;
    if (a.root && !a.root.visible) return;
    const s = a.school?.() ?? 'physical';
    const rb = this.effects.ribbons;
    if (a.rib) rb.retire(a.rib);
    a.rib = rb.start('swing', {
      school: s,
      color: swingColor(s),
      life: a.hero ? 0.17 : 0.14,
      emit: a.hero ? (s === 'physical' ? 0.75 : 1) : 0.55,
    });
    // Replay the blade's recent path, oldest first, back-dated so it tapers.
    const hs = a.hist;
    for (let k = a.count - 1; k >= 0; k--) {
      const o = ((a.head - 1 - k + H * 2) % H) * 7;
      const age = this.clock - hs[o + 6]!;
      if (age > SWING_BACK) continue;
      rb.pushEdges(a.rib, hs[o]!, hs[o + 1]!, hs[o + 2]!, hs[o + 3]!, hs[o + 4]!, hs[o + 5]!, age);
    }
    if (this.edgeOf(a)) {
      rb.pushEdges(a.rib, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
      // A glint where the edge is at the moment of the blow.
      if (a.hero) this.effects.fx.burst(s === 'physical' ? 'sparks' : ELEMENTS[s].shedEmitter, _b.x, _b.y, _b.z, { count: 3, scale: 0.55 });
    }
    a.after = SWING_AFTER;
  }

  private onRelease(a: Actor, gen: number): void {
    if (a.gen !== gen || !a.active) return;
    if (a.root && !a.root.visible) return;
    const s = a.school?.() ?? 'arcane';
    let src: THREE.Object3D | null = null;
    if (a.hero) {
      const hands = a.castHands?.() ?? 'right';
      src = hands === 'left' ? a.castL : a.castR;
      if (!src && a.a) src = a.a;
    } else src = a.b;
    if (!src) return;
    src.updateWorldMatrix(true, false);
    _v.setFromMatrixPosition(src.matrixWorld);
    this.effects.castFlare(s, _v.x, _v.y, _v.z, { scale: a.hero ? 0.7 : 0.55, light: a.hero ? 0.6 : 0.4 });
  }

  /** Lab: a hero-sized swing at (x, z) facing `yaw`, sweeping over 0.15 s. */
  labSwing(x: number, z: number, school: School, yaw: number): void {
    const l = this.labs.find((q) => !q.active);
    if (!l) return;
    l.active = true;
    l.x = x;
    l.z = z;
    l.yaw = yaw;
    l.t = 0;
    l.rib = this.effects.ribbons.start('swing', { school, color: swingColor(school), life: 0.17, emit: school === 'physical' ? 0.75 : 1 });
  }

  private upLab(l: LabSwing, dt: number): void {
    l.t += dt;
    const k = Math.min(1, l.t / 0.15);
    // A right-to-left diagonal cut: high on the right, low across the front.
    const a = l.yaw + 1.4 - k * 2.8;
    const cy = 1.25 - (k - 0.5) * 0.5;
    const fx = Math.sin(a);
    const fz = Math.cos(a);
    this.effects.ribbons.pushEdges(l.rib, l.x + fx * 0.4, cy - 0.1, l.z + fz * 0.4, l.x + fx * 1.45, cy + 0.15 - k * 0.3, l.z + fz * 1.45);
    if (k >= 1) {
      this.effects.ribbons.retire(l.rib);
      l.rib = null;
      l.active = false;
    }
  }

  // -- frame ------------------------------------------------------------------

  update(dt: number, camera?: THREE.Camera | null): void {
    void camera;
    this.clock += dt;
    for (const l of this.labs) if (l.active) this.upLab(l, dt);

    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i]!;
      this.sample(a);
      if (a.after > 0) {
        a.after -= dt;
        if (this.edgeOf(a)) this.effects.ribbons.pushEdges(a.rib, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
        if (a.after <= 0) {
          this.effects.ribbons.retire(a.rib);
          a.rib = null;
        }
      }
    }

    for (let i = 0; i < this.bodies.length; ) {
      const b = this.bodies[i]!;
      // A body taken out of the scene stops wearing anything.
      if (!b.obj || !b.obj.parent) {
        this.dropBody(i);
        continue;
      }
      if (b.poll) {
        b.pollAcc += dt;
        if (b.pollAcc >= POLL) {
          b.pollAcc = 0;
          b.mask = b.poll() | b.lab;
        }
      }
      if (b.mask === 0 && !b.shell && !b.light && !b.stars[0]) {
        i++;
        continue;
      }
      this.wear(b, dt);
      i++;
    }
  }

  /** Lets go of every body and actor (level teardown). */
  clear(): void {
    while (this.bodies.length) this.dropBody(this.bodies.length - 1);
    while (this.actors.length) this.dropActor(this.actors[this.actors.length - 1]!);
    for (const l of this.labs) {
      if (l.rib) this.effects.ribbons.retire(l.rib);
      l.rib = null;
      l.active = false;
    }
  }

  /** Live counts, for checks. */
  get counts(): { bodies: number; actors: number } {
    return { bodies: this.bodies.length, actors: this.actors.length };
  }
}
