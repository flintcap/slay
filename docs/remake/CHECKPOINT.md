# Checkpoint

Where the work stands, so a paused or new session can pick up exactly here.
Update this file and push it after every finished step.

## Owner rules for this stretch

- Steam work is its own last phase (Phase 4: desktop app, Steam features, Deck,
  store), with nothing else in it. Phase 3 (Ready to ship) holds settings,
  frame rate, engine safety and bug reports.
- Mouse and keyboard only. No controller support of any kind, in any phase,
  and no controller ideas in the plan (menus included).
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
- Wave 5: the quality stream (skillqa) fixes every issue found, not just
  lists it (list in `skillqa.md` "Known issues"; the lead adds each class
  stream's leftovers as it lands).

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
- #109 Content past the old ends (owner approved all six parts).
  - #110 Deep A: three families, 18 monsters. The Kept (d30-40, the
    Tenant's wax household), the Nailborn (d50-64, glass grown wrong, they
    shatter on death), the Stayed (d70-84, delvers who never came up, every
    biome). Own looks, CC0 sounds (ASSETS.md), names; deep maps use them.
  - #111 Deep B: 12 monster powers, one every five tiers d20-75 (Echoing,
    Lampblack, Restless, Knelling, Splintering, Stitching, Grappling,
    Refracting, Funereal, Hemming, Emberfall, Eclipsing), each with a marked
    tell, a cooldown and an answer. Landed blows now reach the monster that
    dealt them, so life leech and bloodlust work for the first time.
    check-elites passes. check-curve 32/35: mage d40 untouched as before;
    shadowblade and revenant d25 now read untouched in the full run because
    the same d25 pack no longer rolls its reflect power (dice moved by the
    larger power pool; nothing got weaker). check-beats, check-tactics,
    check-uitokens, check-unfinished and check-events fail the same on the
    commit before.
  - #112 Deep C: six bosses past the Deep's Own Name, data/bosses3.ts.
    Mother Wickwane d66 (braziers, swarmCall, defend), the Glasswright d72
    (mirror, tiles, weakPoints), Marshal Harrow d78 (linked, swarmCall,
    guardBreak, collapse), the Holdfast d84 (chains, heartstones, bells),
    the Usher d90 (stalker, lure, breakingCast, collapse), the Sleeper's
    Hand d96 (weakPoints, wardPortals, heartstones, collapse). 3 or 4
    phases each, own intro, barks and voice (story/bossVoices3.ts), own
    look (LookBoss5.ts). Boss tiers climb again past 60 (life +3%, damage
    +1% a tier), so life times damage rises 10.3 (d60) 11.0, 11.5, 12.0,
    12.7, 14.0, 14.8; check-bosssys now checks that climb. Two uniques each
    (uniqueBatches/batchG.ts, two of them mythic), fixed extra lines in
    extraLines.ts. check-bossfights passes all six; check-bosses (depths to
    96), bosssys, roomrules, story, uniques, looks, names, legend, save,
    drops, loot, economy, iconmatch, items pass.

  - #113 Deep D: the checks reach the deep content. check-bosses walks
    depths to 96, check-bosssys checks the climb past 60, check-curve
    `--deep` fights every class at d30, 45, 60, 75, 90 and 100. Names,
    looks, readable, uniques, monster-anim (`--all` too) and bossfights
    (all six) pass. Curve `--deep` 25/42: nothing is walled, every pack is
    won 3/3 and every boss at least 2/3 at every depth to 100. The 17
    misses are all "untouched" (too easy): every class at d45, and most at
    d75, d90 and d100, where the deep bosses fall in 0-15s with the hero
    near full life. d30 and d60 are challenged for every class. Cause: the
    hero's life grows 17% a level, monster damage 11.8% a depth, so past
    60 the hero pulls away (about 4.5x more life per hit at d100 than at
    d60). Same trend `--wide` found at d40 and d50 before. Left for the
    owner to call.

