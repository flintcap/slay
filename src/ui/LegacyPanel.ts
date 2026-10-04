/**
 * SLAY — the Legacy panel.
 *
 * What the account has earned across every life: Renown rank and progress,
 * Legacy points and the perks they buy, the unlocks ranks have opened, the
 * Codex of uniques and set pieces found, and the lifetime tally. Opens with G.
 */

import { save } from '../core/Save';
import { events } from '../core/Events';
import {
  LEGACY_UNLOCKS,
  MILESTONE_STEP,
  milestoneReward,
  PERKS,
  buyPerk,
  canBuyPerk,
  codexTotals,
  legacyOf,
  perkCap,
  perkRank,
  pointsAvailable,
  renownProgress,
  resetPerks,
} from '../sim/Legacy';
import { Panel, Button, div, span, clear, section, add, statLine, fmtInt, icon } from './Widgets';

export class LegacyPanel {
  readonly panel: Panel;
  private body: HTMLDivElement;

  constructor() {
    this.panel = new Panel({
      id: 'legacy',
      title: 'Legacy',
      subtitle: 'What survives every death',
      icon: 'star',
      width: 600,
    });
    this.body = div('depth-panel');
    this.panel.body.appendChild(this.body);
    events.on('ui:refresh', () => {
      if (this.panel.isOpen) this.render();
    });
  }

  open(): void {
    this.render();
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  private render(): void {
    clear(this.body);
    const acct = save.account;
    const l = legacyOf(acct);
    const prog = renownProgress(l.renown);
    const points = pointsAvailable(acct);

    // --- renown -----------------------------------------------------------
    const head = div('depth-card');
    const left = div('depth-card-body');
    const title = div('depth-row');
    add(title, span('depth-big', `Renown ${prog.rank}`), span('depth-dim', `${fmtInt(l.renown)} earned`));
    left.appendChild(title);
    const track = div('depth-track');
    const fill = div('depth-fill');
    fill.style.width = `${Math.round(prog.frac * 100)}%`;
    track.appendChild(fill);
    left.appendChild(track);
    left.appendChild(
      div('depth-card-sub', prog.need > 0 ? `${fmtInt(prog.into)} / ${fmtInt(prog.need)} to rank ${prog.rank + 1}` : 'The highest rank.'),
    );
    head.appendChild(left);
    const pts = div('depth-card-body');
    pts.style.flex = '0 0 auto';
    pts.style.alignItems = 'flex-end';
    pts.appendChild(span(points > 0 ? 'depth-big' : 'depth-big depth-dim', String(points)));
    pts.appendChild(span('depth-dim', points === 1 ? 'point to spend' : 'points to spend'));
    head.appendChild(pts);
    this.body.appendChild(head);

    this.body.appendChild(
      div('depth-note', 'Every kill, floor, boss, contract and first find earns Renown, and it is kept the moment it is earned. Each rank is one Legacy point. Perks apply to every character on the account.'),
    );

    // --- perks ------------------------------------------------------------
    const perks = section('Perks', 'sparkle');
    const list = div('depth-list');
    for (const def of PERKS) {
      const r = perkRank(acct, def.id);
      const cap = perkCap(acct, def);
      const check = canBuyPerk(acct, def.id);
      const locked = prog.rank < def.minRenown;
      const card = div(`depth-card${locked ? ' is-locked' : ''}${r >= cap ? ' is-done' : ''}`);
      const b = div('depth-card-body');
      b.appendChild(div('depth-card-title', `${def.name}  ${r}/${cap}`));
      b.appendChild(
        div(
          'depth-card-sub',
          locked
            ? `Opens at Renown ${def.minRenown}. ${def.desc(1)} per rank.`
            : r > 0
              ? `Now: ${def.desc(r)}.${r < cap ? ` Next: ${def.desc(r + 1)}.` : ''}`
              : `${def.desc(1)}.`,
        ),
      );
      card.appendChild(b);
      const btn = new Button({
        label: 'Raise',
        small: true,
        variant: check.ok ? 'gold' : 'ghost',
        onClick: () => {
          if (buyPerk(acct, def.id)) {
            save.touch();
            events.emit('ui:refresh', {});
            this.render();
          }
        },
      });
      btn.setDisabled(!check.ok);
      if (!check.ok && check.reason) btn.root.title = check.reason;
      card.appendChild(btn.root);
      list.appendChild(card);
    }
    perks.body.appendChild(list);
    const reset = new Button({
      label: 'Refund all points',
      small: true,
      variant: 'ghost',
      onClick: () => {
        resetPerks(acct);
        save.touch();
        events.emit('ui:refresh', {});
        this.render();
      },
    });
    perks.body.appendChild(reset.root);
    this.body.appendChild(perks.root);

    // --- unlocks ----------------------------------------------------------
    const unlocks = section('Unlocks', 'lock');
    const ul = div('depth-list');
    for (const u of LEGACY_UNLOCKS) {
      const have = prog.rank >= u.rank;
      const card = div(`depth-card${have ? ' is-done' : ' is-locked'}`);
      card.appendChild(icon(have ? 'check' : 'lock', { size: 14 }));
      const b = div('depth-card-body');
      b.appendChild(div('depth-card-title', u.name));
      b.appendChild(div('depth-card-sub', have ? u.desc : `Renown ${u.rank}. ${u.desc}`));
      card.appendChild(b);
      ul.appendChild(card);
    }
    unlocks.body.appendChild(ul);
    this.body.appendChild(unlocks.root);

    // --- depth milestones -----------------------------------------------------
    const ms = section('Depth milestones', 'descend');
    const claimed = l.milestones;
    const next = (Math.floor(Math.max(0, ...claimed, 0) / MILESTONE_STEP) + 1) * MILESTONE_STEP;
    const nr = milestoneReward(next);
    ms.body.appendChild(
      div(
        'depth-note',
        `Every ${MILESTONE_STEP}th depth, cleared for the first time, pays a cache and becomes a waypoint. Next: depth ${next}, ${fmtInt(nr.gold)} gold, ${nr.renown} Renown and ${nr.items.map((r) => `a ${r}`).join(', ')} item.`,
      ),
    );
    ms.body.appendChild(statLine('Claimed', claimed.length ? claimed.join(', ') : 'none yet', { icon: 'check' }));
    this.body.appendChild(ms.root);

    // --- codex and tally ----------------------------------------------------
    const codex = codexTotals(acct);
    const tally = section('Codex and tally', 'book');
    tally.body.appendChild(statLine('Uniques found', `${codex.uniquesFound} / ${codex.uniques}`, { icon: 'star' }));
    tally.body.appendChild(statLine('Set pieces found', `${codex.setsFound} / ${codex.sets}`, { icon: 'shield' }));
    tally.body.appendChild(statLine('Deepest depth', String(l.stats.deepest), { icon: 'skull' }));
    tally.body.appendChild(statLine('Descents', fmtInt(l.stats.runs)));
    tally.body.appendChild(statLine('Descents cleared', fmtInt(l.stats.clears)));
    tally.body.appendChild(statLine('Monsters slain', fmtInt(l.stats.kills)));
    tally.body.appendChild(statLine('Bosses slain', fmtInt(l.stats.bosses)));
    tally.body.appendChild(statLine('Contracts fulfilled', fmtInt(l.stats.contracts)));
    tally.body.appendChild(statLine('Lives lost', fmtInt(l.stats.deaths)));
    this.body.appendChild(tally.root);
  }
}
