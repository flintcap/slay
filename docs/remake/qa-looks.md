# Stream: qa-looks (quality pass 2: does everything look right)

Status: in progress

Goal: look at every part of the remade game in real renders and fix what
looks wrong or weak against the Diablo II / Path of Exile bar in `PLAN.md`.

## Milestones

- [ ] Look survey. Render: every biome (indoor and outdoor zones), the town
  from several spots, each class bare / starter / mid / full set / uniques,
  a monster sheet per family, every boss, item icon sheets. Write every
  problem under "Results", worst first: anything invisible, see-through,
  floating, sunk in the floor, z-fighting, too dark to read, washed out,
  clipping armour, broken animation, monsters that do not read against the
  ground.
- [ ] Fix the worst. Work the list top down. Keep each fix in the owning
  area's style and contracts.
- [ ] Known leftovers. Kraken pauldrons (blobby), armour quilting (faint),
  ashen prophet and hive queen wings, stalker prime (plain), glacier titan
  fists, void spire readability.
- [ ] Motion check. Watch heroes and monsters walk, attack, cast, get hit and
  die in the live game (short frame sequences). Feet do not slide, hits land
  on the hit frame, effects line up with hands and weapons.
- [ ] Handover. Before/after renders listed under "Results".

## Results

Survey so far (worst first). Renders in `shots/qa-looks/` (not committed).

1. FIXED. Armour patterns (quilting, mail rings, scales, wyrmhide, splints,
   kraken shell) were pressed into the mesh, finer than its cells and its
   triangle budget: crumpled facets and blotches, quilting invisible. Now
   drawn in the shader (`ARMOUR_PATTERNS` in `HeroMaterials.ts`).
   Before: `wear.png`, `close1/`; after: `close2/`, `close5/`.
2. FIXED. Kraken pauldrons were seven blended balls: now a ribbed, spined
   shell with a whorl.
3. Outdoor water (dark forest "Hangman's Copse"): the pool is square tiles
   with stair-step edges, pale blue-grey, reads as a tiled floor.
   (`l-darkForest-a.png`)
4. Bosses: ashen prophet's wing is one long plank; stalker prime is a plain
   grey mannequin; hive queen shows no wings; glacier titan is glossy
   rubber with cube fists; void herald and gaunt king carry the same plank
   bat wings. (`big-*.png`)
5. Fights: telegraph rings and pools crowd round the hero in packs; bright
   white-hot rims. Effects probe in `run*.log`.
6. Monsters away from the hero's light read as black silhouettes (crypt,
   dark forest).
7. Item icons: good overall (`icons.png`, `icons2/`). Ward of Aeon is a
   plain slab; kraken shell icon looks like plate mail.

## Next up

1. Finish the survey renders: foundry, desert, hell (running), then
   sunkenTemple, hive, frostvault, ashwaste, voidspire, tundra, desertTomb,
   the town (`shoot-town.mjs`), monster sheets per family
   (`creature-sheet.mjs game --ids=family:<f>`), the other three classes in
   `hero-sheet.mjs dressed`.
2. Fix list items 3-6 top down; then the motion check.

## Notes for resume

- `tools/shoot-looks.mjs --biomes=a,b` renders biomes with monsters left in
  and logs which effects fired (2-3 biomes per run, about 13 minutes each).
- Sheets can run on a second port (4342) while a game render holds 4332.

- A new biome takes about 15 minutes to load in the test browser. Render a
  few at a time, each run under the 45-minute limit.
- Do not change stats, balance or monster counts. Looks only.
