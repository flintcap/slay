/**
 * SLAY — the shapes the narrative layer is written in.
 *
 * Everything under `src/data/story/` is text keyed by id. Nothing here runs;
 * `sim/Story.ts` reads it, decides what applies, and the UI shows it.
 */

import type { BiomeId, CharClassId, ItemRarity, QuestObjectiveKind } from '../../types';

/** The people of Stairhead you can talk to. */
export type NpcId =
  | 'hesk'
  | 'kale'
  | 'vell'
  | 'corvane'
  | 'marrow'
  | 'renn'
  | 'listener'
  | 'gilder'
  | 'wenna';

/**
 * A condition on story state. Every field that is present must hold. An empty
 * or missing `When` always holds.
 *
 * Step references are written `chain:N`, where N is the zero-based step index.
 * A bare chain id means the whole chain.
 */
export interface When {
  /** This chapter of the descent has been revealed. */
  chapter?: string;
  notChapter?: string;
  /** Account's deepest tier ever reached is at least / below this. */
  best?: number;
  notBest?: number;
  /** The current character's own record is at least / below this. */
  depth?: number;
  notDepth?: number;
  /** At least this many characters lie on the memorial. */
  fallen?: number;
  /** A chain step (or the whole chain) has been turned in. */
  done?: string;
  notDone?: string;
  /** A chain step has been accepted and not yet turned in. */
  active?: string;
  /** A boss has died to one of your characters. */
  slain?: string;
  notSlain?: string;
  /** A lore note has been found. */
  note?: string;
  /** The current character's class. */
  cls?: CharClassId;
  /** What has happened since this person last spoke to you. */
  after?: 'cleared' | 'died';
  /** Only before this person has ever spoken to you. */
  first?: boolean;
}

/** One thing a person might say when you walk up to them. */
export interface Line {
  id: string;
  text: string;
  when?: When;
  /** Said once, ever, then retired. */
  once?: boolean;
  /** Higher wins. Lines of equal priority are chosen between. Default 0. */
  pri?: number;
}

/** Something you can ask about. The reply is a short run of paragraphs. */
export interface Topic {
  id: string;
  label: string;
  text: string[];
  when?: When;
}

export interface NpcDef {
  id: NpcId;
  name: string;
  role: string;
  /**
   * The town interaction this person stands at: `vendor`, `blacksmith`,
   * `alchemist`, `stash`, `memorial`. Absent for people you only talk to.
   */
  station?: string;
  /** What the service button says, when there is a station. */
  serviceLabel?: string;
  /** Icon for the service button. */
  serviceIcon?: string;
  /** One paragraph, for the dialogue header and the journal. */
  portrait: string;
  /** Greetings, in no particular order; `sim/Story.ts` picks. */
  lines: Line[];
  topics: Topic[];
  /**
   * Called out as you arrive in camp, at most one person per arrival. These
   * are short and nearly always conditional on `after`.
   */
  arrival?: Line[];
}

// ---------------------------------------------------------------------------
// The descent
// ---------------------------------------------------------------------------

/** A revelation, shown once, the first time any character reaches its tier. */
export interface Chapter {
  id: string;
  /** Tier that reveals it. 0 is the first night in camp. */
  depth: number;
  title: string;
  text: string[];
}

// ---------------------------------------------------------------------------
// Quest chains
// ---------------------------------------------------------------------------

export interface ChainObjective {
  kind: QuestObjectiveKind;
  filter?: string;
  /** Fixed target. Chains do not scale with depth: the job is the job. */
  n: number;
  /** `{n}` is replaced by the target. */
  desc: string;
}

export interface ChainStep {
  title: string;
  /** Who offers it and takes it back. Defaults to the chain's giver. */
  giver?: NpcId;
  /** Extra gate before it is offered. */
  when?: When;
  /** First tier this contract can be worked on. */
  minDepth: number;
  /** The stair opens on this biome while the contract is open. */
  biome: BiomeId;
  /** The floor boss is this one. */
  boss?: string;
  /** What the giver says when offering it. */
  offer: string[];
  /** One line in the quest log, under the name. */
  flavor: string;
  /** Journal entry while it is open. */
  brief: string;
  objectives: ChainObjective[];
  /** Shown in the dungeon the moment the work is done. */
  ready: string;
  /** What the giver says when you come back. */
  turnIn: string[];
  /** Journal entry once it is handed in. */
  outcome: string;
  reward: { gold: number; xp: number; item?: ItemRarity };
}

export interface ChainDef {
  id: string;
  name: string;
  giver: NpcId;
  /** One line for the journal's contract list. */
  blurb: string;
  /** Gate for the whole chain to be offered. */
  when?: When;
  steps: ChainStep[];
}

// ---------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------

export interface BossVoice {
  /** Said by the boss as the fight begins. */
  greet: string;
  /** Said mid-fight. One is used per fight, chosen by how it is going. */
  taunts: string[];
  /** Its last words. */
  death: string;
  /** Narration once it is down. Kept in the journal. */
  slain: string;
  /** Said over your body, if it kills you. */
  victory: string;
  /** Lore found on its floor. */
  floor: { title: string; text: string };
}

// ---------------------------------------------------------------------------
// Lore notes
// ---------------------------------------------------------------------------

export interface LoreNote {
  id: string;
  title: string;
  /** Biome it turns up in. Absent means anywhere. */
  biome?: BiomeId;
  /** Shallowest tier it can be found on. */
  minDepth: number;
  /** Who wrote it, or what it was written on. */
  source: string;
  text: string;
}
