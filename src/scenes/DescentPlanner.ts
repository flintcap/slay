/**
 * SLAY — choosing a descent at the gate.
 *
 * The gate opens on the next depth, and the player may step down to any
 * tier already cleared to replay it (a lower tier never lowers the record).
 * With **Waypoints** (rank 7) it also offers every claimed depth milestone
 * deeper than that, so a new life can start where an old one got to. With
 * **Pacts** (rank 9) it then offers three dangers to take on by choice: each is
 * a run modifier at full strength, and each one taken makes the descent's
 * Renown worth a quarter more (on top of the magic and gold find every
 * modifier already pays).
 *
 * TownScene calls `planDescent` when the gate is used; `go` receives the depth
 * and the pacts (as `id@tier` modifier strings) for the dungeon payload.
 */

import type { Character } from '../types';
import { save } from '../core/Save';
import { hasUnlock, descentOptions } from '../sim/Legacy';
import { hashString, Random } from '../core/RNG';
import { RUN_MODIFIERS } from '../world/DungeonGen';
import { offerChoice, offerGate } from '../ui/ChoiceSeam';
import { modValue } from './RunModifiers';
import { tr } from '../core/I18n';

/** Modifiers that act during play, so taking one after generation is real. */
export const PACT_POOL = [
  'mod.hardened',
  'mod.savage',
  'mod.swift',
  'mod.resistant',
  'mod.reflect',
  'mod.drain',
  'mod.fragile',
  'mod.unstable',
  'mod.blaze',
  'mod.frostbite',
  'mod.ambush',
  'mod.hunted',
  'mod.void',
  'mod.gloom',
];

/** Renown bonus per pact taken. */
export const PACT_RENOWN = 0.25;

export function pactTier(depth: number): number {
  return Math.min(4, 2 + Math.floor(depth / 30));
}

/** Three pacts for this character's next descent, seeded so reopening the gate offers the same three. */
export function pactOffers(c: Pick<Character, 'id' | 'depthRecord'>, depth: number): string[] {
  const rng = new Random(hashString(`pact:${c.id}:${c.depthRecord}:${depth}`));
  const pool = PACT_POOL.filter((id) => (RUN_MODIFIERS.find((m) => m.id === id)?.minDepth ?? 999) <= Math.max(depth, 3));
  rng.shuffle(pool);
  const t = pactTier(depth);
  return pool.slice(0, 3).map((id) => {
    const def = RUN_MODIFIERS.find((m) => m.id === id)!;
    return `${id}@${Math.min(def.maxTier, t)}`;
  });
}

export function planDescent(c: Character, go: (depth: number, pacts: string[]) => void): void {
  const depths = descentOptions(save.account, c);
  const choosePacts = (depth: number) => {
    if (!hasUnlock(save.account, 'pacts')) {
      go(depth, []);
      return;
    }
    const offers = pactOffers(c, depth);
    offerChoice(
      tr('A Pact at the Gate'),
      tr('Take on a danger by choice. Each pact makes this descent\'s Renown worth {0}% more.', Math.round(PACT_RENOWN * 100)),
      [
        { id: 'none', title: tr('No pact'), gain: tr('Descend as you are') },
        ...offers.map((m) => {
          const [id, tier] = m.split('@');
          const def = RUN_MODIFIERS.find((d) => d.id === id)!;
          return {
            id: m,
            title: `${def.name}${Number(tier) > 1 ? ` ${'I'.repeat(Number(tier))}` : ''}`,
            gain: tr('+{0}% Renown this descent', Math.round(PACT_RENOWN * 100)),
            cost: def.desc.replace(/\{v\}/g, String(modValue(id!, Number(tier)))),
          };
        }),
      ],
      (id) => {
        if (!id) return; // walked away: stay in camp
        go(depth, id !== 'none' ? [id] : []);
      },
    );
  };
  // The gate always asks which tier: the deepest open one first, any tier
  // below it to replay, and Legacy waypoints past it (ui/GatePanel.ts).
  offerGate(
    { top: depths[0]!, record: c.depthRecord, waypoints: depths.slice(1), level: c.level },
    (depth) => {
      if (depth === null) return; // walked away: stay in camp
      choosePacts(depth);
    },
  );
}