- #114 (owner ask) controller support removed: GamepadNav.ts, the Gamepad
  rows in the controls list, the pad-nav focus styles, and every controller
  idea in ui.md, this file and the plan doc (the Deck's Steam Input layout).
- #115 (owner ask) Overflowing Ward (Breastplate of the Morning Muster) was a
  pool only PowerRuntime could see. It is now the `overflowWard` status: a
  buff chip, soaked after armour in `Player.takeDamage`, a dome when it
  closes, a flash when it breaks. check-items probes it on a real status.
- #117 (owner ask) charms drop about ten times less often: about 11 a run at
  depth 22 before, about 1 now (2 at depth 40).
- #116 (owner ask, diagnosis) a level 27 rogue at tier 22 on Reaver had
  19,693 life, 914 defense and 61k DPS; the curve's rogue there (rares plus
  milestone caches, L26) has 8,156 life and 129 defense, and even it ends
  most d22 fights above 80% life. Monsters there hit for about 100 to 270.
  Level is not the cause (L27 vs the curve's L26). Gear is: uniques, a set,
  temper levels, sockets and about 30 charms in the pack (30 charms add
  about 10% life and 45% max damage). Waiting on the owner's call.

- #118 (owner ask) monsters stronger at every tier (3b7b85c): `depthRamp` in
  sim/Difficulty.ts, the owner's middle of a gentle and a hard curve. Past
  depth 5 life climbs about 3.8% more a depth and damage faster the deeper
  you go; past 60 both about 2% more again. x1.9 life and x1.8 damage at 22,
  x3.7/x3.9 at 40, x8/x11 at 60. Tuned with check-curve against two heroes:
  rares (must win) and `--kit=best` (uniques, sets, upgrades, gems, charms;
  must lose real life). The curve check also got: the test hero breaks room
  objects first (the Deep's Own Name no longer runs out the clock), and
  exact XP per level (deep test heroes were 3 to 11 levels too high).
  Result: the best hero loses real life at 12 to 30 and at 50 to 60; at 40,
  75 and 90 the strongest classes in best gear are still barely touched (best
  gear there is 5 to 8 times a rare kit). In rares, ranger is walled at 12,
  40 and 90, shapeshifter and knight at 40: a class boost list goes to the
  owner first.

- #119 (Phase 1, owner approved 1-3) the 6 thin biomes. Two new looks
  each (a7bfe28): Blackroot Wood the Fogbound Wood and Bonfire Night; Gallows
  Fen the Drowned Lanterns and the Dry Season; Bleached Reach the Sandstorm
  and the Red Dusk; the tomb the Flooded Vaults and the Treasury Wing;
  Frostmarch the White Squall (not "Whiteout": frostvault has one) and
  Skyfire Night; hell the Ashfall and the Cooled Crust. A look can now move
  the outdoor sky (`BiomeArt.mood`, laid over `Lighting.ts` OUTDOOR), and
  check-variants counts it. A second 3-step story line per biome (9a0f6d9),
  offered by Renn, Vell, Wenna, Corvane, Kale and the Listener once their
  first is done: the Treeline, the Fen Cure, Sand Over the Survey, the Kings'
  Bond, the High Road, the Singing Steppe, each ending on a boss of that
  biome. The journal lists only the contract a person offers now, and
  check-story tests the hand-off. A screenshot of every look was sent to the
  owner. Skipped by the owner: new events; lasting shrines, escort, vigil
  and the unused quests. Class boosts from #118 offered, not taken.

- #120 (Phase 1, owner approved 1-5) one status rule book for the hero and
  monsters (`src/sim/StatusRules.ts`). The same name finds the same entry
  (monster short names like poison, chill, root and stun never landed on the
  hero before; now they do), a second application resolves by the entry's
  stacking on both, the same stack ceiling and timer, stat changes scale by
  strength on both. A monster's poison, burn or bleed on the hero now grows
  with depth on the curve the hero's does on monsters. Holds fade one way:
  every hold of any kind shortens the next and the fatigue drains (the
  hero's per-kind halving is gone; gear that shortens holds and the boss
  hold cap stay). A reapplied hold now keeps a monster held as long as its
  stun shows. The death screen names the monster whose poison or burn killed
  you, even after it died. New check: check-status. Fast checks: the same
  6 known failures; the curve check now fails 1 of 35 (was 3): shapeshifter
  in rares at 40, the wall already noted under #118.

- #121-#124 (Phase 1, owner approved) four interface pieces.
  See-through map (`ui/MapOverlay.ts`): Tab lays the floor's chart over the
  game, turned and tilted like the camera, centred on the hero, with way
  marks, monsters in sight and the hero's arrow; strength and size sliders
  in Settings, Gameplay. Panels dock: let go of a dragged panel near a
  screen edge and it sticks there; every panel remembers its place in the
  save (`settings.panelPlaces`), a header double-click sends it home, and a
  window resize keeps them on screen. Deeper compare (`Compare.swapSummary`):
  every item tooltip adds "If you wear it": damage a second, life,
  toughness and the resists that change (before and after), powers gained
  and lost, set bonuses gained and lost. Build numbers (Character panel,
  "Your build"): each bar skill's hit and damage a second with this gear
  (`AttackEstimate.estimateSkill`), how many ordinary blows of the deepest
  tier reached it takes to fall to each damage kind, and plain lines on
  the build's best skill, weak and strong side, life back and crits.

- #125 (Phase 1, owner approved, last of the list) two recaps. Death
  screen, right side (wide screens only): "The last blows", the hits of
  the last ten seconds, each with who, what, how much, its damage kind and
  the life bar after it; a line on how fast full life went, and the kind
  that did most of it beside the hero's resistance to it. Ticks of one
  poison or burn fold into one row. Map-clear recap (`ui/ClearRecap.ts`):
  a card a moment after arriving in camp from a cleared map with time,
  kills, gold, experience and levels, items, potions, best find, closest
  call, what hurt most, damage taken and the contract done. Hits now carry
  the ability and status names (`player:damaged`), and drinking emits
  `potion:drunk`. The see-through map now counts lone blockers as floor,
  so it no longer speckles.

## In progress

- Phase 2+3 list (owner approved, blanket). Window, borderless and monitor
  pick go to Phase 4 (need the desktop app). three.js is pinned only in the
  release build.
- #127 done: indoor torch shadows. The nearest torches each keep a shadow
  cube drawn once from the still layer (walls, baked props) and redrawn only
  when a light takes a new torch. Hero lantern shadow on High and Ultra,
  redrawn on the shadow clock. A shadow pass never sees the sightline cut,
  so a torch no longer shines through the wall the cut opens.
- #128 done: floor relief from the scans' height (parallax, floors and open
  ground only); lasting marks (moss, runs, soot over torches, blood, scorch,
  damp) as one decal box draw per level (`WorldMarks.ts`); grass, reeds and
  leaves sway in one shared wind (`Wind.ts`) with a cover share per preset;
  water refracts, fades in the shallows and traces reflections across the
  screen on High and Ultra; wall recesses, shelves and slots; big rooms and
  boss rooms stand a storey taller (`Halls.ts`, check-roof follows); outdoor
  sky dome with drifting clouds whose shadows cross the ground (`Sky.ts`),
  and a per-biome reflection sky.
- #129 done: tiled lights (16 x 10 screen tiles, up to 256 lights, a pixel
  shades only its tile's lights); bounced light baked per level on the
  tile grid (`Bounce.ts`, `BounceLight.ts`); sun beams through the outdoor
  fog on High and Ultra (`Shafts.ts`); one shadow body per wall chunk; AgX
  tone mapping plus a colour lookup grade per biome (`Lut.ts`); a one-tap
  world shader for Low on the same render setup; render-scale slider with
  temporal upscaling on High and Ultra.
- #130 done: block, parry and dodge moves; creatures take
  shadows; robes and long hair on spring chains (`Swing.ts`); forearm twist
  bones; corpses baked to still meshes; far monsters swap to a 40 % copy
  (`creatureDetail`, size on screen per preset); shadow bodies from thinned
  copies; the hero's face and hands thinned for play (`playSkin`); same-look
  monsters share one draw per pack (`Packs.ts`). GPU cloth for capes and
  banners came last, after #136 (log below: the hero's cape, then the
  bosses' capes and banners).
- Fixed on the way: water mirror loop built outside a shader function (the
  swamp would not load); the particle shader passed 17 values between its
  stages (limit 16), now packed.
- #131 done: a skill's rank lifts its drawing on every preset (`kit/Boost.ts`:
  bigger sprites, more particles, brighter cores and lights, kept by bolts,
  fields and delayed blows); monster bolts have their own look (dark core,
  red rim); the grade pass bends the screen for shockwaves, heat over fire
  and portals (`core/Ripples.ts`); the sprite sheet at 128 px cells with
  new sets (blood, gore, ice, frost, forked bolts, sparks, embers); flash lights per
  preset (6, 10, 16, 24) that join when they meet; sparks, chips and blood
  bounce off walls and props and land on crates (`DungeonMesh.solidMap`,
  `ParticleField.setSolids`); smoke is lit by the strongest lights near the
  view (8, or 4 on Low and Medium).
