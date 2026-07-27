/**
 * SLAY — the quest runtime.
 *
 * Owns the life-cycle of the single `QuestInstance` a run carries:
 *
 *   pickQuest(depth, biome, rng)          — weighted, depth-gated selection
 *   instantiateQuest(def, depth, rng)     — templates -> concrete objectives
 *   on*(quest, ...)                       — progress hooks the game calls
 *   questRewards(quest, depth, rng)       — gold, XP and rolled items
 *   failQuest / isFailed                  — failure states, clearly signalled
 *
 * Design notes:
 *
 * - `QuestInstance` (shared type) is deliberately small: it is what gets
 *   serialised into a save and rendered by the quest log. Everything a live
 *   run needs on top of that — timers, stalker escalation, relic load, failure
 *   reason — lives in a side table keyed by the instance, so the shared type
 *   never grows a field the UI has to know about.
 *
 * - Every hook is safe to call on a completed, failed or empty quest. The
 *   dungeon scene should never have to guard a call site.
 *
 * - Nothing here calls Math.random. Reward rolls take the caller's Rng.
 */

import type {
  BiomeId,
  Item,
  ItemRarity,
  MonsterFamily,
  MonsterRank,
  QuestDef,
  QuestInstance,
  QuestObjective,
  QuestObjectiveKind,
  Rng,
} from '../types';
import { events, toast } from '../core/Events';
import { rollItem } from './Loot';
import {
  QUESTS,
  questById,
  type QuestDefEx,
  type QuestFailKind,
} from '../data/quests';
import { NAMED_ELITES, pickLine, questLore } from '../data/lore';

// ---------------------------------------------------------------------------
// Runtime side-table
// ---------------------------------------------------------------------------

export interface QuestFailure {
  kind: QuestFailKind | 'manual';
  /** Player-facing sentence. */
  text: string;
  /** Seconds into the run, if the caller has been ticking. */
  at: number;
}

/** Everything a live run tracks that does not belong in the save shape. */
export interface QuestRuntime {
  defId: string;
  depth: number;
  failed: boolean;
  failure: QuestFailure | null;
  /** Fractional seconds banked per objective index (survive objectives). */
  timers: number[];
  /** Number of times the run's named stalker has slipped away. */
  escapes: number;
  /** How many escapes it takes before the hunt is considered lost. */
  maxEscapes: number;
  /** Name of the run's stalker/mark, if the quest has one. */
  markName: string;
  /** Quest relics currently carried — drives the resistDrain modifier. */
  carried: number;
  /** Resistance lost per carried relic, in percent. */
  drainPerRelic: number;
  /** True once an escorted NPC has been delivered. */
  escortSafe: boolean;
  /** True while an escorted NPC is alive (false before spawn is irrelevant). */
  escortAlive: boolean;
  /** Modifiers this quest imposed on the run. */
  modifiers: string[];
  /** Failure conditions that apply. */
  failOn: QuestFailKind[];
  /** Arbitrary counters hooks want to keep (potions drunk, torches lost...). */
  flags: Record<string, number>;
  /** Wall-clock seconds the quest has been active. */
  elapsed: number;
}

const RUNTIME = new WeakMap<QuestInstance, QuestRuntime>();

function freshRuntime(defId: string, depth: number, objectiveCount: number): QuestRuntime {
  return {
    defId,
    depth,
    failed: false,
    failure: null,
    timers: new Array<number>(objectiveCount).fill(0),
    escapes: 0,
    maxEscapes: 3,
    markName: '',
    carried: 0,
    drainPerRelic: 0,
    escortSafe: false,
    escortAlive: true,
    modifiers: [],
    failOn: [],
    flags: {},
    elapsed: 0,
  };
}

/**
 * The live state for a quest. Lazily created, so a quest loaded from a save
 * (or built by another module) still works — it simply starts with a clean
 * runtime, which is the correct behaviour for a resumed run.
 */
