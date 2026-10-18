# Stream: ui (Wave 4: every screen and the HUD)

Status: in progress

Goal: one polished, consistent look across every panel and the HUD, clear
and easy to use, with no DOM cost in per-frame code. Our own style: do not
copy another game 1:1. CC0 art only, every file in `ASSETS.md`.

Checkers: `node tools/run-checks.mjs --only=<name>` for what you touch.
Screenshots only when a change can only be judged by eye, batched, one
render per milestone at most, inside `flock /tmp/slay-browser.lock timeout`.
Run `node tools/get-chrome.mjs` once before the first browser check.

## Milestones

- [x] 1. Design tokens: colours, spacing, fonts, radii and shadows as CSS
  variables, and every panel moved onto them. (`ui: design tokens for tints,
  radius, spacing and motion; check-uitokens`)
- [ ] 2. Frames and feel: painted frames and buttons, open and close
  animations, one hover and click sound set used everywhere.
- [ ] 3. HUD: liquid life and mana orbs, buff timers, minimap polish,
  cleaner damage numbers.
- [ ] 4. Items: side-by-side compare, upgrade arrows, stash tabs, clearer
  loot filter.
- [ ] 5. Loading screen: progress bar from `'load:progress'` (falls back to
  `'scene:loading'` and `'assets:progress'` until speed adds it), tips and
  biome art.
- [ ] 6. Settings clarity, first-run help, text size option, keyboard and
  gamepad navigation of menus.
- [ ] 7. UI cost: no layout reads in per-frame code, batched HUD writes.
  Handle any requests speed leaves under "Notes for resume".
- [ ] 8. Handover.

## Next up

1. Milestone 2: painted frames and buttons, open and close animations for
   every `Panel` (Widgets.ts `Panel.open/close`), one hover and click sound
   set wired once in UIRoot so every button and menu row uses it.

## Notes for resume

- Tokens live in `src/ui/styles.css` `:root`. Tints are written
  `rgb(var(--gold-rgb) / 0.3)`; channel tokens: shade, light, gold, gold-hi,
  line, glow, hi, good, bad, ink-3, ink-4. Radius: `--radius-sm/-/-lg/-pill`.
  Motion: `--dur-1..5` (110/170/260/420/700 ms).
- `node tools/check-uitokens.mjs` (static, in run-checks) fails on raw
  palette rgba, `#000`, spacing steps, radius steps, transition times in
  80-950 ms, and any `var(--x)` with no definition and no fallback.
- Cheap UI renders: `SLAY_PORT=4343 flock /tmp/slay-browser.lock timeout 600
  node tools/uilab.mjs --out=shots/ui/x --shots=hud,character --width=1280
  --height=720` (seconds per shot, no WebGL scene).

## For the owner to test

(Add one line per item: what to try and what should happen.)

## Handover

(Written when every milestone is ticked.)
