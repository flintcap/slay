/**
 * SLAY — the Bounty Board. Three contracts at a time; take up to two, finish
 * them below, and come back here to be paid in gold, Renown and an item. The
 * pay is sealed until then. A new board costs gold, more each time.
 */

import { save } from '../core/Save';
import { events, toast } from '../core/Events';
import { audio } from '../audio/Audio';
import type { Bounty } from '../types';
import { grantRenown } from '../sim/Legacy';
import {
  MAX_ACTIVE_BOUNTIES,
  abandonBounty,
  acceptBounty,
  bountyText,
  claimBounty,
  heldBounties,
  refreshBoard,
  repostBoard,
  repostCost,
} from '../sim/TownServices';
import { Panel, Button, div, span, clear, add, fmtInt } from './Widgets';
import { tr } from '../core/I18n';
import { itemDisplayName } from '../sim/Loot';

export class BountyPanel {
  readonly panel: Panel;
  private body: HTMLDivElement;

  constructor() {
    this.panel = new Panel({
      id: 'bounties',
      title: tr('Bounty Board'),
      subtitle: tr('Paid on proof'),
      icon: 'scroll',
      width: 600,
    });
    this.body = div('depth-panel');
    this.panel.body.appendChild(this.body);
    events.on('ui:refresh', () => {
      if (this.panel.isOpen) this.render();
    });
  }

  open(): void {
    const c = save.account.current;
    if (c) {
      refreshBoard(c);
      save.touch();
    }
    this.render();
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  private card(b: Bounty): HTMLDivElement {
    const c = save.account.current!;
    const card = div(`depth-card${b.state === 'done' ? ' is-done' : ''}`);
    const body = div('depth-card-body');
    body.appendChild(div('depth-card-title', bountyText(b)));
    body.appendChild(div('depth-card-sub', tr('Reward sealed until paid')));
    if (b.state !== 'open') {
      const track = div('depth-track');
      const fill = div('depth-fill');
      fill.style.width = `${Math.round((b.progress / b.target) * 100)}%`;
      track.appendChild(fill);
      body.appendChild(track);
      body.appendChild(div('depth-card-sub', `${b.progress} / ${b.target}`));
    }
    card.appendChild(body);
    const after = (ok: boolean, reason?: string) => {
      if (!ok) {
        toast(reason ?? tr('No.'), 'bad');
        audio.play('ui.error');
        return false;
      }
      save.touch();
      events.emit('ui:refresh', {});
      return true;
    };
    if (b.state === 'open') {
      const btn = new Button({
        label: tr('Take'),
        small: true,
        variant: 'gold',
        onClick: () => {
          const r = acceptBounty(c, b.id);
          if (after(r.ok, r.reason)) audio.play('ui.open');
        },
      });
      btn.setDisabled(heldBounties(c).length >= MAX_ACTIVE_BOUNTIES);
      card.appendChild(btn.root);
    } else if (b.state === 'active') {
      card.appendChild(
        new Button({
          label: tr('Abandon'),
          small: true,
          variant: 'ghost',
          onClick: () => after(abandonBounty(c, b.id), tr('That bounty is not yours.')),
        }).root,
      );
    } else {
      card.appendChild(
        new Button({
          label: tr('Claim'),
          small: true,
          variant: 'gold',
          onClick: () => {
            const r = claimBounty(c, b.id);
            if (!r.ok || !r.payout) {
              after(false, r.reason);
              return;
            }
            const gain = grantRenown(save.account, r.payout.renown);
            for (const u of gain.unlocked) toast(tr('Unlocked: {0}. {1}', u.name, u.desc), 'epic');
            if (gain.unlocked.some((u) => u.id === 'stashTab')) save.grantStashTab();
            audio.play('quest.complete');
            const item = r.payout.item;
            toast(tr('Bounty paid: {0} gold{1}.', fmtInt(r.payout.gold), item ? `, ${itemDisplayName(item)}` : ''), 'epic', item?.rarity);
            after(true);
          },
        }).root,
      );
    }
    return card;
  }

  private render(): void {
    clear(this.body);
    const c = save.account.current;
    if (!c) return;
    const held = heldBounties(c);
    const open = refreshBoard(c).bounties.filter((b) => b.state === 'open');
    this.body.appendChild(
      div(
        'depth-note',
        tr(
          'Take up to {0}. They count on any descent at least as deep as they ask, and are paid here in gold, Renown and an item. Nobody knows what a contract pays until it is paid. They die with you.',
          MAX_ACTIVE_BOUNTIES,
        ),
      ),
    );
    const yours = div('depth-list');
    yours.appendChild(span('depth-dim', held.length ? tr('Yours') : tr('You hold no bounties.')));
    for (const b of held) yours.appendChild(this.card(b));
    this.body.appendChild(yours);
    const board = div('depth-list');
    board.appendChild(span('depth-dim', tr('On the board')));
    for (const b of open) board.appendChild(this.card(b));
    this.body.appendChild(board);

    // A fresh board is free when a bounty is paid. Before that it costs gold,
    // and the price climbs with each one bought.
    const price = repostCost(c);
    const foot = div('depth-row depth-foot');
    const repost = new Button({
      label: tr('Post new bounties · {0}g', fmtInt(price)),
      small: true,
      variant: 'gold',
      onClick: () => {
        const r = repostBoard(c);
        if (!r.ok) {
          toast(r.reason ?? tr('No.'), 'bad');
          audio.play('ui.error');
          return;
        }
        audio.play('ui.open');
        save.touch();
        events.emit('ui:refresh', {});
      },
    });
    repost.setDisabled(c.gold < price);
    add(foot, span('depth-dim', tr('You carry {0} gold. Each new board costs more until a bounty is paid.', fmtInt(c.gold))), repost.root);
    this.body.appendChild(foot);
  }
}
