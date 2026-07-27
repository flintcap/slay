/**
 * SLAY — the pause menu.
 *
 * Opening it pauses the simulation (UIRoot handles that); everything else is a
 * short list of doors out. Abandoning a run is a confirmation, not a button.
 */

import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save } from '../core/Save';
import {
  Panel,
  Button,
  add,
  clear,
  div,
  span,
  icon,
  classById,
  duration,
  fmtInt,
  modal,
} from './Widgets';

export class PausePanel {
  readonly panel: Panel;
  private engine: Engine;
  private menu: HTMLDivElement;

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'pause',
      title: 'Paused',
      subtitle: 'The dungeon waits',
      icon: 'pause',
      width: 420,
      scrim: true,
      closable: true,
    });
    this.panel.frame.classList.add('panel-pause');

    this.menu = div('pause-menu');
    this.panel.body.appendChild(this.menu);
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
    clear(this.menu);
    const c = save.account.current;
    const inDungeon = this.engine.currentSceneId === 'dungeon';

    if (c) {
      const head = div('char-fact');
      head.style.justifyContent = 'center';
      head.appendChild(icon('strength', { size: 14 }));
      const t = div('char-fact-text');
      t.appendChild(div('char-fact-v', `${c.name} · Level ${c.level}`));
      t.appendChild(div('char-fact-l', `${classById(c.classId)?.name ?? c.classId} · ${duration(c.playtime)} survived · ${fmtInt(c.gold)} gold`));
      head.appendChild(t);
      this.menu.appendChild(head);
    }

    const btn = (label: string, iconName: string, onClick: () => void, variant: 'default' | 'primary' | 'ghost' | 'danger' = 'default'): void => {
      this.menu.appendChild(new Button({ label, icon: iconName, variant, wide: true, onClick }).root);
    };

    btn('Resume', 'play', () => this.panel.close(), 'primary');
    btn('Character', 'strength', () => {
      this.panel.close();
      events.emit('ui:open', { panel: 'character' });
    });
    btn('Skills', 'skillLevels', () => {
      this.panel.close();
      events.emit('ui:open', { panel: 'skills' });
    });
    btn('Inventory', 'bag', () => {
      this.panel.close();
      events.emit('ui:open', { panel: 'inventory' });
    });
    btn('Map', 'map', () => {
      this.panel.close();
      events.emit('ui:open', { panel: 'map' });
    });
    btn('Settings', 'gear', () => events.emit('ui:open', { panel: 'settings' }));

    if (inDungeon) {
      btn(
        'Abandon Run',
        'exit',
        () => {
          modal({
            title: 'Leave the dungeon?',
            icon: 'warn',
            tone: 'danger',
            body:
              '<p>You will walk back to town with everything you are carrying. The floor resets — anything still on the ground down here is lost.</p>',
            confirmLabel: 'Return to town',
            onConfirm: () => {
              this.panel.close();
              save.touch();
              save.flush();
              void this.engine.goTo('town');
            },
          });
        },
        'ghost'
      );
    }

    btn(
      'Quit to Title',
      'exit',
      () => {
        modal({
          title: 'Quit to the title screen?',
          icon: 'warn',
          tone: 'danger',
          body: '<p>Your character is saved and will be waiting. Progress inside this dungeon floor is not.</p>',
          confirmLabel: 'Quit',
          onConfirm: () => {
            this.panel.close();
            save.flush();
            void this.engine.goTo('title');
          },
        });
      },
      'danger'
    );

    const foot = div('pause-sub');
    foot.appendChild(span('', 'Press '));
    foot.appendChild(span('keycap', 'Esc'));
    foot.appendChild(span('', ' to resume'));
    this.menu.appendChild(foot);
  }
}

export { add as _add };