- #132 done: a theme per boss family (8 new CC0 tracks, `Score.ts` `BOSS`);
  hero voice by body (`audio/HeroVoice.ts`: women's hurt sounds, barks for
  no mana, a full pack and low life); pack grunts on aggro; a voice under
  each boss taunt (`boss.voice.<family>`) and a roar on engage; a floor
  keeps only its monsters' and the hero's skill sounds in memory
  (`audio.setLoadout`); 45 skill sounds nobody played are gone, and parry,
  jump, land, unequip, screech, heavy deaths, wood steps and the monster
  spell sounds (meteor, thunder, chain lightning, volley, whirlwind,
  shield) are wired.
- #137 done (owner ask): leaving a map early no longer kills the hero.
  Going down writes what the hero carries on the character
  (`sim/RunLedger.ts`, `Character.run`). The last exit and the waypoint
  throw the note away. The menu's Return to Town and Quit to Title, closing
  the tab, a refresh or a crash put the hero back in town with what they
  took down: items and gold found on the map are lost, materials go back
  to what they were, and 10% of the current level's experience goes (never
  a level). A crash is settled on the next load (`Save.settleLeftMaps`)
  and told in town. The feel check's stub learned `delay`. New save cases:
  settle on load, menu leave, a damaged note keeps today's gear.
- #138 done (owner ask): use trinkets (`data/trinkets.ts`,
  `sim/Trinkets.ts`). Uniques that take one cell, dropped by a map's boss
  (7%) or a floor warden (2.5%), Trinket of Town 80 to Trinket of Death 20.
  Town: right-click in a map opens a portal; stepping through goes home
  with everything and saves the area (`Character.portal`, `OpenPortal`).
  In town the portal stands by the arrival path: [E] goes back to the same
  map, built again from its seed (each area's build is now
  `streamFor(seed, 'level:i')`), with its kills, spent props, floor loot,
  vault, quest, chart and way home put back; it closes behind the hero.
  Right-click it in town to close it and end the map. The Descent refuses
  while it is open. An open portal follows the hero to the next area. A
  boss left mid-fight is back at full life; a treasure runner does not
  come back. Death: carried in the pack, it takes the last blow in a map,
  breaks, and sends the hero home with everything (`lethalGuard`, after
  cheat death). New checks: two save cases (portal round trip, damaged
  note) and trinket rates, size, spending and the chart in `check-charms`.
- #133 done: sharp text and icons, bundled fonts, text floor, skill board
  at 800 px. Four OFL fonts ship in the build (`@fontsource-variable`:
  Inter for UI, Alegreya for names and flavour, Cinzel for titles,
  JetBrains Mono for stat columns; listed in ASSETS.md "Fonts"). The CSS
  tokens and every canvas `font` use the stacks in `ui/Fonts.ts`; boot
  awaits `loadFonts()` before any canvas draws words. `core/Screen.ts`
  gives the screen's pixel ratio (1 to 3) and calls back when it changes
  (window moved monitors), which also covers the #136 line "re-read screen
  sharpness": combat numbers (was capped at 1.5), minimap, orbs, map panel,
  overlay, paperdoll and the main renderer re-size on it. Item, skill,
  status and affix icons draw at `iconScale()` (1 on a plain screen, 1.6 at
  2x, 2.4 at 3x) and redraw on a monitor move. Skill board: the 0.76 zoom
  at short screens (labels at 7.6 px) is gone; tiers fit the room (104 px
  down to 84, smaller nodes under 96) and long details scroll in their own
  box, so board and hotbar strip both fit at 1280x800 and 1280x720 with no
  panel scroll. UI lab sweep of 19 screens at 1280x800: no visible text
  under 10 px. Noscript text says WebGPU. The UI lab loads the fonts too.
- #134 part 1 done: release lock, version, log, report, credits, automatic
  checks. `vite build --mode release` (`npm run build:release`, writes
  `dist-release/`; `bundle-artifact.mjs --release` writes
  `dist-single-release/`, the page to publish) has no debug handle, no
  cheats and no studio scene: the dev-only modules load as stubs and
  `tools/check-release.mjs` reads every shipped script. Other builds keep
  the tools under automation for the checkers. The title shows
  `v1.0.0 (commit)` and has a Credits entry; Settings has an About tab:
  version, Copy report (version, browser, GPU, screen, settings, caught
  errors, this and the last session's log), Save log file, credits (from
  ASSETS.md, grouped by author and site) and the three.js MIT, OFL and CC0
  texts. `core/Log.ts` keeps warnings, errors, boot steps and scene changes
  (500 lines) in storage so a crashed session can still be reported. Only
  the one-page build asks for `packs.json` now (no 404 elsewhere).
  `.github/workflows/checks.yml`: typecheck plus fast checkers, release
  builds plus lock, and `tools/smoke.mjs` on a Mac runner (real GPU through
  Metal): the release build reaches the title, the test build reaches town
  and tier 1, pictures not blank, no page errors. CI run 39301821781 green.
- #134 done: translation layer. `core/I18n.ts` (`tr`, `trn` plurals,
  `trc` patterns, `trk` kept English, `numText`/`numGrouped` number
  style); `src/boot.ts` sets the language before the game loads, then
  imports main. About 9,160 lines wrapped across 150 files;
  `tools/i18n-extract.mjs` lists them in `locales/strings.json` and
  `--template=<code>` starts a language file in `src/locales/`.
  `tools/check-i18n.mjs` (in the fast checks) fails on unwrapped text,
  English matched against shown text, a stale list, and language files
  that lose gaps, tags or plural forms; it also proves maps, items and
  drops come out the same in English and pseudo. Item names are rebuilt
  where shown (`itemDisplayName`): magic from affix words, rare from the
  saved English words, uniques and sets from their defs. Settings,
  Gameplay has Language (test builds add "Pseudo (test)") with a restart
  button. Translator guide: `locales/README.md`. English is the only
  language so far. Known limits: saved text (death records, written quest
  lines, hero names) stays in its first language; built names use one
  pattern each; most counts are not plural-aware (14 are). English
  changes: "0 points" (was "0 point"), crafted magic items show names from
  their current affixes.
