/**
 * Entry point for `tools/check-sweep.mjs`.
 *
 * The combat sweep. Every active skill is cast by the real skill runner, from
 * a hero of its own class holding that class's weapons, at a group of real
 * monsters, and must do something you can see: damage under its own name, a
 * status on a monster or on you, a minion, a move. Every monster ability is
 * then used by a real monster on a hero who stands still (a damaging ability
 * must connect) and on a hero who walks out of its marker (a telegraphed one
 * must be avoidable).
 *
 *   --skills / --abilities   only one half
 *   --only=fireball          one skill or ability
 */
import * as THREE from 'three';
import { arena, caseLog, shrug, ofRole, type Arena } from './combat-arena';
import { promisingEffects } from './sim-effects';
import { SKILLS, TREE_BY_ID } from '../src/data/skills';
import { CLASSES } from '../src/data/classes';
import { SkillRunner } from '../src/scenes/SkillRunner';
import { Player } from '../src/entities/Player';
import { createCharacter, grantXp } from '../src/sim/Character';
import { ABILITIES, getAbility } from '../src/entities/Abilities';
import { MONSTERS } from '../src/data/monsters';
import { Random } from '../src/core/RNG';
import type { Character, DamagePacket, SkillDef } from '../src/types';
import type { Enemy } from '../src/entities/Enemy';

declare const process: { argv: string[] };
const arg = (k: string): string | undefined => process.argv.find((x) => x.startsWith(`--${k}=`))?.split('=')[1];
const only = arg('only');
const doSkills = !process.argv.includes('--abilities');
const doAbilities = !process.argv.includes('--skills');
const { cases, check } = caseLog();
const DT = 1 / 30;

// --- skills ---------------------------------------------------------------------

function heroFor(skill: SkillDef): Character {
  const cls = TREE_BY_ID[skill.treeId]!.classId;
  const c = createCharacter('Sweep', cls, new Random(3));
  for (let i = 0; i < 40 && c.level < 20; i++) grantXp(c, 1e6);
  c.skills = { [skill.id]: 5 };
  for (const r of skill.requires ?? []) c.skills[r] = 5;
  return c;
}

interface Seen {
  what: string[];
}