export function questState(quest: QuestInstance): QuestRuntime {
  let st = RUNTIME.get(quest);
  if (!st) {
    st = freshRuntime(quest.defId, 1, quest.objectives.length);
    const def = questById(quest.defId);
    if (def) {
      st.modifiers = questModifiers(def);
      st.failOn = def.failOn ? [...def.failOn] : [];
    }
    RUNTIME.set(quest, st);
  }
  if (st.timers.length < quest.objectives.length) {
    while (st.timers.length < quest.objectives.length) st.timers.push(0);
  }
  return st;
}

/** All run modifiers a definition imposes, primary first. */
export function questModifiers(def: QuestDef | QuestDefEx): string[] {
  const out: string[] = [];
  if (def.modifier) out.push(def.modifier);
  const ex = def as QuestDefEx;
  if (ex.extraModifiers) {
    for (const m of ex.extraModifiers) if (!out.includes(m)) out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Failure signalling
// ---------------------------------------------------------------------------

type FailListener = (quest: QuestInstance, failure: QuestFailure) => void;
const failListeners = new Set<FailListener>();

/**
 * Subscribe to quest failure. The shared event bus has no `quest:failed`
 * channel, so failures are broadcast here plus a `toast` of kind `bad` and a
 * `ui:refresh` — enough for the HUD, the quest log and the audio layer.
 */
export function onQuestFailed(fn: FailListener): () => void {
  failListeners.add(fn);
  return () => {
    failListeners.delete(fn);
  };
}

const FAIL_TEXT: Record<QuestFailKind | 'manual', string> = {
  escortDeath: `They did not make it. The contract dies with them.`,
  potionUsed: `The seal is broken. The wager is over.`,
  timeExpired: `Time. Whatever you were racing has arrived.`,
  shrineLost: `The light goes out. Very simply, and all at once.`,
  relicLost: `The reliquary is short. It will not accept a partial set.`,
  torchLost: `Your light is gone and the dark closes the contract.`,
  markEscaped: `It breaks off, satisfied, and goes to wait somewhere deeper.`,
  wardBroken: `The ward fails. Whatever it held no longer needs holding.`,
  playerDeath: `The contract lapses with its holder.`,
  manual: `The contract lapses.`,
};

export function isFailed(quest: QuestInstance): boolean {
  return questState(quest).failed;
}

export function questFailure(quest: QuestInstance): QuestFailure | null {
  return questState(quest).failure;
}

/** Marks the quest failed. Idempotent — the first reason is the one that sticks. */
export function failQuest(quest: QuestInstance, kind: QuestFailKind | 'manual', detail?: string): void {
  const st = questState(quest);
  if (st.failed || quest.complete) return;
  st.failed = true;
  const lore = questLore(quest.defId);
  const text = detail ?? lore.onFail ?? FAIL_TEXT[kind];
  st.failure = { kind, text, at: st.elapsed };
  toast(`${quest.name} — failed`, 'bad');
  events.emit('ui:refresh', {});
  for (const fn of Array.from(failListeners)) {
    try {
      fn(quest, st.failure);
    } catch (err) {
      console.error('[quests] fail listener threw', err);
    }
  }
}

/**
 * True when a failure condition applies to this quest at all. Callers that
 * fire speculative hooks (e.g. every potion sip) can check first and skip.
 */
export function canFail(quest: QuestInstance, kind: QuestFailKind): boolean {
  return questState(quest).failOn.includes(kind);
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** Ease-in / retire curve so the pool turns over smoothly with depth. */
function depthWeight(def: QuestDefEx, depth: number): number {
  if (depth < def.minDepth) return 0;
  if (def.maxDepth !== undefined && depth > def.maxDepth) return 0;
  let w = def.weight;
  // Ramp in over three tiers past the gate — new quests are rare at first.
  const since = depth - def.minDepth;
  if (since < 3) w *= 0.45 + 0.185 * since;
  // Retire over the last three tiers before the cap.
  if (def.maxDepth !== undefined) {
    const left = def.maxDepth - depth;
    if (left < 3) w *= 0.3 + 0.235 * left;
  }
  // Deeper runs prefer the nastier contracts.
  const dangerBias = 1 + def.danger * Math.min(1, depth / 24) * 0.55;
  return Math.max(0, w * dangerBias);
}

function biomeWeight(def: QuestDefEx, biome: BiomeId): number {
  if (!def.biomes || def.biomes.length === 0) return 1;
  return def.biomes.includes(biome) ? 2.4 : 0;
}

/** Full selection weight for a quest at a given depth and biome. */
export function questWeight(def: QuestDefEx, depth: number, biome: BiomeId): number {
  return depthWeight(def, depth) * biomeWeight(def, biome);
}

/**
 * Weighted, depth-gated, biome-aware pick. Never throws: if the filters leave
 * nothing (a biome with no matching quests at depth 1, say) it relaxes the
 * biome constraint, then the depth constraint, before giving up on the first
 * catalogue entry.
 */
export function pickQuest(depth: number, biome: BiomeId, rng: Rng): QuestDef {
  const pool = QUESTS.filter((q) => questWeight(q, depth, biome) > 0);
  if (pool.length > 0) return rng.weighted(pool, (q) => questWeight(q, depth, biome));

  const anyBiome = QUESTS.filter((q) => depthWeight(q, depth) > 0);
  if (anyBiome.length > 0) return rng.weighted(anyBiome, (q) => depthWeight(q, depth));

  const gated = QUESTS.filter((q) => q.minDepth <= depth);
  if (gated.length > 0) return rng.weighted(gated, (q) => q.weight);

  return QUESTS[0]!;
}

// ---------------------------------------------------------------------------
// Instantiation
// ---------------------------------------------------------------------------

/** Objective kinds whose target is a duration, not a count. */
const TIME_KINDS: ReadonlySet<QuestObjectiveKind> = new Set<QuestObjectiveKind>(['survive']);
/** Objective kinds that are always a single binary step. */
const SINGLETON_KINDS: ReadonlySet<QuestObjectiveKind> = new Set<QuestObjectiveKind>(['escort', 'boss']);

function scaleTarget(
  kind: QuestObjectiveKind,
  base: number,
  perDepth: number,
  depth: number,
  rng: Rng,
): number {
  if (SINGLETON_KINDS.has(kind)) return Math.max(1, Math.round(base));
  const raw = base + perDepth * Math.max(0, depth - 1);
  if (TIME_KINDS.has(kind)) {
    // Durations round to a readable five seconds and take no jitter — a
    // survival timer that varies run to run reads as a bug.
    return Math.max(10, Math.round(raw / 5) * 5);
  }
  // +/- 8% deterministic jitter so two runs of the same quest differ a little.
  const jitter = 1 + rng.range(-0.08, 0.08);
  return Math.max(1, Math.round(raw * jitter));
}

/** Renders an objective description: `{n}` target, `{depth}`, `{name}`. */
export function describeObjective(template: string, target: number, depth: number, name: string): string {
  return template
    .replace(/\{n\}/g, String(target))
    .replace(/\{depth\}/g, String(depth))
    .replace(/\{name\}/g, name);
}

/**
 * Resolves a definition's objective templates into a concrete, written-out
 * quest for this depth. Deterministic for a given (def, depth, rng stream).
 */
export function instantiateQuest(def: QuestDef, depth: number, rng: Rng): QuestInstance {
  const ex = questById(def.id) ?? (def as QuestDefEx);
  const markName = pickLine(NAMED_ELITES, rng, NAMED_ELITES[0]!);

  const objectives: QuestObjective[] = def.objectives.map((t) => {
    const target = scaleTarget(t.kind, t.base, t.perDepth, depth, rng);
    return {
      kind: t.kind,
      desc: describeObjective(t.desc, target, depth, markName),
      target,
      progress: 0,
      filter: t.filter,
      done: false,
    };
  });

  const quest: QuestInstance = {
    defId: def.id,
    name: def.name,
    flavor: def.flavor,
    objectives,
    complete: false,
    turnedIn: false,
  };

  const st = freshRuntime(def.id, depth, objectives.length);
  st.markName = markName;
  st.modifiers = questModifiers(def);
  st.failOn = ex.failOn ? [...ex.failOn] : [];
  // Escapes allowed before the hunt is written off — a little slack deeper in.
  st.maxEscapes = 2 + Math.floor(depth / 10);
  // Each carried relic costs resistance when the quest imposes `resistDrain`.
  st.drainPerRelic = st.modifiers.includes('resistDrain') ? 4 + Math.floor(depth / 6) : 0;
  st.escortAlive = objectives.some((o) => o.kind === 'escort');
  RUNTIME.set(quest, st);

  return quest;
}

/** Convenience for the world generator: pick and instantiate in one call. */
export function rollQuest(depth: number, biome: BiomeId, rng: Rng): QuestInstance {
  const def = pickQuest(depth, biome, rng);
  return instantiateQuest(def, depth, rng);
}

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------

function splitFilter(filter: string | undefined): { key: string; value: string } {
  if (!filter) return { key: '', value: '' };
  const i = filter.indexOf(':');
  if (i < 0) return { key: filter.trim().toLowerCase(), value: '' };
  return {
    key: filter.slice(0, i).trim().toLowerCase(),
    value: filter.slice(i + 1).trim().toLowerCase(),
  };
}

const RANK_ORDER: Record<MonsterRank, number> = {
  normal: 0,
  champion: 1,
  elite: 2,
  rare: 3,
  boss: 4,
};

function matchesKill(
  filter: string | undefined,
  monsterId: string,
  family: MonsterFamily,
  rank: MonsterRank,
  role: string | undefined,
  tags: readonly string[] | undefined,
): boolean {
  const { key, value } = splitFilter(filter);
  switch (key) {
    case '':
    case 'any':
      return true;
    case 'family':
      return family.toLowerCase() === value;
    case 'id':
      return monsterId.toLowerCase() === value;
    case 'role':
      return (role ?? '').toLowerCase() === value;
    case 'rank': {
      const want = RANK_ORDER[value as MonsterRank];
      return want === undefined ? true : RANK_ORDER[rank] >= want;
    }
    case 'tagged':
      return (tags ?? []).some((t) => t.toLowerCase() === value);
    case 'named':
      // Named targets are identified by the caller passing the name through as
      // a tag, or by the monster id matching the run's mark handle.
      return (tags ?? []).some((t) => t.toLowerCase() === value) || monsterId.toLowerCase() === value;
    default:
      // Unknown vocabulary always matches — a missing hook must not softlock.
      return true;
  }
}

/** Loose match for simple `key:value` filters against a caller-supplied token. */
function matchesToken(filter: string | undefined, token: string, expectedKeys: readonly string[]): boolean {
  const { key, value } = splitFilter(filter);
  if (key === '' || key === 'any') return true;
  const t = token.trim().toLowerCase();
  // Callers may pass either the bare value ('shrine') or a full filter
  // ('prop:shrine'); accept both.
  const parsed = splitFilter(token);
  const bare = parsed.key === '' || !expectedKeys.includes(parsed.key) ? t : parsed.value;
  if (!expectedKeys.includes(key)) return true;
  return bare === value || bare === t && value === t;
}

// ---------------------------------------------------------------------------
// Progress plumbing
// ---------------------------------------------------------------------------

function emitProgress(quest: QuestInstance, index: number): void {
  const o = quest.objectives[index];
  if (!o) return;
  events.emit('quest:progress', {
    index,
    progress: Math.min(o.progress, o.target),
    target: o.target,
    desc: o.desc,
  });
}

/**
 * Adds progress to one objective. Returns true if it changed. Clamps, marks
 * `done`, fires `quest:progress` and re-checks overall completion.
 */
function advance(quest: QuestInstance, index: number, amount: number): boolean {
  const o = quest.objectives[index];
  if (!o || o.done || amount <= 0) return false;
  const st = questState(quest);
  if (st.failed || quest.complete) return false;

  o.progress = Math.min(o.target, o.progress + amount);
  if (o.progress >= o.target) {
    o.progress = o.target;
    o.done = true;
  }
  emitProgress(quest, index);
  if (o.done) {
    const lore = questLore(quest.defId);
    if (lore.whisper && lore.whisper.length > 0 && !quest.complete) {
      // Objective-completion beat, quiet — the HUD toast carries the signal.
      toast(o.desc, 'good');
    } else {
      toast(o.desc, 'good');
    }
  }
  recheckComplete(quest);
  return true;
}

/** Steps every objective of a kind whose filter accepts `test`. */
function advanceMatching(
  quest: QuestInstance,
  kind: QuestObjectiveKind,
  amount: number,
  test: (o: QuestObjective) => boolean,
): number {
  let touched = 0;
  for (let i = 0; i < quest.objectives.length; i++) {
    const o = quest.objectives[i]!;
    if (o.kind !== kind || o.done) continue;
    if (!test(o)) continue;
    if (advance(quest, i, amount)) touched++;
  }
  return touched;
}

/**
 * Marks the quest complete when every objective is done. Escort objectives are
 * satisfied implicitly once everything else is finished — the NPC survived the
 * run, which is the whole ask — so a missing `onEscortSafe` call can never
 * strand a completed run.
 */
function recheckComplete(quest: QuestInstance): void {
  if (quest.complete) return;
  const st = questState(quest);
  if (st.failed) return;

  const nonEscortDone = quest.objectives.every((o) => o.kind === 'escort' || o.done);
  if (nonEscortDone) {
    for (let i = 0; i < quest.objectives.length; i++) {
      const o = quest.objectives[i]!;
      if (o.kind === 'escort' && !o.done && st.escortAlive) {
        o.progress = o.target;
        o.done = true;
        st.escortSafe = true;
        emitProgress(quest, i);
      }
    }
  }

  if (!quest.objectives.every((o) => o.done)) return;
  quest.complete = true;
  events.emit('quest:complete', { name: quest.name });
  const lore = questLore(quest.defId);
  toast(lore.onComplete ?? `${quest.name} — complete`, 'epic');
}

// ---------------------------------------------------------------------------
// Hooks the game calls
// ---------------------------------------------------------------------------

/** Optional extra identity a caller can pass through on a kill. */
export interface KillContext {
  /** MonsterDef.role, for `role:` filters. */
  role?: string;
  /** Free tags: 'guardian' for chest-summoned packs, the mark's handle, etc. */
  tags?: string[];
}

/**
 * A monster died. Advances `slay` objectives whose filter matches, and
 * `slayElite` objectives when the rank is champion or better.
 */
export function onKill(
  quest: QuestInstance,
  monsterId: string,
  family: MonsterFamily,
  rank: MonsterRank,
  ctx?: KillContext,
): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  const st = questState(quest);
  const tags = ctx?.tags ? [...ctx.tags] : [];
  // The run's named stalker answers to `named:mark` regardless of its id.
  if (st.markName && tags.some((t) => t.toLowerCase() === st.markName.toLowerCase())) tags.push('mark');

  advanceMatching(quest, 'slay', 1, (o) => matchesKill(o.filter, monsterId, family, rank, ctx?.role, tags));

  if (RANK_ORDER[rank] >= RANK_ORDER.champion) {
    advanceMatching(quest, 'slayElite', 1, (o) => {
      const { key, value } = splitFilter(o.filter);
      if (key === 'named') {
        if (value === 'mark') return tags.includes('mark') || monsterId.toLowerCase() === 'mark';
        if (value === 'champion') return RANK_ORDER[rank] >= RANK_ORDER.champion;
      }
      return matchesKill(o.filter, monsterId, family, rank, ctx?.role, tags);
    });
  }
}

/**
 * A quest pickup entered the pack. `itemFilter` is the pickup id, with or
 * without the `item:` prefix.
 */
export function onCollect(quest: QuestInstance, itemFilter: string, amount = 1): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  const st = questState(quest);
  const touched = advanceMatching(quest, 'collect', amount, (o) =>
    matchesToken(o.filter, itemFilter, ['item']),
  );
  if (touched > 0) {
    st.carried += amount;
    if (st.drainPerRelic > 0) {
      toast(`The fragments are cold against your ribs. (-${st.drainPerRelic * st.carried}% resistances)`, 'bad');
    }
  }
}

/**
 * A quest pickup was lost — dropped on death, destroyed, taken back. Fails
 * quests that cannot tolerate an incomplete set.
 */
export function onCollectLost(quest: QuestInstance, itemFilter: string, amount = 1): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  const st = questState(quest);
  let touched = false;
  for (let i = 0; i < quest.objectives.length; i++) {
    const o = quest.objectives[i]!;
    if (o.kind !== 'collect' || !matchesToken(o.filter, itemFilter, ['item'])) continue;
    o.progress = Math.max(0, o.progress - amount);
    o.done = o.progress >= o.target;
    emitProgress(quest, i);
    touched = true;
  }
  if (touched) {
    st.carried = Math.max(0, st.carried - amount);
    if (canFail(quest, 'relicLost')) failQuest(quest, 'relicLost');
  }
}