- #135 done: Settings. Auto quality reads the screen's refresh rate from
  frame gaps (`core/FramePace.ts`) and aims for the frame cap or 60, never
  above the screen; Video, Display has Full screen, Choose a screen (where
  the browser allows it), Frame cap (Screen, 30, 40, 60, 90, 120, 144, only
  up to the screen's rate) and Brightness; render scale stays; one switch
  per effect the preset has. Window modes and vsync wait for the desktop
  app (Phase 4); the menu says so. Video, Interface: Menu size 80 to 200%
  (CSS `zoom` on `#ui`, `core/UiScale.ts`), HUD size 70 to 150%, Minimap
  size 75 to 175%, each applied when the slider is let go; stylesheets use
  `cqw`/`cqh` and `@container ui`, panels, tooltips, context menus, drag
  ghosts, name tags and the inventory grid convert screen pixels, canvases
  sharpen to `uiRatio()`, and `tools/check-uiscale.mjs` holds it. Audio has
  Ambience, Interface and Voices sliders (own buses) and Mute in the
  background (on by default). Gameplay: Reduced motion also stops the hurt
  warp, fringe and haze; Flash reduction softens the hurt red, the light
  bursts of spells and blows, and the CSS flashes. Controls: mouse buttons
  rebind like keys (left, middle, right, back, forward); the left button
  only ever moves or attacks; Journal (J), Loot filter (O) and Legacy (G)
  are in the list. `check-settings-ui` drives the menu size, a back-button
  binding and the left-click cancel. Next: #136 Engine safety.
- #136 E1 done: three.js hooks. Every place the game reaches inside
  three.js is one entry in `core/ThreeHooks.ts` (16), each hook installs
  only when what it needs is there, `Renderer.init` runs a self-test into
  the log and the bug report, three 0.186.1 and @types/three 0.186.0 are
  pinned exactly, `tools/check-threehooks.mjs` reads node_modules/three for
  every hook's words, and every browser check fails on a missing hook.
  Next: E2 GPU loss Restart.
- #136 E2 done: GPU loss. A lost graphics device holds the game (paused,
  nothing drawn) and offers Restart: a new renderer, and the hero lands in
  town as if the map were left by the menu. "Not now" keeps it held.
  `tools/check-gpulost.mjs` kills the device twice (in a map, then town).
- #136 E4 done: packed textures. `tools/pack-textures.mjs` packs the world
  WebPs into BC7 KTX2 with every mip level made ahead; `npm run build` runs
  it. The game loads the packed file where the GPU reads BC7 and the WebP
  elsewhere: a quarter of the GPU memory, about 3.4x the download.
  `tools/check-ktx2.mjs` holds it.
- #136 E5 done: shipped bodies. `tools/build-meshes.mjs` meshes the select
  heroes, new characters, beasts and townsfolk ahead into
  public/meshes/heroes.bin (10.3 MB), read at boot; anything missing is
  meshed as before. `tools/check-meshes.mjs` holds it.
- #136 E3 done: map memory. three keeps a render record per mesh until the
  mesh or its material is disposed, and shared materials never are, so every
  map stayed in memory (Enemy count 118 to 214, about 300 MB a visit).
  Teardown now sends each mesh its dispose event and `Renderer.forget(scene)`
  drops the rest: the per-scene bind groups, the depth copies the screen
  passes made (now one per target, shared), the motion textures of batched
  meshes, and the loot hero's chase closure that held the last map.
  `check-soak` (6 runs, 4 depths, 31 min): town heap 174 to 218 MB and
  flat over the last three visits, textures 136 to 165, geometry about 310,
  no errors. #136 Engine safety is done.
- #150 Fog out of town and maps (owner: way too much): no fog, mist sheets
  or light shafts; indoor and outdoor shots checked.
- #151 The loading curtain holds until the scene's own textures are in and
  every draw is built (120 s and 180 s caps, 15 s stall guard), with a
  "Painting the halls" step on the bar and a "ready in" log line.
- #152 Title fog out (owner: white haze): no fog, mist or shafts; a dark
  ring fades the ground into the night and the rift has a black backing.
- #153 Blur and hero smear (owner): at full size the temporal blend is
  TRAA, TAAU only below full size (frame weight 0.06); a light RCAS sharpen
  follows it and film grain goes on last. Medium draws at full size. The
  same build measured about 2.8x sharper, average colour unchanged.
  The resting lens fringe now grows from zero at the centre (it had a
  half-pixel floor that put red and blue edges on the hero once sharpened);
  only a hit fringes the middle.
- #154 Red tint on gear the hero cannot wear (owner): `cannotWear` in
  Compare.ts (class, level, strength, dexterity; cached like the upgrade
  arrow) marks bag, stash and shop slots `is-barred`; the art goes through a
  red colour-matrix SVG filter on a red ground. Checked in the bag shot.

- #130 GPU cloth, part 1 (the hero's cape): `art/Cloth.ts` moves a sheet
  of points on the graphics card, one compute pass a frame (Verlet steps,
  edge passes along, across, corner to corner and two apart, a reach limit,
  capsules for the body, the floor, wind with gusts). The draw reads the
  points straight from the buffer, with last frame's for the motion blur and
  the same places for the shadow. The worn cape is drawn as cloth for the
  hero in play (`hero/CapeCloth.ts`): held at the shoulders, kept off the
  back, seat, legs and arms; a Shadow Clone still wears the boned cape. The
  pass keeps its loops as loops: written out it crashed software graphics.
  Checked in a lab page and in town (stand, run, turn).
- #130 GPU cloth, part 2 (boss capes and banners): a boss's sculpt lays its
  capes and banners out as cloth sheets (`ClothSheets.ts`: a cape, a flag on
  a pole, a banner from a crossbar), with the points that are held, how far
  each other point may swing, and what it falls against (back, legs, head,
  the pole). Each boss wears them as cloth in its own paint and colours
  (`CreatureCloth.ts`), moved by the animator once a frame. 17 sheets on 15
  boss looks (14 capes, 3 banners); other monsters keep the baked cape, and
  the boss looks rebake once. A dying boss lets its cloth go limp so it falls
  to the floor; the body it leaves keeps the same cloth for 3 s more, then it
  lies still. The hit flash skips cloth. Fixed on the way: the inside of a
  two-sided sheet was lit as if it faced out (the creature shader now flips
  the normal on back faces). New checker `check-cloth` (every boss sheet:
  held points, reach, bodies on real bones, few points start inside a body).
  Checked in a lab page with Malek (cape, two pole flags), Marshal Harrow
  (crossbar banner) and Gharruth (cape): stand, walk, turn, attack, death,
  corpse; no graphics errors.
- The owner's Phase 2 and Phase 3 list is done (#126). Phase 4 (Steam) waits
  for the owner.
- #157 Speed audit (owner: sluggish since Phase 2+3). Measured with each
  effect switched off in turn and three's own pipeline log. Fixed: a pack
  skeleton sent its whole 64-bone buffer for every draw; it now writes and
  sends only the bones its seated bodies use (`Packs.ts`, BufferNode update
  ranges). Five shader values (viewEye, floorDepth, coverShare, waterRays,
  worldLite) went once per object drawn and now go once per pass
  (`Tsl.ts`, render group). The lantern's shadow map covers its lit cone
  only (focus 0.84): fewer shadow draws, sharper shadows. A warm-up run
  inside one animation frame built no shaders at all (three draws a pass
  once per frame), so a boss area loaded with its textures in made every
  shader in the fight; `Renderer.warm` now advances three's frame each turn.
  Map frame CPU 32 -> 24-28 ms in software rendering, boss 30 -> 28.5;
  boss fight shaders built in play 6-17 -> 1. New hook self-test entries
  for each three.js internal this leans on. Not reproduced: one 1.2 s
  update stall in one boss run (no body was built in it).
