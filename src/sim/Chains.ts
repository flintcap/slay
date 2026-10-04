/**
 * SLAY — contracts at runtime.
 *
 * A chain's progress is `StorySave.chains[id]`: the step it is on and whether
 * that step is `idle` (not taken), `active` (taken, being worked) or `ready`
 * (done below, waiting to be handed in). A chain past its last step is done.
 *
 * Taking a contract changes the next descent at or past its tier: the world
 * generator asks `planRun`, which sends the stair to the contract's biome,
 * gives the run the contract as its quest and, if the contract names one,
 * puts that boss on the last floor. When the run's quest completes, the step
 * is ready, and the giver pays on hand-in.
 */

import type { BiomeId, Character, Item, ItemRarity, QuestInstance, QuestObjective } from '../types';
import { save } from '../core/Save';
import { events } from '../core/Events';
import { streamFor } from '../core/RNG';
import type { ChainDef, ChainStep, NpcDef, NpcId } from '../data/story/types';
import { CHAINS, chainById, chainQuestId, parseChainQuestId } from '../data/story/chains';
import { getBiome } from '../world/Biomes';
import { setRunDirector, type RunPlan } from '../world/DungeonGen';
import { describeObjective, questItemLevel } from './Quests';
import { rollItem } from './Loot';
import { grantXp } from './Character';
import { addItemToInventory } from './Inventory';
import { fillStory, holds, persist, setChainReaders, story } from './Story';

export { CHAINS, chainById };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type StepState = 'idle' | 'active' | 'ready' | 'done' | 'locked';

function entry(chainId: string): { step: number; state: 'idle' | 'active' | 'ready' } {
  const s = story();
  let e = s.chains[chainId];
  if (!e) {
    e = { step: 0, state: 'idle' };
    s.chains[chainId] = e;
  }
  return e;
}

/** Index of the step a chain is on (= steps.length when finished). */
export function chainStep(chain: ChainDef): number {
  return Math.min(chain.steps.length, story().chains[chain.id]?.step ?? 0);
}

export function chainDone(chain: ChainDef): boolean {
  return chainStep(chain) >= chain.steps.length;
}

/** Where a given step of a chain stands. */
export function stepState(chain: ChainDef, index: number): StepState {
  const at = chainStep(chain);
  if (index < at) return 'done';
  if (index > at) return 'locked';
  return story().chains[chain.id]?.state ?? 'idle';
}

/** `chain` or `chain:N` handed in. */
function refDone(ref: string): boolean {
  const [id, n] = ref.split(':');
  const chain = chainById(id!);
  if (!chain) return false;
  if (n === undefined) return chainDone(chain);
  return chainStep(chain) > Number(n);
}

/** `chain:N` taken and not yet handed in (`chain` alone: any step). */
function refActive(ref: string): boolean {
  const [id, n] = ref.split(':');
  const chain = chainById(id!);
  if (!chain) return false;
  const e = story().chains[chain.id];
  if (!e || e.state === 'idle') return false;
  return n === undefined || e.step === Number(n);
}

setChainReaders(refDone, refActive);

function giverOf(chain: ChainDef, step: ChainStep): NpcId {
  return step.giver ?? chain.giver;
}

/** How far down the account can reasonably be sent right now. */
function reach(): number {
  const c = save.account.current;
  return Math.max(save.account.bestDepth, c?.depthRecord ?? 0) + 3;
}

/** The step a person could offer right now, if any. */
export function offerFor(npc: NpcDef): { chain: ChainDef; index: number; step: ChainStep } | null {
  for (const chain of CHAINS) {
    if (chainDone(chain)) continue;
    const index = chainStep(chain);
    const step = chain.steps[index]!;
    if (giverOf(chain, step) !== npc.id) continue;
    if (stepState(chain, index) !== 'idle') continue;
    if (!holds(chain.when) || !holds(step.when)) continue;
    if (step.minDepth > reach()) continue;
    return { chain, index, step };
  }
  return null;
}

/** Work this person is waiting on: taken, or done and ready to hand in. */
export function openWorkFor(npc: NpcDef): Array<{ chain: ChainDef; index: number; step: ChainStep; ready: boolean }> {
  const out: Array<{ chain: ChainDef; index: number; step: ChainStep; ready: boolean }> = [];
  for (const chain of CHAINS) {
    if (chainDone(chain)) continue;
    const index = chainStep(chain);
    const step = chain.steps[index]!;
    if (giverOf(chain, step) !== npc.id) continue;
    const st = stepState(chain, index);
    if (st === 'active' || st === 'ready') out.push({ chain, index, step, ready: st === 'ready' });
  }
  return out;
}

