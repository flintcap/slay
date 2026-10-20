/**
 * SLAY — the Paladin's Aura tree: vigils, vows and censures (effect family `vigil`).
 *
 * A vigil is lit by one press and burns until he presses it again, lights
 * another, or dies. One at a time; two with Twin Wick, the older going out
 * when a third is lit. Its ring of candles sits at his feet
 * (`fx/paladin/VigilRing.ts`) and works twice a second on whatever stands
 * inside it:
 *
 *   self  a status on him, at the rank's numbers (Tallow Light, Iron Vigil, Fervour)
 *   foe   a status on every enemy in the ring (Censer Smoke, Writ of Ash, Consecrated Ground)
 *   burn  fire on every enemy in the ring (Smouldering Rood)
 *   toll  every few seconds, a blow on every enemy in the ring (Tolling Bell)
 *
 * Penitent Ground, Vespers and Ember Saint ride on the same tick, whatever
 * burns. The rest of the tree is one press, one thing: Anoint and Martyr's
 * Vow on him, Censure on one enemy (and on the next when it dies), The Last
 * Hour's falling bell on one enemy.
 *
 * What a vigil is lit with is kept per character, so it outlives a level: a
 * fresh runner picks it up on its first tick and draws the ring again.
 * What a rank buys is in `data/skillPower.ts` (SELF_POWER / FOE_POWER), or
 * the skill's damage ladder.
 */
import * as THREE from 'three';
import type { Character, DamagePacket, SkillDef, StatusApplication, Stats } from '../../types';
import type { CombatContext, Enemy } from '../../entities/Enemy';
import type { Boss } from '../../entities/Boss';
import type { Player } from '../../entities/Player';
import type { HitKind } from '../../fx/CombatFeel';
import type { BurstOpts } from '../../fx/Particles';
import { FOE_POWER, SELF_POWER, scaleMods, scaleShred } from '../../data/skillPower';
import { SKILL_BY_ID } from '../../data/skills';
import { bendFor, bentKnob, type SkillBend } from '../../data/skillBends';
import { rollDamage, skillDamageScale } from '../../sim/Combat';
import { skillRank } from '../../sim/Character';
import { skillSound } from '../../audio/SkillSounds';
import { skillAction } from '../../art/hero/SkillActions';
import { VigilRing, type RingLook } from '../../fx/paladin/VigilRing';
import { BRONZE, paladinFX, tickPaladinFX } from '../../fx/paladin/RiteLooks';
import { pickOne, type RiteCast, type RiteHost } from './Rites';

type Target = Enemy | Boss;
type World = { ctx: CombatContext; enemies: Enemy[]; boss: Boss | null };

/** What the runner lends a vigil: a rite's host, and blows on an area. */
export interface VigilHost extends RiteHost {
  /** Every target within `radius` of `centre` takes a fresh packet, weaker toward the edge. Returns damage dealt. */
  area(centre: THREE.Vector3, radius: number, packet: () => DamagePacket, ctx: CombatContext, enemies: Enemy[], boss: Boss | null, kind: HitKind): number;
  /** The same, but as hard at the edge as at the middle: a vigil's ring. */
  flat(centre: THREE.Vector3, radius: number, packet: () => DamagePacket, ctx: CombatContext, enemies: Enemy[], boss: Boss | null, kind: HitKind): number;
}

/** One press of an Aura skill. */
export interface VigilCast extends RiteCast {
  /** Seconds one use takes at the hero's cast speed (the skill's own `castTime`, `sim/Speed.ts`). */
  castTime: number;
}

/** Seconds between a vigil's ticks. */
const TICK = 0.5;
/** A tick's status outlasts the next tick, so it never flickers off. */
const HOLD = 1.4;
/** Twin Wick's second ring sits this much further out, so the two read apart. */
const SECOND_RING = 0.3;
/** The ring drawn at his feet, in metres: a small circle, whatever the vigil reaches. */
const DRAWN_RING = 1.1;
/** Censure's leap, seen: a puff of ash every this many metres from the dead to the next. */
const ASH_STEP = 0.7;
const ASH_LINE: BurstOpts = { count: 4, scale: 0.8, color: 0x6a625a };
const centre = new THREE.Vector3();

