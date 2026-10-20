/**
 * SLAY — the Knight's own skill work (class id `warden`).
 *
 * Most Knight skills run through the shared families in `SkillRunner.cast`:
 * a blow is a `melee` swing on the skill's own gesture, a stance or a shout
 * a buff. What those families cannot do lives here, keyed by skill id:
 *
 *  - Shield Charge: the body runs the lane, and each body in it is struck
 *    when the Knight reaches it and knocked aside.
 *  - Gatefall: a leap to the point, coming down shield first.
 *  - Whirlwind: the spin travels toward the aim while it turns.
 *  - Massacre: five cuts, each hit landing on its own cut.
 *  - Gorefeast, War Stomp: weapon work timed to the blow, nothing left on
 *    the Knight himself.
 *  - Earthshatter: the shockwave travels down its line and hits each body
 *    as it arrives.
 *  - Banner of the Gate: a real standard whose bonus holds inside its ring.
 *  - Taunting Roar: the pull.
 *  - The Last Order: every shout carries the oaths he has sworn.
 *  - Retribution, Riposte, Blood Tide: hooks the scene calls on a block, on
 *    a counter and on a death.
 *
 * `SkillRunner` lends a small host (its hit pipeline and its queue), so
 * every Knight blow is tuned, felt and counted like any other. The looks are
 * steel, blood, dust and broken floor (`fx/knight/KnightFX.ts`), never a
 * spell shape: the owner's call for weapon skills.
 */
import * as THREE from 'three';
import type { DamagePacket, SkillDef, StatusApplication } from '../../types';
import type { CombatContext, Enemy } from '../../entities/Enemy';
import type { Boss } from '../../entities/Boss';
import type { Player } from '../../entities/Player';
import type { HitKind } from '../../fx/CombatFeel';
import type { EffectSystem } from '../../fx/Effects';
import { SKILL_BY_ID } from '../../data/skills';
import { skillRank } from '../../sim/Character';
import { travelTime } from '../../sim/Speed';
import { rollDamage } from '../../sim/Combat';
import { SPAN_RATE } from '../../art/hero/Animator';
import { MASSACRE_CUTS, MASSACRE_END } from '../../art/hero/gestures/knight';
import { KNIGHT_GOLD, SteelArcs, Standard } from '../../fx/knight/KnightFX';
import { tr } from '../../core/I18n';

type Target = Enemy | Boss;
type Num = (key: string, d: number) => number;
type Packet = (m?: number) => DamagePacket;

/** The fight a cast happens in. */
export interface KnightWorld {
  ctx: CombatContext;
  enemies: Enemy[];
  boss: Boss | null;
  player: Player;
}

/** What the runner lends the Knight. */
export interface KnightHost {
  readonly effects: EffectSystem;
  /** One tuned blow on one target through the whole hit pipeline. */
  land(t: Target, packet: DamagePacket, kind: HitKind, fromX: number, fromZ: number, world: KnightWorld): DamagePacket;
  /** Damage that is not a blow (a drunk bleed): no tuning, no on-hit. */
  proc(t: Target, packet: DamagePacket, ctx: CombatContext, fromX: number, fromZ: number): boolean;
  /** Every target within `radius` of `centre` takes a fresh packet. Returns damage dealt. */
  area(centre: THREE.Vector3, radius: number, packet: () => DamagePacket, ctx: CombatContext, enemies: Enemy[], boss: Boss | null, kind: HitKind): number;
  /**
   * A weapon swing round the hero. Waits for the action's contact frame,
   * unless `now` (a later cut of the same action).
   */
  swing(player: Player, dir: THREE.Vector3, arc: number, reach: number, packet: Packet, world: KnightWorld, kind: HitKind, hitSfx: string | null, now: boolean): void;
  /** Runs `fn` after `seconds` (the runner's contact queue). */
  later(seconds: number, fn: () => void): void;
  sound(id: string | null, x: number, z: number): void;
  /** How far a body can travel from `from` along `dir` before a wall, up to `max`. */
  clear(from: THREE.Vector3, dir: THREE.Vector3, max: number, ctx: CombatContext): number;
  /** Puts the skill's own buff on the hero at this rank (`data/skillPower.ts`). */
  buff(player: Player, def: SkillDef, rank: number, num: Num, color: number): void;
  /** Sworn Brother rises beside a planted standard. */
  raiseBrother(player: Player, at: THREE.Vector3, ctx: CombatContext): void;
}

/** One press of a Knight skill. */
export interface KnightCast {
  def: SkillDef;
  rank: number;
  player: Player;
  /** Where the press aimed, on the floor. */
  aim: THREE.Vector3;
  /** Unit direction from the hero to the aim, on the floor. */
  dir: THREE.Vector3;
  ctx: CombatContext;
  enemies: Enemy[];
  boss: Boss | null;
  /** A fresh rolled packet at `m` times the skill, riders on. */
  packet: Packet;
  /** The same, as a blow of the weapons in hand (two blades hit harder). */
  blowPacket: Packet;
  num: Num;
  color: number;
  /** Seconds this use takes (`sim/Speed.ts`). */
  time: number;
  /** The body's action for it. */
  clip: string;
  hitSound: string | null;
}

/**
 * The Knight skills that are weapon or body work, not spells: they gather no
 * spell light in the hands and flare nothing on release.
 */
const KNIGHT_BLOWS: ReadonlySet<string> = new Set([
  'shieldBash', 'shieldCharge', 'gatefall', 'cleave', 'rend', 'gash', 'overhead', 'sunder', 'maim',
  'whirlwind', 'massacre', 'ruin', 'gorefeast', 'warStomp', 'earthshatter',
]);

