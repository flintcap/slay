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
    desc: 'Shield set against the door. +20% block chance and +10% damage reduction.',
    mods: mods({ blockChance: 20, damageReduction: 10 }),
    baseDuration: 5,
    color: 0xb89a6a,
    icon: 'ward',
    tags: ['buff'],
  }),
  // ----------------------------------------------------------------- Aura
  // A vigil's own numbers ride on each application (`data/skillPower.ts`);
  // the ones here are its rank-1 reference.
  st('tallowLit', 'Tallow Light', 1, {
    desc: 'Inside the ring of candles. Life and mana come back faster.',
    mods: mods({ lifeRegen: 4, manaRegen: 1.5 }),
    baseDuration: 1.4,
    color: 0xe8c878,
    icon: 'candle',
    tags: ['buff', 'aura', 'held'],
  }),
  st('ironVigil', 'Iron Vigil', 1, {
    desc: 'Kept awake on the cold floor. More defense and damage reduction.',
    mods: mods({ enhancedDefense: 30, damageReduction: 4 }),
    baseDuration: 1.4,
    color: 0x9aa4ae,
    icon: 'rood',
    tags: ['buff', 'aura', 'held'],
  }),
  st('fervent', 'Fervour', 1, {
    desc: 'The blood up, the prayer fast. Faster attacks, casts and feet.',
    mods: mods({ attackSpeed: 8, castSpeed: 8, moveSpeed: 6 }),
    baseDuration: 1.4,
    color: 0xe07a3a,
    icon: 'heart',
    tags: ['buff', 'aura', 'held'],
  }),
  st('vespers', 'Vespers', 1, {
    desc: 'The evening office said under a vigil. More life regeneration and damage reduction.',
    mods: mods({ lifeRegen: 2, damageReduction: 1 }),
    baseDuration: 1.4,
    color: 0x8a7ab0,
    icon: 'candle',
    tags: ['buff', 'aura', 'held'],
  }),
  st('anointed', 'Anointed', 1, {
    desc: 'Oil on the brow and the blade. More damage and attack rating.',
    mods: mods({ enhancedDamage: 20, attackRating: 30 }),
    baseDuration: 20,
    color: 0xd8b860,
    icon: 'chalice',
    tags: ['buff'],
  }),
  st('martyred', "Martyr's Vow", 1, {
    desc: 'Sworn to take it. A ward of life soaks damage, and what gets through is less.',
    mods: mods({ damageReduction: 5 }),
    baseDuration: 10,
    color: 0xb04838,
    icon: 'heart',
    tags: ['buff'],
  }),
  st('censured', 'Censured', -1, {
    desc: 'Named and condemned. Weaker blows, a thinner guard. When it dies the censure finds the next one.',
    mods: mods({ attackRating: -20, enhancedDefense: -15 }),
    baseDuration: 8,
    color: 0x6a5030,
    icon: 'writ',
    tags: ['curse'],
  }),
  st('choking', 'Choking', -1, {
    desc: 'Censer smoke in the throat. Less attack rating and slower attacks.',
    mods: mods({ attackRating: -15, attackSpeed: -8 }),
    baseDuration: 1.4,
    color: 0x7a7066,
    icon: 'miasma',
    tags: ['curse', 'aura'],
  }),
  st('ashWrit', 'Writ of Ash', -1, {
    desc: 'Read out over it, and the words burn. Every resistance lowered.',
    mods: mods({ physicalResist: -8, fireResist: -8, coldResist: -8, lightningResist: -8, poisonResist: -8, arcaneResist: -8 }),
    baseDuration: 1.4,
    color: 0x5a4a3a,
    icon: 'writ',
    tags: ['curse', 'aura', 'shred'],
  }),
  st('consecrated', 'Consecrated', -1, {
    desc: 'Holy ground under unholy feet. Slower to move and to strike.',
    mods: mods({ moveSpeed: -20, attackSpeed: -5 }),
    baseDuration: 1.4,
    color: 0xc8a050,
    icon: 'candle',
    tags: ['movement', 'aura'],
  }),
  st('penitent', 'Penitent', -1, {
    desc: 'Kneeling in the ring whether it likes it or not. Lower physical and fire resistance.',
    mods: mods({ physicalResist: -2, fireResist: -2 }),
    baseDuration: 1.4,
    color: 0x8a6040,
    icon: 'rood',
    tags: ['shred', 'aura'],
  }),
];
