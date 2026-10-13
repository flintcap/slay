/**
 * SLAY — what a Shapeshifter is right now: a man, the black cat, the grey
 * wolf or the bear.
 *
 * The rule (see `docs/remake/shapeshifter.md`): every tree skill is fought in
 * its tree's form, and casting one out of form changes you first. The form
 * skills (Shadowcat, Grey Wolf, Great Bear) change you on purpose and make the
 * form stronger with their rank; pressing the form you are in stands you back
 * up as a man.
 *
 * A form is a status on the hero (`form.cat`, `form.wolf`, `form.bear`), so
 * its bonuses go through the stat sheet like any buff and the HUD shows which
 * form you are in. Its numbers come from the form skill's rank and the tree's
 * form passives, and are worked out again each second, so a point spent or a
 * +skill ring put on shows straight away. The status is the truth: the body
 * follows it (into a new floor, after a death).
 */
import type { StatKey } from '../types';
import type { Player } from './Player';
import type { DressedHero } from '../scenes/HeroModel';
import type { BeastForm } from '../art/hero/forms/BeastBody';
import { getStatus, registerStatus, type StatusDef } from '../data/statuses';
import { getSkill } from '../data/skills';
import { effectiveSkillRank } from '../sim/Character';

/** The skill that is each form. */
export const FORM_SKILL: Readonly<Record<BeastForm, string>> = { cat: 'catForm', wolf: 'wolfForm', bear: 'bearForm' };
/** The status that is each form. */
export const FORM_STATUS: Readonly<Record<BeastForm, string>> = { cat: 'form.cat', wolf: 'form.wolf', bear: 'form.bear' };
const FORMS: readonly BeastForm[] = ['cat', 'wolf', 'bear'];

/** A form lasts until it is changed; long enough that the HUD shows no timer. */
const FOREVER = 1e6;

const FORM_LOOK: Readonly<Record<BeastForm, { name: string; color: number; icon: string; desc: string }>> = {
  cat: { name: 'Shadowcat', color: 0x6a5aa8, icon: 'ss-catform', desc: 'The black cat: faster feet, faster claws, cleaner kills.' },
  wolf: { name: 'Grey Wolf', color: 0xb08a4a, icon: 'ss-wolfform', desc: 'The grey wolf: harder bites, and every bite feeds you.' },
  bear: { name: 'Great Bear', color: 0x8a5a2e, icon: 'ss-bearform', desc: 'The bear: more life, a thicker hide, slower feet.' },
};

for (const f of FORMS) {
  const L = FORM_LOOK[f];
  const def: StatusDef = {
    id: FORM_STATUS[f],
    name: L.name,
    polarity: 1,
    maxStacks: 1,
    mods: {},
    color: L.color,
    icon: L.icon,
    desc: L.desc,
    tags: ['buff'],
    stacking: 'refresh',
    baseDuration: FOREVER,
  };
  registerStatus(def);
}

/**
 * What each form gives, per stat: the form skill's `<key>` param at rank 1
 * and `<key>R` more per rank. `lifePct` is a share of the life you have as a
 * man; everything else is a stat delta as the sheet counts it.
 */
const FORM_STATS: Readonly<Record<BeastForm, ReadonlyArray<[param: string, stat: StatKey | 'lifePct']>>> = {
  cat: [
    ['moveSpeed', 'moveSpeed'],
    ['attackSpeed', 'attackSpeed'],
    ['crit', 'critChance'],
  ],
  wolf: [
    ['damage', 'enhancedDamage'],
    ['leech', 'lifeSteal'],
    ['attackRating', 'attackRating'],
  ],
  bear: [
    ['life', 'lifePct'],
    ['defense', 'enhancedDefense'],
    ['dr', 'damageReduction'],
    ['moveSpeed', 'moveSpeed'],
  ],
};

/**
 * Passives that only count in their form: skill id, the stat, and how much
 * per rank. (Passives that count in any shape are plain `stat` passives in the
 * tree file.)
 */
export const FORM_PASSIVES: Readonly<Record<BeastForm, ReadonlyArray<{ skill: string; stat: StatKey | 'lifePct'; per: number; cap?: number }>>> = {
  cat: [
    { skill: 'feralGrace', stat: 'attackSpeed', per: 2 },
    { skill: 'feralGrace', stat: 'moveSpeed', per: 1 },
    { skill: 'nightKing', stat: 'enhancedDamage', per: 6 },
  ],
  wolf: [
    { skill: 'thickRuff', stat: 'defense', per: 14 },
    { skill: 'teethMastery', stat: 'attackRating', per: 25 },
  ],
  bear: [
    { skill: 'fatReserves', stat: 'lifePct', per: 2.5, cap: 60 },
    { skill: 'immovableBulk', stat: 'damageReduction', per: 1, cap: 20 },
  ],
};

