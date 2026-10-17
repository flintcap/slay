# Stream: ui (Wave 4: every screen and the HUD)

Status: not started

Goal: one polished, consistent look across every panel and the HUD, clear
and easy to use, with no DOM cost in per-frame code. Our own style: do not
copy another game 1:1. CC0 art only, every file in `ASSETS.md`.

Checkers: `node tools/run-checks.mjs --only=<name>` for what you touch.
Screenshots only when a change can only be judged by eye, batched, one
render per milestone at most, inside `flock /tmp/slay-browser.lock timeout`.
Run `node tools/get-chrome.mjs` once before the first browser check.

## Milestones

- [ ] 1. Design tokens: colours, spacing, fonts, radii and shadows as CSS
  variables, and every panel moved onto them.
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

1. Do Setup in PROTOCOL.md. Set `Status: in progress`.
2. Milestone 1: list every panel in `src/ui/*` and the colours and sizes
   they use today, then define the tokens.

## Notes for resume

## For the owner to test

(Add one line per item: what to try and what should happen.)

## Handover

(Written when every milestone is ticked.)
