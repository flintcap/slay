/**
 * SLAY — the run director.
 *
 * The dungeon scene's single seam for the systems layer: Legacy renown, the
 * Codex, and the lifetime tally. DungeonScene owns one and calls it at the
 * moments that matter (a kill, a new floor, a cleared run, a death); the
 * director decides what each moment is worth.
 *
 * Kept out of DungeonScene so the scene stays an integration point of one-line
 * calls rather than another place game rules live.
 */

import type { AccountSave, Item, MonsterRank } from '../types';
import { events, toast } from '../core/Events';
import { save } from '../core/Save';
import { RENOWN, claimMilestones, grantRenown, legacyOf, recordCodex, renownRank, type RenownGain } from '../sim/Legacy';
import { Random, hashString } from '../core/RNG';
import { rollItem } from '../sim/Loot';
import { addItemToInventory } from '../sim/Inventory';
import { bountyKindsForKill, bountyProgress, bountyText } from '../sim/TownServices';
import type { BountyKind } from '../types';
import { PACT_RENOWN } from './DescentPlanner';

const CODEX_RARITIES = new Set(['set', 'unique', 'mythic', 'ancient']);

export class RunDirector {
  private depth: number;
  private offs: Array<() => void> = [];
  /** Renown earned this descent, for the summary on the way out. */
  runRenown = 0;
  private floorsSeen = new Set<number>();

  /** Renown multiplier from pacts taken at the gate. */
  private renownMul: number;

  constructor(depth: number, pacts = 0) {
    this.depth = depth;
    this.renownMul = 1 + PACT_RENOWN * pacts;
    const l = legacyOf(this.account);
    l.stats.runs++;
    save.touch();
    this.offs.push(
      events.on('loot:pickedUp', ({ item }) => this.onPickUp(item)),
      events.on('quest:complete', () => this.earn(RENOWN.contract(this.depth), () => legacyOf(this.account).stats.contracts++)),
    );
  }

  private get account(): AccountSave {
    return save.account;
  }

  /** A floor of this run was entered. The first floor is free. */
  onFloor(index: number): void {
    if (index <= 0 || this.floorsSeen.has(index)) return;
    this.floorsSeen.add(index);
    this.earn(RENOWN.floor(this.depth));
  }

  onKill(rank: MonsterRank): void {
    legacyOf(this.account).stats.kills++;
    if (rank === 'boss') legacyOf(this.account).stats.bosses++;
    this.earn(RENOWN.kill(rank, this.depth));
    for (const kind of bountyKindsForKill(rank)) this.bounty(kind);
  }

  /**
   * Renown for something the run's events decided was worth it. `event` names
   * a finished dungeon event, which also counts for bounties.
   */
  award(amount: number, event?: string): void {
    this.earn(amount);
    if (event) this.bounty('events');
  }

  /**
   * First clears of a depth milestone (every fifth depth) pay a cache: gold,
   * Renown, and guaranteed uniques (sets and mythics on the round ones). The
   * items go into the pack, or the shared stash when the pack is full.
   */
  private payMilestones(): void {
    const c = this.account.current;
    for (const m of claimMilestones(this.account, this.depth)) {
      const rng = new Random(hashString(`milestone:${m.depth}:${c?.id ?? 'none'}`));
      if (c) c.gold += m.gold;
      const names: string[] = [];
      for (const rarity of m.items) {
        const item = rollItem(m.depth + 6, rng, { forceRarity: rarity, classId: c?.classId });
        const kept = (c && addItemToInventory(c, item)) || save.stashItem(item);
        if (kept) names.push(item.name);
      }
      this.earn(m.renown);
      toast(`Depth ${m.depth} milestone: ${m.gold} gold${names.length ? `, ${names.join(', ')}` : ''}. A waypoint is set.`, 'epic');
    }
  }

  /** Steps the character's taken bounties and announces any it finishes. */
  private bounty(kind: BountyKind): void {
    const c = this.account.current;
    if (!c) return;
    for (const b of bountyProgress(c, kind, this.depth)) {
      toast(`Bounty complete: ${bountyText(b)}. Claim it at the board.`, 'epic');
    }
  }

  /** The run's last stairs were taken. Banks the clear and any new record. */
  onRunCleared(): void {
    const l = legacyOf(this.account);
    l.stats.clears++;
    let amount = RENOWN.clear(this.depth);
    if (this.depth > l.stats.deepest) {
      amount += RENOWN.newDepth(this.depth);
      l.stats.deepest = this.depth;
      toast(`New deepest descent: depth ${this.depth}`, 'epic');
    }
    this.earn(amount);
    this.bounty('clear');
    this.payMilestones();
    this.summary('Descent cleared');
  }

  onDeath(): void {
    const l = legacyOf(this.account);
    l.stats.deaths++;
    l.stats.deepest = Math.max(l.stats.deepest, this.depth - 1);
    save.touch();
    this.summary('Your legacy endures');
  }

  private onPickUp(item: Item): void {
    if (!CODEX_RARITIES.has(item.rarity) || !item.uniqueId) return;
    const worth = recordCodex(this.account, item.uniqueId, item.rarity);
    if (worth <= 0) return;
    toast(`New in the Codex: ${item.name}`, 'epic', item.rarity);
    this.earn(worth);
  }

  /** Grants renown, announcing any ranks and unlocks it crosses. */
  private earn(amount: number, also?: () => void): RenownGain | null {
    also?.();
    amount *= this.renownMul;
    if (amount <= 0) {
      save.touch();
      return null;
    }
    const gain = grantRenown(this.account, amount);
    this.runRenown += gain.amount;
    for (const r of gain.ranks) {
      toast(`Renown rank ${r}. A Legacy point to spend (G).`, 'epic');
    }
    for (const u of gain.unlocked) {
      toast(`Unlocked: ${u.name}. ${u.desc}`, 'epic');
      if (u.id === 'stashTab') save.addStashTab();
    }
    if (gain.ranks.length) events.emit('ui:refresh', {});
    save.touch();
    return gain;
  }

  private summary(head: string): void {
    if (this.runRenown <= 0) return;
    const rank = renownRank(legacyOf(this.account).renown);
    toast(`${head}. +${Math.round(this.runRenown)} Renown (rank ${rank}).`, 'good');
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }
}
