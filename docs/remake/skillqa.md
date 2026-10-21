# Stream: skillqa (Wave 5: quality pass over every class's skills)

Status: in progress

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

- [ ] 1. Before numbers. Take `check-perf` frame numbers once before any
  fix (or use the last numbers in `CHECKPOINT.md` if they are from the same
  scene and settings; say which). Run the static checkers once and list
  every failure.
- [ ] 2. Working. `check-skills` for all seven classes. Every skill fires,
  hits, costs mana, and grows each rank. Read the code behind each failure
  before fixing it.
- [ ] 3. Speed. Spot check, from the code, that every class's basic attack
  and skill times follow skillcore's model (no stray hard-coded seconds,
  nothing faster than the ceiling, caster weapons have no basic attack).
- [ ] 4. Quality. Work through every "For skillqa" note. Icons: unique per
  skill, sharp, class colors (`check-iconmatch`). Melee: own swing per
  skill. Ranged and spells: own projectile and effect. Fix what is below a
  AAA bar.
- [ ] 5. Frame rate. Every new effect has a `warmup()` stand-in; no
  allocation in per-frame code; particle counts follow the quality ladder.
  After numbers from `check-perf` and `check-frames`, same scene and
  settings as before. Frame rate must not drop; make it faster where you
  can (merge draws, reuse buffers, cut overdraw).
- [ ] 6. Handover. List what was fixed, the before and after frame numbers,
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
- Skill passives, buffs, boons and statuses that give speed were not
  retuned by skillcore. Check every one fits under the ceilings in
  `sim/Speed.ts`.
