# Stream: maps (map structure, sub-zones, biomes, portal loop)

Status: not started

Goal: every portal from town opens a brand new map that plays like a D2 act
zone or a PoE map. Several sub-zones, each with its own layout and mood, then
one boss. Dark and gritty. Many biomes in unique mixes.

## Milestones

- [ ] Design. Write the map design under "Design" below: what a map is, how
  many zones (3 to 5), how zones connect (seamless edges outdoors, doorways or
  cave mouths into indoor zones, with a load), the boss arena, how map tier
  rises (tier replaces depth for scaling), what happens on death and on town
  portal, how old saves mid-run are handled (they start a fresh map). Add the
  `MapZone`, `zones` and `zoneOf` types to `src/types.ts` and the contract to
  `CONTRACTS.md` (see PLAN.md "maps → ground").
- [ ] Biomes. A new biome list with gameplay fields. At least: crypt or
  dungeon, dark forest, swamp, desert, desert tomb, frozen tundra, ice caves,
  hell, plus whichever old ones still earn a place. Remove biomes that are
  dropped and fix every reference (`src/data/monsters.ts`, quests, story,
  music keys). Map each monster family to the biomes it lives in.
- [ ] Zone generators. Remake layout generation from nothing. Outdoor zones
  (winding forest paths with tree-line walls and clearings, desert dunes and
  ruined walls, frozen plains with cliffs, hell wastes with lava rivers,
  swamp with water and boardwalks) and indoor zones (crypt halls, caves, tomb
  corridors, keep interiors). Each one clearly different from the others.
  Every zone must stay readable: no giant empty fields, no endless corridor.
  Delete the old layout generators.
- [ ] Map assembly. Chain zones into one map with a theme (for example dark
  forest, then ruined chapel, then catacombs, then the boss's crypt). Biome
  mixes chosen by seeded RNG and weighted so they make sense. Zone
  transitions, waypoint back to town at the start, one boss arena at the end,
  portal home after the boss. The town portal always opens a new map. Remove
  the old stairs-per-floor run flow.
- [ ] Content per zone. Packs, elites, rares, events, chests, shrines, quest
  objectives, mini-bosses. Density rises through the map. The boss arena has
  an entrance moment. Keep every existing quest and event kind working.
- [ ] Wayfinding. Minimap shows zones and exits. Zone name banner on entry
  (use `src/ui/Banners.ts`). Map name and tier on the HUD's existing map label.
- [ ] Verify and clean. Headless check that generates 200 maps: every zone
  connected, boss reachable, sizes and openness in range, generation time
  under budget. Renders of one zone per biome. Dead code removed.

## Checkers

Write `tools/check-maps.mjs` (headless, no browser) early and keep it green.
Existing ones that may still apply: `check-mapgen`, `check-openness`,
`check-flow`, `check-map`.

## Design

(to be written in milestone 1)

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read `src/world/DungeonGen.ts` (`generateRun`, `generateLevel`),
   `src/world/Layouts.ts`, `src/world/Biomes.ts`, `src/types.ts` (world
   section) and the level-change flow in `src/scenes/DungeonScene.ts`
   (`loadLevel`, around the `stairs` handling).
3. Write the Design section and the types, push, then start Biomes.

## Notes for resume

- ground runs at the same time and draws what you generate. Unknown tile
  kinds must render as blocking walls until ground supports them.
