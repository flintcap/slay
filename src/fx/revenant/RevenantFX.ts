/**
 * SLAY: the Revenant's own looks, the ones his effect families do not draw.
 *
 *  - Bone Storm: bone shards orbit him for the storm's whole life, each on its
 *    own ring and height, tumbling as they go. They fly out from him when it
 *    starts and scatter to the floor when it ends (`storm`).
 *  - Bone Cage: real ribs burst up round the ring, curl in over it, stand for
 *    exactly as long as the root, and sink back (`cage`).
 *  - Gravewalk and Soul Cage: skeletal hands claw up out of the floor round
 *    where he rises and under each enemy held, curled toward what they hold,
 *    shuddering while they grip (`grasp`, `hold`).
 *  - Soul Tether: a chain of dark iron sags from one bound enemy to the next,
 *    link by link, and closes up round the rest when one dies (`tether`).
 *  - Revenant Form: three skulls circle his head for as long as he is dead,
 *    inside a pale shroud (`form`).
 *
 * The Hunting Skull's skull is the projectile's own `skull` body
 * (`EffectSystem.projectile`). Everything here is a lit solid from the shared
 * pool (`fx/kit/Solids.ts`: `spear`, `rib`, `claw`, `link`, `skull`), one draw
 * call per shape, and the pool's warm-up stand-ins (`EffectSystem.standIns`,
 * already in `DungeonScene.warmup`) link their shaders before the first cast.
 * Nothing here allocates after the cast: each look takes its handles once and
 * writes them each frame. Counts follow the quality ladder (`fxScale`). There
 * are no dice: pieces are spread by index on the golden ratio.
 */
import * as THREE from 'three';
import { ELEMENTS, type EffectHandle, type EffectSystem, type School } from '../Effects';
import type { SolidHandle } from '../kit/Solids';
import { floorAt } from '../kit/Floor';

/** What a look may follow or hold: its body, whether it lives, how wide it is. */
export interface RevenantBody {
  readonly root: THREE.Object3D;
  readonly life: number;
  readonly hitRadius: number;
}

const TAU = Math.PI * 2;
/** Seconds a storm's shards take to scatter when it ends. */
const STORM_OUT = 0.45;
/** Seconds a form's skulls take to leave. */
const FORM_OUT = 0.35;

/** An even, stable scatter by index (the golden ratio), with no dice. */
function spread(i: number, seed: number): number {
  const v = (i * 0.6180339887 + seed) % 1;
  return v < 0 ? v + 1 : v;
}

/** Out past 1 and back: a thing bursting up out of the floor. */
function burstOut(x: number): number {
  const c1 = 1.70158;
  const u = x - 1;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
}

interface Storm {
  follow: THREE.Object3D;
  shards: Array<SolidHandle | null>;
  ring: Float32Array;
  high: Float32Array;
  turn: Float32Array;
  phase: Float32Array;
  size: Float32Array;
  t: number;
  /** Seconds since it was told to stop, or -1 while it storms. */
  out: number;
  acc: number;
  pick: number;
  over: boolean;
}

interface Piece {
  h: SolidHandle | null;
  x: number;
  z: number;
  gy: number;
  roll: number;
  size: number;
  delay: number;
  /** Rises under this body and follows it, or null where it stands. */
  on: RevenantBody | null;
  ox: number;
  oz: number;
  /** True once its burst out of the floor has been drawn. */
  broke: boolean;
}

interface Rise {
  pieces: Piece[];
  t: number;
  /** Seconds each piece takes to rise, and stands before it sinks, and takes to sink. */
  up: number;
  hold: number;
  down: number;
  /** Ribs are thinner than they are tall; hands are as wide as they are tall. */
  girth: number;
  /** The hands shudder as they grip. */
  shudder: number;
  /** Ends early when this one dies (Soul Cage), or null. */
  holder: RevenantBody | null;
  chips: string;
  over: boolean;
}

interface Chain {
  order: RevenantBody[];
  alive: RevenantBody[];
  links: Array<SolidHandle | null>;
  left: number;
  t: number;
  acc: number;
  pick: number;
  used: number;
  shed: string;
  color: number;
  over: boolean;
}

interface Form {
  follow: THREE.Object3D;
  skulls: Array<SolidHandle | null>;
  alive: () => boolean;
  shroud: EffectHandle | null;
  t: number;
  out: number;
  acc: number;
  shed: string;
  color: number;
  over: boolean;
}

