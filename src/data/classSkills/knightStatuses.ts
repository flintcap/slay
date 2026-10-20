/**
 * SLAY — what the Knight (class id `warden`) puts on himself. Spread into
 * `../statuses.ts` `STATUSES`.
 *
 * Each stance and guard has a status of its own, so Shield Wall, Guard
 * Stance and Fortress Stance read apart on the bar and stack as their
 * tooltips say. The numbers here are rank one; the rank's own numbers come
 * from `data/skillPower.ts` and replace them when the skill is used.
 */
import type { StatKey } from '../../types';
import type { StatusDef } from '../statuses';
import { tr } from '../../core/I18n';

type Opts = Partial<StatusDef> & Pick<StatusDef, 'desc' | 'color' | 'icon' | 'tags'>;

function st(id: string, name: string, o: Opts): StatusDef {
  return {
    id,
    name,
    polarity: 1,
    maxStacks: o.maxStacks ?? 1,
    mods: o.mods,
    color: o.color,
    icon: o.icon,
    desc: o.desc,
    tags: o.tags,
    stacking: o.stacking ?? (o.maxStacks && o.maxStacks > 1 ? 'stack' : 'refresh'),
    immobilises: o.immobilises,
    baseDuration: o.baseDuration ?? 5,
  };
}

const mods = (m: Partial<Record<StatKey, number>>): Partial<Record<StatKey, number>> => m;

/** How long a stance that stays up until pressed again is put on for. */
export const STANCE_HELD = 1e5;

export const KNIGHT_STATUSES: StatusDef[] = [
  st('shieldWall', tr('Shield Wall'), {
    desc: tr('Guard set: more block chance and damage reduction.'),
    mods: mods({ blockChance: 12, damageReduction: 8 }),
    baseDuration: 8,
    color: 0xc9b27a,
    icon: 'shield-raise',
    tags: ['buff'],
  }),
  st('guardStance', tr('Guard Stance'), {
    desc: tr('Planted and holding: more defense and damage reduction, slower feet. Press Guard Stance again to drop it.'),
    mods: mods({ enhancedDefense: 45, damageReduction: 12, moveSpeed: -25 }),
    baseDuration: STANCE_HELD,
    color: 0x9fb4cf,
    icon: 'guard',
    tags: ['buff', 'held'],
  }),
  st('fortress', tr('Fortress'), {
    desc: tr('Rooted to the floor. Much more defense, block and damage reduction, and nothing can stun, hold or knock you back.'),
    mods: mods({ enhancedDefense: 120, blockChance: 20, damageReduction: 25 }),
    immobilises: true,
    baseDuration: 6,
    color: 0xb59a62,
    icon: 'fortress',
    tags: ['buff'],
  }),
  st('retribution', tr('Retribution'), {
    desc: tr('Blocks stored as bonus damage. Your next blow spends all of it. The count is the stored percent.'),
    maxStacks: 300,
    stacking: 'stack',
    baseDuration: STANCE_HELD,
    color: 0xe0b450,
    icon: 'crown-shield',
    tags: ['buff', 'held'],
  }),
  st('standard', tr('Banner of the Gate'), {
    desc: tr('Fighting under your standard: more defense and damage while you stand inside its ring.'),
    mods: mods({ enhancedDefense: 25, enhancedDamage: 15 }),
    baseDuration: 20,
    color: 0xd8a640,
    icon: 'banner',
    tags: ['buff'],
  }),
];