/** Total resistance penalty currently owed to carried quest relics, in percent. */
export function carriedResistPenalty(quest: QuestInstance): number {
  const st = questState(quest);
  return st.drainPerRelic * st.carried;
}

/** The player reached a tagged location. `marker` may be bare or `marker:x`. */
export function onReach(quest: QuestInstance, marker: string): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  advanceMatching(quest, 'reach', 1, (o) => matchesToken(o.filter, marker, ['marker']));
}

/**
 * The player interacted with a prop: shrine, brazier, seal, chest, ward.
 * Drives `cleanse` objectives.
 */
export function onInteract(quest: QuestInstance, kind: string): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  advanceMatching(quest, 'cleanse', 1, (o) => matchesToken(o.filter, kind, ['prop']));
}

/**
 * Ticks `survive` objectives. `zone` names where the player currently is —
 * omit it for objectives filtered `zone:any`. Objectives that require standing
 * somewhere specific only accrue while `zone` matches.
 */
export function onSurviveTick(quest: QuestInstance, dt: number, zone?: string): void {
  if (!quest || quest.complete || isFailed(quest) || dt <= 0) return;
  const st = questState(quest);
  st.elapsed += dt;

  for (let i = 0; i < quest.objectives.length; i++) {
    const o = quest.objectives[i]!;
    if (o.kind !== 'survive' || o.done) continue;
    const { key, value } = splitFilter(o.filter);
    if (key === 'zone' && value !== 'any') {
      if (!zone) continue;
      const here = splitFilter(zone);
      const bare = here.key === 'zone' ? here.value : zone.trim().toLowerCase();
      if (bare !== value) continue;
    }
    st.timers[i] = (st.timers[i] ?? 0) + dt;
    const whole = Math.floor(st.timers[i]!);
    if (whole > o.progress) {
      const gained = whole - o.progress;
      advance(quest, i, gained);
    }
  }
}

