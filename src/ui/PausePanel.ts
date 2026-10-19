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
    col.appendChild(div('pz-title', 'Paused'));
    const rule = div('ttl-rule pz-rule');
    rule.appendChild(span('ttl-rule-gem'));
    col.appendChild(rule);
    this.where = div('pz-where');
    col.appendChild(this.where);
    this.nav = new MenuNav('mn-list pz-menu');
    col.appendChild(this.nav.root);
    const foot = div('pz-foot');
    foot.append(keycap('Esc'), span('', 'Resume'), keycap('↑'), keycap('↓'), span('', 'Choose'));
    col.appendChild(foot);

    this.card = div('pz-card');
    root.append(col, this.card);
    this.panel.body.appendChild(root);

    events.on('depth:changed', (p) => {
      this.place =
        p.depth <= 0 ? 'The Town' : p.mapName ? `${p.mapName} · Tier ${p.depth}` : p.place ? `Tier ${p.depth} · ${p.place}` : `Tier ${p.depth}`;
      this.floor = p.depth > 0 ? (p.mapName ? p.place ?? '' : p.of > 1 ? `Area ${p.level} of ${p.of}` : '') : '';
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
    this.where.textContent = [this.place || (inDungeon ? 'The Depths' : 'The Town'), this.floor].filter(Boolean).join('  ·  ');

    const open = (panel: string) => (): void => {
      this.close();
      events.emit('ui:open', { panel });
    };
    // The key each panel is on now, after any rebinding.
    const key = (code: string): string => keyLabel(keyFor(code, save.settings.keybinds));
    const items: MenuItemOpts[] = [
      { label: 'Resume', tone: 'primary', onSelect: () => this.close() },
      { label: 'Inventory', hint: key('KeyI'), onSelect: open('inventory') },
      { label: 'Character', hint: key('KeyC'), onSelect: open('character') },
      { label: 'Skills', hint: key('KeyT'), onSelect: open('skills') },
      { label: 'Map', hint: key('KeyM'), onSelect: open('map') },
      { label: 'Quest Log', hint: key('KeyL'), onSelect: open('questLog') },
      { label: 'Journal', hint: key('KeyJ'), onSelect: open('journal') },
      { label: 'Settings', hint: 'Picture, sound, controls', onSelect: () => events.emit('ui:open', { panel: 'settings' }) },
    ];
    // Leaving a map early, at any moment, costs what was found on it and a
    // little experience (`sim/RunLedger.ts`); the waypoint ring and the
    // map's last exit cost nothing. Closing the game counts the same.
    const cost = `You go back to town with only what you brought down. Everything found on this map is lost, and ${Math.round(LEAVE_XP_SHARE * 100)}% of a level's experience.`;
    const leave = (to: 'town' | 'title') => (): void => {
      this.close();
      if (inDungeon) save.forfeitRun();
      save.touch();
      save.flush();
      void this.engine.goTo(to);
    };
    if (inDungeon) {
      items.push({
        label: 'Return to Town',
        hint: 'Lose what you found here',
        onSelect: () =>
          modal({
            title: 'Leave the map?',
            icon: 'warn',
            tone: 'danger',
            body: `<p>${cost}</p><p>The waypoint ring where you came in takes you home with everything.</p>`,
            confirmLabel: 'Return to town',
            onConfirm: leave('town'),
          }),
      });
    }
    items.push({
      label: 'Quit to Title',
      tone: 'danger',
      hint: inDungeon ? 'Lose what you found here' : 'Your character is saved',
      onSelect: () =>
        modal({
          title: 'Quit to the title screen?',
          icon: 'warn',
          tone: 'danger',
          body: inDungeon ? `<p>${cost}</p><p>Your character will be waiting in town.</p>` : '<p>Your character is saved and will be waiting.</p>',
          confirmLabel: 'Quit',
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
      div('pz-card-class', `Level ${c.level} ${classById(c.classId)?.name ?? c.classId}`),
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
    xp.append(bar, div('pz-xp-l', need > 0 ? `${fmtInt(c.xp)} / ${fmtInt(need)} to level ${c.level + 1}` : ''));
    this.card.appendChild(xp);

    const unspent = (c.statPoints || 0) + (c.skillPoints || 0);
    if (unspent > 0) {
      const nag = div('pz-nag');
      nag.textContent =
        `${c.statPoints ? `${c.statPoints} stat point${c.statPoints > 1 ? 's' : ''}` : ''}` +
        `${c.statPoints && c.skillPoints ? ' and ' : ''}` +
        `${c.skillPoints ? `${c.skillPoints} skill point${c.skillPoints > 1 ? 's' : ''}` : ''} to spend`;
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
      this.card.appendChild(div('pz-section', 'This run'));
      stat(duration(run.seconds), 'Time');
      stat(fmtInt(run.kills), 'Kills');
      stat(fmtInt(run.elites), 'Elites');
      stat(fmtInt(run.gold), 'Gold found');
    } else {
      this.card.appendChild(div('pz-section', 'Account'));
      stat(fmtInt(c.gold), 'Gold carried');
      stat(fmtInt(save.account.bankGold), 'Gold banked');
      stat(c.depthRecord > 0 ? String(c.depthRecord) : '-', 'Deepest');
      stat(duration(c.playtime || 0), 'Played');
    }
    this.card.appendChild(grid);
  }
}