interface Ring {
  kind: 'self' | 'foe' | 'burn' | 'toll';
  status?: string;
  look: RingLook;
}

const RINGS: Record<string, Ring> = {
  tallowLight: { kind: 'self', status: 'tallowLit', look: { tint: 0xe8b860, candles: 9, flame: 1, band: 0.8, spin: 0.05 } },
  ironVigil: { kind: 'self', status: 'ironVigil', look: { tint: 0x8fa2b8, candles: 6, flame: 0.8, band: 0.5, spin: 0 } },
  fervour: { kind: 'self', status: 'fervent', look: { tint: 0xe86a30, candles: 8, flame: 1.35, band: 0.7, spin: 0.35 } },
  smoulderingRood: { kind: 'burn', look: { tint: 0xd8501c, candles: 7, flame: 1.5, band: 1, spin: -0.08 } },
  censerSmoke: { kind: 'foe', status: 'choking', look: { tint: 0x9a8a70, candles: 5, flame: 0.7, band: 0.6, spin: 0.12 } },
  tollingBell: { kind: 'toll', look: { tint: 0xd8b068, candles: 4, flame: 1, band: 0.5, spin: 0 } },
  writOfAsh: { kind: 'foe', status: 'ashWrit', look: { tint: 0xb07040, candles: 10, flame: 0.9, band: 0.7, spin: -0.04 } },
  consecratedGround: { kind: 'foe', status: 'consecrated', look: { tint: 0xf0d080, candles: 12, flame: 0.9, band: 1.2, spin: 0.02 } },
};

interface Lit {
  id: string;
  ring: VigilRing | null;
  /** Seconds since the last toll (Tolling Bell). */
  pulse: number;
}

interface Censure {
  t: Target;
  left: number;
  app: StatusApplication;
  /** How far it looks for the next enemy when its target dies. */
  leap: number;
}

interface Watch {
  lit: Lit[];
  /** Rings going out, still fading. */
  dying: VigilRing[];
  acc: number;
  censures: Censure[];
  /** Enemies inside a ring at the last tick (Ember Saint counts the dead). */
  inside: Set<Target>;
}

const WATCH = new WeakMap<Character, Watch>();

function watchOf(c: Character): Watch {
  let w = WATCH.get(c);
  if (!w) {
    w = { lit: [], dying: [], acc: 0, censures: [], inside: new Set() };
    WATCH.set(c, w);
  }
  return w;
}

/** Reads a skill's own params the runner's way, as a worn unique bends them. */
function reader(def: SkillDef, bend: SkillBend | null): (k: string, d: number) => number {
  const params = def.params ?? {};
  return (k, d) => {
    const v = params[k];
    return bentKnob(bend, k, typeof v === 'number' ? v : d);
  };
}

/** True when the skill is an Aura skill this module runs. */
export function isVigil(skillId: string): boolean {
  return skillId in RINGS || skillId in ACTS;
}

/** The ids of the vigils burning for this character, oldest first. */
export function litVigils(c: Character): string[] {
  return WATCH.get(c)?.lit.map((l) => l.id) ?? [];
}

/** Puts one vigil out: its ring fades, and what it gave him ends now. */
function putOut(w: Watch, i: number, player: Player): void {
  const lit = w.lit[i];
  if (!lit) return;
  w.lit.splice(i, 1);
  if (lit.ring) {
    lit.ring.putOut();
    w.dying.push(lit.ring);
  }
  const status = RINGS[lit.id]?.status;
  if (RINGS[lit.id]?.kind === 'self' && status && player.status.remove(status)) player.refreshStats();
  if (!w.lit.length && player.status.remove('vespers')) player.refreshStats();
}

/**
 * A burning vigil pressed again goes out, free. Checked before mana: true
 * means the press is spent on putting it out.
 */
export function snuffVigil(def: SkillDef, player: Player): boolean {
  if (!RINGS[def.id]) return false;
  const w = WATCH.get(player.character);
  const i = w ? w.lit.findIndex((l) => l.id === def.id) : -1;
  if (!w || i < 0) return false;
  putOut(w, i, player);
  return true;
}

// --- one press -----------------------------------------------------------------

interface Act {
  clip: string;
  /** Lets go on the gesture's own frame (`SkillRunner.atRelease`), not on the press. */
  release?: boolean;
  run(r: VigilCast, host: VigilHost): void;
}

