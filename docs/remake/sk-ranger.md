# Stream: sk-ranger (Wave 5: Ranger skills remake)

Status: in progress

Class: Ranger (code id `ranger`). Trees: Marksman, Wildcraft, Volley (`marksman`, `wildcraft`, `volley`). Port 4356.
Fights with ranged: bows with a quiver (starts with a short bow). Class color: moss green (`0x7fc46a`).

Goal (owner): fix every Ranger skill and remake the kit to a AAA
standard. Keep the skills that are good, change the ones that are close,
replace the ones that feel lackluster, and add new skills where the kit has
a gap. Fix everything about the rest. Speeds stay near the feel of
similar classes in Diablo II and Path of Exile (our own numbers and names,
never theirs).

Milestones 1 and 2 (skill audit and new kit plan) only read code and write
in this file, so they may run while skillcore is still working. Milestone 3
on needs skillcore: if `skillcore.md` does not say `Status: done` when you
finish milestone 2, push your file, set `Status: waiting for skillcore`, and
end with one line saying so; you will be resumed. Once it is done, read its
"Handover" and `CONTRACTS.md` first: time every skill through skillcore's
fields and speed function, never with new hard-coded seconds. Do not touch
code before skillcore is done.

Your files (Wave 5 file ownership in `PLAN.md`): the `MARKSMAN`, `WILDCRAFT` and `VOLLEY` sections of `src/data/skills.ts`, plus your own
class's branches and entries in `src/scenes/SkillRunner.ts`,
`src/art/hero/SkillActions.ts`, `Swing.ts`, `Actions.ts`,
`src/fx/SkillLooks.ts`, `src/art/SkillIconArt.ts`, `src/art/Glyphs.ts`,
`src/data/skillPower.ts`, `src/audio/SkillSounds.ts`, `src/data/skillBends.ts`,
and the unique and set lines that name your skills. New effect files under
`src/fx/` are best. Never reformat or reorder another class's part of a
shared file.

Checkers (only what you touch): `node tools/run-checks.mjs --only=rankpower,skillparams,stattext,i18n,skillsound,iconmatch,skilldepth,passives`
and `curve` once at the end for your class only
(`node tools/check-curve.mjs --classes=ranger`). Browser, one at a time, at
most once per milestone: `check-skills --classes=ranger`, and if you must
look, one small contact sheet. Run `node tools/get-chrome.mjs` once before
the first browser check.

## Class notes

- Check bow fire rate under skillcore's model: base and at the ceiling.
  Multi arrow skills must not multiply into a wall of arrows that costs
  frame rate.
- The Ranger's three trees use only 11 of their 18 slots each (21 open
  slots). This is the class with the most room to add new skills.
- The ranger at depth 12 in `check-curve` was borderline before this wave.
  If slower fire rate walls it, note the numbers for the owner; do not
  raise damage per hit to make up for it, never touch monsters.

## Milestones

- [x] 1. Skill audit (read code only). ("wip(sk-ranger): skill audit table") For every skill, read its data, its runner code, its
  swing or cast animation, its effect, its icon and its sound, and answer
  in one table under "Notes for resume":
  - Does it work? (read the code; flag anything broken)
  - Melee: does it have its own swing, not a shared one?
  - Ranged and spells: does it have its own projectile, motion and effect?
  - Is the attack or cast too fast?
  - Is the icon unique to the skill, sharp, and in class colors?
  - Do the projectile, swing and effect look AAA?
  - Keep, change, or replace, with one line why.
- [x] 2. Plan the new kit ("sk-ranger: skill audit and new kit plan") (owner: change, add and replace skills where
  needed). Write the list under "Notes for resume": skills to keep, skills
  to change (what changes), skills to replace (the new skill's idea in one
  line) and new skills to add (where they go, their idea in one line).
  Each tree has 6 tiers x 3 columns = 18 slots (`tier` 1..6, `column`
  0..2 in `src/types.ts`); read `src/data/skills.ts` (or the class file)
  for how many are used. A full tree gains a skill only by replacing one.
  Keep prerequisites, synergies and capstones whole. Our own names and
  ideas, never copies. Then check `skillcore.md`: if it is not done, follow
  the waiting rule above.
- [x] 3. Speed audit (owner: before any skill is changed). ("sk-ranger: speed audit, Ranger skills in their own file") Under skillcore's model, write a table
  under "Notes for resume": the Ranger's basic attack (or, for a caster,
  its default cast) and every skill's real time per use, with no speed gear
  and at the speed ceiling, next to the feel of similar classes in the two
  reference games. Mark each one too fast, right, or too slow, and fix the
  numbers through skillcore's fields. This comes before any change to a
  skill. Owner rule: damage per hit never
  changes because of speed. A skill you slow down keeps the damage per hit
  it has today.
- [x] 4. Build. ("sk-ranger: build") Make the changes, replacements and new skills from the
  plan. Every skill, old and new:
  - works, with its tooltip telling the truth (`check-skillparams`,
    `check-stattext`)
  - gets stronger every rank (damage, strength, time, size), not only
    cheaper or faster (`skillPower` lines, `check-rankpower`)
  - melee: its own swing animation with a clear wind up, hit and follow
    through, timed to the skill's speed
  - ranged and spells: its own projectile or cast effect, motion and hit
  - its own sound (`check-skillsound`)
  - mana only, no new resources; caster weapons have no basic attack
  - synergies, skill bends and the uniques and sets that name it still
    point at real skills and real settings
  - old saves stay safe: removed or moved skills refund their points and
    leave the hotbar (check that `src/sim/Character.ts` still does this for your ids)
  - all player text through `tr()`, then extract strings (`check-i18n`)
- [x] 5. Icons. ("sk-ranger: icons") Repaint every icon so it is unique to its skill, sharp at
  skillcore's icon size, and in class colors, with each tree's own accent.
  Readable at hotbar size: one clear shape, strong light and dark.
- [x] 6. Effects quality and cost. ("sk-ranger: effects cost") Projectiles, swings and hit effects look
  AAA in the game's dark and gritty style. No allocation in per-frame code;
  particle counts follow the quality ladder; every new effect pipeline has
  a stand-in in `warmup()` in `src/scenes/DungeonScene.ts`, so nothing
  compiles on first cast.
- [ ] 7. Check. `check-skills --classes=ranger` once (one retry if it fails,
  then note it) and `check-curve --classes=ranger` once, for
  information. If a depth is walled that was not before, do not raise
  damage per hit to make up for slower speed and never touch monsters:
  write the before and after numbers under "Notes for resume" for the
  owner to decide.
- [ ] 8. Handover. Fill "For skillqa" (what you could not check: looks in
  motion, real frame time, any effect you fear is costly) and "For the
  owner to test". Set `Status: done`, push.

## Next up

