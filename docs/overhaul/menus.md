# Stream: menus (front end and flow)

Status: in progress

## Milestones

- [x] Title screen: animated 3D backdrop, logo treatment, menu with hover animation, continue and new game. (Rebuild the front end: title, character select, transitions, pause, settings, death, banners, hints)
- [x] Character select and create: class showcase with a rotating live model, stats and blurb, starting skill preview, name entry with validation. (same commit)
- [x] Transitions: fades between scenes, a depth and biome title card on entering a floor, loading tips. (same commit)
- [x] Pause menu and settings: graphics quality, audio sliders, keybind list, gameplay toggles, all saved. (same commit)
- [x] Death screen: run summary (depth, kills, gold, time, what killed you) and a clean restart flow. (same commit)
- [x] Banners and onboarding: level-up, new depth, boss intro, first-run hints that teach the controls once. (same commit)
- [ ] Sweep: matches the hud design tokens, full keyboard navigation, Escape always does the expected thing.

## Next up

Milestone 7 (sweep) is in progress. Done so far (see "Sweep log" below): text size, rebind-aware
keys, Journal in pause, O/G/J in the controls card, Enter/arrows in confirm dialogs, heroes face
the viewer, 3D title checked. Still to do:

1. Look at the 3D char select and death scenes at steady state:
   `SLAY_PORT=4302 node tools/shot-menus.mjs --out=shots/menus3d --screens=3d:charSelect,3d:death`
   (now waits for 6 s of *scene* time, HMR off; under heavy load each takes 20+ minutes). The first
   char select shot (after only ~1 s of scene time) showed the hero washed out by a white glow in
   the arch; judge whether it settles. The death scene has never been seen.
2. Then tick milestone 7, set `Status: done`.

## Notes for resume

**Sweep log (milestone 7):**
- Every raw `font-size` in `menus.css` under 41px now scales with the text-size setting
  (`calc(Npx * var(--text-scale, 1))`). Left fixed on purpose: the SVG logo (user units) and the
  three giant display headings (YOU DIED, PAUSED-size clamps over 44px).
- Tokens: no hard-coded colour in `menus.css` equals a hud token; every `var(--x)` it reads exists.
  Hud already removed the old `.title-*`, `.cs-*`, `.death-*`, `.pause-*`, `.settings-cols` rules.
- Keys: `menuKey(e)` in `MenuNav.ts` is the code a menu acts on (arrows, Enter, Tab, Esc fixed;
  everything else through `remapKey`). MenuNav, char select, settings tab paging (Q/E) and the
  onboarding hints use it. Hint keycaps and pause-menu hints show the player's bound key.
- Controls card (`SettingsPanel` CONTROLS) writes keys as codes and shows the bound key; lists
  Attack in place (Shift + Left click), Journal J, Loot filter O, Legacy G, Alt for floor items.
- Pause menu: Journal row. A panel hotkey pressed in the pause menu closes the pause menu first;
  hotkeys are ignored while Settings is open (Q/E page its tabs).
- Confirm dialogs: Enter = confirm button (unless a button is focused), Left/Right move focus,
  Esc = Cancel (all in `UIRoot.ts`, since `modal()` is hud's).
- Char select hero and the paperdoll (`PaperdollView.ts`, hud's file, small fix at the models
  stream's request) no longer spin all the way round when idle: they ease back to face the camera
  and sway. The paperdoll keeps a dragged pose for 3 s first.
- `tools/shot-menus.mjs`: `3d:` screens get SwiftShader flags, wait on scene time, report fps;
  the server runs with `SLAY_NO_HMR` in its own process group (it used to leave vite running).
  New preview screen `controlsCard` (the reference card with Q rebound to Z).
- 3D title seen: gate right of centre, rift visible, mist fine.


**From models (finished, 5bebe1d):** in the `check-paperdoll` shot the figure seemed to face away from the camera. Check the paperdoll and character select hero face the viewer.

**From hud (finished, 5a2ec0f):** font sizes in `menus.css` (33 of them) still ignore the text-size setting. Use the `--fs-*` tokens or `calc(Npx * var(--text-scale, 1))`.

**Requests from other streams (added at pause):**
- From depth: list O (loot filter) and G (Legacy) in the controls help.
- From story: J now opens the journal; add a Journal entry to the pause menu.
- From quality: keep the text size, colour-blind and key rebinding sections it added to the settings panel; 49 font sizes in hud and menus ignore text size (see hud.md).

- All menu styles live in `src/ui/menus.css` (linked from `index.html` after `styles.css`). Prefixes:
  `mn-` shared list, `ttl-` title, `csx-` char select, `ld-` loading card, `bn-` banners, `pz-` pause,
  `stg-` settings, `dth-` death, `ob-` hints, `mem-` memorial summary.
- `src/ui/MenuNav.ts` is the shared keyboard/mouse menu list (title, pause, death). It listens on
  window in the capture phase only while `setActive(true)`; it yields to open modals and to the
  Settings / memorial panels opened on top.
- Escape rules live in `UIRoot.ts`: modal -> Cancel; nested overlay (settings, memorial) -> close
  just that; other overlays -> close all; char select -> back to title; title/death -> nothing;
  town/dungeon with nothing open -> pause.
- `title`, `charSelect` and `death` panels get opened twice per scene entry (scene emits ui:open and
  UIRoot opens on scene:change); their `open()` returns early if already open. Keep that guard.
- Scene <-> char select panel talk over the bus: `ui:open {panel:'class:<id>'}` shows a class in its
  field kit (`src/scenes/FieldKit.ts`), `ui:open {panel:'char:<characterId>'}` shows a roster
  character in real gear (`src/scenes/HeroModel.ts`).
- 3D menu set dressing (rift shader, mist, light shafts, guardian statue) is in
  `src/scenes/MenuStage.ts`.
- New shared bits (additive): `scene:loading` event (Engine.goTo emits it after the fade-out),
  `depth:changed` gained optional `blurb` and `biome`, `GameSettings` gained optional `hints`,
  `titleCards`, `reduceMotion`, `showFps` (defaults in `Save.ts`). DungeonScene: the first-floor
  blurb toast and the four tutorial toasts were removed (Banners and Onboarding replace them), the
  death payload carries `classId` and `weapon`, and `killedBy` comes from `runStats.killerName()`.
- `src/ui/RunStats.ts` tracks the run (kills, elites, gold, time, best find, killer) from the bus
  and also advances `Character.playtime`, which nothing advanced before.
- `tools/check-menus.mjs` (static, seconds) checks field kits, skill previews and name rules. Run it
  at every checkpoint. `tools/screenshot.mjs` gained `pause`, `settings` and `death` drivers and a
  `--bootTimeout=<ms>` flag (boot can take far over 5 minutes when other agents are rendering).
- `tools/shot-menus.mjs` + `tools/menus-preview.{html,ts}` photograph the menu screens with a
  stand-in engine in seconds (no WebGL); it fails on any page error, so it is also a smoke test.
  Screens: title, charSelect, charSelectNew, pause, settings, controls, death, banners, boss,
  hints, loading. `?screen=3d:<scene>` runs the real 3D menu scenes.
- Level-up text stays in the HUD (`HUD.levelFlourish`, hud stream). Banners only adds the gold edge
  light and rising motes around it, so the two never say the same thing twice.
- Town's own first-visit toasts (`TownScene`, world stream) were left alone; Onboarding only adds
  the move and talk hints there.