/** True for a Knight skill that is a blow of the weapon or the body. */
export function knightBlow(skillId: string): boolean {
  return KNIGHT_BLOWS.has(skillId);
}

/** The shouts The Last Order makes carry the oaths. */
const SHOUTS: ReadonlySet<string> = new Set(['battleCry', 'rallyingHorn', 'intimidate', 'tauntingRoar', 'heraldOfRuin']);

/** Whirlwind's walk while it spins, metres a second at most. */
const SPIN_WALK = 2.6;
/** How far from the hero a standard can be planted. */
const STANDARD_REACH = 6;
/** Taunting Roar drags at this speed, and stops this far short of the hero (plus the body). */
const PULL_SPEED = 16;
const PULL_STOP = 1.4;
/** Earthshatter's wave runs this fast, and breaks the floor every this many metres. */
const WAVE_SPEED = 18;
const WAVE_CRACK = 1.2;
/** Gatefall: the leap is at most this share of the action, so it is never walked out of mid-air. */
const LEAP_SHARE = 0.5;
const LEAP_MIN = 0.4;

/** Floor dust and stone, browned to the dungeon. */
const DUST = 0xa89a82;
const BLOOD = 0x7a0d0d;

interface Rush {
  player: Player;
  id: number;
  left: number;
  radius: number;
  dirX: number;
  dirZ: number;
  packet: Packet;
  world: KnightWorld;
  hit: Set<Target>;
  dust: number;
  sound: string | null;
  heard: boolean;
}

interface Leap {
  player: Player;
  id: number;
  t: number;
  flight: number;
  height: number;
  radius: number;
  packet: Packet;
  world: KnightWorld;
  sound: string | null;
}

interface Wave {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  yaw: number;
  lane: number;
  width: number;
  at: number;
  crack: number;
  packet: Packet;
  world: KnightWorld;
  hit: Set<Target>;
  sound: string | null;
  heard: boolean;
}

interface Banner {
  player: Player;
  x: number;
  z: number;
  radius: number;
  left: number;
  mods: StatusApplication['mods'];
  magnitude: number;
  mesh: Standard;
}

/** Plain looks laid on a weapon skill's own blow, at its contact frame. */
type Look = 'bash' | 'cleave' | 'rend' | 'gash' | 'overhead' | 'sunder' | 'maim' | 'ruin';
const LOOKS: Readonly<Record<string, Look>> = {
  shieldBash: 'bash', cleave: 'cleave', rend: 'rend', gash: 'gash', overhead: 'overhead', sunder: 'sunder', maim: 'maim', ruin: 'ruin',
};

const yawOf = (x: number, z: number): number => Math.atan2(x, z);

export class KnightKit {
  private arcs: SteelArcs | null = null;
  private rush: Rush | null = null;
  private leap: Leap | null = null;
  private readonly waves: Wave[] = [];
  private banner: Banner | null = null;
  /** Standards lowered and still sinking. */
  private readonly lowered: Standard[] = [];
  /** The hero whose stored Retribution shows at the shield. */
  private keeper: Player | null = null;
  private glint = 0;
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  /** Burst options reused by the per-frame looks, so a frame allocates nothing. */
  private readonly dustOpts = { count: 4, scale: 0.9, color: DUST };
  private readonly glintOpts = { count: 3, scale: 0.6, color: KNIGHT_GOLD };

  constructor(private readonly host: KnightHost) {}

  private steel(): SteelArcs {
    return (this.arcs ??= new SteelArcs(this.host.effects.scene, 8));
  }

  private world(c: KnightCast): KnightWorld {
    return { ctx: c.ctx, enemies: c.enemies, boss: c.boss, player: c.player };
  }

  /** Runs `fn` on the current action's contact frame, unless the action is cut short first. */
  private onContact(player: Player, fn: () => void): void {
    const wait = player.contactIn;
    if (wait <= 0.001) {
      fn();
      return;
    }
    const id = player.actionId;
    this.host.later(wait, () => {
      if (player.actionId === id && player.alive) fn();
    });
  }

  // ---------------------------------------------------------------------------
  // The runner's hooks
  // ---------------------------------------------------------------------------

  /** Why a Knight skill cannot be used right now, or null. Checked before any cost. */
  refusal(def: SkillDef, player: Player): string | null {
    if ((def.id === 'shieldCharge' || def.id === 'gatefall') && player.immobilised) {
      return tr('Rooted: {0} cannot move you.', def.name);
    }
    return null;
  }

  /**
   * Guard Stance pressed while it is up is put down, free. True when it was.
   * Called before the mana is spent.
   */
  toggleOff(def: SkillDef, player: Player): boolean {
    if (def.id !== 'guardStance' || !player.status.has('guardStance')) return false;
    player.status.remove('guardStance');
    player.refreshStats();
    this.host.sound('ui.toggle', player.position.x, player.position.z);
    return true;
  }

  /** Runs a skill this kit handles whole. False leaves it to the runner's families. */
  cast(c: KnightCast): boolean {
    switch (c.def.id) {
      case 'shieldCharge':
        this.shieldCharge(c);
        return true;
      case 'gatefall':
        this.gatefall(c);
        return true;
      case 'massacre':
        this.massacre(c);
        return true;
      case 'gorefeast':
        this.gorefeast(c);
        return true;
      case 'warStomp':
        this.warStomp(c);
        return true;
      case 'earthshatter':
        this.earthshatter(c);
        return true;
      case 'bannerOfTheGate':
        this.plantStandard(c);
        return true;
      default:
        return false;
    }
  }

