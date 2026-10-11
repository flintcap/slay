# Stream: qa-looks (quality pass 2: does everything look right)

Status: not started

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

(fill in)

## Next up

1. Run Setup in `docs/remake/PROTOCOL.md`.
2. Read the Handover sections of ground, heroes, items, creatures, props,
   npcs and vfx in `docs/remake/`.
3. Start the look survey. Render tools: `tools/screenshot.mjs`,
   `shoot-ground.mjs`, `shoot-zones.mjs`, `shoot-town.mjs`,
   `creature-sheet.mjs`, `art-sheet.mjs`, `npc-sheet.mjs`.

## Notes for resume

- A new biome takes about 15 minutes to load in the test browser. Render a
  few at a time, each run under the 45-minute limit.
- Do not change stats, balance or monster counts. Looks only.
