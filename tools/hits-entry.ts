/**
 * Entry point for `tools/check-hits.mjs`.
 *
 * What a hit does, through the real skill runner, player and monster:
 *
 *  - Two blades: the hands take turns, right then left, one blow per swing
 *    at twice a single weapon's swing rate; the left arm really swings, and
 *    the off-hand weapon's damage counts.
 *  - Venom: Coat Blades poisons on hit while it is up, its poison shows as
 *    its own number, Poisoned ticks, and the Venom skills leave the stacks
 *    they promise (Viper Strike, Venom Dart, Death Lotus, Plague Vial,
 *    Corrosive Edge, Paralytic Toxin). A poisoned body wears the green look.
 *  - Numbers: each element is drawn in its own colour, physical is unchanged,
 *    and the damage type reaches the number from a real skill of each element.
 */
import * as THREE from 'three';
import { arena, caseLog } from './combat-arena';
import { promisingEffects } from './sim-effects';
import { SkillRunner, isDualWielding } from '../src/scenes/SkillRunner';
import { Player } from '../src/entities/Player';
import { createCharacter, grantXp } from '../src/sim/Character';
import { newItem, getBase } from '../src/sim/Loot';
import { MONSTERS } from '../src/data/monsters';
import { SKILLS, TREE_BY_ID } from '../src/data/skills';
import { Random } from '../src/core/RNG';
import { events } from '../src/core/Events';
import { lookBitsOf, LOOK } from '../src/fx/BodyFX';
import { numberFill, numberKey, numberParts } from '../src/ui/CombatText';
import type { CharClassId, DamagePacket, DamageType, EquipSlot } from '../src/types';
import type { Enemy } from '../src/entities/Enemy';

const { cases, check } = caseLog();
const DT = 1 / 30;

interface Scene {
  player: Player;
  runner: SkillRunner;
  foe: Enemy;
  at: THREE.Vector3;
  ctx: ReturnType<typeof arena>['ctx'];
  /** Packets that reached the foe, with the time they landed. */
  packets: Array<{ t: number; p: DamagePacket }>;
  /** Damage events on the foe, as the numbers see them. */
  shown: Array<{ t: number; amount: number; type: DamageType; parts?: Partial<Record<DamageType, number>> }>;
  /** The hero's animator `hit` frames, with the hand that struck. */
  swings: Array<{ t: number; side?: 'L' | 'R' }>;
  now(): number;
  tick(sec: number): void;
  cast(id: string): boolean;
  done(): void;
}

function scene(cls: CharClassId, skills: Record<string, number>, gear: Partial<Record<EquipSlot, string>> = {}, seed = 7): Scene {
  const a = arena({ seed, depth: 8 });
  const fx = promisingEffects();
  const c = createCharacter('Hits', cls, new Random(seed));
  for (let i = 0; i < 40 && c.level < 20; i++) grantXp(c, 1e6);
  c.skills = { ...skills };
  const rng = new Random(seed + 1);
  if (Object.keys(gear).length) {
    c.equipment = {};
    for (const [slot, baseId] of Object.entries(gear)) {
      if (baseId) c.equipment[slot as EquipSlot] = newItem(getBase(baseId), 10, 'normal', rng);
    }
  }
  const def = MONSTERS.find((m) => m.role === 'brute' && m.weight > 0)!;
  const foe = a.spawn(def, 0, 1.7);
  foe.maxLife = foe.life = 1e8;
  foe.rootTimer = 999;
  const at = foe.root.position.clone();
  const player = new Player(c, seed);
  player.mana = 1e6;
  player.life = player.stats.life;
  const runner = new SkillRunner(fx.fx as never);
  runner.setContext(a.ctx, a.enemies, null);
  a.ctx.playerStats = player.stats;
  a.ctx.damagePlayer = () => {};
  a.ctx.damageMinion = (id, amount) => runner.damageMinion(id, amount);
  const packets: Scene['packets'] = [];
  const real = foe.takeDamage.bind(foe);
  (foe as { takeDamage: Enemy['takeDamage'] }).takeDamage = (p, ctx) => {
    packets.push({ t: a.ctx.elapsed, p });
    real(p, ctx);
  };
  const shown: Scene['shown'] = [];
  const offShown = events.on('enemy:damaged', (e) => {
    if (e.id === foe.id) shown.push({ t: a.ctx.elapsed, amount: e.amount, type: e.type, parts: e.parts });
  });
  const swings: Scene['swings'] = [];
  const offSwing = player.animator.on('hit', (e) => swings.push({ t: a.ctx.elapsed, side: e.side }));
  const pctx = { colliders: [], walkableAt: () => true };
  const tick = (sec: number): void => {
    for (let i = 0; i < Math.round(sec / DT); i++) {
      a.ctx.elapsed += DT;
      a.ctx.minions = runner.minionTargets();
      a.hero.copy(player.position);
      player.update(DT, pctx, null);
      runner.update(DT);
      fx.tick(DT);
      for (const e of [...a.enemies]) {
        a.ctx.playerPos.copy(player.position);
        e.update(DT, a.ctx);
      }
      player.mana = 1e6;
    }
  };
  return {
    player,
    runner,
    foe,
    at,
    ctx: a.ctx,
    packets,
    shown,
    swings,
    now: () => a.ctx.elapsed,
    tick,
    cast(id) {
      (player as unknown as { cooldowns?: Map<string, number> }).cooldowns?.clear();
      player.position.set(0, 0, 0);
      return runner.cast(id, player, at.clone(), a.ctx, a.enemies, null);
    },
    done() {
      offShown();
      offSwing();
    },
  };
}

