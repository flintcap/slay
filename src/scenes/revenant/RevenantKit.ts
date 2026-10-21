/**
 * SLAY — the Revenant's skills that are more than their effect family.
 *
 * `SkillRunner.castNow` hands a skill listed in `KIT` to `RevenantKit.cast`
 * with the same `SpellCast` the Mage's spells get, and the same host: blows
 * land through the runner's own pipeline (tune, strike, afterHit), so a
 * Revenant blow is tuned, felt and counted like any other.
 *
 * Femur Lance flies as a mover (`MageSpells.launch`), so it strikes each body
 * when it passes it. Hunting Skull homes on its mark and turns on another if
 * the mark dies. Bone Cage is one hit and a root, not a field. Doom and Soul
 * Cage take one enemy. Gravewalk sinks the Revenant into the floor and brings
 * him up at the point, where grave-hands hold what stands near.
 *
 * What lasts after the cast (the storm's shards, the cage's ribs, the hands,
 * the tether's chain, the form's skulls) is drawn by `fx/revenant/RevenantFX.ts`
 * through `looks`, which this kit drives each frame.
 */
import * as THREE from 'three';
import type { DamagePacket, StatusApplication } from '../../types';
import type { CombatContext, Enemy } from '../../entities/Enemy';
import type { Boss } from '../../entities/Boss';
import type { MageSpells, SpellCast, SpellHost, SpellWorld } from '../mage/Spells';
import { atRank, boostRank } from '../../fx/kit/Boost';
import { skillSound } from '../../audio/SkillSounds';
import { RevenantFX } from '../../fx/revenant/RevenantFX';

type Target = Enemy | Boss;

/** What the runner lends the Revenant's kit: the Mage's host, and where a hero may stand. */
export interface RevenantHost extends SpellHost {
  /** True when the hero can stand at this point (no wall, no prop). */
  stand(x: number, z: number): boolean;
}

/** A Doom brand burning down on one enemy. */
interface Doom {
  t: Target;
  /** When it goes off, on the kit's clock. */
  at: number;
  /** How far it may jump when its mark dies first. */
  leap: number;
  packet: () => DamagePacket;
  world: SpellWorld;
  color: number;
  school: SpellCast['school'];
  sound: string | null;
  rank: number;
}

/** How far from the aim a single-target curse or the skull looks for its mark. */
const PICK = 4;
/** How far a Hunting Skull looks for a new mark when its own dies. */
const RESEEK = 12;

function ground(a: THREE.Vector3, x: number, z: number): number {
  return Math.hypot(a.x - x, a.z - z);
}

/** A number that grows with rank: `key` at rank 1, plus `perKey` each rank after. */
function ranked(s: SpellCast, key: string, base: number, perKey: string): number {
  return s.num(key, base) + s.num(perKey, 0) * Math.max(0, s.rank - 1);
}