- #158 Tiers 1-10 are short maps (owner: you outscale the monsters): an even
  roll between one and two areas and then the boss's (`MapGen.SHORT_MAP_TIERS`,
  `trimChain`). Tier 11+ maps are the same as before. About 30% fewer
  monsters a map at tiers 1-10. check-curve now gives the ranger L18 at
  tier 12 (was L19) and calls it walled there (0 of 3 bosses).
  Corrected (owner): a short map is one floor (its zone or zones end in the
  boss arena) or two (the boss at the end of the second), an even roll.
  `trimChain` may drop the way in on a short map; `levelsForDepth` is 1
  there, so a one-zone map is not given extra monsters. Tier 11+ maps are
  identical to before (same sample of 60 seeds). check-mapflow runs at tier
  12 so it still walks a map with more than one area.
- #159 Bounty board: the reward is sealed (no gold, Renown or item shown);
  rolled on claim from a seed fixed per bounty. Taking or looking no longer
  posts new contracts; abandoning puts one back. "Post new bounties" costs
  (60 + 25 x next tier) gold x 1.5 per repost; being paid posts a fresh board
  free and resets the price. `check-town` covers it.
- #160 Vault: with many tabs the add-tab and sort buttons were pushed out of
  the panel. They sit by the search box now; the tab row scrolls (wheel too),
  fades where there is more, and keeps the open tab in view. Checked with 4,
  12 and 24 tabs.
- #161 Difficulty remake (owner's numbers). Reaver is the baseline; each tier
  is Reaver plus its changes in `data/difficulties.ts`. One `power` per tier
  sets monster and boss life, damage and armour: Wanderer 0.5, Seeker 0.75,
  Reaver 1, Zealot 2, Nemesis 3.5, Damned 6. Rewards: Wanderer and Seeker
  scale XP, magic find, gold and loot quality by the same 0.5 / 0.75; Zealot
  +10% XP, +20 MF, loot quality 1.1; Nemesis +20% XP, +30 MF, 1.5, -5
  resists; Damned +30% XP, +50 MF, 2, +1 attribute point a level, -15
  resists. Every other lever (elite floor and density, extra affixes, pack
  size, damage taken, regen, start gold and points, bonus elite drops) is
  Reaver's on every tier; existing heroes keep points already granted. Loot
  quality (`Loot.rollValue`): each better rung of a line is q times as likely
  and values lean to the top of their range (q 2 lands two thirds up); shops
  and the gambler roll at 1, Reaver rolls exactly as before. Hard-tier MF is
  a flat add like gear; the resist penalty is on fire, cold, lightning,
  poison and arcane (`computeStats`). Card lines are built from the numbers.
- #162 Skills remake (owner), Wave 5 in `PLAN.md`. Order: skillcore alone
  (speed model, item speed, icon size), then seven class streams three at a
  time (sk-knight, sk-mage, sk-rogue, sk-revenant, sk-ranger, sk-paladin,
  sk-shifter), then skillqa (quality, every skill working, frame rate).
  Rules in `PROTOCOL.md` "Wave 5 rules". skillcore launched. Owner: damage
  per hit never changes because of speed (no making up for slower swings);
  only speeds change.
- #169 Hurt cries (022b227): new CC0 female grunts, bank rules (max 1, gap),
  cries spaced 1.1 s (heavy 2.2 s) and skipped under 3% of life. Male too.
- #167 Maps (7ec33dd): deep water, lava and chasm are drawn as hazards with
  a bank line, not as ground (`chartGround` in `ui/ZoneInk.ts`).
- #168 Per hero (8434920): story (contracts, journal) and loot filter live on
  `Character`; camp news stays on the account (`news`). Save v4 copies the
  old shared block onto heroes that already existed. check-story and
  check-save pass.
- #162 Wave 5 done (skillqa 8e0687b). All seven class streams and skillqa
  pushed. check-skills: 203 of 203 active skills pass. Walking (fb675b9) or
  dodging (f8f4350) out of a landed blow owes the rest of the action
  (`Player.restLeft`), so neither speeds attacks. Frame rate holds against
  49ada73 (within 0.3 ms). check-frames fails 8 targets from 18 Oct on the
  old build too (map draws 137 to 198, boss triangles 555k to 952k): older
  than skillqa, cause not found. Walls (curve, information only): Knight
  1, 5, 12; Rogue 40; Revenant 12; Ranger 5, 12; Paladin 5, 12, 25;
  Shapeshifter 12, 40; Mage none. Owner tests in `skillqa.md`.
- #171 Balance pass (owner: unstick walled heroes; players chase sets and
  uniques, not only rares). check-curve now models the chaser by default
  (`--kit=chase`): one clear of every depth through the real drop tables
  (75% of each floor killed, every chest, the bosses before this one), and
  every set piece, unique, charm and dropped weapon found is worn where it
  beats the rare on main-skill damage times hits it can take. `--kit=rare`
  is the old model. Each cell runs in its own process (4 at a time): cells
  sharing one process read differently by order. New `--blame` (with
  `--trace`) shows what each worn piece adds. Fix, class side only: hero
  power starts at level 1 (`EARLY_DAMAGE_PER` 1.10, `EARLY_LIFE_PER` 1.12,
  `sim/HeroPower.ts`); the full rates pass it near level 20 and 23, so the
  deep curve is the same. Chase curve before: 8 of 35 (walled: Knight 1;
  Rogue, Ranger, Paladin, Shapeshifter 5; Ranger 12; untouched: Mage 40,
  Revenant 40). After: 32 of 35, nothing walled; untouched Mage 40,
  Revenant 5 and 40. The chase Mage at depth 40 kills bosses in 1s: set
  and unique elemental damage multiplies with the skill pool (Stormbound
  Sigil alone x2.4). Monsters unchanged. potions, levels, starter-power,
  setpower, passives, economy, rankpower, controls pass.
