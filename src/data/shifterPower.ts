/**
 * SLAY — what a point buys in each Shapeshifter buff and in his one curse.
 * Spread into `SELF_POWER` and `FOE_POWER` (`data/skillPower.ts`).
 *
 * Every number reads the skill's own params: `x` at rank 1 and `xR` more a
 * rank, exactly what the tree text says. `k` is ranks past the first.
 *
 * The forms are here too, for the tools and the tooltip; in play their
 * numbers go on through `entities/Shapeshift.ts`, which also turns the
 * bear's share of life into flat life (there is no life-percent stat).
 */
import type { FoePower, SelfPower } from './skillPower';
import type { SkillDef } from '../types';
import type { Hands } from '../sim/Speed';

type Num = (key: string, d: number) => number;
type Beast = 'cat' | 'wolf' | 'bear';

/**
 * How each beast swings next to the weapon hidden in its hands: the cat
 * quicker than the weapon, the wolf a little quicker, the bear slower. The
 * weapon still sets the pace (a great maul is no cat's weapon), and damage
 * per hit never changes with it (owner's rule).
 */
export const FORM_PACE: Readonly<Record<Beast, number>> = { cat: 1.25, wolf: 1.1, bear: 0.85 };

const TREE_BEAST: Readonly<Record<string, Beast>> = { feral: 'cat', teeth: 'wolf', claw: 'bear' };

/** The beast a Shapeshifter skill is fought in (a tree skill always is), or null. */
export function beastOfSkill(def: Pick<SkillDef, 'treeId' | 'effect'>): Beast | null {
  if (!def.effect?.startsWith('shift.') || def.effect === 'shift.form') return null;
  return TREE_BEAST[def.treeId] ?? null;
}

/** What is in the hands, at the pace of the beast holding it (a man: the weapon's own). */
export function formHands(hands: Hands, form: Beast | null | undefined): Hands {
  return form ? { ...hands, aps: hands.aps * FORM_PACE[form] } : hands;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
/** A param at a rank: its base plus its `R` step for every rank past the first. */
const g = (n: Num, key: string, d: number, k: number): number => r1(n(key, d) + n(`${key}R`, 0) * k);

export const SHIFTER_SELF_POWER: Record<string, (k: number, n: Num) => SelfPower> = {
  // The forms (kept on while you hold them).
  catForm: (k, n) => ({
    status: 'form.cat',
    mods: { moveSpeed: g(n, 'moveSpeed', 12, k), attackSpeed: g(n, 'attackSpeed', 10, k), critChance: g(n, 'crit', 4, k) },
  }),
  wolfForm: (k, n) => ({
    status: 'form.wolf',
    mods: { enhancedDamage: g(n, 'damage', 20, k), lifeSteal: g(n, 'leech', 3, k), attackRating: g(n, 'attackRating', 40, k) },
  }),
  bearForm: (k, n) => ({
    status: 'form.bear',
    mods: { enhancedDefense: g(n, 'defense', 40, k), damageReduction: g(n, 'dr', 6, k), moveSpeed: n('moveSpeed', -8) },
  }),

  // Feral
  slink: (k, n) => ({
    status: 'ss.slink',
    duration: g(n, 'duration', 4, k),
    mods: { moveSpeed: g(n, 'moveSpeed', 30, k), critChance: g(n, 'crit', 20, k) },
  }),
  nightHunt: (k, n) => ({
    status: 'ss.nightHunt',
    duration: g(n, 'duration', 8, k),
    mods: { moveSpeed: g(n, 'moveSpeed', 25, k), critChance: g(n, 'crit', 25, k), critDamage: g(n, 'critDamage', 50, k) },
  }),

  // Teeth
  huntingHowl: (k, n) => ({
    status: 'ss.huntingHowl',
    duration: g(n, 'duration', 12, k),
    mods: { enhancedDamage: g(n, 'damage', 15, k), attackRating: g(n, 'attackRating', 60, k) },
  }),
  bloodHowl: (k, n) => ({
    status: 'ss.bloodHowl',
    duration: g(n, 'duration', 8, k),
    mods: { lifeSteal: g(n, 'leech', 6, k) },
    healPct: g(n, 'heal', 10, k),
  }),
  bloodmoon: (k, n) => ({
    status: 'ss.bloodmoon',
    duration: g(n, 'duration', 10, k),
    mods: { enhancedDamage: g(n, 'damage', 40, k), lifeSteal: g(n, 'leech', 10, k) },
  }),

  // Claw
  bristle: (k, n) => ({
    status: 'ss.bristle',
    duration: g(n, 'duration', 8, k),
    mods: { damageReduction: g(n, 'dr', 10, k) },
  }),
  ursaMajor: (k, n) => ({
    status: 'ss.ursaMajor',
    duration: g(n, 'duration', 12, k),
    // The life share goes on as flat life in the handler (`scenes/ShifterRunner.ts`).
    mods: { enhancedDamage: g(n, 'damage', 30, k) },
  }),
};

export const SHIFTER_FOE_POWER: Record<string, (k: number, n: Num) => FoePower> = {
  rattlingRoar: (k, n) => ({
    status: 'ss.rattled',
    duration: g(n, 'duration', 5, k),
    mods: { enhancedDamage: -g(n, 'weaken', 20, k) },
  }),
};

/** Bristle's share of a melee hit sent back (0..1) at a rank. */
export const bristleReflect = (k: number, n: Num): number => g(n, 'reflect', 30, k) / 100;

/** Ursa Major's life share, percent of the bear's life, at a rank. */
export const ursaLifePct = (k: number, n: Num): number => g(n, 'life', 30, k);
