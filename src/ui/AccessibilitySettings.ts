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
import { REBINDABLE, RESERVED_KEYS, rebind, keyFor, TEXT_SCALE_MIN, TEXT_SCALE_MAX } from '../core/Access';
import { Button, Slider, Toggle, add, clear, div, span, section } from './Widgets';

/** "KeyW" -> "W", "Digit1" -> "1", "ArrowUp" -> "Up". */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return code.slice(5);
  const named: Record<string, string> = {
    Space: 'Space',
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
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    CapsLock: 'Caps Lock',
    Enter: 'Enter',
    Backspace: 'Backspace',
  };
  return named[code] ?? code;
}

/** Text size and colour-blind colours. Reduced motion is a toggle on the Gameplay tab already. */
export function accessibilitySection(commit: () => void): HTMLDivElement {
  const s = save.settings;
  const sec = section('Accessibility', 'eye');
  sec.body.appendChild(
    new Slider(
      'Text size',
      s.textScale ?? 1,
      TEXT_SCALE_MIN,
      TEXT_SCALE_MAX,
      0.05,
      (v) => {
        s.textScale = v;
        commit();
      },
      (v) => `${Math.round(v * 100)}%`,
    ).root,
  );
  sec.body.appendChild(
    new Toggle(
      'Colour-blind item colours',
      !!s.colorBlindRarity,
      (v) => {
        s.colorBlindRarity = v;
        commit();
      },
      'Rarity colours anyone can tell apart',
    ).root,
  );
  return sec.root;
}

/**
 * Every rebindable action with its current key and a Change button. Pressing
 * Change listens for the next key; Escape cancels. Taking a key another action
 * uses swaps the two, so nothing is ever left without a key.
 */
export function keybindSection(commit: () => void): HTMLDivElement {
  const sec = section('Key bindings', 'info');
  const list = div('keybinds');
  sec.body.appendChild(list);

  let listening: { code: string; btn: Button } | null = null;
  const stopListening = () => {
    window.removeEventListener('keydown', onKey, true);
    listening = null;
  };
  const onKey = (e: KeyboardEvent) => {
    if (!listening) return;
    // Nothing else may see this key: it is a choice, not a command.
    e.preventDefault();
    e.stopImmediatePropagation();
    const { code } = listening;
    stopListening();
    if (e.code === 'Escape') {
      render();
      return;
    }
    if (RESERVED_KEYS.has(e.code)) {
      events.emit('toast', { text: `${keyLabel(e.code)} cannot be rebound.`, kind: 'bad' });
      render();
      return;
    }
    save.settings.keybinds = rebind(save.settings.keybinds, code, e.code);
    commit();
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
        label: 'Change',
        small: true,
        variant: 'ghost',
        onClick: () => {
          if (listening) stopListening();
          listening = { code: a.code, btn };
          v.textContent = 'Press a key...';
          window.addEventListener('keydown', onKey, true);
        },
      });
      add(row, l, div('statline-dots'), v, btn.root);
      list.appendChild(row);
    }
    const fixed = div('statline');
    const fl = div('statline-label');
    fl.appendChild(span('', 'Move / attack / pause'));
    add(fixed, fl, div('statline-dots'), span('statline-value', 'Left click / right click / Esc'));
    list.appendChild(fixed);
  };
  render();

  sec.body.appendChild(
    new Button({
      label: 'Reset keys',
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
