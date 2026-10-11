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
- [x] Hero walk (owner, top priority). `qa-looks: hero walk and run, narrow track, heel kick, no lunge`. Legs too spread, not fluid. Aim:
  narrow step width near a centre line, hips sway and turn, knees bend
  smoothly, heel strike then roll to toe, arms swing against the legs,
  upper body turns against the hips, walk and run blend with no snap, the
  walk never inherits a wide idle stance, feet do not slide. Check with
  live-game strips (side and camera) at walk and run, two classes, before
  and after.
- [ ] Equipment art (owner). Inventory icons (weapons, armour, jewellery,
  gems, potions), weapons and shields in the hands (game and paperdoll),
  armour worn on each class (bare, starter, mid, full set, uniques), items
  on the ground. Bar: bases distinct, higher tiers grander, uniques and
  sets striking and their own, materials read (metal, leather, cloth,
  bone, wood, gems), icons readable at grid size, nothing clips, floats,
  wrong scale or wrong grip, every piece visibly changes the hero. Keep
  the item contracts in `CONTRACTS.md` (grip at origin, business end +Y);
  `check-item-icons` passes with no look-alike bases. Looks only.
  Worn gear weighs most: judge it in the live camera and close up, every
  class at each gear level, standing and moving (walk, attack, cast), slot
  by slot (helm on head and hair, chest, shoulders, gloves, boots, belt,
  cape, and weapons for one hand, two hands, dual, staff, bow, shield).
  Fix clipping, floating, wrong scale, sliding in motion, look-alike bases,
  flat or toy-like pieces. Per-set and per-unique signature designs belong
  to qa-legend: note findings for it under Results, do not build them.
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
3. FIXED (shape). Outdoor water (dark forest): the pool was square tiles
   with stair-step edges, standing above the bank. Now below the bank, the
   shore curves (`fix2/l-darkForest-a.png`). Still pale from the sky
   reflection: dimmed on water in `Liquids.ts`, not yet seen in a render.
4. FIXED. Bosses. Ashen prophet and harpies: real feathered wings (coverts
   and flight feathers, `featherWings`). Stalker prime: dark chitin plates
   on the shoulders and spine. Hive queen: raised amber wings. Glacier
   titan: frozen stone body, ice slabs and crystals with a faint cold light,
   ice-block fists. Demon bat wings (void herald, gaunt king, imps, balor):
   membranes now billow and scallop between the spars (`sailGeo`), the
   gaunt king's ragged. Before: `big-*.png`; after: `boss3/`, `boss4/`,
   `boss5/`.
5. Fights: telegraph rings and pools crowd round the hero in packs; bright
   white-hot rims (hell: hellhound breath cones drew a huge glowing star).
   PARTLY FIXED: telegraph edges now keep the attack's colour and only run
   white-hot as the strike lands (`Ground.ts`). Sizes are gameplay, left.
6. Monsters away from the hero's light read as black silhouettes (crypt,
   dark forest).
7. Item icons: good overall (`icons.png`, `icons2/`). Ward of Aeon is a
   plain slab; kraken shell icon looks like plate mail.
8. FIXED. Robes and skirts (lich, void herald, gaunt king, prophet, cultist
   bosses) were flat boards: now ragged strips of uneven length (`skirt`).
   After: `skirt/`.
9. FIXED. Painted veins finer than the mesh read as camouflage blotches
   (brimstone hulk, balor, hellhound): drawn coarser now (`Bake.ts`).
   Before: `fam/game-family-demon.png`; after: `veins2/`.
10. FIXED. Rune guardian was a floating crate: chin, cheek flanges, stone
   horns. Mercury construct: drips, beads, eye pits, pools. After: `cons/`.
11. Hell (burning steppe): a glowing square grid on the ground. Outdoor
   vein quads were flat per tile over rolling ground: now draped on the
   terrain in quarters. Outdoor pools now sit below the bank with the bank
   carried under them, so the shore curves. (Check `fix1/`.)
12. Foundry: the hero warped onto a forge prop (render tool only). Black
   wall blocks with orange rims read fine.
13. Hero walk and run (owner). The run read as a string of lunges: the
   swinging foot was held back (an eased swing), trailed far behind, and
   the hips sank to reach it, so the back knee nearly touched the floor.
   A wide idle stance carried into the stride. Starts froze the feet on a
   walking beat while the body was already running. Now (`Gait.ts`,
   `Animator.ts`): a narrow track near the centre line, little toe-out,
   the swing keeps pace with the body, the heel kicks up behind, the hips
   drop only for feet on the floor, a quicker blend into the run, an early
   step for a foot left far behind, less crouch walking. No foot slide
   (`check-hero`). Offline: `motion/clips-*-before.png` vs
   `clips-*-after7.png` (new row "walk to run" checks the blend). Live
   (warden and ranger, walk and run, side and game camera):
   `gait/gait-<class>-<speed>-<view>-before|after.png`. The live run no
   longer splits into lunges; the heel tucks up behind. The walk changed
   less (it was already close to the line).

## Next up

1. Finish the survey renders (crypt, darkForest, caverns, swamp, foundry,
   desert done): hell, then sunkenTemple, hive, frostvault, ashwaste, voidspire, tundra, desertTomb,
   the town (`shoot-town.mjs`), monster sheets per family
   (`creature-sheet.mjs game --ids=family:<f>`), the other three classes in
   `hero-sheet.mjs dressed`.
2. Fix list items 3-6 top down; then the motion check.

## Notes for resume

- `tools/shoot-looks.mjs --biomes=a,b` renders biomes with monsters left in
  and logs which effects fired (2-3 biomes per run, about 13 minutes each).
- Sheets can run on a second port (4342) while a game render holds 4332.
- `tools/shoot-gait.mjs` films the hero striding in town, frozen for each
  shot so it stays in the crop. About 5 minutes a strip. `SLAY_OUTDIR=<dir>`
  serves a kept older build, so before and after can render side by side.
- `hero-sheet.mjs clips --class=<c>` shows the gait offline in under a
  minute: use it to iterate, the live strips to confirm.

- A new biome takes about 15 minutes to load in the test browser. Render a
  few at a time, each run under the 45-minute limit.
- Do not change stats, balance or monster counts. Looks only.