export function acceptStep(chain: ChainDef): void {
  const e = entry(chain.id);
  if (e.step >= chain.steps.length || e.state !== 'idle') return;
  e.state = 'active';
  persist();
  events.emit('ui:refresh', {});
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export interface ChainReward {
  gold: number;
  xp: number;
  item: Item | null;
  /** Where the item went, for the hand-in text. */
  itemTo: 'pack' | 'vault' | 'none';
}

/** Gold and experience a step pays, before it is handed over. */
export function chainReward(step: ChainStep): { gold: number; xp: number; item?: ItemRarity } {
  const d = step.minDepth;
  return {
    gold: Math.round(step.reward.gold * (150 + d * 90 + d * d * 2.2)),
    xp: Math.round(step.reward.xp * (260 + d * 190 + d * d * 5)),
    item: step.reward.item,
  };
}

/**
 * Hands a ready step in: pays the current character, moves the chain on, and
 * returns what was paid. A step can be handed in by a different character
 * from the one who did the work; the town pays whoever comes back.
 */
export function turnInStep(chain: ChainDef): ChainReward | null {
  const e = entry(chain.id);
  if (e.state !== 'ready' || e.step >= chain.steps.length) return null;
  const step = chain.steps[e.step]!;
  const c: Character | null = save.account.current ?? null;
  const pay = chainReward(step);
  let item: Item | null = null;
  let itemTo: ChainReward['itemTo'] = 'none';
  if (c) {
    c.gold += pay.gold;
    grantXp(c, pay.xp);
    if (pay.item) {
      const rng = streamFor((Date.now() ^ (e.step * 7717)) >>> 0, `chain:${chain.id}:${e.step}`);
      item = rollItem(questItemLevel(Math.max(step.minDepth, c.depthRecord)), rng, {
        forceRarity: pay.item,
        magicFind: 100,
        classId: c.classId,
      });
      if (addItemToInventory(c, item)) itemTo = 'pack';
      else if (save.stashItem(item)) itemTo = 'vault';
    }
    save.setCharacter(c);
  }
  e.step += 1;
  e.state = 'idle';
  persist();
  events.emit('ui:refresh', {});
  return { gold: pay.gold, xp: pay.xp, item, itemTo };
}

// ---------------------------------------------------------------------------
// The descent
// ---------------------------------------------------------------------------

/** The contract a descent to `depth` would carry, if any. Oldest tier first. */
export function stepForDepth(depth: number): { chain: ChainDef; index: number; step: ChainStep } | null {
  let best: { chain: ChainDef; index: number; step: ChainStep } | null = null;
  for (const chain of CHAINS) {
    if (chainDone(chain)) continue;
    const index = chainStep(chain);
    if (stepState(chain, index) !== 'active') continue;
    const step = chain.steps[index]!;
    if (step.minDepth > depth) continue;
    if (getBiome(step.biome).minDepth > depth) continue;
    if (!best || step.minDepth < best.step.minDepth) best = { chain, index, step };
  }
  return best;
}

/** Builds the run quest for a contract step. Targets are exactly as written. */
export function chainQuest(chain: ChainDef, index: number): QuestInstance {
  const step = chain.steps[index]!;
  const objectives: QuestObjective[] = step.objectives.map((o) => ({
    kind: o.kind,
    desc: describeObjective(o.desc, o.n, step.minDepth, ''),
    target: o.n,
    progress: 0,
    filter: o.filter,
    done: false,
  }));
  return {
    defId: chainQuestId(chain.id, index),
    name: step.title,
    flavor: step.flavor,
    objectives,
    complete: false,
    turnedIn: false,
  };
}

/** The contract the current descent carries, set when the run is generated. */
let carried: { chainId: string; index: number; quest: QuestInstance } | null = null;

export function carriedContract(): { chain: ChainDef; index: number; step: ChainStep; quest: QuestInstance } | null {
  if (!carried) return null;
  const chain = chainById(carried.chainId);
  if (!chain) return null;
  return { chain, index: carried.index, step: chain.steps[carried.index]!, quest: carried.quest };
}

/** The world generator's hook. See `RunDirector` in `world/DungeonGen.ts`. */
export function planRun(depth: number): RunPlan | null {
  carried = null;
  const hit = stepForDepth(depth);
  if (!hit) return null;
  const { chain, index, step } = hit;
  return {
    biome: step.biome as BiomeId,
    bossId: step.boss,
    quest: () => {
      const quest = chainQuest(chain, index);
      carried = { chainId: chain.id, index, quest };
      return quest;
    },
  };
}

/** Marks the carried step ready once its quest completes. Idempotent. */
export function noteQuestComplete(): { chain: ChainDef; step: ChainStep } | null {
  const c = carriedContract();
  if (!c || !c.quest.complete) return null;
  const e = entry(c.chain.id);
  if (e.step !== c.index || e.state !== 'active') return null;
  e.state = 'ready';
  persist();
  return { chain: c.chain, step: c.step };
}

let installed = false;

/** Lets contracts steer the world generator. Called once from `installStory`. */
export function installChains(): void {
  if (installed) return;
  installed = true;
  setRunDirector((depth) => planRun(depth));
}

/** True if a quest id belongs to a contract. */
export function isContractQuest(defId: string): boolean {
  return parseChainQuestId(defId) !== null;
}

/** Where a step sends you, in words. */
export function stepWhere(step: ChainStep): string {
  return `${getBiome(step.biome).name}, from tier ${step.minDepth}`;
}

export { fillStory };
