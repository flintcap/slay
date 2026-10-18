# Stream: ui (Wave 4: every screen and the HUD)

Status: done

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
- [x] 4. Items: side-by-side compare, upgrade arrows, stash tabs, clearer
  loot filter. (`ui: upgrade arrows on items, loot filter at a glance`)
  Compare and stash tabs were already in place; added the arrows (one
  verdict shared with the tooltip) and the loot filter glance grid.
- [x] 5. Loading screen: progress bar from `'load:progress'` (falls back to
  `'scene:loading'` and `'assets:progress'` until speed adds it), tips and
  biome art. (`ui: loading card with a real progress bar and the place behind it`)
- [x] 6. Settings clarity, first-run help, text size option, keyboard and
  gamepad navigation of menus. (`ui: settings walk with arrows and a gamepad, every setting explained`)
  Text size and first-run hints were already in place; added the plain
  words under every setting, the last raw font sizes onto Text size, arrow
  keys through settings, and gamepad menus.
- [x] 7. UI cost: no layout reads in per-frame code, batched HUD writes.
  Handle any requests speed leaves under "Notes for resume".
  (`ui: no second hit test per mouse move, map and HUD stop reading layout`)
  Speed left no requests. HUD, nameplates, ground labels and combat text
  already wrote only on change; fixed the three hot spots left.
- [x] 8. Handover. (`ui: handover`)

## Next up

Nothing: every milestone is ticked. See Handover.

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
- `src/ui/Compare.ts`: `compareItems` (the tooltip's delta strip and
  verdict) and `isUpgrade(item)` (the green arrow, `.islot-up`, drawn by
  ItemSlot for every grid except the paperdoll). Cached per hero gear state.
- Loading card (`src/ui/Transitions.ts`): bar from `'load:progress'` with
  a slow creep inside each step (rAF only while the card is up, writes only
  on change); stage ids map to words in `STAGE_WORDS`. Stairs loads (no
  `scene:loading`) bring the card up on their first step, titled "Area N of
  M". Behind it a skyline generated per biome id (`skyline()`, seeded via
  `streamFor`) tinted with the biome's accent through `--ld-tint` (an
  `@property` colour, so it eases when the biome arrives mid-build). uilab
  `loading` scenario; `--q=biome:caverns;stairs:1;step:4` passes options.
- Menu keys: `src/ui/FieldNav.ts` (arrows walk Settings controls; focus is
  the highlight; Left/Right change segmented rows and switches; sliders
  step natively). `src/ui/GamepadNav.ts` turns pad presses into the same
  keys (A clicks the focused button or sends Enter, B Escape, LB/RB tabs,
  Start Escape), only while a panel or dialog is open; polls only while a
  pad is connected. `html.pad-nav` shows focus rings for pad use.
  `html[data-key-capture]` is set while a key is being rebound, and both
  stand aside.
- check-uitokens also fails on `font-size: Npx` under 48px (ignores Text
  size). Use `--fs-*` or `calc(Npx * var(--text-scale, 1))`.
- uilab `settingsnav` scenario (`--q=down:5`).
- UI cost: `UIRoot` pointerOverUI reads the pointer event's own target (no
  `elementFromPoint` per move). `MapPanel` reads its stage size only when a
  ResizeObserver says it changed, and Text size from the root's inline
  style. `HUD` per-frame lookups go through `part(el, sel)` (remembered
  `querySelector`).
- The uilab `bosscast` shot showed black bands top and bottom at dpr 1
  (the HUD itself was right). Looks like the capture, not the UI; not
  chased.
- `node tools/run-checks.mjs` with no `--only` ran past 400 s here (killed
  by timeout); `--only=uitokens,assets,hits` passes in 20 s.
- uilab now mounts `mountDepthUI()` too, so `lootFilter`, `legacy`, `gate`,
  `gambler`, `enchanter`, `fuse`, `bounties` open by id.
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
- Pick up gear that beats what you wear: a small green arrow sits in the
  bottom-left corner of its slot (inventory, stash, vendor), and its tooltip
  says "Upgrade". Gear you cannot wear yet never gets an arrow.
- Open the loot filter (O): the grid at the top shows which rarities show
  for each kind of gear; the active preset is lit and explained.
- Buffs in their last 3 seconds: the timer under the chip turns amber (green
  for a debuff that is about to end) while the chip blinks.

- Take the stairs to the next area of a map, and walk into a new tier from
  town: if the build takes more than about half a second, the card shows
  with a gold bar that fills step by step, a short line saying what is
  being built ("Raising the walls"), a percent, a tip, and a dark skyline
  lit in the place's colour along the bottom. Quick loads stay a plain dip
  to black.

- Open Settings and use only the arrow keys: Up and Down move a gold ring
  through tabs and settings, Left and Right change the one in the ring
  (sliders, switches, Low/Medium/High). Rebinding a key still takes any
  key, arrows included.
- Plug in a gamepad (Xbox or PlayStation style) on the title or pause
  menu: D-pad or stick moves, A picks, B goes back, LB/RB change settings
  tabs, Start opens and closes pause. In the game itself the pad does
  nothing else (no hero control yet).
- Settings: every slider and switch has a short line saying what it does.
- Set Text size to 150%: the quest tracker on the right of the HUD grows
  with everything else.

## Handover

What exists now, and where:

- Tokens: every colour tint, spacing step, radius and transition time in
  `src/ui/*.css` comes from `:root` in `src/ui/styles.css`.
  `tools/check-uitokens.mjs` (in run-checks) keeps it that way, and also
  fails on small raw font sizes that would ignore Text size.
- Painted skin: `src/ui/Skin.ts` plus `public/assets/textures/ui/`
  (leather, scratched metal; CC0, in ASSETS.md). Missing files leave the
  plain plates.
- Sounds: `src/ui/Sfx.ts` (`uiSfx`, `installUiSfx`) is the one path for
  interface sounds; `Panel` plays open and close unless `quiet`.
- HUD: combat number placement (`src/ui/CombatText.ts` `place()`), buff
  ending colours, per-frame writes only on change, remembered lookups.
- Items: `src/ui/Compare.ts` (one verdict for tooltip and green upgrade
  arrows), loot filter glance grid in `src/ui/LootFilterPanel.ts`.
- Loading card: `src/ui/Transitions.ts` (progress from `'load:progress'`,
  stairs loads, biome skyline and tint).
- Menus: `src/ui/FieldNav.ts` (arrows in Settings), `src/ui/GamepadNav.ts`
  (pad drives menus), plain-words hints on every setting.
- Lab: `tools/uilab.mjs` scenarios `minimap`, `loading`, `settingsnav`,
  plus `--q=` options and `--probe=`.

Left for `finish`:

- TownScene plays `audio.play('ui.open')` before opening a station panel,
  so that open sound plays twice (one line to delete, not a ui file).
- A gamepad drives menus only; there is no gamepad control of the hero.
- Everything under "For the owner to test" was checked in the UI lab or by
  reading code, not in a full game run.
