# SLAY Remake

The owner's brief: the base plays well, and the menus and HUD are good. Most of
what you see and hear looks and sounds like a 1990s browser game. Do not keep
polishing it. **Tear it out and build it again from nothing**, aiming at the
look and feel of Diablo II and Path of Exile: dark, gritty, heavy, readable.

The earlier overhaul (`docs/overhaul/`) is finished or cancelled. This plan
replaces it.

## What gets remade

| Area | What the owner asked for |
| --- | --- |
| Maps | Every portal from town opens a brand new map. Each map has several sub-zones with different layouts and one boss fight at the end. It should feel like a D2 act zone or a PoE map. Dark and gritty. Many biomes: dungeons, forests, deserts, hell, frozen lands and more, in unique mixes. |
| Textures | All of them. Use free CC0 photo-based textures. |
| Characters | Whole body, face, walk, attacks, all from scratch. |
| Items | Same items and stats, all-new looks. Base items look like base items but each is distinct. Uniques and sets get their own shapes, colours and designs. |
| Skills | Every skill and attack effect redone. |
| NPCs | New looks and new animations. |
| Monsters | New looks and new animations (part of "characters and NPCs"). |
| Sound | Every sound and all music replaced with free downloaded RPG sounds. |

## What stays

- Menus, HUD, panels, tooltips (`src/ui/*`). Only touch them where the new
  work needs a hook (a zone name, a loading bar), in small additive edits.
- Game rules: stats, items' data, affixes, skills' numbers, combat maths,
  quests and story text, saves. The remake changes how things look, move and
  sound, plus how maps are built. It does not rebalance.
- Balance rule from the owner: never make monsters weaker or fewer.

## How "remake" works here

Every stream follows the same four steps for each thing it replaces:

1. **Build new** in new files, next to the old code. The old code keeps
   running, so the game is always playable.
2. **Switch** at one place (one import or one factory) so the game uses the
   new version.
3. **Check** it with renders and the stream's checkers.
4. **Delete the old code** and every reference to it, in the same milestone
   or the very next one. Two systems for one job never live on long-term.

A milestone is not ticked until its old code is gone.

## Art and sound files