- #172 Too-easy cells and the depth-12 Ranger (owner: "Apply the fixes",
  weaken the Mage combo). Mage combo, three cuts: energy's elemental bonus
  joins the gear pool instead of multiplying it (`Stats.computeStats`);
  energy past 60 points buys it at strength's rate (`enrElementalFull`,
  `energyElementalPct`); a set piece's added elemental damage lifts no
  higher than a unique's top roll at its level, the rest of its worth going
  to its other lines (`Loot.lineFill`, per line now; owned pieces follow
  through `refreshFixedLines`). Depth-40 Mage: top skill 5.2M to 1.3M a
  second, bosses 1/1/1s to 8/2/5s; still 2x the next class (Revenant,
  Ranger, Paladin 0.6-0.7M). Ranger: War Bow level 16 to 12 (no bow a
  Ranger can draw sat between the Long Bow at 8 and 16, so depth 12 fought
  with half a melee weapon); depth 12 packs 111/40/36s to 22/8/8s, bosses
  0-1/3 to 2/3. check-curve bot: fills cooldowns with its best skill that
  has none (Pierce Shot, Inferno) before the basic attack; casters used to
  stand idle. That alone moved Mage 25 from 57/25/11s to 11/8/3s. Chase
  curve after: 31 of 35, nothing walled; untouched Mage 25 and 40, Revenant
  5 and 40 (lowest life 87-90%, the line is 85%). Monsters unchanged.
  Static checks: 84 of 86 pass (curve as above). check-tactics fails "big telegraphs are
  staggered" (1 of 16 lands within 0.2s of another) on 1260e83 too: older.
- #173 One bonus pile (owner: "It should be one pile"). Every percent
  damage and defence bonus adds into one pile: gear, skill passives,
  statuses, strength and energy (`Stats.combinePercent` sums; it used to
  multiply across sources). A hit carries its pile (`DamagePacket.pile`);
  each "more damage when..." added on the way to the target joins it
  (`Combat.addBonus`) instead of multiplying: passives and Hex Upon Hex
  (`SkillRunner.tune`, `skillEdge`), item powers and Life Tap
  (`PowerRuntime.outgoing`), combos, the Ranger's shot bonuses, the
  Paladin's Toll, a unique's skill bend (`RollOpts.morePct`), area damage.
  The Knight's Tide Leap bleed adds too. Still multiplying on purpose:
  crits, the skill's own damage and synergies, resist piercing, falloff,
  minion stats, item-power trade-offs. Loss measured on the old and new
  code (every class at 12/25/40): about 2% more fight time overall, up to
  10-14% on some bosses (Revenant, Ranger 40, Knight 25). Made up on the
  class side: `DAMAGE_PER` 1.15 to 1.1525, `EARLY_DAMAGE_PER` 1.1 to 1.1015
  (+2% at L16, +5% at L28, +8% at L41); total fight time ends 1% under the
  old. Chase curve after: 31 of 35, nothing walled; untouched Mage 25 and
  40, Revenant 40, Ranger 25 (90-91%; Revenant 5 is challenged now).
  Monsters unchanged. Static checks: 84 of 86 pass (curve as above;
  tactics, the older failure noted under #172).
- #174 Menu remake (owner picked the first mock-up, "without the full bar
  at the bottom"). Menus stand on set sides and never cover the hero:
  Equipment and Skills on the right; Character, Vault, the shops, the
  forge, Contract, Journal and the town NPC panels on the left; map, pause,
  settings and the story screens stay in the middle. Each side panel runs
  from the top to the action bar, 640 px wide, flush to its edge, no
  dragging, no dimming, one per side (`PanelOpts.side`). The camera slides
  so the hero stands in the middle of the free space (`ui:sides`,
  CameraRig). The vault, shops and forge lost their copy of the pack: the
  Equipment bag stores, sells or brings to the anvil on right-click while
  they are open, shows sale prices and rings the anvil item (`BagLink.ts`).
  Skills: details on top at a set height, the board fits under them; the
  hotbar strip went (the HUD hotbar takes drops and right-click clears).
  Journal tabs drop their icons to fit 640. Real frames at 1080p: every
  side panel ends above the action bar and none of them scrolls but the
  Character sheet. Static checks: 84 of 86 (curve and tactics, as under
  #173).
- #180 Side menus cleared the orbs (owner: "They're overlapping the mana
  and health bar"). The HUD measures how high the action bar reaches, the
  orbs' gilt wings included, as `--hud-reach` (HUD `measureReach`, on show,
  resize and scale changes), and side panels stop 16 px above it. Was a
  fixed 152 px, 2 px short of the wings at 1080p. Equipment's hero picture
  went from 0.72 to 0.68 so the panel still fits without scrolling. Real
  frames: 1080p 16 px gap, nothing but Character scrolls; 1366x768 17 px gap.
- #181-#188 Owner batch: Fan Fire gains an arrow per rank and pierces; new
  Pierce Shot look; title columns stand on the floor; side menus grow to
  the orbs on big screens and center their contents; closing a shop,
  stash or anvil closes the Equipment bag it opened; dragging an item or
  skill off a menu no longer walks the hero.
- #189 Ranger holds the bow in both hands at rest: the right hand sits on
  the bow's own axis (`Archery.readyPlaces`, CARRY), so the IK roll does
  not matter; the stance swings both hands together. The string hooks only
  while an action draws (`ActionDef.draws`, gesture key `nock`,
  `Animator.drawing`).
- #190 Splinter Shot and Ricochet lose the shared chevron look: bark chips
  thrust and glance sparks that zig-zag to each next target
  (`rn.chips`, `rn.glance`).
- #191/#193 Skill speed rule (owner: "All skills should use the same
  starting attack speed or cast speed as a default attack"). A skill's
  attack time is its own share (never above 1) of the weapon's basic
  attack time, two blades included; cast time starts at the base cast
  time or less; gear, legacy and buffs scale on top (`Speed.ownAttackShare`,
  `ownCastTime`). The two-blade skill stretch and its damage make-up went.
  Precise Cut runs at 0.8 of a basic attack. Data values above 1 / above
  0.5 s are clamped in code.
- #192 Camera locked on the hero at all times: no cursor look-ahead, and
  within 3 m the view snaps to the hero each frame (the spring only
  carries warps). The side-panel shift that keeps the hero in view stays.
- #194 Flicker after the lock (owner): the view now locks only across the
  ground; height stays on the spring (the hero's feet ride every floor bump
  and the whole picture shook with them). Frame steps are timed by the
  frame's vsync stamp, not when the callback ran, so the locked world no
  longer wobbles with callback jitter. Drag-off-a-menu test: 3 of 3 pass.
- #195 Skills and Character menus remade to fit with no scroll
  (owner). Skills: board and detail card side by side, tree tabs on top,
  points and respec under the board; card holds art, rank bar and pace,
  chips, now-vs-next table, synergies (total on the heading), combo,
  requires/unlocks, buttons pinned at the foot. Prerequisite lines run
  square through the gaps between tiers and down the column lanes, so none
  cross a name. Character: hero band with level medallion, XP bar and four
  run facts; four attribute cards; six-across resist strip; Stats / Your
  build tabs. Short screens (body < 640 px) drop the facts and attribute
  notes and split stats into Offense / Defense tabs. Pictured at 1366x768,
  1920x1080 and 2560x1270 (uilab), rogue and mage.
- #196 Flicker with the hero standing still (owner). The camera was proven
  still frame to frame; the picture was not. three's motion node bakes in
  the projection it holds when a shader is built, and TRAA hands it the
  clean (unjittered) one only while the scene pass draws, so every shader
  the gate built between frames took the jittered one: still pixels "moved"
  by the jitter and every edge shimmered. One clean projection is now kept
  for good (`Renderer.ts`, hook `VelocityNode.projectionMatrix`). Contact
  shadows and AO are laid on before the blend instead of after, so their
  depth marches no longer sparkle at contact edges. Idle town frame to frame:
  edge pixels changing went from 1-4 per mille to only the moving people.
  Also: Shadow Step's view no longer trails (the camera stays locked across
  the ground for any jump), and auto quality's sharpness steps back off
  (the wait doubles) when a step up fails within 30 s.
