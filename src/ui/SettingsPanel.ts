/**
 * SLAY — settings.
 *
 * A tabbed panel: Video, Audio, Gameplay, Controls and Save Data. Every control
 * writes straight into `save.settings` and is persisted on the spot (the save
 * debounces its own writes). Quality goes to the renderer immediately, volume
 * changes reach the audio layer through `settings:changed`, and the menu-only
 * preferences (reduced motion, the frame-rate readout) are applied here.
 *
 * The controls tab is a reference card, written against the real bindings in
 * `core/Input.ts` and the click handling in DungeonScene.
 */

import type { GameSettings } from '../types';
import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save, DEFAULT_SETTINGS } from '../core/Save';
import { resetHints } from './Onboarding';
import { accessibilitySection, keybindSection } from './AccessibilitySettings';
import { Panel, Button, Slider, Toggle, Segmented, div, span, icon, keycap, modal, attempt } from './Widgets';

type QualityId = GameSettings['quality'];
type TabId = 'video' | 'audio' | 'gameplay' | 'controls' | 'data';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'video', label: 'Video', icon: 'eye' },
  { id: 'audio', label: 'Audio', icon: 'sparkle' },
  { id: 'gameplay', label: 'Gameplay', icon: 'strength' },
  { id: 'controls', label: 'Controls', icon: 'info' },
  { id: 'data', label: 'Save Data', icon: 'stash' },
];

const QUALITY_NOTES: Record<QualityId, string> = {
  low: 'Shadows at low resolution, no ambient occlusion, a third of the particles. For older laptops.',
  medium: 'Sharper shadows and edge smoothing, no ambient occlusion. A good balance on integrated graphics.',
  high: 'Ambient occlusion and the full particle budget. The intended look.',
  ultra: 'Very sharp shadows, extra particles and full-resolution rendering on high-density screens.',
};

/** The bindings, grouped the way a player thinks about them. */
const CONTROLS: Array<{ group: string; rows: Array<[string, string[]]> }> = [
  {
    group: 'Moving and fighting',
    rows: [
      ['Move', ['Left click', 'W A S D']],
      ['Attack', ['Right click']],
      ['Skills on the bar', ['1', '2', '3', '4', '5', '6']],
      ['Dodge', ['Space']],
      ['Life potion', ['Q']],
      ['Mana potion', ['F']],
      ['Interact, open, talk', ['E']],
      ['Show items on the floor', ['Shift']],
    ],
  },
  {
    group: 'Panels',
    rows: [
      ['Inventory', ['I']],
      ['Character', ['C']],
      ['Skill tree', ['T']],
      ['Vault (in town)', ['B']],
      ['Map', ['M']],
      ['Quest log', ['L']],
      ['Pause, close a panel', ['Esc']],
    ],
  },
  {
    group: 'Menus',
    rows: [
      ['Choose', ['↑', '↓']],
      ['Confirm', ['Enter']],
      ['Back', ['Esc']],
    ],
  },
];

