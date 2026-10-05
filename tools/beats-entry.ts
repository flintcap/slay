/**
 * Entry point for `tools/check-beats.mjs`.
 *
 * The feel sweep. Every active skill is cast by the real skill runner, through
 * the real effect library (real particles, decals and trails, headless), at a
 * row of real monsters, and everything it draws and plays is logged against
 * the clock. Each skill then has to show three beats:
 *
 *   cast    something seen and something heard the moment it goes off;
 *   travel  for skills that reach out (bolts, chains, meteors, waves, leaps),
 *           something on screen for the whole time between the cast and the
 *           first blow landing, so nothing hits out of thin air;
 *   impact  a picture and a sound where and when the first blow lands.
 *
 * Skills that never hit (buffs, heals, auras, summons, traps waiting for a
 * victim) only owe the cast beat; their families are declared in NO_IMPACT.
 *
 *   --only=fireball   one skill, with its timeline printed
 */
import * as THREE from 'three';
import { arena, shrug } from './combat-arena';
import { SKILLS, TREE_BY_ID } from '../src/data/skills';
import { SkillRunner } from '../src/scenes/SkillRunner';
import { Player } from '../src/entities/Player';
import { createCharacter, grantXp } from '../src/sim/Character';
import { MONSTERS } from '../src/data/monsters';
import { Random } from '../src/core/RNG';
import { FXSystem } from '../src/fx/Particles';
import { DecalSystem } from '../src/fx/Decals';
import { EffectSystem } from '../src/fx/Effects';
import { CameraRig } from '../src/fx/CameraRig';
import { audio, resolvesSound } from '../src/audio/Audio';
import { events } from '../src/core/Events';
import type { QualityProfile } from '../src/core/Renderer';
import type { Character, DamagePacket, SkillDef } from '../src/types';
import type { Enemy } from '../src/entities/Enemy';

declare const process: { argv: string[] };
const only = process.argv.find((x) => x.startsWith('--only='))?.split('=')[1];
const DT = 1 / 30;

/** Families whose skill reaches its target through the air or across ground. */
const TRAVELS = new Set(['projectile', 'bolt', 'chain', 'meteor', 'sky', 'wave', 'leap', 'teleport', 'point', 'beam']);
/**
 * Families that owe no impact beat of their own: they buff, heal, summon or
 * lay something down. Their blows, if any, come later from what they made.
 */
const NO_IMPACT = new Set([
  'buff', 'aura', 'stance', 'shout', 'banner', 'self', 'absorb', 'heal', 'summon', 'minion', 'ward', 'trap',
  // Curses and debuffs put a status on; their beat is the mark, not a blow.
  'curse', 'debuff', 'apply',
]);

// --- the log ----------------------------------------------------------------
let now = 0;
const seen: Array<{ t: number; what: string }> = [];
const heard: Array<{ t: number; id: string }> = [];
const silentIds = new Set<string>();
const realPlay = audio.play.bind(audio);
audio.play = (id: string, opts?: Parameters<typeof audio.play>[1]): void => {
  heard.push({ t: now, id });
  if (!resolvesSound(id)) silentIds.add(id);
  realPlay(id, opts);
};
events.on('sfx', (e) => {
  heard.push({ t: now, id: e.id });
  if (!resolvesSound(e.id)) silentIds.add(e.id);
});

const quality = { fxScale: 1 } as QualityProfile;
const scene = new THREE.Scene();
const fx = new FXSystem(scene, quality);
const decals = new DecalSystem(scene, quality);
const effects = new EffectSystem(scene, fx, decals, quality);
effects.setRig(new CameraRig());

/** Logs calls to the named methods: the public drawing surface, nothing internal. */
function spy(obj: object, label: string, keep: (name: string) => boolean): void {
  const o = obj as Record<string, (...a: unknown[]) => unknown>;
  const names = new Set<string>();
  for (let proto = Object.getPrototypeOf(obj); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const k of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, k);
      if (k !== 'constructor' && d && typeof d.value === 'function' && keep(k)) names.add(k);
    }
  }
  for (const k of names) {
    const real = o[k]!.bind(obj);
    o[k] = (...a: unknown[]) => {
      seen.push({ t: now, what: `${label}.${k}` });
      return real(...a);
    };
  }
}
const NOT_DRAWING = new Set(['update', 'clear', 'dispose', 'setRig', 'setCamera', 'chance', 'sfx', 'trauma']);
spy(effects, 'fx', (k) => !NOT_DRAWING.has(k));
spy(fx, 'p', (k) => k === 'burst' || k === 'emitCustom');
spy(decals, 'd', (k) => ['add', 'splatter', 'telegraph', 'telegraphEx'].includes(k));

function heroFor(skill: SkillDef): Character {
  const cls = TREE_BY_ID[skill.treeId]!.classId;
  const c = createCharacter('Beats', cls, new Random(3));
  for (let i = 0; i < 40 && c.level < 20; i++) grantXp(c, 1e6);
  c.skills = { [skill.id]: 5 };
  for (const r of skill.requires ?? []) c.skills[r] = 5;
  return c;
}