- #199 Choir of Rot could not be finished (owner): its High Voice backed
  away out of the arena and the boss kneels until it falls. A linked
  partner is now held inside the boss room, is called beside the boss when
  it kneels, and hits on a kneeling boss no longer restart its count and
  warning. check-roomrules passes.
- #200 Characters, townsfolk and monsters still flickered, worst in town
  (owner). three.js keeps a skinned body's last pose in a bone buffer made
  when its shader is built, so every body sharing a look (a pack, the
  townsfolk, the hero and the paperdoll) read the last pose of whichever
  body built it: a body standing still read as moving up to 771 px, temporal
  smoothing threw its history away every frame and it shimmered. Each
  skeleton now keeps its own last pose (`SkinMotion.ts`, hook `Skinning
  previous bone matrices`; packs keep theirs in `Packs.ts`). Paused town:
  greatest motion 771 px to 0.1 px; hero frame-to-frame change 1.9 to 0.35
  (0.14 with no jitter at all). The outline mask now rides the smoothed
  picture's alpha, so it holds still too.
- #203 Stuck in a wall after a hit (owner). A shove moved the hero with no
  wall check; it now slides through the walk check over 0.12 s, at most
  0.45 m, and a hero found inside a wall is set on the nearest open spot.
  Hurt flinch 1 to 0.55, mid-swing stagger 1.4 to 0.8, and it plays only
  for hard hits. Packs never shove (owner); bosses still do. The pack power
  that shoved, now "Heavy-Handed", hits 30% harder instead.
- #201 See-through map shook with the camera locked (owner). It read the
  hero's place on screen before the camera moved for the frame, and drew on
  the UI's own tick; it is now read after the camera is placed and drawn
  right then (`runtime.onView`).
- #197 / #202 Side menus fit short screens (owner). A side panel's contents
  are drawn smaller until they fit its height (`Panel.fitBody`, down to
  60%, refit on any size or content change). Skills keeps its six smallest
  tiers and Character its current stats page as floors, so they shrink
  rather than cut off; Character still splits into tabs first. Blacksmith
  is two even columns: the item with upgrade, socket and materials; the
  rerolls and salvage beside it. Pictured at 1024x600, 1366x768 and
  1920x1080 (uilab); at 1024x600 the Blacksmith still scrolls a little at
  the 60% floor.
- #204 Town minimap marks show quest status (owner): whoever has work to
  give is a larger gold diamond, work to hand in a larger green one, the
  same colours as the marks over their heads (`TownScene.spotMarker`).
- #198 Big monster blows never land together: a meteor's fall and a
  burrower's emerging start a second marked blow when the first lands, and
  the landing schedule never knew of it. Abilities now name it
  (`followUp`); both landings are checked and kept. check-tactics passes and
  is off the known-failures list.
- #205 Portals take [E] (owner: walked into them by accident while looting).
  The way on, the portal home after the boss and the trinket portal to town
  no longer take a hero who walks into them; standing within reach shows an
  [E] prompt and the key takes it (`DungeonScene.tickWays`, which also runs
  the waypoint). A prop in reach still wins the key. The checks that put the
  hero on the exit now press E (mapflow, check-lag, the class tour).
- #206 Menus never move the camera (owner). The side-panel frame shift is
  gone, with its `ui:sides` event: the hero stays in the middle of the
  screen whatever is open.
- #207 Bigger, varied packs (owner: "maps need way more monster mobs",
  "normal mob packs need to spawn in bigger dense numbers", "not every mob
  pack should be the same density"). Plain packs now size by the leader's
  role (`PLAIN_PACK`: swarm 9-16 down to brute 2-4) times a mood roll
  (`PACK_MOODS`: stragglers x0.55, band x1, horde x1.6, throng x2.4), capped
  at 36. Elite packs stay small (rare 3-5, elite 3-6, champion 2-4). Zone
  soft cap 300 + 780 curve, area guard one per ~5 walkable tiles, and
  `AREA_MONSTER_CAP` 720 scales every zone down when an area would pass it.
  Run themes pick a same-role leader on their own stream and size by the
  base pick, so check-themes still sees the same counts. To keep leveling
  pace and loot sane with ~3x the monsters: `crowdXp` (0.4, rising to 0.75
  past tier 25) on kill XP, and normal monsters drop less (gold 0.45x,
  potions 0.07, material 0.075, socketables 0.016). check-density, monsters
  per hundred walkable tiles: 2.6 -> 7.9 (tiers 1-10), 3.5 -> 9.8 (11-20),
  4.0 -> 10.7 (21-30); plain packs 2 to 36, most 3-12. check-economy: gold
  about +30%, items about +35%, levels keep pace (check-levels gap -1..3).
- #208 The see-through map follows the area (owner: kept showing the old
  area). Every area of a map shares one seed, so `MapOverlay` now repaints
  when the level object or its explored grid changes, not the seed.
- #209 One hero shadow under the open sky (owner: two shadows on Gallows
  Fen). `Renderer.applyShadows` finds the casting sun or moon first; while
  one casts, the hero lantern throws none.
