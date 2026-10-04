/**
 * Entry point for `tools/check-access.mjs`. Exercises the pure half of
 * `src/core/Access.ts` under Node: key rebinding stays a permutation through
 * any sequence of changes, and the settings sanitiser keeps every new field
 * in range.
 */
import {
  REBINDABLE,
  RESERVED_KEYS,
  rebind,
  bindsAreValid,
  keyFor,
  remapKey,
  applyAccessibility,
  DEFAULT_RARITY_COLOR,
  COLORBLIND_RARITY_COLOR,
  effectiveShake,
} from '../src/core/Access';
import { migrateAccount, DEFAULT_SETTINGS } from '../src/core/Save';
import { RARITY_COLOR } from '../src/types';
import { Random } from '../src/core/RNG';

const problems: string[] = [];

// --- rebinding -------------------------------------------------------------
const rng = new Random(0xacce55);
const pool = [
  ...REBINDABLE.map((a) => a.code),
  'KeyZ', 'KeyX', 'KeyV', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyP', 'KeyR', 'KeyU', 'KeyY', 'KeyO', 'KeyN',
  'Digit7', 'Digit8', 'Digit9', 'Digit0', 'ArrowUp', 'Numpad1', 'Semicolon', 'Escape', 'ShiftLeft', 'Tab',
];
let steps = 0;
for (let run = 0; run < 300 && problems.length < 10; run++) {
  let binds: Record<string, string> = {};
  for (let i = 0; i < 25; i++) {
    const action = rng.pick(REBINDABLE).code;
    const key = rng.pick(pool);
    binds = rebind(binds, action, key);
    steps++;
    if (!bindsAreValid(binds)) {
      problems.push(`run ${run} step ${i}: ${action} -> ${key} left an invalid map ${JSON.stringify(binds)}`);
      break;
    }
    if (!RESERVED_KEYS.has(key) && keyFor(action, binds) !== key) {
      problems.push(`run ${run}: ${action} -> ${key} did not take (now ${keyFor(action, binds)})`);
      break;
    }
    // Every action has exactly one key, and that key produces it.
    applyAccessibility({ ...DEFAULT_SETTINGS, keybinds: binds });
    const used = new Map<string, string>();
    for (const a of REBINDABLE) {
      const k = keyFor(a.code, binds);
      if (RESERVED_KEYS.has(k)) problems.push(`run ${run}: ${a.label} landed on reserved ${k}`);
      if (used.has(k)) problems.push(`run ${run}: ${a.label} and ${used.get(k)} share ${k}`);
      used.set(k, a.label);
      if (remapKey(k) !== a.code) problems.push(`run ${run}: pressing ${k} gives ${remapKey(k)}, not ${a.label}`);
    }
    if (problems.length) break;
  }
}
applyAccessibility({ ...DEFAULT_SETTINGS });
if (remapKey('KeyW') !== 'KeyW') problems.push('defaults do not restore identity keys');

// --- palette swap ------------------------------------------------------------
applyAccessibility({ ...DEFAULT_SETTINGS, colorBlindRarity: true });
if (RARITY_COLOR.magic !== COLORBLIND_RARITY_COLOR.magic) problems.push('colour-blind palette did not reach RARITY_COLOR');
applyAccessibility({ ...DEFAULT_SETTINGS, colorBlindRarity: false });
if (RARITY_COLOR.magic !== DEFAULT_RARITY_COLOR.magic) problems.push('default palette did not come back');

// --- reduced motion ------------------------------------------------------------
if (effectiveShake({ ...DEFAULT_SETTINGS, reduceMotion: true, screenShake: 2 }) !== 0) problems.push('reduced motion still shakes');
if (effectiveShake({ ...DEFAULT_SETTINGS, screenShake: 0.5 }) !== 0.5) problems.push('shake slider ignored');

// --- sanitising --------------------------------------------------------------
const bad = migrateAccount({
  stash: [],
  settings: { textScale: 9, colorBlindRarity: 'yes', reduceMotion: 1, keybinds: { KeyW: 'KeyS' } },
}).data.settings;
if ((bad.textScale ?? 1) > 1.5) problems.push(`text scale not clamped: ${bad.textScale}`);
if (bad.colorBlindRarity !== false || bad.reduceMotion !== false) problems.push('non-boolean toggles kept');
if (Object.keys(bad.keybinds ?? {}).length !== 0) problems.push('a key map with two actions on one key was kept');
const good = migrateAccount({ stash: [], settings: { keybinds: { KeyW: 'KeyZ', KeyZ: 'KeyW' }, textScale: 1.2 } }).data.settings;
if (good.keybinds?.KeyW !== 'KeyZ' || good.textScale !== 1.2) problems.push('a valid key map or text size was lost on load');

console.log(
  JSON.stringify({
    steps,
    problems,
    palettes: { default: DEFAULT_RARITY_COLOR, colorblind: COLORBLIND_RARITY_COLOR },
    rebindable: REBINDABLE,
  }),
);
