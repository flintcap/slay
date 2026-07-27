/**
 * SLAY — settings.
 *
 * Writes straight into `save.settings`, pushes the quality profile into the
 * renderer, and emits `settings:changed` so the audio layer can re-read the
 * volumes. Save export/import and the delete button live here too, behind a
 * double confirmation.
 */

import type { GameSettings } from '../types';
import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save, DEFAULT_SETTINGS } from '../core/Save';
import {
  Panel,
  Button,
  Slider,
  Toggle,
  Segmented,
  add,
  clear,
  div,
  span,
  icon,
  section,
  modal,
  attempt,
} from './Widgets';

type QualityId = GameSettings['quality'];

export class SettingsPanel {
  readonly panel: Panel;
  private engine: Engine;
  private ioBox: HTMLTextAreaElement;

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'settings',
      title: 'Settings',
      subtitle: 'Tune the picture, the noise, and the shake',
      icon: 'gear',
      width: 860,
      scrim: true,
    });
    this.panel.frame.classList.add('panel-settings');

    const cols = div('settings-cols');
    const left = div('');
    const right = div('');
    const s = save.settings;

    // --- video ------------------------------------------------------------
    const video = section('Video', 'eye');
    video.body.appendChild(
      new Segmented<QualityId>(
        'Quality',
        [
          { id: 'low', label: 'Low', hint: 'No ambient occlusion, half particles' },
          { id: 'medium', label: 'Medium', hint: 'Balanced' },
          { id: 'high', label: 'High', hint: 'Default — AO and full effects' },
          { id: 'ultra', label: 'Ultra', hint: '4K shadows, maximum particles' },
        ],
        s.quality,
        (v) => {
          s.quality = v;
          attempt(() => this.engine.renderer.setQuality(v), undefined);
          this.commit();
        }
      ).root
    );
    video.body.appendChild(
      new Slider('Camera distance', s.cameraDistance, 0.6, 1.8, 0.05, (v) => {
        s.cameraDistance = v;
        this.commit();
      }, (v) => `${v.toFixed(2)}x`).root
    );
    video.body.appendChild(
      new Slider('Screen shake', s.screenShake, 0, 2, 0.05, (v) => {
        s.screenShake = v;
        this.commit();
      }, (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`)).root
    );
    video.body.appendChild(
      new Toggle('Damage numbers', s.showDamageNumbers, (v) => {
        s.showDamageNumbers = v;
        this.commit();
      }, 'Floating combat text over enemies').root
    );
    left.appendChild(video.root);

    // --- audio ------------------------------------------------------------
    const audio = section('Audio', 'sparkle');
    audio.body.appendChild(
      new Slider('Master volume', s.masterVolume, 0, 1, 0.01, (v) => {
        s.masterVolume = v;
        this.commit();
      }).root
    );
    audio.body.appendChild(
      new Slider('Music', s.musicVolume, 0, 1, 0.01, (v) => {
        s.musicVolume = v;
        this.commit();
      }).root
    );
    audio.body.appendChild(
      new Slider('Effects', s.sfxVolume, 0, 1, 0.01, (v) => {
        s.sfxVolume = v;
        this.commit();
      }).root
    );
    left.appendChild(audio.root);

    // --- controls reference ----------------------------------------------
    const keys = section('Controls', 'info');
    const bindings: Array<[string, string]> = [
      ['Move', 'Left click / WASD'],
      ['Skills', '1 – 6'],
      ['Potions', 'Q / W'],
      ['Inventory', 'I'],
      ['Character', 'C'],
      ['Skill tree', 'T'],
      ['Vault', 'B'],
      ['Map', 'M'],
      ['Quest log', 'L'],
      ['Interact', 'E'],
      ['Dodge', 'Space'],
      ['Compare items', 'Hold Shift'],
      ['Pause', 'Esc'],
    ];
    for (const [action, key] of bindings) {
      const r = div('statline');
      const l = div('statline-label');
      l.appendChild(span('', action));
      const v = span('statline-value', key);
      add(r, l, div('statline-dots'), v);
      keys.body.appendChild(r);
    }
    right.appendChild(keys.root);

    // --- save management --------------------------------------------------
    const data = section('Save Data', 'stash');
    const io = div('settings-io');
    this.ioBox = document.createElement('textarea');
    this.ioBox.placeholder = 'Export writes your save here. Paste a save and press Import to restore it.';
    this.ioBox.spellcheck = false;
    this.ioBox.addEventListener('keydown', (e) => e.stopPropagation());
    io.appendChild(this.ioBox);

    const ioRow = div('goldbank-actions');
    ioRow.appendChild(
      new Button({
        label: 'Export',
        icon: 'download',
        small: true,
        onClick: () => {
          this.ioBox.value = attempt(() => save.exportSave(), '');
          this.ioBox.select();
          attempt(() => navigator.clipboard?.writeText(this.ioBox.value), undefined);
          events.emit('toast', { text: 'Save exported and copied to the clipboard.', kind: 'good' });
        },
      }).root
    );
    ioRow.appendChild(
      new Button({
        label: 'Import',
        icon: 'upload',
        small: true,
        onClick: () => {
          const blob = this.ioBox.value.trim();
          if (!blob) {
            events.emit('toast', { text: 'Paste a save first.', kind: 'bad' });
            return;
          }
          modal({
            title: 'Import save?',
            icon: 'warn',
            tone: 'danger',
            body: '<p>This replaces your current account — vault, gold, memorial and live character. There is no undo.</p>',
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
      }).root
    );
    io.appendChild(ioRow);
    data.body.appendChild(io);

    const danger = div('settings-danger');
    danger.appendChild(div('goldbank-label', 'Danger zone'));
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
              '<p>Your vault, your banked gold, the memorial of everyone who has died, and your live character — all of it, permanently.</p>' +
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
      }).root
    );
    data.body.appendChild(danger);

    const reset = new Button({
      label: 'Restore defaults',
      variant: 'ghost',
      small: true,
      wide: true,
      onClick: () => {
        Object.assign(save.settings, DEFAULT_SETTINGS);
        attempt(() => this.engine.renderer.setQuality(save.settings.quality), undefined);
        this.commit();
        events.emit('toast', { text: 'Settings restored to defaults.', kind: 'info' });
        this.panel.close();
      },
    });
    data.body.appendChild(reset.root);
    right.appendChild(data.root);

    add(cols, left, right);
    this.panel.body.appendChild(cols);
  }

  private commit(): void {
    save.touch();
    events.emit('settings:changed', {});
  }

  open(): void {
    this.panel.open();
  }
  close(): void {
    this.panel.close();
  }
  get isOpen(): boolean {
    return this.panel.isOpen;
  }
}

export { clear as _clear, icon as _icon };
