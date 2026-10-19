/**
 * The settings menu's Accessibility and Key bindings sections.
 *
 * Kept out of `SettingsPanel.ts` so that panel only has to place two
 * sections. The values live in `save.settings`; what they do lives in
 * `core/Access.ts`. Every change goes through `commit`, which saves and emits
 * `settings:changed`, which re-applies them.
 */
import { save } from '../core/Save';
import { events } from '../core/Events';
import { MOUSE_ACTIONS, REBINDABLE, RESERVED_KEYS, rebind, keyFor, TEXT_SCALE_MIN, TEXT_SCALE_MAX } from '../core/Access';
import { Button, Slider, Toggle, add, clear, div, span, section } from './Widgets';
import { tr } from '../core/I18n';

/** "KeyW" -> "W", "Digit1" -> "1", "ArrowUp" -> "Up", "Mouse2" -> "Right mouse". */
export function keyLabel(code: string): string {
  const mouse = MOUSE_NAMES()[code];
  if (mouse) return mouse[0];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return tr('Num {0}', code.slice(6));
  const named: Record<string, string> = {
    ArrowUp: tr('Up'),
    ArrowDown: tr('Down'),
    ArrowLeft: tr('Left'),
    ArrowRight: tr('Right'),
    Space: tr('Space'),
    Shift: tr('Shift'),
    Tab: tr('Tab'),
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    ControlLeft: tr('Left Ctrl'),
    ControlRight: tr('Right Ctrl'),
    CapsLock: tr('Caps Lock'),
    Enter: tr('Enter'),
    Backspace: tr('Backspace'),
  };
  return named[code] ?? code;
}

/** Each mouse button's name in a list, and on a keycap. */
const MOUSE_NAMES = (): Record<string, [string, string]> => ({
  // i18n: the keycaps after each name are three letters or fewer.
  Mouse0: [tr('Left mouse'), tr('LMB')],
  Mouse1: [tr('Middle mouse'), tr('MMB')],
  Mouse2: [tr('Right mouse'), tr('RMB')],
  Mouse3: [tr('Mouse back'), tr('M4')],
  Mouse4: [tr('Mouse forward'), tr('M5')],
});

/** A key's name on a small keycap: like `keyLabel`, with short mouse buttons. */
export function keyCap(code: string): string {
  return MOUSE_NAMES()[code]?.[1] ?? keyLabel(code);
}

/** Text size and colour-blind colours. Reduced motion is a toggle on the Gameplay tab already. */
export function accessibilitySection(commit: () => void): HTMLDivElement {
  const s = save.settings;
  const sec = section(tr('Accessibility'), 'eye');
  sec.body.appendChild(
    new Slider(
      tr('Text size'),
      s.textScale ?? 1,
      TEXT_SCALE_MIN,
      TEXT_SCALE_MAX,
      0.05,
      (v) => {
        s.textScale = v;
        commit();
      },
      (v) => `${Math.round(v * 100)}%`,
      tr('Bigger or smaller words in every menu, the HUD and the damage numbers'),
    ).root,
  );
  sec.body.appendChild(
    new Toggle(
      tr('Colour-blind item colours'),
      !!s.colorBlindRarity,
      (v) => {
        s.colorBlindRarity = v;
        commit();
      },
      tr('Rarity colours anyone can tell apart'),
    ).root,
  );
  return sec.root;
}

/**
 * Every rebindable action with its current key and a Change button. Pressing
 * Change listens for the next key or mouse button; Escape cancels. Taking a
 * key another action uses swaps the two, so nothing is ever left without a
 * key. The left button stays with moving or attacking, so a left click on any
 * other action's row is a click away.
 */
export function keybindSection(commit: () => void): HTMLDivElement {
  const sec = section(tr('Key bindings'), 'info');
  const list = div('keybinds');
  sec.body.appendChild(list);

  let listening: { code: string; btn: Button } | null = null;
  const stopListening = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onButton, true);
    listening = null;
    // Menu keys (FieldNav) stand aside while a key is chosen.
    delete document.documentElement.dataset.keyCapture;
  };
  const choose = (code: string, physical: string) => {
    if (RESERVED_KEYS.has(physical)) {
      events.emit('toast', { text: tr('{0} cannot be rebound.', keyLabel(physical)), kind: 'bad' });
      return;
    }
    const was = save.settings.keybinds;
    const next = rebind(was, code, physical);
    if (keyFor(code, next) !== physical) {
      events.emit('toast', { text: tr('The left mouse button only moves or attacks, so the menus can always be clicked.'), kind: 'bad' });
      return;
    }
    save.settings.keybinds = next;
    commit();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!listening) return;
    // Nothing else may see this key: it is a choice, not a command.
    e.preventDefault();
    e.stopImmediatePropagation();
    const { code } = listening;
    stopListening();
    if (e.code !== 'Escape') choose(code, e.code);
    render();
  };
  const onButton = (e: PointerEvent) => {
    if (!listening || e.button < 0 || e.button > 4) return;
    const { code } = listening;
    // A left click on a key's action is a click away: it cancels.
    if (e.button === 0 && !MOUSE_ACTIONS.has(code)) {
      stopListening();
      render();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    // The click that follows is part of the choice, not a press of what is under it.
    window.addEventListener('click', (c) => { c.preventDefault(); c.stopImmediatePropagation(); }, { capture: true, once: true });
    stopListening();
    choose(code, `Mouse${e.button}`);
    render();
  };

  const render = () => {
    clear(list);
    const binds = save.settings.keybinds;
    for (const a of REBINDABLE) {
      const row = div('statline');
      const l = div('statline-label');
      l.appendChild(span('', a.label));
      const moved = keyFor(a.code, binds) !== a.code;
      const v = span('statline-value', keyLabel(keyFor(a.code, binds)) + (moved ? ' *' : ''));
      const btn = new Button({
        label: tr('Change'),
        small: true,
        variant: 'ghost',
        onClick: () => {
          if (listening) stopListening();
          listening = { code: a.code, btn };
          v.textContent = tr('Press a key or mouse button...');
          document.documentElement.dataset.keyCapture = '1';
          window.addEventListener('keydown', onKey, true);
          window.addEventListener('pointerdown', onButton, true);
        },
      });
      add(row, l, div('statline-dots'), v, btn.root);
      list.appendChild(row);
    }
    const fixed = div('statline');
    const fl = div('statline-label');
    fl.appendChild(span('', tr('Pause')));
    add(fixed, fl, div('statline-dots'), span('statline-value', tr('Esc')));
    list.appendChild(fixed);
  };
  render();

  sec.body.appendChild(
    new Button({
      label: tr('Reset keys'),
      small: true,
      variant: 'ghost',
      onClick: () => {
        if (listening) stopListening();
        save.settings.keybinds = {};
        commit();
        render();
      },
    }).root,
  );
  return sec.root;
}
