# Stream: maps (map structure, sub-zones, biomes, portal loop)

Status: in progress

Goal: every portal from town opens a brand new map that plays like a D2 act
zone or a PoE map. Several sub-zones, each with its own layout and mood, then
one boss. Dark and gritty. Many biomes in unique mixes.

## Milestones

- [x] Design. (Design: map structure, zone and tile types, maps → ground contract) Write the map design under "Design" below: what a map is, how
  many zones (3 to 5), how zones connect (seamless edges outdoors, doorways or
  cave mouths into indoor zones, with a load), the boss arena, how map tier
  rises (tier replaces depth for scaling), what happens on death and on town
  portal, how old saves mid-run are handled (they start a fresh map). Add the
  `MapZone`, `zones` and `zoneOf` types to `src/types.ts` and the contract to
  `CONTRACTS.md` (see PLAN.md "maps → ground").
- [x] Biomes. (Maps: six new biomes, monster and boss homes, places and notes) A new biome list with gameplay fields. At least: crypt or
  dungeon, dark forest, swamp, desert, desert tomb, frozen tundra, ice caves,
  hell, plus whichever old ones still earn a place. Remove biomes that are
  dropped and fix every reference (`src/data/monsters.ts`, quests, story,
  music keys). Map each monster family to the biomes it lives in.
- [x] Zone generators. (Maps: zone generators switched on, eleven old generators deleted) Remake layout generation from nothing. Outdoor zones
  (winding forest paths with tree-line walls and clearings, desert dunes and
  ruined walls, frozen plains with cliffs, hell wastes with lava rivers,
  swamp with water and boardwalks) and indoor zones (crypt halls, caves, tomb
  corridors, keep interiors). Each one clearly different from the others.
  Every zone must stay readable: no giant empty fields, no endless corridor.
  Delete the old layout generators.
- [x] Map assembly. (Maps: themed zone chains assemble each map; waypoint home, exit and arrival tiles) Chain zones into one map with a theme (for example dark
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

### What a map is

- One trip through the town portal is one **map**. The portal hands the
  dungeon a fresh random seed every time, so every portal opens a brand new
  map. Nothing about a map is saved; quitting mid-map lands you back in town.
- A map has a **name** ("Gallows Fen"), a **tier** and a **theme**. Tier is
  the old depth number under a new name: every scaling curve (monster count,
  elites, affixes, run modifiers, item level) still reads `DungeonRun.depth`,
  which is the tier. Clearing a map's boss raises the character's record by
  one, so the next portal offers the next tier (the existing gate and
  waypoint options keep working, they just say "Tier").
- A map has **3 to 5 zones**. Each zone is one stretch of ground with one
  biome, one layout generator and one name ("The Blackroot Wood"). The last
  zone is the boss zone and ends in the boss arena.

### Areas and how zones connect

- Zones are grouped into **areas**. One area is one `DungeonLevel` and one
  load (`DungeonRun.levels` is the list of areas).
- Outdoor zones that follow each other share one area. They are generated
  side by side in one grid and meet at a **seamless edge**: two or three wide
  gaps in the boundary, and a blend band ground uses to fade one biome into
  the next. No load.
- An indoor zone is always an area of its own. You enter it through a **cave
  mouth, doorway or stairs** at the far end of the previous area, with a short
  fade (the load).
- Travel is forward only. The way you came in is sealed behind you (it is
  drawn, but it does not take you back). This keeps one area in memory.
- Typical shapes: outdoor, outdoor | indoor | indoor-boss. Or outdoor |
  indoor | outdoor, outdoor-boss. Never more than 2 zones in one area, never
  more than 4 areas.

### The boss arena

- The boss zone's generator ends in an arena: a big open room or clearing at
  the far end, with one way in. `DungeonLevel.arena` holds its rectangle and
  the **gate** tile at its mouth.
- Stepping through the gate is the entrance moment: the way back seals
  (iron bars, roots, ice or flame by biome), the boss banner plays, the boss
  wakes. Before that the boss stands idle in the arena.
- After the boss dies a portal home opens beside the body. Walking into it
  banks the clear and returns to town.

### Waypoint, death, leaving

- The first area has a **waypoint** at the arrival point. Using it returns to
  town and abandons the map: the next portal opens a new map of the same tier.
  No record is gained.
- Death works as it always has: the character falls, the stash stays.
- Old saves never hold a map in progress (runs were never saved), so they load
  in town and their next portal opens a fresh map. Saved story data that names
  a biome which no longer exists is ignored, never trusted.

### Density through a map

- Every zone has a **heat** from 0 (first zone) to 1 (boss zone). Monster
  budget, elite and champion chance, chest quality and events scale with heat,
  replacing the old "later floors are hotter" ramp. The boss zone keeps a
  lighter crowd so the boss is the fight.
- Each non-boss zone: packs, a few champion/elite/rare packs, one or two
  chests, a shrine most of the time, sometimes an event, the quest's objective
  props spread over the map. One mini-boss per map, in the zone before the
  boss zone.

### Biomes

Outdoor: `darkForest`, `swamp`, `desert`, `tundra`, `ashwaste`, `hell`.
Indoor: `crypt`, `caverns`, `desertTomb`, `frostvault` (now the ice caves),
`sunkenTemple`, `hive`, `foundry`, `voidspire`.

| Biome | Out? | Layout | Borrowed look until ground draws it |
| --- | --- | --- | --- |
| darkForest | yes | forest | caverns |
| swamp | yes | swamp | sunkenTemple |
| desert | yes | dunes | ashwaste |
| tundra | yes | tundra | frostvault |
| ashwaste | yes | wastes | (own) |
| hell | yes | wastes (lava rivers) | foundry |
| crypt | no | crypt, keep | (own) |
| caverns | no | cave | (own) |
| desertTomb | no | tomb | crypt |
| frostvault | no | cave (ice) | (own) |
| sunkenTemple | no | keep (flooded) | (own) |
| hive | no | cave | (own) |
| foundry | no | keep | (own) |
| voidspire | no | rift | (own) |

Every old biome still earns a place, so none were dropped. Monster homes
(`biomes` on each monster and boss) by family:

| Family | Lives in |
| --- | --- |
| undead | crypt, desertTomb, darkForest, swamp, tundra, hell (bone giants) |
| beast | darkForest, caverns, desert, tundra, swamp |
| plant | darkForest, swamp, sunkenTemple, hive, caverns |
| insect | hive, swamp, desert, desertTomb, caverns |
| ooze | swamp, caverns, sunkenTemple, hive |
| elemental | frostvault, tundra, foundry, hell, desert |
| construct | foundry, desertTomb, sunkenTemple |
| humanoid | darkForest, desert, tundra, crypt, ashwaste |
| demon | hell, ashwaste, foundry, voidspire |
| aberration | voidspire, sunkenTemple, swamp, hive |

Music keys: each new biome's `music` is its own id (`darkForest`, `swamp`,
`desert`, `desertTomb`, `tundra`, `hell`). Music falls back to the crypt
dirge until audio has a track for it.