const ACTS: Record<string, Act> = {
  anoint: {
    clip: 'cast',
    run(r) {
      selfPower(r, 'anointed');
    },
  },
  martyrsVow: {
    clip: 'cast',
    run(r) {
      selfPower(r, 'martyred');
    },
  },
  censure: {
    clip: 'point',
    release: true,
    run(r, host) {
      const p = r.player;
      const t = pickOne(p, r.aim, r.enemies, r.boss, r.num('range', 14));
      if (t) p.faceTowards(t.root.position.x, t.root.position.z);
      if (t) r.landAt = t.root.position.clone().setY(0);
      host.atRelease(p, () => {
        if (!t || t.life <= 0) return;
        const k = Math.max(0, r.rank - 1);
        const pw = FOE_POWER.censure?.(k, r.num) ?? {};
        const app: StatusApplication = { id: 'censured', duration: pw.duration ?? 8, magnitude: 1, stacks: 1 };
        if (pw.mods) app.mods = pw.mods;
        t.applyStatuses([app], r.ctx);
        const w = watchOf(p.character);
        // One censure at a time per enemy; a fresh one replaces the old.
        w.censures = w.censures.filter((c) => c.t !== t);
        w.censures.push({ t, left: app.duration, app, leap: r.num('leap', 8) });
        host.sound(r.hitSound, t.root.position.x, t.root.position.z);
      });
    },
  },
  lastHour: {
    clip: 'point',
    release: true,
    run(r, host) {
      const p = r.player;
      const t = pickOne(p, r.aim, r.enemies, r.boss, r.num('range', 12));
      if (t) p.faceTowards(t.root.position.x, t.root.position.z);
      if (t) r.landAt = t.root.position.clone().setY(0);
      // The great bell is called on the release, over the one it names, and
      // takes its time to fall; once called it comes down whatever he does next.
      host.atRelease(p, () => {
        if (!t || t.life <= 0) return;
        paladinFX(host.effects).bell.call(host.effects, t.root.position.x, t.root.position.z, r.num('fall', 0.7), 1, () => {
          if (!p.alive || t.life <= 0) return;
          const pk = r.packet(1);
          pk.applies = [...(pk.applies ?? []), { id: 'rung', duration: r.num('ring', 1.5), magnitude: 1, stacks: 1 }];
          host.land(t, pk, 'heavy', t.root.position.x, t.root.position.z, r);
          host.sound(r.hitSound, t.root.position.x, t.root.position.z);
        }, t.root);
      });
    },
  },
};

/** A vow on himself at this rank: the status, its numbers, its ward. */
function selfPower(r: VigilCast, status: string): void {
  const p = r.player;
  const k = Math.max(0, r.rank - 1);
  const pw = SELF_POWER[r.def.id]?.(k, r.num) ?? {};
  const absorb =
    pw.absorb !== undefined || pw.absorbLifePct !== undefined
      ? (pw.absorb ?? 0) + p.stats.life * (pw.absorbLifePct ?? 0) / 100
      : undefined;
  p.applyStatus(status, pw.duration ?? r.num('duration', 10), 1, 1, { mods: pw.mods, absorb });
}

/** Runs one press of an Aura skill. The runner has already paid for it. */
export function castVigil(host: VigilHost, r: VigilCast): void {
  const p = r.player;
  const act = ACTS[r.def.id];
  if (act) {
    p.beginAction(skillAction(r.def.id) ?? act.clip, r.castTime, undefined, { release: act.release ?? false });
    act.run(r, host);
    return;
  }
  if (!RINGS[r.def.id]) return;
  p.beginAction(skillAction(r.def.id) ?? 'cast', r.castTime);
  const w = watchOf(p.character);
  if (w.lit.some((l) => l.id === r.def.id)) return;
  // A toll rings as soon as the bell is hung.
  w.lit.push({ id: r.def.id, ring: null, pulse: r.num('every', 3) });
  const slots = Math.max(1, p.passives.pal.vigilSlots);
  while (w.lit.length > slots) putOut(w, 0, p);
  // The first tick is now, not half a second from now.
  w.acc = TICK;
}

// --- the burning -----------------------------------------------------------------