/**
 * The player left the zone a `survive` objective requires. Held-position
 * objectives (`zone:shrine`, `zone:arena`) reset rather than pause — holding
 * ground is the point.
 */
export function onSurviveInterrupted(quest: QuestInstance, zone: string): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  const st = questState(quest);
  const target = splitFilter(zone).value || zone.trim().toLowerCase();
  for (let i = 0; i < quest.objectives.length; i++) {
    const o = quest.objectives[i]!;
    if (o.kind !== 'survive' || o.done) continue;
    const { key, value } = splitFilter(o.filter);
    if (key !== 'zone' || value === 'any' || value !== target) continue;
    if (o.progress === 0) continue;
    st.timers[i] = 0;
    o.progress = 0;
    emitProgress(quest, i);
    toast(`${quest.name} — the ground is lost`, 'bad');
  }
  if (canFail(quest, 'shrineLost') && target === 'shrine') failQuest(quest, 'shrineLost');
}

/** The escorted NPC died. Fails the quest outright where that is a fail state. */
export function onEscortDeath(quest: QuestInstance): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  const st = questState(quest);
  st.escortAlive = false;
  for (let i = 0; i < quest.objectives.length; i++) {
    const o = quest.objectives[i]!;
    if (o.kind !== 'escort') continue;
    o.progress = 0;
    emitProgress(quest, i);
  }
  failQuest(quest, 'escortDeath');
}