interface Beats {
  family: string;
  cast: boolean;
  castSound: boolean;
  travel: boolean | null;
  impact: boolean | null;
  impactSound: boolean | null;
  firstHit: number;
  note: string;
}

function sweep(skill: SkillDef): Beats {
  const a = arena({ seed: 5, depth: 8 });
  effects.clear();
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
  const runner = new SkillRunner(effects);
  runner.setContext(a.ctx, a.enemies, null);
  a.ctx.playerStats = player.stats;
  a.ctx.damagePlayer = (p) => void player.takeDamage(p, new Random(1));
  a.ctx.damageMinion = (id, amount) => runner.damageMinion(id, amount);
  const named = new Set([skill.name, skill.id]);
  const hits: number[] = [];
  for (const e of foes) {
    const real = e.takeDamage.bind(e);
    (e as { takeDamage: Enemy['takeDamage'] }).takeDamage = (p: DamagePacket, ctx) => {
      if (p.ability && named.has(p.ability) && p.amount > 0) hits.push(now);
      real(p, ctx);
    };
  }
  const pctx = { colliders: [], walkableAt: () => true };
  let live: Array<{ t: number; n: number }> = [];
  const tick = (sec: number): void => {
    for (let i = 0; i < Math.round(sec / DT); i++) {
      now += DT;
      a.ctx.elapsed += DT;
      a.ctx.minions = runner.minionTargets();
      player.update(DT, pctx, null);
      runner.update(DT);
      effects.update(DT, now);
      fx.update(DT, now);
      decals.update(DT);
      live.push({ t: now, n: effects.liveCount + effects.trails.liveCount });
      for (const e of [...a.enemies]) {
        a.ctx.playerPos.copy(player.position);
        e.update(DT, a.ctx);
      }
    }
  };
  const target = new THREE.Vector3(0, 0, 4);
  for (const r of skill.requires ?? []) {
    runner.cast(r, player, target, a.ctx, a.enemies, null);
    tick(0.8);
  }
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
  player.position.set(0, 0, 0);
  player.faceTowards(0, 4);

  // Everything from here is this skill's.
  const t0 = now;
  seen.length = 0;
  heard.length = 0;
  hits.length = 0;
  live = [];
  const ok = runner.cast(skill.id, player, target, a.ctx, a.enemies, null);
  tick(3.5);
  runner.dispose();

  const family = (skill.effect ?? 'melee').split('.')[0] ?? 'melee';
  const within = (t: number, lo: number, hi: number): boolean => t >= lo - 1e-6 && t <= hi + 1e-6;
  const cast = seen.some((s) => within(s.t, t0, t0 + 0.25));
  // A weapon swing whooshes on the press; a spell may voice its gather a beat later.
  const castSound = heard.some((h) => within(h.t, t0, t0 + 0.6));
  const firstHit = hits.length ? hits[0]! : -1;
  let travel: boolean | null = null;
  let impact: boolean | null = null;
  let impactSound: boolean | null = null;
  if (firstHit >= 0) {
    impact = seen.some((s) => within(s.t, firstHit - DT, firstHit + 0.12));
    impactSound = heard.some((h) => within(h.t, firstHit - DT, firstHit + 0.12));
    if (TRAVELS.has(family) && firstHit - t0 > 0.2) {
      // Every frame between the cast and the blow must have something live.
      travel = live.filter((l) => l.t > t0 + DT && l.t < firstHit - DT).every((l) => l.n > 0);
    }
  }
  const notes: string[] = [];
  if (!ok) notes.push('REFUSED');
  if (only) {
    console.error(`${skill.id} [${family}] t0=${t0.toFixed(2)} hits=${hits.map((h) => (h - t0).toFixed(2)).join(',')}`);
    for (const s of seen.slice(0, 60)) console.error(`  ${(s.t - t0).toFixed(2)} see ${s.what}`);
    for (const h of heard.slice(0, 40)) console.error(`  ${(h.t - t0).toFixed(2)} hear ${h.id}`);
  }
  return { family, cast, castSound, travel, impact, impactSound, firstHit: firstHit >= 0 ? firstHit - t0 : -1, note: notes.join(' ') };
}

const rows: Array<{ id: string } & Beats> = [];
for (const s of SKILLS) {
  if (s.targeting === 'passive') continue;
  if (only && s.id !== only) continue;
  try {
    rows.push({ id: s.id, ...sweep(s) });
  } catch (err) {
    rows.push({ id: s.id, family: '?', cast: false, castSound: false, travel: null, impact: null, impactSound: null, firstHit: -1, note: `threw ${String(err).slice(0, 120)}` });
  }
}
void shrug;
console.log(JSON.stringify({ rows, silent: [...silentIds], noImpact: [...NO_IMPACT], travels: [...TRAVELS] }));