Milestones 1 to 6 are done (audit, plan, speed table, build, icons,
effects cost). The
Ranger's skills live in `src/data/classSkills/ranger.ts`; what they do is
in `src/scenes/ranger/` (`RangerMoves.ts` the switch, `Shots.ts` every bow
shot, `Traps.ts` traps, brambles and the kestrel), their effects in
`src/fx/ranger/`, their sounds in `src/audio/RangerSounds.ts` and
`tools/audio/rangerTakes.mjs`. On resume:

1. Setup as in `PROTOCOL.md`.
2. Milestone 7: `check-skills --classes=ranger` once, then `check-curve
   --classes=ranger` once; numbers under "Notes for resume".

### Milestone 6 notes (2026-10-21)

- Per frame, nothing allocates now: the trap, thicket and mark ticks read
  the living targets into a kept list (`targetsInto`), a thicket makes its
  slow once, and the kestrel's strike burst uses kept options. The FX
  pools (stuck shafts 14, spikes 18, thorns 16, trap looks 14, one bird)
  are fixed; past a pool the oldest piece goes.
- Quality ladder: every Ranger burst goes through the particle field,
  which scales it by `fxScale` and drops `rich` layers below High. The
  rains were scaled by `fxScale` a second time (a Low rain was an eighth
  of an Ultra one); now `rainVolley` takes a density (1 a rain, 3 Darken
  The Sky) and the field alone trims it. Multi-arrow skills stop at 24
  arrows a loose (`arrowsOf`).
- Warm-up: nothing to add. The Ranger owns no mesh or material; he draws
  through the shared pools (particles, solids, ground glows, beams for the
  wire, ribbons for trails, cores for Explosive Tip). Solids, beams and
  cores have stand-ins in `EffectSystem.standIns()`; the hidden pools are
  shown for the compile in `Engine.prime`.
- Checkers: rankpower, skillparams, stattext, i18n, skillsound,
  skilldepth, passives, vfx, hits, feel pass; beats fails only on other
  classes' lines.

### Milestone 5 notes (2026-10-20)

- Sixteen painted Ranger glyphs in `src/art/RangerGlyphs.ts` (54 forms),
  one picture per skill in `src/art/icons/rangerIcons.ts` (`rn-` keys).
  The ring is moss-stained bow wood lit in the class moss; `TREE_LOOK`
  gives Marksman bone white on hunter's red, Wildcraft amber on bark
  brown, Volley sky grey on steel. Poison and cold keep their element's
  light.
- Looked at on one contact sheet (`node tools/art-sheet.mjs ranger,dupes`,
  a `ranger` sheet added to `tools/art-sheet-page.ts`): 0 same-tree
  duplicate pictures. Redrawn after the first look: Through and Through
  (three foes run through), Suppressing Fire (a stream with gaps), Lay of
  the Land (spikes out of a lit footprint), Kestrel (wings half open).
- The old shared keys (`arrow`, `target`, `quiver` ...) stay in `ICON_MAP`
  for the statuses and panels that still name them.

### Milestone 4 notes (2026-10-20)

- Bends checked against the code: Brace of Larks (`twinShot` `count`),
  Skipping Stone (`ricochet` `bounces`, `range` = Carom's hop), The Long
  Drizzle (`arrowRain` `radius`, chill rider), Quarrybreaker
  (`explosiveTip` `radius`), Featherfall (`fanFire` `count`), The Overcast
  (`darkenTheSky` `radius`, blind rider), The Trapper's Gauntlets
  (`snareTrap` `radius`, `root`), The Trapper's Last Belt (`theWholeFloor`
  `radius`, root rider). Every knob is read; riders ride every packet.
- Nothing was removed, so nothing refunds. `STARTING_SKILL` (`pierceShot`)
  and `STARTING_SKILL_HINTS` (all tier 1) still hold.
- Checkers passing: rankpower, skillparams, stattext, i18n, skillsound,
  iconmatch, skilldepth, passives, wiring, unique, uniques, hits, status,
  save, starter, starter-power, feel, coverage, vfx, hotbar, legacy,
  release, rules, threehooks. `beats` and `unfinished` fail only on other
  classes' known lines (no Ranger skill in them).
- `ASSETS.md`: the audio build rewrote six `player.female.hurt*` credit
  rows from `tools/audio/ledger.json`; I put the old rows back. The ledger
  and ASSETS.md disagree on those six files (not mine to settle).

## Notes for resume

### Milestone 1: skill audit (read from the code on 2026-10-20)

How the code runs a Ranger skill today (all in `src/scenes/SkillRunner.ts`
`castNow` unless named; pre-skillcore numbers):

- Every bow skill (`projectile`, `bolt`, `meteor`, `beam`, `cone`, `chain`,
  `nova`) takes `castTime = 0.5 / (1 + CAST speed %)`: 2.0 a second with no
  gear. Attack speed (Quick Draw, Cold Focus, Volley Mastery, bow base
  speed) never reaches a bow skill. Buffs take `castTime x 0.7` = 0.35 s.
  Dashes are `Player.dodge`: Roll Away 6 m in 0.48 s, Disengage 8 m in 0.5 s.
- Basic attack (bow): `0.46 / (1 + attack speed %)` = 2.17 a second; the
  short bow's own 1.35 a second is ignored. Reference (skillcore audit):
  bow 1.15-1.5 a second base, 2.3-3.0 at the ceiling. So every Ranger shot
  is 1.3-1.7x too fast today, and at the clamp (+200%) the basic is 6.5 a
  second.
- Release: bow gestures are release gestures (`hit` unset), so
  `contactDelay` is 0: the arrow leaves at the press and the clip is bent
  so its release frame lands 0.1 s in. Gestures are authored 0.55-1.0 s
  long and squeezed into the 0.5 s action.
- Arrows: every Ranger arrow is the same `Body.Arrow` solid with the same
  thin `arrow` wake (`Effects.projectile`); only its speed and a motif
  (`SKILL_MOTIFS`, drawn once in front or at the target) differ. Skill
  arrows take `size: radius 0.42`, so they are drawn about 1.75x the basic
  arrow. Skills with no `speed` fly at the default 17 m/s, slower than the
  basic arrow's 30 (Bleeding Arrow, One Shot, Hunter's Mark).
- Damage: a skill with no `dmg` ladder still hits for 100% weapon damage
  (+8% a rank, `burstGrowth`) when its family deals damage, so Hunter's
  Mark and Snare Trap carry hidden damage. `meteor` hits for `makePacket(1.4)`
  (hidden x1.4; `ui/AttackEstimate.ts` does not know).
- Pierce: `pierce > 0` flies to the first wall and then hits everything on
  the line at once (`lineDamage`, kind `beam`) when the arrow arrives, not
  as it passes each enemy.
- Venom Coat poisons only packets of kind `projectile` (`coated`), so only
  the basic arrow and single-arrow skills.
- Body: every Ranger active has its own gesture in
  `src/art/hero/gestures/ranger.ts` (no plain moves, no shared clip).