function sweepSkill(skill: SkillDef): Seen {
  const a = arena({ seed: 5, depth: 8 });
  const fx = promisingEffects();
  const def = MONSTERS.find((m) => m.role === 'brute' && m.weight > 0)!;
  const foes: Enemy[] = [];
  for (const [x, z] of [[0, 4], [1.2, 4.6], [-1.2, 4.6], [0, 2], [0.8, 6.5]] as const) {
    const e = a.spawn(def, x, z);
    e.maxLife = e.life = 1e7;
    e.rootTimer = 999;
    foes.push(e);
  }
  const player = new Player(heroFor(skill), 1);
  player.mana = 1e6;
  player.life = player.stats.life;
  const runner = new SkillRunner(fx.fx as never);
  runner.setContext(a.ctx, a.enemies, null);
  a.ctx.playerStats = player.stats;
  a.ctx.damagePlayer = (p) => void player.takeDamage(p, new Random(1));
  a.ctx.damageMinion = (id, amount) => runner.damageMinion(id, amount);
  const named = new Set([skill.name, skill.id]);
  const landed: DamagePacket[] = [];
  for (const e of foes) {
    const real = e.takeDamage.bind(e);
    (e as { takeDamage: Enemy['takeDamage'] }).takeDamage = (p, ctx) => {
      if (p.ability && named.has(p.ability)) landed.push(p);
      real(p, ctx);
    };
  }
  const pctx = { colliders: [], walkableAt: () => true };
  const tick = (sec: number): void => {
    for (let i = 0; i < Math.round(sec / DT); i++) {
      a.ctx.elapsed += DT;
      a.ctx.minions = runner.minionTargets();
      player.update(DT, pctx, null);
      runner.update(DT);
      fx.tick(DT);
      for (const e of [...a.enemies]) {
        a.ctx.playerPos.copy(player.position);
        e.update(DT, a.ctx);
      }
    }
  };
  const target = new THREE.Vector3(0, 0, 4);
  // Prerequisites first: a detonation needs its charges, a nova its bone armour.
  for (const r of skill.requires ?? []) {
    runner.cast(r, player, target, a.ctx, a.enemies, null);
    tick(0.8);
  }
  // What some skills spend: damage over time on the target, a hurt target.
  foes[0]!.applyStatuses(
    [
      { id: 'burning', duration: 10, magnitude: 1, stacks: 3 },
      { id: 'poisoned', duration: 10, magnitude: 1, stacks: 5 },
      { id: 'bleeding', duration: 10, magnitude: 1, stacks: 3 },
    ],
    a.ctx,
  );
  if (/below \d+% life|execute/i.test(skill.desc)) foes[0]!.life = foes[0]!.maxLife * 0.1;
  if (/Veiled/.test(skill.desc)) player.applyStatus('veiled', 10, 1, 1);
  (player as unknown as { cooldowns?: Map<string, number> }).cooldowns?.clear();
  tick(0.6);
  // A prerequisite may have carried the hero somewhere: back to the line.
  player.position.set(0, 0, 0);
  player.faceTowards(0, 4);

  const before = {
    statuses: foes.map((e) => new Set((e as unknown as { statuses: Array<{ id: string }> }).statuses.map((x) => x.id))),
    mine: new Set(player.statuses.map((s) => s.id)),
    minions: runner.minionSummary().reduce((n, m) => n + m.count, 0),
    at: player.position.clone(),
    life: foes.map((e) => e.life),
  };
  landed.length = 0;
  const ok = runner.cast(skill.id, player, target, a.ctx, a.enemies, null);
  tick(3.5);

  const what: string[] = [];
  if (!ok) what.push('REFUSED');
  if (landed.length) what.push(`${landed.length} hits`);
  foes.forEach((e, i) => {
    const now = new Set((e as unknown as { statuses: Array<{ id: string }> }).statuses.map((x) => x.id));
    for (const id of now) if (!before.statuses[i]!.has(id)) what.push(`foe:${id}`);
  });
  for (const s of player.statuses) if (!before.mine.has(s.id)) what.push(`self:${s.id}`);
  const minions = runner.minionSummary().reduce((n, m) => n + m.count, 0);
  if (minions > before.minions) what.push(`${minions - before.minions} minions`);
  if (player.position.distanceTo(before.at) > 2) what.push(`moved ${player.position.distanceTo(before.at).toFixed(1)}m`);
  return { what: [...new Set(what)] };
}

if (doSkills) {
  for (const s of SKILLS) {
    if (s.targeting === 'passive') continue;
    if (only && s.id !== only) continue;
    const seen = sweepSkill(s);
    const real = seen.what.filter((w) => w !== 'REFUSED');
    check(`skill ${s.id}`, real.length > 0 && !seen.what.includes('REFUSED'), seen.what.slice(0, 5).join(', ') || 'nothing');
  }
}

// --- monster abilities -------------------------------------------------------------

interface Use {
  /** Blows that landed, as times. */
  hits: number[];
  /** When this ability's markers land. */
  lands: number[];
}

/**
 * One monster uses `id` on the hero. `walk` makes the hero walk off sideways
 * the moment a marker goes down; `dashAt` lists when it dashes (0.32s, about
 * 2.7m, untouchable). A blow counts if it comes from this ability: under its
 * own id or name, or (charges trample, leaps land) any non-basic blow within a
 * second and a half of one of its markers landing.
 */
