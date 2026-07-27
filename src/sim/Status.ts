/**
 * SLAY — runtime status effect system.
 *
 * One `StatusContainer` per combatant (the player and every live monster).
 * The container owns application, stacking, refresh, expiry, damage-over-time
 * ticking, immunity and crowd-control diminishing returns.
 *
 * The simulation never mutates stats directly: a container exposes `statMods()`
 * and raises a dirty flag, and `Stats.computeStats` folds those mods in on the
 * next recompute. That keeps a single source of truth for the stat sheet.
 */

import type { DamageType, StatKey, Stats, StatusApplication } from '../types';
import {
  CC_DIMINISHING,
  CC_DR_WINDOW,
  STATUS_BY_ID,
  type StatusDef,
  type StatusTag,
} from '../data/statuses';

export interface ActiveStatus {
  id: string;
  def: StatusDef;
  /** Seconds left. */
  remaining: number;
  /** Duration this application was granted, for UI radial timers. */
  duration: number;
  /** Scales dot/hot/absorb magnitude. 1 is the reference value in the def. */
  magnitude: number;
  stacks: number;
  /** Entity id that applied it — needed for life steal attribution and thorns. */
  sourceId: string;
  /** Remaining absorb pool for shield-style effects. */
  absorb: number;
  /** Accumulator so DoTs tick on a fixed cadence rather than per frame. */
  tick: number;
}

/** What a tick produced. The caller applies it — the container never damages. */
export interface StatusTickResult {
  /** Damage by type, already summed. */
  damage: Array<{ type: DamageType; amount: number; statusId: string; sourceId: string }>;
  /** Life to restore. */
  heal: number;
  /** Mana to restore. */
  mana: number;
  /** Ids that ended this tick. */
  expired: string[];
  /** True if the stat sheet needs recomputing. */
  dirty: boolean;
}

const TICK_RATE = 0.5; // DoTs resolve twice a second.

function emptyResult(): StatusTickResult {
  return { damage: [], heal: 0, mana: 0, expired: [], dirty: false };
}

export class StatusContainer {
  readonly ownerId: string;
  private readonly active = new Map<string, ActiveStatus>();
  /** statusId -> { count, expires } for crowd-control diminishing returns. */
  private readonly drTable = new Map<string, { count: number; expires: number }>();
  private modCache: Partial<Stats> | null = null;
  private dirty = true;
  private clock = 0;
  /** Tags this host cannot be affected by at all. */
  private immunities = new Set<string>();
  /** DoT damage multiplier applied by the owner's own resistances upstream. */
  dotScale = 1;

  constructor(ownerId: string) {
    this.ownerId = ownerId;
  }

  // -------------------------------------------------------------------------
  // Immunity
  // -------------------------------------------------------------------------

  /** Accepts either status ids or tags ('cold', 'control', 'dot', ...). */
  setImmunities(list: readonly string[]): void {
    this.immunities = new Set(list);
    // Drop anything already running that we are now immune to.
    for (const [id, st] of Array.from(this.active)) {
      if (this.isImmuneTo(st.def)) {
        this.active.delete(id);
        this.invalidate();
      }
    }
  }

  addImmunity(tagOrId: string): void {
    this.immunities.add(tagOrId);
  }

  isImmuneTo(def: StatusDef): boolean {
    if (this.immunities.size === 0) return false;
    if (this.immunities.has(def.id)) return true;
    for (const tag of def.tags) if (this.immunities.has(tag)) return true;
    return false;
  }

  // -------------------------------------------------------------------------
  // Application
  // -------------------------------------------------------------------------

