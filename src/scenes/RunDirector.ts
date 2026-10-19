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
import { itemDisplayName, rollItem } from '../sim/Loot';
import { PAYOUT, payoutIlvl } from '../sim/Payout';
import { addItemToInventory } from '../sim/Inventory';
import { bountyKindsForKill, bountyProgress, bountyText } from '../sim/TownServices';
import type { BountyKind } from '../types';
import { PACT_RENOWN } from './DescentPlanner';
import { tr } from '../core/I18n';

const CODEX_RARITIES = new Set(['set', 'unique', 'mythic', 'ancient']);

export class RunDirector {
  private depth: number;
  private offs: Array<() => void> = [];
  /** Renown earned this descent, for the summary on the way out. */
  runRenown = 0;
  private floorsSeen = new Set<number>();

  /** Renown multiplier from pacts taken at the gate. */
  private renownMul: number;

  /**
   * `resumedAt` is the area a map is taken up again at, back through a
   * Trinket of Town's portal: the same descent, not a new one, and the areas
   * up to there already paid their Renown.
   */
  constructor(depth: number, pacts = 0, resumedAt?: number) {
    this.depth = depth;
    this.renownMul = 1 + PACT_RENOWN * pacts;
    if (resumedAt === undefined) {
      legacyOf(this.account).stats.runs++;
      save.touch();
    } else {
      for (let i = 1; i <= resumedAt; i++) this.floorsSeen.add(i);
    }
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
        const item = rollItem(payoutIlvl(m.depth, PAYOUT.cache.bonus), rng, { forceRarity: rarity, classId: c?.classId });
        const kept = (c && addItemToInventory(c, item)) || save.stashItem(item);
        if (kept) names.push(itemDisplayName(item));
      }
      this.earn(m.renown);
      toast(tr('Tier {0} milestone: {1} gold{2}. A waypoint is set.', m.depth, m.gold, names.length ? `, ${names.join(', ')}` : ''), 'epic');
    }
  }

  /** Steps the character's taken bounties and announces any it finishes. */
  private bounty(kind: BountyKind): void {
    const c = this.account.current;
    if (!c) return;
    for (const b of bountyProgress(c, kind, this.depth)) {
      toast(tr('Bounty complete: {0}. Claim it at the board.', bountyText(b)), 'epic');
    }
  }

  /** The portal home after the boss was taken. Banks the clear and any new record. */
  onRunCleared(): void {
    const l = legacyOf(this.account);
    l.stats.clears++;
    let amount = RENOWN.clear(this.depth);
    if (this.depth > l.stats.deepest) {
      amount += RENOWN.newDepth(this.depth);
      l.stats.deepest = this.depth;
      toast(tr('New highest tier: {0}', this.depth), 'epic');
    }
    this.earn(amount);
    this.bounty('clear');
    this.payMilestones();
    this.summary(tr('Descent cleared'));
  }

  onDeath(): void {
    const l = legacyOf(this.account);
    l.stats.deaths++;
    l.stats.deepest = Math.max(l.stats.deepest, this.depth - 1);
    save.touch();
    this.summary(tr('Your legacy endures'));
  }

  private onPickUp(item: Item): void {
    if (!CODEX_RARITIES.has(item.rarity) || !item.uniqueId) return;
    const worth = recordCodex(this.account, item.uniqueId, item.rarity);
    if (worth <= 0) return;
    toast(tr('New in the Codex: {0}', itemDisplayName(item)), 'epic', item.rarity);
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
      toast(tr('Renown rank {0}. A Legacy point to spend (G).', r), 'epic');
    }
    for (const u of gain.unlocked) {
      toast(tr('Unlocked: {0}. {1}', u.name, u.desc), 'epic');
      if (u.id === 'stashTab') save.grantStashTab();
    }
    if (gain.ranks.length) events.emit('ui:refresh', {});
    save.touch();
    return gain;
  }

  private summary(head: string): void {
    if (this.runRenown <= 0) return;
    const rank = renownRank(legacyOf(this.account).renown);
    toast(tr('{0}. +{1} Renown (rank {2}).', head, Math.round(this.runRenown), rank), 'good');
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }
}