// --- two blades -----------------------------------------------------------------

interface Flurry {
  dual: boolean;
  /** Basic attacks started while the button was held. */
  attacks: number;
  /** Blows that landed. */
  blows: number;
  total: number;
  left: number;
  right: number;
  /** Blows that landed within two frames of a left-hand swing. */
  onLeftSwing: number;
}

/** Holds the attack button for `seconds`: a new swing whenever the last ends. */
function flurry(main: string, off: string | null, seconds = 7): Flurry {
  const gear: Partial<Record<EquipSlot, string>> = { mainHand: main };
  if (off) gear.offHand = off;
  const s = scene('shadowblade', {}, gear, 11);
  const dual = isDualWielding(s.player);
  let attacks = 0;
  for (let t = 0; t < seconds; t += DT) {
    if (!s.player.isBusy && s.runner.basicAttack(s.player, s.at.clone(), s.ctx, [s.foe], null)) attacks++;
    s.tick(DT);
  }
  s.tick(0.5);
  const mine = s.packets.filter((x) => x.p.ability === 'Attack');
  const total = mine.reduce((n, x) => n + x.p.amount, 0);
  const onLeftSwing = mine.filter((x) => s.swings.some((w) => w.side === 'L' && Math.abs(w.t - x.t) <= DT * 2.5)).length;
  const left = s.swings.filter((w) => w.side === 'L').length;
  const right = s.swings.filter((w) => w.side === 'R').length;
  s.done();
  return { dual, attacks, blows: mine.length, total, left, right, onLeftSwing };
}

const pair = flurry('dagger.dagger', 'dagger.dagger');
const one = flurry('dagger.dagger', null);
const strong = flurry('dagger.dagger', 'dagger.boneknife');
check('two daggers in a shadowblade\'s hands are dual wielding', pair.dual && !one.dual, `pair ${pair.dual}, one ${one.dual}`);
check(
  'each swing lands one blow; two blades swing twice as often',
  pair.blows === pair.attacks && one.blows === one.attacks && pair.attacks >= one.attacks * 1.8,
  `two blades: ${pair.blows} blows in ${pair.attacks} swings; one blade: ${one.blows} in ${one.attacks}`,
);
check(
  'the hands take turns: right, left, right, left',
  pair.left > 0 && Math.abs(pair.left - pair.right) <= 1 && pair.left + pair.right >= pair.attacks - 1,
  `${pair.right} right, ${pair.left} left in ${pair.attacks} swings`,
);
check(
  'every left swing lands its blow',
  pair.left > 0 && pair.onLeftSwing >= pair.left - 1,
  `${pair.onLeftSwing} blows on ${pair.left} left swings`,
);
check(
  'a second blade adds its damage',
  pair.total > one.total * 1.5,
  `two blades ${Math.round(pair.total)} vs one ${Math.round(one.total)} in 7 s (x${(pair.total / Math.max(1, one.total)).toFixed(2)})`,
);
check(
  'a stronger off-hand blade hits harder',
  strong.total > pair.total * 1.2,
  `dagger+bone knife ${Math.round(strong.total)} vs dagger+dagger ${Math.round(pair.total)}`,
);

// --- venom ----------------------------------------------------------------------