  /**
   * Apply (or stack/refresh) an effect. Returns false when the application was
   * fully resisted — by immunity, or by crowd-control diminishing returns.
   */
  apply(app: StatusApplication, sourceId = 'world'): boolean {
    const def = STATUS_BY_ID[app.id];
    if (!def) return false;
    if (this.isImmuneTo(def)) return false;

    let duration = app.duration > 0 ? app.duration : def.baseDuration;
    const magnitude = app.magnitude > 0 ? app.magnitude : 1;
    const addStacks = Math.max(1, Math.floor(app.stacks ?? 1));

    // Hard crowd control gets weaker each time it lands inside the DR window.
    if (def.diminishing) {
      const entry = this.drTable.get(def.id);
      const count = entry && entry.expires > this.clock ? entry.count : 0;
      const scale = CC_DIMINISHING[Math.min(count, CC_DIMINISHING.length - 1)] ?? 0;
      duration *= scale;
      this.drTable.set(def.id, { count: count + 1, expires: this.clock + CC_DR_WINDOW });
      if (duration <= 0.05) return false;
    }

    const existing = this.active.get(def.id);
    if (!existing) {
      this.active.set(def.id, {
        id: def.id,
        def,
        remaining: duration,
        duration,
        magnitude,
        stacks: Math.min(addStacks, def.maxStacks),
        sourceId,
        absorb: (def.absorb ?? 0) * magnitude,
        tick: 0,
      });
      this.invalidate();
      return true;
    }

    switch (def.stacking) {
      case 'stack':
        existing.stacks = Math.min(def.maxStacks, existing.stacks + addStacks);
        existing.remaining = Math.max(existing.remaining, duration);
        existing.duration = Math.max(existing.duration, duration);
        existing.magnitude = Math.max(existing.magnitude, magnitude);
        break;
      case 'extend':
        existing.remaining = Math.min(existing.remaining + duration, duration * 3);
        existing.duration = Math.max(existing.duration, existing.remaining);
        break;
      case 'strongest':
        if (magnitude > existing.magnitude) {
          existing.magnitude = magnitude;
          existing.remaining = duration;
          existing.duration = duration;
        } else {
          existing.remaining = Math.max(existing.remaining, duration);
        }
        break;
      case 'refresh':
      default:
        existing.remaining = Math.max(existing.remaining, duration);
        existing.duration = Math.max(existing.duration, duration);
        existing.magnitude = Math.max(existing.magnitude, magnitude);
        break;
    }
    if (def.absorb) existing.absorb = Math.max(existing.absorb, def.absorb * existing.magnitude);
    existing.sourceId = sourceId;
    this.invalidate();
    return true;
  }

