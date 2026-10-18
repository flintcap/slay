# Checkpoint

Where the work stands, so a paused or new session can pick up exactly here.
Update this file and push it after every finished step.

## Owner rules for this stretch

- Steam work is its own last phase (Phase 4: desktop app, Steam features, Deck,
  store), with nothing else in it. Phase 3 (Ready to ship) holds settings,
  frame rate, engine safety and bug reports.
- Mouse and keyboard only. No controller play in any phase (the Deck gets a
  Steam Input layout that maps to mouse and keys, aiming for Playable).
- Every class keeps mana. No new class resources.
- Drops stay random, never class leaning.
- Runes and runewords are our own, not a D2 copy.
- Few monster windups and channels. Every monster ability has a cooldown.
  Many monsters use only plain melee or ranged attacks.
- Death is permanent. No standard mode.
- Tests: only what is critical. One retry, then skip and note it. A few minutes at most.
- Uniques and sets must be far stronger than rares, with many more stats.
- Each unique and set item has its own fixed lines. They never change.
- Uniques and sets stay at their own item level. No scaling with depth.
- Before starting any phase plan item, send the owner a numbered list of its
  changes and wait for approval of each one.
- Descent sigils (craft a token that sets the next depth) are cut. Do not add.
- Pinnacle boss (summoned with fragments) is cut. Do not add.

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

- #99 (Phase 1) every skill tooltip true (6e5f7eb). New check-skillparams
  fails on any skill setting the game never reads (records reads while the
  real runner casts every skill). New check-stattext fails when a passive's
  text leaves out its real numbers. Settings that did nothing are wired
  (Siphon Life, Soul Tether, Soul Cage, Reap Soul, Vampiric Touch, Endless
  Quiver, Volley Mastery, Roll Away and more); dead ones removed; 31
  passive texts rewritten. Blood Pact and Sanguine Nova now really cost life.

- #100 (Phase 1) boss poise bar (abb0a4b). Stuns, freezes and roots fill a
  gold Poise bar under the boss bar instead of holding the boss; hard blows
  fill it too (crits and knockback more). Full: broken for 3 s (held, wind-up
  cut, takes 25% more), next bar 35% longer, idle poise drains. Numbers in
  src/sim/Poise.ts. Other monsters keep the old control fade. check-fair
  covers it. Not seen in a browser yet. check-hits fixed to count misses.

- #101 (Phase 1) synergies and combos shown (82d7372). Skill detail has a
  Synergies section (what feeds this skill, what it feeds, bonus now) and a
  Combo section; hovering a node lights its synergy partners; hotbar hover
  shows both. 39 synergy links did nothing (skills with no damage ladder,
  passives, and 3 procs); all now work. Riposte and Riposte Blade counters
  grow with rank. check-skilldepth fails on a synergy that reaches nothing.
  Skills screenshot crashed twice (browser closed in town); not seen yet.

- #102 (Phase 1) one danger language (92540dd). Every enemy floor warning is
  warm (reds and oranges keep their hue, yellows go amber, other colours go
  red-orange; dangerTone in src/fx/Decals.ts). Places to stand use one green
  through decals.safeZone. Harmless moves (rallies, heals, shields, summons)
  draw a soft cue in their own colour. Marks added to 8 wind-ups that had
  none; Plague Burst now swells 0.6 s in a marked circle first. No damage
  changed. check-readable covers it. check-tactics "big telegraphs are
  staggered" fails the same way before this change (not fixed, noted).

- #104 (owner ask) old uniques and set pieces take their fixed lines on load
  (41b9c12, refreshFixedLines in src/sim/Loot.ts, called from Save item
  repair). Rolls already there are kept inside the range; missing lines roll
  seeded by the item; random old lines go; item level back to its own.
  check-save covers it.

- #105 (owner ask) every unique and set piece's extra lines picked by hand to
  fit the item: only lines its slot can roll, matched to its name, story,
  element and job, never a stat it already has, no attack rating or attack
  speed on caster weapons, and no two of the 550 items share a set. Same
  line counts; values are the top rung at the item's own level. Average
  strength vs the old lines: uniques -3%, sets -1%, mythic +8%, ancient
  +21%. Owned items switch on load (refreshFixedLines). setpower, save and
  items checks pass.