/** The escorted NPC reached safety. */
export function onEscortSafe(quest: QuestInstance): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  const st = questState(quest);
  st.escortSafe = true;
  advanceMatching(quest, 'escort', 1, () => true);
}

/** The floor boss died. Advances `boss` objectives. */
export function onBossKilled(quest: QuestInstance, bossId: string): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  advanceMatching(quest, 'boss', 1, (o) => {
    const { key, value } = splitFilter(o.filter);
    if (key !== 'boss' || value === '' || value === 'any') return true;
    return bossId.toLowerCase() === value;
  });
}

/**
 * The run's named stalker broke off. It comes back heavier: the returned tier
 * is how many times it has escaped, which the entity layer should fold into
 * its scaling. Once the slack runs out, the hunt fails.
 */
export function onEliteEscaped(quest: QuestInstance, name?: string): number {
  if (!quest || quest.complete || isFailed(quest)) return 0;
  const st = questState(quest);
  if (name) st.markName = name;
  st.escapes++;
  if (st.escapes > st.maxEscapes) {
    failQuest(quest, 'markEscaped');
    return st.escapes;
  }
  toast(`${st.markName || 'It'} slips away — and comes back heavier.`, 'bad');
  return st.escapes;
}

/** Scaling multiplier the stalker should carry given how often it has escaped. */
export function markPowerMultiplier(quest: QuestInstance): number {
  const st = questState(quest);
  return 1 + st.escapes * 0.35;
}