  /** What every Knight skill adds after its family has run. */
  after(c: KnightCast): void {
    const id = c.def.id;
    const p = c.player;
    // Fortress Stance replaces Guard Stance.
    if (id === 'fortressStance' && p.status.remove('guardStance')) p.refreshStats();
    if (id === 'whirlwind') this.spin(c);
    if (id === 'tauntingRoar') this.pull(c);
    if (SHOUTS.has(id)) this.lastOrder(c);
    const look = LOOKS[id];
    if (look) this.onContact(p, () => this.drawLook(c, look));
  }

  /** Once a frame. */
  tick(dt: number): void {
    if (this.rush) this.rushTick(this.rush, dt);
    if (this.leap) this.leapTick(this.leap, dt);
    for (let i = this.waves.length - 1; i >= 0; i--) {
      if (!this.waveTick(this.waves[i]!, dt)) this.waves.splice(i, 1);
    }
    if (this.banner) this.bannerTick(this.banner, dt);
    for (let i = this.lowered.length - 1; i >= 0; i--) {
      if (!this.lowered[i]!.update(dt)) this.lowered.splice(i, 1);
    }
    this.arcs?.update(dt);
    this.glow(dt);
  }

  dispose(): void {
    this.arcs?.dispose();
    this.arcs = null;
    this.banner?.mesh.dispose();
    this.banner = null;
    for (const s of this.lowered) s.dispose();
    this.lowered.length = 0;
    if (this.leap) this.leap.player.lift(0);
    this.leap = null;
    this.rush = null;
    this.waves.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Bulwark
  // ---------------------------------------------------------------------------

  /** Shoulder first down the lane: each body is struck when he reaches it. */
  private shieldCharge(c: KnightCast): void {
    const p = c.player;
    const lane = this.host.clear(p.position, c.dir, c.num('range', 9), c.ctx);
    const span = travelTime(lane);
    if (!p.dodge(c.dir.x, c.dir.z, true, c.clip, { distance: lane, skill: true, span })) return;
    p.animator.play(c.clip, { fade: 0.05, span, restart: true });
    this.rush = {
      player: p, id: p.actionId, left: span, radius: c.num('radius', 1.6), dirX: c.dir.x, dirZ: c.dir.z,
      packet: c.packet, world: this.world(c), hit: new Set(), dust: 0, sound: c.hitSound, heard: false,
    };
    this.host.effects.fx.burst('puff.dust', p.position.x, 0.15, p.position.z, { count: 14, scale: 1.2, color: DUST });
  }

  private rushTick(r: Rush, dt: number): void {
    const p = r.player;
    if (p.actionId !== r.id || !p.alive) {
      this.rush = null;
      return;
    }
    r.left -= dt;
    const px = p.position.x;
    const pz = p.position.z;
    const list = r.world.enemies;
    for (let i = 0; i < list.length; i++) this.rushHit(r, list[i]!, px, pz);
    if (r.world.boss) this.rushHit(r, r.world.boss, px, pz);
    r.dust -= dt;
    if (r.dust <= 0) {
      r.dust = 0.05;
      this.host.effects.fx.burst('puff.dust', px - r.dirX * 0.5, 0.12, pz - r.dirZ * 0.5, this.dustOpts);
    }
    if (r.left <= 0) this.rush = null;
  }

  private rushHit(r: Rush, t: Target, px: number, pz: number): void {
    if (t.life <= 0 || r.hit.has(t)) return;
    const dx = t.root.position.x - px;
    const dz = t.root.position.z - pz;
    const reach = r.radius + t.hitRadius;
    if (dx * dx + dz * dz > reach * reach) return;
    r.hit.add(t);
    // Knocked aside: off the side of the lane it stood on, and on a little.
    const along = dx * r.dirX + dz * r.dirZ;
    let sx = dx - r.dirX * along;
    let sz = dz - r.dirZ * along;
    const len = Math.hypot(sx, sz);
    if (len < 0.05) {
      const flip = r.hit.size % 2 ? 1 : -1;
      sx = -r.dirZ * flip;
      sz = r.dirX * flip;
    } else {
      sx /= len;
      sz /= len;
    }
    const tx = t.root.position.x;
    const tz = t.root.position.z;
    this.host.land(t, r.packet(), 'heavy', tx - sx * 0.8 - r.dirX * 0.5, tz - sz * 0.8 - r.dirZ * 0.5, r.world);
    const fx = this.host.effects.fx;
    fx.burst('shieldHit', tx - r.dirX * t.hitRadius, 1.1, tz - r.dirZ * t.hitRadius, { count: 10 });
    fx.burst('sparks', tx - r.dirX * t.hitRadius, 1.1, tz - r.dirZ * t.hitRadius, { count: 8, dir: this.v.set(sx, 0.3, sz) });
    if (!r.heard) {
      r.heard = true;
      this.host.sound(r.sound, tx, tz);
    }
  }

  /** Up and over to the point, landing shield first. */
  private gatefall(c: KnightCast): void {
    const p = c.player;
    const want = Math.min(c.num('range', 10), Math.max(1.5, Math.hypot(c.aim.x - p.position.x, c.aim.z - p.position.z)));
    const lane = this.host.clear(p.position, c.dir, want, c.ctx);
    const flight = Math.max(LEAP_MIN, travelTime(lane));
    const total = Math.max(c.time, flight / LEAP_SHARE);
    p.beginAction(c.clip, total);
    // The gesture lands when the body does.
    p.animator.play(c.clip, { fade: 0.06, span: total, restart: true, contact: flight });
    p.carry(c.dir.x, c.dir.z, lane / flight, flight);
    // Nothing holds or shoves him in the air.
    p.steadyLeft = Math.max(p.steadyLeft, flight);
    const k = Math.max(0, c.rank - 1);
    this.leap = {
      player: p, id: p.actionId, t: 0, flight, height: 0.9 + lane * 0.09,
      radius: c.num('radius', 3.5) + c.num('radiusPerRank', 0.1) * k,
      packet: c.packet, world: this.world(c), sound: c.hitSound,
    };
    this.host.effects.fx.burst('puff.dust', p.position.x, 0.12, p.position.z, { count: 18, scale: 1.3, ring: 0.6, color: DUST });
  }

  private leapTick(l: Leap, dt: number): void {
    const p = l.player;
    if (p.actionId !== l.id || !p.alive) {
      p.lift(0);
      this.leap = null;
      return;
    }
    l.t += dt;
    const u = Math.min(1, l.t / l.flight);
    p.lift(4 * l.height * u * (1 - u));
    if (u < 1) return;
    p.lift(0);
    this.leap = null;
    const at = this.w.set(p.position.x, 0, p.position.z);
    const w = l.world;
    this.host.area(at, l.radius, () => l.packet(), w.ctx, w.enemies, w.boss, 'heavy');
    this.host.sound(l.sound, at.x, at.z);
    this.groundBreak(at.x, at.z, l.radius, yawOf(-Math.sin(p.root.rotation.y), -Math.cos(p.root.rotation.y)), 1.15);
  }

  // ---------------------------------------------------------------------------
  // Carnage
  // ---------------------------------------------------------------------------

  /** The spin walks toward the aim while it turns, and a smear of steel rides round with it. */
  private spin(c: KnightCast): void {
    const p = c.player;
    const toAim = Math.hypot(c.aim.x - p.position.x, c.aim.z - p.position.z);
    const time = Math.max(0.2, c.time);
    p.carry(c.dir.x, c.dir.z, Math.min(SPIN_WALK, toAim / time), time, 1);
    const reach = c.num('radius', 3);
    const trail = Math.PI * 0.85;
    const yaw = yawOf(c.dir.x, c.dir.z);
    this.steel().cut(p.position.x, p.position.z, yaw - trail / 2, trail, reach * 0.85, {
      y: 1.0, life: time, follow: p.root, turn: (Math.PI * 2) / time, sweep: 0, bright: 0.75,
    });
  }

  /** Five cuts in one motion, each landing on its own cut of the gesture. */
  private massacre(c: KnightCast): void {
    const p = c.player;
    p.beginAction(c.clip, c.time);
    const w = this.world(c);
    const facing = c.dir.clone();
    const reach = c.num('radius', 3.4);
    const arc = (c.num('arc', 200) * Math.PI) / 180;
    const hits = Math.max(1, Math.floor(c.num('hits', 5)));
    // Real seconds to each cut: the animator plays the gesture up to its
    // contact in `contactIn`, and the rest at one rate (`Animator.play`).
    const pre = p.contactIn;
    const first = MASSACRE_CUTS[0]!;
    const rate = Math.min(SPAN_RATE[1], Math.max(SPAN_RATE[0], (MASSACRE_END - first) / Math.max(0.05, c.time - pre)));
    const last = MASSACRE_CUTS.length - 1;
    const id = p.actionId;
    this.host.swing(p, facing, arc, reach, c.blowPacket, w, 'melee', c.hitSound, false);
    this.onContact(p, () => this.cutLook(p, facing, reach, 0));
    for (let i = 1; i < hits; i++) {
      const key = MASSACRE_CUTS[Math.min(i, last)]! + Math.max(0, i - last) * 0.1;
      this.host.later(pre + (key - first) / rate, () => {
        if (p.actionId !== id || !p.alive) return;
        this.host.swing(p, facing, arc, reach, c.blowPacket, w, 'melee', c.hitSound, true);
        this.cutLook(p, facing, reach, i);
      });
    }
  }

  private cutLook(p: Player, facing: THREE.Vector3, reach: number, i: number): void {
    const yaw = yawOf(facing.x, facing.z) + (i % 2 ? 0.35 : -0.35);
    this.steel().cut(p.position.x, p.position.z, yaw, Math.PI * 0.9, reach * 0.8, {
      y: i % 2 ? 1.35 : 0.85, life: 0.22, sweep: 0.5, bright: 0.9,
    });
  }

  /** The blade dragged round at the ankles; every bleed in reach is drunk at once. */
  private gorefeast(c: KnightCast): void {
    const p = c.player;
    p.beginAction(c.clip, c.time);
    this.onContact(p, () => {
      const at = this.w.set(p.position.x, 0, p.position.z);
      const radius = c.num('radius', 7);
      // The tear: weapon damage to everything in reach.
      let dealt = this.host.area(at, radius, () => c.packet(), c.ctx, c.enemies, c.boss, 'melee');
      const share = c.num('damagePct', 100) / 100;
      const fx = this.host.effects.fx;
      const name = c.def.name;
      const drink = (t: Target): void => {
        if (t.life <= 0) return;
        const dx = t.root.position.x - at.x;
        const dz = t.root.position.z - at.z;
        const d = Math.hypot(dx, dz);
        if (d > radius + t.hitRadius) return;
        const left = (t.drainStatus('bleeding') + t.drainStatus('hemorrhage')) * share;
        if (left <= 0) return;
        const pk: DamagePacket = { amount: left, type: 'physical', crit: false, source: 'player', ability: name };
        if (this.host.proc(t, pk, c.ctx, at.x, at.z)) dealt += left;
        // The blood leaves the body toward him.
        const back = this.v.set(-dx / Math.max(0.01, d), 0.35, -dz / Math.max(0.01, d));
        fx.burst('blood', t.root.position.x, 1.0, t.root.position.z, { count: 18, dir: back, speed: 7, color: BLOOD });
        this.host.effects.decals.add('bloodSplatter', t.root.position.x, t.root.position.z, 0.9 + t.hitRadius * 0.5);
      };
      for (const e of c.enemies) drink(e);
      if (c.boss) drink(c.boss);
      const heal = c.num('healPct', 20) + c.num('healPerRank', 3) * Math.max(0, c.rank - 1);
      if (dealt > 0) p.heal((dealt * heal) / 100);
      this.steel().cut(at.x, at.z, yawOf(c.dir.x, c.dir.z), Math.PI * 2, 2.2, { y: 0.25, life: 0.4, sweep: 0.45, bright: 0.7 });
      fx.burst('puff.blood', at.x, 0.6, at.z, { count: 16, ring: 1.4 });
    });
  }

  // ---------------------------------------------------------------------------
  // Oath
  // ---------------------------------------------------------------------------

  /** The foot comes down and the floor jumps. */
  private warStomp(c: KnightCast): void {
    const p = c.player;
    p.beginAction(c.clip, c.time);
    this.onContact(p, () => {
      const at = this.w.set(p.position.x, 0, p.position.z);
      const radius = c.num('radius', 6);
      this.host.area(at, radius, () => c.packet(), c.ctx, c.enemies, c.boss, 'heavy');
      this.host.sound(c.hitSound, at.x, at.z);
      this.groundBreak(at.x, at.z, radius, yawOf(c.dir.x, c.dir.z), 1.0);
    });
  }

  /** The blade driven into the floor; the break runs out along the line. */
  private earthshatter(c: KnightCast): void {
    const p = c.player;
    p.beginAction(c.clip, c.time);
    const dirX = c.dir.x;
    const dirZ = c.dir.z;
    this.onContact(p, () => {
      const from = this.w.set(p.position.x, 0, p.position.z);
      const dir = this.v.set(dirX, 0, dirZ);
      const lane = this.host.clear(from, dir, c.num('range', 12), c.ctx);
      this.waves.push({
        x: from.x, z: from.z, dirX, dirZ, yaw: yawOf(dirX, dirZ), lane, width: c.num('width', 3), at: 0, crack: 0.8,
        packet: c.packet, world: this.world(c), hit: new Set(), sound: c.hitSound, heard: false,
      });
      const fx = this.host.effects;
      fx.decals.add('crater', from.x + dirX * 0.9, from.z + dirZ * 0.9, 1.0);
      fx.fx.burst('chips.stone', from.x + dirX * 0.9, 0.3, from.z + dirZ * 0.9, { count: 14 });
    });
  }

  /** False once the wave has run its line. */
  private waveTick(w: Wave, dt: number): boolean {
    w.at = Math.min(w.lane, w.at + WAVE_SPEED * dt);
    const list = w.world.enemies;
    for (let i = 0; i < list.length; i++) this.waveHit(w, list[i]!);
    if (w.world.boss) this.waveHit(w, w.world.boss);
    const fx = this.host.effects;
    while (w.crack <= w.at) {
      const x = w.x + w.dirX * w.crack;
      const z = w.z + w.dirZ * w.crack;
      // The fissure zigzags a little: the same each time for the same metre.
      const jag = Math.sin(w.crack * 2.7) * 0.35;
      fx.decals.add('crack', x, z, 0.85 + 0.25 * Math.abs(jag), w.yaw + jag);
      fx.fx.burst('dust', x, 0.2, z, { count: 6, scale: 1.1, color: DUST });
      fx.fx.burst('chips.stone', x, 0.25, z, { count: 5 });
      w.crack += WAVE_CRACK;
    }
    return w.at < w.lane;
  }

  private waveHit(w: Wave, t: Target): void {
    if (t.life <= 0 || w.hit.has(t)) return;
    const dx = t.root.position.x - w.x;
    const dz = t.root.position.z - w.z;
    const along = dx * w.dirX + dz * w.dirZ;
    if (along < -t.hitRadius || along > w.at + t.hitRadius) return;
    const perp = Math.sqrt(Math.max(0, dx * dx + dz * dz - along * along));
    if (perp > w.width * 0.5 + t.hitRadius) return;
    w.hit.add(t);
    // Thrown on along the line, the way the floor threw it.
    this.host.land(t, w.packet(), 'heavy', t.root.position.x - w.dirX, t.root.position.z - w.dirZ, w.world);
    this.host.effects.fx.burst('chips.stone', t.root.position.x, 0.4, t.root.position.z, { count: 10 });
    if (!w.heard) {
      w.heard = true;
      this.host.sound(w.sound, t.root.position.x, t.root.position.z);
    }
  }

  /**
   * Plants the standard where he aimed (up to `STANDARD_REACH` metres, short
   * of a wall). Its bonus holds while he stands inside its ring; one stands
   * at a time.
   */
  private plantStandard(c: KnightCast): void {
    const p = c.player;
    p.beginAction(c.clip, c.time);
    const want = Math.min(STANDARD_REACH, Math.hypot(c.aim.x - p.position.x, c.aim.z - p.position.z));
    const lane = want > 0.4 ? this.host.clear(p.position, c.dir, want, c.ctx) : 0;
    const go = Math.max(0, lane - 0.25);
    const x = p.position.x + c.dir.x * go;
    const z = p.position.z + c.dir.z * go;
    this.lowerStandard();
    this.host.buff(p, c.def, c.rank, c.num, c.color);
    const st = p.status.get('standard');
    const radius = c.num('radius', 8) + (c.ctx.auraRadiusBonus ?? 0);
    const mesh = new Standard(this.host.effects.scene, x, z, yawOf(c.dir.x, c.dir.z), radius);
    const floor = this.host.effects.decals.floorY(x, z);
    if (typeof floor === 'number' && Number.isFinite(floor)) mesh.group.position.y = floor;
    this.banner = {
      player: p, x, z, radius, left: st?.remaining ?? c.num('duration', 20), mods: st?.mods, magnitude: st?.magnitude ?? 1, mesh,
    };
    this.bannerTick(this.banner, 0);
    const fx = this.host.effects;
    fx.fx.burst('puff.dust', x, 0.15, z, { count: 16, ring: 0.5, color: DUST });
    fx.fx.burst('chips.stone', x, 0.2, z, { count: 8 });
    fx.decals.add('crack', x, z, 0.8, yawOf(c.dir.x, c.dir.z));
    fx.flash(x, 2.2, z, KNIGHT_GOLD, 4, 8, 0.25);
    this.host.raiseBrother(p, this.v.set(x, 0, z), c.ctx);
  }

  private lowerStandard(): void {
    const b = this.banner;
    if (!b) return;
    this.banner = null;
    b.mesh.lower();
    this.lowered.push(b.mesh);
    if (b.player.status.remove('standard')) b.player.refreshStats();
  }

  private bannerTick(b: Banner, dt: number): void {
    b.mesh.update(dt);
    b.left -= dt;
    const p = b.player;
    if (b.left <= 0 || !p.alive) {
      this.lowerStandard();
      return;
    }
    const dx = p.position.x - b.x;
    const dz = p.position.z - b.z;
    const inside = dx * dx + dz * dz <= b.radius * b.radius;
    const has = p.status.has('standard');
    if (inside && !has) p.applyStatus('standard', b.left, b.magnitude, 1, { mods: b.mods });
    else if (!inside && has) {
      p.status.remove('standard');
      p.refreshStats();
    }
  }

  /** Taunting Roar: everything in reach is dragged in to his feet. */
  private pull(c: KnightCast): void {
    const p = c.player;
    const px = p.position.x;
    const pz = p.position.z;
    const reach = c.num('radius', 9) + (c.ctx.auraRadiusBonus ?? 0);
    const fx = this.host.effects.fx;
    for (const e of c.enemies) {
      // Bosses, the unstoppable and the furniture hold their ground.
      if (e.life <= 0 || e.isBoss || e.def.object || e.motionOverride) continue;
      if (e.affixes.some((a) => a.behavior === 'juggernaut')) continue;
      const dx = e.root.position.x - px;
      const dz = e.root.position.z - pz;
      const d = Math.hypot(dx, dz);
      const stop = PULL_STOP + e.hitRadius;
      if (d > reach + e.hitRadius || d <= stop + 0.2) continue;
      if (c.ctx.nav && !c.ctx.nav.lineOfSight(e.root.position.x, e.root.position.z, px, pz)) continue;
      e.motionOverride = {
        kind: 'knock',
        fromX: e.root.position.x,
        fromZ: e.root.position.z,
        toX: px + (dx / d) * stop,
        toZ: pz + (dz / d) * stop,
        t: 0,
        duration: Math.max(0.18, (d - stop) / PULL_SPEED),
        arc: 0.25,
      };
      fx.burst('puff.dust', e.root.position.x, 0.15, e.root.position.z, { count: 8, color: DUST });
    }
  }

  /** The Last Order: the shout carries every oath he has sworn. */
  private lastOrder(c: KnightCast): void {
    const p = c.player;
    const rank = skillRank(p.character, 'theLastOrder');
    if (rank <= 0) return;
    const k = rank - 1;
    const lp = SKILL_BY_ID.theLastOrder?.params ?? {};
    const n = (key: string, d: number): number => {
      const v = lp[key];
      return typeof v === 'number' ? v : d;
    };
    const sworn = (id: string): boolean => skillRank(p.character, id) > 0;
    const at = this.w.set(p.position.x, 0, p.position.z);
    const reach = c.num('radius', 8) + (c.ctx.auraRadiusBonus ?? 0);
    const fx = this.host.effects;
    if (sworn('oathOfMight')) {
      const scale = (n('mightPct', 80) + n('mightPerRank', 6) * k) / 100;
      const name = tr('The Last Order');
      this.host.area(at, reach, () => rollDamage(p.stats, c.ctx.rng, { scale, type: 'physical', ability: name, source: 'player' }), c.ctx, c.enemies, c.boss, 'area');
      fx.decals.add('shockwave', at.x, at.z, reach * 0.9);
    }
    if (sworn('oathOfIron')) {
      const ward = (p.stats.life * (n('ironPct', 8) + n('ironPerRank', 0.5) * k)) / 100;
      p.applyStatus('shielded', n('ironDuration', 8), 1, 1, { absorb: ward });
    }
    if (sworn('oathOfBlood')) p.heal((p.stats.life * (n('bloodPct', 5) + n('bloodPerRank', 0.4) * k)) / 100);
    if (sworn('hymnOfThorns')) {
      const e = p.passives;
      const bleed: StatusApplication[] = [{
        id: 'bleeding',
        duration: 6 + e.dotDurationSec,
        magnitude: 1 + e.dotDamagePct / 100,
        stacks: Math.max(1, Math.floor(n('hymnStacks', 2))),
        maxStacks: Math.floor(e.dotMaxStacks),
      }];
      const thorn = (t: Target): void => {
        if (t.life <= 0) return;
        if (Math.hypot(t.root.position.x - at.x, t.root.position.z - at.z) > reach + t.hitRadius) return;
        t.applyStatuses(bleed, c.ctx);
      };
      for (const t of c.enemies) thorn(t);
      if (c.boss) thorn(c.boss);
    }
    fx.fx.burst('block', at.x, 1.2, at.z, { count: 24, ring: 1.2 });
    fx.flash(at.x, 1.6, at.z, KNIGHT_GOLD, 5, 10, 0.2);
  }

  // ---------------------------------------------------------------------------
  // The scene's hooks
  // ---------------------------------------------------------------------------

  /** Riposte: the counter is seen. A quick backhand off the shield side, and a parry spark. */
  riposte(player: Player, attacker: Target): void {
    if (!player.isBusy) {
      player.faceTowards(attacker.root.position.x, attacker.root.position.z);
      player.handBlow('R', 0.34);
    }
    const s = this.shieldAt(player);
    this.host.effects.fx.burst('sparks', s.x, 1.15, s.z, { count: 10 });
    this.host.effects.fx.burst('block', s.x, 1.15, s.z, { count: 6 });
  }

  /** Retribution: a block was stored. The count on the HUD is the stored percent. */
  storeRetribution(player: Player, stored: number): void {
    this.keeper = player;
    player.status.remove('retribution');
    player.applyStatus('retribution', 1e5, 1, Math.max(1, Math.round(stored)));
    const s = this.shieldAt(player);
    this.host.effects.fx.burst('block', s.x, 1.15, s.z, { count: 6 + Math.round(stored / 30) });
  }

  /** Retribution: the next blow spent it all, on `t`. */
  spendRetribution(player: Player, t: Target, stored: number): void {
    if (player.status.remove('retribution')) player.refreshStats();
    const x = t.root.position.x;
    const z = t.root.position.z;
    const big = Math.min(1, stored / 300);
    const fx = this.host.effects;
    fx.fx.burst('block', x, 1.1, z, { count: 14 + Math.round(26 * big), scale: 1 + big });
    fx.fx.burst('sparks', x, 1.1, z, { count: 10 + Math.round(20 * big) });
    fx.flash(x, 1.4, z, KNIGHT_GOLD, 5 + 7 * big, 8, 0.2);
    fx.decals.add('shockwave', x, z, 1.2 + 1.8 * big);
  }

  /**
   * Blood Tide: a bleeding enemy died. Every stack it carried leaps to the
   * nearest living enemies in reach, stronger for the leap.
   */
  onDeath(dead: Enemy, player: Player, ctx: CombatContext, enemies: Enemy[], boss: Boss | null): void {
    const e = player.passives;
    if (e.tideLeapMax <= 0) return;
    const stacks = dead.stacksOf('bleeding');
    if (stacks <= 0) return;
    const fromX = dead.root.position.x;
    const fromZ = dead.root.position.z;
    const near: Array<{ t: Target; d: number }> = [];
    const consider = (t: Target): void => {
      if (t === dead || t.life <= 0) return;
      const d = Math.hypot(t.root.position.x - fromX, t.root.position.z - fromZ);
      if (d <= e.tideLeapRadius + t.hitRadius) near.push({ t, d });
    };
    for (const t of enemies) consider(t);
    if (boss) consider(boss);
    if (!near.length) return;
    near.sort((a, b) => a.d - b.d);
    const bleed: StatusApplication[] = [{
      id: 'bleeding',
      duration: 6 + e.dotDurationSec,
      magnitude: (1 + e.dotDamagePct / 100) * (1 + e.tideLeapPct / 100),
      stacks,
      maxStacks: Math.floor(e.dotMaxStacks),
      tickScale: 1 + e.dotTickPct / 100,
    }];
    const from = new THREE.Vector3(fromX, 1.0, fromZ);
    const n = Math.min(near.length, Math.floor(e.tideLeapMax));
    for (let i = 0; i < n; i++) {
      const t = near[i]!.t;
      t.applyStatuses(bleed, ctx);
      this.host.effects.projectile(from, new THREE.Vector3(t.root.position.x, 1.0, t.root.position.z), {
        element: 'physical', color: BLOOD, speed: 14, size: 0.16, arc: 1.2, impact: false, flare: false, trail: null,
      });
    }
    this.host.effects.fx.burst('blood', fromX, 0.8, fromZ, { count: 20, color: BLOOD });
  }

  /** Where the shield is held: in front of him, on his left. */
  private shieldAt(player: Player): THREE.Vector3 {
    const yaw = player.root.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // His left, seen from behind, is +x turned by his yaw.
    return this.v.set(player.position.x + fx * 0.4 + fz * 0.3, 1.15, player.position.z + fz * 0.4 - fx * 0.3);
  }

  /** Stored Retribution glints at the shield, faster and brighter as it fills. */
  private glow(dt: number): void {
    const p = this.keeper;
    if (!p) return;
    const stored = p.passiveState.retribution;
    if (stored <= 0 || !p.alive) return;
    this.glint -= dt;
    if (this.glint > 0) return;
    const fill = Math.min(1, stored / 300);
    this.glint = 0.55 - 0.4 * fill;
    const s = this.shieldAt(p);
    this.glintOpts.count = 2 + Math.round(6 * fill);
    this.glintOpts.scale = 0.5 + 0.6 * fill;
    this.host.effects.fx.burst('block', s.x, s.y, s.z, this.glintOpts);
  }

  // ---------------------------------------------------------------------------
  // Looks
  // ---------------------------------------------------------------------------

  /** Broken floor where a heavy body or blow comes down: crater, cracks, a ring of dust. */
  private groundBreak(x: number, z: number, radius: number, yaw: number, weight: number): void {
    const fx = this.host.effects;
    fx.decals.add('crater', x, z, 0.9 + radius * 0.18);
    fx.decals.add('shockwave', x, z, radius);
    for (let i = 0; i < 6; i++) {
      const a = yaw + (i * Math.PI) / 3 + 0.3;
      const r = radius * (0.32 + 0.12 * (i % 2));
      fx.decals.add('crack', x + Math.sin(a) * r, z + Math.cos(a) * r, 0.7 + radius * 0.08, a);
    }
    fx.fx.burst('dust', x, 0.25, z, { count: Math.round(28 * weight), ring: radius * 0.45, scale: 1.3, color: DUST });
    fx.fx.burst('chips.stone', x, 0.3, z, { count: Math.round(18 * weight) });
    fx.fx.burst('bossSlam', x, 0.1, z, { count: 10, scale: 0.8 * weight });
    fx.flash(x, 0.8, z, 0xffe0b0, 4 * weight, radius * 1.6, 0.14);
  }

  /** A weapon skill's own look at its contact frame. */
  private drawLook(c: KnightCast, look: Look): void {
    const p = c.player;
    const px = p.position.x;
    const pz = p.position.z;
    const dx = c.dir.x;
    const dz = c.dir.z;
    const yaw = yawOf(dx, dz);
    const fx = this.host.effects;
    switch (look) {
      case 'bash': {
        // Iron on bone: the boss of the shield rings.
        const x = px + dx * 1.05;
        const z = pz + dz * 1.05;
        fx.fx.burst('shieldHit', x, 1.1, z, { count: 16, dir: c.dir });
        fx.fx.burst('sparks', x, 1.1, z, { count: 10, dir: c.dir });
        fx.flash(x, 1.2, z, KNIGHT_GOLD, 3.5, 6, 0.1);
        fx.decals.add('ring', px + dx * 0.9, pz + dz * 0.9, 0.7);
        break;
      }
      case 'cleave': {
        const arc = (c.num('arc', 160) * Math.PI) / 180;
        const reach = c.num('radius', 2.8);
        this.steel().cut(px, pz, yaw, arc, reach, { y: 0.07, life: 0.36, sweep: 0.3 });
        this.steel().cut(px, pz, yaw, arc, reach * 0.92, { y: 1.05, life: 0.2, sweep: 0.4, bright: 0.55 });
        fx.fx.burst('puff.dust', px + dx * reach * 0.7, 0.12, pz + dz * reach * 0.7, { count: 10, scatter: reach * 0.5, color: DUST });
        break;
      }
      case 'rend':
      case 'sunder':
      case 'gash': {
        const t = this.frontmost(c, 2.4);
        if (!t) break;
        const tx = t.root.position.x;
        const tz = t.root.position.z;
        if (look === 'sunder') {
          // Plate split: shards and sparks off the body.
          fx.fx.burst('sparks', tx, 1.2, tz, { count: 16, dir: c.dir });
          fx.fx.burst('chips.stone', tx, 1.1, tz, { count: 10, dir: c.dir });
        } else {
          // A draw cut sprays sideways; a deep gash opens and pours.
          const side = look === 'rend' ? this.v.set(dz, 0.25, -dx) : this.v.set(dx, 0.5, dz);
          fx.fx.burst('blood', tx, 1.1, tz, { count: look === 'gash' ? 22 : 16, dir: side, color: BLOOD });
          fx.decals.add(look === 'gash' ? 'bloodSplatter' : 'blood', tx + dx * 0.6, tz + dz * 0.6, 0.8);
        }
        break;
      }
      case 'overhead': {
        const x = px + dx * 1.6;
        const z = pz + dz * 1.6;
        fx.decals.add('crack', x, z, 1.15, yaw);
        fx.fx.burst('chips.stone', x, 0.2, z, { count: 12 });
        fx.fx.burst('dust', x, 0.2, z, { count: 10, color: DUST });
        break;
      }
      case 'maim': {
        // A cut at the knees scrapes the floor.
        const x = px + dx * 1.2;
        const z = pz + dz * 1.2;
        fx.fx.burst('puff.dust', x, 0.12, z, { count: 12, dir: this.v.set(-dz, 0.1, dx), color: DUST });
        fx.decals.add('dust', x, z, 0.9, yaw + Math.PI / 2);
        break;
      }
      case 'ruin': {
        // The biggest blow in the tree: a crater, and the floor broken across the whole cone.
        const reach = c.num('radius', 5);
        const half = ((c.num('arc', 90) * Math.PI) / 180) * 0.5;
        const cx = px + dx * reach * 0.42;
        const cz = pz + dz * reach * 0.42;
        fx.decals.add('crater', cx, cz, 1.7);
        for (let i = 0; i < 5; i++) {
          const a = yaw + half * ((i / 2) - 1) * 0.85;
          const r = reach * (0.55 + 0.1 * (i % 3));
          fx.decals.add('crack', px + Math.sin(a) * r, pz + Math.cos(a) * r, 1.0 + 0.2 * (i % 2), a);
        }
        fx.decals.add('shockwave', cx, cz, reach * 0.7);
        fx.fx.burst('dust', cx, 0.3, cz, { count: 36, ring: 1.2, scale: 1.4, color: DUST });
        fx.fx.burst('chips.stone', cx, 0.4, cz, { count: 24 });
        fx.fx.burst('bossSlam', cx, 0.1, cz, { count: 12 });
        fx.flash(cx, 0.9, cz, 0xffe0b0, 6, 10, 0.16);
        break;
      }
    }
  }

  /** The living body nearest the hero within `reach` in front of him. */
  private frontmost(c: KnightCast, reach: number): Target | null {
    const p = c.player.position;
    let best: Target | null = null;
    let bestD = Infinity;
    const test = (t: Target): void => {
      if (t.life <= 0) return;
      const dx = t.root.position.x - p.x;
      const dz = t.root.position.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + t.hitRadius || d >= bestD) return;
      if (d > t.hitRadius && (dx * c.dir.x + dz * c.dir.z) / Math.max(0.01, d) < 0.3) return;
      best = t;
      bestD = d;
    };
    for (const e of c.enemies) test(e);
    if (c.boss) test(c.boss);
    return best;
  }
}