export class SettingsPanel {
  readonly panel: Panel;
  private engine: Engine;
  private tab: TabId = 'video';
  private rail: HTMLDivElement;
  private content: HTMLDivElement;
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private fps: HTMLDivElement | null = null;
  private fpsTimer = 0;

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'settings',
      title: 'Settings',
      subtitle: 'Saved as you change them',
      icon: 'gear',
      width: 820,
      scrim: true,
      className: 'stg',
    });
    this.panel.frame.classList.add('panel-settings');

    const wrap = div('stg-wrap');
    this.rail = div('stg-rail');
    for (const t of TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stg-tab';
      b.append(icon(t.icon, { size: 15 }), span('', t.label));
      b.addEventListener('click', () => this.setTab(t.id));
      this.tabButtons.set(t.id, b);
      this.rail.appendChild(b);
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'stg-reset';
    reset.textContent = 'Restore defaults';
    reset.addEventListener('click', () => this.restoreDefaults());
    this.rail.appendChild(reset);

    this.content = div('stg-content');
    wrap.append(this.rail, this.content);
    this.panel.body.appendChild(wrap);

    window.addEventListener('keydown', this.onKey, true);

    // Menu-only preferences take effect at boot, not only once the panel opens.
    this.applyLocal();
  }

  open(): void {
    this.render();
    this.panel.open();
    events.emit('sfx', { id: 'ui.open' });
  }

  close(): void {
    if (!this.panel.isOpen) return;
    this.panel.close();
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  private setTab(id: TabId): void {
    if (this.tab === id) return;
    this.tab = id;
    events.emit('sfx', { id: 'ui.tab' });
    this.render();
  }

  /** Q and E (or the bracket keys) page through tabs while the panel is open. */
  private onKey = (e: KeyboardEvent): void => {
    if (!this.panel.isOpen) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && (t as HTMLInputElement).type !== 'range') return;
    let dir = 0;
    if (e.code === 'KeyQ' || e.code === 'BracketLeft') dir = -1;
    else if (e.code === 'KeyE' || e.code === 'BracketRight') dir = 1;
    if (!dir) return;
    const i = TABS.findIndex((x) => x.id === this.tab);
    const next = TABS[(i + dir + TABS.length) % TABS.length]!;
    this.setTab(next.id);
    e.preventDefault();
    e.stopPropagation();
  };

  private commit(): void {
    save.touch();
    events.emit('settings:changed', {});
    this.applyLocal();
  }

  /** Applies the settings that live entirely in the UI layer. */
  private applyLocal(): void {
    const s = save.settings;
    document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
    if (s.showFps && !this.fps) {
      this.fps = div('stg-fps');
      document.body.appendChild(this.fps);
      this.fpsTimer = window.setInterval(() => {
        if (!this.fps) return;
        const ms = this.engine.frameMs;
        this.fps.textContent = `${Math.round(this.engine.fps)} fps  ·  ${ms.toFixed(1)} ms`;
      }, 500);
    } else if (!s.showFps && this.fps) {
      this.fps.remove();
      this.fps = null;
      clearInterval(this.fpsTimer);
    }
  }

  private restoreDefaults(): void {
    modal({
      title: 'Restore default settings?',
      icon: 'gear',
      body: '<p>Picture, sound and gameplay options go back to how they started. Your characters and vault are not touched.</p>',
      confirmLabel: 'Restore',
      onConfirm: () => {
        Object.assign(save.settings, DEFAULT_SETTINGS);
        attempt(() => this.engine.renderer.setQuality(save.settings.quality), undefined);
        this.commit();
        events.emit('toast', { text: 'Settings restored to defaults.', kind: 'info' });
        this.render();
      },
    });
  }

  // -- render --------------------------------------------------------------

  private render(): void {
    for (const [id, b] of this.tabButtons) b.classList.toggle('is-on', id === this.tab);
    this.content.replaceChildren();
    this.content.classList.remove('is-in');
    void this.content.offsetWidth;
    this.content.classList.add('is-in');
    switch (this.tab) {
      case 'video':
        this.video();
        break;
      case 'audio':
        this.audio();
        break;
      case 'gameplay':
        this.gameplay();
        break;
      case 'controls':
        this.controls();
        break;
      case 'data':
        this.data();
        break;
    }
  }

  private heading(title: string, sub: string): void {
    const h = div('stg-head');
    h.append(div('stg-head-title', title), div('stg-head-sub', sub));
    this.content.appendChild(h);
  }

  private video(): void {
    const s = save.settings;
    this.heading('Video', 'Changes apply immediately.');
    const note = div('stg-note', QUALITY_NOTES[s.quality]);
    this.content.appendChild(
      new Segmented<QualityId>(
        'Quality',
        [
          { id: 'low', label: 'Low' },
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' },
          { id: 'ultra', label: 'Ultra' },
        ],
        s.quality,
        (v) => {
          s.quality = v;
          attempt(() => this.engine.renderer.setQuality(v), undefined);
          note.textContent = QUALITY_NOTES[v];
          this.commit();
        },
      ).root,
    );
    this.content.appendChild(note);
    this.content.appendChild(
      new Slider('Camera distance', s.cameraDistance, 0.6, 1.8, 0.05, (v) => {
        s.cameraDistance = v;
        this.commit();
      }, (v) => `${v.toFixed(2)}x`).root,
    );
    this.content.appendChild(
      new Toggle('Show frame rate', !!s.showFps, (v) => {
        s.showFps = v;
        this.commit();
      }, 'A small readout in the top-right corner').root,
    );
  }

  private audio(): void {
    const s = save.settings;
    this.heading('Audio', 'Effects play a sample when you let go of the slider.');
    const sample = (): void => events.emit('sfx', { id: 'ui.select' });
    const slider = (label: string, value: number, set: (v: number) => void, test = false): HTMLElement => {
      const sl = new Slider(label, value, 0, 1, 0.01, (v) => {
        set(v);
        this.commit();
      }, (v) => (v <= 0 ? 'Muted' : `${Math.round(v * 100)}%`));
      if (test) sl.root.querySelector('input')?.addEventListener('change', sample);
      return sl.root;
    };
    this.content.appendChild(slider('Master volume', s.masterVolume, (v) => (s.masterVolume = v), true));
    this.content.appendChild(slider('Music', s.musicVolume, (v) => (s.musicVolume = v)));
    this.content.appendChild(slider('Effects', s.sfxVolume, (v) => (s.sfxVolume = v), true));
  }

  private gameplay(): void {
    const s = save.settings;
    this.heading('Gameplay', 'How the game talks to you.');
    this.content.appendChild(
      new Slider('Screen shake', s.screenShake, 0, 2, 0.05, (v) => {
        s.screenShake = v;
        this.commit();
      }, (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`)).root,
    );
    this.content.appendChild(
      new Toggle('Damage numbers', s.showDamageNumbers, (v) => {
        s.showDamageNumbers = v;
        this.commit();
      }, 'Floating combat text over enemies').root,
    );
    this.content.appendChild(
      new Toggle('Floor title cards', s.titleCards !== false, (v) => {
        s.titleCards = v;
        this.commit();
      }, 'The name of each place as you arrive').root,
    );
    this.content.appendChild(
      new Toggle('Control hints', s.hints !== false, (v) => {
        s.hints = v;
        this.commit();
      }, 'First-time tips on how to play').root,
    );
    const replay = new Button({
      label: 'Show all hints again',
      variant: 'ghost',
      small: true,
      onClick: () => {
        resetHints();
        events.emit('toast', { text: 'Hints will show again as you play.', kind: 'info' });
      },
    });
    replay.root.classList.add('stg-inline');
    this.content.appendChild(replay.root);
    this.content.appendChild(
      new Toggle('Reduced motion', !!s.reduceMotion, (v) => {
        s.reduceMotion = v;
        this.commit();
      }, 'Calmer menus: no slow intros or sweeping shines').root,
    );
    // Text size and colour-blind item colours (quality stream).
    this.content.appendChild(accessibilitySection(() => this.commit()));
  }

  private controls(): void {
    this.heading('Controls', 'Every binding in the game.');
    // Rebindable keys (quality stream). The card below is the full reference.
    this.content.appendChild(keybindSection(() => this.commit()));
    for (const g of CONTROLS) {
      this.content.appendChild(div('stg-group', g.group));
      const list = div('stg-keys');
      for (const [action, keys] of g.rows) {
        const r = div('stg-key');
        r.appendChild(span('stg-key-action', action));
        const caps = div('stg-key-caps');
        keys.forEach((k, i) => {
          if (i > 0 && k.length > 1 && keys[i - 1]!.length > 1) caps.appendChild(span('stg-key-or', 'or'));
          caps.appendChild(keycap(k));
        });
        r.appendChild(caps);
        list.appendChild(r);
      }
      this.content.appendChild(list);
    }
  }

  private data(): void {
    this.heading('Save Data', 'Your account lives in this browser. Export it to keep a copy.');
    const io = div('settings-io');
    const box = document.createElement('textarea');
    box.placeholder = 'Export writes your save here. Paste a save and press Import to restore it.';
    box.spellcheck = false;
    box.addEventListener('keydown', (e) => e.stopPropagation());
    io.appendChild(box);

    const row = div('stg-row');
    row.appendChild(
      new Button({
        label: 'Export',
        icon: 'download',
        small: true,
        onClick: () => {
          box.value = attempt(() => save.exportSave(), '');
          box.select();
          attempt(() => navigator.clipboard?.writeText(box.value), undefined);
          events.emit('toast', { text: 'Save exported and copied to the clipboard.', kind: 'good' });
        },
      }).root,
    );
    row.appendChild(
      new Button({
        label: 'Import',
        icon: 'upload',
        small: true,
        onClick: () => {
          const blob = box.value.trim();
          if (!blob) {
            events.emit('toast', { text: 'Paste a save first.', kind: 'bad' });
            return;
          }
          modal({
            title: 'Import save?',
            icon: 'warn',
            tone: 'danger',
            body: '<p>This replaces your current account: vault, gold, memorial and every character. There is no undo.</p>',
            confirmLabel: 'Overwrite my save',
            onConfirm: () => {
              const ok = attempt(() => save.importSave(blob), false);
              events.emit('toast', {
                text: ok ? 'Save imported. Returning to the title.' : 'That save could not be read.',
                kind: ok ? 'good' : 'bad',
              });
              if (ok) {
                this.panel.close();
                void this.engine.goTo('title');
              }
            },
          });
        },
      }).root,
    );
    io.appendChild(row);
    this.content.appendChild(io);

    const danger = div('settings-danger');
    danger.appendChild(div('stg-group', 'Danger zone'));
    danger.appendChild(
      new Button({
        label: 'Delete everything',
        variant: 'danger',
        icon: 'trash',
        wide: true,
        onClick: () => {
          modal({
            title: 'Erase this account?',
            icon: 'skull',
            tone: 'danger',
            body:
              '<p>Your vault, your banked gold, the memorial of everyone who has died, and every living character. All of it, permanently.</p>' +
              '<p><b>This is not the roguelike death. This is the delete button.</b></p>',
            confirmLabel: 'Erase it all',
            onConfirm: () => {
              modal({
                title: 'Really?',
                icon: 'warn',
                tone: 'danger',
                body: '<p>Last chance. Confirm and everything is gone.</p>',
                confirmLabel: 'Yes, erase',
                onConfirm: () => {
                  save.hardReset();
                  this.panel.close();
                  void this.engine.goTo('title');
                },
              });
            },
          });
        },
      }).root,
    );
    this.content.appendChild(danger);
  }
}
