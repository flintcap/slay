/**
 * SLAY — what each skill draws, for the "every skill is 1 of 1" rule.
 *
 * `SkillRunner.cast` draws a skill with the handler for its effect family (a
 * nova draws an expanding ring, a slam a cratered landing). On its own that
 * makes every nova the same nova in a different hue. A skill's motif is the
 * extra drawing that is its own: a shape laid out in its own motion on top of
 * the family's base drawing. `tools/check-unique.mjs` fails when two active
 * skills anywhere in the game share a signature, so a new skill has to bring
 * a new motif.
 */

/** What each effect family's handler draws, in plain words. Mirrors `SkillRunner.cast`. */
export const FAMILY_DRAWING: Readonly<Record<string, string>> = {
  melee: 'weapon swing', cleave: 'weapon swing', whirlwind: 'spinning swing',
  projectile: 'projectile', bolt: 'projectile',
  nova: 'expanding ring', slam: 'cratered landing', meteor: 'falling strike', sky: 'falling strike',
  beam: 'beam', cone: 'cone spray', chain: 'chained arcs', dash: 'dash swing',
  heal: 'heal burst',
  buff: 'self burst', aura: 'self burst', stance: 'self burst', shout: 'self burst',
  banner: 'self burst', self: 'self burst', absorb: 'self burst',
  ground: 'ground zone', trap: 'ground zone', ward: 'ground zone',
  summon: 'raised minion', minion: 'raised minion',
  curse: 'curse ring', debuff: 'curse ring', apply: 'curse ring',
  channel: 'tether beam', wave: 'ground wave', leap: 'leap landing', teleport: 'blink',
  detonate: 'explosion', corpse: 'explosion', point: 'explosion', aoe: 'explosion', capstone: 'explosion',
};

/** A skill's own drawing on top of its family's. */
export interface SkillMotif {
  /** What is drawn: spikes, a rune wheel, shards, a skull. */
  shape: string;
  /** How it moves: bursts out, falls, spirals in, rises. */
  motion: string;
}

/** Skill id -> its own motif. A skill missing here draws only its family's base. */
export const SKILL_MOTIFS: Readonly<Record<string, SkillMotif>> = {};

/** The family half of an effect id. */
export function familyOf(effect: string | undefined): string {
  return (effect ?? 'melee').split('.')[0] ?? 'melee';
}

/**
 * Everything a skill draws that a player could tell apart, without colour or
 * size: two skills with the same signature look like the same spell.
 */
export function visualSignature(skillId: string, effect: string | undefined): string {
  const fam = familyOf(effect);
  const base = FAMILY_DRAWING[fam] ?? 'fallback';
  const m = SKILL_MOTIFS[skillId];
  return m ? `${base} + ${m.shape} ${m.motion}` : base;
}
