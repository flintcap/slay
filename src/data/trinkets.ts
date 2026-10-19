/**
 * SLAY — trinkets: small things a boss drops that each do one job once and
 * break doing it (`sim/Trinkets.ts`).
 *
 * They are uniques by colour and take one cell of the pack, like a small
 * charm. Their weights run from the most common to the rarest; a trinket
 * added later takes a weight beside these.
 */

export type TrinketUse =
  /** Right-click in a map: a portal home that waits for the hero to come back. */
  | 'portal'
  /** Never clicked: carried when the hero dies in a map, it takes the death. */
  | 'death';

export type TrinketTier = 'common' | 'rare';

export interface TrinketDef {
  /** Also the item base id (`data/itemBases.ts`). */
  id: string;
  name: string;
  tier: TrinketTier;
  /** Share of trinket drops. */
  weight: number;
  use: TrinketUse;
  /** What it does, for the tooltip. */
  text: string[];
  /** A line of its story, for the tooltip. */
  flavor: string;
  /** Vendor value in gold before the sale cut. */
  value: number;
}

export const TRINKETS: readonly TrinketDef[] = [
  {
    id: 'trinket.town',
    name: 'Trinket of Town',
    tier: 'common',
    weight: 80,
    use: 'portal',
    text: [
      'Right-click in a map: opens a portal to town.',
      'Step through to go home and keep everything.',
      'Step back through it in town to return; it closes behind you.',
      'Right-click the portal in town to close it and end the map.',
      'Breaks when used.',
    ],
    flavor: 'A door small enough to lose in a pocket, and it always opens on the same street.',
    value: 600,
  },
  {
    id: 'trinket.death',
    name: 'Trinket of Death',
    tier: 'rare',
    weight: 20,
    use: 'death',
    text: [
      'Carry it in your pack. If you die in a map,',
      'it breaks and you wake in town unharmed,',
      'keeping everything you found there.',
    ],
    flavor: 'Someone paid for this with a death that never came. It will take one more.',
    value: 2400,
  },
];

/** Chance a fallen boss drops a trinket at all, by kind of boss. */
export const TRINKET_CHANCE = {
  /** A map's own boss. */
  boss: 0.07,
  /** A floor warden. */
  warden: 0.025,
} as const;

export function getTrinket(id: string): TrinketDef | undefined {
  return TRINKETS.find((t) => t.id === id);
}