- #106 (Phase 1) targeted crafting. Enchanter: a reforge lays out three new
  lines of the same kind (no shared group, none clashing); take one or keep
  the old. An item with room (rare 4 a side, 8 in all; magic 1 a side; rare
  charms by size) can take a new line the same way while no line is
  reforged; the one-line rule now covers old and new lines. Offers wait on
  the item (`Item.offers`) through closing the panel and saves. Blacksmith:
  a reroll can bind 1 line (magic) or 2 (rare) with Cured Hide, Gloomsilk or
  Starcloth by item level; hone moves one line a rung up its ladder (up to
  10 item levels past the item), once per item, paid with Beast Heart, Demon
  Ichor or Titan Marrow plus metal (`ItemMod.honed`, tag in the tooltip).
  New lines tie in with Corded Sinew, Void Ash or Mythic Essence. A reroll
  now clears the Enchanter mark when its line is gone (it used to block all
  reforging). New check-craft; check-town covers offers, fill and saves.
  check-economy fails the same way before this change (no set or unique for
  the mage in one depth-30 descent; random, noted). Not seen in a browser:
  the screenshot browser closed while loading town (as in #101).

- #103 (Phase 1) balance groundwork, heroes catch up (owner's pick:
  monsters stay exactly as they are). One curve: `sim/Difficulty.ts` now
  holds only the live depth rules (`depthCurve` moved there from Enemy.ts,
  re-exported); the unused gentler curve, its run modifier list and the two
  dead XP systems (Progression's penalty band, monster `xpValue`/`bossXp`)
  are gone. Level curve: `xpForLevel` is the smaller of the old curve and
  `800 * (L + 5)^1.6`, same to level 28; a hero clearing each depth once is
  within 3 levels of the depth number from depth 25 on and reaches 99 at
  depth 102 (was L46 at depth 60, L58 at depth 100). New check-levels holds
  it. Saved heroes get the levels their XP already pays for on entering
  town or a map (`settleLevels`). Potions: flat healing grows with hero
  power like life. Life regen grows by the square root of the life
  multiplier (full growth made every class untouched from depth 18). Damage
  reduction is now the percent every item and the sheet promised (cap 50%);
  it was a flat number off each hit; skill texts that said "+N damage
  reduction" now say "%". One payout path: `sim/Payout.ts` gives every
  source (kills, chests, shelves, breakables, run events, milestone caches)
  the same item level rule, the same find (tier magic find shift, gold find
  and tier gold everywhere) and one gold curve sized per source; chests and
  events no longer roll worse gear than the monsters beside them. Item
  level no longer adds the floor number, so shelves and breakables on the
  last floors of depths 1 to 11 pay up to a third less gold; every other
  source pays the same or more at every depth. check-curve default 34/35 (was
  34/35; mage d40 untouched now, shadowblade d5 passes). `--wide` 60/70:
  nothing walled at depth 60 (was 3 classes); the misses are all
  "untouched" (too easy) at d8, d18, d40, d50; warden, shadowblade and
  paladin d8/d18 were already untouched before. The Deep's Own Name runs
  out the 300s clock for 3 classes at d60 without hurting them (won 1/3).
  check-economy passes now. check-events fails the same before and after
  (quest.purge: no insect kills count on a full clear).
- #108 (owner ask) the 6 uniques whose skill bends pointed at settings removed
  in #99 now bend real ones. Millwheel: Whirlwind spins 20% faster (was
  walk speed). Long Drizzle: Arrow Rain hits chill 3s (was extra volleys).
  The Overcast: Darken The Sky hits blind 3s (was duration). Splinterwand:
  Bone Spear +2 spears in a 70 degree fan, each on its own line (was width;
  Bone Spear gained `count: 1, arc: 0`, plain skill unchanged). Bottled
  Squall: Tempest Orb burst 30% bigger and hits shock 4s (was targets per
  pulse, and its duration knob only fed an empty status). Trapper's Last
  Belt: blast 30% bigger, roots 2s (was traps and duration). Every damage
  bonus kept. Checked by wearing each in a 30-fight arena: the bonus lands.
  check-uniques, check-skillparams, check-rankpower, check-unique pass.

## In progress

- Nothing.

## Phase 0d log

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