- [x] `check-curve` logs "[feel] hit report failed TypeError: Cannot convert
  object to primitive value" from `CombatFeel.onKill` about 1500 times a
  run. Find the cause and fix it. (e75c312: the sim's effects answer
  `fxScale` with a number. 0 lines in this run's log.)
- [x] The curve bot dodges mid-swing, which cancels heavy blows. Make the bot
  fair (it is a test tool) so the curve reads true. (e75c312: a blow on its
  way lands first when the hit coming lands late enough.)
- `check-economy` fails once on a seeded path ("shapeshifter: no set or
  unique in a whole descent at depth 30"). Drop rates are unchanged. Find
  out whether it is the seed or a real gap and fix the right one.
- Skill icons now bake in idle time 3 s after the town loads; never tested
  in a browser. Check the skill board opens with no stall.
- [x] `check-skills` exits 1 when there is no `shots/` folder; make it create
  it. One class takes about 40 minutes; make it faster if you can without
  testing less. (7d1be27: makes `shots/`, a 480x300 page, and
  `--skills=a,b` audits only those.)
- [x] `check-skillparams` failed on phalanx, vanish, momentum and perfectForm
  (before sk-knight and sk-rogue finished). Rerun once after them. (Passes
  in the first static run.)

Mage (sk-mage, done):
- Dragon's Breath has no fire blast of its own; Winter's Breath has no
  crystal fan.
- Frozen Orb looks like a shard, not a round orb.
- The fire tree's icons need a deeper repaint.
- [x] Pyre Brand has no hit sound. (Its own sear, `skill.fire.brand`.)
- Splintering Frost may be too weak (20% of the dead enemy's life, +1% a
  rank). Compare it with skills in the same tier and make it worth taking.
- Spell looks in motion and real frame time were not checked.

Rogue (sk-rogue, done):
- The new swings and looks were never seen in a running game, and frame
  time was never measured. Nightfall's smoke curtain is the costliest
  (about 60 smoke sprites at High per cast): check it against the quality
  ladder.
- Seven Shadowcraft icons all show a hooded figure, and Silhouette is
  close to The Unseen Blade. Make each one clearly its own.
- `check-skillcost` never ran (it was stopped). Run it once.
- [x] `check-unfinished` flags two statuses, `static` and `rent`, that no code
  applies (older than this wave). Wire them or remove them. (Removed:
  nothing named them.)

Knight (sk-knight, done):
- Gatefall was refused in `check-skills` only because the audit keeps
  statuses between skills (Fortress Stance still had the Knight rooted).
  Clear statuses between skills in the audit (`scenes/debug.ts`) and
  check Gatefall fires.
- Never seen in motion: every new Knight gesture, the Whirlwind walk, the
  Shield Charge run, the Gatefall arc and landing, Massacre's five cuts,
  the standard, the steel arcs, Sworn Brother's ghost look.
- Retribution's stored charge shows only as gold glints at the shield.
  Give it a clear look that reads at a glance.
- Frame time not measured. Watch the standard (three see-through lit
  materials that cast shadows) and Earthshatter (a crack decal and two
  bursts every metre of its 12 m line).
- sk-knight changed `tools/skillsound-entry.ts` and
  `tools/rankpower-entry.ts`; check the changes are sound.

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
- Never seen in motion: every new swing, the rushes (Doorbreaker,
  Confession Thrust, Feint, Last Rites), The Last Hour's bell, Hurl the
  Censer's chain. Frame time not measured.

Revenant (sk-revenant, done):
- Never seen in motion: Bone Storm, Bone Cage, Gravewalk, Soul Cage, Soul
  Tether, Revenant Form and the skull projectile. One `check-perf` look
  with Bone Storm, Bone Cage and Soul Tether all up (about 14 shards, 18
  ribs, 14 hands, 44 links, 3 skulls).
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
- [x] Old Revenant names in `ICON_MAP` (`bone-spear`, `cage` and so on) are
  unused by any Revenant skill. Remove them if nothing else names them.
  (Removed; every skill's icon plan is the same before and after.)

Ranger (sk-ranger, done):
- Never seen in motion: traps, brambles, Kestrel, standing arrows, the
  rains, and the 21 new skills. Frame time not measured; one `check-perf`
  look with Arrow Rain or Darken The Sky up.
- [x] sk-ranger traced the `check-curve` "hit report failed" line: a shared
  line in `CombatFeel.onKill` compares the test harness's stand-in
  `fxScale` to a number. Fix the stand-in or the compare. (e75c312.)
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
- Rake's first swipe waits about 0.3 s (blow at 35% of the action): check
  the cat's flurry feels quick. Killing Dance replays its gesture per
  blow: look for a hitch between blows.
- [x] Worry's wrench and Reaping Swipe's pull: the end point is not checked
  against props smaller than the step. Make sure a pulled body never ends
  inside a wall or prop. (e75c312: every `knock` slide stops at a wall or
  a prop it was not already against, `Enemy.knockBlocked`.)
- The first change into each form should no longer hitch (warmed in
  `DungeonScene.warmup()`); confirm with a fresh shapeshifter.
- [x] The curve tool error: `tools/sim-effects.ts` answers every read with a
  function, so `this.effects.fxScale >= 0.9` in `CombatFeel.onKill`
  throws. Give the stand-in a number for `fxScale`. (e75c312.)
- Never seen in motion: claw scores, jaws, Reaping Swipe's ring, Ursa
  Major's stars, the pack's fog, the four rushes. Frame time not measured
  (Bloodmoon, Bristle and Slink's bursts plus four claw trails and a
  Reaping ring at once).

## check-skills results so far (from each stream, one run each)

Mage 33/33, Rogue 25/25, Knight 25/26 (Gatefall refused by a leftover
root, see above), Paladin 32/32, Revenant 30/30, Ranger 31/31,
Shapeshifter 26/26. One class takes about 40 minutes. Do not rerun a class
that passed unless your fixes touch its skills; then rerun only that class,
once, after all your fixes for it. Run Gatefall on its own after the audit
clears statuses between skills.

## Next up

Milestone 1: check-perf "before" from the build at 49ada73 (built in
the scratchpad worktree `old49`, served with `SLAY_OUTDIR`), once the
static run is done. Then work down the unticked "Known issues".

## Notes for resume

- Recovery: 7d1be27 and e75c312 (an earlier skillqa run) were read
  against the code; every change is sound and its items are ticked above.
- A scratch probe (`tools/press-entry.ts`, not committed, delete at the
  end) casts every active skill in the sim and lists what lands on the
  key press. Only press families (rush, leap, blink, channel, form) plus
  Vanish (an escape) still do.
- Static checkers, first run (after the recovery commits): curve 11 of 35
  walled (information only), economy (shapeshifter depth 30), beats
  (feint REFUSED); the rest of the list is in the log.
- `check-curve` walled after the recovery commits: warden d1, d5, d12;
  revenant d12; ranger d5, d12; paladin d5, d12, d25; shapeshifter d12,
  d40. Mage and rogue clear.

## For the owner to test

(empty)

## Handover

(empty)
