# Stream: menus (front end and flow)

Status: paused

## Milestones

- [x] Title screen: animated 3D backdrop, logo treatment, menu with hover animation, continue and new game. (Rebuild the front end: title, character select, transitions, pause, settings, death, banners, hints)
- [x] Character select and create: class showcase with a rotating live model, stats and blurb, starting skill preview, name entry with validation. (same commit)
- [x] Transitions: fades between scenes, a depth and biome title card on entering a floor, loading tips. (same commit)
- [x] Pause menu and settings: graphics quality, audio sliders, keybind list, gameplay toggles, all saved. (same commit)
- [x] Death screen: run summary (depth, kills, gold, time, what killed you) and a clean restart flow. (same commit)
- [x] Banners and onboarding: level-up, new depth, boss intro, first-run hints that teach the controls once. (same commit)
- [ ] Sweep: matches the hud design tokens, full keyboard navigation, Escape always does the expected thing.

## Next up

1. FIRST, before anything else: look at the 3D menu scenes, which have never been seen running.
   Milestones 1-6 were checked with typecheck, `npm run build`, `node tools/check-menus.mjs` and the
   DOM-only previews from `node tools/shot-menus.mjs` (all clean, all looked right), but the full
   WebGL render timed out under machine load before reaching the title. Do one of:
   - quick: `npx vite --port 4302` then open `/tools/menus-preview.html?screen=3d:title` (also
     `3d:charSelect`, `3d:death`) in Playwright; this runs the real TitleScene / CharSelectScene /
     DeathScene with the full UI but skips the boot texture bake. Watch for page errors.
   - full: `npm run build && SLAY_PORT=4302 node tools/screenshot.mjs --out=shots/menus3d
     --shots=title,charSelect,death,pause --bootTimeout=3600000`.
   Things to judge: title gate composition (gate should sit right of centre, menu left), rift shader
   visible in the arch, mist not washing the frame out; char select hero dressed in its field kit
   and centred between the columns, drag-to-turn works; death grave shows the engraved name, the
   planted weapon and the rising wisp. Fix anything that throws before continuing.
2. Then milestone 7, the sweep:
   - Rebase, then check whether the hud stream's tokens in `src/ui/styles.css` changed (`--gold`,
     `--ink-*`, `--font-display`, `--radius*`, `--shadow-*`, `--hairline`). Every class in
     `src/ui/menus.css` reads those tokens; swap any hard-coded colours there for new tokens.
   - `node tools/shot-menus.mjs --out=shots/menus` and again with `--width=1280 --height=720`;
     look at every PNG for overlap.
   - Keyboard pass: title (arrows/Enter), char select (arrows, left/right difficulty, Tab mode,
     N name, Enter), pause (arrows/Enter, Esc), settings (Q/E tabs, Esc back to pause), death
     (arrows/Enter after the 2.6 s lock), memorial (Esc back). Modals: Esc = Cancel.
   - Tell the hud stream (do not edit styles.css) that the old selectors `.title-*`, `.cs-*`
     (except `.cs-memorial-list`, `.fallen-*`), `.death-*`, `.pause-*`, `.settings-cols` are unused.

## Notes for resume

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