/** The living enemy nearest (x, z) within `reach` (plus its size), or null. */
function nearest(w: SpellWorld, x: number, z: number, reach: number, skip?: Target): Target | null {
  let best: Target | null = null;
  let bestD = Infinity;
  const n = w.enemies.length;
  for (let i = 0; i <= n; i++) {
    const t: Target | null = i < n ? w.enemies[i]! : w.boss;
    if (!t || t === skip || t.life <= 0) continue;
    const d = ground(t.root.position, x, z) - t.hitRadius;
    if (d <= reach && d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** The Revenant's own skills and what they leave in the world. One per runner. */
export class RevenantKit {
  private dooms: Doom[] = [];
  private time = 0;
  private drawn: RevenantFX | null = null;

  constructor(readonly host: RevenantHost, private readonly movers: MageSpells) {}

  /** His lasting looks (`fx/revenant/RevenantFX.ts`), made on first use. */
  get looks(): RevenantFX {
    return (this.drawn ??= new RevenantFX(this.host.effects));
  }

  /** True for a skill this module casts. */
  static casts(id: string): boolean {
    return Object.hasOwn(KIT, id);
  }

  cast(s: SpellCast): void {
    KIT[s.def.id]?.(s, this);
  }

  /** Brings a world captured at the cast up to this frame's lists. */
  fresh(w: SpellWorld): SpellWorld {
    return this.movers.fresh(w);
  }

  /** Draws without the drawing making its own sound: the skill already has one. */
  quiet(fn: () => void): void {
    this.movers.quiet(fn);
  }

  /** Sends a lance flying: it strikes each body as it passes it. */
  launch(s: SpellCast, dir: THREE.Vector3, o: Parameters<MageSpells['launch']>[2]): void {
    this.movers.launch(s, dir, o);
  }

  /** Brands `t` with Doom: it goes off in `fuse` seconds, jumping on if `t` dies first. */
  doom(s: SpellCast, t: Target, fuse: number, leap: number): void {
    this.dooms = this.dooms.filter((d) => d.t !== t);
    this.dooms.push({
      t, at: this.time + fuse, leap, world: s.world, color: s.color, school: s.school, rank: boostRank(),
      // The burst has its own blast, heard where it goes off.
      sound: skillSound(s.def.id).hit,
      // The burst does not brand again.
      packet: () => {
        const p = s.packet();
        const rest = p.applies?.filter((a) => a.id !== 'doomed');
        return { ...p, applies: rest?.length ? rest : undefined };
      },
    });
    this.mark(t, fuse, s.world.ctx);
  }

  update(dt: number): void {
    this.drawn?.update(dt);
    const live = this.host.live();
    if (!live) return;
    this.time += dt;
    for (let i = this.dooms.length - 1; i >= 0; i--) {
      const d = this.dooms[i]!;
      d.world.ctx = live.ctx;
      d.world.enemies = live.enemies;
      d.world.boss = live.boss;
      const left = d.at - this.time;
      if (d.t.life <= 0) {
        // It died first: the brand jumps to the nearest enemy in reach, keeping its time.
        const from = d.t.root.position;
        const to = nearest(d.world, from.x, from.z, d.leap, d.t);
        if (!to || left <= 0.05) {
          this.dooms.splice(i, 1);
          continue;
        }
        const a = new THREE.Vector3(from.x, 1.2, from.z);
        const c = new THREE.Vector3(to.root.position.x, 1.2, to.root.position.z);
        atRank(d.rank, () => this.quiet(() => {
          this.host.effects.projectile(a, c, { element: d.school, color: d.color, size: 0.2, speed: 16, arc: 0.9 });
        }));
        d.t = to;
        this.mark(to, left, live.ctx);
        continue;
      }
      if (left > 0) continue;
      this.dooms.splice(i, 1);
      const p = d.t.root.position;
      atRank(d.rank, () => {
        this.quiet(() => this.host.effects.explosion(p.x, 0.9, p.z, { radius: 1.6, element: d.school, color: d.color, shake: 0.2 }));
        this.host.hit(d.t, d.packet(), 'area', p.x, p.z, d.world);
      });
      this.host.sound(d.sound, p.x, p.z);
    }
  }

  /** Forgets every brand: a new level. */
  clear(): void {
    this.dooms.length = 0;
    this.drawn?.clear();
  }

  /** The Doomed status, for exactly the time the brand has left. */
  private mark(t: Target, left: number, ctx: CombatContext): void {
    t.applyStatuses([{ id: 'doomed', duration: Math.max(0.1, left), magnitude: 1, stacks: 1 }], ctx);
  }
}

// --- the skills -------------------------------------------------------------------

type Cast = (s: SpellCast, k: RevenantKit) => void;

/** A lance of femur that strikes everything it passes, as it passes it. */
const femurLance: Cast = (s, k) => {
  s.player.beginAction(s.clip, s.actTime);
  const count = Math.max(1, Math.floor(s.num('count', 1)));
  const arc = s.num('arc', 0);
  const spread = count > 1 ? (arc > 0 ? ((arc * Math.PI) / 180) / (count - 1) : 0.16) : 0;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const a = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
    const d = a === 0 ? s.dir : s.dir.clone().applyAxisAngle(up, a);
    k.launch(s, d, {
      speed: s.num('speed', 24),
      range: s.num('range', 16),
      reach: s.num('radius', 0.42),
      size: s.num('size', 0.42),
      hits: Math.floor(s.num('pierce', 0)) + 1,
      kind: 'projectile',
      flare: i === 0,
      packet: () => s.packet(),
    });
  }
};

/** A skull that hunts its mark, and turns on the nearest enemy if the mark dies first. */
const huntingSkull: Cast = (s, k) => {
  s.player.beginAction(s.clip, s.actTime);
  const world = s.world;
  const range = s.num('range', 20);
  const p = s.player.position;
  const want = Math.min(range, Math.max(1, ground(s.aim, p.x, p.z)));
  const aimX = p.x + s.dir.x * want;
  const aimZ = p.z + s.dir.z * want;
  let mark = nearest(world, s.aim.x, s.aim.z, PICK) ?? nearest(world, aimX, aimZ, PICK);
  const last = new THREE.Vector3(aimX, 1.0, aimZ);
  const seek = new THREE.Vector3();
  const follow = (): THREE.Vector3 | null => {
    if (!mark || mark.life <= 0) {
      k.fresh(world);
      mark = nearest(world, last.x, last.z, RESEEK);
    }
    if (!mark) return null;
    last.set(mark.root.position.x, 1.0, mark.root.position.z);
    return seek.copy(last);
  };
  const to = mark ? new THREE.Vector3(mark.root.position.x, 1.0, mark.root.position.z) : last.clone();
  const from = s.origin.clone();
  k.host.effects.projectile(from, to, {
    element: s.school,
    color: s.color,
    size: s.num('size', 0.34) * s.sig.size,
    speed: s.num('speed', 12),
    shed: s.sig.trail,
    flare: !s.released,
    homing: 1,
    target: follow,
    shape: 'skull',
    onHit: (at) => {
      k.fresh(world);
      // It never misses: it strikes its mark wherever the mark got to.
      const t = mark && mark.life > 0 ? mark : nearest(world, at.x, at.z, 2);
      if (!t) return;
      k.host.hit(t, s.packet(), 'projectile', from.x, from.z, world);
      k.host.sound(s.hitSound, t.root.position.x, t.root.position.z);
    },
  });
  if (mark) s.landAt = mark.root.position.clone().setY(0);
};

/** Ribs burst up in a ring: one blow, and everything inside is held while they stand. */
const boneCage: Cast = (s, k) => {
  s.player.beginAction(s.clip, s.actTime);
  const at = new THREE.Vector3(s.aim.x, 0, s.aim.z);
  const radius = s.num('radius', 4);
  // The ribs stand exactly as long as the root they lay (the packet's rider).
  const hold = ranked(s, 'root', 3, 'rootPerRank');
  s.landAt = at;
  k.quiet(() => {
    k.host.effects.field(at.x, at.z, radius, hold, { school: s.school, color: s.color, skill: s.def.id, rank: s.rank });
    k.host.effects.nova(at.x, at.z, radius, { element: s.school, color: s.color, emitter: s.sig.emitter, density: s.sig.density });
  });
  k.host.area(at, radius, (m = 1) => s.packet(m), s.world);
  k.looks.cage(at.x, at.z, radius, hold);
};

/** One enemy, branded: it goes off when the time runs out, wherever it walked to. */
const doom: Cast = (s, k) => {
  s.player.beginAction(s.clip, s.actTime);
  const t = nearest(s.world, s.aim.x, s.aim.z, PICK);
  if (!t) return;
  const at = t.root.position;
  s.landAt = at.clone().setY(0);
  // The rest of what the curse carries (an item's rider) still lands now.
  const rest = s.riders().filter((a) => a.id !== 'doomed');
  if (rest.length) t.applyStatuses(rest, s.world.ctx);
  k.doom(s, t, s.num('delay', 6), s.num('jump', 8));
  k.quiet(() => k.host.effects.impact(s.school, at.x, 1.2, at.z, { color: s.color, scale: 0.8, decal: false, shake: 0, sfx: null }));
};

/** One soul, trapped: the target only, held by grave-hands for the time. */
const soulCage: Cast = (s, k) => {
  s.player.beginAction(s.clip, s.actTime);
  const t = nearest(s.world, s.aim.x, s.aim.z, PICK);
  if (!t) return;
  const at = t.root.position;
  s.landAt = at.clone().setY(0);
  const holds: StatusApplication[] = s.riders();
  t.applyStatuses(holds, s.world.ctx);
  let hold = 0;
  for (const a of holds) hold = Math.max(hold, a.duration);
  k.looks.hold(t, hold > 0 ? hold : s.num('duration', 12));
  k.quiet(() => {
    k.host.effects.impact(s.school, at.x, 1.0, at.z, { color: s.color, scale: 0.9, decal: false, shake: 0, sfx: null });
    k.host.effects.nova(at.x, at.z, t.hitRadius + 1.1, { element: s.school, color: s.color, emitter: s.sig.emitter, density: s.sig.density * 0.6 });
  });
};

/**
 * The Revenant sinks into the floor and claws back up at the point. Where he
 * rises, grave-hands hold what stands near, and every one held feeds him.
 */
const gravewalk: Cast = (s, k) => {
  s.player.beginAction(s.clip, s.actTime);
  const p = s.player.position;
  const range = ranked(s, 'range', 8, 'rangePerRank');
  const want = Math.min(range, ground(s.aim, p.x, p.z));
  let go = k.host.clear(p, s.dir, want, s.world.ctx, 0.5);
  // Never up inside a prop: step back along the way until there is floor.
  while (go > 0 && !k.host.stand(p.x + s.dir.x * go, p.z + s.dir.z * go)) go = Math.max(0, go - 0.5);
  const land = new THREE.Vector3(p.x + s.dir.x * go, 0, p.z + s.dir.z * go);
  const effects = k.host.effects;
  k.quiet(() => {
    effects.fx.burst('dust', p.x, 0.2, p.z, { count: 16 });
    effects.teleportOut(p.x, 0.5, p.z, s.color);
  });
  p.set(land.x, 0, land.z);
  s.landAt = land;
  const radius = s.num('radius', 3);
  const hold: StatusApplication[] = [{ id: 'grasped', duration: ranked(s, 'grasp', 1, 'graspPerRank'), magnitude: 1, stacks: 1 }];
  k.quiet(() => {
    effects.teleportIn(land.x, 0.5, land.z, s.color);
    effects.fx.burst('dust', land.x, 0.2, land.z, { count: 20 });
    effects.nova(land.x, land.z, radius, { element: s.school, color: s.color, emitter: s.sig.emitter, density: s.sig.density });
  });
  let held = 0;
  const w = s.world;
  const n = w.enemies.length;
  const caught: Target[] = [];
  for (let i = 0; i <= n; i++) {
    const t: Target | null = i < n ? w.enemies[i]! : w.boss;
    if (!t || t.life <= 0 || ground(t.root.position, land.x, land.z) > radius + t.hitRadius) continue;
    t.applyStatuses(hold, w.ctx);
    caught.push(t);
    k.host.hit(t, s.packet(), 'area', land.x, land.z, w);
    held++;
  }
  if (held > 0) s.player.heal(s.player.stats.life * (s.num('healPct', 3) / 100) * held);
  k.looks.grasp(land.x, land.z, radius, hold[0]!.duration, caught);
};

const KIT: Readonly<Record<string, Cast>> = {
  boneSpear: femurLance,
  boneSpirit: huntingSkull,
  boneCage,
  doomBrand: doom,
  soulCage,
  gravewalk,
};