/** How far a vigil reaches for this hero: its own `radius` (as bent), then Wide Wick and aura reach on top. */
function reachOf(player: Player, ctx: CombatContext, num: (k: string, d: number) => number): number {
  return num('radius', 5) * (1 + player.passives.pal.vigilRadiusPct / 100) + (ctx.auraRadiusBonus ?? 0);
}

/** A packet for a vigil's blows, rolled at the hero's numbers now (a bend's more damage on top). */
function packetOf(player: Player, def: SkillDef, ctx: CombatContext, mult: number, bend: SkillBend | null): DamagePacket {
  const scale = skillDamageScale(player.character.skills, player.stats.skillLevels, def.id) * mult * (1 + (bend?.more ?? 0) / 100);
  return rollDamage(player.stats, ctx.rng, { scale, type: def.damageType ?? 'physical', ability: def.name, source: 'player' });
}

/**
 * Every frame: rings follow him, censures find their next, and twice a second
 * each burning vigil does what it does.
 */
export function tickVigils(host: VigilHost, player: Player, dt: number, world: World): void {
  // The censer and the great bell play out whatever burns.
  tickPaladinFX(host.effects, dt);
  const w = WATCH.get(player.character);
  if (!w) return;
  for (let i = w.dying.length - 1; i >= 0; i--) {
    const ring = w.dying[i]!;
    const at = player.position;
    if (!ring.update(dt, at.x, at.y, at.z, 1)) w.dying.splice(i, 1);
  }
  tickCensures(host, w, dt, world);
  if (!player.alive) {
    while (w.lit.length) putOut(w, 0, player);
    return;
  }
  if (!w.lit.length) return;
  const scene = host.effects.scene;
  w.lit.forEach((lit, slot) => {
    lit.pulse += dt;
    // A new level is a new scene: the ring is drawn again there.
    if (lit.ring && lit.ring.scene !== scene) {
      lit.ring.dispose();
      lit.ring = null;
    }
    const look = RINGS[lit.id]?.look;
    if (!lit.ring && look) lit.ring = new VigilRing(scene, look, slot * 1.7);
    // Drawn small at his feet (owner); what it reaches is still `radius`.
    lit.ring?.update(dt, player.position.x, player.position.y, player.position.z, DRAWN_RING + slot * SECOND_RING);
  });
  w.acc += dt;
  if (w.acc < TICK) return;
  w.acc = Math.min(w.acc - TICK, TICK);
  pulse(host, player, w, world);
}

/** True when `t` lives and stands within `radius` of `me`. */
function within(t: Target, me: THREE.Vector3, radius: number): boolean {
  return t.life > 0 && Math.hypot(t.root.position.x - me.x, t.root.position.z - me.z) <= radius + t.hitRadius;
}

