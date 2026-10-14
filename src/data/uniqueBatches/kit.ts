/**
 * SLAY — the builder the depth plan's unique batches share.
 *
 * One call per unique: id, name, base, item level, flavour, mods, and the
 * options that give it its reason to exist (a power, a bend, a trade), its
 * look, and the boss that carries it. The level to wear it is the base's, or
 * a little under the item level, whichever is higher. Names and lines are
 * written here in the world's voice (`data/story/uniqueText.ts` has the
 * rules), so these need no story entry.
 *
 * Mods are sized by the band, so a batch reads as intent rather than tables:
 * `['life', 1]` is the usual life for a unique of its level, `['life', 1.4]`
 * a lot of it, `['moveSpeed', -0.8]` a real cost. A full `[stat, min, max]`
 * is taken as written.
 */
import type { CharClassId, StatKey } from '../../types';
import type { UniqueDef } from '../uniques';
import type { SkillBend } from '../skillBends';
import type { Aura, Feature, Finish, GlowStyle, UniqueDesign } from '../../art/items/Designs';
import { ITEM_BASES } from '../itemBases';

export interface UOpt {
  hook?: string;
  /** A power from `sim/ItemPowers.ts`, at `mag` (1 = its own strength). */
  power?: string;
  mag?: number;
  bend?: SkillBend;
  classId?: CharClassId;
  sockets?: number;
  weight?: number;
  rarity?: UniqueDef['rarity'];
  chase?: boolean;
  /** Level to wear it, when not the default. */
  req?: number;
  /** Its own design: the icon, the drop, the held or worn piece. */
  look: UniqueDesign;
  /** The boss that drops it more often than anything else does. */
  from?: string;
}

export type ModSpec = [StatKey, number] | [StatKey, number, number];

const BASE_REQ = new Map<string, number>();
for (const b of ITEM_BASES) BASE_REQ.set(b.id, b.levelReq ?? 1);

/** The usual top roll of a stat on a unique of item level `L`. */
const CURVE: Partial<Record<StatKey, (L: number) => number>> = {
  strength: (L) => 4 + 0.45 * L,
  dexterity: (L) => 4 + 0.45 * L,
  vitality: (L) => 4 + 0.45 * L,
  energy: (L) => 4 + 0.45 * L,
  life: (L) => 15 + 4 * L,
  mana: (L) => 15 + 4 * L,
  lifeRegen: (L) => 3 + 0.5 * L,
  manaRegen: (L) => 5 + L,
  attackRating: (L) => 30 + 9 * L,
  minDamage: (L) => 2 + 0.35 * L,
  maxDamage: (L) => 4 + 0.8 * L,
  attackSpeed: (L) => 8 + 0.25 * L,
  castSpeed: (L) => 8 + 0.25 * L,
  critChance: (L) => 3 + 0.08 * L,
  critDamage: (L) => 10 + 0.6 * L,
  lifeSteal: (L) => 2 + 0.07 * L,
  manaSteal: (L) => 2 + 0.07 * L,
  defense: (L) => 20 + 6 * L,
  blockChance: (L) => 8 + 0.25 * L,
  damageReduction: (L) => 3 + 0.2 * L,
  physicalResist: (L) => 4 + 0.14 * L,
  fireResist: (L) => Math.min(55, 18 + 0.45 * L),
  coldResist: (L) => Math.min(55, 18 + 0.45 * L),
  lightningResist: (L) => Math.min(55, 18 + 0.45 * L),
  poisonResist: (L) => Math.min(55, 18 + 0.45 * L),
  arcaneResist: (L) => Math.min(55, 18 + 0.45 * L),
  fireDamage: (L) => 8 + 2.6 * L,
  coldDamage: (L) => 8 + 2.6 * L,
  lightningDamage: (L) => 8 + 2.6 * L,
  poisonDamage: (L) => 8 + 2.6 * L,
  arcaneDamage: (L) => 8 + 2.6 * L,
  enhancedDamage: (L) => 40 + 3.6 * L,
  enhancedDefense: (L) => 50 + 4 * L,
  elementalDamagePct: (L) => 8 + 0.45 * L,
  areaDamagePct: (L) => 8 + 0.45 * L,
  moveSpeed: (L) => 6 + 0.1 * L,
  magicFind: (L) => 8 + 0.4 * L,
  goldFind: (L) => 20 + L,
  cooldownReduction: (L) => 4 + 0.15 * L,
  skillLevels: (L) => (L >= 70 ? 2 : 1),
};

