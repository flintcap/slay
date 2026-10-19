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
- #130 done except GPU cloth: block, parry and dodge moves; creatures take
  shadows; robes and long hair on spring chains (`Swing.ts`); forearm twist
  bones; corpses baked to still meshes; far monsters swap to a 40 % copy
  (`creatureDetail`, size on screen per preset); shadow bodies from thinned
  copies; the hero's face and hands thinned for play (`playSkin`); same-look
  monsters share one draw per pack (`Packs.ts`). GPU cloth for capes and
  banners is "later" in the owner's list: it goes after #136.
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