function useAbility(id: string, walk: boolean, dashAt: number[] = [], through = false, seed = 9): Use {
  const ab = getAbility(id)!;
  const a: Arena = arena({ seed, depth: 8 });
  const host = MONSTERS.find((m) => m.abilities.includes(id) && m.speed > 0.3) ?? ofRole('melee', 1)[0]!;
  // Where the fight would be: a shooter from across the room, a brawler close.
  const range = Math.min(ab.range ?? 2, 10);
  const start = Math.max((ab.minRange ?? 0) + 0.5, ab.kind === 'ranged' ? range * 0.8 : Math.min(range * 0.6, 3) + 0.3);
  const e = a.spawn(host, 0, start);
  e.ai?.wake(a.ctx, false);
  const lands: number[] = [];
  const decals = a.ctx.decals as unknown as Record<string, unknown>;
  const real = decals.telegraph as (...x: unknown[]) => { cancel(): void };
  (a.ctx as { decals: unknown }).decals = new Proxy(decals, {
    get: (o, k) =>
      k === 'telegraph'
        ? (...x: unknown[]) => {
            // Only this ability's markers: the monster goes on fighting after it.
            const using = (e as unknown as { inst: { def: { id: string } } | null }).inst?.def.id;
            if (using === id || using === undefined) lands.push(a.ctx.elapsed + Number(x[5] ?? 0));
            return real(...x);
          }
        : o[k as string],
  });
  e.beginAbility(ab, a.ctx);
  const DASH = 0.32;
  const began = a.ctx.elapsed + ab.windup;
  // Each try crosses on a different line, so a spread of shards gets a fair look.
  if (through) a.hero.x = ((seed - 9) / 31) * 0.9;
  a.step(through ? 7 : 4, (now) => {
    // Through: the hero crosses the ground the ability covers, walking at the
    // monster and out the other side (caltrops, walls, trails, barrages).
    if (through && now >= (lands[0] ?? began)) a.hero.z += 3 * DT;
    if (walk && lands.length) a.hero.x += 4.6 * DT;
    if (dashAt.some((d) => now >= d && now < d + DASH)) a.hero.x += 8.3 * DT;
  });
  const dashed = (t: number): boolean => dashAt.some((d) => t >= d && t <= d + DASH);
  const ours = a.hits.filter(
    (h) =>
      !dashed(h.t) &&
      (h.ability === id || h.ability === ab.name || (h.ability !== 'basic_strike' && [...lands, began].some((l) => h.t >= l - 0.05 && h.t <= l + 1.5))),
  );
  if (process.argv.includes('--trace')) {
    console.error(`${id} walk=${walk} dash=${dashAt.map((d) => (d - 1).toFixed(2)).join(',')} start ${start.toFixed(1)}m lands ${lands.map((l) => (l - 1).toFixed(2)).join(',')} hits ${a.hits.map((h) => `${h.ability}@${(h.t - 1).toFixed(2)}`).join(',')}`);
  }
  return { hits: ours.map((h) => h.t), lands };
}

if (doAbilities) {
  for (const ab of ABILITIES) {
    if (only && ab.id !== only) continue;
    if (ab.tags?.includes('ondeath') || !(ab.damageMul > 0)) continue;
    if (ab.kind === 'heal' || ab.kind === 'buff' || ab.kind === 'summon') continue;
    let stand = useAbility(ab.id, false);
    let detail = `${stand.hits.length} hits standing`;
    if (!stand.hits.length) {
      // Ground it leaves rather than a blow: it must hurt to cross it.
      // A barrage lands at random, so give it a few tries.
      for (let k = 0; k < 4 && !stand.hits.length; k++) stand = useAbility(ab.id, false, [], true, 9 + k * 31);
      detail = `${stand.hits.length} hits crossing its ground`;
    }
    let avoidable = true;
    if (stand.lands.length && stand.hits.length) {
      // Walk out of the marker; for whatever still lands, dash through the
      // marker it came from (the dash's 3.5s cooldown respected).
      const walked = useAbility(ab.id, true);
      const dashAt: number[] = [];
      for (const h of walked.hits) {
        const l = Math.max(...walked.lands.filter((x) => x <= h + 0.1));
        const d = (Number.isFinite(l) ? l : h) - 0.19;
        if (!dashAt.some((x) => Math.abs(x - d) < 3.5)) dashAt.push(d);
      }
      const both = dashAt.length ? useAbility(ab.id, true, dashAt) : walked;
      avoidable = both.hits.length < stand.hits.length;
      detail += `, ${walked.hits.length} walking out, ${both.hits.length} with a dash`;
    } else if (!stand.lands.length) detail += ', no marker';
    check(`ability ${ab.id}`, stand.hits.length > 0 && avoidable, detail);
  }
}

console.log(JSON.stringify({ cases }));
