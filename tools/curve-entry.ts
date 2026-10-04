/**
 * Entry point for `tools/check-curve.mjs`.
 *
 * The difficulty curve, fought headlessly. For every class at a handful of
 * depths, builds the hero a player at that depth would have: the level real
 * runs pay for, attribute and skill points spent sensibly (main skills, the
 * passives that feed them, offensive passives), the best of many rare drops of
 * the depth's item level plus the caches of every depth milestone already
 * cleared. It then fights the biggest pack on a real generated floor and that
 * run's real boss, under the run's real modifiers (`scenes/RunModifiers.ts`),
 * with the real skill runner, real monsters and real minions.
 *
 * The hero plays like a decent player: it alternates its two best skills (so
 * combos land), keeps a summoner's army up, falls back on the basic attack,
 * steps out of markers that are about to land (into a safe ring when there is
 * one), backs off when something reaches a caster, and drinks one of five
 * potions (35% of life, 5s apart) when low.
 *
 * Each cell is fought over several seeds (a different floor and boss each).
 * A class is walled at a depth if it loses every try at the pack or the boss,
 * and unchallenged if it wins everything without losing 15% life or a potion.
 *
 *   --classes=warden,ranger   only these
 *   --depths=1,12             only these
 *   --seeds=3                 tries per cell (default 3)
 *   --trace                   the hero's sheet, build and what hurt it
 *   --hp=1.13:1.12            try other hero power rates (sim/HeroPower.ts)
 *   --dmg=2 --life=2          scale the hero outright, to see what a cell needs
 */
import * as THREE from 'three';
import { arena, caseLog, shrug, type Arena } from './combat-arena';
import { generateRun, setMonsterCatalog } from '../src/world/DungeonGen';
import { MONSTERS, pickMonstersForDepth, getMonster } from '../src/data/monsters';
import { MONSTER_AFFIXES } from '../src/data/monsterAffixes';
import { BOSSES, pickBossForDepth } from '../src/data/bosses';
import { namedRaresFor } from '../src/data/namedRares';
import { SKILLS, SKILL_BY_ID, SYNERGIES } from '../src/data/skills';
import { CLASSES } from '../src/data/classes';
import { Boss } from '../src/entities/Boss';
import { Player } from '../src/entities/Player';
import { SkillRunner, weaponStyle } from '../src/scenes/SkillRunner';
import {
  createCharacter,
  grantXp,
  allocateStats,
  allocateSkill,
  canAllocateSkill,
  equipItem,
  meetsRequirements,
  slotsFor,
  usingTwoHander,
  startingSkillFor,
} from '../src/sim/Character';
import { rollItem, getBase } from '../src/sim/Loot';
import { MILESTONE_STEP, milestoneReward } from '../src/sim/Legacy';
import { RunModifiers } from '../src/scenes/RunModifiers';
import { tuneHeroPower } from '../src/sim/HeroPower';
import { Random } from '../src/core/RNG';
import { events } from '../src/core/Events';
import type { CharClassId, Character, DamagePacket, DungeonLevel, EquipSlot, Item, SkillDef } from '../src/types';
import type { Enemy } from '../src/entities/Enemy';

declare const process: { argv: string[] };
const arg = (k: string): string | undefined => process.argv.find((x) => x.startsWith(`--${k}=`))?.split('=')[1];
const { cases, check } = caseLog();
const DT = 1 / 30;
const SAFE_RING = 0x60ffa0;

setMonsterCatalog({
  pick: (depth, biome, rng, count) => pickMonstersForDepth(depth, biome, rng, count).map((m) => m.id),
  affixes: (depth, rng, count) => {
    const pool = MONSTER_AFFIXES.filter((x) => x.minDepth <= depth);
    const out: string[] = [];
    const taken = new Set<string>();
    for (let i = 0; i < count && taken.size < pool.length; i++) {
      const legal = pool.filter((x) => !taken.has(x.id) && !(x.excludes ?? []).some((y) => taken.has(y)));
      if (legal.length === 0) break;
      const chosen = rng.weighted(legal, (x) => x.weight);
      taken.add(chosen.id);
      out.push(chosen.id);
    }
    return out;
  },
  bossFor: (depth, biome, rng) => pickBossForDepth(depth, biome, rng).id,
  nameFor: (monsterId, biome, depth, rng) => {
    const def = MONSTERS.find((m) => m.id === monsterId);
    if (!def) return null;
    const pool = namedRaresFor(def.family, monsterId, biome, depth);
    return pool.length ? rng.weighted(pool, (n) => n.weight).id : null;
  },
});