### Themes (zone chains)

A theme is a weighted recipe for the zone chain, with a minimum tier, so the
mix always makes sense (a forest leads into a crypt, a desert into a tomb).
Examples: dark forest > swamp > crypt > crypt boss; desert > desert > tomb >
tomb boss; tundra > tundra > ice caves boss; swamp > sunken temple > hive
boss; ash wastes > hell > foundry > hell boss; hell > void rift boss.

### Tile kinds added

`ruin` (masonry in the open, blocks), `deepWater` (blocks), `bridge`
(walkable), `ice` (walkable). In an outdoor zone a plain `wall` tile is the
biome's natural edge: tree line, dune ridge, cliff, rock, reeds. Until ground
draws a kind, `drawAsKind()` in `world/Layouts.ts` names the old kind to draw.
The old `stairsDown`/`stairsUp` become the area exit and the arrival point in
milestone 4.

## Next up

1. Content per zone milestone. Mini-boss: `planMiniBoss` (entities/MiniBoss.ts)
   already promotes one leader per level; make it land in the zone before the
   boss zone (spawns carry their zone via `level.zoneOf`).
2. Chests, shrines and events by heat: more and better the deeper into the
   map. Check `placeProps` and the event placer read zone heat, or weight
   their room picks by it in DungeonGen.
3. Arena entrance moment in DungeonScene: boss stays idle until the hero
   passes `level.arena.gate`; then the gate seals (nav blocked on the 3 gate
   tiles, a sound, a banner) until the boss dies.
4. Keep check-events, check-story, check-runmods and check-mapgen green.

## Notes for resume

- Zone generators live in `src/world/zones/`: `Kit.ts` (carving kit),
  `Outdoor.ts`, `Indoor.ts`, `Arena.ts`, `Area.ts` (assembler, finalise,
  turn). Each generator carves a void grid west to east from `ctx.entry` to
  `ctx.exit`; the assembler joins seams, connects islands (planking over
  water, fire and drops), never digs through the arena fence, and turns the
  area at random (`AreaOut.turn`, `turnPoint`).
- `node tools/check-maps.mjs` is the gate (connectivity, ports, sealed arena,
  border). `--dump=keep:sunkenTemple[:pair|boss] --seed=N` prints one area.
- check-openness: indoor layouts keep the 25% rule; outdoor layouts are open
  country and get 75%. The boss arena is left out of the measure.
- check-curve fails 3 of 30 (pyromancer 5 and 12, shadowblade 12). It failed
  the same 3 before the generators changed, so it is not a maps regression.
- check-audio fails on the new `hell` biome having no ambience bed: audio's
  (noted in audio.md).
- Monster counts per floor held: 123/152/170 by depth band, against
  122/150/166 before the switch (check-density).

- Map plan: `src/world/MapGen.ts` (themes, `planMap`, `splitAreas`,
  `zoneHeat`). Contract maps make every zone past the first the contract
  biome, so family slay objectives have monsters to count (check-story).
- Monsters per whole map held or rose at every tier (16 seeds each): new
  432/435/488/501/576/641/892/1129 at tiers 1/3/5/8/12/20/30/45, against
  358/341/348/356/539/616/874/1092 for the old floors.
- Tiles 7 and 8 are `exit` and `arrival`. `T_STAIRS_DOWN`/`T_STAIRS_UP` are
  deprecated aliases kept for Props.ts (ground); drop them in Verify and clean.
- The waypoint ring is drawn by DungeonScene (`buildWaypoint`,
  `tickWaypoint`). Music per zone is already done by audio (`zoneAt` in
  DungeonScene's update).

- ground runs at the same time and draws what you generate. Unknown tile
  kinds must render as blocking walls until ground supports them.
