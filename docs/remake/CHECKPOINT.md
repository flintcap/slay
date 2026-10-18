# Checkpoint

Where the work stands, so a paused or new session can pick up exactly here.
Update this file and push it after every finished step.

## Owner rules for this stretch

- Steam work is its own last phase (Phase 4: desktop app, Steam features, Deck,
  store), with nothing else in it. Phase 3 (Ready to ship) holds controller play,
  settings, frame rate, engine safety and bug reports.
- Drops stay random, never class leaning.
- Runes and runewords are our own, not a D2 copy.
- Few monster windups and channels. Every monster ability has a cooldown.
  Many monsters use only plain melee or ranged attacks.
- Death is permanent. No standard mode.
- Tests: only what is critical. One retry, then skip and note it. A few minutes at most.
- Uniques and sets must be far stronger than rares, with many more stats.
- Each unique and set item has its own fixed lines. They never change.
- Uniques and sets stay at their own item level. No scaling with depth.

## Done

- Phase 0a (9e197d4), 0b (b4b0437), 0c (bd9bd6f) pushed.
- Phase 0c full check run was stopped (too long). Typecheck clean. Not fully re-run.
- #95 monsters: plain attacks tagged `basic`, new `basic_shot`, rest of 2.5-4.5 s
  between special moves (not bosses or wardens), 125 lists trimmed, 5 channels left,
  plain fighters swing 15% faster. check-readable passes.

- #94 runes: 24 runes in 4 veins x 6 cuts, 27 runewords by vein order, power by
  cut, old ids remapped on load, loot filter by cut, recipe list in the Legacy
  codex. check-names passes.
- #96 items (src/sim/Loot.ts): rares roll 4 to 8 lines (4 a side).
- #97 uniques and sets: fixed extra lines per item in src/data/extraLines.ts
  (550 items, 1992 lines; set 2-3, unique 3-5, mythic 4-5, ancient 5-6).
  Items keep their own item level. Set pieces still lifted to 7 rare lines at
  their own level. Unique avg 7.6 lines, 2.6x a rare (mythic 2.9x, ancient
  4.6x; 12 uniques under 1.5x). setpower and uniques checks pass.
- #98 attack rating is live (owner said turn it on). Weapon blows (melee,
  heavy, bow/crossbow arrows; physical only) roll `hitChance(AR, guard)` in
  SkillRunner.lands. Guard = `Enemy.guard()`: usual hero AR at the monster's
  level x sqrt(live defense / depth-curve defense). Even odds 92%, half 82%,
  2x 97%, 5x 100%, floor 60%. Spells, beams, chains, minions, procs, vigils
  and veiled blows always land. MISS word shown. Tooltip shows hit chances.

## In progress

1. #93 Phase 0d bugs (list in the plan doc, Claude Docs project a47249ba,
   Phase 0 tables World / Interface / Art / Engine). Permadeath dodge and
   debug-in-release were done in 0a.
   - World, done: newest fallen hero, quest complete once, boss family,
     Purge counts insects (offered only when a zone has them, count scaled),
     map quest rewards (MAP_QUESTS moved to data/quests.ts), shrine offers
     fixed per shrine, pact wins over a clashing rolled modifier, Ambush and
     Hoard text.
   - World, done too: catalogue quests join the map quest roll when every
     objective has a real hook (kills by any/family/rank, map boss, shrines,
     time, stairs on maps with 2+ areas), every rule maps to a run modifier
     (darkness/fog -> Gloom, double spawns -> Teeming, reinforcements ->
     Ambush, haste -> Swift, elite frenzy -> Warband, fragile -> Savage), and
     no fail state the game never checks. 8 qualify today (Culling Order,
     Long Dark, Butcher's Bill, No Quarter, Brood Cull, Hollow King, Carrion
     Tide, Thin Ice); about 45% of maps roll one. A quest's rule now beats a
     rolled modifier it cannot run beside. Every rolled quest is held to the
     map: kills to 45% of matching monsters (60% for elites, boss counts),
     stairs to the ones there are, survive to 150 s + 3 s per depth. Checked
     on 154 maps, depths 1-90: none impossible. Quest weight and scaling
     helpers moved to data/quests.ts (sim/Quests imports them).
   - World group finished. The other 78 still need hooks (tagged guardians,
     named marks, quest items, braziers/seals/forges, vault/survey markers,
     escorts, fail states).
   - Interface, done: gate panel shows real monster level, item level, zone
     count and XP per kill (Difficulty curves now match the game); caster
     empty right-click slot says there is no basic attack; resist tooltip
     and bar use the real curve (full to 50, never 85); Buy Back tags show
     the buy-back price; Settings says Shift shows hidden floor items;
     Restore defaults keeps key bindings; pickup toast sparkle only for set
     and better.
   - Interface, done too: compare weighs every stat (40), a two-hander
     against weapon + off-hand, a shield against a worn two-hander, and
     both rings when both are worn (equipPlan in sim/Character is shared
     with equipItem). HUD key caps, potion titles, level-up and [E] prompts
     follow rebinds; Journal, Loot filter and Legacy can be rebound.
   - Interface, done too: clicking a panel raises it over the others
     (order set on the wraps, renumbered from a stack, stays under fade and
     modals); Est. DPS and the Character attack line share
     ui/AttackEstimate.ts (skill power, crits at average, swing/cast/
     cooldown pace, plain weapon attack when no skill, none for casters).
   - Interface group finished.
   - Sound, done: boss moves call the base sound hook (were silent);
     bosses wind up with boss.windup and land big blows with boss.slam
     (both were only ever played inside a muted player-skill block);
     death toll plays once; pause silences world sound and ambience and
     drops music to 35% (new game:paused event), menus still click.
   - Art, done: corpses keep their own look when cloned mid hit-flash;
     shatter/arcane deaths leave no corpse; a single set piece glows (more
     pieces, brighter); player meteor and slam aim rings draw on the glow
     layer in the skill's colour, not the red enemy warning layer;
     particles, decals and fields follow a quality change live (new
     quality:changed event; pool sizes stay until the next scene).
   - Art, done too: mixed outdoor areas draw each zone with its own
     material (all four layers, own grime and damp); a seam material on the
     cross-fade blends both bases and rocks and mixes grime/damp per vertex
     (aZone); paths/banks it has no slot for fade out 1-4 tiles before the
     seam. About 8 extra draws per mixed map.
   - Art group finished.
   - Engine, done: a lost GPU holds the game for good (nothing can unpause
     it), writes the save, and shows a Reload card (new gpu:lost event); the
     reload does not count as fleeing a fight. Back in town with all gear.
   - Engine, done too: between maps, asset textures unused for 2 scenes
     give back their GPU copy (image kept, re-uploads on use); hero mesh
     parts unused for 2 scenes are freed and kept as raw arrays (capped);
     lights free their shadow maps and the kept shadow cache follows; old
     portrait versions are purged from storage, and a full storage first
     drops portrait images before touching save copies; hard reset clears
     the newer-save copy too (graves kept on purpose). Browser run town ->
     d1 -> d5 -> d9: no errors, textures level off near 166. Geometry still
     climbs slowly (cached monster and prop shapes); watch it.
   - Engine group finished.
   - #93 Phase 0d finished.

## Next

- Owner may want a weapon damage bump to make up for misses (asked, not done).
