/**
 * SLAY — which look a monster gets.
 *
 * Every monster and boss in the data has a look of its own, keyed by its id.
 * The data hands the builder only a `MonsterVisual`; the visual objects are
 * the data's own, so the id is found by reference. Anything without an id
 * (a test visual, a future monster) gets a look built from its body,
 * palette and weapon.
 */
import type { MonsterVisual } from '../../types';
import { MONSTERS, BOSSES } from '../../data/monsters';
import type { CreatureLook } from './Creature';
import { genericLook } from './LookGeneric';
import { UNDEAD } from './LookUndead';
import { HUMANOID } from './LookHumanoid';
import { BEAST } from './LookBeast';
import { BUG } from './LookBug';
import { DEMON } from './LookDemon';

export interface LookCtx {
  id: string;
  family: string;
  rank: string;
  visual: MonsterVisual;
  /** Data scale: the size the game draws it at (bosses use it to keep their height in range). */
  scale: number;
}

export type LookFactory = (c: LookCtx) => CreatureLook;

const FACTORIES: Record<string, LookFactory> = {
  ...UNDEAD,
  ...HUMANOID,
  ...BEAST,
  ...BUG,
  ...DEMON,
};

let ids: WeakMap<MonsterVisual, { id: string; family: string; scale: number }> | null = null;

function idOf(v: MonsterVisual): { id: string; family: string; scale: number } | null {
  if (!ids) {
    ids = new WeakMap();
    for (const m of MONSTERS) ids.set(m.visual, { id: m.id, family: m.family, scale: m.scale });
    for (const b of BOSSES) ids.set(b.visual, { id: b.id, family: b.family, scale: b.scale });
  }
  return ids.get(v) ?? null;
}

/** The monster id a visual belongs to, if it is one of the data's. */
export function monsterIdOf(v: MonsterVisual): string | null {
  return idOf(v)?.id ?? null;
}

/** Whether a monster id has a look of its own (else the generic one). */
export function hasLook(id: string): boolean {
  return !!FACTORIES[id];
}

const looks = new Map<string, CreatureLook>();

/** The look for a visual. Looks are cached; their rigs and sculpts run only when first built. */
export function lookFor(v: MonsterVisual, family?: string, rank?: string): CreatureLook {
  const known = idOf(v);
  const id = known?.id ?? '';
  const key = id ? `id:${id}` : `gen:${v.body}|${v.palette}|${v.weapon ?? ''}|${v.glow ?? ''}|${v.wings ? 1 : 0}|${v.tail ? 1 : 0}|${v.limbs ?? ''}`;
  const hit = looks.get(key);
  if (hit) return hit;
  const ctx: LookCtx = { id, family: known?.family ?? family ?? '', rank: rank ?? 'normal', visual: v, scale: known?.scale ?? 1 };
  const f = id ? FACTORIES[id] : undefined;
  const look = f ? f(ctx) : genericLook(ctx);
  if (!f) look.key = key;
  looks.set(key, look);
  return look;
}

/** Every monster id with a look of its own. */
export function lookIds(): string[] {
  return Object.keys(FACTORIES);
}
