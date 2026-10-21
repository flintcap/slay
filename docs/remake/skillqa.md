# Stream: skillqa (Wave 5: quality pass over every class's skills)

Status: done

Goal (owner): after skillcore and all seven class streams are done, send
everything through quality checks: AAA quality, every skill working, and
frame rate not reduced (faster where it can be). Fix what falls short
before the wave is called finished. You may edit any file for a fix; you do
not redesign kits.

**Owner: fix every issue, do not just list it.** Every item under "Known
issues" below and every item in each stream's "For skillqa" is yours to
fix before the wave is done. Only two kinds of item stay with the owner:
numbers listed under "For the owner to test" that are a matter of taste,
and heroes walled by the slower speeds (the owner decides that after the
wave; never raise damage to make up for speed, never touch monsters). If a
fix truly cannot be made, write why in "Notes for resume" and in the
handover, one line each.

Runs alone, last. Port 4359. Start only when `skillcore.md` and every
`sk-*.md` say `Status: done`. Read each one's "For skillqa" and "For the
owner to test" first.

Checkers: `node tools/run-checks.mjs` (the fast static set, once at the
start and once at the end). Browser, one at a time, wrapped in
`flock /tmp/slay-browser.lock timeout`: `check-skills` (all seven classes,
in two or three runs), `check-perf`, `check-frames`, and one small contact
sheet per class only where a "For skillqa" note asks for a look. Run
`node tools/get-chrome.mjs` once before the first browser check.

## Milestones

- [x] 1. Before numbers. Take `check-perf` frame numbers once before any
  fix (or use the last numbers in `CHECKPOINT.md` if they are from the same
  scene and settings; say which). Run the static checkers once and list
  every failure. (Taken fresh from the build at 49ada73, before any
  skillqa commit: `check-perf --preview`, default depths, seed 424242,
  warden level 30. Software rendering, so draw calls read 1; what counts
  is the update step, allocation, programs and scene counts:

  | depth | monsters | updateMs | worst | allocKB/step | programs | meshes | textures | shadowLights |
  |---|---|---|---|---|---|---|---|---|
  | 0 town | 0 | 1.1 | 2.8 | 159.2 | 0 | 300 | 139 | 1 |
  | 1 | 80 | 2.4 | 13.1 | 255.9 | 0 | 581 | 156 | 3 |
  | 6 | 125 | 4.0 | 16.3 | 330.5 | 0 | 699 | 152 | 2 |
  | 12 | 136 | 3.5 | 19.4 | 350.8 | 0 | 737 | 159 | 2 |
  | 20 | 167 | 5.0 | 12.2 | 446.2 | 0 | 807 | 153 | 2 |
  | 32 | 348 | 4.3 | 7.9 | 515.9 | 0 | 1632 | 170 | 2 |

  It already failed six budgets there (depth 1 shadow lights, allocation
  at every depth below the town): older than this wave. A 22 s browser
  check overlapped depths 20 and 32. Static checkers, first run: beats,
  economy, i18n, rankpower, unfinished (all fixed, see below), tactics
  (fails at 49ada73 too: monster AI, not a skill) and curve (information
  only: the walls).)
- [x] 2. Working. `check-skills` for all seven classes. Every skill fires,
  hits, costs mana, and grows each rank. Read the code behind each failure
  before fixing it. (All 203 active skills work: Mage 33, Knight 26, Rogue
  25, Paladin 32, Revenant 30, Ranger 31, Shapeshifter 26. The one refusal,
  Umbral Ambush, was the audit's: fixed in 851d52f. Growth with rank is
  `check-rankpower`, which passes.)
