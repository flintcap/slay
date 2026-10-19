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

import type { GameSettings, VideoEffect } from '../types';
import { VIDEO_EFFECTS } from '../types';
import { QUALITY } from '../core/Renderer';
import { FRAME_CAPS, framePace } from '../core/FramePace';
import { HUD_SCALE_MAX, HUD_SCALE_MIN, MINIMAP_SCALE_MAX, MINIMAP_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_MIN } from '../core/UiScale';
import { canChooseScreen, isFullscreen, listScreens, onFullscreenChange, setFullscreen } from '../core/Display';
import type { Engine } from '../core/Engine';
import { events } from '../core/Events';
import { save, DEFAULT_SETTINGS } from '../core/Save';
import { resetHints } from './Onboarding';
import { accessibilitySection, keybindSection, keyLabel } from './AccessibilitySettings';
import { keyFor, remapKey } from '../core/Access';
import { Panel, Button, Slider, Toggle, Segmented, div, span, icon, keycap, modal, attempt, section } from './Widgets';
import { uiSfx } from './Sfx';
import { FieldNav } from './FieldNav';
import { peril } from '../core/Peril';
import { BUILT, RELEASE, versionLabel } from '../core/Build';
import { buildReport } from '../core/Report';
import { logText, saveTextFile } from '../core/Log';
import { tr, numText, LANG_KEY, LOCALES, PSEUDO, locale } from '../core/I18n';

/** `slay-log-2026-10-19.txt` */
function logName(): string {
  return `slay-log-${new Date().toISOString().slice(0, 10)}.txt`;
}

type QualityId = GameSettings['quality'];
type TabId = 'video' | 'audio' | 'gameplay' | 'controls' | 'data' | 'about';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'video', label: tr('Video'), icon: 'eye' },
  { id: 'audio', label: tr('Audio'), icon: 'sparkle' },
  { id: 'gameplay', label: tr('Gameplay'), icon: 'strength' },
  { id: 'controls', label: tr('Controls'), icon: 'info' },
  { id: 'data', label: tr('Save Data'), icon: 'stash' },
  { id: 'about', label: tr('About'), icon: 'scroll' },
];

const QUALITY_NOTES: Record<QualityId, string> = {
  low: tr('Soft sun shadows only, no glow, no torch shadows, a third of the particles, 80% resolution. For older laptops.'),
  medium: tr('Torch shadows and glow, lighter shadows, no edge smoothing, 60% of the particles, 90% resolution. Integrated graphics.'),
  high: tr('Sharp shadows, glow, edge smoothing and the full particle budget. The intended look.'),
  ultra: tr('Ambient occlusion, very sharp shadows reaching further, extra particles and full resolution on high-density screens.'),
};

/**
 * The bindings, grouped the way a player thinks about them. A key written as
 * a code ('KeyQ', 'Digit1', 'Space') is shown as whatever key the player has
 * bound to it, so the card stays true after a rebind; anything else is shown
 * as written.
 */