/** The Revenant's lasting looks, driven once a frame by his kit. */
export class RevenantFX {
  private readonly storms: Storm[] = [];
  private readonly rises: Rise[] = [];
  private chain: Chain | null = null;
  private readonly forms: Form[] = [];

  constructor(private readonly effects: EffectSystem) {}

  /** The quality ladder as a 0.35..1 share of the full count. */
  private get detail(): number {
    return Math.max(0.35, Math.min(1, this.effects.fxScale));
  }

  /**
   * Bone Storm: shards orbit `follow` out to `radius` until the handle is
   * stopped. `shroud` (the zone's aura) stops with it.
   */
  storm(follow: THREE.Object3D, radius: number, shroud: EffectHandle | null): EffectHandle {
    const n = Math.round(Math.max(6, Math.min(14, 6 + 8 * this.detail)));
    const s: Storm = {
      follow,
      shards: [],
      ring: new Float32Array(n),
      high: new Float32Array(n),
      turn: new Float32Array(n),
      phase: new Float32Array(n),
      size: new Float32Array(n),
      t: 0,
      out: -1,
      acc: 0,
      pick: 0,
      over: false,
    };
    for (let i = 0; i < n; i++) {
      s.shards.push(this.effects.solids.alloc('spear'));
      const r = radius * (0.3 + 0.55 * spread(i, 0.1));
      s.ring[i] = r;
      s.high[i] = 0.45 + 1.3 * spread(i, 0.37);
      // The near ones whip round faster; all turn the one way, like weather.
      s.turn[i] = 2.7 - 0.22 * r;
      s.phase[i] = (i / n) * TAU + spread(i, 0.71) * 0.6;
      s.size[i] = 0.7 + 0.35 * spread(i, 0.53);
    }
    this.storms.push(s);
    return {
      stop: () => {
        if (s.out < 0) s.out = 0;
        shroud?.stop();
      },
      get done() {
        return s.over && (!shroud || shroud.done);
      },
    };
  }

  /** Bone Cage: ribs burst up round (x, z), stand `hold` seconds, and sink. */
  cage(x: number, z: number, radius: number, hold: number): void {
    const n = Math.round(Math.max(6, Math.min(18, radius * 3.2 * (0.55 + 0.45 * this.detail))));
    const pieces: Piece[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (spread(i, 0.2) - 0.5) * 0.18;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r = radius * (0.94 + 0.08 * spread(i, 0.6));
      const px = x + ca * r;
      const pz = z + sa * r;
      pieces.push({
        h: this.effects.solids.alloc('rib'),
        x: px, z: pz, gy: floorAt(px, pz),
        // Each rib curls in over the ring's middle.
        roll: Math.atan2(sa, -ca),
        size: Math.max(1.6, radius * 0.55) * (0.85 + 0.3 * spread(i, 0.45)),
        // A ripple round the ring as they break the floor.
        delay: (i / n) * 0.12,
        on: null, ox: 0, oz: 0, broke: false,
      });
    }
    this.rises.push({ pieces, t: 0, up: 0.18, hold, down: 0.35, girth: 1, shudder: 0, holder: null, chips: 'chips.bone', over: false });
  }