const ALL_CLASSES: CharClassId[] = ['warden', 'pyromancer', 'shadowblade', 'stormcaller', 'revenant', 'ranger'];
const CLASSES_RUN = (arg('classes')?.split(',') as CharClassId[] | undefined) ?? ALL_CLASSES;
const trace = process.argv.includes('--trace');
// Experiment knobs: scale the hero's damage and life to see what the curve needs.
const KDMG = Number(arg('dmg') ?? 1);
const KLIFE = Number(arg('life') ?? 1);
if (arg('hp')) tuneHeroPower(Number(arg('hp')!.split(':')[0]), Number(arg('hp')!.split(':')[1]));
const DEPTHS = arg('depths')?.split(',').map(Number) ?? [1, 5, 12, 25, 40];

// --- the hero a player would have at a depth ------------------------------------

const RANK_XP: Record<string, number> = { normal: 1, champion: 1.9, elite: 3.2, rare: 5, boss: 22 };

/** Levels from clearing one run at each depth up to `depth`, most of each floor. */
function levelAt(classId: CharClassId, depth: number): number {
  const c = createCharacter('Curve', classId, new Random(3));
  for (let d = 1; d <= depth; d++) {
    const run = generateRun(d, 1000 + d, classId);
    let xp = 0;
    for (const lvl of run.levels) {
      for (const s of lvl.spawns) xp += (8 + d * 6) * (RANK_XP[s.rank] ?? 1);
    }
    // This depth's floors are cleared before its boss; earlier bosses are dead.
    if (d < depth) xp += (8 + d * 6) * RANK_XP.boss!;
    grantXp(c, xp * 0.75);
  }
  return c.level;
}

/** A summon that fights for you: a skeleton, a mage, a wisp (not a totem or a clone). */
const isPet = (s: SkillDef): boolean => /^summon\.(minion|wisp|pet)/.test(s.effect ?? '');

const isDamageActive = (s: SkillDef): boolean =>
  s.targeting !== 'passive' && !!s.damageScale && !/^(summon|corpse|buff|stance|banner|shout\.(heal|taunt)|self\.|capstone)/.test(s.effect ?? '');

const OFFENCE_STATS = new Set(['critChance', 'critDamage', 'enhancedDamage', 'attackSpeed', 'castSpeed', 'elementalDamagePct', 'minDamage', 'maxDamage', 'fireDamage', 'lightningDamage', 'poisonDamage', 'coldDamage', 'arcaneDamage']);
const offensive = (s: SkillDef): boolean =>
  Object.keys(s.passive ?? {}).some((k) => OFFENCE_STATS.has(k)) ||
  /passive\.(execute|critPierce|guaranteedCrit|conditionalDamage|conditionalCrit|critOnHit|pierceResist|dotScale|missingLifeScale|crowdScale|onHitStack|minionScale)/.test(s.effect ?? '');