const DUAL = { mainHand: 'dagger.dagger', offHand: 'dagger.dagger' } as const;
{
  const s = scene('shadowblade', { coatBlades: 5 }, DUAL, 13);
  const cast = s.cast('coatBlades');
  s.tick(0.6);
  check('Coat Blades puts its coat on the hero', cast && s.player.status.has('skill.coatBlades'), `cast ${cast}, ${s.player.statuses.map((x) => x.id).join(',')}`);
  let poisonedAt = -1;
  for (let i = 0; i < 24 && poisonedAt < 0; i++) {
    s.runner.basicAttack(s.player, s.at.clone(), s.ctx, [s.foe], null);
    s.tick(0.5);
    if (s.foe.hasStatus('poisoned')) poisonedAt = i + 1;
  }
  check('coated blades poison what they hit', poisonedAt > 0, poisonedAt > 0 ? `Poisoned after ${poisonedAt} attacks` : 'never poisoned');
  const green = s.shown.filter((e) => numberParts(e.amount, e.type, e.parts).some((p) => p.type === 'poison'));
  check('the coat\'s poison shows as its own number on each hit', green.length > 0, `${green.length} of ${s.shown.length} numbers carry poison`);
  const lifeBefore = s.foe.life;
  const from = s.shown.length;
  const hitsBefore = s.packets.length;
  s.tick(3);
  const ticks = s.shown.slice(from).filter((e) => e.type === 'poison');
  check(
    'Poisoned ticks on its own, in poison numbers',
    s.packets.length === hitsBefore && ticks.length > 0 && s.foe.life < lifeBefore,
    `${ticks.length} poison numbers, ${Math.round(lifeBefore - s.foe.life)} life lost in 3s with no hits`,
  );
  s.done();
}
check('a poisoned body wears the green look', (lookBitsOf('poisoned') & LOOK.poisoned) !== 0, `look bits ${lookBitsOf('poisoned')}`);

const stacksAfter = (skills: Record<string, number>, cast: string[], status: string, wait = 1.2): { n: number; all: string } => {
  const s = scene('shadowblade', skills, DUAL, 17);
  for (const id of cast) {
    s.cast(id);
    s.tick(wait);
  }
  const all = (s.foe as unknown as { statuses: Array<{ id: string; stacks: number }> }).statuses.map((x) => `${x.id}x${x.stacks}`).join(',');
  const n = s.foe.stacksOf(status);
  s.done();
  return { n, all };
};
{
  const r = stacksAfter({ viperStrike: 5 }, ['viperStrike'], 'poisoned');
  check('Viper Strike leaves 3 stacks of Poisoned', r.n >= 3, r.all || 'nothing');
}
{
  // The poison is worth having: its ticks carry a real share of the blow.
  const s = scene('shadowblade', { viperStrike: 5 }, DUAL, 37);
  s.cast('viperStrike');
  s.tick(0.6);
  const hit = s.packets.filter((x) => x.p.ability === 'Viper Strike').reduce((n, x) => n + x.p.amount, 0);
  const before = s.foe.life;
  s.tick(4);
  const ticked = before - s.foe.life;
  check(
    'Viper Strike\'s poison ticks for a real share of the strike',
    hit > 0 && ticked >= hit * 0.3,
    `strike ${Math.round(hit)}, then ${Math.round(ticked)} from poison in 4s (${Math.round((ticked / Math.max(1, hit)) * 100)}%)`,
  );
  s.done();
}
{
  const r = stacksAfter({ viperStrike: 1, venomDart: 5 }, ['venomDart'], 'poisoned');
  check('Venom Dart leaves 4 stacks of Poisoned', r.n >= 4, r.all || 'nothing');
}
{
  const r = stacksAfter({ deathLotus: 5 }, ['deathLotus'], 'poisoned', 2.5);
  check('Death Lotus leaves a stack a hit', r.n >= 6, r.all || 'nothing');
}
{
  const r = stacksAfter({ plagueVial: 5 }, ['plagueVial'], 'plagued', 1.5);
  check('Plague Vial leaves Plagued', r.n >= 1, r.all || 'nothing');
}
{
  const r = stacksAfter({ viperStrike: 5, corrosiveEdge: 10 }, ['viperStrike', 'viperStrike', 'viperStrike', 'viperStrike', 'viperStrike'], 'corroded', 0.7);
  check('Corrosive Edge: poison hits leave Corroded', r.n >= 1, r.all || 'nothing');
}
{
  const s = scene('shadowblade', { venomDart: 5, paralyticToxin: 1 }, DUAL, 19);
  s.cast('venomDart');
  s.tick(0.8);
  s.cast('venomDart');
  s.tick(0.5);
  const slowed = s.foe.hasStatus('slowed');
  const stunned = s.foe.hasStatus('stunned');
  check('Paralytic Toxin: poisoned foes slow, and stun at 5 stacks', slowed && stunned, `poisoned x${s.foe.stacksOf('poisoned')}, slowed ${slowed}, stunned ${stunned}`);
  s.done();
}
{
  const fire = SKILLS.find((k) => k.id === 'fireball') ?? SKILLS.find((k) => k.damageType === 'fire' && (k.effect ?? '').startsWith('projectile'));
  if (fire) {
    const s = scene('pyromancer', { [fire.id]: 5, scorch: 10 }, {}, 23);
    for (let i = 0; i < 5 && !s.foe.hasStatus('scorched'); i++) {
      s.cast(fire.id);
      s.tick(0.8);
    }
    check('Scorch: fire hits leave Scorched', s.foe.hasStatus('scorched'), `${fire.id}: ${s.foe.hasStatus('scorched')}`);
    s.done();
  }
}