/** The tree each form is fought in. */
export const FORM_OF_TREE: Readonly<Record<string, BeastForm>> = { feral: 'cat', teeth: 'wolf', claw: 'bear' };

export class Shapeshift {
  private recheck = 0;
  /** The mods each form status was last given, to skip refreshes that change nothing. */
  private given = new Map<BeastForm, string>();

  constructor(
    private readonly player: Player,
    private readonly hero: DressedHero,
  ) {
    // Mesh the beasts while nothing is happening, so the first change in a
    // fight costs no frame. Only in a browser: the headless checkers never show a body.
    if (player.character.classId === 'shapeshifter' && typeof window !== 'undefined') hero.prewarmForms();
  }

  /** The form you are in (from the status), or null as a man. */
  get form(): BeastForm | null {
    for (const f of FORMS) if (this.player.status.has(FORM_STATUS[f])) return f;
    return null;
  }

  /** The form a skill is fought in, or null for one that is not a tree skill of the Shapeshifter. */
  static formFor(skillId: string): BeastForm | null {
    const def = getSkill(skillId);
    return def ? (FORM_OF_TREE[def.treeId] ?? null) : null;
  }

  /** The rank a form is held at: its skill's rank, or 1 if it is not learned (the body still changes). */
  private rankOf(form: BeastForm): number {
    const c = this.player.character;
    return Math.max(1, effectiveSkillRank(c, FORM_SKILL[form], this.player.stats));
  }

  /** The stat deltas a form gives at the hero's ranks. */
  modsFor(form: BeastForm): Partial<Record<StatKey, number>> {
    const def = getSkill(FORM_SKILL[form]);
    const p = def?.params ?? {};
    const num = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : 0);
    const r = this.rankOf(form);
    const raw: Partial<Record<StatKey | 'lifePct', number>> = {};
    for (const [key, stat] of FORM_STATS[form]) raw[stat] = (raw[stat] ?? 0) + num(key) + num(`${key}R`) * (r - 1);
    const c = this.player.character;
    for (const fp of FORM_PASSIVES[form]) {
      const pr = c.skills[fp.skill] ? effectiveSkillRank(c, fp.skill, this.player.stats) : 0;
      if (pr <= 0) continue;
      const v = fp.per * pr;
      raw[fp.stat] = (raw[fp.stat] ?? 0) + (fp.cap !== undefined ? Math.min(fp.cap, v) : v);
    }
    const out: Partial<Record<StatKey, number>> = {};
    for (const [k, v] of Object.entries(raw) as Array<[StatKey | 'lifePct', number]>) {
      if (k === 'lifePct') continue;
      out[k] = Math.round(v * 10) / 10;
    }
    if (raw.lifePct) {
      // A share of the man's life: the sheet's life less what this form already gives.
      const st = getStatus(FORM_STATUS[form]);
      const given = this.player.status.has(FORM_STATUS[form]) ? (st?.mods?.life ?? 0) : 0;
      const man = Math.max(1, this.player.stats.life - given);
      out.life = Math.round((out.life ?? 0) + (man * raw.lifePct) / 100);
    }
    return out;
  }

  /**
   * Changes shape. True when the shape changed. Keeps the share of life you
   * had, so the bear's bigger pool does not arrive empty or leave you dead.
   */
  become(form: BeastForm | null): boolean {
    const now = this.form;
    if (now === form) return false;
    if (now) {
      this.player.status.remove(FORM_STATUS[now]);
      this.given.delete(now);
    }
    if (form) this.give(form, true);
    else this.player.refreshStats();
    this.hero.setForm(form);
    return true;
  }

  /** Puts a form's status on with fresh numbers. */
  private give(form: BeastForm, fresh: boolean): void {
    const st = getStatus(FORM_STATUS[form]);
    if (!st) return;
    const mods = this.modsFor(form);
    const key = JSON.stringify(mods);
    if (!fresh && this.given.get(form) === key) return;
    this.given.set(form, key);
    // The container caches summed mods; take the status off and put it back on
    // so the new numbers are read.
    this.player.status.remove(FORM_STATUS[form]);
    st.mods = mods;
    this.player.applyStatus(FORM_STATUS[form], FOREVER);
  }

  /** Once a frame: the body follows the status, the numbers follow the ranks. */
  update(dt: number): void {
    const form = this.form;
    if (this.hero.form !== form) this.hero.setForm(form);
    this.hero.updateForm(dt);
    this.recheck -= dt;
    if (form && this.recheck <= 0) {
      this.recheck = 1;
      this.give(form, false);
    }
  }
}
