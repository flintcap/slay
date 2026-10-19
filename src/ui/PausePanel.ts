/**
 * SLAY — the pause menu.
 *
 * Opening it pauses the simulation (UIRoot handles that). The world stays
 * visible behind a blurred, darkened veil; the menu sits on the left in the
 * same list style as the title screen, and the right shows who you are and how
 * this run is going, so a pause is also a moment to take stock.
 *
 * Leaving a run early or quitting is a confirmation, not a button.
 */

import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { xpForLevel } from '../sim/Stats';
import { div, span, Panel, classById, classAccent, classCrestSvg, duration, fmtInt, keycap, modal, attempt } from './Widgets';
import { MenuNav, type MenuItemOpts } from './MenuNav';
import { runStats } from './RunStats';
import { keyLabel } from './AccessibilitySettings';
import { keyFor } from '../core/Access';
import { LEAVE_XP_SHARE } from '../sim/RunLedger';
import { tr, trn } from '../core/I18n';

export class PausePanel {
  readonly panel: Panel;
  private engine: Engine;
  private nav: MenuNav;
  private where: HTMLDivElement;
  private card: HTMLDivElement;
  private place = '';
  private floor = '';

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'pause',
      title: '',
      fullscreen: true,
      closable: false,
      draggable: false,
      className: 'pz',
    });
    this.panel.header.style.display = 'none';

    const root = div('pz-root');
    const col = div('pz-col');
    col.appendChild(div('pz-title', tr('Paused')));
    const rule = div('ttl-rule pz-rule');
    rule.appendChild(span('ttl-rule-gem'));
    col.appendChild(rule);
    this.where = div('pz-where');
    col.appendChild(this.where);
    this.nav = new MenuNav('mn-list pz-menu');
    col.appendChild(this.nav.root);
    const foot = div('pz-foot');
    foot.append(keycap(tr('Esc')), span('', tr('Resume')), keycap('↑'), keycap('↓'), span('', tr('Choose')));
    col.appendChild(foot);

    this.card = div('pz-card');
    root.append(col, this.card);
    this.panel.body.appendChild(root);

    events.on('depth:changed', (p) => {
      this.place =
        p.depth <= 0 ? tr('The Town') : p.mapName ? tr('{0} · Tier {1}', p.mapName, p.depth) : p.place ? tr('Tier {0} · {1}', p.depth, p.place) : tr('Tier {0}', p.depth);
      this.floor = p.depth > 0 ? (p.mapName ? p.place ?? '' : p.of > 1 ? tr('Area {0} of {1}', p.level, p.of) : '') : '';
    });
    events.on('zone:entered', (p) => {
      if (p.mapName) this.floor = p.name;
    });
  }

  open(): void {
    this.render();
    this.panel.open();
    this.nav.setActive(true);
  }

  close(): void {
    if (!this.panel.isOpen) return;
    this.nav.setActive(false);
    this.panel.close();
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  // -- content -------------------------------------------------------------

  private render(): void {
    const inDungeon = this.engine.currentSceneId === 'dungeon';
    this.where.textContent = [this.place || (inDungeon ? tr('The Depths') : tr('The Town')), this.floor].filter(Boolean).join('  ·  ');

    const open = (panel: string) => (): void => {
      this.close();
      events.emit('ui:open', { panel });
    };
    // The key each panel is on now, after any rebinding.
    const key = (code: string): string => keyLabel(keyFor(code, save.settings.keybinds));
    const items: MenuItemOpts[] = [
      { label: tr('Resume'), tone: 'primary', onSelect: () => this.close() },
      { label: tr('Inventory'), hint: key('KeyI'), onSelect: open('inventory') },
      { label: tr('Character'), hint: key('KeyC'), onSelect: open('character') },
      { label: tr('Skills'), hint: key('KeyT'), onSelect: open('skills') },
      { label: tr('Map'), hint: key('KeyM'), onSelect: open('map') },
      { label: tr('Quest Log'), hint: key('KeyL'), onSelect: open('questLog') },
      { label: tr('Journal'), hint: key('KeyJ'), onSelect: open('journal') },
      { label: tr('Settings'), hint: tr('Picture, sound, controls'), onSelect: () => events.emit('ui:open', { panel: 'settings' }) },
    ];
    // Leaving a map early, at any moment, costs what was found on it and a
    // little experience (`sim/RunLedger.ts`); the waypoint ring and the
    // map's last exit cost nothing. Closing the game counts the same.
    const cost = tr('You go back to town with only what you brought down. Everything found on this map is lost, and {0}% of a level\'s experience.', Math.round(LEAVE_XP_SHARE * 100));
    const leave = (to: 'town' | 'title') => (): void => {
      this.close();
      if (inDungeon) save.forfeitRun();
      save.touch();
      save.flush();
      void this.engine.goTo(to);
    };
    if (inDungeon) {
      items.push({
        label: tr('Return to Town'),
        hint: tr('Lose what you found here'),
        onSelect: () =>
          modal({
            title: tr('Leave the map?'),
            icon: 'warn',
            tone: 'danger',
            body: tr('<p>{0}</p><p>The waypoint ring where you came in takes you home with everything.</p>', cost),
            confirmLabel: tr('Return to town'),
            onConfirm: leave('town'),
          }),
      });
    }
    items.push({
      label: tr('Quit to Title'),
      tone: 'danger',
      hint: inDungeon ? tr('Lose what you found here') : tr('Your character is saved'),
      onSelect: () =>
        modal({
          title: tr('Quit to the title screen?'),
          icon: 'warn',
          tone: 'danger',
          body: inDungeon ? tr('<p>{0}</p><p>Your character will be waiting in town.</p>', cost) : tr('<p>Your character is saved and will be waiting.</p>'),
          confirmLabel: tr('Quit'),
          onConfirm: leave('title'),
        }),
    });
    this.nav.set(items);

    this.renderCard();
  }

  private renderCard(): void {
    this.card.replaceChildren();
    const c = save.account.current;
    if (!c) {
      this.card.style.display = 'none';
      return;
    }
    this.card.style.display = '';
    const accent = classAccent(c.classId);
    this.card.style.setProperty('--accent', accent);

    const head = div('pz-card-head');
    const crest = div('pz-card-crest');
    crest.innerHTML = classCrestSvg(c.classId, accent, 54);
    const names = div('pz-card-names');
    names.append(
      div('pz-card-name', c.name),
      div('pz-card-class', tr('Level {0} {1}', c.level, classById(c.classId)?.name ?? c.classId)),
    );
    head.append(crest, names);
    this.card.appendChild(head);

    // Progress to the next level.
    const need = attempt(() => xpForLevel(c.level), 0);
    const frac = need > 0 ? Math.max(0, Math.min(1, c.xp / need)) : 0;
    const xp = div('pz-xp');
    const bar = div('pz-xp-bar');
    const fill = div('pz-xp-fill');
    fill.style.width = `${(frac * 100).toFixed(1)}%`;
    bar.appendChild(fill);
    xp.append(bar, div('pz-xp-l', need > 0 ? tr('{0} / {1} to level {2}', fmtInt(c.xp), fmtInt(need), c.level + 1) : ''));
    this.card.appendChild(xp);

    const unspent = (c.statPoints || 0) + (c.skillPoints || 0);
    if (unspent > 0) {
      const nag = div('pz-nag');
      const stats = trn(c.statPoints, '{0} stat point', '{0} stat points', c.statPoints);
      const skills = trn(c.skillPoints, '{0} skill point', '{0} skill points', c.skillPoints);
      nag.textContent =
        c.statPoints && c.skillPoints
          ? tr('{0} and {1} to spend', stats, skills)
          : tr('{0} to spend', c.statPoints ? stats : skills);
      this.card.appendChild(nag);
    }

    const grid = div('pz-stats');
    const stat = (v: string, l: string): void => {
      const d = div('pz-stat');
      d.append(div('pz-stat-v', v), div('pz-stat-l', l));
      grid.appendChild(d);
    };
    const run = runStats.current;
    if (run) {
      this.card.appendChild(div('pz-section', tr('This run')));
      stat(duration(run.seconds), tr('Time'));
      stat(fmtInt(run.kills), tr('Kills'));
      stat(fmtInt(run.elites), tr('Elites'));
      stat(fmtInt(run.gold), tr('Gold found'));
    } else {
      this.card.appendChild(div('pz-section', tr('Account')));
      stat(fmtInt(c.gold), tr('Gold carried'));
      stat(fmtInt(save.account.bankGold), tr('Gold banked'));
      stat(c.depthRecord > 0 ? String(c.depthRecord) : '-', tr('Deepest'));
      stat(duration(c.playtime || 0), tr('Played'));
    }
    this.card.appendChild(grid);
  }
}