/** Spends skill points the way a player building one tree would. */
function spendSkills(c: Character, tree: string): void {
  const inTree = SKILLS.filter((s) => s.treeId === tree);
  const ranked = (): SkillDef[] => inTree.filter((s) => (c.skills[s.id] ?? 0) > 0 && isDamageActive(s));
  for (let guard = 0; c.skillPoints > 0 && guard < 400; guard++) {
    const owned = ranked();
    const feeds = new Map<string, number>();
    for (const l of SYNERGIES) {
      if (owned.some((o) => o.id === l.target)) feeds.set(l.source, (feeds.get(l.source) ?? 0) + l.pctPerRank);
    }
    // A bigger skill behind a prerequisite makes the prerequisite worth a point.
    const unlocks = new Map<string, number>();
    for (const s of inTree) {
      if (!isDamageActive(s) || (c.skills[s.id] ?? 0) > 0) continue;
      for (const req of s.requires ?? []) {
        if ((c.skills[req] ?? 0) === 0) unlocks.set(req, Math.max(unlocks.get(req) ?? 0, 100 + s.tier * 12 + 1));
      }
    }
    let best: SkillDef | null = null;
    let bestScore = -Infinity;
    for (const s of inTree) {
      if (!canAllocateSkill(c, s.id).ok) continue;
      const r = c.skills[s.id] ?? 0;
      let score = 0;
      if (isDamageActive(s) || isPet(s)) score = 100 + s.tier * 12 - r;
      // Passives that raise damage outright are where a crit or damage-over-time
      // tree keeps its power; a player puts points there once the actives are up.
      if (s.targeting === 'passive' && offensive(s)) score = Math.max(score, 80 + s.tier * 10 - r * 1.5);
      score = Math.max(score, (feeds.get(s.id) ?? 0) * 4 - r, unlocks.get(s.id) ?? 0);
      if (score === 0) score = 1 + (s.passive ? 4 : 0) - r;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (!best || !allocateSkill(c, best.id)) break;
  }
}

const WEAPON_CATS = new Set(['sword', 'axe', 'mace', 'dagger', 'spear', 'bow', 'crossbow', 'wand', 'staff', 'scepter']);
/** The weapons each class's skills are built around. */
const STYLE: Record<CharClassId, string[]> = {
  warden: ['sword', 'axe', 'mace', 'spear'],
  pyromancer: ['wand', 'staff', 'scepter'],
  shadowblade: ['dagger', 'sword'],
  stormcaller: ['staff', 'wand', 'scepter'],
  revenant: ['wand', 'staff', 'scepter'],
  ranger: ['bow', 'crossbow'],
};

const SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'helm', 'chest', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2'];

function buildHero(classId: CharClassId, depth: number): { c: Character; level: number; tree: string } {
  const level = levelAt(classId, depth);
  const c = createCharacter('Curve', classId, new Random(5 + depth));
  // Points come with levels; grant XP straight to the level.
  while (c.level < level) grantXp(c, xpToNext(c));
  const cls = CLASSES.find((x) => x.id === classId)!;
  const main = (['strength', 'dexterity', 'energy'] as const).reduce((a, b) => (cls.base[b] > cls.base[a] ? b : a));
  const pts = c.statPoints;
  allocateStats(c, main, Math.round(pts * 0.6));
  allocateStats(c, 'vitality', c.statPoints);
  const start = startingSkillFor(classId);
  const tree = (start && SKILL_BY_ID[start]?.treeId) || cls.trees[0];
  spendSkills(c, tree);

  // Gear of the depth: magic early, rare after, the way drops go.
  const rng = new Random(77 + depth);
  const rarity = depth < 4 ? 'magic' : 'rare';
  // A player keeps the best of what drops: the most valuable of a few
  // candidates per slot.
  const best = new Map<EquipSlot, Item>();

  // Depth milestones already cleared paid their caches (uniques, sets, mythics);
  // they join the drops the hero picks from.
  const cached: Item[] = [];
  for (let m = MILESTONE_STEP; m < depth; m += MILESTONE_STEP) {
    for (const r of milestoneReward(m).items) cached.push(rollItem(m + 6, new Random(9000 + m * 31 + cached.length), { forceRarity: r, classId }));
  }
  for (let i = 0; i < 600 + cached.length; i++) {
    const item = i < cached.length ? cached[i]! : rollItem(depth + 1, rng, { forceRarity: rarity, classId });
    if (!item || !meetsRequirements(c, item).ok) continue;
    // Weapons the build fights with: a dagger build keeps daggers, an archer bows.
    const base = getBase(item.baseId);
    if (WEAPON_CATS.has(base.category) && !STYLE[classId].includes(base.category)) continue;
    for (const slot of slotsFor(item, classId)) {
      const have = best.get(slot);
      if ((!have || item.value > have.value) && (slot !== 'ring2' || best.get('ring1') !== item)) {
        best.set(slot, item);
        break;
      }
    }
  }
  for (const slot of SLOTS) {
    const item = best.get(slot);
    // A two-hander leaves no room for a shield.
    if (slot === 'offHand' && usingTwoHander(c)) continue;
    if (item) {
      const r = equipItem(c, item, slot);
      if (trace && !r.ok) console.error(`  could not equip ${item.name} in ${slot}: ${r.reason}`);
    }
  }
  if (trace) console.error(`  skills: ${JSON.stringify(c.skills)} left ${c.skillPoints}`);
  if (trace) console.error(`  gear: ${Object.entries(c.equipment).map(([k, v]) => `${k}=${v!.name}(${v!.baseId},i${v!.ilvl})`).join(' ')}`);
  return { c, level, tree };
}

function xpToNext(c: Character): number {
  // Big enough to always cross one level; grantXp loops levels itself.
  return 1 + Math.pow(1.2, c.level) * 1000;
}

// --- the fight ------------------------------------------------------------------

/**
 * Effects that draw nothing but keep their promises: a projectile's `onHit`,
 * a meteor's impact, a slam's `onFire` and a `delay` all fire after a beat,
 * at the point the effect was aimed at. Skills that resolve their damage in
 * those callbacks (every projectile) would otherwise never hit.
 */
function promisingEffects(): { fx: unknown; tick(dt: number): void } {
  const due: Array<{ t: number; fn: () => void }> = [];
  const later = (t: number, fn: () => void): void => {
    due.push({ t, fn });
  };
  const fx = new Proxy(
    {},
    {
      // Each member is callable (and keeps its promises) and also answers any
      // property read politely, so `fx.rig.hitStop()` works as well as `fx.meteor()`.
      get: (_o, key) =>
        new Proxy(function () {}, { get: () => shrug, apply: (_f, _t, args: unknown[]) => call(key, args) }),
    },
  );
  function call(key: string | symbol, args: unknown[]): unknown {
    const vecs = args.filter((x): x is THREE.Vector3 => x instanceof THREE.Vector3);
    let at: THREE.Vector3 | undefined = vecs[vecs.length - 1];
    if (!at && typeof args[0] === 'number' && typeof args[1] === 'number') at = new THREE.Vector3(args[0], 0, args[1]);
    const opts = args.find((x) => x && typeof x === 'object' && !(x instanceof THREE.Vector3)) as Record<string, unknown> | undefined;
    if (!at && opts?.target instanceof THREE.Vector3) at = opts.target;
    if (!at && opts?.origin instanceof THREE.Vector3) at = opts.origin;
    const point = (at ?? new THREE.Vector3()).clone();
    if (key === 'delay' && typeof args[1] === 'function') {
      later(Number(args[0]) || 0, args[1] as () => void);
      return shrug;
    }
    const wait = Number(opts?.delay ?? opts?.windup ?? 0.3) || 0.3;
    for (const x of args) if (typeof x === 'function') later(wait, () => (x as (p: THREE.Vector3) => void)(point.clone()));
    for (const name of ['onHit', 'onFire', 'onLand']) {
      const f = opts?.[name];
      if (typeof f === 'function') later(wait, () => (f as (p: THREE.Vector3) => void)(point.clone()));
    }
    return shrug;
  }
  return {
    fx,
    tick(dt) {
      for (let i = due.length - 1; i >= 0; i--) {
        const d = due[i]!;
        d.t -= dt;
        if (d.t > 0) continue;
        due.splice(i, 1);
        try {
          d.fn();
        } catch {
          /* a broken callback is the effect's problem, not the fight's */
        }
      }
    },
  };
}

interface Zone {
  kind: string;
  x: number;
  z: number;
  size: number;
  rot: number;
  until: number;
  color: number;
}

function inside(z: Zone, x: number, y: number): boolean {
  const dx = x - z.x;
  const dy = y - z.z;
  const d = Math.hypot(dx, dy);
  if (z.kind === 'line') {
    const vx = Math.sin(z.rot) * z.size;
    const vz = Math.cos(z.rot) * z.size;
    const t = Math.max(0, Math.min(1, (dx * vx + dy * vz) / (vx * vx + vz * vz || 1)));
    return Math.hypot(x - (z.x + vx * t), y - (z.z + vz * t)) < 1.6;
  }
  if (z.kind === 'cone') {
    if (d > z.size + 0.6) return false;
    let delta = Math.abs(Math.atan2(dx, dy) - z.rot) % (Math.PI * 2);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    return delta < 1.3 || d < 1.2;
  }
  return d < z.size + 0.6;
}

const reachOf = (s: SkillDef): number => {
  const fam = (s.effect ?? '').split('.')[0];
  if (fam === 'melee' || fam === 'cleave' || fam === 'whirlwind') return 2.1;
  if (fam === 'nova' || fam === 'aura' || fam === 'aoe' || fam === 'shout' || fam === 'detonate') return 3.5;
  if (fam === 'dash' || fam === 'teleport' || fam === 'leap') return 7;
  return 9;
};

interface Outcome {
  won: boolean;
  time: number;
  lowest: number;
  potions: number;
  combos: number;
}

function fight(
  depth: number,
  hero: Character,
  foes: (a: Arena) => Enemy[],
  limit: number,
  seed: number,
  run: { modifiers: string[]; level: DungeonLevel },
): Outcome {
  const a = arena({ seed, depth });
  const zones: Zone[] = [];
  const decals = a.ctx.decals as unknown as Record<string, unknown>;
  const realTel = decals.telegraph as (...args: unknown[]) => { cancel(): void };
  (a.ctx as { decals: unknown }).decals = new Proxy(decals, {
    get(o, k) {
      if (k === 'telegraph') {
        return (kind: string, x: number, z: number, size: number, rot: number, duration: number, color = 0) => {
          zones.push({ kind, x, z, size, rot, until: a.ctx.elapsed + duration, color });
          return realTel(kind, x, z, size, rot, duration, color);
        };
      }
      return o[k as string];
    },
  });
  const player = new Player(JSON.parse(JSON.stringify(hero)) as Character, seed);
  const effects = promisingEffects();
  const runner = new SkillRunner(effects.fx as never);
  runner.setContext(a.ctx, a.enemies, null);
  if (KDMG !== 1 || KLIFE !== 1) {
    // Statuses recompute the sheet, so the boost rides on every recompute.
    const boost = (): void => {
      const st = player.stats;
      for (const k of ['minDamage', 'maxDamage', 'fireDamage', 'coldDamage', 'lightningDamage', 'poisonDamage', 'arcaneDamage'] as const) st[k] *= KDMG;
      st.life *= KLIFE;
    };
    const refresh = player.refreshStats.bind(player);
    player.refreshStats = () => {
      const frac = player.life / Math.max(1, player.stats.life);
      refresh();
      boost();
      player.life = player.stats.life * frac;
    };
    boost();
    player.life = player.stats.life;
  }
  a.ctx.playerStats = player.stats;
  a.ctx.playerLevel = player.character.level;
  const rng = new Random(seed * 3 + 1);
  let biggest = 0;
  let taken = 0;
  const byAbility = new Map<string, number>();
  a.ctx.damagePlayer = (p: DamagePacket) => {
    const got = player.takeDamage(p, rng);
    biggest = Math.max(biggest, got);
    taken += got;
    const key = `${p.ability ?? '?'}/${p.source.split('_')[0]}`;
    byAbility.set(key, (byAbility.get(key) ?? 0) + got);
  };
  a.ctx.damageMinion = (id: number, amount: number) => runner.damageMinion(id, amount);
  a.ctx.applyHeroStatus = (id: string, duration: number, magnitude = 1) => {
    player.applyStatus(id, duration, magnitude, 1);
  };
  // Winning is killing what you came to fight. Adds and totems die with a boss
  // in the real game, and stragglers knocked across an open arena would
  // otherwise hold the fight open forever.
  const list = foes(a);
  for (const e of list) e.ai?.wake(a.ctx, false);
  // The descent's modifiers, exactly as the dungeon runs them: tougher
  // monsters, the statuses they put on you, thorns, leeches, ambushes.
  const mods = new RunModifiers({
    scene: a.ctx.scene,
    player: () => player,
    enemies: () => a.enemies,
    boss: () => null,
    context: () => a.ctx,
    effects: effects.fx as never,
    fx: shrug,
    decals: a.ctx.decals as never,
    rng: () => modRng,
    depth,
    modifiers: run.modifiers,
    level: () => run.level,
    walkable: () => true,
  });
  const modRng = new Random(seed + 17);
  mods.onLevel(0);
  for (const id of mods.playerStatuses()) player.applyStatus(id, 99999, 1, 1);

  // The two best damage skills it owns, for a combo rotation, plus any aura.
  const owned = SKILLS.filter((s) => (player.character.skills[s.id] ?? 0) > 0 && isDamageActive(s))
    .sort((x, y) => y.tier - x.tier || (player.character.skills[y.id] ?? 0) - (player.character.skills[x.id] ?? 0));
  const rotation = owned.slice(0, 2);
  const pets = SKILLS.filter((s) => (player.character.skills[s.id] ?? 0) > 0 && isPet(s));
  let nextPet = 0;
  let kiteCd = 0;
  let turn = 0;
  let potions = 5;
  let potionCd = 0;
  let lowest = 1;
  const acts = { cast: 0, basic: 0, move: 0, dodge: 0, busy: 0 };
  let combos = 0;
  const offCombo = events.on('combat:combo', () => combos++);
  let t = 0;
  const pctx = { colliders: [], walkableAt: () => true };
  const target = new THREE.Vector3();

  for (; t < limit; t += DT) {
    a.hero.copy(player.position);
    a.ctx.heroLifeFrac = player.life / Math.max(1, player.stats.life);
    // The world: each monster aims at whatever it chose to fight, you or a minion.
    a.ctx.elapsed += DT;
    a.ctx.minions = runner.minionTargets();
    mods.update(DT);
    for (const e of [...a.enemies]) {
      mods.strengthen(e);
      const on = e.aggroMinion;
      const m = on === null ? undefined : a.ctx.minions.find((q) => q.id === on);
      if (m) a.ctx.playerPos.set(m.x, 0, m.z);
      else a.ctx.playerPos.copy(player.position);
      e.update(DT, a.ctx);
    }
    a.ctx.playerPos.copy(player.position);
    player.update(DT, pctx, null);
    runner.update(DT);
    effects.tick(DT);
    const frac = player.life / Math.max(1, player.stats.life);
    lowest = Math.min(lowest, frac);
    if (!player.alive) break;
    if (list.every((e) => !e.alive)) break;
    const alive = a.enemies.filter((e) => e.alive && Math.hypot(e.root.position.x - player.position.x, e.root.position.z - player.position.z) < 40);
    if (alive.length === 0) break;

    potionCd -= DT;
    kiteCd -= DT;
    if (frac < 0.4 && potions > 0 && potionCd <= 0) {
      potions--;
      potionCd = 5;
      player.heal(player.stats.life * 0.35);
    }

    // Out of anything about to land.
    const all = zones.filter((z) => z.until > a.ctx.elapsed);
    zones.length = 0;
    zones.push(...all);
    // A player reacts to what is about to land, not to every marker on the floor.
    const live = all.filter((z) => z.until - a.ctx.elapsed < 0.7);
    const p = player.position;
    // A safe ring (the pillars) is somewhere to be, not something to avoid.
    const safe = live.filter((z) => z.kind === 'ring' && z.color === SAFE_RING);
    if (safe.length) {
      const s = safe.reduce((b, z) => (Math.hypot(z.x - p.x, z.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? z : b));
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > 1.2) {
        if (d > 4 && player.dodgeReadyIn <= 0) player.dodge(s.x - p.x, s.z - p.z);
        else player.moveTo(s.x, s.z);
        continue;
      }
    }
    const bad = live.find((z) => !(z.kind === 'ring' && z.color === SAFE_RING) && inside(z, p.x, p.z));
    if (bad) {
      // A short step or nothing: a player eats a hit rather than run across the room.
      for (let r = 1.5; r <= 3.5; r += 1) {
        let moved = false;
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * Math.PI * 2;
          const x = p.x + Math.sin(ang) * r;
          const z = p.z + Math.cos(ang) * r;
          if (!live.some((q) => !(q.kind === 'ring' && q.color === SAFE_RING) && inside(q, x, z))) {
            if (player.dodgeReadyIn <= 0) player.dodge(x - p.x, z - p.z);
            else player.moveTo(x, z);
            acts.dodge++;
            moved = true;
            break;
          }
        }
        if (moved) break;
      }
      continue;
    }

    if (player.isBusy) {
      acts.busy++;
      continue;
    }
    let near = alive[0]!;
    let nd = Infinity;
    for (const e of alive) {
      const d = Math.hypot(e.root.position.x - p.x, e.root.position.z - p.z);
      if (d < nd) {
        nd = d;
        near = e;
      }
    }
    target.set(near.root.position.x, 0, near.root.position.z);
    const reachPad = near.hitRadius ?? 0.5;
    let acted = false;
    // A caster or archer with something in its face backs off before it casts.
    if (weaponStyle(player) !== 'melee' && nd < 2.6 && kiteCd <= 0) {
      const ax = p.x - near.root.position.x;
      const az = p.z - near.root.position.z;
      const len = Math.hypot(ax, az) || 1;
      player.moveTo(p.x + (ax / len) * 5, p.z + (az / len) * 5);
      kiteCd = 2.5;
      acts.move++;
      continue;
    }
    // A summoner keeps its army up.
    if (pets.length && a.ctx.elapsed >= nextPet) {
      const have = runner.minionSummary();
      for (const s of pets) {
        if ((have.find((h) => h.skillId === s.id)?.count ?? 0) >= 2) continue;
        if (runner.cast(s.id, player, player.position.clone().add(new THREE.Vector3(0, 0, 1.5)), a.ctx, a.enemies, null)) {
          acted = true;
          acts.cast++;
          break;
        }
      }
      nextPet = a.ctx.elapsed + 3;
    }
    for (let i = 0; i < rotation.length && !acted; i++) {
      const s = rotation[(turn + i) % rotation.length]!;
      if (nd > reachOf(s) + reachPad) continue;
      if (runner.cast(s.id, player, target, a.ctx, a.enemies, null)) {
        turn = (turn + i + 1) % Math.max(1, rotation.length);
        acted = true;
        acts.cast++;
      }
    }
    // The basic attack: a swing with a blade, a shot or a bolt with anything else.
    const basicReach = weaponStyle(player) === 'melee' ? 2.1 : 9;
    if (!acted && nd <= basicReach + reachPad) {
      acted = runner.basicAttack(player, target, a.ctx, a.enemies, null);
      if (acted) acts.basic++;
    }
    if (!acted) {
      // Close to where something can be thrown: the basic attack if nothing
      // else is ready, otherwise the shortest reach in the rotation.
      // Casters and archers hold their range rather than walk in for a nova.
      const want = basicReach > 3 ? basicReach : Math.min(basicReach, ...rotation.map(reachOf));
      if (nd > want) player.moveTo(target.x, target.z);
      acts.move++;
    }
  }
  offCombo();
  mods.dispose();
  if (trace) {
    const st = player.stats;
    const owned = rotation.map((r) => `${r.id}:${player.character.skills[r.id]}`).join(',');
    console.error(`  L${player.character.level} life ${Math.round(st.life)} def ${Math.round(st.defense)} res f${Math.round(st.fireResist)} dmg ${Math.round(st.minDamage)}-${Math.round(st.maxDamage)} | rot ${owned} | acts ${JSON.stringify(acts)} combos ${combos} | biggest hit ${Math.round(biggest)} total ${Math.round(taken)} in ${t.toFixed(1)}s [${[...byAbility].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}] | foes ${a.enemies.length} left ${a.enemies.filter((e) => e.alive).map((e) => `${e.monsterId}@${Math.round(e.life)}/${Math.round(e.maxLife)}:${Math.round(Math.hypot(e.root.position.x - player.position.x, e.root.position.z - player.position.z))}m`).join(' ')} life ${a.enemies.slice(0, 3).map((e) => Math.round(e.maxLife)).join('/')}`);
  }
  return {
    won: player.alive && list.every((e) => !e.alive),
    time: t,
    lowest: player.alive ? lowest : 0,
    potions: 5 - potions,
    combos,
  };
}

