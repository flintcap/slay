/**
 * SLAY — what a Shapeshifter is right now: a man, the black cat, the grey
 * wolf or the bear.
 *
 * The rule (see `docs/remake/shapeshifter.md`): every tree skill is fought in
 * its tree's form, and casting one as a man changes you first. In a form only
 * that beast's skills, the basic attack and the form skills work
 * (`formRefusal`): a form skill changes straight to its beast. The form
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
import * as THREE from 'three';
import type { StatKey } from '../types';
import type { Player } from './Player';
import type { DressedHero } from '../scenes/HeroModel';
import type { BeastForm } from '../art/hero/forms/BeastBody';
import { getStatus, registerStatus, type StatusDef } from '../data/statuses';
import { getSkill } from '../data/skills';
import { effectiveSkillRank } from '../sim/Character';
import { tickShifterFX } from '../fx/shifter/ShifterFX';
import { SHIFTER_SELF_POWER } from '../data/shifterPower';
import { heroPower } from '../sim/HeroPower';
import { tr } from '../core/I18n';

/** A leap or a rush the hero is in the middle of (Pounce, Lunge, Overrun...). */
interface Trip {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  time: number;
  /** Peak height of the arc, metres; 0 runs along the floor. */
  height: number;
  /** 0 even pace; 1 eases out (a leap lands soft); -1 eases in (a charge builds). */
  ease: number;
  step?: (at: THREE.Vector3, u: number) => void;
  land?: () => void;
  /** The action that carries the hero: a dodge or a new action stops the trip where it is, unlanded. */
  id?: number;
}

/** The skill that is each form. */
export const FORM_SKILL: Readonly<Record<BeastForm, string>> = { cat: 'catForm', wolf: 'wolfForm', bear: 'bearForm' };
/** The status that is each form. */
export const FORM_STATUS: Readonly<Record<BeastForm, string>> = { cat: 'form.cat', wolf: 'form.wolf', bear: 'form.bear' };
const FORMS: readonly BeastForm[] = ['cat', 'wolf', 'bear'];

/** A form lasts until it is changed; long enough that the HUD shows no timer. */
const FOREVER = 1e6;

const FORM_LOOK: Readonly<Record<BeastForm, { name: string; color: number; icon: string; desc: string }>> = {
  cat: { name: tr('Shadowcat'), color: 0x6a5aa8, icon: 'ss-catform', desc: tr('The black cat: faster feet, faster claws, cleaner kills.') },
  wolf: { name: tr('Grey Wolf'), color: 0xb08a4a, icon: 'ss-wolfform', desc: tr('The grey wolf: harder bites, and every bite feeds you.') },
  bear: { name: tr('Great Bear'), color: 0x8a5a2e, icon: 'ss-bearform', desc: tr('The bear: more life, a thicker hide, slower feet.') },
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
  private trip: Trip | null = null;

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
    const raw: Partial<Record<StatKey | 'lifePct', number>> = { ...(SHIFTER_SELF_POWER[FORM_SKILL[form]]?.(r - 1, (k, d) => (typeof p[k] === 'number' ? (p[k] as number) : d)).mods ?? {}) };
    // The bear's share of the man's life (no stat is a life percent).
    if (form === 'bear') raw.lifePct = num('life') + num('lifeR') * (r - 1);
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
      // A share of the man's life: the sheet's life less what this form already
      // gives. The sheet multiplies flat life by the hero's level power after
      // the statuses, so the form's own life shows on it that many times over;
      // taking off only the flat number let the share feed on itself every
      // refresh until the bear had twenty times the man's life.
      const mul = heroPower(c.level).life || 1;
      const given = this.player.status.get(FORM_STATUS[form])?.mods?.life ?? 0;
      const man = Math.max(1, this.player.stats.life - given * mul);
      out.life = Math.round((out.life ?? 0) + (man * raw.lifePct) / 100 / mul);
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
      // Ursa Major is the bear's; a man or a cat cannot keep it.
      if (now === 'bear') this.player.status.remove('ss.ursaMajor');
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
    // The application carries this rank's numbers in place of the def's.
    this.player.applyStatus(FORM_STATUS[form], FOREVER, 1, 1, { mods });
  }

  /**
   * Carries the hero to `to` over `time` seconds, `height` metres up at the
   * top of the arc. `step` runs each frame on the way, `land` once at the end.
   * A new trip replaces one under way (its `land` still runs). With `id`
   * (the action's `actionId`), a dodge out of it stops the hero where he is,
   * and nothing lands.
   */
  travel(to: THREE.Vector3, time: number, height: number, o: { ease?: number; step?: (at: THREE.Vector3, u: number) => void; land?: () => void; id?: number } = {}): void {
    this.finishTrip();
    this.trip = {
      from: this.player.position.clone(),
      to: to.clone().setY(this.player.position.y),
      t: 0,
      time: Math.max(0.05, time),
      height,
      ease: o.ease ?? 0,
      step: o.step,
      land: o.land,
      id: o.id,
    };
    this.player.faceTowards(to.x, to.z);
  }

  /** True while a leap or rush is carrying the hero. */
  get travelling(): boolean {
    return this.trip !== null;
  }

  private finishTrip(): void {
    const t = this.trip;
    if (!t) return;
    this.trip = null;
    this.player.position.x = t.to.x;
    this.player.position.z = t.to.z;
    this.hero.root.position.y = 0;
    t.land?.();
  }

  private moveTrip(dt: number): void {
    const t = this.trip;
    if (!t) return;
    if (t.id !== undefined && this.player.actionId !== t.id) {
      // Dodged out of: down where he is, and the blow at the end never comes.
      this.trip = null;
      this.hero.root.position.y = 0;
      return;
    }
    t.t += dt;
    const u = Math.min(1, t.t / t.time);
    const e = t.ease > 0 ? 1 - (1 - u) * (1 - u) : t.ease < 0 ? u * u : u;
    const p = this.player.position;
    p.x = t.from.x + (t.to.x - t.from.x) * e;
    p.z = t.from.z + (t.to.z - t.from.z) * e;
    this.hero.root.position.y = t.height * 4 * u * (1 - u);
    t.step?.(p, u);
    if (u >= 1) this.finishTrip();
  }

  /** Once a frame: the body follows the status, the numbers follow the ranks. */
  update(dt: number): void {
    const form = this.form;
    if (this.hero.form !== form) this.hero.setForm(form);
    this.moveTrip(dt);
    const ursa = form === 'bear' && this.player.status.has('ss.ursaMajor');
    const grow = getSkill('ursaMajor')?.params?.scale;
    this.hero.setFormScale(ursa ? (typeof grow === 'number' ? grow : 1.18) : 1);
    this.hero.updateForm(dt);
    tickShifterFX(dt);
    this.recheck -= dt;
    if (form && this.recheck <= 0) {
      this.recheck = 1;
      this.give(form, false);
    }
  }
}