  /**
   * Gravewalk: grave-hands claw up in a ring round (x, z) and under each of
   * `held`, grip for `hold` seconds, and sink.
   */
  grasp(x: number, z: number, radius: number, hold: number, held: readonly RevenantBody[]): void {
    const pieces: Piece[] = [];
    const n = Math.round(4 + 4 * this.detail);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + spread(i, 0.3) * 0.5;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r = radius * (0.55 + 0.3 * spread(i, 0.8));
      const px = x + ca * r;
      const pz = z + sa * r;
      pieces.push(this.hand(px, pz, -ca, -sa, 0.95 + 0.3 * spread(i, 0.15), (i / n) * 0.1, null));
    }
    for (let i = 0; i < held.length && i < 6; i++) {
      const t = held[i]!;
      const p = t.root.position;
      let dx = p.x - x;
      let dz = p.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-3) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      // Up at its feet on the near side, reaching for it.
      const off = 0.2 + t.hitRadius * 0.55;
      pieces.push(this.hand(p.x - dx * off, p.z - dz * off, dx, dz, 0.9 + t.hitRadius * 0.4, 0.04, t, -dx * off, -dz * off));
    }
    this.rises.push({ pieces, t: 0, up: 0.16, hold, down: 0.3, girth: 1, shudder: 0.05, holder: null, chips: 'dust', over: false });
  }

  /** Soul Cage: hands hold one enemy for `hold` seconds, or until it dies. */
  hold(t: RevenantBody, hold: number): void {
    const pieces: Piece[] = [];
    const n = this.detail > 0.6 ? 4 : 3;
    const p = t.root.position;
    const off = 0.25 + t.hitRadius * 0.7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      pieces.push(this.hand(p.x + ca * off, p.z + sa * off, -ca, -sa, 0.95 + t.hitRadius * 0.45, i * 0.05, t, ca * off, sa * off));
    }
    this.rises.push({ pieces, t: 0, up: 0.2, hold, down: 0.35, girth: 1, shudder: 0.035, holder: t, chips: 'dust', over: false });
  }

  /** One grave-hand at (x, z), its fingers curled toward (ux, uz). */
  private hand(x: number, z: number, ux: number, uz: number, size: number, delay: number, on: RevenantBody | null, ox = 0, oz = 0): Piece {
    return {
      h: this.effects.solids.alloc('claw'),
      x, z, gy: floorAt(x, z),
      roll: Math.atan2(-ux, -uz),
      size, delay, on, ox, oz, broke: false,
    };
  }

  /**
   * Soul Tether: a chain from one bound enemy to the next for `duration`
   * seconds. A new tether takes the old one's place.
   */
  tether(members: readonly RevenantBody[], duration: number, school: School, color: number): void {
    this.endChain();
    if (members.length < 2) return;
    // Round the pack in order of angle, so the chain closes a loop, not a star.
    let cx = 0;
    let cz = 0;
    for (const m of members) { cx += m.root.position.x; cz += m.root.position.z; }
    cx /= members.length;
    cz /= members.length;
    const order = [...members].sort((a, b) =>
      Math.atan2(a.root.position.z - cz, a.root.position.x - cx) - Math.atan2(b.root.position.z - cz, b.root.position.x - cx));
    const links: Array<SolidHandle | null> = [];
    const n = Math.round(28 + 16 * this.detail);
    for (let i = 0; i < n; i++) links.push(this.effects.solids.alloc('link'));
    this.chain = {
      order, alive: [], links, left: duration, t: 0, acc: 0, pick: 0, used: 0,
      shed: ELEMENTS[school].shedEmitter, color, over: false,
    };
  }

  /** Revenant Form: skulls circle `follow`'s head while `alive()` holds. */
  form(follow: THREE.Object3D, alive: () => boolean, school: School, color: number): void {
    for (const f of this.forms) if (f.follow === follow && f.out < 0) f.out = 0;
    const skulls: Array<SolidHandle | null> = [];
    for (let i = 0; i < 3; i++) skulls.push(this.effects.solids.alloc('skull'));
    this.forms.push({
      follow, skulls, alive,
      shroud: this.effects.aura(follow, { radius: 0.95, height: 2.3, color, element: school, groundRing: true }),
      t: 0, out: -1, acc: 0, shed: ELEMENTS[school].shedEmitter, color, over: false,
    });
  }

  update(dt: number): void {
    for (let i = this.storms.length - 1; i >= 0; i--) {
      if (this.upStorm(this.storms[i]!, dt)) continue;
      this.storms.splice(i, 1);
    }
    for (let i = this.rises.length - 1; i >= 0; i--) {
      if (this.upRise(this.rises[i]!, dt)) continue;
      this.rises.splice(i, 1);
    }
    if (this.chain && !this.upChain(this.chain, dt)) this.endChain();
    for (let i = this.forms.length - 1; i >= 0; i--) {
      if (this.upForm(this.forms[i]!, dt)) continue;
      this.forms.splice(i, 1);
    }
  }

  /** Lets every piece go: a new level (the pool itself is cleared with it). */
  clear(): void {
    const solids = this.effects.solids;
    for (const s of this.storms) { for (const h of s.shards) solids.free(h); s.over = true; }
    for (const r of this.rises) for (const p of r.pieces) solids.free(p.h);
    for (const f of this.forms) { for (const h of f.skulls) solids.free(h); f.shroud?.stop(); f.over = true; }
    this.storms.length = 0;
    this.rises.length = 0;
    this.forms.length = 0;
    this.endChain(false);
  }

  private upStorm(s: Storm, dt: number): boolean {
    s.t += dt;
    if (s.out >= 0) s.out += dt;
    const solids = this.effects.solids;
    const c = s.follow.position;
    const grow = Math.min(1, s.t / 0.35);
    const ease = 1 - (1 - grow) * (1 - grow);
    const fly = s.out < 0 ? 0 : Math.min(1, s.out / STORM_OUT);
    s.acc += dt;
    let pick = -1;
    if (fly === 0 && s.acc >= 0.16 / this.detail) {
      s.acc = 0;
      pick = s.pick++ % s.shards.length;
    }
    for (let i = 0; i < s.shards.length; i++) {
      const h = s.shards[i]!;
      if (!h) continue;
      const a = s.phase[i]! + s.t * s.turn[i]!;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r = s.ring[i]! * (0.15 + 0.85 * ease) * (1 + fly * 0.6);
      const bob = Math.sin(s.t * 2.1 + s.phase[i]! * 3) * 0.22;
      const y = c.y + (s.high[i]! + bob) * (1 - fly) + 0.1 * fly;
      const x = c.x + ca * r;
      const z = c.z + sa * r;
      const len = s.size[i]! * (0.4 + 0.6 * ease) * (1 - 0.7 * fly);
      // Nose along its way round, rising and falling with its bob; nose down as it drops.
      const dy = Math.cos(s.t * 2.1 + s.phase[i]! * 3) * 0.17 - 0.8 * fly;
      solids.place(h, x, y, z, -sa, dy, ca, s.t * 9 + s.phase[i]!, len, len * 1.1);
      if (i === pick) this.effects.fx.burst('chips.bone', x, y, z, { count: 1, scale: 0.5 });
      if (fly >= 1) this.effects.fx.burst('chips.bone', x, Math.max(c.y + 0.1, y), z, { count: 2, scale: 0.6 });
    }
    if (fly < 1) return true;
    for (const h of s.shards) solids.free(h);
    s.over = true;
    return false;
  }

  private upRise(r: Rise, dt: number): boolean {
    r.t += dt;
    // Soul Cage: the hands let go of the dead.
    if (r.holder && r.holder.life <= 0 && r.hold > r.t) r.hold = Math.max(r.up, r.t);
    const solids = this.effects.solids;
    let live = false;
    for (const p of r.pieces) {
      if (!p.h) continue;
      const u = r.t - p.delay;
      let e: number;
      if (u <= 0) e = 0;
      else if (u < r.up) e = burstOut(u / r.up);
      else if (u < r.hold) e = 1;
      else e = Math.max(0, 1 - (u - r.hold) / r.down);
      if (u < r.hold + r.down) live = true;
      if (p.on && p.on.life > 0) {
        p.x = p.on.root.position.x + p.ox;
        p.z = p.on.root.position.z + p.oz;
      }
      if (u > 0 && !p.broke) {
        p.broke = true;
        this.effects.fx.burst(r.chips, p.x, p.gy + 0.15, p.z, { count: 3, scale: 0.7 });
        this.effects.fx.burst('dust', p.x, p.gy + 0.1, p.z, { count: 2, scale: 0.6 });
      }
      const grip = u > r.up && u < r.hold ? Math.sin(r.t * 31 + p.delay * 50) * r.shudder : 0;
      const y = p.gy - p.size * (1 - e) - 0.06;
      solids.place(p.h, p.x, y, p.z, 0, 1, 0, p.roll + grip, p.size, p.size * r.girth);
    }
    if (live) return true;
    for (const p of r.pieces) solids.free(p.h);
    r.over = true;
    return false;
  }

  private upChain(c: Chain, dt: number): boolean {
    c.t += dt;
    c.left -= dt;
    c.alive.length = 0;
    for (const m of c.order) if (m.life > 0) c.alive.push(m);
    if (c.left <= 0 || c.alive.length < 2) return false;
    const solids = this.effects.solids;
    const n = c.alive.length;
    const segs = n >= 3 ? n : 1;
    let total = 0;
    for (let k = 0; k < segs; k++) {
      const a = c.alive[k]!.root.position;
      const b = c.alive[(k + 1) % n]!.root.position;
      total += Math.hypot(b.x - a.x, b.z - a.z);
    }
    const spacing = Math.max(0.22, total / c.links.length);
    const size = Math.min(0.5, spacing * 1.4);
    // Draws in over the first moment, link by link from each body.
    const reach = Math.min(1, c.t / 0.3);
    c.acc += dt;
    let pick = -1;
    if (c.acc >= 0.22 / this.detail) {
      c.acc = 0;
      pick = c.pick;
      c.pick += 7;
    }
    let used = 0;
    for (let k = 0; k < segs && used < c.links.length; k++) {
      const A = c.alive[k]!;
      const B = c.alive[(k + 1) % n]!;
      const a = A.root.position;
      const b = B.root.position;
      const ay = a.y + 0.8 + A.hitRadius * 0.6;
      const by = b.y + 0.8 + B.hitRadius * 0.6;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const m = Math.max(1, Math.floor((d * reach) / spacing));
      const sag = 0.18 + 0.05 * d;
      for (let j = 0; j < m && used < c.links.length; j++) {
        const u = ((j + 0.5) / m) * reach;
        const sway = Math.sin(c.t * 2.4 + k * 1.7) * 0.05 * 4 * u * (1 - u);
        const x = a.x + dx * u;
        const z = a.z + dz * u;
        const y = ay + (by - ay) * u - sag * 4 * u * (1 - u) + sway;
        const ty = by - ay - sag * 4 * (1 - 2 * u);
        solids.place(c.links[used]!, x, y, z, dx, ty, dz, used & 1 ? Math.PI / 2 : 0, size, size);
        if (pick >= 0 && used === pick % c.links.length) this.effects.fx.burst(c.shed, x, y, z, { count: 1, scale: 0.5, color: c.color });
        used++;
      }
    }
    // Links the chain does not need this frame are put away, not freed.
    for (let i = used; i < c.used; i++) solids.place(c.links[i]!, 0, -50, 0, 0, 0, 1, 0, 0, 0);
    c.used = used;
    return true;
  }

  private endChain(puff = true): void {
    const c = this.chain;
    if (!c) return;
    this.chain = null;
    c.over = true;
    // The chain breaks: a wisp where every few links hung.
    if (puff && c.alive.length >= 2) {
      const n = c.alive.length;
      for (let k = 0; k < (n >= 3 ? n : 1); k++) {
        const a = c.alive[k]!.root.position;
        const b = c.alive[(k + 1) % n]!.root.position;
        this.effects.fx.burst(c.shed, (a.x + b.x) / 2, 0.9, (a.z + b.z) / 2, { count: 3, scale: 0.7, color: c.color });
      }
    }
    for (const h of c.links) this.effects.solids.free(h);
  }

  private upForm(f: Form, dt: number): boolean {
    f.t += dt;
    if (f.out < 0 && !f.alive()) f.out = 0;
    if (f.out >= 0) f.out += dt;
    const solids = this.effects.solids;
    const c = f.follow.position;
    const leave = f.out < 0 ? 0 : Math.min(1, f.out / FORM_OUT);
    const grow = Math.min(1, f.t / 0.4);
    for (let i = 0; i < f.skulls.length; i++) {
      const h = f.skulls[i]!;
      if (!h) continue;
      const a = f.t * 1.9 + (i / f.skulls.length) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r = 0.85 * (0.4 + 0.6 * grow) + leave * 0.5;
      const y = c.y + 1.95 + Math.sin(f.t * 3.1 + i * 2.1) * 0.12 + leave * 1.2;
      const size = 0.36 * grow * (1 - leave);
      // Each chases the one ahead of it, face first.
      solids.place(h, c.x + ca * r, y, c.z + sa * r, -sa, 0, ca, Math.sin(f.t * 4 + i) * 0.2, size, size);
    }
    f.acc += dt;
    if (leave === 0 && f.acc >= 0.18 / this.detail) {
      f.acc = 0;
      const a = f.t * 5.3;
      this.effects.fx.burst(f.shed, c.x + Math.cos(a) * 0.45, c.y + 0.3 + spread(Math.floor(f.t * 10), 0.2) * 1.4, c.z + Math.sin(a) * 0.45, { count: 1, scale: 0.6, color: f.color });
    }
    if (leave < 1) return true;
    for (const h of f.skulls) solids.free(h);
    f.shroud?.stop();
    f.over = true;
    return false;
  }
}
