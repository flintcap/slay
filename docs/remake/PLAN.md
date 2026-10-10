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
edits only (new lines, new exports), never rewrites.

- **maps**: `src/world/DungeonGen.ts`, `Layouts.ts`, `Nav.ts`, `Biomes.ts`
  (gameplay fields: ids, names, families, layouts, depths, music keys),
  `src/scenes/RunDirector.ts`, `DescentPlanner.ts`, `RunEvents.ts`,
  `RunModifiers.ts`, the level-change flow in `src/scenes/DungeonScene.ts`
  (allowed to restructure that part), biome references in `src/data/*`,
  `src/ui/MapPanel.ts` (minimap only), the portal flow in `src/scenes/TownScene.ts`.
- **ground**: `src/core/Assets.ts`, `src/core/Renderer.ts`, `src/art/Textures.ts`,
  `Materials.ts`, `Palettes.ts`, `Noise.ts`, `WorldSurface.ts`, `Liquids.ts`,
  `src/world/DungeonBuilder.ts`, `src/world/Ambience.ts`, `Biomes.ts` (look
  fields: fog, light, palettes, particles), town terrain and lighting in
  `src/world/Town.ts`, `tools/bundle-artifact.mjs`, `tools/check-assets.mjs`,
  `ASSETS.md` layout, `public/assets/textures/` world folders.
- **audio**: `src/audio/*`, `public/assets/sounds/`, `public/assets/music/`.
- **heroes**: `src/art/CharacterModels.ts`, `BodyKit.ts`, `Animation.ts`,
  `Secondary.ts`, `WornGear.ts`, `GearLook.ts`, `Portraits.ts`,
  `src/scenes/HeroModel.ts`, new `src/art/hero/*`, `public/assets/textures/hero/`.
- **creatures**: `src/entities/MonsterModels.ts`, `src/art/MonsterAnimation.ts`,
  `src/art/BossPortraits.ts`, new `src/art/creatures/*`, the visual parts of
  `src/entities/Boss.ts` and `MiniBoss.ts`, `public/assets/textures/creatures/`.
- **items**: `src/art/ItemModels.ts`, `ItemLook.ts`, `Icons.ts`, `IconKit.ts`,
  `IconArmor.ts`, `IconWeapons.ts`, `IconTrinkets.ts`, `ItemIconArt.ts`,
  `Glyphs.ts`, new `src/art/items/*`, `public/assets/textures/items/`.
- **props**: `src/world/Props.ts`, `src/art/Meshes.ts`, buildings and dressing
  in `src/world/Town.ts` and `TownLife.ts`, the visual parts of
  `src/scenes/TownStations.ts`, new `src/art/props/*`, `public/assets/textures/props/`.
- **npcs**: `src/art/NpcModels.ts`, new `src/art/npc/*`, NPC placement and
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