- Icons: every Ranger icon is a shared glyph plus modifier (`ICON_MAP` in
  `src/art/SkillIconArt.ts`), in the Ranger frame (wood ring, grain, light
  `0xc8d890`, a pale yellow green, not the class moss `0x7fc46a`). No tree
  accent, no painted icon of its own. Size 128 px.
- Sounds: every active has its own cast sound (and hit sound for shots) in
  `src/audio/SkillSounds.ts`. Passives make none. Nothing missing.
- Trees: tiers 1 to 5 only, 11 of 18 slots each (tier 4 and tier 5 hold
  one skill each, tier 6 is empty). The three "capstones" sit at tier 5
  column 1 as actives (max 5), so `CAPSTONES` (tier 6, column 0) has no
  Ranger entry and nothing past level 24 is ever unlocked.

"Speed" is with no speed gear. "Icon dup" names another skill drawing the
same pictogram plan.

#### Marksman

| Skill | Works? (code) | Body | Projectile / effect | Speed | Icon | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Pierce Shot `pierceShot` (T1, default right click) | Yes: flies to the first wall (22 m) and hits the whole line at once on arrival; Venom Coat skips it (kind `beam`) | Own gesture (wide base, full draw) | Plain arrow at 34 m/s + wedges line | 0.5 s on cast speed: too fast | `arrow` (own) | Keep; each enemy hit as the arrow passes, coats ride it, own heavier shaft |
| Hunter's Mark `huntersMark` (T1) | Half: shoots an arrow at the first enemy on the line for a hidden 100% weapon hit (+8% a rank), then marks it: every resistance -12 (+1.5) for 12 s, from everyone, not "12% more from you". The `marked` status text promises +15% crit chance, which no code gives | Own gesture: two fingers point, yet an arrow flies out | Plain arrow at 17 m/s + hoops pulse | 0.5 s | `target` (own) | Change: no arrow, no hidden damage, lands on the enemy under the cursor, text true, the mark jumps on when its target dies |
| Steady Hand `steadyHand` (T1) | Yes | Passive | - | - | `eye` = Rogue Night Eyes | Keep; own icon |
| Aimed Shot `aimedShot` (T2) | Yes: always crits below half life (`executeBelow`, `skillEdge`) | Own gesture (kneel, slow draw) | Plain arrow at 40 m/s + hoops converge | 0.5 s like every shot: "Slow" in the text is false | `target:1` = Rogue Deadly Aim | Change: a real slow heavy draw (skillcore's time factor), heavy arrow and impact |
| Bleeding Arrow `bleedingArrow` (T2) | Yes: Hemorrhage 6 s | Own gesture (canted snap from the hip) | Plain arrow at 17 m/s + blood spray line | 0.5 s | `drop` = Knight Artery | Keep; barbed arrow with a blood wake at bow speed |
| Long Eye `longEye` (T2) | No: text says +2% a metre past 6 m up to 30%; code is a flat +3.3% to +27% damage at any range | Passive | - | - | `bow` (own) | Change: code does what the text says |
| Punch Through `punchThrough` (T3) | Yes (flat damage; text true) | Passive | - | - | `arrow^impact` (own) | Keep |
| Crippling Shot `crippling` (T3) | Yes: Crippled 4 s, 35% (+3%) slower, -80 defense | Own gesture (leaning, aimed low) | Plain arrow at 32 m/s + scuffs zigzag | 0.5 s | `trap`: a snare picture for an arrow | Keep; arrow dips to the legs, own icon |
| Cold Focus `coldFocus` (T3) | Yes; its attack speed reaches only the basic arrow | Passive | - | - | `target^impact` (own) | Keep |
| Headshot `headshot` (T4) | Yes | Passive | - | - | `skull` = Revenant Raise Skeleton, Rogue Lethality | Keep; own icon |
| One Shot, One Grave `oneShot` (T5 "capstone") | Half: "your first attack on a full-health target always crits" exists nowhere; it is an active piercing shot, 550% (+80%), cooldown 26 s, max 5, flying at 17 m/s | Own gesture (the longest draw) | Plain arrow + crosses pulse | 0.5 s, same as Pierce Shot | `apex` = Whole Floor, Darken the Sky, Rogue Apex Predator | Change: the tier-6 ultimate (max 20), text true, a long draw, its own shot |

#### Wildcraft

| Skill | Works? (code) | Body | Projectile / effect | Speed | Icon | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Roll Away `rollAway` (T1) | Yes: 6 m roll, 0.3 s untouchable, +20% move 1.5 s (+0.1 s). The dodge every hero has, plus a run | Own gesture (tucked roll) | Scuffs trail | 0.48 s dash | `boot^speed` (the shared `dash`) | Change: you come up with an arrow nocked (next shot crits) |
| Snare Trap `snareTrap` (T1) | BROKEN: not a trap. A `nova` at the hero's feet at the press (aim point ignored), a hidden 100% weapon hit, roots 2.5 s (+0.2 s) within 2 m. `duration: 30` (trap life) unread as such | Own gesture (kneel, cord jerked) | Physical ring + hoops ring round the hero | 0.5 s | `trap^field` | Change (rebuild): a trap set at the aimed point that arms and waits; no damage |
| Light Foot `lightFoot` (T1) | Yes | Passive | - | - | `boot` = Rogue Fleetfoot | Keep; own icon |
| Spike Trap `spikeTrap` (T2) | BROKEN: the same instant nova at the hero, 220% in 2.6 m; `duration: 25` (meant as trap life) becomes a 25 s Bleeding (`SKILL_STATUS`) the text never names | Own gesture (fist hammered on a stake) | Ring + bone spikes rise at the hero | 0.5 s | `spikes` | Change (rebuild): a pressure plate at the point, spikes on trigger, the bleed stated |
| Thorn Barrier `thornBarrier` (T2) | Half: a 7 m cone blast, no barrier; poison 60%, Slowed 8 s, 2 Bleeding (true for what it does) | Own gesture (hands into the soil) | Green flame cone (the poison breath look) + thorns wall | 0.5 s | `leaf^burst` | Change: a bramble wall across the aimed point that lasts and hurts what crosses |
| Survivalist `survivalist` (T2) | Yes | Passive | - | - | `heart` = Rogue Hemotoxin | Keep; own icon |
| Disengage `disengage` (T3) | Half: leaps 8 m back and looses at the first enemy ahead, but `Player.dodge` turns the body to face the leap, so the bow draws away from the arrow | Own gesture (loosed mid-leap) | Plain arrow + leaves trail | 0.5 s dash | `boot^rise` (the shared `leap`) | Change: keeps facing the enemy through the leap; arrow leaves on the release |
| Venom Coat `venomCoat` (T3) | Half: only kind `projectile` hits poison, so Pierce Shot, One Shot and Suppressing (line), Arrow Rain (area), Ricochet (chain) and Scattershot (melee arc) never do | Own gesture (arrow dipped and studied) | Thorns orbit at the cast; arrows show nothing | 0.35 s | `vial` = Rogue Coat Blades | Change: every arrow skill carries it; coated arrows trail green |
| Camouflage `camouflage` (T3) | Half: "Stand still" is not in the code; it is the Rogue's Veil (`veiled`) with other numbers; `critBonus: 100` read but it has no hit | Own gesture (squat behind the bow) | Leaves converge | 0.35 s | `figure^aura` = Rogue Veil | Change: its own idea: stand still to vanish, again and again inside a window |
| Trap Mastery `trapMastery` (T4) | Yes (all skill cooldowns; text true) | Passive | - | - | `gear` | Keep |
| The Whole Floor Is A Trap `theWholeFloor` (T5 "capstone") | Half: an 8 m nova at the hero, 240% (+35%); no trap is involved | Own gesture (turn, caltrops strewn) | Ring + saws scatter | 0.5 s | `apex` (shared) | Change: the tier-6 ultimate: sets off every trap you have out, then the ring |

#### Volley

| Skill | Works? (code) | Body | Projectile / effect | Speed | Icon | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Twin Shot `twinShot` (T1) | Yes: 2 arrows 0.14 rad apart (+Volley Mastery); both can hit one target up close | Own gesture: two draws and two looses, but both arrows leave together at the press | Two plain arrows + feathers fan | 0.5 s, no cooldown | `arrow:2` | Change: each arrow leaves on its own loose |
| Quick Draw `quickDraw` (T1) | Half: its attack speed reaches only the basic arrow | Passive | - | - | `feather^speed` | Keep (skillcore puts bow skills on attack speed) |
| Scattershot `scattershot` (T1) | Half: no arrows fly: a `cone` (floor wedge, dust) and an instant arc of kind `melee` (0.8 rad x 8 m); leaves Blinded (`SKILL_STATUS`), text silent | Own gesture (crouched hip draw) | Floor wedge + arrows fan | 0.5 s | `arrow:2^burst` | Change: real short arrows sprayed, a shove back, text names what it leaves |
| Arrow Rain `arrowRain` (T2) | Yes, but hits for 1.4x its ladder (hidden in `meteor`) | Own gesture (drawn at the sky) | 9 falling arrows (x quality), one hit when the first lands | 0.5 s | `arrow^rain` | Change: honest ladder (x1.4 moved into it, same damage), more arrows in a staggered fall |
| Ricochet `ricochet` (T2) | Half: every bounce lands at the press; all bounce arrows fly at once from their points; bounces skip `afterHit` | Own gesture (bank-shot lean) | Plain arrows between targets | 0.5 s | `arrow^chain` | Change: legs in sequence, each lands on arrival; rename (Ricochet is a PoE notable) |
| Fan Fire `fanFire` (T2) | Yes: 5 arrows over 0.8 rad (+Volley Mastery) | Own gesture: three draws, but all five leave at the press | Plain arrows + arrows burst | 0.5 s | `dagger:2` = Rogue Fan of Knives (daggers for arrows) | Change: one flat sweeping release, own icon |
| Suppressing Fire `suppressing` (T3) | Half: the whole 18 m line is hit at the press, before its three arrows arrive; Slowed 20% 4 s and Exhausted 8 s (text true) | Own gesture (four half-draws) | Three plain arrows | 0.5 s, no cooldown | `beam` = Mage Fire `stream`, Lightning, Revenant | Change: arrows leave one by one and hit as they pass; a stream you hold |
| Explosive Tip `explosiveTip` (T3) | BROKEN: no area: `pointDamage` with `radius: 3` hits only the nearest enemy; `radius` also sizes the shot, so a fire core about 10 m across (3 x 3.4) flies instead of an arrow | Own gesture (head struck alight on the thigh) | Giant fireball + flares | 0.5 s | `nova^burst` = Mage Fire `burst` | Change: a burning arrow that bursts for area fire on the first enemy |
| Endless Quiver `endlessQuiver` (T3) | Half: counts only `projectile`/`bolt` shots; Arrow Rain, Ricochet, Suppressing, Scattershot never count | Passive | - | - | `quiver` | Change: every bow skill counts |
| Volley Mastery `volleyMastery` (T4) | Yes: +1 arrow per 5 ranks, Twin Shot and Fan Fire only | Passive | - | - | `arrow:2^multi` | Keep; text names what it touches |
| Darken The Sky `darkenTheSky` (T5 "capstone") | Yes, but the same 9-arrow rain spread over 12 m (thin), x1.4 hidden, the sky does not darken | Own gesture (emptied at the sky twice) | 9 arrows over 12 m | 0.5 s | `apex` (shared) | Change: the tier-6 ultimate: a dark sky and a dense staggered fall (instanced) |

Summary of what is broken or untrue today: Snare Trap and Spike Trap (not
traps, at your feet, hidden damage, a 25 s bleed), Explosive Tip (one
target, a 10 m fireball), Hunter's Mark (an arrow with hidden damage, text
and status text untrue), Long Eye (no range in it), One Shot (capstone
rule missing), Camouflage (no standing still; a Veil copy), Venom Coat,
Endless Quiver (half the bow skills miss them), Disengage (faces the wrong
way), The Whole Floor (no traps), Thorn Barrier (no barrier), Scattershot
(no arrows, a hidden blind). Timing: every multi-arrow skill (Twin Shot,
Fan Fire, Suppressing, Ricochet) lands all its arrows at the press while
the body loosens them one by one; every pierce line hits at once on
arrival. Too fast: every bow skill at 0.5 s on cast speed, the slow shots
(Aimed Shot, One Shot) most of all. Shared looks: one arrow for every shot;
icons from the shared glyph set, nine of them drawing another skill's
picture (`eye`, `vial`, `fan`, `stream`, `burst`, `heart`, `boot`, `skull`,
`target:1`, `drop`, `figure^aura`, plus `apex` three times). Names: only
Ricochet is a PoE name.

