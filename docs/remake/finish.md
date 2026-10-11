# Stream: finish (cleanup, speed, long play test, publish)

Status: in progress

Goal: tie the remake together. Nothing old left behind, fast enough, no
crashes, docs true, published.

## Milestones

- [x] Requests. Do every request other streams left for a stream that has
  finished (search "Notes for resume" in every progress file).
- [x] Dead code. Find and delete code nothing calls any more, old assets and
  old checkers. `tsc` clean, build clean.
- [x] Speed. Draw calls (under 900 in town and a busy map), triangles,
  textures, load time, memory, garbage per frame. Fix the worst.
- [ ] Long play test. A headless soak (`check-soak`) through many maps:
  errors, leaks, slowdowns. Fix what it finds.
- [ ] Docs. `CONTRACTS.md`, `CLAUDE.md`, `ASSETS.md` accurate.
- [ ] Publish. Bundle with `node tools/bundle-artifact.mjs` and hand Claude
  the page and the asset file list.

## Leftovers checklist

Gathered from every stream's Handover and "Notes for resume". Ticked when
fixed, or marked "won't" with the reason.

Requests (fixes other streams asked for):

- [x] R1 props: `generateRun` sets `level.variant` after props are placed.
  Pass the variant into `generateLevel` so props dress in it.
- [x] R2 props: `ensureInteractables` plants `chest.rare` as kind `chest`;
  use `chestKindFor`.
- [x] R3 vfx/creatures: public read-only `Enemy.rig`; drop the cast in
  `DungeonScene.watchBody`.
- [x] R4 vfx/items: `ItemModels` stops building `beam`, `pool`, `sigil`,
  `dropLight` on drops (LootFX owns beacons).
- [x] R5 ground: `DungeonBuilder.buildProps` builds templates with each
  zone's biome art; wall-light line uses `tmpl.light?.color`; drop BiomeArt
  prop vocabulary fields nothing reads.
- [x] R6 audio: play `waypoint` on waypoint travel.
- [x] R7 maps: tips, quest log and run stats text that still says "stairs"
  or "depth". (`T_STAIRS_*` aliases: already gone, grep 0.)
- [x] R8 npcs/props: `check-npcdraws` fails headless in `irisTexture`.
- [x] R9 heroes: `PLAN.md` still lists deleted files under heroes.
- [x] R10 ground: `Town.ts` imports `CharClassId` without using it.

Dead code:

- [x] D1 items: unused brushes in `src/art/Paint.ts`.
- [x] D2 a sweep for exports nothing imports, old checkers and old assets.

Speed:

- [x] S1 per-step garbage over budget (304 to 411 KB against 200):
  `Nav.lineOfSight`/`worldToTile` in shot ticks, `Enemy.hasStatus`/`stacksOf`
  closures, monster AI, HeroModel. Fixed what had a cause: line of sight
  and status queries allocate nothing, effect-drawn shots skip a hidden
  `lookAt`, monsters well out of view skip their pose solve. Still 290 to
  440 KB at depth 1 (the number swings run to run): `check-perf --alloc`
  now charges three's allocations to the calling game code, and what is
  left is number boxing spread through the creature IK and AI maths, no
  single owner. Update time stays 2.9 to 3.7 ms against 6. Left as is.
- [x] S2 depth 9 forest 1.60M triangles against 1.5M. Measured where they
  went: thorn bushes 212k (canes halved), and monster shadows 176k against
  128k drawn (bodies well out of view no longer cast). Now 1.47M; depth 1
  went from 1.36M to 1.21M and 489 to 455 draw calls.
- [x] S3 depth 12 perf never measured. Tundra, 135 monsters: 424 draw
  calls, 1.20M triangles, 1.8 ms update, 177 KB a step. All within budget.
- [x] S4 first town visit builds the nine townsfolk in about 28 s; build
  over several frames or off the main loop. Done: a worker meshes them at
  boot (`art/npc/FolkWorker.ts`); cold first visit 41.9 s to 14.2 s.
- [x] S5 first build per monster (150 to 500 ms) and boss (0.6 to 2.9 s) on
  the main thread. Won't: every monster and the boss are built while the
  level loads, behind the loading screen. Only summons (six ids) bake mid
  fight, once per player: bakes are kept in IndexedDB.