/** The run's named stalker, for nameplates and objective text. */
export function markName(quest: QuestInstance): string {
  return questState(quest).markName;
}

/** A healing consumable was used. Breaks `Bloodless` and its relatives. */
export function onPotionUsed(quest: QuestInstance): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  const st = questState(quest);
  st.flags.potions = (st.flags.potions ?? 0) + 1;
  if (canFail(quest, 'potionUsed')) failQuest(quest, 'potionUsed');
}

/** The carried light went out. Breaks the lightless contracts. */
export function onTorchLost(quest: QuestInstance): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  const st = questState(quest);
  st.flags.torches = (st.flags.torches ?? 0) + 1;
  if (canFail(quest, 'torchLost')) failQuest(quest, 'torchLost');
}

/** A ward or seal the quest was protecting was destroyed. */
export function onWardBroken(quest: QuestInstance): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  if (canFail(quest, 'wardBroken')) failQuest(quest, 'wardBroken');
}

/** The floor timer expired. */
export function onTimeExpired(quest: QuestInstance): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  if (canFail(quest, 'timeExpired')) failQuest(quest, 'timeExpired');
}

/** The player died. Every quest ends; only some record it as a named failure. */
export function onPlayerDeath(quest: QuestInstance): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  failQuest(quest, canFail(quest, 'playerDeath') ? 'playerDeath' : 'manual', FAIL_TEXT.playerDeath);
}