const CONTROLS: Array<{ group: string; rows: Array<[string, string[]]> }> = [
  {
    group: tr('Moving and fighting'),
    rows: [
      [tr('Move'), [tr('Left click'), 'KeyW', 'KeyA', 'KeyS', 'KeyD']],
      [tr('Attack (hold to keep swinging)'), [tr('Right click')]],
      [tr('Attack in place'), ['Shift', tr('Left click')]],
      [tr('Skills on the bar'), ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']],
      [tr('Dodge'), ['Space']],
      [tr('Life potion'), ['KeyQ']],
      [tr('Mana potion'), ['KeyF']],
      [tr('Interact, open, talk'), ['KeyE']],
      [tr('Show hidden items on the floor'), ['Shift']],
    ],
  },
  {
    group: tr('Panels'),
    rows: [
      [tr('Inventory'), ['KeyI']],
      [tr('Character'), ['KeyC']],
      [tr('Skill tree'), ['KeyT']],
      [tr('Vault (in town)'), ['KeyB']],
      [tr('Map'), ['KeyM']],
      [tr('See-through map over the game'), ['Tab']],
      [tr('Quest log'), ['KeyL']],
      [tr('Journal'), ['KeyJ']],
      [tr('Loot filter'), ['KeyO']],
      [tr('Legacy'), ['KeyG']],
      [tr('Pause, close a panel'), [tr('Esc')]],
    ],
  },
  {
    group: tr('Menus'),
    rows: [
      [tr('Choose'), ['↑', '↓']],
      [tr('Change a setting'), ['←', '→']],
      [tr('Confirm'), ['Enter']],
      [tr('Back'), [tr('Esc')]],
      [tr('Settings tabs'), ['KeyQ', 'KeyE']],
    ],
  },
];

/** A key from the card above, as the player currently has it bound. */
function boundKey(k: string): string {
  return /^(Key|Digit)|^(Space|Shift|Tab|Enter)$/.test(k) ? keyLabel(keyFor(k, save.settings.keybinds)) : k;
}

export class SettingsPanel {
  readonly panel: Panel;
  private engine: Engine;
  private tab: TabId = 'video';
  private rail: HTMLDivElement;
  private content: HTMLDivElement;
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private fps: HTMLDivElement | null = null;
  /** Stops the Full screen switch following the browser (it was redrawn). */
  private offFullscreen: (() => void) | null = null;
  private fpsTimer = 0;

  constructor(engine: Engine) {
    this.engine = engine;
    this.panel = new Panel({
      id: 'settings',
      title: tr('Settings'),
      subtitle: tr('Saved as you change them'),
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
    reset.textContent = tr('Restore defaults');
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
        this.fps.textContent = tr('{0} fps  ·  {1} ms{2}', Math.round(this.engine.fps), numText(ms, 1), gpu > 0 ? tr('  ·  GPU {0} ms', numText(gpu, 1)) : '');
      }, 500);
    } else if (!s.showFps && this.fps) {
      this.fps.remove();
      this.fps = null;
      clearInterval(this.fpsTimer);
    }
  }

  private restoreDefaults(): void {
    modal({
      title: tr('Restore default settings?'),
      icon: 'gear',
      body: tr('<p>Picture, sound and gameplay options go back to how they started. Your key bindings, characters and vault are not touched.</p>'),
      confirmLabel: tr('Restore'),
      onConfirm: () => {
        // Key bindings have their own reset on the Controls page; losing a
        // full rebind to a picture-settings reset is not what anyone wants.
        const keybinds = save.settings.keybinds;
        Object.assign(save.settings, DEFAULT_SETTINGS, { keybinds });
        attempt(() => this.engine.renderer.setQuality(save.settings.quality), undefined);
        this.commit();
        events.emit('toast', { text: tr('Settings restored to defaults.'), kind: 'info' });
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
    this.heading(tr('Video'), tr('Changes apply immediately.'));
    const note = div('stg-note', QUALITY_NOTES[s.quality]);
    // The Effects switches show what the chosen preset has, so they follow it.
    const effects = div('');
    this.content.appendChild(
      new Segmented<QualityId>(
        tr('Quality'),
        [
          { id: 'low', label: tr('Low') },
          { id: 'medium', label: tr('Medium') },
          { id: 'high', label: tr('High') },
          { id: 'ultra', label: tr('Ultra') },
        ],
        s.quality,
        (v) => {
          s.quality = v;
          attempt(() => this.engine.renderer.setQuality(v), undefined);
          note.textContent = QUALITY_NOTES[v];
          this.commit();
          this.effects(effects);
        },
      ).root,
    );
    this.content.appendChild(note);
    this.content.appendChild(
      new Toggle(tr('Auto quality'), s.autoQuality !== false, (v) => {
        s.autoQuality = v;
        // Off: back to exactly the quality chosen above, at once.
        if (!v) attempt(() => this.engine.renderer.setQuality(s.quality), undefined);
        this.commit();
      }, tr('Steps below the quality above when frames run slow, and back up when there is room')).root,
    );
    this.content.appendChild(
      new Slider(tr('Render scale'), s.renderScale ?? 1, 0.5, 1, 0.05, (v) => {
        s.renderScale = v;
        attempt(() => this.engine.renderer.setRenderScale(v), undefined);
        this.commit();
      }, (v) => `${Math.round(v * 100)}%`, tr('Draws fewer pixels and fills in the rest. Lower is faster')).root,
    );
    this.display();
    this.interfaceSize();
    this.content.appendChild(effects);
    this.effects(effects);
    const more = section(tr('View'), 'eye');
    more.body.appendChild(
      new Slider(tr('Camera distance'), s.cameraDistance, 0.6, 1.8, 0.05, (v) => {
        s.cameraDistance = v;
        this.commit();
      }, (v) => `${numText(v, 2)}x`, tr('How far the camera sits from your hero. Further shows more of the fight')).root,
    );
    more.body.appendChild(
      new Toggle(tr('Show frame rate'), !!s.showFps, (v) => {
        s.showFps = v;
        this.commit();
      }, tr('A small readout in the top-right corner')).root,
    );
    this.content.appendChild(more.root);
  }

  /** Full screen, the screen, the frame cap and brightness. */
  private display(): void {
    const s = save.settings;
    const sec = section(tr('Display'), 'eye');
    const full = new Toggle(tr('Full screen'), isFullscreen(), (v) => {
      void setFullscreen(v).catch(() => {
        full.set(isFullscreen());
        events.emit('toast', { text: tr('The browser would not change full screen.'), kind: 'bad' });
      });
    }, tr('Hold Esc to leave it. A tap of Esc still pauses'));
    this.offFullscreen?.();
    this.offFullscreen = onFullscreenChange(() => full.set(isFullscreen()));
    sec.body.appendChild(full.root);
    if (canChooseScreen()) {
      const pick = div('stg-row');
      const find = new Button({
        label: tr('Choose a screen'),
        icon: 'eye',
        small: true,
        onClick: () => {
          void listScreens().then(
            ({ screens, current }) => {
              pick.replaceChildren();
              pick.appendChild(
                new Segmented<string>(
                  tr('Screen'),
                  screens.map((sc, i) => ({ id: String(i), label: sc.primary ? tr('{0} (main)', sc.label) : sc.label, hint: `${sc.width} × ${sc.height}` })),
                  String(current),
                  (v) => {
                    void setFullscreen(true, screens[Number(v)]).then(() => full.set(true), () => undefined);
                  },
                ).root,
              );
            },
            () => events.emit('toast', { text: tr('The browser did not allow a list of screens.'), kind: 'bad' }),
          );
        },
      });
      pick.appendChild(find.root);
      sec.body.appendChild(pick);
    }
    const hz = framePace.hz;
    const caps = FRAME_CAPS.filter((c) => c === 0 || c <= hz || c === s.frameCap);
    const capNote = div('stg-note');
    const showCap = (): void => {
      const cap = s.frameCap ?? 0;
      capNote.textContent = tr('Your screen shows {0} frames a second. Auto quality aims for {1}.', hz, Math.round(1000 / framePace.aimMs(cap)));
    };
    sec.body.appendChild(
      new Segmented<string>(
        tr('Frame cap'),
        caps.map((c) => ({ id: String(c), label: c === 0 ? tr('Screen') : String(c), hint: c === 0 ? tr('One frame for every refresh of the screen') : undefined })),
        String(s.frameCap ?? 0),
        (v) => {
          s.frameCap = Number(v);
          this.commit();
          showCap();
        },
      ).root,
    );
    showCap();
    sec.body.appendChild(capNote);
    sec.body.appendChild(
      new Slider(tr('Brightness'), s.brightness ?? 1, 0.7, 1.4, 0.05, (v) => {
        s.brightness = v;
        this.commit();
      }, (v) => `${Math.round(v * 100)}%`, tr('Raise it until the darkest corners just show shapes')).root,
    );
    sec.body.appendChild(div('stg-note', tr('In a browser, frames always wait for the screen (vsync). Window modes come with the desktop version.')));
    this.content.appendChild(sec.root);
  }

  /**
   * How big the menus, the HUD and the minimap are drawn. Each one changes when
   * the slider is let go: the panel it sits in grows or shrinks with it.
   */
  private interfaceSize(): void {
    const s = save.settings;
    const sec = section(tr('Interface'), 'eye');
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const rows: Array<[string, string, number, number, number, (v: number) => void]> = [
      [tr('Menu size'), tr('Every menu, the HUD and the words on screen'), s.uiScale ?? 1, UI_SCALE_MIN, UI_SCALE_MAX, (v) => (s.uiScale = v)],
      [tr('HUD size'), tr('The orbs, the skill bar and the minimap, on top of the menu size'), s.hudScale ?? 1, HUD_SCALE_MIN, HUD_SCALE_MAX, (v) => (s.hudScale = v)],
      [tr('Minimap size'), tr('The map in the top-right corner'), s.minimapScale ?? 1, MINIMAP_SCALE_MIN, MINIMAP_SCALE_MAX, (v) => (s.minimapScale = v)],
    ];
    for (const [label, hint, value, min, max, set] of rows) {
      sec.body.appendChild(
        new Slider(label, value, min, max, 0.05, () => undefined, pct, hint).onRelease((v) => {
          set(v);
          this.commit();
        }).root,
      );
    }
    this.content.appendChild(sec.root);
  }

  /** One switch per effect, for the effects the chosen quality has. */
  private effects(into: HTMLElement): void {
    const s = save.settings;
    const q = QUALITY[s.quality];
    const has: Record<VideoEffect, boolean> = {
      bloom: q.bloom,
      aa: q.taa || q.smaa,
      ao: q.ao,
      torchShadows: q.pointShadows,
      contactShadows: q.contactShadows,
      airLight: q.shafts || q.motes || q.air > 0,
      grain: true,
      fringe: true,
      ripples: true,
    };
    const rows: Array<[VideoEffect, string, string]> = [
      ['bloom', tr('Glow'), tr('Fire, magic and bright light bleed softly into the dark')],
      ['aa', tr('Edge smoothing'), tr('Steadies thin edges and shimmer')],
      ['ao', tr('Ambient occlusion'), tr('Soft dark where walls and floor meet')],
      ['torchShadows', tr('Torch shadows'), tr('Torches, braziers and your lantern cast shadows')],
      ['contactShadows', tr('Contact shadows'), tr('Small sharp shadows where things touch the ground, outdoors')],
      ['airLight', tr('Light in the air'), tr('Glow in the fog round torches, dust and sunbeams')],
      ['grain', tr('Film grain'), tr('A fine grain over the picture')],
      ['fringe', tr('Lens fringe'), tr('Colour fringes at the edges of the screen')],
      ['ripples', tr('Heat haze and ripples'), tr('Shockwaves, portals and hot air bend the picture')],
    ];
    const sec = section(tr('Effects'), 'sparkle');
    for (const [id, label, hint] of rows) {
      if (!has[id]) continue;
      sec.body.appendChild(
        new Toggle(label, !(s.effectsOff ?? []).includes(id), (on) => {
          const off = new Set(s.effectsOff ?? []);
          if (on) off.delete(id);
          else off.add(id);
          s.effectsOff = VIDEO_EFFECTS.filter((e) => off.has(e));
          this.commit();
        }, hint).root,
      );
    }
    into.replaceChildren(sec.root);
  }

  private audio(): void {
    const s = save.settings;
    this.heading(tr('Audio'), tr('Effects play a sample when you let go of the slider.'));
    const sample = (): void => uiSfx('ui.select');
    const slider = (label: string, value: number, set: (v: number) => void, hint: string, test = false): HTMLElement => {
      const sl = new Slider(label, value, 0, 1, 0.01, (v) => {
        set(v);
        this.commit();
      }, (v) => (v <= 0 ? tr('Muted') : `${Math.round(v * 100)}%`), hint);
      if (test) sl.root.querySelector('input')?.addEventListener('change', sample);
      return sl.root;
    };
    this.content.appendChild(slider(tr('Master volume'), s.masterVolume, (v) => (s.masterVolume = v), tr('Everything at once'), true));
    this.content.appendChild(slider(tr('Music'), s.musicVolume, (v) => (s.musicVolume = v), tr('The score in town and below')));
    this.content.appendChild(slider(tr('Effects'), s.sfxVolume, (v) => (s.sfxVolume = v), tr('Hits, spells, footsteps and monsters')));
    this.content.appendChild(slider(tr('Ambience'), s.ambienceVolume ?? s.sfxVolume, (v) => (s.ambienceVolume = v), tr('Wind, water, fire and the sound of each place')));
    this.content.appendChild(slider(tr('Interface'), s.uiVolume ?? s.sfxVolume, (v) => (s.uiVolume = v), tr('Menu clicks and the chimes for level-ups, quests and crafting'), true));
    this.content.appendChild(slider(tr('Voices'), s.voiceVolume ?? s.sfxVolume, (v) => (s.voiceVolume = v), tr("Your hero's cries and lines, and what the bosses say")));
    this.content.appendChild(
      new Toggle(tr('Mute in the background'), s.muteInBackground !== false, (v) => {
        s.muteInBackground = v;
        this.commit();
      }, tr('Silent while another window or tab is in front')).root,
    );
  }

  private gameplay(): void {
    const s = save.settings;
    this.heading(tr('Gameplay'), tr('How the game talks to you.'));
    this.language();
    this.content.appendChild(
      new Slider(tr('Screen shake'), s.screenShake, 0, 2, 0.05, (v) => {
        s.screenShake = v;
        this.commit();
      }, (v) => (v === 0 ? tr('Off') : `${Math.round(v * 100)}%`), tr('How hard the screen jolts on big hits. 0 turns it off')).root,
    );
    this.content.appendChild(
      new Slider(tr('See-through map strength'), s.mapOverlayOpacity ?? 0.7, 0.2, 1, 0.05, (v) => {
        s.mapOverlayOpacity = v;
        this.commit();
      }, (v) => `${Math.round(v * 100)}%`, tr('How solid the map over the game is drawn. Tab shows and hides it')).root,
    );
    this.content.appendChild(
      new Slider(tr('See-through map size'), s.mapOverlaySize ?? 1, 0.5, 2, 0.05, (v) => {
        s.mapOverlaySize = v;
        this.commit();
      }, (v) => `${numText(v, 2)}x`, tr('How large the map over the game is drawn. Larger shows less of the floor')).root,
    );
    this.content.appendChild(
      new Toggle(tr('Damage numbers'), s.showDamageNumbers, (v) => {
        s.showDamageNumbers = v;
        this.commit();
      }, tr('Floating combat text over enemies')).root,
    );
    this.content.appendChild(
      new Toggle(tr('Area title cards'), s.titleCards !== false, (v) => {
        s.titleCards = v;
        this.commit();
      }, tr('The name of each place as you arrive')).root,
    );
    this.content.appendChild(
      new Toggle(tr('Control hints'), s.hints !== false, (v) => {
        s.hints = v;
        this.commit();
      }, tr('Short tips the first time you meet something new')).root,
    );
    const replay = new Button({
      label: tr('Show all first-time tips again'),
      variant: 'ghost',
      small: true,
      onClick: () => {
        resetHints();
        events.emit('toast', { text: tr('Hints will show again as you play.'), kind: 'info' });
      },
    });
    replay.root.classList.add('stg-inline');
    this.content.appendChild(replay.root);
    this.content.appendChild(
      new Toggle(tr('Reduced motion'), !!s.reduceMotion, (v) => {
        s.reduceMotion = v;
        this.commit();
      }, tr('Calmer menus, no screen shake, and no warp when you are hit')).root,
    );
    this.content.appendChild(
      new Toggle(tr('Flash reduction'), !!s.flashReduce, (v) => {
        s.flashReduce = v;
        this.commit();
      }, tr('Softer red when you are hit, dimmer bursts of light from spells and blows')).root,
    );
    // Text size and colour-blind item colours (quality stream).
    this.content.appendChild(accessibilitySection(() => this.commit()));
  }

  /**
   * The language, when there is more than one. It is read at boot (src/boot.ts)
   * from its own storage key, so a change waits for a restart; outside a map
   * the restart is one click away.
   */
  private language(): void {
    const choices = RELEASE ? [...LOCALES] : [...LOCALES, PSEUDO];
    if (choices.length < 2) return;
    let chosen = locale().code;
    try {
      chosen = localStorage.getItem(LANG_KEY) || chosen;
    } catch {
      /* storage blocked: show the language in use */
    }
    const note = div('stg-note');
    const showNote = (): void => {
      note.replaceChildren();
      if (chosen === locale().code) return;
      const name = choices.find((l) => l.code === chosen)?.name ?? chosen;
      note.appendChild(span('', tr('{0} after a restart.', name)));
      if (this.engine.currentSceneId !== 'dungeon') {
        note.appendChild(
          new Button({ label: tr('Restart now'), icon: 'play', small: true, onClick: () => { save.flush(); location.reload(); } }).root,
        );
      }
    };
    this.content.appendChild(
      new Segmented<string>(
        tr('Language'),
        choices.map((l) => ({ id: l.code, label: l.name })),
        chosen,
        (v) => {
          chosen = v;
          try {
            localStorage.setItem(LANG_KEY, v);
          } catch {
            events.emit('toast', { text: tr('The language could not be saved in this browser.'), kind: 'bad' });
          }
          showNote();
        },
      ).root,
    );
    showNote();
    this.content.appendChild(note);
  }

  private controls(): void {
    this.heading(tr('Controls'), tr('Every binding in the game.'));
    // Rebindable keys (quality stream). The card below is the full reference.
    this.content.appendChild(keybindSection(() => this.commit()));
    for (const g of CONTROLS) {
      this.content.appendChild(div('stg-group', g.group));
      const list = div('stg-keys');
      for (const [action, keys] of g.rows) {
        const r = div('stg-key');
        r.appendChild(span('stg-key-action', action));
        const caps = div('stg-key-caps');
        const chord = action === tr('Attack in place');
        keys.forEach((code, i) => {
          const k = boundKey(code);
          const prev = i > 0 ? boundKey(keys[i - 1]!) : '';
          // "Shift + Left click", "Left click or W A S D"; single letters sit side by side.
          if (i > 0 && chord) caps.appendChild(span('stg-key-or', '+'));
          else if (i > 0 && (prev === tr('Left click') || (k.length > 1 && prev.length > 1))) caps.appendChild(span('stg-key-or', tr('or')));
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
    this.heading(tr('About'), tr('SLAY {0}{1}.', versionLabel(), BUILT ? tr(', built {0}', BUILT) : ''));
    this.content.appendChild(
      div('stg-note', tr('If something goes wrong, copy the report and send it with a line on what you were doing. It holds no names and no save.')),
    );
    const row = div('stg-row');
    row.appendChild(
      new Button({
        label: tr('Copy report'),
        icon: 'scroll',
        small: true,
        onClick: () => {
          const text = attempt(() => buildReport(this.engine), '');
          navigator.clipboard.writeText(text).then(
            () => events.emit('toast', { text: tr('Report copied to the clipboard.'), kind: 'good' }),
            () => {
              saveTextFile(logName(), text);
              events.emit('toast', { text: tr('The clipboard said no, so the report was saved as a file.'), kind: 'info' });
            },
          );
        },
      }).root,
    );
    row.appendChild(
      new Button({
        label: tr('Save log file'),
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
    this.heading(tr('Save Data'), tr('Your account lives in this browser. Export it to keep a copy.'));
    const io = div('settings-io');
    const box = document.createElement('textarea');
    box.placeholder = tr('Export writes your save here. Paste a save and press Import to restore it.');
    box.spellcheck = false;
    box.addEventListener('keydown', (e) => e.stopPropagation());
    io.appendChild(box);

    const row = div('stg-row');
    row.appendChild(
      new Button({
        label: tr('Export'),
        icon: 'download',
        small: true,
        onClick: () => {
          box.value = attempt(() => save.exportSave(), '');
          box.select();
          attempt(() => navigator.clipboard?.writeText(box.value), undefined);
          events.emit('toast', { text: tr('Save exported and copied to the clipboard.'), kind: 'good' });
        },
      }).root,
    );
    row.appendChild(
      new Button({
        label: tr('Import'),
        icon: 'upload',
        small: true,
        onClick: () => {
          const blob = box.value.trim();
          if (!blob) {
            events.emit('toast', { text: tr('Paste a save first.'), kind: 'bad' });
            return;
          }
          // Swapping saves is not a way out of a fight (core/Peril.ts).
          if (this.engine.currentSceneId === 'dungeon' && peril.active) {
            events.emit('toast', { text: tr('Not during a fight.'), kind: 'bad' });
            return;
          }
          modal({
            title: tr('Import save?'),
            icon: 'warn',
            tone: 'danger',
            body: tr('<p>This replaces your current account: vault, gold, memorial and every character. There is no undo.</p>'),
            confirmLabel: tr('Overwrite my save'),
            onConfirm: () => {
              const ok = attempt(() => save.importSave(blob), false);
              events.emit('toast', {
                text: ok ? tr('Save imported. Returning to the title.') : tr('That save could not be read.'),
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
    danger.appendChild(div('stg-group', tr('Danger zone')));
    danger.appendChild(
      new Button({
        label: tr('Delete everything'),
        variant: 'danger',
        icon: 'trash',
        wide: true,
        onClick: () => {
          modal({
            title: tr('Erase this account?'),
            icon: 'skull',
            tone: 'danger',
            body:
              tr('<p>Your vault, your banked gold, the memorial of everyone who has died, and every living character. All of it, permanently.</p><p><b>This is not the roguelike death. This is the delete button.</b></p>'),
            confirmLabel: tr('Erase it all'),
            onConfirm: () => {
              modal({
                title: tr('Really?'),
                icon: 'warn',
                tone: 'danger',
                body: tr('<p>Last chance. Confirm and everything is gone.</p>'),
                confirmLabel: tr('Yes, erase'),
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