- [x] S6 boss bodies 13k to 18.7k triangles against 12k. Won't: one boss is
  on screen at a time and both busy frames measured stay under 1.5M; the
  excess is hard parts per boss, which is sculpt work, not cleanup.

Looks (polish, no stat changes):

- [x] L1 items: `metal.dark` too dark under torches (lifted to 0x4a4d54,
  metal 0.85); kraken pauldrons blobby; quilting faint. The last two are
  left: the quilt is 4.5 mm on a 1 cm mesh that is then decimated, so it
  needs painting rather than a deeper cut. Owner's call.
- [x] L2 creatures: ashen prophet wings like planks, hive queen wings dim,
  stalker prime plain, glacier titan fists, storm djinn dark. Glacier titan
  and storm djinn tints lifted (they read as black glass in game light).
  Wings, the stalker and the fists are sculpt redesigns: left.
- [x] L3 heroes: warden's field kit sword sits high in the hand on the
  select screen. Looked at a real select frame: the fist closes just under
  the guard, as it should. No change.
- [x] L4 one real dungeon frame with monsters in view, looked at. Depth 3
  (the bleached reach, desert): the low evening sun sits behind the pack as
  the camera sees it, so every monster read as a black cut-out. A fill
  lift (0.85 to 1.3) barely showed; turning the desert sun to 55 degrees
  left of the camera's bearing (azimuth 290 to 350, fill 1.0) gives the
  pack lit faces and still long shadows. Retaken and looked at.

Checks never run by their stream:

- [x] C1 `check-skills` for warden and shadowblade (one class a run).
  Warden 25 of 25 working, shadowblade 23 of 23; none refused, none threw.
- [ ] C2 `check-soak`, small settings first.

Noted, not planned (owner's call or low value):

- audio: a listening pass by ear is not possible here; loudness stays
  balanced by measurement. Effects decode to about 86 MB once loaded.
- creatures: a boss portrait opens a second WebGL context once per boss.
- npcs: Renn's hand-on-hip floats a little; ledger and map read flat from
  far; walkers do not path round buildings.
- maps: `check-curve` fails 8 of 30 now (deep tiers 12 and 40 run hot or
  cold). That is balance, which this stream must not touch.

## Next up

1. C2: `check-soak`, small settings first (`--runs=2 --floors=2
   --frames=150 --cycle=1`), then the default 3 x 3.
2. Docs: check ASSETS.md against `check-assets`; CONTRACTS and CLAUDE.md
   are brought up to date.
3. Publish: `node tools/bundle-artifact.mjs`; the page, `files.json`, the
   worker script in it.

## Notes for resume

- From props (maps is done, so these are yours):
  1. `DungeonGen.generateRun` sets `level.variant` after `generateLevel`
     has already called `placeProps`, so props are always dressed as the
     plain biome. Set the variant before placement (pass `variantOf` into
     `generateLevel`). `check-dressing` warns until then.
  2. `ensureInteractables` plants `chest.rare` as kind `chest`. Use
     `chestKindFor(interact)` from `world/Props.ts` for the kind, so a rare
     chest draws as the rare chest model.

- From vfx (creatures and items are done, so these are yours):
  1. `Enemy.rig` is protected; `DungeonScene.watchBody` reads it with a cast
     (`(e as unknown as { rig }).rig?.creature`). Expose a public read-only
     `rig` getter on `Enemy` and drop the cast.
  2. `ItemModels` still builds `beam`, `pool`, `sigil` and `dropLight`
     children on dropped items. `LootFX` hides them and draws its own pooled
     beacons, so stop building them (saves meshes and a light per drop).
  3. `check-perf` depth 1 garbage is 304 KB per step (ground saw 411). The
     top allocator is `tickProjectiles` (52 KB): `Nav.lineOfSight` calls
     `worldToTile`, which returns a new object, twice per shot per step.
     `Enemy.hasStatus`/`stacksOf` build a closure per call too.

- The cancelled overhaul's quality stream never took its final speed numbers
  or ran the soak (see `docs/overhaul/quality.md`). Those tools are
  `tools/check-perf.mjs` and `tools/check-soak.mjs`.