function sized(stat: StatKey, w: number, L: number, boost: number): [number, number] {
  const top = (CURVE[stat]?.(L) ?? 10) * w * boost;
  const hi = Math.round(top);
  const lo = Math.round(top * 0.72);
  if (hi === 0) return [w < 0 ? -1 : 1, w < 0 ? -1 : 1];
  return w < 0 ? [hi, lo] : [lo, hi];
}

/** Charms are carried, not worn: their numbers are a fraction of a worn piece's. */
const CHARM_SHARE: Record<string, number> = { 'charm.small': 0.3, 'charm.medium': 0.42, 'charm.large': 0.55, 'charm.grand': 0.7 };

export function U(id: string, name: string, baseId: string, ilvl: number, flavor: string, mods: ModSpec[], o: UOpt): UniqueDef {
  const req = o.req ?? Math.min(ilvl, Math.max(BASE_REQ.get(baseId) ?? 1, Math.round(ilvl * 0.92)));
  const boost = (o.rarity === 'mythic' ? 1.15 : 1) * (CHARM_SHARE[baseId] ?? 1);
  const def: UniqueDef = {
    id,
    name,
    baseId,
    rarity: o.rarity ?? 'unique',
    ilvl,
    levelReq: req,
    flavor,
    mods: mods.map((m) => {
      const [min, max] = m.length === 3 ? [m[1], m[2]] : sized(m[0], m[1], ilvl, boost);
      return { stat: m[0], min, max };
    }),
    weight: o.weight ?? (o.rarity === 'mythic' ? 40 : 100),
  };
  if (o.hook) def.hook = o.hook;
  if (o.sockets) def.sockets = o.sockets;
  if (o.power) def.special = o.power;
  if (o.mag !== undefined) def.specialMag = o.mag;
  if (o.classId) def.classId = o.classId;
  if (o.bend) def.bend = o.bend;
  if (o.chase) def.chase = true;
  LOOKS[id] = o.look;
  if (o.from) (FROM[o.from] ??= []).push(id);
  return def;
}

/** Every batch unique's design, by id. `art/items/Designs.ts` folds it in. */
export const LOOKS: Record<string, UniqueDesign> = {};
/** Boss id to the uniques it carries. */
export const FROM: Record<string, string[]> = {};

/**
 * A design in one line: main surface, second (grip, strap, cloth), trim,
 * features, wear, then anything else. Below relic level nothing glows, so
 * `glow` only colours a relic's one lit detail and a mythic's light.
 */
export function D(
  main: string,
  second: string | undefined,
  trim: string | undefined,
  features: Feature[],
  wear: number,
  extra: { cut?: Record<string, number | string | boolean>; finish?: Finish; stone?: number; glow?: number; aura?: Aura; glowStyle?: GlowStyle; glowStrength?: number } = {},
): UniqueDesign {
  const d: UniqueDesign = { main, features, wear, aura: extra.aura ?? 'none', glow: extra.glow ?? extra.stone ?? 0xffe0b0 };
  if (second) d.second = second;
  if (trim) d.trim = trim;
  if (extra.cut) d.cut = extra.cut;
  if (extra.finish) d.finish = extra.finish;
  if (extra.stone !== undefined) d.stone = extra.stone;
  if (extra.glowStyle) d.glowStyle = extra.glowStyle;
  if (extra.glowStrength !== undefined) d.glowStrength = extra.glowStrength;
  return d;
}

/** A set piece's mods: sized like a unique's, a fifth weaker, since the set pays in its bonuses. */
export function setMods(ilvl: number, mods: ModSpec[]): Array<[StatKey, number, number]> {
  return mods.map((m) => (m.length === 3 ? [m[0], m[1], m[2]] : [m[0], ...sized(m[0], m[1], ilvl, 0.8)]));
}
