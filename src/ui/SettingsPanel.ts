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
import { accessibilitySection, keybindSection, keyLabel } from './AccessibilitySettings';
import { keyFor, remapKey } from '../core/Access';
import { Panel, Button, Slider, Toggle, Segmented, div, span, icon, keycap, modal, attempt } from './Widgets';
import { uiSfx } from './Sfx';
import { FieldNav } from './FieldNav';
import { peril } from '../core/Peril';
import { BUILT, versionLabel } from '../core/Build';
import { buildReport } from '../core/Report';
import { logText, saveTextFile } from '../core/Log';

/** `slay-log-2026-10-19.txt` */
function logName(): string {
  return `slay-log-${new Date().toISOString().slice(0, 10)}.txt`;
}

type QualityId = GameSettings['quality'];
type TabId = 'video' | 'audio' | 'gameplay' | 'controls' | 'data' | 'about';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'video', label: 'Video', icon: 'eye' },
  { id: 'audio', label: 'Audio', icon: 'sparkle' },
  { id: 'gameplay', label: 'Gameplay', icon: 'strength' },
  { id: 'controls', label: 'Controls', icon: 'info' },
  { id: 'data', label: 'Save Data', icon: 'stash' },
  { id: 'about', label: 'About', icon: 'scroll' },
];

const QUALITY_NOTES: Record<QualityId, string> = {
  low: 'Soft sun shadows only, no glow, no torch shadows, a third of the particles, 80% resolution. For older laptops.',
  medium: 'Torch shadows and glow, lighter shadows, no edge smoothing, 60% of the particles, 90% resolution. Integrated graphics.',
  high: 'Sharp shadows, glow, edge smoothing and the full particle budget. The intended look.',
  ultra: 'Ambient occlusion, very sharp shadows reaching further, extra particles and full resolution on high-density screens.',
};

/**
 * The bindings, grouped the way a player thinks about them. A key written as
 * a code ('KeyQ', 'Digit1', 'Space') is shown as whatever key the player has
 * bound to it, so the card stays true after a rebind; anything else is shown
 * as written.
 */