### Milestone 2: the new kit

Every tree has 11 of 18 slots: tiers 1 to 3 are full, tier 4 and tier 5
hold one skill each, tier 6 is empty. Every other class uses the same
shape for tiers 4 to 6, and the Ranger now does too: tier 6 column 0 a
capstone passive that changes how the tree plays, column 1 the tree's
ultimate active, column 2 its mastery. So each tree gains seven skills
(21 in all: 9 actives, 12 passives) and the three old tier-5 "capstones"
move up to tier 6 column 1 as the ultimates (max 5 becomes 20, like every
other tier-6 active).

Ids stay the same for every skill already in the game, so saves keep their
ranks. Nothing is removed, so nothing needs a refund. A skill moved up a
tier keeps its ranks on load (`repairCharacter` does not re-check tier
gates); that only ever gives the player more room, never less.

Rules for every build item below: time every skill through skillcore's
per-skill fields and speed function (never new hard-coded seconds); damage
per hit stays what it is today (where a hidden factor moves into a ladder,
the hit stays the same and only the text becomes true); every rank grows
damage, strength, time or size (`skillPower.ts`, `check-rankpower`); text
through `tr()`; our own names. Numbers below are starting points to tune
in milestone 4, not promises.

Shared engine (new files, so `SkillRunner.ts` only gains a small hand-off,
as the Paladin's `paladin/*` does):

- `src/scenes/ranger/Shots.ts`: one arrow flight for every Ranger shot.
  Each enemy is struck when the arrow reaches it (not at the press, not
  when it reaches the wall); pierce by count; glance off walls (for Bank
  Shot); split on a kill (Murmuration); every hit carries Venom Coat and
  counts for Endless Quiver, Close Grouping and Long Eye. Multi-arrow
  skills loose each arrow on its own release time. Hard cap of 12 arrows
  from one cast, 12 scattered arrows in the air.
- `src/scenes/ranger/Traps.ts`: traps are set at the aimed point, arm after
  a beat, wait, and go off when an enemy steps within reach; a cap of how
  many of each may be out (oldest goes); The Whole Floor sets them all off.
- `src/fx/ranger/*`: arrow looks per skill (shaft, head, wake), trap
  bodies (noose and bent sapling, pressure plate, stakes and wire, wasp
  nest), the bramble wall, the kestrel, the darkened sky. Every pipeline
  gets a stand-in in `warmup()`.
- `src/sim/passives/ranger.ts` for the new passives' numbers (as
  `passives/paladin.ts` does), read at the few choke points that need them
  (`tune`, `strike`'s kill branch, `Player.takeDamage` for Bolt-Hole).

#### Keep as they are (code works, idea is good)

Steady Hand, Punch Through, Cold Focus, Headshot; Light Foot, Survivalist,
Trap Mastery; Quick Draw, Volley Mastery (text names the skills it
touches). Each still gets its own icon (milestone 5).

#### Change

Marksman:
- `pierceShot` (default right click): each enemy on the line is struck
  when the arrow passes it; Venom Coat rides it; its own long heavy shaft
  and a thin pale wake.
- `huntersMark`: no arrow and no hidden damage. It lands at once on the
  enemy under the cursor (or the nearest within 3 m of the aim point): a
  red hoop over it. Text tells the truth: all its resistances -12 (+1.5 a
  rank) for 12 s. When it dies marked, the mark jumps to the nearest enemy
  within 10 m with the time it had left. The `marked` status text says
  what it really does (Revenant streams do not use it; checked
  2026-10-20).
- `aimedShot`: a real slow, heavy draw (skillcore's attack time factor,
  about 1.4x a plain shot). Damage per hit unchanged. A thick dark shaft,
  a white streak, a hard stop and a shove on impact.
- `bleedingArrow`: flies at bow speed (not the default 17 m/s); a barbed
  head with a blood wake.
- `longEye`: code does what the text says: +2% damage a metre past 6 m,
  up to a cap that grows with rank (3.3% at rank 1 toward 30%), measured
  from you to the target when each arrow lands.
- `crippling`: the arrow dips to the legs; a leg-shot impact low on the
  body. Own icon.
- `oneShot` (One Shot, One Grave): moves to tier 6 column 1 as the
  Marksman ultimate (max 20; the ladder and cooldown stay, the floor
  reached sooner). Text tells the truth: one arrow from the longest draw
  (skillcore factor about 1.8x), 550% (+80%), always a critical hit,
  pierces everything on 30 m, double damage to a target at full life. A
  black shaft with a long fading streak, a crack of light where it
  passes.

Wildcraft:
- `rollAway`: you come up with an arrow nocked: the next arrow skill within
  2 s (+0.05 s a rank) is a critical hit. Keeps the roll and the run.
- `snareTrap`: rebuild as a real trap (`ranger/Traps.ts`): set at the
  aimed point (12 m), arms in 0.4 s, waits 30 s, up to 3 out. The first
  enemy within 2 m snaps it: everything within the radius is Rooted 2.5 s
  (+0.2 s a rank). No damage. A noose and a bent sapling that whips up.
  Keeps `radius` and `root` (Trapper's Gauntlets bend them).
- `spikeTrap`: rebuild as a real trap: a pressure plate at the aimed
  point, arms in 0.5 s, waits 25 s, up to 3 out; spikes burst up for
  220% (+26%) in 2.6 m and leave 2 Bleeding stacks for 6 s (stated in the
  text). No 25 s bleed.
- `thornBarrier`: a real bramble wall 7 m long across the aimed point,
  6 s (+0.2 s a rank): what stands in or pushes through it takes poison
  every 0.5 s, is Slowed and bleeds (2 stacks). A row of small ground
  zones along the line; own bramble look (not the poison breath).
- `disengage`: keeps facing the enemy while it leaps back (needs a small
  flag on `Player.dodge`: move one way, face the other); the arrow leaves
  on the gesture's release.
- `venomCoat`: every arrow skill carries it (lines, rains, bounces, fans,
  traps' arrows aside); coated arrows trail green and drip.
- `camouflage`: its own idea, not a Veil copy. For 10 s (+0.3 s a rank),
  whenever you stand still for 0.6 s you vanish (Veiled) until you move
  or shoot; you can vanish again inside the window. Your first shot from
  hiding is a critical hit with +30% (+5% a rank) critical damage. A
  shimmer of leaves that settles when you vanish.
- `theWholeFloor` (The Whole Floor Is A Trap): moves to tier 6 column 1 as
  the Wildcraft ultimate (max 20). Text tells the truth: every trap you
  have out goes off at once wherever it is, then steel bursts across 8 m
  round you for 240% (+35%). Keeps `radius` (Trapper's Last Belt bends it).

Volley:
- `twinShot`: each arrow leaves on its own loose (two releases inside one
  action, on skillcore's multi-hit timing).
- `scattershot`: real short arrows sprayed across the 0.8 rad cone, each
  struck where it lands; a shove back of 1.5 m; the text names the Blind
  it leaves (or the Blind goes). Hits count as arrows, not melee.
- `arrowRain`: honest numbers: the hidden x1.4 moves into its ladder (the
  hit is unchanged, the tooltip becomes true) and the Ranger rains stop
  using `makePacket(1.4)`. More arrows in a staggered fall (instanced,
  quality-scaled), the hit as they land. Keeps `radius` (The Long Drizzle).
- `ricochet`: rename **Carom Shot** (Ricochet is a PoE name; id stays).
  The legs fly in sequence, each leg starting when the last arrives and
  hitting on arrival, with `afterHit`. Own gesture (the lean goes to Bank
  Shot). Keeps `bounces` and `range` (Skipping Stone).
- `fanFire`: one flat sweeping release of all five (bow canted flat), own
  icon (arrows, not daggers). Keeps `count` (Featherfall).
- `suppressing` (Suppressing Fire): a stream you hold: each press looses
  three arrows one after another down the 18 m line, each hitting as it
  passes; held, it keeps going. Slowed and Exhausted stay.
- `explosiveTip`: a burning arrow (not a fire core; `radius` no longer
  sizes the shot) that bursts on the first enemy, or at range, for area
  fire damage in 3 m (`splash`), with the explosion where it lands. Keeps
  `radius` as the burst (Quarrybreaker).
- `endlessQuiver`: every bow skill counts toward the free third shot.
- `darkenTheSky`: moves to tier 6 column 1 as the Volley ultimate (max 20).
  Honest numbers (x1.4 into the ladder). The light over the room dims for
  a beat, then a dense staggered fall across 12 m (instanced, 24 / 36 / 48
  arrows by quality), the hit as they land. Keeps `radius` (The Overcast).

#### Replace

None. Every weak skill above is rebuilt under its own id (saves keep
their ranks), and the new ideas take the empty slots instead.

#### Add (21 new skills, the empty slots)

Marksman (pierce, crit, the first shot):
- T4 c0 **Splinter Shot** `splinterShot` (active, requires Punch Through):
  a brittle shaft that shatters inside the first enemy: 200% (+24%) to it,
  and its splinters spray a 6 m cone behind it for 70% (+8%) each. The
  rank behind pays for the one in front. Mana about 12, cooldown 4 s.
- T4 c2 **Open Season** `openSeason` (passive, requires Cold Focus):
  Hunter's Mark lands on up to 2 more enemies within 6 m of the first (+1
  per 8 ranks), and your critical hits on marked enemies deal +6% critical
  damage a rank.
- T5 c0 **Bank Shot** `bankShot` (active, requires Splinter Shot): an arrow
  that glances off walls up to 2 times (+1 per 7 ranks), piercing
  everything on every leg, 150% (+18%) each pass. Corridors become a
  weapon. Mana about 14, cooldown 5 s. Gets the old Ricochet lean.
- T5 c1 **Clean Kill** `cleanKill` (passive, requires Headshot): the first
  arrow into an enemy at full life is a critical hit with +20% (+3% a
  rank) critical damage.
- T5 c2 **Quarry's End** `quarrysEnd` (active, requires Open Season): one
  arrow at every marked enemy within 25 m (at most 6; none marked: the one
  you aim at), 220% (+25%) each, always a critical hit; the marks are
  spent. Mana about 18, cooldown 12 s.
- T6 c0 **Through and Through** `throughAndThrough` (CAPSTONE, requires
  Bank Shot and Clean Kill): every arrow you loose pierces (the basic
  arrow and every single-arrow skill, all trees), and each enemy an arrow
  passes through makes it hit 10% harder (+1% a rank) on the next, up to
  +50%. One arrow, the whole rank.
- T6 c1 One Shot, One Grave (moved, see Change).
- T6 c2 **Fletcher's Art** `fletchersArt` (mastery, max 15, requires
  Quarry's End): +5% damage with bow skills a rank and +0.5% critical
  chance a rank.

Wildcraft (traps, snares, footwork):
- T4 c0 **Tripwire** `tripwire` (active trap, requires Disengage): a wire
  8 m long strung across the aimed point, arms in 0.5 s, up to 2 out. The
  first enemy across snaps it: everything within 1 m of the wire is
  Knocked Down 1.2 s (+0.05 s a rank) and takes 120% (+15%). Mana about 9,
  cooldown 8 s.
- T4 c2 **Bolt-Hole** `boltHole` (passive, requires Camouflage): when a hit
  takes you below 35% life you heal 15% (+1% a rank) of your life over 3 s
  and run 30% faster for 3 s; once every 60 s (-1 s a rank, floor 40 s).
- T5 c0 **Slip Free** `slipFree` (passive, requires Tripwire): holds and
  slows on you last 4% less a rank (toward 50%), and Roll Away and
  Disengage shake them off.
- T5 c1 **Wasp Nest** `waspNest` (active trap, requires Trap Mastery): a
  nest set at the aimed point, up to 2 out; the first enemy within 2 m
  breaks it and the swarm stings everything within 3.5 m for 5 s: 30%
  (+4%) poison every 0.5 s and a Poisoned stack a sting. Mana about 14,
  cooldown 12 s.
- T5 c2 **Kestrel** `kestrel` (active, requires Bolt-Hole): a kestrel
  circles over you for 30 s (+1 s a rank), stooping every 1.4 s on an
  enemy within 14 m (marked ones first) for 90% (+11%) weapon damage. It
  is a hunting bird drawn by the effects (like a storm, not a body that
  can be hit), so it costs no pathing. Mana about 18, cooldown 20 s.
- T6 c0 **Lay of the Land** `layOfTheLand` (CAPSTONE, requires Slip Free
  and Wasp Nest): every Roll Away and Disengage leaves an armed Spike Trap
  where your feet left the ground (at your Spike Trap rank; needs a rank
  in it); your traps arm at once; you may keep one more of each (+1 per 10
  ranks); trap damage +2% a rank. Nothing reaches you at a time of its
  choosing.
- T6 c1 The Whole Floor Is A Trap (moved, see Change).
- T6 c2 **Huntcraft** `huntcraft` (mastery, max 15, requires Kestrel): +6%
  damage a rank with traps, thorns, wasps and the kestrel, and traps catch
  from 3% farther a rank.

Volley (arrows in quantity):
- T4 c0 **Creeping Barrage** `creepingBarrage` (active, requires
  Suppressing Fire): a rain that walks from just in front of you toward
  the aimed point in 5 falls (+1 per 6 ranks), 2.2 m apart and 0.2 s
  apart, each 3 m wide, 110% (+14%) each. For corridors. Mana about 16,
  cooldown 6 s.
- T4 c2 **Close Grouping** `closeGrouping` (passive, requires Endless
  Quiver): when more than one arrow of one shot hits the same enemy, each
  after the first deals +10% (+2% a rank). Point blank pays.
- T5 c0 **Thicket of Shafts** `thicketOfShafts` (passive, requires Creeping
  Barrage): where Arrow Rain, Creeping Barrage and Darken the Sky land, the
  floor bristles with shafts for 4 s (+0.2 s a rank): enemies in it are
  Slowed 25%.
- T5 c1 **Open Quiver** `openQuiver` (active buff, requires Volley
  Mastery): for 6 s (+0.2 s a rank) every arrow skill looses 2 more arrows
  (inside the cap of 12) and you draw 15% (+0.5% a rank) faster (under
  skillcore's ceiling). Mana about 20, cooldown 24 s.
- T5 c2 **Arrow Wheel** `arrowWheel` (active, requires Close Grouping): you
  turn on the spot and loose 10 arrows (+1 per 4 ranks) in a full circle,
  80% (+9%) each, out to 10 m. The answer to being surrounded. Mana about
  14, cooldown 5 s.
- T6 c0 **Murmuration** `murmuration` (CAPSTONE, requires Thicket of
  Shafts and Open Quiver): an arrow that kills scatters into two that fly
  on to the nearest enemies within 10 m at 60% (+2% a rank) of the killing
  hit; those can scatter again, three times at most, and no more than 12
  scattered arrows fly at once. A pack falls like a flock turning.
- T6 c1 Darken The Sky (moved, see Change).
- T6 c2 **Arrowsmith** `arrowsmith` (mastery, max 15, requires Arrow
  Wheel): +5% damage a rank with skills that loose more than one arrow
  (Twin Shot, Scattershot, Fan Fire, Suppressing, Arrow Wheel, the rains)
  and +1% their critical chance every 3 ranks.

New synergies (same tree only): `syn('splinterShot', 'pierceShot', 8)`,
`syn('splinterShot', 'punchThrough', 6)`, `syn('bankShot', 'splinterShot',
8)`, `syn('bankShot', 'pierceShot', 5)`, `syn('quarrysEnd', 'huntersMark',
10)`, `syn('quarrysEnd', 'openSeason', 6)`; `syn('tripwire', 'snareTrap',
8)`, `syn('tripwire', 'trapMastery', 5)`, `syn('waspNest', 'venomCoat', 8)`,
`syn('waspNest', 'thornBarrier', 6)`, `syn('kestrel', 'camouflage', 8)`,
`syn('kestrel', 'survivalist', 5)`, `syn('theWholeFloor', 'tripwire', 6)`;
`syn('creepingBarrage', 'arrowRain', 10)`, `syn('creepingBarrage',
'suppressing', 6)`, `syn('arrowWheel', 'scattershot', 8)`,
`syn('arrowWheel', 'fanFire', 6)`. Every existing synergy stays.

Prerequisite map after the change (tier 4 to 6; tiers 1 to 3 unchanged):

| Tree | T4 c0 | T4 c1 | T4 c2 | T5 c0 | T5 c1 | T5 c2 | T6 c0 | T6 c1 | T6 c2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Marksman | Splinter Shot <- Punch Through | Headshot <- Aimed Shot, Cold Focus | Open Season <- Cold Focus | Bank Shot <- Splinter Shot | Clean Kill <- Headshot | Quarry's End <- Open Season | Through and Through <- Bank Shot, Clean Kill | One Shot <- Headshot | Fletcher's Art <- Quarry's End |
| Wildcraft | Tripwire <- Disengage | Trap Mastery <- Spike Trap, Venom Coat | Bolt-Hole <- Camouflage | Slip Free <- Tripwire | Wasp Nest <- Trap Mastery | Kestrel <- Bolt-Hole | Lay of the Land <- Slip Free, Wasp Nest | The Whole Floor <- Trap Mastery | Huntcraft <- Kestrel |
| Volley | Creeping Barrage <- Suppressing | Volley Mastery <- Explosive Tip, Endless Quiver | Close Grouping <- Endless Quiver | Thicket of Shafts <- Creeping Barrage | Open Quiver <- Volley Mastery | Arrow Wheel <- Close Grouping | Murmuration <- Thicket, Open Quiver | Darken The Sky <- Volley Mastery | Arrowsmith <- Arrow Wheel |

Names checked against both reference games: none of the new names is one
of theirs; Ricochet becomes Carom Shot; "Second Wind" and "Hunting
Grounds" were avoided on purpose.

#### Build order (milestone 4)

1. Broken first: Snare Trap, Spike Trap (and `ranger/Traps.ts`), Explosive
   Tip, Hunter's Mark, Long Eye, Venom Coat, Endless Quiver, Disengage.
2. `ranger/Shots.ts`: every shot onto it (per-enemy timing, multi-arrow
   releases, the honest rain ladders), then Thorn Barrier, Camouflage,
   Scattershot, Suppressing, Carom Shot, Roll Away.
3. Move the three ultimates to tier 6, with their true text.
4. New actives: Splinter Shot, Bank Shot, Quarry's End, Tripwire, Wasp
   Nest, Kestrel, Creeping Barrage, Open Quiver, Arrow Wheel.
5. New passives: Open Season, Clean Kill, Through and Through, Fletcher's
   Art, Bolt-Hole, Slip Free, Lay of the Land, Huntcraft, Close Grouping,
   Thicket of Shafts, Murmuration, Arrowsmith.
6. Text, `skillPower` lines, synergies, `check-i18n`.

#### Check list for the build (milestone 4)

- Bends that name Ranger skills (ids and knobs stay): `twinShot` (Brace of
  Larks, `count`), `ricochet` (Skipping Stone, `bounces`, `range`),
  `arrowRain` (The Long Drizzle, `radius`, chills), `explosiveTip`
  (Quarrybreaker, `radius`), `fanFire` (Featherfall, `count`),
  `darkenTheSky` (The Overcast, `radius`, blinds) in `batchB.ts`;
  `snareTrap` (The Trapper's Gauntlets, `radius`, `root`) in `batchD.ts`;
  `theWholeFloor` (The Trapper's Last Belt, `radius`, roots) in
  `batchE.ts`. No set names a Ranger skill. `node tools/check-uniques.mjs`
  after.
- Other places naming Ranger ids: `STARTING_SKILL` (`pierceShot`) in
  `sim/Character.ts`, `STARTING_SKILL_HINTS` (`pierceShot`, `huntersMark`,
  `rollAway`, `snareTrap`) in `data/classes.ts`, `SkillRunner.ts`
  (`SELF_BUFF_STATUS.camouflage`, `VENOM_COAT`, `SKILL_STATUS` for Hunter's
  Mark, Bleeding Arrow, Suppressing, Scattershot, Snare, Thorn, Spike),
  `skillPower.ts` (`rollAway`, `venomCoat`, `camouflage`, `huntersMark`,
  `snareTrap`), `Passives.ts` (`endlessQuiver`, `volleyMastery`),
  `audio/Bank.ts` and `audio/manifest.ts` (`skill.arrow.ricochet`,
  `skill.bow.ricochet`, `skill.bow.fanFire`), `tools/audio/ledger.json`,
  `tools/audio/recipe.mjs`, `fx/SkillLooks.ts` motifs,
  `gestures/ranger.ts`, `Effects.arrowRain` (only physical `meteor` uses
  it: the Ranger's two rains).
- `tools/skillparams-entry.ts` casts every active with a short bow first
  (`FIRST_KIT.ranger`); new traps need a monster to walk into them inside
  its fight, or their knobs read as unread. `check-skilldepth`,
  `check-passives` for the new passives.
- New sounds for the nine new actives: cast (and hit) takes in
  `tools/audio/recipe.mjs` from the CC0 packs already used (`packs.mjs`),
  ledger and manifest; `check-skillsound` and the sounds part of
  `check-unique`. Each new active needs its own motif or its own family
  drawing for `check-unique`.
- Frame cost: 12 arrows a cast at most; 12 scattered arrows in the air;
  rain arrows instanced and quality-scaled; trap bodies, brambles, kestrel
  and wasps pooled; no allocation in the per-frame trap, zone and kestrel
  ticks; stand-ins in `warmup()` for every new pipeline.
- Icons (milestone 5): a painted Ranger set in `src/art/icons/` (like
  `shifterIcons.ts`, with its own painters), one picture per skill, class
  moss green `0x7fc46a` everywhere, tree accents: Marksman bone white and
  hunter's red, Wildcraft bark brown and amber, Volley steel and sky grey.
  Thirteen icons share a picture today (see the audit).

### Milestone 3: speed audit (skillcore's model, read 2026-10-20)

Read from `src/sim/Speed.ts`, `SkillRunner.castNow` and `basicAttack`,
`Player.beginAction` and `dodge`, and `data/itemBases.ts`.

How a Ranger action is timed now (after skillcore, before this stream):

- Basic bow shot: `basicTime` = 1 / (bow pace x attack speed). Short,
  Hunter's and Spider Bow 1.48 a second, Long, Composite and Shadow 1.35,
  War, Double and Diamond 1.25, Great, Rune and Hydra 1.15, Grand Matron
  1.32. Gear goes through the curve (+300% is x1.75), never past 3.0 a
  second. The arrow still leaves at the press.
- Bow skills (`projectile`, `bolt`, `meteor`, `beam`, `cone`, `chain` with a
  bow in hand) are attacks: `attackTime` shots of the bow, default 1. So
  every one of them, Aimed Shot and One Shot too, takes exactly one plain
  shot. Thorn Barrier (`cone`) and Hunter's Mark (`bolt`) are bow shots too.
- Traps (`nova`) are spells: `BASE_CAST_TIME` 0.5 s on cast speed. Buffs
  (`buff`) 0.35 s. Dashes are `Player.dodge` spans from distance: Roll Away
  6 m in 0.48 s, Disengage 8 m in 0.5 s (16 m a second, a blink).
- Every Ranger skill resolves at the press (the Ranger is not in
  `RELEASE_CLASSES`); the gesture's release is squeezed to 0.1 s.

The table: real seconds a use takes. "Short" is a short bow (1.48 a
second, the fastest bow), "Great" a great bow (1.15, the slowest).
"Ceiling" is a short bow or a cast at +300% speed gear (x1.75), under the
3.0 attack and 3.4 cast caps. Reference feel (skillcore's notes, feel
only): a bow shot about 1.1 to 1.6 a second with no gear and 2.3 to 3.0
with heavy gear; heavy aimed shots about 1.4 to 2 plain shots; spells and
traps 0.5 to 0.9 s with no gear, 0.3 s at the top.

| Use | Today: field, Short | Now: field | Short | Ceiling | Great | Verdict today -> now |
| --- | --- | --- | --- | --- | --- | --- |
| Basic bow shot | 1 shot, 0.68 s | same | 0.68 | 0.39 | 0.87 | right (arrow moves to the draw's release) |
| Pierce Shot, Bleeding Arrow, Crippling Shot, Explosive Tip, Carom Shot, Splinter Shot (new) | 1 shot, 0.68 s | `attackTime` 1 | 0.68 | 0.39 | 0.87 | right |
| Aimed Shot | 1 shot, 0.68 s | 1.4 | 0.95 | 0.54 | 1.22 | too fast -> right (a real slow draw) |
| One Shot, One Grave | 1 shot, 0.68 s | 1.8 | 1.22 | 0.69 | 1.57 | too fast -> right (the longest draw) |
| Bank Shot (new) | - | 1.15 | 0.78 | 0.44 | 1.00 | right |
| Quarry's End (new, up to 6 arrows) | - | 1.3 | 0.88 | 0.50 | 1.13 | right |
| Twin Shot (two looses) | 1 shot, 0.68 s | 1.1 | 0.74 | 0.42 | 0.96 | a touch fast for two draws -> right |
| Fan Fire (one flat sweep) | 1 shot, 0.68 s | 1.15 | 0.78 | 0.44 | 1.00 | a touch fast -> right |
| Scattershot (short arrows, close) | 1 shot, 0.68 s | 0.9 | 0.61 | 0.35 | 0.78 | right (a snap from the hip) |
| Suppressing Fire (three arrows) | 1 shot, 0.68 s | 1.2 | 0.81 | 0.46 | 1.04 | too fast for three looses -> right |
| Arrow Rain | 1 shot, 0.68 s | 1.2 | 0.81 | 0.46 | 1.04 | a touch fast -> right |
| Darken The Sky | 1 shot, 0.68 s | 1.6 | 1.08 | 0.62 | 1.39 | too fast for an ultimate -> right |
| Creeping Barrage (new) | - | 1.3 | 0.88 | 0.50 | 1.13 | right |
| Arrow Wheel (new, a full turn) | - | 1.3 | 0.88 | 0.50 | 1.13 | right |
| Hunter's Mark (no arrow) | bow shot, 0.68 s | spell, `castTime` 0.35 | 0.35 | 0.29 | 0.35 | too slow for a point of the finger -> right |
| Snare Trap, Spike Trap, Tripwire (new), Wasp Nest (new) | spell 0.5 s | `castTime` 0.55 | 0.55 | 0.31 | 0.55 | right (a trap set down, not thrown) |
| Thorn Barrier | bow shot, 0.68 s | spell, `castTime` 0.6 | 0.60 | 0.34 | 0.60 | wrong clock (attack speed) -> right |
| The Whole Floor Is A Trap | spell 0.5 s | `castTime` 0.7 | 0.70 | 0.40 | 0.70 | a touch fast for an ultimate -> right |
| Kestrel (new) | - | `castTime` 0.5 | 0.50 | 0.29 | 0.50 | right |
| Venom Coat | buff 0.35 s | `castTime` 0.5 | 0.50 | 0.29 | 0.50 | too fast for an arrow dipped and studied -> right |
| Camouflage, Open Quiver (new) | buff 0.35 s | `castTime` 0.4 | 0.40 | 0.29 | 0.40 | right |
| Roll Away (6 m) | dodge, 0.48 s | `travelTime` | 0.43 | 0.43 | 0.43 | right |
| Disengage (8 m back) | dodge, 0.5 s | `travelTime` | 0.57 | 0.57 | 0.57 | too fast (a blink) -> right |

Damage per hit is unchanged for every row (owner's rule): only the time
fields move. A rush's time follows its distance, not speed gear.

Release (how a shot leaves): every bow shot starts its action with
`{ release: true }` and its arrow leaves inside `atRelease`, at a third of
the action, at most 0.25 s. The heavy draws hold longer: Aimed Shot lets go
at 55% of its action and One Shot at 60% (a small optional `releaseAt` on
`Player.beginAction`). Twin Shot's second arrow and Suppressing Fire's
second and third leave on their gesture's later looses (`cuts`).

## For the owner to test

(empty)

## For skillqa

(empty)

## Handover

(empty)
