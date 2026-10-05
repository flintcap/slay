# Stream: quality (bugs, speed, safety, access)

Status: in progress

## Milestones

- [ ] Bug sweep: run every checker including the browser ones, fix every failure, and add checks for what is missing.
- [ ] Performance: measure draw calls, triangles, lights, garbage and AI cost on the busiest floors; set budgets and bring the worst offenders under them.
- [x] Saves: versioned save format, safe migrations, a backup copy, and recovery from a corrupt save without losing the character. (commit: "Make saves survive damage and keep one error from stopping the game")
- [ ] Crash resistance: no single error stops the game; errors are caught, logged and recovered from. (code done and pushed; `check-crash` passed its first 4 of 9 cases before the run hit its 30-minute limit on the overloaded machine; the last 5 are unverified)
- [ ] Accessibility: text size, colour-blind-safe rarity colours, reduced motion and screen shake toggles, key rebinding, all through the settings menu. (code done and pushed; `check-access` passes; never looked at in a real browser yet)
- [ ] Sweep: a long headless soak test that plays many floors and reports any error, leak or slowdown.

## Next up

Paused mid-way. In this order:

1. Finish verifying crash resistance: `SLAY_PORT=4309 timeout 3600 node tools/check-crash.mjs`
   (run it in the background; with ten agents on four cores boot alone took
   3 minutes and entering a dungeon about 8). Cases 1-4 passed. If case 5+
   fails, the code is in `src/core/Engine.ts` (`recover`, `goTo`, `enterScene`).
   Then tick milestone 4.
2. Look at the settings menu once in a browser (open Settings from the pause
   menu): text size and colour-blind colours sit at the bottom of the Gameplay
   tab, rebindable keys at the top of the Controls tab; both come from
   `src/ui/AccessibilitySettings.ts` (menus owns the rest of the panel and
   already had a Reduced motion toggle, which shares the same setting). Check a rebind works
   (change Inventory to P, press P in town). Then tick milestone 5.
3. Bug sweep (milestone 1): static checkers all ran; browser checkers have not.
   Run them in batches of 5-6 in the background, one at a time on port 4309:
   `SLAY_PORT=4309 node tools/run-checks.mjs --only=arrow,attack,body,buff,clips`
   and so on (list: `grep -l -E "chromium|bootGame" tools/check-*.mjs`).
   Read `.checks/<name>.txt` for each. Fix failures in quality's own files;
   anything in another stream's area goes to that stream's progress file.
4. Performance (milestone 2): `SLAY_PORT=4309 node tools/check-perf.mjs --alloc`
   has never run. Budgets at the top of the file are first guesses; set them
   from the first real measurement, then fix the worst offenders.
5. Soak (milestone 6): `SLAY_PORT=4309 node tools/check-soak.mjs --runs=4 --floors=3`
   has never run either. Expect to fix the harness on its first run.

## Notes for resume

**Requests left at the second pause (owning streams are finished, so these are yours):**
- From story: unique items already in saves keep their old Diablo II names. Add a save migration in `Save.ts` that renames them from `src/data/story/uniqueText.ts`.
- From world: in big fights monster nameplates cover most of the screen (hud is finished). Thin them: fade or hide plates for ordinary monsters beyond a count or distance, keep elites, rares and bosses.
- From world: the town is at 1,096 draw calls against a budget of 900, and the nine residents from `src/art/NpcModels.ts` are most of it (models is finished). Merge each resident's meshes per material.

**From depth (finished, 9ca7c18):**
- `debug.makeCharacter` can leave the main hand empty (new characters start with no gear and the random items may hold no usable weapon). Make it always equip a class-appropriate weapon so every browser checker starts armed.
- In camp shots the hero sometimes vanishes for a few frames right after a teleport, then appears. Probably test timing, possibly a mesh hidden after a position jump (frustum or bounds not updated). Worth one look.
- The full live depth test (`tools/smoke-depth.mjs`) takes about 35 minutes; `tools/check-town.mjs` guards camp station placement.
- Monsters killed more than 38 m from the hero never finished dying until depth fixed it in DungeonScene; a soak test should catch this class of bug.

