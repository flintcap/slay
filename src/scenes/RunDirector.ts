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
import { RENOWN, grantRenown, legacyOf, recordCodex, renownRank, type RenownGain } from '../sim/Legacy';

const CODEX_RARITIES = new Set(['set', 'unique', 'mythic', 'ancient']);

export class RunDirector {
  private depth: number;
  private offs: Array<() => void> = [];
  /** Renown earned this descent, for the summary on the way out. */
  runRenown = 0;
  private floorsSeen = new Set<number>();

  constructor(depth: number) {
    this.depth = depth;
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
