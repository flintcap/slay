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
- [x] 2. Frames and feel: painted frames and buttons, open and close
  animations, one hover and click sound set used everywhere. (`ui: painted
  leather and metal skin, one interface sound set`)
- [x] 3. HUD: liquid life and mana orbs, buff timers, minimap polish,
  cleaner damage numbers. (`ui: damage numbers stop printing over each
  other; buff timers warn`) Orbs, buff sweep and minimap were already in
  place and checked in the lab; added number placement, ending colour.
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

1. Milestone 4 (items): side-by-side compare already exists (Tooltip.ts,
   "CURRENTLY EQUIPPED" card next to the hovered item, "VERSUS EQUIPPED"
   rows) and stash tabs exist (StashPanel). Still to do: upgrade arrows on
   item slots in inventory, stash and vendor grids (green up arrow when the
   item beats what is worn in its slot, using the same compare numbers the
   tooltip uses), and a clearer loot filter panel (LootFilterPanel.ts).
   Check with `uilab --shots=inventory,vendor,stash`.

## Notes for resume

- Tokens live in `src/ui/styles.css` `:root`. Tints are written
  `rgb(var(--gold-rgb) / 0.3)`; channel tokens: shade, light, gold, gold-hi,
  line, glow, hi, good, bad, ink-3, ink-4. Radius: `--radius-sm/-/-lg/-pill`.
  Motion: `--dur-1..5` (110/170/260/420/700 ms).
- `node tools/check-uitokens.mjs` (static, in run-checks) fails on raw
  palette rgba, `#000`, spacing steps, radius steps, transition times in
  80-950 ms, and any `var(--x)` with no definition and no fallback.
- Sounds: every UI sound goes through `uiSfx(id)` in `src/ui/Sfx.ts`.
  `installUiSfx()` (called in mountUI) plays hover/click/tab/error for any
  button, tab or menu row; the plain click is dropped when the click's own
  handler made a sound. `Panel` plays ui.open/ui.close itself unless
  `quiet: true` (title, charSelect, death). The old document hook in
  `src/audio/SampleEngine.ts` (installUiSounds, ui:open/ui:close) is gone.
- Request for the TownScene owner: `src/scenes/TownScene.ts` plays
  `audio.play('ui.open')` right before it opens a station panel, so the
  open sound plays twice (it did before too, via the old ui:open hook).
  Deleting that one line fixes it.
- Painted skin: `src/ui/Skin.ts` loads `textures/ui/leather.webp` and
  `scratched-metal.webp` as blob URLs into `--tex-leather/--tex-metal`;
  `--skin-leather/--skin-metal` are background layers blended soft-light
  over panel, modal, tooltip and button plates. Low-contrast grey maps on
  purpose (40-60% / 36-64% grey).
- uilab has a `minimap` scenario now (explored crypt floor on the corner
  map, no panel), and `--probe=<file.js>` to print a page expression.
- CombatText.ts `place()`: the newest number keeps its spot; older numbers
  it would cover ease up just clear of it (estimated boxes, no measuring).
- Cheap UI renders: `SLAY_PORT=4343 flock /tmp/slay-browser.lock timeout 600
  node tools/uilab.mjs --out=shots/ui/x --shots=hud,character --width=1280
  --height=720` (seconds per shot, no WebGL scene).

## For the owner to test

(Add one line per item: what to try and what should happen.)

- Hover and click buttons, tabs and menu rows in every panel: one soft tick
  on hover, one click on press, never two sounds stacked on one press.
- Open and close panels with I, C, T, M and Esc: each plays the open or
  close sound once. The title, character select and death screens stay
  silent when they appear.
- Look at panels and buttons on a real screen: a faint pebbled leather grain
  on panel plates, faint scratches on buttons. Should feel tactile, never
  noisy.
- In a big fight with many hits (a pack around you), damage numbers should
  stack into neat rising columns instead of printing on top of each other,
  without jitter.
- Buffs in their last 3 seconds: the timer under the chip turns amber (green
  for a debuff that is about to end) while the chip blinks.

## Handover

(Written when every milestone is ticked.)