### Tools quality added
- `tools/run-checks.mjs`: runs every checker (static by default, `--browser`,
  `--all`, `--only=a,b`, `--skip=`), output per checker in `.checks/`. Kills a
  checker's whole process group on timeout so no orphan holds the port.
- `vite.config.ts` honours `SLAY_NO_HMR=1` (no HMR, no watcher). Without it a
  source edit mid-run reloads the page under a dev-server checker and it dies
  with "Execution context was destroyed". run-checks and `tools/lib/game.mjs`
  set it.
- `tools/lib/game.mjs`: `bootGame()` / `frames()` harness for new browser checkers.
- `tools/lib/color.mjs`: colour-vision simulation and ΔE; `tools/lib/try-palettes.mjs`
  searches for palettes.
- Static: `check-save` (18 save-damage cases + 400-save fuzz), `check-access`
  (palette distinctness for 3 colour-vision types, 7500 random rebinds, wiring),
  `check-rules` (no Math.random outside RNG, no asset files, no console.log).
- Browser: `check-crash` (broken monster, broken handler, timer/promise errors,
  broken scene update, scene that fails to build), `check-perf` (budgets),
  `check-soak` (long session, leaks, slowdown).

### Known failing static checkers (not quality's area; requests filed)
- `check-openness`: cathedral 59.6%, halls 29.6%, rooms 25.1% wide-open (limit 25%).
  Request in depth.md.
- `check-unfinished`: statuses `dreadaura`, `bossEnrage` never applied. Combat
  already has this on its list (boss milestone).

### How things work now
- Save (`src/core/Save.ts`): format version 2 inside the save (key name still
  `slay.account.v1` so old saves load). Every load passes `migrateAccount`,
  which repairs field by field and moves only unrepairable things into
  `slay.account.quarantine`. A primary that will not parse is copied to
  `slay.account.corrupt` and the backup `slay.account.backup` is loaded. The
  backup is refreshed on a clean load and at most every 2 minutes on scene
  change. A second tab writing the save makes this tab read-only (toast).
  `save.loadReport` says what happened; main.ts toasts it.
- Fixed: after any reload the live hero and their roster entry were separate
  copies, so picking the same hero from the roster brought back the boot-time
  copy and lost the progress in between.
- Fixed: importing anything that was valid JSON but not a save wiped the account.
- Engine (`src/core/Engine.ts`): update, render and input are each guarded;
  errors are recorded once in `engine.errors` (then counted). 30 failing frames
  in a row moves the player to town (title if town fails). `goTo` always lifts
  the fade and clears `transitioning`, and falls back to town if a scene's
  `enter` throws. `reportError(where, err)` is exported for per-entity guards
  (DungeonScene uses it around each monster and the boss). Window errors,
  unhandled rejections and WebGL context loss are handled.
- Accessibility (`src/core/Access.ts`, UI in `src/ui/AccessibilitySettings.ts`):
  settings `textScale`, `colorBlindRarity`, `reduceMotion`, `keybinds` in
  `GameSettings`. Key rebinding is a permutation applied in `Input` and the
  UI hotkeys via `remapKey(e.code)`; callers still ask for default codes.
- Fixed: CameraRig.applySettings was never called, so the camera distance and
  screen shake sliders did nothing. The rig now applies settings itself and
  re-applies on `settings:changed`, and scenes now dispose their rig (every
  visit used to leak one, still subscribed to the event bus).
- `events.listenerCounts()` exists for leak hunting.
- `run-checks.mjs` counts a checker as "browser" if its source mentions
  `chromium` or `bootGame`. Before that fix the static run started check-perf
  by mistake.
- The first browser checker run (check-arrow) died with "Execution context
  was destroyed" because a source edit reloaded the dev server page; that is
  what `SLAY_NO_HMR` fixes. It has not been re-run.
- `textScale`, `colorBlindRarity`, `keybinds` are optional in `GameSettings`
  (other streams' tools build settings literals). The save sanitiser keeps any
  boolean setting another stream adds to `DEFAULT_SETTINGS`.