// --- numbers --------------------------------------------------------------------

const ELEMENTS: DamageType[] = ['fire', 'cold', 'lightning', 'poison', 'arcane'];
{
  const fills = ELEMENTS.map((t) => numberFill(t));
  const phys = numberFill('physical');
  check('physical numbers keep their colour', phys === '#f2ead8', phys);
  check(
    'each element has its own number colour',
    new Set(fills).size === ELEMENTS.length && !fills.includes(phys),
    ELEMENTS.map((t, i) => `${t} ${fills[i]}`).join(', '),
  );
  const split = numberParts(100, 'physical', { poison: 0.25, fire: 0.1 });
  const sum = split.reduce((n, p) => n + p.amount, 0);
  check(
    'an element riding on a swing is drawn in its own colour',
    split.length === 3 && Math.abs(sum - 100) < 1e-6 && split.some((p) => p.type === 'poison' && Math.abs(p.amount - 25) < 1e-6),
    split.map((p) => `${p.type} ${p.amount}`).join(', '),
  );
  check(
    'running totals keep elements apart',
    numberKey('m1', 'fire', false) !== numberKey('m1', 'physical', false) && numberKey('m1', 'fire', true) !== numberKey('m1', 'fire', false),
    `${numberKey('m1', 'fire', false)} / ${numberKey('m1', 'physical', false)}`,
  );
}
for (const el of ELEMENTS) {
  // A real skill of this element, from its own class, at a real monster.
  const pickable = SKILLS.filter((k) => k.damageType === el && k.damageScale && (k.targeting === 'enemy' || k.targeting === 'direction' || k.targeting === 'point'));
  const skill = pickable.find((k) => (k.effect ?? '').startsWith('projectile')) ?? pickable[0];
  if (!skill) continue; // cold has no aimed skill of its own: gear carries it (below)
  const cls = TREE_BY_ID[skill.treeId]!.classId;
  const s = scene(cls, { [skill.id]: 5 }, {}, 29);
  s.cast(skill.id);
  s.tick(1.5);
  const mine = s.packets.filter((x) => x.p.ability === skill.name);
  const types = [...new Set(s.shown.map((e) => e.type))];
  check(
    `a ${el} skill's numbers are ${el} (${skill.id})`,
    mine.length > 0 && s.shown.some((e) => e.type === el) && numberFill(el) !== numberFill('physical'),
    `${mine.length} hits, numbers: ${types.join(',') || 'none'}`,
  );
  s.done();
}

for (const el of ELEMENTS) {
  // Flat damage of the element on gear, riding on a plain physical swing.
  const s = scene('warden', {}, { mainHand: 'sword.short' }, 31);
  const key = `${el}Damage` as const;
  (s.player.stats as unknown as Record<string, number>)[key] = 40;
  s.runner.basicAttack(s.player, s.at.clone(), s.ctx, [s.foe], null);
  s.tick(0.8);
  const drawn = s.shown.flatMap((e) => numberParts(e.amount, e.type, e.parts));
  const mine = drawn.filter((p) => p.type === el);
  check(
    `flat ${el} damage on a sword swing shows as a ${el} number`,
    mine.length > 0 && drawn.some((p) => p.type === 'physical'),
    drawn.map((p) => `${p.type} ${Math.round(p.amount)}`).join(', ') || 'no numbers',
  );
  s.done();
}

console.log(JSON.stringify({ cases }));