- #210 Speed with the bigger crowds. Monster AI asks `entities/Crowd.ts`
  (8 m grid, built once a frame) who is near instead of walking every
  monster; `claimSlot` reads its neighbours' angles once. Monsters past 22 m
  pose every third frame; creature bones skip three's Euler sync; pack draw
  keys are memoized and the per-frame part map is gone. The big one:
  three's `TextureSource.getSize` wrote `undefined` (a depth texture with no
  size yet) into a shared Vector3, and V8 then kept every Vector3 field
  boxed, so each position write made garbage. `core/TextureSize.ts` writes
  NaN instead (hook listed in `ThreeHooks`). Depth 12, 387 monsters:
  garbage per step 656 -> 278 KB, median update 3.4 -> 2.3 ms, p90 9.7 ->
  6.3 ms. check-perf updateMs / alloc KB per step: depth 1 7.7 -> 4.9 /
  585 -> 356, depth 12 10.9 -> 7.5 / 938 -> 458, depth 20 8.0 -> 6.3 /
  704 -> 370. Still over the 6 ms and 200 KB budgets at depth 12 and 20
  (they were before the crowds too); the rest is posing and AI work.
- #211 Black screen on the way to the next area (tester). Not reproduced:
  probes walked every area of tiers 2-25, some mid-fight, with no error and
  the new area drawn each time. `DungeonScene.takeExit` now catches a
  failure mid-load: the curtain always lifts, and an area that did not
  build sends the hero home with the same toast as `Engine.goTo`.
- #212 Cheaper monster posing. `Keys.key` lays compiled key poses (names,
  mirrored names and numbers cached per key object) instead of walking the
  object and renaming sides each frame; `Animator.solve` turns Euler angles
  into quaternions itself and skips unturned bones; the specter's robe bone
  names are built once. In a crowd (over 30 bodies in view) every tier past
  the near ring poses one step slower, and the near ring shrinks from 9 m
  to hold about 30 (never under 4.5 m); bodies posed every few frames are
  spread over those frames. Densest knot at depth 12: 70 -> 60 poses per
  frame, GC 106 -> 46 ms over 90 steps. check-perf depth 12: updateMs 7.5
  -> 5.8 (inside the 6 ms budget), alloc KB per step 458 -> 391.
- #213 Ceiling light shafts read as floating slabs (owner, hive tier 14).
  The camera looks down past the dissolved ceiling, so the cone's bright
  top end showed as a hard lid in mid-air. `buildShafts` now fades each
  cone to nothing at both ends (6 height rings), fades its silhouette edges
  by how square they face the camera, and lays a soft pool of the same
  light on the floor where it lands. `mergeSimple` keeps normals.
- #214 Ground loot cost (owner asked). At depth 12 with 150 drops: update
  0.9 ms with none or all hidden by the filter, 2.8 ms shown; the labels
  were nearly all of it. `GroundLabelLayer` keeps each item on its own
  label, measures new labels after all writes (no forced layout per
  label), and writes transform, class and display only when they change:
  2.8 -> 1.8 ms (p90 6.7 -> 3.6). Drops merge to one mesh per material
  (`compactModel`), still drops stop updating their matrices once landed,
  and `updateLoot` walks only the spinning or bobbing parts.
- #215 Frame cost split (whole frames, densest knot at depth 12, low
  quality, unminified build): getting the picture ready to draw is about
  three quarters of the CPU, the simulation a quarter, layout and style
  about 2 ms. Two cuts on the drawing side. The sun's shadow is drawn from
  inside the frame's own render, which has just worked out every matrix,
  yet each shadow pass's render walked the whole scene again (3,500 nodes
  in a crowd, most of them monster bones): `ShadowCache` now turns that
  walk off for the pass. Its per-frame pass for moving casters also hides
  every subtree with nothing moving in it (found when the still casters
  are marked, found again when one moves or a subtree gains a child), so
  it stops culling the whole level to draw a few bodies. The level's own
  parts (all but the torch lights and drips) are frozen with `freezeStill`
  as the camp's are. Same 80 frames before/after: JS per frame 40.8 ->
  36.9 ms, matrix walks 3.6 -> 1.7 ms, the sun's shadow 5.2 -> 3.5 ms,
  render median 25.4 -> 22.2 ms. Sun shadows are unchanged on screen.
  Monster shadows were already lean (out of view they cast none; packed
  bodies share one instanced shadow draw), so they were left as they are.
  Still the biggest share: per-object uniform updates and uploads (about
  7 ms), which only fewer separate parts per monster will cut.

- #216 Per-frame garbage (owner: "do the garbage"). check-perf now wraps
  its AI timers and runs 300 warm-up steps before it measures, so it reads
  warm code as players run it (wrapping after warm-up threw the scene loop
  back to cold code). Hot lists are reused and written by count instead of
  emptied with `length = 0`, which freed and rebuilt their storage each
  frame (crowd hits, pack lists, plate targets, labels, nameplates), and
  hot for-of loops became index loops. The big one: the HUD's structural
  `probeScene` read `v[0]` of every array it met. Once that ran hot, V8
  turned the number-only arrays it touched into mixed arrays, starting with
  a town light's matrix; the Matrix4 birth site learned it, so 6,603 of
  6,686 town matrices (and every matrix after) did boxed maths. The probe
  now skips matrices: 0 of 6,686. Alloc KB per step, depth 0/12/32:
  121/409/645 -> 54/109/191 (budget 200); update ms at depth 32 7.2 -> 3.2.

- #217 Ground warnings for elites and bosses only (owner: the cast strips on
  the floor cluttered fights). `warnsOnGround` in Abilities.ts: a monster of
  rank 'normal' lays no telegraph decal, either the windup one in
  `Enemy.tryStart` or the ones ability hooks place through `tell()`. Its
  wind-up pose and sound still play, and its hits are unchanged. Champions,
  elites, rares and bosses keep every mark. The tactics stagger case now
  spawns champions, since ordinary brutes leave nothing to measure.

- #218 Ground warnings for bosses only (owner, second thought on #217:
  champions, elites and rares lose theirs too). `warnsOnGround` is now
  `isBoss`; every affix power in `Enemy.tickAffixes` and the other affix
  hooks goes through `tell()`, so they land unmarked. Mini-boss mechanic
  marks (MiniBoss.ts) are left as they were. Tests: the tactics stagger case
  times big windups from `notifyAbility` instead of decals; the elite deep
  powers now require no mark, and their dodge cues read the affix cooldown
  (or the lancer's root) instead of a decal.

- #219 Flurry had no buff chip (owner: "doesn't work or no icon"). It did
  work (browser probe: 6 stacks, attack speed 6.9 -> 54.9%, gone 2 s after
  the last hit) but lived only in `passiveState`, which the buff strip never
  reads. A display-only 'flurry' status (no mods) now rides each landed hit
  with the decay as its clock and the stack count on the chip, and is
  removed when the stacks fall away.

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