- [x] 3. Speed. Spot check, from the code, that every class's basic attack
  and skill times follow skillcore's model (no stray hard-coded seconds,
  nothing faster than the ceiling, caster weapons have no basic attack).
  (Every source sums into one attack and one cast percent, then
  `speedMultiplier` and the ceilings in `basicTime`, `skillPace` and
  `castSeconds`; see the speed item under Known issues. The only fixed
  action times left are the shared leap's 0.34 s and blink's 0.26 s,
  movement like the dodge, on purpose. Class runners time every action
  from `attackTime`, `castTime` or their contact frame. `basicAttack`
  refuses a wand, staff, orb or a focus in bare hands, as `castsOnly`
  does; a Paladin's scepter is a mace. After the lead's fb675b9 (walking
  out of a swing owes the rest of it, `restLeft`), every other way an
  action ends early was checked: the evade was the one left. Dodging out
  of a blow that had landed, or a spell that had let go, freed the hands
  for the next attack at the dodge's end; it now owes the rest as walking
  does, while a dodge before the blow lands owes nothing (the blow is lost,
  a spell's mana comes back). New check-controls case. Dash skills,
  channels (fixed length), release casts (`keepAction`), Riposte (a
  gesture only) and the Paladin's answer (a full action of its own) do
  not shorten anything.)
- [x] 4. Quality. Work through every "For skillqa" note. Icons: unique per
  skill, sharp, class colors (`check-iconmatch`). Melee: own swing per
  skill. Ranged and spells: own projectile and effect. Fix what is below a
  AAA bar. (Every "For skillqa" note and Known issue below is fixed and
  ticked. `check-iconmatch` passes; the fire tree, Sparkbolt, Inferno
  Stream and four Shadowcraft icons were repainted to be their own. In
  every class's audit each skill plays its own clip, `skill.<id>`, and its
  own sound. Looks in motion were shot for every class; below the bar and
  fixed: the breaths (a slab, now a wedge with their own jets), Frozen Orb
  (a shard, now a ball), Retribution's charge (glints, now a light), the
  Knight's standard (five meshes, now three).)
- [x] 5. Frame rate. Every new effect has a `warmup()` stand-in; no
  allocation in per-frame code; particle counts follow the quality ladder.
  After numbers from `check-perf` and `check-frames`, same scene and
  settings as before. Frame rate must not drop; make it faster where you
  can (merge draws, reuse buffers, cut overdraw). (New looks: the orb and
  crystal solids are warmed by `solids.standIns()` and hidden while empty;
  the jets and Retribution's light are emitters in the shared particle
  field, which scales by quality and clips at the frame budget; the glow
  and the cone jet reuse their option objects and vectors. Faster: the
  Knight's standard is three draws, not five; the skill board's icons
  encode off the main thread.

  `check-perf --preview` after, build of 851d52f, same seed and hero:

  | depth | monsters | updateMs | worst | allocKB/step | programs | meshes | textures | shadowLights |
  |---|---|---|---|---|---|---|---|---|
  | 0 town | 0 | 1.1 | 7.2 | 157.5 | 0 | 300 | 139 | 1 |
  | 1 | 80 | 5.1 (2.7 rerun) | 12.9 | 259.1 (216.4) | 0 | 583 | 156 | 3 |
  | 6 | 125 | 3.3 | 8.3 | 261.0 | 0 | 701 | 152 | 2 |
  | 12 | 136 | 3.8 | 15.5 | 345.5 | 0 | 739 | 159 | 2 |
  | 20 | 167 | 6.8 (7.1 rerun) | 20.4 | 434.7 (452.8) | 0 | 809 | 153 | 2 |
  | 32 | 348 | 5.4 (9.3 rerun) | 8.5 | 512.1 (667.9) | 0 | 1634 | 170 | 2 |

  Allocation, programs, textures and lights are the same as before; the
  two more meshes are the hidden orb and crystal pools. The update step
  swings with the fight and the machine: the old build (49ada73) run
  again now read 5.8 at depth 20 and 9.9 at depth 32 (4.3 before). Depth
  20 read higher twice, so it was split by system on both builds in the
  same scene with the heap sampler off: median 2.6 old, 2.9 new; mean 3.38
  and 3.65. The 0.27 ms is spread over systems no skillqa change touches
  (pack draws +0.10, name plates +0.05) as much as the particle field
  (+0.14): the fight's own spread, not a drop.

  `check-frames` on the published bundle, this build and the old build
  (49ada73) back to back with the same tool: both fail the same 8 checks
  against the baseline of 18 October (`tools/perf-frames.json`, not
  re-saved). Draw calls: town 255 and 255, map 194 (198 old), boss 141
  (147 old); triangles the same; pipelines made while playing the same
  (the hero's eyes, mouth and shorts in town, four monster pack
  materials on the map); uploads the same. Update p50 town 1.4 (1.3),
  map 5.1 (4.4), boss 4.0 (3.2): one run each, the same spread as above.)
- [x] 6. Handover. List what was fixed, the before and after frame numbers,
  and "For the owner to test" (one line per class: what to try and what
  should happen). Set `Status: done`, push.

## Known issues (lead, from the reports so far; add each stream's as it lands)

Shared code:
- [x] The shared area-effect code puts a blank buff on the caster.
  (7d1be27: the `aoe` branch buffs only skills in `SELF_POWER` or
  `SELF_BUFF_STATUS`.)
- [x] Area damage falls to 65% at the edge and no tooltip says so. Say it, or
  drop the falloff. (Said: `data/areaFalloff.ts` lists the 33 skills, the
  skill board shows a line under each, check-rankpower keeps the list
  true. The falloff stays: dropping it raises area damage about 30%.)
- [x] Spells and throws that still resolve on the key press instead of on the
  gesture's release (`SkillRunner.atRelease`). sk-mage moved the Mage's;
  find every other class's that remain. (7d1be27: Rogue, Ranger, the
  shifter's howls and buffs. This run: Shield Throw and the Paladin's two
  vows. A probe casting every skill found no other. Vanish, rushes, leaps,
  blinks, channels and form changes go on the press on purpose.)
- [x] Dodging after the key press and before a spell lets go still spends the
  mana. Charge on release, or give it back when the cast is cancelled.
  (7d1be27: `SkillRunner.refund` gives mana and cooldown back.)
- [x] Skill passives, buffs, boons and statuses that give speed were not
  retuned by skillcore. Check every one fits under the ceilings in
  `sim/Speed.ts`. (They all do, by construction: gear, passives, buff and
  boon statuses are summed into the hero's attack and cast percent
  (`computeStats` clamps each to -75..200), Flurry's and Storm Fury's
  stacks are added in `Player.attackSpeedPct`/`castSpeedPct`, and the
  total goes through `speedMultiplier` (soft cap +100%) and the rate
  ceilings in `basicTime`, `skillPace` and `castSeconds`. Nothing scales
  an action's time on its own.)
- [x] `check-curve` logs "[feel] hit report failed TypeError: Cannot convert
  object to primitive value" from `CombatFeel.onKill` about 1500 times a
  run. Find the cause and fix it. (e75c312: the sim's effects answer
  `fxScale` with a number. 0 lines in this run's log.)
- [x] The curve bot dodges mid-swing, which cancels heavy blows. Make the bot
  fair (it is a test tool) so the curve reads true. (e75c312: a blow on its
  way lands first when the hit coming lands late enough.)
- [x] `check-economy` fails once on a seeded path ("shapeshifter: no set or
  unique in a whole descent at depth 30"). Drop rates are unchanged. Find
  out whether it is the seed or a real gap and fix the right one. (The
  seed: a deep descent yields about four, mean over 60 seeds, so one
  descent comes up empty about one time in fifty. 08ec36e judges sets and
  uniques over the last five descents; fewer than five there is a gap.)
- [x] Skill icons now bake in idle time 3 s after the town loads; never tested
  in a browser. Check the skill board opens with no stall. (It did not
  finish: on a busy page the idle calls came once a second, one icon each,
  and the PNG encode was most of each bake. The warm-up now paints on its
  own canvas and encodes with `toBlob`, off the main thread, its calls are
  capped at 120 ms like the item pump, and the first tree goes first.
  Probe on the built game, software drawn: the mage board's first open
  after 15 s in town baked 0 icons and its long task fell from 187 ms to
  91 ms, the panel's first layout. A board opened 0.3 s after arrival
  still bakes its own, as before.)
- [x] `check-skills` exits 1 when there is no `shots/` folder; make it create
  it. One class takes about 40 minutes; make it faster if you can without
  testing less. (7d1be27: makes `shots/`, a 480x300 page, and
  `--skills=a,b` audits only those.)
- [x] `check-skillparams` failed on phalanx, vanish, momentum and perfectForm
  (before sk-knight and sk-rogue finished). Rerun once after them. (Passes
  in the first static run.)

Mage (sk-mage, done):
- [x] Dragon's Breath has no fire blast of its own; Winter's Breath has no
  crystal fan. (The cone pours a jet of its own from the mouth: `mg.gout`,
  pressurised flame with a white throat, sparks and soot, and
  `mg.rimespray`, glass ice and frost. Winter's Breath's motif is now ice
  crystals pushing up out of the floor across the wedge, near rows first.)
- [x] Frozen Orb looks like a shard, not a round orb. (A new `orb` body:
  a faceted ball of ice, the shard's own ice, tumbling in the frost glow.)
- [x] The fire tree's icons need a deeper repaint. (sk-mage also: Sparkbolt
  and Chain Lightning differ only by the arc.) (`art/MageGlyphs.ts`: one
  picture per fire skill, no flame variants left: Firebolt's dart,
  Fireball's great ball, Ember Nova's flung tongues, Scorch's melted
  shield, Inferno Stream's jet, Kindling's crossed logs, Blast Wave's shock
  rings, Pyroclasm's row of fountains, Combustion's cracked body, Heat
  Shimmer's rising lines, Firestorm's meteors, Searing Core's rising
  chevrons, Dragon's Breath's head and gout, Cataclysm's three blazes,
  Annihilate's implosion, Ember Soul's flame over a drained crystal, the
  fire rune for the mastery. Sparkbolt is a spark jinking along a broken
  path.)
- [x] Pyre Brand has no hit sound. (Its own sear, `skill.fire.brand`.)
- [x] Splintering Frost may be too weak (20% of the dead enemy's life, +1% a
  rank). Compare it with skills in the same tier and make it worth taking.
  (Now 30% +2% a rank in 3.5m. Combustion, a tier lower, bursts on every
  kill for 80% of a hit; Charnel Burst, an active, is 45% +4%.)
- [x] Spell looks in motion and real frame time were not checked. (Shot in
  the built game, two frames each, 0.3 s and 0.7 s after the cast: Frozen
  Orb's round ice ball tumbles out with its frost; Firestorm's meteors
  trail in and the floor burns; Winter's Breath raises its rows of
  crystals. The cones were wrong: every breath (Dragon's, Winter's, any
  spell cone) drew a ribbon as wide at the hands as at the far end, a
  flat slab of flame. The beam now fans from the mouth (`B.w` in
  `makeBeams`), so the breath reads as a wedge. Frame time: check-perf
  after, below.)

Rogue (sk-rogue, done):
- [x] The new swings and looks were never seen in a running game, and frame
  time was never measured. (Shot: Nightfall's ring pulses and violet
  ground under its falling smoke, Fan of Knives' and Knife Halo's steel,
  Shadow Clone's double rising in its circle. All read. Frame time:
  check-skillcost above, check-perf after below.)
- [x] Nightfall's smoke curtain is the costliest (about 60 smoke sprites at
  High per cast): check it against the quality ladder. (It is on it: the
  particle field scales every crowd layer by the quality's `fxScale` (0.35
  Low, 0.6 Medium, 1 High, 1.4 Ultra) and the pressure valve, drops the
  `rich` smoke layer below High, and clips at the frame budget. About 90
  sprites at High for 2 s, 45 at Medium, 26 at Low.)
- [x] Seven Shadowcraft icons all show a hooded figure, and Silhouette is
  close to The Unseen Blade. Make each one clearly its own. (Three keep a
  hood, where the skill is the hood or the double: Veil, Vanish, Shadow
  Clone. Shadow Legion is eyes at every depth of the dark, Mirror Gambit
  a cracked mirror with a blade in the glass, Silhouette a knife through a
  ring of smoke, The Unseen Blade a shut eye over a blade of light.)
- [x] `check-skillcost` never ran (it was stopped). Run it once. (Ran once
  for the Rogue, 28 skills, software drawn: a plain frame is about 1.3 s,
  every skill's worst frame 1.24 to 2.28 s, no single cast stands out. The
  six Shadowcraft rows after Shadow Clone run about 0.7 s heavier: the
  tool recasts every 5 frames, so up to four clones (cap 6, warmed) are
  still walking through the next rows. The checker fell back to the Knight
  without a word when given `rogue` (the id is `shadowblade`); it now
  refuses an unknown class and times each skill against a no-cast row,
  first and last.)
- [x] `check-unfinished` flags two statuses, `static` and `rent`, that no code
  applies (older than this wave). Wire them or remove them. (Removed:
  nothing named them.)

Knight (sk-knight, done):
- [x] Gatefall was refused in `check-skills` only because the audit keeps
  statuses between skills (Fortress Stance still had the Knight rooted).
  Clear statuses between skills in the audit (`scenes/debug.ts`) and
  check Gatefall fires. (7d1be27 clears them; run alone it fires, plays
  its clip, hits and deals damage: working 1 of 1.)
- [x] Never seen in motion: every new Knight gesture, the Whirlwind walk, the
  Shield Charge run, the Gatefall arc and landing, Massacre's five cuts,
  the standard, the steel arcs, Sworn Brother's ghost look. (Shot:
  Whirlwind's spinning steel, Shield Charge's run, Massacre's broad cuts,
  Earthshatter's crack and dust, the Banner of the Gate going up with its
  gold ring. All read. Gatefall's arc and Sworn Brother are for the
  owner's eye: the audit shows Gatefall lands and hits.)
- [x] Retribution's stored charge shows only as gold glints at the shield.
  Give it a clear look that reads at a glance. (A warm gold light now
  holds on the shield's face, growing with the charge, with sparks lifting
  off the rim; the glints stay. One new emitter, `kn.retribution`, in the
  shared particle field.)
- [x] Frame time not measured. Watch the standard (three see-through lit
  materials that cast shadows) and Earthshatter (a crack decal and two
  bursts every metre of its 12 m line). (The standard is one per Knight;
  its five meshes are now three, one per material, so three draws and
  three shadow draws. Earthshatter is cheap: its cracks go to the one
  ring-buffered decal layer, its bursts are small (6 and 5) through the
  particle field's quality ladder and frame budget, and it allocates
  nothing per frame.)
- [x] sk-knight changed `tools/skillsound-entry.ts` and
  `tools/rankpower-entry.ts`; check the changes are sound. (Both sound: a
  leap's hit plays where Gatefall lands; the summon read waits, at most
  half a second, for the standard's body to rise on its release frame.)

Paladin (sk-paladin, done):
- [x] Consecrated Ground's unique gives "+25% damage", but the skill deals no
  damage, so that line does nothing. Give it a line that works. (Its dead
  line is gone and its real ones grow more: 40% area, 35% slow, 50% attack
  slow, named so. Three more uniques had the same dead line, on War Cry,
  Amplify Damage and Rattling Roar; fixed the same way, and
  `check-uniques` now fails a damage bend on a skill with no damage.)
- [x] Saint's Reach has no cap: Mercy Stroke's x8 hit carries x2.4 into the
  enemy behind. Cap it. (It carries at most double a plain cut's share:
  x0.6 at 30%. The tooltip says so.)
- [x] Never seen in motion: every new swing, the rushes (Doorbreaker,
  Confession Thrust, Feint, Last Rites), The Last Hour's bell, Hurl the
  Censer's chain. Frame time not measured. (Shot: Doorbreaker's lunge, The
  Last Hour's great bell dropping in its dust ring, Hurl the Censer's
  impact cracking the floor. All read.) (sk-paladin fears Doorbreaker's
  lane most, a dust look every 0.05 s while running, then the great bell's
  landing.) (Cost, from the code: the lane is one 5-sprite dust burst a
  tick through the particle field's ladder and budget, about 50 sprites a
  run at High; the bell's landing is two bursts, two decals, two
  particle-free rings and one flash, and the bell is warmed. Both cheap.)

Revenant (sk-revenant, done):
- [x] Never seen in motion: Bone Storm, Bone Cage, Gravewalk, Soul Cage, Soul
  Tether, Revenant Form and the skull projectile. One `check-perf` look
  with Bone Storm, Bone Cage and Soul Tether all up (about 14 shards, 18
  ribs, 14 hands, 44 links, 3 skulls). (Shot: Bone Storm's shards
  wheeling round the hero, Bone Cage's ribs rising, Gravewalk's violet
  burst and ring. Update step timed the way check-perf does, 30 steps in
  the busiest room at depth 3, 118 monsters: median 1.5 ms before, 1.4 ms
  with Bone Storm, Bone Cage, Soul Tether and Soul Cage all up; worst
  step 6.3 and 14.3 ms.)
- [x] Blinded, silenced and disarmed still root monsters (their `control`
  holds set `rootTimer`); only fear and confusion were freed. Free them
  the same way unless the status means to hold the body. (e75c312: only
  holds that incapacitate or immobilise pin; blind stops a monster finding
  you past arm's length, silence leaves only its plain blow.)
- [x] Corpse Explosion and Sanguine Nova have no hit sound (the sound checker
  forbids one); Doom's burst replays its cast sound. Give each a real
  sound, and fix the checker rule if it is what stops it. (Each has a new
  cast take and plays its burst where it goes off; Doom's blast is its
  own take. `check-skillsound` allows a hit for these three effects.)
- [x] (sk-revenant) Reassemble keeps a minion sound it can never play (the
  checker asks every `minion` skill for one). (Row and take removed; the
  checker no longer asks it of `minion.heal`, which raises nothing.)
- [x] Old Revenant names in `ICON_MAP` (`bone-spear`, `cage` and so on) are
  unused by any Revenant skill. Remove them if nothing else names them.
  (Removed; every skill's icon plan is the same before and after.)

Ranger (sk-ranger, done):
- [x] Never seen in motion: traps, brambles, Kestrel, standing arrows, the
  rains, and the 21 new skills. Frame time not measured; one `check-perf`
  look with Arrow Rain or Darken The Sky up. (Shot: Arrow Rain's ring and
  standing arrows, Darken The Sky, Spike Trap. The kestrel is two small
  feathers circling high, too small to judge at the shot's size: for the
  owner. Update step with Arrow Rain and Darken The Sky both up, 114
  monsters: median 1.7 ms before, 1.9 ms during; worst 5.6 and 6.6 ms.)
- [x] sk-ranger traced the `check-curve` "hit report failed" line: a shared
  line in `CombatFeel.onKill` compares the test harness's stand-in
  `fxScale` to a number. Fix the stand-in or the compare. (e75c312.)
- [x] (sk-ranger) `ASSETS.md` and `tools/audio/ledger.json` disagree on six
  `player.female.hurt*` rows. (They agree now: both credit the same pack;
  the audio build rewrites them from the ledger with no change.)
- [x] `check-beats` fails on other classes' skills. Run it and fix each.
  (Every failure was the sweep, not a skill: it now counts the cast and
  travel beats from the gesture's release or contact frame, waits out what
  a prerequisite left running, lifts a rooting stance, lays a body for
  Charnel Burst, and lets no blow miss. 203 of 203 pass.)

Shapeshifter (sk-shifter, done):
- [x] Game wide: knockback tooltips say metres, but `Enemy.takeHit` pushes
  knockback x 0.35, so every "knocks back N m" reads about three times too
  far. Make the text and the push agree. (e75c312: the push is
  `KNOCKBACK_METRES` a point, a short slide stopped by walls and props;
  the two Ranger shoves that name 1.5 m now push 1.5 m. No other text
  names metres for a packet shove.)
- [x] Bristle's HUD text shows the base 30% reflect, not the ranked number.
  (e75c312: buff chips read the application's own magnitude, mods, ward.)
- [x] The character panel's attack speed shows the weapon's pace, not the
  beast's (`FORM_PACE` in `data/shifterPower.ts` is read by the runner and
  `ui/AttackEstimate.ts`, not by `CharacterPanel.ts`). (The panel knows no
  live form, so its hint lists the cat, wolf and bear rates.)
- [x] Rake's first swipe waits about 0.3 s (blow at 35% of the action): check
  the cat's flurry feels quick. Killing Dance replays its gesture per
  blow: look for a hitch between blows. (Feel is the owner's call; both
  are under "For the owner to test". From the code: Rake's first blow is
  the gesture's contact frame and the next two sit on its own cut keys;
  Killing Dance restarts its gesture each blow with a 0.04 s crossfade,
  each gap 12% shorter than the last. Shot: the black cat in the pack,
  Killing Dance's scores across the bodies.)
- [x] Worry's wrench and Reaping Swipe's pull: the end point is not checked
  against props smaller than the step. Make sure a pulled body never ends
  inside a wall or prop. (e75c312: every `knock` slide stops at a wall or
  a prop it was not already against, `Enemy.knockBlocked`.)
- [x] The first change into each form should no longer hitch (warmed in
  `DungeonScene.warmup()`); confirm with a fresh shapeshifter. (Under
  "For the owner to test": software drawing cannot time a hitch.)
- [x] The curve tool error: `tools/sim-effects.ts` answers every read with a
  function, so `this.effects.fxScale >= 0.9` in `CombatFeel.onKill`
  throws. Give the stand-in a number for `fxScale`. (e75c312.)
- [x] Never seen in motion: claw scores, jaws, Reaping Swipe's ring, Ursa
  Major's stars, the pack's fog, the four rushes. Frame time not measured
  (Bloodmoon, Bristle and Slink's bursts plus four claw trails and a
  Reaping ring at once). (Shot: Rake's cat in the pack, Killing Dance's
  scores. Reaping Swipe, Ursa Major, Bristle and Bloodmoon are form skills
  the probe's shape could not cast; check-skills fires every one, and
  their look is for the owner. Update step with Slink and Killing Dance
  running through a pack of 72: median 1.6 ms before, 3.3 ms during, the
  dance's own swings; worst 12.3 and 28.5 ms, the second over four kills
  and their drops. Mage for comparison, Dragon's Breath, Frozen Orb and
  Firestorm up: median 0.9 to 1.9 ms, worst 21.2 ms over nine kills.)

## check-skills results so far (from each stream, one run each)

Mage 33/33, Rogue 25/25, Knight 25/26 (Gatefall refused by a leftover
root, see above), Paladin 32/32, Revenant 30/30, Ranger 31/31,
Shapeshifter 26/26. One class takes about 40 minutes. Do not rerun a class
that passed unless your fixes touch its skills; then rerun only that class,
once, after all your fixes for it. Run Gatefall on its own after the audit
clears statuses between skills.

skillqa's runs, on the build of 4ac72fd (and 851d52f for the reruns):
Mage 33/33, Knight 26/26 (Gatefall fires), Rogue 24/25 then 25/25
(Umbral Ambush was refused: the audit clears statuses between skills, so
the hero was never veiled for a skill struck from the veil; the audit now
veils him for it, 851d52f, and it fires), Paladin 32/32. On 851d52f:
Revenant 30/30, Ranger 31/31, Shapeshifter 26/26.

## Next up

Nothing: every milestone is ticked and the stream is done.

## Notes for resume

- Recovery: 7d1be27 and e75c312 (an earlier skillqa run) were read
  against the code; every change is sound and its items are ticked above.
- A scratch probe (`tools/press-entry.ts`, never committed, now deleted)
  cast every active skill in the sim and listed what lands on the key
  press. Only press families (rush, leap, blink, channel, form) plus
  Vanish (an escape) still do.
- Static checkers, first run (after the recovery commits): curve 11 of 35
  walled (information only), economy (shapeshifter depth 30), beats
  (feint REFUSED); the rest of the list is in the log.
- `check-curve` walled after the recovery commits: warden d1, d5, d12;
  revenant d12; ranger d5, d12; paladin d5, d12, d25; shapeshifter d12,
  d40. Mage and rogue clear.
- Static checkers, last run (f39bce2, after the lead's fb675b9 and the
  dodge fix): 84 pass, 2 fail. tactics 1 of 12 (monster AI, fails at
  49ada73 too). curve 12 of 35 walled: the same eleven plus the Rogue at
  depth 40 (bosses 0 of 3), first seen after walking and dodging stopped
  bringing the next swing sooner.

## For the owner to test

- Knight: take Retribution, block a few hits; a warm gold light should
  grow on the shield's face. Gatefall while Fortress Stance holds you
  should say "Rooted" and spend nothing; once the stance ends it should
  leap and land.
- Mage: Dragon's Breath and Winter's Breath should pour a wedge from the
  hands, narrow at the mouth, wide at the end, with crystals rising for
  Winter's. Frozen Orb should fly as a round ball of ice. Open the skill
  board after a few seconds in town: no stall.
- Rogue: the Shadowcraft icons should each be their own picture (only
  Veil, Vanish and Shadow Clone keep a hood). Cast Nightfall at Low and at
  High: the smoke should thin at Low with no frame drop.
- Paladin: Mercy Stroke with Saint's Reach should carry at most x0.6 to
  the enemy behind. Consecrated Ground's unique should grow its area and
  slows, with no damage line.
- Revenant: Corpse Explosion, Sanguine Nova and Doom should each sound
  where they burst.
- Ranger: Kestrel should circle, small and high; judge whether it reads.
- Shapeshifter: Rake's first swipe (about 0.3 s in) should feel quick;
  Killing Dance should flow with no hitch between blows; the first change
  into each form on a fresh hero should not hitch. Look at Reaping Swipe's
  ring and Ursa Major's stars, which no probe here could catch.
- Every class: swing, and dodge just after the blow lands. The next swing
  should not come any sooner than if you had stood still.

## Handover

Fixed (every Known issue and "For skillqa" note above is ticked; the
commit is named beside each):
- Shared: release frames for every class, mana and cooldown back on a
  cancelled cast, the audit clears statuses (7d1be27); knockback slides as
  far as it says and stops at walls and props, blind and silence leave
  monsters their legs, live buff tooltips (e75c312); Shield Throw and the
  vows on release, area falloff named on the board (bb6a734); falloff list
  matches the runner, two dead statuses removed (b616597); four uniques'
  dead damage lines, Saint's Reach capped, beast pace on the character
  panel (732194b).
- Speed: walking (the lead's fb675b9) and now dodging (f8f4350) out of a
  landed blow owe the rest of the action, so neither brings the next
  attack sooner. Damage per hit unchanged.
- Looks: the breaths pour their own jets and fan as a wedge (52abbb1,
  7f31199); Frozen Orb is a ball (b381812); Retribution's light (7c8b34e);
  the Knight's standard in three meshes (5e6b2e2).
- Icons: the fire tree, Sparkbolt, Inferno Stream and four Shadowcraft
  icons repainted (69f77df, b9efa9d); the skill board's icons bake off the
  main thread before it opens (e3b1f9c).
- Sound: Charnel Burst, Sanguine Nova, Doom and Pyre Brand sound where
  they land (f7405f7); Reassemble's dead minion sound gone (397d852).
- Numbers: Splintering Frost worth a tier five point (be7e7d9).
- Tools: the beats sweep reads release frames and fair setups, 203 of 203
  (eb5cf6d); economy judges sets and uniques over five descents (08ec36e);
  the curve's hit-report error and the fair bot (e75c312);
  `check-skillcost` refuses an unknown class (7195d72, 189a81a); the skill
  audit veils the hero for Umbral Ambush (851d52f); old Revenant icon
  names removed (7995efa).

Not fixed, and why (one line each):
- `check-tactics` 1 of 12: monster AI, fails at 49ada73 too, not a skill.
- `check-perf` budgets over (depth 1 shadow lights, allocation at every
  dungeon depth): present at 49ada73, before skillqa, and the same after.
- `check-frames` fails 8 against its 18 October baseline (map draws 137
  to 198, boss 112 to 147, boss triangles 555k to 952k, map uploads 990
  to 3173 KB, monster pack and hero pipelines made while playing): the
  same at 49ada73, before skillqa, so not from this stream; the baseline
  is older than the speed stream's last work and every Wave 5 stream, and
  which change moved each number was not traced here (for the lead).

Walled heroes (`check-curve`, information for the owner; damage and
monsters untouched): Knight d1, d5, d12; Rogue d40; Revenant d12; Ranger
d5, d12; Paladin d5, d12, d25; Shapeshifter d12, d40; Mage clear.

Frame numbers (tables under milestones 1 and 5): allocation, programs,
textures, lights and draws the same or lower after; the update step read
higher at some depths and lower at others, and the old build run again
beside it swings as far (depth 32: 4.3 then 9.9 ms on the same build).
Split by system in the same scene, the update step is within 0.3 ms of
the old build, in systems skillqa did not touch as much as in ones it
did. `check-frames`: the same 8 failures as the old build (see above).

Left for `finish`: the owner's tests above, the owner's call on the
walled heroes, and the lead's look at the `check-frames` numbers.
