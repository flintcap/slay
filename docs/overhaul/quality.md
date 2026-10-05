# Stream: quality (bugs, speed, safety, access)

Status: in progress

## Milestones

- [x] Bug sweep: run every checker including the browser ones, fix every failure, and add checks for what is missing. (commit: "Quality: Sworn Brother rises from a planted banner; browser sweep finished"; all 54 static and every browser checker pass, except check-skillcost, which cannot finish under software rendering)
- [ ] Performance: measure draw calls, triangles, lights, garbage and AI cost on the busiest floors; set budgets and bring the worst offenders under them.
- [x] Saves: versioned save format, safe migrations, a backup copy, and recovery from a corrupt save without losing the character. (commit: "Make saves survive damage and keep one error from stopping the game")
- [x] Crash resistance: no single error stops the game; errors are caught, logged and recovered from. (commit: "Quality: crash resistance proven, leftovers from finished streams"; `check-crash` 9 of 9)
- [x] Accessibility: text size, colour-blind-safe rarity colours, reduced motion and screen shake toggles, key rebinding, all through the settings menu. (commit: "Quality: flow and settings-ui pass; accessibility done"; `check-settings-ui` 14 of 14 in the real menu)
- [ ] Sweep: a long headless soak test that plays many floors and reports any error, leak or slowdown.

## Next up

1. Performance: read `.checks/perf.txt` from
   `SLAY_PORT=4309 timeout 2400 node tools/check-perf.mjs --depths=0,6,20`
   (it now also reports `textureMB`). Expected: town ~790 draw calls, textures
   ~140-220, programs ~101 (budget now 110), garbage at depth 6 ~235 KB a step
   against 200 (the one known overrun; see notes). Tick Performance with the
   numbers.
2. Soak: `SLAY_PORT=4309 timeout 3600 node tools/check-soak.mjs --runs=4 --floors=2 --frames=150`
   (60-minute limit: a soak plays many floors under software rendering).
   Fix what it reports; expect to fix the harness.
3. Then set `Status: done`.

## Notes for resume

**Session 3 (resumed after a container restart):**
- check-flow waits for the death screen's 2.6 s lock (`.is-locked`) before
  Enter; flow passes 12 of 12. settings-ui passes 14 of 14.
- check-loot, check-quality, check-buff, check-equip honour `SLAY_PORT`
  (they had fixed ports).
- `debug.inventoryIconSettle(n)` measures a cold pack filling in.
- `debug.makeCharacter` left 57 of 720 heroes unarmed (a rolled two-hander
  pushed out by the starting shield or orb). Fixed; 0 of 720.
- Found why checkers sometimes "passed" against the wrong build: a
  `vite preview` from an earlier checker kept port 4309 (vite answers
  SIGTERM with a graceful close that can hang), so the next checker's own
  server failed to bind and its readiness probe was answered by the stale
  one (check-skillicons then failed: a preview has no /src). Now: every tool
  kills its server group with SIGKILL; run-checks clears the port before
  each browser checker and fails the one that leaves a server behind (also on
  timeout and on its own SIGTERM); `bootGame` refuses a port already in use.
  Results from batch 3 before this (quality, roster) ran on the stale
  preview; both are probes and their output looked right.
- Browser batches done: every browser checker has now run and passes except
  check-skillcost (below). check-skills ran for ranger only (all three
  classes outlast 45 min): 22 of 22 work.
- check-summon caught Sworn Brother doing nothing (a passive that only raised
  minion stats; the Warden has no other minion). It now rises beside the hero
  whenever a banner is planted (`SkillRunner.raiseSwornBrother`).
- Item icon timing measured and written up in art.md: no change needed.
- check-skillcost: killed twice at 25 min (second time printing per skill).
  Under software rendering every frame of a level-40 dungeon costs about
  2.2 s whatever the skill, so it measures nothing here; run it on a GPU.

**Done this session (leftovers from finished streams):**
- Uniques in old saves are renamed from `src/data/story/uniqueText.ts` on load
  (`Repairer.item` in Save.ts; silent, set pieces untouched). check-save case 19.
- Nameplates (`src/ui/Nameplates.ts`): only the 6 nearest ordinary monsters
  within 16 m keep a plate; champion and up always do (`maxOrdinaryPlates`,
  `ordinaryDistance`).
- Residents (`src/art/NpcModels.ts` `mergeResidentSkins`): visible skinned parts
  merged per material (long hair kept apart for secondary motion), props
  compacted, parts under 0.36 m cast no shadow. 370 -> 218 draw calls for all
  nine. Guarded by `tools/check-npcdraws.mjs` (NPC_DUMP=1 lists parts).
- `debug.makeCharacter` always equips the class's starting weapon (and off hand).
- `debug.panelOpen(id)` for checkers.
- FX: past 3 live auras (`Effects.aura`) each is dimmed so the sum stays ~3
  auras bright (`AURA_FULL`); the physical-hit dust decal now darkens (was a
  pale disc), smaller and shorter; pale dust puffs ~30% smaller.
- The hero vanishing after a teleport: world fixed the cause (pelvis spring
  exploding on long frames, `Animator.guardReach`) at ecafa92. Not seen since.
- Every tool that spawns `npx vite` now runs it in its own process group and
  kills the group (34 + 4 files). check-body left vite running before (art).
- check-perf measures the town as depth 0.
- RNG: `RigAnimator` (src/art/MonsterAnimation.ts) drew twice from the caller's
  rng, shifting every later roll; check-tactics fell to 9/12. Now one draw.
- Balance (owner rule: classes up, never monsters down): Ranger Aimed Shot
  dmg 2.6 -> 3.0 (+0.36/rank), Crippling Shot 1.3 -> 1.5 (+0.2/rank). Ranger at
  depth 40 had lost all three bosses. check-curve passes 30 of 30.
- check-tactics and check-curve are seed-sensitive: any extra rng draw in
  monster building moves their results. Keep rng draws stable.

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

### Static checkers
- All 54 pass as of this session (openness and unfinished were fixed by their owners).

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