// --- run ----------------------------------------------------------------------

const SEEDS = Number(arg('seeds') ?? 3);
const rows: Array<Record<string, unknown>> = [];
for (const classId of CLASSES_RUN) {
  for (const depth of DEPTHS) {
    const { c, level, tree } = buildHero(classId, depth);
    const packs: Outcome[] = [];
    const bosses: Outcome[] = [];
    const names: string[] = [];
    const modsSeen = new Set<string>();
    for (let k = 0; k < SEEDS; k++) {
      // A different floor and boss each seed: the curve, not one unlucky draw.
      const run = generateRun(depth, 4242 + depth + k * 7919, classId);
      const lvl = run.levels[0]!;
      for (const m of run.modifiers) modsSeen.add(m);
      const byPack = new Map<number, typeof lvl.spawns>();
      for (const sp of lvl.spawns) (byPack.get(sp.packId) ?? byPack.set(sp.packId, []).get(sp.packId)!).push(sp);
      // The biggest pack on the first floor, with its elites and affixes.
      const pack = [...byPack.values()].sort((x, y) => y.length - x.length)[0] ?? [];
      if (trace) console.error(`pack ${pack.map((sp) => `${sp.monsterId}:${sp.rank}`).join(' ')}`);
      packs.push(
        fight(
          depth,
          c,
          (a) => {
            const out: Enemy[] = [];
            pack.forEach((sp, i) => {
              const def = getMonster(sp.monsterId);
              if (!def) return;
              const ang = (i / Math.max(1, pack.length)) * 1.6 - 0.8;
              out.push(a.spawn(def, Math.sin(ang) * 9, Math.cos(ang) * 9, { rank: sp.rank, affixes: sp.affixes, pack: 1 }));
            });
            return out;
          },
          120,
          depth * 7 + 1 + k * 101,
          { modifiers: run.modifiers, level: lvl },
        ),
      );
      const bossDef = BOSSES.find((b) => b.id === run.bossId) ?? BOSSES[0]!;
      names.push(bossDef.name);
      bosses.push(
        fight(
          depth,
          c,
          (a) => {
            const b = new Boss(bossDef, depth, new Random(depth + k));
            b.root.position.set(0, 0, 10);
            a.enemies.push(b);
            b.engage(a.ctx);
            return [b];
          },
          300,
          depth * 7 + 2 + k * 101,
          { modifiers: run.modifiers, level: run.levels[run.levels.length - 1]! },
        ),
      );
    }
    const won = (o: Outcome[]): number => o.filter((x) => x.won).length;
    const low = (o: Outcome[]): number => Math.min(...o.map((x) => x.lowest));
    const pots = (o: Outcome[]): number => o.reduce((n, x) => n + x.potions, 0);
    const secs = (o: Outcome[]): string => o.map((x) => x.time.toFixed(0)).join('/');
    const challenged = low(packs) < 0.85 || low(bosses) < 0.85 || pots(packs) + pots(bosses) > 0;
    const row = {
      classId,
      depth,
      level,
      tree,
      packWins: won(packs),
      bossWins: won(bosses),
      of: SEEDS,
      challenged,
    };
    rows.push(row);
    // Walled: loses every try at a fight. Challenged: it cost life or potions.
    check(
      `${classId} at depth ${depth} (L${level})`,
      won(packs) > 0 && won(bosses) > 0 && challenged,
      `packs ${won(packs)}/${SEEDS} (${secs(packs)}s, low ${Math.round(low(packs) * 100)}%) | bosses ${won(bosses)}/${SEEDS} ${names.join(', ')} (${secs(bosses)}s, low ${Math.round(low(bosses) * 100)}%) | pots ${pots(packs) + pots(bosses)}${modsSeen.size ? ` | mods ${[...modsSeen].join(',')}` : ''}${challenged ? '' : ' | untouched'}`,
    );
  }
}

console.log(JSON.stringify({ cases, rows }));