/** Generic escape hatch for hooks this module has not grown yet. */
export function onQuestEvent(quest: QuestInstance, kind: QuestObjectiveKind, token: string, amount = 1): void {
  if (!quest || quest.complete || isFailed(quest)) return;
  advanceMatching(quest, kind, amount, (o) => matchesToken(o.filter, token, [splitFilter(o.filter).key]));
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export interface QuestReward {
  gold: number;
  xp: number;
  items: Item[];
  /** True when the quest was failed — rewards are the consolation share. */
  partial: boolean;
}

/** Item level a reward drop rolls at. */
export function questItemLevel(depth: number): number {
  return Math.max(1, Math.round(4 + depth * 2.6));
}

function baseGold(depth: number): number {
  return 140 + depth * 95 + depth * depth * 2.4;
}

function baseXp(depth: number): number {
  return 220 + depth * 185 + depth * depth * 5.5;
}

/** Fraction of a quest's objectives finished, 0..1. */
export function questProgressFraction(quest: QuestInstance): number {
  if (quest.objectives.length === 0) return 1;
  let sum = 0;
  for (const o of quest.objectives) sum += o.target > 0 ? Math.min(1, o.progress / o.target) : 1;
  return sum / quest.objectives.length;
}

/**
 * Gold, XP and rolled items for finishing (or partly finishing) a quest.
 *
 * A failed or abandoned quest still pays out on the fraction completed, at a
 * heavy discount and with no item drops — the run was not wasted, but the
 * contract was.
 */
export function questRewards(quest: QuestInstance, depth: number, rng: Rng): QuestReward {
  const def = questById(quest.defId);
  const st = questState(quest);
  const goldMul = def?.rewardGold ?? 1;
  const xpMul = def?.rewardXp ?? 1;
  const itemCount = def?.rewardItems ?? 1;
  const danger = def?.danger ?? 0;

  const complete = quest.complete && !st.failed;
  const fraction = complete ? 1 : questProgressFraction(quest) * 0.3;

  const jitter = rng.range(0.92, 1.12);
  const dangerBonus = 1 + danger * 0.12;
  const gold = Math.max(0, Math.round(baseGold(depth) * goldMul * dangerBonus * fraction * jitter));
  const xp = Math.max(0, Math.round(baseXp(depth) * xpMul * dangerBonus * fraction * jitter));

  const items: Item[] = [];
  if (complete) {
    const ilvl = questItemLevel(depth);
    // One guaranteed step up in rarity for the genuinely dangerous contracts.
    const forced: ItemRarity | undefined =
      danger >= 3 && rng.chance(0.55) ? 'rare' : danger >= 2 && rng.chance(0.3) ? 'rare' : undefined;
    for (let i = 0; i < itemCount; i++) {
      items.push(
        rollItem(ilvl, rng, {
          magicFind: 25 + danger * 25 + depth * 2,
          forceRarity: i === 0 ? forced : undefined,
        }),
      );
    }
  }

  return { gold, xp, items, partial: !complete };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** `3/8` style counter for the quest log. Survive objectives read as time. */
export function objectiveCounter(o: QuestObjective): string {
  if (o.kind === 'survive') {
    const left = Math.max(0, o.target - o.progress);
    const m = Math.floor(left / 60);
    const s = Math.floor(left % 60);
    return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
  }
  if (o.target <= 1) return o.done ? `done` : `pending`;
  return `${Math.min(o.progress, o.target)}/${o.target}`;
}

/** One-line status for the HUD tracker. */
export function questSummary(quest: QuestInstance): string {
  const st = questState(quest);
  if (st.failed) return `${quest.name} — failed`;
  if (quest.complete) return `${quest.name} — complete`;
  const next = quest.objectives.find((o) => !o.done);
  if (!next) return quest.name;
  return `${quest.name}: ${next.desc} (${objectiveCounter(next)})`;
}

/** Objectives still outstanding, in display order. */
export function activeObjectives(quest: QuestInstance): QuestObjective[] {
  return quest.objectives.filter((o) => !o.done);
}

/** Everything the quest log panel needs in one call. */
export function questLogView(quest: QuestInstance): {
  name: string;
  flavor: string;
  brief: string;
  complete: boolean;
  failed: boolean;
  failureText: string;
  modifiers: string[];
  lines: Array<{ desc: string; counter: string; done: boolean }>;
} {
  const st = questState(quest);
  const lore = questLore(quest.defId);
  return {
    name: quest.name,
    flavor: quest.flavor,
    brief: lore.brief ?? '',
    complete: quest.complete,
    failed: st.failed,
    failureText: st.failure?.text ?? '',
    modifiers: st.modifiers,
    lines: quest.objectives.map((o) => ({
      desc: o.desc,
      counter: objectiveCounter(o),
      done: o.done,
    })),
  };
}

/** Resets a quest for a retry from town. Keeps the rolled targets. */
export function resetQuest(quest: QuestInstance, depth: number): void {
  for (const o of quest.objectives) {
    o.progress = 0;
    o.done = false;
  }
  quest.complete = false;
  quest.turnedIn = false;
  const def = questById(quest.defId);
  const st = freshRuntime(quest.defId, depth, quest.objectives.length);
  if (def) {
    st.modifiers = questModifiers(def);
    st.failOn = def.failOn ? [...def.failOn] : [];
    st.maxEscapes = 2 + Math.floor(depth / 10);
    st.drainPerRelic = st.modifiers.includes('resistDrain') ? 4 + Math.floor(depth / 6) : 0;
  }
  st.escortAlive = quest.objectives.some((o) => o.kind === 'escort');
  RUNTIME.set(quest, st);
}