const CONTROLS: Array<{ group: string; rows: Array<[string, string[]]> }> = [
  {
    group: 'Moving and fighting',
    rows: [
      ['Move', ['Left click', 'KeyW', 'KeyA', 'KeyS', 'KeyD']],
      ['Attack (hold to keep swinging)', ['Right click']],
      ['Attack in place', ['Shift', 'Left click']],
      ['Skills on the bar', ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']],
      ['Dodge', ['Space']],
      ['Life potion', ['KeyQ']],
      ['Mana potion', ['KeyF']],
      ['Interact, open, talk', ['KeyE']],
      ['Show hidden items on the floor', ['Shift']],
    ],
  },
  {
    group: 'Panels',
    rows: [
      ['Inventory', ['KeyI']],
      ['Character', ['KeyC']],
      ['Skill tree', ['KeyT']],
      ['Vault (in town)', ['KeyB']],
      ['Map', ['KeyM']],
      ['See-through map over the game', ['Tab']],
      ['Quest log', ['KeyL']],
      ['Journal', ['KeyJ']],
      ['Loot filter', ['KeyO']],
      ['Legacy', ['KeyG']],
      ['Pause, close a panel', ['Esc']],
    ],
  },
  {
    group: 'Menus',
    rows: [
      ['Choose', ['↑', '↓']],
      ['Change a setting', ['←', '→']],
      ['Confirm', ['Enter']],
      ['Back', ['Esc']],
      ['Settings tabs', ['KeyQ', 'KeyE']],
    ],
  },
];

/** A key from the card above, as the player currently has it bound. */
function boundKey(k: string): string {
  return /^(Key|Digit)|^Space$/.test(k) ? keyLabel(keyFor(k, save.settings.keybinds)) : k;
}

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
    // Arrow keys walk the controls.
    new FieldNav(this.panel.body, () => this.panel.isOpen);

    // Menu-only preferences take effect at boot, not only once the panel opens.
    this.applyLocal();
  }

  open(): void {
    this.render();
    this.panel.open();
  }

  /** The tab the next `open` shows (the title's Credits opens About). */
  showTab(id: string): void {
    const t = TABS.find((x) => x.id === id);
    if (t) this.tab = t.id;
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
    uiSfx('ui.tab');
    this.render();
  }

  /** Q and E (or the bracket keys) page through tabs while the panel is open. */
  private onKey = (e: KeyboardEvent): void => {
    if (!this.panel.isOpen) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && (t as HTMLInputElement).type !== 'range') return;
    let dir = 0;
    const code = remapKey(e.code);
    if (code === 'KeyQ' || code === 'BracketLeft') dir = -1;
    else if (code === 'KeyE' || code === 'BracketRight') dir = 1;
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
        const gpu = this.engine.renderer.gpuMs;
        this.fps.textContent = `${Math.round(this.engine.fps)} fps  ·  ${ms.toFixed(1)} ms${gpu > 0 ? `  ·  GPU ${gpu.toFixed(1)} ms` : ''}`;
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
      body: '<p>Picture, sound and gameplay options go back to how they started. Your key bindings, characters and vault are not touched.</p>',
      confirmLabel: 'Restore',
      onConfirm: () => {
        // Key bindings have their own reset on the Controls page; losing a
        // full rebind to a picture-settings reset is not what anyone wants.
        const keybinds = save.settings.keybinds;
        Object.assign(save.settings, DEFAULT_SETTINGS, { keybinds });
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
      case 'about':
        this.about();
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
      new Toggle('Auto quality', s.autoQuality !== false, (v) => {
        s.autoQuality = v;
        // Off: back to exactly the quality chosen above, at once.
        if (!v) attempt(() => this.engine.renderer.setQuality(s.quality), undefined);
        this.commit();
      }, 'Steps below the quality above when frames run slow, and back up when there is room').root,
    );
    this.content.appendChild(
      new Slider('Render scale', s.renderScale ?? 1, 0.5, 1, 0.05, (v) => {
        s.renderScale = v;
        attempt(() => this.engine.renderer.setRenderScale(v), undefined);
        this.commit();
      }, (v) => `${Math.round(v * 100)}%`, 'Draws fewer pixels and fills in the rest. Lower is faster').root,
    );
    this.content.appendChild(
      new Slider('Camera distance', s.cameraDistance, 0.6, 1.8, 0.05, (v) => {
        s.cameraDistance = v;
        this.commit();
      }, (v) => `${v.toFixed(2)}x`, 'How far the camera sits from your hero. Further shows more of the fight').root,
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
    const sample = (): void => uiSfx('ui.select');
    const slider = (label: string, value: number, set: (v: number) => void, hint: string, test = false): HTMLElement => {
      const sl = new Slider(label, value, 0, 1, 0.01, (v) => {
        set(v);
        this.commit();
      }, (v) => (v <= 0 ? 'Muted' : `${Math.round(v * 100)}%`), hint);
      if (test) sl.root.querySelector('input')?.addEventListener('change', sample);
      return sl.root;
    };
    this.content.appendChild(slider('Master volume', s.masterVolume, (v) => (s.masterVolume = v), 'Everything at once', true));
    this.content.appendChild(slider('Music', s.musicVolume, (v) => (s.musicVolume = v), 'The score in town and below'));
    this.content.appendChild(slider('Effects', s.sfxVolume, (v) => (s.sfxVolume = v), 'Hits, spells, footsteps and menu clicks', true));
  }

  private gameplay(): void {
    const s = save.settings;
    this.heading('Gameplay', 'How the game talks to you.');
    this.content.appendChild(
      new Slider('Screen shake', s.screenShake, 0, 2, 0.05, (v) => {
        s.screenShake = v;
        this.commit();
      }, (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`), 'How hard the screen jolts on big hits. 0 turns it off').root,
    );
    this.content.appendChild(
      new Slider('See-through map strength', s.mapOverlayOpacity ?? 0.7, 0.2, 1, 0.05, (v) => {
        s.mapOverlayOpacity = v;
        this.commit();
      }, (v) => `${Math.round(v * 100)}%`, 'How solid the map over the game is drawn. Tab shows and hides it').root,
    );
    this.content.appendChild(
      new Slider('See-through map size', s.mapOverlaySize ?? 1, 0.5, 2, 0.05, (v) => {
        s.mapOverlaySize = v;
        this.commit();
      }, (v) => `${v.toFixed(2)}x`, 'How large the map over the game is drawn. Larger shows less of the floor').root,
    );
    this.content.appendChild(
      new Toggle('Damage numbers', s.showDamageNumbers, (v) => {
        s.showDamageNumbers = v;
        this.commit();
      }, 'Floating combat text over enemies').root,
    );
    this.content.appendChild(
      new Toggle('Area title cards', s.titleCards !== false, (v) => {
        s.titleCards = v;
        this.commit();
      }, 'The name of each place as you arrive').root,
    );
    this.content.appendChild(
      new Toggle('Control hints', s.hints !== false, (v) => {
        s.hints = v;
        this.commit();
      }, 'Short tips the first time you meet something new').root,
    );
    const replay = new Button({
      label: 'Show all first-time tips again',
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
        const chord = action === 'Attack in place';
        keys.forEach((code, i) => {
          const k = boundKey(code);
          const prev = i > 0 ? boundKey(keys[i - 1]!) : '';
          // "Shift + Left click", "Left click or W A S D"; single letters sit side by side.
          if (i > 0 && chord) caps.appendChild(span('stg-key-or', '+'));
          else if (i > 0 && (prev === 'Left click' || (k.length > 1 && prev.length > 1))) caps.appendChild(span('stg-key-or', 'or'));
          caps.appendChild(keycap(k));
        });
        r.appendChild(caps);
        list.appendChild(r);
      }
      this.content.appendChild(list);
    }
  }

  /** Version, the bug report and the log, then the credits and licences. */
  private about(): void {
    this.heading('About', `SLAY ${versionLabel()}${BUILT ? `, built ${BUILT}` : ''}.`);
    this.content.appendChild(
      div('stg-note', 'If something goes wrong, copy the report and send it with a line on what you were doing. It holds no names and no save.'),
    );
    const row = div('stg-row');
    row.appendChild(
      new Button({
        label: 'Copy report',
        icon: 'scroll',
        small: true,
        onClick: () => {
          const text = attempt(() => buildReport(this.engine), '');
          navigator.clipboard.writeText(text).then(
            () => events.emit('toast', { text: 'Report copied to the clipboard.', kind: 'good' }),
            () => {
              saveTextFile(logName(), text);
              events.emit('toast', { text: 'The clipboard said no, so the report was saved as a file.', kind: 'info' });
            },
          );
        },
      }).root,
    );
    row.appendChild(
      new Button({
        label: 'Save log file',
        icon: 'download',
        small: true,
        onClick: () => saveTextFile(logName(), attempt(() => buildReport(this.engine), logText())),
      }).root,
    );
    this.content.appendChild(row);
    const credits = div('cr');
    this.content.appendChild(credits);
    const tab = this.tab;
    void import('./Credits').then(({ renderCredits }) => {
      // Still on About: the page could have moved on while this loaded.
      if (this.tab === tab && credits.isConnected) renderCredits(credits);
    });
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
          // Swapping saves is not a way out of a fight (core/Peril.ts).
          if (this.engine.currentSceneId === 'dungeon' && peril.active) {
            events.emit('toast', { text: 'Not during a fight.', kind: 'bad' });
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
