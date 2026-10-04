/**
 * SLAY — the why.
 *
 * THE PREMISE, for anyone adding to it:
 *
 *   Under the hill there is a Tenant. Nobody has seen it whole. Every people
 *   that has lived above it tried something: the city of Caul housed it and
 *   fed it their dead, the Cindergate Works armed a war against it, the Drowned
 *   Sanctum prayed to it, the Rime Archive froze it, a country burned itself to
 *   starve it, and something from outside drove the Hollow Spire into it like a
 *   nail. Each attempt became a layer. The layers are the biomes.
 *
 *   The Tenant rises to meet whoever is deepest, the way water finds the lowest
 *   cut. While a delver is below, it is busy with them. Stairhead, the camp at
 *   the top of the stair, was founded on that one fact: keep somebody down
 *   there, always, and the town sleeps. The delvers think they are exploring.
 *   They are the lid.
 *
 *   It has no bottom. The bottom is wherever the Tenant has been pushed to,
 *   and it moves down to make room for whoever comes. That is why the descent
 *   is endless, and why going deeper is worth something: whatever is below you
 *   stays below because you are there.
 *
 * Chapters are revealed once per account, the first time any character
 * reaches their tier. Past the last written chapter the Deep Ledger takes over
 * and writes one entry every twenty tiers, forever.
 */

import type { Chapter } from './types';
import { streamFor } from '../../core/RNG';

export const CHAPTERS: Chapter[] = [
  {
    id: 'ch.stairhead',
    depth: 0,
    title: 'Stairhead',
    text: [
      `There was a city here once. It went down a tier at a time, the way a cellar floods, and what is left above ground is a palisade, a fire, and a gate in the old stone with light coming up through it.`,
      `The light is not torchlight. Something below is still using the place.`,
      `Stairhead exists to keep one delver on the stair. When nobody is down there, things come up. When somebody is, they go down to meet them. Nobody in camp will tell you which of those is the point.`,
    ],
  },
  {
    id: 'ch.first',
    depth: 1,
    title: 'Four Hundred Steps',
    text: [
      `The stair goes down further than the hill it sits under. You stop counting at four hundred, because the count stops agreeing with itself.`,
      `At the bottom is the old city's graveyard, still tidy. Someone sweeps it.`,
    ],
  },
  {
    id: 'ch.tenant',
    depth: 3,
    title: 'It Is Not a Ruin',
    text: [
      `The warning at the stairhead is old and unsigned: IT IS NOT A RUIN. SOMEONE IS STILL USING IT.`,
      `Down here you see what it meant. Fresh oil in the lamps. Doors rehung. Bones reshelved in better order than you left them. The deep has a tenant, and the tenant keeps house.`,
    ],
  },
  {
    id: 'ch.house',
    depth: 5,
    title: 'The House',
    text: [
      `A plaque in the ossuary, in the survey tongue: WE MADE IT A HOUSE SO IT WOULD STAY IN THE HOUSE.`,
      `The city of Caul did not bury its dead here out of grief. It was paying rent. Every body laid on a shelf was one more reason for the Tenant to stay below.`,
      `Caul paid for nine hundred years. Then it stopped paying, and went down to settle the account in person.`,
    ],
  },
  {
    id: 'ch.war',
    depth: 8,
    title: 'A War Nobody Ended',
    text: [
      `The Cindergate Works were built to arm Caul against what lived under it. Their order books name no enemy. They give a depth.`,
      `The war was lost so long ago that the losing is geology now. The Works never heard. They are still filling the order, and the order has been revised, in a hand that is not a clerk's, to something larger.`,
    ],
  },
  {
    id: 'ch.eleventh',
    depth: 11,
    title: 'The Eleventh',
    text: [
      `The Third Expedition reached this tier and turned back. You find their camp: cold ash, a bedroll, a wall where they cut their names before they left.`,
      `There are more names than there were men. The extra ones are newer. One of them is yours, in letters you would have cut yourself, and the edges are still sharp.`,
    ],
  },
  {
    id: 'ch.nail',
    depth: 15,
    title: 'The Nail',
    text: [
      `The Hollow Spire did not grow. It was driven, point first, from somewhere the sky does not reach, and it went through every layer the cities built until it struck the Tenant and pinned it.`,
      `That is all the Spire is for. It is a nail. It has been working loose for a thousand years, and the stair at Stairhead opened the year it moved.`,
    ],
  },
  {
    id: 'ch.archive',
    depth: 20,
    title: 'Everything Thrown at It',
    text: [
      `The Rime Archive kept a list. Caul fed it. The Works armed against it. The Sanctum prayed to it. The hive ate what it left. The Archive froze it. A country burned itself to starve it. Something from outside nailed it down.`,
      `Under the list, in a later hand: It kept all of it. It is made of what we tried.`,
    ],
  },
  {
    id: 'ch.bottom',
    depth: 25,
    title: 'The Bottom',
    text: [
      `The thing that holds this tier calls itself the bottom, and for a long time nothing came down to argue.`,
      `The stair goes on past it. Of course it does. The bottom is not a floor. It is wherever the Tenant has been pushed to, and it is moving.`,
    ],
  },
  {
    id: 'ch.rises',
    depth: 30,
    title: 'It Rises to Meet You',
    text: [
      `The Listener was right about the one thing she never said aloud. The deep does not sit still while you walk it. It rises to meet whoever is lowest, the way water finds the deepest cut.`,
      `While you are down here it is busy with you. Stairhead sleeps because you do not.`,
    ],
  },
  {
    id: 'ch.name',
    depth: 40,
    title: 'A Name, Not a Number',
    text: [
      `Something has been counting since the Spire went in. The Archive guessed it was counting the dead. The tallies on these walls say otherwise. It counts delvers.`,
      `It is not waiting for a number. It is learning a name, a little from each of you, and it has most of yours.`,
    ],
  },
  {
    id: 'ch.room',
    depth: 50,
    title: 'Below Every Map',
    text: [
      `No survey mark reaches this far. No city built here. The layers are out of order now: crypt opens onto spire, spire onto ash, as if the Tenant had taken its own history down off the shelf and put it back in a hurry.`,
      `It is not hiding. It is making room.`,
    ],
  },
  {
    id: 'ch.rent',
    depth: 65,
    title: 'Rent',
    text: [
      `Caul paid in bodies. Stairhead pays in delvers. The Tenant never asked for either. It takes what is offered, because that is what a tenant does with rent.`,
      `What it wants is not your death. It wants company at the bottom, and it is patient about the terms.`,
    ],
  },
  {
    id: 'ch.deepest',
    depth: 80,
    title: 'The Deepest One',
    text: [
      `Every delver before you stopped somewhere. Their stopping places are the tiers, each one the furthest somebody held it.`,
      `You are past all of them. Below you is only the Tenant, and above you is everyone who ever went down. For the first time it is not rising. It is waiting to see what you do.`,
    ],
  },
  {
    id: 'ch.lid',
    depth: 100,
    title: 'The Lid',
    text: [
      `There is no bottom. There is only the deepest one, and that is you.`,
      `Whatever is below you stays below because you are here. Not by strength. By standing in the way. The bell has not rung tonight, and two hundred people are asleep on top of you.`,
      `Keep going. It is the only direction that holds.`,
    ],
  },
];