  /** Bulk apply — the shape damage packets carry. */
  applyAll(list: readonly StatusApplication[] | undefined, sourceId = 'world'): void {
    if (!list) return;
    for (const app of list) this.apply(app, sourceId);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  has(id: string): boolean {
    return this.active.has(id);
  }

  get(id: string): ActiveStatus | undefined {
    return this.active.get(id);
  }

  stacks(id: string): number {
    return this.active.get(id)?.stacks ?? 0;
  }

  remaining(id: string): number {
    return this.active.get(id)?.remaining ?? 0;
  }

  list(): ActiveStatus[] {
    return Array.from(this.active.values());
  }

  get size(): number {
    return this.active.size;
  }

  hasTag(tag: StatusTag): boolean {
    for (const st of this.active.values()) if (st.def.tags.includes(tag)) return true;
    return false;
  }

  /** Cannot act at all. */
  isIncapacitated(): boolean {
    for (const st of this.active.values()) if (st.def.incapacitates) return true;
    return false;
  }

  /** Cannot move (incapacitation implies this). */
  isImmobilised(): boolean {
    for (const st of this.active.values()) if (st.def.immobilises || st.def.incapacitates) return true;
    return false;
  }

  isFeared(): boolean {
    return this.active.has('feared');
  }

  isSilenced(): boolean {
    return this.active.has('silenced');
  }

  /** Fraction of melee damage returned to attackers, summed over thorn effects. */
  reflectFraction(): number {
    let total = 0;
    for (const st of this.active.values()) {
      if (st.def.reflect) total += st.def.reflect * st.magnitude;
    }
    return total;
  }

  // -------------------------------------------------------------------------
  // Removal
  // -------------------------------------------------------------------------

  remove(id: string): boolean {
    const had = this.active.delete(id);
    if (had) this.invalidate();
    return had;
  }

  /** Removes up to `count` debuffs, longest-remaining first. Returns how many. */
  cleanse(count = 99): number {
    const debuffs = this.list()
      .filter((s) => s.def.polarity === -1)
      .sort((a, b) => b.remaining - a.remaining);
    let n = 0;
    for (const st of debuffs) {
      if (n >= count) break;
      this.active.delete(st.id);
      n++;
    }
    if (n > 0) this.invalidate();
    return n;
  }

  /** Removes all buffs — the "dispel" side, used by elite affixes. */
  purgeBuffs(): number {
    let n = 0;
    for (const st of this.list()) {
      if (st.def.polarity === 1) {
        this.active.delete(st.id);
        n++;
      }
    }
    if (n > 0) this.invalidate();
    return n;
  }

  clear(): void {
    if (this.active.size === 0) return;
    this.active.clear();
    this.invalidate();
  }

  // -------------------------------------------------------------------------
  // Absorb
  // -------------------------------------------------------------------------

  /**
   * Runs incoming damage through every absorb shield. Returns the leftover that
   * should actually be applied to life.
   */
  absorbDamage(amount: number): number {
    if (amount <= 0) return 0;
    let left = amount;
    for (const st of this.active.values()) {
      if (st.absorb <= 0) continue;
      const taken = Math.min(st.absorb, left);
      st.absorb -= taken;
      left -= taken;
      if (st.absorb <= 0) {
        this.active.delete(st.id);
        this.invalidate();
      }
      if (left <= 0) break;
    }
    return left;
  }

  totalAbsorb(): number {
    let t = 0;
    for (const st of this.active.values()) t += Math.max(0, st.absorb);
    return t;
  }

  // -------------------------------------------------------------------------
  // Ticking
  // -------------------------------------------------------------------------

  /**
   * Advance the container. `maxLife` lets percentage-based heal-over-time
   * effects resolve; pass 0 if the host does not care.
   */
  update(dt: number, maxLife = 0): StatusTickResult {
    const out = emptyResult();
    if (this.active.size === 0) {
      this.clock += dt;
      return out;
    }
    this.clock += dt;

    for (const st of Array.from(this.active.values())) {
      st.remaining -= dt;
      st.tick += dt;

      while (st.tick >= TICK_RATE) {
        st.tick -= TICK_RATE;
        if (st.def.dot) {
          const amount =
            st.def.dot.perSecond * st.magnitude * st.stacks * TICK_RATE * this.dotScale;
          if (amount > 0) {
            out.damage.push({
              type: st.def.dot.type,
              amount,
              statusId: st.id,
              sourceId: st.sourceId,
            });
          }
        }
        if (st.def.hot) out.heal += st.def.hot * st.magnitude * st.stacks * TICK_RATE;
        if (st.def.manaPerSecond) out.mana += st.def.manaPerSecond * st.magnitude * TICK_RATE;
      }

      if (st.remaining <= 0) {
        this.active.delete(st.id);
        out.expired.push(st.id);
        out.dirty = true;
      }
    }

    // Expire stale diminishing-returns entries so CC becomes usable again.
    if (this.drTable.size > 0) {
      for (const [id, e] of Array.from(this.drTable)) {
        if (e.expires <= this.clock) this.drTable.delete(id);
      }
    }

    if (out.dirty) this.invalidate();
    if (maxLife > 0 && out.heal > maxLife) out.heal = maxLife;
    return out;
  }

  // -------------------------------------------------------------------------
  // Stat contribution
  // -------------------------------------------------------------------------

  private invalidate(): void {
    this.modCache = null;
    this.dirty = true;
  }

  /** True (once) after anything changed — drives lazy stat recomputes. */
  consumeDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  /** Summed flat stat modifiers of every active effect, stacks included. */
  statMods(): Partial<Stats> {
    if (this.modCache) return this.modCache;
    const out: Partial<Stats> = {};
    for (const st of this.active.values()) {
      if (!st.def.mods) continue;
      const scale = st.def.maxStacks > 1 ? st.stacks : 1;
      for (const key of Object.keys(st.def.mods) as StatKey[]) {
        const v = st.def.mods[key];
        if (v === undefined) continue;
        out[key] = (out[key] ?? 0) + v * scale;
      }
    }
    this.modCache = out;
    return out;
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const containers = new Map<string, StatusContainer>();

/** Fetch (creating if needed) the container for an entity id. */
export function statusesOf(ownerId: string): StatusContainer {
  let c = containers.get(ownerId);
  if (!c) {
    c = new StatusContainer(ownerId);
    containers.set(ownerId, c);
  }
  return c;
}

/** Non-creating lookup — used by `computeStats`, which runs constantly. */
export function peekStatuses(ownerId: string): StatusContainer | undefined {
  return containers.get(ownerId);
}

export function releaseStatuses(ownerId: string): void {
  containers.delete(ownerId);
}

/** Drops every container — call between runs so ids cannot leak across scenes. */
export function resetAllStatuses(): void {
  containers.clear();
}

/** Convenience used all over the combat layer. */
export function applyStatus(
  ownerId: string,
  id: string,
  duration: number,
  magnitude = 1,
  stacks = 1,
  sourceId = 'world',
): boolean {
  return statusesOf(ownerId).apply({ id, duration, magnitude, stacks }, sourceId);
}