function pulse(host: VigilHost, player: Player, w: Watch, world: World): void {
  const { ctx, enemies, boss } = world;
  const pal = player.passives.pal;
  const power = 1 + pal.vigilPowerPct / 100;
  const me = player.position;
  // Each vigil reads its own knobs, as worn gear bends them, and reaches its own way.
  const lits = w.lit.map((lit) => {
    const def = SKILL_BY_ID[lit.id];
    const bend = def ? bendFor(player.character, lit.id) : null;
    const num = def ? reader(def, bend) : (_k: string, d: number) => d;
    return { lit, def, bend, num, radius: reachOf(player, ctx, num) };
  });
  // Penitent Ground and Ember Saint ride on any vigil: as far as the widest reaches.
  let widest = 0;
  for (const l of lits) widest = Math.max(widest, l.radius);
  const inRing: Target[] = [];
  for (const e of enemies) if (within(e, me, widest)) inRing.push(e);
  if (boss && within(boss, me, widest)) inRing.push(boss);

  // Ember Saint: what was kneeling in the ring last tick and is dead now.
  if (pal.emberHealPct > 0) {
    let dead = 0;
    for (const t of w.inside) if (t.life <= 0) dead++;
    if (dead) player.heal(player.stats.life * pal.emberHealPct * dead / 100);
  }
  w.inside = new Set(inRing);

  centre.set(me.x, 0, me.z);
  for (let i = lits.length - 1; i >= 0; i--) {
    const { lit, def, bend, num, radius } = lits[i]!;
    const ring = RINGS[lit.id];
    const rank = skillRank(player.character, lit.id);
    // Points taken back out at the shrine put the candles out too.
    if (!def || !ring || rank <= 0) {
      putOut(w, w.lit.indexOf(lit), player);
      continue;
    }
    const k = rank - 1;
    switch (ring.kind) {
      case 'self': {
        const raw = SELF_POWER[lit.id]?.(k, num).mods;
        const mods = raw && power !== 1 ? scaleMods(raw, power) : raw;
        if (ring.status) player.applyStatus(ring.status, HOLD, 1, 1, { mods });
        break;
      }
      case 'foe': {
        if (!ring.status || !inRing.length) break;
        const raw = FOE_POWER[lit.id]?.(k, num).mods;
        const mods = raw && power !== 1 ? scaleShred(raw, power) : raw;
        const app: StatusApplication = { id: ring.status, duration: HOLD, magnitude: 1, stacks: 1 };
        if (mods) app.mods = mods;
        for (const t of inRing) if (within(t, me, radius)) t.applyStatuses([app], ctx);
        break;
      }
      case 'burn': {
        if (!inRing.length) break;
        host.flat(centre, radius, () => packetOf(player, def, ctx, power, bend), ctx, enemies, boss, 'proc');
        break;
      }
      case 'toll': {
        const every = num('every', 3);
        if (lit.pulse < every) break;
        lit.pulse = 0;
        const ringSec = num('ring', 0.3) + num('ringPerRank', 0.02) * k;
        host.flat(centre, radius, () => {
          const p = packetOf(player, def, ctx, power, bend);
          p.applies = [...(p.applies ?? []), { id: 'rung', duration: ringSec, magnitude: 1, stacks: 1 }];
          return p;
        }, ctx, enemies, boss, 'area');
        // The toll is seen: a bronze ring of sound out to where it really reaches.
        host.effects.nova(me.x, me.z, radius, { color: BRONZE, duration: 0.5, thickness: 0.08, particles: false });
        host.sound(skillSound(lit.id).hit, me.x, me.z);
        break;
      }
    }
  }

  // Penitent Ground: whatever burns, the floor inside it makes them kneel.
  if (pal.penitentShred > 0 && inRing.length) {
    const s = pal.penitentShred * power;
    const mods: Partial<Stats> = { physicalResist: -s, fireResist: -s };
    for (const t of inRing) t.applyStatuses([{ id: 'penitent', duration: HOLD, magnitude: 1, stacks: 1, mods }], ctx);
  }
  // Vespers: the evening office, said under any vigil.
  if (pal.vespersRegen > 0 || pal.vespersDR > 0) {
    player.applyStatus('vespers', HOLD, 1, 1, { mods: { lifeRegen: pal.vespersRegen, damageReduction: pal.vespersDR } });
  }
}

/** A censure on a dead enemy finds the nearest live one within its leap. */
function tickCensures(host: VigilHost, w: Watch, dt: number, world: World): void {
  for (let i = w.censures.length - 1; i >= 0; i--) {
    const c = w.censures[i]!;
    c.left -= dt;
    if (c.left <= 0.2) {
      w.censures.splice(i, 1);
      continue;
    }
    if (c.t.life > 0) continue;
    const from = c.t.root.position;
    let best: Target | null = null;
    let bestD = c.leap;
    const consider = (t: Target): void => {
      if (t.life <= 0 || t === c.t || t.hasStatus('censured')) return;
      const d = Math.hypot(t.root.position.x - from.x, t.root.position.z - from.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    };
    for (const e of world.enemies) consider(e);
    if (world.boss) consider(world.boss);
    const next = best as Target | null;
    if (!next) {
      w.censures.splice(i, 1);
      continue;
    }
    c.app = { ...c.app, duration: c.left };
    next.applyStatuses([c.app], world.ctx);
    ashLine(host, from.x, from.z, next.root.position.x, next.root.position.z);
    c.t = next;
  }
}

/** The censure's leap, seen: a thin line of ash from the dead to the next. */
function ashLine(host: VigilHost, ax: number, az: number, bx: number, bz: number): void {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.min(12, Math.max(2, Math.ceil(len / ASH_STEP)));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    host.effects.fx.burst('ash', ax + (bx - ax) * u, 0.9, az + (bz - az) * u, ASH_LINE);
  }
}