const BY_ID = new Map(CHAPTERS.map((c) => [c.id, c]));

export function chapterById(id: string): Chapter | undefined {
  return BY_ID.get(id) ?? deepLedgerById(id);
}

// ---------------------------------------------------------------------------
// The Deep Ledger — one entry every twenty tiers past the last chapter.
// ---------------------------------------------------------------------------

/** The Deep Ledger starts this many tiers after the last written chapter. */
export const LEDGER_EVERY = 20;
const LEDGER_FROM = CHAPTERS[CHAPTERS.length - 1]!.depth + LEDGER_EVERY;

const LEDGER_OPEN: string[] = [
  `Nothing on this tier was built. It was made room for.`,
  `The walls here are not stone. They have agreed to behave like stone while you are passing.`,
  `There are footprints in the dust going down. They are yours, and they are old.`,
  `The dark at this depth has weight. It settles on the shoulders like a hand that means well.`,
  `Somewhere on this tier a bell rings once, very far up, and you realise it is the camp's.`,
  `The stair is narrower here, worn in the middle by feet that were not human and were not in a hurry.`,
  `A survey mark, in a hand you do not know, gives this tier a number one lower than yours.`,
  `The air tastes of every biome above it at once: dust, iron, salt, frost, ash.`,
];

const LEDGER_TURN: string[] = [
  `The Tenant has moved down to make room for you. It is not retreating. It is being a good host.`,
  `Below you something very large shifts its weight, and the whole tier settles a finger's width.`,
  `It has started leaving the lamps lit for you.`,
  `The pressure from below eases as you arrive, the way a held door eases when someone takes the other side.`,
  `It knows your step now. It does not hurry to meet it.`,
  `There is a chair here, carved from the rock, facing up the stair. It is warm.`,
  `What you are holding down has stopped testing you. It is waiting to see how long you last.`,
];

const LEDGER_CLOSE: string[] = [
  `Above, the bell does not ring.`,
  `Marrow will want a longer chisel.`,
  `Two hundred people sleep on top of you and do not know your name. That is the arrangement.`,
  `Go on. Down is the only direction that holds.`,
  `The Listener, a very long way up, turns her ear from the floor for the first time in years and sleeps.`,
  `Corvane will enter it in the book under assets.`,
  `The lid holds.`,
];

/** True when a tier carries a Deep Ledger entry. */
export function isLedgerTier(depth: number): boolean {
  return depth >= LEDGER_FROM && (depth - LEDGER_FROM) % LEDGER_EVERY === 0;
}

/** Ledger tiers in (from, to], ascending. */
export function ledgerTiersBetween(from: number, to: number): number[] {
  const out: number[] = [];
  let t = Math.max(LEDGER_FROM, from + 1);
  const rem = (t - LEDGER_FROM) % LEDGER_EVERY;
  if (rem !== 0) t += LEDGER_EVERY - rem;
  for (; t <= to; t += LEDGER_EVERY) out.push(t);
  return out;
}

/** The ledger entry for a tier. Deterministic: the same tier always reads the same. */
export function deepLedger(depth: number): Chapter {
  const rng = streamFor(depth * 7919, 'story.ledger');
  return {
    id: `ledger.${depth}`,
    depth,
    title: `The Deep Ledger, Tier ${depth}`,
    text: [rng.pick(LEDGER_OPEN), rng.pick(LEDGER_TURN), rng.pick(LEDGER_CLOSE)],
  };
}

function deepLedgerById(id: string): Chapter | undefined {
  const m = /^ledger\.(\d+)$/.exec(id);
  if (!m) return undefined;
  const depth = Number(m[1]);
  return isLedgerTier(depth) ? deepLedger(depth) : undefined;
}

/** Every chapter and ledger entry at or above `depth`, shallowest first. */
export function chaptersUpTo(depth: number): Chapter[] {
  const out = CHAPTERS.filter((c) => c.depth <= depth);
  for (const t of ledgerTiersBetween(0, depth)) out.push(deepLedger(t));
  return out;
}
