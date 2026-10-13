/**
 * SLAY — what the Paladin puts on things, and on himself. Spread into
 * `../statuses.ts` `STATUSES`.
 *
 * Plain data in the catalogue's own shape. Kept apart so the class lives in
 * its own files; the catalogue's private `def` helper is mirrored here.
 */
import type { StatKey } from '../../types';
import type { StatusDef } from '../statuses';

type Opts = Partial<StatusDef> & Pick<StatusDef, 'desc' | 'color' | 'icon' | 'tags'>;

function st(id: string, name: string, polarity: 1 | -1, o: Opts): StatusDef {
  return {
    id,
    name,
    polarity,
    maxStacks: o.maxStacks ?? 1,
    mods: o.mods,
    dot: o.dot,
    color: o.color,
    icon: o.icon,
    desc: o.desc,
    tags: o.tags,
    stacking: o.stacking ?? (o.maxStacks && o.maxStacks > 1 ? 'stack' : 'refresh'),
    diminishing: o.diminishing,
    incapacitates: o.incapacitates,
    immobilises: o.immobilises,
    hot: o.hot,
    manaPerSecond: o.manaPerSecond,
    reflect: o.reflect,
    absorb: o.absorb,
    baseDuration: o.baseDuration ?? 5,
  };
}

const mods = (m: Partial<Record<StatKey, number>>): Partial<Record<StatKey, number>> => m;

export const PALADIN_STATUSES: StatusDef[] = [
  // ----------------------------------------------------------------- Mace
  st('staggered', 'Staggered', -1, {
    desc: 'Knocked off its feet by weight. -25% movement speed and -20% attack speed.',
    mods: mods({ moveSpeed: -25, attackSpeed: -20 }),
    stacking: 'strongest',
    baseDuration: 2,
    color: 0xc8a46a,
    icon: 'anchor',
    tags: ['physical', 'movement'],
  }),
  st('dented', 'Dented', -1, {
    desc: 'Armour beaten out of shape. -12% defense and -4% physical resistance per dent, up to five.',
    mods: mods({ enhancedDefense: -12, physicalResist: -4 }),
    maxStacks: 5,
    stacking: 'stack',
    baseDuration: 6,
    color: 0x9aa0a8,
    icon: 'crack',
    tags: ['physical', 'shred'],
  }),
  st('rung', 'Rung', -1, {
    desc: 'Struck like a bell, the skull still humming. Cannot act or move.',
    incapacitates: true,
    immobilises: true,
    diminishing: true,
    baseDuration: 1,
    color: 0xe0c070,
    icon: 'bell',
    tags: ['control'],
  }),
  st('smoked', 'Smoked', -1, {
    desc: 'Eyes full of censer smoke and hot ash. -30% attack rating, and the coals keep burning.',
    mods: mods({ attackRating: -30 }),
    dot: { type: 'fire', perSecond: 5 },
    baseDuration: 4,
    color: 0x8a7a66,
    icon: 'censer',
    tags: ['dot', 'fire'],
  }),
  // ---------------------------------------------------------------- Blade
  st('opened', 'Opened', -1, {
    desc: 'Cut along the grain and left to run. Physical damage over time, up to five cuts deep.',
    dot: { type: 'physical', perSecond: 6 },
    maxStacks: 5,
    stacking: 'stack',
    baseDuration: 5,
    color: 0xa82a22,
    icon: 'gash',
    tags: ['dot', 'physical'],
  }),
  st('exposed', 'Exposed', -1, {
    desc: 'Guard turned aside, armour gapped. -20% defense and -8% physical resistance.',
    mods: mods({ enhancedDefense: -20, physicalResist: -8 }),
    baseDuration: 5,
    color: 0xd8b070,
    icon: 'crosshair',
    tags: ['physical', 'shred'],
  }),
  st('parrying', 'Parrying', 1, {
    desc: 'Blade up and turned. +50% block chance until the answer comes.',
    mods: mods({ blockChance: 50 }),
    baseDuration: 1.2,
    color: 0xc8ccd4,
    icon: 'ward',
    tags: ['buff'],
  }),
  st('barred', 'Barred', 1, {
    desc: 'Shield set against the door. +20% block chance and +10 damage reduction.',
    mods: mods({ blockChance: 20, damageReduction: 10 }),
    baseDuration: 5,
    color: 0xb89a6a,
    icon: 'ward',
    tags: ['buff'],
  }),
];