The old rule "no asset files at all" is lifted, for **free textures and
sounds only** (owner's choice). Characters, monsters, NPCs, props and items are
still built in code, but rebuilt from scratch and dressed with the new
textures.

- **Licence: CC0 only.** No attribution licences, no "free for personal use".
  Good CC0 sources that work from this machine:
  - Textures: Poly Haven (`api.polyhaven.com`, `dl.polyhaven.org`),
    ambientCG (`ambientcg.com/api/v2/full_json`).
  - Sounds and music: Kenney (`kenney.nl`, all CC0), OpenGameArt **CC0
    entries only** (`opengameart.org`, check each entry's licence box).
  - freesound.org is blocked here. Do not use it.
- **Every file** goes in `ASSETS.md` (path, source page URL, author, licence).
  `tools/check-assets.mjs` (built by `ground`) fails if a file is missing from
  the ledger or over budget.
- **Where:** `public/assets/textures/`, `public/assets/sounds/`,
  `public/assets/music/`. Load through `src/core/Assets.ts` (`assetUrl`,
  `fetchAsset`).
- **Downloads** go to `/tmp/slay-downloads/<stream>/`, never into the repo.
  Treat them as untrusted data: only read them with `ffmpeg`/`convert`/`unzip`.
  Never run anything that came out of a download.
- **Formats:** textures WebP, at most 1024 px (512 px is fine for small or
  far things). Pack roughness/AO/height into one image where you can. Sounds
  OGG Vorbis (`ffmpeg -c:a libvorbis -q:a 4`), mono for effects, stereo only
  for music and ambience.
- **Budgets** (whole repo, checked by `check-assets`): textures 70 MB, sounds
  25 MB, music 35 MB. No single file over 4 MB. The artifact host takes up to
  256 MB per version and 15 MB per file, and the game must load in a browser.
- **Never fail on a missing file.** Fall back to a flat material or silence.

## Workstreams

| Stream | Progress file | Remakes | Port |
| --- | --- | --- | --- |
| maps | `maps.md` | Map structure, sub-zones, biomes, the portal loop, the one boss per map | 4321 |
| ground | `ground.md` | Asset pipeline, all world textures and materials, terrain and walls, lighting and post-processing | 4322 |
| audio | `audio.md` | Every sound effect, ambience and music track | 4323 |
| heroes | `heroes.md` | Player bodies, faces, skeleton, every player animation, how armour looks worn | 4324 |
| creatures | `creatures.md` | Every monster and boss body and animation | 4325 |
| items | `items.md` | Item models (held and dropped), item icons, unique and set designs | 4326 |
| props | `props.md` | Every prop, interactable and town building | 4327 |
| npcs | `npcs.md` | Town NPC looks and animations | 4328 |
| vfx | `vfx.md` | Every skill effect, attack effect, telegraph, status and loot effect | 4329 |
| finish | `finish.md` | Dead code sweep, speed, long play test, docs, final publish | 4330 |

## Quality pass 2

After the remake: `qa-bugs` (does everything work, port 4331), `qa-looks`
(does everything look right, port 4332), `qa-speed` (is it fast and steady,
port 4333), then `qa-legend` (signature looks for every unique and set,
port 4334). Same protocol. qa-bugs may fix bugs in any file; qa-looks may
edit any art file for looks only; qa-speed may edit any file for speed only.
Each explains every change outside its usual area in the commit message.

## Batches

Only **three agents run at once** (owner's rule). When one finishes, the next
in the queue starts. Order:

1. maps, ground, audio
2. heroes, items, creatures
3. props, npcs, vfx
4. finish

`docs/remake/QUEUE.md` holds the live state.

## File ownership

Each stream edits only what it owns. Anything else is shared: small additive
edits only (new lines, new exports), never rewrites. The lists name the files
as they are after the remake; the old files each stream replaced are deleted.

- **maps**: `src/world/DungeonGen.ts`, `Layouts.ts`, `Nav.ts`, `Biomes.ts`
  (gameplay fields: ids, names, families, layouts, depths, music keys),
  `src/scenes/RunDirector.ts`, `DescentPlanner.ts`, `RunEvents.ts`,
  `RunModifiers.ts`, the level-change flow in `src/scenes/DungeonScene.ts`
  (allowed to restructure that part), biome references in `src/data/*`,
  `src/ui/MapPanel.ts` (minimap only), the portal flow in `src/scenes/TownScene.ts`.
- **ground**: `src/core/Assets.ts`, `src/core/Renderer.ts`, `src/art/Materials.ts`,
  `TextureSets.ts`, `SurfaceLibrary.ts`, `WorldMaterial.ts`, `Noise.ts`, `Liquids.ts`,
  `src/world/DungeonBuilder.ts`, `Terrain.ts`, `Lighting.ts`, `src/world/Ambience.ts`, `Biomes.ts` (look
  fields: fog, light, palettes, particles), town terrain and lighting in
  `src/world/Town.ts`, `tools/bundle-artifact.mjs`, `tools/check-assets.mjs`,
  `ASSETS.md` layout, `public/assets/textures/` world folders.
- **audio**: `src/audio/*`, `public/assets/sounds/`, `public/assets/music/`.
- **heroes**: `src/art/GearLook.ts`, `Portraits.ts`, `src/scenes/HeroModel.ts`,
  `src/art/hero/*`, `public/assets/textures/hero/`.
- **creatures**: `src/entities/MonsterModels.ts`, `src/art/BossPortraits.ts`,
  `src/art/creatures/*`, the visual parts of
  `src/entities/Boss.ts` and `MiniBoss.ts`, `public/assets/textures/creatures/`.
- **items**: `src/art/hero/Armour.ts`, `Cape.ts`, `Garment.ts` and the
  clothing fields of `src/art/hero/Looks.ts` (heroes is done; items took them
  over for "Gear makes the look"), `src/art/ItemModels.ts`, `ItemLook.ts`, `Icons.ts`,
  `Glyphs.ts`, `src/art/items/*`, `public/assets/textures/items/`.
- **props**: `src/world/Props.ts`, `src/art/Meshes.ts`, buildings and dressing
  in `src/world/Town.ts` and `TownLife.ts`, the visual parts of
  `src/scenes/TownStations.ts`, new `src/art/props/*`, `public/assets/textures/props/`.
- **npcs**: `src/art/npc/*`, NPC placement and
  behaviour visuals in `src/scenes/TownScene.ts`.
- **vfx**: `src/fx/*`, the visual parts of `src/scenes/SkillRunner.ts`,
  `src/art/SkillIconArt.ts` only if a skill's look changes, `public/assets/textures/fx/`.
- **finish**: anything, for removal and fixes, explained in each commit.
- **shared** (small additive edits only): `src/types.ts`, `src/main.ts`,
  `src/core/Engine.ts`, `src/core/RNG.ts`, `src/scenes/DungeonScene.ts` (except
  maps' part), `CONTRACTS.md`, `ASSETS.md` (append rows), `CLAUDE.md`.

Need a change in a file you do not own? Write it as a request under "Notes for
resume" in the owner's progress file, and work around it until then. If the
owner stream is already done, `finish` picks it up.

## Contracts between streams

Write each one into `CONTRACTS.md` the moment it is settled.

### maps → ground (what a map is)

- `DungeonLevel` keeps its tile grid. maps may add tile kinds (for example a
  tree line, cliff, dune, ice or lava edge). **Until ground draws a new kind,
  DungeonBuilder must draw an unknown kind as a wall and treat it as
  blocking**, so nothing is ever invisible or walk-through.
- maps adds `zones?: MapZone[]` and `zoneOf?: Uint8Array` (zone index per
  tile) to `DungeonLevel`. Each `MapZone` has at least `id`, `name`, `biome`,
  `outdoor: boolean`, `bounds`. ground draws each tile with its zone's biome
  and blends at zone edges. Outdoor zones have open sky (no roof lid).
- New `BiomeId`s are added by maps with gameplay fields. ground fills in their
  look; until then a new biome borrows the look of the closest old one.

### heroes → items, npcs, vfx (the body)

- heroes writes the new skeleton (bone names, sockets for main hand, off hand,
  back, belt, head) into `CONTRACTS.md` in its first milestone, before any
  other stream relies on it, and keeps socket names stable afterwards.
- Held items keep the weapon contract: grip at the origin, business end along
  +Y, wide on X, thin on Z.
- Animation keeps a "hit frame" event (the moment a swing lands) and a
  "release frame" (the moment a spell or arrow leaves). Abilities and vfx key
  off those, not off clock time.
- npcs builds every townsperson on the hero rig and animator.

### items → heroes (worn looks)

- items owns `ItemLook` (per base, unique and set: silhouette family, metal,
  leather and cloth colours, trim, gems, glow, set motif). heroes reads it to
  draw armour on the body. items writes the shape into `CONTRACTS.md` in its
  first milestone.

### creatures → vfx

- Monsters expose the same hit and release frame events as heroes, and named
  attach points (mouth, hands, weapon tip, chest) for effects.

## Gear makes the look (owner's rule)

Just like Diablo and Path of Exile, **the gear is what gives a character their
look**. With nothing equipped, every hero is just a body in plain cloth
linens: their own body, face and hair, but no class costume (no hoods, masks,
robes, sashes or class colours on the clothes). Every equipped item visibly
changes the hero, and a fully geared hero looks completely different from a
bare one. Two heroes of the same class in different gear must look clearly
different. Uniques and sets are the most striking pieces you can wear.

## Quality bar

- Readable at the game camera first. Silhouette, value contrast and motion
  beat tiny details.
- Dark and gritty: low ambient light, warm torch pools, deep shadows, muted
  colour with saturated magic. Not muddy: the hero, monsters and loot must
  always read against the ground.
- Heavy motion: anticipation, weight, follow-through. Feet do not slide.
- Every new system has a checker or a render script under `tools/`.
- Speed: the town and a busy map stay under 900 draw calls, and the game must
  still boot under software rendering for the render tools.


## Wave 4: AAA polish (WebGPU)

The owner approved six streams in two waves of three. Same protocol, plus
"Wave 4 rules" in `PROTOCOL.md`, which override anything looser.

| Stream | Progress file | Area | Port |
| --- | --- | --- | --- |
| speed | `speed.md` | FPS, load times, no browser freeze, GPU culling, shadow caching | 4341 |
| balance | `balance.md` | Items, drops, prices, class power (never weaker monsters) | 4342 |
| ui | `ui.md` | Every screen and the HUD: one style, polish, UX, loading screen | 4343 |
| looks | `looks.md` (later) | Light, shadows, fog, reflections, materials, colour moods | 4344 |
| effects | `effects.md` (later) | Skill, hit and death effects | 4345 |
| mapvariety | `mapvariety.md` (later) | Map polish, new map shapes, weather, landmarks, run themes | 4346 |

Wave 1: speed (part 1, loads and freeze), balance, ui. Wave 2: looks,
effects, mapvariety. Last: speed part 2 (FPS tuning: instancing, shadow
cache, lighting, CPU frame), after wave two adds its lights, props and
effects.

### Wave 4 file ownership

- **speed**: `src/core/Engine.ts`, `ShaderGate.ts`, `Freeze.ts`, `Idle.ts`,
  `AutoQuality.ts`, the quality ladder, culling, shadow and draw parts of
  `src/core/Renderer.ts` (not the post chain or grade), `src/world/DungeonBuilder.ts`
  and `PropBake.ts` (how things are built and drawn, not how they look),
  `src/world/MapGen.ts` build pipeline, any new worker files, the loading
  parts of `src/scenes/DungeonScene.ts` and `TownScene.ts`, update budgets in
  `src/entities/*` and `src/scenes/SkillRunner.ts` (how often, not what),
  `tools/check-perf.mjs`, `check-lag.mjs`, `check-frames.mjs`.
- **balance**: `src/data/*` (numbers only), `src/sim/*` (numbers and
  formulas), `src/data/skillPower.ts`, `tools/check-curve.mjs`,
  `tools/curve-entry.ts`, new balance report tools.
- **ui**: `src/ui/*` (all panels, HUD, CSS), `public/assets/textures/ui/`,
  the UI sound calls in `src/audio/*` (additive).
- **shared** (small additive edits only): `src/core/Events.ts` (new events),
  `src/types.ts`, `src/main.ts`, `CONTRACTS.md`, `ASSETS.md`.

### Wave 4 file ownership, wave two

- **looks**: the post chain and grade parts of `src/core/Renderer.ts`,
  `src/core/Lighting.ts`, `src/core/ShadowNodes.ts` (how shadows look; speed
  part 2 later owns how often they redraw), `src/world/Lighting.ts`,
  `src/art/Materials.ts`, `WorldMaterial.ts`, `SurfaceLibrary.ts`,
  `TextureSets.ts`, the look fields (colours, fog, light) of existing biomes
  in `src/world/Biomes.ts`, `public/assets/textures/world/`, and the
  `warmup()` stand-ins for the late looks listed in `looks.md`.
- **effects**: `src/fx/*` (including `fx/kit`, `fx/paladin`, `fx/shifter`,
  `SkillLooks.ts`), `public/assets/textures/fx/`, and `warmup()` stand-ins
  for effects.
- **mapvariety**: `src/world/MapGen.ts`, `DungeonGen.ts`, `Layouts.ts`,
  `src/world/zones/*`, `Props.ts`, `Terrain.ts`, `Town.ts`, `TownLife.ts`,
  `src/world/DungeonBuilder.ts` (new shapes; keep the paced steps), new
  biome entries and run theme data in `Biomes.ts`, the town build pacing in
  `src/scenes/TownScene.ts`, new weather files.
- `warmup()` in `src/scenes/DungeonScene.ts` is shared: additive stand-ins
  only. `Biomes.ts` is shared between looks (existing look fields) and
  mapvariety (new entries and themes): small edits, rebase often.
- Weather uses the effects particle kit as it is; requests go in
  `effects.md` "Notes for resume". Run themes may set a light tint; looks
  reads it if present and never requires it.

### Wave 4 contracts

- **speed → ui (loading progress)**: speed adds the event
  `'load:progress': { stage: string; done: number; total: number }` to
  `src/core/Events.ts` and emits it while a town or map is built. ui draws
  the loading bar from it, and falls back to `'scene:loading'` and
  `'assets:progress'` until it exists. Write the final shape into
  `CONTRACTS.md`.
- **ui → speed (UI cost)**: ui owns the cost of its own DOM work (no layout
  reads inside per-frame code, batched HUD updates). speed writes UI costs
  it finds as a request in `ui.md` "Notes for resume".

## Wave 5: skills remake (owner)

The owner asked for two things in order. The first (difficulty scaling) is
done (#161 in `CHECKPOINT.md`). The second is this wave: fix the skills of
every class and remake each class's kit to a AAA standard. Same protocol,
plus "Wave 5 rules" in `PROTOCOL.md`, which override anything looser.

Order (owner): speed first, then skills, then a quality pass.

Owner rule: damage per hit never changes because of swing or cast speed.
Only speeds change; damage per second moves with them, and that is
accepted. If a class ends up walled, the numbers go to the owner.

1. **skillcore** runs alone first. It audits and remakes the speed of the
   whole game: basic attack speed and cast rate, how attack skills and
   spells time off them, and how items add speed. Target feel: as close as
   we can to the similar classes and weapons in Diablo II and Path of Exile,
   in our own numbers, never their names. Nothing attacks at warp speed.
2. **Seven class streams**, at most three at a time (4 cores): each audits
   its own class's base attack and cast speed under skillcore's new model
   first, then remakes its skills.
3. **skillqa** runs last: AAA quality, every skill working, and frame rate
   not reduced (faster where it can be).

| Stream | Progress file | Area | Port |
| --- | --- | --- | --- |
| skillcore | `skillcore.md` | Attack speed, cast rate, item speed, shared skill plumbing | 4351 |
| sk-knight | `sk-knight.md` | Knight (`warden`): Bulwark, Carnage, Oaths | 4352 |
| sk-mage | `sk-mage.md` | Mage: Fire, Lightning, Cold | 4353 |
| sk-rogue | `sk-rogue.md` | Rogue (`shadowblade`): Venom, Shadowcraft, Bladework | 4354 |
| sk-revenant | `sk-revenant.md` | Revenant: Ossuary, Blight, Grave Pact | 4355 |
| sk-ranger | `sk-ranger.md` | Ranger: Marksman, Wildcraft, Volley | 4356 |
| sk-paladin | `sk-paladin.md` | Paladin: its three trees | 4357 |
| sk-shifter | `sk-shifter.md` | Shapeshifter: Feral, Teeth, Claw | 4358 |
| skillqa | `skillqa.md` | Quality, working, performance across all classes | 4359 |

### Wave 5 file ownership

- **skillcore**: the speed formulas in `src/sim/Stats.ts`, the attack and
  cast timing in `src/scenes/SkillRunner.ts` (the `attackTime` /
  `castTime` sums, the basic attack, `DUAL_*` constants) and in
  `src/entities/Player.ts` (`attackSpeedPct`, `castSpeedPct`,
  `beginAction`), weapon speeds in `src/data/itemBases.ts`, the speed
  ladders in `src/data/affixes.ts`, speed lines on uniques, sets, gems,
  runes, runewords and charms (numbers only), `tools/curve-entry.ts`, clip
  playback in `src/art/hero/Animator.ts`, the speed readout in
  `src/ui/CharacterPanel.ts` and tooltips, and the icon render size in
  `src/art/Icons.ts` / `src/art/SkillIconArt.ts` (the pipeline, not
  single icons). New shared fields a class stream will need (a per-skill
  cast time, a per-skill attack speed factor) are added by skillcore.
- **each class stream**: its own class's section of `src/data/skills.ts`
  (or `src/data/classSkills/paladin*.ts`, `shapeshifter*.ts`), its own
  branches and helpers in `src/scenes/SkillRunner.ts`, `ShifterRunner.ts`,
  `src/scenes/paladin/*`, its own entries in `src/art/hero/SkillActions.ts`,
  `Swing.ts`, `Actions.ts`, `src/fx/SkillLooks.ts` and `src/fx/*` (new
  effect files are best), its own icon entries in `src/art/SkillIconArt.ts`,
  `src/art/Glyphs.ts`, `src/art/icons/*`, its own lines in
  `src/data/skillPower.ts`, `src/data/shifterPower.ts`,
  `src/audio/SkillSounds.ts`, `src/data/skillBends.ts`, and the unique and
  set lines that name its skills (only to keep them pointing at real
  skills and settings).
- **skillqa**: any file, for fixes it finds; it does not redesign kits.
- **shared** (small additive edits only, rebase often): `src/types.ts`,
  `src/core/Events.ts`, `CONTRACTS.md`, `ASSETS.md`, `warmup()` in
  `src/scenes/DungeonScene.ts`, the shared parts of the files above. Never
  reformat or reorder another class's part of a shared file.

### Wave 5 contracts

- **skillcore → class streams**: skillcore writes its final speed model,
  the target speed table and the new per-skill fields into `skillcore.md`
  "Handover" and `CONTRACTS.md`. Class streams start only after it is
  pushed, and time every skill through those fields, never through new
  hard-coded seconds.
- **class streams → skillqa**: each class stream lists, under "For
  skillqa", what it could not check (looks in motion, real frame time) and
  any effect it fears is costly.
